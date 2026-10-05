"""
Emotion Service — orchestrates the full multi-modal emotion pipeline.

Entry point for the Conversation Orchestrator and API routes. Coordinates all analyzers
(RoBERTa text emotion, MediaPipe + FERPlus ONNX face emotion & behavior, SpeechBrain wav2vec2 voice emotion),
delegates fusion to EmotionFusionService, and returns unified EmotionContext for LLM prompt injection and UI telemetry.
"""

from __future__ import annotations

import asyncio
from typing import Any, Dict, List, Optional

from app.core.logging_config import get_logger
from app.emotion.analyzers import TextEmotionAnalyzer
from app.emotion.base import EmotionContext, EmotionResult, POSITIVE_EMOTIONS, NEGATIVE_EMOTIONS
from app.emotion.face_analyzer import FaceEmotionAnalyzer
from app.services.emotion.voice_emotion import VoiceEmotionService

logger = get_logger(__name__)

# Global singletons
_global_text_analyzer: Optional[TextEmotionAnalyzer] = None
_global_face_analyzer: Optional[FaceEmotionAnalyzer] = None
_global_voice_service: Optional[VoiceEmotionService] = None
_global_fusion_service: Any = None


def get_text_analyzer() -> TextEmotionAnalyzer:
    global _global_text_analyzer
    if _global_text_analyzer is None:
        _global_text_analyzer = TextEmotionAnalyzer(use_llm=True)
    return _global_text_analyzer


def get_face_analyzer() -> FaceEmotionAnalyzer:
    global _global_face_analyzer
    if _global_face_analyzer is None:
        _global_face_analyzer = FaceEmotionAnalyzer()
    return _global_face_analyzer


def get_voice_service() -> VoiceEmotionService:
    global _global_voice_service
    if _global_voice_service is None:
        _global_voice_service = VoiceEmotionService.get_instance()
    return _global_voice_service


_global_emotion_service: Optional[EmotionService] = None


def get_emotion_service() -> EmotionService:
    global _global_emotion_service
    if _global_emotion_service is None:
        _global_emotion_service = EmotionService()
    return _global_emotion_service


def get_fusion_service() -> Any:
    global _global_fusion_service
    if _global_fusion_service is None:
        from app.services.emotion.emotion_fusion import EmotionFusionService
        _global_fusion_service = EmotionFusionService.get_instance()
    return _global_fusion_service


def predict_text_emotion(text: str) -> Dict[str, Any]:
    """Synchronous text emotion prediction using the local transformer model."""
    analyzer = get_text_analyzer()
    return analyzer.predict_raw(text)


def predict_face_emotion(image_data: Any, *, client_id: str = "default") -> Dict[str, Any]:
    """Synchronous face emotion prediction using the ONNX model and MediaPipe detector."""
    analyzer = get_face_analyzer()
    import base64
    import cv2
    import numpy as np

    if isinstance(image_data, np.ndarray):
        img_bgr = image_data
    else:
        raw_str = str(image_data or "")
        if "," in raw_str:
            raw_str = raw_str.split(",", 1)[1]
        try:
            decoded = base64.b64decode(raw_str)
            img_bgr = cv2.imdecode(np.frombuffer(decoded, np.uint8), cv2.IMREAD_COLOR)
        except Exception:
            img_bgr = None

    if img_bgr is None:
        return {
            "emotion": "neutral",
            "confidence": 0.0,
            "scores": {"neutral": 1.0},
            "face_box": None,
            "face_detected": False,
        }

    return analyzer.predict_frame(img_bgr, client_id=client_id)


async def predict_audio_emotion_async(audio_payload: Any) -> Dict[str, Any]:
    """Asynchronous voice emotion prediction using SpeechBrain wav2vec2-IEMOCAP."""
    voice_svc = get_voice_service()
    return await voice_svc.analyze(audio_payload)


def verify_models_loaded() -> Dict[str, Any]:
    """Check loading status of text, face, and voice models."""
    text_az = get_text_analyzer()
    face_az = get_face_analyzer()
    voice_svc = get_voice_service()
    return {
        "text_emotion": {"loaded": text_az.is_local_model_loaded(), "device": getattr(text_az, "_device", "cpu")},
        "face_emotion": {"loaded": face_az.is_available, "backend": getattr(face_az, "_backend", "onnx")},
        "voice_emotion": {"loaded": voice_svc.is_loaded, "device": voice_svc.device},
    }


