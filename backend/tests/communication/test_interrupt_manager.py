import asyncio
import pytest
from app.communication.state_machine import CommunicationState, StateMachine
from app.communication.interrupt_manager import InterruptManager

class MockTTSEngine:
    def __init__(self):
        self.stopped = False
    
    async def stop(self):
        self.stopped = True

@pytest.mark.asyncio
async def test_trigger_interrupt_during_speaking():
    sm = StateMachine("test")
    await sm.transition(CommunicationState.LISTENING)
    await sm.transition(CommunicationState.PROCESSING)
    await sm.transition(CommunicationState.THINKING)
    await sm.transition(CommunicationState.SPEAKING)
    
    im = InterruptManager("test", sm)
    tts = MockTTSEngine()
    im.set_tts_engine(tts)
    
    # Pre-condition
    assert sm.state == CommunicationState.SPEAKING
    assert not im.get_ai_interrupt_event().is_set()
    
    # Add some text
    im.record_token("Hello ")
    im.record_token("World")
    
    # Trigger
    result = await im.trigger_interrupt()
    
    assert result is True
    assert sm.state == CommunicationState.LISTENING
    assert im.get_ai_interrupt_event().is_set()
    assert tts.stopped is True
    
    assert im.interrupt_count == 1
    assert im.last_partial_response == "Hello World"
    assert im.records[0].tokens_generated == 2

@pytest.mark.asyncio
async def test_trigger_interrupt_ignored_when_not_speaking():
    sm = StateMachine("test")
    await sm.transition(CommunicationState.LISTENING)
    
    im = InterruptManager("test", sm)
    
    result = await im.trigger_interrupt()
    assert result is False
    assert sm.state == CommunicationState.LISTENING
    assert im.interrupt_count == 0
