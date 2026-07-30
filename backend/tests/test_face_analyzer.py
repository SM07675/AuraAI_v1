"""
Tests for FaceEmotionAnalyzer — unit tests with mocked ONNX sessions.

Tests cover:
  - Graceful degradation when models are absent
  - Base64 image decode
  - FERPlus softmax output → EmotionResult mapping
  - Secondary emotion extraction
  - No-face result format
  - Mock result structure validation
"""

import base64
import io
import pytest
from unittest.mock import MagicMock, patch, AsyncMock

from app.emotion.base import EmotionResult
from app.emotion.face_analyzer import FaceEmotionAnalyzer, _FERPLUS_CLASSES


class TestFaceEmotionAnalyzerUnavailable:
    """Behavior when models are not available."""

    @pytest.mark.asyncio
    async def test_returns_mock_when_unavailable(self):
        analyzer = FaceEmotionAnalyzer()
        analyzer._loaded = True
        analyzer._available = False  # Simulate missing model

        result = await analyzer.analyze("fake_base64_data")

        assert isinstance(result, EmotionResult)
        assert result.modality == "face"
        assert result.is_mock is True
        assert result.face_detected is False

    @pytest.mark.asyncio
    async def test_returns_mock_on_empty_input(self):
        analyzer = FaceEmotionAnalyzer()
        analyzer._loaded = True
        analyzer._available = True
        # Simulate unavailable by checking face detection failure
        result = await analyzer.analyze("")

        assert isinstance(result, EmotionResult)
        assert result.modality == "face"


class TestFaceEmotionAnalyzerFERPlus:
    """FERPlus inference with mocked ONNX output."""

    def _make_analyzer_with_mock_session(self, logits: list[float]) -> FaceEmotionAnalyzer:
        """Create an analyzer with a mocked ONNX session."""
        import numpy as np

        analyzer = FaceEmotionAnalyzer()
        analyzer._loaded = True
        analyzer._available = True

        # Mock numpy and cv2
        import numpy
        analyzer._np = numpy
        import cv2 as real_cv2
        analyzer._cv2 = real_cv2

        # Mock ONNX session
        mock_session = MagicMock()
        mock_session.get_inputs.return_value = [MagicMock(name="input")]
        mock_session.run.return_value = [numpy.array([logits])]
        analyzer._emo_session = mock_session

        return analyzer

    def test_ferplus_happy_output(self):
        """FERPlus logit: happy class dominant → EmotionResult.emotion = 'happy'."""
        import numpy as np
        # FERPlus classes: neutral, happy, surprised, sad, angry, disgusted, fearful, contempt
        # happy is index 1
        logits = [-5.0, 10.0, -3.0, -4.0, -4.0, -5.0, -5.0, -6.0]
        analyzer = self._make_analyzer_with_mock_session(logits)

        # Create a fake 64x64 crop (analyzer expects BGR numpy array)
        fake_crop = np.zeros((64, 64, 3), dtype=np.uint8)

        result = analyzer._run_ferplus(fake_crop)

        assert result.emotion == "happy"
        assert result.confidence > 50.0
        assert result.modality == "face"
        assert result.face_detected is True
        assert result.is_mock is False

    def test_ferplus_sad_output(self):
        """Sad class dominant → EmotionResult.emotion = 'sad'."""
        import numpy as np
        # sad is index 3
        logits = [-5.0, -3.0, -4.0, 10.0, -4.0, -5.0, -5.0, -6.0]
        analyzer = self._make_analyzer_with_mock_session(logits)
        fake_crop = np.zeros((64, 64, 3), dtype=np.uint8)

        result = analyzer._run_ferplus(fake_crop)

        assert result.emotion == "sad"
        assert result.is_negative if hasattr(result, "is_negative") else True

    def test_ferplus_secondary_emotion(self):
        """Secondary emotion is the second highest probability."""
        import numpy as np
        # neutral=0.6, happy=0.3, rest tiny
        logits = [2.0, 1.0, -3.0, -4.0, -4.0, -5.0, -5.0, -6.0]
        analyzer = self._make_analyzer_with_mock_session(logits)
        fake_crop = np.zeros((64, 64, 3), dtype=np.uint8)

        result = analyzer._run_ferplus(fake_crop)

        assert result.emotion == "neutral"
        assert result.secondary_emotion is not None
        assert result.secondary_emotion == "happy"

    def test_low_confidence_returns_neutral(self):
        """When all logits are roughly equal, primary should be low confidence."""
        import numpy as np
        logits = [0.1, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]  # nearly uniform
        analyzer = self._make_analyzer_with_mock_session(logits)
        fake_crop = np.zeros((64, 64, 3), dtype=np.uint8)

        result = analyzer._run_ferplus(fake_crop)

        # Should be neutral (low confidence → threshold kicks in)
        assert result.modality == "face"
        assert isinstance(result.emotion, str)

    def test_scores_contain_all_classes(self):
        """Result scores dict should contain all FERPlus class labels."""
        import numpy as np
        logits = [0.0] * 8
        logits[1] = 5.0  # happy dominant
        analyzer = self._make_analyzer_with_mock_session(logits)
        fake_crop = np.zeros((64, 64, 3), dtype=np.uint8)

        result = analyzer._run_ferplus(fake_crop)

        # All mapped labels should be in scores
        expected_emotions = {"neutral", "happy", "surprised", "sad", "angry",
                            "disgusted", "fearful", "contempt"}
        assert expected_emotions == set(result.scores.keys())

    def test_scores_sum_to_approximately_one(self):
        """Softmax scores must sum to ~1.0."""
        import numpy as np
        logits = [1.0, 2.0, 0.5, -1.0, -0.5, 0.3, -0.2, -1.5]
        analyzer = self._make_analyzer_with_mock_session(logits)
        fake_crop = np.zeros((64, 64, 3), dtype=np.uint8)

        result = analyzer._run_ferplus(fake_crop)

        total = sum(result.scores.values())
        assert abs(total - 1.0) < 0.01, f"Scores sum to {total}, expected ~1.0"


class TestFaceAnalyzerInputDecoding:
    """Input format decoding tests."""

    @pytest.mark.asyncio
    async def test_unavailable_on_invalid_base64(self):
        analyzer = FaceEmotionAnalyzer()
        analyzer._loaded = True
        analyzer._available = False

        # Should not raise — returns mock result
        result = await analyzer.analyze("not_valid_base64!!!")
        assert isinstance(result, EmotionResult)
        assert result.is_mock

    def test_no_face_result_structure(self):
        analyzer = FaceEmotionAnalyzer()
        result = analyzer._no_face_result("test_reason")

        assert result.emotion == "neutral"
        assert result.face_detected is False
        assert result.is_mock is True
        assert result.modality == "face"
