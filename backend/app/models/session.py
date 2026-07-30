"""
Session model.

Represents a conversation session between a user and Aura.
A session groups related messages together and can have a summary.
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin

import enum


class SessionStatus(str, enum.Enum):
    """Possible states of a conversation session."""
    ACTIVE = "active"
    ENDED = "ended"
    ARCHIVED = "archived"


class Session(Base, TimestampMixin):
    """Conversation session."""

    __tablename__ = "sessions"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    title: Mapped[Optional[str]] = mapped_column(String(255), default=None)
    status: Mapped[str] = mapped_column(
        String(20), default=SessionStatus.ACTIVE.value, nullable=False,
    )
    summary: Mapped[Optional[str]] = mapped_column(Text, default=None)
    ended_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), default=None)

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="sessions")  # noqa: F821
    messages: Mapped[list["Message"]] = relationship(  # noqa: F821
        "Message", back_populates="session", cascade="all, delete-orphan",
        order_by="Message.created_at",
    )
    emotion_logs: Mapped[list["EmotionLog"]] = relationship(  # noqa: F821
        "EmotionLog", back_populates="session", cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<Session(id={self.id}, user_id={self.user_id}, status='{self.status}')>"
