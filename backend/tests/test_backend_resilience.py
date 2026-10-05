"""Regression checks for offline cache, camera output, and voice latency."""
import asyncio
import time
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.deps import InMemoryRedis
from app.core.exceptions import RateLimitExceededError
from app.core.rate_limiter import RateLimiter


async def test_offline_cache_enforces_rate_limit_and_expiry(monkeypatch):
    cache = InMemoryRedis()
    now = [100.0]
    monkeypatch.setattr("app.core.deps.time.time", lambda: now[0])
    limiter = RateLimiter(cache, requests_per_minute=2)
    await limiter.check("user")
    await limiter.check("user")
    with pytest.raises(RateLimitExceededError):
        await limiter.check("user")
    now[0] += 61
    assert await cache.ttl("ratelimit:user") == -2
    await limiter.check("user")
    assert await limiter.get_remaining("user") == 1


async def test_offline_cache_sets_hashes_and_reusable_pipeline(monkeypatch):
    cache = InMemoryRedis()
    now = [100.0]
    monkeypatch.setattr("app.core.deps.time.time", lambda: now[0])
    await cache.setex("token", 10, "session")
    assert await cache.get("token") == "session"
    pipe = cache.pipeline()
    pipe.sadd("members", "alice").hset("profile", mapping={"name": "Alice"})
    assert await pipe.execute() == [1, 1]
    assert await pipe.execute() == []
    assert await cache.sismember("members", "alice")
    assert await cache.smembers("members") == {"alice"}
    await cache.expire("members", 10)
    await cache.expire("profile", 10)
    now[0] += 11
    assert await cache.get("token") is None
    await cache.sadd("members", "bob")
    await cache.hset("profile", mapping={"name": "Bob"})
    assert await cache.smembers("members") == {"bob"}
    assert await cache.hgetall("profile") == {"name": "Bob"}
    await cache.close()


def test_camera_frame_emits_timestamp_and_isolates_connections(monkeypatch):
    from app.api.v1 import emotion_ws
    from app.emotion.base import EmotionResult

    analyzer = SimpleNamespace(is_available=True, analyze=AsyncMock(return_value=EmotionResult(
        emotion="neutral", confidence=75, modality="face", face_detected=True,
    )))
    monkeypatch.setattr(emotion_ws, "get_face_analyzer", lambda: analyzer)
    app = FastAPI()
    app.include_router(emotion_ws.router)
    client = TestClient(app)
    ids = []
    for _ in range(2):
        with client.websocket_connect("/emotion/ws") as ws:
            ws.send_json({"type": "frame", "image": "test-frame"})
            result = ws.receive_json()
            assert result["type"] == "emotion"
            assert result["timestamp"].endswith("+00:00")
            ids.append(analyzer.analyze.call_args.args[0]["client_id"])
    assert ids[0] != ids[1]


async def test_voice_model_initialization_is_inside_timeout(monkeypatch):
    from app.communication.websocket_manager import _analyze_voice_emotion
    from app.services.emotion.voice_emotion import VoiceEmotionService

    def slow_instance():
        time.sleep(0.15)
        return SimpleNamespace(analyze=AsyncMock(return_value={"confidence": 1.0}))

    monkeypatch.setattr(VoiceEmotionService, "get_instance", slow_instance)
    heartbeat = asyncio.Event()

    async def tick():
        await asyncio.sleep(0.01)
        heartbeat.set()

    task = asyncio.create_task(tick())
    result = await _analyze_voice_emotion(b"pcm", timeout_s=0.04)
    assert result["confidence"] == 0.0
    assert heartbeat.is_set(), "Model construction blocked the WebSocket event loop"
    await task


def test_camera_rejects_invalid_token_before_loading_models(monkeypatch):
    from app.api.v1 import emotion_ws

    monkeypatch.setattr(emotion_ws, "get_face_analyzer", lambda: pytest.fail("Unauthorized model load"))
    app = FastAPI()
    app.include_router(emotion_ws.router)
    with TestClient(app).websocket_connect("/emotion/ws?token=invalid") as ws:
        assert ws.receive_json()["code"] == "AUTH_INVALID"


def test_emotion_wrappers_reuse_live_models(monkeypatch):
    from app.emotion import service
    from app.services.emotion.text_emotion import TextEmotionService
    from app.services.emotion.face_emotion import FaceEmotionService

    text = SimpleNamespace(_device="cpu", _model_loaded=True)
    face = SimpleNamespace(_available=True)
    monkeypatch.setattr(service, "get_text_analyzer", lambda: text)
    monkeypatch.setattr(service, "get_face_analyzer", lambda: face)
    assert TextEmotionService()._analyzer is text
    assert FaceEmotionService()._analyzer is face
