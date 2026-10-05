"""
Response Streamer.

Bridges the AI token stream to two simultaneous consumers:
  1. WebSocket partial_response events (text)
  2. TTSEngine.speak() calls (audio)

The key challenge is that TTS works best with complete sentences, but we
want to minimise first-audio latency. The ResponseStreamer solves this by:

  - Collecting tokens into a sentence buffer.
  - Flushing the buffer to TTS as soon as it detects a sentence boundary
    (period, question mark, exclamation mark, newline) OR the buffer
    exceeds a character threshold.
  - Sending every token to the WebSocket immediately (no buffering for text).

This produces sub-500ms first audio latency while still feeding TTS
natural complete phrases rather than single words.
"""

from __future__ import annotations

import asyncio
import re
from typing import AsyncIterator, Callable, Awaitable

from app.core.logging_config import get_logger

logger = get_logger(__name__)

# Sentence boundary pattern: end-of-sentence punctuation followed by whitespace
# or end-of-string. Handles: "Hello." / "Ready?" / "Go!\n" / "Wait..."
_SENTENCE_END = re.compile(r"[.!?…।|]\s+|[.!?…।|]$|\n")
_CLAUSE_END = re.compile(r"[,;:\-—]\s+|[.!?…।|]\s+|[.!?…।|]$|\n")

TextCallback = Callable[[str], Awaitable[None]]   # called per token
AudioSpeakCallback = Callable[[str], Awaitable[None]]  # called per sentence chunk


class ResponseStreamer:
    """Streams AI response tokens to text (WebSocket) and TTS simultaneously with ultra-low first-audio latency.

    Args:
        session_id: Logging context.
        on_text: Async callback invoked immediately for each text token.
        on_speak: Async callback invoked for each sentence-sized TTS chunk.
        sentence_buffer_chars: Max chars to buffer before forcing a TTS flush.
    """

    def __init__(
        self,
        session_id: str,
        on_text: TextCallback,
        on_speak: AudioSpeakCallback,
        sentence_buffer_chars: int = 100,
    ) -> None:
        self._session_id = session_id
        self._on_text = on_text
        self._on_speak = on_speak
        self._sentence_buffer_chars = sentence_buffer_chars
        self._sentence_buffer: list[str] = []
        self._is_first_chunk = True

    async def stream(
        self,
        token_stream: AsyncIterator,
        interrupt_event: asyncio.Event,
    ) -> tuple[str, bool]:
        """Consume an AI token stream and drive text + audio output.

        Args:
            token_stream: Async iterator yielding StreamChunk objects from AIGateway.
            interrupt_event: asyncio.Event set by InterruptManager on barge-in.

        Returns:
            Tuple of (full_response_text, was_interrupted).
        """
        full_response = ""
        was_interrupted = False

        try:
            async for chunk in self._bounded_tokens(token_stream):
                # Check for barge-in between tokens
                if interrupt_event.is_set():
                    was_interrupted = True
                    logger.info(
                        "AI stream interrupted",
                        session_id=self._session_id,
                        chars_generated=len(full_response),
                    )
                    break

                token = chunk.content
                if not token:
                    continue

                full_response += token

                # Send text token to WebSocket immediately
                await self._on_text(token)

                # Accumulate in sentence buffer
                self._sentence_buffer.append(token)

                buffered_text = "".join(self._sentence_buffer)

                # Preserve sentence/clause prosody and never split a word across
                # separate synthesis requests, including multi-token words.
                boundary = _SENTENCE_END.search(buffered_text)
                if not boundary and self._is_first_chunk and len(buffered_text) >= 24:
                    boundary = _CLAUSE_END.search(buffered_text)
                split_at = boundary.end() if boundary else 0
                limit = max(60, self._sentence_buffer_chars)
                if not split_at and len(buffered_text) >= limit:
                    spaces = list(re.finditer(r"\s+", buffered_text[:limit + 1]))
                    if spaces and spaces[-1].start() >= 20:
                        split_at = spaces[-1].end()
                if split_at:
                    self._is_first_chunk = False
                    await self._flush_tts(buffered_text[:split_at])
                    self._sentence_buffer = [buffered_text[split_at:]]

        except asyncio.CancelledError:
            was_interrupted = True
            logger.debug("ResponseStreamer cancelled", session_id=self._session_id)

        # Flush any remaining buffered text
        remaining = "".join(self._sentence_buffer)
        if remaining.strip() and not was_interrupted:
            await self._flush_tts(remaining)

        return full_response, was_interrupted

    async def _bounded_tokens(self, token_stream):
        """Do not leave a live conversation waiting indefinitely for a provider."""
        iterator = token_stream.__aiter__()
        try:
            while True:
                try:
                    chunk = await asyncio.wait_for(anext(iterator), timeout=12.0)
                except StopAsyncIteration:
                    return
                yield chunk
        finally:
            close = getattr(iterator, "aclose", None)
            if close:
                await close()

    async def _flush_tts(self, text: str) -> None:
        """Send buffered text to TTS and clear the buffer."""
        text = text.strip()
        if not re.search(r"[^\W_]", text, re.UNICODE):
            self._sentence_buffer.clear()
            return
        if text:
            logger.debug(
                "Flushing TTS chunk",
                session_id=self._session_id,
                chars=len(text),
                preview=text[:60],
            )
            self._sentence_buffer.clear()
            try:
                await self._on_speak(text)
            except Exception as exc:
                logger.warning(
                    "TTS flush error",
                    session_id=self._session_id,
                    error=str(exc),
                )
        else:
            self._sentence_buffer.clear()
