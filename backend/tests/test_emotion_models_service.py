"""
Tests for local emotion and perception services and health check endpoint.
"""

from __future__ import annotations

import numpy as np
import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.services.emotion.text_emotion import TextEmotionService
from app.services.emotion.face_emotion import FaceEmotionService
from app.services.emotion.face_tracker import FaceTrackerService
from app.services.emotion.face_behavior import FaceBehaviorService
from app.services.emotion.voice_emotion import VoiceEmotionService
from app.services.emotion.emotion_fusion import EmotionFusionService
from app.services.speech.speech_to_text import SpeechToTextService


@pytest.mark.asyncio
async def test_text_emotion_service_inference():
    svc = TextEmotionService.get_instance()
    res = await svc.analyze("I am really happy and excited about my new job!")
    assert res["modality"] == "text"
    assert res["primary_emotion"] in ("happy", "excited", "joy")
    assert res["confidence"] > 0.5


@pytest.mark.asyncio
async def test_face_emotion_service_inference():
    svc = FaceEmotionService.get_instance()
    frame = np.ones((128, 128, 3), dtype=np.uint8) * 128
    res = await svc.analyze(frame)
    assert res["modality"] == "face"
    assert "primary_emotion" in res
    assert "confidence" in res


@pytest.mark.asyncio
async def test_face_tracker_and_behavior():
    tracker = FaceTrackerService.get_instance()
    frame = np.ones((480, 640, 3), dtype=np.uint8) * 100
    track_res = tracker.track_frame(frame)
    assert "face_detected" in track_res

    behavior = FaceBehaviorService.get_instance()
    au_res = behavior.extract_action_units([], {"happy": 0.8})
    assert "action_units" in au_res
    assert au_res["action_units"]["AU12_LipCornerPuller"] > 0.5


@pytest.mark.asyncio
async def test_voice_emotion_and_fusion():
    voice_svc = VoiceEmotionService.get_instance()
    t = np.linspace(0, 1.0, 16000, endpoint=False)
    sine = (0.2 * np.sin(2 * np.pi * 440 * t)).astype(np.float32)
    voice_res = await voice_svc.analyze(sine)
    assert voice_res["modality"] == "voice"

    fusion_svc = EmotionFusionService.get_instance()
    fused = fusion_svc.fuse(
        text_res={"primary_emotion": "happy", "confidence": 0.9, "scores": {"happy": 0.9}},
        voice_res={"primary_emotion": "happy", "confidence": 0.8, "scores": {"happy": 0.8}},
    )
    assert fused["primary_emotion"] == "happy"
    assert fused["confidence"] > 0.7


@pytest.mark.asyncio
async def test_emotion_health_endpoint():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/emotion/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert "text_emotion" in data["models"]
        assert "face_emotion" in data["models"]
        assert "face_tracker" in data["models"]
        assert "face_behavior" in data["models"]
        assert "voice_emotion" in data["models"]
        assert "speech_to_text" in data["models"]
