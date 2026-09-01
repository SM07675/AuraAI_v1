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
from app.db.engine import async_session_factory
from app.emotion.base import EmotionContext
from app.emotion.service import get_face_analyzer, verify_models_loaded
from app.models.emotion_log import EmotionLog

router = APIRouter(prefix="/emotion", tags=["emotion"])
logger = get_logger(__name__)
settings = get_settings()

_MAX_FPS = 5
_MIN_FRAME_INTERVAL = 1.0 / _MAX_FPS
_FLUSH_INTERVAL = 25.0  # seconds between database EmotionLog flushes


async def _flush_emotion_buffer(
    buffer: list[dict[str, Any]],
    user_id: int,
    session_id: int | None = None,
) -> None:
    """Aggregate collected facial emotion samples and persist an EmotionLog row."""
    if not buffer:
        return
    try:
        class_totals: dict[str, float] = {}
        total_conf = 0.0
        emotion_counts: dict[str, int] = {}

        for item in buffer:
            sc = item.get("scores", {})
            for k, v in sc.items():
                class_totals[k] = class_totals.get(k, 0.0) + float(v)
            total_conf += item.get("confidence", 0.8)
            dom = str(item.get("emotion", "neutral")).lower()
            emotion_counts[dom] = emotion_counts.get(dom, 0) + 1

        n = len(buffer)
        avg_scores = {k: round(v / n, 4) for k, v in class_totals.items()}
        avg_conf = round(total_conf / n, 4)
        dominant_emotion = max(emotion_counts, key=emotion_counts.get) if emotion_counts else "neutral"

        async with async_session_factory() as db:
            log_entry = EmotionLog(
                user_id=user_id,
                session_id=session_id,
                face_emotion=dominant_emotion,
                fused_emotion=dominant_emotion,
                confidence=avg_conf,
                raw_scores={
                    "face": avg_scores,
                    "modality": "face",
                    "sample_count": n,
                    "window_sec": _FLUSH_INTERVAL,
                },
            )
            db.add(log_entry)
            await db.commit()
            logger.info(
                "Persisted aggregated EmotionLog from face stream",
                user_id=user_id,
                dominant=dominant_emotion,
                samples=n,
            )
    except Exception as ex:
        logger.warning("Failed to persist aggregated EmotionLog", user_id=user_id, error=str(ex))


@router.websocket("/ws")
async def face_emotion_websocket(
    websocket: WebSocket,
    token: str | None = Query(None, description="JWT access token"),
    session_id: int | None = Query(None, description="Active session ID"),
) -> None:
    """Real-time face emotion WebSocket.

    Accepts base64 JPEG frames, returns structured emotion JSON with face bounding box,
    and aggregates emotional readings every 25 seconds into persistent EmotionLog records.
    """
    user_id = 1
    if token:
        try:
            payload = decode_token(token)
            user_id = int(payload.get("sub", 1))
        except Exception:
            pass

    await websocket.accept()
    logger.info("Face emotion WebSocket connected", user_id=user_id, session_id=session_id)

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
    last_db_flush_time = time.monotonic()
    emotion_buffer: list[dict[str, Any]] = []
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
                        conf_dec = round(
                            emotion_result.confidence / 100.0
                            if emotion_result.confidence > 1.0
                            else emotion_result.confidence,
                            3,
                        )
                        primary = emotion_result.emotion.capitalize()
                        secondary = (
                            emotion_result.secondary_emotion.capitalize()
                            if emotion_result.secondary_emotion
                            else None
                        )
                        sec_conf = (
                            round(
                                emotion_result.secondary_confidence / 100.0
                                if emotion_result.secondary_confidence > 1.0
                                else emotion_result.secondary_confidence,
                                3,
                            )
                            if emotion_result.secondary_confidence
                            else 0.0
                        )

                        result = {
                            "type": "emotion",
                            "face_detected": True,
                            "primary_emotion": primary,
                            "emotion": primary,
                            "confidence": conf_dec,
                            "secondary_emotion": secondary,
                            "secondary_confidence": sec_conf,
                            "scores": emotion_result.scores,
                            "stress": emotion_result.stress_level,
                            "sentiment": emotion_result.sentiment,
                            "face_box": emotion_result.face_box,
                            "box_norm": emotion_result.box_norm,
                            "sources": ["face"],
                        }

                        # Buffer reading for periodic DB persistence
                        emotion_buffer.append({
                            "emotion": emotion_result.emotion.lower(),
                            "scores": emotion_result.scores,
                            "confidence": conf_dec,
                            "stress": emotion_result.stress_level,
                            "sentiment": emotion_result.sentiment,
                        })

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

            # Periodic persistence to PostgreSQL (every ~25 seconds)
            if (now - last_db_flush_time) >= _FLUSH_INTERVAL and emotion_buffer:
                buf_copy = list(emotion_buffer)
                emotion_buffer.clear()
                last_db_flush_time = now
                asyncio.create_task(_flush_emotion_buffer(buf_copy, user_id, session_id))

    except WebSocketDisconnect:
        logger.info("Face emotion WebSocket disconnected", user_id=user_id)
        if emotion_buffer:
            asyncio.create_task(_flush_emotion_buffer(emotion_buffer, user_id, session_id))
    except Exception as e:
        logger.error("Face emotion WebSocket error", user_id=user_id, error=str(e))
        if emotion_buffer:
            asyncio.create_task(_flush_emotion_buffer(emotion_buffer, user_id, session_id))


@router.get("/status")
async def emotion_status() -> dict[str, Any]:
    """Return status of all emotion models."""
    return verify_models_loaded()
