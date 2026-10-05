"""
Voice Conversation Manager.

Orchestrates the complete voice pipeline for a single session turn:

    STT transcript
      → Emotion Analysis (text)
      → ConversationEngine (Context + Question + Prompt + AI + Validate)
      → ResponseStreamer (text → WebSocket + TTS)
      → Message persistence (DB)
      → Memory update (background, via engine)

Also manages the in-memory conversation history so context is available
immediately without hitting the database on every turn.

Interruption handling
---------------------
When interrupted mid-response, the partial AI response is recorded with
an "[interrupted]" marker and added to history so the next turn has
accurate context. The user's new utterance is then processed normally.
"""

from __future__ import annotations

import asyncio
import time
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.conversation_engine import ConversationEngine
from app.communication.ai_gateway import CommunicationAIGateway
from app.communication.interrupt_manager import InterruptManager
from app.communication.metrics import CommunicationMetrics
from app.communication.speech_to_text import STTEngine, TranscriptResult
from app.communication.state_machine import CommunicationState, StateMachine
from app.communication.streaming import ResponseStreamer
from app.communication.text_to_speech import TTSEngine
from app.core.logging_config import get_logger
from app.emotion.service import EmotionService
from app.models.message import Message, MessageRole, MessageType
from app.models.session import Session, SessionStatus
from app.models.user import User
from app.services.analytics_service import AnalyticsService

logger = get_logger(__name__)

# How many turns to keep in in-memory history (10 = tighter context, less noise)
_HISTORY_WINDOW = 10

# Type aliases
TextCallback = Callable[[str], Awaitable[None]]
AudioCallback = Callable[[bytes, int], Awaitable[None]]
EventCallback = Callable[[str, dict], Awaitable[None]]


