"""
Aura AI 2.0 — FastAPI Application Factory.

This module creates and configures the FastAPI application.
All routers, middleware, event handlers, and exception handlers
are registered here.
"""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.openapi.utils import get_openapi

from app.core.config import get_settings
from app.core.deps import close_redis
from app.core.logging_config import setup_logging
from app.core.middleware import setup_middleware
from app.db.engine import dispose_engine

# API routers
# API routers
from app.api.v1.auth import router as auth_router
from app.api.v1.users import router as users_router
from app.api.v1.chat import router as chat_router
from app.api.v1.ws import router as ws_router
from app.api.v1.voice_ws import router as voice_ws_router
from app.api.v1.memory import router as memory_router
from app.api.v1.health import router as health_router
from app.api.v1.metrics import router as metrics_router
from app.api.v1.debug import router as debug_router
from app.api.v1.emotion_ws import router as emotion_ws_router
from app.api.v1.dashboard import router as dashboard_router
from app.api.v1.analytics import router as analytics_router
from app.api.v1.music import router as music_router
from app.api.v1.tts import router as tts_router
from app.api.v1.behavioral import router as behavioral_router
from app.api.v1.feedback import router as feedback_router


settings = get_settings()

# Configure logging before anything else
setup_logging(log_level=settings.log_level, environment=settings.environment)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler.

    Startup: initialize connections, run migrations.
    Shutdown: close connections gracefully.
    """
    from app.core.logging_config import get_logger
    logger = get_logger("startup")

    # ── Startup ──────────────────────────────────────────────────
    logger.info(
        "Aura AI 2.0 starting",
        version=settings.app_version,
        environment=settings.environment,
    )

    # Initialize database schema and fallback
    from app.db.engine import init_db_schema
    try:
        await init_db_schema()
    except Exception as exc:
        logger.warning("Database schema init warning", error=str(exc))

    logger.info(
        "Aura AI 2.0 ready",
        docs=f"http://{settings.backend_host}:{settings.backend_port}/docs",
    )

    yield

    # ── Shutdown ─────────────────────────────────────────────────
    logger.info("Aura AI 2.0 shutting down")
    await dispose_engine()
    await close_redis()
    logger.info("Shutdown complete")


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    app = FastAPI(
        title="Aura AI 2.0",
        description=(
            "Production-grade conversational AI backend.\n\n"
            "Features: Multi-provider AI Gateway, JWT auth, WebSocket streaming, "
            "emotion analysis, memory system, and session management."
        ),
        version=settings.app_version,
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_url="/openapi.json",
        lifespan=lifespan,
    )

    # Register middleware (CORS, logging, exception handlers)
    setup_middleware(app)

    # Register API routers under /api, /api/v1 and root health check
    app.include_router(health_router)
    app.include_router(health_router, prefix="/api")
    api_prefix = "/api/v1"
    app.include_router(health_router, prefix=api_prefix)
    app.include_router(auth_router, prefix=api_prefix)
    app.include_router(users_router, prefix=api_prefix)
    app.include_router(chat_router, prefix=api_prefix)
    app.include_router(ws_router, prefix=api_prefix)
    app.include_router(voice_ws_router, prefix=api_prefix)
    app.include_router(memory_router, prefix=api_prefix)
    app.include_router(metrics_router, prefix=api_prefix)
    app.include_router(debug_router, prefix=api_prefix)
    app.include_router(emotion_ws_router, prefix=api_prefix)
    app.include_router(dashboard_router, prefix=api_prefix)
    app.include_router(analytics_router, prefix=api_prefix)
    app.include_router(music_router, prefix=api_prefix)
    app.include_router(tts_router, prefix=api_prefix)
    app.include_router(behavioral_router, prefix=api_prefix)
    app.include_router(feedback_router, prefix=api_prefix)

    return app


# Application instance
app = create_app()
