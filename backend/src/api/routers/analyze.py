"""Analysis router - core analysis endpoints."""
import json
import uuid
import asyncio
import logging
import re
from typing import Optional
from datetime import datetime, date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, func

from src.database.new_db import get_db
from src.models.device import Device
from src.models.user import User
from src.models.analysis import AnalysisHistory
from src.models.logs import UsageLog
from src.api.schemas.analyze import (
    AnalyzeRequest, AnalyzeResponse, TaskStatusResponse,
    LimitsResponse, HistoryItem, HistoryResponse
)
from src.api.dependencies.auth import get_current_user_optional, get_current_user
from src.services.trial_service import get_trial_state, can_use_trial, get_effective_tier, consume_trial, TrialState
from src.services.quota_service import (
    get_or_create_usage_log, increment_device_usage, rollback_device_usage,
    get_quota_info_for_device, get_quota_info_for_user,
    USER_LIMITS, DEVICE_LIMITS,
    get_deep_usage_for_user, increment_deep_usage_for_user,
    get_deep_usage_for_device, increment_deep_usage_for_device,
)
from src.services.analysis_service import submit_analysis, get_task_status, get_history, delete_history_item, toggle_favorite
from src.services.llm.llm_service import (
    DEFAULT_LLM_TIMEOUT_SECONDS,
    WORKER_JOB_TIMEOUT_BUFFER_SECONDS,
    normalize_timeout_seconds,
)
import src.services.user.user_service as user_service
from src.config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["analyze"])

# Symbol validation patterns
_SYMBOL_PATTERNS = {
    "a":       (re.compile(r"^\d{6}$"),       "A股代码应为6位数字，如 600519"),
    "hk":      (re.compile(r"^\d{4,5}$"),     "港股代码应为4-5位数字，如 00700"),
    "us":      (re.compile(r"^[A-Z]{1,5}$"),  "美股代码应为1-5个大写字母，如 AAPL"),
    "futures": (re.compile(r"^[A-Z]{1,3}$"),  "期货代码应为1-3个大写字母，如 MA、SA"),
}

ALLOWED_MARKETS = {
    "free": {"a"},
    "basic": {"a", "hk", "us", "futures"},
    "premium": {"a", "hk", "us", "futures"},
}


async def _get_basic_deep_daily(db: AsyncSession) -> int:
    """Load basic_deep_daily from DB pricing settings, fallback to config."""
    try:
        from src.models.settings import SystemSetting
        row = await db.get(SystemSetting, "pricing")
        if row:
            data = json.loads(row.value)
            basic = data.get("basic", {})
            if basic.get("deep_daily") is not None:
                return int(basic["deep_daily"])
    except Exception:
        pass
    return settings.pricing_basic_deep_daily


async def _get_llm_timeout_seconds(db: AsyncSession) -> int:
    """Load LLM timeout from DB settings, fallback to config."""
    try:
        from src.models.settings import SystemSetting
        row = await db.get(SystemSetting, "llm")
        if row:
            data = json.loads(row.value)
            return normalize_timeout_seconds(data.get("timeout_seconds"))
    except Exception:
        pass
    return normalize_timeout_seconds(getattr(settings, "llm_timeout_seconds", DEFAULT_LLM_TIMEOUT_SECONDS))


async def _get_or_create_device(db: AsyncSession, device_id: str) -> Device:
    """Get or create a device record."""
    result = await db.execute(select(Device).where(Device.device_id == device_id))
    device = result.scalar_one_or_none()
    if not device:
        device = Device(
            device_id=device_id,
            subscription_tier="free",
            has_had_pro_trial=False,
            is_banned=False,
        )
        db.add(device)
        await db.commit()
        await db.refresh(device)
    else:
        # Check subscription expiry
        if (device.subscription_tier in ("basic", "premium")
                and device.expires_at is not None
                and device.expires_at < datetime.utcnow()):
            device.subscription_tier = "free"
            device.expires_at = None
            await db.commit()
    return device


