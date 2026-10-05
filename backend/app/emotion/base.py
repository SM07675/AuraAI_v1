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
    face_box: list[int] | None = None
    box_norm: dict[str, float] | None = None
    metadata: dict[str, Any] = field(default_factory=dict)
    valence: float = 0.0
    arousal: float = 0.0

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
            "face_box": self.face_box,
            "box_norm": self.box_norm,
            "is_mock": self.is_mock,
        }

    @property
    def primary_emotion(self) -> str:
        """Alias for dominant emotion."""
        return self.emotion


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
    Matches the single-fused-state contract.
    """
    primaryEmotion: str = "neutral"
    confidence: float = 0.0
    stressLevel: float = 0.0
    activeSources: list[str] = field(default_factory=list)
    conflict: bool = False
    timestamp: str = ""

    def __init__(
        self,
        primaryEmotion: str = "neutral",
        confidence: float = 0.0,
        stressLevel: float = 0.0,
        activeSources: list[str] | None = None,
        conflict: bool = False,
        timestamp: str = "",
        primary_emotion: str | None = None,
        stress: str | float | None = None,
        sentiment: str | None = None,
        intent: str | None = None,
        secondary_emotion: str | None = None,
        sources: list[str] | None = None,
        face_emotion: str | None = None,
        text_emotion: str | None = None,
        voice_emotion: str | None = None,
        **kwargs: Any,
    ):
        self.primaryEmotion = primary_emotion or primaryEmotion
        self.confidence = confidence
        if isinstance(stress, str):
            self._stress_str = stress
            stress_map = {"low": 0.2, "medium": 0.6, "high": 0.9}
            self.stressLevel = stress_map.get(stress, 0.2)
        elif isinstance(stress, (int, float)):
            self.stressLevel = float(stress)
            self._stress_str = "high" if self.stressLevel >= 0.7 else "medium" if self.stressLevel >= 0.4 else "low"
        else:
            self.stressLevel = stressLevel
            self._stress_str = "high" if self.stressLevel >= 0.7 else "medium" if self.stressLevel >= 0.4 else "low"

        self.activeSources = sources or activeSources or []
        self.conflict = conflict or bool(kwargs.get("emotion_conflict", False))
        self._conflict_detail = kwargs.get("conflict_detail", "")
        self.timestamp = timestamp
        self._face_emotion = face_emotion
        self._text_emotion = text_emotion
        self._voice_emotion = voice_emotion
        self._sentiment = sentiment or "neutral"
        self._intent = intent or "casual"
        self._secondary_emotion = secondary_emotion
        self.facial_state = kwargs.get("facial_state")
        self._face_behavior_summary = self._generate_face_behavior_summary(self.facial_state)

    def _generate_face_behavior_summary(self, facial_state: Optional[dict[str, Any]]) -> str:
        if not facial_state or not facial_state.get("face_detected"):
            return ""
        cues = []
        emo = facial_state.get("emotion", {}).get("primary", "")
        dur = facial_state.get("transitions", {}).get("duration_sec", 0.0)
        stable = facial_state.get("transitions", {}).get("is_stable", False)
        gaze = facial_state.get("gaze", {})
        eye_contact = gaze.get("eye_contact", True)
        aus = facial_state.get("action_units", {}).get("intensity", {})

        if emo in ("happy", "joy"):
            cues.append("User is smiling" if aus.get("AU12", 0) > 1.5 else "User displays positive facial demeanor")
        elif emo in ("sad", "sadness"):
            cues.append("User displays subdued/downcast expression")
        elif emo in ("angry", "frustrated"):
            cues.append("User displays tense/furrowed brow")
        elif emo == "surprised":
            cues.append("User displays widened eyes / surprised expression")

        if eye_contact:
            cues.append("maintaining direct eye contact")
        else:
            cues.append("glancing away")

        if stable and dur >= 1.0:
            cues.append(f"stable for {dur:.1f}s")

        return "; ".join(cues) if cues else ""

    def is_crisis(self) -> bool:
        """True if intent is crisis or severe distress."""
        return self.intent == "crisis" or getattr(self, "_is_crisis", False)

    def to_prompt_dict(self) -> dict[str, Any]:
        """Return exactly the contracted dictionary for prompt injection."""
        d = {
            "primaryEmotion": self.primaryEmotion,
            "primary_emotion": self.primaryEmotion,
            "confidence": round(self.confidence, 2),
            "stressLevel": round(self.stressLevel, 2),
            "stress_level": self.stress,
            "sentiment": self.sentiment,
            "activeSources": self.activeSources,
            "emotion_sources": self.activeSources,
            "sources": self.activeSources,
            "conflict": self.conflict,
            "timestamp": self.timestamp,
        }
        if self._face_behavior_summary:
            d["face_behavior_summary"] = self._face_behavior_summary
        if self.is_negative():
            d["guidance"] = self.get_guidance()
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
        return self.primaryEmotion in NEGATIVE_EMOTIONS

    def get_guidance(self) -> dict[str, Any]:
        """Return per-emotion LLM guidance dict."""
        return _EMOTION_GUIDANCE.get(self.primaryEmotion, _EMOTION_GUIDANCE["neutral"])

    # Compatibility accessors for code that previously consumed FusedEmotion.
    # They deliberately expose only the already structured, LLM-safe context.
    @property
    def primary_emotion(self) -> str:
        return self.primaryEmotion

    @property
    def fused_emotion(self) -> str:
        return self.primaryEmotion

    @property
    def face_emotion(self) -> str | None:
        return getattr(self, "_face_emotion", None)

    @face_emotion.setter
    def face_emotion(self, val: str | None) -> None:
        self._face_emotion = val

    @property
    def text_emotion(self) -> str | None:
        return getattr(self, "_text_emotion", None)

    @text_emotion.setter
    def text_emotion(self, val: str | None) -> None:
        self._text_emotion = val

    @property
    def voice_emotion(self) -> str | None:
        return getattr(self, "_voice_emotion", None)

    @voice_emotion.setter
    def voice_emotion(self, val: str | None) -> None:
        self._voice_emotion = val

    @property
    def stress(self) -> str:
        return getattr(self, "_stress_str", "high" if self.stressLevel >= 0.7 else "medium" if self.stressLevel >= 0.4 else "low")

    @property
    def sentiment(self) -> str:
        return getattr(self, "_sentiment", "neutral")

    @property
    def intent(self) -> str:
        return getattr(self, "_intent", "casual")

    @property
    def sources(self) -> list[str]:
        return getattr(self, "activeSources", [])

    @property
    def emotion_conflict(self) -> bool:
        return getattr(self, "conflict", False)

    @property
    def conflict_detail(self) -> str:
        return getattr(self, "_conflict_detail", "")

    @property
    def conversation_trend(self) -> str:
        return getattr(self, "_conversation_trend", "")

    @property
    def secondary_emotion(self) -> str | None:
        return getattr(self, "_secondary_emotion", None)

    @property
    def guidance(self) -> dict[str, Any]:
        return self.get_guidance()

    def __getattr__(self, name: str) -> Any:
        if name.endswith("_confidence"):
            return 0.0
        if name.endswith("_detected"):
            return False
        if name.endswith("_emotion"):
            return None
        return None

    @property
    def available_modalities(self) -> list[str]:
        return list(self.activeSources)

    def to_dict(self) -> dict[str, Any]:
        d = self.to_prompt_dict()
        d["primary_emotion"] = self.primaryEmotion
        d["fused_emotion"] = self.primaryEmotion
        d["confidence"] = self.confidence * 100.0 if self.confidence <= 1.0 else self.confidence
        d["sources"] = self.activeSources
        d["available_modalities"] = self.activeSources
        d["sentiment"] = self.sentiment
        d["stress"] = self.stress
        d["intent"] = self.intent
        return d


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
