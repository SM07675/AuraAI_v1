"""
Proactive Engine — Subtle Affective Check-In & Non-Verbal Escalation Sentinel.

Evaluates continuous biometric feeds and conversational lulls to trigger
subtle, warm companion nudges and UI pulses without being disruptive.
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any

from app.core.logging_config import get_logger

logger = get_logger(__name__)


@dataclass
class ProactiveSignal:
    trigger_type: str  # "sustained_tension" | "silence_lull" | "session_welcome" | "recovery_celebration"
    message: str
    pulse_intensity: str  # "subtle" | "medium"
    recommended_action: str | None = None


class ProactiveEngine:
    """Evaluates facial telemetry streams and conversation timing for proactive signals."""

    def __init__(self) -> None:
        self._last_trigger_time: float = 0.0
        self._cooldown_seconds: float = 45.0  # Avoid frequent interruptions

    def evaluate(
        self,
        recent_face_emotions: list[dict[str, Any]] | None,
        turn_count: int,
        seconds_since_last_message: float,
        user_name: str = "Friend",
        dominant_emotion: str = "neutral",
    ) -> ProactiveSignal | None:
        """Assess if a proactive gentle nudge or subtle UI pulse is warranted."""
        now = time.monotonic()
        if (now - self._last_trigger_time) < self._cooldown_seconds:
            return None

        # 1. Sustained Tension / Brow Furrow (AU04 > 2.0 or negative affect across recent frames)
        if recent_face_emotions and len(recent_face_emotions) >= 5:
            high_tension_frames = sum(
                1 for f in recent_face_emotions
                if f.get("stress") in ("medium", "high") or (f.get("action_units", {}).get("intensity", {}).get("AU04", 0.0) > 2.0)
            )
            if high_tension_frames >= 4:
                self._last_trigger_time = now
                logger.info("Proactive sustained tension trigger fired", user=user_name)
                return ProactiveSignal(
                    trigger_type="sustained_tension",
                    message=f"I noticed you're carrying a little tension right now. Whenever you're ready, we can take a gentle breath together.",
                    pulse_intensity="subtle",
                    recommended_action="breathing_exercise",
                )

        # 2. Long silence lull in live session (> 50 seconds without user response)
        if seconds_since_last_message >= 50.0 and turn_count >= 1:
            self._last_trigger_time = now
            logger.info("Proactive silence lull trigger fired", user=user_name)
            return ProactiveSignal(
                trigger_type="silence_lull",
                message="Take all the time you need. I'm right here with you.",
                pulse_intensity="subtle",
                recommended_action=None,
            )

        return None
