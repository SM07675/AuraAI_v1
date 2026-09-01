"""
Async SQLAlchemy engine and session factory with automatic SQLite fallback.

Provides a connection pool backed by asyncpg for PostgreSQL, with an automatic
in-memory / local SQLite fallback (aiosqlite) when PostgreSQL is not running.
"""

from __future__ import annotations

import asyncio
from pathlib import Path
from typing import AsyncGenerator

from sqlalchemy import JSON, event, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.config import get_settings
from app.core.logging_config import get_logger

logger = get_logger(__name__)
settings = get_settings()

# Enable SQLite to compile PostgreSQL JSONB columns as standard JSON
@compiles(JSONB, "sqlite")
def _compile_jsonb_sqlite(type_, compiler, **kw):
    return compiler.visit_JSON(type_, **kw)


_engine: AsyncEngine | None = None
_session_factory: async_sessionmaker[AsyncSession] | None = None
_is_sqlite_fallback: bool = False


def _get_sqlite_url() -> str:
    curr = Path(__file__).resolve().parent
    for p in [curr, *curr.parents]:
        if (p / "backend").exists() or (p / ".env").exists():
            return f"sqlite+aiosqlite:///{p / 'aura_local.db'}"
    return "sqlite+aiosqlite:///aura_local.db"


def get_engine() -> AsyncEngine:
    global _engine, _is_sqlite_fallback
    if _engine is None:
        try:
            # First attempt primary database connection configured in settings
            _engine = create_async_engine(
                settings.database_url,
                echo=False,
                pool_size=10,
                max_overflow=5,
                pool_timeout=5,
                pool_pre_ping=True,
            )
        except Exception as exc:
            logger.warning("Primary database engine creation failed, using SQLite fallback", error=str(exc))
            _is_sqlite_fallback = True
            _engine = create_async_engine(
                _get_sqlite_url(),
                echo=False,
            )
    return _engine


def get_session_factory() -> async_sessionmaker[AsyncSession]:
    global _session_factory
    if _session_factory is None:
        eng = get_engine()
        _session_factory = async_sessionmaker(
            eng,
            class_=AsyncSession,
            expire_on_commit=False,
        )
    return _session_factory


async def init_db_schema() -> None:
    """Ensure database schema is created on startup (especially for SQLite fallback)."""
    global _engine, _session_factory, _is_sqlite_fallback
    eng = get_engine()
    
    # Test connection
    try:
        async with eng.connect() as conn:
            await asyncio.wait_for(conn.execute(text("SELECT 1")), timeout=3.0)
    except Exception as exc:
        logger.warning("PostgreSQL unreachable, switching engine to local SQLite", error=str(exc))
        _is_sqlite_fallback = True
        await eng.dispose()
        _engine = create_async_engine(_get_sqlite_url(), echo=False)
        _session_factory = async_sessionmaker(
            _engine,
            class_=AsyncSession,
            expire_on_commit=False,
        )

    # Ensure all tables exist in database (PostgreSQL and SQLite)
    from app.db.base import Base
    import app.models  # load all models
    try:
        async with _engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        logger.info("Database schema initialized and verified", is_sqlite=_is_sqlite_fallback)
    except Exception as exc:
        logger.warning("Database schema auto-creation warning", error=str(exc))


class _AsyncSessionFactoryProxy:
    """Proxy so async_session_factory() calls get_session_factory() dynamically."""
    def __call__(self, *args, **kwargs) -> AsyncSession:
        factory = get_session_factory()
        return factory(*args, **kwargs)


async_session_factory = _AsyncSessionFactoryProxy()
engine = get_engine()


async def dispose_engine() -> None:
    """Dispose the engine and close all connections."""
    global _engine, _session_factory
    if _engine is not None:
        await _engine.dispose()
        _engine = None
        _session_factory = None
