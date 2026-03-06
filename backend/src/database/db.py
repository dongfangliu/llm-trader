"""Database configuration and models."""

from datetime import datetime
from typing import Optional
from sqlalchemy import Column, Integer, BigInteger, String, Float, DateTime, Date, Boolean, Text, UniqueConstraint, text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base

from pydantic_settings import BaseSettings

Base = declarative_base()


class Settings(BaseSettings):
    """Application settings."""
    database_url: str = "sqlite+aiosqlite:///./data/trader.db"
    secret_key: str = "change-me-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 7  # 7 days

    # LLM configuration (set by operator, never exposed to frontend)
    llm_provider: str = "openai"
    llm_api_key: str = ""
    llm_base_url: str = "https://api.deepseek.com/v1"
    llm_model: str = "deepseek-chat"
    llm_max_tokens: int = 1500
    llm_temperature: float = 0.7

    # Security
    allowed_origins: str = "*"  # comma-separated list, e.g. "https://example.com,https://www.example.com"
    afdian_webhook_token: str = ""  # appended to webhook URL as ?token=xxx for verification
    admin_token: str = ""

    # 爱发电 plan IDs (from ifdian.net dashboard) and subscription links
    afdian_basic_plan_id: str = ""
    afdian_premium_plan_id: str = ""
    afdian_basic_link: str = ""
    afdian_premium_link: str = ""

    # 爱发电 Open API credentials (for active order query, no webhook needed)
    afdian_user_id: str = ""   # your creator user_id from afdian.net/dashboard/dev
    afdian_api_token: str = "" # API token from afdian.net/dashboard/dev

    # App branding (can be overridden via APP_NAME env var)
    app_name: str = "财财技术洞见"

    # Email — Resend (https://resend.com)
    resend_api_key: str = ""        # RESEND_API_KEY env var
    email_from: str = ""            # e.g. "财财技术洞见 <noreply@yourdomain.com>"

    # Base URL of the frontend app (used to build verification links)
    app_base_url: str = "http://localhost:3000"

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()


# Database engine
engine = create_async_engine(
    settings.database_url,
    echo=False,
    future=True,
)

async_session = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def get_db():
    """Dependency for getting database session."""
    async with async_session() as session:
        yield session


# ===================== Models =====================


class User(Base):
    """User model."""
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    openid = Column(String(255), unique=True, index=True, nullable=True)  # legacy / guest device id
    username = Column(String(100), nullable=True)
    email = Column(String(255), unique=True, index=True, nullable=True)
    hashed_password = Column(String(255), nullable=True)
    subscription_tier = Column(String(50), default="free")  # free, basic, premium
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Usage tracking
    daily_usage = Column(Integer, default=0)
    last_usage_date = Column(DateTime, default=datetime.utcnow)

    # User API Key (encrypted storage)
    api_key = Column(Text, nullable=True)

    # Email verification
    email_verified = Column(Boolean, default=False)
    email_verification_token = Column(String(255), nullable=True, index=True)
    email_verification_expires = Column(DateTime, nullable=True)

    # Invite & bonus
    invite_code = Column(String(16), nullable=True, unique=True, index=True)
    bonus_quota = Column(Integer, default=0)
    used_invite_code = Column(String(16), nullable=True)  # non-null = already redeemed once

    # Position analysis tracking (basic tier daily limit)
    daily_position_usage = Column(Integer, default=0)
    last_position_date = Column(DateTime, nullable=True)


class AnalysisRequest(Base):
    """Analysis request log."""
    __tablename__ = "analysis_requests"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, index=True)
    symbol = Column(String(50), nullable=False)
    market = Column(String(10), nullable=False)  # a, hk, us, futures
    period = Column(String(20), nullable=False)
    result = Column(Text, nullable=True)
    status = Column(String(20), default="pending")  # pending, completed, failed
    created_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)
    error_message = Column(Text, nullable=True)


