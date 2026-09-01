"""
Script to download and verify SpeechBrain wav2vec2 IEMOCAP Voice Emotion model.
"""
import os
import sys
import time
from pathlib import Path
import torch
import torchaudio
import numpy as np
from speechbrain.utils.fetching import LocalStrategy
from speechbrain.inference.interfaces import foreign_class

SAVE_DIR = Path("D:/AuraAI_v1/model/voice/wav2vec2-IEMOCAP")
SAVE_DIR.mkdir(parents=True, exist_ok=True)

print(f"Downloading/loading speechbrain/emotion-recognition-wav2vec2-IEMOCAP into {SAVE_DIR}...")

try:
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
    
    # Generate 16kHz synthetic audio (2 seconds of audio)
    sample_rate = 16000
    duration = 2.0
    t = np.linspace(0, duration, int(sample_rate * duration), endpoint=False)
    # 440 Hz sine wave
    audio_np = 0.5 * np.sin(2 * np.pi * 440 * t).astype(np.float32)
    audio_tensor = torch.from_numpy(audio_np).unsqueeze(0) # (1, num_samples)
    
    # Save a test wav file
    test_wav_path = SAVE_DIR / "test_tone.wav"
    torchaudio.save(str(test_wav_path), audio_tensor, sample_rate)
    print(f"Created test WAV file: {test_wav_path}")
    
    # Test inference with file path
    out_prob, score, index, text_lab = classifier.classify_file(str(test_wav_path))
    print("\n--- INFERENCE RESULTS (File) ---")
    print(f"Predicted emotion: {text_lab[0]}")
    print(f"Confidence score: {score.item():.4f}")
    print(f"Raw probabilities: {out_prob}")
    
    # Test inference with audio batch/tensor
    print("\n--- INFERENCE RESULTS (Batch Tensor) ---")
    out_prob_batch, score_batch, index_batch, text_lab_batch = classifier.classify_batch(audio_tensor)
    print(f"Predicted emotion: {text_lab_batch[0]}")
    print(f"Probabilities: {out_prob_batch.squeeze().tolist()}")
    
    print("\n[PASS] Voice emotion model downloaded and verified working!")
except Exception as e:
    print(f"\n[FAIL] Error loading/testing voice emotion model: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)
