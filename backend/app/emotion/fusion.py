"""
Emotion Fusion — multi-modal emotion aggregation.

Fuses text, face, and (future) voice readings into a single active emotion state.
Handles freshness decay and source weighting.
"""

import time
from datetime import datetime, timezone
from dataclasses import dataclass
from typing import Optional, Dict, Any, List, Tuple

from app.emotion.base import EmotionContext, EmotionResult, POSITIVE_EMOTIONS, NEGATIVE_EMOTIONS
from app.core.logging_config import get_logger

logger = get_logger(__name__)

FRESHNESS_WINDOW_SECONDS = 5.0

# Source priorities/weights
SOURCE_WEIGHTS = {
    "text": 1.0,
    "voice": 0.7,
    "face": 0.4
}

@dataclass
class TimedEmotionResult:
    result: EmotionResult
    timestamp_unix: float

class EmotionFusionEngine:
    def __init__(self):
        self._last_readings: Dict[str, TimedEmotionResult] = {}
        self.trend_buffer: List[Dict[str, Any]] = []

    def reset(self):
        self._last_readings.clear()
        self.trend_buffer.clear()

    def update_reading(self, source: str, result: EmotionResult):
        """Update the latest reading for a specific source."""
        self._last_readings[source] = TimedEmotionResult(
            result=result,
            timestamp_unix=time.time()
        )

    def fuse(self) -> EmotionContext:
        """Produce a unified EmotionContext from all active sources within the freshness window."""
        now = time.time()
        active_readings: Dict[str, EmotionResult] = {}
        
        for source, timed_result in list(self._last_readings.items()):
            if now - timed_result.timestamp_unix <= FRESHNESS_WINDOW_SECONDS:
                active_readings[source] = timed_result.result
            else:
                # Evict stale readings
                del self._last_readings[source]

        sources = list(active_readings.keys())
        timestamp_iso = datetime.now(timezone.utc).isoformat()

        if not sources:
            return EmotionContext(
                primaryEmotion="neutral",
                confidence=0.0,
                stressLevel=0.0,
                activeSources=[],
                conflict=False,
                timestamp=timestamp_iso
            )

        # Single source
        if len(sources) == 1:
            source = sources[0]
            res = active_readings[source]
            stress_map = {"low": 0.2, "medium": 0.6, "high": 0.9}
            stress = stress_map.get(res.stress_level, 0.2)
            
            return EmotionContext(
                primaryEmotion=res.emotion,
                confidence=res.confidence / 100.0 if res.confidence > 1.0 else res.confidence,
                stressLevel=stress,
                activeSources=sources,
                conflict=False,
                timestamp=timestamp_iso
            )

        # Multiple sources: fusion logic
        total_weight = 0.0
        combined_scores: Dict[str, float] = {}
        
        # Calculate weighted scores
        for source, res in active_readings.items():
            conf = res.confidence / 100.0 if res.confidence > 1.0 else res.confidence
            w = SOURCE_WEIGHTS.get(source, 1.0) * conf
            total_weight += w
            
            combined_scores[res.emotion] = combined_scores.get(res.emotion, 0.0) + w

        # Find primary emotion
        if not total_weight:
            primary_emotion = "neutral"
            final_confidence = 0.0
        else:
            sorted_emotions = sorted(combined_scores.items(), key=lambda x: x[1], reverse=True)
            primary_emotion = sorted_emotions[0][0]
            final_confidence = min(1.0, sorted_emotions[0][1] / total_weight)

        # Conflict detection
        conflict = self._detect_conflict(active_readings)

        # Stress level scalar mapping and averaging
        stress_map = {"low": 0.2, "medium": 0.6, "high": 0.9}
        total_stress_weight = 0.0
        weighted_stress = 0.0
        for source, res in active_readings.items():
            s_val = stress_map.get(res.stress_level, 0.2)
            conf = res.confidence / 100.0 if res.confidence > 1.0 else res.confidence
            w = SOURCE_WEIGHTS.get(source, 1.0) * conf
            total_stress_weight += w
            weighted_stress += s_val * w
        
        final_stress = (weighted_stress / total_stress_weight) if total_stress_weight > 0 else 0.2

        ctx = EmotionContext(
            primaryEmotion=primary_emotion,
            confidence=final_confidence,
            stressLevel=final_stress,
            activeSources=sources,
            conflict=conflict,
            timestamp=timestamp_iso
        )

        logger.debug(f"Fused Emotion: {ctx.primaryEmotion} conf={ctx.confidence:.2f} stress={ctx.stressLevel:.2f}")
        
        # Maintain a limited trend buffer (last 50 readings)
        self.trend_buffer.append({
            "emotion": ctx.primaryEmotion,
            "confidence": ctx.confidence,
            "stress": ctx.stressLevel,
            "timestamp": ctx.timestamp
        })
        if len(self.trend_buffer) > 50:
            self.trend_buffer.pop(0)
            
        return ctx

    def _detect_conflict(self, active_readings: Dict[str, EmotionResult]) -> bool:
        """Detect if there's a serious conflict between modalities (e.g. happy text vs sad face)."""
        has_positive = False
        has_negative = False
        
        for res in active_readings.values():
            conf = res.confidence / 100.0 if res.confidence > 1.0 else res.confidence
            if conf > 0.5:
                if res.emotion in POSITIVE_EMOTIONS:
                    has_positive = True
                if res.emotion in NEGATIVE_EMOTIONS:
                    has_negative = True
                    
        return has_positive and has_negative


# Backward compatibility alias
EmotionFusion = EmotionFusionEngine
