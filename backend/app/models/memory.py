"""
Memory models.

ShortTermMemory: Ephemeral, session-scoped conversation context.
LongTermMemory: Persistent user knowledge — preferences, goals, facts, summaries.
"""

from __future__ import annotations

import enum
from typing import Optional

from sqlalchemy import Float, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin


class MemoryType(str, enum.Enum):
    """Categories of long-term memory."""
    PREFERENCE = "preference"
    GOAL = "goal"
    INTEREST = "interest"
    FACT = "fact"
    SUMMARY = "summary"
    PERSONALITY = "personality"


class ShortTermMemory(Base, TimestampMixin):
    """Session-scoped conversation context.

    Stores recent conversation state and context for the current session.
    Cleared when the session ends (or can be archived).
    """

    __tablename__ = "short_term_memories"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    session_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    key: Mapped[str] = mapped_column(String(255), nullable=False)
    value: Mapped[str] = mapped_column(Text, nullable=False)
    metadata_json: Mapped[Optional[dict]] = mapped_column(JSONB, default=None)

    def __repr__(self) -> str:
        return f"<ShortTermMemory(id={self.id}, key='{self.key}')>"


class LongTermMemory(Base, TimestampMixin):
    """Persistent user knowledge stored across sessions.

    Stores important facts, preferences, goals, and conversation summaries.
    Each memory has an importance score for retrieval ranking.
    """

    __tablename__ = "long_term_memories"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    memory_type: Mapped[str] = mapped_column(
        String(50), nullable=False, index=True,
        comment="Type of memory: preference, goal, interest, fact, summary, personality",
    )
    key: Mapped[str] = mapped_column(
        String(255), nullable=False,
        comment="Short identifier for this memory (e.g., 'favorite_color', 'career_goal')",
    )
    value: Mapped[str] = mapped_column(
        Text, nullable=False,
        comment="The actual memory content",
    )
    importance_score: Mapped[float] = mapped_column(
        Float, default=0.5, nullable=False,
        comment="Importance score 0.0–1.0 for retrieval ranking",
    )
    source_session_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("sessions.id", ondelete="SET NULL"), default=None,
    )
    metadata_json: Mapped[Optional[dict]] = mapped_column(JSONB, default=None)

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="memories")  # noqa: F821

    def __repr__(self) -> str:
        return f"<LongTermMemory(id={self.id}, type='{self.memory_type}', key='{self.key}')>"
