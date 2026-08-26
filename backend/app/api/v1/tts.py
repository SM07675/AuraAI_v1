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

from app.core.config import get_settings
from app.core.logging_config import get_logger

logger = get_logger(__name__)
settings = get_settings()
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
    t = re.sub(r"```[\s\S]*?```", " ", text)
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

    # 9. Clean repeated punctuation
    t = re.sub(r"\.{4,}", "...", t)
    t = re.sub(r"[-—_]{2,}", ", ", t)

    # 10. Clean up spaces before punctuation (e.g. "word !" -> "word!")
    t = re.sub(r"\s+([,.!?;:।॥])", r"\1", t)

    # Normalize repeated sentence terminators without removing Devanagari danda.
    t = re.sub(r"([।॥!?])\1+", r"\1", t)

    # 11. Normalize multiple spaces and newlines to natural pause spaces
    t = re.sub(r"\s+", " ", t).strip()

    return t


# ── ElevenLabs to EdgeTTS Mapping ───────────────────────────────────────────

ELEVENLABS_TO_EDGETTS_MAP = {
    "Xb7hH8MSUJpSbSDYk0k2": "en-US-AvaMultilingualNeural",
    "EXAVITQu4vr4xnSDxMaL": "en-US-EmmaMultilingualNeural",
}


def is_hindi_text(text: str) -> bool:
    """Check if the text contains Devanagari Hindi characters."""
    if not text:
        return False
    return bool(re.search(r"[\u0900-\u097F]", text))


def resolve_edgetts_voice(requested_voice: Optional[str], text: str) -> str:
    """Resolve requested voice to a valid, high-fidelity Microsoft Edge Neural voice.
    
    Guarantees:
    - If text contains Devanagari Hindi characters, automatically maps to a Hindi neural voice
      (hi-IN-MadhurNeural for male, hi-IN-SwaraNeural for female).
    - If an ElevenLabs voice ID or unknown identifier was passed, maps to a compatible Edge voice.
    """
    req = (requested_voice or "").strip()
    is_hindi = is_hindi_text(text)
    is_male = any(k in req.lower() for k in ("madhur", "prabhat", "male", "guy", "boy"))

    if is_hindi:
        return "hi-IN-MadhurNeural" if is_male else "hi-IN-SwaraNeural"

    if req in ELEVENLABS_TO_EDGETTS_MAP:
        return ELEVENLABS_TO_EDGETTS_MAP[req]

    # If it already looks like a valid Azure/Edge Neural voice ID (e.g. en-US-AvaMultilingualNeural, hi-IN-SwaraNeural)
    if req.endswith("Neural") and "-" in req:
        return req

    # Safe default for general English/Multilingual text
    return "en-IN-PrabhatNeural" if is_male else "en-IN-NeerjaExpressiveNeural"


def get_emotion_prosody(emotion: Optional[str] = None, voice: Optional[str] = None, text: Optional[str] = None) -> tuple[str, str]:
    """Return tuned (rate, pitch) offsets for specific emotional and language contexts."""
    if (voice and voice.startswith("hi-IN-")) or (text and is_hindi_text(text)):
        # Hindi voices sound most natural at balanced human tempo
        return "+0%", "+0Hz"

    if not emotion:
        return "+0%", "+0Hz"

    emo = emotion.lower().strip()
    if emo in ("sad", "sadness", "depressed", "grief"):
        return "-4%", "-2Hz"
    elif emo in ("anxious", "anxiety", "fear", "stress", "calm", "soothing"):
        return "-3%", "-1Hz"
    elif emo in ("happy", "joy", "excited", "cheerful"):
        return "+3%", "+2Hz"
    elif emo in ("angry", "frustrated"):
        return "+2%", "-1Hz"
    elif emo in ("thoughtful", "reflective", "empathetic"):
        return "-2%", "+0Hz"

    return "+0%", "+0Hz"


