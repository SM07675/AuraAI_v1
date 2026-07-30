"""
User profile Pydantic schemas.
"""

from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, EmailStr, Field


class UserProfileResponse(BaseModel):
    """Public user profile data."""

    id: int
    name: str
    email: str
    preferred_language: Optional[str] = "en"
    timezone: Optional[str] = "UTC"
    communication_style: Optional[str] = "balanced"
    interests: list[str] = []
    goals: list[str] = []

    model_config = {"from_attributes": True}


class UserUpdateRequest(BaseModel):
    """Partial user profile update — all fields optional."""

    name: Optional[str] = Field(None, min_length=1, max_length=255)
    preferred_language: Optional[str] = Field(None, max_length=10)
    timezone: Optional[str] = Field(None, max_length=50)
    communication_style: Optional[str] = Field(
        None, pattern="^(concise|balanced|detailed)$"
    )


class UserInterestsRequest(BaseModel):
    """Update user interests."""

    interests: list[str] = Field(..., description="List of interest tags")


class UserGoalsRequest(BaseModel):
    """Update user goals."""

    goals: list[str] = Field(..., description="List of goal descriptions")


class UserPreferenceItem(BaseModel):
    """Single user preference."""

    category: str
    key: str
    value: Any


class UserPreferencesRequest(BaseModel):
    """Bulk preference update."""

    preferences: list[UserPreferenceItem]
