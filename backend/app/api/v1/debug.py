"""
Debug API — real-time pipeline debug endpoint.

Provides:
  GET  /api/v1/debug/status      – Current system snapshot
  WS   /api/v1/debug/ws          – Real-time debug event stream

Only active in development/testing environments.
"""

from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.gateway import AIGateway
from app.communication.session_manager import SessionRegistry
from app.core.config import get_settings
from app.core.deps import get_db
from app.core.logging_config import get_logger

router = APIRouter(prefix="/debug", tags=["debug"])
logger = get_logger(__name__)
settings = get_settings()

# Keep a registry of connected debug websockets
_debug_ws_clients: list[WebSocket] = []


def _require_debug_mode() -> None:
    """Block debug endpoints in production."""
    if settings.environment == "production":
        raise HTTPException(
            status_code=403,
            detail="Debug endpoints are disabled in production.",
        )


@router.get("/status")
async def get_debug_status(db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    """Return a comprehensive snapshot of the current pipeline state.

    Includes:
    - Active voice sessions and their state machine states
    - AI gateway provider status and circuit breaker health
    - System metrics summary
    - Environment info
    """
    _require_debug_mode()

    registry = SessionRegistry.get()

    # Gather active session info
    sessions_info = []
    for sid, session in registry._sessions.items():
        sessions_info.append({
            "session_id": sid,
            "user_id": session.user_id,
            "state": session.state.value,
            "created_at": session.created_at.isoformat(),
            "tts_speaking": session.tts.is_speaking,
            "vad_in_speech": session.vad.is_in_speech,
            "metrics": session.metrics.snapshot(),
        })

    # Gather AI gateway status
    gateway = AIGateway()
    gateway_status = {
        "available_providers": gateway.available_providers,
        "current_provider": getattr(gateway, "_last_provider", "unknown"),
    }

    return {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "environment": settings.environment,
        "version": settings.app_version,
        "active_sessions": sessions_info,
        "active_session_count": registry.active_count,
        "gateway": gateway_status,
        "providers_configured": {
            "nvidia_nim": bool(settings.nvidia_nim_api_key),
            "gemini": bool(settings.gemini_api_key),
            "openai": bool(settings.openai_api_key),
            "tts": settings.tts_provider,
            "stt": settings.stt_provider,
        },
    }


@router.get("/sessions/{session_id}")
async def get_session_detail(session_id: str) -> dict[str, Any]:
    """Get detailed debug info for a specific voice session."""
    _require_debug_mode()

    registry = SessionRegistry.get()
    session = registry.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    analytics = None
    if hasattr(session.conversation, "_analytics"):
        analytics = session.conversation.analytics.get_session_snapshot()

    return {
        "session_id": session_id,
        "user_id": session.user_id,
        "state": session.state.value,
        "created_at": session.created_at.isoformat(),
        "tts": session.tts.stats,
        "stt_buffer_bytes": session.stt.buffer_bytes,
        "vad_in_speech": session.vad.is_in_speech,
        "interrupt_stats": session.interrupt.stats,
        "metrics": session.metrics.snapshot(),
        "analytics": analytics,
        "history_length": len(session.conversation.history),
    }


@router.websocket("/ws")
async def debug_websocket(websocket: WebSocket) -> None:
    """WebSocket endpoint for real-time debug event streaming.

    Streams pipeline events, state changes, and metrics.
    Clients can send {command: "ping"} to test connectivity.
    """
    if settings.environment == "production":
        await websocket.close(code=1008)
        return

    await websocket.accept()
    _debug_ws_clients.append(websocket)
    logger.info("Debug WebSocket connected", total_clients=len(_debug_ws_clients))

    try:
        # Send initial status snapshot
        registry = SessionRegistry.get()
        await websocket.send_json({
            "type": "connected",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "active_sessions": registry.active_count,
            "environment": settings.environment,
        })

        # Poll loop — sends periodic heartbeat with session stats
        while True:
            try:
                # Non-blocking receive with short timeout
                data = await asyncio.wait_for(websocket.receive_text(), timeout=2.0)
                msg = json.loads(data)
                if msg.get("command") == "ping":
                    await websocket.send_json({"type": "pong"})
                elif msg.get("command") == "status":
                    sessions = []
                    for sid, s in registry._sessions.items():
                        sessions.append({
                            "session_id": sid,
                            "state": s.state.value,
                            "tts_speaking": s.tts.is_speaking,
                            "vad_in_speech": s.vad.is_in_speech,
                        })
                    await websocket.send_json({
                        "type": "status",
                        "sessions": sessions,
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    })
            except asyncio.TimeoutError:
                # Heartbeat tick
                await websocket.send_json({
                    "type": "heartbeat",
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "active_sessions": registry.active_count,
                })
            except WebSocketDisconnect:
                break
            except Exception as e:
                logger.warning("Debug WS error", error=str(e))
                break

    except WebSocketDisconnect:
        pass
    finally:
        if websocket in _debug_ws_clients:
            _debug_ws_clients.remove(websocket)
        logger.info("Debug WebSocket disconnected", remaining=len(_debug_ws_clients))


async def broadcast_debug_event(event_type: str, data: dict) -> None:
    """Broadcast a pipeline event to all connected debug clients."""
    if not _debug_ws_clients:
        return

    payload = {
        "type": event_type,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        **data,
    }

    dead_clients = []
    for ws in _debug_ws_clients:
        try:
            await ws.send_json(payload)
        except Exception:
            dead_clients.append(ws)

    for ws in dead_clients:
        _debug_ws_clients.remove(ws)