def get_voice_prosody(voice: str, emotion: Optional[str] = None) -> tuple[str, str]:
    """Return natural prosody adjusted for the selected voice locale.

    Hindi neural voices are clearer at a slightly more measured default pace.
    Emotion-specific slower rates are already suitable and are left unchanged.
    """
    rate, pitch = get_emotion_prosody(emotion)
    if voice.startswith("hi-IN-"):
        if rate == "+0%":
            rate = "-4%"
        elif rate.startswith("+"):
            rate_value = max(0, int(rate.removesuffix("%")) - 2)
            rate = f"+{rate_value}%"
    return rate, pitch


# ── Curated Voice Catalog ───────────────────────────────────────────────────

CURATED_VOICES = [
    {
        "id": "Xb7hH8MSUJpSbSDYk0k2",
        "name": "Alice (ElevenLabs Free - Best)",
        "gender": "Female",
        "locale": "en-US",
        "accent": "Natural Multilingual",
        "persona": "Clear, engaging, warm conversational voice (ElevenLabs Free)",
        "is_default": True,
    },
    {
        "id": "EXAVITQu4vr4xnSDxMaL",
        "name": "Sarah (ElevenLabs Free - Reassuring)",
        "gender": "Female",
        "locale": "en-US",
        "accent": "Empathetic American",
        "persona": "Mature, reassuring, empathetic counselor voice (ElevenLabs Free)",
        "is_default": False,
    },
    {
        "id": "en-US-AvaMultilingualNeural",
        "name": "Ava (Natural Multilingual - Best)",
        "gender": "Female",
        "locale": "en-US",
        "accent": "Multilingual (English + Hindi)",
        "persona": "Ultra-natural, warm, highly expressive human voice supporting both English and Hindi",
        "is_default": False,
    },
    {
        "id": "en-US-EmmaMultilingualNeural",
        "name": "Emma (Empathetic Multilingual)",
        "gender": "Female",
        "locale": "en-US",
        "accent": "Multilingual (English + Hindi)",
        "persona": "Gentle, soothing, conversational multilingual voice",
        "is_default": False,
    },
    {
        "id": "hi-IN-SwaraNeural",
        "name": "Swara (Hindi & Hinglish)",
        "gender": "Female",
        "locale": "hi-IN",
        "accent": "Indian Hindi",
        "persona": "Warm, authentic Hindi & conversational Hinglish female voice",
        "is_default": False,
    },
    {
        "id": "hi-IN-MadhurNeural",
        "name": "Madhur (Hindi Male)",
        "gender": "Male",
        "locale": "hi-IN",
        "accent": "Indian Hindi",
        "persona": "Deep, calm, reassuring Hindi & Hinglish male voice",
        "is_default": False,
    },
    {
        "id": "en-IN-NeerjaNeural",
        "name": "Neerja (Indian Classic)",
        "gender": "Female",
        "locale": "en-IN",
        "accent": "Indian English",
        "persona": "Fluent, warm, clear Indian English female voice",
        "is_default": False,
    },
    {
        "id": "en-IN-PrabhatNeural",
        "name": "Prabhat (Indian Male)",
        "gender": "Male",
        "locale": "en-IN",
        "accent": "Indian English",
        "persona": "Clear, friendly, conversational Indian English male voice",
        "is_default": False,
    },
    {
        "id": "en-US-AriaNeural",
        "name": "Aria (Global Empathetic)",
        "gender": "Female",
        "locale": "en-US",
        "accent": "American",
        "persona": "Warm, engaging, highly empathetic companion voice",
        "is_default": False,
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
        "id": "en-GB-SoniaNeural",
        "name": "Sonia (British Elegance)",
        "gender": "Female",
        "locale": "en-GB",
        "accent": "British",
        "persona": "Gentle, polished British English",
        "is_default": False,
    },
    {
        "id": "mr-IN-AarohiNeural",
        "name": "Aarohi (Marathi)",
        "gender": "Female",
        "locale": "mr-IN",
        "accent": "Indian Marathi",
        "persona": "Authentic, fluent Marathi female voice",
        "is_default": False,
    },
]


class SynthesizeRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=5000, description="Text to synthesize")
    voice: Optional[str] = Field("en-IN-NeerjaExpressiveNeural", description="Neural voice identifier")
    rate: Optional[str] = Field(None, description="Speech rate adjustment, e.g. '+0%', '-5%'")
    pitch: Optional[str] = Field(None, description="Speech pitch adjustment, e.g. '+0Hz', '-2Hz'")
    emotion: Optional[str] = Field(None, description="Emotional context for prosody tuning")


# ── Endpoints ───────────────────────────────────────────────────────────────

@router.get("/voices")
async def list_curated_voices() -> Dict[str, Any]:
    """Get the curated list of natural human neural voices."""
    return {
        "voices": CURATED_VOICES,
        "default_voice": "en-IN-NeerjaExpressiveNeural",
        "count": len(CURATED_VOICES),
    }


@router.post("/synthesize")
async def synthesize_speech_post(request: SynthesizeRequest) -> Response:
    """Synthesize text into high-fidelity neural MP3 audio (POST)."""
    return await _synthesize_audio_stream(
        text=request.text,
        voice=request.voice or "en-IN-NeerjaExpressiveNeural",
        rate=request.rate,
        pitch=request.pitch,
        emotion=request.emotion,
    )


@router.get("/synthesize")
async def synthesize_speech_get(
    text: str = Query(..., min_length=1, max_length=5000),
    voice: str = Query("en-IN-NeerjaExpressiveNeural"),
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


async def _synthesize_elevenlabs(
    text: str,
    voice_id: Optional[str] = None,
    model_id: Optional[str] = None,
) -> Optional[bytes]:
    """Synthesize speech using ElevenLabs API with low-latency streaming."""
    api_key = settings.elevenlabs_api_key
    if not api_key:
        return None

    vid = voice_id or settings.elevenlabs_voice_id or "Xb7hH8MSUJpSbSDYk0k2"
    mid = model_id or settings.elevenlabs_model_id or "eleven_multilingual_v2"

    logger.info(f"[TTS] provider=elevenlabs")
    logger.info(f"[TTS] model={mid}")
    logger.info(f"[TTS] voice={vid}")
    logger.info(f"[TTS] request_started")

    url = f"https://api.elevenlabs.io/v1/text-to-speech/{vid}?optimize_streaming_latency=3"
    headers = {
        "xi-api-key": api_key,
        "Content-Type": "application/json",
        "Accept": "audio/mpeg",
    }
    payload = {
        "text": text,
        "model_id": mid,
        "voice_settings": {
            "stability": 0.5,
            "similarity_boost": 0.75,
            "style": 0.0,
            "use_speaker_boost": True,
        },
    }

    try:
        import httpx
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(url, json=payload, headers=headers)
            logger.info(f"[TTS] response_status={resp.status_code}")
            if resp.status_code == 200 and resp.content:
                audio_len = len(resp.content)
                logger.info(f"[TTS] audio_received={audio_len}")
                logger.info(f"[TTS] playback_ready=true")
                return resp.content
            logger.warning(
                f"[TTS] provider=elevenlabs status={resp.status_code} error={resp.text[:200]} - falling back"
            )
    except Exception as e:
        logger.warning(f"[TTS] provider=elevenlabs request_failed error={str(e)} - falling back")

    return None


async def _synthesize_audio_stream(
    text: str,
    voice: str,
    rate: Optional[str] = None,
    pitch: Optional[str] = None,
    emotion: Optional[str] = None,
) -> Response:
    """Synthesize audio using ElevenLabs as primary with automatic Edge Neural TTS fallback."""
    clean_text = clean_text_for_speech(text)
    if not clean_text:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Provided text contains no speakable content.",
        )

    # Determine resolved EdgeTTS voice and language attributes
    edge_voice = resolve_edgetts_voice(voice, clean_text)
    is_hindi = is_hindi_text(clean_text)

    # Determine rate and pitch
    emo_rate, emo_pitch = get_emotion_prosody(emotion, voice=edge_voice, text=clean_text)
    final_rate = rate if rate is not None else emo_rate
    final_pitch = pitch if pitch is not None else emo_pitch

    # Check cache key
    cache_key = hashlib.sha256(
        f"{clean_text}::{edge_voice}::{final_rate}::{final_pitch}".encode("utf-8")
    ).hexdigest()

    async with _cache_lock:
        if cache_key in _audio_cache:
            _audio_cache.move_to_end(cache_key)
            audio_bytes = _audio_cache[cache_key]
            logger.info(f"[TTS] cache_hit=true voice={edge_voice} bytes={len(audio_bytes)}")
            return Response(
                content=audio_bytes,
                media_type="audio/mpeg",
                headers={
                    "Cache-Control": "public, max-age=86400",
                    "X-TTS-Cache": "HIT",
                    "X-TTS-Voice": edge_voice,
                    "X-TTS-Language": edge_voice[:5],
                },
            )

    audio_bytes: Optional[bytes] = None
    provider_used = "EdgeTTS"

    # 1. Primary: Try ElevenLabs if configured
    if settings.tts_provider == "elevenlabs" or settings.elevenlabs_api_key:
        el_voice_id = voice if (voice and voice in ELEVENLABS_TO_EDGETTS_MAP) else None
        audio_bytes = await _synthesize_elevenlabs(clean_text, voice_id=el_voice_id)
        if audio_bytes:
            provider_used = "ElevenLabs"

    # 2. Fallback: High-quality Microsoft Edge Neural TTS
    if not audio_bytes:
        try:
            import edge_tts
            logger.info(f"[TTS] provider=edge_tts voice={edge_voice} request_started")

            communicate = edge_tts.Communicate(
                text=clean_text,
                voice=edge_voice,
                rate=final_rate,
                pitch=final_pitch,
            )

            audio_buffer = bytearray()
            async for chunk in communicate.stream():
                if chunk["type"] == "audio" and chunk.get("data"):
                    audio_buffer.extend(chunk["data"])

            if audio_buffer:
                audio_bytes = bytes(audio_buffer)
                provider_used = "EdgeTTS"
                logger.info(f"[TTS] provider=edge_tts audio_received={len(audio_bytes)} playback_ready=true")
        except Exception as exc:
            logger.warning(f"[TTS] provider=edge_tts primary voice error={str(exc)}", voice=edge_voice)

            # Secondary safety fallback if the specific voice had network/locale glitch
            try:
                import edge_tts
                fallback_voice = "hi-IN-SwaraNeural" if is_hindi else "en-US-AvaMultilingualNeural"
                if fallback_voice != edge_voice:
                    logger.info(f"[TTS] retrying edge_tts with fallback_voice={fallback_voice}")
                    comm_fallback = edge_tts.Communicate(
                        text=clean_text,
                        voice=fallback_voice,
                        rate=final_rate,
                        pitch=final_pitch,
                    )
                    fallback_buffer = bytearray()
                    async for chunk in comm_fallback.stream():
                        if chunk["type"] == "audio" and chunk.get("data"):
                            fallback_buffer.extend(chunk["data"])
                    if fallback_buffer:
                        audio_bytes = bytes(fallback_buffer)
                        edge_voice = fallback_voice
                        provider_used = "EdgeTTS"
            except Exception as fb_exc:
                logger.error(f"[TTS] provider=edge_tts secondary fallback error={str(fb_exc)}")

    if not audio_bytes:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="All TTS providers failed to synthesize audio.",
        )

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
            "X-TTS-Voice": edge_voice,
            "X-TTS-Provider": provider_used,
        },
    )
