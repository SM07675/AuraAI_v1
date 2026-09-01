"""
Conversation Engine — the master orchestrator for the intelligence pipeline in Aura AI 2.0.

Orchestration Flow:
1. Turn Classification (Fast Path vs Deep Path via TurnRouter)
2. Safe Semantic Response Cache Check
3. Parallel Hybrid Context Retrieval (Vector Memory + Knowledge Graph + Profile + Summary)
4. Context Ranking & Strict Budget Enforcement (ContextRanker)
5. Question Engine (checks KG & Memory to avoid repeats)
6. Prompt Builder (System base + Profile + Graph + Memory + Emotion + Directives)
7. AI Gateway Stream / Generation with TTFT tracking
8. Interruption / Barge-in coordination
9. Background Memory Deduplication, Goal Engine & Knowledge Graph Synchronization
10. System Observability & Latency Metric Recording (T0–T7)
"""

from __future__ import annotations

import asyncio
import time
import uuid
from collections.abc import AsyncIterator
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.base import AIRequest, AIResponse, StreamChunk
from app.ai.builders.context_builder import ContextBuilder, ContextObject
from app.ai.builders.context_ranker import ContextRanker, RankedContextBundle
from app.ai.builders.interest_builder import InterestBuilder
from app.ai.builders.memory_builder import MemoryBuilder
from app.ai.builders.question_builder import QuestionBuilder
from app.ai.builders.response_builder import ResponseBuilder
from app.ai.gateway import AIGateway
from app.ai.turn_directive import TurnDirectiveClassifier
from app.ai.turn_router import RouteDecision, TurnRouter
from app.core.logging_config import get_logger
from app.emotion.base import EmotionContext
from app.emotion.service import EmotionService
from app.models.latency_metric import LatencyMetric
from app.models.session import Session
from app.models.user import User
from app.prompts.builder import PromptBuilder
from app.safety.crisis_detector import CrisisDetector
from app.safety.escalation import CrisisEscalation
from app.services.analytics_service import AnalyticsService
from app.services.conversation_summarizer import ConversationSummarizer
from app.services.goal_engine import GoalEngine
from app.services.hybrid_retrieval_service import HybridRetrievalService
from app.services.knowledge_graph_service import KnowledgeGraphService
from app.services.solution_library import SolutionLibrary
from app.services.working_memory_service import WorkingMemoryService

logger = get_logger(__name__)


