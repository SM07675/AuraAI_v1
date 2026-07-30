"""
Setting model.

Application-level settings stored in the database.
Supports categorized key-value pairs with JSONB values.
"""

from __future__ import annotations

from typing import Optional

from sqlalchemy import String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class Setting(Base, TimestampMixin):
    """Application setting.

    Global configuration that can be changed at runtime without
    restarting the application. Not user-specific.
    """

    __tablename__ = "settings"
    __table_args__ = (
        UniqueConstraint("category", "key", name="uq_setting_category_key"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    category: Mapped[str] = mapped_column(
        String(100), nullable=False, index=True,
        comment="Setting category (e.g., ai, tts, system)",
    )
    key: Mapped[str] = mapped_column(String(255), nullable=False)
    value: Mapped[Optional[dict]] = mapped_column(JSONB, default=None)
    description: Mapped[Optional[str]] = mapped_column(Text, default=None)

    def __repr__(self) -> str:
        return f"<Setting(category='{self.category}', key='{self.key}')>"
