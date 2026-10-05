"""
Structured Solution Schema (SSS) Engine — Typed, Interactive Interventions.

Generates structured, typed solution objects that the frontend renders as
interactive cards (Breathing, Action Plan, CBT Reframe, Pomodoro, Grounding, Journaling).
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from typing import Any

from app.ai.base import AIRequest
from app.ai.gateway import AIGateway
from app.core.logging_config import get_logger

logger = get_logger(__name__)


@dataclass
class SolutionCardPayload:
    id: str
    type: str  # "breathing_exercise" | "action_plan" | "cbt_reframe" | "journaling_prompt" | "pomodoro_timer" | "grounding_5_4_3_2_1" | "sleep_hygiene"
    title: str
    description: str
    domain: str
    personalization_note: str
    steps: list[str] | None = None
    items: list[dict[str, Any]] | None = None
    thought_trigger: str | None = None
    reframed_perspective: str | None = None
    duration_minutes: int | None = None
    tags: list[str] | None = None

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        return {k: v for k, v in d.items() if v is not None}


class SolutionEngine:
    """Generates typed solution schema instances tailored to user affective state and domain."""

    def __init__(self, gateway: AIGateway | None = None) -> None:
        self._gateway = gateway or AIGateway()

    def select_solution_type(
        self,
        domain: str,
        primary_emotion: str,
        stress: str,
        user_message: str,
    ) -> str:
        """Heuristically select optimal intervention type before LLM personalization."""
        msg_lower = user_message.lower()
        emo = primary_emotion.lower()

        if any(w in msg_lower for w in ("breath", "breathe", "hyperventilat", "calm down", "heart beat")):
            return "breathing_exercise"
        if any(w in msg_lower for w in ("ground", "panic", "dizzy", "unreal", "overwhelm")):
            return "grounding_5_4_3_2_1"
        if any(w in msg_lower for w in ("pomodoro", "timer", "procrastinat", "distract", "can't focus")):
            return "pomodoro_timer"
        if any(w in msg_lower for w in ("sleep", "insomnia", "night", "bedtime", "awake")):
            return "sleep_hygiene"
        if any(w in msg_lower for w in ("journal", "write", "express", "diary")):
            return "journaling_prompt"

        if emo in ("fearful", "anxious", "scared") or stress in ("high", "critical"):
            return "breathing_exercise"
        if emo in ("sad", "disgusted") or any(w in msg_lower for w in ("failure", "useless", "hopeless", "never")):
            return "cbt_reframe"
        if domain in ("career", "study_focus", "productivity"):
            return "action_plan"
        if domain in ("relationships", "wellness"):
            return "cbt_reframe"

        return "action_plan"

    async def generate_solution(
        self,
        domain: str,
        user_message: str,
        primary_emotion: str,
        stress: str,
        user_name: str = "Friend",
        user_goals: str = "",
        user_interests: str = "",
        preferred_language: str = "en",
    ) -> SolutionCardPayload:
        """Generate a complete personalized solution card."""
        solution_type = self.select_solution_type(domain, primary_emotion, stress, user_message)
        card_id = f"sol_{solution_type}_{abs(hash(user_message)) % 100000}"

        prompt = f"""You are Dr. Aura's Companion Solution Designer.
Design a highly practical, empowering, and empathetic {solution_type} solution for {user_name}.
User concern: "{user_message}"
Domain: {domain}
Current emotion: {primary_emotion} (stress: {stress})
User Goals: {user_goals or 'None'}
User Interests: {user_interests or 'None'}
Language: {preferred_language}

