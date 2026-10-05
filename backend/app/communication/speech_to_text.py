"""
Speech-to-Text Engine.

Provides a swappable STT interface. The concrete implementation uses
faster-whisper for low-latency, CPU-friendly local transcription.

Architecture
------------
STTProvider (ABC)
  └─ WhisperSTTProvider  — local faster-whisper (default)
  └─ DeepgramSTTProvider — cloud STT stub (drop-in when API key is set)

STTEngine wraps a provider and adds:
  - Audio buffer accumulation (frames collected during a speech segment)
  - Partial transcript callbacks (emitted during transcription)
  - Language auto-detection support

Usage::

    engine = STTEngine.from_settings()
    result = await engine.transcribe(audio_frames)
    print(result.text, result.confidence)
"""

from __future__ import annotations

import asyncio
import io
import wave
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Callable, Awaitable

from app.core.config import get_settings
from app.core.logging_config import get_logger

logger = get_logger(__name__)


# ── Data Classes ──────────────────────────────────────────────────────────────

@dataclass
class TranscriptResult:
    """Result of a transcription request."""
    text: str
    confidence: float
    language: str
    is_final: bool
    duration_ms: float
    # Parallel voice emotion from wav2vec2/acoustic analysis (attached by VAD loop)
    voice_emotion: dict | None = None


PartialCallback = Callable[[str, float], Awaitable[None]]


# ── Abstract Base ─────────────────────────────────────────────────────────────

class STTProvider(ABC):
    """Abstract speech-to-text provider.

    Implementors must be stateless — all audio state is managed by STTEngine.
    """

    @property
    @abstractmethod
    def name(self) -> str:
        """Provider identifier."""
        ...

    @property
    @abstractmethod
    def is_configured(self) -> bool:
        """True if provider dependencies are installed/configured."""
        ...

    @abstractmethod
    async def transcribe(
        self,
        audio_bytes: bytes,
        sample_rate: int = 16_000,
        language: str = "en",
    ) -> TranscriptResult:
        """Transcribe raw PCM bytes into text.

        Args:
            audio_bytes: Raw 16-bit signed little-endian PCM.
            sample_rate: Audio sample rate (typically 16000 Hz).
            language: ISO 639-1 language code or "auto".

        Returns:
            TranscriptResult with text and confidence.
        """
        ...


# ── Whisper Provider ──────────────────────────────────────────────────────────

def _purge_stale_hf_locks():
    """Remove orphaned Hugging Face lock files that cause filelock deadlock on startup/restarts."""
    import glob
    import os

    candidate_roots = [
        os.environ.get("HF_HOME"),
        os.path.expanduser("~/.cache/huggingface"),
        "/root/.cache/huggingface",
        "/app/models/cache",
    ]
    for root in candidate_roots:
        if not root:
            continue
        try:
            lock_pattern = os.path.join(root, "hub", ".locks", "**", "*.lock")
            for lock_path in glob.glob(lock_pattern, recursive=True):
                try:
                    os.remove(lock_path)
                    logger.info("Purged stale Hugging Face lock file", lock=lock_path)
                except Exception:
                    pass
        except Exception:
            pass


