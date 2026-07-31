"""
Goal Engine — discovers, tracks, and manages user goals.

Goals are structured entities (not CSV strings) stored in the `user_goals` table.
The engine:
  - Detects new goals from conversation via LLM analysis
  - Updates existing goals with progress notes
  - Provides active goals for context injection
  - Prevents duplicate goal creation
  - Manages goal lifecycle (active → completed/paused/abandoned)
"""

from __future__ import annotations

import json
from typing import Any

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.base import AIRequest
from app.ai.gateway import AIGateway
from app.core.logging_config import get_logger
from app.models.goal import GoalCategory, GoalStatus, UserGoal

logger = get_logger(__name__)

# Maximum goals per user to prevent unbounded growth
_MAX_GOALS_PER_USER = 50

_GOAL_DETECTION_PROMPT = (
    "You are an AI Goal Detection Engine.\n"
    "Analyze the user's message in the context of their existing goals.\n"
    "Determine if the user has expressed any NEW goals, or if they are providing a "
    "progress UPDATE on an existing goal.\n\n"
    "Rules:\n"
    "- Only detect goals that are clearly stated or strongly implied\n"
    "- Do NOT create goals from casual mentions (e.g., 'I like pizza' is NOT a goal)\n"
    "- Goals must be actionable aspirations (learning, achieving, building, improving)\n"
    "- If the message updates an existing goal, provide the goal ID and progress note\n"
    "- If no goals are detected, return empty arrays\n\n"
    "Return ONLY raw JSON matching this schema (no markdown, no backticks):\n"
    '{"new_goals": [{"title": "...", "category": "career|learning|fitness|mental_wellness|'
    'programming|research|creative|personal|other", "priority": 0.0-1.0, '
    '"description": "..."}], "goal_updates": [{"goal_id": 123, "progress_note": "..."}]}'
)