class AnalysisHistory(Base):
    """Persisted analysis history for user/device result recall."""
    __tablename__ = "analysis_histories"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=True, index=True)
    device_id = Column(String(255), nullable=True, index=True)
    symbol = Column(String(50), nullable=False, index=True)
    market = Column(String(10), nullable=False)  # a, hk, us, futures
    period = Column(String(20), nullable=False)
    result = Column(Text, nullable=False)
    analysis_date = Column(Date, nullable=False, index=True)
    analyzed_at = Column(DateTime, default=datetime.utcnow, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class Subscription(Base):
    """Subscription record."""
    __tablename__ = "subscriptions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, index=True)
    tier = Column(String(50), nullable=False)  # basic, premium
    afdian_subscription_id = Column(String(255), nullable=True)
    start_date = Column(DateTime, default=datetime.utcnow)
    end_date = Column(DateTime, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class UsageLog(Base):
    """Device usage log (privacy-first, only stores device id and counters)."""
    __tablename__ = "usage_logs"
    __table_args__ = (UniqueConstraint("device_id", "date", name="uq_usage_logs_device_date"),)

    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(String(255), nullable=False, index=True)
    date = Column(Date, nullable=False, index=True)
    count = Column(Integer, default=0)
    position_count = Column(Integer, default=0)
    subscription = Column(String(50), default="free")  # free, basic, premium
    created_at = Column(DateTime, default=datetime.utcnow)


class DeviceSubscription(Base):
    """Current subscription tier bound to device id."""
    __tablename__ = "device_subscriptions"

    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(String(255), nullable=False, unique=True, index=True)
    subscription_tier = Column(String(50), default="free")
    expires_at = Column(DateTime, nullable=True)  # None = free tier; set on paid activation
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class IpUsageLog(Base):
    """IP-based daily usage counter — prevents guest quota reset via localStorage clearing."""
    __tablename__ = "ip_usage_logs"
    __table_args__ = (UniqueConstraint("ip_address", "date", name="uq_ip_usage_logs_ip_date"),)

    id = Column(Integer, primary_key=True, index=True)
    ip_address = Column(String(64), nullable=False, index=True)
    date = Column(Date, nullable=False, index=True)
    count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)


class AfdianOrder(Base):
    """Tracks processed Afdian orders to prevent double-activation."""
    __tablename__ = "afdian_orders"

    id = Column(Integer, primary_key=True, index=True)
    out_trade_no = Column(String(255), nullable=False, unique=True, index=True)
    device_id = Column(String(255), nullable=False, index=True)
    plan_id = Column(String(255), nullable=True)
    tier = Column(String(50), nullable=False)
    total_amount = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class MarketBar(Base):
    """OHLCV bar cached from external data sources.

    The ``bar_ts`` attribute maps to the DB column named ``datetime`` so that
    SELECT results convert cleanly to the same DataFrame schema used throughout
    the codebase (datetime, open, high, low, close, volume).
    """

    __tablename__ = "market_bars"
    __table_args__ = (
        UniqueConstraint("symbol", "market", "period", "datetime", name="uq_market_bars_key"),
    )

    id = Column(Integer, primary_key=True, index=True)
    symbol = Column(String(50), nullable=False, index=True)
    market = Column(String(10), nullable=False, index=True)   # a, hk, us, futures
    period = Column(String(20), nullable=False, index=True)   # daily, 1, 5, 15, 30, 60
    # nanosecond int64 timestamp — DB column is "datetime" to match DataFrame convention
    bar_ts = Column("datetime", BigInteger, nullable=False, index=True)
    open = Column(Float, nullable=False)
    high = Column(Float, nullable=False)
    low = Column(Float, nullable=False)
    close = Column(Float, nullable=False)
    volume = Column(Float, nullable=True, default=0.0)
    fetched_at = Column(DateTime, default=datetime.utcnow)


class SymbolName(Base):
    """Persistent symbol → display-name mapping.

    Populated by name_service bulk refreshes and on-demand analyze calls so that
    names survive server restarts and are available even before AKShare bulk
    fetch completes.
    """

    __tablename__ = "symbol_names"

    symbol = Column(String(50), primary_key=True)
    market = Column(String(10), primary_key=True)
    name = Column(String(255), nullable=False, default="")
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class SystemSetting(Base):
    """Runtime-configurable system settings stored as JSON blobs, one row per section."""
    __tablename__ = "system_settings"

    key = Column(String(128), primary_key=True)
    value = Column(Text, nullable=False, default="{}")
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


async def init_db():
    """Initialize database tables."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await _migrate_db()


async def _migrate_db():
    """Add new columns to existing databases without Alembic."""
    async with engine.begin() as conn:
        try:
            await conn.execute(text(
                "ALTER TABLE device_subscriptions ADD COLUMN expires_at DATETIME"
            ))
        except Exception:
            pass  # column already exists
        for col_sql in [
            "ALTER TABLE users ADD COLUMN email_verified BOOLEAN DEFAULT 0",
            "ALTER TABLE users ADD COLUMN email_verification_token VARCHAR(255)",
            "ALTER TABLE users ADD COLUMN email_verification_expires DATETIME",
            "ALTER TABLE users ADD COLUMN invite_code VARCHAR(16)",
            "ALTER TABLE users ADD COLUMN bonus_quota INTEGER DEFAULT 0",
            "ALTER TABLE users ADD COLUMN used_invite_code VARCHAR(16)",
            "ALTER TABLE users ADD COLUMN daily_position_usage INTEGER DEFAULT 0",
            "ALTER TABLE users ADD COLUMN last_position_date DATETIME",
            "ALTER TABLE usage_logs ADD COLUMN position_count INTEGER DEFAULT 0",
        ]:
            try:
                await conn.execute(text(col_sql))
            except Exception:
                pass  # column already exists