@router.post("/analyze")
async def analyze(
    request: Request,
    req: AnalyzeRequest,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
):
    """Submit an analysis task."""
    usage_mode = "account" if current_user else "device"
    device_id = (req.device_id or "").strip()

    if usage_mode == "device" and not device_id:
        raise HTTPException(status_code=400, detail="device_id is required for guest mode")

    # Get LLM config from settings
    if not settings.llm_api_key:
        raise HTTPException(status_code=503, detail="AI 分析服务暂未配置，请联系管理员")

    # Determine effective tier and trial status
    if usage_mode == "account":
        # Check subscription expiry
        if (current_user.subscription_tier in ("basic", "premium")
                and current_user.subscription_expires_at is not None
                and current_user.subscription_expires_at < datetime.utcnow()):
            current_user.subscription_tier = "free"
            current_user.subscription_expires_at = None
            await db.commit()

        is_first_trial = not current_user.has_had_pro_trial
        if is_first_trial:
            effective_tier = "premium"
            subscription = "premium"
        else:
            effective_tier = current_user.subscription_tier
            subscription = current_user.subscription_tier

        # Check user daily limit
        has_limit, remaining = await user_service.check_daily_limit(db, current_user)
        daily_limit = USER_LIMITS.get(subscription, 3)
        # Trial always grants access
        if is_first_trial:
            has_limit = True
    else:
        # Device mode
        device = await _get_or_create_device(db, device_id)

        if device.is_banned:
            raise HTTPException(status_code=403, detail={"code": "device_banned", "message": "设备已被封禁"})

        is_first_trial = not device.has_had_pro_trial
        if is_first_trial:
            effective_tier = "premium"
            subscription = "premium"
        elif device.subscription_tier == "free":
            raise HTTPException(
                status_code=403,
                detail={"code": "trial_expired", "message": "免费体验已结束，请注册账号继续使用"}
            )
        else:
            effective_tier = device.subscription_tier
            subscription = device.subscription_tier

        usage_log = await get_or_create_usage_log(db, device_id)
        device_limit = DEVICE_LIMITS.get(subscription, 1)
        remaining = max(device_limit - usage_log.count, 0)
        has_limit = remaining > 0 or is_first_trial
        daily_limit = device_limit

    # Market access check
    if req.market not in ALLOWED_MARKETS.get(subscription, {"a"}):
        raise HTTPException(status_code=403, detail="当前套餐不支持该市场")

    # Position params: premium only
    if subscription == "premium":
        pos_holding_quantity = req.holding_quantity
        pos_cost_price = req.cost_price
        pos_max_position = req.max_position
    else:
        pos_holding_quantity = None
        pos_cost_price = None
        pos_max_position = None

    # Determine is_deep (before quota increment so count is accurate)
    basic_deep_daily = await _get_basic_deep_daily(db)
    if subscription == "premium":
        is_deep = True
    elif subscription == "basic":
        if usage_mode == "account":
            deep_used = get_deep_usage_for_user(current_user)
        else:
            deep_used = await get_deep_usage_for_device(db, device_id)
        is_deep = deep_used < basic_deep_daily
    else:
        is_deep = False

    if not has_limit:
        raise HTTPException(
            status_code=429,
            detail={"code": "quota_exceeded", "message": "今日分析次数已用完，请升级套餐获取更多次数"},
        )

    # Validate numeric inputs when provided
    if req.holding_quantity is not None and req.holding_quantity < 0:
        raise HTTPException(status_code=400, detail="持有数量不能为负数")
    if req.cost_price is not None and req.cost_price <= 0:
        raise HTTPException(status_code=400, detail="成本价必须大于0")
    if req.max_position is not None and req.max_position <= 0:
        raise HTTPException(status_code=400, detail="最大持仓必须大于0")

    # Symbol validation
    symbol_clean = req.symbol.strip().upper()
    if not symbol_clean:
        raise HTTPException(status_code=400, detail="股票代码不能为空")
    if len(symbol_clean) > 20:
        raise HTTPException(status_code=400, detail="代码格式错误：长度超出范围")
    if req.market in _SYMBOL_PATTERNS:
        pattern, hint = _SYMBOL_PATTERNS[req.market]
        if not pattern.match(symbol_clean):
            raise HTTPException(status_code=400, detail=f"代码格式错误：{hint}")

    # Generate task ID
    task_id = str(uuid.uuid4())

    # Consume quota upfront
    if usage_mode == "account":
        await user_service.increment_usage(db, current_user)
        _, new_remaining = await user_service.check_daily_limit(db, current_user)
        used = current_user.daily_usage
        daily_limit_shown = USER_LIMITS.get(subscription, 3)
    else:
        usage_after = await increment_device_usage(db, device_id, subscription)
        device_limit = DEVICE_LIMITS.get(subscription, 1)
        new_remaining = max(device_limit - usage_after.count, 0)
        used = usage_after.count
        daily_limit_shown = device_limit

    # Increment deep usage counter for basic tier
    if is_deep and subscription == "basic":
        if usage_mode == "account":
            await increment_deep_usage_for_user(db, current_user)
        else:
            await increment_deep_usage_for_device(db, device_id)

    # Extract and validate client-side OHLCV bars
    client_bars = None
    if req.ohlcv_bars and len(req.ohlcv_bars) >= 20:
        client_bars = [b.model_dump() for b in req.ohlcv_bars[:500]]
        logger.info(
            "客户端行情数据: symbol=%s market=%s bars=%d",
            symbol_clean, req.market, len(client_bars),
        )
    elif req.ohlcv_bars is not None:
        logger.info(
            "客户端行情数据不足 (%d 根)，降级服务端拉取: symbol=%s",
            len(req.ohlcv_bars), symbol_clean,
        )

    # Enqueue task
    try:
        redis_pool = request.app.state.redis
        await submit_analysis(
            db=db,
            redis_pool=redis_pool,
            symbol=symbol_clean,
            market=req.market,
            period=req.period,
            task_id=task_id,
            subscription=subscription,
            usage_mode=usage_mode,
            user_id=current_user.id if current_user else None,
            device_id=device_id if usage_mode == "device" else None,
            history_days=req.history_days or 90,
            holding_quantity=pos_holding_quantity,
            cost_price=pos_cost_price,
            max_position=pos_max_position,
            ohlcv_bars=client_bars,
            is_deep=is_deep,
            is_pro_trial=is_first_trial,
            # 仅在客户端数据有效(同源)时透传前端算好的特征；否则 worker 自算兜底
            trend_features=req.trend_features if client_bars else None,
            trend_higher=req.trend_higher if client_bars else None,
            indicators=req.indicators if client_bars else None,
        )
    except Exception as eq_err:
        logger.error("enqueue_job failed: %s", eq_err)
        # Rollback quota
        if usage_mode == "account":
            try:
                current_user.daily_usage = max(0, (current_user.daily_usage or 1) - 1)
                await db.commit()
            except Exception:
                pass
        else:
            await rollback_device_usage(db, device_id)
        raise HTTPException(status_code=503, detail="任务提交失败，请稍后重试")

    # Mark trial as used (after successful enqueue)
    if is_first_trial:
        if usage_mode == "account":
            current_user.has_had_pro_trial = True
            await db.commit()
        else:
            device.has_had_pro_trial = True
            await db.commit()

    original_tier = current_user.subscription_tier if usage_mode == "account" else subscription
    return {
        "task_id": task_id,
        "status": "queued",
        "usage": {
            "tier": original_tier,
            "display_tier": effective_tier,
            "remaining": new_remaining,
            "used": used,
            "daily_limit": daily_limit_shown,
        },
        # Legacy fields for compatibility
        "message": "分析任务已提交",
        "remaining": new_remaining,
        "daily_limit": daily_limit_shown,
        "is_first_trial": is_first_trial,
    }


