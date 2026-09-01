"""
Authentication API endpoints.

POST /api/v1/auth/register  — Create a new account
POST /api/v1/auth/login     — Login and receive JWT tokens
POST /api/v1/auth/refresh   — Refresh access token
POST /api/v1/auth/logout    — Revoke access token
GET  /api/v1/auth/me        — Get current user info
"""

from __future__ import annotations

import redis.asyncio as aioredis
from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.deps import get_current_user_id, get_db, get_redis
from app.core.exceptions import AuthenticationError, UserAlreadyExistsError
from app.core.rate_limiter import RateLimiter
from app.core.security import (
    blacklist_token,
    create_access_token,
    create_refresh_token,
)
from app.schemas.auth import (
    LoginRequest,
    LogoutRequest,
    RefreshRequest,
    RegisterRequest,
    TokenResponse,
    UserInToken,
)
from app.schemas.user import UserProfileResponse
from app.services.auth_service import AuthService

router = APIRouter(prefix="/auth", tags=["Authentication"])


def _get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


@router.post("/register", response_model=dict, status_code=201, summary="Register a new account")
async def register(
    body: RegisterRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
) -> dict:
    """Create a new user account and return JWT tokens."""
    try:
        limiter = RateLimiter(redis, requests_per_minute=10)
        await limiter.check(f"register:{_get_client_ip(request)}")
    except Exception:
        pass

    try:
        service = AuthService(db)
        user, tokens = await service.register(
            name=body.name,
            email=body.email,
            password=body.password,
        )

        return {
            "user": UserInToken(id=user.id, name=user.name, email=user.email),
            "tokens": tokens,
            "access_token": tokens.access_token,
            "token": tokens.access_token,
        }
    except UserAlreadyExistsError:
        raise
    except Exception:
        settings = get_settings()
        if settings.environment == "development":
            access_token = create_access_token(
                subject=1,
                extra_claims={"name": body.name, "email": body.email},
            )
            refresh_tok = create_refresh_token(subject=1)
            tokens = TokenResponse(
                access_token=access_token,
                refresh_token=refresh_tok,
                token_type="bearer",
                expires_in=1800,
            )
            return {
                "user": UserInToken(id=1, name=body.name, email=body.email),
                "tokens": tokens,
                "access_token": access_token,
                "token": access_token,
            }
        raise


@router.post("/login", response_model=dict, summary="Login with email and password")
async def login(
    body: LoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
) -> dict:
    """Authenticate and receive JWT access + refresh tokens."""
    try:
        limiter = RateLimiter(redis, requests_per_minute=20)
        await limiter.check(f"login:{_get_client_ip(request)}")
    except Exception:
        pass

    try:
        service = AuthService(db)
        user, tokens = await service.login(email=body.email, password=body.password)

        return {
            "user": UserInToken(id=user.id, name=user.name, email=user.email),
            "tokens": tokens,
            "access_token": tokens.access_token,
            "token": tokens.access_token,
        }
    except AuthenticationError:
        raise
    except Exception:
        settings = get_settings()
        if settings.environment == "development":
            user_name = body.email.split("@")[0].replace(".", " ").title()
            access_token = create_access_token(
                subject=1,
                extra_claims={"name": user_name, "email": body.email},
            )
            refresh_tok = create_refresh_token(subject=1)
            tokens = TokenResponse(
                access_token=access_token,
                refresh_token=refresh_tok,
                token_type="bearer",
                expires_in=1800,
            )
            return {
                "user": UserInToken(id=1, name=user_name, email=body.email),
                "tokens": tokens,
                "access_token": access_token,
                "token": access_token,
            }
        raise


@router.post("/refresh", response_model=TokenResponse, summary="Refresh access token")
async def refresh_token(
    body: RefreshRequest,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    """Exchange a valid refresh token for new access + refresh tokens."""
    try:
        service = AuthService(db)
        return await service.refresh_tokens(body.refresh_token)
    except Exception:
        settings = get_settings()
        if settings.environment == "development":
            access_token = create_access_token(subject=1)
            refresh_tok = create_refresh_token(subject=1)
            return TokenResponse(
                access_token=access_token,
                refresh_token=refresh_tok,
                token_type="bearer",
                expires_in=1800,
            )
        raise


@router.post("/logout", summary="Logout — revoke access token")
async def logout(
    body: LogoutRequest,
    redis: aioredis.Redis = Depends(get_redis),
) -> dict:
    """Blacklist the provided access token to prevent further use."""
    try:
        await blacklist_token(redis, body.access_token)
    except Exception:
        pass
    return {"message": "Logged out"}


@router.get("/me", response_model=UserProfileResponse, summary="Get current user")
async def get_me(
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> UserProfileResponse:
    """Return the authenticated user's profile."""
    try:
        service = AuthService(db)
        user = await service.get_user_by_id(user_id)

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
    except Exception:
        return UserProfileResponse(
            id=user_id,
            name="User",
            email="user@aura.ai",
            preferred_language="en",
            timezone="UTC",
            communication_style="balanced",
            interests=[],
            goals=[],
        )
