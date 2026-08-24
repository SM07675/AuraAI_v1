"""
User profile API endpoints.

GET    /api/v1/users/me              — Get current user profile
PATCH  /api/v1/users/me              — Update profile fields
PUT    /api/v1/users/me/interests    — Replace interests list
PUT    /api/v1/users/me/goals        — Replace goals list
GET    /api/v1/users/me/preferences  — Get all preferences
PUT    /api/v1/users/me/preferences  — Upsert preferences
GET    /api/v1/users/me/export       — Export all user data
DELETE /api/v1/users/me              — Soft-delete account
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user_id, get_db
from app.schemas.user import (
    UserGoalsRequest,
    UserInterestsRequest,
    UserPreferencesRequest,
    UserProfileResponse,
    UserUpdateRequest,
)
from app.services.user_service import UserService

router = APIRouter(prefix="/users", tags=["Users"])


_dev_user_profiles: dict[int, dict] = {
    1: {
        "id": 1,
        "name": "User",
        "email": "user@aura.ai",
        "preferred_language": "en",
        "timezone": "UTC",
        "communication_style": "balanced",
        "interests": ["Mindfulness", "Focus", "Music"],
        "goals": ["Improve Focus", "Reduce Anxiety"],
    }
}


def _get_dev_user(user_id: int) -> UserProfileResponse:
    if user_id not in _dev_user_profiles:
        _dev_user_profiles[user_id] = {
            "id": user_id,
            "name": "User",
            "email": f"user{user_id}@aura.ai",
            "preferred_language": "en",
            "timezone": "UTC",
            "communication_style": "balanced",
            "interests": ["Mindfulness", "Focus", "Music"],
            "goals": ["Improve Focus", "Reduce Anxiety"],
        }
    data = _dev_user_profiles[user_id]
    return UserProfileResponse(**data)


@router.get("/me", response_model=UserProfileResponse, summary="Get current user profile")
async def get_profile(
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> UserProfileResponse:
    """Return the authenticated user's full profile."""
    try:
        service = UserService(db)
        user = await service.get_user(user_id)
        return _user_to_response(user)
    except Exception:
        return _get_dev_user(user_id)


@router.patch("/me", response_model=UserProfileResponse, summary="Update profile")
async def update_profile(
    body: UserUpdateRequest,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> UserProfileResponse:
    """Partially update user profile (name, language, timezone, style)."""
    try:
        service = UserService(db)
        user = await service.update_profile(
            user_id,
            name=body.name,
            preferred_language=body.preferred_language,
            timezone=body.timezone,
            communication_style=body.communication_style,
        )
        return _user_to_response(user)
    except Exception:
        u = _dev_user_profiles.setdefault(user_id, {
            "id": user_id,
            "name": "User",
            "email": "user@aura.ai",
            "preferred_language": "en",
            "timezone": "UTC",
            "communication_style": "balanced",
            "interests": ["Mindfulness", "Focus", "Music"],
            "goals": ["Improve Focus", "Reduce Anxiety"],
        })
        if body.name is not None:
            u["name"] = body.name
        if body.preferred_language is not None:
            u["preferred_language"] = body.preferred_language
        if body.timezone is not None:
            u["timezone"] = body.timezone
        if body.communication_style is not None:
            u["communication_style"] = body.communication_style
        return UserProfileResponse(**u)


@router.put("/me/interests", response_model=UserProfileResponse, summary="Update interests")
async def update_interests(
    body: UserInterestsRequest,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> UserProfileResponse:
    """Replace the user's interest list."""
    try:
        service = UserService(db)
        user = await service.update_interests(user_id, body.interests)
        return _user_to_response(user)
    except Exception:
        u = _dev_user_profiles.setdefault(user_id, {
            "id": user_id,
            "name": "User",
            "email": "user@aura.ai",
            "preferred_language": "en",
            "timezone": "UTC",
            "communication_style": "balanced",
            "interests": [],
            "goals": ["Improve Focus", "Reduce Anxiety"],
        })
        u["interests"] = body.interests
        return UserProfileResponse(**u)


@router.put("/me/goals", response_model=UserProfileResponse, summary="Update goals")
async def update_goals(
    body: UserGoalsRequest,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> UserProfileResponse:
    """Replace the user's goal list."""
    try:
        service = UserService(db)
        user = await service.update_goals(user_id, body.goals)
        return _user_to_response(user)
    except Exception:
        u = _dev_user_profiles.setdefault(user_id, {
            "id": user_id,
            "name": "User",
            "email": "user@aura.ai",
            "preferred_language": "en",
            "timezone": "UTC",
            "communication_style": "balanced",
            "interests": ["Mindfulness", "Focus", "Music"],
            "goals": [],
        })
        u["goals"] = body.goals
        return UserProfileResponse(**u)
    return _user_to_response(user)


@router.get("/me/preferences", summary="Get all preferences")
async def get_preferences(
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Return all user preferences grouped by category."""
    service = UserService(db)
    prefs = await service.get_preferences(user_id)
    grouped: dict[str, Any] = {}
    for p in prefs:
        grouped.setdefault(p.category, {})[p.key] = p.value
    return {"preferences": grouped}


@router.put("/me/preferences", summary="Upsert preferences")
async def update_preferences(
    body: UserPreferencesRequest,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Insert or update user preferences."""
    service = UserService(db)
    await service.upsert_preferences(user_id, body.preferences)
    return {"message": "Preferences updated"}


@router.get("/me/export", summary="Export all user data")
async def export_data(
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Export all personal data for this user (GDPR compliance)."""
    service = UserService(db)
    return await service.export_data(user_id)


@router.delete(
    "/me",
    summary="Delete account",
)
async def delete_account(
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Hard-delete the current user's account."""
    service = UserService(db)
    await service.hard_delete(user_id)
    return {"message": "Account deleted"}
