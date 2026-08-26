"""Test configuration and fixtures.

Uses SQLite (aiosqlite) for tests — no PostgreSQL or Redis required.
- JSONB columns are patched to JSON for SQLite compatibility.
- Redis is mocked in-memory so rate limiting works without a server.
- All fixtures use a single shared engine so tables exist when tests run.
"""

from __future__ import annotations

import asyncio
import os
from typing import AsyncGenerator

os.environ["ENVIRONMENT"] = "testing"

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy import JSON
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.db.base import Base
import app.models  # noqa: F401 — registers all ORM models with Base.metadata
from app.core.deps import get_db, get_redis

TEST_DB_PATH = "./test.db"
TEST_DATABASE_URL = f"sqlite+aiosqlite:///{TEST_DB_PATH}"


# ── JSONB → JSON patch for SQLite ─────────────────────────────────────────────

def _patch_jsonb_for_sqlite() -> None:
    """Replace all JSONB column types with JSON so SQLite can create the tables."""
    for table in Base.metadata.tables.values():
        for col in table.columns:
            if isinstance(col.type, JSONB):
                col.type = JSON()


# ── Fake in-memory Redis ──────────────────────────────────────────────────────

class FakeRedis:
    """Minimal in-memory Redis mock for testing."""

    def __init__(self) -> None:
        self._store: dict[str, str] = {}
        self._ttls: dict[str, int] = {}
        self._counters: dict[str, int] = {}

    async def incr(self, key: str) -> int:
        self._counters[key] = self._counters.get(key, 0) + 1
        return self._counters[key]

    async def expire(self, key: str, seconds: int) -> bool:
        self._ttls[key] = seconds
        return True

    async def ttl(self, key: str) -> int:
        return self._ttls.get(key, -1)

    async def get(self, key: str):
        return self._store.get(key)

    async def setex(self, key: str, seconds: int, value: str) -> bool:
        self._store[key] = str(value)
        self._ttls[key] = seconds
        return True

    async def delete(self, *keys: str) -> int:
        count = 0
        for key in keys:
            for store in (self._store, self._counters, self._ttls):
                if key in store:
                    del store[key]
                    count += 1
        return count

    async def ping(self) -> bool:
        return True

    async def close(self) -> None:
        pass

    def clear(self) -> None:
        self._store.clear()
        self._ttls.clear()
        self._counters.clear()


# ── Session-scoped event loop ─────────────────────────────────────────────────

@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


# ── Single shared engine + session factory ────────────────────────────────────

@pytest_asyncio.fixture(scope="session")
async def test_engine():
    """Create one SQLite engine for the whole test session and build all tables."""
    # Must patch before create_all
    _patch_jsonb_for_sqlite()

    engine = create_async_engine(
        TEST_DATABASE_URL,
        echo=False,
        connect_args={"check_same_thread": False},
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    yield engine

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()

    # Clean up the test DB file
    if os.path.exists(TEST_DB_PATH):
        os.remove(TEST_DB_PATH)


@pytest_asyncio.fixture(scope="session")
def test_session_factory(test_engine):
    """Return an async session factory bound to the test engine."""
    return async_sessionmaker(test_engine, expire_on_commit=False, autoflush=True)


@pytest.fixture(scope="session")
def fake_redis() -> FakeRedis:
    """Shared in-memory Redis instance for the entire test session."""
    return FakeRedis()


# ── Per-test fixtures ─────────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def db_session(test_session_factory) -> AsyncGenerator[AsyncSession, None]:
    """Provide a fresh session for each test. Rolls back after the test."""
    async with test_session_factory() as session:
        yield session
        await session.rollback()


@pytest_asyncio.fixture
async def client(db_session: AsyncSession, fake_redis: FakeRedis) -> AsyncGenerator[AsyncClient, None]:
    """HTTP test client with DB and Redis dependency overrides."""
    from app.main import app

    # Reset Redis counters between tests so rate limits don't bleed across
    fake_redis.clear()

    async def override_get_db():
        yield db_session

    async def override_get_redis():
        return fake_redis

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_redis] = override_get_redis

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as c:
        yield c

    app.dependency_overrides.clear()
