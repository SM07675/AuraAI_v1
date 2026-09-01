"""
Tests for Fast Path vs Deep Path Turn Router.
"""

from app.ai.turn_router import TurnRouter


def test_fast_path_greetings_and_acknowledgements():
    fast_messages = [
        "hi",
        "Hello",
        "thanks",
        "ok",
        "good morning",
        "sure",
        "cool",
        "bye",
    ]
    for msg in fast_messages:
        decision = TurnRouter.classify(msg, mode="chat")
        assert decision.is_fast_path is True
        assert decision.requires_knowledge_graph is False
        assert decision.requires_semantic_memory is False
        assert decision.enable_thinking is False


def test_deep_path_complex_and_emotional_queries():
    deep_messages = [
        "I'm feeling completely overwhelmed with my placement preparation and don't know what to study next.",
        "Why is my FastAPI backend experiencing high latency when connecting to Redis?",
        "Can you explain how we should structure the knowledge graph relationships for our project?",
    ]
    for msg in deep_messages:
        decision = TurnRouter.classify(msg, mode="chat")
        assert decision.is_fast_path is False
        assert decision.requires_knowledge_graph is True
        assert decision.requires_semantic_memory is True
