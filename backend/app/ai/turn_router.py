"""
Turn Router & Model Routing for Aura AI 2.0.

Section 14 & 29 of the Architecture:
- Fast Path for simple requests (acknowledgements, greetings, short check-ins)
  skips expensive graph retrieval, vector search, and deep reasoning to deliver
  sub-200ms latency.
- Deep Path for complex requests (emotional distress, project planning, questions)
  invokes full hybrid retrieval, knowledge graph, and deep thinking.
- Dynamic model & temperature routing based on utterance complexity.
"""

from __future__ import annotations

import re
from dataclasses import dataclass


_FAST_PATH_EXACT_MATCHES = frozenset({
    "hi", "hello", "hey", "hola", "namaste", "namaskar", "good morning",
    "good afternoon", "good evening", "good night", "bye", "goodbye",
    "thanks", "thank you", "thx", "dhanyawad", "shukriya", "ok", "okay",
    "k", "yes", "no", "yep", "nope", "sure", "cool", "great", "nice",
    "got it", "fine", "i am good", "all good", "listening", "ping", "test"
})

_COMPLEX_INDICATORS = frozenset({
    "why", "how", "explain", "help", "problem", "struggle", "worried", "sad",
    "depressed", "anxious", "panic", "stress", "tired", "scared", "goal",
    "project", "career", "interview", "placement", "python", "code", "aurai",
    "nvidia", "study", "feel", "hurt", "broke", "lost", "confused", "suggest",
    "advice", "kya karu", "kaise karu", "pareshan", "tanav", "bechaini"
})


@dataclass
class RouteDecision:
    """Routing decision for a conversational turn."""
    is_fast_path: bool
    requires_knowledge_graph: bool
    requires_semantic_memory: bool
    enable_thinking: bool
    max_tokens: int
    temperature: float
    reason: str


class TurnRouter:
    """Lightweight classifier determining retrieval depth and model routing."""

    @classmethod
    def classify(
        cls,
        user_message: str,
        mode: str = "chat",
        turn_count: int = 1,
    ) -> RouteDecision:
        """Classify turn into Fast Path or Deep Path with optimal model parameters."""
        text = (user_message or "").strip().lower()
        clean = re.sub(r"[^\w\s]", "", text).strip()
        words = clean.split()

        # 1. Exact match check for fast conversational acknowledgements
        if clean in _FAST_PATH_EXACT_MATCHES or text in _FAST_PATH_EXACT_MATCHES:
            return RouteDecision(
                is_fast_path=True,
                requires_knowledge_graph=False,
                requires_semantic_memory=False,
                enable_thinking=False,
                max_tokens=256,
                temperature=0.6,
                reason="exact_fast_phrase",
            )

        # 2. Real-time live voice mode prioritizes low latency
        is_realtime = mode in ("live", "voice", "face_to_face")

        # 3. Short utterance under 6 words in real-time live mode without complex indicators
        has_complex_trigger = any(indicator in clean for indicator in _COMPLEX_INDICATORS)
        if is_realtime and len(words) <= 6 and not has_complex_trigger:
            return RouteDecision(
                is_fast_path=True,
                requires_knowledge_graph=False,
                requires_semantic_memory=False,
                enable_thinking=False,
                max_tokens=384,
                temperature=0.65,
                reason="short_simple_turn",
            )

        # 4. Deep Path for complex, emotional, or multi-topic questions
        return RouteDecision(
            is_fast_path=False,
            requires_knowledge_graph=True,
            requires_semantic_memory=True,
            enable_thinking=not is_realtime and len(words) > 12,
            max_tokens=1024 if is_realtime else 2048,
            temperature=0.7,
            reason="complex_deep_turn",
        )
