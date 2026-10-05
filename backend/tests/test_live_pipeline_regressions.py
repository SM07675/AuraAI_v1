import asyncio
from unittest.mock import AsyncMock

import pytest

from app.services.emotion.emotion_fusion import EmotionFusionService
from app.emotion.service import EmotionService
from app.communication.conversation_manager import VoiceConversationManager


def test_zero_confidence_is_not_invented():
    result = EmotionFusionService().fuse(face_res={"emotion": "sad", "confidence": 0})
    assert result["active_modalities"] == []
    assert result["uncertainty"] == 1


def test_percent_scores_are_normalized():
    result = EmotionFusionService().fuse(text_res={"emotion": "sad", "confidence": 90,
                                                "scores": {"sad": 90, "happy": 10}})
    assert sum(result["scores"].values()) == pytest.approx(1)
    assert 0 <= result["confidence"] <= 1


def test_explicit_report_survives_unavailable_models():
    result = EmotionFusionService().fuse(user_message="I feel sad")
    assert result["primary_emotion"] == "sad"
    assert result["confidence"] == .95


@pytest.mark.parametrize("message", ["I am not sad", 'She said "I am sad"'])
def test_negation_and_quotes_do_not_override(message):
    result = EmotionFusionService().fuse(user_message=message)
    assert result["active_modalities"] == []


@pytest.mark.asyncio
async def test_precomputed_face_and_voice_reach_fusion():
    context = await EmotionService().analyze_and_fuse(
        face_result={"emotion": "sad", "confidence": .8, "face_detected": True},
        voice_result={"emotion": "sad", "confidence": .8},
    )
    assert set(context.activeSources) == {"face", "voice"}
    assert context.primaryEmotion == "sad"


@pytest.mark.asyncio
async def test_turn_does_not_cancel_itself():
    manager = object.__new__(VoiceConversationManager)
    manager._active_turn_task = asyncio.current_task()
    manager._tts = AsyncMock()
    await manager.cancel_active_turn()
    assert not asyncio.current_task().cancelling()
    manager._tts.stop.assert_awaited_once()


@pytest.mark.asyncio
async def test_speech_restarts_after_stop_and_rejects_old_generation():
    from app.communication.text_to_speech import TTSEngine

    class Provider:
        async def stream_audio(self, text, voice):
            yield text.encode()

    engine = TTSEngine(provider=Provider(), voice="test", session_id="restart")
    received = []

    async def output(data, sequence, turn_id, generation_id):
        received.append((data, generation_id))

    engine.on_audio_chunk(output)
    await engine.stop()
    await engine.speak("First reply", turn_id=1, generation_id=1)
    await asyncio.wait_for(engine.drain(), 1)
    await engine.stop()
    await engine.speak("Stale reply", turn_id=1, generation_id=1)
    await engine.speak("Next reply", turn_id=2, generation_id=2)
    await asyncio.wait_for(engine.drain(), 1)
    assert received == [(b"First reply", 1), (b"Next reply", 2)]
    await engine.stop()


@pytest.mark.asyncio
async def test_drain_waits_for_provider_and_preserves_phrase_order():
    from app.communication.text_to_speech import TTSEngine

    gate = asyncio.Event()

    class Provider:
        async def stream_audio(self, text, voice):
            await gate.wait()
            yield text.encode()

    engine = TTSEngine(provider=Provider(), voice="test", session_id="drain")
    received = []

    async def output(data, sequence):
        received.append(data)

    engine.on_audio_chunk(output)
    await engine.speak("One", 1, 1)
    await engine.speak("Two", 1, 1)
    drain = asyncio.create_task(engine.drain())
    await asyncio.sleep(.01)
    assert not drain.done()
    gate.set()
    await asyncio.wait_for(drain, 1)
    assert received == [b"One", b"Two"]
    await engine.stop()


def test_existing_microphone_signal_cannot_interrupt_new_reply():
    from app.communication.voice_activity import VADResult, VADEvent
    from app.communication.websocket_manager import VoiceWebSocketManager
    existing = VADResult(event=VADEvent.SPEAKING, is_speech=True, timestamp_ms=1000,
                         rms=800, snr_db=30)
    onset = VADResult(event=VADEvent.SPEECH_STARTED, is_speech=True, timestamp_ms=1000,
                      rms=800, snr_db=30)
    assert not VoiceWebSocketManager._should_barge_in(existing, False)
    assert not VoiceWebSocketManager._should_barge_in(onset, True)
    assert VoiceWebSocketManager._should_barge_in(onset, False)
