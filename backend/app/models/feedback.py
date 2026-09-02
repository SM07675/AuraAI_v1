"""
Feedback ORM Model — User Feedback Collection for Solutions & Fine-Tuning Dataset.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class SolutionFeedback(Base):
    __tablename__ = "solution_feedbacks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    session_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("sessions.id", ondelete="SET NULL"), nullable=True)

    solution_id: Mapped[str] = mapped_column(String(100), nullable=False)
    solution_type: Mapped[str] = mapped_column(String(50), nullable=False)
    domain: Mapped[str] = mapped_column(String(50), default="wellness")
    rating: Mapped[int] = mapped_column(Integer, default=5)  # 1 to 5 stars
    helpful: Mapped[bool] = mapped_column(Boolean, default=True)
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)

    user = relationship("User")
    session = relationship("Session")

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "user_id": self.user_id,
            "session_id": self.session_id,
            "solution_id": self.solution_id,
            "solution_type": self.solution_type,
            "domain": self.domain,
            "rating": self.rating,
            "helpful": self.helpful,
            "comment": self.comment,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
