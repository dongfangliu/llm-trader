"""Database configuration and models."""

from datetime import datetime
from typing import Optional
from sqlalchemy import Column, Integer, String, Float, DateTime, Date, Boolean, Text, UniqueConstraint
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

    class Config:
        env_file = ".env"


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
    openid = Column(String(255), unique=True, index=True, nullable=False)  # WeChat OpenID
    username = Column(String(100), nullable=True)
    email = Column(String(255), nullable=True)
    subscription_tier = Column(String(50), default="free")  # free, basic, premium
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Usage tracking
    daily_usage = Column(Integer, default=0)
    last_usage_date = Column(DateTime, default=datetime.utcnow)

    # User API Key (encrypted storage)
    api_key = Column(Text, nullable=True)


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
    kofi_subscription_id = Column(String(255), nullable=True)
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
    subscription = Column(String(50), default="free")  # free, basic, premium
    created_at = Column(DateTime, default=datetime.utcnow)


class DeviceSubscription(Base):
    """Current subscription tier bound to device id."""
    __tablename__ = "device_subscriptions"

    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(String(255), nullable=False, unique=True, index=True)
    subscription_tier = Column(String(50), default="free")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


async def init_db():
    """Initialize database tables."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
