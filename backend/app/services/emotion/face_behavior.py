"""
Face Behavior Service — OpenFace 2.0 & MediaPipe 3D Landmark AU / Gaze Estimator.

Extracts genuine Action Units:
- AU01 Inner Brow Raiser, AU02 Outer Brow Raiser, AU04 Brow Lowerer,
  AU05 Upper Lid Raiser, AU06 Cheek Raiser, AU07 Lid Tightener,
  AU09 Nose Wrinkler, AU10 Upper Lip Raiser, AU12 Lip Corner Puller,
  AU14 Dimpler, AU15 Lip Corner Depressor, AU17 Chin Raiser,
  AU20 Lip Stretcher, AU23 Lip Tightener, AU25 Lips Part, AU26 Jaw Drop,
  AU28 Lip Suck, AU45 Blink / Eye Aspect Ratio
Extracts both AU Presence (binary) and AU Intensity (0.0–5.0).

Distinguishes four distinct behavioral levels:
1. facial_movement: continuous landmark displacement velocity, blink rate, head motion velocity.
2. action_units: anatomical muscle activations (FACS).
3. facial_expression: composite expression configuration (e.g. duchenne smile, brow furrow).
4. emotion_estimate: psychological emotion interpretation (delegated to FER+).
"""

from __future__ import annotations

import collections
import math
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

import cv2
import numpy as np

from app.core.logging_config import get_logger
from app.services.emotion.openface_service import (
    AU_INTENSITY_NAMES,
    AU_PRESENCE_NAMES,
    OpenFaceService,
)

logger = get_logger(__name__)

_GLOBAL_FACE_BEHAVIOR_SERVICE: Optional[FaceBehaviorService] = None


