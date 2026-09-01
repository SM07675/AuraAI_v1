# Aura AI 2.0 — Local Models & Open Source Licenses

This document details the licensing, upstream sources, architecture, and verification checksums for all local machine learning models utilized by the Aura AI 2.0 multimodal engine.

---

## 1. Text Emotion Model
- **Identifier**: `j-hartmann/emotion-english-distilroberta-base`
- **Architecture**: DistilRoBERTa Transformer (6 emotion classes: `anger`, `disgust`, `fear`, `joy`, `neutral`, `sadness`, `surprise`)
- **Format**: Hugging Face SafeTensors (`model.safetensors`)
- **Upstream Source**: [Hugging Face Hub](https://huggingface.co/j-hartmann/emotion-english-distilroberta-base)
- **License**: **Apache License 2.0**
- **Disk Size**: ~313.29 MB
- **Local Path**: `models/text/emotion-english-distilroberta-base/`

---

## 2. Face Emotion Model
- **Identifier**: `emotion-ferplus-8.onnx`
- **Architecture**: VGG / ResNet FER+ Facial Expression Recognition
- **Format**: ONNX Runtime binary
- **Upstream Source**: [ONNX Model Zoo - Emotion FER+](https://github.com/onnx/models/tree/main/validated/vision/body_analysis/ferplus)
- **License**: **MIT License**
- **Disk Size**: ~33.42 MB
- **Local Path**: `models/face/ferplus/emotion-ferplus-8.onnx`

---

## 3. Face Landmark & Blendshapes Tracker
- **Identifier**: `face_landmarker.task` / `blaze_face_short_range.tflite`
- **Architecture**: MediaPipe Face Mesh & Blendshapes Tracker (478 3D landmarks + Action Unit estimation)
- **Format**: Google MediaPipe Task / FlatBuffers
- **Upstream Source**: [Google MediaPipe Solutions](https://developers.google.com/mediapipe/solutions/vision/face_landmarker)
- **License**: **Apache License 2.0**
- **Disk Size**: ~3.58 MB
- **Local Path**: `models/face/mediapipe/face_landmarker.task`

---

## 4. Voice Emotion Recognition
- **Identifier**: `speechbrain/emotion-recognition-wav2vec2-IEMOCAP`
- **Architecture**: wav2vec2-base + IEMOCAP Acoustic Classifier with Fallback Prosody Analyzer
- **Format**: PyTorch / TorchAudio / NumPy Acoustic Energy Features
- **Upstream Source**: [SpeechBrain / IEMOCAP](https://huggingface.co/speechbrain/emotion-recognition-wav2vec2-IEMOCAP)
- **License**: **Apache License 2.0**
- **Local Path**: `models/voice/emotion-recognition-wav2vec2-IEMOCAP/`

---

## 5. Speech-to-Text Engine
- **Identifier**: `faster-whisper`
- **Architecture**: OpenAI Whisper Tiny/Base with CTranslate2 INT8/FP16 acceleration
- **Format**: CTranslate2 quantized model
- **Upstream Source**: [SYSTRAN faster-whisper](https://github.com/SYSTRAN/faster-whisper)
- **License**: **MIT License**
- **Local Path**: `models/speech/whisper/`

---

## Redistribution & Commercial Compliance
All models packaged or downloaded by Aura AI 2.0 comply with their respective permissive open-source licenses (Apache-2.0 and MIT). No copyleft or proprietary restrictive components are utilized.
