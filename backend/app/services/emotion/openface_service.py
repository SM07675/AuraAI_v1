"""
OpenFace 2.0 Feature Extraction Service for Aura AI 2.0.

Integrates the official OpenFace 2.2.0 C++ binary suite (FeatureExtraction.exe)
with CE-CLM facial landmark tracking, SVR/SVM Action Unit estimators,
3D gaze estimation, and head pose estimation.

Processes live camera frames and extracts:
- AU presence (binary 0/1 for 18 Action Units)
- AU intensity (continuous 0.0–5.0 for 17 Action Units)
- 3D gaze vector and eye contact detection
- 3D head pose (Pitch, Yaw, Roll, Tx, Ty, Tz)
- 68 2D and 3D facial landmarks
- Tracking confidence and success scoring
"""

from __future__ import annotations

import asyncio
import csv
import math
import os
import shutil
import subprocess
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

import cv2
import numpy as np

from app.core.logging_config import get_logger

logger = get_logger(__name__)

# Search paths for OpenFace 2.2.0 binary folder
_ROOT_DIR = Path(__file__).resolve().parent.parent.parent.parent
_OPENFACE_CANDIDATE_DIRS: List[Path] = [
    _ROOT_DIR / "models" / "face" / "openface" / "OpenFace_2.2.0_win_x64",
    _ROOT_DIR / "models" / "face" / "openface",
    Path("D:/AuraAI_v1/models/face/openface/OpenFace_2.2.0_win_x64"),
    Path("C:/Program Files/OpenFace"),
]

# Action Units tracked by OpenFace 2.0
AU_PRESENCE_NAMES = [
    "AU01", "AU02", "AU04", "AU05", "AU06", "AU07", "AU09", "AU10",
    "AU12", "AU14", "AU15", "AU17", "AU20", "AU23", "AU25", "AU26", "AU28", "AU45"
]
AU_INTENSITY_NAMES = [
    "AU01", "AU02", "AU04", "AU05", "AU06", "AU07", "AU09", "AU10",
    "AU12", "AU14", "AU15", "AU17", "AU20", "AU23", "AU25", "AU26", "AU45"
]

_GLOBAL_OPENFACE_SERVICE: Optional[OpenFaceService] = None


