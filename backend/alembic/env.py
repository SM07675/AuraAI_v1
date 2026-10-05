"""
Alembic environment configuration.

Reads the database URL from application settings and configures
Alembic to use our SQLAlchemy models for auto-generation.
"""

from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

# Import our Base so Alembic can see all models
from app.db.base import Base

# Import all models to register them with Base.metadata
import app.models  # noqa: F401

from app.core.config import get_settings

# Alembic Config object
config = context.config

# Set up loggers from alembic.ini
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

import asyncio
from sqlalchemy.ext.asyncio import AsyncConnection
from app.db.engine import get_engine

# Set target metadata for auto-generation
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode."""
    settings = get_settings()
    url = settings.database_url
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        render_as_batch=True,  # Enables batch mode for SQLite compatibility
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    """Creates async connection using app engine and runs migrations."""
    connectable = get_engine()
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)


def run_migrations_online() -> None:
    """Run migrations in 'online' mode using async engine."""
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()

