import asyncio
import pytest
from typing import AsyncIterator
from app.ai.base import StreamChunk
from app.communication.streaming import ResponseStreamer

async def _mock_token_stream(tokens: list[str]) -> AsyncIterator[StreamChunk]:
    for token in tokens:
        yield StreamChunk(content=token, provider="mock")
        await asyncio.sleep(0.01)

@pytest.mark.asyncio
async def test_response_streamer_sentence_boundaries():
    text_received = []
    audio_received = []
    
    async def on_text(text: str):
        text_received.append(text)
        
    async def on_speak(text: str):
        audio_received.append(text)
        
    streamer = ResponseStreamer(
        session_id="test",
        on_text=on_text,
        on_speak=on_speak,
        sentence_buffer_chars=100
    )
    
    # "Hello." should flush immediately because of the period.
    # " This is a test" won't flush until the end of the stream.
    tokens = ["Hello", ".", " This ", "is ", "a ", "test"]
    interrupt_event = asyncio.Event()
    
    full, interrupted = await streamer.stream(_mock_token_stream(tokens), interrupt_event)
    
    # Small wait to allow async tts task to fire
    await asyncio.sleep(0.05)
    
    assert full == "Hello. This is a test"
    assert not interrupted
    
    # Text callback should be called for every token
    assert text_received == tokens
    
    # Audio callback should be called twice (once for sentence, once at end)
    assert len(audio_received) == 2
    assert audio_received[0] == "Hello."
    assert audio_received[1] == "This is a test"

@pytest.mark.asyncio
async def test_response_streamer_interruption():
    text_received = []
    audio_received = []
    
    async def on_text(text: str):
        text_received.append(text)
        
    async def on_speak(text: str):
        audio_received.append(text)
        
    streamer = ResponseStreamer(
        session_id="test",
        on_text=on_text,
        on_speak=on_speak
    )
    
    interrupt_event = asyncio.Event()
    
    async def _interrupted_stream():
        yield StreamChunk(content="One", provider="mock")
        yield StreamChunk(content=" Two", provider="mock")
        # Trigger interrupt mid-stream
        interrupt_event.set()
        yield StreamChunk(content=" Three", provider="mock")
    
    full, interrupted = await streamer.stream(_interrupted_stream(), interrupt_event)
    
    await asyncio.sleep(0.05)
    
    assert interrupted is True
    # The interrupt was set before " Three" was processed, so we expect "One Two"
    assert full == "One Two"
    assert text_received == ["One", " Two"]
