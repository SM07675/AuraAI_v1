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
def __getattr__(name):
    """Load analyzers lazily to avoid service/fusion circular imports."""
    from importlib import import_module
    modules = {
        "EmotionService": "app.emotion.service",
        "EmotionFusionEngine": "app.emotion.fusion",
        "FaceEmotionAnalyzer": "app.emotion.face_analyzer",
        "TextEmotionAnalyzer": "app.emotion.analyzers",
        "VoiceEmotionAnalyzer": "app.emotion.analyzers",
    }
    if name not in modules:
        raise AttributeError(name)
    value = getattr(import_module(modules[name]), name)
    globals()[name] = value
    return value

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
    "POSITIVE_EMOTIONS",
    "NEGATIVE_EMOTIONS",
    "EMOTION_LABELS",
]
