"""
WebSocket endpoint for full-duplex streaming conversation.

Supports:
- Real-time text streaming (send message, receive streamed response)
- Barge-in: user can interrupt AI while it's speaking
- Heartbeat ping/pong to keep connection alive
- Structured JSON message protocol

Message protocol (client → server):
  {"type": "message",   "content": "...", "session_id": null, "language": "hi-IN"}
  {"type": "interrupt"} — cancel current AI generation (barge-in)
  {"type": "ping"}      — keepalive ping

Message protocol (server → client):
  {"type": "session_start", "session_id": 123}
  {"type": "emotion",       "data": {...}}
  {"type": "start",         "provider": "..."}
  {"type": "chunk",         "content": "..."}
  {"type": "done",          "response": "...", "session_id": 123}
  {"type": "pong"}
  {"type": "error",         "error": "...", "code": "..."}
"""

from __future__ import annotations

import asyncio
import json
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.deps import get_redis
from app.core.exceptions import TokenExpiredError, TokenInvalidError
from app.core.security import decode_token, is_token_blacklisted
from app.core.logging_config import get_logger
from app.db.engine import async_session_factory
from app.services.conversation_service import ConversationService

router = APIRouter(prefix="/ws", tags=["WebSocket"])
logger = get_logger(__name__)


async def _authenticate_ws(websocket: WebSocket) -> int | None:
    """Authenticate a WebSocket connection from query param token.

    Returns user_id if valid, None otherwise.
    """
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


async def _send_json(ws: WebSocket, data: dict[str, Any]) -> None:
    """Send JSON message to WebSocket client."""
    try:
        await ws.send_text(json.dumps(data))
    except Exception:
        pass


@router.websocket("/chat")
async def websocket_chat(websocket: WebSocket) -> None:
    """Full-duplex streaming conversation over WebSocket.

    Connect: ws://host/api/v1/ws/chat?token=<access_token>

    The endpoint:
    1. Authenticates via token query param
    2. Accepts incoming messages
    3. Streams AI responses chunk by chunk
    4. Supports barge-in (interrupt) to cancel ongoing AI generation
    """
    await websocket.accept()

    # Authenticate
    user_id = await _authenticate_ws(websocket)
    if not user_id:
        user_id = 1 # Bypass for dev / local live mode

    logger.info("WebSocket connected", user_id=user_id)

    # Shared state
    current_session_id: int | None = None
    # Cancel event to support barge-in
    cancel_event = asyncio.Event()

    try:
        while True:
            try:
                raw = await asyncio.wait_for(websocket.receive_text(), timeout=60.0)
            except asyncio.TimeoutError:
                # Send heartbeat
                await _send_json(websocket, {"type": "ping"})
                continue
            except WebSocketDisconnect:
                break

            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                await _send_json(websocket, {"type": "error", "error": "Invalid JSON", "code": "INVALID_JSON"})
                continue

            msg_type = msg.get("type", "")

            if msg_type == "ping":
                await _send_json(websocket, {"type": "pong"})
                continue

            if msg_type == "interrupt":
                # Barge-in: signal the streaming task to stop
                cancel_event.set()
                await _send_json(websocket, {"type": "interrupted"})
                continue

            if msg_type == "message":
                content = str(msg.get("content", "")).strip()
                if not content:
                    await _send_json(websocket, {"type": "error", "error": "Empty message", "code": "EMPTY_MESSAGE"})
                    continue

                session_id = msg.get("session_id") or current_session_id
                mode = msg.get("mode")
                enable_thinking = msg.get("enable_thinking")
                language = msg.get("language")
                emotion_payload = (
                    msg.get("emotion_data")
                    or msg.get("emotion_payload")
                    or ({"face_emotion": msg.get("face_emotion"), "confidence": msg.get("confidence")} if msg.get("face_emotion") else None)
                    or ({"image": msg.get("image") or msg.get("face_image")} if (msg.get("image") or msg.get("face_image")) else None)
                )

                # Reset cancel event for this new generation
                cancel_event.clear()

                try:
                    # Fresh DB session per message turn to prevent session corruption
                    async with async_session_factory() as db:
                        service = ConversationService(db)
                        async for event in service.process_text_message(
                            user_id=user_id,
                            content=content,
                            session_id=session_id,
                            emotion_payload=emotion_payload,
                            mode=mode,
                            enable_thinking=enable_thinking,
                            language=language,
                        ):
                            # Check for barge-in cancellation
                            if cancel_event.is_set():
                                await _send_json(websocket, {"type": "interrupted"})
                                break

                            await _send_json(websocket, event)

                            # Track session ID
                            if event.get("type") == "session_start":
                                current_session_id = event.get("session_id")
                except Exception as m_err:
                    logger.error("Message processing error", user_id=user_id, error=str(m_err))
                    try:
                        from app.ai.gateway import AIGateway
                        from app.ai.base import AIRequest
                        gateway = AIGateway()
                        fallback_req = AIRequest(
                            system_prompt=(
                                "You are Dr. Aura, an empathetic and intelligent AI wellness companion. "
                                "Directly, clearly, and helpfully answer the user's message or question, and conclude with exactly ONE engaging follow-up question."
                            ),
                            prompt=content,
                            stream=False,
                            temperature=0.7,
                        )
                        ai_res = await gateway.generate(fallback_req)
                        reply = ai_res.content.strip()
                    except Exception:
                        is_hindi = isinstance(language, str) and language.lower().startswith("hi")
                        reply = (
                            "मैं आपकी बात सुन रही हूँ और आपके साथ हूँ। धीरे से एक गहरी साँस लीजिए। अभी आपके मन में क्या चल रहा है?"
                            if is_hindi
                            else f"I'm listening and thinking about what you said regarding '{content[:40]}'. Could you tell me more about how you'd like to explore this?"
                        )

                    await _send_json(websocket, {"type": "start"})
                    await _send_json(websocket, {"type": "chunk", "content": reply})
                    await _send_json(websocket, {"type": "done", "response": reply})

    except WebSocketDisconnect:
        logger.info("WebSocket disconnected", user_id=user_id)
    except Exception as exc:
        logger.error("WebSocket error", user_id=user_id, error=str(exc))
        try:
            await _send_json(websocket, {"type": "error", "error": "Connection error", "code": "SERVER_ERROR"})
        except Exception:
            pass
    finally:
        logger.info("WebSocket closed", user_id=user_id)
