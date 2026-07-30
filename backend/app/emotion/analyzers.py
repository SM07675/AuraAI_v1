"""
Emotion Analyzers.

TextEmotionAnalyzer  — LLM-based with keyword fallback, intent detection,
                       stress level, and sentiment
VoiceEmotionAnalyzer — Architecture stub (future: wav2vec2 / SpeechBrain)
"""

from __future__ import annotations

from typing import Any

from app.emotion.base import (
    EmotionAnalyzer,
    EmotionResult,
    INTENT_LABELS,
    NEGATIVE_EMOTIONS,
    POSITIVE_EMOTIONS,
)
from app.core.logging_config import get_logger

logger = get_logger(__name__)

# ── Text Emotion Analyzer ─────────────────────────────────────────────────────

_TEXT_EMOTION_SYSTEM_PROMPT = """\
You are a clinical-grade Emotion & Intent Detection Engine for a mental wellness AI.

Analyze the user's message and determine:
1. Primary emotion (one of: happy, sad, angry, anxious, fearful, calm, neutral, excited, frustrated, disgusted, contempt, surprised)
2. Secondary emotion (second-most prominent, or null)
3. Sentiment: positive | negative | neutral
4. Stress level: low | medium | high
5. Intent: seek_support | vent | ask_question | share_positive | share_negative | casual | crisis
6. Confidence: 0–100 (how certain you are)
7. Scores: probability for each emotion (0.0–1.0, must sum to ~1.0)

IMPORTANT RULES:
- Be precise. "I'm fine" from someone who just described loss = likely sad/neutral, not happy.
- "crisis" intent: user expresses self-harm, hopelessness, or suicidal ideation.
- Use low confidence (30–50) when the message is ambiguous.
- Stress "high" = panic, overwhelm, crisis; "medium" = worry, tension; "low" = manageable.

Return ONLY raw JSON (no markdown, no backticks):
{
  "emotion": "...",
  "secondary_emotion": "..." | null,
  "sentiment": "...",
  "stress_level": "...",
  "intent": "...",
  "confidence": 75,
  "scores": {
    "happy": 0.0, "sad": 0.0, "angry": 0.0, "anxious": 0.0,
    "fearful": 0.0, "calm": 0.0, "neutral": 0.0, "excited": 0.0,
    "frustrated": 0.0, "disgusted": 0.0, "contempt": 0.0, "surprised": 0.0
  }
}"""

# Crisis signal phrases (trigger intent=crisis override)
_CRISIS_PHRASES = [
    "want to die", "kill myself", "end my life", "no reason to live",
    "suicide", "suicidal", "hurt myself", "self harm", "self-harm",
    "can't go on", "give up on life", "don't want to be here anymore",
]


