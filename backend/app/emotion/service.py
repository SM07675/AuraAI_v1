"""
Emotion Service — orchestrates the full multi-modal emotion pipeline.

Entry point for the Conversation Engine and API routes. Coordinates all analyzers,
delegates fusion to EmotionFusionEngine, and returns unified EmotionContext
for LLM prompt injection and client feedback.
"""

from __future__ import annotations

import asyncio
from typing import Any, Dict, List, Optional

from app.emotion.analyzers import TextEmotionAnalyzer, VoiceEmotionAnalyzer
from app.emotion.base import EmotionContext, EmotionResult
from app.emotion.face_analyzer import FaceEmotionAnalyzer
from app.emotion.fusion import EmotionFusionEngine, fuse_emotions, DEFAULT_WEIGHTS
from app.core.logging_config import get_logger

logger = get_logger(__name__)

# Global instances for standalone function calls
_global_text_analyzer: Optional[TextEmotionAnalyzer] = None
_global_face_analyzer: Optional[FaceEmotionAnalyzer] = None
_global_voice_analyzer: Optional[VoiceEmotionAnalyzer] = None


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


def get_voice_analyzer() -> VoiceEmotionAnalyzer:
    global _global_voice_analyzer
    if _global_voice_analyzer is None:
        _global_voice_analyzer = VoiceEmotionAnalyzer()
    return _global_voice_analyzer


def predict_text_emotion(text: str) -> Dict[str, Any]:
    """Synchronous text emotion prediction using the local transformer model."""
    analyzer = get_text_analyzer()
    return analyzer.predict_raw(text)


def predict_face_emotion(image_data: Any, *, client_id: str = "default") -> Dict[str, Any]:
    """Synchronous face emotion prediction using the ONNX model and cascade detector."""
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


def predict_audio_emotion(payload: Any) -> Dict[str, Any]:
    """Voice emotion prediction stub."""
    return {
        "emotion": "neutral",
        "confidence": 50.0,
        "scores": {"neutral": 100.0},
        "model": "voice_stub",
    }


def verify_models_loaded() -> Dict[str, Any]:
    """Check loading status of text, face, and voice models."""
    text_az = get_text_analyzer()
    face_az = get_face_analyzer()
    return {
        "text_emotion": {"loaded": text_az.is_local_model_loaded(), "error": None},
        "face_emotion": {"loaded": face_az.is_available, "error": None},
        "voice_emotion": {"loaded": True, "error": None},
    }


class EmotionService:
    """Orchestrates multi-modal emotion analysis and fusion.

    Args:
        use_llm_text: If True, TextEmotionAnalyzer uses LLM first if local model is unavailable,
                      falls back to keywords. If False, keywords only.
    """

    def __init__(self, use_llm_text: bool = True) -> None:
        self._text = get_text_analyzer()
        self._voice = get_voice_analyzer()
        self._face = get_face_analyzer()
        self._fusion = EmotionFusionEngine()

    # ── Single-modality shortcuts ─────────────────────────────────────────────

    async def analyze_text(self, text: str) -> EmotionResult:
        """Analyze text emotion only (no fusion)."""
        return await self._text.analyze(text)

    async def analyze_face(self, image_data: Any) -> EmotionResult:
        """Analyze face emotion only (no fusion)."""
        return await self._face.analyze(image_data)

    async def analyze_voice(self, audio_data: Any) -> EmotionResult:
        """Analyze voice emotion only (no fusion)."""
        return await self._voice.analyze(audio_data)

    # ── Full pipeline ─────────────────────────────────────────────────────────

    async def analyze_and_fuse(
        self,
        text: str | None = None,
        image_data: Any = None,
        audio_data: Any = None,
    ) -> EmotionContext:
        """Run all available analyzers and fuse into a single EmotionContext.

        This is the primary entry point for the Conversation Engine.
        The returned EmotionContext is the ONLY emotion representation
        passed to the LLM.
        """
        text_result: EmotionResult | None = None
        face_result: EmotionResult | None = None
        voice_result: EmotionResult | None = None

        tasks = []
        if text:
            tasks.append(("text", self._text.analyze(text)))
        if image_data and self._face.is_available:
            tasks.append(("face", self._face.analyze(image_data)))
        if audio_data and self._voice.is_available:
            tasks.append(("voice", self._voice.analyze(audio_data)))

        if tasks:
            labels = [t[0] for t in tasks]
            coros = [t[1] for t in tasks]
            results = await asyncio.gather(*coros, return_exceptions=True)

            for label, result in zip(labels, results):
                if isinstance(result, Exception):
                    logger.warning(f"{label} emotion analysis failed", error=str(result))
                    continue
                if label == "text":
                    text_result = result
                elif label == "face":
                    face_result = result
                elif label == "voice":
                    voice_result = result

        # Update readings and fuse
        if text_result and not text_result.is_mock:
            self._fusion.update_reading("text", text_result)
        if face_result and not face_result.is_mock:
            self._fusion.update_reading("face", face_result)
        if voice_result and not voice_result.is_mock:
            self._fusion.update_reading("voice", voice_result)

        return self._fusion.fuse()

    # ── Legacy compatibility ──────────────────────────────────────────────────

    async def analyze_and_fuse_legacy(
        self,
        text: str | None = None,
        audio_data: Any = None,
        image_data: Any = None,
    ) -> EmotionContext:
        return await self.analyze_and_fuse(
            text=text, audio_data=audio_data, image_data=image_data
        )

    def get_emotion_context(self) -> dict[str, Any]:
        buf = self._fusion.trend_buffer
        if not buf:
            return {"fused_emotion": "neutral", "confidence": 0.0, "sentiment": "neutral"}
        latest = buf[-1]
        return {
            "fused_emotion": latest.get("emotion", "neutral"),
            "confidence": latest.get("confidence", 0.0),
            "sentiment": latest.get("sentiment", "neutral"),
            "stress_level": latest.get("stress", "low"),
        }

    def get_status(self) -> dict:
        return {
            "text_analyzer": "available (transformer_loaded)" if self._text.is_local_model_loaded() else "available (fallback)",
            "face": "available" if self._face.is_available else "unavailable",
            "face_analyzer": "available" if self._face.is_available else "unavailable",
            "voice": "available",
            "voice_analyzer": "available",
            "trend_turns": len(self._fusion.trend_buffer),
        }

    def reset(self) -> None:
        self._fusion.reset()

    @property
    def face_available(self) -> bool:
        return self._face.is_available

    @property
    def trend_buffer(self) -> list[dict[str, Any]]:
        return self._fusion.trend_buffer
