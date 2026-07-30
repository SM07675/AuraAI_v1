"""
Message model.

Stores individual messages in a conversation session.
Each message has a role (user or assistant), content, and optional metadata.
"""

from __future__ import annotations

import enum
from typing import Optional

from sqlalchemy import ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin


class MessageRole(str, enum.Enum):
    """Who sent the message."""
    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"


class MessageType(str, enum.Enum):
    """Type of message content."""
    TEXT = "text"
    AUDIO = "audio"
    MIXED = "mixed"


class Message(Base, TimestampMixin):
    """Individual message within a conversation session."""

    __tablename__ = "messages"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    session_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    message_type: Mapped[str] = mapped_column(String(20), default=MessageType.TEXT.value)

    # Emotion data captured at message time (stored as JSON)
    emotion_data: Mapped[Optional[dict]] = mapped_column(JSONB, default=None)

    # AI provider metadata (which provider generated this response)
    ai_provider: Mapped[Optional[str]] = mapped_column(String(50), default=None)
    ai_model: Mapped[Optional[str]] = mapped_column(String(100), default=None)

    # Token usage tracking
    prompt_tokens: Mapped[Optional[int]] = mapped_column(Integer, default=None)
    completion_tokens: Mapped[Optional[int]] = mapped_column(Integer, default=None)

    # Relationships
    session: Mapped["Session"] = relationship("Session", back_populates="messages")  # noqa: F821

    def __repr__(self) -> str:
        return f"<Message(id={self.id}, role='{self.role}', session_id={self.session_id})>"
