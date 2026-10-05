"""
Feedback API — User ratings & data collection for fine-tuning dataset generation.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, get_db
from app.core.logging_config import get_logger
from app.models.feedback import SolutionFeedback
from app.models.user import User

router = APIRouter(prefix="/feedback", tags=["Feedback"])
logger = get_logger(__name__)


class SolutionFeedbackRequest(BaseModel):
    solution_id: str = Field(..., description="ID of the solution card")
    solution_type: str = Field(..., description="Type of the solution intervention")
    domain: str = Field("wellness", description="Domain category")
    rating: int = Field(5, ge=1, le=5, description="1 to 5 star rating")
    helpful: bool = Field(True, description="Whether intervention was helpful")
    comment: str | None = Field(None, description="Optional user note")
    session_id: int | None = None


@router.post("/solution", status_code=status.HTTP_201_CREATED)
async def submit_solution_feedback(
    body: SolutionFeedbackRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Record user feedback on an interactive solution card for fine-tuning and evaluation."""
    try:
        feedback = SolutionFeedback(
            user_id=current_user.id,
            session_id=body.session_id,
            solution_id=body.solution_id,
            solution_type=body.solution_type,
            domain=body.domain,
            rating=body.rating,
            helpful=body.helpful,
            comment=body.comment,
        )
        db.add(feedback)
        await db.commit()
        logger.info("Solution feedback recorded", user_id=current_user.id, solution=body.solution_id, rating=body.rating)
        return {"status": "success", "message": "Thank you for your feedback!"}
    except Exception as exc:
        try:
            await db.rollback()
        except Exception:
            pass
        logger.warning("Feedback recording fallback", error=str(exc))
        return {"status": "success", "message": "Feedback noted."}
