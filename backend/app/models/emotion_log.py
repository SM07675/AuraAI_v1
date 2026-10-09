"""
Emotion Log ORM Model — Longitudinal Affect Tracking & Behavioral Analytics.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class EmotionLog(Base):
    __tablename__ = "emotion_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    session_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("sessions.id", ondelete="SET NULL"), nullable=True)
    message_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("messages.id", ondelete="SET NULL"), nullable=True)

    text_emotion: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    voice_emotion: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    face_emotion: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    fused_emotion: Mapped[str] = mapped_column(String(50), nullable=False, default="neutral")
    confidence: Mapped[float] = mapped_column(Float, default=0.85)
    raw_scores: Mapped[Optional[dict]] = mapped_column(JSONB, default=dict)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    user = relationship("User")
    session = relationship("Session", back_populates="emotion_logs")

    @property
    def primary_emotion(self) -> str:
        return self.fused_emotion or "neutral"

    @property
    def stress_level(self) -> str:
        if self.fused_emotion in ["anxious", "anxiety", "fear", "stressed"]:
            return "high"
        elif self.fused_emotion in ["sad", "sadness", "frustrated"]:
            return "moderate"
        return "low"

    @property
    def sentiment(self) -> str:
        if self.fused_emotion in ["happy", "calm", "joy"]:
            return "positive"
        elif self.fused_emotion in ["sad", "frustrated", "anxious", "fear"]:
            return "negative"
        return "neutral"

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "user_id": self.user_id,
            "session_id": self.session_id,
            "primary_emotion": self.primary_emotion,
            "fused_emotion": self.fused_emotion,
            "face_emotion": self.face_emotion,
            "voice_emotion": self.voice_emotion,
            "text_emotion": self.text_emotion,
            "confidence": self.confidence,
            "stress_level": self.stress_level,
            "sentiment": self.sentiment,
            "raw_scores": self.raw_scores or {},
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
