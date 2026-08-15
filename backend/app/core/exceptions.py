"""
Custom exception hierarchy for Aura AI.

All application-specific exceptions derive from AuraException.
This allows consistent error handling and API error responses.
"""

from __future__ import annotations

from typing import Any


class AuraException(Exception):
    """Base exception for all Aura AI errors."""

    def __init__(
        self,
        message: str = "An unexpected error occurred",
        *,
        error_code: str = "INTERNAL_ERROR",
        status_code: int = 500,
        details: dict[str, Any] | None = None,
    ) -> None:
        self.message = message
        self.error_code = error_code
        self.status_code = status_code
        self.details = details or {}
        super().__init__(self.message)


# ── Authentication & Authorization ───────────────────────────────


class AuthenticationError(AuraException):
    """Raised when authentication fails (invalid credentials, expired token)."""

    def __init__(self, message: str = "Authentication failed", **kwargs: Any) -> None:
        kwargs.setdefault("error_code", "AUTHENTICATION_ERROR")
        kwargs.setdefault("status_code", 401)
        super().__init__(message, **kwargs)


class AuthorizationError(AuraException):
    """Raised when user lacks permission for the requested action."""

    def __init__(self, message: str = "Insufficient permissions", **kwargs: Any) -> None:
        kwargs.setdefault("error_code", "AUTHORIZATION_ERROR")
        kwargs.setdefault("status_code", 403)
        super().__init__(message, **kwargs)


class TokenExpiredError(AuthenticationError):
    """Raised when a JWT token has expired."""

    def __init__(self, message: str = "Token has expired", **kwargs: Any) -> None:
        kwargs.setdefault("details", {"reason": "expired"})
        super().__init__(message, **kwargs)


class TokenInvalidError(AuthenticationError):
    """Raised when a JWT token is malformed or invalid."""

    def __init__(self, message: str = "Invalid token", **kwargs: Any) -> None:
        kwargs.setdefault("details", {"reason": "invalid"})
        super().__init__(message, **kwargs)


# ── User ─────────────────────────────────────────────────────────


class UserNotFoundError(AuraException):
    """Raised when a requested user does not exist."""

    def __init__(self, message: str = "User not found", **kwargs: Any) -> None:
        kwargs.setdefault("error_code", "USER_NOT_FOUND")
        kwargs.setdefault("status_code", 404)
        super().__init__(message, **kwargs)


class UserAlreadyExistsError(AuraException):
    """Raised when attempting to create a user that already exists."""

    def __init__(self, message: str = "User already exists", **kwargs: Any) -> None:
        kwargs.setdefault("error_code", "USER_ALREADY_EXISTS")
        kwargs.setdefault("status_code", 409)
        super().__init__(message, **kwargs)


# ── Validation ───────────────────────────────────────────────────


class ValidationError(AuraException):
    """Raised when input validation fails."""

    def __init__(self, message: str = "Validation error", **kwargs: Any) -> None:
        kwargs.setdefault("error_code", "VALIDATION_ERROR")
        kwargs.setdefault("status_code", 422)
        super().__init__(message, **kwargs)


# ── AI Provider ──────────────────────────────────────────────────


class AIProviderError(AuraException):
    """Raised when an AI provider fails."""

    def __init__(self, message: str = "AI provider error", **kwargs: Any) -> None:
        kwargs.setdefault("error_code", "AI_PROVIDER_ERROR")
        kwargs.setdefault("status_code", 502)
        super().__init__(message, **kwargs)


class AIProviderUnavailableError(AIProviderError):
    """Raised when no AI provider is available (all failed)."""

    def __init__(self, message: str = "All AI providers are unavailable", **kwargs: Any) -> None:
        kwargs.setdefault("error_code", "AI_PROVIDER_UNAVAILABLE")
        kwargs.setdefault("status_code", 503)
        super().__init__(message, **kwargs)


class AIProviderRateLimitError(AIProviderError):
    """Raised when an AI provider rate-limits the request."""

    def __init__(self, message: str = "AI provider rate limit exceeded", **kwargs: Any) -> None:
        kwargs.setdefault("error_code", "AI_RATE_LIMITED")
        kwargs.setdefault("status_code", 429)
        super().__init__(message, **kwargs)


# ── Rate Limiting ────────────────────────────────────────────────


class RateLimitExceededError(AuraException):
    """Raised when a client exceeds the rate limit."""

    def __init__(self, message: str = "Rate limit exceeded", **kwargs: Any) -> None:
        kwargs.setdefault("error_code", "RATE_LIMIT_EXCEEDED")
        kwargs.setdefault("status_code", 429)
        super().__init__(message, **kwargs)


# ── Database ─────────────────────────────────────────────────────


class DatabaseError(AuraException):
    """Raised when a database operation fails."""

    def __init__(self, message: str = "Database error", **kwargs: Any) -> None:
        kwargs.setdefault("error_code", "DATABASE_ERROR")
        kwargs.setdefault("status_code", 500)
        super().__init__(message, **kwargs)


# ── Conversation ─────────────────────────────────────────────────


class SessionNotFoundError(AuraException):
    """Raised when a conversation session is not found."""

    def __init__(self, message: str = "Session not found", **kwargs: Any) -> None:
        kwargs.setdefault("error_code", "SESSION_NOT_FOUND")
        kwargs.setdefault("status_code", 404)
        super().__init__(message, **kwargs)


class ConversationError(AuraException):
    """Raised when a conversation operation fails."""

    def __init__(self, message: str = "Conversation error", **kwargs: Any) -> None:
        kwargs.setdefault("error_code", "CONVERSATION_ERROR")
        kwargs.setdefault("status_code", 500)
        super().__init__(message, **kwargs)


# ── Emotion ──────────────────────────────────────────────────────


class EmotionAnalysisError(AuraException):
    """Raised when emotion analysis fails."""

    def __init__(self, message: str = "Emotion analysis failed", **kwargs: Any) -> None:
        kwargs.setdefault("error_code", "EMOTION_ANALYSIS_ERROR")
        kwargs.setdefault("status_code", 500)
        super().__init__(message, **kwargs)


# ── Memory ───────────────────────────────────────────────────────


class MemoryError(AuraException):
    """Raised when a memory operation fails."""

    def __init__(self, message: str = "Memory operation failed", **kwargs: Any) -> None:
        kwargs.setdefault("error_code", "MEMORY_ERROR")
        kwargs.setdefault("status_code", 500)
        super().__init__(message, **kwargs)
