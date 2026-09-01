"""
Voice Emotion Service — SpeechBrain wav2vec2-IEMOCAP Emotion Recognizer.

Input: 16 kHz mono float waveform / PCM audio bytes.
Runs asynchronously in parallel with Whisper/STT without blocking the primary response stream.
"""

from __future__ import annotations

import asyncio
import io
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

import numpy as np

try:
    import torch
    _TORCH_AVAILABLE = True
except Exception:
    torch = None
    _TORCH_AVAILABLE = False

from app.core.logging_config import get_logger

logger = get_logger(__name__)

# Search paths for wav2vec2-IEMOCAP model weights
_MODEL_CANDIDATE_PATHS: List[Path] = [
    Path("/app/model/voice/wav2vec2-IEMOCAP"),
    Path("/app/model/voice"),
    Path("D:/AuraAI_v1/model/voice/wav2vec2-IEMOCAP"),
    Path("D:/AuraAI_v1/models/voice/emotion-recognition-wav2vec2-IEMOCAP"),
]
_curr_voice = Path(__file__).resolve().parent
for _p in [_curr_voice, *_curr_voice.parents]:
    _MODEL_CANDIDATE_PATHS.append(_p / "model" / "voice" / "wav2vec2-IEMOCAP")
    _MODEL_CANDIDATE_PATHS.append(_p / "models" / "voice" / "emotion-recognition-wav2vec2-IEMOCAP")
    _MODEL_CANDIDATE_PATHS.append(_p / "model" / "voice")

_VOICE_LABEL_MAP: dict[str, str] = {
    "neu": "neutral",
    "neutral": "neutral",
    "hap": "happy",
    "happy": "happy",
    "joy": "happy",
    "ang": "angry",
    "angry": "angry",
    "sad": "sad",
    "sadness": "sad",
    "exc": "excited",
    "fea": "fearful",
}

_GLOBAL_VOICE_EMOTION_SERVICE: Optional[VoiceEmotionService] = None


