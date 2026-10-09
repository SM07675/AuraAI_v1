"""
EEG Analysis & Clinician Portal API Routes.
Provides endpoints for:
- Uploading and parsing EDF electrophysiology files.
- Retrieving quantitative biomarker reports and scalp topomaps.
- Retrieving neuro-behavioral triangulation correlations with FACS.
- Loading demo Mumtaz dataset records for instant clinician demonstration.
- Fetching empirical normative reference benchmarks.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, get_db
from app.core.logging_config import get_logger
from app.eeg.biomarkers import load_benchmarks
from app.eeg.service import EEGService
from app.models.user import User

router = APIRouter(prefix="/eeg", tags=["EEG & Neuro-Behavioral Analytics"])
logger = get_logger(__name__)


@router.post("/upload", status_code=status.HTTP_201_CREATED)
async def upload_eeg_file(
    file: UploadFile = File(...),
    session_id: Optional[int] = Form(None),
    recording_state: Optional[str] = Form("eyes_closed"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """
    Ingests and analyzes a clinical/research EDF file.
    Calculates FAA, TBR, Band Powers, 19-channel topomap, and triangulates with FACS affect.
    """
    if not file.filename.lower().endswith(".edf"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported file format. Please upload a standard European Data Format (.edf) file.",
        )

    try:
        contents = await file.read()
        if len(contents) < 512:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="File is empty or corrupted.",
            )

        service = EEGService(db)
        report = await service.ingest_and_analyze_edf(
            user_id=current_user.id,
            filename=file.filename,
            file_bytes=contents,
            session_id=session_id,
            recording_state=recording_state or "eyes_closed",
        )
        return {
            "status": "success",
            "message": "EEG record parsed and analyzed successfully.",
            "report": report.to_dict(),
        }
    except Exception as exc:
        logger.error("Failed to process EEG upload", error=str(exc), filename=file.filename)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"EEG Processing Error: {str(exc)}",
        )


@router.get("/reports")
async def list_eeg_reports(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """List all EEG reports analyzed for the current user."""
    service = EEGService(db)
    reports = await service.list_reports(user_id=current_user.id)
    return {
        "count": len(reports),
        "reports": [r.to_dict() for r in reports],
    }


@router.get("/reports/{report_id}")
async def get_eeg_report_detail(
    report_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Retrieve detailed analysis, scalp topomap, and triangulation for a single EEG report."""
    service = EEGService(db)
    report = await service.get_report(report_id=report_id, user_id=current_user.id)
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="EEG report not found.")
    return report.to_dict()


@router.get("/benchmarks")
async def get_normative_benchmarks() -> dict[str, Any]:
    """Returns the normative reference distributions and classifier metrics from the Mumtaz cohort."""
    benchmarks = load_benchmarks()
    return benchmarks


@router.post("/demo-sample")
async def load_demo_sample(
    sample_type: str = Form("mdd_ec"),  # "mdd_ec", "healthy_ec", "mdd_eo", "healthy_eo"
    session_id: Optional[int] = Form(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """
    Loads an authentic resting-state EDF file directly from the Mumtaz dataset repository
    for immediate clinician demonstration.
    """
    sample_map = {
        "mdd_ec": "MDD S1 EC.edf",
        "healthy_ec": "H S1 EC.edf",
        "mdd_eo": "MDD S1 EO.edf",
        "healthy_eo": "H S1 EO.edf",
    }
    target_filename = sample_map.get(sample_type, "MDD S1 EC.edf")

    search_dirs = [
        Path("/app/data/eeg_mumtaz"),
        Path("d:/AuraAI/backend/data/eeg_mumtaz"),
        Path("C:/Users/shriw/Downloads/4244171"),
    ]

    target_path = None
    for d in search_dirs:
        cand = d / target_filename
        if cand.exists():
            target_path = cand
            break

    if not target_path:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Demo sample file {target_filename} not found on server.",
        )

    try:
        with open(target_path, "rb") as f:
            file_bytes = f.read()

        service = EEGService(db)
        report = await service.ingest_and_analyze_edf(
            user_id=current_user.id,
            filename=target_filename,
            file_bytes=file_bytes,
            session_id=session_id,
            recording_state="eyes_closed" if "EC" in target_filename else "eyes_open",
        )
        return {
            "status": "success",
            "message": f"Successfully ingested real Mumtaz dataset sample: {target_filename}",
            "report": report.to_dict(),
        }
    except Exception as exc:
        logger.error("Failed to load demo sample", error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to ingest demo sample: {str(exc)}",
        )
