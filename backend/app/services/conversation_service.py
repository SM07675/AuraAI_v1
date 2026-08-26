"""
Conversation service — orchestrates the full chat pipeline.

Flow: receive input → emotion analysis → build prompt → AI streaming
      → save messages → update memory → respond to client.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, AsyncIterator

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.conversation_engine import ConversationEngine
from app.core.exceptions import SessionNotFoundError
from app.core.logging_config import get_logger
from app.emotion.base import EmotionResult
from app.emotion.service import EmotionService
from app.models.message import Message, MessageRole, MessageType
from app.models.session import Session, SessionStatus
from app.models.user import User

logger = get_logger(__name__)

_RESPONSE_FALLBACK = (
    "I’m sorry, I wasn’t able to generate a response just now. "
    "Please try again in a moment."
)

_SUPPORTED_RESPONSE_LANGUAGES = {
    "hi": "hi-IN",
    "hi-in": "hi-IN",
    "en": "en",
    "en-in": "en-IN",
    "en-us": "en-US",
}


def normalize_response_language(language: str | None) -> str | None:
    """Normalize a client locale to a safe prompt-language override."""
    if not language:
        return None
    return _SUPPORTED_RESPONSE_LANGUAGES.get(language.strip().lower())


class ConversationService:
    """Orchestrates the full conversation pipeline."""

    def __init__(self, db: AsyncSession) -> None:
        self._db = db
        self._emotion = EmotionService()
        self._conversation_engine = ConversationEngine()

    # ── Session Management ────────────────────────────────────────

    async def get_or_create_session(self, user_id: int, session_id: int | None = None) -> Session:
        """Get an existing session or create a new one."""
        try:
            if session_id:
                result = await self._db.execute(
                    select(Session).where(
                        Session.id == session_id,
                        Session.user_id == user_id,
                        Session.status == SessionStatus.ACTIVE.value,
                    )
                )
                session = result.scalar_one_or_none()
                if session:
                    return session

            session = Session(user_id=user_id, status=SessionStatus.ACTIVE.value)
            self._db.add(session)
            await self._db.commit()
            await self._db.refresh(session)
            logger.info("New session created", session_id=session.id, user_id=user_id)
            return session
        except Exception as exc:
            try:
                await self._db.rollback()
            except Exception:
                pass
            logger.warning("Database offline, using fallback in-memory session", error=str(exc))
            return Session(id=session_id or 1, user_id=user_id, status=SessionStatus.ACTIVE.value)

    async def list_sessions(self, user_id: int, limit: int = 20) -> list[Session]:
        """List recent sessions for a user."""
        try:
            result = await self._db.execute(
                select(Session)
                .where(Session.user_id == user_id)
                .order_by(Session.created_at.desc())
                .limit(limit)
            )
            return list(result.scalars().all())
        except Exception as exc:
            try:
                await self._db.rollback()
            except Exception:
                pass
            logger.warning("Database offline in list_sessions", error=str(exc))
            return []

    async def get_session_messages(self, session_id: int, user_id: int) -> list[Message]:
        """Get all messages for a session."""
        try:
            result = await self._db.execute(
                select(Message)
                .where(Message.session_id == session_id)
                .order_by(Message.created_at.asc())
            )
            return list(result.scalars().all())
        except Exception as exc:
            try:
                await self._db.rollback()
            except Exception:
                pass
            logger.warning("Database offline in get_session_messages", error=str(exc))
            return []

    async def end_session(self, session_id: int, user_id: int) -> Session:
        """End a session and generate a summary."""
        try:
            result = await self._db.execute(
                select(Session).where(Session.id == session_id, Session.user_id == user_id)
            )
            session = result.scalar_one_or_none()
            if not session:
                session = Session(id=session_id, user_id=user_id, status=SessionStatus.ENDED.value)
                return session

            session.status = SessionStatus.ENDED.value
            session.ended_at = datetime.now(timezone.utc)
            await self._db.commit()
            await self._db.refresh(session)
            return session
        except Exception as exc:
            try:
                await self._db.rollback()
            except Exception:
                pass
            logger.warning("Database offline in end_session", error=str(exc))
            return Session(id=session_id, user_id=user_id, status=SessionStatus.ENDED.value)

    # ── Message Processing ────────────────────────────────────────

    async def _get_user(self, user_id: int) -> User:
        try:
            result = await self._db.execute(select(User).where(User.id == user_id))
            user = result.scalar_one_or_none()
            if not user:
                user = User(
                    id=user_id,
                    email=f"guest_{user_id}@aura.ai",
                    name="athavpalekar",
                    password_hash="guest_dev_password_hash",
                )
                self._db.add(user)
                await self._db.commit()
                await self._db.refresh(user)
            return user
        except Exception as exc:
            try:
                await self._db.rollback()
            except Exception:
                pass
            logger.warning("Database offline, using fallback in-memory user", error=str(exc))
            return User(
                id=user_id,
                email="athavpalekar@aura.ai",
                name="athavpalekar",
                preferred_language="en",
                communication_style="balanced",
            )

    async def _get_conversation_history(self, session_id: int, limit: int = 10) -> list[dict]:
        """Get recent messages formatted for prompt injection."""
        try:
            result = await self._db.execute(
                select(Message)
                .where(Message.session_id == session_id)
                .order_by(Message.created_at.desc())
                .limit(limit)
            )
            messages = list(reversed(result.scalars().all()))
            return [{"role": m.role, "content": m.content} for m in messages]
        except Exception as exc:
            try:
                await self._db.rollback()
            except Exception:
                pass
            logger.warning("Database offline in _get_conversation_history", error=str(exc))
            return []

    async def _save_message(
        self,
        session_id: int,
        user_id: int,
        role: str,
        content: str,
        emotion_data: dict | None = None,
        ai_provider: str | None = None,
        message_type: str = MessageType.TEXT.value,
    ) -> Message:
        """Persist a message to the database."""
        try:
            msg = Message(
                session_id=session_id,
                user_id=user_id,
                role=role,
                content=content,
                message_type=message_type,
                emotion_data=emotion_data,
                ai_provider=ai_provider,
            )
            self._db.add(msg)
            await self._db.commit()
            await self._db.refresh(msg)
            return msg
        except Exception as exc:
            try:
                await self._db.rollback()
            except Exception:
                pass
            logger.warning("Database offline in _save_message", error=str(exc))
            return Message(
                session_id=session_id,
                user_id=user_id,
                role=role,
                content=content,
            )

    async def process_text_message(
        self,
        user_id: int,
        content: str,
        session_id: int | None = None,
        emotion_payload: dict | None = None,
        mode: str | None = None,
        enable_thinking: bool | None = None,
        language: str | None = None,
    ) -> AsyncIterator[dict[str, Any]]:
        """Process a text message and yield streaming SSE events.

        Event types:
        - session_start: New session created (includes session_id)
        - emotion: Emotion analysis result
        - start: AI generation starting
        - chunk: Incremental AI text
        - done: Full response + metadata
        - error: Error occurred
        """
        user = await self._get_user(user_id)
        if not user:
            yield {"type": "error", "error": "User not found", "code": "USER_NOT_FOUND"}
            return

        user_name = user.name.split()[0] if user.name else "there"
        response_language = normalize_response_language(language)

        # 1. Get/create session
        try:
            session = await self.get_or_create_session(user_id, session_id)
        except SessionNotFoundError as exc:
            yield {"type": "error", "error": str(exc), "code": "SESSION_NOT_FOUND"}
            return

        yield {"type": "session_start", "session_id": session.id}

        # 2. Emotion analysis
        is_init = content == "__INIT__"
        image_data = None
        audio_data = None
        if emotion_payload:
            image_data = (
                emotion_payload.get("image_data")
                or emotion_payload.get("image")
                or emotion_payload.get("face_image")
                or emotion_payload.get("frame")
            )
            audio_data = emotion_payload.get("audio_data") or emotion_payload.get("audio")

            # If client passed direct face emotion
            client_face_emo = emotion_payload.get("face_emotion") or emotion_payload.get("primary_emotion")
            if client_face_emo and not image_data:
                conf = float(emotion_payload.get("confidence") or 80.0)
                conf = conf if conf > 1.0 else conf * 100.0
                self._emotion._fusion.update_reading(
                    "face",
                    EmotionResult(
                        emotion=str(client_face_emo).lower(),
                        confidence=conf,
                        scores={str(client_face_emo).lower(): conf / 100.0},
                        modality="face",
                    ),
                )

        fused = await self._emotion.analyze_and_fuse(
            text=content if not is_init else "",
            audio_data=audio_data,
            image_data=image_data,
        )
        emotion_dict = {
            "fused_emotion": fused.primary_emotion,
            "confidence": round(fused.confidence * 100 if fused.confidence <= 1.0 else fused.confidence, 1),
            "text_emotion": fused.text_emotion,
            "voice_emotion": fused.voice_emotion,
            "face_emotion": fused.face_emotion,
            "sentiment": fused.sentiment,
            "conflict": fused.conflict,
        }
        yield {"type": "emotion", "data": emotion_dict}

        # 3. Handle Auto-Greet
        if is_init:
            content = "[SYSTEM DIRECTIVE: This is a brand new session. Greet the user warmly, introduce yourself as Aura (an AI wellness companion), and ask for their name. Keep it brief. Do not act like the user said this.]"
        else:
            # Save user message
            await self._save_message(
                session_id=session.id,
                user_id=user_id,
                role=MessageRole.USER.value,
                content=content,
                emotion_data=emotion_dict,
            )

        # 4. Stream AI response via ConversationEngine
        yield {"type": "start", "provider": "conversation_engine"}

        history = await self._get_conversation_history(session.id, limit=8)
        
        full_response = ""
        provider_used = "ai_gateway"
        debug_out = {}
        try:
            stream_gen = await self._conversation_engine.process_turn(
                db=self._db,
                user=user,
                session=session,
                user_message=content,
                emotion_context=fused,
                recent_history=history if is_init else history[:-1], # For INIT, there is no user message in history to exclude
                streaming=True,
                debug_out=debug_out,
                mode=mode,
                enable_thinking=enable_thinking,
                preferred_language=response_language,
            )
            
            # Yield debug data if available
            if debug_out:
                yield {"type": "debug", "data": debug_out}
                
                # Emit crisis event if flagged by safety layer
                if debug_out.get("is_crisis"):
                    yield {"type": "crisis", "metadata": {"crisis": True}}
            
            async for chunk in stream_gen:
                if chunk and chunk.content:
                    full_response += chunk.content
                    yield {"type": "chunk", "content": chunk.content}
        except Exception as exc:
            logger.error("AI generation failed", error=str(exc))
            yield {"type": "error", "error": f"AI Error: {str(exc)}", "code": "AI_ERROR"}
            return

        # Providers may terminate a successful stream without text.  Never
        # persist or send an empty assistant turn: keep the conversation usable
        # and make the fallback visible to every SSE client.
        if not full_response.strip():
            logger.warning("AI stream completed without response text", session_id=session.id)
            full_response = _RESPONSE_FALLBACK
            yield {"type": "chunk", "content": full_response}

        # 6. Save assistant response
        await self._save_message(
            session_id=session.id,
            user_id=user_id,
            role=MessageRole.ASSISTANT.value,
            content=full_response,
            ai_provider=provider_used,
        )

        # 7. Done
        yield {
            "type": "done",
            "response": full_response,
            "provider": provider_used,
            "session_id": session.id,
            "emotion": emotion_dict,
        }
