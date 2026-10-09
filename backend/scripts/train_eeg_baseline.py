"""
Aura AI — EEG Baseline Classifier Training on Mumtaz Dataset
Phase 1 of Neuro-Behavioral EEG Integration Roadmap.

Extracts Frontal Alpha Asymmetry (FAA), Welch PSD band powers, Theta/Beta ratios (TBR),
and regional electrophysiological biomarkers. Trains a baseline Scikit-Learn
classifier with cross-validation and computes feature importances.
"""

import os
import sys
import json
import struct
import numpy as np
from pathlib import Path
from scipy.signal import welch
from sklearn.ensemble import RandomForestClassifier, HistGradientBoostingClassifier
from sklearn.model_selection import StratifiedKFold, cross_val_predict
from sklearn.metrics import roc_auc_score, accuracy_score, precision_score, recall_score, f1_score, confusion_matrix
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline
import joblib

STANDARD_CHANNELS = [
    'Fp1', 'Fp2', 'F7', 'F3', 'Fz', 'F4', 'F8',
    'T3', 'C3', 'Cz', 'C4', 'T4',
    'T5', 'P3', 'Pz', 'P4', 'T6',
    'O1', 'O2'
]

BANDS = {
    'delta': (0.5, 4.0),
    'theta': (4.0, 8.0),
    'alpha': (8.0, 13.0),
    'beta': (13.0, 30.0),
    'gamma': (30.0, 45.0)
}


def read_edf(filepath: str):
    """
    Fast native Python / NumPy EDF reader.
    Extracts standard 10-20 channels and converts to microvolts.
    """
    with open(filepath, 'rb') as f:
        raw_header = f.read(256)
        if len(raw_header) < 256:
            raise ValueError(f"File {filepath} header is too short.")
        
        num_header_bytes = int(raw_header[184:192].strip().decode('ascii', errors='ignore'))
        num_records = int(raw_header[236:244].strip().decode('ascii', errors='ignore'))
        record_dur = float(raw_header[244:252].strip().decode('ascii', errors='ignore'))
        ns = int(raw_header[252:256].strip().decode('ascii', errors='ignore'))
        
        labels = [f.read(16).strip().decode('ascii', errors='ignore') for _ in range(ns)]
        _transducer = [f.read(80) for _ in range(ns)]
        _phys_dim = [f.read(8) for _ in range(ns)]
        phys_min = [float(f.read(8).strip().decode('ascii', errors='ignore')) for _ in range(ns)]
        phys_max = [float(f.read(8).strip().decode('ascii', errors='ignore')) for _ in range(ns)]
        dig_min = [float(f.read(8).strip().decode('ascii', errors='ignore')) for _ in range(ns)]
        dig_max = [float(f.read(8).strip().decode('ascii', errors='ignore')) for _ in range(ns)]
        _prefilt = [f.read(80) for _ in range(ns)]
        nr_samples = [int(f.read(8).strip().decode('ascii', errors='ignore')) for _ in range(ns)]
        _reserved = [f.read(32) for _ in range(ns)]
        
        # Seek past variable header if any remaining bytes
        f.seek(num_header_bytes)
        
        # Map label names to clean channel names
        clean_channel_map = {}
        for idx, lbl in enumerate(labels):
            lbl_upper = lbl.upper().replace('EEG', '').replace('-LE', '').replace('-REF', '').strip()
            for std_ch in STANDARD_CHANNELS:
                if lbl_upper == std_ch.upper():
                    clean_channel_map[std_ch] = idx
                    break
        
        sampling_rate = nr_samples[0] / record_dur if record_dur > 0 else 256.0
        
        # Read raw binary data records
        # Total samples per record across all ns channels
        total_samples_per_record = sum(nr_samples)
        raw_bytes = f.read()
        raw_int16 = np.frombuffer(raw_bytes, dtype=np.int16)
        
        records_read = len(raw_int16) // total_samples_per_record
        if records_read < 1:
            raise ValueError(f"Insufficient data in {filepath}")
        
        raw_int16 = raw_int16[:records_read * total_samples_per_record]
        data_records = raw_int16.reshape(records_read, total_samples_per_record)
        
        # Extract and calibrate channels
        signals = {}
        offset = 0
        for ch_idx in range(ns):
            samples_in_ch = nr_samples[ch_idx]
            ch_data = data_records[:, offset:offset + samples_in_ch].flatten()
            offset += samples_in_ch
            
            # Calibration to microvolts (uV)
            # physical = (digital - dig_min) * (phys_max - phys_min) / (dig_max - dig_min) + phys_min
            d_span = dig_max[ch_idx] - dig_min[ch_idx]
            p_span = phys_max[ch_idx] - phys_min[ch_idx]
            scale = p_span / d_span if d_span != 0 else 1.0
            calibrated = (ch_data.astype(np.float64) - dig_min[ch_idx]) * scale + phys_min[ch_idx]
            
            for std_ch, mapped_idx in clean_channel_map.items():
                if mapped_idx == ch_idx:
                    signals[std_ch] = calibrated
                    break
        
        return signals, sampling_rate, records_read * record_dur


