import pytest
from app.ai.context_tracker import ContextSufficiencyTracker
from app.ai.turn_directive import TurnDirective
from app.emotion.base import EmotionContext

def test_context_tracker_initial_exploration():
    tracker = ContextSufficiencyTracker()
    directive = TurnDirective.default(phase="explore")
    
    result = tracker.evaluate(
        turn_directive=directive,
        emotion_context=None,
        user_profile={"goals": "Reduce stress"},
        recent_history=[],
        turn_count=1,
        user_message="Hello, I had a busy day",
    )
    
    assert result.total_dimensions == 6
    assert isinstance(result.score, float)
    assert result.should_deliver_solution is False

def test_context_tracker_explicit_solution_trigger():
    tracker = ContextSufficiencyTracker()
    directive = TurnDirective.default(phase="explore")
    
    result = tracker.evaluate(
        turn_directive=directive,
        emotion_context=None,
        user_profile={"goals": "Career growth"},
        recent_history=[],
        turn_count=1,
        user_message="I have an interview tomorrow and I am panicking. What should I do?",
    )
    
    assert result.should_deliver_solution is True
    assert result.dominant_domain in ("career", "wellness", "anxiety")

def test_context_tracker_multi_turn_accumulation():
    tracker = ContextSufficiencyTracker()
    directive = TurnDirective(
        phase="identify",
        problemDetected=True,
        concernCategory="work_stress",
        mustReflectFirst=True,
        offerSolution=False,
        mustAskFollowUp=True,
        nextQuestionSeed="How long have you felt this way?",
    )
    
    emo = EmotionContext(
        primary_emotion="anxious",
        confidence=0.88,
        stress="high",
        sentiment="negative",
    )
    
    result = tracker.evaluate(
        turn_directive=directive,
        emotion_context=emo,
        user_profile={"goals": "Overcome burnout", "interests": "Coding"},
        recent_history=[
            {"role": "user", "content": "I feel completely overwhelmed at my job"},
            {"role": "assistant", "content": "I hear you. Tell me more."},
            {"role": "user", "content": "My deadlines are impossible and I cannot focus"},
        ],
        turn_count=3,
        user_message="My deadlines are impossible and I cannot focus at all",
    )
    
    assert result.should_deliver_solution is True
    assert result.score >= 0.50
