"""
Redis-based rate limiter using a sliding window algorithm.

Each client (identified by IP or user ID) is allowed a configurable
number of requests per minute. Exceeding the limit returns HTTP 429.
"""

from __future__ import annotations

from typing import Any

from app.core.config import get_settings
from app.core.exceptions import RateLimitExceededError
from app.core.logging_config import get_logger

logger = get_logger(__name__)


class RateLimiter:
    """Sliding-window rate limiter backed by Redis.

    Uses Redis INCR + EXPIRE to implement a fixed-window counter.
    This is simpler than a true sliding window but effective for
    most production use cases.
    """

    def __init__(self, redis_client: Any, requests_per_minute: int | None = None) -> None:
        """Initialize the rate limiter.

        Args:
            redis_client: Async Redis client instance.
            requests_per_minute: Max requests allowed per minute per key.
                Falls back to settings if not provided.
        """
        self._redis = redis_client
        self._limit = requests_per_minute or get_settings().rate_limit_per_minute

    async def check(self, key: str) -> None:
        """Check if the request is within rate limits.

        Args:
            key: Unique identifier for the client (e.g., IP address, user ID).

        Raises:
            RateLimitExceededError: If the rate limit is exceeded.
        """
        redis_key = f"ratelimit:{key}"

        # Increment counter atomically
        current = await self._redis.incr(redis_key)

        if current == 1:
            # First request in this window — set 60-second TTL
            await self._redis.expire(redis_key, 60)

        if current > self._limit:
            ttl = await self._redis.ttl(redis_key)
            logger.warning(
                "Rate limit exceeded",
                key=key,
                current=current,
                limit=self._limit,
                retry_after=ttl,
            )
            raise RateLimitExceededError(
                message=f"Rate limit exceeded. Try again in {ttl} seconds.",
                details={"retry_after_seconds": ttl, "limit": self._limit},
            )

    async def get_remaining(self, key: str) -> int:
        """Get the number of remaining requests for a key.

        Args:
            key: Unique identifier for the client.

        Returns:
            Number of remaining requests in the current window.
        """
        redis_key = f"ratelimit:{key}"
        current = await self._redis.get(redis_key)
        if current is None:
            return self._limit
        return max(0, self._limit - int(current))
