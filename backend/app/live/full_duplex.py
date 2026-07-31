"""
Full Duplex Live Engine.

Handles real-time audio streaming, Voice Activity Detection (VAD), 
and barge-in cancellation. Owns the audio stream server-side.
"""

from __future__ import annotations

import asyncio
from typing import Callable, Any

from app.live.avatar_state import AvatarStateManager, AvatarState
from app.core.logging_config import get_logger

logger = get_logger(__name__)

class LiveEngine:
    """Manages the full-duplex audio pipeline and barge-in lifecycle."""
    
    def __init__(self, avatar_manager: AvatarStateManager, on_utterance_end: Callable[[bytes], None], on_partial_transcript: Callable[[str], None] | None = None):
        self._avatar = avatar_manager
        self._on_utterance_end = on_utterance_end
        self._on_partial_transcript = on_partial_transcript
        
        self._is_ai_speaking = False
        self._audio_buffer = bytearray()
        self._active_generation_task: asyncio.Task | None = None
        
        # Threshold-based energy mock for VAD.
        # In a real app, this would use WebRTCVAD or Silero VAD over the PCM frames.
        self._vad_active = False
        self._silence_chunks = 0
        self._silence_threshold_chunks = 15  # Approx 300-500ms depending on chunk size

    def process_audio_chunk(self, chunk: bytes) -> None:
        """Process incoming raw audio from the user."""
        self._audio_buffer.extend(chunk)
        
        has_speech = self._detect_speech(chunk)
        
        if has_speech:
            self._silence_chunks = 0
            if self._is_ai_speaking:
                self._handle_barge_in()
            else:
                if not self._vad_active:
                    self._vad_active = True
                    self._avatar.transition_to(AvatarState.USER_SPEAKING)
        else:
            if self._vad_active:
                self._silence_chunks += 1
                if self._silence_chunks >= self._silence_threshold_chunks:
                    # Silence detected after speech -> end of utterance
                    self._vad_active = False
                    self._commit_utterance()

    def set_ai_speaking_state(self, is_speaking: bool, generation_task: asyncio.Task | None = None) -> None:
        """Mark whether the AI is currently generating/playing audio."""
        self._is_ai_speaking = is_speaking
        self._active_generation_task = generation_task
        if is_speaking:
            self._avatar.transition_to(AvatarState.RESPONDING)
        else:
            self._avatar.transition_to(AvatarState.LISTENING)

    def _handle_barge_in(self) -> None:
        """User interrupted the AI. Cancel current generation immediately."""
        logger.info("Barge-in detected! Cancelling current AI output.")
        self._avatar.transition_to(AvatarState.INTERRUPTED)
        
        if self._active_generation_task and not self._active_generation_task.done():
            self._active_generation_task.cancel()
            
        self._is_ai_speaking = False
        self._active_generation_task = None
        
        # Reset user buffer to capture the new utterance
        self._audio_buffer.clear()
        self._vad_active = True
        self._silence_chunks = 0
        self._avatar.transition_to(AvatarState.USER_SPEAKING)

    def _commit_utterance(self) -> None:
        """User finished speaking. Trigger pipeline."""
        if len(self._audio_buffer) == 0:
            return
            
        logger.info("Utterance ended. Processing audio.")
        self._avatar.transition_to(AvatarState.THINKING)
        
        audio_data = bytes(self._audio_buffer)
        self._audio_buffer.clear()
        
        # Trigger the orchestrator pipeline (STT -> Engine -> Response)
        if self._on_utterance_end:
            self._on_utterance_end(audio_data)
            
    def simulate_partial_transcript(self, text: str) -> None:
        """Hook for STT engine to stream partials to crisis detector."""
        if self._on_partial_transcript:
            self._on_partial_transcript(text)

    def _detect_speech(self, chunk: bytes) -> bool:
        """Energy-based mock VAD processing. Returns true if speech is detected."""
        if not chunk:
            return False
            
        # Very crude RMS energy calculation for 16-bit PCM
        # Real implementation would use WebRTC VAD
        import math
        import struct
        
        # Ensure chunk is a multiple of 2 bytes (16-bit)
        usable_len = len(chunk) - (len(chunk) % 2)
        if usable_len == 0:
            return False
            
        samples = struct.unpack(f"<{usable_len//2}h", chunk[:usable_len])
        rms = math.sqrt(sum(s*s for s in samples) / len(samples))
        
        # Arbitrary threshold for speech vs silence
        return rms > 500

