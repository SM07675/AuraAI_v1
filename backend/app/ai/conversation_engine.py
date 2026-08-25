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
from app.prompts.builder import PromptBuilder
from app.ai.builders.question_builder import QuestionBuilder
from app.ai.builders.response_builder import ResponseBuilder

from app.emotion.base import EmotionContext
from app.emotion.service import EmotionService
from app.services.analytics_service import AnalyticsService
from app.services.conversation_summarizer import ConversationSummarizer
from app.services.goal_engine import GoalEngine
from app.safety.crisis_detector import CrisisDetector
from app.safety.escalation import CrisisEscalation
from app.ai.turn_directive import TurnDirectiveClassifier
from app.services.solution_library import SolutionLibrary

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
        self._crisis_detector = CrisisDetector()
        self._turn_directive = TurnDirectiveClassifier(self._gateway)
        self._solution_library = SolutionLibrary()

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
        debug_out: dict[str, Any] | None = None,
        mode: str | None = None,
        enable_thinking: bool | None = None,
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

        if self._analytics:
            self._analytics.start_stage("fast_path")

        # ── Fast Path (Parallel Execution) ────────────────────────
        crisis_task = asyncio.to_thread(self._crisis_detector.check_for_crisis, user_message)
        
        # Emotion analysis
        if emotion_context is None:
            emotion_task = self._emotion_service.analyze_and_fuse(text=user_message)
        else:
            async def get_cached_emotion(): return emotion_context
            emotion_task = get_cached_emotion()

        # Turn directive classification
        directive_task = self._turn_directive.classify(user_message, session.phase, turn)
        
        # Profile/Memory retrieval (ContextBuilder without waiting for emotion)
        context_task = self._context_builder.build(
            user=user,
            session=session,
            emotion_context=None,
            recent_history=recent_history,
            conversation_summary=self._summarizer.current_summary,
            previously_asked_questions=self._question_builder.asked_questions,
        )

        # Run concurrently
        (is_crisis, crisis_trigger), emotion_context, turn_directive, context_obj = await asyncio.gather(
            crisis_task, emotion_task, directive_task, context_task
        )
        
        # Inject the late-resolved emotion context into the context object
        context_obj.emotion_context = emotion_context
        
        if self._analytics:
            self._analytics.end_stage("fast_path")

        # ── Crisis Check Override ─────────────────────────────────
        crisis_context_str = None
        if is_crisis:
            escalation = CrisisEscalation(db)
            await escalation.log_risk_event(
                user_id=user.id,
                session_id=session.id,
                trigger_type=f"keyword:{crisis_trigger}",
                action_taken="resource_injected"
            )
            crisis_context_str = escalation.get_crisis_context()
            
        # ── Advance Phase ─────────────────────────────────────────
        session.phase = turn_directive.phase
        
        # ── Solution Retrieval ────────────────────────────────────
        retrieved_solution = None
        if turn_directive.offerSolution and turn_directive.problemDetected:
            retrieved_solution = await self._solution_library.get_solution(turn_directive.concernCategory)

        # ── Stage 2: Conversation Summary Check ───────────────────
        # Note: conversation summary check happens independently here
        # so it doesn't block the fast path.
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
                    context_obj.conversation_summary = summary
            except Exception as e:
                logger.warning("Summarization failed", error=str(e))
            if self._analytics:
                self._analytics.end_stage("summarization")

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
            user_name=context_obj.user_name,
            user_message=user_message,
            emotion_data=emotion_context,
            user_profile={"interests": ",".join(context_obj.interests) if isinstance(context_obj.interests, list) else context_obj.interests, "goals": ",".join(context_obj.goals) if isinstance(context_obj.goals, list) else context_obj.goals, "preferred_language": context_obj.preferred_language, "communication_style": context_obj.communication_style},
            long_term_memories=context_obj.long_term_memories,
            conversation_history=recent_history,
            crisis_context=crisis_context_str,
            turn_directive=turn_directive.__dict__,
            retrieved_solution=retrieved_solution,
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
            mode=mode,
            enable_thinking=enable_thinking,
        )

        logger.info("\n" + "="*50 + "\nPROMPT BUILDER DEBUG\n" + "="*50)
        logger.info("SYSTEM PROMPT:\n%s", system_prompt)
        logger.info("USER PROFILE: %s", context_obj.user_name)
        logger.info("MEMORY: %s", context_obj.long_term_memories)
        logger.info("EMOTION: %s", emotion_context.to_prompt_dict() if emotion_context else None)
        logger.info("CONVERSATION HISTORY: %s", recent_history)
        logger.info("CURRENT USER MESSAGE: %s", user_message)
        logger.info("FINAL MESSAGES ARRAY: %s", messages)
        logger.info("="*50)

        if debug_out is not None:
            debug_out["system_prompt"] = system_prompt
            debug_out["memory"] = context_obj.long_term_memories
            debug_out["emotion"] = emotion_context.to_prompt_dict() if emotion_context else None
            debug_out["history"] = recent_history
            debug_out["user_message"] = user_message
            debug_out["final_messages"] = messages
            debug_out["is_crisis"] = is_crisis

        # ── Stage 7 & 8: Fire Background Profile & Memory Tasks ────────────────
        async def _safe_run(coro, task_name: str):
            try:
                await coro
            except Exception as e:
                logger.debug(f"Background task {task_name} skipped or completed", error=str(e))

        asyncio.create_task(
            _safe_run(self._interest_builder.build(user, db, user_message), f"interest-{session.id}-{turn}"),
            name=f"interest-{session.id}-{turn}",
        )
        asyncio.create_task(
            _safe_run(self._goal_engine.detect_and_update(db, user.id, user_message, session.id), f"goals-{session.id}-{turn}"),
            name=f"goals-{session.id}-{turn}",
        )

        context_for_memory = "\n".join(
            f"{m['role']}: {m['content']}" for m in recent_history[-4:]
        )
        asyncio.create_task(
            _safe_run(self._memory_builder.build(user, session, db, user_message, context_for_memory), f"memory-{session.id}-{turn}"),
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
                emotion_context=emotion_context.to_prompt_dict(),
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
        from app.ai.builders.response_builder import ThinkingStreamFilter
        
        if self._analytics:
            self._analytics.start_stage("ai_streaming")

        stream_gen = self._gateway.stream(req)
        think_filter = ThinkingStreamFilter()

        async for chunk in stream_gen:
            if interrupt_event and interrupt_event.is_set():
                break

            filtered_chunk = think_filter.process_chunk(chunk.content)
            if filtered_chunk:
                chunk.content = self._response_builder.filter_stream_token(filtered_chunk)
                yield chunk

        flushed = think_filter.flush()
        if flushed:
            yield StreamChunk(
                content=self._response_builder.filter_stream_token(flushed),
                provider=self._gateway.name
            )

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
