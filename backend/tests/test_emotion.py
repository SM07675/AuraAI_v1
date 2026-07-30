"""Tests for emotion analysis service."""

from __future__ import annotations

import pytest

from app.emotion.analyzers import TextEmotionAnalyzer
from app.emotion.service import EmotionService


class TestTextEmotionAnalyzer:
    """Test the text emotion analyzer mock."""

    @pytest.mark.asyncio
    async def test_sad_keywords(self):
        analyzer = TextEmotionAnalyzer()
        result = await analyzer.analyze("I'm feeling really sad and depressed today")
        assert result.emotion == "sad"
        assert result.confidence > 50

    @pytest.mark.asyncio
    async def test_anxious_keywords(self):
        analyzer = TextEmotionAnalyzer()
        result = await analyzer.analyze("I'm so anxious about my exams, feeling stressed")
        assert result.emotion == "anxious"

    @pytest.mark.asyncio
    async def test_happy_keywords(self):
        analyzer = TextEmotionAnalyzer()
        result = await analyzer.analyze("I'm so happy and excited about this!")
        assert result.emotion == "happy"

    @pytest.mark.asyncio
    async def test_neutral_default(self):
        analyzer = TextEmotionAnalyzer()
        result = await analyzer.analyze("The weather is nice today.")
        assert result.emotion == "neutral"

    @pytest.mark.asyncio
    async def test_empty_input(self):
        analyzer = TextEmotionAnalyzer()
        result = await analyzer.analyze("")
        assert result.emotion == "neutral"
        assert result.is_mock is True


class TestEmotionService:
    """Test the emotion fusion service."""

    @pytest.mark.asyncio
    async def test_text_only_analysis(self):
        service = EmotionService()
        fused = await service.analyze_and_fuse(text="I am very sad")
        assert fused.primary_emotion == "sad"
        assert fused.text_emotion is not None
        assert "text" in fused.available_modalities

    @pytest.mark.asyncio
    async def test_no_input_returns_neutral(self):
        service = EmotionService()
        fused = await service.analyze_and_fuse()
        assert fused.primary_emotion == "neutral"
        assert fused.available_modalities == []

    @pytest.mark.asyncio
    async def test_fused_to_dict(self):
        service = EmotionService()
        fused = await service.analyze_and_fuse(text="I'm happy")
        d = fused.to_dict()
        assert d["primary_emotion"] == "happy"
        assert "confidence" in d
        assert "available_modalities" in d

    def test_get_status(self):
        service = EmotionService()
        status = service.get_status()
        assert "text_analyzer" in status
        assert "voice" in status
        assert "face" in status