class OpenFaceService:
    """Service wrapping OpenFace 2.2.0 FeatureExtraction.exe for continuous live facial analysis."""

    def __init__(self, binary_dir: Optional[Union[str, Path]] = None) -> None:
        self._binary_dir: Optional[Path] = None
        self._exe_path: Optional[Path] = None
        self._is_available: bool = False
        self._latest_result: Optional[Dict[str, Any]] = None
        self._last_processed_time: float = 0.0
        self._lock = asyncio.Lock()
        self._scratch_dir = Path(tempfile.gettempdir()) / "aura_openface_scratch"
        self._scratch_dir.mkdir(parents=True, exist_ok=True)

        if binary_dir:
            self._set_binary_dir(Path(binary_dir))
        else:
            self._auto_discover()

    @classmethod
    def get_instance(cls, binary_dir: Optional[Union[str, Path]] = None) -> OpenFaceService:
        global _GLOBAL_OPENFACE_SERVICE
        if _GLOBAL_OPENFACE_SERVICE is None:
            _GLOBAL_OPENFACE_SERVICE = cls(binary_dir=binary_dir)
        return _GLOBAL_OPENFACE_SERVICE

    def _auto_discover(self) -> None:
        for cand in _OPENFACE_CANDIDATE_DIRS:
            exe = cand / "FeatureExtraction.exe"
            if exe.exists() and (cand / "model").exists():
                self._set_binary_dir(cand)
                return
        logger.warning("OpenFace 2.0 FeatureExtraction.exe not found in candidate paths", candidates=[str(p) for p in _OPENFACE_CANDIDATE_DIRS])

    def _set_binary_dir(self, dir_path: Path) -> None:
        exe = dir_path / "FeatureExtraction.exe"
        if exe.exists():
            self._binary_dir = dir_path
            self._exe_path = exe
            # Verify CEN patch experts exist
            patch_025 = dir_path / "model" / "patch_experts" / "cen_patches_0.25_of.dat"
            if patch_025.exists():
                self._is_available = True
                logger.info("OpenFace 2.0 initialized and verified", binary_dir=str(dir_path))
            else:
                self._is_available = False
                logger.warning("OpenFace binary found but CEN patches missing in model/patch_experts", dir=str(dir_path))
        else:
            self._is_available = False

    @property
    def is_available(self) -> bool:
        return self._is_available

    @property
    def binary_path(self) -> Optional[str]:
        return str(self._exe_path) if self._exe_path else None

    def extract_features_sync(self, image: Union[np.ndarray, str, Path]) -> Dict[str, Any]:
        """Synchronously execute OpenFace 2.0 FeatureExtraction on a single image frame."""
        t0 = time.perf_counter()
        if not self._is_available or not self._exe_path or not self._binary_dir:
            return self._empty_result(reason="openface_unavailable", latency_ms=(time.perf_counter() - t0) * 1000.0)

        # Prepare image file
        clean_up_input = False
        if isinstance(image, (str, Path)):
            input_file = Path(image)
            if not input_file.exists():
                return self._empty_result(reason="input_not_found", latency_ms=(time.perf_counter() - t0) * 1000.0)
        elif isinstance(image, np.ndarray):
            input_file = self._scratch_dir / f"frame_{int(time.time() * 1000) % 1000000}.jpg"
            cv2.imwrite(str(input_file), image)
            clean_up_input = True
        else:
            return self._empty_result(reason="invalid_image_type", latency_ms=(time.perf_counter() - t0) * 1000.0)

        out_dir = self._scratch_dir / f"out_{input_file.stem}"
        out_dir.mkdir(parents=True, exist_ok=True)
        csv_file = out_dir / f"{input_file.stem}.csv"

        cmd = [
            str(self._exe_path),
            "-f", str(input_file),
            "-out_dir", str(out_dir),
            "-aus", "-gaze", "-pose", "-2Dfp", "-3Dfp",
        ]

        try:
            # Execute FeatureExtraction.exe with working directory at binary folder
            proc = subprocess.run(
                cmd,
                cwd=str(self._binary_dir),
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                timeout=5.0,
            )

            latency_ms = (time.perf_counter() - t0) * 1000.0

            if csv_file.exists():
                result = self._parse_openface_csv(csv_file, latency_ms=latency_ms)
                self._latest_result = result
                self._last_processed_time = time.time()
                return result
            else:
                logger.debug("OpenFace FeatureExtraction finished but CSV not generated", stderr=proc.stderr[:200])
                return self._empty_result(reason="no_csv_produced", latency_ms=latency_ms)

        except subprocess.TimeoutExpired:
            logger.warning("OpenFace FeatureExtraction timed out after 5s")
            return self._empty_result(reason="timeout", latency_ms=(time.perf_counter() - t0) * 1000.0)
        except Exception as exc:
            logger.warning("OpenFace execution error", error=str(exc))
            return self._empty_result(reason=str(exc), latency_ms=(time.perf_counter() - t0) * 1000.0)
        finally:
            if clean_up_input and input_file.exists():
                try:
                    input_file.unlink(missing_ok=True)
                except Exception:
                    pass
            if out_dir.exists():
                try:
                    shutil.rmtree(out_dir, ignore_errors=True)
                except Exception:
                    pass

    async def extract_features_async(self, image: Union[np.ndarray, str, Path]) -> Dict[str, Any]:
        """Asynchronously execute OpenFace without blocking the event loop."""
        return await asyncio.to_thread(self.extract_features_sync, image)

    def _parse_openface_csv(self, csv_file: Path, latency_ms: float) -> Dict[str, Any]:
        """Parse OpenFace CSV output into standard structured facial state."""
        try:
            with open(csv_file, "r", encoding="utf-8", errors="ignore") as f:
                reader = csv.reader(f)
                headers = [h.strip() for h in next(reader, [])]
                data_row = [v.strip() for v in next(reader, [])]

            if not headers or not data_row:
                return self._empty_result(reason="empty_csv", latency_ms=latency_ms)

            row_map: Dict[str, float] = {}
            for h, v in zip(headers, data_row):
                try:
                    row_map[h] = float(v)
                except (ValueError, TypeError):
                    row_map[h] = 0.0

            success = int(row_map.get("success", 0)) == 1
            confidence = round(float(row_map.get("confidence", 0.0)), 3)

            # ── 1. Action Units (Presence & Intensity) ─────────────────
            au_presence: Dict[str, int] = {}
            for au in AU_PRESENCE_NAMES:
                key = f"{au}_c"
                au_presence[au] = int(row_map.get(key, 0))

            au_intensity: Dict[str, float] = {}
            for au in AU_INTENSITY_NAMES:
                key = f"{au}_r"
                au_intensity[au] = round(float(row_map.get(key, 0.0)), 2)

            # ── 2. 3D Gaze ────────────────────────────────────────────
            gaze_0_x = float(row_map.get("gaze_0_x", 0.0))
            gaze_0_y = float(row_map.get("gaze_0_y", 0.0))
            gaze_0_z = float(row_map.get("gaze_0_z", 0.0))
            gaze_angle_x = float(row_map.get("gaze_angle_x", 0.0))  # radians
            gaze_angle_y = float(row_map.get("gaze_angle_y", 0.0))  # radians

            angle_x_deg = round(math.degrees(gaze_angle_x), 1)
            angle_y_deg = round(math.degrees(gaze_angle_y), 1)
            # Direct eye contact: within ~12 degrees horizontal and vertical
            eye_contact = success and (abs(angle_x_deg) <= 12.0 and abs(angle_y_deg) <= 12.0)

            gaze = {
                "gaze_0": [round(gaze_0_x, 3), round(gaze_0_y, 3), round(gaze_0_z, 3)],
                "gaze_angle_x": angle_x_deg,
                "gaze_angle_y": angle_y_deg,
                "eye_contact": eye_contact,
            }

            # ── 3. Head Pose (Euler angles in degrees) ────────────────
            pose_rx = float(row_map.get("pose_Rx", 0.0))  # radians pitch
            pose_ry = float(row_map.get("pose_Ry", 0.0))  # radians yaw
            pose_rz = float(row_map.get("pose_Rz", 0.0))  # radians roll
            pose_tx = float(row_map.get("pose_Tx", 0.0))
            pose_ty = float(row_map.get("pose_Ty", 0.0))
            pose_tz = float(row_map.get("pose_Tz", 0.0))

            head_pose = {
                "pitch": round(math.degrees(pose_rx), 1),
                "yaw": round(math.degrees(pose_ry), 1),
                "roll": round(math.degrees(pose_rz), 1),
                "tx": round(pose_tx, 1),
                "ty": round(pose_ty, 1),
                "tz": round(pose_tz, 1),
            }

            # ── 4. 2D & 3D Landmarks (68 points) ─────────────────────
            landmarks_2d: List[Tuple[float, float]] = []
            for i in range(68):
                xk = f"x_{i}"
                yk = f"y_{i}"
                if xk in row_map and yk in row_map:
                    landmarks_2d.append((round(row_map[xk], 1), round(row_map[yk], 1)))

            return {
                "face_detected": success and confidence >= 0.50,
                "confidence": confidence,
                "action_units": {
                    "presence": au_presence,
                    "intensity": au_intensity,
                },
                "gaze": gaze,
                "head_pose": head_pose,
                "landmarks_count": len(landmarks_2d),
                "landmarks_2d": landmarks_2d,
                "framework": "openface_2.2.0",
                "latency_ms": round(latency_ms, 2),
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }

        except Exception as e:
            logger.warning("Error parsing OpenFace CSV", error=str(e))
            return self._empty_result(reason="csv_parse_error", latency_ms=latency_ms)

    def _empty_result(self, reason: str, latency_ms: float) -> Dict[str, Any]:
        return {
            "face_detected": False,
            "confidence": 0.0,
            "action_units": {
                "presence": {au: 0 for au in AU_PRESENCE_NAMES},
                "intensity": {au: 0.0 for au in AU_INTENSITY_NAMES},
            },
            "gaze": {"gaze_angle_x": 0.0, "gaze_angle_y": 0.0, "eye_contact": False},
            "head_pose": {"pitch": 0.0, "yaw": 0.0, "roll": 0.0},
            "landmarks_count": 0,
            "landmarks_2d": [],
            "framework": "openface_2.2.0",
            "reason": reason,
            "latency_ms": round(latency_ms, 2),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    def get_latest_result(self) -> Optional[Dict[str, Any]]:
        """Return the most recent processed OpenFace result."""
        return self._latest_result
