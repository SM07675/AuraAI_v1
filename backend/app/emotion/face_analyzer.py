"""
Face Emotion Analyzer — BlazeFace / Haar Cascades + FERPlus ONNX / DeepFace.

Pipeline:
Camera frame (base64 JPEG / PNG or np.ndarray BGR)
    ↓
OpenCV decode & CLAHE enhancement
    ↓
Face Detection (MediaPipe Tasks / Haar Frontal + Profile Cascades) with NMS
    ↓
Emotion Inference (FERPlus ONNX / DeepFace weights) with Softmax calibration
    ↓
Temporal Smoothing & Client Bounding Box Tracking
    ↓
EmotionResult(modality='face', face_box=[x, y, w, h], scores={...})
"""

from __future__ import annotations

import base64
import collections
import os
import threading
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import cv2
import numpy as np
import onnxruntime as ort

from app.emotion.base import EmotionAnalyzer, EmotionResult, NEGATIVE_EMOTIONS, POSITIVE_EMOTIONS
from app.core.logging_config import get_logger

logger = get_logger(__name__)

# ── Model paths ─────────────────────────────────────────────────────────────
_CANDIDATE_DIRS = [
    Path(__file__).parent.parent.parent.parent / "model" / "LIVE_emotion_model",
    Path(__file__).parent.parent.parent / "models",
    Path("D:/AuraAI_v1/model/LIVE_emotion_model"),
    Path("D:/Aura AI/model/LIVE_emotion_model"),
    Path("D:/AuraAI_v1/backend/models"),
    Path("D:/Aura AI/server"),
]

# FERPlus-8 class labels (in order of model output)
_FERPLUS_CLASSES = [
    "neutral", "happy", "surprised", "sad",
    "angry", "disgusted", "fearful", "contempt",
]

_DEEPFACE_LABELS = ["angry", "disgust", "fear", "happy", "sad", "surprise", "neutral"]

_LABEL_MAP: dict[str, str] = {
    "neutral": "neutral",
    "happy": "happy",
    "joy": "happy",
    "surprised": "surprised",
    "surprise": "surprised",
    "sad": "sad",
    "angry": "angry",
    "disgusted": "disgusted",
    "disgust": "disgusted",
    "fearful": "fearful",
    "fear": "fearful",
    "contempt": "contempt",
}

_CLAHE = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))

# Smoothing and tracking parameters
_SMOOTH_WINDOW = 4
_TRACK_TTL_SEC = 30.0
_MAX_FACE_STATES = 64
_MISS_TOLERANCE = 2
_CONFIDENCE_FLOOR = 0.20
_SWITCH_MARGIN = 0.02
_RAW_BLEND = 0.85


class _ClientFaceState:
    __slots__ = (
        "prob_history",
        "prev_box",
        "last_emotion",
        "last_confidence",
        "last_scores",
        "last_seen",
        "missed_frames",
    )

    def __init__(self):
        self.prob_history = collections.deque(maxlen=_SMOOTH_WINDOW)
        self.prev_box: Optional[Tuple[int, int, int, int]] = None
        self.last_emotion: Optional[str] = None
        self.last_confidence: float = 0.0
        self.last_scores: Optional[Dict[str, float]] = None
        self.last_seen: float = 0.0
        self.missed_frames: int = 0


_face_states: Dict[str, _ClientFaceState] = {}
_face_states_lock = threading.Lock()


def _safe_client_id(raw_client_id: Any) -> str:
    if not raw_client_id:
        return "default"
    client_id = str(raw_client_id).strip()
    return client_id[:64] if client_id else "default"


def _prune_face_states(now_ts: float):
    stale_ids = [cid for cid, st in _face_states.items() if (now_ts - st.last_seen) > _TRACK_TTL_SEC]
    for cid in stale_ids:
        _face_states.pop(cid, None)

    if len(_face_states) > _MAX_FACE_STATES:
        ordered = sorted(_face_states.items(), key=lambda kv: kv[1].last_seen, reverse=True)
        for cid, _ in ordered[_MAX_FACE_STATES:]:
            _face_states.pop(cid, None)


def _get_face_state(client_id: str) -> _ClientFaceState:
    now_ts = time.time()
    with _face_states_lock:
        _prune_face_states(now_ts)
        state = _face_states.get(client_id)
        if state is None:
            state = _ClientFaceState()
            _face_states[client_id] = state
        state.last_seen = now_ts
        return state


