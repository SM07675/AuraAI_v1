"""Tests for AI gateway and prompt builder."""

from __future__ import annotations

import pytest

from app.ai.base import AIRequest
from app.prompts.builder import PromptBuilder


class TestPromptBuilder:
    """Test the PromptBuilder assembles prompts correctly."""

    def setup_method(self):
        self.builder = PromptBuilder()

    def test_build_basic(self):
        """Test basic prompt building."""
        system, messages = self.builder.build(
            user_name="Alex",
            user_message="Hello there",
        )
        assert isinstance(system, str)
        assert len(system) > 50
        assert isinstance(messages, list)
        assert messages[-1]["role"] == "user"
        assert messages[-1]["content"] == "Hello there"

    def test_build_with_emotion(self):
        """Test prompt building includes emotion context when provided."""
        system, messages = self.builder.build(
            user_name="Alex",
            user_message="I'm feeling down",
            emotion_data={
                "fused_emotion": "sad",
                "confidence": 80.0,
                "text_emotion": "sad",
                "voice_emotion": None,
                "face_emotion": None,
            },
        )
        assert "sad" in system.lower()

    def test_build_with_history(self):
        """Test conversation history is included in messages."""
        history = [
            {"role": "user", "content": "Previous message"},
            {"role": "assistant", "content": "Previous response"},
        ]
        system, messages = self.builder.build(
            user_name="Alex",
            user_message="New message",
            conversation_history=history,
        )
        # History should appear in messages
        roles = [m["role"] for m in messages]
        assert "user" in roles
        assert "assistant" in roles
        assert messages[-1]["content"] == "New message"

    def test_emotion_conflict_detection(self):
        """Test emotion conflict is detected and mentioned in prompt."""
        emotion_context = EmotionContext(
            primary_emotion="anxious",
            secondary_emotion="sad",
            confidence=0.85,
            stress="high",
            sentiment="negative",
            intent="seeking_reassurance",
            sources=["text", "face"],
            face_emotion="sad",
            face_confidence=0.9,
            face_detected=True,
            text_emotion="anxious",
            text_confidence=0.8,
            voice_emotion=None,
            emotion_conflict=True,
            conflict_detail="Face is sad, text is anxious",
            conversation_trend="stable",
            guidance="Be reassuring and gentle."
        )
        system, messages = self.builder.build(
            user_name="Alex",
            user_message="I'm fine",
            emotion_data=emotion_context,
        )
        assert "conflict" in system.lower() or "mismatch" in system.lower()


class TestAIRequest:
    """Test AIRequest dataclass."""

    def test_ai_request_defaults(self):
        req = AIRequest(prompt="test")
        assert req.prompt == "test"
        assert req.temperature == 0.7
        assert req.max_tokens == 500
        assert req.stream is True
        assert req.messages == []
