"""
Affective Memory ORM Model — Longitudinal Cross-Session Emotional Memory (LAM).

Stores emotionally-significant moments, insights, and coping breakthroughs
extracted at session end with temporal and affective tags.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class AffectiveMemory(Base):
    __tablename__ = "affective_memories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    session_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("sessions.id", ondelete="SET NULL"), nullable=True)
    
    memory_text: Mapped[str] = mapped_column(Text, nullable=False)
    emotion_at_time: Mapped[str] = mapped_column(String(50), nullable=False, default="neutral")
    domain: Mapped[str] = mapped_column(String(50), nullable=False, default="wellness")
    importance_score: Mapped[float] = mapped_column(Float, default=1.0)
    referenced_count: Mapped[int] = mapped_column(Integer, default=0)
    
    session_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    user = relationship("User")
    session = relationship("Session")

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "user_id": self.user_id,
            "session_id": self.session_id,
            "memory_text": self.memory_text,
            "emotion_at_time": self.emotion_at_time,
            "domain": self.domain,
            "importance_score": self.importance_score,
            "referenced_count": self.referenced_count,
            "session_date": self.session_date.isoformat() if self.session_date else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
