"""User service for authentication and management."""

from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from src.database.db import User, Settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
settings = Settings()


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify password."""
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    """Hash password."""
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create JWT access token."""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.access_token_expire_minutes)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)
    return encoded_jwt


def decode_token(token: str) -> Optional[dict]:
    """Decode JWT token."""
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        return payload
    except JWTError:
        return None


# ===================== User Service =====================


async def get_user_by_openid(db: AsyncSession, openid: str) -> Optional[User]:
    """Get user by WeChat OpenID."""
    result = await db.execute(select(User).where(User.openid == openid))
    return result.scalars().first()


async def create_user(db: AsyncSession, openid: str, username: str = None) -> User:
    """Create new user."""
    user = User(openid=openid, username=username)
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def get_or_create_user(db: AsyncSession, openid: str, username: str = None) -> User:
    """Get or create user."""
    user = await get_user_by_openid(db, openid)
    if not user:
        user = await create_user(db, openid, username)
    return user


# ===================== Usage Tracking =====================


async def check_daily_limit(db: AsyncSession, user: User) -> tuple[bool, int]:
    """Check if user has reached daily limit.

    Returns:
        (has_limit, remaining): (是否还有次数, 剩余次数)
    """
    today = datetime.utcnow().date()
    last_date = user.last_usage_date.date() if user.last_usage_date else None

    # Reset if new day
    if last_date != today:
        user.daily_usage = 0
        user.last_usage_date = datetime.utcnow()
        await db.commit()

    # Get limit based on tier
    limits = {"free": 1, "basic": 5, "premium": 15}
    daily_limit = limits.get(user.subscription_tier, 1)

    remaining = daily_limit - user.daily_usage
    return remaining > 0, remaining


async def increment_usage(db: AsyncSession, user: User):
    """Increment daily usage count."""
    user.daily_usage += 1
    user.last_usage_date = datetime.utcnow()
    await db.commit()


async def get_user_info(db: AsyncSession, user_id: int) -> Optional[User]:
    """Get user by ID."""
    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalars().first()


async def update_subscription(db: AsyncSession, user_id: int, tier: str):
    """Update user subscription tier."""
    await db.execute(
        update(User).where(User.id == user_id).values(subscription_tier=tier)
    )
    await db.commit()
