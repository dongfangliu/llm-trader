"""Admin router — management endpoints for users, devices, settings, and market data."""

import asyncio
import copy
import json
from datetime import date, datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy import delete, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.dependencies.auth import get_admin_token_or_admin_user
from src.config import settings
from src.database.new_db import get_db
from src.models.analysis import AnalysisHistory, AnalysisRequest
from src.models.device import Device
from src.models.logs import UsageLog
from src.models.market import SymbolName
from src.models.settings import SystemSetting
from src.models.user import User
from src.services.llm.llm_service import normalize_timeout_seconds
from src.services.quota_service import USER_LIMITS

router = APIRouter(prefix="/api/admin", tags=["admin"])

# Shorthand for the admin dependency
_Admin = Depends(get_admin_token_or_admin_user)


# ---------------------------------------------------------------------------
# Pydantic request models
# ---------------------------------------------------------------------------

class AdminUpdateUserRequest(BaseModel):
    subscription_tier: Optional[str] = None   # free, basic, premium
    is_active: Optional[bool] = None
    reset_usage: Optional[bool] = False
    email_verified: Optional[bool] = None
    is_banned: Optional[bool] = None
    bonus_quota: Optional[int] = None


class AdminSetQuotaRequest(BaseModel):
    daily_usage: Optional[int] = None   # directly write users.daily_usage
    bonus_quota: Optional[int] = None   # directly write users.bonus_quota


class BatchDeviceAction(BaseModel):
    action: str          # "ban" | "unban" | "delete" | "reset-trial"
    device_ids: List[str]


class SymbolRefreshRequest(BaseModel):
    symbol: str
    market: str
    period: str
    adjust: str = "qfq"


# ---------------------------------------------------------------------------
# Helper: build a user dict for list/detail responses
# ---------------------------------------------------------------------------

def _user_dict(u: User) -> dict:
    today = date.today()
    last_date = u.last_usage_date.date() if u.last_usage_date else None
    used = u.daily_usage if last_date == today else 0
    daily_limit = USER_LIMITS.get(u.subscription_tier, 3)
    daily_remaining = max(daily_limit - used, 0)
    total_available = daily_remaining + (u.bonus_quota or 0)
    return {
        "id": u.id,
        "email": u.email,
        "username": u.username,
        "subscription_tier": u.subscription_tier,
        "daily_usage": u.daily_usage,
        "last_usage_date": u.last_usage_date.isoformat() if u.last_usage_date else None,
        "is_active": u.is_active,
        "is_banned": bool(u.is_banned),
        "is_admin": bool(u.is_admin),
        "created_at": u.created_at.isoformat() if u.created_at else None,
        "invite_code": u.invite_code,
        "bonus_quota": u.bonus_quota or 0,
        "email_verified": bool(u.email_verified),
        "has_had_pro_trial": bool(u.has_had_pro_trial),
        "used_invite_code": u.used_invite_code,
        "subscription_expires_at": u.subscription_expires_at.isoformat() if u.subscription_expires_at else None,
        "last_device_id": u.last_device_id,
        "daily_limit": daily_limit,
        "daily_remaining": daily_remaining,
        "total_available": total_available,
    }


# ---------------------------------------------------------------------------
# Stats
# ---------------------------------------------------------------------------

@router.get("/stats")
async def admin_stats(
    db: AsyncSession = Depends(get_db),
    _: bool = _Admin,
):
    """Usage statistics (admin only)."""
    today = datetime.utcnow().date()

    # Active devices today
    active_result = await db.execute(
        select(func.count(UsageLog.id)).where(UsageLog.date == today, UsageLog.count > 0)
    )
    active_devices = active_result.scalar() or 0

    # Total requests today
    total_result = await db.execute(
        select(func.sum(UsageLog.count)).where(UsageLog.date == today)
    )
    total_requests = total_result.scalar() or 0

    # Analysis records in last 24 h
    since = datetime.utcnow() - timedelta(hours=24)
    analysis_result = await db.execute(
        select(func.count(AnalysisHistory.id)).where(AnalysisHistory.analyzed_at >= since)
    )
    analysis_24h = analysis_result.scalar() or 0

    # User tier distribution
    tier_result = await db.execute(
        select(User.subscription_tier, func.count(User.id).label("cnt"))
        .group_by(User.subscription_tier)
    )
    tier_dist = {row[0]: row[1] for row in tier_result.all()}

    # Total user count
    user_count = (await db.execute(select(func.count(User.id)))).scalar() or 0

    return {
        "date": today.isoformat(),
        "active_devices_today": active_devices,
        "total_requests_today": total_requests,
        "analysis_last_24h": analysis_24h,
        "tier_distribution": tier_dist,
        "total_users": user_count,
    }


