import pytest
from app.communication.state_machine import CommunicationState, StateMachine

@pytest.mark.asyncio
async def test_valid_transitions():
    sm = StateMachine("test-1")
    assert sm.state == CommunicationState.IDLE

    # Happy path
    await sm.transition(CommunicationState.LISTENING)
    assert sm.state == CommunicationState.LISTENING

    await sm.transition(CommunicationState.PROCESSING)
    assert sm.state == CommunicationState.PROCESSING

    await sm.transition(CommunicationState.THINKING)
    assert sm.state == CommunicationState.THINKING

    await sm.transition(CommunicationState.SPEAKING)
    assert sm.state == CommunicationState.SPEAKING

    await sm.transition(CommunicationState.LISTENING)
    assert sm.state == CommunicationState.LISTENING

@pytest.mark.asyncio
async def test_invalid_transition():
    sm = StateMachine("test-2")
    
    # IDLE -> SPEAKING is invalid
    with pytest.raises(ValueError, match="Illegal state transition"):
        await sm.transition(CommunicationState.SPEAKING)

@pytest.mark.asyncio
async def test_barge_in_transition():
    sm = StateMachine("test-3")
    
    await sm.transition(CommunicationState.LISTENING)
    await sm.transition(CommunicationState.PROCESSING)
    await sm.transition(CommunicationState.THINKING)
    await sm.transition(CommunicationState.SPEAKING)
    
    # Barge-in
    await sm.transition(CommunicationState.INTERRUPTED)
    assert sm.state == CommunicationState.INTERRUPTED
    
    await sm.transition(CommunicationState.LISTENING)
    assert sm.state == CommunicationState.LISTENING

@pytest.mark.asyncio
async def test_callbacks():
    sm = StateMachine("test-4")
    
    history = []
    async def cb(from_state, to_state):
        history.append((from_state, to_state))
        
    sm.on_state_change(cb)
    
    await sm.transition(CommunicationState.LISTENING)
    await sm.transition(CommunicationState.PROCESSING)
    
    assert len(history) == 2
    assert history[0] == (CommunicationState.IDLE, CommunicationState.LISTENING)
    assert history[1] == (CommunicationState.LISTENING, CommunicationState.PROCESSING)
