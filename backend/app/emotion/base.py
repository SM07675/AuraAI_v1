"""
Emotion module — abstract base types and data contracts.

Architecture
------------
Emotion models are context providers, NOT response generators.

Every emotion model produces an EmotionResult.
The EmotionService fuses multiple EmotionResults into a single EmotionContext.
The EmotionContext is the ONLY representation passed to the LLM — never raw
scores, logits, or per-model outputs.

Data flow:
    Camera → FaceEmotionAnalyzer → EmotionResult(modality='face')
    Text   → TextEmotionAnalyzer  → EmotionResult(modality='text')
    Audio  → VoiceEmotionAnalyzer → EmotionResult(modality='voice')
                ↓
         EmotionFusion
                ↓
         EmotionContext          ← injected into LLM prompt
                ↓
         EmotionContext.to_prompt_dict()  ← LLM sees ONLY this
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any


# ── Valid emotion labels ──────────────────────────────────────────────────────
# FERPlus-8 classes + extended mental wellness emotions
EMOTION_LABELS: set[str] = {
    # FERPlus-8
    "angry", "contempt", "disgusted", "fearful",
    "happy", "neutral", "sad", "surprised",
    # Extended
    "anxious", "calm", "excited", "frustrated",
}

# Emotion → valence mapping (used for conflict detection and sentiment)
POSITIVE_EMOTIONS: frozenset[str] = frozenset({
    "happy", "calm", "excited", "surprised", "content",
})
NEGATIVE_EMOTIONS: frozenset[str] = frozenset({
    "sad", "angry", "anxious", "fearful", "disgusted",
    "frustrated", "contempt",
})

# Per-emotion tone guidance for the LLM
_EMOTION_GUIDANCE: dict[str, dict[str, Any]] = {
    "happy": {
        "tone": "warm and positive",
        "response_length": "medium",
        "avoid": ["excessive enthusiasm that feels artificial"],
        "focus": ["match positive energy", "celebrate wins", "build momentum"],
    },
    "sad": {
        "tone": "calm, gentle, and empathetic",
        "response_length": "medium",
        "avoid": ["dismissive language", "toxic positivity", "rushing to solutions"],
        "focus": ["active listening", "open-ended questions", "validation"],
    },
    "anxious": {
        "tone": "calm, steady, and reassuring",
        "response_length": "short",
        "avoid": ["overwhelming information", "long lists", "future uncertainty"],
        "focus": ["one step at a time", "grounding", "what can be controlled"],
    },
    "angry": {
        "tone": "calm and non-reactive",
        "response_length": "medium",
        "avoid": ["mirroring anger", "escalating language", "dismissing feelings"],
        "focus": ["acknowledgment", "space to vent", "reflection prompts"],
    },
    "fearful": {
        "tone": "reassuring and steady",
        "response_length": "short",
        "avoid": ["minimizing fear", "excessive questioning", "alarming details"],
        "focus": ["reassurance", "safety focus", "small concrete steps"],
    },
    "frustrated": {
        "tone": "patient and understanding",
        "response_length": "medium",
        "avoid": ["platitudes", "bypassing the problem"],
        "focus": ["acknowledge difficulty", "break into smaller steps", "validation"],
    },
    "disgusted": {
        "tone": "empathetic and non-judgmental",
        "response_length": "medium",
        "avoid": ["agreeing with extreme language", "amplifying negativity"],
        "focus": ["understanding root cause", "reframing where helpful"],
    },
    "contempt": {
        "tone": "calm and curious",
        "response_length": "medium",
        "avoid": ["condescension", "arguing"],
        "focus": ["exploring underlying frustration", "perspective widening"],
    },
    "surprised": {
        "tone": "engaged and curious",
        "response_length": "medium",
        "avoid": ["dismissing the surprise"],
        "focus": ["exploring what changed", "processing together"],
    },
    "excited": {
        "tone": "energetic and encouraging",
        "response_length": "medium",
        "avoid": ["dampening enthusiasm"],
        "focus": ["channeling energy productively", "celebrating"],
    },
    "calm": {
        "tone": "clear and informational",
        "response_length": "medium",
        "avoid": [],
        "focus": ["direct answers", "collaborative problem solving"],
    },
    "neutral": {
        "tone": "natural and conversational",
        "response_length": "medium",
        "avoid": [],
        "focus": ["engage authentically", "follow user's lead"],
    },
}


# ── Per-model output ──────────────────────────────────────────────────────────

@dataclass
class EmotionResult:
    """Result from a single emotion analysis modality.

    This is the raw per-model output. It is NEVER sent directly to the LLM.
    The EmotionFusion module combines multiple EmotionResults into an
    EmotionContext before LLM injection.
    """

    emotion: str                          # Dominant emotion label
    confidence: float                     # 0.0–100.0
    scores: dict[str, float] = field(default_factory=dict)  # All emotion scores
    modality: str = "unknown"             # "text" | "voice" | "face"
    is_mock: bool = False                 # True if fallback/stub result

    # Extended fields (populated by text/voice analyzers)
    sentiment: str = "neutral"            # "positive" | "negative" | "neutral"
    stress_level: str = "low"            # "low" | "medium" | "high"
    intent: str = "casual"               # see INTENT_LABELS below
    secondary_emotion: str | None = None  # Second-highest scoring emotion
    secondary_confidence: float = 0.0

    # Face-specific
    face_detected: bool | None = None    # None if not face modality

    def to_dict(self) -> dict[str, Any]:
        return {
            "emotion": self.emotion,
            "confidence": self.confidence,
            "scores": self.scores,
            "modality": self.modality,
            "sentiment": self.sentiment,
            "stress_level": self.stress_level,
            "intent": self.intent,
            "secondary_emotion": self.secondary_emotion,
            "secondary_confidence": self.secondary_confidence,
            "face_detected": self.face_detected,
            "is_mock": self.is_mock,
        }


# Intent labels for text analysis
INTENT_LABELS: frozenset[str] = frozenset({
    "seek_support",    # User is reaching out for emotional help
    "vent",            # User needs to express without expecting solutions
    "ask_question",    # Informational query
    "share_positive",  # Sharing good news / achievements
    "share_negative",  # Sharing bad news / setbacks
    "casual",          # General conversation
    "crisis",          # Urgent distress signal
})


# ── Fused output (LLM-ready) ──────────────────────────────────────────────────

@dataclass
class EmotionContext:
    """Structured emotion context ready for LLM injection.

    This is the ONLY emotion representation the LLM receives.
    Raw scores, logits, and model internals are never included.

    Built by EmotionFusion from one or more EmotionResults.
    """

    # Core emotion signals
    primary_emotion: str                  # Dominant fused emotion
    secondary_emotion: str | None         # Second most prominent emotion
    confidence: float                     # 0.0–1.0 (normalized)

    # Qualitative state
    stress: str                           # "low" | "medium" | "high"
    sentiment: str                        # "positive" | "negative" | "neutral"
    intent: str                           # User's apparent intent

    # Source tracking
    sources: list[str] = field(default_factory=list)   # ["face", "text"]

    # Conflict detection
    emotion_conflict: bool = False
    conflict_detail: str = ""            # Human-readable conflict description

    # Per-modality summaries (label only, no raw scores)
    face_emotion: str | None = None
    face_confidence: float = 0.0
    face_detected: bool | None = None
    text_emotion: str | None = None
    text_confidence: float = 0.0
    voice_emotion: str | None = None
    voice_confidence: float = 0.0

    # Session-level pattern
    conversation_trend: str = ""          # e.g., "mood has been lower for 3 turns"
    trend_emotion: str | None = None     # Dominant trend emotion

    # LLM behavioral guidance (derived from primary_emotion)
    guidance: dict[str, Any] = field(default_factory=dict)

    def to_prompt_dict(self) -> dict[str, Any]:
        """Return a clean, LLM-safe dictionary for prompt injection.

        Never includes raw scores, tensors, or internal model data.
        Only structured, human-readable context.
        """
        d: dict[str, Any] = {
            "primary_emotion": self.primary_emotion,
            "secondary_emotion": self.secondary_emotion,
            "confidence": round(self.confidence, 2),
            "stress_level": self.stress,
            "sentiment": self.sentiment,
            "intent": self.intent,
            "emotion_sources": {s: self._get_source_emotion(s) for s in self.sources},
            "emotion_conflict": self.emotion_conflict,
        }

        if self.emotion_conflict and self.conflict_detail:
            d["conflict_detail"] = self.conflict_detail

        if self.conversation_trend:
            d["conversation_trend"] = self.conversation_trend

        if self.guidance:
            d["guidance"] = self.guidance

        return d

    def _get_source_emotion(self, source: str) -> str | None:
        mapping = {
            "face": self.face_emotion,
            "text": self.text_emotion,
            "voice": self.voice_emotion,
        }
        return mapping.get(source)

    def is_negative(self) -> bool:
        """True if primary emotion is from the negative valence set."""
        return self.primary_emotion in NEGATIVE_EMOTIONS

    def is_crisis(self) -> bool:
        """True if intent signals urgent distress."""
        return self.intent == "crisis"

    def get_guidance(self) -> dict[str, Any]:
        """Return per-emotion LLM guidance dict."""
        return _EMOTION_GUIDANCE.get(self.primary_emotion, _EMOTION_GUIDANCE["neutral"])


# ── Legacy compatibility ──────────────────────────────────────────────────────

@dataclass
class FusedEmotion:
    """Legacy fused emotion type — kept for backward compatibility.

    New code should use EmotionContext instead.
    """

    fused_emotion: str
    confidence: float
    text_emotion: EmotionResult | None = None
    voice_emotion: EmotionResult | None = None
    face_emotion: EmotionResult | None = None
    available_modalities: list[str] = field(default_factory=list)
    weights_used: dict[str, float] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "fused_emotion": self.fused_emotion,
            "confidence": self.confidence,
            "text_emotion": self.text_emotion.to_dict() if self.text_emotion else None,
            "voice_emotion": self.voice_emotion.to_dict() if self.voice_emotion else None,
            "face_emotion": self.face_emotion.to_dict() if self.face_emotion else None,
            "available_modalities": self.available_modalities,
            "weights_used": self.weights_used,
        }

    def to_emotion_context(self) -> EmotionContext:
        """Convert legacy FusedEmotion to new EmotionContext."""
        return EmotionContext(
            primary_emotion=self.fused_emotion,
            secondary_emotion=None,
            confidence=self.confidence / 100.0,
            stress="low",
            sentiment="neutral",
            intent="casual",
            sources=self.available_modalities,
            face_emotion=self.face_emotion.emotion if self.face_emotion else None,
            text_emotion=self.text_emotion.emotion if self.text_emotion else None,
            voice_emotion=self.voice_emotion.emotion if self.voice_emotion else None,
        )


# ── Abstract base ─────────────────────────────────────────────────────────────

class EmotionAnalyzer(ABC):
    """Abstract base for emotion analyzers.

    Implement this interface to add a new emotion model.
    Each analyzer produces an EmotionResult — never an EmotionContext.
    The fusion step is the responsibility of EmotionFusion / EmotionService.
    """

    @property
    @abstractmethod
    def modality(self) -> str:
        """Name of the modality: 'text', 'voice', or 'face'."""
        ...

    @property
    @abstractmethod
    def is_available(self) -> bool:
        """True if the analyzer is loaded and ready to run."""
        ...

    @abstractmethod
    async def analyze(self, input_data: Any) -> EmotionResult:
        """Analyze emotion from input data.

        Args:
            input_data: Depends on modality:
                - text: str
                - voice: bytes (PCM16 audio) or dict with audio_base64
                - face: str (base64 JPEG) or np.ndarray (BGR)

        Returns:
            EmotionResult with emotion, confidence, and scores.
            Never raises — returns a mock/neutral result on failure.
        """
        ...
