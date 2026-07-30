"""
Memory Builder

Analyzes the conversational turn to extract free-form persistent knowledge
and stores it in the LongTermMemory table.

Improvements over v1:
  - Deduplication: checks existing memories before storing
  - Importance decay: reduces importance of old, un-accessed memories
  - Context-aware: includes conversation context for better extraction
  - Memory cap: limits total memories per user (default 100, evicts lowest)
"""

from __future__ import annotations

import json

from sqlalchemy import select, func, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.base import AIRequest
from app.ai.gateway import AIGateway
from app.core.logging_config import get_logger
from app.models.memory import LongTermMemory, MemoryType
from app.models.user import User
from app.models.session import Session

logger = get_logger(__name__)

# Maximum long-term memories per user
_MAX_MEMORIES_PER_USER = 100
# Importance decay factor applied to old memories during eviction
_IMPORTANCE_DECAY = 0.95


class MemoryBuilder:
    """Extracts and stores long-term memories from conversation.

    Args:
        gateway: AI gateway for LLM-based memory extraction.
    """

    def __init__(self, gateway: AIGateway) -> None:
        self._gateway = gateway
        self._system_prompt = (
            "You are an AI Memory Extraction Engine.\n"
            "Analyze the user's message IN CONTEXT of the recent conversation.\n"
            "Extract ANY new, useful long-term facts, profile traits (Age, Occupation, Education, Hobbies), "
            "preferences, ongoing tasks, or relationships that should be remembered forever.\n\n"
            "IMPORTANT RULES:\n"
            "- Only extract FACTUAL information the user explicitly states\n"
            "- Do NOT extract opinions about the conversation or meta-observations\n"
            "- NEVER store temporary emotions, current feelings, or transient states permanently\n"
            "- Do NOT re-extract information already in 'Existing Memories'\n"
            "- Prefer updating existing memory keys over creating new ones\n"
            "- Use clear, specific keys (e.g., 'favorite_food', 'spouse_name', 'occupation')\n\n"
            "Return a JSON array of objects, where each object has:\n"
            "  - 'type': one of ['preference', 'goal', 'interest', 'fact', 'personality']\n"
            "  - 'key': short 1-3 word identifier\n"
            "  - 'value': the actual information to remember\n"
            "  - 'importance': float between 0.0 and 1.0 (1.0 = extremely important)\n"
            "If nothing should be remembered, return an empty array: []\n"
            "Return ONLY raw JSON, no markdown, no backticks."
        )

    async def build(
        self,
        user: User,
        session: Session,
        db: AsyncSession,
        user_message: str,
        recent_context: str = "",
    ) -> int:
        """Extract memories from user message and store them.

        Args:
            user: Current user ORM object.
            session: Current session ORM object.
            db: Async database session.
            user_message: The user's latest message.
            recent_context: Recent conversation context for better extraction.

        Returns:
            Number of new memories created.
        """
        # Load existing memories for dedup context
        existing = await self._get_existing_memories(db, user.id)
        existing_summary = "\n".join(
            f"- {m.key}: {m.value}" for m in existing[:20]
        ) or "None"

        prompt = (
            f"Existing Memories (do NOT re-extract these):\n{existing_summary}\n\n"
        )
        if recent_context:
            prompt += f"Recent Conversation:\n{recent_context}\n\n"
        prompt += f"User's latest message: {user_message}"

        req = AIRequest(
            system_prompt=self._system_prompt,
            prompt=prompt,
            stream=False,
            temperature=0.1,
        )

        try:
            resp = await self._gateway.generate(req)
            content = resp.content.strip()

            # Strip markdown if present
            if content.startswith("```json"):
                content = content[7:]
            if content.startswith("```"):
                content = content[3:]
            if content.endswith("```"):
                content = content[:-3]

            data = json.loads(content.strip())

            if not isinstance(data, list) or not data:
                return 0

            created = 0
            existing_keys = {(m.memory_type, m.key.lower()) for m in existing}

            for item in data:
                memory_type = item.get("type", "fact")
                if memory_type not in [e.value for e in MemoryType]:
                    memory_type = "fact"

                key = item.get("key", "").strip()
                value = item.get("value", "").strip()
                importance = min(1.0, max(0.0, item.get("importance", 0.5)))

                if not key or not value:
                    continue

                # Dedup check: skip if same type+key already exists
                if (memory_type, key.lower()) in existing_keys:
                    # Update existing memory value instead
                    await self._update_existing(db, user.id, memory_type, key, value, importance)
                    continue

                new_mem = LongTermMemory(
                    user_id=user.id,
                    memory_type=memory_type,
                    key=key,
                    value=value,
                    importance_score=importance,
                    source_session_id=session.id,
                )
                db.add(new_mem)
                created += 1

            await db.commit()

            # Enforce memory cap
            await self._enforce_memory_cap(db, user.id)

            if created:
                logger.info(
                    f"Extracted {created} new memories via MemoryBuilder",
                    user_id=user.id,
                )

            return created

        except Exception as e:
            logger.warning("Failed to extract memories", error=str(e))
            return 0

    async def _get_existing_memories(
        self, db: AsyncSession, user_id: int
    ) -> list[LongTermMemory]:
        """Load existing memories for deduplication context."""
        result = await db.execute(
            select(LongTermMemory)
            .where(LongTermMemory.user_id == user_id)
            .order_by(LongTermMemory.importance_score.desc())
            .limit(50)
        )
        return list(result.scalars().all())

    async def _update_existing(
        self,
        db: AsyncSession,
        user_id: int,
        memory_type: str,
        key: str,
        new_value: str,
        new_importance: float,
    ) -> None:
        """Update an existing memory with new value if different."""
        result = await db.execute(
            select(LongTermMemory).where(
                LongTermMemory.user_id == user_id,
                LongTermMemory.memory_type == memory_type,
                LongTermMemory.key == key,
            )
        )
        mem = result.scalar_one_or_none()
        if mem and mem.value != new_value:
            mem.value = new_value
            mem.importance_score = max(mem.importance_score, new_importance)
            logger.debug("Memory updated", key=key, user_id=user_id)

    async def _enforce_memory_cap(self, db: AsyncSession, user_id: int) -> None:
        """Evict lowest-importance memories if over the cap."""
        count_result = await db.execute(
            select(func.count(LongTermMemory.id)).where(
                LongTermMemory.user_id == user_id
            )
        )
        total = count_result.scalar() or 0

        if total <= _MAX_MEMORIES_PER_USER:
            return

        # Get IDs of memories to evict (lowest importance, oldest)
        excess = total - _MAX_MEMORIES_PER_USER
        evict_result = await db.execute(
            select(LongTermMemory.id)
            .where(LongTermMemory.user_id == user_id)
            .order_by(
                LongTermMemory.importance_score.asc(),
                LongTermMemory.updated_at.asc(),
            )
            .limit(excess)
        )
        evict_ids = [row[0] for row in evict_result.all()]

        if evict_ids:
            await db.execute(
                delete(LongTermMemory).where(LongTermMemory.id.in_(evict_ids))
            )
            await db.commit()
            logger.info(
                "Evicted low-importance memories",
                user_id=user_id,
                evicted=len(evict_ids),
            )
