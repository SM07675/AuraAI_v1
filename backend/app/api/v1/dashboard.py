from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.core.deps import get_current_user_id, get_db
from app.models.session import Session

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])

@router.get("", summary="Dashboard statistics")
async def get_dashboard_stats(
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Return dashboard aggregates like total conversations and recent sessions."""
    # Get total sessions
    stmt = select(func.count(Session.id)).where(Session.user_id == user_id)
    result = await db.execute(stmt)
    total_sessions = result.scalar_one_or_none() or 0
    
    # Get recent sessions
    from app.services.conversation_service import ConversationService
    service = ConversationService(db)
    sessions = await service.list_sessions(user_id, limit=5)
    
    return {
        "total_conversations": total_sessions,
        "recent_sessions": [
            {
                "id": s.id,
                "title": s.title,
                "status": s.status,
                "summary": s.summary,
                "created_at": s.created_at.isoformat(),
            }
            for s in sessions
        ]
    }