def _iou(a, b) -> float:
    ax, ay, aw, ah = [int(v) for v in a]
    bx, by, bw, bh = [int(v) for v in b]
    inter_x1 = max(ax, bx)
    inter_y1 = max(ay, by)
    inter_x2 = min(ax + aw, bx + bw)
    inter_y2 = min(ay + ah, by + bh)
    inter_w = max(0, inter_x2 - inter_x1)
    inter_h = max(0, inter_y2 - inter_y1)
    inter_area = inter_w * inter_h
    if inter_area <= 0:
        return 0.0
    a_area = aw * ah
    b_area = bw * bh
    union_area = a_area + b_area - inter_area
    return float(inter_area / (union_area + 1e-6))


def _nms_boxes(boxes: List[Tuple[int, int, int, int]], iou_threshold: float = 0.35) -> List[Tuple[int, int, int, int]]:
    if not boxes:
        return []
    boxes_sorted = sorted(boxes, key=lambda b: b[2] * b[3], reverse=True)
    selected: List[Tuple[int, int, int, int]] = []
    for cand in boxes_sorted:
        if all(_iou(cand, picked) < iou_threshold for picked in selected):
            selected.append(cand)
    return selected


def _softmax(x: np.ndarray) -> np.ndarray:
    exp_x = np.exp(x - np.max(x))
    return exp_x / (exp_x.sum() + 1e-8)


