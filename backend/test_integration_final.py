"""
Comprehensive Aura AI 2.0 — Final Integration Test Suite
Tests: DB, Redis, LLM, TTS, Face Emotion, WebSocket Chat, Health
"""
import asyncio
import httpx
import json
import websockets

BASE = "http://localhost:8000"
WS_BASE = "ws://localhost:8000"

PASS = "[PASS]"
FAIL = "[FAIL]"
SKIP = "[SKIP]"

results = []

async def test_health():
    async with httpx.AsyncClient() as c:
        r = await c.get(f"{BASE}/api/v1/health", follow_redirects=True)
        ok = r.status_code == 200 and r.json().get("status") == "healthy"
        results.append((PASS if ok else FAIL, "Health endpoint", r.json().get("status")))

async def test_db_connection():
    try:
        from sqlalchemy.ext.asyncio import create_async_engine
        from sqlalchemy import text
        e = create_async_engine("postgresql+asyncpg://aura:aura_dev_password_change_me@localhost:5432/aura_ai")
        async with e.connect() as c:
            r = await c.execute(text("SELECT COUNT(*) FROM users"))
            count = r.scalar()
        await e.dispose()
        results.append((PASS, "PostgreSQL DB connected", f"users={count}"))
    except Exception as ex:
        results.append((FAIL, "PostgreSQL DB", str(ex)[:80]))

async def test_redis():
    try:
        import redis.asyncio as aioredis
        c = aioredis.from_url("redis://localhost:6379/0")
        await c.ping()
        await c.aclose()
        results.append((PASS, "Redis connected", "PONG"))
    except Exception as ex:
        results.append((FAIL, "Redis", str(ex)[:80]))

async def test_tts():
    async with httpx.AsyncClient() as c:
        r = await c.get(f"{BASE}/api/v1/tts/synthesize",
                       params={"text": "I am Aura, your wellness companion.", "voice": "en-IN-NeerjaExpressiveNeural"},
                       timeout=20.0)
        ok = r.status_code == 200 and len(r.content) > 5000
        provider = r.headers.get("X-TTS-Provider", "unknown")
        results.append((PASS if ok else FAIL, "TTS synthesis", f"provider={provider} bytes={len(r.content)}"))

async def test_tts_hindi():
    async with httpx.AsyncClient() as c:
        r = await c.get(f"{BASE}/api/v1/tts/synthesize",
                       params={"text": "नमस्ते, मैं आपकी मदद के लिए यहाँ हूँ।", "voice": "hi-IN-SwaraNeural"},
                       timeout=20.0)
        ok = r.status_code == 200 and len(r.content) > 3000
        results.append((PASS if ok else FAIL, "TTS Hindi synthesis", f"bytes={len(r.content)}"))

async def test_face_emotion_status():
    async with httpx.AsyncClient() as c:
        r = await c.get(f"{BASE}/api/v1/emotion/status", timeout=10.0, follow_redirects=True)
        ok = r.status_code == 200
        data = r.json() if ok else {}
        face_loaded = data.get("face_emotion", {}).get("loaded", False)
        results.append((PASS if face_loaded else FAIL, "Face emotion model loaded", f"face={face_loaded}"))

async def test_ws_chat_simple():
    try:
        async with websockets.connect(f"{WS_BASE}/api/v1/ws/chat", open_timeout=10) as ws:
            await ws.send(json.dumps({"type": "message", "content": "Hi, I feel anxious today", "mode": "chat"}))
            response_text = ""
            events = []
            for _ in range(40):
                try:
                    raw = await asyncio.wait_for(ws.recv(), timeout=12.0)
                    data = json.loads(raw)
                    events.append(data["type"])
                    if data["type"] == "chunk":
                        response_text += data.get("content", "")
                    elif data["type"] == "done":
                        break
                    elif data["type"] == "error":
                        results.append((FAIL, "WS Chat", f"error: {data.get('error')}"))
                        return
                except asyncio.TimeoutError:
                    break
            ok = len(response_text.strip()) > 20
            results.append((PASS if ok else FAIL, "WS Chat 'Hi, I feel anxious today'",
                          f"chars={len(response_text)} events={events[:6]}"))
    except Exception as ex:
        results.append((FAIL, "WS Chat", str(ex)[:80]))

async def test_ws_chat_hindi():
    try:
        async with websockets.connect(f"{WS_BASE}/api/v1/ws/chat", open_timeout=10) as ws:
            await ws.send(json.dumps({"type": "message", "content": "नमस्ते, मुझे बहुत तनाव है", "mode": "chat"}))
            response_text = ""
            for _ in range(40):
                try:
                    raw = await asyncio.wait_for(ws.recv(), timeout=12.0)
                    data = json.loads(raw)
                    if data["type"] == "chunk":
                        response_text += data.get("content", "")
                    elif data["type"] in ("done", "error"):
                        break
                except asyncio.TimeoutError:
                    break
            ok = len(response_text.strip()) > 10
            results.append((PASS if ok else FAIL, "WS Chat Hindi", f"chars={len(response_text)}"))
    except Exception as ex:
        results.append((FAIL, "WS Chat Hindi", str(ex)[:80]))

async def test_api_docs():
    async with httpx.AsyncClient() as c:
        r = await c.get(f"{BASE}/docs", timeout=5.0)
        ok = r.status_code == 200
        results.append((PASS if ok else FAIL, "Swagger UI /docs", f"status={r.status_code}"))

async def test_emotion_endpoint():
    async with httpx.AsyncClient() as c:
        r = await c.post(f"{BASE}/api/v1/chat/emotion",
                        json={"text": "I feel really sad and hopeless today"},
                        timeout=15.0, follow_redirects=True)
        ok = r.status_code == 200 and r.json().get("emotion")
        data = r.json() if ok else {}
        results.append((PASS if ok else FAIL, "Text emotion analysis API", f"emotion={data.get('emotion')} conf={data.get('confidence')}"))

async def main():
    print("=" * 64)
    print("AURA AI 2.0 — FINAL INTEGRATION TEST SUITE")
    print("=" * 64)

    tests = [
        test_health(),
        test_db_connection(),
        test_redis(),
        test_tts(),
        test_tts_hindi(),
        test_face_emotion_status(),
        test_ws_chat_simple(),
        test_ws_chat_hindi(),
        test_api_docs(),
        test_emotion_endpoint(),
    ]

    for t in tests:
        try:
            await t
        except Exception as ex:
            results.append((FAIL, "Unexpected error", str(ex)[:80]))

    print()
    passed = sum(1 for r in results if r[0] == PASS)
    failed = sum(1 for r in results if r[0] == FAIL)

    for status, name, detail in results:
        print(f"  {status} {name}")
        if detail:
            print(f"       {detail}")

    print()
    print(f"Result: {passed} passed, {failed} failed out of {len(results)} tests")
    print("=" * 64)

asyncio.run(main())
