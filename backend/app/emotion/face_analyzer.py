"""
Face Emotion Analyzer — BlazeFace + FERPlus ONNX.

Pipeline
--------
Camera frame (base64 JPEG or np.ndarray BGR)
    ↓
OpenCV decode
    ↓
BlazeFace (blazeface.onnx)   — detects & crops face region
    ↓
FERPlus (emotion-ferplus-8.onnx)  — 8-class emotion classification
    ↓
EmotionResult(modality='face')

Model Files
-----------
Place in: backend/models/
  - blazeface.onnx          (~1 MB)   Face detection
  - emotion-ferplus-8.onnx  (~6 MB)   Emotion classification

Download:
  blazeface.onnx:
    https://github.com/hollance/BlazeFace-PyTorch/raw/master/blazeface.onnx
    OR use: python scripts/download_models.py

  emotion-ferplus-8.onnx:
    https://github.com/onnx/models/raw/main/validated/vision/body_analysis/
    emotion_ferplus/model/emotion-ferplus-8.onnx

If models are absent, the analyzer marks itself unavailable and the
system continues with text-only emotion (graceful degradation).
"""

from __future__ import annotations

import base64
import io
import logging
from pathlib import Path
from typing import Any

from app.emotion.base import EmotionAnalyzer, EmotionResult, NEGATIVE_EMOTIONS
from app.core.logging_config import get_logger

logger = get_logger(__name__)

# ── Model paths ───────────────────────────────────────────────────────────────
_MODELS_DIR = Path(__file__).parent.parent.parent / "models"
_FERPLUS_MODEL = _MODELS_DIR / "emotion-ferplus-8.onnx"
_BLAZEFACE_MODEL = _MODELS_DIR / "blazeface.onnx"

# FERPlus-8 class labels (in order of model output)
_FERPLUS_CLASSES = [
    "neutral", "happy", "surprised", "sad",
    "angry", "disgusted", "fearful", "contempt",
]

# Mapping from FERPlus classes to our canonical emotion labels
_LABEL_MAP: dict[str, str] = {
    "neutral": "neutral",
    "happy": "happy",
    "surprised": "surprised",
    "sad": "sad",
    "angry": "angry",
    "disgusted": "disgusted",
    "fearful": "fearful",
    "contempt": "contempt",
}

# FERPlus input: 64×64 grayscale
_FERPLUS_INPUT_SIZE = (64, 64)

# Minimum face detection confidence to accept a face
_FACE_DETECT_THRESHOLD = 0.75

# Minimum emotion confidence to report a non-neutral result
_EMOTION_CONFIDENCE_THRESHOLD = 0.30


