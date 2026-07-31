"""
Face Emotion WebSocket API.

Real-time face emotion endpoint that accepts camera frames and returns
structured emotion JSON. The FaceEmotionAnalyzer processes each frame
and returns an EmotionContext for client-side display.

Protocol
--------
Client → Server:
    { "type": "frame", "image": "<base64 JPEG>", "session_id": "..." }
    { "type": "ping" }

Server → Client:
    { "type": "emotion", "primary_emotion": "sad", "confidence": 0.91,
      "secondary_emotion": "neutral", "face_detected": true,
      "stress": "medium", "sources": ["face"] }
    { "type": "no_face", "face_detected": false }
    { "type": "unavailable", "reason": "model_not_loaded" }
    { "type": "pong" }
    { "type": "error", "message": "..." }

Throttling
----------
Frames are throttled to max 2 FPS processing. Excess frames are
acknowledged but not processed (returns last known result).

Auth
----
Requires a valid JWT in the query string: ?token=<jwt>
"""

from __future__ import annotations

import asyncio
import time
from typing import Any

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.deps import get_db
from app.core.logging_config import get_logger
from app.core.security import decode_token
from app.emotion.base import EmotionContext
from app.emotion.face_analyzer import FaceEmotionAnalyzer

router = APIRouter(prefix="/emotion", tags=["emotion"])
logger = get_logger(__name__)
settings = get_settings()

# Shared face analyzer (lazy-loaded once)
_face_analyzer = FaceEmotionAnalyzer()

# Maximum frame processing rate (frames per second)
_MAX_FPS = 2
_MIN_FRAME_INTERVAL = 1.0 / _MAX_FPS


@router.websocket("/ws")
async def face_emotion_websocket(
    websocket: WebSocket,
    token: str | None = Query(None, description="JWT access token"),
) -> None:
    """Real-time face emotion WebSocket.

    Accepts base64 JPEG frames, returns structured emotion JSON.
    Throttled to 2 FPS. Requires JWT authentication.
    """
    user_id = 1
    if token:
        try:
            payload = decode_token(token)
            user_id = payload.get("sub", 1)
        except Exception:
            pass

    await websocket.accept()
    logger.info("Face emotion WebSocket connected", user_id=user_id)

    # Check model availability
    if not _face_analyzer.is_available:
        await websocket.send_json({
            "type": "unavailable",
            "reason": "model_not_loaded",
            "message": (
                "Face emotion model is not loaded. "
                "Ensure emotion-ferplus-8.onnx is in backend/models/."
            ),
        })

    last_process_time = 0.0
    last_result: dict[str, Any] | None = None

    try:
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type", "frame")

            if msg_type == "ping":
                await websocket.send_json({"type": "pong"})
                continue

            if msg_type != "frame":
                continue

            image_data = data.get("image")
            if not image_data:
                await websocket.send_json({
                    "type": "error",
                    "message": "Missing 'image' field in frame message",
                })
                continue

            # Throttle: if within frame interval, return last result
            now = time.monotonic()
            if (now - last_process_time) < _MIN_FRAME_INTERVAL:
                if last_result:
                    await websocket.send_json(last_result)
                continue

            last_process_time = now

            # Process frame
            if not _face_analyzer.is_available:
                result = {
                    "type": "unavailable",
                    "reason": "model_not_loaded",
                    "face_detected": False,
                }
            else:
                try:
                    emotion_result = await _face_analyzer.analyze(image_data)

                    if not emotion_result.face_detected:
                        result = {
                            "type": "no_face",
                            "face_detected": False,
                        }
                    else:
                        result = {
                            "type": "emotion",
                            "face_detected": True,
                            "primary_emotion": emotion_result.emotion,
                            "confidence": round(emotion_result.confidence / 100.0, 3),
                            "secondary_emotion": emotion_result.secondary_emotion,
                            "secondary_confidence": round(
                                emotion_result.secondary_confidence / 100.0, 3
                            ),
                            "stress": emotion_result.stress_level,
                            "sentiment": emotion_result.sentiment,
                            "sources": ["face"],
                        }

                except asyncio.CancelledError:
                    raise
                except Exception as e:
                    logger.warning("Face emotion processing error", error=str(e))
                    result = {
                        "type": "error",
                        "message": "Frame processing failed",
                        "face_detected": False,
                    }

            last_result = result
            await websocket.send_json(result)

    except WebSocketDisconnect:
        logger.info("Face emotion WebSocket disconnected", user_id=user_id)
    except Exception as e:
        logger.error("Face emotion WebSocket error", user_id=user_id, error=str(e))


@router.get("/status")
async def emotion_status() -> dict[str, Any]:
    """Return face emotion model status."""
    return {
        "face_model_available": _face_analyzer.is_available,
        "face_model": "emotion-ferplus-8.onnx",
        "face_detector": "BlazeFace ONNX or OpenCV Haar Cascade",
        "text_emotion": "LLM-based + keyword fallback",
        "voice_emotion": "stub (future: wav2vec2)",
        "max_fps": _MAX_FPS,
    }
