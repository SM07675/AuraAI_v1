"""
Aura AI 2.0 — Individual Model Inference Benchmark.

Runs each local emotion and perception model 5 times and reports
P50 / P95 / P99 latency for each. Outputs a clean table.

Usage:
    python scripts/test_models.py
    python scripts/test_models.py --skip-nvidia
"""

from __future__ import annotations

import asyncio
import os
import sys
import time
import traceback
from pathlib import Path
from statistics import mean, median, quantiles
from typing import Any

# ── UTF-8 stdout (Windows charmap fix) ──────────────────────────────────────
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

# ── sys.path ─────────────────────────────────────────────────────────────────
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

SKIP_NVIDIA = "--skip-nvidia" in sys.argv
N_RUNS = 5   # Benchmark iterations per model


def _percentile(data: list[float], pct: float) -> float:
    if not data:
        return 0.0
    data_s = sorted(data)
    k = (len(data_s) - 1) * pct / 100.0
    lo, hi = int(k), min(int(k) + 1, len(data_s) - 1)
    return data_s[lo] + (data_s[hi] - data_s[lo]) * (k - lo)


# ── Text Emotion ─────────────────────────────────────────────────────────────

async def bench_text_emotion() -> dict[str, Any]:
    try:
        import torch
        import torch.nn.functional as F
        from transformers import AutoTokenizer, AutoModelForSequenceClassification

        model_path = Path("D:/AuraAI_v1/model/emotion-model")
        t0 = time.perf_counter()
        tok = AutoTokenizer.from_pretrained(str(model_path), local_files_only=True)
        mdl = AutoModelForSequenceClassification.from_pretrained(
            str(model_path), local_files_only=True, ignore_mismatched_sizes=True
        )
        mdl.eval()
        load_ms = (time.perf_counter() - t0) * 1000

        test_text = "I feel really overwhelmed with stress and deadlines today."
        inputs = tok(test_text, return_tensors="pt", truncation=True, max_length=128)
        latencies = []
        top_label = "unknown"
        conf = 0.0
        for _ in range(N_RUNS):
            t0 = time.perf_counter()
            with torch.no_grad():
                out = mdl(**inputs)
                probs = F.softmax(out.logits, dim=-1)[0]
            latencies.append((time.perf_counter() - t0) * 1000)
        top_idx = probs.argmax().item()
        top_label = mdl.config.id2label[top_idx]
        conf = float(probs[top_idx])

        return {
            "model": "DistilRoBERTa (Text Emotion)",
            "device": "cpu",
            "load_ms": f"{load_ms:.0f}ms",
            "p50_ms": f"{_percentile(latencies, 50):.0f}ms",
            "p95_ms": f"{_percentile(latencies, 95):.0f}ms",
            "p99_ms": f"{_percentile(latencies, 99):.0f}ms",
            "output": f"{top_label} ({conf:.3f})",
            "status": "[PASS]",
        }
    except Exception as exc:
        return {
            "model": "DistilRoBERTa (Text Emotion)",
            "device": "?",
            "load_ms": "N/A",
            "p50_ms": "N/A",
            "p95_ms": "N/A",
            "p99_ms": "N/A",
            "output": f"ERROR: {type(exc).__name__}: {exc}",
            "status": "[FAIL]",
        }


# ── FERPlus ONNX ─────────────────────────────────────────────────────────────

async def bench_face_emotion() -> dict[str, Any]:
    try:
        import onnxruntime as ort
        import numpy as np

        candidates = [
            Path("D:/AuraAI_v1/model/LIVE_emotion_model/emotion-ferplus-8.onnx"),
            Path("D:/AuraAI_v1/models/face/ferplus/emotion-ferplus-8.onnx"),
        ]
        onnx_path = next((p for p in candidates if p.exists()), None)
        if not onnx_path:
            raise FileNotFoundError("emotion-ferplus-8.onnx not found")

        t0 = time.perf_counter()
        sess = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])
        load_ms = (time.perf_counter() - t0) * 1000
        inp_name = sess.get_inputs()[0].name
        labels = ["neutral", "happy", "surprised", "sad", "angry", "disgusted", "fearful", "contempt"]

        inp = np.random.randn(1, 1, 64, 64).astype(np.float32) * 0.5
        latencies = []
        top_label = "unknown"
        for _ in range(N_RUNS):
            t0 = time.perf_counter()
            out = sess.run(None, {inp_name: inp})
            latencies.append((time.perf_counter() - t0) * 1000)
        top_label = labels[out[0][0].argmax()]

        return {
            "model": "FERPlus ONNX (Face Emotion)",
            "device": "cpu",
            "load_ms": f"{load_ms:.0f}ms",
            "p50_ms": f"{_percentile(latencies, 50):.0f}ms",
            "p95_ms": f"{_percentile(latencies, 95):.0f}ms",
            "p99_ms": f"{_percentile(latencies, 99):.0f}ms",
            "output": top_label,
            "status": "[PASS]",
        }
    except Exception as exc:
        return {
            "model": "FERPlus ONNX (Face Emotion)",
            "device": "?",
            "load_ms": "N/A",
            "p50_ms": "N/A",
            "p95_ms": "N/A",
            "p99_ms": "N/A",
            "output": f"ERROR: {exc}",
            "status": "[FAIL]",
        }


