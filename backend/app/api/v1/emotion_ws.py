"""
Face Emotion WebSocket API.

Real-time face emotion endpoint that accepts camera frames and returns
structured emotion JSON with face bounding boxes, emotion scores, and confidence.
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
from app.emotion.service import get_face_analyzer, verify_models_loaded

router = APIRouter(prefix="/emotion", tags=["emotion"])
logger = get_logger(__name__)
settings = get_settings()

_MAX_FPS = 5
_MIN_FRAME_INTERVAL = 1.0 / _MAX_FPS


@router.websocket("/ws")
async def face_emotion_websocket(
    websocket: WebSocket,
    token: str | None = Query(None, description="JWT access token"),
) -> None:
    """Real-time face emotion WebSocket.

    Accepts base64 JPEG frames, returns structured emotion JSON with face bounding box.
    Throttled to max FPS.
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

    face_analyzer = get_face_analyzer()

    # Check model availability
    if not face_analyzer.is_available:
        await websocket.send_json({
            "type": "unavailable",
            "reason": "model_not_loaded",
            "message": "Face emotion model is not loaded.",
        })

    last_process_time = 0.0
    last_result: dict[str, Any] | None = None
    client_id = f"user_{user_id}"

    try:
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type", "frame")

            if msg_type == "ping":
                await websocket.send_json({"type": "pong"})
                continue

            if msg_type != "frame":
                continue

            image_data = data.get("image") or data.get("frame") or data.get("data")
            if not image_data:
                await websocket.send_json({
                    "type": "error",
                    "message": "Missing 'image' or 'frame' field in frame message",
                })
                continue

            # Throttle if received faster than interval
            now = time.monotonic()
            if (now - last_process_time) < _MIN_FRAME_INTERVAL:
                if last_result:
                    await websocket.send_json(last_result)
                continue

            last_process_time = now

            if not face_analyzer.is_available:
                result = {
                    "type": "unavailable",
                    "reason": "model_not_loaded",
                    "face_detected": False,
                }
            else:
                try:
                    payload = {"image": image_data, "client_id": client_id}
                    emotion_result = await face_analyzer.analyze(payload)

                    if emotion_result.is_mock or not emotion_result.scores:
                        result = {
                            "type": "no_face",
                            "face_detected": False,
                        }
                    else:
                        conf_dec = round(emotion_result.confidence / 100.0 if emotion_result.confidence > 1.0 else emotion_result.confidence, 3)
                        result = {
                            "type": "emotion",
                            "face_detected": True,
                            "primary_emotion": emotion_result.emotion.capitalize(),
                            "emotion": emotion_result.emotion.capitalize(),
                            "confidence": conf_dec,
                            "scores": emotion_result.scores,
                            "secondary_emotion": emotion_result.secondary_emotion,
                            "stress": emotion_result.stress_level,
                            "sentiment": emotion_result.sentiment,
                            "face_box": emotion_result.face_box,
                            "box_norm": emotion_result.box_norm,
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
    """Return status of all emotion models."""
    return verify_models_loaded()
