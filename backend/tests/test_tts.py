"""
Tests for Neural TTS Endpoint and Text Normalization.
"""

import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.api.v1.tts import clean_text_for_speech, get_emotion_prosody


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


@pytest.mark.asyncio
async def test_tts_voices_list():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/v1/tts/voices")
        assert response.status_code == 200
        data = response.json()
        assert "voices" in data
        assert len(data["voices"]) >= 5
        assert data["default_voice"] == "en-US-AriaNeural"


@pytest.mark.asyncio
async def test_tts_synthesize_endpoint():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/tts/synthesize",
            json={
                "text": "Hello, this is a test of the Aura neural voice synthesis.",
                "voice": "en-US-AriaNeural",
                "emotion": "calm",
            },
        )
        assert response.status_code == 200
        assert response.headers["content-type"] == "audio/mpeg"
        assert len(response.content) > 100
