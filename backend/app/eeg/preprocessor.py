"""
Aura AI — EEG Signal Preprocessor.
Parses European Data Format (.edf) files and raw multi-channel records,
standardizes 10-20 montage channel mappings, and applies clinical DSP filtering
(0.5-45 Hz bandpass, 50/60 Hz notch filter).
"""

from __future__ import annotations

import io
import re
from typing import Dict, List, Optional, Tuple
import numpy as np
from scipy.signal import butter, sosfiltfilt, iirnotch, filtfilt

STANDARD_10_20_CHANNELS = [
    "Fp1", "Fp2", "F7", "F3", "Fz", "F4", "F8",
    "T3", "C3", "Cz", "C4", "T4",
    "T5", "P3", "Pz", "P4", "T6",
    "O1", "O2"
]


def clean_channel_label(label: str) -> str:
    """Normalize raw channel header label to standard 10-20 channel name."""
    cleaned = label.upper()
    cleaned = re.sub(r"^EEG\s*", "", cleaned)
    cleaned = re.sub(r"-(LE|REF|A1|A2|AVG|M1|M2|CZ)$", "", cleaned)
    cleaned = cleaned.strip()
    for std in STANDARD_10_20_CHANNELS:
        if cleaned == std.upper():
            return std
    return cleaned


def parse_edf_bytes(file_bytes: bytes) -> Tuple[Dict[str, np.ndarray], float, float, Dict[str, any]]:
    """
    Parses EDF binary stream in memory without external C-bindings.
    Returns:
        (signals_dict, sampling_rate_hz, duration_seconds, metadata)
    """
    if len(file_bytes) < 256:
        raise ValueError("Invalid EDF file: byte stream is too small (< 256 bytes).")

    # Fixed header (256 bytes)
    version = file_bytes[0:8].decode("ascii", errors="ignore").strip()
    patient_id = file_bytes[8:88].decode("ascii", errors="ignore").strip()
    recording_id = file_bytes[88:168].decode("ascii", errors="ignore").strip()
    start_date = file_bytes[168:176].decode("ascii", errors="ignore").strip()
    start_time = file_bytes[176:184].decode("ascii", errors="ignore").strip()
    header_bytes_count = int(file_bytes[184:192].decode("ascii", errors="ignore").strip())
    reserved = file_bytes[192:236].decode("ascii", errors="ignore").strip()
    num_records = int(file_bytes[236:244].decode("ascii", errors="ignore").strip())
    record_duration = float(file_bytes[244:252].decode("ascii", errors="ignore").strip())
    num_signals = int(file_bytes[252:256].decode("ascii", errors="ignore").strip())

    if num_signals <= 0:
        raise ValueError(f"EDF file indicates {num_signals} channels.")

    # Variable channel header (num_signals * 256 bytes)
    offset = 256
    labels = [file_bytes[offset + i*16 : offset + (i+1)*16].decode("ascii", errors="ignore").strip() for i in range(num_signals)]
    offset += num_signals * 16

    _transducers = [file_bytes[offset + i*80 : offset + (i+1)*80].decode("ascii", errors="ignore").strip() for i in range(num_signals)]
    offset += num_signals * 80

    _units = [file_bytes[offset + i*8 : offset + (i+1)*8].decode("ascii", errors="ignore").strip() for i in range(num_signals)]
    offset += num_signals * 8

    phys_mins = [float(file_bytes[offset + i*8 : offset + (i+1)*8].decode("ascii", errors="ignore").strip()) for i in range(num_signals)]
    offset += num_signals * 8

    phys_maxs = [float(file_bytes[offset + i*8 : offset + (i+1)*8].decode("ascii", errors="ignore").strip()) for i in range(num_signals)]
    offset += num_signals * 8

    dig_mins = [float(file_bytes[offset + i*8 : offset + (i+1)*8].decode("ascii", errors="ignore").strip()) for i in range(num_signals)]
    offset += num_signals * 8

    dig_maxs = [float(file_bytes[offset + i*8 : offset + (i+1)*8].decode("ascii", errors="ignore").strip()) for i in range(num_signals)]
    offset += num_signals * 8

    _prefilters = [file_bytes[offset + i*80 : offset + (i+1)*80].decode("ascii", errors="ignore").strip() for i in range(num_signals)]
    offset += num_signals * 80

    samples_per_record = [int(file_bytes[offset + i*8 : offset + (i+1)*8].decode("ascii", errors="ignore").strip()) for i in range(num_signals)]
    offset += num_signals * 8

    # Skip reserved channel headers
    offset += num_signals * 32

    # Map available channels to standard 10-20
    channel_index_map: Dict[str, int] = {}
    for idx, lbl in enumerate(labels):
        std_name = clean_channel_label(lbl)
        if std_name in STANDARD_10_20_CHANNELS:
            channel_index_map[std_name] = idx

    fs = float(samples_per_record[0]) / record_duration if record_duration > 0 else 256.0
    total_samples_per_record = sum(samples_per_record)

    # Read binary 2-byte integer records
    raw_signal_bytes = file_bytes[header_bytes_count:]
    raw_array = np.frombuffer(raw_signal_bytes, dtype=np.int16)

    records_available = len(raw_array) // total_samples_per_record
    if records_available < 1:
        raise ValueError("EDF file data section is empty or corrupted.")

    raw_array = raw_array[:records_available * total_samples_per_record]
    record_matrix = raw_array.reshape((records_available, total_samples_per_record))

    extracted_signals: Dict[str, np.ndarray] = {}
    channel_offset = 0

    for ch_idx in range(num_signals):
        num_samp = samples_per_record[ch_idx]
        ch_slice = record_matrix[:, channel_offset : channel_offset + num_samp].flatten()
        channel_offset += num_samp

        # Calibration formula to microvolts (uV)
        # phys = (dig - dig_min) * (phys_max - phys_min) / (dig_max - dig_min) + phys_min
        d_span = dig_maxs[ch_idx] - dig_mins[ch_idx]
        p_span = phys_maxs[ch_idx] - phys_mins[ch_idx]
        scale = p_span / d_span if d_span != 0 else 1.0
        calibrated = (ch_slice.astype(np.float64) - dig_mins[ch_idx]) * scale + phys_mins[ch_idx]

        for std_name, mapped_idx in channel_index_map.items():
            if mapped_idx == ch_idx:
                extracted_signals[std_name] = calibrated
                break

    duration_sec = records_available * record_duration
    metadata = {
        "version": version,
        "patient_id": patient_id,
        "recording_id": recording_id,
        "start_date": start_date,
        "start_time": start_time,
        "num_records": records_available,
        "raw_channels_count": num_signals,
        "mapped_1020_count": len(extracted_signals),
        "sampling_rate": fs,
        "duration_sec": duration_sec,
    }

    return extracted_signals, fs, duration_sec, metadata


