"""
Viseme Sync.

Maps TTS WordBoundary events to mouth/pulse timing for the presence visual.
"""

from __future__ import annotations

from typing import Callable
from app.core.logging_config import get_logger

logger = get_logger(__name__)

class VisemeSyncManager:
    """
    Processes word boundaries and emits normalized viseme/pulse magnitudes
    to drive the visual orb.
    """
    
    def __init__(self, on_pulse: Callable[[float], None] | None = None):
        self._on_pulse = on_pulse
        
    def process_word_boundary(self, word: str, offset_ms: int, duration_ms: int) -> None:
        """
        Process a word boundary from TTS.
        For an abstract orb, we calculate a magnitude (0.0 to 1.0) based on
        vowel content or word length, rather than a literal mouth shape.
        """
        # Simple heuristic: longer words or words with more vowels create a larger pulse
        vowels = sum(1 for char in word.lower() if char in 'aeiou')
        magnitude = min(1.0, 0.4 + (vowels * 0.1))
        
        logger.debug(f"WordBoundary '{word}' -> pulse magnitude {magnitude:.2f}")
        
        if self._on_pulse:
            self._on_pulse(magnitude)
