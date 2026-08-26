"""
Tests for Neural TTS Endpoint and Text Normalization.
"""

import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.api.v1.tts import (
    clean_text_for_speech,
    get_emotion_prosody,
    is_hindi_text,
    resolve_edgetts_voice,
)


def test_clean_text_for_speech():
    # 1. Bold and markdown removal
    raw = "Hello! **Welcome** to *Aura*. Let's check ### Section 1."
    clean = clean_text_for_speech(raw)
    assert clean == "Hello! Welcome to Aura. Let's check Section 1."
    assert "**" not in clean
    assert "*" not in clean
    assert "#" not in clean

    # 2. Markdown links and code
    raw_links = "Visit [OpenAI](https://openai.com) and run `npm start` now."
    clean_links = clean_text_for_speech(raw_links)
    assert "OpenAI" in clean_links
    assert "https://openai.com" not in clean_links
    assert "`" not in clean_links

    # 3. Emoji removal to prevent robot reading emoji labels
    raw_emoji = "I am happy 😊! Let's meditate 🧘 and relax ✨."
    clean_emoji = clean_text_for_speech(raw_emoji)
    assert "😊" not in clean_emoji
    assert "🧘" not in clean_emoji
    assert "✨" not in clean_emoji
    assert "I am happy! Let's meditate and relax." in clean_emoji

    # 4. Preserve Hindi matras and normalize Devanagari sentence punctuation
    raw_hindi = "  हिंदी ।। मैं ठीक हूँ  ।  ```print('not spoken')```"
    clean_hindi = clean_text_for_speech(raw_hindi)
    assert clean_hindi == "हिंदी। मैं ठीक हूँ।"


def test_hindi_text_detection_and_voice_resolver():
    # Test Devanagari detection
    assert is_hindi_text("नमस्ते, आप कैसे हैं?") is True
    assert is_hindi_text("Hello, how are you?") is False
    assert is_hindi_text("") is False

    # Test voice resolution for Hindi text
    assert resolve_edgetts_voice("Xb7hH8MSUJpSbSDYk0k2", "नमस्ते") == "hi-IN-SwaraNeural"
    assert resolve_edgetts_voice("en-IN-NeerjaExpressiveNeural", "नमस्ते") == "hi-IN-SwaraNeural"
    assert resolve_edgetts_voice("hi-IN-MadhurNeural", "नमस्ते") == "hi-IN-MadhurNeural"
    assert resolve_edgetts_voice("en-IN-PrabhatNeural", "नमस्ते") == "hi-IN-MadhurNeural"

    # Test voice resolution for English text
    assert resolve_edgetts_voice("Xb7hH8MSUJpSbSDYk0k2", "Hello") == "en-US-AvaMultilingualNeural"
    assert resolve_edgetts_voice("hi-IN-SwaraNeural", "Hello") == "hi-IN-SwaraNeural"


def test_emotion_prosody():
    r, p = get_emotion_prosody("sad")
    assert r == "-4%"
    assert p == "-2Hz"

    r_joy, p_joy = get_emotion_prosody("joy")
    assert r_joy == "+3%"
    assert p_joy == "+2Hz"

    r_none, p_none = get_emotion_prosody(None)
    assert r_none == "+0%"
    assert p_none == "+0Hz"

    # Hindi text prosody check
    r_hi, p_hi = get_emotion_prosody("sad", text="नमस्ते")
    assert r_hi == "+0%"
    assert p_hi == "+0Hz"


@pytest.mark.asyncio
async def test_tts_voices_list():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/v1/tts/voices")
        assert response.status_code == 200
        data = response.json()
        assert "voices" in data
        assert len(data["voices"]) >= 7
        assert data["default_voice"] == "en-IN-NeerjaExpressiveNeural"
        voice_ids = [v["id"] for v in data["voices"]]
        assert "hi-IN-SwaraNeural" in voice_ids
        assert "hi-IN-MadhurNeural" in voice_ids


@pytest.mark.asyncio
async def test_tts_synthesize_endpoint_hindi_and_english():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Hindi with explicit Hindi voice
        res1 = await client.post(
            "/api/v1/tts/synthesize",
            json={
                "text": "नमस्ते! यह ऑरा आवाज़ का परीक्षण है।",
                "voice": "hi-IN-SwaraNeural",
                "emotion": "calm",
            },
        )
        assert res1.status_code == 200
        assert res1.headers["content-type"] == "audio/mpeg"
        assert len(res1.content) > 100
        assert res1.headers.get("x-tts-voice") == "hi-IN-SwaraNeural"

        # 2. Hindi with ElevenLabs default voice ID (auto-mapped to hi-IN-SwaraNeural)
        res2 = await client.post(
            "/api/v1/tts/synthesize",
            json={
                "text": "नमस्ते! मैं आपकी मदद करने के लिए यहाँ हूँ।",
                "voice": "Xb7hH8MSUJpSbSDYk0k2",
            },
        )
        assert res2.status_code == 200
        assert res2.headers["content-type"] == "audio/mpeg"
        assert len(res2.content) > 100
        assert res2.headers.get("x-tts-voice") == "hi-IN-SwaraNeural"

        # 3. Hindi with English voice name (auto-mapped to hi-IN-SwaraNeural)
        res3 = await client.post(
            "/api/v1/tts/synthesize",
            json={
                "text": "आप आज कैसा महसूस कर रहे हैं?",
                "voice": "en-IN-NeerjaExpressiveNeural",
            },
        )
        assert res3.status_code == 200
        assert res3.headers["content-type"] == "audio/mpeg"
        assert len(res3.content) > 100
        assert res3.headers.get("x-tts-voice") == "hi-IN-SwaraNeural"

