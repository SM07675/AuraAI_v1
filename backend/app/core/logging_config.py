"""
Structured logging configuration using structlog.

Produces JSON-formatted logs in production and human-readable logs in development.
Automatically filters sensitive data (passwords, tokens, API keys) from log output.
"""

from __future__ import annotations

import logging
import re
import sys
from typing import Any

import structlog

# Patterns that indicate sensitive data — these values will be redacted
_SENSITIVE_PATTERNS = re.compile(
    r"(password|secret|token|api_key|apikey|authorization|cookie|credential|private_key)",
    re.IGNORECASE,
)

_REDACTED = "***REDACTED***"


def _redact_sensitive(
    _logger: Any, _method_name: str, event_dict: dict[str, Any]
) -> dict[str, Any]:
    """Processor that redacts sensitive values from log events."""
    for key in list(event_dict.keys()):
        if _SENSITIVE_PATTERNS.search(str(key)):
            event_dict[key] = _REDACTED
        elif isinstance(event_dict[key], dict):
            # Shallow redaction of nested dicts
            for nested_key in list(event_dict[key].keys()):
                if _SENSITIVE_PATTERNS.search(str(nested_key)):
                    event_dict[key][nested_key] = _REDACTED
    return event_dict


def setup_logging(log_level: str = "INFO", environment: str = "development") -> None:
    """Configure structured logging for the application.

    Args:
        log_level: Logging level (DEBUG, INFO, WARNING, ERROR, CRITICAL).
        environment: Current environment (development, production).
    """
    # Shared processors for all environments
    shared_processors: list[Any] = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.filter_by_level,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.UnicodeDecoder(),
        _redact_sensitive,
    ]

    if environment == "production":
        # JSON output for production (machine-parseable)
        renderer = structlog.processors.JSONRenderer()
    else:
        # Colored, human-readable output for development
        renderer = structlog.dev.ConsoleRenderer(colors=True)

    structlog.configure(
        processors=[
            *shared_processors,
            structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
        ],
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )

    # Configure the standard library root logger
    formatter = structlog.stdlib.ProcessorFormatter(
        processors=[
            structlog.stdlib.ProcessorFormatter.remove_processors_meta,
            renderer,
        ],
    )

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(formatter)

    root_logger = logging.getLogger()
    root_logger.handlers.clear()
    root_logger.addHandler(handler)
    root_logger.setLevel(getattr(logging, log_level.upper(), logging.INFO))

    # Quiet noisy third-party loggers
    for noisy_logger in ("uvicorn.access", "sqlalchemy.engine", "httpx", "httpcore"):
        logging.getLogger(noisy_logger).setLevel(logging.WARNING)


def get_logger(name: str | None = None) -> structlog.stdlib.BoundLogger:
    """Get a structured logger instance.

    Args:
        name: Logger name (typically __name__ of the calling module).

    Returns:
        A bound structlog logger.
    """
    return structlog.get_logger(name)