@router.get("/datasource-stats")
async def admin_datasource_stats(
    request: Request,
    days: int = Query(7, ge=1, le=30),
    _: bool = _Admin,
):
    """数据来源统计：客户端 vs akshare，最近 N 天（从 Redis 读取计数器）。"""
    redis = request.app.state.redis

    result = []
    today = datetime.utcnow().date()
    for i in range(days):
        d = (today - timedelta(days=i)).isoformat()
        client_raw = await redis.get(f"stats:datasource:client:{d}")
        akshare_raw = await redis.get(f"stats:datasource:akshare:{d}")
        client_count = int(client_raw) if client_raw else 0
        akshare_count = int(akshare_raw) if akshare_raw else 0
        total = client_count + akshare_count
        result.append({
            "date": d,
            "client": client_count,
            "akshare": akshare_count,
            "total": total,
            "client_pct": round(client_count / total * 100) if total else 0,
        })

    result.sort(key=lambda x: x["date"])

    # Summary
    total_client = sum(r["client"] for r in result)
    total_akshare = sum(r["akshare"] for r in result)
    grand_total = total_client + total_akshare

    return {
        "days": result,
        "summary": {
            "client": total_client,
            "akshare": total_akshare,
            "total": grand_total,
            "client_pct": round(total_client / grand_total * 100) if grand_total else 0,
        },
    }


# ---------------------------------------------------------------------------
# Users
# ---------------------------------------------------------------------------

@router.get("/users")
async def admin_list_users(
    search: Optional[str] = None,
    tier: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
    db: AsyncSession = Depends(get_db),
    _: bool = _Admin,
):
    """List all users with optional search and tier filter (admin only)."""
    stmt = select(User)
    if search:
        stmt = stmt.where(
            or_(User.email.ilike(f"%{search}%"), User.username.ilike(f"%{search}%"))
        )
    if tier:
        stmt = stmt.where(User.subscription_tier == tier)

    # Total count
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await db.execute(count_stmt)).scalar() or 0

    # Paginated results
    stmt = stmt.order_by(User.id.desc()).offset((page - 1) * page_size).limit(page_size)
    rows = (await db.execute(stmt)).scalars().all()

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": [_user_dict(u) for u in rows],
    }


@router.get("/users/{user_id}")
async def admin_get_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    _: bool = _Admin,
):
    """Get a single user by id (admin only)."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return _user_dict(user)


@router.put("/users/{user_id}")
async def admin_update_user(
    user_id: int,
    req: AdminUpdateUserRequest,
    db: AsyncSession = Depends(get_db),
    _: bool = _Admin,
):
    """Update user subscription tier, active status, ban status, quota, etc. (admin only)."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if req.subscription_tier is not None:
        if req.subscription_tier not in ("free", "basic", "premium"):
            raise HTTPException(status_code=400, detail="Invalid tier")
        user.subscription_tier = req.subscription_tier

    if req.is_active is not None:
        user.is_active = req.is_active

    if req.is_banned is not None:
        user.is_banned = req.is_banned

    if req.reset_usage:
        user.daily_usage = 0
        user.last_usage_date = None

    if req.email_verified is not None:
        user.email_verified = req.email_verified

    if req.bonus_quota is not None:
        if req.bonus_quota < 0:
            raise HTTPException(status_code=400, detail="bonus_quota 不能为负数")
        user.bonus_quota = req.bonus_quota

    await db.commit()
    return _user_dict(user)


