import pytest
from unittest.mock import AsyncMock, MagicMock
from app.ai.builders.context_builder import ContextBuilder, ContextObject
from app.models.user import User
from app.models.session import Session


@pytest.mark.asyncio
async def test_context_builder_builds_correctly():
    # Mock DB
    mock_db = AsyncMock()
    mock_db.execute.return_value.scalars.return_value.all.return_value = []

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
