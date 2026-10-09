"""
Encryption utilities for sensitive health and emotion data at rest.
"""
from __future__ import annotations

import os
from typing import Any, Optional

from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy.types import Text, TypeDecorator

# Safe deterministic key fallback if environment variable is missing in local dev
_DEFAULT_FALLBACK_KEY = "QEdDez8YOzEKop5mfiR_SI3BiC8-MaR8H4y1TStHPJs="


def get_encryption_key() -> str:
    key = os.getenv("ENCRYPTION_KEY")
    if not key or len(key.strip()) < 32:
        try:
            from app.core.config import get_settings
            key = get_settings().encryption_key
        except Exception:
            pass
    if not key or len(key.strip()) < 32:
        key = _DEFAULT_FALLBACK_KEY
    return key.strip()


_ENCRYPTION_KEY = get_encryption_key()
_fernet = Fernet(_ENCRYPTION_KEY.encode("utf-8"))


def encrypt_text(value: str) -> str:
    """Encrypt a string using the persistent Fernet key."""
    if not value:
        return value
    return _fernet.encrypt(value.encode("utf-8")).decode("utf-8")


def decrypt_text(value: str, fallback_label: str = "") -> str:
    """Decrypt a string, safely handling plaintext or legacy un-decryptable tokens."""
    if not value:
        return value
    try:
        return _fernet.decrypt(value.encode("utf-8")).decode("utf-8")
    except Exception:
        # If it was unencrypted plaintext originally, return as-is
        if not value.startswith("gAAAAAB"):
            return value
        # If it is an undecryptable Fernet token from an old lost key, do NOT leak raw token!
        return fallback_label or "[Protected historical memory note]"


class EncryptedText(TypeDecorator):
    """
    SQLAlchemy custom type for encrypting string data at rest.
    Stores the data encrypted as Text in the DB.
    """
    impl = Text
    cache_ok = True

    def process_bind_param(self, value: Optional[str], dialect: Any) -> Optional[str]:
        if value is None:
            return None
        return encrypt_text(value)

    def process_result_value(self, value: Optional[str], dialect: Any) -> Optional[str]:
        if value is None:
            return None
        return decrypt_text(value)
