"""
Turn Directive Classifier.

Runs in parallel with emotion and profile retrieval.
Determines the shape of the upcoming response based on the conversation state.
"""

from __future__ import annotations

import asyncio
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

    def fast_classify(
        self,
        user_message: str,
        current_phase: str = "explore",
        turn_count: int = 1,
    ) -> TurnDirective:
        """Instantaneous heuristic turn classification (sub-0.1ms)."""
        msg_lower = (user_message or "").lower().strip()

        # Disengagement check
        disengage_patterns = [
            "don't want to talk", "dont want to talk", "stop", "shut up",
            "leave me alone", "enough", "bye", "goodbye", "pause", "wait",
            "बस", "रुको", "रहने दो", "बंद करो", "wrap up", "gotta go", "have to go",
        ]
        if any(p in msg_lower for p in disengage_patterns) or turn_count > 30:
            return TurnDirective(
                phase="wrap_up" if any(p in msg_lower for p in ("bye", "goodbye", "wrap up", "gotta go", "have to go")) else "explore",
                problemDetected=False,
                concernCategory=None,
                mustReflectFirst=True,
                offerSolution=False,
                mustAskFollowUp=False,
                nextQuestionSeed="Would you like to wrap up our session for today?",
            )

        # Concern category detection
        categories = {
            "work_stress": [
                "stress", "exam", "test", "study", "interview", "job", "career",
                "boss", "deadline", "code", "coding", "project", "pressure", "fail",
                "तनाव", "परीक्षा", "नौकरी", "दबाव",
            ],
            "sleep": [
                "sleep", "insomnia", "tired", "exhausted", "awake", "nightmare", "rest",
                "नींद", "थका", "थकान",
            ],
            "relationships": [
                "breakup", "partner", "girlfriend", "boyfriend", "friend", "family",
                "parents", "mom", "dad", "fight", "argue", "divorce", "रिश्ते", "दोस्त",
            ],
            "loneliness": [
                "lonely", "alone", "isolated", "nobody", "no one", "अकेला", "अकेलापन",
            ],
            "anxiety": [
                "anxious", "anxiety", "panic", "scared", "fear", "nervous", "worry",
                "worried", "घबराहट", "डर", "चिंता",
            ],
            "motivation": [
                "lazy", "unmotivated", "procrastinat", "burnout", "stuck", "give up",
                "आलस", "हिम्मत",
            ],
        }

        detected_category = None
        for cat, keywords in categories.items():
            if any(kw in msg_lower for kw in keywords):
                detected_category = cat
                break

        problem_detected = detected_category is not None

        # Phase progression logic
        phase = current_phase or "explore"
        offer_solution = False
        must_reflect = True

        if problem_detected:
            if phase in ("check_in", "explore"):
                phase = "identify"
            elif phase == "identify":
                phase = "reflect"
            elif phase == "reflect":
                phase = "offer"
                offer_solution = True
            elif phase == "offer":
                phase = "follow_up"
        else:
            if phase == "check_in" and turn_count > 1:
                phase = "explore"

        # Early-turn guardrail: Never offer unsolicited solution on turns 1-2
        explicit_req = any(p in msg_lower for p in (
            "what should i do", "what can i do", "help me fix", "give me advice",
            "suggest something", "solution", "any tips", "kya karun", "kya karoon"
        ))
        panic_req = any(p in msg_lower for p in (
            "panic attack", "cannot breathe", "can't breathe", "hyperventilat"
        ))
        if turn_count < 3 and not (explicit_req or panic_req):
            offer_solution = False
            if phase == "offer":
                phase = "explore" if turn_count <= 1 else "identify"

        # Formulate contextual question seed
        seed_map = {
            "work_stress": "What specific part of your workload or exams feels the heaviest right now?",
            "sleep": "How long have you been experiencing difficulties with your sleep schedule?",
            "relationships": "Would it help to talk through how that interaction affected you?",
            "loneliness": "What is one small thing that usually brings you a bit of comfort when feeling isolated?",
            "anxiety": "Would taking a slow, calming breath together help you right now?",
            "motivation": "What is one very small step you might feel up to trying today?",
        }
        next_seed = seed_map.get(detected_category) if detected_category else None

        return TurnDirective(
            phase=phase,
            problemDetected=problem_detected,
            concernCategory=detected_category,
            mustReflectFirst=must_reflect,
            offerSolution=offer_solution,
            mustAskFollowUp=True,
            nextQuestionSeed=next_seed,
        )

    async def classify(
        self,
        user_message: str,
        current_phase: str,
        turn_count: int,
        use_llm: bool = False,
    ) -> TurnDirective:
        """Analyze the turn and return a directive. Defaults to instant heuristic classification."""
        if not use_llm:
            return self.fast_classify(user_message, current_phase, turn_count)

        msg_lower = (user_message or "").lower().strip()
        is_wrapup_request = any(p in msg_lower for p in ("bye", "goodbye", "leave now", "wrap up", "gotta go", "have to go", "alvida", "chalta hoon", "chalti hoon"))
        if is_wrapup_request or turn_count > 30:
            return TurnDirective(
                phase="wrap_up",
                problemDetected=False,
                concernCategory=None,
                mustReflectFirst=True,
                offerSolution=False,
                mustAskFollowUp=False,
                nextQuestionSeed="Would you like to wrap up our session for today?",
            )

        prompt = f"Current Turn: {turn_count}\nCurrent Phase: {current_phase}\nUser Message: {user_message}"
        req = AIRequest(
            system_prompt=self._system_prompt,
            prompt=prompt,
            stream=False,
            temperature=0.1,
            max_tokens=256,
        )

        try:
            # Fast tier LLM call with short timeout protection
            resp = await asyncio.wait_for(self._gateway.generate(req), timeout=2.5)
            content = resp.content.strip()

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
                nextQuestionSeed=data.get("nextQuestionSeed"),
            )
        except Exception as e:
            logger.debug(f"TurnDirective LLM classification fallback to fast: {e}")
            return self.fast_classify(user_message, current_phase, turn_count)
