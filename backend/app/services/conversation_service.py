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
from app.emotion.service import EmotionService
from app.models.message import Message, MessageRole, MessageType
from app.models.session import Session, SessionStatus
from app.models.user import User

logger = get_logger(__name__)


class ConversationService:
    """Orchestrates the full conversation pipeline."""

    def __init__(self, db: AsyncSession) -> None:
        self._db = db
        self._emotion = EmotionService()
        self._conversation_engine = ConversationEngine()

    # ── Session Management ────────────────────────────────────────

    async def get_or_create_session(self, user_id: int, session_id: int | None = None) -> Session:
        """Get an existing session or create a new one."""
        if session_id:
            result = await self._db.execute(
                select(Session).where(
                    Session.id == session_id,
                    Session.user_id == user_id,
                    Session.status == SessionStatus.ACTIVE.value,
                )
            )
            session = result.scalar_one_or_none()
            if not session:
                raise SessionNotFoundError(f"Active session {session_id} not found.")
            return session

        session = Session(user_id=user_id, status=SessionStatus.ACTIVE.value)
        self._db.add(session)
        await self._db.commit()
        await self._db.refresh(session)
        logger.info("New session created", session_id=session.id, user_id=user_id)
        return session

    async def list_sessions(self, user_id: int, limit: int = 20) -> list[Session]:
        """List recent sessions for a user."""
        result = await self._db.execute(
            select(Session)
            .where(Session.user_id == user_id)
            .order_by(Session.created_at.desc())
            .limit(limit)
        )
        return list(result.scalars().all())

    async def get_session_messages(self, session_id: int, user_id: int) -> list[Message]:
        """Get all messages for a session."""
        result = await self._db.execute(
            select(Session).where(Session.id == session_id, Session.user_id == user_id)
        )
        if not result.scalar_one_or_none():
            raise SessionNotFoundError(f"Session {session_id} not found.")

        result = await self._db.execute(
            select(Message)
            .where(Message.session_id == session_id)
            .order_by(Message.created_at.asc())
        )
        return list(result.scalars().all())

    async def end_session(self, session_id: int, user_id: int) -> Session:
        """End a session and generate a summary."""
        result = await self._db.execute(
            select(Session).where(Session.id == session_id, Session.user_id == user_id)
        )
        session = result.scalar_one_or_none()
        if not session:
            raise SessionNotFoundError(f"Session {session_id} not found.")

        messages = await self.get_session_messages(session_id, user_id)

        if messages:
            # Generate a brief summary using AI
            convo = "\n".join(
                f"{m.role}: {m.content[:200]}" for m in messages[-10:]
            )
            try:
                # Need to use gateway or base generator, for now just use a simple request via Gateway
                from app.ai.gateway import AIGateway
                from app.ai.base import AIRequest
                gw = AIGateway()
                req = AIRequest(prompt=f"Summarize this conversation in 2-3 sentences:\n\n{convo}", stream=False)
                summary_response = await gw.generate(req)
                session.summary = summary_response.content
            except Exception as exc:
                logger.warning("Session summary generation failed", error=str(exc))

        session.status = SessionStatus.ENDED.value
        session.ended_at = datetime.now(timezone.utc)
        await self._db.commit()
        await self._db.refresh(session)
        return session

    # ── Message Processing ────────────────────────────────────────

    async def _get_user(self, user_id: int) -> User:
        result = await self._db.execute(select(User).where(User.id == user_id))
        return result.scalar_one_or_none()  # type: ignore

    async def _get_conversation_history(self, session_id: int, limit: int = 10) -> list[dict]:
        """Get recent messages formatted for prompt injection."""
        result = await self._db.execute(
            select(Message)
            .where(Message.session_id == session_id)
            .order_by(Message.created_at.desc())
            .limit(limit)
        )
        messages = list(reversed(result.scalars().all()))
        return [{"role": m.role, "content": m.content} for m in messages]

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

    async def process_text_message(
        self,
        user_id: int,
        content: str,
        session_id: int | None = None,
        emotion_payload: dict | None = None,
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

        # 1. Get/create session
        try:
            session = await self.get_or_create_session(user_id, session_id)
        except SessionNotFoundError as exc:
            yield {"type": "error", "error": str(exc), "code": "SESSION_NOT_FOUND"}
            return

        yield {"type": "session_start", "session_id": session.id}

        # 2. Emotion analysis
        fused = await self._emotion.analyze_and_fuse(
            text=content,
            audio_data=emotion_payload.get("audio_data") if emotion_payload else None,
            image_data=emotion_payload.get("image_data") if emotion_payload else None,
        )
        emotion_dict = fused.to_dict()
        yield {"type": "emotion", "data": emotion_dict}

        # 3. Handle Auto-Greet
        is_init = content == "__INIT__"
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
                emotion_data=emotion_dict,
                recent_history=history if is_init else history[:-1], # For INIT, there is no user message in history to exclude
                streaming=True,
                debug_out=debug_out
            )
            
            # Yield debug data if available
            if debug_out:
                yield {"type": "debug", "data": debug_out}
            
            async for chunk in stream_gen:
                if chunk and chunk.content:
                    full_response += chunk.content
                    yield {"type": "chunk", "content": chunk.content}
        except Exception as exc:
            logger.error("AI generation failed", error=str(exc))
            yield {"type": "error", "error": f"AI Error: {str(exc)}", "code": "AI_ERROR"}
            return

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
