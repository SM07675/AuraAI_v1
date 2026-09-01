"""
Security utilities: password hashing and JWT token management.

Uses bcrypt directly (no passlib) for Python 3.14 + bcrypt 4.x compatibility.
Token blacklisting is handled via Redis for stateless revocation.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt
import jwt

from app.core.config import get_settings
from app.core.exceptions import TokenExpiredError, TokenInvalidError

# ── Password Hashing ─────────────────────────────────────────────

_BCRYPT_ROUNDS = 12


def hash_password(password: str) -> str:
    """Hash a plaintext password using bcrypt.

    Args:
        password: The plaintext password to hash.

    Returns:
        The bcrypt hash string.
    """
    pw_bytes = password.encode("utf-8")
    salt = bcrypt.gensalt(rounds=_BCRYPT_ROUNDS)
    return bcrypt.hashpw(pw_bytes, salt).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plaintext password against a bcrypt hash.

    Args:
        plain_password: The plaintext password to check.
        hashed_password: The stored bcrypt hash.

    Returns:
        True if the password matches, False otherwise.
    """
    try:
        return bcrypt.checkpw(
            plain_password.encode("utf-8"),
            hashed_password.encode("utf-8"),
        )
    except Exception:
        return False


# ── JWT Tokens ───────────────────────────────────────────────────


def create_access_token(
    subject: int | str,
    extra_claims: dict[str, Any] | None = None,
) -> str:
    """Create a JWT access token.

    Args:
        subject: The token subject (typically user ID).
        extra_claims: Additional claims to embed in the token.

    Returns:
        Encoded JWT string.
    """
    settings = get_settings()
    now = datetime.now(timezone.utc)
    expire = now + timedelta(minutes=settings.jwt_access_token_expire_minutes)

    payload = {
        "sub": str(subject),
        "iat": now,
        "exp": expire,
        "type": "access",
    }
    if extra_claims:
        payload.update(extra_claims)

    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def create_refresh_token(subject: int | str) -> str:
    """Create a JWT refresh token.

    Args:
        subject: The token subject (typically user ID).

    Returns:
        Encoded JWT string.
    """
    settings = get_settings()
    now = datetime.now(timezone.utc)
    expire = now + timedelta(days=settings.jwt_refresh_token_expire_days)

    payload = {
        "sub": str(subject),
        "iat": now,
        "exp": expire,
        "type": "refresh",
    }

    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> dict[str, Any]:
    """Decode and validate a JWT token.

    Args:
        token: The JWT token string.

    Returns:
        Decoded token payload.

    Raises:
        TokenExpiredError: If the token has expired.
        TokenInvalidError: If the token is invalid or malformed.
    """
    settings = get_settings()
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret_key,
            algorithms=[settings.jwt_algorithm],
        )
        return payload
    except jwt.ExpiredSignatureError:
        raise TokenExpiredError()
    except jwt.InvalidTokenError:
        raise TokenInvalidError()


# ── Token Blacklist (Redis) ──────────────────────────────────────


async def blacklist_token(redis_client: Any, token: str, expires_in: int | None = None) -> None:
    """Add a token to the blacklist in Redis.

    Args:
        redis_client: Async Redis client.
        token: The JWT token to blacklist.
        expires_in: TTL in seconds. If None, uses the token's own expiry.
    """
    if expires_in is None:
        try:
            payload = jwt.decode(
                token,
                get_settings().jwt_secret_key,
                algorithms=[get_settings().jwt_algorithm],
                options={"verify_exp": False},
            )
            exp = payload.get("exp", 0)
            now = int(datetime.now(timezone.utc).timestamp())
            expires_in = max(exp - now, 60)
        except jwt.InvalidTokenError:
            expires_in = 3600  # Default 1 hour

    await redis_client.set(f"blacklist:{token}", "1", ex=expires_in)


async def is_token_blacklisted(redis_client: Any, token: str) -> bool:
    """Check if a token is blacklisted.

    Args:
        redis_client: Async Redis client.
        token: The JWT token to check.

    Returns:
        True if the token is blacklisted.
    """
    result = await redis_client.get(f"blacklist:{token}")
    return result is not None
