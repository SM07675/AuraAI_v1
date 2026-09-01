"""
Multimodal Emotion Fusion Service for Aura AI 2.0.

Fuses face, voice, and text emotion signals using Bayesian quality-weighted fusion.
Calculates uncertainty, conflict indicators, source contributions, and prioritizes
explicit user statements over inferred non-verbal cues.
"""

from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from app.core.logging_config import get_logger
from app.emotion.base import EmotionContext, EmotionResult, NEGATIVE_EMOTIONS, POSITIVE_EMOTIONS

logger = get_logger(__name__)

# Canonical modality base reliability weights
DEFAULT_WEIGHTS: Dict[str, float] = {
    "text": 0.45,    # Text carries direct cognitive intent & explicit statements
    "voice": 0.35,   # Voice carries acoustic prosody & physiological arousal
    "face": 0.20,    # Face provides facial expression & micro-behavioral cues
}

_CANONICAL_EMOTIONS = [
    "happy", "sad", "angry", "anxious", "fearful", "calm", "neutral", "surprised", "disgusted"
]

_GLOBAL_FUSION_SERVICE: Optional[EmotionFusionService] = None


def normalize_emotion_label(value: Any) -> str:
    lowered = str(value or "").strip().lower()
    if not lowered:
        return "neutral"
    if "happy" in lowered or "joy" in lowered:
        return "happy"
    if "sad" in lowered:
        return "sad"
    if "anx" in lowered or "stress" in lowered or "worry" in lowered:
        return "anxious"
    if "fear" in lowered:
        return "fearful"
    if "ang" in lowered:
        return "angry"
    if "surpris" in lowered or "shock" in lowered:
        return "surprised"
    if "disgust" in lowered:
        return "disgusted"
    if "calm" in lowered or "peace" in lowered:
        return "calm"
    return lowered


