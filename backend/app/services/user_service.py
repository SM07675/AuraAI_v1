"""
User profile service.

Handles profile reads, updates, interests, goals, and preferences.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import UserNotFoundError
from app.core.logging_config import get_logger
from app.models.user import User
from app.models.user_preference import UserPreference
from app.schemas.user import UserPreferenceItem

logger = get_logger(__name__)


class UserService:
    """Handles user profile CRUD and personalization."""

    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def get_user(self, user_id: int) -> User:
        """Fetch user by ID, raise if not found."""
        result = await self._db.execute(
            select(User).where(User.id == user_id, User.deleted_at.is_(None))
        )
        user = result.scalar_one_or_none()
        if not user:
            raise UserNotFoundError(f"User {user_id} not found.")
        return user

    async def update_profile(
        self,
        user_id: int,
        *,
        name: str | None = None,
        preferred_language: str | None = None,
        timezone: str | None = None,
        communication_style: str | None = None,
    ) -> User:
        """Partially update user profile fields."""
        user = await self.get_user(user_id)

        if name is not None:
            user.name = name.strip()
        if preferred_language is not None:
            user.preferred_language = preferred_language
        if timezone is not None:
            user.timezone = timezone
        if communication_style is not None:
            user.communication_style = communication_style

        await self._db.commit()
        await self._db.refresh(user)
        logger.info("Profile updated", user_id=user_id)
        return user

    async def update_interests(self, user_id: int, interests: list[str]) -> User:
        """Replace the user's interest list."""
        user = await self.get_user(user_id)
        cleaned = [i.strip().lower() for i in interests if i.strip()]
        user.interests = ",".join(cleaned)
        await self._db.commit()
        await self._db.refresh(user)
        logger.info("Interests updated", user_id=user_id, count=len(cleaned))
        return user

    async def update_goals(self, user_id: int, goals: list[str]) -> User:
        """Replace the user's goal list."""
        user = await self.get_user(user_id)
        cleaned = [g.strip() for g in goals if g.strip()]
        user.goals = ",".join(cleaned)
        await self._db.commit()
        await self._db.refresh(user)
        logger.info("Goals updated", user_id=user_id, count=len(cleaned))
        return user

    async def get_preferences(self, user_id: int) -> list[UserPreference]:
        """Get all preferences for a user."""
        result = await self._db.execute(
            select(UserPreference).where(UserPreference.user_id == user_id)
        )
        return list(result.scalars().all())

    async def upsert_preferences(
        self, user_id: int, preferences: list[UserPreferenceItem]
    ) -> list[UserPreference]:
        """Upsert a list of preferences (insert or update on conflict)."""
        for pref in preferences:
            stmt = (
                pg_insert(UserPreference)
                .values(
                    user_id=user_id,
                    category=pref.category,
                    key=pref.key,
                    value=pref.value,
                )
                .on_conflict_do_update(
                    constraint="uq_user_pref_category_key",
                    set_={"value": pref.value},
                )
            )
            await self._db.execute(stmt)

        await self._db.commit()
        return await self.get_preferences(user_id)

    async def hard_delete(self, user_id: int) -> None:
        """Hard-delete a user account (GDPR compliance)."""
        user = await self.get_user(user_id)
        await self._db.delete(user)
        await self._db.commit()
        logger.info("User account hard-deleted", user_id=user_id)

    async def export_data(self, user_id: int) -> dict[str, Any]:
        """Export all user data for GDPR compliance."""
        user = await self.get_user(user_id)
        prefs = await self.get_preferences(user_id)

        return {
            "profile": {
                "id": user.id,
                "name": user.name,
                "email": user.email,
                "preferred_language": user.preferred_language,
                "timezone": user.timezone,
                "communication_style": user.communication_style,
                "interests": user.interests,
                "goals": user.goals,
                "created_at": user.created_at.isoformat(),
            },
            "preferences": [
                {"category": p.category, "key": p.key, "value": p.value}
                for p in prefs
            ],
        }
