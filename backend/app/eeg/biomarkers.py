"""
Aura AI — EEG Quantitative Biomarkers Extractor.
Calculates Frontal Alpha Asymmetry (FAA), Theta/Beta Ratio (TBR),
multi-band Welch PSD, individual alpha peak frequencies, 19-lead topographic maps,
and normative Z-scores against clinical benchmarks.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
import numpy as np
from scipy.signal import welch

from app.eeg.preprocessor import STANDARD_10_20_CHANNELS

BANDS = {
    "delta": (0.5, 4.0),
    "theta": (4.0, 8.0),
    "alpha": (8.0, 13.0),
    "beta": (13.0, 30.0),
    "gamma": (30.0, 45.0)
}

# Standard 2D / 3D normalized coordinates for 10-20 scalp topomap
# (x: -1 left to +1 right, y: +1 nasion to -1 inion, z: depth)
ELECTRODE_COORDINATES = {
    "Fp1": {"x": -0.30, "y": 0.85, "z": 0.1},
    "Fp2": {"x": 0.30,  "y": 0.85, "z": 0.1},
    "F7":  {"x": -0.75, "y": 0.50, "z": -0.1},
    "F3":  {"x": -0.40, "y": 0.50, "z": 0.4},
    "Fz":  {"x": 0.00,  "y": 0.55, "z": 0.55},
    "F4":  {"x": 0.40,  "y": 0.50, "z": 0.4},
    "F8":  {"x": 0.75,  "y": 0.50, "z": -0.1},
    "T3":  {"x": -0.85, "y": 0.00, "z": -0.15},
    "C3":  {"x": -0.45, "y": 0.00, "z": 0.55},
    "Cz":  {"x": 0.00,  "y": 0.00, "z": 0.75},
    "C4":  {"x": 0.45,  "y": 0.00, "z": 0.55},
    "T4":  {"x": 0.85,  "y": 0.00, "z": -0.15},
    "T5":  {"x": -0.75, "y": -0.50, "z": -0.1},
    "P3":  {"x": -0.40, "y": -0.50, "z": 0.4},
    "Pz":  {"x": 0.00,  "y": -0.55, "z": 0.55},
    "P4":  {"x": 0.40,  "y": -0.50, "z": 0.4},
    "T6":  {"x": 0.75,  "y": -0.50, "z": -0.1},
    "O1":  {"x": -0.30, "y": -0.85, "z": 0.1},
    "O2":  {"x": 0.30,  "y": -0.85, "z": 0.1},
}


def load_benchmarks() -> Dict[str, Any]:
    """Loads empirical normative reference baselines from model training."""
    search_paths = [
        Path("/app/models/eeg_benchmarks.json"),
        Path("d:/AuraAI/backend/models/eeg_benchmarks.json"),
        Path("backend/models/eeg_benchmarks.json"),
        Path("models/eeg_benchmarks.json"),
    ]
    for p in search_paths:
        if p.exists():
            try:
                with open(p, "r") as f:
                    return json.load(f)
            except Exception:
                pass
    return {}


def compute_biomarkers(
    signals: Dict[str, np.ndarray],
    fs: float,
    state: str = "eyes_closed"
) -> Tuple[Dict[str, float], Dict[str, Any], Dict[str, Any]]:
    """
    Computes all quantitative neuro-biomarkers:
    Returns:
        (feature_vector_dict, band_powers_dict, topomap_dict)
    """
    nperseg = min(int(fs * 2.0), 512)
    ch_metrics: Dict[str, Dict[str, float]] = {}

    for ch, sig in signals.items():
        if len(sig) < nperseg:
            continue
        freqs, psd = welch(sig, fs=fs, nperseg=nperseg, noverlap=nperseg // 2)

        tot_power = np.sum(psd[(freqs >= 0.5) & (freqs <= 45.0)])
        if tot_power <= 0:
            tot_power = 1e-9

        band_dict = {}
        for b_name, (low, high) in BANDS.items():
            mask = (freqs >= low) & (freqs <= high)
            abs_p = float(np.sum(psd[mask]))
            rel_p = float(abs_p / tot_power)
            band_dict[f"{b_name}_abs"] = abs_p
            band_dict[f"{b_name}_rel"] = rel_p

        # Peak Alpha Frequency (APF)
        alpha_mask = (freqs >= 7.5) & (freqs <= 12.5)
        if np.any(alpha_mask):
            apf = float(freqs[alpha_mask][np.argmax(psd[alpha_mask])])
        else:
            apf = 10.0
        band_dict["apf"] = apf
        band_dict["rms_uv"] = float(np.sqrt(np.mean(sig ** 2)))

        ch_metrics[ch] = band_dict

    # 1. Frontal Alpha Asymmetry (FAA)
    f4_alpha = ch_metrics.get("F4", {}).get("alpha_abs", 1e-6)
    f3_alpha = ch_metrics.get("F3", {}).get("alpha_abs", 1e-6)
    faa = float(np.log(max(f4_alpha, 1e-9)) - np.log(max(f3_alpha, 1e-9)))

    f8_alpha = ch_metrics.get("F8", {}).get("alpha_abs", 1e-6)
    f7_alpha = ch_metrics.get("F7", {}).get("alpha_abs", 1e-6)
    faa_lateral = float(np.log(max(f8_alpha, 1e-9)) - np.log(max(f7_alpha, 1e-9)))

    p4_alpha = ch_metrics.get("P4", {}).get("alpha_abs", 1e-6)
    p3_alpha = ch_metrics.get("P3", {}).get("alpha_abs", 1e-6)
    paa = float(np.log(max(p4_alpha, 1e-9)) - np.log(max(p3_alpha, 1e-9)))

    # 2. Theta / Beta Ratios
    fz_theta = ch_metrics.get("Fz", {}).get("theta_abs", 1e-6)
    fz_beta = ch_metrics.get("Fz", {}).get("beta_abs", 1e-6)
    tbr_fz = float(fz_theta / max(fz_beta, 1e-9))

    cz_theta = ch_metrics.get("Cz", {}).get("theta_abs", 1e-6)
    cz_beta = ch_metrics.get("Cz", {}).get("beta_abs", 1e-6)
    tbr_cz = float(cz_theta / max(cz_beta, 1e-9))

    # 3. Global & Regional Averages
    present_channels = [c for c in STANDARD_10_20_CHANNELS if c in ch_metrics]
    num_p = len(present_channels) if present_channels else 1

    global_bands = {}
    for b in ["delta", "theta", "alpha", "beta", "gamma"]:
        avg_rel = sum(ch_metrics[c][f"{b}_rel"] for c in present_channels) / num_p
        avg_abs = sum(ch_metrics[c][f"{b}_abs"] for c in present_channels) / num_p
        global_bands[f"global_{b}_rel"] = float(avg_rel)
        global_bands[f"global_{b}_abs"] = float(avg_abs)

    frontal_chs = [c for c in ["Fp1", "Fp2", "F3", "F4", "Fz", "F7", "F8"] if c in ch_metrics]
    central_chs = [c for c in ["C3", "C4", "Cz"] if c in ch_metrics]
    parietal_chs = [c for c in ["P3", "P4", "Pz"] if c in ch_metrics]
    occipital_chs = [c for c in ["O1", "O2"] if c in ch_metrics]

    def regional_rel(chs, band):
        if not chs:
            return 0.2
        return sum(ch_metrics[c][f"{band}_rel"] for c in chs) / len(chs)

    features = {
        "faa": faa,
        "faa_lateral": faa_lateral,
        "paa": paa,
        "tbr_fz": tbr_fz,
        "tbr_cz": tbr_cz,
        "fm_theta_rel": float(ch_metrics.get("Fz", {}).get("theta_rel", 0.2)),
        "frontal_theta_rel": float(regional_rel(frontal_chs, "theta")),
        "frontal_alpha_rel": float(regional_rel(frontal_chs, "alpha")),
        "frontal_beta_rel": float(regional_rel(frontal_chs, "beta")),
        "central_alpha_rel": float(regional_rel(central_chs, "alpha")),
        "central_beta_rel": float(regional_rel(central_chs, "beta")),
        "parietal_alpha_rel": float(regional_rel(parietal_chs, "alpha")),
        "occipital_alpha_rel": float(regional_rel(occipital_chs, "alpha")),
        "f3_alpha_rel": float(ch_metrics.get("F3", {}).get("alpha_rel", 0.2)),
        "f4_alpha_rel": float(ch_metrics.get("F4", {}).get("alpha_rel", 0.2)),
        "fz_alpha_rel": float(ch_metrics.get("Fz", {}).get("alpha_rel", 0.2)),
        "apf_f3": float(ch_metrics.get("F3", {}).get("apf", 10.0)),
        "apf_f4": float(ch_metrics.get("F4", {}).get("apf", 10.0)),
        "global_delta_rel": global_bands["global_delta_rel"],
        "global_theta_rel": global_bands["global_theta_rel"],
        "global_alpha_rel": global_bands["global_alpha_rel"],
        "global_beta_rel": global_bands["global_beta_rel"],
        "global_gamma_rel": global_bands["global_gamma_rel"],
        "state_is_ec": 1.0 if "closed" in state.lower() or "ec" in state.lower() else 0.0,
    }

    # 4. Normative Z-Scores computation
    benchmarks = load_benchmarks()
    normative = benchmarks.get("normative_baselines", {})
    z_scores = {}
    for k, val in features.items():
        if k in normative:
            hc_mean = normative[k]["healthy"]["mean"]
            hc_std = max(normative[k]["healthy"]["std"], 1e-4)
            z_scores[k] = float((val - hc_mean) / hc_std)

    # 5. Topographic Scalp Map Structure (for claymorphic interactive SVG rendering)
    topomap_nodes = []
    for ch in STANDARD_10_20_CHANNELS:
        coords = ELECTRODE_COORDINATES.get(ch, {"x": 0.0, "y": 0.0, "z": 0.0})
        m = ch_metrics.get(ch, {
            "alpha_rel": 0.2, "theta_rel": 0.2, "beta_rel": 0.2, "delta_rel": 0.2, "gamma_rel": 0.2,
            "alpha_abs": 1.0, "rms_uv": 15.0, "apf": 10.0
        })
        topomap_nodes.append({
            "channel": ch,
            "x": coords["x"],
            "y": coords["y"],
            "z": coords["z"],
            "rms_uv": round(m.get("rms_uv", 15.0), 2),
            "alpha_rel": round(m.get("alpha_rel", 0.2), 4),
            "theta_rel": round(m.get("theta_rel", 0.2), 4),
            "beta_rel": round(m.get("beta_rel", 0.2), 4),
            "delta_rel": round(m.get("delta_rel", 0.2), 4),
            "gamma_rel": round(m.get("gamma_rel", 0.2), 4),
            "apf": round(m.get("apf", 10.0), 2),
        })

    band_powers_payload = {
        "global": {
            "delta": round(global_bands["global_delta_rel"] * 100, 2),
            "theta": round(global_bands["global_theta_rel"] * 100, 2),
            "alpha": round(global_bands["global_alpha_rel"] * 100, 2),
            "beta": round(global_bands["global_beta_rel"] * 100, 2),
            "gamma": round(global_bands["global_gamma_rel"] * 100, 2),
        },
        "regional": {
            "frontal_alpha": round(features["frontal_alpha_rel"] * 100, 2),
            "frontal_theta": round(features["frontal_theta_rel"] * 100, 2),
            "frontal_beta": round(features["frontal_beta_rel"] * 100, 2),
            "central_alpha": round(features["central_alpha_rel"] * 100, 2),
            "central_beta": round(features["central_beta_rel"] * 100, 2),
            "parietal_alpha": round(features["parietal_alpha_rel"] * 100, 2),
            "occipital_alpha": round(features["occipital_alpha_rel"] * 100, 2),
        },
        "channels": ch_metrics
    }

    topomap_payload = {
        "channels": topomap_nodes,
        "asymmetry_pairs": [
            {"pair": "F4-F3", "region": "Frontal Dorsolateral", "score": round(faa, 3), "normative_z": round(z_scores.get("faa", 0.0), 2)},
            {"pair": "F8-F7", "region": "Inferior Frontal", "score": round(faa_lateral, 3), "normative_z": round(z_scores.get("faa_lateral", 0.0), 2)},
            {"pair": "P4-P3", "region": "Parietal", "score": round(paa, 3), "normative_z": round(z_scores.get("paa", 0.0), 2)},
        ]
    }

    biomarkers_payload = {
        "faa": round(faa, 4),
        "tbr_fz": round(tbr_fz, 3),
        "tbr_cz": round(tbr_cz, 3),
        "fm_theta_rel": round(features["fm_theta_rel"], 4),
        "apf_f3": round(features["apf_f3"], 2),
        "apf_f4": round(features["apf_f4"], 2),
        "z_scores": {k: round(v, 3) for k, v in z_scores.items()},
    }

    return features, band_powers_payload, topomap_payload, biomarkers_payload