@router.get("/task/{task_id}")
async def get_task(task_id: str, request: Request):
    """Poll task status."""
    redis_pool = request.app.state.redis
    raw = await redis_pool.get(f"task:{task_id}")
    if raw is None:
        raise HTTPException(status_code=404, detail="Task not found or expired")
    return json.loads(raw)


@router.get("/task/{task_id}/stream")
async def stream_task(task_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    """SSE stream for task progress."""
    redis_pool = request.app.state.redis
    llm_timeout_seconds = await _get_llm_timeout_seconds(db)
    stream_timeout_seconds = llm_timeout_seconds + WORKER_JOB_TIMEOUT_BUFFER_SECONDS
    max_ticks = max(1, int(stream_timeout_seconds / 0.5))

    async def event_generator():
        for _ in range(max_ticks):
            if await request.is_disconnected():
                break

            raw = await redis_pool.get(f"task:{task_id}")
            if raw:
                data = json.loads(raw)
                if data.get("status") in ("done", "failed"):
                    yield f"data: {json.dumps(data)}\n\n"
                    return

            yield f"data: {json.dumps({'status': 'pending', 'task_id': task_id})}\n\n"
            await asyncio.sleep(0.5)

        yield f"data: {json.dumps({'status': 'timeout', 'task_id': task_id})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        }
    )


