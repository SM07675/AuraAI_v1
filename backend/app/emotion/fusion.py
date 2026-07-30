"""
Emotion Fusion — multi-modal emotion aggregation.

Takes per-modality EmotionResults and produces a single EmotionContext
that the LLM receives. No raw scores reach the LLM — only the structured
EmotionContext.to_prompt_dict() representation.

Fusion strategy
---------------
1. Dynamic weights: If only text available, weight = 1.0 for text.
   If face + text, weights are face=0.45, text=0.55 (face is more reliable
   for emotional state but text carries intent and nuance).
2. Primary emotion: Highest weighted-average scoring emotion.
3. Secondary emotion: Second-highest, only if score > 0.15.
4. Conflict detection: Fired when face and text disagree across valence
   boundaries (one positive, one negative) with confidence > 0.6.
5. Conversation trend: Analyzed from a buffer of recent turn emotions.
6. Per-emotion LLM guidance: Derived from the primary emotion label.

Mental health safety
--------------------
- Emotion predictions are signals, not facts. The LLM is instructed
  to treat them as possibilities, not diagnoses.
- If conflict detected, user's own words (text modality) take priority.
- Crisis intent always escalates the guidance regardless of valence.
"""

from __future__ import annotations

from collections import Counter
from typing import Any

from app.emotion.base import (
    EmotionContext,
    EmotionResult,
    NEGATIVE_EMOTIONS,
    POSITIVE_EMOTIONS,
    _EMOTION_GUIDANCE,
)
from app.core.logging_config import get_logger

logger = get_logger(__name__)

# Default per-modality weights when all sources available
_WEIGHTS_ALL = {"text": 0.50, "face": 0.35, "voice": 0.15}
# When only text + face
_WEIGHTS_TEXT_FACE = {"text": 0.55, "face": 0.45}
# When only text + voice
_WEIGHTS_TEXT_VOICE = {"text": 0.60, "voice": 0.40}
# When only face + voice
_WEIGHTS_FACE_VOICE = {"face": 0.55, "voice": 0.45}

# Minimum confidence to report a secondary emotion
_SECONDARY_THRESHOLD = 0.15
# Minimum confidence in both sources to declare a conflict
_CONFLICT_CONFIDENCE = 0.60
# Minimum trend turns to report a pattern
_TREND_MIN_TURNS = 3


