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


def _user_to_response(user: Any) -> UserProfileResponse:
    interests = [i.strip() for i in (user.interests or "").split(",") if i.strip()]
    goals = [g.strip() for g in (user.goals or "").split(",") if g.strip()]
    return UserProfileResponse(
        id=user.id,
        name=user.name,
        email=user.email,
        preferred_language=user.preferred_language,
        timezone=user.timezone,
        communication_style=user.communication_style,
        interests=interests,
        goals=goals,
    )


@router.get("/me", response_model=UserProfileResponse, summary="Get current user profile")
async def get_profile(
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> UserProfileResponse:
    """Return the authenticated user's full profile."""
    service = UserService(db)
    user = await service.get_user(user_id)
    return _user_to_response(user)


@router.patch("/me", response_model=UserProfileResponse, summary="Update profile")
async def update_profile(
    body: UserUpdateRequest,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> UserProfileResponse:
    """Partially update user profile (name, language, timezone, style)."""
    service = UserService(db)
    user = await service.update_profile(
        user_id,
        name=body.name,
        preferred_language=body.preferred_language,
        timezone=body.timezone,
        communication_style=body.communication_style,
    )
    return _user_to_response(user)


@router.put("/me/interests", response_model=UserProfileResponse, summary="Update interests")
async def update_interests(
    body: UserInterestsRequest,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> UserProfileResponse:
    """Replace the user's interest list."""
    service = UserService(db)
    user = await service.update_interests(user_id, body.interests)
    return _user_to_response(user)


@router.put("/me/goals", response_model=UserProfileResponse, summary="Update goals")
async def update_goals(
    body: UserGoalsRequest,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> UserProfileResponse:
    """Replace the user's goal list."""
    service = UserService(db)
    user = await service.update_goals(user_id, body.goals)
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
