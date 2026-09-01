import pytest
from unittest.mock import AsyncMock, MagicMock
from app.ai.builders.context_builder import ContextBuilder, ContextObject
from app.models.user import User
from app.models.session import Session


@pytest.mark.asyncio
async def test_context_builder_builds_correctly():
    # Mock DB
    mock_db = AsyncMock()
    mock_db.add = MagicMock()
    exec_result = MagicMock()
    exec_result.scalars.return_value.all.return_value = []
    exec_result.scalars.return_value.first.return_value = None
    exec_result.scalar_one_or_none.return_value = None
    exec_result.scalar.return_value = None
    mock_db.execute.return_value = exec_result

    builder = ContextBuilder(mock_db)

    user = User(
        id=1,
        name="John Doe",
        preferred_language="es",
        communication_style="direct",
        interests="coding, music",
        learning_style="hands-on",
    )
    session = Session(id=100)

    context = await builder.build(
        user=user,
        session=session,
        emotion_data={"fused_emotion": "happy", "confidence": 90.0, "stress_level": 1},
        recent_history=[{"role": "user", "content": "Hello"}],
        conversation_summary="User said hello",
    )

    assert isinstance(context, ContextObject)
    assert context.user_name == "John"
    assert context.preferred_language == "es"
    assert context.emotion_fused == "happy"
    assert context.emotion_confidence == 90.0
    assert context.emotion_stress == 1
    assert context.session_id == 100
    assert context.interests == "coding, music"
    assert context.conversation_summary == "User said hello"
    assert len(context.recent_history) == 1


@pytest.mark.asyncio
async def test_context_builder_allows_per_turn_language_override():
    mock_db = AsyncMock()
    mock_db.add = MagicMock()
    exec_result = MagicMock()
    exec_result.scalars.return_value.all.return_value = []
    exec_result.scalars.return_value.first.return_value = None
    exec_result.scalar_one_or_none.return_value = None
    exec_result.scalar.return_value = None
    mock_db.execute.return_value = exec_result

    context = await ContextBuilder(mock_db).build(
        user=User(id=1, name="Asha", preferred_language="en"),
        session=Session(id=101),
        preferred_language="hi-IN",
    )

    assert context.preferred_language == "hi-IN"
