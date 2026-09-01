"""
Aura AI 2.0 — Comprehensive Multimodal Rebuild Verification Suite.
Executes real end-to-end tests for all multimodal components and latency profiling.
"""
import asyncio
import io
import json
import sys
import time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

import numpy as np
import httpx
import torch
import websockets

BASE_URL = "http://localhost:8000"
WS_URL = "ws://localhost:8000/api/v1/ws/chat"

PASS = "[PASS]"
FAIL = "[FAIL]"

test_results = []


def record(name: str, passed: bool, detail: str = ""):
    status = PASS if passed else FAIL
    test_results.append((status, name, detail))
    print(f"  {status} {name}: {detail}")


async def test_1_text_emotion():
    """Test 1: Local RoBERTa Text Emotion Analyzer."""
    from app.emotion.analyzers import TextEmotionAnalyzer
    analyzer = TextEmotionAnalyzer(use_llm=False)
    
    t0 = time.perf_counter()
    res = await analyzer.analyze("I am really thrilled and happy about this breakthrough!")
    lat_ms = (time.perf_counter() - t0) * 1000.0
    
    passed = res.emotion == "happy" and res.confidence > 80.0
    record("TEST 1: Text Emotion (Local RoBERTa)", passed, f"emotion={res.emotion}, conf={res.confidence}%, lat={lat_ms:.1f}ms")


async def test_2_voice_emotion():
    """Test 2: SpeechBrain Voice Emotion Analyzer."""
    from app.emotion.analyzers import VoiceEmotionAnalyzer
    analyzer = VoiceEmotionAnalyzer()
    
    # 2 seconds of 16kHz synthetic audio
    sample_rate = 16000
    t = np.linspace(0, 2.0, int(sample_rate * 2.0), endpoint=False)
    audio = (0.5 * np.sin(2 * np.pi * 440 * t)).astype(np.float32)
    
    t0 = time.perf_counter()
    res = await analyzer.analyze(audio)
    lat_ms = (time.perf_counter() - t0) * 1000.0
    
    passed = res.modality == "voice" and analyzer.is_local_model_loaded() and res.confidence > 0
    record("TEST 2: Voice Emotion (SpeechBrain wav2vec2)", passed, f"emotion={res.emotion}, conf={res.confidence}%, lat={lat_ms:.1f}ms, model_loaded={analyzer.is_local_model_loaded()}")


async def test_3_face_emotion():
    """Test 3: FERPlus Face Emotion Model."""
    from app.emotion.face_analyzer import FaceEmotionAnalyzer
    analyzer = FaceEmotionAnalyzer()
    
    # Create synthetic test frame (480x360 3-channel image)
    dummy_frame = np.zeros((360, 480, 3), dtype=np.uint8)
    
    t0 = time.perf_counter()
    res = await analyzer.analyze(dummy_frame)
    lat_ms = (time.perf_counter() - t0) * 1000.0
    
    passed = analyzer.is_available
    record("TEST 3: Face Emotion (FERPlus ONNX)", passed, f"is_available={analyzer.is_available}, lat={lat_ms:.1f}ms")


async def test_4_multimodal_fusion():
    """Test 4: Multi-Modal Emotion Fusion (Face + Voice + Text)."""
    from app.emotion.base import EmotionResult
    from app.emotion.fusion import EmotionFusionEngine
    
    engine = EmotionFusionEngine()
    
    text_res = EmotionResult(emotion="anxious", confidence=85.0, modality="text", sentiment="negative", stress_level="high")
    voice_res = EmotionResult(emotion="anxious", confidence=90.0, modality="voice", sentiment="negative", stress_level="high")
    face_res = EmotionResult(emotion="fearful", confidence=75.0, modality="face", sentiment="negative", stress_level="high")
    
    t0 = time.perf_counter()
    fused_ctx = engine.fuse(text=text_res, voice=voice_res, face=face_res)
    lat_ms = (time.perf_counter() - t0) * 1000.0
    
    # Text (anxious) + Voice (anxious) agree -> agreement bonus -> fused = anxious
    passed = fused_ctx.primary_emotion in ("anxious", "fearful") and len(fused_ctx.activeSources) == 3
    record("TEST 4: Emotion Fusion (Face+Voice+Text)", passed, f"fused={fused_ctx.primary_emotion}, sources={fused_ctx.activeSources}, stress={fused_ctx.stress}, lat={lat_ms:.2f}ms")


async def test_5_ws_chat_streaming():
    """Test 5: WebSocket Real-Time Chat with Sequence Sync."""
    try:
        async with websockets.connect(WS_URL, open_timeout=10) as ws:
            t0 = time.perf_counter()
            await ws.send(json.dumps({
                "type": "message",
                "content": "Hi, I am preparing for placements and feeling a bit overwhelmed.",
                "mode": "chat",
            }))
            
            chunks = []
            ttft_ms = None
            session_id = None
            emotion_data = None
            
            while True:
                raw = await asyncio.wait_for(ws.recv(), timeout=15.0)
                msg = json.loads(raw)
                
                if msg.get("type") == "session_start":
                    session_id = msg.get("session_id")
                elif msg.get("type") == "emotion":
                    emotion_data = msg.get("data")
                elif msg.get("type") == "chunk":
                    if ttft_ms is None:
                        ttft_ms = (time.perf_counter() - t0) * 1000.0
                    chunks.append(msg.get("content", ""))
                elif msg.get("type") == "done":
                    break
                elif msg.get("type") == "error":
                    record("TEST 5: WebSocket Chat", False, f"Server error: {msg.get('error')}")
                    return
            
            total_lat_ms = (time.perf_counter() - t0) * 1000.0
            full_text = "".join(chunks)
            passed = len(full_text) > 30 and ttft_ms is not None
            record("TEST 5: WebSocket Chat Streaming", passed, f"TTFT={ttft_ms:.1f}ms, Total={total_lat_ms:.1f}ms, Chunks={len(chunks)}, Chars={len(full_text)}")
    except Exception as ex:
        record("TEST 5: WebSocket Chat Streaming", False, str(ex)[:80])


async def test_6_tts_synthesis():
    """Test 6: Neural TTS Synthesis."""
    async with httpx.AsyncClient() as client:
        t0 = time.perf_counter()
        resp = await client.get(
            f"{BASE_URL}/api/v1/tts/synthesize",
            params={"text": "Hello! I am Dr. Aura, your mental wellness companion.", "voice": "en-US-AriaNeural"},
            timeout=15.0
        )
        lat_ms = (time.perf_counter() - t0) * 1000.0
        passed = resp.status_code == 200 and len(resp.content) > 5000
        record("TEST 6: Neural TTS Synthesis", passed, f"Status={resp.status_code}, Bytes={len(resp.content)}, Latency={lat_ms:.1f}ms")


async def main():
    print("=" * 70)
    print("AURA AI 2.0 — MULTIMODAL REBUILD INTEGRATION TEST SUITE")
    print("=" * 70)
    
    await test_1_text_emotion()
    await test_2_voice_emotion()
    await test_3_face_emotion()
    await test_4_multimodal_fusion()
    await test_5_ws_chat_streaming()
    await test_6_tts_synthesis()
    
    print("\n" + "=" * 70)
    passed_cnt = sum(1 for r in test_results if r[0] == PASS)
    total_cnt = len(test_results)
    print(f"SUMMARY: {passed_cnt}/{total_cnt} TESTS PASSED")
    print("=" * 70)

if __name__ == "__main__":
    asyncio.run(main())
