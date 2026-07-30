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
        super().__init__(message, error_code="AUTHENTICATION_ERROR", status_code=401, **kwargs)


class AuthorizationError(AuraException):
    """Raised when user lacks permission for the requested action."""

    def __init__(self, message: str = "Insufficient permissions", **kwargs: Any) -> None:
        super().__init__(message, error_code="AUTHORIZATION_ERROR", status_code=403, **kwargs)


class TokenExpiredError(AuthenticationError):
    """Raised when a JWT token has expired."""

    def __init__(self, message: str = "Token has expired") -> None:
        super().__init__(message, details={"reason": "expired"})


class TokenInvalidError(AuthenticationError):
    """Raised when a JWT token is malformed or invalid."""

    def __init__(self, message: str = "Invalid token") -> None:
        super().__init__(message, details={"reason": "invalid"})


# ── User ─────────────────────────────────────────────────────────


class UserNotFoundError(AuraException):
    """Raised when a requested user does not exist."""

    def __init__(self, message: str = "User not found", **kwargs: Any) -> None:
        super().__init__(message, error_code="USER_NOT_FOUND", status_code=404, **kwargs)


class UserAlreadyExistsError(AuraException):
    """Raised when attempting to create a user that already exists."""

    def __init__(self, message: str = "User already exists", **kwargs: Any) -> None:
        super().__init__(message, error_code="USER_ALREADY_EXISTS", status_code=409, **kwargs)


# ── Validation ───────────────────────────────────────────────────


class ValidationError(AuraException):
    """Raised when input validation fails."""

    def __init__(self, message: str = "Validation error", **kwargs: Any) -> None:
        super().__init__(message, error_code="VALIDATION_ERROR", status_code=422, **kwargs)


# ── AI Provider ──────────────────────────────────────────────────


class AIProviderError(AuraException):
    """Raised when an AI provider fails."""

    def __init__(self, message: str = "AI provider error", **kwargs: Any) -> None:
        super().__init__(message, error_code="AI_PROVIDER_ERROR", status_code=502, **kwargs)


class AIProviderUnavailableError(AIProviderError):
    """Raised when no AI provider is available (all failed)."""

    def __init__(self, message: str = "All AI providers are unavailable", **kwargs: Any) -> None:
        super().__init__(message, error_code="AI_PROVIDER_UNAVAILABLE", status_code=503, **kwargs)


class AIProviderRateLimitError(AIProviderError):
    """Raised when an AI provider rate-limits the request."""

    def __init__(self, message: str = "AI provider rate limit exceeded", **kwargs: Any) -> None:
        super().__init__(message, error_code="AI_RATE_LIMITED", status_code=429, **kwargs)


# ── Rate Limiting ────────────────────────────────────────────────


class RateLimitExceededError(AuraException):
    """Raised when a client exceeds the rate limit."""

    def __init__(self, message: str = "Rate limit exceeded", **kwargs: Any) -> None:
        super().__init__(message, error_code="RATE_LIMIT_EXCEEDED", status_code=429, **kwargs)


# ── Database ─────────────────────────────────────────────────────


class DatabaseError(AuraException):
    """Raised when a database operation fails."""

    def __init__(self, message: str = "Database error", **kwargs: Any) -> None:
        super().__init__(message, error_code="DATABASE_ERROR", status_code=500, **kwargs)


# ── Conversation ─────────────────────────────────────────────────


class SessionNotFoundError(AuraException):
    """Raised when a conversation session is not found."""

    def __init__(self, message: str = "Session not found", **kwargs: Any) -> None:
        super().__init__(message, error_code="SESSION_NOT_FOUND", status_code=404, **kwargs)


class ConversationError(AuraException):
    """Raised when a conversation operation fails."""

    def __init__(self, message: str = "Conversation error", **kwargs: Any) -> None:
        super().__init__(message, error_code="CONVERSATION_ERROR", status_code=500, **kwargs)


# ── Emotion ──────────────────────────────────────────────────────


class EmotionAnalysisError(AuraException):
    """Raised when emotion analysis fails."""

    def __init__(self, message: str = "Emotion analysis failed", **kwargs: Any) -> None:
        super().__init__(message, error_code="EMOTION_ANALYSIS_ERROR", status_code=500, **kwargs)


# ── Memory ───────────────────────────────────────────────────────


class MemoryError(AuraException):
    """Raised when a memory operation fails."""

    def __init__(self, message: str = "Memory operation failed", **kwargs: Any) -> None:
        super().__init__(message, error_code="MEMORY_ERROR", status_code=500, **kwargs)
