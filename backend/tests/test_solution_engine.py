import pytest
from app.ai.solution_engine import SolutionEngine

@pytest.mark.asyncio
async def test_solution_engine_selects_breathing_for_panic():
    engine = SolutionEngine()
    sol_type = engine.select_solution_type(
        domain="wellness",
        primary_emotion="fearful",
        stress="high",
        user_message="I am having a panic attack and cannot breathe",
    )
    assert sol_type == "breathing_exercise"

@pytest.mark.asyncio
async def test_solution_engine_selects_cbt_for_catastrophizing():
    engine = SolutionEngine()
    sol_type = engine.select_solution_type(
        domain="wellness",
        primary_emotion="sad",
        stress="medium",
        user_message="I feel like a complete failure and I will never succeed",
    )
    assert sol_type == "cbt_reframe"

@pytest.mark.asyncio
async def test_solution_engine_deterministic_fallback():
    engine = SolutionEngine()
    card = engine._build_deterministic_fallback(
        card_id="test_1",
        solution_type="breathing_exercise",
        domain="anxiety",
        user_name="Alex",
        user_goals="Reduce panic",
    )
    assert card.type == "breathing_exercise"
    assert card.steps is not None
    assert len(card.steps) >= 3
    assert "Box Breathing" in card.title