# ── Voice Emotion (SpeechBrain) ───────────────────────────────────────────────

async def bench_voice_emotion() -> dict[str, Any]:
    try:
        import speechbrain
    except ImportError:
        return {
            "model": "wav2vec2 IEMOCAP (Voice Emotion)",
            "device": "?",
            "load_ms": "N/A",
            "p50_ms": "N/A",
            "p95_ms": "N/A",
            "p99_ms": "N/A",
            "output": "speechbrain NOT INSTALLED",
            "status": "[FAIL]",
        }
    try:
        from speechbrain.inference.interfaces import foreign_class
        from speechbrain.utils.fetching import LocalStrategy
        import torch
        import numpy as np

        model_dir = Path("D:/AuraAI_v1/model/voice/wav2vec2-IEMOCAP")
        t0 = time.perf_counter()
        clf = foreign_class(
            source="speechbrain/emotion-recognition-wav2vec2-IEMOCAP",
            pymodule_file="custom_interface.py",
            classname="CustomEncoderWav2vec2Classifier",
            savedir=str(model_dir),
            local_strategy=LocalStrategy.COPY,
            run_opts={"device": "cpu"},
        )
        load_ms = (time.perf_counter() - t0) * 1000

        sine = (0.3 * np.sin(2 * np.pi * 440 * np.linspace(0, 1.0, 16000))).astype(np.float32)
        tensor = torch.from_numpy(sine).unsqueeze(0)
        latencies = []
        top_label = "unknown"
        score = 0.0
        for _ in range(N_RUNS):
            t0 = time.perf_counter()
            with torch.no_grad():
                _, sc, _, lab = clf.classify_batch(tensor)
            latencies.append((time.perf_counter() - t0) * 1000)
            top_label = lab[0]
            score = float(sc)

        return {
            "model": "wav2vec2 IEMOCAP (Voice Emotion)",
            "device": "cpu",
            "load_ms": f"{load_ms:.0f}ms",
            "p50_ms": f"{_percentile(latencies, 50):.0f}ms",
            "p95_ms": f"{_percentile(latencies, 95):.0f}ms",
            "p99_ms": f"{_percentile(latencies, 99):.0f}ms",
            "output": f"{top_label} ({score:.3f})",
            "status": "[PASS]",
        }
    except Exception as exc:
        return {
            "model": "wav2vec2 IEMOCAP (Voice Emotion)",
            "device": "?",
            "load_ms": "N/A",
            "p50_ms": "N/A",
            "p95_ms": "N/A",
            "p99_ms": "N/A",
            "output": f"ERROR: {exc}",
            "status": "[FAIL]",
        }


# ── Whisper STT ───────────────────────────────────────────────────────────────

async def bench_whisper() -> dict[str, Any]:
    try:
        import faster_whisper
    except ImportError:
        return {
            "model": "Whisper Tiny (STT)",
            "device": "?",
            "load_ms": "N/A",
            "p50_ms": "N/A",
            "p95_ms": "N/A",
            "p99_ms": "N/A",
            "output": "faster-whisper NOT INSTALLED",
            "status": "[FAIL]",
        }
    try:
        from faster_whisper import WhisperModel
        import numpy as np

        t0 = time.perf_counter()
        model = WhisperModel("tiny", device="cpu", compute_type="int8")
        load_ms = (time.perf_counter() - t0) * 1000

        sine = (0.2 * np.sin(2 * np.pi * 440 * np.linspace(0, 1.0, 16000))).astype(np.float32)
        latencies = []
        lang = "?"
        for _ in range(N_RUNS):
            t0 = time.perf_counter()
            segs, info = model.transcribe(sine, beam_size=1)
            list(segs)  # consume generator
            latencies.append((time.perf_counter() - t0) * 1000)
            lang = getattr(info, "language", "?")

        return {
            "model": "Whisper Tiny (STT)",
            "device": "cpu",
            "load_ms": f"{load_ms:.0f}ms",
            "p50_ms": f"{_percentile(latencies, 50):.0f}ms",
            "p95_ms": f"{_percentile(latencies, 95):.0f}ms",
            "p99_ms": f"{_percentile(latencies, 99):.0f}ms",
            "output": f"lang={lang}",
            "status": "[PASS]",
        }
    except Exception as exc:
        return {
            "model": "Whisper Tiny (STT)",
            "device": "?",
            "load_ms": "N/A",
            "p50_ms": "N/A",
            "p95_ms": "N/A",
            "p99_ms": "N/A",
            "output": f"ERROR: {exc}",
            "status": "[FAIL]",
        }


# ── MediaPipe Face Mesh ───────────────────────────────────────────────────────

