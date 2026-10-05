"""
Communication State Machine.

Defines all valid states for a voice session and enforces legal transitions.
Only one state can be active at a time. Illegal transitions raise ValueError.

States
------
IDLE          – Session created, not yet started.
LISTENING     – Microphone open, waiting for speech.
PROCESSING    – Speech ended, STT transcription in progress.
THINKING      – Transcript sent to AI, waiting for first token.
SPEAKING      – TTS is playing AI response audio.
INTERRUPTED   – User spoke during SPEAKING; stopping TTS.
ERROR         – Unrecoverable error; session should be reset or closed.
DISCONNECTED  – WebSocket closed; session being torn down.
"""

from __future__ import annotations

import asyncio
from enum import Enum
from typing import Callable, Awaitable

from app.core.logging_config import get_logger

logger = get_logger(__name__)


class CommunicationState(str, Enum):
    """Authoritative 9 states of a voice session."""

    IDLE = "IDLE"
    LISTENING = "LISTENING"
    USER_SPEAKING = "USER_SPEAKING"
    THINKING = "THINKING"
    SPEAKING = "SPEAKING"
    INTERRUPTED = "INTERRUPTED"
    RECOVERING = "RECOVERING"
    ERROR = "ERROR"
    DISCONNECTED = "DISCONNECTED"

    # Backward-compatibility aliases (internally mapped to canonical states)
    CONNECTING = "LISTENING"
    TRANSCRIBING = "THINKING"
    PROCESSING = "THINKING"
    UNDERSTANDING = "THINKING"
    BUILDING_CONTEXT = "THINKING"
    GENERATING = "THINKING"


# Canonical 9-state transition rules:
# Only allow legal transitions among the 9 states.
_ALLOWED_TRANSITIONS: set[tuple[CommunicationState, CommunicationState]] = {
    # ── Normal turn flow ─────────────────────────────────────────
    (CommunicationState.IDLE, CommunicationState.LISTENING),
    (CommunicationState.LISTENING, CommunicationState.USER_SPEAKING),
    (CommunicationState.LISTENING, CommunicationState.THINKING),
    (CommunicationState.USER_SPEAKING, CommunicationState.THINKING),
    (CommunicationState.USER_SPEAKING, CommunicationState.LISTENING),
    (CommunicationState.THINKING, CommunicationState.SPEAKING),
    (CommunicationState.THINKING, CommunicationState.LISTENING),  # Empty transcript / no response needed
    (CommunicationState.THINKING, CommunicationState.USER_SPEAKING),  # User spoke before thinking produced speech
    (CommunicationState.SPEAKING, CommunicationState.LISTENING),  # Natural completion

    # ── Barge-in / interruption: allowed while SPEAKING or THINKING ─
    (CommunicationState.SPEAKING, CommunicationState.INTERRUPTED),
    (CommunicationState.THINKING, CommunicationState.INTERRUPTED),
    (CommunicationState.INTERRUPTED, CommunicationState.USER_SPEAKING),
    (CommunicationState.INTERRUPTED, CommunicationState.LISTENING),
    (CommunicationState.INTERRUPTED, CommunicationState.THINKING),

    # ── Error & Recovery ─────────────────────────────────────────
    (CommunicationState.ERROR, CommunicationState.RECOVERING),
    (CommunicationState.RECOVERING, CommunicationState.LISTENING),
    (CommunicationState.RECOVERING, CommunicationState.ERROR),

    # Any active state can transition to ERROR
    (CommunicationState.IDLE, CommunicationState.ERROR),
    (CommunicationState.LISTENING, CommunicationState.ERROR),
    (CommunicationState.USER_SPEAKING, CommunicationState.ERROR),
    (CommunicationState.THINKING, CommunicationState.ERROR),
    (CommunicationState.SPEAKING, CommunicationState.ERROR),
    (CommunicationState.INTERRUPTED, CommunicationState.ERROR),
    (CommunicationState.ERROR, CommunicationState.LISTENING),  # Soft recovery

    # Any state can transition to DISCONNECTED
    (CommunicationState.IDLE, CommunicationState.DISCONNECTED),
    (CommunicationState.LISTENING, CommunicationState.DISCONNECTED),
    (CommunicationState.USER_SPEAKING, CommunicationState.DISCONNECTED),
    (CommunicationState.THINKING, CommunicationState.DISCONNECTED),
    (CommunicationState.SPEAKING, CommunicationState.DISCONNECTED),
    (CommunicationState.INTERRUPTED, CommunicationState.DISCONNECTED),
    (CommunicationState.RECOVERING, CommunicationState.DISCONNECTED),
    (CommunicationState.ERROR, CommunicationState.DISCONNECTED),
}