class EmotionFusion:
    """Fuses per-modality EmotionResults into a single EmotionContext.

    Maintains a session-level trend buffer for pattern detection.
    One EmotionFusion instance per session.
    """

    def __init__(self) -> None:
        self._trend_buffer: list[dict[str, Any]] = []  # Per-turn emotion records

    def fuse(
        self,
        text: EmotionResult | None = None,
        face: EmotionResult | None = None,
        voice: EmotionResult | None = None,
    ) -> EmotionContext:
        """Produce a unified EmotionContext from available modality results.

        Args:
            text: Result from TextEmotionAnalyzer (or None).
            face: Result from FaceEmotionAnalyzer (or None).
            voice: Result from VoiceEmotionAnalyzer (or None).

        Returns:
            EmotionContext ready for LLM injection.
        """
        # Filter out mock/unavailable results
        available: dict[str, EmotionResult] = {}
        if text and not text.is_mock:
            available["text"] = text
        if face and not face.is_mock and face.face_detected:
            available["face"] = face
        if voice and not voice.is_mock:
            available["voice"] = voice

        sources = list(available.keys())

        if not available:
            return self._neutral_context()

        # Determine weights
        weights = self._select_weights(sources)

        # Weighted score fusion
        combined: dict[str, float] = {}
        total_weight = sum(weights.get(s, 0.0) for s in sources)

        for source, result in available.items():
            w = weights.get(source, 0.0) / total_weight if total_weight > 0 else 0.0
            for emotion, score in result.scores.items():
                combined[emotion] = combined.get(emotion, 0.0) + score * w

        # Primary + secondary
        sorted_emotions = sorted(combined.items(), key=lambda x: x[1], reverse=True)
        primary_emotion, primary_score = sorted_emotions[0] if sorted_emotions else ("neutral", 0.0)

        secondary_emotion: str | None = None
        secondary_score = 0.0
        if len(sorted_emotions) > 1:
            sec_label, sec_score = sorted_emotions[1]
            if sec_score >= _SECONDARY_THRESHOLD:
                secondary_emotion = sec_label
                secondary_score = sec_score

        confidence = min(1.0, primary_score)

        # Conflict detection
        conflict, conflict_detail = self._detect_conflict(available)

        # Aggregate qualitative signals
        stress = self._aggregate_stress(available)
        sentiment = self._derive_sentiment(primary_emotion, available)
        intent = self._aggregate_intent(available)

        # Conversation trend
        trend_str, trend_emotion = self._compute_trend(primary_emotion, sources)

        # LLM behavioral guidance
        guidance = self._build_guidance(
            primary_emotion=primary_emotion,
            stress=stress,
            intent=intent,
            conflict=conflict,
        )

        ctx = EmotionContext(
            primary_emotion=primary_emotion,
            secondary_emotion=secondary_emotion,
            confidence=round(confidence, 3),
            stress=stress,
            sentiment=sentiment,
            intent=intent,
            sources=sources,
            emotion_conflict=conflict,
            conflict_detail=conflict_detail,
            face_emotion=face.emotion if face and not face.is_mock else None,
            face_confidence=face.confidence if face and not face.is_mock else 0.0,
            face_detected=face.face_detected if face else None,
            text_emotion=text.emotion if text and not text.is_mock else None,
            text_confidence=text.confidence if text and not text.is_mock else 0.0,
            voice_emotion=voice.emotion if voice and not voice.is_mock else None,
            voice_confidence=voice.confidence if voice and not voice.is_mock else 0.0,
            conversation_trend=trend_str,
            trend_emotion=trend_emotion,
            guidance=guidance,
        )

        # Update trend buffer
        self._trend_buffer.append({
            "emotion": primary_emotion,
            "sentiment": sentiment,
            "stress": stress,
            "sources": sources,
        })
        if len(self._trend_buffer) > 20:
            self._trend_buffer = self._trend_buffer[-20:]

        logger.debug(
            "Emotion fused",
            primary=primary_emotion,
            secondary=secondary_emotion,
            confidence=round(confidence, 2),
            sources=sources,
            conflict=conflict,
            stress=stress,
        )

        return ctx

    # ── Internal helpers ──────────────────────────────────────────────────────

    def _select_weights(self, sources: list[str]) -> dict[str, float]:
        """Choose appropriate weights based on available sources."""
        key = frozenset(sources)
        if key == {"text", "face", "voice"}:
            return _WEIGHTS_ALL
        if key == {"text", "face"}:
            return _WEIGHTS_TEXT_FACE
        if key == {"text", "voice"}:
            return _WEIGHTS_TEXT_VOICE
        if key == {"face", "voice"}:
            return _WEIGHTS_FACE_VOICE
        # Single source: full weight
        return {s: 1.0 for s in sources}

    def _detect_conflict(
        self, available: dict[str, EmotionResult]
    ) -> tuple[bool, str]:
        """Detect when face and text disagree across valence boundaries.

        A conflict is meaningful when:
        - Both face and text are present
        - One is positive, the other is negative
        - Both have confidence > 60%

        Returns (conflict_flag, human-readable_description).
        """
        if "face" not in available or "text" not in available:
            return False, ""

        face_res = available["face"]
        text_res = available["text"]

        face_positive = face_res.emotion in POSITIVE_EMOTIONS
        text_positive = text_res.emotion in POSITIVE_EMOTIONS
        face_negative = face_res.emotion in NEGATIVE_EMOTIONS
        text_negative = text_res.emotion in NEGATIVE_EMOTIONS

        face_conf = face_res.confidence / 100.0
        text_conf = text_res.confidence / 100.0

        if (face_conf < _CONFLICT_CONFIDENCE or text_conf < _CONFLICT_CONFIDENCE):
            return False, ""

        if (face_negative and text_positive):
            return True, (
                f"Face appears {face_res.emotion} ({face_conf:.0%} confidence) "
                f"but words suggest {text_res.emotion} — "
                f"user may be masking their true feelings."
            )
        if (face_positive and text_negative):
            return True, (
                f"Face appears {face_res.emotion} ({face_conf:.0%} confidence) "
                f"but words suggest {text_res.emotion} — "
                f"context may differ from expressed state."
            )

        return False, ""

    def _aggregate_stress(self, available: dict[str, EmotionResult]) -> str:
        """Aggregate stress level — use the highest reported level."""
        order = {"high": 3, "medium": 2, "low": 1}
        levels = [r.stress_level for r in available.values()]
        return max(levels, key=lambda x: order.get(x, 0), default="low")

    def _derive_sentiment(
        self, primary_emotion: str, available: dict[str, EmotionResult]
    ) -> str:
        """Derive overall sentiment from primary emotion and text modality."""
        # Prefer text-reported sentiment when available
        if "text" in available:
            return available["text"].sentiment
        if primary_emotion in POSITIVE_EMOTIONS:
            return "positive"
        if primary_emotion in NEGATIVE_EMOTIONS:
            return "negative"
        return "neutral"

    def _aggregate_intent(self, available: dict[str, EmotionResult]) -> str:
        """Use text intent if available (most reliable for intent)."""
        if "text" in available:
            return available["text"].intent
        return "casual"

    def _compute_trend(
        self, current_emotion: str, sources: list[str]
    ) -> tuple[str, str | None]:
        """Analyze trend buffer for recurring emotional patterns.

        Returns (trend_description, trend_emotion_label).
        """
        buf = self._trend_buffer  # Does not include current turn yet
        if len(buf) < _TREND_MIN_TURNS:
            return "", None

        recent = buf[-_TREND_MIN_TURNS:]
        emotions = [t["emotion"] for t in recent]
        counter = Counter(emotions)
        dominant, count = counter.most_common(1)[0]

        if count < _TREND_MIN_TURNS:
            return "", None

        # Report only if the trend emotion is negative (clinically relevant)
        if dominant in NEGATIVE_EMOTIONS:
            negative_count = sum(1 for e in emotions if e in NEGATIVE_EMOTIONS)
            if negative_count >= _TREND_MIN_TURNS:
                trend_str = (
                    f"mood has been consistently {dominant} "
                    f"over the past {len(recent)} turns"
                )
                return trend_str, dominant

        return "", None

    def _build_guidance(
        self,
        primary_emotion: str,
        stress: str,
        intent: str,
        conflict: bool,
    ) -> dict[str, Any]:
        """Compose LLM behavioral guidance from emotion context."""
        base = dict(_EMOTION_GUIDANCE.get(primary_emotion, _EMOTION_GUIDANCE["neutral"]))

        # Override for crisis intent
        if intent == "crisis":
            base["tone"] = "deeply compassionate and calm"
            base["response_length"] = "short"
            base["focus"] = [
                "acknowledge their pain without minimizing",
                "gently mention professional support",
                "stay present and non-judgmental",
                "provide crisis hotline if appropriate",
            ]
            base["avoid"] = [
                "rushed advice",
                "dismissing their feelings",
                "lengthy responses",
            ]

        # High stress override
        elif stress == "high":
            base["response_length"] = "short"
            base["focus"].insert(0, "ground the user before anything else")

        # Conflict guidance
        if conflict:
            base["conflict_note"] = (
                "Face and text signals conflict. Ask a gentle clarifying question. "
                "Do NOT assume you know how they feel. Use 'It seems like...' "
                "or 'You seem a little quieter than usual — how are you actually feeling?'"
            )

        return base

    def _neutral_context(self) -> EmotionContext:
        """Return a safe neutral context when no modalities are available."""
        return EmotionContext(
            primary_emotion="neutral",
            secondary_emotion=None,
            confidence=0.0,
            stress="low",
            sentiment="neutral",
            intent="casual",
            sources=[],
            guidance=_EMOTION_GUIDANCE["neutral"],
        )

    def reset(self) -> None:
        """Reset trend buffer for a new session."""
        self._trend_buffer.clear()

    @property
    def trend_buffer(self) -> list[dict[str, Any]]:
        """Read-only access to the trend buffer."""
        return list(self._trend_buffer)
