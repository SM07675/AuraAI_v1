"""WebSocket endpoint for interruption-safe, full-duplex chat.

The receive loop never waits for generation to finish. Each user turn runs in
its own task, so an interrupt or a newer user turn can cancel stale work while
the socket continues receiving audio transcripts and control messages.
"""

from __future__ import annotations

import asyncio
import json
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.core.deps import get_redis
from app.core.exceptions import TokenExpiredError, TokenInvalidError
from app.core.logging_config import get_logger
from app.core.security import decode_token, is_token_blacklisted
from app.db.engine import async_session_factory
from app.services.conversation_service import ConversationService

router = APIRouter(prefix="/ws", tags=["WebSocket"])
logger = get_logger(__name__)


async def _authenticate_ws(websocket: WebSocket) -> int | None:
    """Authenticate a WebSocket connection from its access-token query param."""
    token = websocket.query_params.get("token")
    if not token:
        return None
    try:
        redis = await get_redis()
        if await is_token_blacklisted(redis, token):
            return None
        payload = decode_token(token)
        if payload.get("type") != "access":
            return None
        return int(payload["sub"])
    except (TokenExpiredError, TokenInvalidError, ValueError):
        return None


class _DuplexChatSession:
    """Own one socket's active generation and prevent stale events escaping."""

    def __init__(self, websocket: WebSocket, user_id: int) -> None:
        self.websocket = websocket
        self.user_id = user_id
        self.current_session_id: int | None = None
        self._generation_id = 0
        self._active_task: asyncio.Task[None] | None = None
        self._active_cancel_event: asyncio.Event | None = None
        self._send_lock = asyncio.Lock()

    async def send(self, data: dict[str, Any]) -> None:
        """Serialize control messages which are not tied to one generation."""
        async with self._send_lock:
            await self.websocket.send_text(json.dumps(data))

    async def _send_for_generation(
        self,
        generation_id: int,
        data: dict[str, Any],
    ) -> bool:
        """Send only if this response is still the current response."""
        if generation_id != self._generation_id:
            return False
        payload = {**data, "generation_id": generation_id}
        async with self._send_lock:
            if generation_id != self._generation_id:
                return False
            await self.websocket.send_text(json.dumps(payload))
        return True

    async def interrupt(self, reason: str = "user_barge_in", notify: bool = True) -> None:
        """Invalidate and cancel active work before acknowledging the interrupt."""
        interrupted_generation = self._generation_id
        task = self._active_task
        cancel_event = self._active_cancel_event
        had_active_generation = task is not None and not task.done()

        # Invalidate first. Even a provider that ignores task cancellation can
        # no longer send a stale chunk through _send_for_generation.
        self._generation_id += 1
        self._active_task = None
        self._active_cancel_event = None
        if cancel_event is not None:
            cancel_event.set()

        if notify:
            await self.send(
                {
                    "type": "interrupted",
                    "reason": reason,
                    "generation_id": interrupted_generation,
                    "next_generation_id": self._generation_id,
                }
            )
        if had_active_generation and task is not None:
            task.cancel()
            # Cleanup must not hold up the receive loop. Generation gating above
            # already guarantees that the cancelled task cannot send late data.
            asyncio.create_task(self._drain_cancelled_task(task))

    @staticmethod
    async def _drain_cancelled_task(task: asyncio.Task[None]) -> None:
        await asyncio.gather(task, return_exceptions=True)

    async def start_message(self, msg: dict[str, Any]) -> None:
        """Start a new turn and automatically supersede an unfinished turn."""
        if self._active_task is not None and not self._active_task.done():
            await self.interrupt(reason="superseded_by_new_turn", notify=True)

        self._generation_id += 1
        generation_id = self._generation_id
        cancel_event = asyncio.Event()
        task = asyncio.create_task(
            self._run_generation(msg, generation_id, cancel_event),
            name=f"chat-generation-{generation_id}",
        )
        self._active_cancel_event = cancel_event
        self._active_task = task
        task.add_done_callback(self._clear_finished_task)

    def _clear_finished_task(self, task: asyncio.Task[None]) -> None:
        if self._active_task is task:
            self._active_task = None
            self._active_cancel_event = None

    async def _run_generation(
        self,
        msg: dict[str, Any],
        generation_id: int,
        cancel_event: asyncio.Event,
    ) -> None:
        content = str(msg.get("content", "")).strip()
        session_id = msg.get("session_id") or self.current_session_id
        language = msg.get("language")
        emotion_payload = (
            msg.get("emotion_data")
            or msg.get("emotion_payload")
            or (
                {
                    "face_emotion": msg.get("face_emotion"),
                    "confidence": msg.get("confidence"),
                }
                if msg.get("face_emotion")
                else None
            )
            or (
                {"image": msg.get("image") or msg.get("face_image")}
                if (msg.get("image") or msg.get("face_image"))
                else None
            )
        )

        try:
            async with async_session_factory() as db:
                service = ConversationService(db)
                async for event in service.process_text_message(
                    user_id=self.user_id,
                    content=content,
                    session_id=session_id,
                    emotion_payload=emotion_payload,
                    mode=msg.get("mode"),
                    enable_thinking=msg.get("enable_thinking"),
                    language=language,
                    interrupt_event=cancel_event,
                ):
                    if cancel_event.is_set() or generation_id != self._generation_id:
                        return
                    if event.get("type") == "session_start":
                        self.current_session_id = event.get("session_id")
                    if msg.get("client_turn_id") is not None:
                        event = {**event, "client_turn_id": msg["client_turn_id"]}
                    if not await self._send_for_generation(generation_id, event):
                        return
        except asyncio.CancelledError:
            # A barge-in is a normal control-flow event, not a server error.
            raise
        except Exception as exc:
            logger.error("Message processing error", user_id=self.user_id, error=str(exc))
            if cancel_event.is_set() or generation_id != self._generation_id:
                return
            await self._send_fallback(generation_id, content, language)

    async def _send_fallback(
        self,
        generation_id: int,
        content: str,
        language: str | None,
    ) -> None:
        try:
            from app.ai.base import AIRequest
            from app.ai.gateway import AIGateway

            response = await AIGateway().generate(
                AIRequest(
                    system_prompt=(
                        "You are Dr. Aura, an empathetic AI wellness companion. "
                        "Answer directly and end with exactly one useful follow-up question."
                    ),
                    prompt=content,
                    stream=False,
                    temperature=0.7,
                )
            )
            reply = response.content.strip()
        except Exception:
            is_hindi = isinstance(language, str) and language.lower().startswith("hi")
            reply = (
                "मैं आपकी बात सुन रही हूँ और आपके साथ हूँ। अभी आपके मन में क्या चल रहा है?"
                if is_hindi
                else "I'm listening. Could you tell me a little more about what you need right now?"
            )

        if not await self._send_for_generation(generation_id, {"type": "start"}):
            return
        if not await self._send_for_generation(
            generation_id, {"type": "chunk", "content": reply}
        ):
            return
        await self._send_for_generation(
            generation_id, {"type": "done", "response": reply}
        )