class GoalEngine:
    """Discovers and manages user goals.

    Args:
        gateway: AI gateway for LLM-based goal detection. Optional — if not
                 provided, a shared gateway is created on first use.
    """

    def __init__(self, gateway: AIGateway | None = None) -> None:
        self._gateway = gateway

    def _get_gateway(self) -> AIGateway:
        if self._gateway is None:
            self._gateway = AIGateway()
        return self._gateway

    # ── Goal Retrieval ────────────────────────────────────────────

    async def get_active_goals(
        self, db: AsyncSession, user_id: int, limit: int = 10
    ) -> list[UserGoal]:
        """Retrieve active goals ordered by priority (descending)."""
        result = await db.execute(
            select(UserGoal)
            .where(
                UserGoal.user_id == user_id,
                UserGoal.status == GoalStatus.ACTIVE.value,
            )
            .order_by(UserGoal.priority.desc())
            .limit(limit)
        )
        scalars = getattr(result, "scalars", None)
        if scalars is not None and hasattr(scalars, "all"):
            items = scalars.all()
            if hasattr(items, "__await__"):
                items = await items
            return list(items)
        return []

    async def get_all_goals(
        self, db: AsyncSession, user_id: int
    ) -> list[UserGoal]:
        """Retrieve all goals (any status) for a user."""
        result = await db.execute(
            select(UserGoal)
            .where(UserGoal.user_id == user_id)
            .order_by(UserGoal.priority.desc(), UserGoal.created_at.desc())
        )
        scalars = getattr(result, "scalars", None)
        if scalars is not None and hasattr(scalars, "all"):
            items = scalars.all()
            if hasattr(items, "__await__"):
                items = await items
            return list(items)
        return []

    async def get_goals_for_context(
        self, db: AsyncSession, user_id: int
    ) -> list[dict[str, Any]]:
        """Return active goals formatted for prompt context injection."""
        goals = await self.get_active_goals(db, user_id)
        return [g.to_context_dict() for g in goals]

    # ── Goal Detection ────────────────────────────────────────────

    async def detect_and_update(
        self,
        db: AsyncSession,
        user_id: int,
        user_message: str,
        session_id: int | None = None,
    ) -> None:
        """Analyze a user message for new goals or updates to existing goals.

        Runs as a background task — failures are logged but don't break the
        main pipeline.
        """
        # Get existing goals for context
        existing = await self.get_all_goals(db, user_id)
        existing_summary = "\n".join(
            f"- [ID {g.id}] {g.title} ({g.status}, {g.category})"
            for g in existing
        ) or "No existing goals."

        prompt = (
            f"Existing goals:\n{existing_summary}\n\n"
            f"User message: {user_message}"
        )

        req = AIRequest(
            system_prompt=_GOAL_DETECTION_PROMPT,
            prompt=prompt,
            stream=False,
            temperature=0.1,
        )

        try:
            resp = await self._get_gateway().generate(req)
            content = resp.content.strip()

            # Strip markdown fences if present
            if content.startswith("```json"):
                content = content[7:]
            if content.startswith("```"):
                content = content[3:]
            if content.endswith("```"):
                content = content[:-3]

            data = json.loads(content.strip())

            # Process new goals
            new_goals = data.get("new_goals", [])
            if new_goals:
                await self._create_goals(
                    db, user_id, new_goals, existing, session_id
                )

            # Process goal updates
            goal_updates = data.get("goal_updates", [])
            if goal_updates:
                await self._update_goals(db, user_id, goal_updates)

        except Exception as e:
            logger.warning("Goal detection failed", error=str(e), user_id=user_id)

    async def _create_goals(
        self,
        db: AsyncSession,
        user_id: int,
        new_goals: list[dict],
        existing: list[UserGoal],
        session_id: int | None,
    ) -> None:
        """Create new goals, deduplicating against existing ones."""
        # Check total goal count
        count_result = await db.execute(
            select(func.count(UserGoal.id)).where(UserGoal.user_id == user_id)
        )
        scalar = getattr(count_result, "scalar", None)
        if callable(scalar):
            try:
                value = scalar()
                if hasattr(value, "__await__"):
                    value = await value
                total = value or 0
            except TypeError:
                total = 0
        else:
            total = 0

        existing_titles = {g.title.lower().strip() for g in existing}

        for goal_data in new_goals:
            if total >= _MAX_GOALS_PER_USER:
                logger.warning(
                    "Goal limit reached", user_id=user_id, max=_MAX_GOALS_PER_USER
                )
                break

            title = goal_data.get("title", "").strip()
            if not title:
                continue

            # Dedup: skip if title is very similar to an existing goal
            if title.lower() in existing_titles:
                logger.debug("Duplicate goal skipped", title=title)
                continue

            category = goal_data.get("category", "other")
            if category not in [c.value for c in GoalCategory]:
                category = GoalCategory.OTHER.value

            goal = UserGoal(
                user_id=user_id,
                title=title,
                description=goal_data.get("description"),
                category=category,
                priority=min(1.0, max(0.0, goal_data.get("priority", 0.5))),
                source_session_id=session_id,
            )
            db.add(goal)
            total += 1
            logger.info("New goal detected", user_id=user_id, title=title)

        await db.commit()

    async def _update_goals(
        self,
        db: AsyncSession,
        user_id: int,
        updates: list[dict],
    ) -> None:
        """Apply progress updates to existing goals."""
        for update in updates:
            goal_id = update.get("goal_id")
            progress = update.get("progress_note", "").strip()
            if not goal_id or not progress:
                continue

            result = await db.execute(
                select(UserGoal).where(
                    UserGoal.id == goal_id,
                    UserGoal.user_id == user_id,
                )
            )
            goal = result.scalar_one_or_none()
            if goal:
                existing_notes = goal.progress_notes or ""
                goal.progress_notes = (
                    f"{existing_notes}\n- {progress}" if existing_notes
                    else f"- {progress}"
                )
                logger.info(
                    "Goal updated", goal_id=goal_id, note_preview=progress[:60]
                )

        await db.commit()

    # ── Goal Lifecycle ────────────────────────────────────────────

    async def update_status(
        self,
        db: AsyncSession,
        user_id: int,
        goal_id: int,
        new_status: GoalStatus,
    ) -> UserGoal | None:
        """Change a goal's status."""
        result = await db.execute(
            select(UserGoal).where(
                UserGoal.id == goal_id,
                UserGoal.user_id == user_id,
            )
        )
        goal = result.scalar_one_or_none()
        if goal:
            goal.status = new_status.value
            await db.commit()
            await db.refresh(goal)
            logger.info(
                "Goal status updated",
                goal_id=goal_id,
                new_status=new_status.value,
            )
        return goal

    async def update_priority(
        self,
        db: AsyncSession,
        user_id: int,
        goal_id: int,
        priority: float,
    ) -> UserGoal | None:
        """Update a goal's priority."""
        result = await db.execute(
            select(UserGoal).where(
                UserGoal.id == goal_id,
                UserGoal.user_id == user_id,
            )
        )
        goal = result.scalar_one_or_none()
        if goal:
            goal.priority = min(1.0, max(0.0, priority))
            await db.commit()
            await db.refresh(goal)
        return goal
