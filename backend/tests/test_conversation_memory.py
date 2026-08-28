"""Regression tests for persistent, context-aware conversation memory."""

import asyncio
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.ai.base import AIResponse
from app.ai.builders.context_builder import ContextBuilder, ContextObject
from app.ai.builders.question_builder import QuestionBuilder
from app.ai.conversation_engine import ConversationEngine
from app.ai.turn_directive import TurnDirective
from app.emotion.base import EmotionContext
from app.models.memory import LongTermMemory, MemoryType
from app.models.session import Session
from app.models.user import User
from app.prompts.builder import PromptBuilder
from app.services.conversation_summarizer import ConversationSummarizer
from app.services.memory_service import MemoryService


class FakeGateway:
    def __init__(self, content: str) -> None:
        self.content = content
        self.last_request = None

    async def generate(self, request):
        self.last_request = request
        return AIResponse(content=self.content, provider="test", model="test")


class FailingGateway:
    async def generate(self, request):
        raise RuntimeError("provider unavailable")


@pytest.mark.asyncio
async def test_memory_retrieval_prioritizes_current_topic():
    service = MemoryService(AsyncMock())
    relevant = LongTermMemory(
        memory_type=MemoryType.GOAL.value,
        key="fastapi_project",
        value="Finish the FastAPI project before the Friday deadline",
        importance_score=0.55,
    )
    unrelated = LongTermMemory(
        memory_type=MemoryType.PREFERENCE.value,
        key="favorite_color",
        value="The user's favorite color is blue",
        importance_score=0.95,
    )
    service.get_long_term_memories = AsyncMock(return_value=[unrelated, relevant])

    context = await service.get_relevant_memory_context(
        user_id=7,
        query="How should I plan my FastAPI project deadline?",
        limit=2,
    )

    assert context[0]["key"] == "fastapi_project"
    assert context[0]["relevance"] > context[1]["relevance"]


@pytest.mark.asyncio
async def test_context_builder_loads_previous_session_summary():
    result = MagicMock()
    result.scalars.return_value.all.return_value = [
        Session(id=4, user_id=7, summary="User was preparing for a FastAPI interview.")
    ]
    db = AsyncMock()
    db.execute.return_value = result

    context = await ContextBuilder(db)._load_previous_session_context(
        user_id=7,
        current_session_id=8,
    )

    assert context == ["User was preparing for a FastAPI interview."]


@pytest.mark.asyncio
async def test_previous_chats_are_ranked_for_the_current_topic():
    result = MagicMock()
    result.scalars.return_value.all.return_value = [
        Session(id=5, user_id=7, summary="User discussed favorite movies."),
        Session(id=4, user_id=7, summary="FastAPI deployment testing is still unresolved."),
    ]
    db = AsyncMock()
    db.execute.return_value = result

    context = await ContextBuilder(db)._load_previous_session_context(
        user_id=7,
        current_session_id=8,
        query="How should I finish FastAPI deployment?",
    )

    assert context[0] == "FastAPI deployment testing is still unresolved."


def test_prompt_includes_memory_summaries_and_targeted_question():
    system_prompt, messages = PromptBuilder().build(
        user_name="Asha",
        user_message="I am still worried about Friday.",
        user_profile={"preferred_language": "en", "communication_style": "balanced"},
        long_term_memories=[
            {"key": "project_deadline", "value": "FastAPI project is due Friday", "type": "goal"}
        ],
        conversation_history=[{"role": "user", "content": "The API is nearly complete."}],
        conversation_summary="The user completed authentication and still needs deployment.",
        previous_session_context=["Earlier, the user planned to test deployment on Thursday."],
        targeted_question="Which deployment risk feels most important to handle first?",
    )

    assert "FastAPI project is due Friday" in system_prompt
    assert "completed authentication" in system_prompt
    assert "test deployment on Thursday" in system_prompt
    assert "Which deployment risk feels most important" in system_prompt
    assert messages[-1] == {"role": "user", "content": "I am still worried about Friday."}


