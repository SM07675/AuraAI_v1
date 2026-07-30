"""
Response Validator — validates AI responses before delivery.

Checks for:
  - Empty or whitespace-only output
  - Repetition (response repeats recent history)
  - Hallucination (claiming human experiences, fabricating memories)
  - Broken formatting (raw JSON leaks, unclosed markdown)
  - Tone consistency (dramatic tone shift vs. emotion context)

On validation failure: retry with modified temperature, or return a
graceful fallback response. Empty responses NEVER reach the user.
"""

from __future__ import annotations

import re
from difflib import SequenceMatcher
from typing import Any

from app.core.logging_config import get_logger

logger = get_logger(__name__)

# Patterns that indicate hallucination or identity confusion
_HALLUCINATION_PATTERNS = [
    re.compile(r"\bI am (a |)human\b", re.IGNORECASE),
    re.compile(r"\bI have (feelings|emotions|a body|children|a family)\b", re.IGNORECASE),
    re.compile(r"\bwhen I was (a child|young|growing up)\b", re.IGNORECASE),
    re.compile(r"\bmy (wife|husband|spouse|partner|children|kids|parents|mother|father)\b", re.IGNORECASE),
    re.compile(r"\bI (feel|felt) (pain|hunger|thirst|tired|sleepy)\b", re.IGNORECASE),
    re.compile(r"\bI remember when I\b", re.IGNORECASE),
]

# Patterns indicating broken LLM output
_FORMAT_ISSUES = [
    re.compile(r'^\s*\{.*"role".*"content"', re.DOTALL),  # Raw JSON message leak
    re.compile(r"^\s*```\s*$", re.MULTILINE),  # Standalone code fence with no content
    re.compile(r"<\|.*?\|>"),  # Special token leak (e.g., <|endoftext|>)
    re.compile(r"\[INST\]|\[/INST\]"),  # Instruction token leak
    re.compile(r"<<SYS>>|<</SYS>>"),  # System prompt leak
]

# Fallback responses when all validation fails
_FALLBACK_RESPONSES = [
    "I'm sorry, I had trouble generating a response. Could you rephrase that?",
    "I need a moment — could you say that again?",
    "My response didn't come through properly. What were you asking about?",
]

# Repetition detection: how similar two strings need to be to count as repetition
_REPETITION_THRESHOLD = 0.85


class ValidationResult:
    """Result of validating an AI response."""

    def __init__(self) -> None:
        self.is_valid: bool = True
        self.issues: list[str] = []
        self.severity: str = "none"  # none, warning, error

    def add_issue(self, issue: str, severity: str = "warning") -> None:
        self.issues.append(issue)
        self.is_valid = False
        # Escalate severity
        if severity == "error" or self.severity == "error":
            self.severity = "error"
        else:
            self.severity = severity

    def __repr__(self) -> str:
        return f"<ValidationResult valid={self.is_valid} issues={len(self.issues)}>"


