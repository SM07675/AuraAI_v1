"""
EmotionLog model.

Records emotion analysis results for each message, including
individual modality results and the fused outcome.
"""

from __future__ import annotations

from typing import Optional

from sqlalchemy import Float, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin
from app.utils.encryption import EncryptedText


class EmotionLog(Base, TimestampMixin):
    """Emotion analysis record for a message.

    Stores results from text, voice, and face emotion analysis,
    plus the fused result and confidence scores.
    """

    __tablename__ = "emotion_logs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    session_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("sessions.id", ondelete="SET NULL"), default=None, index=True,
    )
    message_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("messages.id", ondelete="SET NULL"), default=None,
    )

    # Individual modality results
    text_emotion: Mapped[Optional[str]] = mapped_column(EncryptedText, default=None)
    voice_emotion: Mapped[Optional[str]] = mapped_column(EncryptedText, default=None)
    face_emotion: Mapped[Optional[str]] = mapped_column(EncryptedText, default=None)

    # Fused result
    fused_emotion: Mapped[str] = mapped_column(EncryptedText, nullable=False)
    confidence: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)

    # Raw scores from each modality (stored as JSON for flexibility)
    raw_scores: Mapped[Optional[dict]] = mapped_column(
        JSONB, default=None,
        comment="Full probability scores from each modality",
    )

    # Relationships
    session: Mapped[Optional["Session"]] = relationship("Session", back_populates="emotion_logs")  # noqa: F821

    def __repr__(self) -> str:
        return f"<EmotionLog(id={self.id}, fused='{self.fused_emotion}', confidence={self.confidence})>"
