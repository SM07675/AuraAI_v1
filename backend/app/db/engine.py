"""
Async SQLAlchemy engine and session factory.

Provides a connection pool backed by asyncpg for high-performance
async database operations. Sessions are created via the factory
and managed by FastAPI's dependency injection system.
"""

from __future__ import annotations

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.config import get_settings

settings = get_settings()

# Create the async engine with connection pooling
engine = create_async_engine(
    settings.database_url,
    echo=settings.debug and settings.environment == "development",
    pool_size=20,
    max_overflow=10,
    pool_timeout=30,
    pool_recycle=1800,
    pool_pre_ping=True,
)

# Session factory — produces AsyncSession instances
async_session_factory = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def dispose_engine() -> None:
    """Dispose the engine and close all connections.

    Call during application shutdown.
    """
    await engine.dispose()
