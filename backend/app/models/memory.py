"""
Memory models for Aura AI 2.0.

ShortTermMemory: Ephemeral, session-scoped conversation context.
LongTermMemory: Persistent user knowledge — preferences, goals, facts, summaries, embeddings.
MemoryVersion: Versioning history for memory evolution and deduplication merges.
"""

from __future__ import annotations

import enum
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin
from app.utils.encryption import EncryptedText


class MemoryType(str, enum.Enum):
    """Categories of long-term memory."""
    PREFERENCE = "preference"
    GOAL = "goal"
    INTEREST = "interest"
    FACT = "fact"
    SUMMARY = "summary"
    PERSONALITY = "personality"
    PROJECT = "project"
    CONCEPT = "concept"


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
    value: Mapped[str] = mapped_column(EncryptedText, nullable=False)
    metadata_json: Mapped[Optional[dict]] = mapped_column(JSONB, default=None)

    def __repr__(self) -> str:
        return f"<ShortTermMemory(id={self.id}, key='{self.key}')>"


class LongTermMemory(Base, TimestampMixin):
    """Persistent user knowledge stored across sessions.

    Stores important facts, preferences, goals, and conversation summaries.
    Each memory has an importance score, confidence, semantic embedding, and version.
    """

    __tablename__ = "long_term_memories"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    memory_type: Mapped[str] = mapped_column(
        String(50), nullable=False, index=True,
        comment="Type of memory: preference, goal, interest, fact, summary, personality, project",
    )
    key: Mapped[str] = mapped_column(
        String(255), nullable=False,
        comment="Short identifier for this memory (e.g., 'favorite_color', 'career_goal')",
    )
    value: Mapped[str] = mapped_column(
        EncryptedText, nullable=False,
        comment="The actual memory content",
    )
    importance_score: Mapped[float] = mapped_column(
        Float, default=0.5, nullable=False,
        comment="Importance score 0.0–1.0 for retrieval ranking",
    )
    confidence: Mapped[float] = mapped_column(
        Float, default=0.85, nullable=False,
        comment="Extraction confidence 0.0–1.0",
    )
    source: Mapped[str] = mapped_column(
        String(100), default="conversation", nullable=False,
        comment="Source of memory: conversation, explicit_user_input, profile_sync, system_inferred",
    )
    version: Mapped[int] = mapped_column(
        Integer, default=1, nullable=False,
        comment="Current version number for updates and deduplication tracking",
    )
    privacy_level: Mapped[str] = mapped_column(
        String(20), default="private", nullable=False,
        comment="Privacy level: public, private, sensitive, clinical",
    )
    last_used_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), default=None,
        comment="Timestamp when this memory was last retrieved in prompt context",
    )
    expires_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), default=None,
        comment="Optional expiration date for time-sensitive memories",
    )
    embedding_json: Mapped[Optional[list]] = mapped_column(
        JSONB, default=None,
        comment="Dense embedding vector array for semantic retrieval",
    )
    source_session_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("sessions.id", ondelete="SET NULL"), default=None,
    )
    metadata_json: Mapped[Optional[dict]] = mapped_column(JSONB, default=None)

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="memories")  # noqa: F821
    versions: Mapped[list["MemoryVersion"]] = relationship(
        "MemoryVersion", back_populates="memory", cascade="all, delete-orphan",
        order_by="MemoryVersion.version_number.desc()",
    )

    def __repr__(self) -> str:
        return f"<LongTermMemory(id={self.id}, type='{self.memory_type}', key='{self.key}', v={self.version})>"

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "user_id": self.user_id,
            "type": self.memory_type,
            "key": self.key,
            "value": self.value,
            "importance": self.importance_score,
            "confidence": self.confidence,
            "source": self.source,
            "version": self.version,
            "privacy_level": self.privacy_level,
            "last_used_at": self.last_used_at.isoformat() if self.last_used_at else None,
            "created_at": self.created_at.isoformat() if hasattr(self, "created_at") and self.created_at else None,
            "updated_at": self.updated_at.isoformat() if hasattr(self, "updated_at") and self.updated_at else None,
        }


class MemoryVersion(Base, TimestampMixin):
    """Historical versions of modified or merged memories."""

    __tablename__ = "memory_versions"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    memory_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("long_term_memories.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    value: Mapped[str] = mapped_column(EncryptedText, nullable=False)
    importance_score: Mapped[float] = mapped_column(Float, default=0.5, nullable=False)
    change_reason: Mapped[str] = mapped_column(
        String(255), default="user_update", nullable=False,
        comment="Reason for modification: user_update, deduplication_merge, decay, refinement",
    )
    metadata_json: Mapped[Optional[dict]] = mapped_column(JSONB, default=None)

    # Relationships
    memory: Mapped["LongTermMemory"] = relationship("LongTermMemory", back_populates="versions")

    def __repr__(self) -> str:
        return f"<MemoryVersion(id={self.id}, memory_id={self.memory_id}, v={self.version_number})>"


# Backward compatibility alias
Memory = LongTermMemory
