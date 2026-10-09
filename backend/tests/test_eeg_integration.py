"""
Integration and End-to-End Tests for EEG & Neuro-Behavioral Triangulation Pipeline.
Phase 5 of Roadmap: Validates EDF parsing, biomarker extraction, model classification,
FACS triangulation, dual-lens synthesis, and statutory disclaimers.
"""

import pytest
import os
from pathlib import Path
import numpy as np

from app.eeg.preprocessor import parse_edf_bytes, preprocess_signals, STANDARD_10_20_CHANNELS
from app.eeg.biomarkers import compute_biomarkers, load_benchmarks
from app.eeg.service import EEGService
from app.models.user import User
from app.models.eeg import EEGReport, EEGCorrelation
from sqlalchemy import select


def find_sample_file(filename: str) -> Path:
    candidates = [
        Path(f"/app/data/eeg_mumtaz/{filename}"),
        Path(f"d:/AuraAI/backend/data/eeg_mumtaz/{filename}"),
        Path(f"C:/Users/shriw/Downloads/4244171/{filename}"),
    ]
    for c in candidates:
        if c.exists():
            return c
    raise FileNotFoundError(f"Sample file {filename} not found.")


@pytest.mark.asyncio
async def test_eeg_preprocessing_and_biomarkers():
    """Verify EDF parsing and Welch PSD biomarker extraction on Mumtaz record."""
    mdd_file = find_sample_file("MDD S1 EC.edf")
    with open(mdd_file, "rb") as f:
        file_bytes = f.read()

    signals, fs, dur, meta = parse_edf_bytes(file_bytes)
    assert fs == 256.0
    assert dur > 10.0
    assert "F3" in signals and "F4" in signals and "Fz" in signals
    assert meta["mapped_1020_count"] >= 19

    # Preprocess
    clean_signals = preprocess_signals(signals, fs)
    assert len(clean_signals) == len(signals)

    # Biomarkers
    features, band_powers, topomap, biomarkers = compute_biomarkers(clean_signals, fs, "eyes_closed")
    assert "faa" in features
    assert "tbr_fz" in features
    assert "global_beta_rel" in features
    assert len(topomap["channels"]) == 19
    assert len(topomap["asymmetry_pairs"]) >= 3
    assert "z_scores" in biomarkers


@pytest.mark.asyncio
async def test_eeg_service_end_to_end(db_session):
    """Verify complete end-to-end ingestion, classification, triangulation, and persistence."""
    # Ensure a test user exists
    user_res = await db_session.execute(select(User).limit(1))
    user = user_res.scalar_one_or_none()
    if not user:
        user = User(
            email="clinician_test@aura.ai",
            name="Dr. Clinician",
            password_hash="test_hash",
            is_admin=True,
        )
        db_session.add(user)
        await db_session.flush()

    service = EEGService(db_session)

    # 1. Test Ingestion of MDD record
    mdd_file = find_sample_file("MDD S1 EC.edf")
    with open(mdd_file, "rb") as f:
        mdd_bytes = f.read()

    report_mdd = await service.ingest_and_analyze_edf(
        user_id=user.id,
        filename="MDD S1 EC.edf",
        file_bytes=mdd_bytes,
        recording_state="eyes_closed",
    )

    assert report_mdd.id is not None
    assert report_mdd.predicted_class == "depressive_risk"
    assert report_mdd.confidence_score >= 0.70
    assert report_mdd.faa_score < 0.0  # Negative asymmetry (right hyperactivation)
    assert len(report_mdd.correlations) >= 1
    assert "Patient" in report_mdd.patient_summary or "Brain" in report_mdd.patient_summary
    assert "Clinician" in report_mdd.clinician_summary or "Telemetry" in report_mdd.clinician_summary
    assert "Not a standalone diagnostic" in report_mdd.disclaimer or "telemetry" in report_mdd.disclaimer.lower()

    corr = report_mdd.correlations[0]
    assert corr.triangulation_score >= 0.50
    assert "au04_brow_furrow" in corr.facs_markers
    assert "au12_zygomatic_smile" in corr.facs_markers

    # 2. Test Ingestion of Healthy Control record
    h_file = find_sample_file("H S1 EC.edf")
    with open(h_file, "rb") as f:
        h_bytes = f.read()

    report_h = await service.ingest_and_analyze_edf(
        user_id=user.id,
        filename="H S1 EC.edf",
        file_bytes=h_bytes,
        recording_state="eyes_closed",
    )

    assert report_h.id is not None
    assert report_h.predicted_class == "normative"
    assert report_h.faa_score > 0.0  # Positive asymmetry (normative approach valence)


def test_normative_benchmarks_loaded():
    """Verify empirical benchmarks JSON is valid and populated."""
    benchmarks = load_benchmarks()
    assert benchmarks is not None
    assert benchmarks["metrics"]["roc_auc"] >= 0.82
    assert benchmarks["sample_size"] == 120
    assert len(benchmarks["top_features"]) >= 5
