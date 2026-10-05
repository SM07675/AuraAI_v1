"""Multi-turn planning and cross-mode integration regressions."""
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.ai.base import AIResponse
from app.ai.problem_resolution import ProblemResolutionPipeline
from app.ai.conversation_engine import ConversationEngine
from app.emotion.base import EmotionContext
from app.models.session import Session
from app.models.user import User
from app.prompts.builder import PromptBuilder
from app.ai.builders.prompt_engine import PromptEngine


def test_repeated_unwell_moves_from_clarification_to_action_without_inventing_cause():
    planner = ProblemResolutionPipeline()
    first = planner.evaluate("I am not feeling well")
    assert first.stage == "clarify"
    assert first.domain == "unspecified"
    history = [
        {"role": "user", "content": "I am not feeling well"},
        {"role": "assistant", "content": first.next_question},
    ]
    second = planner.evaluate("I am not feeling well", history)
    assert second.concern_turns == 2
    assert second.stage == "plan"
    assert second.next_question != first.next_question
    assert second.actions and "healthcare professional" in second.follow_up
    assert second.domain == "unspecified"
    assert "diagnosis" not in second.to_dict()


def test_details_across_turns_create_a_combined_plan():
    history = [
        {"role": "user", "content": "I am not feeling well"},
        {"role": "assistant", "content": "Does this feel physical, emotional, or both?"},
        {"role": "user", "content": "Headache and nausea since yesterday"},
        {"role": "assistant", "content": "Is this getting worse or affecting your daily activities?"},
    ]
    plan = ProblemResolutionPipeline().evaluate("It is affecting my work, what should I do?", history)
    assert plan.stage == "plan"
    assert plan.domain == "physical"
    assert plan.next_question is None
    assert "Headache and nausea since yesterday" in plan.reported_facts
    assert "headache" not in " ".join(plan.actions).lower()  # no invented diagnosis


def test_unsuccessful_advice_and_multiple_problems_are_retained():
    plan = ProblemResolutionPipeline().evaluate("I tried that but it didn't help", [
        {"role": "user", "content": "I am anxious about work and have headaches for two days"},
        {"role": "assistant", "content": "Take a short break."},
    ])
    assert plan.stage == "follow_up"
    assert plan.domain == "mixed_health"
    assert "headaches" in plan.reported_facts[0]
    assert "don't recycle" not in plan.fallback_response()
    assert "unsuccessful exercise" in plan.prompt_context()


@pytest.mark.parametrize("text", [
    "I cannot breathe", "I have severe chest pain", "I am going to hurt myself",
    "I can't keep myself safe", "मुझे सांस नहीं आ रही है",
])
def test_urgent_symptoms_bypass_normal_planning(text):
    plan = ProblemResolutionPipeline().evaluate(text)
    assert plan.urgency == "emergency"
    assert "emergency service" in plan.fallback_response()
    assert not plan.next_question


@pytest.mark.parametrize("text", [
    'What if someone says "I cannot breathe"?',
    "I do not have severe chest pain", "My severe chest pain went away",
    "Explain this hypothetical example: I cannot breathe",
])
def test_negated_quoted_and_hypothetical_symptoms_do_not_force_emergency(text):
    assert ProblemResolutionPipeline().evaluate(text).urgency != "emergency"


def test_listening_recovery_topic_change_and_user_isolation():
    planner = ProblemResolutionPipeline()
    history = [{"role": "user", "content": "I am not feeling well"}]
    assert planner.evaluate("Just listen, no advice", history).stage == "listen"
    assert planner.evaluate("I am feeling better now", history).stage == "recovery"
    assert planner.evaluate("Please explain how to sort a list of numbers in Python", history).stage == "conversation"
    assert planner.evaluate("Hello", []).stage == "conversation"
    assert planner.evaluate("Goodbye", history).stage == "conversation"


@pytest.mark.parametrize("mode", ["chat", "voice", "face_to_face"])
def test_both_prompt_paths_include_shared_multi_turn_plan(mode):
    history = [{"role": "user", "content": "I am not feeling well"}]
    for builder in (PromptBuilder(), PromptEngine()):
        method = builder.build if isinstance(builder, PromptBuilder) else builder.build_prompt
        prompt, messages = method(user_name="Asha", user_message="Still not better", conversation_history=history, mode=mode)
        assert "SHARED PROBLEM-RESOLUTION PLAN" in prompt
        assert '"concern_turns": 2' in prompt
        assert "not a doctor" in prompt
        assert messages[-1]["content"] == "Still not better"


@pytest.mark.asyncio
@pytest.mark.parametrize("streaming", [False, True])
async def test_engine_urgent_route_precedes_cache_and_provider(streaming):
    gateway = MagicMock()
    gateway.generate = AsyncMock()
    engine = ConversationEngine(gateway)
    engine._working_memory.get_semantic_response = AsyncMock(return_value="unsafe cached answer")
    debug = {}
    result = await engine.process_turn(db=AsyncMock(), user=User(id=7, name="Asha", email="a@example.com"),
        session=Session(id=8, user_id=7), user_message="I cannot breathe", emotion_context=None,
        recent_history=[], streaming=streaming, debug_out=debug)
    reply = "".join([c.content async for c in result]) if streaming else result
    assert "emergency service" in reply
    engine._working_memory.get_semantic_response.assert_not_awaited()
    gateway.generate.assert_not_awaited()
    assert debug["resolution_plan"]["urgency"] == "emergency"


