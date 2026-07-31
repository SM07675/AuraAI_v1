"""
Metrics endpoint — AI provider usage and performance stats.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.ai.service import AIService
from app.core.deps import get_current_user_id
from app.emotion.service import EmotionService

router = APIRouter(prefix="/metrics", tags=["Metrics"])


@router.get("", summary="AI provider usage metrics")
async def get_metrics(
    _user_id: int = Depends(get_current_user_id),
) -> dict:
    """Return AI provider health and emotion service status."""
    ai = AIService()
    emotion = EmotionService()

    provider_statuses = await ai.get_provider_statuses()

    return {
        "ai_providers": provider_statuses,
        "emotion_service": emotion.get_status(),
    }

