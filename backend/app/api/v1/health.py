"""
Health check endpoints.

Provides quick and detailed health checks for all system components:
database, Redis, and AI providers.
"""

from __future__ import annotations

from typing import Any

import redis.asyncio as aioredis
from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.deps import get_db, get_redis

router = APIRouter(tags=["Health"])


async def _check_database(db: AsyncSession) -> dict[str, Any]:
    """Check PostgreSQL connectivity."""
    try:
        await db.execute(text("SELECT 1"))
        return {"status": "healthy", "engine": "postgresql"}
    except Exception as exc:
        return {"status": "unhealthy", "error": str(exc)}


async def _check_redis(redis: aioredis.Redis) -> dict[str, Any]:
    """Check Redis connectivity."""
    try:
        pong = await redis.ping()
        return {"status": "healthy" if pong else "unhealthy", "engine": "redis"}
    except Exception as exc:
        return {"status": "unhealthy", "error": str(exc)}


@router.get("/health", summary="Quick health check")
@router.get("/system/health", summary="Quick health check")
async def health_check() -> dict[str, Any]:
    """Lightweight health check — no external calls.

    Returns immediately with app status. Suitable for load balancer checks.
    """
    settings = get_settings()
    return {
        "status": "healthy",
        "app": settings.app_name,
        "version": settings.app_version,
        "environment": settings.environment,
    }


@router.get("/detailed", summary="Detailed component health check")
async def health_check_detailed(
    db: AsyncSession = Depends(get_db),
    redis: aioredis.Redis = Depends(get_redis),
) -> dict[str, Any]:
    """Detailed health check that probes all system components.

    Checks database, Redis, and reports AI provider configuration.
    May be slightly slower due to external calls.
    """
    settings = get_settings()

    db_status = await _check_database(db)
    redis_status = await _check_redis(redis)

    # Check which AI providers are configured
    ai_providers: dict[str, Any] = {}
    if settings.nvidia_nim_api_key:
        ai_providers["nvidia_nim"] = {"configured": True, "model": settings.nvidia_nim_model}
    else:
        ai_providers["nvidia_nim"] = {"configured": False}

    if settings.gemini_api_key:
        ai_providers["gemini"] = {"configured": True, "model": settings.gemini_model}
    else:
        ai_providers["gemini"] = {"configured": False}

    if settings.openai_api_key:
        ai_providers["openai"] = {"configured": True, "model": settings.openai_model}
    else:
        ai_providers["openai"] = {"configured": False}

    components = {
        "database": db_status,
        "redis": redis_status,
        "ai_providers": ai_providers,
    }

    all_healthy = all(
        c.get("status") == "healthy"
        for c in [db_status, redis_status]
    )

    configured_providers = [k for k, v in ai_providers.items() if v.get("configured")]

    overall = "healthy" if all_healthy and configured_providers else "degraded"

    return {
        "status": overall,
        "app": settings.app_name,
        "version": settings.app_version,
        "environment": settings.environment,
        "components": components,
        "ai_provider_priority": settings.ai_provider_priority_list,
        "configured_providers": configured_providers,
    }
