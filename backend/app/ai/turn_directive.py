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
5. "offer" - Offering a solution.
6. "follow_up" - Checking if the solution landed or moving on.
7. "wrap_up" - Ending the session.

Disengagement Handling:
If the user says "I don't want to talk about this", "stop", or shows clear fatigue, set `mustAskFollowUp` to false, and advance phase toward "explore" or "wrap_up".

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
"work_stress", "sleep", "relationships", "motivation", "loneliness", "anxiety", "general"

Only return valid JSON."""

    async def classify(self, user_message: str, current_phase: str, turn_count: int) -> TurnDirective:
        """Analyze the turn and return a directive."""
        
        if turn_count > 15:
            # Fatigue cap
            return TurnDirective(
                phase="wrap_up",
                problemDetected=False,
                concernCategory=None,
                mustReflectFirst=True,
                offerSolution=False,
                mustAskFollowUp=False,
                nextQuestionSeed="Would you like to wrap up our session for today?"
            )
            
        prompt = f"Current Phase: {current_phase}\nUser Message: {user_message}"
        
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
            
            return TurnDirective(
                phase=data.get("phase", current_phase),
                problemDetected=data.get("problemDetected", False),
                concernCategory=data.get("concernCategory"),
                mustReflectFirst=data.get("mustReflectFirst", True),
                offerSolution=data.get("offerSolution", False),
                mustAskFollowUp=data.get("mustAskFollowUp", True),
                nextQuestionSeed=data.get("nextQuestionSeed")
            )
        except Exception as e:
            logger.warning(f"TurnDirective classification failed: {e}. Falling back.")
            return TurnDirective.default(current_phase)
