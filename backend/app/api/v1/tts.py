"""
Neural Text-to-Speech (TTS) API Router.

Provides ultra-natural, human-like voice synthesis using Microsoft Edge Neural voices.
Features:
- Markdown and emoji cleaning to prevent robotic symbol pronunciation
- Emotion-aware prosody and speech rate modulation
- High-speed in-memory audio caching for instantaneous responses
- Rich curated voice library with preview support
"""

from __future__ import annotations

import asyncio
import hashlib
import io
import re
from typing import Any, Dict, List, Optional
from collections import OrderedDict

from fastapi import APIRouter, HTTPException, Query, Response, status
from pydantic import BaseModel, Field

from app.core.logging_config import get_logger

logger = get_logger(__name__)
router = APIRouter(prefix="/tts", tags=["Text-to-Speech"])

# In-memory LRU audio cache (stores up to 200 synthesized audio clips)
MAX_CACHE_SIZE = 200
_audio_cache: OrderedDict[str, bytes] = OrderedDict()
_cache_lock = asyncio.Lock()


# ── Text Cleaning & Prosody Helpers ──────────────────────────────────────────

def clean_text_for_speech(text: str) -> str:
    """Preprocess AI text to sound completely natural when spoken.
    
    Strips raw markdown syntax, code snippets, URLs, and noisy emojis
    that cause TTS synthesizers to stutter or read out symbols.
    """
    if not text:
        return ""

    # 1. Remove code blocks ```...``` and inline code `...`
    t = re.sub(r"```[\s\S]*?```", " [code snippet omitted] ", text)
    t = re.sub(r"`([^`]+)`", r"\1", t)

    # 2. Convert markdown links [Text](url) -> Text
    t = re.sub(r"\[([^\]]+)\]\([^\)]+\)", r"\1", t)

    # 3. Strip markdown headers (#, ##, ###, etc.)
    t = re.sub(r"#{1,6}\s*", "", t)

    # 4. Strip bold / italics / strikethrough (**text**, *text*, ~~text~~, __text__)
    t = re.sub(r"\*\*([^*]+)\*\*", r"\1", t)
    t = re.sub(r"\*([^*]+)\*", r"\1", t)
    t = re.sub(r"__([^_]+)__", r"\1", t)
    t = re.sub(r"_([^_]+)_", r"\1", t)
    t = re.sub(r"~~([^~]+)~~", r"\1", t)

    # 5. Clean list bullets and numbering (e.g., "- item", "* item", "1. item")
    t = re.sub(r"^\s*[-*+]\s+", "", t, flags=re.MULTILINE)
    t = re.sub(r"^\s*\d+\.\s+", "", t, flags=re.MULTILINE)

    # 6. Clean blockquotes (> text)
    t = re.sub(r"^\s*>\s*", "", t, flags=re.MULTILINE)

    # 7. Remove raw URLs (http://... or https://...)
    t = re.sub(r"https?://\S+", "", t)

    # 8. Remove emojis and non-standard unicode symbols that make TTS read emoji names
    # Keep standard alphanumeric, punctuation, spaces
    emoji_pattern = re.compile(
        "["
        "\U0001F600-\U0001F64F"  # emoticons
        "\U0001F300-\U0001F5FF"  # symbols & pictographs
        "\U0001F680-\U0001F6FF"  # transport & map symbols
        "\U0001F1E0-\U0001F1FF"  # flags (iOS)
        "\U00002702-\U000027B0"  # Dingbats
        "\U000024C2-\U0001F251"
        "\U0001F900-\U0001F9FF"  # Supplemental Symbols and Pictographs
        "\U0001FA70-\U0001FAFF"  # Symbols and Pictographs Extended-A
        "]+",
        flags=re.UNICODE,
    )
    t = emoji_pattern.sub(" ", t)

    # 9. Clean repeated punctuation (e.g. "....." -> "...", "---" -> ", ")
    t = re.sub(r"\.{4,}", "...", t)
    t = re.sub(r"[-—_]{2,}", ", ", t)

    # 10. Clean up spaces before punctuation (e.g. "word !" -> "word!")
    t = re.sub(r"\s+([,.!?;:])", r"\1", t)

    # 11. Normalize multiple spaces and newlines to natural pause spaces
    t = re.sub(r"\s+", " ", t).strip()

    return t


