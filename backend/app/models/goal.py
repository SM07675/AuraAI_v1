"""
Goal model.

Tracks structured user goals with status, category, priority,
milestones, and progress notes. Goals are discovered automatically
from conversation by the Goal Engine and can also be created manually.
"""

from __future__ import annotations

import enum
from typing import Optional

from sqlalchemy import Float, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin


class GoalStatus(str, enum.Enum):
    """Lifecycle status of a goal."""
    ACTIVE = "active"
    PAUSED = "paused"
    COMPLETED = "completed"
    ABANDONED = "abandoned"


class GoalCategory(str, enum.Enum):
    """High-level goal categories."""
    CAREER = "career"
    LEARNING = "learning"
    FITNESS = "fitness"
    MENTAL_WELLNESS = "mental_wellness"
    PROGRAMMING = "programming"
    RESEARCH = "research"
    CREATIVE = "creative"
    PERSONAL = "personal"
    OTHER = "other"


class UserGoal(Base, TimestampMixin):
    """A user goal tracked over time.

    Goals are discovered from conversation (via Goal Engine) or created
    manually. They persist across sessions and inform the AI's context.
    """

    __tablename__ = "user_goals"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    title: Mapped[str] = mapped_column(
        String(500), nullable=False,
        comment="Short descriptive title, e.g. 'Learn Data Science'",
    )
    description: Mapped[Optional[str]] = mapped_column(
        Text, default=None,
        comment="Detailed description of what the user wants to achieve",
    )
    category: Mapped[str] = mapped_column(
        String(50), default=GoalCategory.OTHER.value, nullable=False,
        comment="Category: career, learning, fitness, mental_wellness, etc.",
    )
    status: Mapped[str] = mapped_column(
        String(20), default=GoalStatus.ACTIVE.value, nullable=False, index=True,
        comment="Lifecycle status: active, paused, completed, abandoned",
    )
    priority: Mapped[float] = mapped_column(
        Float, default=0.5, nullable=False,
        comment="Priority score 0.0–1.0 (higher = more important)",
    )
    progress_notes: Mapped[Optional[str]] = mapped_column(
        Text, default=None,
        comment="Rolling notes about progress towards this goal",
    )
    milestones: Mapped[Optional[dict]] = mapped_column(
        JSONB, default=None,
        comment="JSON array of milestone objects: [{title, completed, date}]",
    )
    source_session_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("sessions.id", ondelete="SET NULL"), default=None,
        comment="Session where this goal was first detected",
    )
    metadata_json: Mapped[Optional[dict]] = mapped_column(
        JSONB, default=None,
        comment="Arbitrary metadata for extensibility",
    )

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="goals_list")  # noqa: F821

    def __repr__(self) -> str:
        return (
            f"<UserGoal(id={self.id}, title='{self.title[:40]}', "
            f"status='{self.status}', category='{self.category}')>"
        )

    def to_context_dict(self) -> dict:
        """Return a dict suitable for prompt context injection."""
        return {
            "id": self.id,
            "title": self.title,
            "category": self.category,
            "status": self.status,
            "priority": self.priority,
            "description": self.description or "",
            "progress_notes": self.progress_notes or "",
        }
