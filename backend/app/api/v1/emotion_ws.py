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


def _sanitize_for_json(val: Any) -> Any:
    """Recursively convert numpy types (float32/int64) to native Python types for JSON serialization."""
    if isinstance(val, dict):
        return {k: _sanitize_for_json(v) for k, v in val.items()}
    elif isinstance(val, (list, tuple)):
        return [_sanitize_for_json(v) for v in val]
    elif hasattr(val, "item"):
        return val.item()
    elif isinstance(val, float):
        return round(float(val), 4)
    elif isinstance(val, int):
        return int(val)
    return val


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
                    await websocket.send_json(_sanitize_for_json(last_result))
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
                    metadata = emotion_result.metadata or {}
                    facial_state = metadata.get("facial_state") or {}

                    if not emotion_result.face_detected or emotion_result.is_mock:
                        result = {
                            "type": "no_face",
                            "face_detected": False,
                            "tracking_quality": facial_state.get("tracking_quality", 0.0),
                            "emotion": {
                                "primary": "neutral",
                                "confidence": 0.0,
                                "uncertainty": 1.0,
                            },
                            "action_units": {"presence": {}, "intensity": {}},
                            "gaze": {"gaze_angle_x": 0.0, "gaze_angle_y": 0.0, "eye_contact": False},
                            "head_pose": {"pitch": 0.0, "yaw": 0.0, "roll": 0.0},
                            "quality_breakdown": facial_state.get("quality_breakdown", {}),
                            "latencies": facial_state.get("latencies", {}),
                        }
                    else:
                        conf_dec = round(emotion_result.confidence / 100.0 if emotion_result.confidence > 1.0 else emotion_result.confidence, 3)
                        emo_obj = facial_state.get("emotion") or {
                            "primary": emotion_result.emotion.lower(),
                            "confidence": conf_dec,
                            "uncertainty": round(1.0 - conf_dec, 3),
                        }

                        result = {
                            "type": "emotion",
                            "face_detected": True,
                            "tracking_quality": facial_state.get("tracking_quality", 0.90),
                            "emotion": emo_obj,
                            "primary_emotion": emotion_result.emotion.capitalize(),
                            "confidence": conf_dec,
                            "scores": emotion_result.scores,
                            "secondary_emotion": emotion_result.secondary_emotion,
                            "stress": emotion_result.stress_level,
                            "sentiment": emotion_result.sentiment,
                            "face_box": emotion_result.face_box,
                            "box_norm": emotion_result.box_norm,
                            "action_units": facial_state.get("action_units") or metadata.get("action_units", {}),
                            "gaze": facial_state.get("gaze") or metadata.get("gaze", {}),
                            "head_pose": facial_state.get("head_pose") or metadata.get("head_pose", {}),
                            "facial_movement": facial_state.get("facial_movement", {}),
                            "transitions": facial_state.get("transitions", {}),
                            "quality_breakdown": facial_state.get("quality_breakdown", {}),
                            "latencies": facial_state.get("latencies", {}),
                            "sources": ["face"],
                            "timestamp": facial_state.get("timestamp") or datetime.now(timezone.utc).isoformat(),
                        }

                except asyncio.CancelledError:
                    raise
                except Exception as e:
                    logger.warning("Face emotion processing error", error=str(e))
                    result = {
                        "type": "error",
                        "message": "Frame processing failed",
                        "face_detected": False,
                        "tracking_quality": 0.0,
                    }

            last_result = result
            await websocket.send_json(_sanitize_for_json(result))

    except WebSocketDisconnect:
        logger.info("Face emotion WebSocket disconnected", user_id=user_id)
    except Exception as e:
        logger.error("Face emotion WebSocket error", user_id=user_id, error=str(e))


@router.get("/status")
async def emotion_status() -> dict[str, Any]:
    """Return status of all emotion models."""
    return verify_models_loaded()