@pytest.mark.asyncio
async def test_nonstreaming_generation_is_reachable():
    from app.ai.builders.context_builder import ContextObject
    from app.ai.turn_directive import TurnDirective
    gateway = MagicMock()
    gateway.generate = AsyncMock(return_value=AIResponse(content="Hello Asha.", provider="test", model="test"))
    engine = ConversationEngine(gateway)
    engine._working_memory.get_semantic_response = AsyncMock(return_value=None)
    engine._working_memory.set_semantic_response = AsyncMock()
    engine._context_builder.build = AsyncMock(return_value=ContextObject(user_name="Asha", preferred_language="en", communication_style="balanced", interests="", goals="", skills="", projects="", learning_style="", favourite_topics="", emotion_context=None, current_time="now", session_id=8))
    engine._response_builder.refine_text = AsyncMock(side_effect=lambda value, *a, **k: value)
    engine._record_latency_trace = AsyncMock()
    engine._crisis_detector.check_for_crisis = MagicMock(return_value=(False, None))
    engine._turn_directive.classify = AsyncMock(return_value=TurnDirective.default())
    result = await engine.process_turn(db=AsyncMock(), user=User(id=7, name="Asha", email="a@example.com"),
        session=Session(id=8, user_id=7, phase="explore"), user_message="Hello", emotion_context=EmotionContext(primary_emotion="neutral", confidence=0.0, stress="low", sentiment="neutral"),
        recent_history=[], streaming=False)
    assert result == "Hello Asha."
    gateway.generate.assert_awaited_once()


@pytest.mark.asyncio
async def test_engine_repeated_physical_concern_uses_history_and_safe_card():
    from app.ai.builders.context_builder import ContextObject
    gateway = MagicMock()
    gateway.generate = AsyncMock(return_value=AIResponse(content="You mentioned headaches since yesterday. Pause strenuous activity and seek care if it persists or worsens.", provider="test", model="test"))
    engine = ConversationEngine(gateway)
    engine._working_memory.get_semantic_response = AsyncMock(return_value="old generic response")
    engine._working_memory.set_semantic_response = AsyncMock()
    engine._context_builder.build = AsyncMock(return_value=ContextObject(user_name="Asha", preferred_language="en", communication_style="balanced", interests="", goals="", skills="", projects="", learning_style="", favourite_topics="", emotion_context=None, current_time="now", session_id=8))
    engine._response_builder.refine_text = AsyncMock(side_effect=lambda value, *a, **k: value)
    engine._record_latency_trace = AsyncMock()
    engine._crisis_detector.check_for_crisis = MagicMock(return_value=(False, None))
    engine._solution_engine.generate_solution = AsyncMock()
    engine._question_builder.build = AsyncMock()
    debug = {}
    result = await engine.process_turn(db=AsyncMock(), user=User(id=7, name="Asha", email="a@example.com"),
        session=Session(id=8, user_id=7, phase="offer"), user_message="Still not feeling well, that didn't help",
        emotion_context=EmotionContext(primary_emotion="neutral", confidence=0.0, stress="low", sentiment="neutral"),
        recent_history=[{"role":"user", "content":"Headaches since yesterday"}, {"role":"assistant", "content":"Take a break."}],
        streaming=False, debug_out=debug)
    assert "headaches" in result.lower()
    assert "Headaches since yesterday" in debug["resolution_plan"]["reported_facts"]
    gateway.generate.assert_not_awaited()
    assert debug["solution_card"]["type"] == "action_plan"
    assert debug["resolution_plan"]["stage"] == "follow_up"
    engine._solution_engine.generate_solution.assert_not_awaited()
    engine._question_builder.build.assert_not_awaited()


def test_rephrased_question_does_not_repeat_and_plural_symptom_is_recognized():
    planner = ProblemResolutionPipeline()
    plan = planner.evaluate("I am not feeling well", [
        {"role":"user", "content":"I am not feeling well"},
        {"role":"assistant", "content":"Is it more physical or emotional?"},
    ])
    assert plan.next_question == "When did this start?"
    assert planner.evaluate("Headaches for two days").domain == "physical"


def test_project_problem_does_not_ask_medical_clarification():
    plan = ProblemResolutionPipeline().evaluate("I am struggling to finish my project by Friday.")
    assert plan.domain == "practical"
    assert plan.next_question == "Which part is blocking progress right now?"
    assert "physical" not in plan.next_question
    plan = ProblemResolutionPipeline().evaluate("The blocker is testing, what should I do?", [
        {"role":"user", "content":"My project deadline is Friday"},
    ])
    assert plan.stage == "plan" and plan.next_question is None


def test_english_follow_up_with_repeated_the_keeps_english():
    from app.prompts.builder import _is_hindi_turn
    assert not _is_hindi_turn("I tried splitting the work. The blocker is testing. What should I do?")
    assert not _is_hindi_turn("Hello doctor")
    assert _is_hindi_turn("Mujhe accha nahi lag raha hai")
    assert _is_hindi_turn("मेरी तबीयत खराब है")
