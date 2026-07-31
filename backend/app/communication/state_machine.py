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
    """All possible states of a voice session."""

    IDLE = "IDLE"
    CONNECTING = "CONNECTING"
    LISTENING = "LISTENING"
    USER_SPEAKING = "USER_SPEAKING"
    TRANSCRIBING = "TRANSCRIBING"
    PROCESSING = "PROCESSING"
    THINKING = "THINKING"
    UNDERSTANDING = "UNDERSTANDING"      # Emotion analysis on transcript
    BUILDING_CONTEXT = "BUILDING_CONTEXT"  # Assembling context + prompt
    GENERATING = "GENERATING"            # AI generation in progress
    SPEAKING = "SPEAKING"                # TTS playing audio
    INTERRUPTED = "INTERRUPTED"          # Barge-in; stopping TTS
    RECOVERING = "RECOVERING"            # Graceful error recovery
    ERROR = "ERROR"
    DISCONNECTED = "DISCONNECTED"


# Transition table: maps (from_state, to_state) → allowed?
# Any transition not listed here is illegal.
_ALLOWED_TRANSITIONS: set[tuple[CommunicationState, CommunicationState]] = {
    # ── Normal happy path ─────────────────────────────────────────
    (CommunicationState.IDLE, CommunicationState.CONNECTING),
    (CommunicationState.IDLE, CommunicationState.LISTENING),
    (CommunicationState.CONNECTING, CommunicationState.LISTENING),
    (CommunicationState.LISTENING, CommunicationState.USER_SPEAKING),
    (CommunicationState.LISTENING, CommunicationState.PROCESSING),
    (CommunicationState.USER_SPEAKING, CommunicationState.TRANSCRIBING),
    (CommunicationState.USER_SPEAKING, CommunicationState.PROCESSING),
    # Post-transcription: UNDERSTANDING (emotion analysis)
    (CommunicationState.TRANSCRIBING, CommunicationState.UNDERSTANDING),
    (CommunicationState.TRANSCRIBING, CommunicationState.PROCESSING),
    (CommunicationState.UNDERSTANDING, CommunicationState.BUILDING_CONTEXT),
    (CommunicationState.BUILDING_CONTEXT, CommunicationState.GENERATING),
    (CommunicationState.PROCESSING, CommunicationState.THINKING),
    (CommunicationState.THINKING, CommunicationState.SPEAKING),
    # Shortcut: allow old TRANSCRIBING → GENERATING for backward compat
    (CommunicationState.TRANSCRIBING, CommunicationState.GENERATING),
    (CommunicationState.GENERATING, CommunicationState.SPEAKING),
    (CommunicationState.SPEAKING, CommunicationState.LISTENING),      # response done

    # ── Barge-in / interruption ───────────────────────────────────
    (CommunicationState.SPEAKING, CommunicationState.INTERRUPTED),
    (CommunicationState.GENERATING, CommunicationState.INTERRUPTED),
    (CommunicationState.BUILDING_CONTEXT, CommunicationState.INTERRUPTED),
    (CommunicationState.INTERRUPTED, CommunicationState.LISTENING),
    # Legacy: SPEAKING/GENERATING → USER_SPEAKING (still allowed)
    (CommunicationState.SPEAKING, CommunicationState.USER_SPEAKING),
    (CommunicationState.GENERATING, CommunicationState.USER_SPEAKING),

    # ── Empty transcript handling ─────────────────────────────────
    (CommunicationState.TRANSCRIBING, CommunicationState.LISTENING),
    (CommunicationState.UNDERSTANDING, CommunicationState.LISTENING),

    # ── Graceful recovery ─────────────────────────────────────────
    (CommunicationState.ERROR, CommunicationState.RECOVERING),
    (CommunicationState.RECOVERING, CommunicationState.LISTENING),
    (CommunicationState.RECOVERING, CommunicationState.ERROR),  # recovery failed

    # ── Error – any active state can go to ERROR ──────────────────
    (CommunicationState.IDLE, CommunicationState.ERROR),
    (CommunicationState.CONNECTING, CommunicationState.ERROR),
    (CommunicationState.LISTENING, CommunicationState.ERROR),
    (CommunicationState.USER_SPEAKING, CommunicationState.ERROR),
    (CommunicationState.TRANSCRIBING, CommunicationState.ERROR),
    (CommunicationState.UNDERSTANDING, CommunicationState.ERROR),
    (CommunicationState.BUILDING_CONTEXT, CommunicationState.ERROR),
    (CommunicationState.GENERATING, CommunicationState.ERROR),
    (CommunicationState.SPEAKING, CommunicationState.ERROR),
    (CommunicationState.INTERRUPTED, CommunicationState.ERROR),
    (CommunicationState.ERROR, CommunicationState.LISTENING),      # soft recovery
    (CommunicationState.ERROR, CommunicationState.DISCONNECTED),

    # ── Disconnection – any state can go to DISCONNECTED ──────────
    (CommunicationState.IDLE, CommunicationState.DISCONNECTED),
    (CommunicationState.CONNECTING, CommunicationState.DISCONNECTED),
    (CommunicationState.LISTENING, CommunicationState.DISCONNECTED),
    (CommunicationState.USER_SPEAKING, CommunicationState.DISCONNECTED),
    (CommunicationState.TRANSCRIBING, CommunicationState.DISCONNECTED),
    (CommunicationState.UNDERSTANDING, CommunicationState.DISCONNECTED),
    (CommunicationState.BUILDING_CONTEXT, CommunicationState.DISCONNECTED),
    (CommunicationState.GENERATING, CommunicationState.DISCONNECTED),
    (CommunicationState.SPEAKING, CommunicationState.DISCONNECTED),
    (CommunicationState.INTERRUPTED, CommunicationState.DISCONNECTED),
    (CommunicationState.RECOVERING, CommunicationState.DISCONNECTED),
    (CommunicationState.ERROR, CommunicationState.DISCONNECTED),
}

