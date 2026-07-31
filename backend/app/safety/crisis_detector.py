"""
Crisis Detection module for the Safety Layer.

Scans raw user input for crisis signals before the main LLM call.
Independent of the AI provider, ensuring safety checks always run.
"""

import re
from typing import Tuple

# A basic heuristic for demonstration. In production, this would be a robust list
# or a fast local NLP classifier (like a fine-tuned DistilBERT).
CRISIS_KEYWORDS = [
    r"\b(suicide|suicidal)\b",
    r"\b(kill myself|end my life|end it all)\b",
    r"\b(want to die|wish i was dead)\b",
    r"\b(hurt myself|cut myself)\b",
    r"\b(no point in living)\b",
]

CRISIS_REGEX = re.compile("|".join(CRISIS_KEYWORDS), re.IGNORECASE)

class CrisisDetector:
    """Detects crisis intent in raw text."""

    def __init__(self):
        self._stream_buffer = ""

    def check_for_crisis(self, text: str) -> Tuple[bool, str]:
        """
        Check if the text contains a crisis signal.
        Returns (is_crisis, trigger_reason).
        """
        if not text:
            return False, ""
        
        match = CRISIS_REGEX.search(text)
        if match:
            return True, f"Keyword match: '{match.group(0)}'"
        
        return False, ""

    def check_stream(self, partial_text: str) -> Tuple[bool, str]:
        """
        Accumulates partial transcripts and checks for crisis signals mid-sentence.
        In Live Mode, this is called continuously.
        """
        self._stream_buffer += " " + partial_text
        is_crisis, reason = self.check_for_crisis(self._stream_buffer)
        
        if is_crisis:
            # Reset buffer on flag so we don't keep firing if they keep talking
            self.reset_stream()
            
        return is_crisis, reason

    def reset_stream(self) -> None:
        """Resets the streaming buffer. Called on end of utterance or barge-in."""
        self._stream_buffer = ""
