"""
Latency metrics SQLAlchemy ORM model for real-time turn tracing and observability.
"""

from __future__ import annotations

from typing import Optional

from sqlalchemy import Boolean, Float, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class LatencyMetric(Base, TimestampMixin):
    """Stores granular per-turn latency breakdown and model trace metrics."""

    __tablename__ = "latency_metrics"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    trace_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    session_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    turn_id: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    context_version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    prompt_version: Mapped[str] = mapped_column(String(32), default="2.0", nullable=False)
    provider: Mapped[str] = mapped_column(String(50), default="nvidia_nim", nullable=False)
    model: Mapped[str] = mapped_column(String(100), default="default", nullable=False)
    is_fast_path: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    cache_hit: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    retrieval_latency_ms: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    graph_latency_ms: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    vector_latency_ms: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    prompt_build_latency_ms: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    llm_ttft_ms: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    llm_total_latency_ms: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    tts_first_audio_ms: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    tts_total_latency_ms: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    total_turn_latency_ms: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    metadata_json: Mapped[Optional[dict]] = mapped_column(JSONB, default=None)

    def __repr__(self) -> str:
        return f"<LatencyMetric(id={self.id}, trace='{self.trace_id}', total_ms={self.total_turn_latency_ms})>"
