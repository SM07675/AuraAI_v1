"""
Conversation summary SQLAlchemy ORM model for hierarchical long-term summaries.
"""

from __future__ import annotations

from typing import Optional

from sqlalchemy import ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class ConversationSummary(Base, TimestampMixin):
    """Hierarchical and rolling conversation summary for long-term context."""

    __tablename__ = "conversation_summaries"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    session_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    summary_type: Mapped[str] = mapped_column(String(30), default="rolling", nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    key_entities: Mapped[Optional[dict]] = mapped_column(JSONB, default=None)
    key_takeaways: Mapped[Optional[dict]] = mapped_column(JSONB, default=None)
    turn_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    def __repr__(self) -> str:
        return f"<ConversationSummary(id={self.id}, session={self.session_id}, type='{self.summary_type}')>"