@pytest.mark.asyncio
async def test_question_builder_uses_prior_context_and_suppresses_duplicates():
    question = "Which part of Friday's FastAPI deadline feels hardest to manage?"
    gateway = FakeGateway(
        '{"needs_question": true, "question": '
        f'"{question}"}}'
    )
    builder = QuestionBuilder(gateway)
    user = User(
        id=7,
        name="Asha",
        email="asha@example.com",
        password_hash="test",
        preferred_language="en",
    )

    generated = await builder.build(
        user=user,
        user_message="I am anxious about Friday.",
        conversation_history="user: The API is almost ready.",
        turn_count=3,
        relevant_memories=[
            {"key": "project_deadline", "value": "FastAPI project is due Friday"}
        ],
        conversation_summary="Authentication is finished; deployment remains.",
        previous_session_context=["The user planned deployment testing for Thursday."],
    )

    assert generated == question
    assert "FastAPI project is due Friday" in gateway.last_request.prompt
    assert "deployment testing for Thursday" in gateway.last_request.prompt

    duplicate = await builder.build(
        user=user,
        user_message="Friday is still worrying me.",
        conversation_history="",
        turn_count=4,
        previously_asked=[question],
    )
    assert duplicate is None


@pytest.mark.asyncio
async def test_summarizer_has_deterministic_offline_fallback():
    summarizer = ConversationSummarizer(gateway=FailingGateway(), summarize_every=4)
    history = [
        {"role": "user", "content": "My FastAPI project is due Friday."},
        {"role": "assistant", "content": "Let us prioritize deployment testing."},
    ]

    summary = await summarizer.summarize(history, turn_count=4)

    assert "FastAPI project is due Friday" in summary
    assert "prioritize deployment testing" in summary
    assert summarizer.should_summarize(4) is True
    assert summarizer.should_summarize(5) is False


@pytest.mark.asyncio
async def test_engine_wires_best_question_and_previous_chat_into_prompt():
    gateway = FakeGateway("unused")
    engine = ConversationEngine(gateway=gateway)
    emotion = EmotionContext(
        primary_emotion="neutral",
        confidence=0.0,
        stress="low",
        sentiment="neutral",
        intent="casual",
        sources=[],
    )
    context = ContextObject(
        user_name="Asha",
        preferred_language="en",
        communication_style="balanced",
        interests="programming",
        goals="ship project",
        skills="Python",
        projects="Aura",
        learning_style="visual",
        favourite_topics="AI",
        emotion_context=emotion,
        current_time="now",
        session_id=8,
        long_term_memories=[
            {"key": "deadline", "value": "Friday", "type": "goal"}
        ],
        conversation_summary="Authentication is complete.",
        previous_session_context=["Deployment testing was planned for Thursday."],
    )
    best_question = "Which deployment risk should we handle first?"

    engine._crisis_detector.check_for_crisis = MagicMock(return_value=(False, None))
    engine._turn_directive.classify = AsyncMock(return_value=TurnDirective.default())
    engine._context_builder.build = AsyncMock(return_value=context)
    engine._question_builder.build = AsyncMock(return_value=best_question)
    engine._prompt_builder.build = MagicMock(return_value=("system", []))
    engine._interest_builder.build = AsyncMock(return_value=None)
    engine._goal_engine.detect_and_update = AsyncMock(return_value=None)
    engine._memory_builder.build = AsyncMock(return_value=0)

    stream = await engine.process_turn(
        db=AsyncMock(),
        user=User(
            id=7,
            name="Asha",
            email="asha-engine@example.com",
            password_hash="test",
        ),
        session=Session(id=8, user_id=7, phase="explore"),
        user_message="Friday is close.",
        emotion_context=emotion,
        recent_history=[],
        streaming=True,
        turn_count=3,
    )

    prompt_kwargs = engine._prompt_builder.build.call_args.kwargs
    assert prompt_kwargs["targeted_question"] == best_question
    assert prompt_kwargs["conversation_summary"] == "Authentication is complete."
    assert prompt_kwargs["previous_session_context"] == [
        "Deployment testing was planned for Thursday."
    ]

    await stream.aclose()
    await asyncio.sleep(0)
