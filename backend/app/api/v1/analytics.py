from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc

from app.core.deps import get_current_user_id, get_db
from app.models.emotion_log import EmotionLog

router = APIRouter(prefix="/analytics", tags=["Analytics"])

@router.get("/emotion_history", summary="Get recent emotion trends")
async def get_emotion_history(
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Return emotion history for the current user to build mood trends."""
    stmt = (
        select(EmotionLog)
        .where(EmotionLog.user_id == user_id)
        .order_by(desc(EmotionLog.created_at))
        .limit(20)
    )
    result = await db.execute(stmt)
    logs = result.scalars().all()
    
    # Sort back to chronological for chart
    logs.reverse()
    
    return {
        "history": [
            {
                "id": log.id,
                "fused_emotion": log.fused_emotion,
                "confidence": log.confidence,
                "timestamp": log.created_at.isoformat()
            }
            for log in logs
        ]
    }
