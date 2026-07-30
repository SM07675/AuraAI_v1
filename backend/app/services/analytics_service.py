"""
Analytics Service — tracks pipeline metrics and conversation analytics.

Collects per-session and aggregate metrics:
  - Turn count, average response latency, interrupt frequency
  - Emotion trends per session
  - Goal progress events
  - Memory creation rate
  - Provider usage and fallback frequency
  - Pipeline stage timing

Designed for the debug panel and future dashboard integration.
"""

from __future__ import annotations

import time
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Any

from app.core.logging_config import get_logger

logger = get_logger(__name__)


@dataclass
class PipelineStageMetric:
    """Timing for a single pipeline stage execution."""
    stage: str
    duration_ms: float
    timestamp: float


@dataclass
class TurnMetric:
    """Metrics for a single conversation turn."""
    turn_number: int
    user_text: str
    response_length: int
    total_latency_ms: float
    stages: list[PipelineStageMetric] = field(default_factory=list)
    emotion: str = "neutral"
    provider_used: str = "unknown"
    was_interrupted: bool = False
    memories_created: int = 0
    goals_detected: int = 0


class AnalyticsService:
    """Per-session analytics collector.

    One AnalyticsService instance per voice/chat session.
    Aggregates metrics and provides snapshots for the debug panel.

    Args:
        session_id: Voice or chat session identifier.
        user_id: Authenticated user ID.
    """

    def __init__(self, session_id: str, user_id: int = 0) -> None:
        self._session_id = session_id
        self._user_id = user_id
        self._session_start = time.monotonic()

        # Per-turn metrics
        self._turns: list[TurnMetric] = []
        self._current_turn: int = 0

        # Pipeline stage timing (for current turn)
        self._stage_start: float | None = None
        self._current_stages: list[PipelineStageMetric] = []

        # Aggregate counters
        self._total_latency_ms: float = 0.0
        self._interrupt_count: int = 0
        self._fallback_count: int = 0
        self._error_count: int = 0

        # Emotion trends
        self._emotion_history: list[dict[str, Any]] = []

        # Provider tracking
        self._provider_usage: dict[str, int] = defaultdict(int)

        # Memory tracking
        self._total_memories_created: int = 0
        self._total_goals_detected: int = 0

    # ── Pipeline Stage Timing ─────────────────────────────────────

    def start_stage(self, stage_name: str) -> None:
        """Mark the start of a pipeline stage."""
        self._stage_start = time.monotonic()
        logger.debug(
            "Pipeline stage started",
            session_id=self._session_id,
            stage=stage_name,
        )

    def end_stage(self, stage_name: str) -> float:
        """Mark the end of a pipeline stage. Returns duration in ms."""
        if self._stage_start is None:
            return 0.0

        duration_ms = (time.monotonic() - self._stage_start) * 1000
        self._current_stages.append(
            PipelineStageMetric(
                stage=stage_name,
                duration_ms=round(duration_ms, 2),
                timestamp=time.monotonic(),
            )
        )
        self._stage_start = None

        logger.debug(
            "Pipeline stage completed",
            session_id=self._session_id,
            stage=stage_name,
            duration_ms=round(duration_ms, 2),
        )
        return duration_ms

    # ── Turn Tracking ─────────────────────────────────────────────

    def start_turn(self, user_text: str) -> None:
        """Mark the start of a new conversation turn."""
        self._current_turn += 1
        self._current_stages = []
        self._stage_start = None
        self.start_stage("total_turn")

    def end_turn(
        self,
        user_text: str,
        response_length: int,
        emotion: str = "neutral",
        provider: str = "unknown",
        was_interrupted: bool = False,
        memories_created: int = 0,
        goals_detected: int = 0,
    ) -> TurnMetric:
        """Record the completion of a conversation turn."""
        total_ms = self.end_stage("total_turn")
        self._total_latency_ms += total_ms

        if was_interrupted:
            self._interrupt_count += 1

        self._provider_usage[provider] += 1
        self._total_memories_created += memories_created
        self._total_goals_detected += goals_detected

        metric = TurnMetric(
            turn_number=self._current_turn,
            user_text=user_text[:100],
            response_length=response_length,
            total_latency_ms=round(total_ms, 2),
            stages=list(self._current_stages),
            emotion=emotion,
            provider_used=provider,
            was_interrupted=was_interrupted,
            memories_created=memories_created,
            goals_detected=goals_detected,
        )
        self._turns.append(metric)

        # Track emotion trend
        self._emotion_history.append({
            "turn": self._current_turn,
            "emotion": emotion,
            "timestamp": time.monotonic(),
        })

        logger.info(
            "Turn completed",
            session_id=self._session_id,
            turn=self._current_turn,
            latency_ms=round(total_ms, 2),
            emotion=emotion,
        )

        return metric

    # ── Event Recording ───────────────────────────────────────────

    def record_error(self, error_type: str = "unknown") -> None:
        """Record an error occurrence."""
        self._error_count += 1
        logger.warning(
            "Analytics: error recorded",
            session_id=self._session_id,
            error_type=error_type,
            total_errors=self._error_count,
        )

    def record_fallback(self, from_provider: str, to_provider: str) -> None:
        """Record an AI provider fallback event."""
        self._fallback_count += 1
        logger.info(
            "Analytics: provider fallback",
            session_id=self._session_id,
            from_provider=from_provider,
            to_provider=to_provider,
        )

    # ── Snapshots ─────────────────────────────────────────────────

    def get_session_snapshot(self) -> dict[str, Any]:
        """Return a comprehensive snapshot of session analytics."""
        session_duration_s = time.monotonic() - self._session_start
        avg_latency = (
            self._total_latency_ms / len(self._turns) if self._turns else 0.0
        )

        return {
            "session_id": self._session_id,
            "user_id": self._user_id,
            "session_duration_s": round(session_duration_s, 1),
            "total_turns": self._current_turn,
            "avg_response_latency_ms": round(avg_latency, 2),
            "total_latency_ms": round(self._total_latency_ms, 2),
            "interrupt_count": self._interrupt_count,
            "fallback_count": self._fallback_count,
            "error_count": self._error_count,
            "provider_usage": dict(self._provider_usage),
            "total_memories_created": self._total_memories_created,
            "total_goals_detected": self._total_goals_detected,
            "emotion_history": self._emotion_history[-20:],  # Last 20
        }

    def get_current_turn_stages(self) -> list[dict[str, Any]]:
        """Return pipeline stage timings for the current turn."""
        return [
            {
                "stage": s.stage,
                "duration_ms": s.duration_ms,
            }
            for s in self._current_stages
        ]

    def get_last_turn(self) -> TurnMetric | None:
        """Return metrics for the most recent completed turn."""
        return self._turns[-1] if self._turns else None

    def get_emotion_trend(self, last_n: int = 10) -> list[dict[str, Any]]:
        """Return the last N emotion readings."""
        return self._emotion_history[-last_n:]
