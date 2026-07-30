"""
Memory service — short-term and long-term memory management.

Short-term: Recent messages in this session (last N turns).
Long-term: Persistent user facts, preferences, goals, summaries stored in PostgreSQL.
Semantic memory interface: Abstract hook for future vector DB integration.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging_config import get_logger
from app.models.memory import LongTermMemory, MemoryType, ShortTermMemory

logger = get_logger(__name__)

# Max short-term turns to keep in DB (Redis-based cache in future)
_STM_WINDOW = 10
# Max long-term memories to inject into prompts
_LTM_INJECT_LIMIT = 15


class MemoryService:
    """Handles all memory storage and retrieval for a user."""

    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    # ── Short-Term Memory ─────────────────────────────────────────

    async def add_short_term(
        self,
        session_id: int,
        user_id: int,
        key: str,
        value: str,
        metadata: dict | None = None,
    ) -> None:
        """Store a short-term memory entry for this session."""
        entry = ShortTermMemory(
            session_id=session_id,
            user_id=user_id,
            key=key,
            value=value,
            metadata_json=metadata,
        )
        self._db.add(entry)
        await self._db.commit()

    async def get_session_memories(self, session_id: int) -> list[ShortTermMemory]:
        """Get all short-term memories for a session."""
        result = await self._db.execute(
            select(ShortTermMemory)
            .where(ShortTermMemory.session_id == session_id)
            .order_by(ShortTermMemory.created_at.desc())
            .limit(_STM_WINDOW)
        )
        return list(reversed(result.scalars().all()))

    async def clear_session_memories(self, session_id: int) -> None:
        """Clear short-term memories when a session ends."""
        await self._db.execute(
            delete(ShortTermMemory).where(ShortTermMemory.session_id == session_id)
        )
        await self._db.commit()

    # ── Long-Term Memory ──────────────────────────────────────────

    async def store_long_term(
        self,
        user_id: int,
        memory_type: str,
        key: str,
        value: str,
        importance: float = 0.5,
        source_session_id: int | None = None,
    ) -> LongTermMemory:
        """Store or update a long-term memory.

        If a memory with the same user_id + memory_type + key exists,
        it will be updated. Otherwise a new entry is created.
        """
        # Check for existing
        result = await self._db.execute(
            select(LongTermMemory).where(
                LongTermMemory.user_id == user_id,
                LongTermMemory.memory_type == memory_type,
                LongTermMemory.key == key,
            )
        )
        existing = result.scalar_one_or_none()

        if existing:
            existing.value = value
            existing.importance_score = max(existing.importance_score, importance)
            if source_session_id:
                existing.source_session_id = source_session_id
            await self._db.commit()
            await self._db.refresh(existing)
            return existing
        else:
            memory = LongTermMemory(
                user_id=user_id,
                memory_type=memory_type,
                key=key,
                value=value,
                importance_score=importance,
                source_session_id=source_session_id,
            )
            self._db.add(memory)
            await self._db.commit()
            await self._db.refresh(memory)
            logger.info("Long-term memory stored", user_id=user_id, type=memory_type, key=key)
            return memory

    async def get_long_term_memories(
        self,
        user_id: int,
        memory_type: str | None = None,
        limit: int = _LTM_INJECT_LIMIT,
    ) -> list[LongTermMemory]:
        """Retrieve long-term memories, ordered by importance."""
        query = (
            select(LongTermMemory)
            .where(LongTermMemory.user_id == user_id)
            .order_by(LongTermMemory.importance_score.desc())
            .limit(limit)
        )
        if memory_type:
            query = query.where(LongTermMemory.memory_type == memory_type)

        result = await self._db.execute(query)
        return list(result.scalars().all())

    async def delete_memory(self, memory_id: int, user_id: int) -> bool:
        """Delete a specific long-term memory (user-owned only)."""
        result = await self._db.execute(
            select(LongTermMemory).where(
                LongTermMemory.id == memory_id,
                LongTermMemory.user_id == user_id,
            )
        )
        memory = result.scalar_one_or_none()
        if not memory:
            return False
        await self._db.delete(memory)
        await self._db.commit()
        return True

    async def get_memory_for_prompt(self, user_id: int) -> list[dict[str, Any]]:
        """Get formatted long-term memories suitable for prompt injection."""
        memories = await self.get_long_term_memories(user_id)
        return [
            {"key": m.key, "value": m.value, "type": m.memory_type}
            for m in memories
        ]

    # ── Semantic Memory Interface (future vector DB hook) ─────────

    async def semantic_search(
        self, user_id: int, query: str, limit: int = 5
    ) -> list[dict[str, Any]]:
        """Search memories semantically.

        Currently falls back to keyword matching.
        Replace this implementation with a vector DB query when ready.
        """
        query_lower = query.lower()
        memories = await self.get_long_term_memories(user_id, limit=50)
        matches = [
            {"key": m.key, "value": m.value, "type": m.memory_type, "score": 1.0}
            for m in memories
            if query_lower in m.value.lower() or query_lower in m.key.lower()
        ]
        return matches[:limit]