async def bench_mediapipe() -> dict[str, Any]:
    try:
        import mediapipe as mp
    except ImportError:
        return {
            "model": "MediaPipe FaceMesh (Tracking)",
            "device": "?",
            "load_ms": "N/A",
            "p50_ms": "N/A",
            "p95_ms": "N/A",
            "p99_ms": "N/A",
            "output": "mediapipe NOT INSTALLED",
            "status": "[FAIL]",
        }
    try:
        import cv2
        import numpy as np
        import mediapipe as mp

        t0 = time.perf_counter()
        fm = mp.solutions.face_mesh.FaceMesh(
            static_image_mode=False, max_num_faces=1,
            refine_landmarks=True, min_detection_confidence=0.5
        )
        load_ms = (time.perf_counter() - t0) * 1000

        # Synthetic face-like frame
        frame = np.random.randint(100, 200, (480, 640, 3), dtype=np.uint8)
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        latencies = []
        detected = False
        for _ in range(N_RUNS):
            t0 = time.perf_counter()
            res = fm.process(rgb)
            latencies.append((time.perf_counter() - t0) * 1000)
            detected = res.multi_face_landmarks is not None
        fm.close()

        return {
            "model": "MediaPipe FaceMesh (Tracking)",
            "device": "cpu",
            "load_ms": f"{load_ms:.0f}ms",
            "p50_ms": f"{_percentile(latencies, 50):.0f}ms",
            "p95_ms": f"{_percentile(latencies, 95):.0f}ms",
            "p99_ms": f"{_percentile(latencies, 99):.0f}ms",
            "output": f"detected={detected}",
            "status": "[PASS]",
        }
    except Exception as exc:
        return {
            "model": "MediaPipe FaceMesh (Tracking)",
            "device": "?",
            "load_ms": "N/A",
            "p50_ms": "N/A",
            "p95_ms": "N/A",
            "p99_ms": "N/A",
            "output": f"ERROR: {exc}",
            "status": "[FAIL]",
        }


# ── NVIDIA NIM ────────────────────────────────────────────────────────────────

async def bench_nvidia_nim() -> dict[str, Any]:
    if SKIP_NVIDIA:
        return {
            "model": "NVIDIA NIM (LLM)",
            "device": "cloud",
            "load_ms": "N/A",
            "p50_ms": "N/A",
            "p95_ms": "N/A",
            "p99_ms": "N/A",
            "output": "skipped (--skip-nvidia)",
            "status": "[SKIP]",
        }
    try:
        from app.ai.gateway import AIGateway
        from app.ai.base import AIRequest

        gw = AIGateway()
        req = AIRequest(
            system_prompt="You are Aura.",
            prompt="Say exactly: Hello!",
            stream=False,
            max_tokens=20,
        )
        # One warm-up + N_RUNS measured
        latencies = []
        content = ""
        for i in range(N_RUNS):
            t0 = time.perf_counter()
            resp = await gw.generate(req)
            latencies.append((time.perf_counter() - t0) * 1000)
            content = resp.content

        return {
            "model": "NVIDIA NIM (LLM)",
            "device": "cloud",
            "load_ms": "N/A",
            "p50_ms": f"{_percentile(latencies, 50):.0f}ms",
            "p95_ms": f"{_percentile(latencies, 95):.0f}ms",
            "p99_ms": f"{_percentile(latencies, 99):.0f}ms",
            "output": repr(content[:60]),
            "status": "[PASS]",
        }
    except Exception as exc:
        return {
            "model": "NVIDIA NIM (LLM)",
            "device": "cloud",
            "load_ms": "N/A",
            "p50_ms": "N/A",
            "p95_ms": "N/A",
            "p99_ms": "N/A",
            "output": f"ERROR: {exc}",
            "status": "[FAIL]",
        }


# ── Main ─────────────────────────────────────────────────────────────────────

async def main() -> None:
    print("=" * 90)
    print(f"  AURA AI 2.0 — LOCAL MODEL VERIFICATION & INFERENCE BENCHMARK ({N_RUNS} runs each)")
    print("=" * 90)
    print("Running benchmarks concurrently...\n")

    # Run non-NVIDIA tests concurrently (NVIDIA is sequential by design)
    results_local = await asyncio.gather(
        bench_text_emotion(),
        bench_face_emotion(),
        bench_voice_emotion(),
        bench_whisper(),
        bench_mediapipe(),
    )
    result_nvidia = await bench_nvidia_nim()

    results = list(results_local) + [result_nvidia]

    # Print table header
    print(
        f"{'MODEL':<38} | {'DEVICE':<6} | {'LOAD':<8} | {'P50':<8} | {'P95':<8} | {'P99':<8} | {'STATUS':<6} | OUTPUT"
    )
    print("-" * 110)

    pass_count = 0
    fail_count = 0
    for r in results:
        status = r["status"]
        if "[PASS]" in status:
            pass_count += 1
        elif "[FAIL]" in status:
            fail_count += 1
        print(
            f"{r['model']:<38} | {r['device']:<6} | {r['load_ms']:<8} | "
            f"{r['p50_ms']:<8} | {r['p95_ms']:<8} | {r['p99_ms']:<8} | "
            f"{status:<6} | {r['output']}"
        )

    print("=" * 110)
    print(f"  SUMMARY: {pass_count}/{len(results)} PASSED, {fail_count} FAILED")
    print("=" * 110 + "\n")

    if fail_count > 0:
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
