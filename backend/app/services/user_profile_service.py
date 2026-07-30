"""
User Profile Service — centralized profile retrieval for context injection.

Aggregates data from multiple sources into a single ``UserProfile`` object:
  - User DB record (name, preferences, communication style)
  - Active goals (from Goal Engine)
  - Long-term memories (from Memory Service)
  - Conversation patterns (turn count, avg session duration)

Single entry point: ``get_profile_for_context(user_id)``
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging_config import get_logger
from app.models.goal import GoalStatus, UserGoal
from app.models.memory import LongTermMemory
from app.models.session import Session
from app.models.user import User

logger = get_logger(__name__)


@dataclass
class UserProfile:
    """Aggregated user profile ready for context injection."""

    # Identity
    user_id: int
    name: str
    first_name: str

    # Preferences
    preferred_language: str = "en"
    timezone: str = "UTC"
    communication_style: str = "balanced"
    learning_style: str = "visual"

    # Interests & Skills (from User model CSV fields)
    interests: list[str] = field(default_factory=list)
    skills: list[str] = field(default_factory=list)
    projects: list[str] = field(default_factory=list)
    favourite_topics: list[str] = field(default_factory=list)

    # Active goals (from Goal Engine)
    active_goals: list[dict[str, Any]] = field(default_factory=list)

    # Top memories (from LTM)
    top_memories: list[dict[str, Any]] = field(default_factory=list)

    # Conversation patterns
    total_sessions: int = 0
    total_messages: int = 0

    def to_context_dict(self) -> dict[str, Any]:
        """Return a dict suitable for prompt context injection."""
        return {
            "user_name": self.first_name,
            "preferred_language": self.preferred_language,
            "timezone": self.timezone,
            "communication_style": self.communication_style,
            "learning_style": self.learning_style,
            "interests": ", ".join(self.interests) if self.interests else "None",
            "skills": ", ".join(self.skills) if self.skills else "None",
            "projects": ", ".join(self.projects) if self.projects else "None",
            "favourite_topics": ", ".join(self.favourite_topics) if self.favourite_topics else "None",
            "active_goals": self.active_goals,
            "top_memories": self.top_memories,
            "total_sessions": self.total_sessions,
        }


def _parse_csv(value: str | None) -> list[str]:
    """Parse a comma-separated string into a list of trimmed non-empty strings."""
    if not value:
        return []
    return [item.strip() for item in value.split(",") if item.strip()]


class UserProfileService:
    """Centralized user profile retrieval.

    Args:
        db: Async database session.
    """

    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def get_profile_for_context(self, user_id: int) -> UserProfile | None:
        """Build a complete user profile for AI context injection.

        Aggregates user data, active goals, and top memories into a single
        ``UserProfile`` object. Returns None if the user doesn't exist.
        """
        # 1. Load user record
        result = await self._db.execute(
            select(User).where(User.id == user_id)
        )
        user = result.scalar_one_or_none()
        if not user:
            return None

        # 2. Load active goals
        goals_result = await self._db.execute(
            select(UserGoal)
            .where(
                UserGoal.user_id == user_id,
                UserGoal.status == GoalStatus.ACTIVE.value,
            )
            .order_by(UserGoal.priority.desc())
            .limit(10)
        )
        active_goals = [g.to_context_dict() for g in goals_result.scalars().all()]

        # 3. Load top memories
        mem_result = await self._db.execute(
            select(LongTermMemory)
            .where(LongTermMemory.user_id == user_id)
            .order_by(LongTermMemory.importance_score.desc())
            .limit(10)
        )
        top_memories = [
            {"key": m.key, "value": m.value, "type": m.memory_type}
            for m in mem_result.scalars().all()
        ]

        # 4. Load session count
        session_count = await self._db.execute(
            select(func.count(Session.id)).where(Session.user_id == user_id)
        )
        total_sessions = session_count.scalar() or 0

        # 5. Build profile
        name = user.name or "User"
        first_name = name.split()[0] if name else "there"

        profile = UserProfile(
            user_id=user_id,
            name=name,
            first_name=first_name,
            preferred_language=user.preferred_language or "en",
            timezone=user.timezone or "UTC",
            communication_style=user.communication_style or "balanced",
            learning_style=user.learning_style or "visual",
            interests=_parse_csv(user.interests),
            skills=_parse_csv(user.skills),
            projects=_parse_csv(user.projects),
            favourite_topics=_parse_csv(user.favourite_topics),
            active_goals=active_goals,
            top_memories=top_memories,
            total_sessions=total_sessions,
        )

        logger.debug(
            "User profile loaded",
            user_id=user_id,
            goals=len(active_goals),
            memories=len(top_memories),
        )

        return profile

    async def get_user(self, user_id: int) -> User | None:
        """Load the raw User ORM object."""
        result = await self._db.execute(
            select(User).where(User.id == user_id)
        )
        return result.scalar_one_or_none()
