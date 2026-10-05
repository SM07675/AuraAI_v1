"""
Affective Memory Extractor — Longitudinal Affective Memory (LAM) Service.

Extracts emotionally-significant episodic moments, coping insights, and personal milestones
from completed sessions, storing them with temporal anchors for cross-session continuity.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.base import AIRequest
from app.ai.gateway import AIGateway
from app.core.logging_config import get_logger
from app.models.affective_memory import AffectiveMemory

logger = get_logger(__name__)


class AffectiveMemoryExtractor:
    """Extracts, persists, and formats cross-session affective memories."""

    def __init__(self, gateway: AIGateway | None = None) -> None:
        self._gateway = gateway or AIGateway()

    async def extract_and_store_session_memories(
        self,
        db: AsyncSession,
        user_id: int,
        session_id: int,
        conversation_history: list[dict[str, str]],
        primary_emotion: str = "neutral",
        domain: str = "wellness",
    ) -> list[AffectiveMemory]:
        """Analyze full session transcript and persist 1-3 key affective memories."""
        if not conversation_history or len(conversation_history) < 2:
            return []

        formatted_convo = "\n".join(
            f"{m.get('role', 'user')}: {m.get('content', '')}" for m in conversation_history[-16:]
        )

        prompt = f"""You are Aura's Longitudinal Memory Extractor.
Extract 1 to 3 emotionally-significant personal facts, breakthroughs, coping strategies that helped, or active struggles from this session.

Session Transcript:
{formatted_convo}

Primary Affect: {primary_emotion} | Domain: {domain}

Return ONLY a JSON array with this structure:
[
  {{
    "memory_text": "A specific concise 1-sentence memory (e.g. 'Felt significantly calmer after trying 4-4-4-4 box breathing')",
    "emotion": "calm",
    "domain": "{domain}",
    "importance": 1.0
  }}
]"""

        req = AIRequest(
            system_prompt="You are an expert clinical psychologist and memory archivist. Output ONLY a valid JSON array.",
            prompt=prompt,
            temperature=0.2,
            max_tokens=400,
        )

        saved_memories: list[AffectiveMemory] = []
        try:
            resp = await self._gateway.generate(req)
            content = resp.content.strip()
            if content.startswith("```json"):
                content = content[7:-3]
            elif content.startswith("```"):
                content = content[3:-3]
            items = json.loads(content)

            if isinstance(items, list):
                for item in items:
                    mem_text = item.get("memory_text", "").strip()
                    if not mem_text or len(mem_text) < 5:
                        continue
                    mem = AffectiveMemory(
                        user_id=user_id,
                        session_id=session_id,
                        memory_text=mem_text,
                        emotion_at_time=item.get("emotion", primary_emotion),
                        domain=item.get("domain", domain),
                        importance_score=float(item.get("importance", 1.0)),
                        session_date=datetime.now(timezone.utc),
                    )
                    db.add(mem)
                    saved_memories.append(mem)

                if saved_memories:
                    await db.commit()
                    logger.info("Persisted affective memories", count=len(saved_memories), user_id=user_id)
        except Exception as exc:
            try:
                await db.rollback()
            except Exception:
                pass
            logger.warning("Affective memory extraction skipped", error=str(exc))

        return saved_memories

    async def get_recent_affective_memories(
        self,
        db: AsyncSession,
        user_id: int,
        limit: int = 4,
    ) -> list[dict[str, Any]]:
        """Retrieve recent affective memories formatted with human temporal distance."""
        try:
            stmt = (
                select(AffectiveMemory)
                .where(AffectiveMemory.user_id == user_id)
                .order_by(AffectiveMemory.session_date.desc())
                .limit(limit)
            )
            res = await db.execute(stmt)
            memories = res.scalars().all()

            formatted = []
            now = datetime.now(timezone.utc)
            for m in memories:
                delta_days = (now - m.session_date.replace(tzinfo=timezone.utc)).days if m.session_date else 0
                if delta_days == 0:
                    time_str = "earlier today"
                elif delta_days == 1:
                    time_str = "yesterday"
                elif delta_days < 7:
                    time_str = f"{delta_days} days ago"
                elif delta_days < 14:
                    time_str = "last week"
                else:
                    time_str = f"{delta_days // 7} weeks ago"

                formatted.append({
                    "id": m.id,
                    "time_ago": time_str,
                    "memory_text": m.memory_text,
                    "emotion": m.emotion_at_time,
                    "domain": m.domain,
                })
            return formatted
        except Exception as exc:
            logger.debug("Failed retrieving affective memories", error=str(exc))
            return []
