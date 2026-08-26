"""
Text-to-Speech Engine.

Converts AI response text into streaming MP3 audio using edge-tts,
then sends the audio chunks over the WebSocket to the client.

Architecture
------------
TTSProvider (ABC)
  └─ EdgeTTSProvider   — Microsoft Edge TTS (default, already in requirements.txt)
  └─ ElevenLabsProvider — cloud TTS stub (high-quality, drop-in)

TTSEngine wraps a provider and:
  - Splits text into sentences for lower first-audio latency
  - Tracks the active TTS task so it can be cancelled immediately on barge-in
  - Emits async events: speaking_started, audio_chunk, speaking_done, interrupted

Audio format
------------
edge-tts outputs 24kHz MP3 (audio/mpeg). The browser decodes this natively via
the Web Audio API (AudioContext.decodeAudioData).
"""

from __future__ import annotations

import asyncio
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import AsyncIterator, Callable, Awaitable

from app.core.config import get_settings
from app.core.logging_config import get_logger

logger = get_logger(__name__)

# Events emitted by TTSEngine
AudioChunkCallback = Callable[[bytes, int], Awaitable[None]]  # (chunk, sequence)
TTSEventCallback = Callable[[str], Awaitable[None]]           # event_name


# ── Data ──────────────────────────────────────────────────────────────────────

@dataclass
class TTSChunk:
    """A single MP3 chunk from the TTS stream."""
    data: bytes
    sequence: int
    is_final: bool = False


# ── Abstract Base ─────────────────────────────────────────────────────────────

class TTSProvider(ABC):
    """Abstract TTS provider interface."""

    @property
    @abstractmethod
    def name(self) -> str: ...

    @property
    @abstractmethod
    def is_configured(self) -> bool: ...

    @abstractmethod
    async def stream_audio(
        self, text: str, voice: str
    ) -> AsyncIterator[bytes]:
        """Yield MP3 audio chunks for the given text."""
        ...


# ── Edge TTS Provider ─────────────────────────────────────────────────────────

class EdgeTTSProvider(TTSProvider):
    """Microsoft Edge Text-to-Speech via edge-tts package.

    Produces 24kHz MP3 audio. No API key required — uses the public
    Microsoft Edge read-aloud service.
    """

    @property
    def name(self) -> str:
        return "edge_tts"

    @property
    def is_configured(self) -> bool:
        try:
            import edge_tts  # noqa: F401
            return True
        except ImportError:
            return False

    async def stream_audio(
        self, text: str, voice: str = "en-US-AriaNeural"
    ) -> AsyncIterator[bytes]:
        """Stream MP3 chunks from edge-tts."""
        import edge_tts
        from app.api.v1.tts import clean_text_for_speech, resolve_edgetts_voice

        cleaned = clean_text_for_speech(text)
        if not cleaned:
            return

        resolved_voice = resolve_edgetts_voice(voice, cleaned)
        communicate = edge_tts.Communicate(cleaned, resolved_voice)
        async for chunk in communicate.stream():
            if chunk["type"] == "audio" and chunk.get("data"):
                yield chunk["data"]


# ── ElevenLabs Provider ───────────────────────────────────────────────────────

