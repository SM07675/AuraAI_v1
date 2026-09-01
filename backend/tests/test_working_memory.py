"""
Tests for Layer 1 Real-Time Working Memory, Session Snapshots, and Tiered Caching.
"""

import pytest

from app.services.working_memory_service import WorkingMemoryService, WorkingMemoryState


@pytest.mark.asyncio
async def test_working_memory_state_lifecycle():
    from app.services.working_memory_service import _in_memory_state, _in_memory_cache
    _in_memory_state.clear()
    _in_memory_cache.clear()
    service = WorkingMemoryService(redis_client=None)  # Uses fast in-memory fallback

    # 1. Initial state
    state = await service.get_state(session_id=101, user_id=42)
    assert state.session_id == 101
    assert state.user_id == 42
    assert state.current_topic == "general"
    assert state.recent_turns == []

    # 2. Update turn
    updated = await service.update_turn(
        session_id=101,
        user_id=42,
        user_message="I'm preparing for campus placements with Python.",
        assistant_message="That's a great goal! What specific Python topics are you focusing on?",
        topic="Placement Preparation",
        goal="Software Placement",
        active_entities=["Python", "Campus Placements"],
        pending_question="What specific Python topics are you focusing on?",
    )
    assert updated.current_topic == "Placement Preparation"
    assert len(updated.recent_turns) == 2
    assert "Python" in updated.active_entities
    assert updated.pending_question == "What specific Python topics are you focusing on?"

    # 3. Interruption state
    await service.set_interrupted(session_id=101, interrupted=True)
    interrupted_state = await service.get_state(session_id=101)
    assert interrupted_state.interruption_state is True
    assert interrupted_state.voice_state == "listening"


@pytest.mark.asyncio
async def test_session_snapshot_and_resumption():
    service = WorkingMemoryService(redis_client=None)

    snapshot_data = {
        "session_id": 202,
        "user_id": 7,
        "current_topic": "Aura AI Development",
        "current_goal": "Optimize LLM TTFT",
        "recent_turns": [{"role": "user", "content": "How do we reduce TTFT?"}],
        "summary": "User is optimizing Aura AI for low latency.",
        "context_version": 2,
    }

    await service.save_session_snapshot(session_id=202, snapshot=snapshot_data)
    restored = await service.restore_session_snapshot(session_id=202)

    assert restored is not None
    assert restored["current_topic"] == "Aura AI Development"
    assert restored["summary"] == "User is optimizing Aura AI for low latency."
    assert restored["context_version"] == 2


@pytest.mark.asyncio
async def test_safe_semantic_cache_gating():
    service = WorkingMemoryService(redis_client=None)

    # 1. Non-sensitive factual query should be cache-safe
    safe_query = "What is the capital of France?"
    assert service.is_cache_safe(safe_query, user_id=1, emotion="neutral") is True

    # 2. Sensitive mental-health queries must NEVER be cache-safe
    sensitive_queries = [
        "I feel so depressed and hopeless today",
        "I want to harm myself",
        "I am having severe anxiety and panic attacks",
        "My diagnosis is bipolar disorder",
    ]
    for q in sensitive_queries:
        assert service.is_cache_safe(q, user_id=1, emotion="sad") is False

    # 3. Cache put and get for safe query
    await service.set_semantic_response(
        query=safe_query,
        response="The capital of France is Paris.",
        intent="factual",
        locale="en",
        model="gpt-test",
        user_id=1,
        emotion="neutral",
    )
    hit = await service.get_semantic_response(
        query=safe_query,
        intent="factual",
        locale="en",
        model="gpt-test",
        user_id=1,
        emotion="neutral",
    )
    assert hit == "The capital of France is Paris."
