"""
Authentication Pydantic schemas.

Request and response models for registration, login, and token management.
"""

from __future__ import annotations

from pydantic import BaseModel, EmailStr, Field, field_validator


class RegisterRequest(BaseModel):
    """Request body for user registration."""

    name: str = Field(..., min_length=1, max_length=255, examples=["Alex Johnson"])
    email: EmailStr = Field(..., examples=["alex@example.com"])
    password: str = Field(..., min_length=8, max_length=128, examples=["SecurePass123"])

    @field_validator("name")
    @classmethod
    def name_not_blank(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Name cannot be blank")
        return v

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class LoginRequest(BaseModel):
    """Request body for user login."""

    email: EmailStr = Field(..., examples=["alex@example.com"])
    password: str = Field(..., examples=["SecurePass123"])


class RefreshRequest(BaseModel):
    """Request body for token refresh."""

    refresh_token: str = Field(..., description="Valid refresh token")


class LogoutRequest(BaseModel):
    """Request body for logout — blacklists the provided access token."""

    access_token: str = Field(..., description="Access token to revoke")


class TokenResponse(BaseModel):
    """Response containing access and refresh tokens."""

    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int = Field(..., description="Access token TTL in seconds")


class UserInToken(BaseModel):
    """Minimal user data embedded in the token response."""

    id: int
    name: str
    email: str
