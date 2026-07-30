"""
ActivityLog model.

Records user actions for audit trail and security monitoring.
Stores IP addresses and action details for compliance.
"""

from __future__ import annotations

from typing import Optional

from sqlalchemy import ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin


class ActivityLog(Base, TimestampMixin):
    """Audit log of user actions.

    Records significant actions for security, compliance, and debugging.
    """

    __tablename__ = "activity_logs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    action: Mapped[str] = mapped_column(
        String(100), nullable=False, index=True,
        comment="Action type (e.g., login, logout, profile_update, chat_send)",
    )
    details: Mapped[Optional[dict]] = mapped_column(
        JSONB, default=None,
        comment="Additional action details",
    )
    ip_address: Mapped[Optional[str]] = mapped_column(String(45), default=None)
    user_agent: Mapped[Optional[str]] = mapped_column(Text, default=None)

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="activity_logs")  # noqa: F821

    def __repr__(self) -> str:
        return f"<ActivityLog(id={self.id}, user_id={self.user_id}, action='{self.action}')>"