class FaceEmotionAnalyzer(EmotionAnalyzer):
    """Real face emotion analyzer using BlazeFace + FERPlus ONNX.

    Models are loaded lazily on first call and cached for the lifetime
    of this object. If either model file is absent, the analyzer marks
    itself as unavailable and returns a mock result.

    Thread safety: Uses asyncio — do not call from multiple threads
    concurrently. ONNX Runtime sessions are stateless for inference.
    """

    def __init__(self) -> None:
        self._face_session: Any | None = None    # ONNX session for BlazeFace
        self._emo_session: Any | None = None     # ONNX session for FERPlus
        self._loaded: bool = False
        self._available: bool = False
        self._cv2: Any | None = None             # cv2 module (optional)
        self._np: Any | None = None              # numpy module (optional)

    @property
    def modality(self) -> str:
        return "face"

    @property
    def is_available(self) -> bool:
        if not self._loaded:
            self._try_load()
        return self._available

    def _try_load(self) -> None:
        """Attempt to load ONNX models. Safe to call multiple times."""
        self._loaded = True

        # Check dependencies
        try:
            import cv2
            import numpy as np
            import onnxruntime as ort
            self._cv2 = cv2
            self._np = np
        except ImportError as e:
            logger.warning(
                "Face emotion requires cv2, numpy, and onnxruntime",
                error=str(e),
                hint="pip install onnxruntime opencv-python-headless numpy",
            )
            self._available = False
            return

        # Check model files
        if not _FERPLUS_MODEL.exists():
            logger.warning(
                "FERPlus ONNX model not found — face emotion disabled",
                expected_path=str(_FERPLUS_MODEL),
                hint="Run: python backend/scripts/download_models.py",
            )
            self._available = False
            return

        try:
            opts = ort.SessionOptions()
            opts.log_severity_level = 3  # Suppress ONNX Runtime logs
            # Prefer CPU provider for stability; GPU optional
            providers = ["CPUExecutionProvider"]
            try:
                if "CUDAExecutionProvider" in ort.get_available_providers():
                    providers = ["CUDAExecutionProvider", "CPUExecutionProvider"]
            except Exception:
                pass

            self._emo_session = ort.InferenceSession(
                str(_FERPLUS_MODEL), sess_options=opts, providers=providers
            )

            # BlazeFace is optional — fall back to Haar cascade if missing
            if _BLAZEFACE_MODEL.exists():
                self._face_session = ort.InferenceSession(
                    str(_BLAZEFACE_MODEL), sess_options=opts, providers=providers
                )
                logger.info("BlazeFace face detector loaded")
            else:
                logger.info(
                    "blazeface.onnx not found — using OpenCV Haar cascade for face detection"
                )

            self._available = True
            logger.info(
                "FaceEmotionAnalyzer ready",
                ferplus_model=str(_FERPLUS_MODEL.name),
                use_blazeface=self._face_session is not None,
            )

        except Exception as e:
            logger.error("Failed to load FERPlus ONNX model", error=str(e))
            self._available = False

    async def analyze(self, input_data: Any) -> EmotionResult:
        """Analyze face emotion from an image.

        Args:
            input_data: One of:
                - str: base64-encoded JPEG/PNG image
                - bytes: raw image bytes
                - np.ndarray: BGR image (from cv2.imread or camera frame)

        Returns:
            EmotionResult with modality='face'. Never raises — returns
            a mock result if face not detected or model unavailable.
        """
        if input_data is None:
            return self._no_face_result(reason="empty_input")
        if isinstance(input_data, (str, bytes)) and len(input_data) == 0:
            return self._no_face_result(reason="empty_input")
        if not self.is_available:
            return self._no_face_result(reason="model_unavailable")

        try:
            frame = self._decode_input(input_data)
            if frame is None:
                return self._no_face_result(reason="decode_failed")

            face_crop = self._detect_and_crop(frame)
            if face_crop is None:
                return self._no_face_result(reason="no_face_detected")

            return self._run_ferplus(face_crop)

        except Exception as e:
            logger.warning("Face emotion analysis failed", error=str(e))
            return self._no_face_result(reason="inference_error")

    # ── Internal pipeline ─────────────────────────────────────────────────────

    def _decode_input(self, input_data: Any) -> Any | None:
        """Decode various input formats to a BGR numpy array with PIL fallback."""
        np = self._np
        cv2 = self._cv2

        if isinstance(input_data, np.ndarray):
            return input_data

        raw_bytes = None
        if isinstance(input_data, bytes):
            raw_bytes = input_data
        elif isinstance(input_data, str):
            if "," in input_data:
                input_data = input_data.split(",", 1)[1]
            try:
                raw_bytes = base64.b64decode(input_data)
            except Exception:
                return None

        if raw_bytes is None:
            return None

        # 1. Try OpenCV decode
        if cv2 is not None:
            try:
                buf = np.frombuffer(raw_bytes, dtype=np.uint8)
                img = cv2.imdecode(buf, cv2.IMREAD_COLOR)
                if img is not None:
                    return img
            except Exception:
                pass

        # 2. Try Pillow decode
        try:
            from PIL import Image
            pil_img = Image.open(io.BytesIO(raw_bytes)).convert("RGB")
            rgb_arr = np.array(pil_img)
            # RGB -> BGR
            return rgb_arr[:, :, ::-1]
        except Exception:
            return None

    def _detect_and_crop(self, frame: Any) -> Any | None:
        """Detect face and return cropped region."""
        if frame is None:
            return None

        face = None
        if self._face_session is not None:
            face = self._detect_blazeface(frame)
        if face is None:
            face = self._detect_haar(frame)

        # Fallback: if user is on webcam, center region contains the face
        if face is None and hasattr(frame, "shape") and len(frame.shape) >= 2:
            h, w = frame.shape[:2]
            if h >= 32 and w >= 32:
                # 70% centered face box
                y1 = int(h * 0.12)
                y2 = int(h * 0.88)
                x1 = int(w * 0.18)
                x2 = int(w * 0.82)
                face = frame[y1:y2, x1:x2]

        return face

    def _detect_blazeface(self, frame: Any) -> Any | None:
        """BlazeFace-based face detection."""
        np = self._np
        cv2 = self._cv2

        try:
            h, w = frame.shape[:2]
            # BlazeFace expects 128×128 RGB float32, values [0, 1]
            resized = cv2.resize(frame, (128, 128))
            rgb = cv2.cvtColor(resized, cv2.COLOR_BGR2RGB)
            blob = (rgb.astype(np.float32) / 255.0).reshape(1, 128, 128, 3)

            input_name = self._face_session.get_inputs()[0].name
            outputs = self._face_session.run(None, {input_name: blob})

            # Parse detection boxes
            if outputs and len(outputs) > 0:
                boxes = outputs[0]
                if boxes.ndim == 3:
                    boxes = boxes[0]
                if boxes.shape[0] > 0:
                    box = boxes[0]
                    if len(box) >= 4:
                        y1, x1, y2, x2 = box[:4]
                        x1 = max(0, int(x1 * w))
                        y1 = max(0, int(y1 * h))
                        x2 = min(w, int(x2 * w))
                        y2 = min(h, int(y2 * h))

                        if x2 > x1 and y2 > y1:
                            return frame[y1:y2, x1:x2]
        except Exception as e:
            logger.debug("BlazeFace detection failed", error=str(e))

        return None

    def _detect_haar(self, frame: Any) -> Any | None:
        """OpenCV face detection fallback."""
        cv2 = self._cv2
        if cv2 is None or not hasattr(cv2, "CascadeClassifier"):
            return None

        try:
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            cascade_path = getattr(cv2, "data", None)
            xml_path = getattr(cascade_path, "haarcascades", "") + "haarcascade_frontalface_default.xml"
            cascade = cv2.CascadeClassifier(xml_path)
            faces = cascade.detectMultiScale(
                gray, scaleFactor=1.1, minNeighbors=4, minSize=(36, 36)
            )
            if len(faces) > 0:
                x, y, fw, fh = max(faces, key=lambda f: f[2] * f[3])
                return frame[y:y + fh, x:x + fw]
        except Exception as e:
            logger.debug("Haar face detection failed", error=str(e))

        return None

    def _run_ferplus(self, face_crop: Any) -> EmotionResult:
        """Run FERPlus inference on a cropped face image."""
        np = self._np
        cv2 = self._cv2

        # FERPlus input: 64×64 grayscale, float32
        gray = cv2.cvtColor(face_crop, cv2.COLOR_BGR2GRAY)
        resized = cv2.resize(gray, _FERPLUS_INPUT_SIZE)
        blob = resized.astype(np.float32).reshape(1, 1, 64, 64)

        input_name = self._emo_session.get_inputs()[0].name
        outputs = self._emo_session.run(None, {input_name: blob})

        # outputs[0] shape: [1, 8] — raw logits
        logits = outputs[0][0].astype(np.float64)

        # Softmax
        logits -= logits.max()
        exp = np.exp(logits)
        probs = exp / exp.sum()

        # Build scores dict
        scores: dict[str, float] = {
            _LABEL_MAP.get(label, label): float(probs[i])
            for i, label in enumerate(_FERPLUS_CLASSES)
        }

        # Top-2
        sorted_emotions = sorted(scores.items(), key=lambda x: x[1], reverse=True)
        primary_label, primary_prob = sorted_emotions[0]
        secondary_label, secondary_prob = sorted_emotions[1] if len(sorted_emotions) > 1 else (None, 0.0)

        # Apply threshold
        if primary_prob < _EMOTION_CONFIDENCE_THRESHOLD:
            primary_label = "neutral"
            primary_prob = max(primary_prob, 0.5)

        # Derive stress and sentiment from face emotion
        stress = "high" if primary_label in {"angry", "fearful", "anxious"} else \
                 "medium" if primary_label in {"sad", "disgusted", "contempt", "frustrated"} else "low"
        sentiment = "positive" if primary_label in {"happy", "surprised", "calm", "excited"} else \
                    "negative" if primary_label in NEGATIVE_EMOTIONS else "neutral"

        return EmotionResult(
            emotion=primary_label,
            confidence=round(primary_prob * 100, 1),
            scores=scores,
            modality="face",
            sentiment=sentiment,
            stress_level=stress,
            secondary_emotion=secondary_label,
            secondary_confidence=round(secondary_prob * 100, 1),
            face_detected=True,
            is_mock=False,
        )

    def _no_face_result(self, reason: str = "unknown") -> EmotionResult:
        """Return a safe no-face result."""
        logger.debug("Face emotion: no result", reason=reason)
        return EmotionResult(
            emotion="neutral",
            confidence=0.0,
            scores={"neutral": 1.0},
            modality="face",
            face_detected=False,
            is_mock=True,
        )
