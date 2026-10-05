"""
Emotion Log ORM Model — Longitudinal Affect Tracking & Behavioral Analytics.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class EmotionLog(Base):
    __tablename__ = "emotion_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    session_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("sessions.id", ondelete="SET NULL"), nullable=True)

    primary_emotion: Mapped[str] = mapped_column(String(50), nullable=False)
    confidence: Mapped[float] = mapped_column(Float, default=0.85)
    stress_level: Mapped[str] = mapped_column(String(30), default="low")
    sentiment: Mapped[str] = mapped_column(String(30), default="neutral")
    domain: Mapped[str] = mapped_column(String(50), default="wellness")
    sources: Mapped[str] = mapped_column(String(100), default="text")

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)

    user = relationship("User")
    session = relationship("Session", back_populates="emotion_logs")

    @property
    def fused_emotion(self) -> str:
        return self.primary_emotion

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "user_id": self.user_id,
            "session_id": self.session_id,
            "primary_emotion": self.primary_emotion,
            "confidence": self.confidence,
            "stress_level": self.stress_level,
            "sentiment": self.sentiment,
            "domain": self.domain,
            "sources": self.sources,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