@router.get("/analyze/limits")
async def get_limits(
    request: Request,
    device_id: Optional[str] = Query(None),
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
):
    """Get current quota limits."""
    tomorrow = (datetime.utcnow() + timedelta(days=1)).replace(hour=0, minute=0, second=0)
    basic_deep_daily = await _get_basic_deep_daily(db)

    if current_user:
        is_first_trial = not current_user.has_had_pro_trial
        effective_tier = "premium" if is_first_trial else current_user.subscription_tier

        today = date.today()
        last_date = current_user.last_usage_date.date() if current_user.last_usage_date else None
        used = current_user.daily_usage if last_date == today else 0

        daily_limit = USER_LIMITS.get(effective_tier, 3)
        remaining = max(daily_limit - used, 0)
        bonus = current_user.bonus_quota or 0
        total = remaining + bonus

        if current_user.subscription_tier in ("basic", "premium"):
            trial_state = "not_eligible"
        elif current_user.has_had_pro_trial:
            trial_state = "expired"
        else:
            trial_state = "available"

        # Deep remaining
        if effective_tier == "premium":
            deep_remaining = None
            deep_daily_limit = None
        elif effective_tier == "basic":
            deep_used = get_deep_usage_for_user(current_user)
            deep_remaining = max(0, basic_deep_daily - deep_used)
            deep_daily_limit = basic_deep_daily
        else:
            deep_remaining = 0
            deep_daily_limit = 0

        return {
            "remaining": remaining,
            "daily_limit": daily_limit,
            "total_available": total,
            "tier": effective_tier,
            "trial_used": current_user.has_had_pro_trial,
            "trial_state": trial_state,
            "reset_at": tomorrow.isoformat(),
            "deep_remaining": deep_remaining,
            "deep_daily_limit": deep_daily_limit,
        }
    else:
        dv_id = (device_id or "").strip()
        if not dv_id:
            return {
                "remaining": 1,
                "daily_limit": 1,
                "total_available": 1,
                "tier": "free",
                "trial_used": False,
                "trial_state": "available",
                "reset_at": tomorrow.isoformat(),
                "deep_remaining": 0,
                "deep_daily_limit": 0,
            }

        device = await _get_or_create_device(db, dv_id)
        usage_log = await get_or_create_usage_log(db, dv_id)
        is_first_trial = not device.has_had_pro_trial
        effective_tier = "premium" if is_first_trial else device.subscription_tier
        device_limit = DEVICE_LIMITS.get(effective_tier, 1)
        remaining = max(device_limit - usage_log.count, 0)

        if device.has_had_pro_trial and device.subscription_tier == "free":
            trial_state = "expired"
        elif device.subscription_tier in ("basic", "premium"):
            trial_state = "not_eligible"
        else:
            trial_state = "available"

        # Deep remaining for device
        if effective_tier == "premium":
            deep_remaining = None
            deep_daily_limit = None
        elif effective_tier == "basic":
            deep_used = usage_log.position_count if usage_log else 0
            deep_remaining = max(0, basic_deep_daily - deep_used)
            deep_daily_limit = basic_deep_daily
        else:
            deep_remaining = 0
            deep_daily_limit = 0

        return {
            "remaining": remaining,
            "daily_limit": device_limit,
            "total_available": remaining,
            "tier": effective_tier,
            "trial_used": device.has_had_pro_trial,
            "trial_state": trial_state,
            "reset_at": tomorrow.isoformat(),
            "deep_remaining": deep_remaining,
            "deep_daily_limit": deep_daily_limit,
        }


@router.get("/analyze/history")
async def get_analysis_history(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get analysis history for current user."""
    items, total = await get_history(db, current_user.id, page, per_page)
    return {
        "items": [
            {
                "id": item.id,
                "symbol": item.symbol,
                "market": item.market,
                "period": item.period,
                "created_at": item.analyzed_at.isoformat() if item.analyzed_at else "",
                "is_favorited": bool(item.is_favorited),
                "is_pro_trial": bool(item.is_pro_trial),
                "result": json.loads(item.result) if item.result else None,
            }
            for item in items
        ],
        "total": total,
        "page": page,
        "per_page": per_page,
    }


@router.delete("/analyze/history/{item_id}")
async def delete_history(
    item_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a history item."""
    success = await delete_history_item(db, current_user.id, item_id)
    if not success:
        raise HTTPException(status_code=404, detail="History item not found")
    return {"success": True}


@router.post("/analyze/history/{item_id}/favorite")
async def toggle_history_favorite(
    item_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Toggle favorite on a history item."""
    is_favorited = await toggle_favorite(db, current_user.id, item_id)
    if is_favorited is None:
        raise HTTPException(status_code=404, detail="History item not found")
    return {"success": True, "is_favorited": is_favorited}
