"""
Memory service — short-term and long-term memory management for Aura AI 2.0.

Layer 2 & 3 of the 7-Layer Memory Hierarchy:
- Short-term: Recent messages in active session.
- Long-term: Persistent user facts, preferences, goals, summaries stored in PostgreSQL.
- Memory deduplication & merging policy.
- Memory versioning history.
- Semantic vector retrieval integration via SemanticMemoryService.
"""

from __future__ import annotations

import inspect
from datetime import datetime, timezone
import re
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging_config import get_logger
from app.models.memory import LongTermMemory, MemoryType, MemoryVersion, ShortTermMemory
from app.services.semantic_memory_service import SemanticMemoryService
from app.utils.sanitizer import sanitize_sensitive_data

logger = get_logger(__name__)

# Max short-term turns to keep in DB
_STM_WINDOW = 12
# Max long-term memories to inject into prompts
_LTM_INJECT_LIMIT = 15

_TOKEN_RE = re.compile(r"[^\W_]+", re.UNICODE)
_MEMORY_STOP_WORDS = {
    "a", "an", "and", "are", "as", "at", "be", "for", "from", "i", "in",
    "is", "it", "me", "my", "of", "on", "or", "that", "the", "this", "to",
    "was", "we", "with", "you", "your", "है", "हैं", "था", "थी", "और",
    "का", "की", "के", "को", "मैं", "मेरा", "मेरी", "से", "यह",
}


