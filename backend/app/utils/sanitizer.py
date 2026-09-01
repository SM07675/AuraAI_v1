"""
Privacy sanitizer for sensitive credentials and personal data.

Automatically detects and redacts:
- Passwords and secret keys
- API keys (OpenAI, Anthropic, Gemini, generic tokens)
- Bearer tokens and JWTs
- Private cryptographic keys
- Credit card numbers
- Social security numbers (SSN)
"""

from __future__ import annotations

import re

_SENSITIVE_PATTERNS = [
    re.compile(r"(?i)(?:password|passwd|pwd)\s*(?:is|[:=])\s*['\"]?\S+['\"]?"),
    re.compile(r"(?i)(?:api[_-]?key|secret[_-]?key|access[_-]?token)\s*(?:is|[:=])\s*['\"]?[A-Za-z0-9_\-\.]{8,}['\"]?"),
    re.compile(r"(?i)bearer\s+[A-Za-z0-9\-\._~\+\/]+=*"),
    re.compile(r"-----BEGIN (?:RSA )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA )?PRIVATE KEY-----"),
    re.compile(r"\b(?:\d{4}[ -]?){3}\d{4}\b"),         # Credit Card format
    re.compile(r"\b\d{3}[ -]?\d{2}[ -]?\d{4}\b"),     # US SSN format
    re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,7}\b"),  # Raw Email in sensitive context
]


def sanitize_sensitive_data(text: str, mask_emails: bool = False) -> str:
    """Mask credentials and sensitive security tokens from text."""
    if not text:
        return text

    sanitized = text
    # Apply patterns (skip email mask unless requested)
    patterns = _SENSITIVE_PATTERNS if mask_emails else _SENSITIVE_PATTERNS[:-1]
    for pattern in patterns:
        sanitized = pattern.sub("[REDACTED_SENSITIVE_DATA]", sanitized)
    return sanitized
