"""
Authentication service.

Handles user registration, login, and token lifecycle.
Business logic only — no HTTP concerns.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.exceptions import AuthenticationError, UserAlreadyExistsError, UserNotFoundError
from app.core.logging_config import get_logger
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.models.user import User
from app.schemas.auth import TokenResponse

logger = get_logger(__name__)
settings = get_settings()


class AuthService:
    """Handles authentication business logic."""

    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def register(self, name: str, email: str, password: str) -> tuple[User, TokenResponse]:
        """Register a new user.

        Args:
            name: Display name.
            email: Email address (must be unique).
            password: Plaintext password (will be hashed).

        Returns:
            Tuple of (User, TokenResponse).

        Raises:
            UserAlreadyExistsError: If email is already registered.
        """
        email = email.lower().strip()

        # Check for existing user
        result = await self._db.execute(select(User).where(User.email == email))
        existing = result.scalar_one_or_none()
        if existing:
            raise UserAlreadyExistsError(f"Email '{email}' is already registered.")

        # Create user
        user = User(
            name=name.strip(),
            email=email,
            password_hash=hash_password(password),
        )
        self._db.add(user)
        await self._db.commit()
        await self._db.refresh(user)

        logger.info("User registered", user_id=user.id, email=user.email)

        tokens = self._generate_tokens(user)
        return user, tokens

    async def login(self, email: str, password: str) -> tuple[User, TokenResponse]:
        """Authenticate a user with email and password.

        Args:
            email: User's email address.
            password: Plaintext password to verify.

        Returns:
            Tuple of (User, TokenResponse).

        Raises:
            AuthenticationError: If credentials are invalid.
        """
        email = email.lower().strip()

        result = await self._db.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()

        if not user or not verify_password(password, user.password_hash):
            raise AuthenticationError("Invalid email or password.")

        if user.deleted_at is not None:
            raise AuthenticationError("Account has been deactivated.")

        logger.info("User logged in", user_id=user.id)

        tokens = self._generate_tokens(user)
        return user, tokens

    async def refresh_tokens(self, refresh_token: str) -> TokenResponse:
        """Issue a new access token from a valid refresh token.

        Args:
            refresh_token: A valid, non-expired refresh token.

        Returns:
            New TokenResponse with fresh access + refresh tokens.

        Raises:
            AuthenticationError: If the token is invalid or expired.
        """
        payload = decode_token(refresh_token)
        if payload.get("type") != "refresh":
            raise AuthenticationError("Invalid token type for refresh.")

        user_id = int(payload.get("sub", 0))
        result = await self._db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()

        if not user:
            raise UserNotFoundError("User associated with token not found.")

        logger.info("Tokens refreshed", user_id=user.id)
        return self._generate_tokens(user)

    async def get_user_by_id(self, user_id: int) -> User:
        """Fetch a user by primary key.

        Raises:
            UserNotFoundError: If no user with that ID exists.
        """
        result = await self._db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if not user:
            raise UserNotFoundError(f"User {user_id} not found.")
        return user

    def _generate_tokens(self, user: User) -> TokenResponse:
        """Generate access and refresh tokens for a user."""
        access_token = create_access_token(user.id)
        refresh_token = create_refresh_token(user.id)
        return TokenResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            expires_in=settings.jwt_access_token_expire_minutes * 60,
        )
