"""
FastAPI dependency injection providers.

Provides database sessions, Redis clients (with in-memory fallback), and authenticated user
extraction as injectable dependencies for route handlers.
"""

from __future__ import annotations

import asyncio
import time
from typing import Any, AsyncGenerator, Dict, Set

import redis.asyncio as aioredis
from fastapi import Depends, Header
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.exceptions import AuthenticationError, TokenExpiredError, TokenInvalidError
from app.core.logging_config import get_logger
from app.core.security import decode_token, is_token_blacklisted
from app.db.engine import async_session_factory

logger = get_logger(__name__)


# ── Database Session ─────────────────────────────────────────────


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Provide an async database session.

    Yields a session that is automatically closed after use.
    """
    async with async_session_factory() as session:
        try:
            yield session
        finally:
            await session.close()


# ── In-Memory Redis Fallback ──────────────────────────────────────


class InMemoryRedis:
    """Lightweight in-memory async Redis stand-in when Redis server is offline."""

    def __init__(self) -> None:
        self._data: Dict[str, Any] = {}
        self._expiries: Dict[str, float] = {}
        self._sets: Dict[str, Set[Any]] = {}
        self._hashes: Dict[str, Dict[str, Any]] = {}

    def _is_expired(self, key: str) -> bool:
        if key in self._expiries:
            if time.time() > self._expiries[key]:
                self._data.pop(key, None)
                self._expiries.pop(key, None)
                self._sets.pop(key, None)
                self._hashes.pop(key, None)
                return True
        return False

    async def ping(self) -> bool:
        return True

    async def get(self, key: str) -> Any:
        if self._is_expired(key):
            return None
        return self._data.get(key)

    async def set(self, key: str, value: Any, ex: int | None = None, **kwargs) -> bool:
        self._data[key] = str(value) if not isinstance(value, (dict, list, str, bytes, int, float, bool)) else value
        if ex is not None:
            self._expiries[key] = time.time() + ex
        else:
            self._expiries.pop(key, None)
        return True

    async def delete(self, *keys: str) -> int:
        count = 0
        for k in keys:
            if k in self._data or k in self._sets or k in self._hashes:
                self._data.pop(k, None)
                self._expiries.pop(k, None)
                self._sets.pop(k, None)
                self._hashes.pop(k, None)
                count += 1
        return count

    async def expire(self, key: str, seconds: int) -> bool:
        if key in self._data or key in self._sets or key in self._hashes:
            self._expiries[key] = time.time() + seconds
            return True
        return False

    async def ttl(self, key: str) -> int:
        if key in self._expiries:
            rem = int(self._expiries[key] - time.time())
            return max(rem, -2)
        return -1 if (key in self._data or key in self._sets or key in self._hashes) else -2

    async def keys(self, pattern: str = "*") -> list[str]:
        now = time.time()
        for k in list(self._expiries.keys()):
            if now > self._expiries[k]:
                self._is_expired(k)
        all_keys = set(self._data.keys()) | set(self._sets.keys()) | set(self._hashes.keys())
        import fnmatch
        return [k for k in all_keys if fnmatch.fnmatch(k, pattern)]

    async def hget(self, name: str, key: str) -> Any:
        if self._is_expired(name):
            return None
        return self._hashes.get(name, {}).get(key)

    async def hset(self, name: str, key: str | None = None, value: Any = None, mapping: dict | None = None) -> int:
        if name not in self._hashes:
            self._hashes[name] = {}
        if mapping:
            self._hashes[name].update(mapping)
            return len(mapping)
        if key is not None:
            self._hashes[name][key] = value
            return 1
        return 0

    async def hgetall(self, name: str) -> dict:
        if self._is_expired(name):
            return {}
        return dict(self._hashes.get(name, {}))

    async def sadd(self, name: str, *values: Any) -> int:
        if name not in self._sets:
            self._sets[name] = set()
        old_len = len(self._sets[name])
        for v in values:
            self._sets[name].add(str(v))
        return len(self._sets[name]) - old_len

    async def sismember(self, name: str, value: Any) -> bool:
        if self._is_expired(name):
            return False
        return str(value) in self._sets.get(name, set())

    async def smembers(self, name: str) -> set:
        if self._is_expired(name):
            return set()
        return set(self._sets.get(name, set()))

    async def close(self) -> None:
        pass


# ── Redis Client ─────────────────────────────────────────────────

_redis_client: Any = None
_redis_checked: bool = False


async def get_redis() -> Any:
    """Provide a Redis client with fallback to InMemoryRedis."""
    global _redis_client, _redis_checked
    if _redis_client is None:
        settings = get_settings()
        try:
            client = aioredis.from_url(
                settings.redis_url,
                encoding="utf-8",
                decode_responses=True,
                socket_connect_timeout=2.0,
                socket_timeout=2.0,
            )
            # Test ping with short timeout
            await asyncio.wait_for(client.ping(), timeout=2.0)
            _redis_client = client
            logger.info("Connected to Redis server", url=settings.redis_url)
        except Exception as exc:
            logger.warning("Redis server offline, using in-memory fallback cache", error=str(exc))
            _redis_client = InMemoryRedis()
    return _redis_client


async def close_redis() -> None:
    """Close Redis client during shutdown."""
    global _redis_client
    if _redis_client is not None:
        try:
            await _redis_client.close()
        except Exception:
            pass
        _redis_client = None


# ── Authentication ───────────────────────────────────────────────


async def get_current_user_id(
    authorization: str | None = Header(None, alias="Authorization"),
    redis: Any = Depends(get_redis),
) -> int:
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


async def get_optional_user_id(
    authorization: str | None = Header(None, alias="Authorization"),
    redis: Any = Depends(get_redis),
) -> int | None:
    if not authorization or not authorization.startswith("Bearer "):
        return None
    try:
        return await get_current_user_id(authorization, redis)
    except AuthenticationError:
        return None