def compute_psd_features(signals: dict, fs: float):
    """
    Computes band powers, FAA, TBR, and topomap values from multi-channel EEG signals.
    """
    nperseg = min(int(fs * 2.0), 512)  # 2-second Welch window
    channel_powers = {}
    
    for ch, sig in signals.items():
        if len(sig) < nperseg:
            continue
        freqs, psd = welch(sig, fs=fs, nperseg=nperseg, noverlap=nperseg // 2)
        
        total_power = np.sum(psd[(freqs >= 0.5) & (freqs <= 45.0)])
        if total_power <= 0:
            total_power = 1e-9
            
        band_p = {}
        for b_name, (low, high) in BANDS.items():
            idx_band = (freqs >= low) & (freqs <= high)
            abs_p = np.sum(psd[idx_band])
            rel_p = abs_p / total_power
            band_p[f"{b_name}_abs"] = float(abs_p)
            band_p[f"{b_name}_rel"] = float(rel_p)
        
        # Alpha peak frequency
        alpha_idx = (freqs >= 7.5) & (freqs <= 12.5)
        if np.any(alpha_idx):
            apf = freqs[alpha_idx][np.argmax(psd[alpha_idx])]
        else:
            apf = 10.0
        band_p["apf"] = float(apf)
        
        channel_powers[ch] = band_p

    # 1. Frontal Alpha Asymmetry (FAA) = ln(Alpha_F4) - ln(Alpha_F3)
    # Using microvolts^2 absolute alpha power or relative alpha power
    f4_alpha = channel_powers.get('F4', {}).get('alpha_abs', 1e-6)
    f3_alpha = channel_powers.get('F3', {}).get('alpha_abs', 1e-6)
    faa = np.log(max(f4_alpha, 1e-9)) - np.log(max(f3_alpha, 1e-9))

    # Lateral Frontal Asymmetry F8 vs F7
    f8_alpha = channel_powers.get('F8', {}).get('alpha_abs', 1e-6)
    f7_alpha = channel_powers.get('F7', {}).get('alpha_abs', 1e-6)
    faa_lateral = np.log(max(f8_alpha, 1e-9)) - np.log(max(f7_alpha, 1e-9))

    # Parietal Asymmetry P4 vs P3
    p4_alpha = channel_powers.get('P4', {}).get('alpha_abs', 1e-6)
    p3_alpha = channel_powers.get('P3', {}).get('alpha_abs', 1e-6)
    paa = np.log(max(p4_alpha, 1e-9)) - np.log(max(p3_alpha, 1e-9))

    # 2. Theta / Beta Ratio (TBR) at Fz and Cz
    fz_theta = channel_powers.get('Fz', {}).get('theta_abs', 1e-6)
    fz_beta = channel_powers.get('Fz', {}).get('beta_abs', 1e-6)
    tbr_fz = fz_theta / max(fz_beta, 1e-9)

    cz_theta = channel_powers.get('Cz', {}).get('theta_abs', 1e-6)
    cz_beta = channel_powers.get('Cz', {}).get('beta_abs', 1e-6)
    tbr_cz = cz_theta / max(cz_beta, 1e-9)

    # 3. Frontal Midline Theta (FmTheta) relative power
    fm_theta_rel = channel_powers.get('Fz', {}).get('theta_rel', 0.2)

    # 4. Global Average Relative Band Powers
    all_ch_keys = [k for k in STANDARD_CHANNELS if k in channel_powers]
    num_ch = len(all_ch_keys) if all_ch_keys else 1
    
    global_bands = {}
    for b in ['delta', 'theta', 'alpha', 'beta', 'gamma']:
        avg_rel = sum(channel_powers[k][f"{b}_rel"] for k in all_ch_keys) / num_ch
        global_bands[f"global_{b}_rel"] = float(avg_rel)

    # 5. Frontal, Central, Posterior averages
    frontal_chs = [c for c in ['Fp1', 'Fp2', 'F3', 'F4', 'Fz', 'F7', 'F8'] if c in channel_powers]
    central_chs = [c for c in ['C3', 'C4', 'Cz'] if c in channel_powers]
    parietal_chs = [c for c in ['P3', 'P4', 'Pz'] if c in channel_powers]
    occipital_chs = [c for c in ['O1', 'O2'] if c in channel_powers]

    def regional_rel(chs, band):
        if not chs:
            return 0.2
        return sum(channel_powers[c][f"{band}_rel"] for c in chs) / len(chs)

    features = {
        'faa': float(faa),
        'faa_lateral': float(faa_lateral),
        'paa': float(paa),
        'tbr_fz': float(tbr_fz),
        'tbr_cz': float(tbr_cz),
        'fm_theta_rel': float(fm_theta_rel),
        'frontal_theta_rel': float(regional_rel(frontal_chs, 'theta')),
        'frontal_alpha_rel': float(regional_rel(frontal_chs, 'alpha')),
        'frontal_beta_rel': float(regional_rel(frontal_chs, 'beta')),
        'central_alpha_rel': float(regional_rel(central_chs, 'alpha')),
        'central_beta_rel': float(regional_rel(central_chs, 'beta')),
        'parietal_alpha_rel': float(regional_rel(parietal_chs, 'alpha')),
        'occipital_alpha_rel': float(regional_rel(occipital_chs, 'alpha')),
        'f3_alpha_rel': float(channel_powers.get('F3', {}).get('alpha_rel', 0.2)),
        'f4_alpha_rel': float(channel_powers.get('F4', {}).get('alpha_rel', 0.2)),
        'fz_alpha_rel': float(channel_powers.get('Fz', {}).get('alpha_rel', 0.2)),
        'apf_f3': float(channel_powers.get('F3', {}).get('apf', 10.0)),
        'apf_f4': float(channel_powers.get('F4', {}).get('apf', 10.0)),
        **global_bands
    }

    return features, channel_powers


def main():
    data_dir = Path("/app/data/eeg_mumtaz")
    if not data_dir.exists():
        data_dir = Path("d:/AuraAI/backend/data/eeg_mumtaz")

    print(f"Scanning EDF files from {data_dir}...")
    all_files = sorted(list(data_dir.glob("*.edf")))
    print(f"Found {len(all_files)} total EDF files.")

    # Target resting state files (EC = Eyes Closed, EO = Eyes Open)
    resting_files = [f for f in all_files if (" EC" in f.name or " EO" in f.name)]
    print(f"Filtering to resting-state recordings (EC and EO): {len(resting_files)} files.")

    feature_rows = []
    labels = []
    file_metadata = []

    print("Extracting neuro-biomarker feature matrices...")
    for idx, fpath in enumerate(resting_files):
        is_mdd = 1 if "MDD" in fpath.name else 0
        state = "EC" if " EC" in fpath.name else "EO"
        
        try:
            signals, fs, dur = read_edf(str(fpath))
            # Must have key frontal channels
            if 'F3' not in signals or 'F4' not in signals:
                print(f"Skipping {fpath.name}: missing F3/F4 channels.")
                continue
                
            features, ch_powers = compute_psd_features(signals, fs)
            features['state_is_ec'] = 1.0 if state == "EC" else 0.0
            
            feature_rows.append(features)
            labels.append(is_mdd)
            file_metadata.append({
                "filename": fpath.name,
                "label": is_mdd,
                "state": state,
                "duration_sec": dur,
                "fs": fs
            })
            if (idx + 1) % 25 == 0 or idx == len(resting_files) - 1:
                print(f"Processed {idx + 1}/{len(resting_files)} files...")
        except Exception as e:
            print(f"Error processing {fpath.name}: {e}")

    X_keys = list(feature_rows[0].keys())
    X = np.array([[row[k] for k in X_keys] for row in feature_rows])
    y = np.array(labels)

    print(f"\nFeature matrix constructed: X shape = {X.shape}, Class distribution: MDD={np.sum(y==1)}, HC={np.sum(y==0)}")

    # Baseline Classifier (Random Forest with 5-fold Stratified CV)
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    pipeline = Pipeline([
        ('scaler', StandardScaler()),
        ('clf', RandomForestClassifier(n_estimators=100, max_depth=5, min_samples_split=4, random_state=42))
    ])

    y_pred_proba = cross_val_predict(pipeline, X, y, cv=cv, method='predict_proba')[:, 1]
    y_pred = (y_pred_proba >= 0.5).astype(int)

    auc = roc_auc_score(y, y_pred_proba)
    acc = accuracy_score(y, y_pred)
    prec = precision_score(y, y_pred)
    rec = recall_score(y, y_pred)
    f1 = f1_score(y, y_pred)
    cm = confusion_matrix(y, y_pred).tolist()

    print("\n" + "="*50)
    print("5-FOLD CROSS VALIDATION RESULTS ON RESTING-STATE EEG:")
    print(f"ROC-AUC:     {auc:.4f} (Target: ~0.82 - 0.87)")
    print(f"Accuracy:    {acc:.4f}")
    print(f"Sensitivity: {rec:.4f}")
    print(f"Precision:   {prec:.4f}")
    print(f"F1-Score:    {f1:.4f}")
    print(f"Confusion Matrix [TN, FP; FN, TP]: {cm}")
    print("="*50)

    # Train final model on full dataset
    pipeline.fit(X, y)
    clf = pipeline.named_steps['clf']
    importances = clf.feature_importances_
    sorted_idx = np.argsort(importances)[::-1]

    top_features = []
    print("\nTop 10 Biomarker Predictors (Gini Importance):")
    for i in range(min(10, len(sorted_idx))):
        idx_f = sorted_idx[i]
        feat_name = X_keys[idx_f]
        imp = importances[idx_f]
        top_features.append({"feature": feat_name, "importance": float(imp)})
        print(f"  {i+1}. {feat_name:20s}: {imp:.4f}")

    # Compute Normative Reference Baselines (Mean & Std for HC vs MDD)
    hc_mask = (y == 0)
    mdd_mask = (y == 1)
    normative_baselines = {}
    for k in X_keys:
        vals = np.array([row[k] for row in feature_rows])
        hc_vals = vals[hc_mask]
        mdd_vals = vals[mdd_mask]
        normative_baselines[k] = {
            "healthy": {
                "mean": float(np.mean(hc_vals)),
                "std": float(np.std(hc_vals)),
                "median": float(np.median(hc_vals))
            },
            "mdd": {
                "mean": float(np.mean(mdd_vals)),
                "std": float(np.std(mdd_vals)),
                "median": float(np.median(mdd_vals))
            }
        }

    # Save artifacts
    models_dir = Path("/app/models")
    if not models_dir.exists():
        models_dir = Path("d:/AuraAI/backend/models")
    models_dir.mkdir(parents=True, exist_ok=True)

    model_path = models_dir / "eeg_classifier.joblib"
    joblib.dump({
        "pipeline": pipeline,
        "feature_keys": X_keys,
        "metrics": {
            "roc_auc": float(auc),
            "accuracy": float(acc),
            "sensitivity": float(rec),
            "precision": float(prec),
            "f1_score": float(f1),
            "confusion_matrix": cm
        }
    }, model_path)
    print(f"\nModel pipeline saved to: {model_path}")

    benchmarks_path = models_dir / "eeg_benchmarks.json"
    benchmarks_data = {
        "dataset": "Mumtaz et al. (Figshare 4244171)",
        "sample_size": len(feature_rows),
        "num_mdd": int(np.sum(y == 1)),
        "num_healthy": int(np.sum(y == 0)),
        "metrics": {
            "roc_auc": float(auc),
            "accuracy": float(acc),
            "sensitivity": float(rec),
            "precision": float(prec),
            "f1_score": float(f1),
            "confusion_matrix": cm
        },
        "top_features": top_features,
        "normative_baselines": normative_baselines,
        "feature_keys": X_keys
    }
    with open(benchmarks_path, "w") as f:
        json.dump(benchmarks_data, f, indent=2)
    print(f"Normative benchmarks saved to: {benchmarks_path}")


if __name__ == "__main__":
    main()
