"""
User model.

Stores account credentials, profile information, and personalization settings.
"""

from __future__ import annotations

from typing import Optional

from sqlalchemy import String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, SoftDeleteMixin


class User(Base, TimestampMixin, SoftDeleteMixin):
    """User account and profile."""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)

    # Profile fields
    preferred_language: Mapped[Optional[str]] = mapped_column(String(10), default="en")
    timezone: Mapped[Optional[str]] = mapped_column(String(50), default="UTC")
    communication_style: Mapped[Optional[str]] = mapped_column(
        String(50), default="balanced",
        comment="Communication preference: concise, balanced, detailed",
    )
    interests: Mapped[Optional[str]] = mapped_column(
        Text, default="",
        comment="Comma-separated list of interests",
    )
    goals: Mapped[Optional[str]] = mapped_column(
        Text, default="",
        comment="Comma-separated list of goals",
    )
    skills: Mapped[Optional[str]] = mapped_column(
        Text, default="",
        comment="Comma-separated list of skills",
    )
    projects: Mapped[Optional[str]] = mapped_column(
        Text, default="",
        comment="Comma-separated list of projects",
    )
    learning_style: Mapped[Optional[str]] = mapped_column(
        String(50), default="visual",
        comment="Learning preference (e.g. visual, auditory, kinesthetic)",
    )
    favourite_topics: Mapped[Optional[str]] = mapped_column(
        Text, default="",
        comment="Comma-separated list of favourite topics",
    )

    # Notification preferences (JSON-compatible string, or use JSONB in future)
    notification_preferences: Mapped[Optional[str]] = mapped_column(Text, default="{}")

    # Relationships
    sessions: Mapped[list["Session"]] = relationship(  # noqa: F821
        "Session", back_populates="user", cascade="all, delete-orphan",
    )
    preferences: Mapped[list["UserPreference"]] = relationship(  # noqa: F821
        "UserPreference", back_populates="user", cascade="all, delete-orphan",
    )
    memories: Mapped[list["LongTermMemory"]] = relationship(  # noqa: F821
        "LongTermMemory", back_populates="user", cascade="all, delete-orphan",
    )
    activity_logs: Mapped[list["ActivityLog"]] = relationship(  # noqa: F821
        "ActivityLog", back_populates="user", cascade="all, delete-orphan",
    )
    reports: Mapped[list["Report"]] = relationship(  # noqa: F821
        "Report", back_populates="user", cascade="all, delete-orphan",
    )
    goals_list: Mapped[list["UserGoal"]] = relationship(  # noqa: F821
        "UserGoal", back_populates="user", cascade="all, delete-orphan",
    )
    risk_events: Mapped[list["RiskEvent"]] = relationship(  # noqa: F821
        "RiskEvent", back_populates="user", cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<User(id={self.id}, email='{self.email}')>"
