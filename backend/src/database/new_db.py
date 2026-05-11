"""New async database setup using the refactored models."""

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker

from src.config import settings
from src.models.base import Base
from src.models import (  # noqa: F401 — import all to register with Base.metadata
    User, Device, AnalysisRequest, AnalysisHistory,
    AfdianOrder, MarketBar, SymbolName, SystemSetting,
    UsageLog, IpUsageLog, XBotPrediction, PushSubscription,
)

# ---------------------------------------------------------------------------
# Engine — same tuning as the legacy db.py
# ---------------------------------------------------------------------------
_engine_kwargs: dict = dict(
    echo=False,
    future=True,
)

# Connection-pool settings only apply to non-SQLite engines
if not settings.database_url.startswith("sqlite"):
    _engine_kwargs.update(
        pool_size=10,
        max_overflow=20,
        pool_pre_ping=True,
        pool_recycle=3600,
    )

engine = create_async_engine(settings.database_url, **_engine_kwargs)

async_session = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


# ---------------------------------------------------------------------------
# FastAPI dependency
# ---------------------------------------------------------------------------

async def get_db():
    """Yield an async database session (use as a FastAPI Depends)."""
    async with async_session() as session:
        yield session


# ---------------------------------------------------------------------------
# Table initialisation
# ---------------------------------------------------------------------------

async def init_db():
    """Create all tables defined in Base.metadata (idempotent)."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await _migrate_db()


async def _migrate_db():
    """Idempotently add new columns to existing tables (poor man's Alembic)."""
    async with engine.begin() as conn:
        for col_sql in [
            "ALTER TABLE xbot_predictions ADD COLUMN IF NOT EXISTS attempts INTEGER",
            "ALTER TABLE xbot_predictions ADD COLUMN IF NOT EXISTS met_confidence BOOLEAN",
        ]:
            await conn.execute(text(col_sql))