@router.patch("/users/{user_id}/quota")
async def admin_set_user_quota(
    user_id: int,
    req: AdminSetQuotaRequest,
    db: AsyncSession = Depends(get_db),
    _: bool = _Admin,
):
    """Directly set a user's daily_usage and/or bonus_quota (admin only)."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if req.daily_usage is not None:
        if req.daily_usage < 0:
            raise HTTPException(status_code=400, detail="daily_usage 不能为负数")
        user.daily_usage = req.daily_usage
    if req.bonus_quota is not None:
        if req.bonus_quota < 0:
            raise HTTPException(status_code=400, detail="bonus_quota 不能为负数")
        user.bonus_quota = req.bonus_quota
    await db.commit()
    return {
        "id": user.id,
        "email": user.email,
        "daily_usage": user.daily_usage,
        "bonus_quota": user.bonus_quota,
        "subscription_tier": user.subscription_tier,
    }


@router.delete("/users/{user_id}")
async def admin_delete_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    _: bool = _Admin,
):
    """Delete a user account (admin only)."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    await db.delete(user)
    await db.commit()
    return {"status": "deleted", "user_id": user_id}


# ---------------------------------------------------------------------------
# Devices
# ---------------------------------------------------------------------------

@router.get("/devices")
async def admin_list_devices(
    search: Optional[str] = None,
    tier: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
    db: AsyncSession = Depends(get_db),
    _: bool = _Admin,
):
    """List all device subscriptions (admin only)."""
    stmt = select(Device)
    if search:
        stmt = stmt.where(Device.device_id.ilike(f"%{search}%"))
    if tier:
        stmt = stmt.where(Device.subscription_tier == tier)

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await db.execute(count_stmt)).scalar() or 0

    stmt = stmt.order_by(Device.id.desc()).offset((page - 1) * page_size).limit(page_size)
    rows = (await db.execute(stmt)).scalars().all()

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": [
            {
                "id": r.id,
                "device_id": r.device_id,
                "subscription_tier": r.subscription_tier,
                "is_banned": r.is_banned,
                "has_had_pro_trial": r.has_had_pro_trial,
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "updated_at": r.updated_at.isoformat() if r.updated_at else None,
            }
            for r in rows
        ],
    }


@router.delete("/devices/{device_id}")
async def admin_delete_device(
    device_id: str,
    db: AsyncSession = Depends(get_db),
    _: bool = _Admin,
):
    """Delete a device subscription record (admin only)."""
    result = await db.execute(select(Device).where(Device.device_id == device_id))
    row = result.scalars().first()
    if not row:
        raise HTTPException(status_code=404, detail="Device not found")
    await db.delete(row)
    await db.commit()
    return {"status": "deleted", "device_id": device_id}


@router.post("/devices/{device_id}/ban")
async def admin_ban_device(
    device_id: str,
    db: AsyncSession = Depends(get_db),
    _: bool = _Admin,
):
    """Ban a device (admin only)."""
    await db.execute(
        update(Device)
        .where(Device.device_id == device_id)
        .values(is_banned=True)
    )
    await db.commit()
    return {"status": "banned", "device_id": device_id}


@router.post("/devices/{device_id}/unban")
async def admin_unban_device(
    device_id: str,
    db: AsyncSession = Depends(get_db),
    _: bool = _Admin,
):
    """Unban a device (admin only)."""
    await db.execute(
        update(Device)
        .where(Device.device_id == device_id)
        .values(is_banned=False)
    )
    await db.commit()
    return {"status": "unbanned", "device_id": device_id}


@router.post("/devices/{device_id}/reset-trial")
async def admin_reset_device_trial(
    device_id: str,
    db: AsyncSession = Depends(get_db),
    _: bool = _Admin,
):
    """Reset pro trial for a device (admin only)."""
    await db.execute(
        update(Device)
        .where(Device.device_id == device_id)
        .values(has_had_pro_trial=False)
    )
    await db.commit()
    return {"status": "trial_reset", "device_id": device_id}


