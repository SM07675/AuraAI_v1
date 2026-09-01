import json
import pytest
from unittest.mock import AsyncMock, MagicMock
from app.services.goal_engine import GoalEngine
from app.models.goal import UserGoal
from app.ai.base import AIResponse


@pytest.mark.asyncio
async def test_goal_engine_detects_new_goals():
    # Mock AIGateway
    mock_gateway = AsyncMock()
    mock_response = AIResponse(
        content=json.dumps({
            "new_goals": [{"title": "Learn FastAPI", "category": "learning", "priority": 0.8, "description": "Master async python"}],
            "goal_updates": []
        }),
        model="test-model",
        provider="test-provider"
    )
    mock_gateway.generate.return_value = mock_response

    engine = GoalEngine(gateway=mock_gateway)
    
    # Mock DB
    mock_db = AsyncMock()
    mock_db.add = MagicMock()
    # Mock get existing goals (returns empty)
    mock_db.execute.return_value.scalars.return_value.all.return_value = []
    # Mock count goals (returns 0)
    mock_db.execute.return_value.scalar.return_value = 0

    await engine.detect_and_update(
        db=mock_db,
        user_id=1,
        user_message="I really want to learn FastAPI this month.",
        session_id=100
    )

    # Verify a goal was added
    assert mock_db.add.called
    added_goal = mock_db.add.call_args[0][0]
    assert isinstance(added_goal, UserGoal)
    assert added_goal.title == "Learn FastAPI"
    assert added_goal.category == "learning"
    assert added_goal.priority == 0.8
    assert added_goal.user_id == 1
    
    # Verify commit was called
    assert mock_db.commit.called
