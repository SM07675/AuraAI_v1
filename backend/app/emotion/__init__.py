"""Emotion Intelligence Pipeline for Aura AI 2.0.

Public API:
  EmotionContext    — Structured emotion context for LLM injection
  EmotionService    — Orchestrator (instantiate one per session)
  EmotionFusionEngine — Fusion engine (used by EmotionService)
  FaceEmotionAnalyzer — BlazeFace + FERPlus ONNX face analyzer
  TextEmotionAnalyzer — LLM + keyword text analyzer
"""

from app.emotion.base import (
    EmotionContext,
    EmotionResult,
    EmotionAnalyzer,
    FusedEmotion,
    POSITIVE_EMOTIONS,
    NEGATIVE_EMOTIONS,
    EMOTION_LABELS,
)
from app.emotion.service import EmotionService
from app.emotion.fusion import EmotionFusionEngine
from app.emotion.face_analyzer import FaceEmotionAnalyzer
from app.emotion.analyzers import TextEmotionAnalyzer, VoiceEmotionAnalyzer

from app.emotion.cross_validator import (
    EmotionCrossValidator,
    ValidationReport,
    get_cross_validator,
)

__all__ = [
    "EmotionContext",
    "EmotionResult",
    "EmotionAnalyzer",
    "FusedEmotion",
    "EmotionService",
    "EmotionFusionEngine",
    "FaceEmotionAnalyzer",
    "TextEmotionAnalyzer",
    "VoiceEmotionAnalyzer",
    "EmotionCrossValidator",
    "ValidationReport",
    "get_cross_validator",
    "POSITIVE_EMOTIONS",
    "NEGATIVE_EMOTIONS",
    "EMOTION_LABELS",
]
