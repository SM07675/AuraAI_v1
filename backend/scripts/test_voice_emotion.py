"""
Test script for SpeechBrain wav2vec2 IEMOCAP Voice Emotion Model.
"""
import sys
import time
from pathlib import Path
import soundfile as sf
import numpy as np
import torch

sys.path.insert(0, str(Path(__file__).parent.parent))

SAVE_DIR = Path("D:/AuraAI_v1/model/voice/wav2vec2-IEMOCAP")

def main():
    print("=" * 60)
    print("TESTING SPEECHBRAIN VOICE EMOTION INFERENCE")
    print("=" * 60)
    
    from speechbrain.inference.interfaces import foreign_class
    from speechbrain.utils.fetching import LocalStrategy
    
    t0 = time.perf_counter()
    classifier = foreign_class(
        source="speechbrain/emotion-recognition-wav2vec2-IEMOCAP",
        pymodule_file="custom_interface.py",
        classname="CustomEncoderWav2vec2Classifier",
        savedir=str(SAVE_DIR),
        local_strategy=LocalStrategy.COPY,
        run_opts={"device": "cpu"},
    )
    load_time = time.perf_counter() - t0
    print(f"Model loaded successfully in {load_time:.2f}s!")
    
    sample_rate = 16000
    duration = 2.0
    t = np.linspace(0, duration, int(sample_rate * duration), endpoint=False)
    
    # Test 1: In-Memory Audio Batch Tensor (440Hz tone)
    audio_tone = (0.5 * np.sin(2 * np.pi * 440 * t)).astype(np.float32)
    tensor_audio = torch.from_numpy(audio_tone).unsqueeze(0)
    
    t_inf = time.perf_counter()
    out_prob_batch, score_b, index_b, text_lab_b = classifier.classify_batch(tensor_audio)
    inf_time_ms = (time.perf_counter() - t_inf) * 1000.0
    
    print("\n--- Test 1: In-Memory Audio Batch Tensor (440Hz Sine) ---")
    print(f"Predicted emotion: {text_lab_b[0]}")
    print(f"Score / Confidence: {score_b.item():.4f}")
    print(f"Probabilities (neu, ang, hap, sad): {out_prob_batch.squeeze().tolist()}")
    print(f"Inference Latency: {inf_time_ms:.1f}ms")
    
    # Test 2: Pitch-Modulated Signal
    mod_audio = (0.4 * np.sin(2 * np.pi * 350 * t) + 0.3 * np.sin(2 * np.pi * 700 * t) * np.exp(-t)).astype(np.float32)
    tensor_mod = torch.from_numpy(mod_audio).unsqueeze(0)
    out_prob_m, score_m, index_m, text_lab_m = classifier.classify_batch(tensor_mod)
    print("\n--- Test 2: Pitch-Modulated Signal ---")
    print(f"Predicted emotion: {text_lab_m[0]}")
    print(f"Score / Confidence: {score_m.item():.4f}")
    print(f"Probabilities: {out_prob_m.squeeze().tolist()}")
    
    # Test 3: Low-frequency slow signal (simulating sad/somber prosody)
    low_audio = (0.3 * np.sin(2 * np.pi * 120 * t)).astype(np.float32)
    tensor_low = torch.from_numpy(low_audio).unsqueeze(0)
    out_prob_l, score_l, index_l, text_lab_l = classifier.classify_batch(tensor_low)
    print("\n--- Test 3: Low-Frequency Signal ---")
    print(f"Predicted emotion: {text_lab_l[0]}")
    print(f"Score / Confidence: {score_l.item():.4f}")
    print(f"Probabilities: {out_prob_l.squeeze().tolist()}")
    
    print("\n" + "=" * 60)
    print("[PASS] SpeechBrain voice emotion inference verified with real weights!")
    print("=" * 60)

if __name__ == "__main__":
    main()