class EmotionService:
    """Orchestrates multi-modal emotion analysis and fusion."""

    def __init__(self, use_llm_text: bool = True) -> None:
        self._text = get_text_analyzer()
        self._face = get_face_analyzer()
        self._voice = get_voice_service()
        self._fusion = get_fusion_service()
        self.trend_buffer: List[Dict[str, Any]] = []

    async def analyze_text(self, text: str) -> EmotionResult:
        """Analyze text emotion only."""
        return await self._text.analyze(text)

    async def analyze_face(self, image_data: Any) -> EmotionResult:
        """Analyze face emotion only."""
        return await self._face.analyze(image_data)

    async def analyze_voice(self, audio_data: Any) -> Dict[str, Any]:
        """Analyze voice emotion only."""
        return await self._voice.analyze(audio_data)

    async def analyze_and_fuse(
        self,
        text: str | None = None,
        image_data: Any = None,
        audio_data: Any = None,
        voice_result: Dict[str, Any] | None = None,
        face_result: Dict[str, Any] | None = None,
    ) -> EmotionContext:
        """Run all available analyzers concurrently and fuse into a single EmotionContext.

        Args:
            text: User text input for text emotion analysis.
            image_data: Camera frame for face emotion analysis.
            audio_data: Raw PCM audio for voice emotion analysis (if not pre-computed).
            voice_result: Pre-computed voice emotion dict (from parallel VAD analysis).
            face_result: Pre-computed face emotion dict (from real-time webcam WebSocket).
        """
        text_res: Optional[Dict[str, Any]] = None
        face_res: Optional[Dict[str, Any]] = face_result
        voice_res: Optional[Dict[str, Any]] = voice_result  # Use pre-computed if available

        tasks = []
        if text and text.strip():
            tasks.append(("text", self._text.analyze(text)))
        if image_data and self._face.is_available and face_res is None:
            tasks.append(("face", self._face.analyze(image_data)))
        # Only run voice analysis if not pre-computed AND audio data provided
        if audio_data and voice_res is None:
            tasks.append(("voice", self._voice.analyze(audio_data)))

        if tasks:
            labels = [t[0] for t in tasks]
            coros = [t[1] for t in tasks]
            results = await asyncio.gather(*coros, return_exceptions=True)

            for label, result in zip(labels, results):
                if isinstance(result, Exception):
                    logger.warning(f"{label} emotion analysis failed", error=str(result))
                    continue
                if label == "text" and isinstance(result, EmotionResult):
                    text_res = {
                        "primary_emotion": result.emotion,
                        "confidence": result.confidence / 100.0 if result.confidence > 1.0 else result.confidence,
                        "scores": result.scores,
                        "sentiment": result.sentiment,
                        "stress_level": result.stress_level,
                        "intent": result.intent,
                    }
                elif label == "face" and isinstance(result, EmotionResult):
                    metadata = result.metadata or {}
                    face_res = {
                        "primary_emotion": result.emotion,
                        "confidence": result.confidence / 100.0 if result.confidence > 1.0 else result.confidence,
                        "scores": result.scores,
                        "face_detected": result.face_detected,
                        "face_box": result.face_box,
                        "tracking_quality": metadata.get("tracking_quality", 0.90),
                        "facial_state": metadata.get("facial_state", {}),
                        "action_units": metadata.get("action_units", {}),
                        "gaze": metadata.get("gaze", {}),
                        "head_pose": metadata.get("head_pose", {}),
                        "transitions": metadata.get("transitions", {}),
                    }
                elif label == "voice" and isinstance(result, dict):
                    voice_res = result

        fused = self._fusion.fuse(
            face_res=face_res,
            text_res=text_res,
            voice_res=voice_res,
            user_message=text or "",
        )

        # Build clean EmotionContext
        primary = fused["primary_emotion"]
        conf = fused["confidence"]
        stress_str = "high" if primary in {"anxious", "fearful", "angry"} else "medium" if primary in {"sad", "disgusted"} else "low"
        stress_num = 0.9 if stress_str == "high" else 0.6 if stress_str == "medium" else 0.2
        sentiment = "positive" if primary in POSITIVE_EMOTIONS else "negative" if primary in NEGATIVE_EMOTIONS else "neutral"
        intent = text_res.get("intent", "casual") if text_res else "casual"

        facial_state_data = face_res.get("facial_state") if face_res else None

        ctx = EmotionContext(
            primaryEmotion=primary,
            confidence=conf,
            stressLevel=stress_num,
            activeSources=fused.get("active_modalities", []),
            conflict=fused.get("conflict_status", False),
            timestamp=fused.get("timestamp"),
            sentiment=sentiment,
            intent=intent,
            stress=stress_str,
            text_emotion=text_res.get("primary_emotion") if text_res else None,
            face_emotion=face_res.get("primary_emotion") if face_res else None,
            voice_emotion=voice_res.get("primary_emotion") if voice_res else None,
            uncertainty=fused.get("uncertainty", 0.1),
            source_contributions=fused.get("source_contributions", {}),
            conflict_detail=fused.get("conflict_detail", ""),
            facial_state=facial_state_data,
        )

        if face_res:
            setattr(ctx, "action_units", face_res.get("action_units") or {})
            setattr(ctx, "gaze", face_res.get("gaze") or {})
            setattr(ctx, "head_pose", face_res.get("head_pose") or {})
            if face_res.get("primary_emotion"):
                ctx.face_emotion = face_res["primary_emotion"]

        self.trend_buffer.append({
            "emotion": primary,
            "confidence": conf,
            "timestamp": ctx.timestamp,
        })
        if len(self.trend_buffer) > 50:
            self.trend_buffer.pop(0)

        return ctx

    def reset(self) -> None:
        self.trend_buffer.clear()

    @property
    def face_available(self) -> bool:
        return self._face.is_available

    def get_status(self) -> Dict[str, Any]:
        """Return operational status of emotion analysis subcomponents."""
        return {
            "text_analyzer": {
                "loaded": self._text.is_local_model_loaded(),
                "device": getattr(self._text, "_device", "cpu"),
            },
            "voice": {
                "loaded": self._voice.is_loaded,
                "device": self._voice.device,
            },
            "face": {
                "loaded": self._face.is_available,
                "backend": getattr(self._face, "_backend", "onnx"),
            },
        }
