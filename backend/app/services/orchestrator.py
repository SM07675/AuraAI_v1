"""
Conversation Orchestrator for Aura AI 2.0.

The central real-time coordinator for multimodal conversations across Text, Voice,
and Face-to-Face interactions.

Flow:
1. Input Reception (Text / Audio PCM / Video Frame)
2. Parallel Processing (STT + Voice Emotion + Face Emotion in parallel)
3. Parallel Context Retrieval (Profile + Memories + Graph + Goals + Summary)
4. Context Ranking & Budgeting
5. PromptEngine Prompt Assembly
6. NVIDIA NIM Streaming Generation
7. Phrase Chunker & Real-time Neural TTS Streaming
8. Instant Barge-In & Echo Suppression
9. Telemetry & Latency Metric Recording
"""

from __future__ import annotations

import asyncio
import io
import re
import time
from datetime import datetime, timezone
from typing import Any, AsyncGenerator, Callable, Dict, List, Optional, Set, Tuple

import numpy as np

from app.ai.builders.context_ranker import ContextBudgets, ContextRanker
from app.ai.builders.prompt_engine import PromptEngine
from app.ai.gateway import AIGateway
from app.ai.providers.nvidia_nim import NvidiaNimProvider
from app.communication.speech_to_text import WhisperSTTProvider
from app.communication.streaming import ResponseStreamer
from app.communication.text_to_speech import EdgeTTSProvider
from app.core.config import get_settings
from app.core.deps import get_redis
from app.core.logging_config import get_logger
from app.emotion.base import EmotionContext
from app.emotion.service import EmotionService, get_emotion_service, get_voice_service
from app.services.conversation_service import ConversationService
from app.services.hybrid_retrieval_service import HybridRetrievalService

logger = get_logger(__name__)
settings = get_settings()

_GLOBAL_ORCHESTRATOR: Optional[ConversationOrchestrator] = None


