"""
Context Sufficiency Tracker — Adaptive Phase-Context Engine (APCE).

Evaluates 6 dimensions of conversational and affective context to determine
when Aura has gathered sufficient information to stop exploratory questioning
and transition into structured solution delivery.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.core.logging_config import get_logger

logger = get_logger(__name__)


@dataclass
class ContextSufficiencyResult:
    score: float
    dimensions_resolved: dict[str, bool]
    resolved_count: int
    total_dimensions: int
    should_deliver_solution: bool
    dominant_domain: str | None
    recommendation: str


class ContextSufficiencyTracker:
    """Evaluates multi-turn context sufficiency across 6 key dimensions."""

    DIMENSIONS = (
        "emotion_state",     # Multimodal / text affective state identified
        "problem_domain",    # Clinical / life domain identified (career, anxiety, study, etc.)
        "severity_level",    # Stress / intensity level recognized
        "user_goal",         # Stored profile goal or active conversational aim
        "desired_outcome",   # User seeking advice, practical relief, reframe, or plan
        "blockers_known",    # Specific trigger, obstacle, or situation articulated
    )

    DOMAINS = (
        "wellness",
        "career",
        "study_focus",
        "relationships",
        "physical",
        "productivity",
        "anxiety",
        "work_stress",
        "sleep",
        "motivation",
        "loneliness",
        "general",
    )

    SOLUTION_TRIGGER_PHRASES = (
        "what should i do",
        "what can i do",
        "how do i fix",
        "how to deal",
        "help me",
        "suggest something",
        "give me a solution",
        "any advice",
        "any tips",
        "kya karun",
        "kya karoon",
        "kya karna chahiye",
        "kuch batao",
        "koi solution",
    )

    SESSION_CLOSING_PHRASES = (
        "close today's session",
        "close the session",
        "close session",
        "end today's session",
        "end the session",
        "end session",
        "end this session",
        "wrap up",
        "wrap it up",
        "goodbye",
        "bye",
        "bye bye",
        "that's all for today",
        "thats all for today",
        "that is all for today",
        "feeling alright now we can close",
        "feeling alright now",
        "feeling better now",
        "feeling good now",
        "we can stop here",
        "we can end here",
        "talk to you later",
        "see you later",
        "see you next time",
        "done for today",
        "done for now",
        "stop today",
        "all good for now",
        "i have to go",
        "gotta go",
        "need to go",
        "sign off",
        "session close",
        "session end",
    )

    def evaluate(
        self,
        turn_directive: Any,
        emotion_context: Any,
        user_profile: dict[str, Any] | None,
        recent_history: list[dict[str, str]] | None,
        turn_count: int = 1,
        user_message: str = "",
    ) -> ContextSufficiencyResult:
        """Score 6 dimensions and determine if solution delivery should trigger."""
        msg_lower = user_message.lower().strip()
        history = recent_history or []
        profile = user_profile or {}

        # If user is closing or ending the session, never deliver a solution
        if any(phrase in msg_lower for phrase in self.SESSION_CLOSING_PHRASES):
            logger.info("Session closing detected, skipping solution delivery", user_message=user_message)
            return ContextSufficiencyResult(
                score=0.0,
                dimensions_resolved={dim: False for dim in self.DIMENSIONS},
                resolved_count=0,
                total_dimensions=len(self.DIMENSIONS),
                should_deliver_solution=False,
                dominant_domain="wellness",
                recommendation="wrap_up",
            )

        explicit_solution_request = any(phrase in msg_lower for phrase in self.SOLUTION_TRIGGER_PHRASES)

        resolved: dict[str, bool] = {dim: False for dim in self.DIMENSIONS}

        # 1. Emotion State dimension
        if emotion_context is not None:
            emo = getattr(emotion_context, "primary_emotion", None) or getattr(emotion_context, "fused_emotion", None)
            conf = getattr(emotion_context, "confidence", 0.0)
            if emo and (str(emo).lower() not in ("unknown", "") or conf >= 0.40):
                resolved["emotion_state"] = True

        # 2. Problem Domain dimension
        domain = getattr(turn_directive, "concernCategory", None) or getattr(turn_directive, "domain", None)
        if domain and str(domain).lower() in self.DOMAINS and str(domain).lower() != "general":
            resolved["problem_domain"] = True
        elif any(k in msg_lower for k in ("interview", "job", "career", "exam", "study", "focus", "sleep", "friend", "relationship", "anxious", "panic", "burnout", "procrastinat")):
            resolved["problem_domain"] = True
            domain = domain or "wellness"

        # 3. Severity Level dimension
        stress = getattr(emotion_context, "stress", "low") if emotion_context else "low"
        sentiment = getattr(emotion_context, "sentiment", "neutral") if emotion_context else "neutral"
        if stress in ("medium", "high", "critical") or sentiment in ("negative", "very_negative") or len(msg_lower) > 35:
            resolved["severity_level"] = True

        # 4. User Goal dimension
        goals = profile.get("goals")
        if goals and ((isinstance(goals, list) and len(goals) > 0) or (isinstance(goals, str) and len(goals.strip()) > 3)):
            resolved["user_goal"] = True
        elif turn_count >= 2:
            resolved["user_goal"] = True

        # 5. Desired Outcome dimension
        if explicit_solution_request:
            resolved["desired_outcome"] = True
        elif turn_count >= 2 and resolved["problem_domain"]:
            resolved["desired_outcome"] = True

        # 6. Blockers Known dimension
        if len(history) >= 2 or len(msg_lower) > 50:
            resolved["blockers_known"] = True

        resolved_count = sum(1 for v in resolved.values() if v)
        total = len(self.DIMENSIONS)
        score = round(resolved_count / total, 2)

        should_deliver = (
            explicit_solution_request
            or score >= 0.50
            or (turn_count >= 3 and resolved["problem_domain"])
            or bool(getattr(turn_directive, "offerSolution", False))
        )

        recommendation = (
            "deliver_solution"
            if should_deliver
            else "explore_further"
        )

        logger.info(
            "Context Sufficiency evaluated",
            score=score,
            resolved_count=resolved_count,
            should_deliver=should_deliver,
            domain=domain,
            turn=turn_count,
        )

        return ContextSufficiencyResult(
            score=score,
            dimensions_resolved=resolved,
            resolved_count=resolved_count,
            total_dimensions=total,
            should_deliver_solution=should_deliver,
            dominant_domain=domain or "wellness",
            recommendation=recommendation,
        )


# Backward-compatibility alias
ContextTracker = ContextSufficiencyTracker
