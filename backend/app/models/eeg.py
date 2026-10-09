"""
EEG SQLAlchemy ORM models for Aura AI.

Stores ingested clinical EEG reports, quantitative biomarkers (FAA, TBR, band powers,
topomap voltage distribution), and neuro-behavioral triangulation correlations linking
electrophysiology to FACS emotion logs and Knowledge Graph entities.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin


class EEGReport(Base, TimestampMixin):
    """Clinical / research EEG analysis record."""

    __tablename__ = "eeg_reports"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    session_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("sessions.id", ondelete="SET NULL"), nullable=True, index=True
    )

    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    sampling_rate: Mapped[float] = mapped_column(Float, default=256.0)
    duration_seconds: Mapped[float] = mapped_column(Float, default=0.0)
    num_channels: Mapped[int] = mapped_column(Integer, default=19)
    recording_state: Mapped[str] = mapped_column(
        String(50), default="eyes_closed", comment="eyes_closed, eyes_open, task, unknown"
    )

    predicted_class: Mapped[str] = mapped_column(
        String(50), nullable=False, default="normative", comment="depressive_risk or normative"
    )
    confidence_score: Mapped[float] = mapped_column(Float, default=0.5)

    faa_score: Mapped[float] = mapped_column(
        Float, default=0.0, comment="Frontal Alpha Asymmetry: ln(Alpha_F4) - ln(Alpha_F3)"
    )
    tbr_fz_score: Mapped[float] = mapped_column(
        Float, default=1.0, comment="Theta / Beta Ratio at Frontal Midline Fz"
    )

    # Detailed metrics & topomap distribution
    band_powers: Mapped[Optional[dict]] = mapped_column(JSONB, default=dict)
    channel_topomap: Mapped[Optional[dict]] = mapped_column(JSONB, default=dict)
    biomarkers: Mapped[Optional[dict]] = mapped_column(JSONB, default=dict)

    # Dual-Lens synthesis
    patient_summary: Mapped[str] = mapped_column(Text, default="")
    clinician_summary: Mapped[str] = mapped_column(Text, default="")
    disclaimer: Mapped[str] = mapped_column(
        Text,
        default="Investigational neuro-behavioral telemetry for clinical decision support. Not a standalone diagnostic medical device.",
    )

    # Relationships
    user = relationship("User", backref="eeg_reports")
    session = relationship("Session", backref="eeg_reports")
    correlations: Mapped[list["EEGCorrelation"]] = relationship(
        "EEGCorrelation", back_populates="eeg_report", cascade="all, delete-orphan", lazy="selectin"
    )

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "user_id": self.user_id,
            "session_id": self.session_id,
            "filename": self.filename,
            "sampling_rate": self.sampling_rate,
            "duration_seconds": self.duration_seconds,
            "num_channels": self.num_channels,
            "recording_state": self.recording_state,
            "predicted_class": self.predicted_class,
            "confidence_score": self.confidence_score,
            "faa_score": self.faa_score,
            "tbr_fz_score": self.tbr_fz_score,
            "band_powers": self.band_powers or {},
            "channel_topomap": self.channel_topomap or {},
            "biomarkers": self.biomarkers or {},
            "patient_summary": self.patient_summary,
            "clinician_summary": self.clinician_summary,
            "disclaimer": self.disclaimer,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "correlations": [c.to_dict() for c in (self.correlations or [])],
        }

    def __repr__(self) -> str:
        return f"<EEGReport(id={self.id}, user_id={self.user_id}, class='{self.predicted_class}', faa={self.faa_score:.3f})>"


class EEGCorrelation(Base, TimestampMixin):
    """Triangulation model linking EEG electrophysiology to FACS facial & behavioral logs."""

    __tablename__ = "eeg_correlations"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    eeg_report_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("eeg_reports.id", ondelete="CASCADE"), nullable=False, index=True
    )
    emotion_log_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("emotion_logs.id", ondelete="SET NULL"), nullable=True, index=True
    )
    session_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("sessions.id", ondelete="SET NULL"), nullable=True, index=True
    )

    triangulation_score: Mapped[float] = mapped_column(
        Float, default=0.0, comment="0.0 - 1.0 concordance between EEG and behavioral affect"
    )
    concordance_level: Mapped[str] = mapped_column(
        String(50), default="moderate", comment="high, moderate, low, discordant"
    )

    facs_markers: Mapped[Optional[dict]] = mapped_column(JSONB, default=dict)
    graph_entities: Mapped[Optional[dict]] = mapped_column(JSONB, default=list)
    synthesis_notes: Mapped[str] = mapped_column(Text, default="")

    # Relationships
    user = relationship("User")
    eeg_report: Mapped["EEGReport"] = relationship("EEGReport", back_populates="correlations")
    emotion_log = relationship("EmotionLog")
    session = relationship("Session")

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "user_id": self.user_id,
            "eeg_report_id": self.eeg_report_id,
            "emotion_log_id": self.emotion_log_id,
            "session_id": self.session_id,
            "triangulation_score": self.triangulation_score,
            "concordance_level": self.concordance_level,
            "facs_markers": self.facs_markers or {},
            "graph_entities": self.graph_entities or [],
            "synthesis_notes": self.synthesis_notes,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }

    def __repr__(self) -> str:
        return f"<EEGCorrelation(id={self.id}, report_id={self.eeg_report_id}, score={self.triangulation_score:.2f})>"
