"""
Avatar State Machine.

Drives the abstract presence visual (orb/hologram) for Live Mode.
States: idle, listening, user_speaking, thinking, responding, interrupted, error.
"""

from __future__ import annotations

import enum
from dataclasses import dataclass
from typing import Callable

from app.core.logging_config import get_logger

logger = get_logger(__name__)

class AvatarState(str, enum.Enum):
    IDLE = "idle"
    LISTENING = "listening"
    USER_SPEAKING = "user_speaking"
    THINKING = "thinking"
    RESPONDING = "responding"
    INTERRUPTED = "interrupted"
    ERROR = "error"

@dataclass
class AvatarStateEvent:
    state: AvatarState
    timestamp: float
    metadata: dict | None = None

class AvatarStateManager:
    """Manages the state transitions for the Live Mode presence visual."""
    
    def __init__(self, on_state_change: Callable[[AvatarStateEvent], None] | None = None):
        self.current_state = AvatarState.IDLE
        self._on_state_change = on_state_change

    def transition_to(self, new_state: AvatarState, metadata: dict | None = None) -> None:
        """Transition to a new state and emit event."""
        if self.current_state == new_state and new_state != AvatarState.INTERRUPTED:
            return  # Prevent redundant events unless it's an explicit interruption trigger
            
        logger.debug(f"Avatar state transition: {self.current_state.value} -> {new_state.value}")
        self.current_state = new_state
        
        import time
        event = AvatarStateEvent(
            state=new_state,
            timestamp=time.time(),
            metadata=metadata
        )
        
        if self._on_state_change:
            self._on_state_change(event)