@router.get("/devices/{device_id}/history")
async def admin_device_history(
    device_id: str,
    db: AsyncSession = Depends(get_db),
    _: bool = _Admin,
):
    """Get analysis history for a device (admin only, last 50 records)."""
    rows = (
        await db.execute(
            select(AnalysisHistory)
            .where(AnalysisHistory.device_id == device_id)
            .order_by(AnalysisHistory.analyzed_at.desc())
            .limit(50)
        )
    ).scalars().all()
    return {
        "device_id": device_id,
        "items": [
            {
                "id": r.id,
                "symbol": r.symbol,
                "market": r.market,
                "period": r.period,
                "analysis_date": r.analysis_date.isoformat() if r.analysis_date else None,
                "analyzed_at": r.analyzed_at.isoformat() if r.analyzed_at else None,
            }
            for r in rows
        ],
    }


@router.post("/devices/batch")
async def admin_batch_devices(
    body: BatchDeviceAction,
    db: AsyncSession = Depends(get_db),
    _: bool = _Admin,
):
    """Batch action on devices: ban | unban | delete | reset-trial (admin only)."""
    affected = 0
    if body.action == "ban":
        r = await db.execute(
            update(Device)
            .where(Device.device_id.in_(body.device_ids))
            .values(is_banned=True)
        )
        affected = r.rowcount
    elif body.action == "unban":
        r = await db.execute(
            update(Device)
            .where(Device.device_id.in_(body.device_ids))
            .values(is_banned=False)
        )
        affected = r.rowcount
    elif body.action == "reset-trial":
        r = await db.execute(
            update(Device)
            .where(Device.device_id.in_(body.device_ids))
            .values(has_had_pro_trial=False)
        )
        affected = r.rowcount
    elif body.action == "delete":
        r = await db.execute(
            delete(Device).where(Device.device_id.in_(body.device_ids))
        )
        affected = r.rowcount
    else:
        raise HTTPException(status_code=400, detail=f"Unknown action: {body.action}")
    await db.commit()
    return {"status": "ok", "action": body.action, "affected": affected}


# ---------------------------------------------------------------------------
# Symbol names
# ---------------------------------------------------------------------------

@router.post("/refresh-names")
async def admin_refresh_names(
    market: Optional[str] = None,
    _: bool = _Admin,
):
    """Refresh stock name mappings (admin only).

    Pass ``?market=a``, ``?market=hk``, or ``?market=us`` to refresh a
    single market; omit to refresh all three.
    """
    from src.services.data.name_service import refresh_names, get_last_error

    markets = [market] if market else ["a", "hk", "us"]
    counts: dict = {}
    errors: dict = {}

    for m in markets:
        try:
            result = await refresh_names(m)
            # refresh_names returns a dict {market: count} when called without arg,
            # or an int when called for a single market.
            if isinstance(result, dict):
                counts[m] = result.get(m, 0)
            else:
                counts[m] = result
        except Exception as e:
            counts[m] = 0
            last_err = get_last_error(m)
            errors[m] = last_err or str(e)

    if errors:
        return {
            "success": False,
            "counts": counts,
            "errors": errors,
            "message": f"部分市场刷新失败: {', '.join(errors.keys())}",
        }
    return {"success": True, "counts": counts}


@router.get("/symbol-names")
async def admin_get_symbol_names(
    market: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = 500,
    db: AsyncSession = Depends(get_db),
    _: bool = _Admin,
):
    """Return stored symbol name mappings from the DB (admin only)."""
    stmt = select(SymbolName)
    if market:
        stmt = stmt.where(SymbolName.market == market)
    if search:
        s = f"%{search}%"
        stmt = stmt.where(
            or_(SymbolName.symbol.ilike(s), SymbolName.name.ilike(s))
        )
    stmt = stmt.order_by(SymbolName.market, SymbolName.symbol).limit(limit)

    # Per-market totals
    count_stmt = (
        select(SymbolName.market, func.count().label("cnt"))
        .group_by(SymbolName.market)
    )

    rows = (await db.execute(stmt)).scalars().all()
    count_rows = (await db.execute(count_stmt)).all()

    market_totals = {r.market: r.cnt for r in count_rows}
    return {
        "total": sum(market_totals.values()),
        "market_totals": market_totals,
        "items": [
            {
                "symbol": r.symbol,
                "market": r.market,
                "name": r.name,
                "updated_at": r.updated_at.isoformat() if r.updated_at else None,
            }
            for r in rows
        ],
    }