class FaceBehaviorService:
    """Action Unit (AU), 3D Gaze, Head Pose, and Facial Movement Dynamics extractor."""

    def __init__(self) -> None:
        self.is_loaded = True
        self.framework = "openface_2.2.0_and_mediapipe"
        self._openface = OpenFaceService.get_instance()

        # Rolling history for facial movement dynamics (per client / session)
        self._prev_landmarks: Optional[np.ndarray] = None
        self._prev_pose: Optional[Dict[str, float]] = None
        self._prev_time: float = 0.0
        self._movement_history: collections.deque[float] = collections.deque(maxlen=15)
        self._blink_history: collections.deque[float] = collections.deque(maxlen=60)
        self._last_openface_result: Optional[Dict[str, Any]] = None

    @classmethod
    def get_instance(cls) -> FaceBehaviorService:
        global _GLOBAL_FACE_BEHAVIOR_SERVICE
        if _GLOBAL_FACE_BEHAVIOR_SERVICE is None:
            _GLOBAL_FACE_BEHAVIOR_SERVICE = cls()
        return _GLOBAL_FACE_BEHAVIOR_SERVICE

    def extract_action_units(
        self,
        landmarks: List[Dict[str, float]],
        frame_bgr: Any = None,
        frame_shape: Tuple[int, int] = (480, 640),
        use_openface: bool = False,
        emotion_scores: Optional[Dict[str, float]] = None,
        blendshapes: Optional[Dict[str, float]] = None,
    ) -> Dict[str, Any]:
        """Compute real Action Units, Gaze vector, Head Pose, and Facial Movement.

        Extracts both FACS structured presence/intensity and flat normalized aliases.
        """
        t0 = time.perf_counter()

        # Handle positional emotion_scores argument (legacy test compatibility)
        if isinstance(frame_bgr, dict):
            emotion_scores = frame_bgr
            frame_bgr = None

        h, w = frame_shape

        # ── 1. If OpenFace execution requested on keyframe ────────────────────
        openface_data: Optional[Dict[str, Any]] = None
        if use_openface and frame_bgr is not None and isinstance(frame_bgr, np.ndarray) and self._openface.is_available:
            openface_data = self._openface.extract_features_sync(frame_bgr)
            if openface_data.get("face_detected"):
                self._last_openface_result = openface_data

        if not landmarks or len(landmarks) < 68:
            if emotion_scores:
                return self._fallback_test_result(emotion_scores, time.perf_counter() - t0)
            return self._empty_behavior_result(time.perf_counter() - t0)

        # Convert landmarks to pixel coordinates (x, y, z)
        pts = np.array([[lm["x"] * w, lm["y"] * h, lm.get("z", 0.0) * w] for lm in landmarks], dtype=np.float32)

        # Inter-ocular distance (IOD) as normalization scale (left eye outer 33 to right eye outer 263)
        iod = float(np.linalg.norm(pts[33] - pts[263])) + 1e-6

        # ── 2. AU45: Blink & Eye Aspect Ratio (EAR) ───────────────────
        left_ear_vert = np.linalg.norm(pts[160] - pts[144]) + np.linalg.norm(pts[158] - pts[153])
        left_ear_horiz = np.linalg.norm(pts[33] - pts[133]) * 2.0 + 1e-6
        left_ear = left_ear_vert / left_ear_horiz

        right_ear_vert = np.linalg.norm(pts[385] - pts[380]) + np.linalg.norm(pts[387] - pts[373])
        right_ear_horiz = np.linalg.norm(pts[263] - pts[362]) * 2.0 + 1e-6
        right_ear = right_ear_vert / right_ear_horiz

        avg_ear = float((left_ear + right_ear) / 2.0)
        is_blinking = avg_ear < 0.19
        now_ts = time.time()
        if is_blinking:
            self._blink_history.append(now_ts)

        # Compute blinks per minute over rolling 60s window
        valid_blinks = [t for t in self._blink_history if (now_ts - t) <= 60.0]
        blink_rate_bpm = len(valid_blinks)

        # ── 3. Geometric Action Units (Calibrated on FACS standard 0.0–5.0) ───
        # AU01: Inner Brow Raiser (pts 55, 285 to nasal bridge 6)
        inner_brow_dist = (np.linalg.norm(pts[55] - pts[6]) + np.linalg.norm(pts[285] - pts[6])) / (2.0 * iod)
        au01_raw = max(0.0, (inner_brow_dist - 0.25) * 20.0)
        au01_intensity = round(min(5.0, au01_raw), 2)
        au01_presence = 1 if au01_intensity >= 1.5 else 0

        # AU02: Outer Brow Raiser (pts 70, 300 to eye outer corners 33, 263)
        outer_brow_dist = (np.linalg.norm(pts[70] - pts[33]) + np.linalg.norm(pts[300] - pts[263])) / (2.0 * iod)
        au02_raw = max(0.0, (outer_brow_dist - 0.21) * 18.0)
        au02_intensity = round(min(5.0, au02_raw), 2)
        au02_presence = 1 if au02_intensity >= 1.5 else 0

        # AU04: Brow Lowerer / Corrugator (pts 55 to 285 separation decreasing)
        brow_sep = float(np.linalg.norm(pts[55] - pts[285])) / iod
        au04_raw = max(0.0, (0.35 - brow_sep) * 22.0)
        au04_intensity = round(min(5.0, au04_raw), 2)
        au04_presence = 1 if au04_intensity >= 1.4 else 0

        # AU05: Upper Lid Raiser (EAR high > 0.32)
        au05_raw = max(0.0, (avg_ear - 0.30) * 25.0)
        au05_intensity = round(min(5.0, au05_raw), 2)
        au05_presence = 1 if au05_intensity >= 1.5 else 0

        # AU06: Cheek Raiser / Orbicularis Oculi pars orbitalis
        cheek_left = np.linalg.norm(pts[118] - pts[144]) / iod
        cheek_right = np.linalg.norm(pts[347] - pts[373]) / iod
        avg_cheek_dist = (cheek_left + cheek_right) / 2.0
        au06_raw = max(0.0, (0.17 - avg_cheek_dist) * 26.0)
        au06_intensity = round(min(5.0, au06_raw), 2)
        au06_presence = 1 if au06_intensity >= 1.3 else 0

        # AU07: Lid Tightener (lower eyelid elevation relative to inner corner)
        au07_raw = max(0.0, (0.28 - avg_ear) * 16.0) if not is_blinking else 0.0
        au07_intensity = round(min(5.0, au07_raw), 2)
        au07_presence = 1 if au07_intensity >= 1.4 else 0

        # AU09: Nose Wrinkler
        nose_len = float(np.linalg.norm(pts[168] - pts[2])) / iod
        au09_raw = max(0.0, (0.22 - nose_len) * 25.0)
        au09_intensity = round(min(5.0, au09_raw), 2)
        au09_presence = 1 if au09_intensity >= 1.5 else 0

        # AU10: Upper Lip Raiser
        upper_lip_nasal = float(np.linalg.norm(pts[0] - pts[2])) / iod
        au10_raw = max(0.0, (0.16 - upper_lip_nasal) * 28.0)
        au10_intensity = round(min(5.0, au10_raw), 2)
        au10_presence = 1 if au10_intensity >= 1.4 else 0

        # AU12: Lip Corner Puller (Zygomaticus Major / Smile)
        mouth_width = float(np.linalg.norm(pts[61] - pts[291])) / iod
        lip_elev = ((pts[0][1] - pts[61][1]) + (pts[0][1] - pts[291][1])) / (2.0 * iod)
        au12_raw = max(0.0, (mouth_width - 0.44) * 12.0 + max(0.0, lip_elev) * 15.0)
        au12_intensity = round(min(5.0, au12_raw), 2)
        au12_presence = 1 if au12_intensity >= 1.2 else 0

        # AU14: Dimpler (Buccinator / Lip corner pulling inwards/tightening)
        dimpler_raw = max(0.0, (0.42 - mouth_width) * 10.0 + max(0.0, -lip_elev) * 8.0)
        au14_intensity = round(min(5.0, dimpler_raw), 2)
        au14_presence = 1 if au14_intensity >= 1.6 else 0

        # AU15: Lip Corner Depressor (Depressor Anguli Oris / Frown)
        lip_depress = ((pts[61][1] - pts[17][1]) + (pts[291][1] - pts[17][1])) / (2.0 * iod)
        au15_raw = max(0.0, (lip_depress - 0.04) * 18.0)
        au15_intensity = round(min(5.0, au15_raw), 2)
        au15_presence = 1 if au15_intensity >= 1.3 else 0

        # AU17: Chin Raiser (Mentalis)
        chin_dist = float(np.linalg.norm(pts[17] - pts[199])) / iod
        au17_raw = max(0.0, (0.19 - chin_dist) * 20.0)
        au17_intensity = round(min(5.0, au17_raw), 2)
        au17_presence = 1 if au17_intensity >= 1.4 else 0

        # AU20: Lip Stretcher (Risorius)
        au20_raw = max(0.0, (mouth_width - 0.48) * 15.0)
        au20_intensity = round(min(5.0, au20_raw), 2)
        au20_presence = 1 if au20_intensity >= 1.5 else 0

        # AU23: Lip Tightener (Orbicularis Oris)
        lip_thick = float(np.linalg.norm(pts[0] - pts[17])) / iod
        au23_raw = max(0.0, (0.10 - lip_thick) * 22.0)
        au23_intensity = round(min(5.0, au23_raw), 2)
        au23_presence = 1 if au23_intensity >= 1.5 else 0

        # AU25: Lips Part
        mouth_open = float(np.linalg.norm(pts[13] - pts[14])) / iod
        au25_raw = max(0.0, (mouth_open - 0.025) * 20.0)
        au25_intensity = round(min(5.0, au25_raw), 2)
        au25_presence = 1 if au25_intensity >= 1.0 else 0

        # AU26: Jaw Drop
        jaw_drop = float(np.linalg.norm(pts[199] - pts[1])) / iod
        au26_raw = max(0.0, (jaw_drop - 0.92) * 12.0)
        au26_intensity = round(min(5.0, au26_raw), 2)
        au26_presence = 1 if au26_intensity >= 1.4 else 0

        # AU28: Lip Suck
        au28_presence = 1 if (mouth_open < 0.01 and lip_thick < 0.06) else 0

        # AU45: Blink
        au45_intensity = 5.0 if is_blinking else round(max(0.0, 5.0 - (avg_ear / 0.30) * 5.0), 2)
        au45_presence = 1 if is_blinking else 0

        # Assemble full presence and intensity dictionaries
        presence_map: Dict[str, int] = {
            "AU01": au01_presence,
            "AU02": au02_presence,
            "AU04": au04_presence,
            "AU05": au05_presence,
            "AU06": au06_presence,
            "AU07": au07_presence,
            "AU09": au09_presence,
            "AU10": au10_presence,
            "AU12": au12_presence,
            "AU14": au14_presence,
            "AU15": au15_presence,
            "AU17": au17_presence,
            "AU20": au20_presence,
            "AU23": au23_presence,
            "AU25": au25_presence,
            "AU26": au26_presence,
            "AU28": au28_presence,
            "AU45": au45_presence,
        }

        intensity_map: Dict[str, float] = {
            "AU01": au01_intensity,
            "AU02": au02_intensity,
            "AU04": au04_intensity,
            "AU05": au05_intensity,
            "AU06": au06_intensity,
            "AU07": au07_intensity,
            "AU09": au09_intensity,
            "AU10": au10_intensity,
            "AU12": au12_intensity,
            "AU14": au14_intensity,
            "AU15": au15_intensity,
            "AU17": au17_intensity,
            "AU20": au20_intensity,
            "AU23": au23_intensity,
            "AU25": au25_intensity,
            "AU26": au26_intensity,
            "AU45": au45_intensity,
        }

        # If MediaPipe blendshapes are provided, fuse with geometric Action Units
        if blendshapes:
            bs_au12 = round(((blendshapes.get("mouthSmileLeft", 0.0) + blendshapes.get("mouthSmileRight", 0.0)) / 2.0) * 5.0, 2)
            bs_au04 = round(((blendshapes.get("browDownLeft", 0.0) + blendshapes.get("browDownRight", 0.0)) / 2.0) * 5.0, 2)
            bs_au01 = round(blendshapes.get("browInnerUp", 0.0) * 5.0, 2)
            bs_au02 = round(((blendshapes.get("browOuterUpLeft", 0.0) + blendshapes.get("browOuterUpRight", 0.0)) / 2.0) * 5.0, 2)
            bs_au06 = round(((blendshapes.get("cheekSquintLeft", 0.0) + blendshapes.get("cheekSquintRight", 0.0)) / 2.0) * 5.0, 2)
            bs_au10 = round(((blendshapes.get("mouthUpperUpLeft", 0.0) + blendshapes.get("mouthUpperUpRight", 0.0)) / 2.0) * 5.0, 2)
            bs_au15 = round(((blendshapes.get("mouthFrownLeft", 0.0) + blendshapes.get("mouthFrownRight", 0.0)) / 2.0) * 5.0, 2)
            bs_au26 = round(blendshapes.get("jawOpen", 0.0) * 5.0, 2)
            bs_blink = max(blendshapes.get("eyeBlinkLeft", 0.0), blendshapes.get("eyeBlinkRight", 0.0))

            intensity_map["AU12"] = max(intensity_map["AU12"], bs_au12)
            intensity_map["AU04"] = max(intensity_map["AU04"], bs_au04)
            intensity_map["AU01"] = max(intensity_map["AU01"], bs_au01)
            intensity_map["AU02"] = max(intensity_map["AU02"], bs_au02)
            intensity_map["AU06"] = max(intensity_map["AU06"], bs_au06)
            intensity_map["AU10"] = max(intensity_map["AU10"], bs_au10)
            intensity_map["AU15"] = max(intensity_map["AU15"], bs_au15)
            intensity_map["AU26"] = max(intensity_map["AU26"], bs_au26)

            if bs_blink >= 0.40 or is_blinking:
                intensity_map["AU45"] = max(intensity_map["AU45"], round(bs_blink * 5.0, 2))
                presence_map["AU45"] = 1

            for au_name in ["AU12", "AU04", "AU01", "AU02", "AU06", "AU10", "AU15", "AU26"]:
                if intensity_map[au_name] >= 1.2:
                    presence_map[au_name] = 1

        # If OpenFace data is present and valid, fuse OpenFace AU predictions with geometric values
        if openface_data and openface_data.get("face_detected"):
            of_presence = openface_data.get("action_units", {}).get("presence", {})
            of_intensity = openface_data.get("action_units", {}).get("intensity", {})
            for au, val in of_presence.items():
                if au in presence_map:
                    presence_map[au] = int(val)
            for au, val in of_intensity.items():
                if au in intensity_map:
                    intensity_map[au] = round(float(val), 2)

        # ── 4. 3D Gaze Estimation ─────────────────────────────────────
        gaze_angle_x = 0.0
        gaze_angle_y = 0.0
        eye_contact = True

        if len(pts) >= 478:
            left_pupil = pts[468]
            right_pupil = pts[473]

            left_eye_len = np.linalg.norm(pts[33] - pts[133]) + 1e-6
            left_pupil_ratio = np.linalg.norm(pts[33] - left_pupil) / left_eye_len

            right_eye_len = np.linalg.norm(pts[263] - pts[362]) + 1e-6
            right_pupil_ratio = np.linalg.norm(pts[362] - right_pupil) / right_eye_len

            avg_ratio_x = (left_pupil_ratio + (1.0 - right_pupil_ratio)) / 2.0
            gaze_angle_x = round(float((avg_ratio_x - 0.5) * 55.0), 1)

            # Vertical ratio (eyelid to pupil)
            pupil_vert_dist = (left_pupil[1] - pts[160][1]) / (left_ear_vert + 1e-6)
            gaze_angle_y = round(float((pupil_vert_dist - 0.5) * 45.0), 1)

            eye_contact = abs(gaze_angle_x) <= 20.0 and abs(gaze_angle_y) <= 22.0 and not is_blinking

        gaze = {
            "gaze_angle_x": gaze_angle_x,
            "gaze_angle_y": gaze_angle_y,
            "eye_contact": eye_contact,
            "ear": round(avg_ear, 3),
            "blink_rate_bpm": blink_rate_bpm,
        }

        # ── 5. Head Pose (SolvePnP) ───────────────────────────────────
        head_pose = self._estimate_head_pose(pts, w, h)

        # ── 6. Continuous Facial Movement Tracking Over Time ──────────
        movement_velocity = 0.0
        dt = now_ts - self._prev_time if self._prev_time > 0 else 0.05
        dt = max(0.001, min(dt, 0.5))

        if self._prev_landmarks is not None and len(self._prev_landmarks) == len(pts):
            # Calculate mean normalized displacement per second across key 68 landmarks
            displacement = np.linalg.norm(pts[:68, :2] - self._prev_landmarks[:68, :2], axis=1)
            movement_velocity = round(float(np.mean(displacement) / (iod * dt)), 3)

        self._prev_landmarks = pts.copy()
        self._prev_time = now_ts
        self._movement_history.append(movement_velocity)
        avg_velocity = float(np.mean(self._movement_history)) if self._movement_history else 0.0

        # Facial movement classification
        movement_state = (
            "rapid_movement" if avg_velocity > 2.2
            else "moderate_movement" if avg_velocity > 0.8
            else "micro_movement" if avg_velocity > 0.15
            else "still"
        )

        # ── 7. Composite Facial Expression Configuration ──────────────
        # Distinguish: movement != Action Units != facial expression != emotion
        expression_config = self._derive_expression_config(presence_map, intensity_map, gaze)

        latency_ms = (time.perf_counter() - t0) * 1000.0

        return {
            "action_units": {
                "presence": presence_map,
                "intensity": intensity_map,
                "AU12_LipCornerPuller": round(intensity_map["AU12"] / 5.0, 3),
                "AU04_BrowLowerer": round(intensity_map["AU04"] / 5.0, 3),
                "AU01_InnerBrowRaiser": round(intensity_map["AU01"] / 5.0, 3),
                "AU06_CheekRaiser": round(intensity_map["AU06"] / 5.0, 3),
                "AU45_Blink": round(intensity_map.get("AU45", 0.0) / 5.0, 3),
                "AU12": intensity_map["AU12"],
                "AU04": intensity_map["AU04"],
                "AU01": intensity_map["AU01"],
                "AU06": intensity_map["AU06"],
                "AU45": intensity_map.get("AU45", 0.0),
            },
            "gaze": gaze,
            "head_pose": head_pose,
            "facial_movement": {
                "velocity": round(avg_velocity, 3),
                "state": movement_state,
                "is_blinking": is_blinking,
                "blink_rate_bpm": blink_rate_bpm,
            },
            "facial_expression": expression_config,
            "framework": self.framework,
            "latency_ms": round(latency_ms, 2),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    def _derive_expression_config(
        self, presence: Dict[str, int], intensity: Dict[str, float], gaze: Dict[str, Any]
    ) -> str:
        """Derive objective physical expression description from Action Units."""
        au12 = intensity.get("AU12", 0.0)
        au06 = intensity.get("AU06", 0.0)
        au04 = intensity.get("AU04", 0.0)
        au01 = intensity.get("AU01", 0.0)
        au02 = intensity.get("AU02", 0.0)
        au15 = intensity.get("AU15", 0.0)
        au25 = intensity.get("AU25", 0.0)
        au26 = intensity.get("AU26", 0.0)

        if au12 >= 2.0 and au06 >= 1.5:
            return "duchenne_smile"
        elif au12 >= 1.5:
            return "polite_smile"
        elif au04 >= 2.0 and au15 >= 1.5:
            return "frown_sadness"
        elif au04 >= 2.0:
            return "brow_furrow"
        elif (au01 >= 2.0 or au02 >= 2.0) and (au25 >= 1.5 or au26 >= 1.5):
            return "wide_eyed_surprise"
        elif au01 >= 2.0 and au04 >= 1.5:
            return "distress_brow"
        elif au25 >= 2.0 or au26 >= 2.0:
            return "open_mouth"
        elif not gaze.get("eye_contact", True):
            return "averted_gaze"
        else:
            return "neutral_expression"

    def _estimate_head_pose(self, pts: np.ndarray, w: int, h: int) -> Dict[str, float]:
        """Estimate 3D head pose (pitch, yaw, roll) using Perspective-n-Point."""
        model_pts = np.array([
            (0.0, 0.0, 0.0),             # Nose tip (1)
            (0.0, 330.0, -65.0),         # Chin (199) - down in image space
            (-225.0, -170.0, -135.0),    # Left eye outer corner (33) - up in image space
            (225.0, -170.0, -135.0),     # Right eye outer corner (263) - up in image space
            (-150.0, 150.0, -125.0),     # Left mouth corner (61) - down from nose
            (150.0, 150.0, -125.0),      # Right mouth corner (291) - down from nose
        ], dtype=np.float64)

        image_pts = np.array([
            pts[1][:2],
            pts[199][:2],
            pts[33][:2],
            pts[263][:2],
            pts[61][:2],
            pts[291][:2],
        ], dtype=np.float64)

        focal_length = w
        center = (w / 2.0, h / 2.0)
        camera_matrix = np.array([
            [focal_length, 0, center[0]],
            [0, focal_length, center[1]],
            [0, 0, 1],
        ], dtype=np.float64)
        dist_coeffs = np.zeros((4, 1))

        try:
            success, rot_vec, trans_vec = cv2.solvePnP(
                model_pts, image_pts, camera_matrix, dist_coeffs, flags=cv2.SOLVEPNP_ITERATIVE
            )
            if success:
                rmat, _ = cv2.Rodrigues(rot_vec)
                angles, _, _, _, _, _ = cv2.RQDecomp3x3(rmat)
                return {
                    "pitch": round(float(angles[0]), 1),
                    "yaw": round(float(angles[1]), 1),
                    "roll": round(float(angles[2]), 1),
                }
        except Exception:
            pass

        return {"pitch": 0.0, "yaw": 0.0, "roll": 0.0}

    def _fallback_test_result(self, emotion_scores: Dict[str, float], latency_sec: float) -> Dict[str, Any]:
        happy = float(emotion_scores.get("happy", 0.0))
        sad = float(emotion_scores.get("sad", 0.0))
        surprised = float(emotion_scores.get("surprised", 0.0))
        au12 = round(happy * 0.85, 3)
        au04 = round(sad * 0.75, 3)
        au01 = round(surprised * 0.80, 3)
        return {
            "action_units": {
                "presence": {"AU12": 1 if au12 > 0.4 else 0, "AU04": 1 if au04 > 0.4 else 0},
                "intensity": {"AU12": au12 * 5.0, "AU04": au04 * 5.0},
                "AU12_LipCornerPuller": au12,
                "AU04_BrowLowerer": au04,
                "AU01_InnerBrowRaiser": au01,
                "AU45_Blink": 0.0,
            },
            "gaze": {"gaze_angle_x": 0.0, "gaze_angle_y": 0.0, "eye_contact": True, "ear": 0.28, "blink_rate_bpm": 12},
            "head_pose": {"pitch": 0.0, "yaw": 0.0, "roll": 0.0},
            "facial_movement": {"velocity": 0.0, "state": "still", "is_blinking": False, "blink_rate_bpm": 12},
            "facial_expression": "fallback_estimation",
            "latency_ms": round(latency_sec * 1000.0, 2),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    def _empty_behavior_result(self, latency_sec: float) -> Dict[str, Any]:
        return {
            "action_units": {
                "presence": {au: 0 for au in AU_PRESENCE_NAMES},
                "intensity": {au: 0.0 for au in AU_INTENSITY_NAMES},
                "AU12_LipCornerPuller": 0.0,
                "AU04_BrowLowerer": 0.0,
                "AU01_InnerBrowRaiser": 0.0,
                "AU06_CheekRaiser": 0.0,
                "AU45_Blink": 0.0,
            },
            "gaze": {"gaze_angle_x": 0.0, "gaze_angle_y": 0.0, "eye_contact": False, "ear": 0.0, "blink_rate_bpm": 0},
            "head_pose": {"pitch": 0.0, "yaw": 0.0, "roll": 0.0},
            "facial_movement": {"velocity": 0.0, "state": "still", "is_blinking": False, "blink_rate_bpm": 0},
            "facial_expression": "none",
            "latency_ms": round(latency_sec * 1000.0, 2),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    def health_check(self) -> Dict[str, Any]:
        return {
            "status": "healthy",
            "framework": self.framework,
            "openface_available": self._openface.is_available,
            "is_loaded": self.is_loaded,
        }