class TextEmotionAnalyzer(EmotionAnalyzer):
    """Text-based emotion analysis using LLM + keyword fallback.

    Features:
    - LLM analysis with intent, stress_level, secondary_emotion, sentiment
    - Fast keyword fallback when LLM unavailable
    - Crisis signal detection (overrides all other signals)
    - Response caching (up to 500 entries, LRU-style eviction)
    """

    def __init__(self, use_llm: bool = True) -> None:
        self._use_llm = use_llm
        self._cache: dict[str, EmotionResult] = {}
        self._cache_order: list[str] = []  # LRU tracking
        self._max_cache = 500

    @property
    def modality(self) -> str:
        return "text"

    @property
    def is_available(self) -> bool:
        return True  # keyword fallback always available

    async def analyze(self, input_data: Any) -> EmotionResult:
        text = str(input_data).strip()
        if not text:
            return EmotionResult(
                emotion="neutral", confidence=50.0,
                scores={"neutral": 1.0}, modality="text",
            )

        # Crisis override — always checked before cache/LLM
        if self._is_crisis(text):
            return EmotionResult(
                emotion="fearful",
                confidence=95.0,
                scores={"fearful": 0.7, "sad": 0.2, "neutral": 0.1},
                modality="text",
                sentiment="negative",
                stress_level="high",
                intent="crisis",
            )

        cache_key = text.lower()[:200]
        if cache_key in self._cache:
            return self._cache[cache_key]

        result: EmotionResult | None = None

        if self._use_llm:
            try:
                result = await self._analyze_with_llm(text)
            except Exception as e:
                logger.debug("LLM emotion failed, falling back to keywords", error=str(e))

        if result is None:
            result = self._analyze_with_keywords(text)

        self._cache_put(cache_key, result)
        return result

    def _is_crisis(self, text: str) -> bool:
        """Check for crisis/self-harm signals."""
        lower = text.lower()
        return any(phrase in lower for phrase in _CRISIS_PHRASES)

    async def _analyze_with_llm(self, text: str) -> EmotionResult:
        """LLM-based analysis returning extended EmotionResult."""
        from app.ai.base import AIRequest
        from app.ai.gateway import AIGateway
        import json

        gateway = AIGateway()
        req = AIRequest(
            system_prompt=_TEXT_EMOTION_SYSTEM_PROMPT,
            prompt=f"User message: {text}",
            stream=False,
            temperature=0.1,
            max_tokens=300,
        )

        resp = await gateway.generate(req)
        content = resp.content.strip()

        # Strip markdown fences
        for prefix in ("```json", "```"):
            if content.startswith(prefix):
                content = content[len(prefix):]
        if content.endswith("```"):
            content = content[:-3]

        data = json.loads(content.strip())

        emotion = data.get("emotion", "neutral")
        intent = data.get("intent", "casual")
        if intent not in INTENT_LABELS:
            intent = "casual"

        return EmotionResult(
            emotion=emotion,
            confidence=float(data.get("confidence", 50.0)),
            scores=data.get("scores", {}),
            modality="text",
            sentiment=data.get("sentiment", "neutral"),
            stress_level=data.get("stress_level", "low"),
            intent=intent,
            secondary_emotion=data.get("secondary_emotion"),
        )

    def _analyze_with_keywords(self, text: str) -> EmotionResult:
        """Keyword heuristic fallback — always available."""
        lower = text.lower()

        keyword_map: dict[str, list[str]] = {
            "happy": [
                "happy", "glad", "joy", "excited", "wonderful", "great",
                "fantastic", "love", "amazing", "excellent", "awesome",
                "delighted", "cheerful", "thrilled", "grateful", "blessed",
            ],
            "sad": [
                "sad", "depressed", "unhappy", "miserable", "heartbroken",
                "lonely", "grieving", "hopeless", "empty", "crying",
                "devastated", "sorrowful", "gloomy", "melancholy", "down",
            ],
            "angry": [
                "angry", "furious", "mad", "rage", "irritated", "annoyed",
                "outraged", "livid", "hate", "infuriating", "enraged",
            ],
            "anxious": [
                "anxious", "worried", "nervous", "scared", "panic",
                "stress", "stressed", "overwhelmed", "dread", "uneasy",
                "tense", "afraid", "restless", "overthinking",
            ],
            "fearful": [
                "fear", "terrified", "terrifying", "horrified", "afraid",
                "scared", "phobia", "nightmare",
            ],
            "disgusted": [
                "disgusted", "revolted", "gross", "repulsed", "sick",
                "nauseated", "appalled",
            ],
            "calm": [
                "calm", "peaceful", "relaxed", "serene", "tranquil",
                "content", "comfortable", "at ease", "mindful", "centered",
            ],
            "excited": [
                "excited", "pumped", "eager", "enthusiastic",
                "hyped", "stoked", "can't wait", "thrilled",
            ],
            "frustrated": [
                "frustrated", "stuck", "confused", "struggling", "difficult",
                "challenging", "can't figure", "doesn't work", "impossible",
            ],
            "surprised": [
                "surprised", "shocked", "amazed", "astonished", "wow",
                "unexpected", "unbelievable", "stunned",
            ],
        }

        scores: dict[str, float] = {}
        total = 0.0
        for emotion, keywords in keyword_map.items():
            count = sum(1 for k in keywords if k in lower)
            weight = count / len(keywords) if keywords else 0.0
            scores[emotion] = round(weight, 3)
            total += weight

        # Fill zero scores for any missing classes
        for e in ["happy", "sad", "angry", "anxious", "fearful", "calm",
                  "neutral", "excited", "frustrated", "disgusted", "contempt", "surprised"]:
            scores.setdefault(e, 0.0)

        if total > 0:
            for k in scores:
                scores[k] = round(scores[k] / total, 3)
            dominant = max(scores, key=scores.get)  # type: ignore
            confidence = min(90.0, max(30.0, scores[dominant] * 100))
        else:
            scores["neutral"] = 1.0
            dominant = "neutral"
            confidence = 50.0

        # Derive qualitative signals
        stress = "high" if dominant in {"anxious", "fearful", "angry"} else \
                 "medium" if dominant in {"sad", "frustrated", "disgusted"} else "low"
        sentiment = "positive" if dominant in POSITIVE_EMOTIONS else \
                    "negative" if dominant in NEGATIVE_EMOTIONS else "neutral"

        # Simple intent heuristic
        intent = "casual"
        if any(w in lower for w in ["help", "please help", "don't know what to do", "advice"]):
            intent = "seek_support"
        elif any(w in lower for w in ["ugh", "so annoying", "hate this", "can't stand"]):
            intent = "vent"
        elif lower.endswith("?") or lower.startswith(("what", "why", "how", "when", "where", "who")):
            intent = "ask_question"

        return EmotionResult(
            emotion=dominant,
            confidence=confidence,
            scores=scores,
            modality="text",
            sentiment=sentiment,
            stress_level=stress,
            intent=intent,
        )

    def _cache_put(self, key: str, result: EmotionResult) -> None:
        """LRU cache insert."""
        if key in self._cache:
            self._cache_order.remove(key)
        elif len(self._cache) >= self._max_cache:
            oldest = self._cache_order.pop(0)
            self._cache.pop(oldest, None)
        self._cache[key] = result
        self._cache_order.append(key)


# ── Voice Emotion Analyzer ────────────────────────────────────────────────────

class VoiceEmotionAnalyzer(EmotionAnalyzer):
    """Voice emotion analyzer — architecture stub.

    Future implementation: wav2vec2 or SpeechBrain fine-tuned on IEMOCAP.
    Current: returns unavailable so fusion skips voice modality.
    """

    @property
    def modality(self) -> str:
        return "voice"

    @property
    def is_available(self) -> bool:
        return False  # Not yet implemented

    async def analyze(self, input_data: Any) -> EmotionResult:
        return EmotionResult(
            emotion="neutral", confidence=0.0,
            scores={"neutral": 1.0}, modality="voice", is_mock=True,
        )
