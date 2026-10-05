"""
Voice Activity Detection (VAD).

Detects speech vs. silence/noise in a stream of 16kHz, 16-bit mono PCM audio frames.

Architecture & States
---------------------
5-State Machine:
1. SILENCE       – Ambient background noise / no active speech.
2. SPEECH_START – Initial voice onset detected; prepends pre-speech padding.
3. SPEAKING     – Confirmed continuous user speech.
4. POSSIBLE_END – Energy dropped below offset threshold; debouncing natural pauses.
5. SPEECH_END   – Silence duration exceeded threshold; finalized turn.

Features:
• Pre-speech padding ring buffer (~200ms) prevents clipping initial consonants/syllables.
• Adaptive noise floor tracking with dual-threshold hysteresis (higher onset, lower offset).
• Debounced natural pauses: brief pauses enter POSSIBLE_END; resuming speech returns to SPEAKING.
• Fast finalization on confirmed silence without premature cutting.
"""

from __future__ import annotations

import asyncio
import math
import struct
import time
from collections import deque
from dataclasses import dataclass, field
from enum import Enum
from typing import AsyncIterator

import numpy as np

from app.core.logging_config import get_logger

logger = get_logger(__name__)

try:
    import webrtcvad as _webrtcvad  # type: ignore[import-untyped]
    _WEBRTCVAD_AVAILABLE = True
except ImportError:
    _webrtcvad = None
    _WEBRTCVAD_AVAILABLE = False


class VADState(str, Enum):
    """5 strict states of Voice Activity Detection."""
    SILENCE = "SILENCE"
    SPEECH_START = "SPEECH_START"
    SPEAKING = "SPEAKING"
    POSSIBLE_END = "POSSIBLE_END"
    SPEECH_END = "SPEECH_END"


class VADEvent(str, Enum):
    """Events emitted by the VoiceActivityDetector for pipeline integration."""
    SPEECH_STARTED = "SPEECH_STARTED"
    SPEAKING = "SPEAKING"
    POSSIBLE_END = "POSSIBLE_END"
    SPEECH_ENDED = "SPEECH_ENDED"
    SILENCE = "SILENCE"


@dataclass
class VADResult:
    """Result of processing a single audio frame."""
    event: VADEvent | None
    is_speech: bool
    timestamp_ms: float
    state: VADState = VADState.SILENCE
    frame: bytes = b""
    padding_frames: list[bytes] = field(default_factory=list)
    rms: float = 0.0
    snr_db: float = 0.0