Generate ONLY a JSON object with this exact structure:
{{
  "title": "Short catchy title (max 5 words)",
  "description": "1-2 empowering sentences explaining why this helps right now",
  "personalization_note": "A warm note connecting this directly to their goals/interests",
  "steps": ["Step 1", "Step 2", "Step 3", "Step 4"],
  "thought_trigger": "The exact automatic self-critical thought they might be having (if CBT reframe, else null)",
  "reframed_perspective": "A compassionate, objective, realistic reframe (if CBT reframe, else null)",
  "duration_minutes": 5,
  "tags": ["Tag1", "Tag2"]
}}"""

        req = AIRequest(
            system_prompt="You are an expert clinical psychologist and empathetic companion. Return ONLY valid JSON.",
            prompt=prompt,
            temperature=0.3,
            max_tokens=600,
        )

        try:
            resp = await self._gateway.generate(req)
            content = resp.content.strip()
            if content.startswith("```json"):
                content = content[7:-3]
            elif content.startswith("```"):
                content = content[3:-3]
            data = json.loads(content)

            return SolutionCardPayload(
                id=card_id,
                type=solution_type,
                title=data.get("title", f"Personalized {domain.capitalize()} Strategy"),
                description=data.get("description", "A tailored practical technique designed for your immediate relief and progress."),
                domain=domain,
                personalization_note=data.get("personalization_note", f"Tailored for your journey with {user_goals or 'wellbeing'}."),
                steps=data.get("steps"),
                thought_trigger=data.get("thought_trigger"),
                reframed_perspective=data.get("reframed_perspective"),
                duration_minutes=data.get("duration_minutes", 5),
                tags=data.get("tags", [domain, solution_type]),
            )
        except Exception as exc:
            logger.warning("Dynamic solution generation fallback", error=str(exc))
            return self._build_deterministic_fallback(
                card_id=card_id,
                solution_type=solution_type,
                domain=domain,
                user_name=user_name,
                user_goals=user_goals,
            )

    def _build_deterministic_fallback(
        self,
        card_id: str,
        solution_type: str,
        domain: str,
        user_name: str,
        user_goals: str,
    ) -> SolutionCardPayload:
        if solution_type == "breathing_exercise":
            return SolutionCardPayload(
                id=card_id,
                type="breathing_exercise",
                title="4-4-4-4 Box Breathing Reset",
                description="Calm your sympathetic nervous system and clear mental fog in under 3 minutes.",
                domain=domain,
                personalization_note=f"Recommended for {user_name} to restore calm and mental clarity.",
                steps=[
                    "Inhale smoothly through your nose for 4 seconds",
                    "Hold full breath gently for 4 seconds",
                    "Exhale slowly through your mouth for 4 seconds",
                    "Hold empty lungs for 4 seconds and repeat 4 times",
                ],
                duration_minutes=3,
                tags=["Nervous System", "Instant Calm"],
            )
        elif solution_type == "grounding_5_4_3_2_1":
            return SolutionCardPayload(
                id=card_id,
                type="grounding_5_4_3_2_1",
                title="5-4-3-2-1 Sensory Grounding",
                description="Anchor your awareness in the physical present to immediately diffuse racing thoughts.",
                domain=domain,
                personalization_note="Pulls attention out of spiral loops into sensory reality.",
                steps=[
                    "Look around and name 5 things you can see",
                    "Acknowledge 4 physical things you can feel with your hands",
                    "Listen closely for 3 distinct sounds around you",
                    "Notice 2 things you can smell or remember smelling",
                    "Focus on 1 positive truth about your resilience right now",
                ],
                duration_minutes=4,
                tags=["Grounding", "Overwhelm"],
            )
        elif solution_type == "cbt_reframe":
            return SolutionCardPayload(
                id=card_id,
                type="cbt_reframe",
                title="Compassionate Cognitive Reframe",
                description="Shift from an all-or-nothing trap into a balanced, empowering perspective.",
                domain=domain,
                personalization_note=f"Aligned with your goal of {user_goals or 'growth'}.",
                thought_trigger="I should have this completely figured out by now, and I'm falling behind.",
                reframed_perspective="Progress is non-linear. Facing this challenge right now is proof that I am actively learning and moving forward.",
                steps=[
                    "Notice the self-critical thought without judging yourself",
                    "Ask: 'Would I speak to a close friend this harshly?'",
                    "Adopt the balanced reframe above and take one small breath",
                ],
                duration_minutes=3,
                tags=["CBT", "Perspective"],
            )
        elif solution_type == "pomodoro_timer":
            return SolutionCardPayload(
                id=card_id,
                type="pomodoro_timer",
                title="25-Minute Focus Sprint",
                description="Break inertia by committing to only 25 minutes of single-task focus.",
                domain=domain,
                personalization_note="Lowers activation energy for tasks that feel intimidating.",
                steps=[
                    "Define the exact micro-task you will work on",
                    "Put phone out of sight and close non-essential tabs",
                    "Work with focus until timer rings — no multi-tasking",
                    "Reward yourself with a guilt-free 5-minute break",
                ],
                duration_minutes=25,
                tags=["Focus", "Productivity"],
            )
        else:
            return SolutionCardPayload(
                id=card_id,
                type="action_plan",
                title=f"3-Step {domain.capitalize()} Action Plan",
                description="A clear, realistic step-by-step roadmap to regain momentum.",
                domain=domain,
                personalization_note=f"Tailored specifically for {user_name}.",
                steps=[
                    "Isolate the single most immediate priority and write it down",
                    "Take one 5-minute action that moves the needle right away",
                    "Review progress and celebrate completing this initial milestone",
                ],
                duration_minutes=10,
                tags=[domain, "Action Plan"],
            )
