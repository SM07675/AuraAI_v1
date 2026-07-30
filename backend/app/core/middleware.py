"""
FastAPI middleware for request logging, timing, CORS, and request ID tracking.

Every request gets a unique request ID for tracing through logs.
Response times are measured and logged automatically.
"""

from __future__ import annotations

import time
import uuid
from typing import Callable

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

import structlog

from app.core.config import get_settings
from app.core.exceptions import AuraException
from app.core.logging_config import get_logger

logger = get_logger(__name__)


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Middleware that logs every request with timing and request ID."""

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        """Process request with logging and timing.

        Adds a unique request ID to each request, measures response time,
        and logs both the start and completion of each request.
        """
        # Generate unique request ID
        request_id = str(uuid.uuid4())[:8]
        request.state.request_id = request_id

        # Bind request context to structlog
        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(
            request_id=request_id,
            method=request.method,
            path=str(request.url.path),
        )

        start_time = time.perf_counter()

        # Log request start (debug level to avoid noise)
        logger.debug(
            "Request started",
            client=request.client.host if request.client else "unknown",
            query=str(request.url.query) if request.url.query else None,
        )

        try:
            response = await call_next(request)
        except Exception as exc:
            # Log unhandled errors
            duration_ms = round((time.perf_counter() - start_time) * 1000, 2)
            logger.error(
                "Request failed with unhandled exception",
                error=str(exc),
                error_type=type(exc).__name__,
                duration_ms=duration_ms,
            )
            raise

        # Calculate response time
        duration_ms = round((time.perf_counter() - start_time) * 1000, 2)

        # Add custom headers
        response.headers["X-Request-ID"] = request_id
        response.headers["X-Response-Time"] = f"{duration_ms}ms"

        # Log at appropriate level based on status code
        log_fn = logger.info if response.status_code < 400 else logger.warning
        if response.status_code >= 500:
            log_fn = logger.error

        log_fn(
            "Request completed",
            status=response.status_code,
            duration_ms=duration_ms,
        )

        return response


def setup_exception_handlers(app: FastAPI) -> None:
    """Register global exception handlers for consistent error responses."""

    @app.exception_handler(AuraException)
    async def aura_exception_handler(_request: Request, exc: AuraException) -> JSONResponse:
        """Handle all AuraException subclasses with structured error responses."""
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "error": {
                    "message": exc.message,
                    "code": exc.error_code,
                    "details": exc.details,
                },
            },
        )

    @app.exception_handler(Exception)
    async def generic_exception_handler(_request: Request, exc: Exception) -> JSONResponse:
        """Handle unexpected exceptions with a generic 500 response."""
        logger.error(
            "Unhandled exception",
            error=str(exc),
            error_type=type(exc).__name__,
        )
        return JSONResponse(
            status_code=500,
            content={
                "error": {
                    "message": "An unexpected error occurred",
                    "code": "INTERNAL_ERROR",
                    "details": {},
                },
            },
        )


def setup_cors(app: FastAPI) -> None:
    """Configure CORS middleware."""
    settings = get_settings()
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["X-Request-ID", "X-Response-Time"],
    )


def setup_middleware(app: FastAPI) -> None:
    """Register all middleware in correct order.

    Middleware is executed in reverse registration order (last added = first executed).
    """
    # CORS must be outermost
    setup_cors(app)

    # Request logging (runs after CORS)
    app.add_middleware(RequestLoggingMiddleware)

    # Exception handlers
    setup_exception_handlers(app)