class WhisperSTTProvider(STTProvider):
    """Local speech-to-text using faster-whisper.

    The model is loaded lazily on first use to avoid blocking application
    startup. It is cached as a class-level singleton.

    Args:
        model_size: One of: tiny, tiny.en, base, base.en, small, medium, large-v3.
        compute_type: int8 (CPU), float16 (CUDA), or auto.
    """

    _model = None  # class-level singleton
    _model_lock = asyncio.Lock()

    def __init__(self, model_size: str = "tiny", compute_type: str = "int8") -> None:
        self._model_size = model_size
        self._compute_type = compute_type

    @property
    def name(self) -> str:
        return "faster_whisper"

    @property
    def is_configured(self) -> bool:
        try:
            import faster_whisper  # noqa: F401
            return True
        except ImportError:
            return False

    def _resolve_model_reference(self) -> tuple[str, str | None]:
        """Check if local pre-cached weights exist, returning (model_or_path, download_root)."""
        from pathlib import Path
        base_candidates = [
            Path("/app/models/speech/whisper"),
            Path("/models/speech/whisper"),
            Path(__file__).resolve().parent.parent.parent / "models" / "speech" / "whisper",
            Path(__file__).resolve().parent.parent.parent.parent / "models" / "speech" / "whisper",
        ]
        for base in base_candidates:
            if not base.exists():
                continue

            # 1. Direct directory with weights
            sub = base / f"faster-whisper-{self._model_size}"
            if sub.exists() and (any(sub.glob("*.bin")) or any(sub.glob("*.safetensors"))):
                return str(sub), str(base)

            # 2. HF Hub snapshot cache with weights for target model size
            for hf_dir in base.glob(f"*faster-whisper-{self._model_size}*"):
                snaps_dir = hf_dir / "snapshots"
                if snaps_dir.exists():
                    for snap in snaps_dir.iterdir():
                        if snap.is_dir() and (any(snap.glob("*.bin")) or any(snap.glob("*.safetensors"))):
                            return str(snap), str(base)

            # 3. Direct weights in base
            if any(base.glob("*.bin")) or any(base.glob("*.safetensors")):
                return str(base), str(base)

            # 4. Any other cached model snapshot in base (e.g. small if tiny requested)
            for hf_dir in base.glob("*faster-whisper*"):
                snaps_dir = hf_dir / "snapshots"
                if snaps_dir.exists():
                    for snap in snaps_dir.iterdir():
                        if snap.is_dir() and (any(snap.glob("*.bin")) or any(snap.glob("*.safetensors"))):
                            logger.info("Using cached whisper model snapshot", path=str(snap))
                            return str(snap), str(base)

        # Fallback to standard huggingface repo id, with dedicated download_root if available
        for base in base_candidates:
            if base.exists():
                return self._model_size, str(base)
        return self._model_size, None

    async def _get_model(self):
        """Lazily load and cache the Whisper model."""
        async with WhisperSTTProvider._model_lock:
            if WhisperSTTProvider._model is None:
                logger.info(
                    "Loading Whisper model",
                    model_size=self._model_size,
                    compute_type=self._compute_type,
                )
                loop = asyncio.get_event_loop()
                WhisperSTTProvider._model = await loop.run_in_executor(
                    None, self._load_model
                )
                logger.info("Whisper model loaded", model_size=self._model_size)
        return WhisperSTTProvider._model

    def _load_model(self):
        from faster_whisper import WhisperModel
        _purge_stale_hf_locks()

        model_ref, download_root = self._resolve_model_reference()
        import os
        cpu_threads = min(8, max(4, os.cpu_count() or 4))
        kwargs: dict[str, Any] = {
            "device": "cpu",
            "compute_type": self._compute_type,
            "cpu_threads": cpu_threads,
        }
        if download_root:
            kwargs["download_root"] = download_root

        try:
            return WhisperModel(model_ref, **kwargs)
        except Exception as exc:
            logger.warning(
                "WhisperModel initial acquisition failed, purging locks and retrying",
                error=str(exc),
            )
            _purge_stale_hf_locks()
            try:
                return WhisperModel(model_ref, **kwargs)
            except Exception as retry_exc:
                logger.error(
                    "WhisperModel failed to initialize after lock purge, attempting tiny fallback",
                    error=str(retry_exc),
                )
                _purge_stale_hf_locks()
                if self._model_size != "tiny":
                    return WhisperModel("tiny", device="cpu", compute_type="int8", cpu_threads=cpu_threads)
                raise retry_exc

    @staticmethod
    def _pcm_to_wav(pcm_bytes: bytes, sample_rate: int) -> bytes:
        """Wrap raw PCM bytes in a WAV container for Whisper."""
        buf = io.BytesIO()
        with wave.open(buf, "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)  # 16-bit
            wf.setframerate(sample_rate)
            wf.writeframes(pcm_bytes)
        return buf.getvalue()

    async def transcribe(
        self,
        audio_bytes: bytes,
        sample_rate: int = 16_000,
        language: str = "en",
    ) -> TranscriptResult:
        import time
        start = time.monotonic()

        if len(audio_bytes) < 3200:  # < 100ms of audio — too short for reliable transcription
            return TranscriptResult(
                text="", confidence=0.0, language=language,
                is_final=True, duration_ms=0.0,
            )

        # RMS Normalization: Boost quiet speech to -20 dBFS target for crystal-clear Whisper recognition
        try:
            import numpy as np
            arr = np.frombuffer(audio_bytes, dtype=np.int16).astype(np.float32)
            rms = float(np.sqrt(np.mean(arr ** 2)))
            if rms > 10.0:
                # Target RMS ~ 3200 (approx -20 dBFS in 16-bit PCM)
                gain = min(12.0, max(0.6, 3200.0 / rms))
                arr_norm = np.clip(arr * gain, -32767.0, 32767.0).astype(np.int16)
                audio_bytes = arr_norm.tobytes()
        except Exception:
            pass

        wav_bytes = self._pcm_to_wav(audio_bytes, sample_rate)

        # Contextual prompt biasing for wellness vocabulary and bilingual Hindi/English recognition
        initial_prompt = (
            "Aura AI conversational assistant. Topics: mental health, daily reflection, wellness, feelings, "
            "stress, calm, breathing, focus. Supports Hindi and English. नमस्ते, तनाव, खुश, उदास, डॉक्टर, ध्यान।"
        )
        target_lang = None if language in ("auto", "", None) else ("hi" if language.startswith("hi") else "en")

        try:
            model = await self._get_model()
            loop = asyncio.get_event_loop()
            segments, info = await loop.run_in_executor(
                None,
                lambda: model.transcribe(
                    io.BytesIO(wav_bytes),
                    language=target_lang,
                    initial_prompt=initial_prompt,
                    beam_size=1,
                    best_of=1,
                    temperature=0.0,
                    condition_on_previous_text=False,
                    vad_filter=False,
                    no_speech_threshold=0.85,
                    log_prob_threshold=-1.5,
                    repetition_penalty=1.15,
                ),
            )

            texts = []
            avg_confidence = 0.0
            count = 0
            # faster-whisper returns a lazy generator: consuming it performs
            # inference too, so keep that work off the websocket event loop.
            materialized_segments = await asyncio.to_thread(list, segments)
            for seg in materialized_segments:
                text = seg.text.strip()
                if text:
                    texts.append(text)
                    avg_confidence += min(1.0, max(0.0, (seg.avg_logprob + 1.0)))
                    count += 1

            full_text = " ".join(texts).strip()
            confidence = (avg_confidence / count) if count > 0 else 0.85
            detected_lang = info.language if info else language
        except Exception as exc:
            logger.warning("faster-whisper inference failed, trying transformers fallback", error=str(exc))
            try:
                # Transformers pipeline fallback
                import numpy as np
                import torch
                from transformers import pipeline

                raw_int16 = np.frombuffer(audio_bytes, dtype=np.int16)
                audio_float = (raw_int16.astype(np.float32) / 32768.0)
                pipe = pipeline("automatic-speech-recognition", model="openai/whisper-tiny", device="cpu")
                out = pipe({"raw": audio_float, "sampling_rate": sample_rate})
                full_text = out.get("text", "").strip()
                confidence = 0.80
                detected_lang = language
            except Exception as e2:
                logger.error("Whisper transcription failed completely", error=str(e2))
                full_text = ""
                confidence = 0.0
                detected_lang = language

        elapsed_ms = (time.monotonic() - start) * 1000

        logger.debug(
            "STT transcription complete",
            text_preview=full_text[:60],
            confidence=round(confidence, 3),
            duration_ms=round(elapsed_ms, 1),
        )

        return TranscriptResult(
            text=full_text,
            confidence=confidence,
            language=detected_lang,
            is_final=True,
            duration_ms=elapsed_ms,
        )


# ── Deepgram Stub ─────────────────────────────────────────────────────────────

class DeepgramSTTProvider(STTProvider):
    """Cloud STT via Deepgram (stub — requires DEEPGRAM_API_KEY env var)."""

    @property
    def name(self) -> str:
        return "deepgram"

    @property
    def is_configured(self) -> bool:
        import os
        return bool(os.getenv("DEEPGRAM_API_KEY"))

    async def transcribe(
        self, audio_bytes: bytes, sample_rate: int = 16_000, language: str = "en"
    ) -> TranscriptResult:
        raise NotImplementedError(
            "Deepgram STT provider is a stub. Implement using the deepgram-sdk package."
        )


# ── Engine (DI wrapper) ───────────────────────────────────────────────────────

class STTEngine:
    """Stateful STT engine that accumulates frames and calls the provider.

    Args:
        provider: Any STTProvider implementation.
        language: Default transcription language.
    """

    def __init__(self, provider: STTProvider, language: str = "en") -> None:
        self._provider = provider
        self._language = language
        self._buffer = bytearray()

    def set_language(self, language: str) -> None:
        """Dynamically update language (e.g. 'hi' or 'en')."""
        self._language = language
        logger.info("STTEngine language updated", language=language)

    @property
    def language(self) -> str:
        return self._language

    @classmethod
    def from_settings(cls) -> "STTEngine":
        """Construct an STTEngine from application settings."""
        settings = get_settings()
        provider = WhisperSTTProvider(
            model_size=settings.stt_model_size,
            compute_type=settings.stt_compute_type,
        )
        return cls(provider=provider, language=settings.stt_language)

    def accumulate(self, frame: bytes) -> None:
        """Add a PCM frame to the internal buffer."""
        self._buffer.extend(frame)

    def clear_buffer(self) -> None:
        """Discard buffered audio (e.g. after interruption)."""
        self._buffer.clear()

    async def transcribe_buffer(
        self,
        on_partial: PartialCallback | None = None,
    ) -> TranscriptResult:
        """Transcribe all buffered audio and clear the buffer.

        Args:
            on_partial: Optional async callback(text, confidence) invoked
                        once with an interim result (if supported by provider).

        Returns:
            Final TranscriptResult.
        """
        audio = bytes(self._buffer)
        self.clear_buffer()

        if not audio:
            return TranscriptResult(
                text="", confidence=0.0, language=self._language,
                is_final=True, duration_ms=0.0,
            )

        result = await self._provider.transcribe(
            audio_bytes=audio,
            sample_rate=16_000,
            language=self._language,
        )

        if on_partial and result.text:
            await on_partial(result.text, result.confidence)

        return result

    @property
    def buffer_bytes(self) -> int:
        """Number of bytes currently in the audio buffer."""
        return len(self._buffer)

    @property
    def provider_name(self) -> str:
        return self._provider.name