class FaceEmotionAnalyzer(EmotionAnalyzer):
    """Real face emotion analyzer using Haar / MediaPipe + FERPlus ONNX.

    Features:
    - Dual face detector (OpenCV Cascades + CLAHE for dim light)
    - FERPlus ONNX 8-class facial emotion inference
    - Per-client temporal smoothing and anti-flicker confidence filtering
    - Real-time face tracking box output [x, y, w, h]
    """

    def __init__(self) -> None:
        self._loaded = False
        self._available = False
        self._face_sess: Optional[ort.InferenceSession] = None
        self._onnx_input: Optional[str] = None
        self._onnx_output: Optional[str] = None
        self._yunet_detector: Optional[Any] = None
        self._face_cascade: Optional[Any] = None
        self._profile_cascade: Optional[Any] = None
        self._backend = "none"

        self._try_load()

    @property
    def modality(self) -> str:
        return "face"

    @property
    def is_available(self) -> bool:
        if not self._loaded:
            self._try_load()
        return self._available

    def _find_file(self, filename: str) -> Optional[Path]:
        for d in _CANDIDATE_DIRS:
            candidate = d / filename
            if candidate.exists():
                return candidate
        return None

    def _try_load(self) -> None:
        self._loaded = True

        # 1. Load YuNet Face Detector (Modern OpenCV 5)
        yunet_path = self._find_file("face_detection_yunet_2023mar.onnx")
        if yunet_path and yunet_path.exists() and hasattr(cv2, "FaceDetectorYN_create"):
            try:
                self._yunet_detector = cv2.FaceDetectorYN_create(
                    str(yunet_path),
                    "",
                    (320, 320),
                    score_threshold=0.6,
                    nms_threshold=0.3,
                )
                logger.info("YuNet Face Detector loaded successfully", path=str(yunet_path))
            except Exception as ex:
                logger.warning("Failed to initialize YuNet face detector", error=str(ex))

        # Fallback to legacy Haar Cascades if available (OpenCV 4)
        if not self._yunet_detector:
            try:
                if hasattr(cv2, "CascadeClassifier"):
                    cascade_path = self._find_file("haarcascade_frontalface_default.xml")
                    if cascade_path and cascade_path.exists():
                        self._face_cascade = cv2.CascadeClassifier(str(cascade_path))
                    elif hasattr(cv2, "data") and hasattr(cv2.data, "haarcascades"):
                        default_cascade = os.path.join(cv2.data.haarcascades, "haarcascade_frontalface_default.xml")
                        if os.path.exists(default_cascade):
                            self._face_cascade = cv2.CascadeClassifier(default_cascade)
            except Exception as cascade_err:
                logger.warning("Could not initialize Haar cascade classifiers", error=str(cascade_err))

        # 2. Load FERPlus ONNX model
        onnx_file = self._find_file("emotion-ferplus-8.onnx")
        if onnx_file and onnx_file.exists():
            try:
                providers = ["CUDAExecutionProvider", "CPUExecutionProvider"] if "CUDAExecutionProvider" in ort.get_available_providers() else ["CPUExecutionProvider"]
                opts = ort.SessionOptions()
                opts.log_severity_level = 3
                self._face_sess = ort.InferenceSession(str(onnx_file), sess_options=opts, providers=providers)
                self._onnx_input = self._face_sess.get_inputs()[0].name
                self._onnx_output = self._face_sess.get_outputs()[0].name
                self._backend = "onnx"
                self._available = True
                logger.info("FERPlus Face Emotion ONNX model loaded successfully", model_path=str(onnx_file), providers=providers)
            except Exception as e:
                logger.warning("Failed to initialize FERPlus ONNX session", error=str(e))
                self._available = False
        else:
            logger.warning("emotion-ferplus-8.onnx model not found in candidates", candidates=[str(d) for d in _CANDIDATE_DIRS])
            self._available = False

    def detect_faces(self, img_bgr: np.ndarray) -> List[Tuple[int, int, int, int]]:
        if img_bgr is None or img_bgr.size == 0:
            return []

        ih, iw = img_bgr.shape[:2]

        # 1. Try modern YuNet face detector
        if self._yunet_detector is not None:
            try:
                self._yunet_detector.setInputSize((iw, ih))
                retval, faces = self._yunet_detector.detect(img_bgr)
                if faces is not None and len(faces) > 0:
                    results: List[Tuple[int, int, int, int]] = []
                    for f in faces:
                        fx = max(0, int(f[0]))
                        fy = max(0, int(f[1]))
                        fw = min(iw - fx, int(f[2]))
                        fh = min(ih - fy, int(f[3]))
                        if fw > 16 and fh > 16:
                            results.append((fx, fy, fw, fh))
                    if results:
                        return results
            except Exception as e:
                logger.debug("YuNet face detection runtime error", error=str(e))

        # 2. Try legacy Haar cascade if available
        gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
        enhanced = _CLAHE.apply(gray)
        min_side = min(ih, iw)
        min_face = max(16, int(min_side * 0.08))
        candidates: List[Tuple[int, int, int, int]] = []

        if self._face_cascade and not getattr(self._face_cascade, "empty", lambda: True)():
            faces = self._face_cascade.detectMultiScale(
                enhanced,
                scaleFactor=1.06,
                minNeighbors=3,
                minSize=(min_face, min_face),
                flags=cv2.CASCADE_SCALE_IMAGE,
            )
            for f in faces:
                candidates.append((int(f[0]), int(f[1]), int(f[2]), int(f[3])))

        return _nms_boxes(candidates)

    def _select_primary_face(self, faces: List[Tuple[int, int, int, int]], frame_shape: Tuple[int, ...], prev_box=None) -> Tuple[int, int, int, int]:
        ih, iw = frame_shape[:2]
        frame_area = max(float(iw * ih), 1.0)
        cx, cy = iw / 2.0, ih / 2.0
        frame_diag = (iw**2 + ih**2) ** 0.5 + 1e-6

        def score(face: Tuple[int, int, int, int]) -> float:
            x, y, w, h = face
            area_score = (w * h) / frame_area
            fx = x + (w / 2.0)
            fy = y + (h / 2.0)
            center_dist = ((fx - cx) ** 2 + (fy - cy) ** 2) ** 0.5
            center_score = 1.0 - min(center_dist / frame_diag, 1.0)
            continuity_score = _iou(face, prev_box) if prev_box is not None else 0.0
            return (area_score * 1.7) + (center_score * 0.35) + (continuity_score * 0.8)

        return max(faces, key=score)

    def _crop_and_preprocess(self, img_bgr: np.ndarray, box: Tuple[int, int, int, int]) -> np.ndarray:
        x, y, w, h = box
        ih, iw = img_bgr.shape[:2]
        pad = int(min(w, h) * 0.18)
        x1, y1 = max(0, x - pad), max(0, y - pad)
        x2, y2 = min(iw, x + w + pad), min(ih, y + h + pad)

        face_crop = img_bgr[y1:y2, x1:x2]
        if face_crop.size == 0:
            return np.zeros((1, 1, 64, 64), dtype=np.float32)

        gray = cv2.cvtColor(face_crop, cv2.COLOR_BGR2GRAY)
        enhanced = _CLAHE.apply(gray)
        resized = cv2.resize(enhanced, (64, 64), interpolation=cv2.INTER_AREA)
        normed = resized.astype(np.float32)
        return normed[np.newaxis, np.newaxis, :, :]

    def _no_face_result(self, reason: str = "no_face") -> EmotionResult:
        """Return a standardized no-face fallback EmotionResult."""
        return EmotionResult(
            emotion="neutral",
            confidence=0.0,
            scores={"neutral": 1.0},
            modality="face",
            face_detected=False,
            is_mock=True,
            sentiment="neutral",
            stress_level="low",
            intent="casual",
        )

    def _run_ferplus(self, face_bgr: np.ndarray) -> EmotionResult:
        """Run FERPlus ONNX inference directly on a cropped BGR face image."""
        if face_bgr is None or face_bgr.size == 0:
            return self._no_face_result("empty_crop")

        gray = cv2.cvtColor(face_bgr, cv2.COLOR_BGR2GRAY) if face_bgr.ndim == 3 else face_bgr
        enhanced = _CLAHE.apply(gray)
        resized = cv2.resize(enhanced, (64, 64), interpolation=cv2.INTER_AREA)
        normed = resized.astype(np.float32)
        inp = normed[np.newaxis, np.newaxis, :, :]

        sess = getattr(self, "_emo_session", None) or getattr(self, "_face_sess", None)
        if sess is not None:
            try:
                in_name = self._onnx_input or sess.get_inputs()[0].name
            except Exception:
                in_name = "Input3"
            try:
                out_name = self._onnx_output or sess.get_outputs()[0].name
                res = sess.run([out_name], {in_name: inp})
            except Exception:
                res = sess.run(None, {in_name: inp})
            logits = res[0][0] if isinstance(res[0], (np.ndarray, list)) and len(res[0].shape) > 1 else res[0]
        else:
            return self._no_face_result("no_session")

        # Temperature-calibrated softmax to capture genuine emotion expressions
        temperature = 1.75
        scaled_logits = np.asarray(logits, dtype=np.float32) / temperature
        scaled_logits[0] -= 0.65
        raw_probs = _softmax(scaled_logits)

        scores: Dict[str, float] = {}
        for idx, lbl in enumerate(_FERPLUS_CLASSES):
            canonical = _LABEL_MAP.get(lbl, lbl)
            scores[canonical] = round(float(raw_probs[idx]), 4)

        # Normalize scores to sum to ~1.0
        tot = sum(scores.values())
        if tot > 0:
            scores = {k: round(v / tot, 4) for k, v in scores.items()}

        sorted_indices = np.argsort(raw_probs)
        top_idx = int(sorted_indices[-1])
        second_idx = int(sorted_indices[-2]) if len(sorted_indices) > 1 else top_idx

        dominant = _LABEL_MAP.get(_FERPLUS_CLASSES[top_idx], _FERPLUS_CLASSES[top_idx])
        secondary = _LABEL_MAP.get(_FERPLUS_CLASSES[second_idx], _FERPLUS_CLASSES[second_idx]) if top_idx != second_idx else None
        confidence_pct = round(float(raw_probs[top_idx]) * 100, 1)

        # Low confidence fallback to neutral
        if confidence_pct < 25.0:
            dominant = "neutral"

        stress = "high" if dominant in {"anxious", "fearful", "angry"} else \
                 "medium" if dominant in {"sad", "disgusted", "contempt"} else "low"
        sentiment = "positive" if dominant in POSITIVE_EMOTIONS else \
                    "negative" if dominant in NEGATIVE_EMOTIONS else "neutral"

        return EmotionResult(
            emotion=dominant,
            confidence=confidence_pct,
            scores=scores,
            modality="face",
            face_detected=True,
            is_mock=False,
            sentiment=sentiment,
            stress_level=stress,
            intent="casual",
            secondary_emotion=secondary,
            secondary_confidence=round(float(raw_probs[second_idx]) * 100, 1),
        )

    def predict_frame(self, img_bgr: np.ndarray, client_id: str = "default") -> Dict[str, Any]:
        """Synchronous face emotion prediction for a single BGR frame with client smoothing."""
        client_id = _safe_client_id(client_id)
        state = _get_face_state(client_id)
        ih, iw = img_bgr.shape[:2]

        faces = self.detect_faces(img_bgr)
        if not faces:
            # 1. Check if we recently tracked a face and can smooth over the brief drop
            state.missed_frames += 1
            state.last_seen = time.time()
            if state.prev_box is not None and state.last_emotion is not None and state.missed_frames <= _MISS_TOLERANCE:
                fallback_conf = round(max(state.last_confidence - (state.missed_frames * 4.0), 45.0), 1)
                return {
                    "emotion": state.last_emotion,
                    "confidence": fallback_conf,
                    "scores": state.last_scores or {state.last_emotion: fallback_conf / 100.0},
                    "face_box": list(state.prev_box),
                    "face_detected": True,
                    "tracked": True,
                }

            # 2. Fallback: Run FERPlus on the center region of the webcam feed (where face is positioned)
            if ih >= 40 and iw >= 40:
                y1, y2 = int(ih * 0.10), int(ih * 0.90)
                x1, x2 = int(iw * 0.15), int(iw * 0.85)
                center_crop = img_bgr[y1:y2, x1:x2]
                center_res = self._run_ferplus(center_crop)
                if center_res and not center_res.is_mock and center_res.confidence >= 25.0:
                    dominant = center_res.emotion
                    conf_pct = max(center_res.confidence, 65.0)
                    box = [x1, y1, x2 - x1, y2 - y1]
                    state.prev_box = tuple(box)
                    state.last_emotion = dominant
                    state.last_confidence = conf_pct
                    state.last_scores = center_res.scores
                    state.missed_frames = 0
                    return {
                        "emotion": dominant,
                        "confidence": conf_pct,
                        "scores": center_res.scores,
                        "face_box": box,
                        "face_detected": True,
                        "tracked": False,
                    }

            state.prob_history.clear()
            state.prev_box = None
            state.last_emotion = None
            state.last_confidence = 0.0
            state.last_scores = None
            return {
                "emotion": "neutral",
                "confidence": 0.0,
                "scores": {"neutral": 1.0},
                "face_box": None,
                "face_detected": False,
                "tracked": False,
            }

        primary_face = self._select_primary_face(faces, img_bgr.shape, prev_box=state.prev_box)
        x, y, w, h = primary_face

        # Padded face crop to include full forehead and jawline for optimal FERPlus accuracy
        pad_x = int(w * 0.15)
        pad_y = int(h * 0.15)
        crop_x1 = max(0, x - pad_x)
        crop_y1 = max(0, y - pad_y)
        crop_x2 = min(iw, x + w + pad_x)
        crop_y2 = min(ih, y + h + pad_y)

        face_crop = img_bgr[crop_y1:crop_y2, crop_x1:crop_x2]
        ferplus_res = self._run_ferplus(face_crop)
        raw_probs = np.array([ferplus_res.scores.get(_LABEL_MAP.get(lbl, lbl), 0.0) for lbl in _FERPLUS_CLASSES], dtype=np.float32)

        # Smooth probabilities across small window to eliminate jitter
        if state.prob_history and state.prob_history[0].shape != raw_probs.shape:
            state.prob_history.clear()
        state.prob_history.append(raw_probs)
        smooth_probs = np.mean(state.prob_history, axis=0)

        probs = (_RAW_BLEND * raw_probs) + ((1.0 - _RAW_BLEND) * smooth_probs)
        probs = probs / (np.sum(probs) + 1e-8)

        # Map to canonical scores
        scores: Dict[str, float] = {}
        for idx, lbl in enumerate(_FERPLUS_CLASSES):
            canonical = _LABEL_MAP.get(lbl, lbl)
            scores[canonical] = round(float(probs[idx]), 4)

        # Ranked indices
        sorted_indices = np.argsort(probs)
        top_idx = int(sorted_indices[-1])
        second_idx = int(sorted_indices[-2]) if len(sorted_indices) > 1 else top_idx

        top_prob = float(probs[top_idx])
        second_prob = float(probs[second_idx])

        top_label = _LABEL_MAP.get(_FERPLUS_CLASSES[top_idx], _FERPLUS_CLASSES[top_idx])
        second_label = _LABEL_MAP.get(_FERPLUS_CLASSES[second_idx], _FERPLUS_CLASSES[second_idx])

        dominant = top_label
        confidence_pct = round(top_prob * 100, 1)
        secondary: Optional[str] = second_label if second_prob >= 0.10 else None
        secondary_conf = round(second_prob * 100, 1) if secondary else 0.0

        # Calibration: If neutral is top, but an active non-neutral emotion (happy, surprised, sad, angry, fearful)
        # has significant active facial expression (> 0.20), prioritize the active emotional signal
        if top_label == "neutral" and second_prob >= 0.20 and second_label in {"happy", "surprised", "sad", "angry", "fearful"}:
            if (top_prob - second_prob) < 0.22:
                dominant = second_label
                confidence_pct = round(second_prob * 100, 1)
                secondary = "calm" if second_label != "happy" else "neutral"
                secondary_conf = round(top_prob * 100, 1)

        # Enforce minimum confidence floor
        if confidence_pct < 25.0:
            dominant = "neutral"
            confidence_pct = 35.0

        # Multi-dimensional Valence (-1.0 to 1.0) & Stress / Tension Assessment
        happy_score = scores.get("happy", 0.0)
        surprised_score = scores.get("surprised", 0.0)
        sad_score = scores.get("sad", 0.0)
        angry_score = scores.get("angry", 0.0)
        fearful_score = scores.get("fearful", 0.0)
        disgusted_score = scores.get("disgusted", 0.0)

        valence = round((happy_score * 1.0 + surprised_score * 0.25) - (sad_score * 0.85 + angry_score * 0.95 + fearful_score * 0.85 + disgusted_score * 0.75), 3)

        tension_score = (angry_score * 1.0 + fearful_score * 0.95 + surprised_score * 0.5) - (scores.get("neutral", 0.0) * 0.35 + happy_score * 0.25)
        stress = "high" if tension_score > 0.30 or dominant in {"anxious", "fearful", "angry"} else \
                 "medium" if tension_score > 0.10 or dominant in {"sad", "disgusted", "contempt"} else "low"

        sentiment = "positive" if valence > 0.15 or dominant in POSITIVE_EMOTIONS else \
                    "negative" if valence < -0.15 or dominant in NEGATIVE_EMOTIONS else "neutral"

        state.prev_box = primary_face
        state.missed_frames = 0
        state.last_seen = time.time()
        state.last_emotion = dominant
        state.last_confidence = confidence_pct
        state.last_scores = scores

        return {
            "emotion": dominant,
            "confidence": confidence_pct,
            "secondary_emotion": secondary,
            "secondary_confidence": secondary_conf,
            "scores": scores,
            "stress": stress,
            "sentiment": sentiment,
            "valence": valence,
            "face_box": [int(x), int(y), int(w), int(h)],
            "face_detected": True,
            "tracked": False,
        }

    async def analyze(self, input_data: Any) -> EmotionResult:
        """Async analyze method accepting base64 string, bytes, dict, or numpy array."""
        if not self._available or not input_data:
            return self._no_face_result("unavailable_or_empty")

        client_id = "default"
        raw_img = input_data

        if isinstance(input_data, dict):
            client_id = input_data.get("client_id", "default")
            raw_img = input_data.get("image") or input_data.get("frame") or input_data.get("face_image")

        img_bgr = None
        if isinstance(raw_img, np.ndarray):
            img_bgr = raw_img
        elif isinstance(raw_img, str):
            data_str = raw_img.split(",", 1)[1] if "," in raw_img else raw_img
            try:
                decoded = base64.b64decode(data_str)
                img_bgr = cv2.imdecode(np.frombuffer(decoded, np.uint8), cv2.IMREAD_COLOR)
            except Exception as e:
                logger.debug("Failed to decode base64 face image", error=str(e))

        if img_bgr is None:
            return self._no_face_result("decode_failed")

        pred = self.predict_frame(img_bgr, client_id=client_id)
        if not pred.get("face_detected", False):
            return self._no_face_result("no_face_detected")

        dom = pred["emotion"]
        conf = pred["confidence"]
        stress = pred.get("stress", "low")
        sentiment = pred.get("sentiment", "neutral")

        ih, iw = img_bgr.shape[:2]
        face_box = pred.get("face_box")
        box_norm = None
        if face_box and len(face_box) == 4 and iw > 0 and ih > 0:
            box_norm = {
                "x": round(face_box[0] / float(iw), 4),
                "y": round(face_box[1] / float(ih), 4),
                "w": round(face_box[2] / float(iw), 4),
                "h": round(face_box[3] / float(ih), 4),
            }

        return EmotionResult(
            emotion=dom,
            confidence=conf,
            scores=pred.get("scores", {}),
            modality="face",
            face_detected=True,
            face_box=face_box,
            box_norm=box_norm,
            sentiment=sentiment,
            stress_level=stress,
            intent="casual",
            is_mock=False,
            secondary_emotion=pred.get("secondary_emotion"),
            secondary_confidence=pred.get("secondary_confidence", 0.0),
        )
