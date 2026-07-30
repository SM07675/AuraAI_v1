"""
Emotion Service — orchestrates the full multi-modal emotion pipeline.

Entry point for the Conversation Engine. Coordinates all analyzers,
delegates fusion to EmotionFusion, and returns a single EmotionContext
for LLM injection.

Session lifecycle
-----------------
One EmotionService instance per voice/chat session (instantiated by
VoiceConversationManager or the chat endpoint). Maintains trend state
across turns via EmotionFusion.trend_buffer.

Memory policy
-------------
Per-turn emotions are NEVER stored to long-term memory.
Only recurring patterns (detected by EmotionFusion) produce a
conversation_trend signal that the MemoryBuilder may choose to store
after multiple sessions of consistent patterns.
"""

from __future__ import annotations

from typing import Any

from app.emotion.analyzers import TextEmotionAnalyzer, VoiceEmotionAnalyzer
from app.emotion.base import EmotionContext, EmotionResult
from app.emotion.face_analyzer import FaceEmotionAnalyzer
from app.emotion.fusion import EmotionFusion
from app.core.logging_config import get_logger

logger = get_logger(__name__)


class EmotionService:
    """Orchestrates multi-modal emotion analysis and fusion.

    Args:
        use_llm_text: If True, TextEmotionAnalyzer uses LLM first,
                      falls back to keywords. If False, keywords only.
    """

    def __init__(self, use_llm_text: bool = True) -> None:
        self._text = TextEmotionAnalyzer(use_llm=use_llm_text)
        self._voice = VoiceEmotionAnalyzer()
        self._face = FaceEmotionAnalyzer()
        self._fusion = EmotionFusion()

    # ── Single-modality shortcuts ─────────────────────────────────────────────

    async def analyze_text(self, text: str) -> EmotionResult:
        """Analyze text emotion only (no fusion)."""
        return await self._text.analyze(text)

    async def analyze_face(self, image_data: Any) -> EmotionResult:
        """Analyze face emotion only (no fusion)."""
        return await self._face.analyze(image_data)

    async def analyze_voice(self, audio_data: Any) -> EmotionResult:
        """Analyze voice emotion only (no fusion)."""
        return await self._voice.analyze(audio_data)

    # ── Full pipeline ─────────────────────────────────────────────────────────

    async def analyze_and_fuse(
        self,
        text: str | None = None,
        image_data: Any = None,
        audio_data: Any = None,
    ) -> EmotionContext:
        """Run all available analyzers and fuse into a single EmotionContext.

        This is the primary entry point for the Conversation Engine.
        The returned EmotionContext is the ONLY emotion representation
        passed to the LLM.

        Args:
            text: User's message text.
            image_data: Camera frame (base64 JPEG, bytes, or np.ndarray).
            audio_data: Voice audio (future — currently stub).

        Returns:
            EmotionContext ready for prompt injection.
        """
        text_result: EmotionResult | None = None
        face_result: EmotionResult | None = None
        voice_result: EmotionResult | None = None

        # Run analyzers concurrently where possible
        import asyncio
        tasks = []

        if text:
            tasks.append(("text", self._text.analyze(text)))
        if image_data and self._face.is_available:
            tasks.append(("face", self._face.analyze(image_data)))
        if audio_data and self._voice.is_available:
            tasks.append(("voice", self._voice.analyze(audio_data)))

        if tasks:
            labels = [t[0] for t in tasks]
            coros = [t[1] for t in tasks]
            results = await asyncio.gather(*coros, return_exceptions=True)

            for label, result in zip(labels, results):
                if isinstance(result, Exception):
                    logger.warning(f"{label} emotion analysis failed", error=str(result))
                    continue
                if label == "text":
                    text_result = result
                elif label == "face":
                    face_result = result
                elif label == "voice":
                    voice_result = result

        # Always log what sources were used
        available_sources = [
            s for s, r in [("text", text_result), ("face", face_result), ("voice", voice_result)]
            if r and not r.is_mock
        ]
        logger.debug("Emotion sources used", sources=available_sources)

        # Fuse and return EmotionContext
        return self._fusion.fuse(text=text_result, face=face_result, voice=voice_result)

    # ── Legacy compatibility ──────────────────────────────────────────────────

    async def analyze_and_fuse_legacy(
        self,
        text: str | None = None,
        audio_data: Any = None,
        image_data: Any = None,
    ) -> EmotionContext:
        """Backward-compatible alias for analyze_and_fuse."""
        return await self.analyze_and_fuse(
            text=text, audio_data=audio_data, image_data=image_data
        )

    def get_emotion_context(self) -> dict[str, Any]:
        """Return current session emotion as a plain dict (for legacy callers)."""
        buf = self._fusion.trend_buffer
        if not buf:
            return {"fused_emotion": "neutral", "confidence": 0.0, "sentiment": "neutral"}
        latest = buf[-1]
        return {
            "fused_emotion": latest.get("emotion", "neutral"),
            "confidence": 0.0,
            "sentiment": latest.get("sentiment", "neutral"),
            "stress_level": latest.get("stress", "low"),
        }

    def get_status(self) -> dict:
        """Return current emotion service status for the metrics endpoint."""
        return {
            "text_analyzer": "available",
            "face_analyzer": "available" if self._face.is_available else "unavailable (models not loaded)",
            "voice_analyzer": "stub (future)",
            "trend_turns": len(self._fusion.trend_buffer),
        }

    # ── Session lifecycle ─────────────────────────────────────────────────────

    def reset(self) -> None:
        """Reset session state (trend buffer). Call on session end."""
        self._fusion.reset()

    @property
    def face_available(self) -> bool:
        """True if the face emotion model is loaded and ready."""
        return self._face.is_available

    @property
    def trend_buffer(self) -> list[dict[str, Any]]:
        """Access the session emotion trend buffer."""
        return self._fusion.trend_buffer
