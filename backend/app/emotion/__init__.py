"""Emotion Intelligence Pipeline for Aura AI 2.0.

Public API:
  EmotionContext    — Structured emotion context for LLM injection
  EmotionResult     — Per-modality raw result
  EmotionService    — Orchestrator (instantiate one per session)
  EmotionFusion     — Fusion engine (used by EmotionService)
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
from app.emotion.fusion import EmotionFusion
from app.emotion.face_analyzer import FaceEmotionAnalyzer
from app.emotion.analyzers import TextEmotionAnalyzer, VoiceEmotionAnalyzer

__all__ = [
    "EmotionContext",
    "EmotionResult",
    "EmotionAnalyzer",
    "FusedEmotion",
    "EmotionService",
    "EmotionFusion",
    "FaceEmotionAnalyzer",
    "TextEmotionAnalyzer",
    "VoiceEmotionAnalyzer",
    "POSITIVE_EMOTIONS",
    "NEGATIVE_EMOTIONS",
    "EMOTION_LABELS",
]
