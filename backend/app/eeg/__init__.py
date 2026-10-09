"""
Aura AI EEG & Neuro-Behavioral Ingestion Module.
"""

from app.eeg.preprocessor import parse_edf_bytes, preprocess_signals, STANDARD_10_20_CHANNELS
from app.eeg.biomarkers import compute_biomarkers, load_benchmarks
from app.eeg.service import EEGService

__all__ = [
    "parse_edf_bytes",
    "preprocess_signals",
    "STANDARD_10_20_CHANNELS",
    "compute_biomarkers",
    "load_benchmarks",
    "EEGService",
]