def apply_bandpass_filter(data: np.ndarray, fs: float, lowcut: float = 0.5, highcut: float = 45.0, order: int = 4) -> np.ndarray:
    """Zero-phase Butterworth bandpass filter using Second-Order Sections (SOS)."""
    nyq = 0.5 * fs
    low = max(0.1, lowcut) / nyq
    high = min(nyq - 0.5, highcut) / nyq
    if low >= high:
        return data
    sos = butter(order, [low, high], btype="bandpass", output="sos")
    return sosfiltfilt(sos, data)


def apply_notch_filter(data: np.ndarray, fs: float, freq: float = 50.0, quality_factor: float = 30.0) -> np.ndarray:
    """IIR Notch filter for powerline hum elimination (50Hz / 60Hz)."""
    nyq = 0.5 * fs
    if freq >= nyq:
        return data
    b, a = iirnotch(freq, quality_factor, fs)
    return filtfilt(b, a, data)


def preprocess_signals(signals: Dict[str, np.ndarray], fs: float) -> Dict[str, np.ndarray]:
    """
    Applies standard clinical DSP filtering to all available channels:
    1. 50Hz and 60Hz Notch filtering.
    2. 0.5Hz to 45Hz Bandpass filtering.
    """
    filtered: Dict[str, np.ndarray] = {}
    for ch, sig in signals.items():
        if len(sig) < int(fs):
            filtered[ch] = sig
            continue
        try:
            # 50 Hz notch
            clean_sig = apply_notch_filter(sig, fs, 50.0)
            # 60 Hz notch
            clean_sig = apply_notch_filter(clean_sig, fs, 60.0)
            # 0.5 - 45 Hz bandpass
            clean_sig = apply_bandpass_filter(clean_sig, fs, 0.5, 45.0)
            filtered[ch] = clean_sig
        except Exception:
            # Fallback to uncorrupted raw if filter fails
            filtered[ch] = sig
    return filtered
