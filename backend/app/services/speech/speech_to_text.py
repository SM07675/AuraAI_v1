"""
Speech-to-Text Service — Faster-Whisper Streaming and Turn Transcription.

Loads Whisper model once on startup and provides parallel non-blocking transcription.
"""

from __future__ import annotations

import io
import time
from datetime import datetime, timezone
from typing import Any, Dict, Optional, Union

import numpy as np

from app.core.logging_config import get_logger

logger = get_logger(__name__)

_GLOBAL_STT_SERVICE: Optional[SpeechToTextService] = None


class SpeechToTextService:
    """Singleton service for Automatic Speech Recognition."""

    def __init__(self, model_size: str = "tiny", device: str = "cpu") -> None:
        self.model_size = model_size
        self.device = device
        self.is_loaded = False
        self._model = None
        self._load_model()

    def _load_model(self) -> None:
        t0 = time.perf_counter()
        try:
            from faster_whisper import WhisperModel
            self._model = WhisperModel(self.model_size, device=self.device, compute_type="int8")
            self.is_loaded = True
            logger.info("Faster-Whisper STT model loaded successfully", model=self.model_size, device=self.device)
        except Exception as exc:
            logger.warning("Faster-Whisper STT load failed or optional", error=str(exc))
            self.is_loaded = False
        self.load_time_ms = round((time.perf_counter() - t0) * 1000.0, 2)

    @classmethod
    def get_instance(cls, model_size: str = "tiny", device: str = "cpu") -> SpeechToTextService:
        global _GLOBAL_STT_SERVICE
        if _GLOBAL_STT_SERVICE is None:
            _GLOBAL_STT_SERVICE = cls(model_size=model_size, device=device)
        return _GLOBAL_STT_SERVICE

    async def transcribe(self, audio_data: Union[bytes, np.ndarray, str], language: str = "en") -> Dict[str, Any]:
        """Transcribe PCM or WAV audio bytes to text."""
        t0 = time.perf_counter()
        if not self.is_loaded or self._model is None:
            return {
                "text": "",
                "language": language,
                "confidence": 0.0,
                "latency_ms": 0.0,
                "status": "stt_offline_fallback",
            }

        try:
            if isinstance(audio_data, bytes):
                audio_file = io.BytesIO(audio_data)
                segments, info = self._model.transcribe(audio_file, language=language, beam_size=1)
            elif isinstance(audio_data, np.ndarray):
                segments, info = self._model.transcribe(audio_data, language=language, beam_size=1)
            else:
                segments, info = self._model.transcribe(str(audio_data), language=language, beam_size=1)

            text = " ".join([s.text for s in segments]).strip()
            latency_ms = (time.perf_counter() - t0) * 1000.0

            return {
                "text": text,
                "language": info.language if info else language,
                "confidence": round(getattr(info, "language_probability", 0.9), 2),
                "latency_ms": round(latency_ms, 2),
                "status": "success",
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
        except Exception as exc:
            logger.error("STT transcription failed", error=str(exc))
            return {
                "text": "",
                "language": language,
                "confidence": 0.0,
                "latency_ms": round((time.perf_counter() - t0) * 1000.0, 2),
                "status": f"error: {exc}",
            }

    def health_check(self) -> Dict[str, Any]:
        return {
            "status": "healthy" if self.is_loaded else "offline",
            "model_size": self.model_size,
            "device": self.device,
            "is_loaded": self.is_loaded,
            "load_time_ms": self.load_time_ms,
        }
