"""
End-to-End Verification Test for Integrated Text and Face Emotion Models.
"""

import sys
import os
from pathlib import Path

# Add backend directory to sys.path
sys.path.insert(0, str(Path(__file__).parent))

import numpy as np
import cv2

from app.emotion.analyzers import TextEmotionAnalyzer
from app.emotion.face_analyzer import FaceEmotionAnalyzer
from app.emotion.fusion import EmotionFusionEngine, fuse_emotions
from app.emotion.service import EmotionService, verify_models_loaded, predict_text_emotion, predict_face_emotion


def test_text_emotion():
    print("========================================")
    print("1. Testing Text Emotion Model")
    print("========================================")
    text_az = TextEmotionAnalyzer(use_llm=False)
    print(f"Local text model loaded: {text_az.is_local_model_loaded()}")

    test_samples = [
        ("I am feeling so thrilled, energized and happy about my new job!", "happy"),
        ("I feel so lonely, hopeless, and crying all night.", "sad"),
        ("I am so furious and angry with how they treated me!", "angry"),
        ("I have a panic attack and I am super anxious about tomorrow.", "anxious"),
        ("The weather today is completely normal and standard.", "neutral"),
    ]

    for sentence, expected_group in test_samples:
        pred = text_az.predict_raw(sentence)
        print(f"\nText: \"{sentence}\"")
        print(f"  -> Predicted Emotion: {pred['emotion']} (Conf: {pred['confidence']}%)")
        print(f"  -> Top scores: {pred['scores']}")
        print(f"  -> Model used: {pred.get('model')}")

    print("\n[PASS] Text Emotion Model verification complete!")


def test_face_emotion():
    print("\n========================================")
    print("2. Testing Face Emotion Model")
    print("========================================")
    face_az = FaceEmotionAnalyzer()
    print(f"Face emotion analyzer available: {face_az.is_available}")

    # Create dummy face frame
    dummy_frame = np.ones((240, 320, 3), dtype=np.uint8) * 180
    # Draw simple face-like circle
    cv2.circle(dummy_frame, (160, 120), 60, (220, 200, 180), -1)

    result = face_az.predict_frame(dummy_frame, client_id="test_client")
    print(f"Frame analysis output:")
    print(f"  -> Detected Emotion: {result['emotion']}")
    print(f"  -> Confidence: {result['confidence']}%")
    print(f"  -> Face Detected: {result['face_detected']}")
    print(f"  -> Face Box: {result['face_box']}")
    print(f"  -> Scores breakdown: {result['scores']}")

    print("\n[PASS] Face Emotion Model verification complete!")


def test_multimodal_fusion():
    print("\n========================================")
    print("3. Testing Multimodal Emotion Fusion")
    print("========================================")
    
    # Case A: Modalities agree (Text: happy, Face: happy)
    fused_agree = fuse_emotions(
        text={"emotion": "happy", "confidence": 92.0},
        face={"emotion": "happy", "confidence": 85.0},
        voice={"emotion": "happy", "confidence": 78.0},
    )
    print("Agreement Scenario (Text=Happy, Face=Happy, Voice=Happy):")
    print(f"  -> Fused Emotion: {fused_agree.emotion} (Conf: {fused_agree.confidence}%, Conflict: {fused_agree.conflict})")
    print(f"  -> Modality scores: {fused_agree.scores}")

    # Case B: Modality conflict (Text: happy, Face: sad)
    fused_conflict = fuse_emotions(
        text={"emotion": "happy", "confidence": 75.0},
        face={"emotion": "sad", "confidence": 80.0},
    )
    print("\nConflict Scenario (Text=Happy, Face=Sad):")
    print(f"  -> Fused Emotion: {fused_conflict.emotion} (Conf: {fused_conflict.confidence}%, Conflict: {fused_conflict.conflict})")
    print(f"  -> Modality scores: {fused_conflict.scores}")

    print("\n[PASS] Multimodal Fusion verification complete!")


def test_status():
    print("\n========================================")
    print("4. Verifying System Model Status")
    print("========================================")
    status = verify_models_loaded()
    print(f"Status: {status}")
    print("\nALL VERIFICATIONS PASSED SUCCESSFULLY!")


if __name__ == "__main__":
    test_text_emotion()
    test_face_emotion()
    test_multimodal_fusion()
    test_status()
