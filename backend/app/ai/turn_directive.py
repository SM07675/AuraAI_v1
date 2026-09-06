"""
Turn Directive Classifier.

Runs in parallel with emotion and profile retrieval.
Determines the shape of the upcoming response based on the conversation state.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

from app.ai.base import AIRequest
from app.ai.gateway import AIGateway
from app.core.logging_config import get_logger

logger = get_logger(__name__)

@dataclass
class TurnDirective:
    phase: str
    problemDetected: bool
    concernCategory: str | None
    mustReflectFirst: bool
    offerSolution: bool
    mustAskFollowUp: bool
    nextQuestionSeed: str | None
    context_dimensions_resolved: int = 0

    @classmethod
    def default(cls, phase: str = "explore") -> TurnDirective:
        return cls(
            phase=phase,
            problemDetected=False,
            concernCategory=None,
            mustReflectFirst=True,
            offerSolution=False,
            mustAskFollowUp=True,
            nextQuestionSeed=None,
            context_dimensions_resolved=0,
        )


class TurnDirectiveClassifier:
    """Classifies user input into a structural directive for the session."""

    def __init__(self, gateway: AIGateway | None = None) -> None:
        self._gateway = gateway or AIGateway()
        
        self._system_prompt = """You are the Turn Directive Classifier for an AI emotional support companion.
Your job is to analyze the user's latest message along with the current session phase, and output a JSON directive for how the AI should respond.

Current Session Phases:
1. "check_in" - Initial check-in.
2. "explore" - Exploring the user's thoughts.
3. "identify" - Focusing on a specific problem.
4. "reflect" - Validating the problem.
5. "offer" - Offering an actionable solution.
6. "follow_up" - Checking if the solution landed or moving on.
7. "wrap_up" - Ending the session.

Phase Progression Guidelines:
- Early Exploration (Turns 1-2): Prioritize empathy, active listening, and exploratory inquiry. Keep phase in "check_in" or "explore". Do NOT advance to "offer" and do NOT set `offerSolution` to true unless the user explicitly asks for advice/solutions or is in acute panic.
- Problem Identification & Reflection: Move to "identify" or "reflect" as the user shares specific obstacles or reasons.
- Actionable Solution (Turn 3+): Transition to "offer" and set `offerSolution` to true only after the problem domain and blockers are clearly established, or upon explicit request.

Disengagement / Solution Trigger Handling:
- If the user asks for guidance, advice, or what to do (e.g. "what should I do?", "help me fix this"), advance phase to "offer" and set `offerSolution` to true.
- If the user says "I don't want to talk about this", "stop", or shows clear fatigue, set `mustAskFollowUp` to false, and advance phase toward "wrap_up".

JSON Output Format:
{
  "phase": "string",
  "problemDetected": boolean,
  "concernCategory": "string or null",
  "mustReflectFirst": boolean,
  "offerSolution": boolean,
  "mustAskFollowUp": boolean,
  "nextQuestionSeed": "string or null"
}

Concern Categories:
"work_stress", "career", "study_focus", "wellness", "relationships", "physical", "productivity", "sleep", "motivation", "loneliness", "anxiety", "general"

Only return valid JSON."""

    async def classify(self, user_message: str, current_phase: str, turn_count: int) -> TurnDirective:
        """Analyze the turn and return a directive."""
        msg_lower = user_message.lower().strip()
        
        # Adaptive fatigue / disengagement check
        is_wrapup_request = any(p in msg_lower for p in ("bye", "goodbye", "leave now", "wrap up", "gotta go", "have to go", "alvida", "chalta hoon", "chalti hoon"))
        if is_wrapup_request or turn_count > 30:
            return TurnDirective(
                phase="wrap_up",
                problemDetected=False,
                concernCategory=None,
                mustReflectFirst=True,
                offerSolution=False,
                mustAskFollowUp=False,
                nextQuestionSeed="Would you like to wrap up our session for today?"
            )
            
        prompt = f"Current Turn: {turn_count}\nCurrent Phase: {current_phase}\nUser Message: {user_message}"
        
        req = AIRequest(
            system_prompt=self._system_prompt,
            prompt=prompt,
            stream=False,
            temperature=0.1
        )
        
        try:
            # Fast tier LLM call
            resp = await self._gateway.generate(req)
            content = resp.content.strip()
            
            # Strip potential markdown formatting
            if content.startswith("```json"):
                content = content[7:-3]
            elif content.startswith("```"):
                content = content[3:-3]
                
            data = json.loads(content)
            
            phase = data.get("phase", current_phase)
            offer_sol = bool(data.get("offerSolution", False))

            # Early-turn guardrail: Never allow unsolicited solution offering on Turn 1 or 2
            explicit_req = any(p in msg_lower for p in (
                "what should i do", "what can i do", "help me fix", "give me advice",
                "suggest something", "solution", "any tips", "kya karun", "kya karoon"
            ))
            panic_req = any(p in msg_lower for p in (
                "panic attack", "cannot breathe", "can't breathe", "hyperventilat"
            ))
            if turn_count < 3 and not (explicit_req or panic_req):
                offer_sol = False
                if phase == "offer":
                    phase = "explore" if turn_count <= 1 else "identify"

            return TurnDirective(
                phase=phase,
                problemDetected=data.get("problemDetected", False),
                concernCategory=data.get("concernCategory"),
                mustReflectFirst=data.get("mustReflectFirst", True),
                offerSolution=offer_sol,
                mustAskFollowUp=data.get("mustAskFollowUp", True),
                nextQuestionSeed=data.get("nextQuestionSeed")
            )
        except Exception as e:
            logger.warning(f"TurnDirective classification failed: {e}. Falling back.")
            return TurnDirective.default(current_phase)
