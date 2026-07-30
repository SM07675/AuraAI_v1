"""
Conversation Summarizer — generates rolling summaries of long conversations.

After every N turns (configurable), generates a concise summary of the
conversation so far. Summaries are stored in short-term memory and injected
into the prompt context to prevent token overflow in long sessions.

Uses the AI Gateway for summarization — the same provider infrastructure
as the main response pipeline.
"""

from __future__ import annotations

import json
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.base import AIRequest
from app.ai.gateway import AIGateway
from app.core.logging_config import get_logger
from app.services.memory_service import MemoryService

logger = get_logger(__name__)

# Default: summarize after every N turns
_SUMMARIZE_EVERY_N_TURNS = 10

_SUMMARIZATION_PROMPT = (
    "You are a Conversation Summary Engine.\n"
    "Summarize the following conversation in 3-5 concise bullet points.\n"
    "Focus on:\n"
    "- Key topics discussed\n"
    "- Decisions made or actions agreed upon\n"
    "- Emotional tone or shifts\n"
    "- Unresolved questions or open threads\n\n"
    "Return ONLY the summary text as bullet points (no JSON, no markdown headers).\n"
    "Use '- ' prefix for each bullet point."
)


class ConversationSummarizer:
    """Generates rolling conversation summaries.

    Args:
        gateway: AI gateway for LLM-based summarization.
        summarize_every: Number of turns between automatic summaries.
    """

    def __init__(
        self,
        gateway: AIGateway | None = None,
        summarize_every: int = _SUMMARIZE_EVERY_N_TURNS,
    ) -> None:
        self._gateway = gateway
        self._summarize_every = summarize_every
        self._last_summary_turn: int = 0
        self._current_summary: str = ""

    def _get_gateway(self) -> AIGateway:
        if self._gateway is None:
            self._gateway = AIGateway()
        return self._gateway

    def should_summarize(self, turn_count: int) -> bool:
        """Check if it's time to generate a new summary."""
        if turn_count <= 0:
            return False
        return (turn_count - self._last_summary_turn) >= self._summarize_every

    async def summarize(
        self,
        conversation_history: list[dict[str, str]],
        turn_count: int,
        existing_summary: str | None = None,
    ) -> str:
        """Generate a summary of the conversation.

        If an existing summary is provided, the new summary incorporates it
        to create a rolling summary.

        Args:
            conversation_history: List of {role, content} message dicts.
            turn_count: Current turn number (for tracking).
            existing_summary: Previous summary to build upon.

        Returns:
            Summary text as bullet points.
        """
        if not conversation_history:
            return self._current_summary

        # Build the conversation text for summarization
        convo_text = "\n".join(
            f"{msg['role'].title()}: {msg['content']}"
            for msg in conversation_history
        )

        prompt_parts = []
        if existing_summary or self._current_summary:
            prev = existing_summary or self._current_summary
            prompt_parts.append(f"Previous summary:\n{prev}\n")
        prompt_parts.append(f"New conversation to incorporate:\n{convo_text}")

        req = AIRequest(
            system_prompt=_SUMMARIZATION_PROMPT,
            prompt="\n".join(prompt_parts),
            stream=False,
            temperature=0.2,
            max_tokens=300,
        )

        try:
            resp = await self._get_gateway().generate(req)
            summary = resp.content.strip()

            if summary:
                self._current_summary = summary
                self._last_summary_turn = turn_count
                logger.info(
                    "Conversation summarized",
                    turn_count=turn_count,
                    summary_length=len(summary),
                )
                return summary

        except Exception as e:
            logger.warning("Conversation summarization failed", error=str(e))

        return self._current_summary

    async def summarize_and_store(
        self,
        db: AsyncSession,
        session_id: int,
        user_id: int,
        conversation_history: list[dict[str, str]],
        turn_count: int,
    ) -> str | None:
        """Summarize and store the summary in short-term memory.

        Returns the summary text, or None if summarization was not triggered.
        """
        if not self.should_summarize(turn_count):
            return None

        summary = await self.summarize(
            conversation_history=conversation_history,
            turn_count=turn_count,
        )

        if summary:
            memory_svc = MemoryService(db)
            await memory_svc.add_short_term(
                session_id=session_id,
                user_id=user_id,
                key="conversation_summary",
                value=summary,
                metadata={"turn_count": turn_count},
            )

        return summary

    @property
    def current_summary(self) -> str:
        """The most recent conversation summary."""
        return self._current_summary

    @current_summary.setter
    def current_summary(self, value: str) -> None:
        self._current_summary = value
