"""
Crisis Escalation module for the Safety Layer.

Handles injecting crisis resources into the prompt and logging Risk Events.
"""

from sqlalchemy.ext.asyncio import AsyncSession
from app.models.risk_events import RiskEvent
from app.core.logging_config import get_logger

logger = get_logger(__name__)


class CrisisEscalation:
    """Handles escalation procedures when a crisis is detected."""

    def __init__(self, db: AsyncSession):
        self._db = db

    async def log_risk_event(self, user_id: int, session_id: int, trigger_type: str, action_taken: str) -> None:
        """Log a crisis event to the audit trail."""
        event = RiskEvent(
            user_id=user_id,
            session_id=session_id,
            trigger_type=trigger_type,
            action_taken=action_taken,
            resolved=False,
        )
        self._db.add(event)
        await self._db.commit()
        logger.warning(
            "Risk event logged",
            user_id=user_id,
            session_id=session_id,
            trigger_type=trigger_type,
            action_taken=action_taken,
        )

    def get_crisis_context(self) -> str:
        """Return the crisis resources and tone instructions to be injected into the prompt."""
        return (
            "CRISIS DETECTED: The user has expressed severe distress or self-harm/suicidal ideation.\n"
            "INSTRUCTION: You must adopt a deeply compassionate, calm, and grounding tone.\n"
            "Do NOT dismiss their feelings. Do NOT give rushed advice. Keep your response concise.\n"
            "You MUST include the following crisis resources in your response, gently encouraging them to reach out:\n"
            "- National Suicide Prevention Lifeline: 988 (US) or your local emergency number.\n"
            "- Crisis Text Line: Text HOME to 741741.\n"
            "Ensure the user knows they are not alone and professional support is available."
        )
