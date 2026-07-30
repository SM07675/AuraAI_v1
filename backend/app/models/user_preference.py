"""
UserPreference model.

Flexible key-value storage for user preferences, organized by category.
Supports JSONB values for complex preference structures.
"""

from __future__ import annotations

from typing import Optional

from sqlalchemy import ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin


class UserPreference(Base, TimestampMixin):
    """User preference key-value store.

    Organized by category (e.g., "notifications", "appearance", "ai_behavior")
    with flexible JSONB values to support complex preferences.
    """

    __tablename__ = "user_preferences"
    __table_args__ = (
        UniqueConstraint("user_id", "category", "key", name="uq_user_pref_category_key"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    category: Mapped[str] = mapped_column(
        String(100), nullable=False,
        comment="Preference category (e.g., notifications, ai_behavior, appearance)",
    )
    key: Mapped[str] = mapped_column(
        String(255), nullable=False,
        comment="Preference key within the category",
    )
    value: Mapped[Optional[dict]] = mapped_column(
        JSONB, default=None,
        comment="Preference value (JSON-compatible)",
    )

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="preferences")  # noqa: F821

    def __repr__(self) -> str:
        return f"<UserPreference(user_id={self.user_id}, category='{self.category}', key='{self.key}')>"
