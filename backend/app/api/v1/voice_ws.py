"""
Voice WebSocket API Route.

Exposes the real-time voice communication engine at:
    ws://host/api/v1/ws/voice

Delegates entirely to VoiceWebSocketManager — this module only handles
routing and optional authentication.

Connection example:
    # Unauthenticated (testing):
    ws = new WebSocket("ws://localhost:8000/api/v1/ws/voice")

    # Authenticated (production):
    ws = new WebSocket("ws://localhost:8000/api/v1/ws/voice?token=<jwt>")
"""

from __future__ import annotations

from fastapi import APIRouter, WebSocket

from app.communication.websocket_manager import VoiceWebSocketManager
from app.core.config import get_settings
from app.core.logging_config import get_logger

router = APIRouter(prefix="/ws", tags=["Voice WebSocket"])
logger = get_logger(__name__)
settings = get_settings()


@router.websocket("/voice")
async def voice_websocket(websocket: WebSocket) -> None:
    """Real-time voice conversation over WebSocket.

    Supports:
    - Binary audio frames (16kHz, 16-bit mono PCM)
    - JSON control messages (session_start, interrupt, stop_session, ping)
    - Streaming AI response with parallel TTS audio output
    - Barge-in interruption

    See VoiceWebSocketManager for the full message protocol.
    """
    # Optional JWT authentication (controlled by voice_ws_require_auth setting)
    if settings.voice_ws_require_auth:
        from app.core.deps import get_redis
        from app.core.security import decode_token, is_token_blacklisted
        from app.core.exceptions import TokenExpiredError, TokenInvalidError

        token = websocket.query_params.get("token")
        if not token:
            await websocket.accept()
            import json
            await websocket.send_text(json.dumps({
                "type": "error",
                "code": "AUTH_REQUIRED",
                "message": "Authentication token required",
            }))
            await websocket.close(code=4001)
            return

        try:
            redis = await get_redis()
            if await is_token_blacklisted(redis, token):
                raise ValueError("Token blacklisted")
            payload = decode_token(token)
            if payload.get("type") != "access":
                raise ValueError("Invalid token type")
        except (TokenExpiredError, TokenInvalidError, ValueError) as exc:
            await websocket.accept()
            import json
            await websocket.send_text(json.dumps({
                "type": "error",
                "code": "AUTH_INVALID",
                "message": "Invalid or expired token",
            }))
            await websocket.close(code=4001)
            logger.warning("Voice WS auth failed", error=str(exc))
            return

    manager = VoiceWebSocketManager()
    await manager.handle(websocket)
