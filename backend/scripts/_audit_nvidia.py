"""Quick NVIDIA NIM audit script."""
import sys
import os
sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import asyncio
import time
from pathlib import Path

async def test_nvidia():
    from app.ai.gateway import AIGateway
    from app.ai.base import AIRequest

    gw = AIGateway()
    req = AIRequest(system_prompt='You are Aura.', prompt='Hi', stream=False)
    t0 = time.perf_counter()
    try:
        resp = await gw.generate(req)
        ms = (time.perf_counter() - t0) * 1000
        print(f"NVIDIA OK - {ms:.0f}ms - provider:{resp.provider}")
        print(f"Content ({len(resp.content)} chars): {repr(resp.content[:200])}")
        return True
    except Exception as e:
        print(f"NVIDIA FAILED: {e}")
        return False


def check_model_files():
    models = {
        'text_emotion_roberta (model/emotion-model)': Path('D:/AuraAI_v1/model/emotion-model'),
        'text_emotion_distilroberta (models/text)': Path('D:/AuraAI_v1/models/text/emotion-english-distilroberta-base'),
        'ferplus_onnx (model/LIVE_emotion_model)': Path('D:/AuraAI_v1/model/LIVE_emotion_model/emotion-ferplus-8.onnx'),
        'ferplus_onnx (models/face/ferplus)': Path('D:/AuraAI_v1/models/face/ferplus/emotion-ferplus-8.onnx'),
        'wav2vec2_model.ckpt': Path('D:/AuraAI_v1/model/voice/wav2vec2-IEMOCAP/model.ckpt'),
        'wav2vec2_wav2vec.ckpt': Path('D:/AuraAI_v1/model/voice/wav2vec2-IEMOCAP/wav2vec2.ckpt'),
        'wav2vec2_custom_interface.py': Path('D:/AuraAI_v1/model/voice/wav2vec2-IEMOCAP/custom_interface.py'),
        'wav2vec2_hyperparams.yaml': Path('D:/AuraAI_v1/model/voice/wav2vec2-IEMOCAP/hyperparams.yaml'),
        'wav2vec2_empty_models_dir': Path('D:/AuraAI_v1/models/voice/emotion-recognition-wav2vec2-IEMOCAP'),
    }
    print("\n=== MODEL FILES ===")
    for name, p in models.items():
        exists = p.exists()
        if exists and p.is_file():
            size = f"{p.stat().st_size / 1024 / 1024:.1f}MB"
            print(f"  OK  {name}: {size}")
        elif exists and p.is_dir():
            print(f"  DIR {name}: exists")
        else:
            print(f"  MISS {name}")


def check_text_emotion():
    print("\n=== TEXT EMOTION MODEL ===")
    try:
        import torch
        from transformers import AutoTokenizer, AutoModelForSequenceClassification
        model_path = Path('D:/AuraAI_v1/model/emotion-model')
        if not model_path.exists():
            print("MISSING: model/emotion-model")
            return
        t0 = time.perf_counter()
        tok = AutoTokenizer.from_pretrained(str(model_path))
        mdl = AutoModelForSequenceClassification.from_pretrained(str(model_path), ignore_mismatched_sizes=True)
        mdl.eval()
        load_ms = (time.perf_counter() - t0) * 1000
        print(f"Loaded in {load_ms:.0f}ms")
        print(f"Labels: {list(mdl.config.id2label.values())}")

        import torch.nn.functional as F
        inputs = tok("I am really happy today!", return_tensors="pt", truncation=True)
        t0 = time.perf_counter()
        with torch.no_grad():
            out = mdl(**inputs)
            probs = F.softmax(out.logits, dim=-1)[0]
        inf_ms = (time.perf_counter() - t0) * 1000
        top_idx = probs.argmax().item()
        print(f"Inference: {inf_ms:.0f}ms -> {mdl.config.id2label[top_idx]} ({probs[top_idx]:.3f})")
        print("TEXT EMOTION: OK")
    except Exception as e:
        print(f"TEXT EMOTION FAILED: {e}")


def check_ferplus():
    print("\n=== FERPLUS ONNX ===")
    try:
        import onnxruntime as ort
        import numpy as np
        import cv2
        model_path = Path('D:/AuraAI_v1/model/LIVE_emotion_model/emotion-ferplus-8.onnx')
        if not model_path.exists():
            model_path = Path('D:/AuraAI_v1/models/face/ferplus/emotion-ferplus-8.onnx')
        if not model_path.exists():
            print("MISSING: emotion-ferplus-8.onnx")
            return
        t0 = time.perf_counter()
        sess = ort.InferenceSession(str(model_path), providers=["CPUExecutionProvider"])
        load_ms = (time.perf_counter() - t0) * 1000
        print(f"Loaded in {load_ms:.0f}ms")

        inp = np.random.randn(1, 1, 64, 64).astype(np.float32)
        t0 = time.perf_counter()
        res = sess.run(None, {sess.get_inputs()[0].name: inp})
        inf_ms = (time.perf_counter() - t0) * 1000
        labels = ["neutral","happy","surprised","sad","angry","disgusted","fearful","contempt"]
        top_idx = int(res[0].argmax())
        print(f"Inference: {inf_ms:.0f}ms -> {labels[top_idx]}")
        print("FERPLUS: OK")
    except Exception as e:
        print(f"FERPLUS FAILED: {e}")


