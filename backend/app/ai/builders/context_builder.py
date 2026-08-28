"""
Context Builder

Assembles the rich ContextObject used by the Prompt Builder.

Data sources assembled per turn:
  - User profile (name, language, style, interests, skills, projects)
  - Active goals (from UserGoal table via Goal Engine)
  - Long-term memories (from LongTermMemory table)
  - EmotionContext (from EmotionService — structured, LLM-safe)
  - Conversation summary (rolling, from ConversationSummarizer)
  - Session metadata (time, session ID, active project)
  - Question deduplication history

Architecture note
-----------------
The ContextObject holds an EmotionContext object directly.
No raw emotion scores, tensors, or model internals are stored here.
"""

from __future__ import annotations

import inspect
import re
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.emotion.base import EmotionContext
from app.models.goal import GoalStatus, UserGoal
from app.models.message import Message
from app.models.session import Session
from app.models.user import User
from app.services.memory_service import MemoryService


async def _scalar_list(result: Any) -> list[Any]:
    """Return SQLAlchemy scalar rows and tolerate async test doubles."""
    scalars = result.scalars()
    if inspect.isawaitable(scalars):
        scalars = await scalars
    items = scalars.all()
    if inspect.isawaitable(items):
        items = await items
    return list(items)


@dataclass
class ContextObject:
    """Rich, structured context assembled before every AI request."""

    # ── User identity ─────────────────────────────────────────────
    user_name: str
    preferred_language: str
    communication_style: str

    # ── Profile fields (from User model) ─────────────────────────
    interests: str
    goals: str          # Legacy CSV goals field (kept for backward compat)
    skills: str
    projects: str
    learning_style: str
    favourite_topics: str

    # ── Emotion (structured, LLM-safe) ───────────────────────────
    emotion_context: EmotionContext

    # ── Temporal ─────────────────────────────────────────────────
    current_time: str
    session_id: int

    # ── Structured data ───────────────────────────────────────────
    active_goals: list[dict[str, Any]] = field(default_factory=list)
    long_term_memories: list[dict[str, Any]] = field(default_factory=list)
    recent_history: list[dict[str, str]] = field(default_factory=list)

    # ── Conversation summary ──────────────────────────────────────
    conversation_summary: str = ""
    previous_session_context: list[str] = field(default_factory=list)

    # ── Question deduplication ────────────────────────────────────
    previously_asked_questions: list[str] = field(default_factory=list)

    # ── Active project ────────────────────────────────────────────
    active_project: str = ""

    # ── Convenience accessors (backward compat) ───────────────────
    @property
    def emotion_fused(self) -> str:
        return self.emotion_context.primary_emotion

    @property
    def emotion_confidence(self) -> float:
        return self.emotion_context.confidence * 100

    @property
    def emotion_sentiment(self) -> str:
        return self.emotion_context.sentiment

    @property
    def emotion_stress(self) -> int:
        """Integer stress level 0–3 (0=none, 1=low, 2=medium, 3=high)."""
        mapping = {"low": 1, "medium": 2, "high": 3}
        return mapping.get(self.emotion_context.stress, 0)


