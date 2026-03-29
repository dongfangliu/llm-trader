"""Quota management service - unified user and device quota checking."""
from datetime import date, datetime
from typing import Union, Optional
from dataclasses import dataclass
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from src.models.user import User
from src.models.logs import UsageLog


# Daily limits per tier
DEVICE_LIMITS = {
    "free": 1,
    "basic": 5,
    "premium": 15,
}

USER_LIMITS = {
    "free": 3,
    "basic": 5,
    "premium": 15,
}


@dataclass
class QuotaInfo:
    daily_limit: int
    daily_used: int
    daily_remaining: int
    total_available: int
    tier: str
    trial_state: str
    reset_at: str


async def get_today_usage_for_device(db: AsyncSession, device_id: str) -> int:
    """Get today's usage count for a device."""
    today = date.today()
    result = await db.execute(
        select(UsageLog).where(
            UsageLog.device_id == device_id,
            UsageLog.date == today
        )
    )
    log = result.scalar_one_or_none()
    return log.count if log else 0


async def get_or_create_usage_log(db: AsyncSession, device_id: str) -> UsageLog:
    """Get or create today's usage log for a device."""
    today = date.today()
    result = await db.execute(
        select(UsageLog).where(
            UsageLog.device_id == device_id,
            UsageLog.date == today
        )
    )
    log = result.scalar_one_or_none()
    if not log:
        log = UsageLog(
            device_id=device_id,
            date=today,
            count=0,
            subscription="free"
        )
        db.add(log)
        await db.commit()
        await db.refresh(log)
    return log


async def increment_device_usage(db: AsyncSession, device_id: str, subscription: str = "free") -> UsageLog:
    """Atomically increment device usage count using upsert to prevent race conditions."""
    today = date.today()
    stmt = pg_insert(UsageLog).values(
        device_id=device_id,
        date=today,
        count=1,
        subscription=subscription,
    ).on_conflict_do_update(
        index_elements=["device_id", "date"],
        set_={"count": UsageLog.count + 1},
    )
    await db.execute(stmt)
    await db.commit()
    result = await db.execute(
        select(UsageLog).where(
            UsageLog.device_id == device_id,
            UsageLog.date == today
        )
    )
    return result.scalar_one()


async def rollback_device_usage(db: AsyncSession, device_id: str) -> None:
    """Rollback device usage (if task fails)."""
    from sqlalchemy import text
    today = date.today()
    await db.execute(
        text("UPDATE usage_logs SET count = GREATEST(0, count - 1) WHERE device_id = :did AND date = :d"),
        {"did": device_id, "d": today}
    )
    await db.commit()


async def get_quota_info_for_device(
    db: AsyncSession,
    device_id: str,
    tier: str,
    trial_state: str,
    bonus_quota: int = 0,
) -> QuotaInfo:
    """Get quota info for a device."""
    used = await get_today_usage_for_device(db, device_id)

    daily_limit = DEVICE_LIMITS.get(tier, 1)
    remaining = max(daily_limit - used, 0)
    total = remaining + bonus_quota

    from datetime import timedelta
    tomorrow = (datetime.utcnow() + timedelta(days=1)).replace(hour=0, minute=0, second=0)

    return QuotaInfo(
        daily_limit=daily_limit,
        daily_used=used,
        daily_remaining=remaining,
        total_available=total,
        tier=tier,
        trial_state=trial_state,
        reset_at=tomorrow.isoformat(),
    )


def get_deep_usage_for_user(user: User) -> int:
    """Return today's deep analysis usage count for a registered user.
    Reuses the daily_position_usage / last_position_date fields."""
    today = date.today()
    last = user.last_position_date.date() if user.last_position_date else None
    return user.daily_position_usage if last == today else 0


async def increment_deep_usage_for_user(db: AsyncSession, user: User) -> None:
    """Increment deep analysis usage for a registered user."""
    today = date.today()
    last = user.last_position_date.date() if user.last_position_date else None
    if last != today:
        user.daily_position_usage = 1
        user.last_position_date = datetime.utcnow()
    else:
        user.daily_position_usage += 1
    await db.commit()


async def get_deep_usage_for_device(db: AsyncSession, device_id: str) -> int:
    """Return today's deep analysis usage count for a device.
    Reuses the position_count field in UsageLog."""
    today = date.today()
    result = await db.execute(
        select(UsageLog).where(
            UsageLog.device_id == device_id,
            UsageLog.date == today
        )
    )
    log = result.scalar_one_or_none()
    return log.position_count if log else 0


async def increment_deep_usage_for_device(db: AsyncSession, device_id: str) -> None:
    """Atomically increment deep analysis usage for a device (upsert on position_count)."""
    today = date.today()
    stmt = pg_insert(UsageLog).values(
        device_id=device_id,
        date=today,
        count=0,
        position_count=1,
        subscription="basic",
    ).on_conflict_do_update(
        index_elements=["device_id", "date"],
        set_={"position_count": UsageLog.position_count + 1},
    )
    await db.execute(stmt)
    await db.commit()


async def get_quota_info_for_user(db: AsyncSession, user: User, effective_tier: str) -> QuotaInfo:
    """Get quota info for a registered user."""
    from src.services.trial_service import get_trial_state

    today = date.today()
    last_date = user.last_usage_date.date() if user.last_usage_date else None
    used = user.daily_usage if last_date == today else 0

    daily_limit = USER_LIMITS.get(effective_tier, 3)
    remaining = max(daily_limit - used, 0)
    bonus = user.bonus_quota or 0
    total = remaining + bonus

    trial_state = get_trial_state(user).value

    from datetime import timedelta
    tomorrow = (datetime.utcnow() + timedelta(days=1)).replace(hour=0, minute=0, second=0)

    return QuotaInfo(
        daily_limit=daily_limit,
        daily_used=used,
        daily_remaining=remaining,
        total_available=total,
        tier=effective_tier,
        trial_state=trial_state,
        reset_at=tomorrow.isoformat(),
    )