class ResponseValidator:
    """Validates AI responses before delivery to the user.

    Usage::

        validator = ResponseValidator()
        result = validator.validate(
            response="AI generated text...",
            recent_history=[{"role": "assistant", "content": "..."}],
            emotion_context={"fused_emotion": "sad"},
        )

        if not result.is_valid:
            if result.severity == "error":
                response = validator.get_fallback_response()
            else:
                # Warnings — deliver with logging
                pass
    """

    _fallback_index = 0

    def validate(
        self,
        response: str,
        recent_history: list[dict[str, str]] | None = None,
        emotion_context: dict[str, Any] | None = None,
    ) -> ValidationResult:
        """Run all validation checks on the response.

        Args:
            response: The raw AI-generated response text.
            recent_history: Recent conversation turns for repetition detection.
            emotion_context: Current emotion context for tone checking.

        Returns:
            ValidationResult with is_valid flag and any issues found.
        """
        result = ValidationResult()

        # 1. Empty check
        self._check_empty(response, result)
        if not result.is_valid:
            return result  # Hard fail — no point checking further

        # 2. Hallucination check
        self._check_hallucination(response, result)

        # 3. Format check
        self._check_format(response, result)

        # 4. Repetition check
        if recent_history:
            self._check_repetition(response, recent_history, result)

        # 5. Tone consistency check
        if emotion_context:
            self._check_tone_consistency(response, emotion_context, result)

        if result.issues:
            logger.warning(
                "Response validation issues",
                issues=result.issues,
                severity=result.severity,
                response_preview=response[:100],
            )

        return result

    def _check_empty(self, response: str, result: ValidationResult) -> None:
        """Check for empty or whitespace-only responses."""
        if not response or not response.strip():
            result.add_issue("Empty response", severity="error")

    def _check_hallucination(self, response: str, result: ValidationResult) -> None:
        """Check for AI claiming human experiences."""
        for pattern in _HALLUCINATION_PATTERNS:
            match = pattern.search(response)
            if match:
                result.add_issue(
                    f"Hallucination detected: '{match.group()}'",
                    severity="warning",
                )
                break  # One warning is enough

    def _check_format(self, response: str, result: ValidationResult) -> None:
        """Check for broken formatting or leaked internals."""
        for pattern in _FORMAT_ISSUES:
            if pattern.search(response):
                result.add_issue(
                    "Broken format or internal token leak detected",
                    severity="error",
                )
                return

    def _check_repetition(
        self,
        response: str,
        recent_history: list[dict[str, str]],
        result: ValidationResult,
    ) -> None:
        """Check if response is too similar to recent assistant responses."""
        response_lower = response.lower().strip()

        for turn in reversed(recent_history[-6:]):
            if turn.get("role") != "assistant":
                continue
            prev = (turn.get("content") or "").lower().strip()
            if not prev:
                continue

            similarity = SequenceMatcher(None, response_lower, prev).ratio()
            if similarity > _REPETITION_THRESHOLD:
                result.add_issue(
                    f"Response is {similarity:.0%} similar to a recent response",
                    severity="warning",
                )
                break

    def _check_tone_consistency(
        self,
        response: str,
        emotion_context: dict[str, Any],
        result: ValidationResult,
    ) -> None:
        """Check for jarring tone mismatches.

        Example: user is sad/anxious but AI response is overly cheerful
        with exclamation marks and celebration emojis.
        """
        fused = (emotion_context.get("fused_emotion") or "neutral").lower()
        negative_emotions = {"sad", "anxious", "angry", "disgusted", "fearful"}

        if fused in negative_emotions:
            # Count excessive enthusiasm markers
            exclamation_count = response.count("!")
            celebration_words = sum(
                1 for word in ["amazing", "awesome", "fantastic", "wonderful", "great"]
                if word in response.lower()
            )
            if exclamation_count > 3 or celebration_words > 2:
                result.add_issue(
                    f"Tone mismatch: user emotion '{fused}' but response is overly cheerful",
                    severity="warning",
                )

    def get_fallback_response(self) -> str:
        """Return a graceful fallback response when validation fails hard."""
        response = _FALLBACK_RESPONSES[ResponseValidator._fallback_index % len(_FALLBACK_RESPONSES)]
        ResponseValidator._fallback_index += 1
        return response

    def filter_stream_token(self, token: str) -> str:
        """Lightweight token-level filter for streaming responses.

        Removes common LLM artifacts that appear mid-stream.
        """
        # Remove self-referential AI phrases
        replacements = [
            ("As an AI language model, ", ""),
            ("As an AI, ", ""),
            ("As a large language model, ", ""),
            ("I don't have personal experiences, but ", ""),
            ("I'm just an AI, ", ""),
        ]
        for old, new in replacements:
            token = token.replace(old, new)

        # Remove leaked special tokens
        token = re.sub(r"<\|.*?\|>", "", token)
        token = re.sub(r"\[INST\]|\[/INST\]", "", token)

        return token
