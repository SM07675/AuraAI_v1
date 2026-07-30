"""
Report model.

Stores session reports, emotion summaries, and generated PDF paths.
"""

from __future__ import annotations

from typing import Optional

from sqlalchemy import ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin


class Report(Base, TimestampMixin):
    """Session report or analysis document."""

    __tablename__ = "reports"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    session_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("sessions.id", ondelete="SET NULL"), default=None,
    )
    report_type: Mapped[str] = mapped_column(
        String(50), nullable=False, default="session_summary",
        comment="Type: session_summary, emotion_report, weekly_digest",
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    pdf_path: Mapped[Optional[str]] = mapped_column(String(500), default=None)
    metadata_json: Mapped[Optional[dict]] = mapped_column(JSONB, default=None)

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="reports")  # noqa: F821

    def __repr__(self) -> str:
        return f"<Report(id={self.id}, type='{self.report_type}', user_id={self.user_id})>"