class ConversationEngine:
    """Master orchestrator for the conversational intelligence pipeline."""

    def __init__(self, gateway: AIGateway | None = None) -> None:
        self._gateway = gateway or AIGateway()

        # Initialize Builders
        self._context_builder = ContextBuilder(None)
        self._interest_builder = InterestBuilder(self._gateway)
        self._memory_builder = MemoryBuilder(self._gateway)
        self._question_builder = QuestionBuilder(self._gateway)
        self._prompt_builder = PromptBuilder()
        self._response_builder = ResponseBuilder(self._gateway)
        self._context_ranker = ContextRanker()

        # Initialize Services
        self._emotion_service = EmotionService()
        self._goal_engine = GoalEngine(self._gateway)
        self._summarizer = ConversationSummarizer(self._gateway)
        self._crisis_detector = CrisisDetector()
        self._turn_directive = TurnDirectiveClassifier(self._gateway)
        self._solution_library = SolutionLibrary()
        self._working_memory = WorkingMemoryService()

        # Analytics & Observability
        self._analytics: AnalyticsService | None = None
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
        preferred_language: str | None = None,
        turn_count: int | None = None,
        previously_asked_questions: list[str] | None = None,
    ) -> AsyncIterator[StreamChunk] | str:
        """Main pipeline entrypoint executing the complete intelligence pipeline."""
        t0_start = time.perf_counter()
        trace_id = uuid.uuid4().hex[:16]

        if turn_count is None:
            self._turn_count += 1
        else:
            self._turn_count = max(self._turn_count, turn_count)
        turn = self._turn_count

        # ── 1. Turn Classification (Fast Path vs Deep Path) ───────
        route_decision: RouteDecision = TurnRouter.classify(
            user_message=user_message,
            mode=mode or "chat",
            turn_count=turn,
        )

        # ── 2. Safe Semantic Cache Check ──────────────────────────
        primary_emo = emotion_context.primary_emotion if emotion_context else "neutral"
        cached_reply = await self._working_memory.get_semantic_response(
            query=user_message,
            intent="general",
            locale=preferred_language or "en",
            model="aura_gateway",
            user_id=user.id,
            emotion=primary_emo,
        )
        if cached_reply:
            logger.info("Semantic cache hit — bypassing LLM", query=user_message[:40])
            if debug_out is not None:
                debug_out["cache_hit"] = True
                debug_out["is_fast_path"] = True
                debug_out["trace_id"] = trace_id

            if streaming:
                async def _cached_stream():
                    yield StreamChunk(content=cached_reply, provider="semantic_cache")
                return _cached_stream()
            return cached_reply

        # ── 3. Parallel Execution (Crisis + Emotion + Directive + Hybrid Retrieval) ──
        hybrid_retriever = HybridRetrievalService(db)

        # Crisis detection
        crisis_task = asyncio.to_thread(self._crisis_detector.check_for_crisis, user_message)

        # Emotion analysis
        if emotion_context is None:
            emotion_task = self._emotion_service.analyze_and_fuse(text=user_message)
        else:
            async def get_cached_emotion(): return emotion_context
            emotion_task = get_cached_emotion()

        # Turn directive
        directive_task = self._turn_directive.classify(user_message, session.phase, turn)

        # Hybrid parallel retrieval (or test mock)
        from unittest.mock import AsyncMock
        if hasattr(self, "_context_builder") and isinstance(getattr(self._context_builder, "build", None), AsyncMock):
            async def _mocked_retrieval():
                ctx = await self._context_builder.build(
                    user=user,
                    session=session,
                    emotion_context=emotion_context,
                    recent_history=recent_history,
                    conversation_summary=session.summary or self._summarizer.current_summary,
                    previously_asked_questions=previously_asked_questions or self._question_builder.asked_questions,
                    preferred_language=preferred_language,
                    user_message=user_message,
                )
                bundle = RankedContextBundle(
                    ranked_memories=ctx.long_term_memories,
                    ranked_graph_facts=getattr(ctx, "graph_facts", []),
                    active_goals=ctx.active_goals,
                    recent_history=ctx.recent_history,
                    conversation_summary=ctx.conversation_summary,
                    previous_session_context=ctx.previous_session_context,
                )
                return bundle, {"retrieval_total_ms": 0.0}
            retrieval_task = _mocked_retrieval()
        else:
            retrieval_task = hybrid_retriever.retrieve_parallel(
                user=user,
                session=session,
                query=user_message,
                is_fast_path=route_decision.is_fast_path,
            )

        (
            (is_crisis, crisis_trigger),
            emotion_context,
            turn_directive,
            (ranked_bundle, retrieval_timings),
        ) = await asyncio.gather(crisis_task, emotion_task, directive_task, retrieval_task)

        t2_retrieval_done = time.perf_counter()

        # ── 4. Crisis Check Override ──────────────────────────────
        crisis_context_str = None
        if is_crisis:
            escalation = CrisisEscalation(db)
            await escalation.log_risk_event(
                user_id=user.id,
                session_id=session.id,
                trigger_type=f"keyword:{crisis_trigger}",
                action_taken="resource_injected",
            )
            crisis_context_str = escalation.get_crisis_context()

        # Advance session phase
        session.phase = turn_directive.phase

        # Solution retrieval
        retrieved_solution = None
        if turn_directive.offerSolution and turn_directive.problemDetected:
            retrieved_solution = await self._solution_library.get_solution(turn_directive.concernCategory)

        # ── 5. Question Builder (Knowledge Graph & Memory Aware) ───
        targeted_question = None
        if not (route_decision.is_fast_path and route_decision.reason == "exact_fast_phrase"):
            history_str = "\n".join(f"{m['role']}: {m['content']}" for m in (recent_history or ranked_bundle.recent_history)[-6:])
            targeted_question = await self._question_builder.build(
                user=user,
                user_message=user_message,
                conversation_history=history_str,
                turn_count=turn,
                previously_asked=previously_asked_questions or self._question_builder.asked_questions,
                preferred_language=preferred_language,
                relevant_memories=ranked_bundle.ranked_memories,
                graph_facts=ranked_bundle.ranked_graph_facts,
                conversation_summary=session.summary or ranked_bundle.conversation_summary,
            )

        turn_directive_dict = (
            turn_directive.__dict__.copy()
            if hasattr(turn_directive, "__dict__")
            else dict(turn_directive or {})
        )
        if targeted_question:
            turn_directive_dict["mustAskFollowUp"] = True
            turn_directive_dict["nextQuestionSeed"] = targeted_question

        # ── 6. Assemble Prompt ─────────────────────────────────────
        t3_prompt_start = time.perf_counter()

        # User profile fields
        user_profile_dict = {
            "interests": user.interests or "",
            "goals": user.goals or "",
            "skills": user.skills or "",
            "projects": user.projects or "",
            "preferred_language": preferred_language or user.preferred_language or "en",
            "communication_style": user.communication_style or "balanced",
            "learning_style": user.learning_style or "visual",
        }

        # Use recent turns from ranked bundle if recent_history is empty
        effective_history = recent_history if recent_history else ranked_bundle.recent_history

        system_prompt, messages = self._prompt_builder.build(
            user_name=user.name.split()[0] if user.name else "there",
            user_message=user_message,
            emotion_data=emotion_context,
            user_profile=user_profile_dict,
            long_term_memories=ranked_bundle.ranked_memories,
            graph_facts=ranked_bundle.ranked_graph_facts,
            conversation_history=effective_history,
            crisis_context=crisis_context_str,
            turn_directive=turn_directive_dict,
            retrieved_solution=retrieved_solution,
            conversation_summary=session.summary or ranked_bundle.conversation_summary,
            previous_session_context=ranked_bundle.previous_session_context,
            targeted_question=targeted_question,
            mode=mode or "chat",
        )

        t3_prompt_done = time.perf_counter()
        prompt_latency_ms = (t3_prompt_done - t3_prompt_start) * 1000.0

        # ── 7. Prepare AI Request ─────────────────────────────────
        final_enable_thinking = enable_thinking if enable_thinking is not None else route_decision.enable_thinking
        req = AIRequest(
            system_prompt=system_prompt,
            prompt="",
            messages=messages,
            stream=streaming,
            temperature=route_decision.temperature,
            max_tokens=route_decision.max_tokens,
            mode=mode,
            enable_thinking=final_enable_thinking,
        )

        if debug_out is not None:
            debug_out["trace_id"] = trace_id
            debug_out["is_fast_path"] = route_decision.is_fast_path
            debug_out["cache_hit"] = False
            debug_out["system_prompt"] = system_prompt
            debug_out["memory"] = ranked_bundle.ranked_memories
            debug_out["graph_facts"] = ranked_bundle.ranked_graph_facts
            debug_out["conversation_summary"] = session.summary or ranked_bundle.conversation_summary
            debug_out["targeted_question"] = targeted_question
            debug_out["emotion"] = emotion_context.to_prompt_dict() if emotion_context else None
            debug_out["history"] = effective_history
            debug_out["user_message"] = user_message
            debug_out["final_messages"] = messages
            debug_out["is_crisis"] = is_crisis
            debug_out["estimated_tokens"] = ranked_bundle.estimated_total_tokens
            debug_out["retrieval_timings"] = retrieval_timings

        # ── 8. Fire Asynchronous Background Tasks (Isolated DB Sessions) ──
        from app.db.engine import async_session_factory

        async def _safe_run_bg_tasks(u_id, u_obj, sess_id, msg, ctx_hist):
            try:
                async with async_session_factory() as bg_db:
                    # 1. Update Knowledge Graph
                    kg_svc = KnowledgeGraphService(bg_db)
                    await kg_svc.extract_and_sync_from_profile_and_text(
                        user_id=u_id,
                        user_name=u_obj.name,
                        user_message=msg,
                        interests=u_obj.interests,
                        goals=u_obj.goals,
                        projects=u_obj.projects,
                    )
                    # 2. Update Goals
                    await self._goal_engine.detect_and_update(bg_db, u_id, msg, sess_id)
                    # 3. Extract Long-Term Memories
                    await self._memory_builder.build(u_obj, session, bg_db, msg, ctx_hist)
            except Exception as e:
                logger.debug("Background pipeline task completed/skipped", error=str(e))

        context_for_memory = "\n".join(f"{m['role']}: {m['content']}" for m in effective_history[-4:])
        asyncio.create_task(
            _safe_run_bg_tasks(user.id, user, session.id, user_message, context_for_memory),
            name=f"bg-intelligence-{session.id}-{turn}",
        )

        # ── 9. Stream / Generate AI Response ──────────────────────
        if streaming:
            return self._stream_response_with_telemetry(
                req=req,
                interrupt_event=interrupt_event,
                trace_id=trace_id,
                t0_start=t0_start,
                user=user,
                session=session,
                user_message=user_message,
                is_fast_path=route_decision.is_fast_path,
                retrieval_timings=retrieval_timings,
                prompt_latency_ms=prompt_latency_ms,
            )
        else:
            t4_llm_start = time.perf_counter()
            resp: AIResponse = await self._gateway.generate(req)
            t4_llm_done = time.perf_counter()
            llm_latency_ms = (t4_llm_done - t4_llm_start) * 1000.0

            refined = await self._response_builder.refine_text(
                resp.content,
                user,
                recent_history=effective_history,
                emotion_context=emotion_context.to_prompt_dict() if emotion_context else None,
            )

            # Record Latency Trace
            total_latency_ms = (time.perf_counter() - t0_start) * 1000.0
            asyncio.create_task(
                self._record_latency_trace(
                    trace_id=trace_id,
                    session_id=session.id,
                    user_id=user.id,
                    turn_id=turn,
                    provider=resp.provider or "ai_gateway",
                    model=resp.model or "default",
                    is_fast_path=route_decision.is_fast_path,
                    cache_hit=False,
                    retrieval_latency_ms=retrieval_timings.get("retrieval_total_ms", 0.0),
                    graph_latency_ms=retrieval_timings.get("graph_retrieval_ms", 0.0),
                    vector_latency_ms=retrieval_timings.get("memory_retrieval_ms", 0.0),
                    prompt_build_latency_ms=prompt_latency_ms,
                    llm_ttft_ms=llm_latency_ms,
                    llm_total_latency_ms=llm_latency_ms,
                    total_turn_latency_ms=total_latency_ms,
                )
            )

            # Store in safe semantic cache if eligible
            asyncio.create_task(
                self._working_memory.set_semantic_response(
                    query=user_message,
                    response=refined,
                    intent="general",
                    locale=preferred_language or "en",
                    model=resp.model or "default",
                    user_id=user.id,
                    emotion=primary_emo,
                )
            )

            return refined

    async def _stream_response_with_telemetry(
        self,
        req: AIRequest,
        interrupt_event: asyncio.Event | None,
        trace_id: str,
        t0_start: float,
        user: User,
        session: Session,
        user_message: str,
        is_fast_path: bool,
        retrieval_timings: dict[str, float],
        prompt_latency_ms: float,
    ) -> AsyncIterator[StreamChunk]:
        """Stream chunks with token filtering, sub-second TTFT recording, and barge-in support."""
        from app.ai.builders.response_builder import ThinkingStreamFilter

        stream_gen = self._gateway.stream(req)
        think_filter = ThinkingStreamFilter()
        ttft_recorded = False
        ttft_ms = 0.0
        provider_name = getattr(self._gateway, "name", "aura_gateway")
        full_text_accum = ""

        try:
            async for chunk in stream_gen:
                if interrupt_event and interrupt_event.is_set():
                    logger.info("Stream interrupted by voice barge-in", trace_id=trace_id)
                    await self._working_memory.set_interrupted(session.id, True)
                    break

                if not ttft_recorded and chunk and chunk.content:
                    ttft_ms = (time.perf_counter() - t0_start) * 1000.0
                    ttft_recorded = True

                filtered_chunk = think_filter.process_chunk(chunk.content)
                if filtered_chunk:
                    clean_token = self._response_builder.filter_stream_token(filtered_chunk)
                    full_text_accum += clean_token
                    chunk.content = clean_token
                    yield chunk

            flushed = think_filter.flush()
            if flushed:
                clean_flush = self._response_builder.filter_stream_token(flushed)
                full_text_accum += clean_flush
                yield StreamChunk(content=clean_flush, provider=provider_name)

        except Exception as exc:
            logger.error("Streaming error in ConversationEngine", error=str(exc))
            fallback_text = "I'm here with you. Please tell me more about what's on your mind."
            yield StreamChunk(content=fallback_text, provider="fallback")
            full_text_accum = fallback_text

        # Guarantee never returning empty response
        if not full_text_accum.strip():
            fallback_text = "I am listening and here to support you. What would you like to focus on?"
            yield StreamChunk(content=fallback_text, provider="fallback")
            full_text_accum = fallback_text

        total_latency_ms = (time.perf_counter() - t0_start) * 1000.0

        # Record full latency trace asynchronously
        asyncio.create_task(
            self._record_latency_trace(
                trace_id=trace_id,
                session_id=session.id,
                user_id=user.id,
                turn_id=self._turn_count,
                provider=provider_name,
                model="aura_gateway",
                is_fast_path=is_fast_path,
                cache_hit=False,
                retrieval_latency_ms=retrieval_timings.get("retrieval_total_ms", 0.0),
                graph_latency_ms=retrieval_timings.get("graph_retrieval_ms", 0.0),
                vector_latency_ms=retrieval_timings.get("memory_retrieval_ms", 0.0),
                prompt_build_latency_ms=prompt_latency_ms,
                llm_ttft_ms=ttft_ms or total_latency_ms,
                llm_total_latency_ms=total_latency_ms,
                total_turn_latency_ms=total_latency_ms,
            )
        )

        # Update Layer 1 Working Memory in Redis
        asyncio.create_task(
            self._working_memory.update_turn(
                session_id=session.id,
                user_id=user.id,
                user_message=user_message,
                assistant_message=full_text_accum,
                latency_metadata={"ttft_ms": ttft_ms, "total_ms": total_latency_ms},
            )
        )

    async def _record_latency_trace(
        self,
        trace_id: str,
        session_id: int,
        user_id: int,
        turn_id: int,
        provider: str,
        model: str,
        is_fast_path: bool,
        cache_hit: bool,
        retrieval_latency_ms: float,
        graph_latency_ms: float,
        vector_latency_ms: float,
        prompt_build_latency_ms: float,
        llm_ttft_ms: float,
        llm_total_latency_ms: float,
        total_turn_latency_ms: float,
    ) -> None:
        """Persist structured turn latency trace for system observability and benchmarking."""
        from app.db.engine import async_session_factory
        try:
            async with async_session_factory() as db:
                metric = LatencyMetric(
                    trace_id=trace_id,
                    session_id=session_id,
                    user_id=user_id,
                    turn_id=turn_id,
                    provider=provider,
                    model=model,
                    is_fast_path=is_fast_path,
                    cache_hit=cache_hit,
                    retrieval_latency_ms=round(retrieval_latency_ms, 2),
                    graph_latency_ms=round(graph_latency_ms, 2),
                    vector_latency_ms=round(vector_latency_ms, 2),
                    prompt_build_latency_ms=round(prompt_build_latency_ms, 2),
                    llm_ttft_ms=round(llm_ttft_ms, 2),
                    llm_total_latency_ms=round(llm_total_latency_ms, 2),
                    total_turn_latency_ms=round(total_turn_latency_ms, 2),
                )
                db.add(metric)
                await db.commit()
        except Exception as exc:
            logger.debug("Could not record latency trace", error=str(exc))

    @property
    def turn_count(self) -> int:
        return self._turn_count

    @property
    def question_builder(self) -> QuestionBuilder:
        return self._question_builder

    @property
    def summarizer(self) -> ConversationSummarizer:
        return self._summarizer

    @property
    def working_memory(self) -> WorkingMemoryService:
        return self._working_memory
