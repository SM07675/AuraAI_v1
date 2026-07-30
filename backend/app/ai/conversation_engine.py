"""
Conversation Engine — the master orchestrator for the intelligence pipeline.

Every message follows this exact flow:
    User Message
      → Emotion Analysis
      → Memory Retrieval (via Context Builder)
      → User Profile Retrieval (via Context Builder)
      → Interest Engine (background)
      → Goal Engine (background)
      → Conversation Summary Check
      → Context Builder
      → Question Builder
      → Prompt Builder
      → AI Gateway
      → Response Validator
      → Memory Update (background)
      → Response Output

No raw user message is ever sent directly to the LLM. Every interaction
passes through the complete pipeline.
"""

from __future__ import annotations

import asyncio
from typing import Any, AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.base import AIRequest, AIResponse, StreamChunk
from app.ai.gateway import AIGateway
from app.ai.builders.context_builder import ContextBuilder, ContextObject
from app.ai.builders.interest_builder import InterestBuilder
from app.ai.builders.memory_builder import MemoryBuilder
from app.ai.builders.prompt_builder import PromptBuilder
from app.ai.builders.question_builder import QuestionBuilder
from app.ai.builders.response_builder import ResponseBuilder

from app.emotion.base import EmotionContext
from app.emotion.service import EmotionService
from app.services.analytics_service import AnalyticsService
from app.services.conversation_summarizer import ConversationSummarizer
from app.services.goal_engine import GoalEngine

from app.core.logging_config import get_logger
from app.models.session import Session
from app.models.user import User

logger = get_logger(__name__)

# After this many turns, trigger a conversation summary
_SUMMARIZE_EVERY = 10