class ContextBuilder:
    """Assembles a complete ContextObject before each AI turn.

    Args:
        db: SQLAlchemy async session (injected per call or set once).
    """

    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def build(
        self,
        user: User,
        session: Session,
        emotion_context: EmotionContext | None = None,
        recent_history: list[dict[str, str]] | None = None,
        conversation_summary: str = "",
        previously_asked_questions: list[str] | None = None,
        preferred_language: str | None = None,
        user_message: str = "",
        # ``emotion_data`` is retained as a compatibility boundary for older
        # API callers.  New callers must pass the structured EmotionContext.
        emotion_data: dict[str, Any] | None = None,
    ) -> ContextObject:
        """Build the full ContextObject for the current turn.

        Args:
            user: ORM User object.
            session: ORM Session object.
            emotion_context: Structured EmotionContext from EmotionService.
                             Pass None to get a neutral emotion context.
            recent_history: Recent conversation turns (list of role/content dicts).
            conversation_summary: Rolling conversation summary (optional).
            previously_asked_questions: Questions already asked this session.

        Returns:
            Complete ContextObject ready for PromptBuilder.
        """
        if emotion_context is None and emotion_data:
            stress_value = emotion_data.get("stress") or emotion_data.get("stress_level", "low")
            if isinstance(stress_value, int):
                stress_value = {0: "low", 1: "low", 2: "medium", 3: "high"}.get(stress_value, "low")
            confidence = float(emotion_data.get("confidence", 0.0))
            emotion_context = EmotionContext(
                primary_emotion=emotion_data.get("fused_emotion", "neutral"),
                secondary_emotion=emotion_data.get("secondary_emotion"),
                confidence=confidence / 100.0 if confidence > 1 else confidence,
                stress=stress_value if stress_value in {"low", "medium", "high"} else "low",
                sentiment=emotion_data.get("sentiment", "neutral"),
                intent=emotion_data.get("intent", "casual"),
                sources=[],
            )

        # Default to neutral if no emotion available
        if emotion_context is None:
            from app.emotion.base import _EMOTION_GUIDANCE
            emotion_context = EmotionContext(
                primary_emotion="neutral",
                secondary_emotion=None,
                confidence=0.0,
                stress="low",
                sentiment="neutral",
                intent="casual",
                sources=[],
                guidance=_EMOTION_GUIDANCE["neutral"],
            )

        # ── Long-term memories, ranked for the current message ───
        memories = []
        if self._db is not None:
            try:
                memories = await MemoryService(self._db).get_relevant_memory_context(
                    user_id=user.id,
                    query=user_message,
                    limit=10,
                )
            except Exception:
                memories = []

        # ── Cross-session continuity ─────────────────────────────
        previous_session_context = await self._load_previous_session_context(
            user_id=user.id,
            current_session_id=session.id,
            query=user_message,
        )

        # ── Active goals ──────────────────────────────────────────
        active_goals = []
        if self._db is not None:
            try:
                goals_stmt = (
                    select(UserGoal)
                    .where(
                        UserGoal.user_id == user.id,
                        UserGoal.status == GoalStatus.ACTIVE.value,
                    )
                    .order_by(UserGoal.priority.desc())
                    .limit(10)
                )
                goals_result = await self._db.execute(goals_stmt)
                items = await _scalar_list(goals_result)
                if items is not None:
                    active_goals = [g.to_context_dict() for g in items]
            except Exception:
                active_goals = []

        # ── Current time ──────────────────────────────────────────
        now = datetime.now(UTC).astimezone()
        time_str = now.strftime("%A, %d %B %Y %H:%M %Z")

        # ── Active project ────────────────────────────────────────
        active_project = ""
        for goal in active_goals:
            if goal.get("category") in ("programming", "research", "creative"):
                active_project = goal.get("title", "")
                break
        if not active_project and user.projects:
            active_project = user.projects.split(",")[0].strip()

        return ContextObject(
            user_name=user.name.split()[0] if user.name else "there",
            preferred_language=preferred_language or user.preferred_language or "en",
            communication_style=user.communication_style or "balanced",
            interests=user.interests or "",
            goals=user.goals or "",
            skills=user.skills or "",
            projects=user.projects or "",
            learning_style=user.learning_style or "visual",
            favourite_topics=user.favourite_topics or "",
            emotion_context=emotion_context,
            current_time=time_str,
            session_id=session.id,
            active_goals=active_goals,
            long_term_memories=memories,
            recent_history=recent_history or [],
            conversation_summary=conversation_summary or session.summary or "",
            previous_session_context=previous_session_context,
            previously_asked_questions=previously_asked_questions or [],
            active_project=active_project,
        )

    async def _load_previous_session_context(
        self,
        user_id: int,
        current_session_id: int,
        query: str = "",
        limit: int = 3,
    ) -> list[str]:
        """Load concise context from recent chats, preferring saved summaries."""
        if self._db is None:
            return []

        try:
            result = await self._db.execute(
                select(Session)
                .where(
                    Session.user_id == user_id,
                    Session.id != current_session_id,
                )
                .order_by(Session.updated_at.desc())
                .limit(max(8, limit * 3))
            )
            sessions = await _scalar_list(result)
        except Exception:
            return []

        context: list[tuple[float, int, str]] = []
        for recency_index, previous in enumerate(sessions):
            text = ""
            if previous.summary:
                text = previous.summary.strip()
            else:
                try:
                    message_result = await self._db.execute(
                        select(Message)
                        .where(
                            Message.session_id == previous.id,
                            Message.user_id == user_id,
                        )
                        .order_by(Message.created_at.desc())
                        .limit(6)
                    )
                    messages = list(reversed(await _scalar_list(message_result)))
                except Exception:
                    messages = []

                if messages:
                    text = " | ".join(
                        f"{message.role}: {message.content.strip()[:240]}"
                        for message in messages
                        if message.content and message.content.strip()
                    )

            if text:
                relevance = self._text_relevance(query, text)
                context.append((relevance, recency_index, text))

        if (query or "").strip() and any(item[0] > 0 for item in context):
            context.sort(key=lambda item: (-item[0], item[1]))
        return [item[2] for item in context[:limit]]

    @staticmethod
    def _text_relevance(query: str, context: str) -> float:
        query_tokens = {
            token for token in re.findall(r"[^\W_]+", query.lower(), re.UNICODE)
            if len(token) > 2
        }
        if not query_tokens:
            return 0.0
        context_tokens = set(
            re.findall(r"[^\W_]+", context.lower(), re.UNICODE)
        )
        return len(query_tokens & context_tokens) / len(query_tokens)
