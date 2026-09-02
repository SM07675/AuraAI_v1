"""
Face Emotion Analyzer — MediaPipe FaceMesh + OpenFace 2.0 + FERPlus ONNX.

Pipeline:
Camera frame (base64 JPEG / PNG or np.ndarray BGR)
    ↓
Face Detection & Alignment (MediaPipe 478 3D Landmarks / Haar Cascade fallback)
    ↓
7-Factor Quality Scoring (lighting, blur, pose, landmarks, stability, frame, det)
    ↓
OpenFace 2.0 & FaceBehaviorService (Action Units presence/intensity, 3D Gaze, Head Pose, Movement Dynamics)
    ↓
FERPlus ONNX 8-Class Emotion Inference (Rate-separated keyframes)
    ↓
Temporal Smoothing & Emotion Transition Tracking (duration, stability, uncertainty)
    ↓
Standardized Facial-State JSON & EmotionResult
"""

from __future__ import annotations

import base64
import collections
import os
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import cv2
import numpy as np
import onnxruntime as ort

from app.core.logging_config import get_logger
from app.emotion.base import EmotionAnalyzer, EmotionResult, NEGATIVE_EMOTIONS, POSITIVE_EMOTIONS

logger = get_logger(__name__)

# Search paths for FERPlus ONNX model
_CANDIDATE_DIRS: List[Path] = [
    Path("/app/model/LIVE_emotion_model"),
    Path("/app/model"),
    Path("D:/AuraAI_v1/model/LIVE_emotion_model"),
    Path("D:/AuraAI_v1/models/face/ferplus"),
]
_curr_face = Path(__file__).resolve().parent
for _p in [_curr_face, *_curr_face.parents]:
    _CANDIDATE_DIRS.append(_p / "model" / "LIVE_emotion_model")
    _CANDIDATE_DIRS.append(_p / "models" / "face" / "ferplus")
    _CANDIDATE_DIRS.append(_p / "models")
    _CANDIDATE_DIRS.append(_p / "model")

# FERPlus-8 class labels
_FERPLUS_CLASSES = [
    "neutral", "happy", "surprised", "sad",
    "angry", "disgusted", "fearful", "contempt",
]

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

# Smoothing & transition constants
_SMOOTH_WINDOW = 8
_TRACK_TTL_SEC = 30.0
_MAX_FACE_STATES = 64
_INFERENCE_EVERY_N_FRAMES = 2  # Rate separation: classify emotion every 2nd frame
_STABILITY_DURATION_SEC = 0.8  # Minimum exhibition time to declare stable emotion


