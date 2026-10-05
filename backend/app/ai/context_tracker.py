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
        "end the conversation",
        "end conversation",
        "end this conversation",
        "close the conversation",
        "close conversation",
        "close this conversation",
        "stop the conversation",
        "stop conversation",
        "finish the conversation",
        "finish conversation",
        "wrap up the conversation",
        "wrap up the session",
        "wrap up today's session",
        "wrap up",
        "wrap it up",
        "goodbye",
        "bye",
        "bye bye",
        "that's all for today",
        "thats all for today",
        "that is all for today",
        "that's it for today",
        "thats it for today",
        "that is it for today",
        "that will be all for today",
        "that'll be all for today",
        "that will be all",
        "that'll be all",
        "nothing more for today",
        "nothing else for today",
        "no more for today",
        "nothing more",
        "feeling alright now we can close",
        "feeling alright now",
        "feeling better now",
        "feeling good now",
        "we can stop here",
        "we can end here",
        "we can wrap up here",
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
        "end chat",
        "close chat",
        "stop chat",
        "alvida",
        "chalta hoon",
        "chalti hoon",
        "aaj ke liye itna hi",
        "aaj ke liye bas",
        "bas aaj ke liye",
    )

    ACUTE_PANIC_PHRASES = (
        "panic attack",
        "can't breathe",
        "cannot breathe",
        "hyperventilat",
        "having a panic",
        "dizzy and panicking",
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
        is_acute_panic = any(phrase in msg_lower for phrase in self.ACUTE_PANIC_PHRASES)

        resolved: dict[str, bool] = {dim: False for dim in self.DIMENSIONS}

        # 1. Emotion State dimension
        if emotion_context is not None:
            emo = getattr(emotion_context, "primary_emotion", None) or getattr(emotion_context, "fused_emotion", None)
            conf = getattr(emotion_context, "confidence", 0.0)
            if emo and (str(emo).lower() not in ("unknown", "", "neutral") or conf >= 0.40):
                resolved["emotion_state"] = True

        # 2. Problem Domain dimension
        domain = getattr(turn_directive, "concernCategory", None) or getattr(turn_directive, "domain", None)
        domain_str = str(domain).lower() if domain else ""
        specific_domains = {d for d in self.DOMAINS if d not in ("general", "wellness")}

        has_domain_keywords = any(k in msg_lower for k in (
            "interview", "job", "career", "exam", "study", "focus", "sleep", "insomnia",
            "friend", "relationship", "breakup", "partner", "anxious", "panic", "burnout",
            "procrastinat", "deadline", "overwork", "lonely", "isolated", "tired", "fatigue"
        ))

        # Check history for domain keywords as well
        if not has_domain_keywords and history:
            history_user_text = " ".join(m.get("content", "").lower() for m in history if m.get("role") == "user")
            has_domain_keywords = any(k in history_user_text for k in (
                "interview", "job", "career", "exam", "study", "focus", "sleep", "insomnia",
                "friend", "relationship", "breakup", "partner", "anxious", "panic", "burnout",
                "procrastinat", "deadline", "overwork", "lonely", "isolated"
            ))

        if domain_str in specific_domains:
            resolved["problem_domain"] = True
        elif has_domain_keywords:
            resolved["problem_domain"] = True
            domain = domain or "wellness"

        # 3. Severity Level dimension
        stress = getattr(emotion_context, "stress", "low") if emotion_context else "low"
        sentiment = getattr(emotion_context, "sentiment", "neutral") if emotion_context else "neutral"
        if stress in ("high", "critical") or is_acute_panic:
            resolved["severity_level"] = True
        elif (stress == "medium" or sentiment in ("negative", "very_negative")) and (turn_count >= 2 or len(msg_lower) > 30):
            resolved["severity_level"] = True

        # 4. User Goal dimension (Must be active in conversation, not merely a static DB field on Turn 1)
        history_user_all = " ".join(m.get("content", "").lower() for m in history if m.get("role") == "user") + " " + msg_lower
        has_active_goal_phrase = any(phrase in history_user_all for phrase in (
            "i want to", "my goal is", "i need to", "trying to", "hoping to", "aiming to", "i wish i could", "looking to"
        ))

        profile_goals = profile.get("goals")
        has_profile_goals = bool(profile_goals and (
            (isinstance(profile_goals, list) and len(profile_goals) > 0) or
            (isinstance(profile_goals, str) and len(profile_goals.strip()) > 3)
        ))

        if has_active_goal_phrase:
            resolved["user_goal"] = True
        elif turn_count >= 3 and has_profile_goals and resolved["problem_domain"]:
            resolved["user_goal"] = True

        # 5. Desired Outcome dimension
        if explicit_solution_request or is_acute_panic:
            resolved["desired_outcome"] = True
        elif turn_count >= 3 and resolved["problem_domain"]:
            resolved["desired_outcome"] = True

        # 6. Blockers Known dimension (Must articulate the obstacle/cause/situation)
        blocker_indicators = (
            "because", "due to", "my boss", "my job", "my work", "deadline", "project",
            "exam", "test", "presentation", "fight", "broke up", "breakup", "arguing",
            "conflict", "overwhelmed by", "stressed about", "struggling with", "pressure",
            "can't stop thinking", "keeps happening", "happened today", "failed", "rejected", "cannot focus"
        )
        has_blocker_keywords = any(k in history_user_all for k in blocker_indicators)
        has_multi_turn_depth = (turn_count >= 3 and len(history) >= 4 and len(history_user_all.split()) > 20)

        if has_blocker_keywords or has_multi_turn_depth:
            resolved["blockers_known"] = True

        resolved_count = sum(1 for v in resolved.values() if v)
        total = len(self.DIMENSIONS)
        score = round(resolved_count / total, 2)

        # Substantial context gate for unsolicited solution delivery:
        # 1. Turn count >= 3 (never offer unsolicited solutions on Turn 1 or 2 exploration)
        # 2. Key anchor dimensions resolved: problem_domain and blockers_known
        # 3. High sufficiency score (>= 0.65, at least 4 of 6 dimensions resolved)
        substantial_context_met = (
            turn_count >= 3
            and resolved["problem_domain"]
            and resolved["blockers_known"]
            and score >= 0.65
        )

        should_deliver = (
            explicit_solution_request
            or is_acute_panic
            or substantial_context_met
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
            substantial_context_met=substantial_context_met,
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
