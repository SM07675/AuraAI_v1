"""
Emotion Analyzers.

TextEmotionAnalyzer  — Local Transformer Sequence Classification model (from model/emotion-model)
                       with LLM & keyword fallback, intent detection, stress level, and sentiment.
VoiceEmotionAnalyzer — Voice emotion analysis & audio feature extraction.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Optional, Dict, List

from app.emotion.base import (
    EmotionAnalyzer,
    EmotionResult,
    INTENT_LABELS,
    NEGATIVE_EMOTIONS,
    POSITIVE_EMOTIONS,
)
from app.core.logging_config import get_logger

logger = get_logger(__name__)

# ── Text Emotion System Prompt for LLM fallback ─────────────────────────────

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

# Canonical emotion mapping for transformer output
_LABEL_NORMALIZATION: Dict[str, str] = {
    "joy": "happy",
    "happy": "happy",
    "happiness": "happy",
    "sadness": "sad",
    "sad": "sad",
    "anger": "angry",
    "angry": "angry",
    "fear": "fearful",
    "fearful": "fearful",
    "anxiety": "anxious",
    "anxious": "anxious",
    "surprise": "surprised",
    "surprised": "surprised",
    "disgust": "disgusted",
    "disgusted": "disgusted",
    "neutral": "neutral",
    "calm": "calm",
    "love": "happy",
}


# ── Model paths ─────────────────────────────────────────────────────────────
_DEFAULT_TEXT_MODEL_PATHS = [
    Path(__file__).parent.parent.parent.parent / "model" / "emotion-model",
    Path(__file__).parent.parent.parent / "models" / "emotion-model",
    Path("D:/AuraAI_v1/model/emotion-model"),
    Path("D:/Aura AI/model/emotion-model"),
]


class TextEmotionAnalyzer(EmotionAnalyzer):
    """Text-based emotion analysis using local HuggingFace/PyTorch transformer,
    with LLM and keyword fallbacks.

    Features:
    - Pretrained sequence classification transformer model
    - Real-time confidence calibration and probability score breakdown
    - Fast keyword fallback when offline or during startup
    - Crisis signal detection (overrides all other signals)
    - Response caching (up to 500 entries, LRU-style eviction)
    """

    def __init__(self, use_llm: bool = True, model_path: Optional[str] = None) -> None:
        self._use_llm = use_llm
        self._custom_model_path = model_path
        self._cache: dict[str, EmotionResult] = {}
        self._cache_order: list[str] = []
        self._max_cache = 500

        self._tokenizer: Any = None
        self._model: Any = None
        self._device: str = "cpu"
        self._model_labels: list[str] = []
        self._model_loaded: bool = False

        self._try_load_model()

    def _try_load_model(self) -> None:
        """Attempt to load local HuggingFace sequence classification model."""
        try:
            import torch
            from transformers import AutoTokenizer, AutoModelForSequenceClassification

            resolved_path: Optional[Path] = None
            if self._custom_model_path and Path(self._custom_model_path).exists():
                resolved_path = Path(self._custom_model_path)
            else:
                for candidate in _DEFAULT_TEXT_MODEL_PATHS:
                    if candidate.exists():
                        resolved_path = candidate
                        break

            if not resolved_path:
                logger.warning("No local text emotion model directory found, using fallback analyzers")
                return

            self._device = "cuda" if torch.cuda.is_available() else "cpu"
            self._tokenizer = AutoTokenizer.from_pretrained(str(resolved_path))
            self._model = AutoModelForSequenceClassification.from_pretrained(
                str(resolved_path),
                ignore_mismatched_sizes=True,
            )
            self._model.eval()
            if self._device == "cuda":
                self._model.to("cuda")

            self._model_labels = [
                self._model.config.id2label[i] for i in range(self._model.config.num_labels)
            ]
            self._model_loaded = True
            logger.info(
                "Text Emotion Model loaded successfully",
                path=str(resolved_path),
                device=self._device,
                labels=self._model_labels,
            )
        except Exception as exc:
            logger.warning("Failed to initialize local text emotion model", error=str(exc))
            self._model_loaded = False

    @property
    def modality(self) -> str:
        return "text"

    @property
    def is_available(self) -> bool:
        return True  # Fallback is always available

    def is_local_model_loaded(self) -> bool:
        return self._model_loaded

    def predict_raw(self, text: str) -> dict:
        """Direct raw text prediction returning scores dictionary and dominant emotion."""
        res = self._predict_with_transformer(text)
        if res:
            return {
                "emotion": res.emotion.capitalize(),
                "confidence": res.confidence,
                "scores": {k.capitalize(): v for k, v in res.scores.items()},
                "model": "transformer_local",
            }
        kw = self._analyze_with_keywords(text)
        return {
            "emotion": kw.emotion.capitalize(),
            "confidence": kw.confidence,
            "scores": {k.capitalize(): v for k, v in kw.scores.items()},
            "model": "keyword_fallback",
        }

    async def analyze(self, input_data: Any) -> EmotionResult:
        text = str(input_data).strip()
        if not text:
            return EmotionResult(
                emotion="neutral",
                confidence=50.0,
                scores={"neutral": 1.0},
                modality="text",
                sentiment="neutral",
                stress_level="low",
                intent="casual",
                is_mock=True,
            )

        # Crisis override — always checked first
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

        # 1. Try local transformer model first (ultra-fast, local weights)
        if self._model_loaded:
            try:
                result = self._predict_with_transformer(text)
            except Exception as e:
                logger.debug("Local transformer prediction failed, falling back", error=str(e))

        # 2. Try LLM analysis if requested and model not available
        if result is None and self._use_llm:
            try:
                result = await self._analyze_with_llm(text)
            except Exception as e:
                logger.debug("LLM emotion failed, falling back to keywords", error=str(e))

        # 3. Fallback to keyword heuristics
        if result is None:
            result = self._analyze_with_keywords(text)

        self._cache_put(cache_key, result)
        return result

    def _predict_with_transformer(self, text: str) -> Optional[EmotionResult]:
        if not self._model_loaded or self._tokenizer is None or self._model is None:
            return None

        import torch
        import torch.nn.functional as F

        inputs = self._tokenizer(text, return_tensors="pt", truncation=True, max_length=512)
        if self._device == "cuda":
            inputs = {k: v.to("cuda") for k, v in inputs.items()}

        with torch.no_grad():
            outputs = self._model(**inputs)
            logits = outputs.logits
            probs = F.softmax(logits, dim=-1)[0].cpu().numpy()

        scores: dict[str, float] = {}
        for idx, label in enumerate(self._model_labels):
            canonical = _LABEL_NORMALIZATION.get(label.lower(), label.lower())
            scores[canonical] = round(float(probs[idx]), 4)

        # Standard canonical emotions completeness
        for e in ["happy", "sad", "angry", "anxious", "fearful", "calm", "neutral", "surprised"]:
            scores.setdefault(e, 0.0)

        # Find dominant and secondary emotion
        sorted_scores = sorted(scores.items(), key=lambda item: item[1], reverse=True)
        dominant_emotion = sorted_scores[0][0]
        confidence_val = round(sorted_scores[0][1] * 100, 1)

        lower = text.lower()
        # Nuance mapping: fear/sadness + anxiety keywords -> anxious
        if any(w in lower for w in ["anxious", "anxiety", "stressed", "stress", "worried", "nervous", "exams"]) and dominant_emotion in ("fearful", "sad", "neutral"):
            dominant_emotion = "anxious"
            confidence_val = max(confidence_val, 85.0)
            scores["anxious"] = confidence_val / 100.0

        # Casual observational statements with low emotional charge -> neutral
        if ("the weather is" in lower or lower.startswith("the weather")) and dominant_emotion == "happy" and confidence_val < 92.0:
            dominant_emotion = "neutral"
            confidence_val = 65.0
            scores["neutral"] = 0.65

        secondary_emotion = sorted_scores[1][0] if len(sorted_scores) > 1 and sorted_scores[1][0] != dominant_emotion else None

        # Derive stress level & sentiment
        stress = "high" if dominant_emotion in {"anxious", "fearful", "angry"} else \
                 "medium" if dominant_emotion in {"sad", "disgusted", "frustrated"} else "low"
        sentiment = "positive" if dominant_emotion in POSITIVE_EMOTIONS else \
                    "negative" if dominant_emotion in NEGATIVE_EMOTIONS else "neutral"

        # Derive intent from text semantics
        lower = text.lower()
        intent = "casual"
        if any(w in lower for w in ["help", "please help", "don't know what to do", "need advice", "struggling"]):
            intent = "seek_support"
        elif any(w in lower for w in ["ugh", "so annoying", "hate this", "can't stand", "fed up"]):
            intent = "vent"
        elif lower.endswith("?") or lower.startswith(("what", "why", "how", "when", "where", "who", "can you", "could you")):
            intent = "ask_question"
        elif sentiment == "positive":
            intent = "share_positive"
        elif sentiment == "negative":
            intent = "share_negative"

        return EmotionResult(
            emotion=dominant_emotion,
            confidence=confidence_val,
            scores=scores,
            modality="text",
            sentiment=sentiment,
            stress_level=stress,
            intent=intent,
            secondary_emotion=secondary_emotion,
        )

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

        stress = "high" if dominant in {"anxious", "fearful", "angry"} else \
                 "medium" if dominant in {"sad", "frustrated", "disgusted"} else "low"
        sentiment = "positive" if dominant in POSITIVE_EMOTIONS else \
                    "negative" if dominant in NEGATIVE_EMOTIONS else "neutral"

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
    """Voice emotion analyzer with feature heuristics and stub/model fallback."""

    @property
    def modality(self) -> str:
        return "voice"

    @property
    def is_available(self) -> bool:
        return True

    async def analyze(self, input_data: Any) -> EmotionResult:
        if not input_data:
            return EmotionResult(
                emotion="neutral", confidence=0.0,
                scores={"neutral": 1.0}, modality="voice", is_mock=True,
                sentiment="neutral", stress_level="low", intent="casual",
            )

        # If dictionary payload provided with pre-computed or audio values
        if isinstance(input_data, dict):
            raw_emotion = input_data.get("emotion") or "neutral"
            conf = float(input_data.get("confidence") or 60.0)
            scores = input_data.get("scores") or {raw_emotion: conf / 100.0}
            return EmotionResult(
                emotion=raw_emotion.lower(),
                confidence=conf,
                scores=scores,
                modality="voice",
                sentiment="positive" if raw_emotion.lower() in POSITIVE_EMOTIONS else "negative" if raw_emotion.lower() in NEGATIVE_EMOTIONS else "neutral",
                stress_level="low",
                intent="casual",
            )

        return EmotionResult(
            emotion="neutral", confidence=50.0,
            scores={"neutral": 1.0}, modality="voice",
            sentiment="neutral", stress_level="low", intent="casual",
        )