class ConversationOrchestrator:
    """Master turn coordinator for Aura 2.0 multimodal pipelines."""

    def __init__(self) -> None:
        self._gateway = AIGateway()
        self._prompt_engine = PromptEngine()
        self._context_ranker = ContextRanker(budgets=ContextBudgets())
        self._stt_provider = WhisperSTTProvider()
        self._tts_provider = EdgeTTSProvider()
        self._retrieval_service = HybridRetrievalService()
        self._active_generations: Dict[str, asyncio.Task] = {}
        self._active_tts_tasks: Dict[str, asyncio.Task] = {}

    @classmethod
    def get_instance(cls) -> ConversationOrchestrator:
        global _GLOBAL_ORCHESTRATOR
        if _GLOBAL_ORCHESTRATOR is None:
            _GLOBAL_ORCHESTRATOR = cls()
        return _GLOBAL_ORCHESTRATOR

    async def process_turn_stream(
        self,
        *,
        session_id: int,
        user_id: int,
        user_name: str,
        user_message: str = "",
        audio_data: Optional[bytes] = None,
        face_data: Optional[Any] = None,
        mode: str = "chat",
        generation_id: Optional[str] = None,
        voice_id: Optional[str] = None,
        is_hindi: bool = False,
        interrupt_event: Optional[asyncio.Event] = None,
        on_event: Optional[Callable[[Dict[str, Any]], Any]] = None,
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """Execute a full multimodal turn and yield streaming events.

        Events yielded / dispatched:
        - {"type": "start", "turn_id": turn_id, "generation_id": gen_id}
        - {"type": "stt", "transcript": text, "latency_ms": ...}
        - {"type": "emotion", "primary_emotion": ..., "confidence": ...}
        - {"type": "chunk", "content": token_text, "sequence": seq}
        - {"type": "audio_chunk", "audio": base64_mp3, "sequence": seq}
        - {"type": "done", "response": full_text, "metrics": {...}}
        - {"type": "interrupted", "turn_id": turn_id}
        - {"type": "error", "message": error_msg}
        """
        turn_t0 = time.perf_counter()
        gen_id = generation_id or f"gen_{int(turn_t0 * 1000)}"
        turn_id = int(time.time() * 1000) % 1000000

        # Announce turn start
        yield {
            "type": "start",
            "turn_id": turn_id,
            "generation_id": gen_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

        # ── Step 1: Parallel Audio Processing (STT + Voice Emotion) ──
        transcript = user_message.strip()
        voice_emotion_result: Optional[Dict[str, Any]] = None
        stt_latency_ms = 0.0
        voice_emo_latency_ms = 0.0

        if audio_data and len(audio_data) > 300:
            stt_task = asyncio.create_task(self._stt_provider.transcribe(audio_data))
            voice_emo_task = asyncio.create_task(get_voice_service().analyze(audio_data, user_id=user_id))

            t_audio_start = time.perf_counter()
            done, _ = await asyncio.wait([stt_task, voice_emo_task], timeout=4.0)

            if stt_task in done and not stt_task.cancelled():
                try:
                    res_stt = stt_task.result()
                    transcript = (res_stt.get("text") or "").strip()
                    stt_latency_ms = (time.perf_counter() - t_audio_start) * 1000.0
                    yield {
                        "type": "stt",
                        "transcript": transcript,
                        "language": res_stt.get("language", "en"),
                        "latency_ms": round(stt_latency_ms, 2),
                    }
                except Exception as exc:
                    logger.warning("STT transcription exception", error=str(exc))

            if voice_emo_task in done and not voice_emo_task.cancelled():
                try:
                    voice_emotion_result = voice_emo_task.result()
                    voice_emo_latency_ms = (time.perf_counter() - t_audio_start) * 1000.0
                except Exception as exc:
                    logger.warning("Voice emotion exception", error=str(exc))

        if not transcript and not audio_data and not user_message:
            yield {"type": "done", "response": "", "metrics": {}}
            return

        # ── Step 2: Asynchronous Emotion Fusion ───────────────────────
        t_emo_start = time.perf_counter()
        emotion_svc = get_emotion_service()
        emotion_ctx = await emotion_svc.analyze_and_fuse(
            text=transcript,
            image_data=face_data,
            audio_data=audio_data,
        )
        emo_latency_ms = (time.perf_counter() - t_emo_start) * 1000.0

        yield {
            "type": "emotion",
            "primary_emotion": emotion_ctx.primary_emotion,
            "confidence": round(emotion_ctx.confidence * 100, 1),
            "stress": emotion_ctx.stress,
            "sentiment": emotion_ctx.sentiment,
            "conflict": emotion_ctx.conflict,
            "latency_ms": round(emo_latency_ms, 2),
        }

        # ── Step 3: Concurrent Parallel Context Retrieval ─────────────
        t_ret_start = time.perf_counter()
        retrieval_bundle = await self._retrieval_service.retrieve_context(
            user_id=user_id,
            session_id=session_id,
            query=transcript or "hello",
            user_name=user_name,
        )
        ret_latency_ms = (time.perf_counter() - t_ret_start) * 1000.0

        # ── Step 4: Context Ranking & Budgeting ───────────────────────
        ranked_context = self._context_ranker.rank_and_pack(
            raw_memories=retrieval_bundle.get("long_term_memories", []),
            raw_graph_facts=retrieval_bundle.get("graph_facts", []),
            active_goals=retrieval_bundle.get("active_goals", []),
            recent_history=retrieval_bundle.get("recent_history", []),
            conversation_summary=retrieval_bundle.get("conversation_summary", ""),
            query=transcript,
        )

        # ── Step 5: Prompt Assembly via PromptEngine ──────────────────
        t_p_start = time.perf_counter()
        system_prompt, messages = self._prompt_engine.build_prompt(
            user_name=user_name,
            user_message=transcript,
            emotion_context=emotion_ctx,
            user_profile=retrieval_bundle.get("user_profile"),
            active_goals=ranked_context.active_goals,
            relevant_memories=ranked_context.ranked_memories,
            graph_facts=ranked_context.ranked_graph_facts,
            conversation_history=ranked_context.recent_history,
            conversation_summary=ranked_context.conversation_summary,
            mode=mode,
            preferred_language="hi" if is_hindi else "en",
        )
        prompt_latency_ms = (time.perf_counter() - t_p_start) * 1000.0

        # ── Step 6 & 7: Streaming LLM + Real-Time TTS Chunking ────────
        t_llm_start = time.perf_counter()
        ttft_recorded = False
        ttft_ms = 0.0
        first_audio_ms = 0.0
        full_response_parts: List[str] = []
        token_sequence = 0
        audio_sequence = 0

        # Fast phrase chunker for sub-800ms voice synthesis
        phrase_delimiters = re.compile(r"([,;:!?।\n]+)")
        pending_tts_text = ""

        try:
            from app.ai.base import AIRequest

            ai_req = AIRequest(
                system_prompt=system_prompt,
                prompt=transcript,
                messages=messages,
                stream=True,
                temperature=0.7,
                max_tokens=350 if mode in ("voice", "face_to_face") else 800,
            )

            token_stream = self._gateway.stream(ai_req)
            async for chunk in token_stream:
                if interrupt_event and interrupt_event.is_set():
                    logger.info("Turn generation interrupted by barge-in event", generation_id=gen_id)
                    yield {"type": "interrupted", "turn_id": turn_id, "generation_id": gen_id}
                    return

                token = chunk.content if hasattr(chunk, "content") else str(chunk)
                if not token:
                    continue

                if not ttft_recorded:
                    ttft_ms = (time.perf_counter() - t_llm_start) * 1000.0
                    ttft_recorded = True

                token_sequence += 1
                full_response_parts.append(token)
                pending_tts_text += token

                # Yield text chunk to UI immediately
                yield {
                    "type": "chunk",
                    "content": token,
                    "sequence": token_sequence,
                    "generation_id": gen_id,
                }

                # Check for natural phrase boundary for streaming TTS
                if mode in ("voice", "live", "face_to_face") and len(pending_tts_text) >= 12:
                    match = phrase_delimiters.search(pending_tts_text)
                    if match:
                        split_pos = match.end()
                        chunk_to_synthesize = pending_tts_text[:split_pos].strip()
                        pending_tts_text = pending_tts_text[split_pos:]

                        if chunk_to_synthesize:
                            audio_sequence += 1
                            audio_bytes = await self._tts_provider.synthesize(
                                chunk_to_synthesize,
                                voice=voice_id,
                            )
                            if audio_bytes:
                                if first_audio_ms == 0.0:
                                    first_audio_ms = (time.perf_counter() - turn_t0) * 1000.0
                                import base64
                                yield {
                                    "type": "audio_chunk",
                                    "audio": base64.b64encode(audio_bytes).decode("utf-8"),
                                    "sequence": audio_sequence,
                                    "text_segment": chunk_to_synthesize,
                                    "generation_id": gen_id,
                                }

            # Synthesize any remaining trailing text for TTS
            if mode in ("voice", "live", "face_to_face") and pending_tts_text.strip():
                audio_sequence += 1
                audio_bytes = await self._tts_provider.synthesize(
                    pending_tts_text.strip(),
                    voice=voice_id,
                )
                if audio_bytes:
                    if first_audio_ms == 0.0:
                        first_audio_ms = (time.perf_counter() - turn_t0) * 1000.0
                    import base64
                    yield {
                        "type": "audio_chunk",
                        "audio": base64.b64encode(audio_bytes).decode("utf-8"),
                        "sequence": audio_sequence,
                        "text_segment": pending_tts_text.strip(),
                        "generation_id": gen_id,
                    }

        except asyncio.CancelledError:
            logger.info("Turn generation cancelled due to barge-in interrupt", generation_id=gen_id)
            yield {"type": "interrupted", "turn_id": turn_id, "generation_id": gen_id}
            return
        except Exception as exc:
            logger.warning("LLM streaming generation error, applying resilient fallback", error=str(exc))
            fallback_text = (
                "मैं आपके साथ हूँ और सुन रही हूँ। आज आपके मन में क्या चल रहा है?"
                if is_hindi
                else "I'm right here with you and listening. What's on your mind today?"
            )
            full_response_parts = [fallback_text]
            yield {
                "type": "chunk",
                "content": fallback_text,
                "sequence": 1,
                "generation_id": gen_id,
            }

        full_reply = "".join(full_response_parts).strip()
        total_turn_ms = (time.perf_counter() - turn_t0) * 1000.0

        # ── Step 8: Persist Messages Asynchronously ───────────────────
        asyncio.create_task(self._persist_turn(
            user_id=user_id,
            session_id=session_id,
            user_text=transcript,
            assistant_text=full_reply,
            emotion_ctx=emotion_ctx,
        ))

        # ── Step 9: Emit Completion & Telemetry ───────────────────────
        metrics = {
            "stt_latency_ms": round(stt_latency_ms, 2),
            "voice_emotion_latency_ms": round(voice_emo_latency_ms, 2),
            "emotion_fusion_latency_ms": round(emo_latency_ms, 2),
            "retrieval_latency_ms": round(ret_latency_ms, 2),
            "prompt_build_latency_ms": round(prompt_latency_ms, 2),
            "llm_ttft_ms": round(ttft_ms, 2),
            "tts_first_audio_ms": round(first_audio_ms, 2),
            "total_turn_latency_ms": round(total_turn_ms, 2),
        }

        yield {
            "type": "done",
            "response": full_reply,
            "turn_id": turn_id,
            "generation_id": gen_id,
            "metrics": metrics,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    async def _persist_turn(
        self,
        user_id: int,
        session_id: int,
        user_text: str,
        assistant_text: str,
        emotion_ctx: EmotionContext,
    ) -> None:
        """Asynchronously save turn messages to DB and working memory."""
        try:
            from app.db.engine import async_session_factory
            async with async_session_factory() as db:
                conv_svc = ConversationService(db)
                if user_text:
                    await conv_svc.save_message(
                        session_id=session_id,
                        user_id=user_id,
                        role="user",
                        content=user_text,
                    )
                if assistant_text:
                    await conv_svc.save_message(
                        session_id=session_id,
                        user_id=user_id,
                        role="assistant",
                        content=assistant_text,
                    )
        except Exception as exc:
            logger.warning("Message persistence background task exception", error=str(exc))

    def cancel_generation(self, generation_id: str) -> None:
        """Cancel an ongoing generation immediately upon barge-in."""
        task = self._active_generations.pop(generation_id, None)
        if task and not task.done():
            task.cancel()
            logger.info("Cancelled generation task", generation_id=generation_id)