class VoiceActivityDetector:
    """Detects speech start/end in a PCM audio stream using 5-state hysteresis VAD.

    Args:
        session_id: Used for logging context.
        aggressiveness: WebRTC VAD aggressiveness 0–3 (if installed).
        silence_threshold_ms: Milliseconds of silence before SPEECH_ENDED fires (default 650ms).
        min_speech_ms: Minimum speech duration to be considered valid (default 180ms).
        pre_speech_padding_ms: Audio kept before speech onset to avoid clipping (default 200ms).
        frame_ms: Frame duration in milliseconds (default 30ms = 480 samples @ 16kHz).
        sample_rate: 16000 Hz.
    """

    SAMPLE_RATE = 16_000

    def __init__(
        self,
        session_id: str,
        aggressiveness: int = 2,
        silence_threshold_ms: int = 380,
        min_speech_ms: int = 120,
        pre_speech_padding_ms: int = 200,
        frame_ms: int = 30,
        smoothing_frames: int = 3,
    ) -> None:
        self._session_id = session_id
        self._aggressiveness = aggressiveness
        self._silence_threshold_ms = silence_threshold_ms
        self._min_speech_ms = min_speech_ms
        self._pre_speech_padding_ms = pre_speech_padding_ms
        self._frame_ms = frame_ms
        self._smoothing_frames = smoothing_frames

        # Ring buffer for pre-speech frames (e.g. 200ms / 30ms ≈ 7 frames)
        max_pad_frames = max(2, int(pre_speech_padding_ms / frame_ms))
        self._pre_speech_ring: deque[bytes] = deque(maxlen=max_pad_frames)

        # Ring buffer for decision smoothing
        self._smooth_ring: deque[bool] = deque(maxlen=smoothing_frames)

        # Adaptive energy and noise floor tracking
        self._noise_floor = 45.0  # Initial sensitive noise floor estimate in 16-bit PCM RMS
        self._vad_state = VADState.SILENCE
        self._speech_start_ms: float | None = None
        self._last_speech_ms: float | None = None
        self._possible_end_start_ms: float | None = None
        self._frame_count = 0
        self._is_playback_active = False

        # Filter state for continuous 80Hz IIR highpass
        self._hp_last_in = 0.0
        self._hp_last_out = 0.0

        # Backend VAD (WebRTC if available)
        self._webrtc_vad = self._init_webrtc_vad(aggressiveness)

    def set_playback_active(self, is_active: bool) -> None:
        """Set whether assistant audio is actively playing through speakers."""
        self._is_playback_active = is_active

    @property
    def is_playback_active(self) -> bool:
        return self._is_playback_active

    def _init_webrtc_vad(self, aggressiveness: int):
        if _WEBRTCVAD_AVAILABLE and _webrtcvad:
            try:
                vad = _webrtcvad.Vad(aggressiveness)
                logger.info("WebRTC VAD initialized", aggressiveness=aggressiveness)
                return vad
            except Exception as e:
                logger.warning("Failed to initialize WebRTC VAD", error=str(e))
        return None

    def _calculate_frame_features(self, frame: bytes) -> tuple[float, float, float, float]:
        """Calculate highpassed RMS energy, Zero-Crossing Rate (ZCR), sub-160Hz ratio, and formant-band energy."""
        if not frame or len(frame) < 2:
            return 0.0, 0.0, 0.0, 0.0
        try:
            samples = np.frombuffer(frame, dtype=np.int16).astype(np.float32)
            n_samples = len(samples)
            if n_samples == 0:
                return 0.0, 0.0, 0.0, 0.0

            # Vectorized zero-crossing rate
            crossings = int(np.count_nonzero(np.diff(np.signbit(samples))))
            zcr = crossings / max(1, n_samples)

            # High-pass filter in NumPy (1st order difference at alpha 0.9695)
            # Fast vectorized IIR approximation
            hp_samples = np.empty_like(samples)
            val_in = self._hp_last_in
            val_out = self._hp_last_out
            alpha = 0.9695
            for i in range(n_samples):
                v = samples[i]
                val_out = alpha * (val_out + v - val_in)
                hp_samples[i] = val_out
                val_in = v
            self._hp_last_in = val_in
            self._hp_last_out = val_out

            filtered_rms = float(np.sqrt(np.mean(hp_samples ** 2)))

            # Spectral analysis using real FFT
            fft_mag = np.abs(np.fft.rfft(samples))
            freqs = np.fft.rfftfreq(n_samples, 1.0 / self.SAMPLE_RATE)
            tot_pwr = float(np.sum(fft_mag ** 2))
            low_pwr = float(np.sum(fft_mag[freqs < 160] ** 2))
            low_ratio = (low_pwr / tot_pwr) if tot_pwr > 1e-4 else 0.0

            # Human voice formant power (180 Hz to 3400 Hz)
            formant_mask = (freqs >= 180) & (freqs <= 3400)
            formant_pwr = float(np.sum(fft_mag[formant_mask] ** 2))
            formant_ratio = (formant_pwr / tot_pwr) if tot_pwr > 1e-4 else 0.0

            return filtered_rms, zcr, low_ratio, formant_ratio
        except Exception:
            return 0.0, 0.0, 0.0, 0.0

    def _calculate_frame_rms(self, frame: bytes) -> float:
        rms, _, _, _ = self._calculate_frame_features(frame)
        return rms

    def _classify_frame(self, frame: bytes, rms: float) -> bool:
        """Classify single frame as speech using adaptive hysteresis, formant energy, and deep-voice support."""
        filtered_rms, zcr, low_ratio, formant_ratio = self._calculate_frame_features(frame)

        # 1. Update adaptive noise floor during silence ONLY when playback is not active
        if self._vad_state == VADState.SILENCE and not self._is_playback_active:
            self._noise_floor = self._noise_floor * 0.96 + min(filtered_rms, self._noise_floor * 1.4) * 0.04
            self._noise_floor = max(20.0, min(800.0, self._noise_floor))

        # Dynamic thresholds based on noise floor and assistant playback status
        if self._is_playback_active:
            # Elevated thresholds when Aura is speaking to prevent self-echo false interruption
            onset_threshold = max(180.0, self._noise_floor * 2.4 + 50.0)
            offset_threshold = max(120.0, self._noise_floor * 1.7 + 30.0)
        else:
            # Sensitive thresholds for crisp whisper & quiet conversational speech
            onset_threshold = max(50.0, self._noise_floor * 1.5 + 20.0)
            offset_threshold = max(32.0, self._noise_floor * 1.15 + 10.0)

        # Pure electrical DC or 50Hz mains hum rejection:
        # Only reject if virtually all energy (>95%) is in sub-160Hz AND virtually zero formant energy AND low level
        if filtered_rms < 80.0 and low_ratio > 0.95 and formant_ratio < 0.04 and zcr < 0.005:
            return False

        # Energy vote: if in speaking states use lower offset threshold; else onset threshold
        if self._vad_state in (VADState.SPEECH_START, VADState.SPEAKING, VADState.POSSIBLE_END):
            energy_speech = filtered_rms >= offset_threshold
        else:
            # Speech onset triggered if overall RMS passes threshold OR strong voice formant presence
            energy_speech = (filtered_rms >= onset_threshold) or (formant_ratio > 0.45 and filtered_rms >= offset_threshold)

        # WebRTC vote if available
        if self._webrtc_vad is not None:
            try:
                webrtc_speech = self._webrtc_vad.is_speech(frame, self.SAMPLE_RATE)
                if self._is_playback_active:
                    return energy_speech and webrtc_speech and (filtered_rms > onset_threshold)
                return energy_speech or (webrtc_speech and filtered_rms > offset_threshold)
            except Exception:
                pass

        return energy_speech

    async def process(
        self, frames: AsyncIterator[bytes]
    ) -> AsyncIterator[VADResult]:
        """Async generator that processes audio frames and yields 5-state VAD results.

        Emits events at transitions (SPEECH_STARTED, POSSIBLE_END, SPEECH_ENDED)
        and preserves pre-speech padding on SPEECH_STARTED.
        """
        elapsed_ms = 0.0

        async for frame in frames:
            self._frame_count += 1
            elapsed_ms += self._frame_ms
            now_ms = elapsed_ms

            rms = self._calculate_frame_rms(frame)
            raw_speech = self._classify_frame(frame, rms)
            self._smooth_ring.append(raw_speech)

            # Majority vote smoothing
            speech_votes = sum(self._smooth_ring)
            is_speech = speech_votes > (len(self._smooth_ring) / 2)

            snr_db = 20.0 * (0.0 if rms <= 0 or self._noise_floor <= 0 else
                             __import__("math").log10(max(1.0, rms) / max(1.0, self._noise_floor)))

            event: VADEvent | None = None
            padding_frames: list[bytes] = []

            # ── 5-State Transition Logic ──────────────────────────────
            if self._vad_state == VADState.SILENCE:
                self._pre_speech_ring.append(frame)

                if is_speech:
                    # Transition: SILENCE → SPEECH_START
                    self._vad_state = VADState.SPEECH_START
                    self._speech_start_ms = now_ms
                    self._last_speech_ms = now_ms
                    self._possible_end_start_ms = None
                    event = VADEvent.SPEECH_STARTED

                    # Prepend pre-speech padding frames
                    padding_frames = list(self._pre_speech_ring)
                    logger.debug(
                        "VAD: Speech started",
                        session_id=self._session_id,
                        at_ms=round(now_ms, 1),
                        padding_count=len(padding_frames),
                        snr_db=round(snr_db, 1),
                    )

            elif self._vad_state == VADState.SPEECH_START:
                if is_speech:
                    self._last_speech_ms = now_ms
                    speech_duration = now_ms - (self._speech_start_ms or now_ms)
                    min_req = max(self._min_speech_ms, 240) if self._is_playback_active else self._min_speech_ms
                    if speech_duration >= min_req:
                        # Confirmed speech duration: SPEECH_START → SPEAKING
                        self._vad_state = VADState.SPEAKING
                        event = VADEvent.SPEAKING
                else:
                    # Speech dropped quickly after start: possible noise spike or debounce
                    if (now_ms - (self._last_speech_ms or now_ms)) > 150:
                        # Transient noise: revert to SILENCE
                        self._vad_state = VADState.SILENCE
                        self._speech_start_ms = None
                        self._last_speech_ms = None

            elif self._vad_state == VADState.SPEAKING:
                if is_speech:
                    self._last_speech_ms = now_ms
                else:
                    # Energy dropped: SPEAKING → POSSIBLE_END
                    self._vad_state = VADState.POSSIBLE_END
                    self._possible_end_start_ms = now_ms
                    event = VADEvent.POSSIBLE_END
                    logger.debug(
                        "VAD: Possible speech end (debouncing natural pause)",
                        session_id=self._session_id,
                        at_ms=round(now_ms, 1),
                    )

            elif self._vad_state == VADState.POSSIBLE_END:
                if is_speech:
                    # User resumed speaking during pause: POSSIBLE_END → SPEAKING
                    self._vad_state = VADState.SPEAKING
                    self._last_speech_ms = now_ms
                    self._possible_end_start_ms = None
                    event = VADEvent.SPEAKING
                    logger.debug(
                        "VAD: Speech resumed from natural pause",
                        session_id=self._session_id,
                        at_ms=round(now_ms, 1),
                    )
                else:
                    silence_duration = now_ms - (self._possible_end_start_ms or now_ms)
                    if silence_duration >= self._silence_threshold_ms:
                        # Silence confirmed: POSSIBLE_END → SPEECH_END
                        total_speech = (self._last_speech_ms or now_ms) - (self._speech_start_ms or now_ms)
                        self._vad_state = VADState.SPEECH_END
                        event = VADEvent.SPEECH_ENDED
                        logger.debug(
                            "VAD: Speech ended (finalized)",
                            session_id=self._session_id,
                            speech_duration_ms=round(total_speech, 1),
                            silence_ms=round(silence_duration, 1),
                        )

            elif self._vad_state == VADState.SPEECH_END:
                # Immediate transition to SILENCE after yielding
                self._vad_state = VADState.SILENCE
                self._speech_start_ms = None
                self._last_speech_ms = None
                self._possible_end_start_ms = None
                self._pre_speech_ring.clear()
                self._pre_speech_ring.append(frame)
                event = VADEvent.SILENCE

            yield VADResult(
                event=event,
                is_speech=is_speech or (self._vad_state in (VADState.SPEECH_START, VADState.SPEAKING)),
                timestamp_ms=now_ms,
                state=self._vad_state,
                frame=frame,
                padding_frames=padding_frames,
                rms=round(rms, 2),
                snr_db=round(snr_db, 1),
            )

    def process_frame(self, frame: bytes) -> VADResult:
        """Process a single PCM frame synchronously through the 5-state machine."""
        self._frame_count += 1
        now_ms = self._frame_count * self._frame_ms

        rms = self._calculate_frame_rms(frame)
        raw_speech = self._classify_frame(frame, rms)
        self._smooth_ring.append(raw_speech)

        speech_votes = sum(self._smooth_ring)
        is_speech = speech_votes > (len(self._smooth_ring) / 2)

        snr_db = 20.0 * (0.0 if rms <= 0 or self._noise_floor <= 0 else
                         math.log10(max(1.0, rms) / max(1.0, self._noise_floor)))

        event: VADEvent | None = None
        padding_frames: list[bytes] = []

        if self._vad_state == VADState.SILENCE:
            self._pre_speech_ring.append(frame)
            if is_speech:
                self._vad_state = VADState.SPEECH_START
                self._speech_start_ms = now_ms
                self._last_speech_ms = now_ms
                self._possible_end_start_ms = None
                event = VADEvent.SPEECH_STARTED
                padding_frames = list(self._pre_speech_ring)

        elif self._vad_state == VADState.SPEECH_START:
            if is_speech:
                self._last_speech_ms = now_ms
                if self._speech_start_ms and (now_ms - self._speech_start_ms >= self._min_speech_ms):
                    self._vad_state = VADState.SPEAKING
                    event = VADEvent.SPEAKING
            else:
                if self._speech_start_ms and (now_ms - self._speech_start_ms < self._min_speech_ms):
                    self._vad_state = VADState.SILENCE
                    self._speech_start_ms = None
                    self._pre_speech_ring.clear()

        elif self._vad_state == VADState.SPEAKING:
            if is_speech:
                self._last_speech_ms = now_ms
            else:
                self._vad_state = VADState.POSSIBLE_END
                self._possible_end_start_ms = now_ms
                event = VADEvent.POSSIBLE_END

        elif self._vad_state == VADState.POSSIBLE_END:
            if is_speech:
                self._vad_state = VADState.SPEAKING
                self._last_speech_ms = now_ms
                self._possible_end_start_ms = None
                event = VADEvent.SPEAKING
            else:
                silence_dur = now_ms - (self._possible_end_start_ms or now_ms)
                if silence_dur >= self._silence_threshold_ms:
                    self._vad_state = VADState.SPEECH_END
                    event = VADEvent.SPEECH_ENDED

        elif self._vad_state == VADState.SPEECH_END:
            self._vad_state = VADState.SILENCE
            self._speech_start_ms = None
            self._last_speech_ms = None
            self._possible_end_start_ms = None
            self._pre_speech_ring.clear()
            self._pre_speech_ring.append(frame)
            event = VADEvent.SILENCE

        return VADResult(
            event=event,
            is_speech=is_speech or (self._vad_state in (VADState.SPEECH_START, VADState.SPEAKING)),
            timestamp_ms=now_ms,
            state=self._vad_state,
            frame=frame,
            padding_frames=padding_frames,
            rms=round(rms, 2),
            snr_db=round(snr_db, 1),
        )

    def reset(self) -> None:
        """Reset internal state (e.g. after interruption)."""
        self._vad_state = VADState.SILENCE
        self._speech_start_ms = None
        self._last_speech_ms = None
        self._possible_end_start_ms = None
        self._smooth_ring.clear()
        self._pre_speech_ring.clear()
        self._frame_count = 0

    @property
    def is_in_speech(self) -> bool:
        """True if currently inside active speech or pause debouncing."""
        return self._vad_state in (VADState.SPEECH_START, VADState.SPEAKING, VADState.POSSIBLE_END)

    @property
    def current_state(self) -> VADState:
        return self._vad_state

    @property
    def state(self) -> VADState:
        return self._vad_state