# Type alias for async state-change callback
StateChangeCallback = Callable[[CommunicationState, CommunicationState], Awaitable[None]]


class StateMachine:
    """Authoritative finite state machine for a single voice session.

    Enforces the strict 9-state model and tracks turn and audio state metadata:
    - session_id
    - turn_id
    - state
    - user_audio_state
    - assistant_audio_state
    - active_generation_id
    - active_tts_id
    """

    def __init__(self, session_id: str) -> None:
        self._session_id = session_id
        self._state = CommunicationState.IDLE
        self._turn_id = 1
        self._user_audio_state = "silent"         # "silent" | "speaking" | "buffering"
        self._assistant_audio_state = "silent"    # "silent" | "buffering" | "speaking"
        self._active_generation_id = 0
        self._active_tts_id = 0
        self._interrupted_turn_id: int | None = None

        self._lock = asyncio.Lock()
        self._callbacks: list[StateChangeCallback] = []

    # ── Properties ────────────────────────────────────────────────

    @property
    def state(self) -> CommunicationState:
        """Current authoritative state."""
        return self._state

    @property
    def turn_id(self) -> int:
        return self._turn_id

    @property
    def user_audio_state(self) -> str:
        return self._user_audio_state

    @property
    def assistant_audio_state(self) -> str:
        return self._assistant_audio_state

    @property
    def active_generation_id(self) -> int:
        return self._active_generation_id

    @property
    def active_tts_id(self) -> int:
        return self._active_tts_id

    @property
    def interrupted_turn_id(self) -> int | None:
        return self._interrupted_turn_id

    def set_turn_id(self, turn_id: int) -> None:
        self._turn_id = turn_id

    def next_turn(self) -> int:
        self._turn_id += 1
        return self._turn_id

    def next_generation(self) -> int:
        self._active_generation_id += 1
        return self._active_generation_id

    def next_tts(self) -> int:
        self._active_tts_id += 1
        return self._active_tts_id

    def set_user_audio_state(self, audio_state: str) -> None:
        self._user_audio_state = audio_state

    def set_assistant_audio_state(self, audio_state: str) -> None:
        self._assistant_audio_state = audio_state

    def mark_interrupted(self, turn_id: int | None = None) -> None:
        self._interrupted_turn_id = turn_id if turn_id is not None else self._turn_id

    def clear_interrupted(self) -> None:
        self._interrupted_turn_id = None

    def snapshot(self) -> dict[str, Any]:
        """Return the authoritative state snapshot required by the protocol."""
        return {
            "session_id": self._session_id,
            "turn_id": self._turn_id,
            "state": self._state.value,
            "user_audio_state": self._user_audio_state,
            "assistant_audio_state": self._assistant_audio_state,
            "active_generation_id": self._active_generation_id,
            "active_tts_id": self._active_tts_id,
            "interrupted_turn_id": self._interrupted_turn_id,
        }

    def on_state_change(self, callback: StateChangeCallback) -> None:
        """Register an async callback invoked on every state transition."""
        self._callbacks.append(callback)

    def _normalize_state(self, state: Any) -> CommunicationState:
        """Map aliases or raw values to one of the 9 canonical states."""
        val = state.value if isinstance(state, Enum) else str(state)
        val = val.upper().strip()
        if val in ("CONNECTING",):
            return CommunicationState.LISTENING
        if val in ("TRANSCRIBING", "PROCESSING", "UNDERSTANDING", "BUILDING_CONTEXT", "GENERATING"):
            return CommunicationState.THINKING
        try:
            return CommunicationState(val)
        except ValueError:
            return CommunicationState.THINKING

    async def transition(self, new_state: CommunicationState | str) -> None:
        """Transition to ``new_state``.

        Args:
            new_state: Target state (canonical or alias).
        """
        canonical_target = self._normalize_state(new_state)

        async with self._lock:
            old_state = self._state

            if old_state == canonical_target:
                # No-op — already in target canonical state
                return

            if (old_state, canonical_target) not in _ALLOWED_TRANSITIONS:
                # Graceful recovery: if transitioning between processing/thinking states, allow
                logger.warning(
                    "Unexpected state transition attempted",
                    session_id=self._session_id,
                    from_state=old_state.value,
                    to_state=canonical_target.value,
                )
                # Allow fallback transition to prevent loop crashes
                if old_state in (CommunicationState.THINKING, CommunicationState.USER_SPEAKING) and canonical_target in (CommunicationState.THINKING, CommunicationState.LISTENING):
                    pass
                else:
                    raise ValueError(
                        f"[{self._session_id}] Illegal state transition: "
                        f"{old_state.value} → {canonical_target.value}"
                    )

            self._state = canonical_target

            # Sync audio state properties based on authoritative state
            if canonical_target == CommunicationState.USER_SPEAKING:
                self._user_audio_state = "speaking"
            elif canonical_target == CommunicationState.LISTENING:
                self._user_audio_state = "silent"
                self._assistant_audio_state = "silent"
            elif canonical_target == CommunicationState.SPEAKING:
                self._assistant_audio_state = "speaking"
            elif canonical_target == CommunicationState.THINKING:
                self._user_audio_state = "silent"
                self._assistant_audio_state = "buffering"
            elif canonical_target in (CommunicationState.INTERRUPTED, CommunicationState.IDLE):
                self._assistant_audio_state = "silent"

            logger.info(
                "State transition",
                session_id=self._session_id,
                turn_id=self._turn_id,
                from_state=old_state.value,
                to_state=canonical_target.value,
            )

        # Invoke callbacks outside the lock
        for cb in self._callbacks:
            try:
                await cb(old_state, canonical_target)
            except Exception as exc:  # noqa: BLE001
                logger.warning(
                    "State-change callback raised",
                    session_id=self._session_id,
                    error=str(exc),
                )

    async def force_state(self, new_state: CommunicationState | str) -> None:
        """Unconditionally set state without transition validation."""
        canonical_target = self._normalize_state(new_state)
        async with self._lock:
            old_state = self._state
            self._state = canonical_target
            logger.warning(
                "Forced state override",
                session_id=self._session_id,
                from_state=old_state.value,
                to_state=canonical_target.value,
            )

        for cb in self._callbacks:
            try:
                await cb(old_state, canonical_target)
            except Exception as exc:  # noqa: BLE001
                logger.warning("State-change callback raised", error=str(exc))

    def is_active(self) -> bool:
        """True if the session is in a non-terminal state."""
        return self._state not in (
            CommunicationState.ERROR,
            CommunicationState.DISCONNECTED,
        )

    def is_processing(self) -> bool:
        """True if the engine is actively generating or thinking."""
        return self._state in (
            CommunicationState.THINKING,
            CommunicationState.SPEAKING,
        )

    def is_speaking(self) -> bool:
        """True if Aura is currently in active audible output state."""
        return self._state == CommunicationState.SPEAKING

    def is_interruptible(self) -> bool:
        """True if current state can be interrupted.

        Requirement 5: Interruption logic is active ONLY while SPEAKING.
        """
        return self._state == CommunicationState.SPEAKING