# ---------------------------------------------------------------------------
# Settings
# ---------------------------------------------------------------------------

def _build_default_settings() -> dict:
    """Build a default settings dict from the current config / env vars."""
    return {
        "llm": {
            "provider": settings.llm_provider,
            "api_key": settings.llm_api_key,
            "base_url": settings.llm_base_url,
            "model": settings.llm_model,
            "max_tokens": settings.llm_max_tokens,
            "temperature": settings.llm_temperature,
            "timeout_seconds": normalize_timeout_seconds(settings.llm_timeout_seconds),
            "thinking_enabled": settings.llm_thinking_enabled,
            "thinking_effort": settings.llm_thinking_effort,
        },
        "afdian": {
            "webhook_token": settings.afdian_webhook_token,
            "basic_plan_id": settings.afdian_basic_plan_id,
            "premium_plan_id": settings.afdian_premium_plan_id,
            "basic_link": settings.afdian_basic_link,
            "premium_link": settings.afdian_premium_link,
            "user_id": settings.afdian_user_id,
            "api_token": settings.afdian_api_token,
        },
        "email": {
            "resend_api_key": settings.resend_api_key,
            "from": settings.email_from,
            "app_base_url": settings.app_base_url,
        },
        "app": {
            "name": settings.app_name,
            "require_invite_code": False,
        },
        "pricing": {
            "period": settings.pricing_period,
            "guest_daily": settings.pricing_guest_daily,
            "free_daily": settings.pricing_free_daily,
            "basic": {
                "price": settings.pricing_basic_price,
                "daily": settings.pricing_basic_daily,
                "deep_daily": settings.pricing_basic_deep_daily,
            },
            "premium": {
                "price": settings.pricing_premium_price,
                "daily": settings.pricing_premium_daily,
            },
            "features": [],
            "free_features": [],
            "basic_features": [],
            "premium_features": [],
        },
    }


async def _overlay_db_settings(db: AsyncSession, result: dict) -> dict:
    """Overlay DB-saved values on top of defaults."""
    for section in ("llm", "afdian", "email", "app", "pricing"):
        row = await db.get(SystemSetting, section)
        if not row:
            continue
        try:
            data = json.loads(row.value)
            if section in result and isinstance(result[section], dict):
                if section == "pricing":
                    # Nested merge for pricing sub-dicts
                    for k, v in data.items():
                        if k in ("basic", "premium") and isinstance(v, dict):
                            result[section].setdefault(k, {}).update(v)
                        else:
                            result[section][k] = v
                else:
                    result[section].update(data)
        except Exception:
            pass
    return result


_ALLOWED_SETTINGS_SECTIONS = {"llm", "afdian", "email", "app", "pricing"}


@router.get("/settings")
async def admin_get_settings(
    db: AsyncSession = Depends(get_db),
    _: bool = _Admin,
):
    """Return all runtime-configurable system settings (admin only)."""
    result = _build_default_settings()
    result = await _overlay_db_settings(db, result)
    return result


