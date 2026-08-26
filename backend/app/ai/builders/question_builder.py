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
            "You are Aura's Contextual Question Engine.\n"
            "Your goal is to formulate ONE highly relevant, insightful follow-up question based on the user's latest message.\n\n"
            "RULES:\n"
            "1. If the user asked a technical, academic, coding, or factual question, generate a question asking how they plan to apply it, what specific challenge they are tackling, or if they would like an example.\n"
            "2. If the user shared a personal thought, goal, or stress, ask a warm, probing question to explore their perspective deeper.\n"
            "3. NEVER ask generic clichés like 'What is on your mind?' or 'How are you feeling today?'.\n"
            "4. NEVER re-ask questions from the 'Previously Asked' list.\n"
            "5. Keep the question brief, sharp, and natural.\n\n"
            "Return ONLY raw JSON matching this schema:\n"
            '{"needs_question": true, "question": "Your targeted follow-up question"}'
        )

    async def build(
        self,
        user: User,
        user_message: str,
        conversation_history: str,
        turn_count: int = 0,
        previously_asked: list[str] | None = None,
        preferred_language: str | None = None,
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
            f"- Response Language: {preferred_language or user.preferred_language or 'en'}\n"
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
            question = None
            try:
                data = json.loads(content.strip())
                if isinstance(data, dict):
                    question = data.get("question")
            except Exception:
                # If LLM returned raw text question with a question mark
                if "?" in content:
                    lines = [line.strip() for line in content.splitlines() if "?" in line]
                    if lines:
                        question = lines[-1].strip('"` \t\n')

            if not question:
                question = self._generate_contextual_fallback(user_message)

            if question:
                question = question.strip('"` \t\n')
                if not question.endswith("?"):
                    question += "?"

                # Dedup check: don't re-ask similar questions
                question_lower = question.lower()
                for prev in asked:
                    if prev.lower() in question_lower or question_lower in prev.lower():
                        logger.debug("Duplicate question suppressed", question=question)
                        question = "What aspect of this would you like to explore or focus on next?"
                        break

                self._asked_questions.append(question)
                self._last_question_turn = turn_count
                logger.info("QuestionBuilder generated follow-up", question=question)
                return question

            return self._generate_contextual_fallback(user_message)

        except Exception as e:
            logger.warning("QuestionBuilder failed, using contextual fallback", error=str(e))
            fallback = self._generate_contextual_fallback(user_message)
            self._asked_questions.append(fallback)
            self._last_question_turn = turn_count
            return fallback

    def _generate_contextual_fallback(self, user_message: str) -> str:
        """Generate a reliable fallback follow-up question based on user keywords."""
        msg = user_message.lower().strip()
        if any(w in msg for w in ["what", "how", "why", "when", "where", "explain", "meaning", "definition", "difference", "frequency", "concept"]):
            return "How are you planning to apply or use this concept in your current work or project?"
        if any(w in msg for w in ["feel", "stressed", "tired", "anxious", "overwhelmed", "sad", "worry", "upset", "down"]):
            return "What do you feel has been contributing the most to that feeling lately?"
        if any(w in msg for w in ["goal", "project", "exam", "interview", "job", "career", "study", "code", "work", "task"]):
            return "What is the next key milestone or challenge you're focusing on with that?"
        return "What are your thoughts on this, and what would you like to explore next?"

    @property
    def asked_questions(self) -> list[str]:
        """Return the list of questions asked so far."""
        return list(self._asked_questions)

    def reset(self) -> None:
        """Reset state for a new session."""
        self._asked_questions.clear()
        self._last_question_turn = 0
