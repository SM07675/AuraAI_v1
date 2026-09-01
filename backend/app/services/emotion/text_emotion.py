"""
Text Emotion Service — Local DistilRoBERTa Emotion Classifier.

Model: j-hartmann/emotion-english-distilroberta-base
Loads once as a singleton on startup and reuses across requests.
Outputs structured emotion classification with confidence scores.
"""

from __future__ import annotations

import os
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from app.core.logging_config import get_logger
from app.emotion.analyzers import TextEmotionAnalyzer

logger = get_logger(__name__)

_GLOBAL_TEXT_EMOTION_SERVICE: Optional[TextEmotionService] = None


class TextEmotionService:
    """Singleton service for English text emotion analysis."""

    def __init__(self, model_path: Optional[str] = None) -> None:
        self._analyzer = TextEmotionAnalyzer(model_path=model_path)
        self.device = getattr(self._analyzer, "_device", "cpu")
        self.is_loaded = getattr(self._analyzer, "_model_loaded", True)
        self.load_time_ms = getattr(self._analyzer, "load_time_ms", 12.0)

    @classmethod
    def get_instance(cls, model_path: Optional[str] = None) -> TextEmotionService:
        """Get or initialize global singleton instance."""
        global _GLOBAL_TEXT_EMOTION_SERVICE
        if _GLOBAL_TEXT_EMOTION_SERVICE is None:
            _GLOBAL_TEXT_EMOTION_SERVICE = cls(model_path=model_path)
        return _GLOBAL_TEXT_EMOTION_SERVICE

    async def analyze(self, text: str, user_id: int = 0) -> Dict[str, Any]:
        """Analyze emotion of an English text turn."""
        t0 = time.perf_counter()
        result = await self._analyzer.analyze(text)
        latency_ms = (time.perf_counter() - t0) * 1000.0

        return {
            "modality": "text",
            "primary_emotion": result.primary_emotion,
            "secondary_emotion": result.secondary_emotion,
            "confidence": round(result.confidence, 4),
            "scores": {k: round(v, 4) for k, v in result.scores.items()},
            "sentiment": result.sentiment,
            "stress_level": result.stress_level,
            "intent": result.intent,
            "language": "en",
            "inference_latency_ms": round(latency_ms, 2),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    async def analyze_batch(self, texts: List[str]) -> List[Dict[str, Any]]:
        """Batch analysis of multiple texts."""
        return [await self.analyze(t) for t in texts]

    def health_check(self) -> Dict[str, Any]:
        """Health status of the text emotion model."""
        return {
            "status": "healthy" if self.is_loaded else "fallback_mode",
            "model": "j-hartmann/emotion-english-distilroberta-base",
            "is_loaded": self.is_loaded,
            "device": self.device,
            "load_time_ms": self.load_time_ms,
        }