@router.put("/settings")
async def admin_update_settings(
    body: dict,
    db: AsyncSession = Depends(get_db),
    _: bool = _Admin,
):
    """Update settings sections and persist to database (admin only)."""
    updated_sections = []

    for section, data in body.items():
        if section not in _ALLOWED_SETTINGS_SECTIONS:
            continue
        if not isinstance(data, dict):
            continue

        row = await db.get(SystemSetting, section)
        existing: dict = {}
        if row:
            try:
                existing = json.loads(row.value)
            except Exception:
                pass

        if section == "pricing":
            basic = data.get("basic", {})
            premium = data.get("premium", {})
            for simple_key in ("period", "guest_daily", "free_daily", "features",
                               "free_features", "basic_features", "premium_features"):
                if simple_key in data:
                    existing[simple_key] = data[simple_key]
            if isinstance(basic, dict):
                existing.setdefault("basic", {}).update(
                    {k: v for k, v in basic.items() if v is not None and k != "deep_daily"}
                )
                if "deep_daily" in basic and basic["deep_daily"] is not None:
                    existing.setdefault("basic", {})["deep_daily"] = int(basic["deep_daily"])
            if isinstance(premium, dict):
                existing.setdefault("premium", {}).update(
                    {k: v for k, v in premium.items() if v is not None}
                )
        elif section == "app":
            for k, v in data.items():
                existing[k] = v
        else:
            for k, v in data.items():
                if v is not None:
                    if section == "llm" and k == "timeout_seconds":
                        existing[k] = normalize_timeout_seconds(v)
                    else:
                        existing[k] = v

        if row:
            row.value = json.dumps(existing)
            row.updated_at = datetime.utcnow()
        else:
            db.add(SystemSetting(key=section, value=json.dumps(existing)))

        updated_sections.append(section)

    await db.commit()
    return {"success": True, "updated": updated_sections}


@router.get("/settings/export")
async def admin_export_settings(
    db: AsyncSession = Depends(get_db),
    _: bool = _Admin,
):
    """Export a complete settings snapshot as JSON (all fields, including sensitive)."""
    result = _build_default_settings()
    result = await _overlay_db_settings(db, result)
    return result


@router.post("/settings/import")
async def admin_import_settings(
    body: dict,
    db: AsyncSession = Depends(get_db),
    _: bool = _Admin,
):
    """Import a settings snapshot, overwriting every section present in the payload."""
    imported = []
    for section, data in body.items():
        if section not in _ALLOWED_SETTINGS_SECTIONS or not isinstance(data, dict):
            continue
        row = await db.get(SystemSetting, section)
        if row:
            row.value = json.dumps(data)
            row.updated_at = datetime.utcnow()
        else:
            db.add(SystemSetting(key=section, value=json.dumps(data)))
        imported.append(section)
    await db.commit()
    return {"success": True, "imported": imported}


# ---------------------------------------------------------------------------
# Market data management
# ---------------------------------------------------------------------------

@router.get("/market-data/status")
async def admin_market_data_status(_: bool = _Admin):
    """Return DB coverage for every symbol in the watchlist (admin only)."""
    from src.services.data.data_collector import get_market_data_status, is_collecting

    status = await get_market_data_status()
    return {"collecting": is_collecting(), "symbols": status}


@router.post("/market-data/refresh")
async def admin_market_data_refresh(_: bool = _Admin):
    """Trigger an immediate refresh of all symbols in the DB (admin only)."""
    from src.services.data.data_collector import is_collecting, run_collection_cycle

    if is_collecting():
        return {"triggered": False, "reason": "采集任务正在运行中，请稍后再试"}
    asyncio.create_task(run_collection_cycle())
    return {"triggered": True}


@router.post("/market-data/refresh-symbol")
async def admin_refresh_symbol(
    req: SymbolRefreshRequest,
    _: bool = _Admin,
):
    """Refresh a single symbol/market/period (admin only)."""
    from src.services.data.data_collector import collect_symbol

    asyncio.create_task(collect_symbol(req.symbol, req.market, req.period, req.adjust))
    return {"triggered": True}


# ---------------------------------------------------------------------------
# Reset all data
# ---------------------------------------------------------------------------

@router.post("/reset-all")
async def admin_reset_all(
    db: AsyncSession = Depends(get_db),
    _: bool = _Admin,
):
    """Delete all users, devices, and associated records (admin only)."""
    tables = [
        (AnalysisRequest, "analysis_requests"),
        (AnalysisHistory, "analysis_histories"),
        (UsageLog, "usage_logs"),
        (Device, "device_subscriptions"),
        (User, "users"),
    ]
    counts = {}
    for model, key in tables:
        result = await db.execute(delete(model))
        counts[key] = result.rowcount
    await db.commit()
    return {"deleted": counts}