class EmotionFusionService:
    """Multimodal emotion fusion engine with uncertainty estimation & conflict detection."""

    def __init__(self, weights: Optional[Dict[str, float]] = None) -> None:
        self._weights = dict(DEFAULT_WEIGHTS if weights is None else weights)

    @classmethod
    def get_instance(cls) -> EmotionFusionService:
        global _GLOBAL_FUSION_SERVICE
        if _GLOBAL_FUSION_SERVICE is None:
            _GLOBAL_FUSION_SERVICE = cls()
        return _GLOBAL_FUSION_SERVICE

    def fuse(
        self,
        face_res: Optional[Dict[str, Any]] = None,
        text_res: Optional[Dict[str, Any]] = None,
        voice_res: Optional[Dict[str, Any]] = None,
        user_message: str = "",
    ) -> Dict[str, Any]:
        """Fuse multimodal inputs into primary, secondary, confidence, uncertainty, and source contributions.

        Rules:
        1. Explicit user statements (e.g. "I am happy", "I am feeling stressed") take precedence.
        2. Valid signals are weighted by (base_weight * confidence * quality_factor).
        3. Conflict is detected if opposing valences (e.g. happy face + sad voice/text) co-occur.
        4. Uncertainty = 1.0 - confidence (calibrated).
        """
        t0 = time.perf_counter()

        sources_valid: Dict[str, Dict[str, Any]] = {}

        # 1. Evaluate Text Modality
        if text_res:
            t_emo = normalize_emotion_label(text_res.get("primary_emotion") or text_res.get("emotion"))
            t_conf = float(text_res.get("confidence") or 0.5)
            t_conf = t_conf / 100.0 if t_conf > 1.0 else t_conf
            if t_conf > 0.15 and not text_res.get("is_mock", False):
                sources_valid["text"] = {
                    "emotion": t_emo,
                    "confidence": t_conf,
                    "scores": text_res.get("scores", {}),
                    "quality": float(text_res.get("quality", 1.0)),
                    "timestamp": text_res.get("timestamp"),
                }

        # 2. Evaluate Voice Modality
        if voice_res:
            v_emo = normalize_emotion_label(voice_res.get("primary_emotion") or voice_res.get("emotion"))
            v_conf = float(voice_res.get("confidence") or 0.5)
            v_conf = v_conf / 100.0 if v_conf > 1.0 else v_conf
            if v_conf > 0.15 and not voice_res.get("is_mock", False):
                sources_valid["voice"] = {
                    "emotion": v_emo,
                    "confidence": v_conf,
                    "scores": voice_res.get("scores", {}),
                    "quality": float(voice_res.get("quality", 1.0)),
                    "timestamp": voice_res.get("timestamp"),
                }

        # 3. Evaluate Face Modality
        if face_res and face_res.get("face_detected", True) is not False:
            f_emo = normalize_emotion_label(face_res.get("primary_emotion") or face_res.get("emotion"))
            f_conf = float(face_res.get("confidence") or 0.5)
            f_conf = f_conf / 100.0 if f_conf > 1.0 else f_conf
            f_qual = float(face_res.get("tracking_quality") if face_res.get("tracking_quality") is not None else face_res.get("quality", 1.0))
            if f_conf > 0.15 and f_qual >= 0.30 and not face_res.get("is_mock", False):
                sources_valid["face"] = {
                    "emotion": f_emo,
                    "confidence": f_conf,
                    "scores": face_res.get("scores", {}),
                    "quality": f_qual,
                    "facial_state": face_res.get("facial_state") or {},
                    "timestamp": face_res.get("timestamp"),
                }

        # If no active modality
        if not sources_valid:
            return self._neutral_fusion_result(time.perf_counter() - t0)

        # Explicit user statement check (priority override)
        user_lower = user_message.lower() if user_message else ""
        explicit_override = None
        if any(ph in user_lower for ph in ["i am feeling happy", "i feel great", "i'm happy", "i am so excited"]):
            explicit_override = "happy"
        elif any(ph in user_lower for ph in ["i am sad", "i feel depressed", "i'm crying", "i am so heartbroken"]):
            explicit_override = "sad"
        elif any(ph in user_lower for ph in ["i am anxious", "i am stressed", "i feel panicked", "i'm so nervous"]):
            explicit_override = "anxious"
        elif any(ph in user_lower for ph in ["i am angry", "i'm furious", "i hate this", "i am so pissed"]):
            explicit_override = "angry"

        # Accumulate weighted probabilities
        aggregated_scores: Dict[str, float] = {e: 0.0 for e in _CANONICAL_EMOTIONS}
        source_contributions: Dict[str, float] = {}
        total_effective_weight = 0.0

        for mod_name, mod_data in sources_valid.items():
            base_w = self._weights.get(mod_name, 0.3)
            conf = mod_data["confidence"]
            qual = mod_data["quality"]
            eff_w = base_w * conf * qual
            source_contributions[mod_name] = round(eff_w, 4)
            total_effective_weight += eff_w

            # Distribute scores
            mod_scores = mod_data.get("scores", {})
            if mod_scores:
                for emo, score_val in mod_scores.items():
                    c_emo = normalize_emotion_label(emo)
                    aggregated_scores[c_emo] = aggregated_scores.get(c_emo, 0.0) + (score_val * eff_w)
            else:
                c_emo = mod_data["emotion"]
                aggregated_scores[c_emo] = aggregated_scores.get(c_emo, 0.0) + (conf * eff_w)

        # Normalize distributions
        if total_effective_weight > 0:
            for k in aggregated_scores:
                aggregated_scores[k] = round(aggregated_scores[k] / total_effective_weight, 4)
            # Normalize contribution fractions to sum to 1.0
            source_contributions = {
                k: round(v / total_effective_weight, 3) for k, v in source_contributions.items()
            }

        sorted_emotions = sorted(aggregated_scores.items(), key=lambda kv: kv[1], reverse=True)
        primary_emotion = explicit_override or sorted_emotions[0][0]
        primary_conf = float(aggregated_scores.get(primary_emotion, sorted_emotions[0][1]))

        secondary_emotion = sorted_emotions[1][0] if len(sorted_emotions) > 1 and sorted_emotions[1][1] > 0.10 else None

        # Conflict Detection: Positive vs Negative signals simultaneously with conf > 0.50
        pos_sources = [m for m, d in sources_valid.items() if d["emotion"] in POSITIVE_EMOTIONS and d["confidence"] >= 0.50]
        neg_sources = [m for m, d in sources_valid.items() if d["emotion"] in NEGATIVE_EMOTIONS and d["confidence"] >= 0.50]

        conflict_status = bool(pos_sources and neg_sources)
        conflict_detail = ""
        if conflict_status:
            conflict_detail = f"Emotional divergence: {pos_sources[0]} ({sources_valid[pos_sources[0]]['emotion']}) vs {neg_sources[0]} ({sources_valid[neg_sources[0]]['emotion']})"

        # Multi-modal agreement boost
        agreeing_modalities = sum(1 for d in sources_valid.values() if d["emotion"] == primary_emotion)
        if agreeing_modalities >= 2:
            primary_conf = min(0.98, primary_conf * 1.20)

        uncertainty = round(max(0.02, 1.0 - primary_conf), 4)
        latency_ms = (time.perf_counter() - t0) * 1000.0

        return {
            "primary_emotion": primary_emotion,
            "secondary_emotion": secondary_emotion,
            "confidence": round(primary_conf, 4),
            "uncertainty": uncertainty,
            "scores": aggregated_scores,
            "source_contributions": source_contributions,
            "conflict_status": conflict_status,
            "conflict_detail": conflict_detail,
            "active_modalities": list(sources_valid.keys()),
            "sources": {
                "face": face_res,
                "voice": voice_res,
                "text": text_res,
            },
            "fusion_latency_ms": round(latency_ms, 2),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    def _neutral_fusion_result(self, latency_sec: float) -> Dict[str, Any]:
        return {
            "primary_emotion": "neutral",
            "secondary_emotion": None,
            "confidence": 0.50,
            "uncertainty": 0.50,
            "scores": {e: (0.5 if e == "neutral" else 0.0) for e in _CANONICAL_EMOTIONS},
            "source_contributions": {},
            "conflict_status": False,
            "conflict_detail": "",
            "active_modalities": [],
            "sources": {},
            "fusion_latency_ms": round(latency_sec * 1000.0, 2),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    def health_check(self) -> Dict[str, Any]:
        return {
            "status": "healthy",
            "engine": "bayesian_quality_weighted_fusion",
            "weights": self._weights,
        }