# Type alias for async state-change callback
StateChangeCallback = Callable[[CommunicationState, CommunicationState], Awaitable[None]]


class StateMachine:
    """Finite state machine for a single voice session.

    Usage::

        sm = StateMachine()
        await sm.transition(CommunicationState.LISTENING)

    Raises ``ValueError`` on illegal transitions.
    Notifies all registered async callbacks on every successful transition.
    """

    def __init__(self, session_id: str) -> None:
        self._session_id = session_id
        self._state = CommunicationState.IDLE
        self._lock = asyncio.Lock()
        self._callbacks: list[StateChangeCallback] = []

    # ── Public API ────────────────────────────────────────────────

    @property
    def state(self) -> CommunicationState:
        """Current state (thread-safe read, no lock needed for read)."""
        return self._state

    def on_state_change(self, callback: StateChangeCallback) -> None:
        """Register an async callback invoked on every state transition.

        Callback signature: ``async def cb(from_state, to_state) -> None``
        """
        self._callbacks.append(callback)

    async def transition(self, new_state: CommunicationState) -> None:
        """Transition to ``new_state``.

        Args:
            new_state: Target state.

        Raises:
            ValueError: If the transition is not in the allowed set.
        """
        async with self._lock:
            old_state = self._state

            if old_state == new_state:
                # No-op — already in target state
                return

            if (old_state, new_state) not in _ALLOWED_TRANSITIONS:
                raise ValueError(
                    f"[{self._session_id}] Illegal state transition: "
                    f"{old_state.value} → {new_state.value}"
                )

            self._state = new_state
            logger.info(
                "State transition",
                session_id=self._session_id,
                from_state=old_state.value,
                to_state=new_state.value,
            )

        # Invoke callbacks outside the lock (non-blocking for state reads)
        for cb in self._callbacks:
            try:
                await cb(old_state, new_state)
            except Exception as exc:  # noqa: BLE001
                logger.warning(
                    "State-change callback raised",
                    session_id=self._session_id,
                    error=str(exc),
                )

    async def force_state(self, new_state: CommunicationState) -> None:
        """Unconditionally set state without transition validation.

        Use only for emergency error recovery or teardown.
        """
        async with self._lock:
            old_state = self._state
            self._state = new_state
            logger.warning(
                "Forced state override",
                session_id=self._session_id,
                from_state=old_state.value,
                to_state=new_state.value,
            )

        for cb in self._callbacks:
            try:
                await cb(old_state, new_state)
            except Exception as exc:  # noqa: BLE001
                logger.warning("State-change callback raised", error=str(exc))

    def is_active(self) -> bool:
        """True if the session is in a non-terminal state."""
        return self._state not in (
            CommunicationState.ERROR,
            CommunicationState.DISCONNECTED,
        )

    def is_processing(self) -> bool:
        """True if the engine is actively generating a response."""
        return self._state in (
            CommunicationState.UNDERSTANDING,
            CommunicationState.BUILDING_CONTEXT,
            CommunicationState.GENERATING,
            CommunicationState.SPEAKING,
        )

    def is_interruptible(self) -> bool:
        """True if the current state can be interrupted by barge-in."""
        return self._state in (
            CommunicationState.SPEAKING,
            CommunicationState.GENERATING,
            CommunicationState.BUILDING_CONTEXT,
        )
