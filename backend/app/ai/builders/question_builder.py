"""
Question Builder

Analyzes the user's goals and current context to determine if critical
information is missing. If so, formulates a targeted follow-up question.

Deduplication: Tracks questions already asked in the session and prevents
re-asking. Rate-limited to max 1 question per 5 turns.

Never asks random questions — only asks when:
  1. Critical information is missing
  2. It hasn't been asked before
  3. The answer will improve future conversations
  4. It's been at least 5 turns since the last question
"""

from __future__ import annotations

import json

from app.ai.base import AIRequest
from app.ai.gateway import AIGateway
from app.core.logging_config import get_logger
from app.models.user import User

logger = get_logger(__name__)

# Minimum turns between follow-up questions (0 = ask on every turn like a doctor session)
_MIN_TURNS_BETWEEN_QUESTIONS = 0


class QuestionBuilder:
    """Generates targeted follow-up questions for every turn in a counseling session.

    Args:
        gateway: AI gateway for LLM-based analysis.
    """

    def __init__(self, gateway: AIGateway) -> None:
        self._gateway = gateway
        self._last_question_turn: int = 0
        self._asked_questions: list[str] = []
        self._system_prompt = (
            "You are an AI Mental Health Clinical Counselor Question Engine.\n"
            "Your goal is to guide a continuous, deep therapy & counseling session.\n"
            "Analyze the user's latest message, emotional state, and recent conversation history.\n"
            "Generate exactly ONE targeted, empathetic, probing follow-up question that helps the user unpack their feelings, explore root causes, or reflect deeply.\n\n"
            "IMPORTANT RULES:\n"
            "- ALWAYS generate a meaningful therapeutic question for EVERY turn (needs_question must be true).\n"
            "- Do NOT ask generic surface-level questions (e.g. 'What is on your mind?').\n"
            "- Ask specific, probing questions based directly on what the user just expressed.\n"
            "- Do NOT re-ask questions from the 'Previously Asked' list below.\n\n"
            "Return ONLY raw JSON matching this schema:\n"
            '{"needs_question": true, "question": "Your targeted therapeutic follow-up question"}'
        )

    async def build(
        self,
        user: User,
        user_message: str,
        conversation_history: str,
        turn_count: int = 0,
        previously_asked: list[str] | None = None,
    ) -> str | None:
        """Determine if a follow-up question should be asked.

        Args:
            user: Current user ORM object.
            user_message: The user's latest message.
            conversation_history: Formatted conversation history string.
            turn_count: Current turn number in the session.
            previously_asked: Questions already asked this session.

        Returns:
            A question string if one should be asked, or None.
        """
        # Rate limiting: don't ask too frequently, except for the first question
        if self._last_question_turn > 0 and (turn_count - self._last_question_turn) < _MIN_TURNS_BETWEEN_QUESTIONS:
            return None

        asked = previously_asked or self._asked_questions

        # Build previously asked section
        asked_section = ""
        if asked:
            asked_lines = "\n".join(f"- {q}" for q in asked)
            asked_section = f"\nPreviously Asked Questions (DO NOT re-ask these):\n{asked_lines}\n"

        prompt = (
            f"User Profile:\n"
            f"- Name: {user.name or 'Unknown'}\n"
            f"- Goals: {user.goals or 'None'}\n"
            f"- Interests: {user.interests or 'None'}\n"
            f"- Skills: {user.skills or 'None'}\n"
            f"- Projects: {user.projects or 'None'}\n"
            f"- Learning Style: {user.learning_style or 'Not set'}\n"
            f"{asked_section}\n"
            f"Recent Conversation:\n{conversation_history}\n\n"
            f"Latest Message: {user_message}"
        )

        req = AIRequest(
            system_prompt=self._system_prompt,
            prompt=prompt,
            stream=False,
            temperature=0.2,
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

            if data.get("needs_question") and data.get("question"):
                question = data["question"]

                # Final dedup check: don't re-ask similar questions
                question_lower = question.lower()
                for prev in asked:
                    if prev.lower() in question_lower or question_lower in prev.lower():
                        logger.debug("Duplicate question suppressed", question=question)
                        return None

                self._asked_questions.append(question)
                self._last_question_turn = turn_count
                logger.info("QuestionBuilder generated follow-up", question=question)
                return question

            return None

        except Exception as e:
            logger.warning("QuestionBuilder failed", error=str(e))
            return None

    @property
    def asked_questions(self) -> list[str]:
        """Return the list of questions asked so far."""
        return list(self._asked_questions)

    def reset(self) -> None:
        """Reset state for a new session."""
        self._asked_questions.clear()
        self._last_question_turn = 0