class MemoryService:
    """Handles all memory storage, deduplication, versioning, and hybrid retrieval."""

    def __init__(self, db: AsyncSession) -> None:
        self._db = db
        self._semantic = SemanticMemoryService()

    # ── Short-Term Memory ─────────────────────────────────────────

    async def add_short_term(
        self,
        session_id: int,
        user_id: int,
        key: str,
        value: str,
        metadata: dict | None = None,
    ) -> None:
        """Store a short-term memory entry for this session with privacy sanitization."""
        clean_value = sanitize_sensitive_data(value)
        entry = ShortTermMemory(
            session_id=session_id,
            user_id=user_id,
            key=key,
            value=clean_value,
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

    # ── Long-Term Memory (with Deduplication & Versioning) ────────

    async def store_long_term(
        self,
        user_id: int,
        memory_type: str,
        key: str,
        value: str,
        importance: float = 0.5,
        confidence: float = 0.85,
        source: str = "conversation",
        source_session_id: int | None = None,
        privacy_level: str = "private",
    ) -> LongTermMemory:
        """Store or update a durable memory with deduplication, privacy sanitization and version tracking."""
        clean_value = sanitize_sensitive_data(value)
        # 1. Check for exact key match
        stmt = select(LongTermMemory).where(
            LongTermMemory.user_id == user_id,
            LongTermMemory.memory_type == memory_type,
            LongTermMemory.key == key,
        )
        res = await self._db.execute(stmt)
        existing = res.scalar_one_or_none()

        # 2. Check for semantic near-duplicates under the same type
        if not existing:
            all_type_mems = await self.get_long_term_memories(user_id, memory_type=memory_type)
            norm_val = clean_value.strip().lower()
            for cand in all_type_mems:
                cand_val = cand.value.strip().lower()
                # If values are near-identical or one contains the other with high similarity
                if cand_val == norm_val or (len(norm_val) > 10 and norm_val in cand_val) or (len(cand_val) > 10 and cand_val in norm_val):
                    existing = cand
                    break

        embedding = self._semantic.compute_lightweight_embedding(f"{key} {clean_value}")

        if existing:
            # If value changed significantly, create a version record
            if existing.value != clean_value:
                ver = MemoryVersion(
                    memory_id=existing.id,
                    user_id=user_id,
                    version_number=existing.version,
                    value=existing.value,
                    importance_score=existing.importance_score,
                    change_reason="deduplication_merge" if existing.key != key else "user_refinement",
                )
                self._db.add(ver)
                existing.version += 1

            existing.value = clean_value
            existing.importance_score = max(existing.importance_score, importance)
            existing.confidence = max(existing.confidence, confidence)
            existing.embedding_json = embedding
            existing.last_used_at = datetime.now(timezone.utc)
            if source_session_id:
                existing.source_session_id = source_session_id
            await self._db.commit()
            await self._db.refresh(existing)
            logger.info("Long-term memory updated & versioned", user_id=user_id, key=key, v=existing.version)
            return existing
        else:
            memory = LongTermMemory(
                user_id=user_id,
                memory_type=memory_type,
                key=key,
                value=clean_value,
                importance_score=importance,
                confidence=confidence,
                source=source,
                version=1,
                privacy_level=privacy_level,
                embedding_json=embedding,
                source_session_id=source_session_id,
                last_used_at=datetime.now(timezone.utc),
            )
            self._db.add(memory)
            await self._db.commit()
            await self._db.refresh(memory)
            logger.info("Long-term memory created", user_id=user_id, type=memory_type, key=key)
            return memory

    # Alias for backward compatibility
    store_long_term_memory = store_long_term

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
        scalars = result.scalars()
        if inspect.isawaitable(scalars):
            scalars = await scalars
        items = scalars.all()
        if inspect.isawaitable(items):
            items = await items
        return list(items)

    @staticmethod
    def lexical_relevance(memory: LongTermMemory, query: str) -> float:
        """Return topic overlap between the current message and one memory."""
        query_tokens = {
            token
            for token in _TOKEN_RE.findall((query or "").lower())
            if len(token) > 1 and token not in _MEMORY_STOP_WORDS
        }
        memory_text = f"{memory.key} {memory.value}".lower()
        memory_tokens = {
            token
            for token in _TOKEN_RE.findall(memory_text)
            if len(token) > 1 and token not in _MEMORY_STOP_WORDS
        }

        lexical_score = 0.0
        if query_tokens and memory_tokens:
            lexical_score = len(query_tokens & memory_tokens) / len(query_tokens)
            if (query or "").strip().lower() in memory_text:
                lexical_score = max(lexical_score, 0.9)
        return lexical_score

    @classmethod
    def relevance_score(cls, memory: LongTermMemory, query: str) -> float:
        """Score a memory using importance plus lexical relevance."""
        lexical_score = cls.lexical_relevance(memory, query)
        importance = min(1.0, max(0.0, float(memory.importance_score or 0.0)))
        type_bonus = 0.08 if memory.memory_type in {
            MemoryType.GOAL.value,
            MemoryType.FACT.value,
            MemoryType.PREFERENCE.value,
        } else 0.0
        return min(1.0, (importance * 0.55) + (lexical_score * 0.45) + type_bonus)

    async def get_relevant_memory_context(
        self,
        user_id: int,
        query: str,
        limit: int = 10,
    ) -> list[dict[str, Any]]:
        """Return memories ranked using hybrid lexical + semantic retrieval."""
        candidates = await self.get_long_term_memories(
            user_id=user_id,
            limit=max(40, limit * 4),
        )
        if not candidates:
            return []

        # Convert to dict format for semantic scoring
        cand_dicts = [
            {
                "id": m.id,
                "key": m.key,
                "value": m.value,
                "type": m.memory_type,
                "importance": m.importance_score,
                "confidence": getattr(m, "confidence", 0.85),
                "privacy_level": getattr(m, "privacy_level", "private"),
                "embedding": getattr(m, "embedding_json", None),
                "obj": m,
            }
            for m in candidates
        ]

        ranked_dicts = self._semantic.rank_memories_semantically(query, cand_dicts, top_k=limit)

        results = []
        for rd in ranked_dicts:
            m_obj = rd.get("obj")
            lex_score = self.lexical_relevance(m_obj, query) if m_obj else 0.0
            sem_score = rd.get("semantic_score", 0.0)
            combined_relevance = round((sem_score * 0.6) + (lex_score * 0.4), 3)

            results.append({
                "id": rd.get("id"),
                "key": rd["key"],
                "value": rd["value"],
                "type": rd["type"],
                "importance": rd["importance"],
                "confidence": rd.get("confidence", 0.85),
                "relevance": combined_relevance,
            })
        return results

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

    async def semantic_search(
        self, user_id: int, query: str, limit: int = 5
    ) -> list[dict[str, Any]]:
        """Search memories semantically with cosine similarity."""
        return await self.get_relevant_memory_context(user_id, query, limit=limit)
