import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.communication.websocket_manager import VoiceWebSocketManager
from app.communication.speech_to_text import TranscriptResult
from app.communication.state_machine import CommunicationState


def session_stub(client=True):
    return SimpleNamespace(
        client_transcription=client, transcript_revision=0, session_id="speech-test",
        stt=SimpleNamespace(language="en", _provider=SimpleNamespace(transcribe=AsyncMock(
            return_value=TranscriptResult("Hello Aura", .9, "en", True, 1000)))),
        metrics=SimpleNamespace(end_stt=lambda: None),
        state_machine=SimpleNamespace(state=CommunicationState.THINKING, transition=AsyncMock()),
        conversation=SimpleNamespace(cancel_active_turn=AsyncMock(), process_transcript=AsyncMock(),
                                     _active_turn_task=None),
    )


@pytest.mark.asyncio
async def test_browser_support_without_final_result_falls_back_to_whisper(monkeypatch):
    manager = VoiceWebSocketManager()
    manager._send = AsyncMock()
    session = session_stub()
    monkeypatch.setattr("app.communication.websocket_manager._analyze_voice_emotion", AsyncMock(return_value={}))
    await asyncio.wait_for(manager._transcribe_utterance(None, session, b"pcm", 0), 2)
    await session.conversation._active_turn_task
    session.stt._provider.transcribe.assert_awaited_once_with(audio_bytes=b"pcm", sample_rate=16000, language="en")
    session.conversation.process_transcript.assert_awaited_once()
    assert session.conversation.process_transcript.call_args.args[0].text == "Hello Aura"


@pytest.mark.asyncio
async def test_browser_final_arriving_during_grace_prevents_duplicate_turn():
    manager = VoiceWebSocketManager()
    session = session_stub()
    fallback = asyncio.create_task(manager._transcribe_utterance(None, session, b"pcm", 0))
    await asyncio.sleep(.02)
    session.transcript_revision += 1
    await fallback
    session.stt._provider.transcribe.assert_not_awaited()
    session.conversation.process_transcript.assert_not_awaited()


@pytest.mark.asyncio
async def test_transcription_error_is_visible_and_returns_to_listening(monkeypatch):
    manager = VoiceWebSocketManager()
    manager._send = AsyncMock()
    session = session_stub(False)
    session.stt._provider.transcribe.side_effect = RuntimeError("STT unavailable")
    monkeypatch.setattr("app.communication.websocket_manager._analyze_voice_emotion", AsyncMock(return_value={}))
    await manager._transcribe_utterance(None, session, b"pcm", 0)
    assert manager._send.call_args.args[1]["code"] == "STT_UNAVAILABLE"
    session.state_machine.transition.assert_awaited_with(CommunicationState.LISTENING)


@pytest.mark.asyncio
async def test_speaker_playback_cannot_become_a_client_transcript_turn():
    manager = VoiceWebSocketManager()
    session = session_stub(False)
    session.state_machine.state = CommunicationState.SPEAKING
    await manager._dispatch(None, {"text": "Apni awaaz sunni chahiye"}, "client_transcript", session, None)
    session.conversation.cancel_active_turn.assert_not_awaited()
    session.conversation.process_transcript.assert_not_awaited()
    session.state_machine.state = CommunicationState.LISTENING
    await manager._dispatch(None, {"active": True}, "playback_state", session, None)
    assert manager._is_input_blocked(session)
    await manager._dispatch(None, {"active": False}, "playback_state", session, None)
    assert manager._is_input_blocked(session), "Echo tail must remain protected after audible playback"
    await manager._dispatch(None, {"active": False, "user_interruption": True}, "playback_state", session, None)
    assert not manager._is_input_blocked(session), "A confirmed user interruption must reopen capture immediately"


@pytest.mark.asyncio
async def test_speaker_pcm_is_replaced_with_silence_for_server_vad():
    import base64
    manager = VoiceWebSocketManager()
    session = session_stub(False)
    session.speaker_playback_active = True
    session.audio_handler = SimpleNamespace(feed=AsyncMock())
    await manager._dispatch(None, {"data": base64.b64encode(b"speaker pcm").decode()}, "audio_chunk", session, None)
    session.audio_handler.feed.assert_awaited_once_with(bytes(len(b"speaker pcm")))


@pytest.mark.asyncio
async def test_client_final_reaches_conversation_without_local_import_error(monkeypatch):
    manager = VoiceWebSocketManager()
    session = session_stub(False)
    session.transcription_task = None
    session.stt._buffer = bytearray()
    session.stt.clear_buffer = lambda: session.stt._buffer.clear()
    session.stt.set_language = lambda value: None
    await manager._dispatch(None, {"text": "Hello Aura", "language": "en"},
                            "client_transcript", session, None)
    await session.conversation._active_turn_task
    session.conversation.process_transcript.assert_awaited_once()
    assert session.conversation.process_transcript.call_args.args[0].text == "Hello Aura"


@pytest.mark.asyncio
async def test_failed_background_turn_does_not_stay_silent():
    manager = VoiceWebSocketManager()
    manager._send = AsyncMock()
    session = session_stub(False)
    session.conversation.process_transcript.side_effect = RuntimeError("failed turn")
    await manager._run_conversation_turn(None, session, None)
    assert manager._send.call_args.args[1]["code"] == "VOICE_TURN_FAILED"
    session.state_machine.transition.assert_awaited_with(CommunicationState.LISTENING)