def check_voice_emotion():
    print("\n=== VOICE EMOTION (SpeechBrain wav2vec2) ===")
    model_dir = Path('D:/AuraAI_v1/model/voice/wav2vec2-IEMOCAP')
    if not model_dir.exists():
        print(f"MISSING: {model_dir}")
        return
    files = list(model_dir.iterdir())
    print(f"Files in dir: {[f.name for f in files]}")
    try:
        from speechbrain.inference.interfaces import foreign_class
        from speechbrain.utils.fetching import LocalStrategy
        import torch
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
        print(f"Loaded in {load_ms:.0f}ms")

        import numpy as np
        sine = (0.3 * np.sin(2 * np.pi * 440 * np.linspace(0, 1.0, 16000))).astype(np.float32)
        tensor = torch.from_numpy(sine).unsqueeze(0)
        t0 = time.perf_counter()
        with torch.no_grad():
            out_prob, score, index, text_lab = clf.classify_batch(tensor)
        inf_ms = (time.perf_counter() - t0) * 1000
        print(f"Inference: {inf_ms:.0f}ms -> {text_lab[0]} (score={float(score):.3f})")
        print("VOICE EMOTION: OK")
    except Exception as e:
        print(f"VOICE EMOTION FAILED: {type(e).__name__}: {e}")


def check_whisper():
    print("\n=== WHISPER STT ===")
    try:
        from faster_whisper import WhisperModel
        import numpy as np
        t0 = time.perf_counter()
        model = WhisperModel("small", device="cpu", compute_type="int8")
        load_ms = (time.perf_counter() - t0) * 1000
        print(f"Loaded in {load_ms:.0f}ms")

        sine = (0.2 * np.sin(2 * np.pi * 440 * np.linspace(0, 1.0, 16000))).astype(np.float32)
        t0 = time.perf_counter()
        segs, info = model.transcribe(sine, beam_size=5)
        segs = list(segs)
        inf_ms = (time.perf_counter() - t0) * 1000
        text = " ".join(s.text for s in segs)
        print(f"Inference: {inf_ms:.0f}ms -> '{text}'")
        print("WHISPER: OK")
    except Exception as e:
        print(f"WHISPER FAILED: {type(e).__name__}: {e}")


def check_redis():
    print("\n=== REDIS ===")
    try:
        import asyncio
        import redis.asyncio as aioredis
        async def test():
            r = aioredis.from_url("redis://localhost:6379/0")
            await r.ping()
            await r.close()
            return True
        result = asyncio.run(test())
        print("REDIS: OK" if result else "REDIS: PING FAILED")
    except Exception as e:
        print(f"REDIS FAILED: {type(e).__name__}: {e}")


def check_postgres():
    print("\n=== POSTGRES ===")
    try:
        import asyncio
        from sqlalchemy.ext.asyncio import create_async_engine
        from sqlalchemy import text
        async def test():
            engine = create_async_engine(
                "postgresql+asyncpg://aura:aura_dev_password_change_me@localhost:5432/aura_ai"
            )
            async with engine.begin() as conn:
                res = await conn.execute(text("SELECT 1"))
                return res.scalar()
        result = asyncio.run(test())
        print(f"POSTGRES: OK (SELECT 1 = {result})")
    except Exception as e:
        print(f"POSTGRES FAILED: {type(e).__name__}: {e}")


def check_mediapipe():
    print("\n=== MEDIAPIPE FACE MESH ===")
    try:
        import mediapipe as mp
        import numpy as np
        import cv2
        fm = mp.solutions.face_mesh.FaceMesh(
            static_image_mode=True, max_num_faces=1,
            refine_landmarks=True, min_detection_confidence=0.5
        )
        frame = np.random.randint(50, 200, (480, 640, 3), dtype=np.uint8)
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        res = fm.process(rgb)
        print(f"FaceMesh OK - face_detected: {res.multi_face_landmarks is not None}")
        print("MEDIAPIPE: OK")
    except Exception as e:
        print(f"MEDIAPIPE FAILED: {type(e).__name__}: {e}")


if __name__ == "__main__":
    print("=" * 60)
    print("  AURA AI 2.0 - FULL AUDIT SCRIPT")
    print("=" * 60)

    check_model_files()
    check_text_emotion()
    check_ferplus()
    check_voice_emotion()
    check_whisper()
    check_redis()
    check_postgres()
    check_mediapipe()

    print("\n=== NVIDIA NIM ===")
    asyncio.run(test_nvidia())

    print("\n=== AUDIT COMPLETE ===")
