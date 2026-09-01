"""Tests for privacy sanitizer utility."""

from __future__ import annotations

import pytest
from app.utils.sanitizer import sanitize_sensitive_data


def test_sanitize_passwords() -> None:
    text = "My password is superSecret123! Please don't share."
    sanitized = sanitize_sensitive_data(text)
    assert "superSecret123!" not in sanitized
    assert "[REDACTED_SENSITIVE_DATA]" in sanitized


def test_sanitize_api_keys() -> None:
    text = "Here is my api_key='sk-proj-94859034850934850934850943850934' for NVIDIA"
    sanitized = sanitize_sensitive_data(text)
    assert "sk-proj-94859034850934850934850943850934" not in sanitized
    assert "[REDACTED_SENSITIVE_DATA]" in sanitized


def test_sanitize_credit_cards() -> None:
    text = "Payment card: 4532-1234-5678-9012 expiry 12/28"
    sanitized = sanitize_sensitive_data(text)
    assert "4532-1234-5678-9012" not in sanitized
    assert "[REDACTED_SENSITIVE_DATA]" in sanitized


def test_sanitize_clean_text() -> None:
    text = "I am feeling happy and preparing for my Python placement interview."
    sanitized = sanitize_sensitive_data(text)
    assert sanitized == text
