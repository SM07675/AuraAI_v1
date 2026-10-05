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

def test_context_tracker_turn_1_sadness_does_not_trigger_sss():
    """Verify that on Turn 1, 'I am really sad today' with a profile goal does NOT trigger SSS."""
    tracker = ContextSufficiencyTracker()
    directive = TurnDirective.default(phase="explore")
    
    emo = EmotionContext(
        primary_emotion="sad",
        confidence=0.85,
        stress="low",
        sentiment="negative",
    )
    
    result = tracker.evaluate(
        turn_directive=directive,
        emotion_context=emo,
        user_profile={"goals": "Boost Teamwork Momentum"},
        recent_history=[],
        turn_count=1,
        user_message="I am really sad today",
    )
    
    # Must NOT deliver solution on Turn 1 with no blockers or domain articulated
    assert result.should_deliver_solution is False
    assert result.recommendation == "explore_further"
    assert result.dimensions_resolved["blockers_known"] is False
    assert result.dimensions_resolved["problem_domain"] is False

def test_context_tracker_turn_2_exploration_does_not_trigger_sss():
    """Verify that Turn 2 brief response continues exploration without premature solution."""
    tracker = ContextSufficiencyTracker()
    directive = TurnDirective(
        phase="explore",
        problemDetected=True,
        concernCategory="wellness",
        mustReflectFirst=True,
        offerSolution=False,
        mustAskFollowUp=True,
        nextQuestionSeed="What made you feel this way?",
    )
    
    emo = EmotionContext(
        primary_emotion="sad",
        confidence=0.75,
        stress="low",
        sentiment="negative",
    )
    
    result = tracker.evaluate(
        turn_directive=directive,
        emotion_context=emo,
        user_profile={"goals": "Boost Teamwork Momentum"},
        recent_history=[
            {"role": "user", "content": "I am really sad today"},
            {"role": "assistant", "content": "I hear you. Tell me what's going on."},
        ],
        turn_count=2,
        user_message="I don't know, just feeling drained today",
    )
    
    assert result.should_deliver_solution is False
    assert result.recommendation == "explore_further"

def test_context_tracker_acute_panic_triggers_immediate_relief():
    """Verify that acute panic triggers immediate somatic relief even on Turn 1."""
    tracker = ContextSufficiencyTracker()
    directive = TurnDirective.default(phase="explore")
    
    result = tracker.evaluate(
        turn_directive=directive,
        emotion_context=None,
        user_profile={"goals": "Health"},
        recent_history=[],
        turn_count=1,
        user_message="I am having a panic attack and cannot breathe",
    )
    
    assert result.should_deliver_solution is True
    assert result.recommendation == "deliver_solution"
