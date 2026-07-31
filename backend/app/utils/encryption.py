"""
Encryption utilities for sensitive health and emotion data at rest.
"""
import os
from typing import Any, Optional

from cryptography.fernet import Fernet
from sqlalchemy.types import TypeDecorator, Text


# For a real application, this key should be loaded securely from environment variables.
# Using a fallback just for demonstration if ENCRYPTION_KEY isn't set.
_ENCRYPTION_KEY = os.getenv("ENCRYPTION_KEY", Fernet.generate_key().decode("utf-8"))
_fernet = Fernet(_ENCRYPTION_KEY.encode("utf-8"))


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
        return _fernet.encrypt(value.encode("utf-8")).decode("utf-8")

    def process_result_value(self, value: Optional[str], dialect: Any) -> Optional[str]:
        if value is None:
            return None
        try:
            return _fernet.decrypt(value.encode("utf-8")).decode("utf-8")
        except Exception:
            # Fallback for old unencrypted data during migration, or log an error
            return value
