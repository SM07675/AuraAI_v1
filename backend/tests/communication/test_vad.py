import pytest
import struct
from app.communication.voice_activity import VoiceActivityDetector, VADEvent

def _create_silent_frame(duration_ms=30, sample_rate=16000):
    samples = int(sample_rate * (duration_ms / 1000))
    # Fill with 0 (perfect silence)
    return struct.pack(f"{samples}h", *([0] * samples))

def _create_noisy_frame(duration_ms=30, sample_rate=16000):
    samples = int(sample_rate * (duration_ms / 1000))
    # Fill with large values simulating speech energy
    return struct.pack(f"{samples}h", *([8000] * samples))

@pytest.mark.asyncio
async def test_vad_speech_start_end():
    vad = VoiceActivityDetector(session_id="test", silence_threshold_ms=200, min_speech_ms=50, smoothing_frames=3)
    
    # Needs async generator
    async def frame_source():
        # Silence (3 frames)
        for _ in range(3): yield _create_silent_frame()
        # Speech (5 frames)
        for _ in range(5): yield _create_noisy_frame()
        # Silence (10 frames = 300ms > 200ms threshold)
        for _ in range(10): yield _create_silent_frame()
        
    events = []
    async for result in vad.process(frame_source()):
        if result.event:
            events.append(result.event)
            
    assert VADEvent.SPEECH_STARTED in events
    assert VADEvent.SPEECH_ENDED in events

@pytest.mark.asyncio
async def test_vad_noise_rejection():
    # Test that very short spikes are ignored due to minimum speech threshold
    vad = VoiceActivityDetector(session_id="test", silence_threshold_ms=200, min_speech_ms=200, smoothing_frames=3)
    
    async def frame_source():
        # Silence
        for _ in range(3): yield _create_silent_frame()
        # Very short speech (1 frame = 30ms < 200ms min)
        yield _create_noisy_frame()
        # Silence
        for _ in range(10): yield _create_silent_frame()
        
    events = []
    async for result in vad.process(frame_source()):
        if result.event:
            events.append(result.event)
            
    assert VADEvent.SPEECH_STARTED not in events
    assert VADEvent.SPEECH_ENDED not in events