class VoiceEmotionService:
    """Singleton service for SpeechBrain wav2vec2 IEMOCAP voice emotion analysis."""

    _instance = None
    _classifier = None
    _is_loaded = False
    _lock = asyncio.Lock()

    def __init__(self, model_path: Optional[str] = None) -> None:
        self._custom_path = model_path
        self._device = "cuda" if (_TORCH_AVAILABLE and torch and torch.cuda.is_available()) else "cpu"
        self._resolved_dir = self._resolve_model_dir()
        self._ensure_loaded()

    @classmethod
    def get_instance(cls, model_path: Optional[str] = None) -> VoiceEmotionService:
        global _GLOBAL_VOICE_EMOTION_SERVICE
        if _GLOBAL_VOICE_EMOTION_SERVICE is None:
            _GLOBAL_VOICE_EMOTION_SERVICE = cls(model_path=model_path)
        return _GLOBAL_VOICE_EMOTION_SERVICE

    def _resolve_model_dir(self) -> Path:
        if self._custom_path and Path(self._custom_path).exists():
            return Path(self._custom_path)
        for candidate in _MODEL_CANDIDATE_PATHS:
            if candidate.exists() and (candidate / "model.ckpt").exists():
                return candidate
        # Fallback to default
        return _MODEL_CANDIDATE_PATHS[0]

    def _ensure_loaded(self) -> None:
        if VoiceEmotionService._is_loaded and VoiceEmotionService._classifier is not None:
            return

        try:
            from speechbrain.inference.interfaces import foreign_class
            from speechbrain.utils.fetching import LocalStrategy

            save_dir = str(self._resolved_dir)
            logger.info("Loading SpeechBrain Voice Emotion model", model_dir=save_dir, device=self._device)

            VoiceEmotionService._classifier = foreign_class(
                source="speechbrain/emotion-recognition-wav2vec2-IEMOCAP",
                pymodule_file="custom_interface.py",
                classname="CustomEncoderWav2vec2Classifier",
                savedir=save_dir,
                local_strategy=LocalStrategy.COPY,
                run_opts={"device": self._device},
            )
            VoiceEmotionService._is_loaded = True
            logger.info("SpeechBrain Voice Emotion model loaded successfully", device=self._device)
        except Exception as exc:
            logger.warning("Could not load SpeechBrain wav2vec2 model; acoustic prosody fallback enabled", error=str(exc))
            VoiceEmotionService._is_loaded = False

    @property
    def is_loaded(self) -> bool:
        return VoiceEmotionService._is_loaded

    @property
    def device(self) -> str:
        return self._device

    def _audio_to_tensor(self, audio_data: Union[bytes, np.ndarray, torch.Tensor]) -> Optional[Tuple[torch.Tensor, Dict[str, float]]]:
        """Convert input audio into 16kHz float32 tensor and extract acoustic features."""
        audio_arr: Optional[np.ndarray] = None
        features: Dict[str, float] = {}

        if isinstance(audio_data, bytes):
            # Try parsing as WAV or raw 16-bit PCM
            if audio_data.startswith(b"RIFF"):
                try:
                    import soundfile as sf
                    data, sr = sf.read(io.BytesIO(audio_data), dtype="float32")
                    if len(data.shape) > 1:
                        data = np.mean(data, axis=1)
                    audio_arr = data
                except Exception:
                    pass
            if audio_arr is None:
                try:
                    raw_int16 = np.frombuffer(audio_data, dtype=np.int16)
                    audio_arr = raw_int16.astype(np.float32) / 32768.0
                except Exception:
                    pass
        elif isinstance(audio_data, np.ndarray):
            if audio_data.dtype == np.int16:
                audio_arr = audio_data.astype(np.float32) / 32768.0
            else:
                audio_arr = audio_data.astype(np.float32)
            if len(audio_arr.shape) > 1:
                audio_arr = np.mean(audio_arr, axis=1)
        elif _TORCH_AVAILABLE and torch and isinstance(audio_data, torch.Tensor):
            t = audio_data.detach().cpu().float()
            if t.ndim == 1:
                t = t.unsqueeze(0)
            return t, {}

        if audio_arr is None or len(audio_arr) < 400:  # Minimum 25ms at 16kHz
            return None

        # Compute real acoustic prosody features
        rms = float(np.sqrt(np.mean(audio_arr ** 2)))
        features["rms_energy"] = round(rms, 4)
        features["zero_crossing_rate"] = round(float(np.mean(np.abs(np.diff(np.sign(audio_arr))))) / 2.0, 4)
        features["peak_amplitude"] = round(float(np.max(np.abs(audio_arr))), 4)

        tensor = torch.from_numpy(audio_arr).unsqueeze(0) if (_TORCH_AVAILABLE and torch) else None
        return tensor, features

    async def analyze(
        self,
        audio_data: Union[bytes, np.ndarray, torch.Tensor, str, None],
        sample_rate: int = 16000,
        user_id: int = 0,
    ) -> Dict[str, Any]:
        """Analyze voice emotion from raw audio / PCM buffer asynchronously."""
        t0 = time.perf_counter()

        if audio_data is None:
            return self._neutral_fallback(0.0)

        # Direct dictionary pass-through
        if isinstance(audio_data, dict):
            raw_emo = str(audio_data.get("emotion") or audio_data.get("primary_emotion") or "neutral").lower()
            canonical = _VOICE_LABEL_MAP.get(raw_emo, raw_emo)
            conf = float(audio_data.get("confidence") or 60.0)
            return {
                "modality": "voice",
                "primary_emotion": canonical,
                "secondary_emotion": audio_data.get("secondary_emotion"),
                "confidence": round(conf if conf <= 1.0 else conf / 100.0, 4),
                "scores": audio_data.get("scores") or {canonical: 1.0},
                "acoustic_features": {},
                "sample_rate": sample_rate,
                "inference_latency_ms": 0.0,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }

        converted = self._audio_to_tensor(audio_data)
        if converted is None:
            return self._neutral_fallback(0.0)

        tensor_audio, acoustic_features = converted

        # 1. Run SpeechBrain Classifier
        if VoiceEmotionService._is_loaded and VoiceEmotionService._classifier is not None:
            try:
                loop = asyncio.get_event_loop()

                def _infer():
                    with torch.no_grad():
                        tensor_dev = tensor_audio.to(self._device)
                        return VoiceEmotionService._classifier.classify_batch(tensor_dev)

                out_prob, score, index, text_lab = await loop.run_in_executor(None, _infer)

                raw_label = str(text_lab[0]).lower().strip()
                dominant_emotion = _VOICE_LABEL_MAP.get(raw_label, "neutral")
                confidence = float(score.item())

                # IEMOCAP classes: neu, ang, hap, sad
                prob_list = out_prob.squeeze().tolist()
                if isinstance(prob_list, float):
                    prob_list = [prob_list]

                scores: Dict[str, float] = {
                    "neutral": round(prob_list[0], 4) if len(prob_list) > 0 else 0.0,
                    "angry": round(prob_list[1], 4) if len(prob_list) > 1 else 0.0,
                    "happy": round(prob_list[2], 4) if len(prob_list) > 2 else 0.0,
                    "sad": round(prob_list[3], 4) if len(prob_list) > 3 else 0.0,
                }
                scores.setdefault("anxious", 0.0)
                scores.setdefault("fearful", 0.0)
                scores.setdefault("calm", 0.0)

                sorted_scores = sorted(scores.items(), key=lambda kv: kv[1], reverse=True)
                secondary_emotion = sorted_scores[1][0] if len(sorted_scores) > 1 and sorted_scores[1][1] > 0.1 else None

                latency_ms = (time.perf_counter() - t0) * 1000.0

                return {
                    "modality": "voice",
                    "primary_emotion": dominant_emotion,
                    "secondary_emotion": secondary_emotion,
                    "confidence": round(confidence if confidence <= 1.0 else confidence / 100.0, 4),
                    "scores": scores,
                    "acoustic_features": acoustic_features,
                    "sample_rate": sample_rate,
                    "inference_latency_ms": round(latency_ms, 2),
                    "model": "speechbrain/wav2vec2-IEMOCAP",
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                }
            except Exception as exc:
                logger.warning("SpeechBrain voice inference failed, using acoustic fallback", error=str(exc))

        # 2. Acoustic heuristics fallback
        energy = acoustic_features.get("rms_energy", 0.0)
        zcr = acoustic_features.get("zero_crossing_rate", 0.0)

        if energy > 0.15 and zcr > 0.15:
            dom = "angry"
            conf = 0.65
        elif energy > 0.10:
            dom = "happy"
            conf = 0.60
        elif energy < 0.02:
            dom = "sad"
            conf = 0.55
        else:
            dom = "neutral"
            conf = 0.50

        scores = {dom: conf, "neutral": 0.3}
        latency_ms = (time.perf_counter() - t0) * 1000.0

        return {
            "modality": "voice",
            "primary_emotion": dom,
            "secondary_emotion": "neutral" if dom != "neutral" else None,
            "confidence": round(conf, 4),
            "scores": scores,
            "acoustic_features": acoustic_features,
            "sample_rate": sample_rate,
            "inference_latency_ms": round(latency_ms, 2),
            "model": "acoustic_prosody_fallback",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    def _neutral_fallback(self, latency_ms: float) -> Dict[str, Any]:
        return {
            "modality": "voice",
            "primary_emotion": "neutral",
            "secondary_emotion": None,
            "confidence": 0.5,
            "scores": {"neutral": 0.5, "calm": 0.3, "happy": 0.1, "sad": 0.1},
            "acoustic_features": {},
            "sample_rate": 16000,
            "inference_latency_ms": round(latency_ms, 2),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    def health_check(self) -> Dict[str, Any]:
        return {
            "status": "healthy" if VoiceEmotionService._is_loaded else "acoustic_fallback",
            "model": "speechbrain/emotion-recognition-wav2vec2-IEMOCAP",
            "is_loaded": VoiceEmotionService._is_loaded,
            "device": self._device,
            "model_path": str(self._resolved_dir),
        }
