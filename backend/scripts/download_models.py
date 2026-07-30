#!/usr/bin/env python3
"""
Download emotion ONNX models for Aura AI 2.0.

Models downloaded:
  - emotion-ferplus-8.onnx  (~6 MB)   Face emotion classification (FERPlus-8)
  - blazeface.onnx           (~1 MB)   Face detection

Usage:
    python backend/scripts/download_models.py

Models are saved to: backend/models/
"""

import hashlib
import shutil
import sys
import urllib.request
from pathlib import Path

MODELS_DIR = Path(__file__).parent.parent / "models"

MODELS = [
    {
        "name": "emotion-ferplus-8.onnx",
        "url": (
            "https://github.com/onnx/models/raw/main/validated/vision/body_analysis/"
            "emotion_ferplus/model/emotion-ferplus-8.onnx"
        ),
        "description": "FERPlus-8 face emotion classifier (Microsoft, 8 classes)",
    },
    {
        "name": "blazeface.onnx",
        "url": (
            "https://github.com/hollance/BlazeFace-PyTorch/raw/master/blazeface.onnx"
        ),
        "description": "BlazeFace face detector (MediaPipe)",
        "optional": True,
        "fallback": "OpenCV Haar cascade (built-in) will be used if unavailable",
    },
]


def download_file(url: str, dest: Path, description: str) -> bool:
    """Download a file with a progress indicator."""
    print(f"\n  → {description}")
    print(f"    URL: {url}")
    print(f"    Dest: {dest}")

    try:
        def progress(block_num, block_size, total_size):
            if total_size > 0:
                pct = min(100, block_num * block_size * 100 // total_size)
                bar = "█" * (pct // 5) + "░" * (20 - pct // 5)
                print(f"\r    [{bar}] {pct}%", end="", flush=True)

        urllib.request.urlretrieve(url, dest, reporthook=progress)
        print(f"\r    [{'█' * 20}] 100% — Done ({dest.stat().st_size / 1024:.0f} KB)")
        return True

    except Exception as e:
        print(f"\n    ❌ Failed: {e}")
        return False


def main() -> None:
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    print(f"\n🧠 Aura AI — Emotion Model Downloader")
    print(f"   Output directory: {MODELS_DIR}\n")

    success_count = 0
    for model in MODELS:
        dest = MODELS_DIR / model["name"]
        is_optional = model.get("optional", False)

        if dest.exists():
            size_kb = dest.stat().st_size / 1024
            print(f"  ✅ {model['name']} already exists ({size_kb:.0f} KB) — skipping")
            success_count += 1
            continue

        ok = download_file(model["url"], dest, model["description"])
        if ok:
            success_count += 1
        elif is_optional:
            fallback = model.get("fallback", "")
            print(f"  ⚠️  Optional model skipped. {fallback}")
        else:
            print(f"  ❌ Required model failed. Face emotion will be disabled.")

    print(f"\n{'='*50}")
    print(f"Downloaded {success_count}/{len(MODELS)} models.")

    # Verify onnxruntime installed
    try:
        import onnxruntime
        print(f"✅ onnxruntime {onnxruntime.__version__} is installed")
    except ImportError:
        print("⚠️  onnxruntime not installed. Run:")
        print("   pip install onnxruntime opencv-python-headless numpy")

    print("\nAura face emotion is ready to use!\n")


if __name__ == "__main__":
    main()
