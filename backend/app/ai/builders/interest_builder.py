"""
Interest Builder

Extracts interests, skills, goals, projects, learning styles, and topics
from the user's conversational turns to progressively build their profile.

Improvements over v1:
  - Debounced: only runs every 3rd turn to save API costs
  - Confidence scoring: only persists interests mentioned 2+ times or with high confidence
  - Tracks discovery history to avoid redundant extraction
"""

from __future__ import annotations

import json

from sqlalchemy.ext.asyncio import AsyncSession
from app.ai.base import AIRequest
from app.ai.gateway import AIGateway
from app.core.logging_config import get_logger
from app.models.user import User

logger = get_logger(__name__)

# Only run interest extraction every N turns
_EXTRACTION_INTERVAL = 3


class InterestBuilder:
    """Extracts and persists user interests from conversation.

    Args:
        gateway: AI gateway for LLM-based extraction.
    """

    def __init__(self, gateway: AIGateway) -> None:
        self._gateway = gateway
        self._turn_counter: int = 0
        self._pending_interests: dict[str, int] = {}  # interest -> mention count
        self._system_prompt = (
            "You are an AI Profile Extraction Engine.\n"
            "Analyze the user's message and extract new interests, skills, projects, goals, "
            "learning_style, and favourite_topics.\n"
            "Only extract items that the user CLEARLY expresses or states. "
            "Do NOT infer interests from passing mentions.\n"
            "For each extracted item, provide a confidence score (0.0-1.0).\n\n"
            "Return ONLY a raw JSON object matching this exact schema (no markdown, no backticks):\n"
            '{"new_interests": [{"value": "...", "confidence": 0.8}], '
            '"new_skills": [{"value": "...", "confidence": 0.8}], '
            '"new_projects": [{"value": "...", "confidence": 0.8}], '
            '"new_goals": [{"value": "...", "confidence": 0.8}], '
            '"learning_style_update": null, '
            '"new_favourite_topics": [{"value": "...", "confidence": 0.8}]}'
        )

    async def build(
        self, user: User, db: AsyncSession, user_message: str
    ) -> None:
        """Analyze the turn and append new interests to the user's profile.

        Debounced: only runs every 3rd turn. Low-confidence items are
        buffered and only persisted after repeated mentions.
        """
        self._turn_counter += 1

        # Debounce: skip if not on interval
        if self._turn_counter % _EXTRACTION_INTERVAL != 0:
            return

        prompt = f"User said: {user_message}"
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

            # Process each field with confidence filtering
            self._merge_confident_items(user, "interests", data.get("new_interests", []))
            self._merge_confident_items(user, "skills", data.get("new_skills", []))
            self._merge_confident_items(user, "projects", data.get("new_projects", []))
            self._merge_confident_items(user, "goals", data.get("new_goals", []))
            self._merge_confident_items(user, "favourite_topics", data.get("new_favourite_topics", []))

            ls = data.get("learning_style_update")
            if ls and isinstance(ls, str):
                user.learning_style = ls

            db.add(user)
            await db.commit()
            logger.info("Updated User Profile via InterestBuilder", user_id=user.id)

        except Exception as e:
            logger.warning("Failed to extract interests", error=str(e))

    def _merge_confident_items(
        self, user: User, field_name: str, new_items: list
    ) -> None:
        """Merge new items into a CSV user field with confidence filtering.

        High confidence items (≥0.7) are added immediately.
        Low confidence items are buffered and only added after 2+ mentions.
        """
        if not new_items:
            return

        # Handle both old format (list of strings) and new format (list of dicts)
        items_to_add = []
        for item in new_items:
            if isinstance(item, dict):
                value = item.get("value", "").strip()
                confidence = item.get("confidence", 0.5)
            elif isinstance(item, str):
                value = item.strip()
                confidence = 0.8  # Assume high confidence for simple strings
            else:
                continue

            if not value:
                continue

            key = f"{field_name}:{value.lower()}"

            if confidence >= 0.7:
                # High confidence: add immediately
                items_to_add.append(value)
            else:
                # Low confidence: buffer and count mentions
                self._pending_interests[key] = self._pending_interests.get(key, 0) + 1
                if self._pending_interests[key] >= 2:
                    items_to_add.append(value)
                    del self._pending_interests[key]

        if not items_to_add:
            return

        current = getattr(user, field_name) or ""
        existing = {x.strip().lower() for x in current.split(",") if x.strip()}
        to_add = [x for x in items_to_add if x.lower() not in existing]

        if not to_add:
            return

        updated = [x.strip() for x in current.split(",") if x.strip()]
        updated.extend(to_add)
        setattr(user, field_name, ", ".join(updated))

        logger.debug(
            "Merged interests",
            field=field_name,
            added=to_add,
            user_id=user.id,
        )
