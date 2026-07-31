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
from datetime import datetime, timezone
from typing import Any, Callable, Awaitable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.base import AIRequest
from app.ai.conversation_engine import ConversationEngine
from app.communication.ai_gateway import CommunicationAIGateway
from app.communication.interrupt_manager import InterruptManager
from app.communication.metrics import CommunicationMetrics
from app.communication.speech_to_text import TranscriptResult, STTEngine
from app.communication.streaming import ResponseStreamer
from app.communication.text_to_speech import TTSEngine
from app.communication.state_machine import CommunicationState, StateMachine
from app.core.logging_config import get_logger
from app.emotion.service import EmotionService
from app.models.message import Message, MessageRole, MessageType
from app.models.session import Session, SessionStatus
from app.models.user import User
from app.services.analytics_service import AnalyticsService

logger = get_logger(__name__)

# How many turns to keep in in-memory history
_HISTORY_WINDOW = 12

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

        # Callbacks (set after construction)
        self._on_text: TextCallback | None = None
        self._on_audio: AudioCallback | None = None
        self._on_event: EventCallback | None = None

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
            result = await self._db.execute(
                select(Session).where(Session.id == self._db_session_id)
            )
            db_session = result.scalar_one_or_none()
            if db_session:
                db_session.status = SessionStatus.ENDED.value
                db_session.ended_at = datetime.now(timezone.utc)
                await self._db.commit()

    # ── Main Turn Handler ─────────────────────────────────────────

    async def process_transcript(self, transcript: TranscriptResult) -> None:
        """Process a final STT transcript through the full AI + TTS pipeline.

        This is the main turn handler. Called once per speech_ended event.
        Executes the complete pipeline:
          Emotion → Context → Question → Prompt → AI → Validate → TTS

        Args:
            transcript: Final STT result for the current utterance.
        """
        if not transcript.text.strip():
            logger.debug("Empty transcript, skipping turn", session_id=self._session_id)
            await self._sm.transition(CommunicationState.LISTENING)
            return

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
                "text": transcript.text,
                "confidence": round(transcript.confidence, 3),
            })

        # ── 3. Emotion Analysis on transcript text ────────────────
        self._analytics.start_stage("emotion_analysis")
        emotion_context = None
        emotion_data: dict[str, Any] | None = None
        try:
            fused = await self._emotion_service.analyze_and_fuse(text=transcript.text)
            emotion_context = fused
            emotion_data = fused.to_dict()

            if self._on_event:
                await self._on_event("emotion", {
                    "fused": fused.fused_emotion,
                    "confidence": round(fused.confidence, 1),
                })
        except Exception as e:
            logger.warning("Emotion analysis failed", error=str(e))
        self._analytics.end_stage("emotion_analysis")

        # ── 4. Run Conversation Engine ────────────────────────────
        await self._sm.transition(CommunicationState.GENERATING)
        if self._on_event:
            await self._on_event("generating", {})

        # Fetch user and session objects
        user_obj = await self._get_user()
        session_obj = await self._get_session()

        if not user_obj or not session_obj:
            # Unauthenticated mode — create minimal objects or skip
            if not user_obj:
                logger.debug("No user object — skipping full pipeline")

        # Reset interrupt state for this turn
        self._interrupt.clear_interrupt()

        # Wire up text token → WebSocket callback
        async def on_token(token: str) -> None:
            if self._on_text:
                await self._on_text(token)
            self._interrupt.record_token(token)

        # Wire up sentence chunk → TTS
        async def on_speak(text: str) -> None:
            await self._tts.speak(text)

        streamer = ResponseStreamer(
            session_id=self._session_id,
            on_text=on_token,
            on_speak=on_speak,
        )

        try:
            if user_obj and session_obj:
                # Full pipeline via Conversation Engine
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
                # Fallback: direct AI gateway (unauthenticated mode)
                from app.ai.base import AIRequest
                req = AIRequest(
                    system_prompt="You are Aura, a friendly AI assistant.",
                    prompt=transcript.text,
                    messages=[{"role": "user", "content": transcript.text}],
                    stream=True,
                    temperature=0.7,
                )
                token_stream = self._ai_gateway._gateway.stream(req)

            await self._sm.transition(CommunicationState.SPEAKING)
            if self._on_event:
                await self._on_event("speaking", {})
            self._metrics.record_first_token()

            full_response, was_interrupted = await streamer.stream(
                token_stream=token_stream,
                interrupt_event=self._interrupt.get_ai_interrupt_event(),
            )
        except Exception as exc:
            logger.error(
                "Conversation Engine failed",
                session_id=self._session_id,
                error=str(exc),
            )
            self._analytics.record_error("pipeline_error")
            await self._handle_error("PROVIDER_ERROR", "Provider Error")
            return

        # ── 5. Persist and update history ─────────────────────────
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

        self._metrics.end_turn(interrupted=was_interrupted)

        # ── 6. Record analytics ───────────────────────────────────
        self._analytics.end_turn(
            user_text=transcript.text,
            response_length=len(full_response),
            emotion=emotion_data.get("fused_emotion", "neutral") if emotion_data else "neutral",
            provider="voice_gateway",
            was_interrupted=was_interrupted,
        )

        # ── 7. Transition back to LISTENING ───────────────────────
        if not was_interrupted and self._sm.state == CommunicationState.SPEAKING:
            await self._sm.transition(CommunicationState.LISTENING)
            if self._on_event:
                await self._on_event("completed", {
                    "chars": len(full_response),
                    "interrupted": was_interrupted,
                })

        logger.info(
            "Turn complete",
            session_id=self._session_id,
            response_chars=len(full_response),
            interrupted=was_interrupted,
        )

    # ── Helpers ───────────────────────────────────────────────────

    async def _get_user(self) -> User | None:
        """Load the user object for the current session."""
        if not self._user_id:
            return None
        result = await self._db.execute(
            select(User).where(User.id == self._user_id)
        )
        return result.scalar_one_or_none()

    async def _get_session(self) -> Session | None:
        """Load the DB session object."""
        if not self._db_session_id:
            return None
        result = await self._db.execute(
            select(Session).where(Session.id == self._db_session_id)
        )
        return result.scalar_one_or_none()

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

    @property
    def history(self) -> list[dict[str, str]]:
        """Current in-memory conversation history (read-only copy)."""
        return list(self._history)

    @property
    def analytics(self) -> AnalyticsService:
        """Access the analytics service for this session."""
        return self._analytics
