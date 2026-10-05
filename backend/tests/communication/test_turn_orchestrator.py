import pytest
import asyncio
from app.communication.state_machine import CommunicationState, StateMachine
from app.communication.interrupt_manager import InterruptManager
from app.communication.text_to_speech import TTSEngine, EdgeTTSProvider
from app.communication.conversation_manager import VoiceConversationManager
from app.communication.speech_to_text import TranscriptResult

class MockTTS:
    def __init__(self):
        self.stopped = False
        self.spoken = []

    async def speak(self, text: str, turn_id: int = 0, generation_id: int = 0):
        self.spoken.append((text, turn_id, generation_id))

    async def stop(self):
        self.stopped = True

@pytest.mark.asyncio
async def test_authoritative_state_metadata():
    sm = StateMachine("test-session")
    assert sm.state == CommunicationState.IDLE
    assert sm.turn_id == 1
    assert sm.active_generation_id == 0
    assert sm.user_audio_state == "silent"
    assert sm.assistant_audio_state == "silent"

    # LISTENING
    await sm.transition(CommunicationState.LISTENING)
    assert sm.state == CommunicationState.LISTENING

    # USER_SPEAKING
    await sm.transition(CommunicationState.USER_SPEAKING)
    assert sm.state == CommunicationState.USER_SPEAKING
    assert sm.user_audio_state == "speaking"

    # THINKING
    await sm.transition(CommunicationState.THINKING)
    assert sm.state == CommunicationState.THINKING
    assert sm.assistant_audio_state == "buffering"

    # SPEAKING
    await sm.transition(CommunicationState.SPEAKING)
    assert sm.state == CommunicationState.SPEAKING
    assert sm.assistant_audio_state == "speaking"

    # Snapshot check
    snap = sm.snapshot()
    assert snap["session_id"] == "test-session"
    assert snap["state"] == "SPEAKING"
    assert snap["user_audio_state"] == "silent"
    assert snap["assistant_audio_state"] == "speaking"

@pytest.mark.asyncio
async def test_barge_in_strictly_during_speaking():
    sm = StateMachine("test-barge")
    im = InterruptManager("test-barge", sm)
    mock_tts = MockTTS()
    im.set_tts_engine(mock_tts)

    # 1. During LISTENING -> Interruption must be ignored
    await sm.transition(CommunicationState.LISTENING)
    res = await im.trigger_interrupt()
    assert res is False
    assert sm.state == CommunicationState.LISTENING

    # 2. During USER_SPEAKING -> Interruption must be ignored
    await sm.transition(CommunicationState.USER_SPEAKING)
    res = await im.trigger_interrupt()
    assert res is False
    assert sm.state == CommunicationState.USER_SPEAKING

    # 3. During THINKING -> Interruption must be ignored
    await sm.transition(CommunicationState.THINKING)
    res = await im.trigger_interrupt()
    assert res is False
    assert sm.state == CommunicationState.THINKING

    # 4. During SPEAKING -> Interruption must succeed
    await sm.transition(CommunicationState.SPEAKING)
    assert sm.is_interruptible() is True
    res = await im.trigger_interrupt()
    assert res is True
    assert sm.state == CommunicationState.INTERRUPTED
    assert sm.interrupted_turn_id == 1
    assert mock_tts.stopped is True
    assert im.get_ai_interrupt_event().is_set()

@pytest.mark.asyncio
async def test_turn_invalidation_and_cancellation():
    sm = StateMachine("test-turn")
    im = InterruptManager("test-turn", sm)
    mock_tts = MockTTS()
    im.set_tts_engine(mock_tts)

    await sm.transition(CommunicationState.LISTENING)
    await sm.transition(CommunicationState.THINKING)
    await sm.transition(CommunicationState.SPEAKING)

    initial_gen = sm.active_generation_id
    initial_turn = sm.turn_id

    # Interrupt
    await im.trigger_interrupt()
    assert sm.interrupted_turn_id == initial_turn
    assert sm.active_generation_id > initial_gen

    # Next turn
    new_turn = sm.next_turn()
    assert new_turn == initial_turn + 1
    sm.clear_interrupted()
    assert sm.interrupted_turn_id is None

@pytest.mark.asyncio
async def test_fast_path_voice_commands():
    assert "stop" in VoiceConversationManager.FAST_COMMANDS
    assert "next question" in VoiceConversationManager.FAST_COMMANDS
    assert "wait" in VoiceConversationManager.FAST_COMMANDS
    assert "yes" in VoiceConversationManager.FAST_COMMANDS
    assert "no" in VoiceConversationManager.FAST_COMMANDS
