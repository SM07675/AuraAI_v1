"""
Risk Event model.

Tracks when the Safety Layer detects a crisis or severe risk signal,
along with the action taken by the system.
"""

from __future__ import annotations

from sqlalchemy import Boolean, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin


class RiskEvent(Base, TimestampMixin):
    """Safety/crisis risk event audit trail."""

    __tablename__ = "risk_events"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    session_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    trigger_type: Mapped[str] = mapped_column(
        String(50), nullable=False,
        comment="e.g. 'keyword', 'classifier', 'conflict_high_stress'"
    )
    action_taken: Mapped[str] = mapped_column(
        String(50), nullable=False,
        comment="e.g. 'resource_injected', 'hard_stop'"
    )
    resolved: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False,
        comment="Whether the risk was acknowledged or de-escalated"
    )

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="risk_events")  # noqa: F821
    session: Mapped["Session"] = relationship("Session", back_populates="risk_events")  # noqa: F821

    def __repr__(self) -> str:
        return f"<RiskEvent(id={self.id}, user_id={self.user_id}, session_id={self.session_id}, trigger_type='{self.trigger_type}')>"