class ElevenLabsProvider(TTSProvider):
    """ElevenLabs streaming TTS with automatic EdgeTTS fallback."""

    @property
    def name(self) -> str:
        return "elevenlabs"

    @property
    def is_configured(self) -> bool:
        settings = get_settings()
        return bool(settings.elevenlabs_api_key)

    async def stream_audio(self, text: str, voice: str) -> AsyncIterator[bytes]:
        import httpx
        from app.api.v1.tts import clean_text_for_speech, resolve_edgetts_voice

        cleaned = clean_text_for_speech(text)
        if not cleaned:
            return

        settings = get_settings()
        api_key = settings.elevenlabs_api_key
        if not api_key:
            # Fallback to EdgeTTS with dynamically resolved voice (handles Hindi automatically)
            edge = EdgeTTSProvider()
            resolved = resolve_edgetts_voice(voice, cleaned)
            async for chunk in edge.stream_audio(cleaned, resolved):
                yield chunk
            return

        voice_id = voice if voice and len(voice) > 15 else (settings.elevenlabs_voice_id or "Xb7hH8MSUJpSbSDYk0k2")
        model_id = settings.elevenlabs_model_id or "eleven_multilingual_v2"
        url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream?optimize_streaming_latency=3"

        headers = {
            "xi-api-key": api_key,
            "Content-Type": "application/json",
            "Accept": "audio/mpeg",
        }
        payload = {
            "text": cleaned,
            "model_id": model_id,
            "voice_settings": {
                "stability": 0.5,
                "similarity_boost": 0.75,
            },
        }

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                async with client.stream("POST", url, json=payload, headers=headers) as resp:
                    if resp.status_code == 200:
                        async for chunk in resp.aiter_bytes(chunk_size=4096):
                            if chunk:
                                yield chunk
                        return
                    else:
                        logger.warning(
                            "ElevenLabs streaming failed, falling back to EdgeTTS",
                            status=resp.status_code,
                        )
        except Exception as e:
            logger.warning("ElevenLabs request error, falling back to EdgeTTS", error=str(e))

        # Fallback to EdgeTTS with dynamically resolved voice
        edge = EdgeTTSProvider()
        resolved = resolve_edgetts_voice(voice, cleaned)
        async for chunk in edge.stream_audio(cleaned, resolved):
            yield chunk


# ── NVIDIA Magpie Provider ────────────────────────────────────────────────────

class NvidiaTTSProvider(TTSProvider):
    """NVIDIA Magpie Multilingual TTS via NIM gRPC."""

    @property
    def name(self) -> str:
        return "nvidia_magpie"

    @property
    def is_configured(self) -> bool:
        settings = get_settings()
        return bool(settings.nvidia_nim_api_key)

    async def stream_audio(self, text: str, voice: str) -> AsyncIterator[bytes]:
        import io
        import wave
        import riva.client
        from riva.client.proto.riva_audio_pb2 import AudioEncoding

        settings = get_settings()
        uri = settings.nvidia_tts_uri
        
        metadata = []
        if settings.nvidia_tts_function_id:
            metadata.append(["function-id", settings.nvidia_tts_function_id])
        if settings.nvidia_nim_api_key:
            metadata.append(["authorization", f"Bearer {settings.nvidia_nim_api_key}"])
            
        auth = riva.client.Auth(
            uri=uri,
            use_ssl=True if "443" in uri else False,
            metadata_args=metadata if metadata else None
        )
        service = riva.client.SpeechSynthesisService(auth)
        sample_rate = 24000
        
        loop = asyncio.get_running_loop()
        
        def _synthesize_sentence():
            # Use offline synthesize for the sentence to avoid sync generator blocking issues
            # We add a WAV header to the PCM data for the browser
            resp = service.synthesize(
                text=text,
                voice=voice,
                language_code="en-US",
                sample_rate_hz=sample_rate,
                encoding=AudioEncoding.LINEAR_PCM
            )
            if resp.audio:
                wav_io = io.BytesIO()
                with wave.open(wav_io, 'wb') as wav:
                    wav.setnchannels(1)
                    wav.setsampwidth(2)
                    wav.setframerate(sample_rate)
                    wav.writeframesraw(resp.audio)
                return wav_io.getvalue()
            return b""
            
        audio_chunk = await loop.run_in_executor(None, _synthesize_sentence)
        if audio_chunk:
            yield audio_chunk


# ── Engine ────────────────────────────────────────────────────────────────────