class ConversationEngine:
    """Orchestrates the complete conversational intelligence pipeline.

    This is the single entry point for processing user messages. Both the
    voice pipeline (VoiceConversationManager) and text chat (chat API)
    call ``process_turn()`` to run the full pipeline.

    Args:
        gateway: Optional AI Gateway injection (shared singleton if None).
    """

    def __init__(self, gateway: AIGateway | None = None) -> None:
        self._gateway = gateway or AIGateway()

        # Initialize Builders
        self._context_builder = ContextBuilder(None)  # DB injected per call
        self._interest_builder = InterestBuilder(self._gateway)
        self._memory_builder = MemoryBuilder(self._gateway)
        self._question_builder = QuestionBuilder(self._gateway)
        self._prompt_builder = PromptBuilder()
        self._response_builder = ResponseBuilder(self._gateway)

        # Initialize Services
        self._emotion_service = EmotionService()
        self._goal_engine = GoalEngine(self._gateway)
        self._summarizer = ConversationSummarizer(self._gateway)

        # Analytics (per-session, set externally)
        self._analytics: AnalyticsService | None = None

        # Turn counter for summarization and question timing
        self._turn_count: int = 0

    def set_analytics(self, analytics: AnalyticsService) -> None:
        """Attach an analytics service for pipeline stage timing."""
        self._analytics = analytics

    async def process_turn(
        self,
        db: AsyncSession,
        user: User,
        session: Session,
        user_message: str,
        emotion_context: EmotionContext | None,
        recent_history: list[dict[str, str]],
        streaming: bool = True,
        interrupt_event: asyncio.Event | None = None,
    ) -> AsyncIterator[StreamChunk] | str:
        """Main pipeline entrypoint.

        Executes the complete intelligence pipeline:
        Emotion → Context → Question → Prompt → AI → Validate → Memory/Goals

        Args:
            db: Async database session.
            user: Current user ORM object.
            session: Current session ORM object.
            user_message: The user's message text.
            emotion_context: Pre-computed EmotionContext (from EmotionService).
                             Pass None to compute from text here.
            recent_history: Recent conversation turns.
            streaming: If True, returns async generator; if False, returns string.
            interrupt_event: Optional event for voice barge-in support.
        """
        self._turn_count += 1
        turn = self._turn_count

        # Update DB injection for ContextBuilder
        self._context_builder._db = db

        # ── Stage 1: Emotion Analysis ─────────────────────────────
        if self._analytics:
            self._analytics.start_stage("emotion_analysis")

        if emotion_context is None:
            try:
                emotion_context = await self._emotion_service.analyze_and_fuse(
                    text=user_message
                )
            except Exception as e:
                logger.warning("Emotion analysis failed", error=str(e))
                from app.emotion.base import _EMOTION_GUIDANCE
                emotion_context = EmotionContext(
                    primary_emotion="neutral",
                    secondary_emotion=None,
                    confidence=0.0,
                    stress="low",
                    sentiment="neutral",
                    intent="casual",
                    sources=[],
                    guidance=_EMOTION_GUIDANCE["neutral"],
                )

        if self._analytics:
            self._analytics.end_stage("emotion_analysis")

        # ── Stage 2: Conversation Summary Check ───────────────────
        conversation_summary = self._summarizer.current_summary
        if self._summarizer.should_summarize(turn):
            if self._analytics:
                self._analytics.start_stage("summarization")
            try:
                summary = await self._summarizer.summarize_and_store(
                    db=db,
                    session_id=session.id,
                    user_id=user.id,
                    conversation_history=recent_history,
                    turn_count=turn,
                )
                if summary:
                    conversation_summary = summary
            except Exception as e:
                logger.warning("Summarization failed", error=str(e))
            if self._analytics:
                self._analytics.end_stage("summarization")

        # ── Stage 3: Build Rich Context ───────────────────────────
        if self._analytics:
            self._analytics.start_stage("context_building")

        context_obj: ContextObject = await self._context_builder.build(
            user=user,
            session=session,
            emotion_context=emotion_context,
            recent_history=recent_history,
            conversation_summary=conversation_summary,
            previously_asked_questions=self._question_builder.asked_questions,
        )

        if self._analytics:
            self._analytics.end_stage("context_building")

        # ── Stage 4: Question Builder ─────────────────────────────
        if self._analytics:
            self._analytics.start_stage("question_building")

        history_str = "\n".join(
            f"{m['role']}: {m['content']}" for m in recent_history
        )

        targeted_question = await self._question_builder.build(
            user=user,
            user_message=user_message,
            conversation_history=history_str,
            turn_count=turn,
            previously_asked=context_obj.previously_asked_questions,
        )

        if self._analytics:
            self._analytics.end_stage("question_building")

        # ── Stage 5: Prompt Builder ───────────────────────────────
        if self._analytics:
            self._analytics.start_stage("prompt_building")

        system_prompt, messages = self._prompt_builder.build(
            context=context_obj,
            targeted_question=targeted_question,
            user_message=user_message,
        )

        if self._analytics:
            self._analytics.end_stage("prompt_building")

        # ── Stage 6: Prepare AI Request ───────────────────────────
        req = AIRequest(
            system_prompt=system_prompt,
            prompt="",  # Prompt is in the messages array
            messages=messages,
            stream=streaming,
            temperature=0.7,
        )

        # ── Stage 7: Fire Background Profile Tasks ────────────────
        # These don't block the response — they run concurrently
        asyncio.create_task(
            self._interest_builder.build(user, db, user_message),
            name=f"interest-{session.id}-{turn}",
        )
        asyncio.create_task(
            self._goal_engine.detect_and_update(
                db, user.id, user_message, session.id
            ),
            name=f"goals-{session.id}-{turn}",
        )

        # ── Stage 8: Memory Builder (background) ──────────────────
        context_for_memory = "\n".join(
            f"{m['role']}: {m['content']}" for m in recent_history[-4:]
        )
        asyncio.create_task(
            self._memory_builder.build(
                user, session, db, user_message, context_for_memory
            ),
            name=f"memory-{session.id}-{turn}",
        )

        # ── Stage 9: AI Generation + Response Validation ──────────
        if streaming:
            return self._stream_response(req, interrupt_event)
        else:
            if self._analytics:
                self._analytics.start_stage("ai_generation")

            resp: AIResponse = await self._gateway.generate(req)

            if self._analytics:
                self._analytics.end_stage("ai_generation")

            # Validate and refine
            if self._analytics:
                self._analytics.start_stage("response_validation")

            refined = await self._response_builder.refine_text(
                resp.content,
                user,
                recent_history=recent_history,
                emotion_context=emotion_data,
            )

            if self._analytics:
                self._analytics.end_stage("response_validation")

            return refined

    async def _stream_response(
        self,
        req: AIRequest,
        interrupt_event: asyncio.Event | None,
    ) -> AsyncIterator[StreamChunk]:
        """Handle streaming responses with token filtering and interrupt support."""
        if self._analytics:
            self._analytics.start_stage("ai_streaming")

        stream_gen = self._gateway.stream(req)

        async for chunk in stream_gen:
            if interrupt_event and interrupt_event.is_set():
                break

            filtered = self._response_builder.filter_stream_token(chunk.content)
            if filtered:
                chunk.content = filtered
                yield chunk

        if self._analytics:
            self._analytics.end_stage("ai_streaming")

    @property
    def turn_count(self) -> int:
        """Current turn count for this engine instance."""
        return self._turn_count

    @property
    def question_builder(self) -> QuestionBuilder:
        """Access the question builder for asked-question tracking."""
        return self._question_builder

    @property
    def summarizer(self) -> ConversationSummarizer:
        """Access the conversation summarizer."""
        return self._summarizer