def get_emotion_prosody(emotion: Optional[str] = None) -> tuple[str, str]:
    """Return tuned (rate, pitch) offsets for specific emotional contexts."""
    if not emotion:
        return "+0%", "+0Hz"

    emo = emotion.lower().strip()
    if emo in ("sad", "sadness", "depressed", "grief"):
        return "-4%", "-2Hz"
    elif emo in ("anxious", "anxiety", "fear", "stress", "calm", "soothing"):
        return "-5%", "-1Hz"
    elif emo in ("happy", "joy", "excited", "cheerful"):
        return "+3%", "+2Hz"
    elif emo in ("angry", "frustrated"):
        return "+2%", "-1Hz"
    elif emo in ("thoughtful", "reflective", "empathetic"):
        return "-3%", "+0Hz"

    return "+0%", "+0Hz"


# ── Curated Voice Catalog ───────────────────────────────────────────────────

CURATED_VOICES = [
    {
        "id": "en-US-AriaNeural",
        "name": "Aura (Warm & Empathetic)",
        "gender": "Female",
        "locale": "en-US",
        "accent": "American",
        "persona": "Warm, engaging, highly empathetic companion voice",
        "is_default": True,
    },
    {
        "id": "en-US-JennyNeural",
        "name": "Jenny (Gentle & Soothing)",
        "gender": "Female",
        "locale": "en-US",
        "accent": "American",
        "persona": "Calm, gentle, mindful therapeutic tone",
        "is_default": False,
    },
    {
        "id": "en-US-AvaMultilingualNeural",
        "name": "Ava (Modern & Expressive)",
        "gender": "Female",
        "locale": "en-US",
        "accent": "American",
        "persona": "Natural, dynamic, lifelike modern voice",
        "is_default": False,
    },
    {
        "id": "en-US-EmmaNeural",
        "name": "Emma (Patient Guide)",
        "gender": "Female",
        "locale": "en-US",
        "accent": "American",
        "persona": "Supportive, clear, encouraging guide",
        "is_default": False,
    },
    {
        "id": "en-US-GuyNeural",
        "name": "Guy (Confident & Reassuring)",
        "gender": "Male",
        "locale": "en-US",
        "accent": "American",
        "persona": "Deep, natural, reassuring male companion",
        "is_default": False,
    },
    {
        "id": "en-US-AndrewMultilingualNeural",
        "name": "Andrew (Warm & Friendly)",
        "gender": "Male",
        "locale": "en-US",
        "accent": "American",
        "persona": "Conversational, articulate, friendly male voice",
        "is_default": False,
    },
    {
        "id": "en-GB-SoniaNeural",
        "name": "Sonia (British Elegance)",
        "gender": "Female",
        "locale": "en-GB",
        "accent": "British",
        "persona": "Gentle, polished British English",
        "is_default": False,
    },
    {
        "id": "en-AU-NatashaNeural",
        "name": "Natasha (Australian Warmth)",
        "gender": "Female",
        "locale": "en-AU",
        "accent": "Australian",
        "persona": "Relaxed, natural Australian English",
        "is_default": False,
    },
    {
        "id": "en-IN-NeerjaNeural",
        "name": "Neerja (Indian English)",
        "gender": "Female",
        "locale": "en-IN",
        "accent": "Indian",
        "persona": "Fluent, warm Indian English voice",
        "is_default": False,
    },
]


class SynthesizeRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=5000, description="Text to synthesize")
    voice: Optional[str] = Field("en-US-AriaNeural", description="Neural voice identifier")
    rate: Optional[str] = Field(None, description="Speech rate adjustment, e.g. '+0%', '-5%'")
    pitch: Optional[str] = Field(None, description="Speech pitch adjustment, e.g. '+0Hz', '-2Hz'")
    emotion: Optional[str] = Field(None, description="Emotional context for prosody tuning")


# ── Endpoints ───────────────────────────────────────────────────────────────

@router.get("/voices")
async def list_curated_voices() -> Dict[str, Any]:
    """Get the curated list of natural human neural voices."""
    return {
        "voices": CURATED_VOICES,
        "default_voice": "en-US-AriaNeural",
        "count": len(CURATED_VOICES),
    }


@router.post("/synthesize")
async def synthesize_speech_post(request: SynthesizeRequest) -> Response:
    """Synthesize text into high-fidelity neural MP3 audio (POST)."""
    return await _synthesize_audio_stream(
        text=request.text,
        voice=request.voice or "en-US-AriaNeural",
        rate=request.rate,
        pitch=request.pitch,
        emotion=request.emotion,
    )


@router.get("/synthesize")
async def synthesize_speech_get(
    text: str = Query(..., min_length=1, max_length=5000),
    voice: str = Query("en-US-AriaNeural"),
    rate: Optional[str] = Query(None),
    pitch: Optional[str] = Query(None),
    emotion: Optional[str] = Query(None),
) -> Response:
    """Synthesize text into high-fidelity neural MP3 audio (GET)."""
    return await _synthesize_audio_stream(
        text=text,
        voice=voice,
        rate=rate,
        pitch=pitch,
        emotion=emotion,
    )


async def _synthesize_audio_stream(
    text: str,
    voice: str,
    rate: Optional[str] = None,
    pitch: Optional[str] = None,
    emotion: Optional[str] = None,
) -> Response:
    """Internal helper to clean text, synthesize audio using edge-tts, and return MP3."""
    clean_text = clean_text_for_speech(text)
    if not clean_text:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Provided text contains no speakable content.",
        )

    # Determine rate and pitch
    emo_rate, emo_pitch = get_emotion_prosody(emotion)
    final_rate = rate if rate is not None else emo_rate
    final_pitch = pitch if pitch is not None else emo_pitch

    # Check cache key
    cache_key = hashlib.sha256(
        f"{clean_text}::{voice}::{final_rate}::{final_pitch}".encode("utf-8")
    ).hexdigest()

    async with _cache_lock:
        if cache_key in _audio_cache:
            _audio_cache.move_to_end(cache_key)
            audio_bytes = _audio_cache[cache_key]
            return Response(
                content=audio_bytes,
                media_type="audio/mpeg",
                headers={
                    "Cache-Control": "public, max-age=86400",
                    "X-TTS-Cache": "HIT",
                    "X-TTS-Voice": voice,
                },
            )

    try:
        import edge_tts

        communicate = edge_tts.Communicate(
            text=clean_text,
            voice=voice,
            rate=final_rate,
            pitch=final_pitch,
        )

        audio_buffer = bytearray()
        async for chunk in communicate.stream():
            if chunk["type"] == "audio" and chunk.get("data"):
                audio_buffer.extend(chunk["data"])

        if not audio_buffer:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Neural TTS returned empty audio stream.",
            )

        audio_bytes = bytes(audio_buffer)

        # Store in LRU cache
        async with _cache_lock:
            if len(_audio_cache) >= MAX_CACHE_SIZE:
                _audio_cache.popitem(last=False)
            _audio_cache[cache_key] = audio_bytes

        return Response(
            content=audio_bytes,
            media_type="audio/mpeg",
            headers={
                "Cache-Control": "public, max-age=86400",
                "X-TTS-Cache": "MISS",
                "X-TTS-Voice": voice,
            },
        )

    except Exception as exc:
        logger.error("Neural TTS synthesis error", voice=voice, error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Speech synthesis failed: {str(exc)}",
        )
