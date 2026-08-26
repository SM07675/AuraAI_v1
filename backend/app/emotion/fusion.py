"""
Emotion Fusion — multi-modal emotion aggregation.

Fuses text, face, and voice readings into a single active emotion state.
Handles freshness decay, consensus agreement bonuses, and conflict detection.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from app.emotion.base import EmotionContext, EmotionResult, NEGATIVE_EMOTIONS, POSITIVE_EMOTIONS
from app.core.logging_config import get_logger

logger = get_logger(__name__)

FRESHNESS_WINDOW_SECONDS = 5.0

# Modality weights matching Aura AI architecture
DEFAULT_WEIGHTS: Dict[str, float] = {
    "face": 0.40,
    "voice": 0.35,
    "text": 0.25,
}

_AGREEMENT_BONUS = 1.25


def normalize_emotion_label(value: str) -> str:
    lowered = str(value or "").strip().lower()
    if not lowered:
        return "neutral"
    if "happy" in lowered or "joy" in lowered:
        return "happy"
    if "sad" in lowered:
        return "sad"
    if "anx" in lowered or "fear" in lowered or "stress" in lowered or "worry" in lowered:
        return "anxious"
    if "angry" in lowered or "anger" in lowered:
        return "angry"
    if "surpris" in lowered or "startle" in lowered:
        return "surprised"
    if "disgust" in lowered:
        return "disgusted"
    if "calm" in lowered:
        return "calm"
    return lowered


@dataclass(frozen=True)
class FusedEmotion:
    emotion: str
    scores: Dict[str, float]
    available_modalities: Dict[str, bool]
    confidence: float = 60.0
    conflict: bool = False
    conflict_detail: str = ""


def fuse_emotions(
    *,
    face: Optional[Dict[str, Any]] = None,
    voice: Optional[Dict[str, Any]] = None,
    text: Optional[Dict[str, Any]] = None,
    weights: Optional[Dict[str, float]] = None,
) -> FusedEmotion:
    """Fuse emotion outputs from face, voice, and text modalities."""
    w_map = dict(DEFAULT_WEIGHTS if weights is None else weights)

    face_emo = normalize_emotion_label(face.get("emotion")) if face and face.get("emotion") else None
    voice_emo = normalize_emotion_label(voice.get("emotion")) if voice and voice.get("emotion") else None
    text_emo = normalize_emotion_label(text.get("emotion")) if text and text.get("emotion") else None

    # Filter out empty, mock or invalid strings
    valid_pairs = []
    if face and face.get("face_detected") is not False and not face.get("is_mock", False) and face_emo and face_emo not in ("unknown", "no_face"):
        valid_pairs.append(("face", face_emo, face))
    if voice and not voice.get("is_mock", False) and voice_emo and voice_emo not in ("unknown", "no_face"):
        valid_pairs.append(("voice", voice_emo, voice))
    if text and not text.get("is_mock", False) and text_emo and text_emo not in ("unknown", "no_face"):
        valid_pairs.append(("text", text_emo, text))

    available_modalities = {
        "face": bool(any(p[0] == "face" for p in valid_pairs)),
        "voice": bool(any(p[0] == "voice" for p in valid_pairs)),
        "text": bool(any(p[0] == "text" for p in valid_pairs)),
    }

    if not valid_pairs:
        return FusedEmotion(
            emotion="neutral",
            scores={"neutral": 1.0},
            available_modalities=available_modalities,
            confidence=0.0,
            conflict=False,
            conflict_detail="",
        )

    # Accumulate weighted scores
    scores: Dict[str, float] = {}
    total_weight = 0.0
    confidences: List[float] = []

    for mod_key, emo_label, raw_dict in valid_pairs:
        conf = float(raw_dict.get("confidence") or 60.0) if raw_dict else 60.0
        conf_norm = max(0.2, min(conf / 100.0 if conf > 1.0 else conf, 1.0))
        w = w_map.get(mod_key, 0.3) * conf_norm
        scores[emo_label] = scores.get(emo_label, 0.0) + w
        total_weight += w
        confidences.append(conf if conf > 1.0 else conf * 100.0)

    if total_weight > 0:
        for k in scores:
            scores[k] = round(scores[k] / total_weight, 4)

    # Check for agreement bonus (2+ modalities agree)
    counts: Dict[str, int] = {}
    for _, emo_label, _ in valid_pairs:
        counts[emo_label] = counts.get(emo_label, 0) + 1

    consensus_emo: Optional[str] = None
    for emo, cnt in counts.items():
        if cnt >= 2:
            consensus_emo = emo
            break

    # Conflict check: positive vs negative simultaneously with confidence > 60%
    pos_pairs = [p for p in valid_pairs if p[1] in POSITIVE_EMOTIONS and float(p[2].get("confidence", 0)) >= 60.0]
    neg_pairs = [p for p in valid_pairs if p[1] in NEGATIVE_EMOTIONS and float(p[2].get("confidence", 0)) >= 60.0]
    conflict = bool(pos_pairs and neg_pairs)
    conflict_detail = ""
    if conflict:
        pos_str = f"{pos_pairs[0][0]}={pos_pairs[0][1]}"
        neg_str = f"{neg_pairs[0][0]}={neg_pairs[0][1]}"
        conflict_detail = f"Emotional conflict detected: {pos_str} vs {neg_str}"

    if consensus_emo:
        final_emotion = consensus_emo
        final_conf = min(98.0, max(confidences) * _AGREEMENT_BONUS) if confidences else 75.0
    else:
        final_emotion = max(scores.items(), key=lambda item: item[1])[0]
        final_conf = (sum(confidences) / len(confidences)) if confidences else 60.0

    return FusedEmotion(
        emotion=final_emotion,
        scores=scores,
        available_modalities=available_modalities,
        confidence=round(final_conf, 1),
        conflict=conflict,
        conflict_detail=conflict_detail,
    )


@dataclass
class TimedEmotionResult:
    result: EmotionResult
    timestamp_unix: float


class EmotionFusionEngine:
    """Manages real-time multi-modal emotion aggregation with rolling freshness."""

    def __init__(self, weights: Optional[Dict[str, float]] = None):
        self._weights = dict(DEFAULT_WEIGHTS if weights is None else weights)
        self._last_readings: Dict[str, TimedEmotionResult] = {}
        self.trend_buffer: List[Dict[str, Any]] = []

    def reset(self):
        self._last_readings.clear()
        self.trend_buffer.clear()

    def update_reading(self, source: str, result: EmotionResult):
        """Update the latest reading for a specific source."""
        self._last_readings[source] = TimedEmotionResult(
            result=result,
            timestamp_unix=time.time(),
        )

    def fuse(
        self,
        text: Optional[EmotionResult] = None,
        face: Optional[EmotionResult] = None,
        voice: Optional[EmotionResult] = None,
    ) -> EmotionContext:
        """Produce a unified EmotionContext from all active sources within the freshness window."""
        if text is not None:
            self.update_reading("text", text)
        if face is not None:
            self.update_reading("face", face)
        if voice is not None:
            self.update_reading("voice", voice)

        now = time.time()
        active_readings: Dict[str, EmotionResult] = {}

        for source, timed_result in list(self._last_readings.items()):
            res = timed_result.result
            if res.is_mock or (source == "face" and res.face_detected is False):
                continue

            if now - timed_result.timestamp_unix <= FRESHNESS_WINDOW_SECONDS:
                active_readings[source] = res
            else:
                del self._last_readings[source]

        sources = list(active_readings.keys())
        timestamp_iso = datetime.now(timezone.utc).isoformat()

        if not sources:
            return EmotionContext(
                primaryEmotion="neutral",
                confidence=0.0,
                stressLevel=0.2,
                activeSources=[],
                conflict=False,
                timestamp=timestamp_iso,
                sentiment="neutral",
                intent="casual",
                stress="low",
            )

        # Single source
        if len(sources) == 1:
            source = sources[0]
            res = active_readings[source]
            stress_map = {"low": 0.2, "medium": 0.6, "high": 0.9}
            stress_num = stress_map.get(res.stress_level, 0.2)

            ctx = EmotionContext(
                primaryEmotion=res.emotion,
                confidence=res.confidence / 100.0 if res.confidence > 1.0 else res.confidence,
                stressLevel=stress_num,
                activeSources=sources,
                conflict=False,
                timestamp=timestamp_iso,
                sentiment=res.sentiment,
                intent=res.intent,
                stress=res.stress_level,
                text_emotion=res.emotion if source == "text" else None,
                face_emotion=res.emotion if source == "face" else None,
                voice_emotion=res.emotion if source == "voice" else None,
            )
            self._record_trend(ctx)
            return ctx

        # Multiple sources: use fuse_emotions
        face_dict = active_readings["face"].to_dict() if "face" in active_readings else None
        voice_dict = active_readings["voice"].to_dict() if "voice" in active_readings else None
        text_dict = active_readings["text"].to_dict() if "text" in active_readings else None

        fused = fuse_emotions(face=face_dict, voice=voice_dict, text=text_dict, weights=self._weights)

        # Stress priority: high > medium > low
        stress_levels = [r.stress_level for r in active_readings.values()]
        if "high" in stress_levels:
            final_stress_str = "high"
            final_stress_num = 0.9
        elif "medium" in stress_levels:
            final_stress_str = "medium"
            final_stress_num = 0.6
        else:
            final_stress_str = "low"
            final_stress_num = 0.2

        # Intent priority: crisis > seek_support > vent > ask_question > share_negative > share_positive > casual
        intent_priority = ["crisis", "seek_support", "vent", "ask_question", "share_negative", "share_positive", "casual"]
        all_intents = [r.intent for r in active_readings.values()]
        final_intent = next((ip for ip in intent_priority if ip in all_intents), "casual")

        text_e = active_readings["text"].emotion if "text" in active_readings else None
        face_e = active_readings["face"].emotion if "face" in active_readings else None
        voice_e = active_readings["voice"].emotion if "voice" in active_readings else None

        sentiment = "positive" if fused.emotion in POSITIVE_EMOTIONS else \
                    "negative" if fused.emotion in NEGATIVE_EMOTIONS else "neutral"

        ctx = EmotionContext(
            primaryEmotion=fused.emotion,
            confidence=fused.confidence / 100.0,
            stressLevel=final_stress_num,
            activeSources=sources,
            conflict=fused.conflict,
            timestamp=timestamp_iso,
            sentiment=sentiment,
            intent=final_intent,
            stress=final_stress_str,
            text_emotion=text_e,
            face_emotion=face_e,
            voice_emotion=voice_e,
        )
        ctx._conflict_detail = fused.conflict_detail
        self._record_trend(ctx)
        return ctx

    def _record_trend(self, ctx: EmotionContext) -> None:
        """Record reading to trend buffer and compute trend signal."""
        self.trend_buffer.append({
            "emotion": ctx.primaryEmotion,
            "confidence": ctx.confidence,
            "stress": ctx.stressLevel,
            "timestamp": ctx.timestamp,
        })
        if len(self.trend_buffer) > 50:
            self.trend_buffer.pop(0)

        # Detect trend (e.g. 3+ consecutive negative emotions)
        if len(self.trend_buffer) >= 3:
            last_3 = self.trend_buffer[-3:]
            if all(entry["emotion"] in NEGATIVE_EMOTIONS for entry in last_3):
                ctx._conversation_trend = "persistent_negative"
            elif all(entry["emotion"] in POSITIVE_EMOTIONS for entry in last_3):
                ctx._conversation_trend = "persistent_positive"


EmotionFusion = EmotionFusionEngine
