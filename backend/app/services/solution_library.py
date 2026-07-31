"""
Solution Library Service.

Provides a curated, versioned bank of coping techniques and resources 
keyed by concern category. In a production system, this would be backed by Redis.
For now, we use a fast in-memory dictionary.
"""

from __future__ import annotations

import random
from typing import Any

from app.core.logging_config import get_logger

logger = get_logger(__name__)

_SOLUTION_BANK = {
    "work_stress": [
        "Take a 5-minute micro-break to step away from your desk and stretch.",
        "Write down the three most important tasks for tomorrow, then mentally 'clock out'.",
        "Try the 4-7-8 breathing technique before returning to your emails."
    ],
    "sleep": [
        "Try progressive muscle relaxation starting from your toes up to your head.",
        "Write down any racing thoughts on a 'worry journal' next to your bed to get them out of your head.",
        "Dim the lights 30 minutes before bed and avoid screens to signal to your brain it's time to rest."
    ],
    "relationships": [
        "Use 'I feel' statements instead of 'You always' to communicate your needs.",
        "Take a 20-minute timeout if a conversation is getting too heated.",
        "Try to focus on one positive interaction or shared memory today."
    ],
    "anxiety": [
        "Use the 5-4-3-2-1 grounding technique: name 5 things you can see, 4 you can touch, 3 you can hear, 2 you can smell, and 1 you can taste.",
        "Splash cold water on your face to trigger the mammalian dive reflex and calm your nervous system.",
        "Try 'box breathing': inhale for 4 seconds, hold for 4, exhale for 4, hold for 4."
    ],
    "loneliness": [
        "Reach out to one person today, even just with a small text or meme.",
        "Consider joining a local or online community centered around a hobby you enjoy.",
        "Spend some time at a coffee shop or park just to be around the ambient energy of others."
    ],
    "motivation": [
        "Break the task down into the absolute smallest possible step, like just opening the document.",
        "Set a timer for 5 minutes and commit to working only until it rings.",
        "Reflect on your 'why' — what is the deeper reason this task matters to you?"
    ],
    "general": [
        "Take a slow, deep breath in, and a long exhale out.",
        "Drink a glass of water and stretch your arms overhead.",
        "Acknowledge that it's okay to not be okay right now."
    ]
}

class SolutionLibrary:
    """Manages retrieval of curated coping strategies."""

    def __init__(self) -> None:
        pass

    async def get_solution(self, category: str | None) -> str | None:
        """Retrieve a random solution for the given category."""
        if not category or category not in _SOLUTION_BANK:
            category = "general"
            
        solutions = _SOLUTION_BANK.get(category, _SOLUTION_BANK["general"])
        
        # In a real app with Redis, we'd fetch and return based on user history to avoid repeating.
        # Here we just pick a random one.
        solution = random.choice(solutions)
        logger.debug(f"Retrieved solution for category '{category}': {solution}")
        return solution