@router.websocket("/chat")
async def websocket_chat(websocket: WebSocket) -> None:
    """Stream chat while independently accepting interrupt and heartbeat events."""
    await websocket.accept()
    user_id = await _authenticate_ws(websocket)
    if not user_id:
        user_id = 1  # Local-development fallback retained for the existing app.

    logger.info("WebSocket connected", user_id=user_id)
    duplex = _DuplexChatSession(websocket, user_id)

    try:
        while True:
            try:
                raw = await asyncio.wait_for(websocket.receive_text(), timeout=60.0)
            except TimeoutError:
                await duplex.send({"type": "ping"})
                continue
            except WebSocketDisconnect:
                break

            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                await duplex.send(
                    {"type": "error", "error": "Invalid JSON", "code": "INVALID_JSON"}
                )
                continue

            msg_type = msg.get("type", "")
            if msg_type in {"ping", "pong"}:
                if msg_type == "ping":
                    await duplex.send({"type": "pong"})
                continue
            if msg_type == "interrupt":
                await duplex.interrupt(reason=str(msg.get("reason") or "user_barge_in"))
                continue
            if msg_type == "message":
                if not str(msg.get("content", "")).strip():
                    await duplex.send(
                        {"type": "error", "error": "Empty message", "code": "EMPTY_MESSAGE"}
                    )
                    continue
                await duplex.start_message(msg)

    except WebSocketDisconnect:
        logger.info("WebSocket disconnected", user_id=user_id)
    except Exception as exc:
        logger.error("WebSocket error", user_id=user_id, error=str(exc))
        try:
            await duplex.send(
                {"type": "error", "error": "Connection error", "code": "SERVER_ERROR"}
            )
        except Exception:
            pass
    finally:
        await duplex.interrupt(reason="connection_closed", notify=False)
        logger.info("WebSocket closed", user_id=user_id)