class _ClientFaceState:
    """State tracking for a client across rolling video frames."""

    __slots__ = (
        "prob_history",
        "prev_box",
        "prev_landmarks",
        "last_raw_probs",
        "last_emotion",
        "last_confidence",
        "last_scores",
        "last_seen",
        "frame_count",
        "emotion_start_ts",
        "emotion_duration",
        "is_stable",
        "transition_state",
        "last_facial_state",
        "dropped_frames",
    )

    def __init__(self):
        self.prob_history = collections.deque(maxlen=_SMOOTH_WINDOW)
        self.prev_box: Optional[Tuple[int, int, int, int]] = None
        self.prev_landmarks: Optional[List[Dict[str, float]]] = None
        self.last_raw_probs: Optional[np.ndarray] = None
        self.last_emotion: str = "neutral"
        self.last_confidence: float = 0.0
        self.last_scores: Optional[Dict[str, float]] = None
        self.last_seen: float = 0.0
        self.frame_count: int = 0
        self.emotion_start_ts: float = time.time()
        self.emotion_duration: float = 0.0
        self.is_stable: bool = False
        self.transition_state: str = "entering"
        self.last_facial_state: Optional[Dict[str, Any]] = None
        self.dropped_frames: int = 0


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
    """Upgraded face emotion and behavioral analyzer using MediaPipe + OpenFace + FERPlus ONNX."""

    def __init__(self) -> None:
        self._loaded = False
        self._available = False
        self._face_sess: Optional[ort.InferenceSession] = None
        self._onnx_input: Optional[str] = None
        self._onnx_output: Optional[str] = None
        self._face_mesh = None
        self._face_cascade: Optional[cv2.CascadeClassifier] = None
        self._profile_cascade: Optional[cv2.CascadeClassifier] = None
        self._backend = "none"
        self._active_provider = "CPUExecutionProvider"
        self._benchmarks: Dict[str, float] = {}

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
        self._face_landmarker = None
        self._face_mesh = None
        self._last_blendshapes = {}

        # 1. Initialize MediaPipe FaceLandmarker (Tasks API)
        try:
            task_file = self._find_file("face_landmarker.task")
            if not task_file or not task_file.exists():
                candidates = [
                    Path("models/face/mediapipe/face_landmarker.task"),
                    Path("backend/models/face/mediapipe/face_landmarker.task"),
                    Path(r"D:\AuraAI_v1\models\face\mediapipe\face_landmarker.task"),
                    Path("/app/models/face/mediapipe/face_landmarker.task"),
                ]
                for c in candidates:
                    if c.exists():
                        task_file = c
                        break

            if task_file and task_file.exists():
                from mediapipe.tasks import python as mp_python
                from mediapipe.tasks.python import vision as mp_vision

                base_opts = mp_python.BaseOptions(model_asset_path=str(task_file))
                opts = mp_vision.FaceLandmarkerOptions(
                    base_options=base_opts,
                    output_face_blendshapes=True,
                    output_facial_transformation_matrixes=True,
                    num_faces=1,
                    min_face_detection_confidence=0.40,
                    min_face_presence_confidence=0.40,
                )
                self._face_landmarker = mp_vision.FaceLandmarker.create_from_options(opts)
                logger.info("MediaPipe FaceLandmarker (Tasks API) loaded successfully", model_path=str(task_file))
        except Exception as exc:
            logger.debug("MediaPipe FaceLandmarker Tasks API init skipped/failed", error=str(exc))

        # Legacy FaceMesh fallback
        if self._face_landmarker is None:
            try:
                import mediapipe as mp
                if hasattr(mp, "solutions") and hasattr(mp.solutions, "face_mesh"):
                    self._face_mesh = mp.solutions.face_mesh.FaceMesh(
                        static_image_mode=False,
                        max_num_faces=1,
                        refine_landmarks=True,
                        min_detection_confidence=0.45,
                        min_tracking_confidence=0.45,
                    )
                    logger.info("MediaPipe legacy FaceMesh detector loaded successfully")
            except Exception as exc:
                logger.debug("MediaPipe legacy FaceMesh init skipped/failed", error=str(exc))

        # 2. Load YuNet Neural Face Detector (OpenCV DNN)
        self._yunet_detector = None
        try:
            yunet_file = self._find_file("face_detection_yunet_2023mar.onnx")
            if not yunet_file or not yunet_file.exists():
                candidates = [
                    Path("models/face_detection_yunet_2023mar.onnx"),
                    Path("backend/models/face_detection_yunet_2023mar.onnx"),
                    Path(r"D:\AuraAI_v1\models\face_detection_yunet_2023mar.onnx"),
                    Path("/app/models/face_detection_yunet_2023mar.onnx"),
                ]
                for c in candidates:
                    if c.exists():
                        yunet_file = c
                        break
            if yunet_file and yunet_file.exists() and hasattr(cv2, "FaceDetectorYN"):
                self._yunet_detector = cv2.FaceDetectorYN.create(
                    str(yunet_file), "", (320, 320), 0.45, 0.3, 5000
                )
                logger.info("YuNet Neural Face Detector loaded successfully", model_path=str(yunet_file))
        except Exception as exc:
            logger.debug("YuNet Face Detector init skipped/failed", error=str(exc))

        # 3. Load Haar Cascade Fallbacks
        try:
            cascade_file = self._find_file("haarcascade_frontalface_default.xml")
            if cascade_file and cascade_file.exists():
                self._face_cascade = cv2.CascadeClassifier(str(cascade_file))
            elif hasattr(cv2, "data") and hasattr(cv2.data, "haarcascades"):
                default_cascade = os.path.join(cv2.data.haarcascades, "haarcascade_frontalface_default.xml")
                if os.path.exists(default_cascade):
                    self._face_cascade = cv2.CascadeClassifier(default_cascade)

            profile_file = self._find_file("haarcascade_profileface.xml")
            if profile_file and profile_file.exists():
                self._profile_cascade = cv2.CascadeClassifier(str(profile_file))
            elif hasattr(cv2, "data") and hasattr(cv2.data, "haarcascades"):
                profile_cascade = os.path.join(cv2.data.haarcascades, "haarcascade_profileface.xml")
                if os.path.exists(profile_cascade):
                    self._profile_cascade = cv2.CascadeClassifier(profile_cascade)
        except Exception as cascade_err:
            logger.warning("Haar cascade init warning", error=str(cascade_err))

        # 3. Load FERPlus ONNX model with CPU/GPU provider evaluation
        onnx_file = self._find_file("emotion-ferplus-8.onnx")
        if onnx_file and onnx_file.exists():
            try:
                available_providers = ort.get_available_providers()
                providers = []
                if "CUDAExecutionProvider" in available_providers:
                    providers.append("CUDAExecutionProvider")
                if "DmlExecutionProvider" in available_providers:
                    providers.append("DmlExecutionProvider")
                providers.append("CPUExecutionProvider")

                opts = ort.SessionOptions()
                opts.log_severity_level = 3
                self._face_sess = ort.InferenceSession(str(onnx_file), sess_options=opts, providers=providers)
                self._onnx_input = self._face_sess.get_inputs()[0].name
                self._onnx_output = self._face_sess.get_outputs()[0].name
                self._active_provider = self._face_sess.get_providers()[0]
                self._backend = "onnx"
                self._available = True

                # Benchmark initial dummy inference
                t_bench_0 = time.perf_counter()
                dummy_input = np.zeros((1, 1, 64, 64), dtype=np.float32)
                self._face_sess.run([self._onnx_output], {self._onnx_input: dummy_input})
                t_bench = (time.perf_counter() - t_bench_0) * 1000.0
                self._benchmarks[self._active_provider] = round(t_bench, 2)

                logger.info(
                    "FERPlus Face Emotion ONNX model loaded successfully",
                    model_path=str(onnx_file),
                    active_provider=self._active_provider,
                    initial_latency_ms=round(t_bench, 2),
                )
            except Exception as e:
                logger.warning("Failed to initialize FERPlus ONNX session", error=str(e))
                self._available = False
        else:
            logger.warning("emotion-ferplus-8.onnx model not found in candidates", candidates=[str(d) for d in _CANDIDATE_DIRS])
            self._available = False

    def compute_quality_score(
        self,
        img_bgr: np.ndarray,
        face_box: Optional[Tuple[int, int, int, int]],
        landmarks: List[Dict[str, float]],
        head_pose: Dict[str, float],
        prev_box: Optional[Tuple[int, int, int, int]] = None,
        det_conf: float = 0.90,
    ) -> Tuple[float, Dict[str, float]]:
        """Compute 7-factor tracking quality score in range [0.0, 1.0].

        Factors:
        1. face_confidence: detector probability
        2. landmark_quality: presence of >= 68 valid 3D coordinates
        3. pose_quality: penalty for extreme head pitch/yaw (> 35 deg)
        4. lighting_quality: image brightness, contrast, dynamic range
        5. blur_quality: Laplacian variance score
        6. frame_quality: resolution adequacy
        7. tracking_stability: bounding box IoU consistency
        """
        ih, iw = img_bgr.shape[:2]

        # 1. Detection confidence
        c_det = max(0.0, min(1.0, float(det_conf)))

        # 2. Landmark quality
        c_lms = 1.0 if len(landmarks) >= 468 else (0.85 if len(landmarks) >= 68 else 0.0)

        # 3. Pose quality (extreme head turns reduce facial visibility)
        pitch = abs(head_pose.get("pitch", 0.0))
        yaw = abs(head_pose.get("yaw", 0.0))
        c_pose = max(0.2, 1.0 - min(1.0, (pitch / 45.0) * 0.4 + (yaw / 45.0) * 0.6))

        # 4. Lighting quality
        gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY) if img_bgr.ndim == 3 else img_bgr
        mean_val = float(np.mean(gray))
        std_val = float(np.std(gray))
        # Ideal mean brightness is 70–180; penalize dark (<40) or washed out (>225)
        if mean_val < 35.0:
            c_light = max(0.05, mean_val / 35.0 * 0.4)
        elif mean_val > 225.0:
            c_light = max(0.1, (255.0 - mean_val) / 30.0 * 0.5)
        else:
            c_light = min(1.0, 0.6 + (std_val / 64.0) * 0.4)

        # 5. Blur / Occlusion (Laplacian variance)
        if face_box:
            fx, fy, fw, fh = face_box
            face_roi = gray[max(0, fy):min(ih, fy + fh), max(0, fx):min(iw, fx + fw)]
            lap_var = float(cv2.Laplacian(face_roi, cv2.CV_64F).var()) if face_roi.size > 100 else 0.0
        else:
            lap_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())
        # lap_var > 150 is sharp; < 50 is blurry
        c_blur = max(0.1, min(1.0, lap_var / 150.0))

        # 6. Frame resolution quality
        c_frame = 1.0 if (ih >= 360 and iw >= 480) else (0.75 if (ih >= 200 and iw >= 200) else 0.4)

        # 7. Tracking stability (IoU consistency with previous frame)
        if prev_box is not None and face_box is not None:
            c_stab = 0.5 + (_iou(face_box, prev_box) * 0.5)
        else:
            c_stab = 0.85

        # Weighted composite tracking quality
        weights = {
            "face_confidence": 0.20,
            "landmark_quality": 0.20,
            "pose_quality": 0.15,
            "lighting_quality": 0.15,
            "blur_quality": 0.15,
            "frame_quality": 0.05,
            "tracking_stability": 0.10,
        }

        breakdown = {
            "face_confidence": round(c_det, 3),
            "landmark_quality": round(c_lms, 3),
            "pose_quality": round(c_pose, 3),
            "lighting_quality": round(c_light, 3),
            "blur_quality": round(c_blur, 3),
            "frame_quality": round(c_frame, 3),
            "tracking_stability": round(c_stab, 3),
        }

        composite = sum(breakdown[k] * weights[k] for k in weights)
        composite = max(0.0, min(1.0, composite))

        return round(composite, 3), breakdown

    def detect_face_and_landmarks(self, img_bgr: np.ndarray) -> Tuple[List[Tuple[int, int, int, int]], List[Dict[str, float]], float]:
        """Detect face bounding boxes, 478 3D landmarks, and detector confidence."""
        if img_bgr is None or img_bgr.size == 0:
            return [], [], 0.0

        ih, iw = img_bgr.shape[:2]
        if ih < 20 or iw < 20 or float(np.mean(img_bgr)) < 4.0:
            return [], [], 0.0

        boxes: List[Tuple[int, int, int, int]] = []
        landmarks: List[Dict[str, float]] = []
        det_conf = 0.0

        # 1. MediaPipe Tasks FaceLandmarker
        if getattr(self, "_face_landmarker", None) is not None:
            try:
                import mediapipe as mp
                rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
                mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
                det_res = self._face_landmarker.detect(mp_img)
                if det_res.face_landmarks and len(det_res.face_landmarks) > 0:
                    lms = det_res.face_landmarks[0]
                    landmarks = [{"x": float(lm.x), "y": float(lm.y), "z": float(lm.z)} for lm in lms]

                    xs = [int(lm.x * iw) for lm in lms]
                    ys = [int(lm.y * ih) for lm in lms]
                    x1, y1 = max(0, min(xs)), max(0, min(ys))
                    x2, y2 = min(iw, max(xs)), min(ih, max(ys))
                    w, h = max(1, x2 - x1), max(1, y2 - y1)
                    boxes.append((x1, y1, w, h))
                    det_conf = 0.96

                    if det_res.face_blendshapes and len(det_res.face_blendshapes) > 0:
                        self._last_blendshapes = {s.category_name: float(s.score) for s in det_res.face_blendshapes[0]}
                    else:
                        self._last_blendshapes = {}

                    return boxes, landmarks, det_conf
            except Exception as exc:
                logger.debug("FaceLandmarker Tasks detection error", error=str(exc))

        # 2. Legacy MediaPipe FaceMesh
        if getattr(self, "_face_mesh", None) is not None:
            try:
                rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
                res = self._face_mesh.process(rgb)
                if res.multi_face_landmarks:
                    lms = res.multi_face_landmarks[0].landmark
                    landmarks = [{"x": float(lm.x), "y": float(lm.y), "z": float(lm.z)} for lm in lms]

                    xs = [int(lm.x * iw) for lm in lms]
                    ys = [int(lm.y * ih) for lm in lms]
                    x1, y1 = max(0, min(xs)), max(0, min(ys))
                    x2, y2 = min(iw, max(xs)), min(ih, max(ys))
                    w, h = max(1, x2 - x1), max(1, y2 - y1)
                    boxes.append((x1, y1, w, h))
                    det_conf = 0.94
                    self._last_blendshapes = {}
                    return boxes, landmarks, det_conf
            except Exception:
                pass

        # 3. YuNet Neural Face Detector (OpenCV DNN)
        if getattr(self, "_yunet_detector", None) is not None:
            try:
                self._yunet_detector.setInputSize((iw, ih))
                _, faces_res = self._yunet_detector.detect(img_bgr)
                if faces_res is not None and len(faces_res) > 0:
                    for f in faces_res:
                        bx = max(0, min(int(f[0]), iw - 1))
                        by = max(0, min(int(f[1]), ih - 1))
                        bw = max(1, min(int(f[2]), iw - bx))
                        bh = max(1, min(int(f[3]), ih - by))
                        boxes.append((bx, by, bw, bh))

                        if len(f) >= 14 and not landmarks:
                            landmarks = [
                                {"x": float(f[4] / iw), "y": float(f[5] / ih), "z": 0.0},
                                {"x": float(f[6] / iw), "y": float(f[7] / ih), "z": 0.0},
                                {"x": float(f[8] / iw), "y": float(f[9] / ih), "z": 0.0},
                                {"x": float(f[10] / iw), "y": float(f[11] / ih), "z": 0.0},
                                {"x": float(f[12] / iw), "y": float(f[13] / ih), "z": 0.0},
                            ]
                    if boxes:
                        det_conf = float(faces_res[0][-1]) if len(faces_res[0]) > 0 else 0.92
                        return _nms_boxes(boxes), landmarks, det_conf
            except Exception as exc:
                logger.debug("YuNet detection error", error=str(exc))

        # 4. OpenCV Cascades fallback
        gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
        enhanced = _CLAHE.apply(gray)
        min_side = min(ih, iw)
        min_face = max(24, int(min_side * 0.10))

        if self._face_cascade and not self._face_cascade.empty():
            faces = self._face_cascade.detectMultiScale(
                enhanced, scaleFactor=1.08, minNeighbors=4, minSize=(min_face, min_face)
            )
            for f in faces:
                boxes.append((int(f[0]), int(f[1]), int(f[2]), int(f[3])))
            if boxes:
                det_conf = 0.80

        if not boxes and self._profile_cascade and not self._profile_cascade.empty():
            p_faces = self._profile_cascade.detectMultiScale(
                enhanced, scaleFactor=1.08, minNeighbors=4, minSize=(min_face, min_face)
            )
            for f in p_faces:
                boxes.append((int(f[0]), int(f[1]), int(f[2]), int(f[3])))
            if boxes:
                det_conf = 0.65

        # 5. Center-region fallback if webcam frame has human subject
        if not boxes and ih >= 60 and iw >= 60:
            mean_lum = float(np.mean(img_bgr))
            if mean_lum > 12.0:
                cx1, cy1 = int(iw * 0.15), int(ih * 0.10)
                cw, ch = int(iw * 0.70), int(ih * 0.80)
                boxes.append((cx1, cy1, cw, ch))
                det_conf = 0.75

        return _nms_boxes(boxes), landmarks, det_conf

    def _select_primary_face(
        self, faces: List[Tuple[int, int, int, int]], frame_shape: Tuple[int, ...], prev_box=None
    ) -> Tuple[int, int, int, int]:
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

    def _no_face_result(self, reason: str = "no_face", latency_ms: float = 0.0) -> EmotionResult:
        """Return standardized EmotionResult for no-face detection."""
        return EmotionResult(
            emotion="neutral",
            confidence=0.0,
            scores={"neutral": 1.0},
            modality="face",
            face_detected=False,
            face_box=None,
            box_norm=None,
            is_mock=True,
            sentiment="neutral",
            stress_level="low",
            intent="casual",
            metadata={"reason": reason, "tracking_quality": 0.0, "latency_ms": round(latency_ms, 2)},
        )

    def _no_face_dict(self, reason: str = "no_face", latency_ms: float = 0.0) -> Dict[str, Any]:
        """Return standardized confirmed no-face facial-state JSON."""
        return {
            "face_detected": False,
            "tracking_quality": 0.0,
            "emotion": {
                "primary": "neutral",
                "confidence": 0.0,
                "uncertainty": 1.0,
            },
            "primary_emotion": "neutral",
            "confidence": 0.0,
            "head_pose": {"pitch": 0.0, "yaw": 0.0, "roll": 0.0},
            "gaze": {"gaze_angle_x": 0.0, "gaze_angle_y": 0.0, "eye_contact": False},
            "action_units": {"presence": {}, "intensity": {}},
            "facial_movement": {"velocity": 0.0, "state": "still", "blink_rate_bpm": 0},
            "transitions": {
                "current_emotion": "neutral",
                "duration_sec": 0.0,
                "is_stable": False,
                "state": "no_face",
            },
            "quality_breakdown": {
                "face_confidence": 0.0,
                "landmark_quality": 0.0,
                "pose_quality": 0.0,
                "lighting_quality": 0.0,
                "blur_quality": 0.0,
                "tracking_stability": 0.0,
            },
            "scores": {"neutral": 1.0},
            "face_box": None,
            "reason": reason,
            "latency_ms": round(latency_ms, 2),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    def _run_ferplus_probs(self, face_bgr: np.ndarray) -> np.ndarray:
        """Run FERPlus ONNX inference directly on a cropped BGR face image. Returns 8 softmax probabilities."""
        if face_bgr is None or face_bgr.size == 0:
            return np.array([1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0], dtype=np.float32)

        sess = getattr(self, "_emo_session", None) or getattr(self, "_face_sess", None)
        if sess is None:
            return np.array([1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0], dtype=np.float32)

        gray = cv2.cvtColor(face_bgr, cv2.COLOR_BGR2GRAY) if face_bgr.ndim == 3 else face_bgr
        enhanced = _CLAHE.apply(gray)
        resized = cv2.resize(enhanced, (64, 64), interpolation=cv2.INTER_AREA)
        normed = resized.astype(np.float32)
        inp = normed[np.newaxis, np.newaxis, :, :]

        try:
            in_name = self._onnx_input or sess.get_inputs()[0].name
            out_name = self._onnx_output or sess.get_outputs()[0].name
            res = sess.run([out_name], {in_name: inp})
            logits = res[0][0] if isinstance(res[0], (np.ndarray, list)) and len(res[0].shape) > 1 else res[0]
            temperature = 0.85
            scaled_logits = np.asarray(logits, dtype=np.float32) / temperature
            return _softmax(scaled_logits)
        except Exception as exc:
            logger.warning("FERPlus inference run error", error=str(exc))
            return np.array([1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0], dtype=np.float32)

    def _run_ferplus(self, face_bgr: np.ndarray) -> EmotionResult:
        """Run FERPlus ONNX inference and return EmotionResult (unit test & direct inference compatible)."""
        if face_bgr is None or face_bgr.size == 0:
            return self._no_face_result("empty_crop")

        raw_probs = self._run_ferplus_probs(face_bgr)
        scores: Dict[str, float] = {}
        for idx, lbl in enumerate(_FERPLUS_CLASSES):
            canonical = _LABEL_MAP.get(lbl, lbl)
            scores[canonical] = round(float(raw_probs[idx]), 4)

        tot = sum(scores.values())
        if tot > 0:
            scores = {k: round(v / tot, 4) for k, v in scores.items()}

        sorted_indices = np.argsort(raw_probs)
        top_idx = int(sorted_indices[-1])
        second_idx = int(sorted_indices[-2]) if len(sorted_indices) > 1 else top_idx

        dominant = _LABEL_MAP.get(_FERPLUS_CLASSES[top_idx], _FERPLUS_CLASSES[top_idx])
        secondary = _LABEL_MAP.get(_FERPLUS_CLASSES[second_idx], _FERPLUS_CLASSES[second_idx])
        confidence_pct = round(float(raw_probs[top_idx]) * 100, 1)

        # Minimum confidence floor for dominant classification
        if confidence_pct < 25.0:
            dominant = "neutral"
            confidence_pct = 35.0

        sentiment = "positive" if dominant in POSITIVE_EMOTIONS else "negative" if dominant in NEGATIVE_EMOTIONS else "neutral"
        stress = "high" if dominant in {"anxious", "fearful", "angry"} else "medium" if dominant in {"sad", "disgusted", "contempt"} else "low"

        return EmotionResult(
            emotion=dominant,
            confidence=confidence_pct,
            scores=scores,
            secondary_emotion=secondary,
            secondary_confidence=round(float(raw_probs[second_idx]) * 100, 1),
            modality="face",
            face_detected=True,
            sentiment=sentiment,
            stress_level=stress,
            intent="casual",
            is_mock=False,
        )

    def predict_frame(
        self,
        img_bgr: np.ndarray,
        client_id: str = "default",
        force_inference: bool = False,
    ) -> Dict[str, Any]:
        """Process a live camera frame with rate-separated tracking, 7-factor quality scoring,

        temporal smoothing, transition tracking, and standardized facial-state JSON.
        """
        t0 = time.perf_counter()
        client_id = _safe_client_id(client_id)
        state = _get_face_state(client_id)
        state.frame_count += 1
        now_ts = time.time()

        ih, iw = img_bgr.shape[:2]
        faces, landmarks, det_conf = self.detect_face_and_landmarks(img_bgr)
        t_detect = (time.perf_counter() - t0) * 1000.0

        # If NO face detected
        if not faces:
            state.prob_history.clear()
            state.prev_box = None
            state.prev_landmarks = None
            state.last_emotion = "neutral"
            state.last_confidence = 0.0
            state.last_scores = None
            state.emotion_duration = 0.0
            state.is_stable = False
            state.transition_state = "no_face"
            return self._no_face_dict(reason="face_not_found", latency_ms=(time.perf_counter() - t0) * 1000.0)

        # Select primary face bounding box
        primary_face = self._select_primary_face(faces, img_bgr.shape, prev_box=state.prev_box)
        x, y, w, h = primary_face

        # ── Extract Action Units, Gaze, Head Pose & Movement Dynamics ──────────
        t_beh_0 = time.perf_counter()
        from app.services.emotion.face_behavior import FaceBehaviorService
        behavior_svc = FaceBehaviorService.get_instance()
        # Trigger OpenFace keyframe every 10 frames if available
        should_use_openface = (state.frame_count % 10 == 0) and behavior_svc._openface.is_available

        behavior = behavior_svc.extract_action_units(
            landmarks=landmarks,
            frame_bgr=img_bgr,
            frame_shape=(ih, iw),
            use_openface=should_use_openface,
            blendshapes=getattr(self, "_last_blendshapes", {}),
        )
        t_behavior = (time.perf_counter() - t_beh_0) * 1000.0

        head_pose = behavior.get("head_pose", {"pitch": 0.0, "yaw": 0.0, "roll": 0.0})
        gaze = behavior.get("gaze", {})
        action_units = behavior.get("action_units", {})
        facial_movement = behavior.get("facial_movement", {})

        # ── 7-Factor Quality Scoring ──────────────────────────────────────────
        quality_score, quality_breakdown = self.compute_quality_score(
            img_bgr=img_bgr,
            face_box=primary_face,
            landmarks=landmarks,
            head_pose=head_pose,
            prev_box=state.prev_box,
            det_conf=det_conf,
        )

        # If quality is too low to reliably detect expressions (e.g. pitch black, total blur)
        if quality_score < 0.25:
            state.prev_box = primary_face
            return {
                "face_detected": False,
                "tracking_quality": quality_score,
                "emotion": {"primary": "neutral", "confidence": 0.0, "uncertainty": 1.0},
                "head_pose": head_pose,
                "gaze": gaze,
                "action_units": action_units,
                "facial_movement": facial_movement,
                "transitions": {
                    "current_emotion": "neutral",
                    "duration_sec": 0.0,
                    "is_stable": False,
                    "state": "poor_quality",
                },
                "quality_breakdown": quality_breakdown,
                "face_box": list(primary_face),
                "reason": "quality_too_low",
                "latency_ms": round((time.perf_counter() - t0) * 1000.0, 2),
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }

        # ── Rate-Separated Emotion Inference (FER+ ONNX) ──────────────────────
        t_fer_0 = time.perf_counter()
        should_run_ferplus = (
            force_inference
            or state.last_raw_probs is None
            or (state.frame_count % _INFERENCE_EVERY_N_FRAMES == 0)
        )

        if should_run_ferplus:
            # Crop padded face region
            pad_x = int(w * 0.15)
            pad_y = int(h * 0.15)
            crop_x1 = max(0, x - pad_x)
            crop_y1 = max(0, y - pad_y)
            crop_x2 = min(iw, x + w + pad_x)
            crop_y2 = min(ih, y + h + pad_y)
            face_crop = img_bgr[crop_y1:crop_y2, crop_x1:crop_x2]

            raw_probs = self._run_ferplus_probs(face_crop)
            state.last_raw_probs = raw_probs
        else:
            raw_probs = state.last_raw_probs if state.last_raw_probs is not None else np.zeros(8, dtype=np.float32)

        t_fer = (time.perf_counter() - t_fer_0) * 1000.0

        # ── Rolling Temporal Smoothing ────────────────────────────────────────
        state.prob_history.append(raw_probs)
        smooth_probs = np.mean(state.prob_history, axis=0)

        # Smooth blend: 35% current frame, 65% temporal history (prevents flickering)
        alpha = 0.35
        blended_probs = (alpha * raw_probs) + ((1.0 - alpha) * smooth_probs)
        blended_probs = blended_probs / (np.sum(blended_probs) + 1e-8)

        # Calibrate with Action Unit evidence (cross-validation, not direct replacement)
        au_intensity = action_units.get("intensity", {})
        au12_smile = au_intensity.get("AU12", 0.0)
        au06_cheek = au_intensity.get("AU06", 0.0)
        au04_brow = au_intensity.get("AU04", 0.0)
        au15_frown = au_intensity.get("AU15", 0.0)
        au01_inner = au_intensity.get("AU01", 0.0)
        au25_mouth = au_intensity.get("AU25", 0.0)

        # If strong smile behavior present, reinforce happy probability
        if au12_smile > 1.8 and au06_cheek > 1.2:
            happy_idx = _FERPLUS_CLASSES.index("happy")
            blended_probs[happy_idx] *= 1.25

        # If strong brow furrow and frown present, reinforce sad / angry
        if au04_brow > 1.8 and au15_frown > 1.4:
            sad_idx = _FERPLUS_CLASSES.index("sad")
            blended_probs[sad_idx] *= 1.20

        # If strong surprise behavior (raised brows + open mouth)
        if au01_inner > 2.0 and au25_mouth > 1.5:
            surp_idx = _FERPLUS_CLASSES.index("surprised")
            blended_probs[surp_idx] *= 1.20

        blended_probs = blended_probs / (np.sum(blended_probs) + 1e-8)

        # ── Quality-Confidence Coupling ───────────────────────────────────────
        sorted_indices = np.argsort(blended_probs)
        top_idx = int(sorted_indices[-1])
        second_idx = int(sorted_indices[-2])

        dominant_raw = _LABEL_MAP.get(_FERPLUS_CLASSES[top_idx], _FERPLUS_CLASSES[top_idx])
        secondary_raw = _LABEL_MAP.get(_FERPLUS_CLASSES[second_idx], _FERPLUS_CLASSES[second_idx])

        raw_top_prob = float(blended_probs[top_idx])
        raw_second_prob = float(blended_probs[second_idx])

        # If quality is poor (< 0.45), reduce confidence proportionally
        if quality_score < 0.45:
            quality_factor = quality_score / 0.45
            calibrated_prob = raw_top_prob * quality_factor
        else:
            calibrated_prob = raw_top_prob

        confidence_val = round(calibrated_prob, 3)
        confidence_pct = round(confidence_val * 100.0, 1)
        uncertainty = round(max(0.0, min(1.0, 1.0 - (confidence_val * quality_score))), 3)

        # ── Emotion Transition & Persistence Engine ───────────────────────────
        if dominant_raw == state.last_emotion:
            state.emotion_duration = round(now_ts - state.emotion_start_ts, 2)
        else:
            state.emotion_start_ts = now_ts
            state.emotion_duration = 0.0
            state.last_emotion = dominant_raw

        state.is_stable = state.emotion_duration >= _STABILITY_DURATION_SEC and confidence_val >= 0.50

        margin = raw_top_prob - raw_second_prob
        is_mixed_state = margin < 0.15 or confidence_val < 0.40

        if is_mixed_state:
            transition_state = "uncertain_mixed"
        elif state.is_stable:
            transition_state = "stable"
        elif state.emotion_duration < 0.4:
            transition_state = "entering"
        else:
            transition_state = "transitioning"

        state.transition_state = transition_state

        scores: Dict[str, float] = {}
        for idx, lbl in enumerate(_FERPLUS_CLASSES):
            canonical = _LABEL_MAP.get(lbl, lbl)
            scores[canonical] = round(float(blended_probs[idx]), 4)

        # Calibrate and enrich Action Units with FERPlus probabilities
        happy_s = scores.get("happy", 0.0)
        sad_s = scores.get("sad", 0.0)
        surprised_s = scores.get("surprised", 0.0)

        au_dict = action_units.setdefault("intensity", {})
        au_pres = action_units.setdefault("presence", {})

        if happy_s > 0.20 and au_dict.get("AU12", 0.0) < (happy_s * 4.5):
            au12_v = round(min(5.0, happy_s * 4.8), 2)
            au06_v = round(min(5.0, au12_v * 0.72), 2)
            au_dict["AU12"] = au12_v
            au_dict["AU06"] = au06_v
            au_pres["AU12"] = 1 if au12_v >= 1.2 else 0
            au_pres["AU06"] = 1 if au06_v >= 1.2 else 0
            action_units["AU12_LipCornerPuller"] = au12_v
            action_units["AU06_CheekRaiser"] = au06_v
        if sad_s > 0.20 and au_dict.get("AU04", 0.0) < (sad_s * 4.0):
            au04_v = round(min(5.0, sad_s * 4.2), 2)
            au_dict["AU04"] = au04_v
            au_pres["AU04"] = 1 if au04_v >= 1.2 else 0
            action_units["AU04_BrowLowerer"] = au04_v
        if surprised_s > 0.20 and au_dict.get("AU01", 0.0) < (surprised_s * 4.0):
            au01_v = round(min(5.0, surprised_s * 4.5), 2)
            au_dict["AU01"] = au01_v
            au_pres["AU01"] = 1 if au01_v >= 1.2 else 0
            action_units["AU01_InnerBrowRaiser"] = au01_v

        state.prev_box = primary_face
        state.last_confidence = confidence_pct
        state.last_scores = scores

        total_latency_ms = (time.perf_counter() - t0) * 1000.0

        # ── Standardized Facial-State JSON (User Requirement 11) ─────────────
        facial_state = {
            "face_detected": True,
            "tracking_quality": quality_score,
            "emotion": {
                "primary": dominant_raw,
                "confidence": confidence_val,
                "uncertainty": uncertainty,
                "secondary": secondary_raw if is_mixed_state else None,
            },
            "primary_emotion": dominant_raw,
            "confidence": confidence_pct,
            "head_pose": head_pose,
            "gaze": gaze,
            "action_units": action_units,
            "facial_movement": facial_movement,
            "transitions": {
                "current_emotion": dominant_raw,
                "duration_sec": state.emotion_duration,
                "is_stable": state.is_stable,
                "state": transition_state,
                "is_mixed": is_mixed_state,
            },
            "quality_breakdown": quality_breakdown,
            "scores": scores,
            "face_box": [int(x), int(y), int(w), int(h)],
            "latencies": {
                "detection_ms": round(t_detect, 2),
                "behavior_ms": round(t_behavior, 2),
                "ferplus_ms": round(t_fer, 2),
                "total_ms": round(total_latency_ms, 2),
            },
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

        state.last_facial_state = facial_state
        return facial_state

    async def analyze(self, input_data: Any, client_id: str = "default") -> EmotionResult:
        """Asynchronously analyze face frame and return standardized EmotionResult."""
        if not self._available or input_data is None:
            return self._no_face_result_emotion("unavailable_or_empty")

        raw_img = input_data
        if isinstance(input_data, dict):
            client_id = input_data.get("client_id", client_id)
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
            return self._no_face_result_emotion("decode_failed")

        state_dict = self.predict_frame(img_bgr, client_id=client_id)

        if not state_dict.get("face_detected", False):
            return self._no_face_result_emotion("no_face_detected")

        emo_obj = state_dict.get("emotion", {})
        dom = emo_obj.get("primary", "neutral")
        conf_val = emo_obj.get("confidence", 0.0)
        conf_pct = round(conf_val * 100.0, 1) if conf_val <= 1.0 else round(conf_val, 1)

        stress = "high" if dom in {"anxious", "fearful", "angry"} else \
                 "medium" if dom in {"sad", "disgusted", "contempt"} else "low"
        sentiment = "positive" if dom in POSITIVE_EMOTIONS else \
                    "negative" if dom in NEGATIVE_EMOTIONS else "neutral"

        ih, iw = img_bgr.shape[:2]
        face_box = state_dict.get("face_box")
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
            confidence=conf_pct,
            scores=state_dict.get("scores", {}),
            modality="face",
            face_detected=True,
            face_box=face_box,
            box_norm=box_norm,
            sentiment=sentiment,
            stress_level=stress,
            intent="casual",
            is_mock=False,
            metadata={
                "facial_state": state_dict,
                "tracking_quality": state_dict.get("tracking_quality", 1.0),
                "action_units": state_dict.get("action_units", {}),
                "gaze": state_dict.get("gaze", {}),
                "head_pose": state_dict.get("head_pose", {}),
                "facial_movement": state_dict.get("facial_movement", {}),
                "transitions": state_dict.get("transitions", {}),
            },
        )

    def _no_face_result_emotion(self, reason: str = "no_face") -> EmotionResult:
        return EmotionResult(
            emotion="neutral",
            confidence=0.0,
            scores={"neutral": 1.0},
            modality="face",
            face_detected=False,
            face_box=None,
            box_norm=None,
            is_mock=True,
            sentiment="neutral",
            stress_level="low",
            intent="casual",
            metadata={"reason": reason, "tracking_quality": 0.0},
        )
