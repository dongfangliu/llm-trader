"""User service for authentication and management."""

import secrets
import random
import string
from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from sqlalchemy import select, update, or_, func
from sqlalchemy.ext.asyncio import AsyncSession

import bcrypt as _bcrypt

from src.database.db import User, Settings

settings = Settings()


def _generate_invite_code() -> str:
    """Generate a unique 8-character alphanumeric invite code."""
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=8))


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify password."""
    return _bcrypt.checkpw(plain_password.encode(), hashed_password.encode())


def get_password_hash(password: str) -> str:
    """Hash password."""
    return _bcrypt.hashpw(password.encode(), _bcrypt.gensalt()).decode()


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


async def get_user_by_email(db: AsyncSession, email: str) -> Optional[User]:
    """Get user by email address."""
    result = await db.execute(select(User).where(User.email == email.lower().strip()))
    return result.scalars().first()


async def register_user(db: AsyncSession, email: str, password: str, username: str = None) -> User:
    """Register a new user with email and password. Email is unverified until confirmed."""
    hashed = get_password_hash(password)
    token = secrets.token_urlsafe(32)
    expires = datetime.utcnow() + timedelta(hours=24)
    user = User(
        email=email.lower().strip(),
        hashed_password=hashed,
        username=username or email.split("@")[0],
        email_verified=False,
        email_verification_token=token,
        email_verification_expires=expires,
        invite_code=_generate_invite_code(),
        bonus_quota=0,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def authenticate_user(db: AsyncSession, email: str, password: str) -> Optional[User]:
    """Authenticate user with email and password. Returns user or None."""
    user = await get_user_by_email(db, email)
    if not user or not user.hashed_password:
        return None
    if not verify_password(password, user.hashed_password):
        return None
    return user


async def get_user_by_verification_token(db: AsyncSession, token: str) -> Optional[User]:
    """Get user by email verification token."""
    result = await db.execute(
        select(User).where(User.email_verification_token == token)
    )
    return result.scalars().first()


async def verify_email(db: AsyncSession, user: User) -> User:
    """Mark user's email as verified and clear the verification token."""
    await db.execute(
        update(User)
        .where(User.id == user.id)
        .values(email_verified=True, email_verification_token=None, email_verification_expires=None)
    )
    await db.commit()
    await db.refresh(user)
    return user


async def refresh_verification_token(db: AsyncSession, user: User) -> str:
    """Generate a new verification token for an unverified user."""
    token = secrets.token_urlsafe(32)
    expires = datetime.utcnow() + timedelta(hours=24)
    await db.execute(
        update(User)
        .where(User.id == user.id)
        .values(email_verification_token=token, email_verification_expires=expires)
    )
    await db.commit()
    await db.refresh(user)
    return token


async def create_user(db: AsyncSession, openid: str, username: str = None) -> User:
    """Create new user (legacy device/openid path)."""
    user = User(openid=openid, username=username)
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def get_or_create_user(db: AsyncSession, openid: str, username: str = None) -> User:
    """Get or create user by openid (legacy device path)."""
    user = await get_user_by_openid(db, openid)
    if not user:
        user = await create_user(db, openid, username)
    return user


# ===================== Usage Tracking =====================


async def check_daily_limit(db: Optional[AsyncSession], user: User) -> tuple[bool, int]:
    """Check if user has reached daily limit.

    Returns:
        (has_limit, remaining): (是否还有次数, 剩余次数)
    """
    today = datetime.utcnow().date()
    last_date = user.last_usage_date.date() if user.last_usage_date else None

    # Atomically reset counter in DB if it's a new day, then refresh ORM object
    if last_date != today and db is not None:
        await db.execute(
            update(User)
            .where(User.id == user.id)
            .where(
                or_(
                    User.last_usage_date == None,
                    func.date(User.last_usage_date) != today,
                )
            )
            .values(daily_usage=0, last_usage_date=datetime.utcnow())
        )
        await db.commit()
        await db.refresh(user)

    # Get limit based on tier (registered users get 3/day on free)
    limits = {"free": 3, "basic": 5, "premium": 15}
    daily_limit = limits.get(user.subscription_tier, 3)

    remaining_regular = daily_limit - user.daily_usage
    bonus = user.bonus_quota or 0
    if remaining_regular > 0:
        return True, remaining_regular + bonus
    elif bonus > 0:
        return True, bonus
    return remaining_regular > 0, max(remaining_regular, 0)


async def increment_usage(db: AsyncSession, user: User):
    """Increment daily usage count atomically. Uses bonus_quota when daily limit is exhausted."""
    limits = {"free": 3, "basic": 5, "premium": 15}
    daily_limit = limits.get(user.subscription_tier, 3)
    if user.daily_usage < daily_limit:
        await db.execute(
            update(User)
            .where(User.id == user.id)
            .values(
                daily_usage=User.daily_usage + 1,
                last_usage_date=datetime.utcnow(),
            )
        )
    else:
        # Regular limit used up — consume from bonus pool
        await db.execute(
            update(User)
            .where(User.id == user.id)
            .values(
                bonus_quota=User.bonus_quota - 1,
                last_usage_date=datetime.utcnow(),
            )
        )
    await db.commit()
    await db.refresh(user)


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


async def save_api_key(db: AsyncSession, user_id: int, api_key: str):
    """Save user API key (encrypted)."""
    await db.execute(
        update(User).where(User.id == user_id).values(api_key=api_key)
    )
    await db.commit()


async def get_api_key(db: AsyncSession, user_id: int) -> Optional[str]:
    """Get user API key."""
    user = await get_user_info(db, user_id)
    return user.api_key if user else None
