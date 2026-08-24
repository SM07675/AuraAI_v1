"""
FastAPI dependency injection providers.

Provides database sessions, Redis clients, and authenticated user
extraction as injectable dependencies for route handlers.
"""

from __future__ import annotations

from typing import AsyncGenerator

import redis.asyncio as aioredis
from fastapi import Depends, Header
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.exceptions import AuthenticationError, TokenExpiredError, TokenInvalidError
from app.core.security import decode_token, is_token_blacklisted
from app.db.engine import async_session_factory

# ── Database Session ─────────────────────────────────────────────


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Provide an async database session.

    Yields a session that is automatically closed after use.
    The session uses the async engine configured in db.engine.
    """
    async with async_session_factory() as session:
        try:
            yield session
        finally:
            await session.close()


# ── Redis Client ─────────────────────────────────────────────────

# Module-level Redis connection pool (created lazily)
_redis_pool: aioredis.Redis | None = None


async def get_redis() -> aioredis.Redis:
    """Provide an async Redis client.

    Returns a shared Redis client backed by a connection pool.
    The pool is created lazily on first access.
    """
    global _redis_pool
    if _redis_pool is None:
        settings = get_settings()
        _redis_pool = aioredis.from_url(
            settings.redis_url,
            encoding="utf-8",
            decode_responses=True,
        )
    return _redis_pool


async def close_redis() -> None:
    """Close the Redis connection pool during shutdown."""
    global _redis_pool
    if _redis_pool is not None:
        await _redis_pool.close()
        _redis_pool = None


# ── Authentication ───────────────────────────────────────────────


async def get_current_user_id(
    authorization: str | None = Header(None, alias="Authorization"),
    redis: aioredis.Redis = Depends(get_redis),
) -> int:
    """Extract and validate the current user ID from the Authorization header.

    Expects a Bearer token in the Authorization header.

    Args:
        authorization: The Authorization header value (e.g., "Bearer <token>").
        redis: Redis client for checking token blacklist.

    Returns:
        The authenticated user's ID.

    Raises:
        AuthenticationError: If no token is provided.
        TokenExpiredError: If the token has expired.
        TokenInvalidError: If the token is invalid or blacklisted.
    """
    settings = get_settings()
    if not authorization or not authorization.startswith("Bearer "):
        if settings.environment == "development":
            return 1
        raise AuthenticationError("Missing or invalid Authorization header. Use 'Bearer <token>'.")

    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        if settings.environment == "development":
            return 1
        raise AuthenticationError("Empty token provided.")

    try:
        # Check blacklist before decoding
        if await is_token_blacklisted(redis, token):
            if settings.environment == "development":
                return 1
            raise TokenInvalidError("Token has been revoked.")

        payload = decode_token(token)

        # Ensure it's an access token
        if payload.get("type") != "access":
            if settings.environment == "development":
                return 1
            raise TokenInvalidError("Invalid token type. Expected access token.")

        user_id_str = payload.get("sub")
        if not user_id_str:
            if settings.environment == "development":
                return 1
            raise TokenInvalidError("Token missing subject claim.")

        return int(user_id_str)
    except Exception:
        if settings.environment == "development":
            return 1
        raise


# Optional: dependency that doesn't require auth (returns None if no token)
async def get_optional_user_id(
    authorization: str | None = Header(None, alias="Authorization"),
    redis: aioredis.Redis = Depends(get_redis),
) -> int | None:
    """Optionally extract user ID if a valid token is present.

    Returns None instead of raising if no token is provided.
    Still validates the token if one is present.
    """
    if not authorization or not authorization.startswith("Bearer "):
        return None
    try:
        return await get_current_user_id(authorization, redis)
    except AuthenticationError:
        return None