class VoiceConversationManager:
    """Orchestrates a complete voice conversation for one session.

    Args:
        session_id: Voice session UUID.
        user_id: Authenticated user ID (or 0 for unauthenticated testing).
        db_session: SQLAlchemy async session for persistence.
        state_machine: Shared session state machine.
        interrupt_manager: Shared interrupt coordinator.
        tts_engine: TTS engine instance.
        stt_engine: STT engine instance.
        metrics: Session metrics collector.

    Callbacks registered via set_* methods decouple output channels:
        on_text_token  – called per AI token (→ WebSocket partial_response)
        on_audio_chunk – called per TTS MP3 chunk (→ WebSocket audio_chunk)
        on_event       – called for named pipeline events (→ WebSocket events)
    """

    def __init__(
        self,
        session_id: str,
        user_id: int,
        db_session: AsyncSession,
        state_machine: StateMachine,
        interrupt_manager: InterruptManager,
        tts_engine: TTSEngine,
        stt_engine: STTEngine,
        metrics: CommunicationMetrics,
    ) -> None:
        self._session_id = session_id
        self._user_id = user_id
        self._db = db_session
        self._sm = state_machine
        self._interrupt = interrupt_manager
        self._tts = tts_engine
        self._stt = stt_engine
        self._metrics = metrics

        self._ai_gateway = CommunicationAIGateway(session_id=session_id)
        self._conversation_engine = ConversationEngine(gateway=self._ai_gateway._gateway)

        # Emotion service for text analysis
        self._emotion_service = EmotionService()

        # Analytics for pipeline timing
        self._analytics = AnalyticsService(session_id=session_id, user_id=user_id)
        self._conversation_engine.set_analytics(self._analytics)

        # In-memory conversation history (role, content dicts)
        self._history: list[dict[str, str]] = []
        # Database session ID (set after first DB session creation)
        self._db_session_id: int | None = None
        # Latest face emotion received from camera channel
        self._latest_face_emotion: dict[str, Any] | None = None
        self._face_received_at = 0.0
        # Active turn execution task
        self._active_turn_task: asyncio.Task | None = None

        # Callbacks (set after construction)
        self._on_text: TextCallback | None = None
        self._on_audio: AudioCallback | None = None
        self._on_event: EventCallback | None = None

        # Cached DB objects — avoid per-turn SELECT queries (saves ~50ms/turn)
        self._cached_user: User | None = None
        self._cached_session: Session | None = None

    def set_latest_face_emotion(self, face_data: dict[str, Any]) -> None:
        """Cache the most recent facial emotion result for multimodal fusion."""
        self._latest_face_emotion = dict(face_data)
        self._face_received_at = time.monotonic()

    async def cancel_active_turn(self) -> None:
        """Cancel any running turn generation task immediately."""
        if (self._active_turn_task and self._active_turn_task is not asyncio.current_task()
                and not self._active_turn_task.done()):
            self._active_turn_task.cancel()
            try:
                await asyncio.wait_for(asyncio.shield(self._active_turn_task), timeout=0.3)
            except (asyncio.CancelledError, asyncio.TimeoutError):
                pass
            self._active_turn_task = None
        await self._tts.stop()

    # ── Callback wiring ───────────────────────────────────────────

    def on_text_token(self, cb: TextCallback) -> None:
        self._on_text = cb

    def on_audio_chunk(self, cb: AudioCallback) -> None:
        self._on_audio = cb

    def on_event(self, cb: EventCallback) -> None:
        self._on_event = cb

    # ── Lifecycle ─────────────────────────────────────────────────

    async def initialize(self) -> None:
        """Create or load a DB session for this voice conversation."""
        if self._user_id:
            db_session = Session(
                user_id=self._user_id,
                status=SessionStatus.ACTIVE.value,
            )
            self._db.add(db_session)
            await self._db.commit()
            await self._db.refresh(db_session)
            self._db_session_id = db_session.id
            logger.info(
                "DB session created for voice conversation",
                session_id=self._session_id,
                db_session_id=self._db_session_id,
            )
        else:
            logger.info(
                "No user_id — running in unauthenticated test mode",
                session_id=self._session_id,
            )

    async def close(self) -> None:
        """End the DB session on disconnect."""
        if self._db_session_id and self._user_id:
            await self._update_session_summary(force=True)
            result = await self._db.execute(
                select(Session).where(Session.id == self._db_session_id)
            )
            db_session = result.scalar_one_or_none()
            if db_session:
                db_session.status = SessionStatus.ENDED.value
                db_session.ended_at = datetime.now(UTC)
                await self._db.commit()

    # Fast voice command direct responses (Requirement 16)
    FAST_COMMANDS: dict[str, str] = {
        "stop": "Stopped. What would you like to discuss next?",
        "wait": "I'm pausing right here. Take your time.",
        "hold on": "I'm holding. Let me know when you're ready.",
        "next question": "Moving to the next question. How have your energy and focus been today?",
        "continue": "Continuing on. Tell me more about what you were describing.",
        "tell me more": "Certainly. Let's delve deeper into how that affects your daily routine.",
        "yes": "Understood. Please go ahead.",
        "no": "Got it. Let's take a different direction.",
        "okay": "Sounds good. Where should we begin?",
        "ok": "Sounds good. Where should we begin?",
        "ruko": "जी, मैं रुक गई हूँ। बताइए आगे क्या बात है?",
        "ruk jao": "जी, मैं ठहर गई हूँ। आराम से अपनी बात कहिए।",
        "suno": "हाँ, मैं बिल्कुल ध्यान से सुन रही हूँ। कृपया कहिए।",
        "theek hai": "बिल्कुल। आगे बताइए।",
        "namaste": "नमस्ते! मैं ऑरा हूँ। आज आप कैसा महसूस कर रहे हैं?",
        "namaskar": "नमस्कार! मैं सुन रही हूँ, बताइए आज मन में क्या चल रहा है?",
        "shukriya": "आपका बहुत-बहुत स्वागत है! मैं हमेशा आपके साथ हूँ।",
        "dhanyawad": "यह मेरा सौभाग्य है। अपना ख्याल रखिएगा।",
        "haan": "जी, बिल्कुल। आगे बताइए।",
        "nahi": "ठीक है, कोई बात नहीं। हम दूसरी बात कर सकते हैं।",
    }

    # ── Main Turn Handler ─────────────────────────────────────────

    async def process_transcript(self, transcript: TranscriptResult) -> None:
        """Process a final STT transcript through the full AI + TTS pipeline.

        This is the authoritative turn handler. Executes the complete pipeline:
          Cancel Stale Generation → Assign Turn/Gen ID → Fast Path / Engine → Stream → TTS
        """
        if not transcript.text.strip():
            logger.debug("Empty transcript, skipping turn", session_id=self._session_id)
            await self._sm.transition(CommunicationState.LISTENING)
            return

        # 0. Cancel any prior running turn task before starting a new one
        await self.cancel_active_turn()

        # Allocate monotonic turn_id and generation_id for this turn
        turn_id = self._sm.next_turn()
        generation_id = self._sm.next_generation()
        self._interrupt.clear_interrupt()

        logger.info(
            "Starting turn",
            session_id=self._session_id,
            turn_id=turn_id,
            generation_id=generation_id,
            text_preview=transcript.text[:60],
        )

        if self._on_event:
            await self._on_event("turn_started", {
                "turn_id": turn_id,
                "generation_id": generation_id,
                "session_id": self._session_id,
            })

        # ── 1. Start analytics turn ───────────────────────────────
        self._analytics.start_turn(transcript.text)

        # ── 2. Persist user message ───────────────────────────────
        await self._persist_message(
            role=MessageRole.USER.value, content=transcript.text
        )
        self._history.append({"role": "user", "content": transcript.text})
        self._trim_history()

        if self._on_event:
            await self._on_event("final_transcript", {
                "turn_id": turn_id,
                "text": transcript.text,
                "confidence": round(transcript.confidence, 3),
            })

        # A new spoken turn may arrive while the old audio worker is active.
        # Cancellation must follow a legal interruption transition before THINKING.
        if self._sm.state == CommunicationState.SPEAKING:
            await self._sm.transition(CommunicationState.INTERRUPTED)
        await self._sm.transition(CommunicationState.THINKING)
        if self._on_event:
            await self._on_event("thinking", {
                "turn_id": turn_id,
                "generation_id": generation_id,
            })

        # ── 3. Check for Fast Path Voice Command ──────────────────
        normalized_cmd = transcript.text.lower().strip().rstrip(".!?")
        is_fast_cmd = normalized_cmd in {"stop", "wait", "hold on", "ruko", "ruk jao"}
        fast_reply_text = self.FAST_COMMANDS.get(normalized_cmd)

        # ── 4. Emotion Analysis (text + parallel voice emotion + face emotion) ──
        emotion_context = None
        emotion_data: dict[str, Any] | None = None
        if not is_fast_cmd:
            self._analytics.start_stage("emotion_analysis")
            try:
                voice_emotion_data = getattr(transcript, "voice_emotion", None)
                fused = await asyncio.wait_for(self._emotion_service.analyze_and_fuse(
                    text=transcript.text,
                    voice_result=voice_emotion_data,
                    face_result=(self._latest_face_emotion
                                 if time.monotonic() - self._face_received_at < 5.0 else None),
                ), timeout=0.8)
                emotion_context = fused
                emotion_data = fused.to_dict()

                if self._on_event:
                    await self._on_event("emotion", {
                        "turn_id": turn_id,
                        "fused": fused.fused_emotion,
                        "confidence": round(fused.confidence, 4),
                        "text_emotion": fused.text_emotion,
                        "active_modalities": fused.activeSources,
                        "uncertainty": fused.uncertainty,
                        "conflict": fused.conflict,
                        "voice_emotion": voice_emotion_data.get("primary_emotion") if voice_emotion_data else None,
                        "face_emotion": self._latest_face_emotion.get("primary_emotion") if self._latest_face_emotion else None,
                        "sources": getattr(fused, "source_contributions", {}),
                    })
            except Exception as e:
                logger.warning("Emotion analysis failed", error=str(e))
            self._analytics.end_stage("emotion_analysis")

        # ── 5. Run Generation & Streaming ─────────────────────────
        was_prev_interrupted = False
        if len(self._history) >= 2:
            prev_turns = [m for m in self._history[:-1] if m.get("role") == "assistant"]
            if prev_turns and "[interrupted]" in prev_turns[-1].get("content", ""):
                was_prev_interrupted = True

        # Wire up text token → WebSocket callback
        async def on_token(token: str) -> None:
            if self._on_text:
                await self._on_text(token)
            self._interrupt.record_token(token)

        # Wire up sentence chunk → TTS
        async def on_speak(text: str) -> None:
            if self._sm.state != CommunicationState.SPEAKING:
                try:
                    await self._sm.transition(CommunicationState.SPEAKING)
                except ValueError:
                    pass
                if self._on_event:
                    await self._on_event("assistant_speech_start", {
                        "turn_id": turn_id,
                        "generation_id": generation_id,
                    })
            await self._tts.speak(text, turn_id=turn_id, generation_id=generation_id)

        streamer = ResponseStreamer(
            session_id=self._session_id,
            on_text=on_token,
            on_speak=on_speak,
        )

        user_obj = await self._get_user()
        session_obj = await self._get_session()

        try:
            if is_fast_cmd and fast_reply_text:
                # Fast path: instantaneous synthetic stream
                async def _fast_token_stream():
                    for word in fast_reply_text.split(" "):
                        from collections import namedtuple
                        Chunk = namedtuple("Chunk", ["content"])
                        yield Chunk(content=word + " ")
                        await asyncio.sleep(0.01)

                token_stream = _fast_token_stream()
            elif user_obj and session_obj:
                token_stream = await self._conversation_engine.process_turn(
                    db=self._db,
                    user=user_obj,
                    session=session_obj,
                    user_message=transcript.text,
                    emotion_context=emotion_context,
                    recent_history=list(self._history[:-1]),
                    streaming=True,
                    interrupt_event=self._interrupt.get_ai_interrupt_event(),
                )
            else:
                from app.ai.base import AIRequest
                from app.prompts.builder import _is_hindi_turn

                is_hindi = _is_hindi_turn(transcript.text)
                if is_hindi:
                    system_prompt = (
                        "You are Aura, a warm female AI companion for mental wellbeing. "
                        "The user spoke in HINDI or HINGLISH. You MUST reply entirely in natural, fluent HINDI IN DEVANAGARI SCRIPT.\n"
                        "STRICT RULES:\n"
                        "1. Use feminine first-person grammatical agreement (स्त्रीलिंग: 'सकती हूँ', 'करूँगी', 'सुन रही हूँ'). Never use masculine ('सकता हूँ').\n"
                        "2. Use warm, natural conversational Hindustani (neither overly formal nor textbook Hindi). Everyday soothing words (राहत, परेशानी, तनाव, दिल, सुकून).\n"
                        "3. Keep it brief (1 to 3 short sentences) crafted specifically for spoken voice.\n"
                        "4. Respond to the actual request. Ask at most one question, only when helpful."
                    )
                else:
                    system_prompt = (
                        "You are Aura, a warm female AI companion for mental wellbeing. "
                        "Provide concise, natural, spoken conversational responses (1-3 sentences) suitable for real-time live voice. "
                        "Reflect the actual concern. Ask at most one question, only when useful; respect direct requests."
                    )
                system_prompt += (
                    " You are an AI, not a doctor or therapist. Do not diagnose or prescribe. "
                    "Treat emotion estimates as uncertain; the user’s words take priority. "
                    "Listen before advising, ask at most one question, and respect requests to pause. "
                    "For immediate self-harm danger, prioritize safety, encourage contacting local emergency "
                    "services and a trusted nearby person, and do not claim to dispatch help."
                )
                if was_prev_interrupted:
                    system_prompt += (
                        " NOTE: Your previous response was interrupted by the user mid-sentence. "
                        "The user's new message takes priority. Pivot directly to addressing their correction or point."
                    )

                messages_payload = list(self._history)
                req = AIRequest(
                    system_prompt=system_prompt,
                    prompt=transcript.text,
                    messages=messages_payload,
                    stream=True,
                    temperature=0.7,
                )
                token_stream = self._ai_gateway._gateway.stream(req)

            self._metrics.record_first_token()

            full_response, was_interrupted = await streamer.stream(
                token_stream=token_stream,
                interrupt_event=self._interrupt.get_ai_interrupt_event(),
            )
        except Exception as exc:
            logger.error(
                "Conversation generation failed — streaming resilient fallback",
                session_id=self._session_id,
                error=str(exc),
            )
            self._analytics.record_error("pipeline_error")
            from app.prompts.builder import _is_hindi_turn
            if _is_hindi_turn(transcript.text):
                fallback_msg = "मैं आपके साथ हूँ और ध्यान से सुन रही हूँ। कृपया बताइए कि इस समय आप कैसा महसूस कर रहे हैं?"
            else:
                fallback_msg = "I'm right here with you and listening closely. Please tell me a bit more about what you're experiencing."

            async def _fallback_stream():
                for word in fallback_msg.split(" "):
                    from collections import namedtuple
                    Chunk = namedtuple("Chunk", ["content"])
                    yield Chunk(content=word + " ")
                    await asyncio.sleep(0.02)

            full_response, was_interrupted = await streamer.stream(
                token_stream=_fallback_stream(),
                interrupt_event=self._interrupt.get_ai_interrupt_event(),
            )

        if not was_interrupted:
            await self._tts.drain()

        # ── 6. Persist and update history ─────────────────────────
        if full_response:
            content = full_response
            if was_interrupted and self._interrupt.last_partial_response:
                content = f"{full_response} [interrupted]"

            await self._persist_message(
                role=MessageRole.ASSISTANT.value,
                content=content,
                ai_provider="voice_gateway",
            )
            self._history.append({"role": "assistant", "content": content})
            self._trim_history()
            await self._update_session_summary()

        self._metrics.end_turn(interrupted=was_interrupted)

        # ── 7. Record analytics ───────────────────────────────────
        self._analytics.end_turn(
            user_text=transcript.text,
            response_length=len(full_response),
            emotion=emotion_data.get("fused_emotion", "neutral") if emotion_data else "neutral",
            provider="voice_gateway",
            was_interrupted=was_interrupted,
        )

        # ── 8. Transition back to LISTENING ───────────────────────
        if not was_interrupted and self._sm.state == CommunicationState.SPEAKING:
            await self._sm.transition(CommunicationState.LISTENING)
            if self._on_event:
                await self._on_event("assistant_speech_end", {
                    "turn_id": turn_id,
                    "generation_id": generation_id,
                })
                await self._on_event("turn_completed", {
                    "turn_id": turn_id,
                    "session_id": self._session_id,
                    "chars": len(full_response),
                    "interrupted": False,
                })

        logger.info(
            "Turn complete",
            session_id=self._session_id,
            turn_id=turn_id,
            generation_id=generation_id,
            response_chars=len(full_response),
            interrupted=was_interrupted,
        )

    # ── Helpers ───────────────────────────────────────────────────

    async def _get_user(self) -> User | None:
        """Load the user object, cached for session lifetime."""
        if self._cached_user is not None:
            return self._cached_user
        if not self._user_id:
            return None
        result = await self._db.execute(
            select(User).where(User.id == self._user_id)
        )
        self._cached_user = result.scalar_one_or_none()
        return self._cached_user

    async def _get_session(self) -> Session | None:
        """Load the DB session object, cached for session lifetime."""
        if self._cached_session is not None:
            return self._cached_session
        if not self._db_session_id:
            return None
        result = await self._db.execute(
            select(Session).where(Session.id == self._db_session_id)
        )
        self._cached_session = result.scalar_one_or_none()
        return self._cached_session

    async def _persist_message(
        self,
        role: str,
        content: str,
        ai_provider: str | None = None,
    ) -> None:
        """Persist a message to the database (fire-and-forget on failure)."""
        if not self._db_session_id:
            return
        try:
            msg = Message(
                session_id=self._db_session_id,
                user_id=self._user_id or None,
                role=role,
                content=content,
                message_type=MessageType.VOICE.value
                if hasattr(MessageType, "VOICE")
                else MessageType.TEXT.value,
                ai_provider=ai_provider,
            )
            self._db.add(msg)
            await self._db.commit()
        except Exception as exc:
            logger.warning(
                "Message persist failed",
                session_id=self._session_id,
                error=str(exc),
            )

    async def _handle_error(self, code: str, message: str) -> None:
        """Transition to ERROR state and notify client."""
        self._metrics.record_error()
        try:
            await self._sm.force_state(CommunicationState.ERROR)
        except Exception:
            pass
        if self._on_event:
            await self._on_event("error", {"code": code, "message": message})

    def _trim_history(self) -> None:
        """Keep in-memory history within the window limit."""
        if len(self._history) > _HISTORY_WINDOW:
            self._history = self._history[-_HISTORY_WINDOW:]

    async def _update_session_summary(self, force: bool = False) -> None:
        """Persist rolling voice-chat continuity in the shared Session model."""
        if not self._db_session_id or not self._user_id or not self._history:
            return

        turn_count = self._conversation_engine.turn_count
        summarizer = self._conversation_engine.summarizer
        if not force and not summarizer.should_summarize(turn_count):
            return

        session = await self._get_session()
        if not session:
            return

        try:
            await summarizer.summarize_and_store(
                db=self._db,
                session_id=session.id,
                user_id=self._user_id,
                conversation_history=list(self._history),
                turn_count=turn_count,
                existing_summary=session.summary,
                force=force,
            )
        except Exception as exc:
            logger.warning("Voice session summary failed", error=str(exc))

    @property
    def history(self) -> list[dict[str, str]]:
        """Current in-memory conversation history (read-only copy)."""
        return list(self._history)

    @property
    def analytics(self) -> AnalyticsService:
        """Access the analytics service for this session."""
        return self._analytics