class TTSEngine:
    """Manages TTS streaming for a voice session.

    Args:
        provider: Any TTSProvider implementation.
        voice: TTS voice identifier (provider-specific).
        session_id: Session identifier for logging.

    Usage::

        engine = TTSEngine.from_settings(session_id="abc")
        engine.on_audio_chunk(my_audio_callback)

        await engine.speak("Hello! How can I help you today?")
        # To interrupt immediately:
        await engine.stop()
    """

    def __init__(
        self,
        provider: TTSProvider,
        voice: str,
        session_id: str,
    ) -> None:
        self._provider = provider
        self._voice = voice
        self._session_id = session_id

        self._active_task: asyncio.Task | None = None
        self._interrupt_event = asyncio.Event()

        self._on_audio_chunk: AudioChunkCallback | None = None
        self._on_event: TTSEventCallback | None = None

        self._is_speaking = False
        self._sequence = 0
        self._chunks_sent = 0

    @classmethod
    def from_settings(cls, session_id: str) -> "TTSEngine":
        """Construct TTSEngine from application settings."""
        settings = get_settings()
        
        if settings.tts_provider in ("nvidia_magpie", "nvidia_tts"):
            provider = NvidiaTTSProvider()
            voice = settings.tts_voice if settings.tts_voice != "en-US-AriaNeural" else "English-US.Female-1"
        elif settings.tts_provider == "elevenlabs":
            provider = ElevenLabsProvider()
            voice = settings.tts_voice
        else:
            provider = EdgeTTSProvider()
            voice = settings.tts_voice
            
        return cls(
            provider=provider,
            voice=voice,
            session_id=session_id,
        )

    # ── Callbacks ─────────────────────────────────────────────────

    def on_audio_chunk(self, callback: AudioChunkCallback) -> None:
        """Register callback invoked for every MP3 chunk produced."""
        self._on_audio_chunk = callback

    def on_event(self, callback: TTSEventCallback) -> None:
        """Register callback invoked for speaking_started / speaking_done / interrupted."""
        self._on_event = callback

    # ── Public API ────────────────────────────────────────────────

    async def speak(self, text: str) -> None:
        """Convert text to audio and stream it.

        Cancels any in-progress speech before starting new speech.
        Returns when audio stream is complete or interrupted.

        Args:
            text: Text to synthesise. May be a sentence or a paragraph;
                  shorter inputs produce lower first-audio latency.
        """
        if not text.strip():
            return

        # Cancel any previous speech
        await self.stop()

        self._interrupt_event.clear()
        self._is_speaking = True
        self._sequence += 1
        run_seq = self._sequence

        logger.debug(
            "TTS speak start",
            session_id=self._session_id,
            text_preview=text[:80],
            voice=self._voice,
        )

        if self._on_event:
            await self._on_event("speaking_started")

        self._active_task = asyncio.create_task(
            self._stream_loop(text, run_seq),
            name=f"tts-{self._session_id}-{run_seq}",
        )

        try:
            await self._active_task
        except asyncio.CancelledError:
            pass
        finally:
            self._is_speaking = False
            self._active_task = None

    async def _stream_loop(self, text: str, run_seq: int) -> None:
        """Internal streaming loop — runs inside a Task so it can be cancelled."""
        chunk_idx = 0
        try:
            async for audio_bytes in self._provider.stream_audio(text, self._voice):
                # Check for barge-in between chunks
                if self._interrupt_event.is_set():
                    logger.info(
                        "TTS stream interrupted",
                        session_id=self._session_id,
                        chunks_sent=chunk_idx,
                    )
                    if self._on_event:
                        await self._on_event("interrupted")
                    return

                if self._on_audio_chunk and audio_bytes:
                    await self._on_audio_chunk(audio_bytes, chunk_idx)
                    chunk_idx += 1
                    self._chunks_sent += 1

        except asyncio.CancelledError:
            logger.debug("TTS task cancelled", session_id=self._session_id)
            if self._on_event:
                await self._on_event("interrupted")
            raise
        except Exception as exc:
            logger.error(
                "TTS provider error",
                session_id=self._session_id,
                error=str(exc),
            )
            if self._on_event:
                await self._on_event("tts_error")
            return

        logger.debug(
            "TTS speak done",
            session_id=self._session_id,
            chunks_sent=chunk_idx,
        )
        if self._on_event:
            await self._on_event("speaking_done")

    async def stop(self) -> None:
        """Immediately stop any in-progress TTS stream."""
        self._interrupt_event.set()
        if self._active_task and not self._active_task.done():
            self._active_task.cancel()
            try:
                await asyncio.wait_for(
                    asyncio.shield(self._active_task), timeout=0.5
                )
            except (asyncio.CancelledError, asyncio.TimeoutError):
                pass
        self._is_speaking = False

    # ── Properties ────────────────────────────────────────────────

    @property
    def is_speaking(self) -> bool:
        return self._is_speaking

    @property
    def provider_name(self) -> str:
        return self._provider.name

    @property
    def stats(self) -> dict:
        return {
            "is_speaking": self._is_speaking,
            "chunks_sent": self._chunks_sent,
            "sequence": self._sequence,
        }
