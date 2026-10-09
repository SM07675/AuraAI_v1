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
from pydantic import BaseModel, Field
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
    """Convert SQLAlchemy User or dict to UserProfileResponse."""
    raw_interests = getattr(user, "interests", "") or ""
    raw_goals = getattr(user, "goals", "") or ""
    interests = [i.strip() for i in raw_interests.split(",") if i.strip()] if isinstance(raw_interests, str) else list(raw_interests)
    goals = [g.strip() for g in raw_goals.split(",") if g.strip()] if isinstance(raw_goals, str) else list(raw_goals)
    return UserProfileResponse(
        id=user.id,
        name=user.name,
        email=user.email,
        is_admin=getattr(user, "is_admin", False) or False,
        role=getattr(user, "role", "patient") or "patient",
        avatar_url=getattr(user, "avatar_url", None),
        auth_provider=getattr(user, "auth_provider", "email") or "email",
        preferred_language=getattr(user, "preferred_language", "en") or "en",
        timezone=getattr(user, "timezone", "UTC") or "UTC",
        communication_style=getattr(user, "communication_style", "balanced") or "balanced",
        interests=interests,
        goals=goals,
    )


_dev_user_profiles: dict[int, dict] = {
    1: {
        "id": 1,
        "name": "atharvpalekar",
        "email": "atharv@aura.ai",
        "preferred_language": "en",
        "timezone": "UTC",
        "communication_style": "balanced",
        "interests": [],
        "goals": ["Boost Teamwork Momentum"],
    }
}


def _get_dev_user(user_id: int) -> UserProfileResponse:
    if user_id not in _dev_user_profiles:
        _dev_user_profiles[user_id] = {
            "id": user_id,
            "name": "atharvpalekar" if user_id == 1 else f"User {user_id}",
            "email": "atharv@aura.ai" if user_id == 1 else f"user{user_id}@aura.ai",
            "preferred_language": "en",
            "timezone": "UTC",
            "communication_style": "balanced",
            "interests": [],
            "goals": ["Boost Teamwork Momentum"],
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
            role=body.role,
            preferred_language=body.preferred_language,
            timezone=body.timezone,
            communication_style=body.communication_style,
        )
        return _user_to_response(user)
    except Exception:
        u = _dev_user_profiles.setdefault(user_id, {
            "id": user_id,
            "name": "atharvpalekar" if user_id == 1 else f"User {user_id}",
            "email": "atharv@aura.ai" if user_id == 1 else f"user{user_id}@aura.ai",
            "role": "patient",
            "preferred_language": "en",
            "timezone": "UTC",
            "communication_style": "balanced",
            "interests": [],
            "goals": ["Boost Teamwork Momentum"],
        })
        if body.name is not None:
            u["name"] = body.name
        if body.role is not None:
            u["role"] = body.role
        if body.preferred_language is not None:
            u["preferred_language"] = body.preferred_language
        if body.timezone is not None:
            u["timezone"] = body.timezone
        if body.communication_style is not None:
            u["communication_style"] = body.communication_style
        return UserProfileResponse(**u)


class UserRoleRequest(BaseModel):
    role: str = Field(..., description="patient or clinician")


@router.put("/me/role", response_model=UserProfileResponse, summary="Switch portal role")
async def update_role(
    body: UserRoleRequest,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> UserProfileResponse:
    """Switch active portal role between 'patient' and 'clinician'."""
    clean_role = body.role.strip().lower()
    if clean_role not in ["patient", "clinician"]:
        clean_role = "patient"
    try:
        service = UserService(db)
        user = await service.update_profile(user_id, role=clean_role)
        return _user_to_response(user)
    except Exception:
        u = _dev_user_profiles.setdefault(user_id, {
            "id": user_id,
            "name": "atharvpalekar" if user_id == 1 else f"User {user_id}",
            "email": "atharv@aura.ai" if user_id == 1 else f"user{user_id}@aura.ai",
            "role": clean_role,
        })
        u["role"] = clean_role
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
            "name": "atharvpalekar" if user_id == 1 else f"User {user_id}",
            "email": "atharv@aura.ai" if user_id == 1 else f"user{user_id}@aura.ai",
            "preferred_language": "en",
            "timezone": "UTC",
            "communication_style": "balanced",
            "interests": [],
            "goals": ["Boost Teamwork Momentum"],
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
            "name": "atharvpalekar" if user_id == 1 else f"User {user_id}",
            "email": "atharv@aura.ai" if user_id == 1 else f"user{user_id}@aura.ai",
            "preferred_language": "en",
            "timezone": "UTC",
            "communication_style": "balanced",
            "interests": [],
            "goals": ["Boost Teamwork Momentum"],
        })
        u["goals"] = body.goals
        return UserProfileResponse(**u)


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
