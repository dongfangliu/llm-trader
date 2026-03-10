"""FastAPI main application."""

import asyncio
import os
import json
import hashlib
import logging
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from typing import Optional, List, Dict
import re

import httpx
from fastapi import FastAPI, HTTPException, Depends, Header, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.dialects.postgresql import insert as pg_insert

from src.database.db import (
    init_db,
    get_db,
    async_session,
    User,
    UsageLog,
    DeviceSubscription,
    AnalysisHistory,
    AfdianOrder,
    SystemSetting,
    MarketBar,
    SymbolName,
    settings,
)
from src.services.user import user_service
from src.services.data import data_service
from src.services.data.name_service import get_symbol_name, preload_names, refresh_names, get_last_error
from src.services.data.data_collector import (
    run_collector,
    run_collection_cycle,
    load_watchlist,
    save_watchlist,
    get_market_data_status,
    is_collecting,
)
from src.services.llm import llm_service
from src.services.email_service import send_verification_email
from arq import create_pool
from src.worker.redis_client import get_redis_settings


logger = logging.getLogger(__name__)

# Rate limiter
limiter = Limiter(key_func=get_remote_address)


def _startup_checks():
    """Validate critical configuration on startup."""
    warnings = []
    if settings.secret_key == "change-me-in-production":
        raise RuntimeError(
            "SECRET_KEY is still the default value. "
            "Set SECRET_KEY environment variable before running in production."
        )
    if not settings.llm_api_key:
        warnings.append("LLM_API_KEY is not set — analysis endpoints will fail.")
    if not settings.admin_token:
        warnings.append("ADMIN_TOKEN is not set — admin endpoints are disabled.")
    if not settings.afdian_webhook_token:
        warnings.append("AFDIAN_WEBHOOK_TOKEN is not set — webhook token validation is skipped.")
    for w in warnings:
        logger.warning("CONFIG WARNING: %s", w)


@asynccontextmanager
async def lifespan(app: FastAPI):
    _startup_checks()
    await init_db()
    _load_settings_cache()
    # Load pricing.features from DB into cache
    async with async_session() as db:
        row = await db.get(SystemSetting, "pricing")
        if row:
            try:
                db_pricing = json.loads(row.value)
                _settings_cache["pricing"]["features"] = db_pricing.get("features", [])
            except Exception:
                pass
    # Preload stock name mappings in background — non-blocking, refreshes daily
    asyncio.create_task(preload_names())
    # Start embedded data collector when explicitly enabled (dev convenience).
    # In production Docker, run the data-collector as a separate container instead.
    if os.getenv("ENABLE_COLLECTOR", "").lower() in ("1", "true", "yes"):
        logger.info("ENABLE_COLLECTOR=true — starting embedded data collector")
        asyncio.create_task(run_collector())
    # Initialize Redis connection pool for task queue
    app.state.redis = await create_pool(get_redis_settings())
    logger.info("Redis connection pool initialised")
    yield
    await app.state.redis.aclose()


app = FastAPI(
    title="LLM Trading Analyzer API",
    description="AI-powered stock and futures analysis service",
    version="1.0.0",
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS middleware — restrict to configured origins in production
_origins = [o.strip() for o in settings.allowed_origins.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ===================== Request Models =====================


class LoginRequest(BaseModel):
    """Email/password login request."""
    email: str
    password: str


class ResendVerificationRequest(BaseModel):
    """Request to resend verification email."""
    email: str


class RegisterRequest(BaseModel):
    """Email/password registration request."""
    email: str
    password: str
    username: Optional[str] = None


class AnalyzeRequest(BaseModel):
    """Analysis request."""
    symbol: str
    market: str = "a"  # a, hk, us, futures
    period: str = "daily"  # daily, 1, 5, 15, 30, 60
    history_days: int = 90
    holding_quantity: Optional[int] = None
    cost_price: Optional[float] = None
    max_position: Optional[int] = None
    holding_text: Optional[str] = Field(None, max_length=500)
    device_id: Optional[str] = None


class BatchAnalyzeRequest(BaseModel):
    """Batch analysis request for premium users."""
    symbols: List[str]
    market: str = "a"
    period: str = "daily"
    device_id: Optional[str] = None


class SubscriptionRequest(BaseModel):
    """Subscription upgrade request."""
    tier: str  # basic, premium


class AfdianWebhookRequest(BaseModel):
    """爱发电 webhook request placeholder."""


# ===================== Dependencies =====================


async def get_current_user(
    authorization: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Get current authenticated user."""
    if not authorization:
        raise HTTPException(status_code=401, detail="Authorization header required")

    # Extract token from "Bearer <token>"
    if authorization.startswith("Bearer "):
        token = authorization[7:]
    else:
        token = authorization

    payload = user_service.decode_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token")

    user = await user_service.get_user_info(db, int(user_id))
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return user


async def get_optional_current_user(
    authorization: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db),
) -> Optional[User]:
    """Get current user if token is provided, otherwise return None."""
    if not authorization:
        return None
    try:
        if authorization.startswith("Bearer "):
            token = authorization[7:]
        else:
            token = authorization
        payload = user_service.decode_token(token)
        if not payload or not payload.get("sub"):
            return None
        return await user_service.get_user_info(db, int(payload["sub"]))
    except Exception:
        return None


LIMITS = {"free": 1}   # guest (unauthenticated) — single tier
USER_LIMITS = {"free": 3, "basic": 5, "premium": 15}  # registered users
ALLOWED_MARKETS = {
    "free": {"a"},
    "basic": {"a", "hk", "us", "futures"},
    "premium": {"a", "hk", "us", "futures"},
}

# ===================== Runtime Settings Cache =====================
# Source of truth: backend/.env file. Populated at startup, updated live by admin.

_SETTINGS_ENV_MAP = {
    "llm": {
        "provider": "LLM_PROVIDER",
        "api_key": "LLM_API_KEY",
        "base_url": "LLM_BASE_URL",
        "model": "LLM_MODEL",
        "max_tokens": "LLM_MAX_TOKENS",
        "temperature": "LLM_TEMPERATURE",
    },
    "afdian": {
        "webhook_token": "AFDIAN_WEBHOOK_TOKEN",
        "basic_plan_id": "AFDIAN_BASIC_PLAN_ID",
        "premium_plan_id": "AFDIAN_PREMIUM_PLAN_ID",
        "basic_link": "AFDIAN_BASIC_LINK",
        "premium_link": "AFDIAN_PREMIUM_LINK",
        "user_id": "AFDIAN_USER_ID",
        "api_token": "AFDIAN_API_TOKEN",
    },
    "email": {
        "resend_api_key": "RESEND_API_KEY",
        "app_base_url": "APP_BASE_URL",
        # EMAIL_FROM is not admin-configurable; read directly from settings.email_from
    },
    "app": {
        "name": "APP_NAME",
    },
    "pricing": {
        "period": "PRICING_PERIOD",
        "guest_daily": "PRICING_GUEST_DAILY",
        "free_daily": "PRICING_FREE_DAILY",
        "basic_price": "PRICING_BASIC_PRICE",
        "basic_daily": "PRICING_BASIC_DAILY",
        "premium_price": "PRICING_PREMIUM_PRICE",
        "premium_daily": "PRICING_PREMIUM_DAILY",
    },
}

_settings_cache: dict = {}


def _load_settings_cache():
    """Populate _settings_cache from current settings object (which reads .env)."""
    global _settings_cache, settings
    _settings_cache = {
        "llm": {
            "provider": settings.llm_provider,
            "api_key": settings.llm_api_key,
            "base_url": settings.llm_base_url,
            "model": settings.llm_model,
            "max_tokens": settings.llm_max_tokens,
            "temperature": settings.llm_temperature,
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
            "app_base_url": settings.app_base_url,
        },
        "app": {
            "name": settings.app_name,
        },
        "pricing": {
            "period": settings.pricing_period,
            "guest_daily": settings.pricing_guest_daily,
            "free_daily": settings.pricing_free_daily,
            "basic": {
                "price": settings.pricing_basic_price,
                "daily": settings.pricing_basic_daily,
            },
            "premium": {
                "price": settings.pricing_premium_price,
                "daily": settings.pricing_premium_daily,
            },
            "features": [],  # loaded from DB separately
        },
    }
    _apply_quota_settings()


def _apply_quota_settings():
    """Update LIMITS / USER_LIMITS in-place from pricing settings."""
    p = _settings_cache.get("pricing", {})
    LIMITS["free"] = int(p.get("guest_daily", 1))
    USER_LIMITS["free"] = int(p.get("free_daily", 3))
    USER_LIMITS["basic"] = int(p.get("basic", {}).get("daily", 5))
    USER_LIMITS["premium"] = int(p.get("premium", {}).get("daily", 15))


def _llm_config() -> dict:
    """Current LLM config from settings cache (.env)."""
    cfg = _settings_cache.get("llm", {})
    return {
        "api_key": cfg.get("api_key", "") or os.getenv("OPENAI_API_KEY", ""),
        "provider": cfg.get("provider", settings.llm_provider),
        "base_url": cfg.get("base_url", settings.llm_base_url),
        "model": cfg.get("model", settings.llm_model),
        "max_tokens": int(cfg.get("max_tokens", settings.llm_max_tokens)),
        "temperature": float(cfg.get("temperature", settings.llm_temperature)),
    }


def _afdian(key: str) -> str:
    """Current afdian setting from settings cache."""
    return _settings_cache.get("afdian", {}).get(key, "")


def _email(key: str) -> str:
    """Current email setting from settings cache."""
    return _settings_cache.get("email", {}).get(key, "")


def _app(key: str) -> str:
    """Current app setting from settings cache."""
    return _settings_cache.get("app", {}).get(key, "")


def _tomorrow_reset_iso() -> str:
    now = datetime.utcnow()
    tomorrow = (now + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    return tomorrow.isoformat()


def _parse_money_value(raw: str) -> Optional[float]:
    if not raw:
        return None
    raw = raw.strip().lower()
    m = re.search(r"(\d+(?:\.\d+)?)", raw)
    if not m:
        return None
    value = float(m.group(1))
    if "万" in raw or "w" in raw:
        value *= 10000
    return value


def _extract_holding_fields(text: Optional[str]) -> dict:
    if not text:
        return {}
    out = {}
    m_qty = re.search(r"(?:持有|仓位|有)\s*(\d+)\s*股", text)
    m_cost = re.search(r"(?:成本|成本价|买入)\s*(\d+(?:\.\d+)?)", text)
    m_plan = re.search(r"(?:计划投入|投入|计划投)\s*([\d\.]+(?:万|w)?)", text, re.IGNORECASE)
    m_max = re.search(r"(?:最多|最大(?:持仓)?)\s*(\d+)\s*股", text)
    if m_qty:
        out["holding_quantity"] = int(m_qty.group(1))
    if m_cost:
        out["cost_price"] = float(m_cost.group(1))
    if m_max:
        out["max_position"] = int(m_max.group(1))
    return out


def _build_position_advice(
    action: str,
    current_price: float,
    holding_quantity: Optional[int],
    cost_price: Optional[float],
    max_position: Optional[int],
) -> dict:
    quantity = holding_quantity or 0
    if not max_position or max_position <= 0:
        max_position = quantity if quantity > 0 else None
    ratio = (quantity / max_position) if max_position else None

    if ratio is not None and ratio >= 0.85:
        suggested_action = "sell"
        suggested_quantity = max(1, int(quantity * 0.25)) if quantity > 0 else 0
        reason = "仓位已接近上限，建议适度减仓控制风险"
    elif action == "buy" and quantity > 0 and ratio is not None and ratio < 0.5:
        suggested_action = "buy"
        suggested_quantity = max(1, int((max_position - quantity) * 0.2)) if max_position else max(1, int(quantity * 0.2))
        reason = "当前仓位偏低，可按计划小幅加仓"
    elif action == "sell" and quantity > 0:
        suggested_action = "sell"
        suggested_quantity = max(1, int(quantity * 0.2))
        reason = "信号偏弱，建议分批减仓"
    else:
        suggested_action = "hold"
        suggested_quantity = 0
        reason = "仓位与信号匹配，继续观察"

    return {
        "current_holding": quantity,
        "cost_price": cost_price,
        "max_position": max_position,
        "suggested_action": suggested_action,
        "suggested_quantity": suggested_quantity,
        "reason": reason,
        "current_price": current_price,
    }


def _normalize_result(raw_result: dict, current_price: float, req: AnalyzeRequest) -> dict:
    action = (raw_result or {}).get("action")
    signal = (raw_result or {}).get("signal", "neutral")
    action_map = {
        "buy": "buy",
        "sell": "sell",
        "hold": "hold",
        "open_long": "buy",
        "close_long": "sell",
        "open_short": "sell",
        "close_short": "buy",
    }
    action = action_map.get(str(action).lower(), action)
    if action == "adjust_position":
        parsed_text = _extract_holding_fields(req.holding_text)
        holding_quantity = req.holding_quantity if req.holding_quantity is not None else parsed_text.get("holding_quantity", 0)
        target_position = int((raw_result or {}).get("target_position", holding_quantity) or 0)
        action = "buy" if target_position > int(holding_quantity or 0) else ("sell" if target_position < int(holding_quantity or 0) else "hold")
    if action not in {"buy", "sell", "hold"}:
        action = {"bullish": "buy", "bearish": "sell", "neutral": "hold"}.get(signal, "hold")
    confidence_raw = float((raw_result or {}).get("confidence", 50))
    confidence = int(confidence_raw if confidence_raw > 1 else confidence_raw * 100)
    target_price = (raw_result or {}).get("target_price") or (raw_result or {}).get("take_profit") or (raw_result or {}).get("entry_price") or current_price
    stop_loss = (raw_result or {}).get("stop_loss") or current_price * 0.97
    reasons = []
    if isinstance((raw_result or {}).get("reasons"), list):
        reasons.extend([str(x) for x in (raw_result or {}).get("reasons", []) if x])
    if (raw_result or {}).get("analysis"):
        reasons.append((raw_result or {}).get("analysis"))
    if (raw_result or {}).get("reasoning"):
        reasons.append((raw_result or {}).get("reasoning"))
    if (raw_result or {}).get("market_diagnosis"):
        reasons.append((raw_result or {}).get("market_diagnosis"))
    if (raw_result or {}).get("opportunity_assessment"):
        reasons.append((raw_result or {}).get("opportunity_assessment"))
    if (raw_result or {}).get("risk_analysis"):
        reasons.append((raw_result or {}).get("risk_analysis"))
    if (raw_result or {}).get("execution_plan"):
        reasons.append((raw_result or {}).get("execution_plan"))
    parsed_text = _extract_holding_fields(req.holding_text)
    holding_quantity = req.holding_quantity if req.holding_quantity is not None else parsed_text.get("holding_quantity")
    cost_price = req.cost_price if req.cost_price is not None else parsed_text.get("cost_price")
    max_position = req.max_position if req.max_position is not None else parsed_text.get("max_position")
    position_advice = _build_position_advice(action, current_price, holding_quantity, cost_price, max_position)
    return {
        "action": action,
        "signal": signal,
        "confidence": confidence,
        "target_price": float(target_price),
        "stop_loss": float(stop_loss),
        "reason": reasons[0] if reasons else "基于技术指标综合判断",
        "reasons": reasons[:6] if reasons else ["基于技术指标综合判断"],
        "market_diagnosis": str((raw_result or {}).get("market_diagnosis", "") or ""),
        "opportunity_assessment": str((raw_result or {}).get("opportunity_assessment", "") or ""),
        "risk_analysis": str((raw_result or {}).get("risk_analysis", "") or ""),
        "execution_plan": str((raw_result or {}).get("execution_plan", "") or ""),
        "opportunity_quality": str((raw_result or {}).get("opportunity_quality", "") or ""),
        "risk_factors": [str(x) for x in ((raw_result or {}).get("risk_factors") or []) if x],
        "position_advice": position_advice,
    }


def _mask_result_for_free_tier(result: dict) -> dict:
    """Mask specific numeric fields in analysis result for free-tier users.

    Strategy: show market diagnosis and opportunity direction fully (builds trust),
    mask exact price numbers (target/stop/confidence) to create upgrade incentive.
    """
    import re
    import copy

    masked = copy.deepcopy(result)

    def mask_prices(text: str) -> str:
        """Replace decimal prices and large integers with ██ in text."""
        text = re.sub(r'\b\d+\.\d+\b', '██', str(text))
        text = re.sub(r'\b[1-9]\d{2,}\b', '██', text)
        return text

    # Null out numeric fields — frontend renders '—' or '██' based on _masked flag
    masked["target_price"] = None
    masked["stop_loss"] = None
    masked["confidence"] = None

    # Mask price numbers in step 3 (risk) and step 4 (execution plan) text
    masked["risk_analysis"] = mask_prices(masked.get("risk_analysis", ""))
    masked["execution_plan"] = mask_prices(masked.get("execution_plan", ""))

    # Keep first 2 reasons, replace 3rd with masked placeholder
    reasons = masked.get("reasons", [])
    if len(reasons) > 2:
        masked["reasons"] = reasons[:2] + ["████████（升级解锁完整研判）"]
    masked["reason"] = masked["reasons"][0] if masked["reasons"] else masked.get("reason", "")

    masked["_masked"] = True
    return masked


async def _get_device_subscription(db: AsyncSession, device_id: str) -> str:
    result = await db.execute(select(DeviceSubscription).where(DeviceSubscription.device_id == device_id))
    row = result.scalars().first()
    if not row:
        return "free"
    # Treat expired subscriptions as free
    if row.expires_at and row.expires_at < datetime.utcnow():
        return "free"
    return row.subscription_tier


async def _get_or_create_device_subscription(db: AsyncSession, device_id: str) -> DeviceSubscription:
    """Get or create DeviceSubscription record (returns full ORM object)."""
    result = await db.execute(select(DeviceSubscription).where(DeviceSubscription.device_id == device_id))
    row = result.scalars().first()
    if not row:
        row = DeviceSubscription(
            device_id=device_id,
            subscription_tier="free",
            is_banned=False,
            has_had_pro_trial=False,
        )
        db.add(row)
        await db.commit()
        await db.refresh(row)
    return row


async def _get_or_create_usage_log(db: AsyncSession, device_id: str) -> UsageLog:
    today = datetime.utcnow().date()
    result = await db.execute(
        select(UsageLog).where(UsageLog.device_id == device_id, UsageLog.date == today)
    )
    usage = result.scalars().first()
    if usage:
        return usage
    subscription = await _get_device_subscription(db, device_id)
    usage = UsageLog(device_id=device_id, date=today, count=0, subscription=subscription)
    db.add(usage)
    await db.commit()
    await db.refresh(usage)
    return usage


async def _increment_device_usage(db: AsyncSession, device_id: str) -> UsageLog:
    """Atomically increment device usage count using upsert to prevent race conditions."""
    today = datetime.utcnow().date()
    subscription = await _get_device_subscription(db, device_id)
    stmt = pg_insert(UsageLog).values(
        device_id=device_id, date=today, count=1, subscription=subscription
    ).on_conflict_do_update(
        index_elements=["device_id", "date"],
        set_={"count": UsageLog.count + 1},
    )
    await db.execute(stmt)
    await db.commit()
    result = await db.execute(
        select(UsageLog).where(UsageLog.device_id == device_id, UsageLog.date == today)
    )
    return result.scalars().first()


async def _save_analysis_history(
    db: AsyncSession,
    req_symbol: str,
    req_market: str,
    req_period: str,
    result_payload: dict,
    current_user: Optional[User] = None,
    device_id: Optional[str] = None,
) -> AnalysisHistory:
    analyzed_at = datetime.utcnow()
    history = AnalysisHistory(
        user_id=current_user.id if current_user else None,
        device_id=(device_id or "").strip() or None,
        symbol=req_symbol,
        market=req_market,
        period=req_period,
        result=json.dumps(result_payload, ensure_ascii=False),
        analysis_date=analyzed_at.date(),
        analyzed_at=analyzed_at,
    )
    db.add(history)
    await db.commit()
    await db.refresh(history)
    return history


# ===================== Auth Routes =====================


@app.post("/api/auth/register")
@limiter.limit("2/day")
async def register(
    request: Request,
    req: RegisterRequest,
    db: AsyncSession = Depends(get_db),
):
    """Register a new user with email and password. Rate-limited to 2 registrations/day per IP."""
    email = req.email.lower().strip()
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="Invalid email address")
    if len(req.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    existing = await user_service.get_user_by_email(db, email)
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")

    user = await user_service.register_user(db, email, req.password, req.username)

    resend_key = _email("resend_api_key")
    if resend_key:
        # Fire-and-forget email — do NOT await so registration returns instantly
        asyncio.create_task(send_verification_email(
            to_email=user.email,
            username=user.username or user.email.split("@")[0],
            token=user.email_verification_token,
            resend_api_key=resend_key,
            email_from=settings.email_from,
            app_base_url=_email("app_base_url"),
            app_name=_app("name"),
        ))
        return {
            "pending_verification": True,
            "email": user.email,
            "message": "注册成功！请查收验证邮件并点击链接激活账号。",
        }
    else:
        # No email service configured — auto-verify so users can log in immediately
        await user_service.verify_email(db, user)
        return {
            "pending_verification": False,
            "email": user.email,
            "message": "注册成功！请直接登录。",
        }


@app.post("/api/auth/resend-verification")
async def resend_verification(req: ResendVerificationRequest, db: AsyncSession = Depends(get_db)):
    """Resend email verification link."""
    email = req.email.lower().strip() if req.email else ""
    if not email:
        raise HTTPException(status_code=400, detail="请提供邮箱地址")

    user = await user_service.get_user_by_email(db, email)
    # Return success regardless to avoid user enumeration
    if user and not user.email_verified:
        token = await user_service.refresh_verification_token(db, user)
        # Fire-and-forget to avoid blocking the response
        asyncio.create_task(send_verification_email(
            to_email=user.email,
            username=user.username or user.email.split("@")[0],
            token=token,
            resend_api_key=_email("resend_api_key"),
            email_from=settings.email_from,
            app_base_url=_email("app_base_url"),
            app_name=_app("name"),
        ))
    return {"message": "若该邮箱已注册且未验证，验证邮件已重新发送。"}


@app.get("/api/auth/verify-email")
async def verify_email(token: str, db: AsyncSession = Depends(get_db)):
    """Verify email address via token from verification email."""
    if not token:
        raise HTTPException(status_code=400, detail="缺少验证 token")

    user = await user_service.get_user_by_verification_token(db, token)
    if not user:
        raise HTTPException(status_code=400, detail="验证链接无效或已被使用")
    if user.email_verified:
        return {"message": "邮箱已验证，请直接登录。", "already_verified": True}
    if user.email_verification_expires and user.email_verification_expires < datetime.utcnow():
        raise HTTPException(status_code=400, detail="验证链接已过期，请重新发送验证邮件")

    await user_service.verify_email(db, user)
    return {"message": "邮箱验证成功！现在可以登录了。", "email": user.email}


@app.post("/api/auth/login")
async def login(req: LoginRequest, db: AsyncSession = Depends(get_db)):
    """Email/password login."""
    user = await user_service.authenticate_user(db, req.email, req.password)
    if not user:
        raise HTTPException(status_code=401, detail="邮箱或密码错误")

    if not user.email_verified:
        raise HTTPException(
            status_code=403,
            detail="邮箱尚未验证，请查收注册时发送的验证邮件",
            headers={"X-Unverified-Email": user.email},
        )

    access_token = user_service.create_access_token(data={"sub": str(user.id)})
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "subscription_tier": user.subscription_tier,
        },
    }


@app.get("/api/auth/me")
async def get_me(current_user: User = Depends(get_current_user)):
    """Get current user info."""
    return {
        "id": current_user.id,
        "username": current_user.username,
        "email": current_user.email,
        "subscription_tier": current_user.subscription_tier,
        "daily_usage": current_user.daily_usage,
        "last_usage_date": current_user.last_usage_date.isoformat() if current_user.last_usage_date else None,
        "invite_code": current_user.invite_code,
        "bonus_quota": current_user.bonus_quota or 0,
        "used_invite_code": current_user.used_invite_code,
    }


# ===================== Subscription Routes =====================


@app.post("/api/subscription/upgrade")
async def upgrade_subscription(
    req: SubscriptionRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Upgrade user subscription (manual for now, can integrate 爱发电 later)."""
    if req.tier not in ["basic", "premium"]:
        raise HTTPException(status_code=400, detail="Invalid tier")

    await user_service.update_subscription(db, current_user.id, req.tier)

    return {"message": f"Subscription upgraded to {req.tier}"}


# ===================== Invite Routes =====================


class UseInviteRequest(BaseModel):
    invite_code: str


@app.post("/api/invite/use")
async def use_invite_code(
    req: UseInviteRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Apply an invite code. Both inviter and invitee get +10 bonus analyses."""
    code = req.invite_code.strip().upper()
    if not code:
        raise HTTPException(status_code=400, detail="请输入邀请码")

    # Can't use own code
    if current_user.invite_code and current_user.invite_code.upper() == code:
        raise HTTPException(status_code=400, detail="不能使用自己的邀请码")

    # Each user may only redeem one invite code ever
    if current_user.used_invite_code:
        raise HTTPException(status_code=400, detail="您已使用过邀请码，每个账号只能兑换一次")

    # Find inviter
    result = await db.execute(select(User).where(User.invite_code == code))
    inviter = result.scalars().first()
    if not inviter:
        raise HTTPException(status_code=404, detail="邀请码无效，请检查后重试")

    # Reward both parties and mark invitee as having used a code
    from sqlalchemy import update as _upd
    await db.execute(
        _upd(User).where(User.id == inviter.id).values(bonus_quota=User.bonus_quota + 10)
    )
    await db.execute(
        _upd(User).where(User.id == current_user.id).values(
            bonus_quota=User.bonus_quota + 10,
            used_invite_code=code,
        )
    )
    await db.commit()
    logger.info("invite_used inviter=%s invitee=%s code=%s", inviter.id, current_user.id, code)
    return {"success": True, "message": "邀请码使用成功！您和邀请人各获得 +10 次分析次数", "bonus_added": 10}


@app.get("/api/subscription/status")
async def get_subscription_status(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get user subscription status."""
    _, remaining = await user_service.check_daily_limit(db, current_user)
    daily_limit = USER_LIMITS.get(current_user.subscription_tier, 1)
    return {
        "tier": current_user.subscription_tier,
        "daily_limit": daily_limit,
        "used": current_user.daily_usage,
        "remaining": remaining,
    }


@app.get("/api/subscription")
async def get_subscription_by_device(
    device_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get subscription status by device id (no login required)."""
    effective_tier = await _get_device_subscription(db, device_id)
    usage = await _get_or_create_usage_log(db, device_id)
    daily_limit = LIMITS.get(effective_tier, 1)
    remaining = max(daily_limit - usage.count, 0)
    sub_result = await db.execute(select(DeviceSubscription).where(DeviceSubscription.device_id == device_id))
    sub_row = sub_result.scalars().first()
    expires_at = sub_row.expires_at.isoformat() if (sub_row and sub_row.expires_at) else None
    trial_used = bool(sub_row and sub_row.has_had_pro_trial and effective_tier == "free")
    is_banned = bool(sub_row and sub_row.is_banned)
    return {
        "subscription": effective_tier,
        "remaining": remaining,
        "daily_limit": daily_limit,
        "used": usage.count,
        "resets_at": _tomorrow_reset_iso(),
        "expires_at": expires_at,
        "trial_used": trial_used,
        "is_banned": is_banned,
    }


# ===================== 爱发电 API 主动激活 =====================


def _afdian_sign(token: str, user_id: str, params: str, ts: int) -> str:
    """Compute Afdian API signature: md5(token + params{params} + ts{ts} + user_id{user_id})."""
    raw = f"{token}params{params}ts{ts}user_id{user_id}"
    return hashlib.md5(raw.encode("utf-8")).hexdigest()


def _afdian_tier_from_order(order: dict) -> str:
    """Determine subscription tier from an Afdian order dict."""
    plan_id = str(order.get("plan_id") or "")
    if _afdian("premium_plan_id") and plan_id == _afdian("premium_plan_id"):
        return "premium"
    if _afdian("basic_plan_id") and plan_id == _afdian("basic_plan_id"):
        return "basic"
    # Fallback: determine by amount
    amount = float(order.get("total_amount") or 0)
    if amount >= 49:
        return "premium"
    if amount >= 19.9:
        return "basic"
    return "free"


class ActivateRequest(BaseModel):
    out_trade_no: str   # Afdian order number shown in order confirmation
    device_id: str      # user's device_id


@app.post("/api/subscription/activate")
@limiter.limit("5/minute")
async def activate_subscription(
    request: Request,
    req: ActivateRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Activate device subscription by verifying an Afdian order number.
    No webhook or public domain required — the backend queries Afdian API directly.
    """
    if not _afdian("user_id") or not _afdian("api_token"):
        raise HTTPException(status_code=503, detail="Afdian API not configured")

    out_trade_no = req.out_trade_no.strip()
    device_id = req.device_id.strip()
    if not out_trade_no or not device_id:
        raise HTTPException(status_code=400, detail="out_trade_no and device_id are required")

    # Check if this order was already activated
    existing = await db.execute(
        select(AfdianOrder).where(AfdianOrder.out_trade_no == out_trade_no)
    )
    if existing.scalars().first():
        raise HTTPException(status_code=409, detail="This order has already been activated")

    # Query Afdian API
    params_str = json.dumps({"out_trade_no": out_trade_no})
    ts = int(datetime.utcnow().timestamp())
    sign = _afdian_sign(_afdian("api_token"), _afdian("user_id"), params_str, ts)

    payload = {
        "user_id": _afdian("user_id"),
        "params": params_str,
        "ts": ts,
        "sign": sign,
    }

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                "https://afdian.net/api/open/query-order",
                json=payload,
            )
            data = resp.json()
    except Exception as e:
        logger.error("Afdian API request failed: %s", e)
        raise HTTPException(status_code=502, detail="Failed to reach Afdian API")

    if data.get("ec") != 200:
        logger.warning("Afdian API error: %s", data)
        raise HTTPException(status_code=400, detail=f"Afdian API error: {data.get('em', 'unknown')}")

    orders = (data.get("data") or {}).get("list") or []
    matched = next((o for o in orders if str(o.get("out_trade_no")) == out_trade_no), None)

    if not matched:
        raise HTTPException(status_code=404, detail="Order not found — check your order number")
    if matched.get("status") != 2:
        raise HTTPException(status_code=400, detail="Order not yet paid (status != 2)")

    tier = _afdian_tier_from_order(matched)
    if tier == "free":
        raise HTTPException(status_code=400, detail="Order amount does not match any subscription plan")

    # Activate or renew device subscription
    result = await db.execute(
        select(DeviceSubscription).where(DeviceSubscription.device_id == device_id)
    )
    row = result.scalars().first()
    now = datetime.utcnow()
    new_expires = now + timedelta(days=30)
    if row:
        same_tier = (row.subscription_tier == tier)
        still_active = (row.expires_at is not None and row.expires_at > now)
        if same_tier and still_active:
            # Renewal: stack 30 days onto current expiry
            new_expires = row.expires_at + timedelta(days=30)
        row.expires_at = new_expires
        row.subscription_tier = tier
    else:
        db.add(DeviceSubscription(device_id=device_id, subscription_tier=tier, expires_at=new_expires))

    # Update usage log
    usage = await _get_or_create_usage_log(db, device_id)
    usage.subscription = tier

    # Record this order to prevent reuse
    db.add(AfdianOrder(
        out_trade_no=out_trade_no,
        device_id=device_id,
        plan_id=str(matched.get("plan_id") or ""),
        tier=tier,
        total_amount=str(matched.get("total_amount") or ""),
    ))

    await db.commit()
    logger.info("afdian_activate device=%s tier=%s order=%s expires=%s", device_id, tier, out_trade_no, new_expires)
    return {"status": "activated", "device_id": device_id, "tier": tier, "expires_at": new_expires.isoformat()}


# ===================== 爱发电 Webhook =====================


@app.post("/api/webhook/afdian")
async def afdian_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Handle 爱发电 subscription webhook.

    爱发电 pushes a POST JSON to the configured URL on every new order.
    Verify via ?token= query parameter; respond with {"ec": 200, "em": ""}.
    """
    # Verify token via URL query param
    if settings.afdian_webhook_token:
        req_token = request.query_params.get("token", "")
        if req_token != _afdian("webhook_token"):
            return {"ec": 403, "em": "invalid_token"}

    body = await request.json()
    data = body.get("data") or {}
    if data.get("type") != "order":
        return {"ec": 200, "em": ""}

    order = data.get("order") or {}
    if order.get("status") != 2:  # 2 = payment success
        return {"ec": 200, "em": ""}

    plan_id = str(order.get("plan_id") or "")
    remark = str(order.get("remark") or "").strip()

    # Determine tier from plan_id, fallback to amount
    if _afdian("premium_plan_id") and plan_id == _afdian("premium_plan_id"):
        tier = "premium"
    elif _afdian("basic_plan_id") and plan_id == _afdian("basic_plan_id"):
        tier = "basic"
    else:
        amount = float(order.get("total_amount") or 0)
        if amount >= 49:
            tier = "premium"
        elif amount >= 19.9:
            tier = "basic"
        else:
            tier = "free"

    device_id = remark
    if not device_id:
        logger.warning("afdian_webhook: missing device_id in remark, order=%s", order.get("out_trade_no"))
        return {"ec": 200, "em": "missing_device_id"}

    result = await db.execute(select(DeviceSubscription).where(DeviceSubscription.device_id == device_id))
    row = result.scalars().first()
    now = datetime.utcnow()
    new_expires = now + timedelta(days=30)
    if row:
        same_tier = (row.subscription_tier == tier)
        still_active = (row.expires_at is not None and row.expires_at > now)
        if same_tier and still_active:
            new_expires = row.expires_at + timedelta(days=30)
        row.expires_at = new_expires
        row.subscription_tier = tier
    else:
        db.add(DeviceSubscription(device_id=device_id, subscription_tier=tier, expires_at=new_expires))
    await db.commit()

    usage = await _get_or_create_usage_log(db, device_id)
    usage.subscription = tier
    await db.commit()
    logger.info("afdian_webhook device=%s tier=%s plan_id=%s expires=%s", device_id, tier, plan_id, new_expires)
    return {"ec": 200, "em": ""}


# ===================== Analysis Routes =====================


@app.post("/api/analyze")
@limiter.limit("10/minute")
async def analyze(
    request: Request,
    req: AnalyzeRequest,
    current_user: Optional[User] = Depends(get_optional_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Analyze stock/futures with LLM."""
    usage_mode = "account" if current_user else "device"
    device_id = (req.device_id or "").strip()
    if usage_mode == "device" and not device_id:
        raise HTTPException(status_code=400, detail="device_id is required for guest mode")

    if usage_mode == "account":
        subscription = current_user.subscription_tier
        # Trial logic for registered users
        is_first_trial = not current_user.has_had_pro_trial
        if is_first_trial:
            effective_tier = "premium"
            subscription = "premium"
        else:
            effective_tier = current_user.subscription_tier
        has_limit, remaining = await user_service.check_daily_limit(db, current_user)
        # registered users get 3/day on free tier (vs 1/day for guests)
        limits_map = USER_LIMITS
    else:
        device_sub = await _get_or_create_device_subscription(db, device_id)
        # Ban check — before everything
        if device_sub.is_banned:
            raise HTTPException(status_code=403, detail={"code": "device_banned", "message": "设备已被封禁"})
        # Trial logic
        is_first_trial = not device_sub.has_had_pro_trial
        if is_first_trial:
            effective_tier = "premium"
            subscription = "premium"
        elif device_sub.subscription_tier == "free":
            raise HTTPException(status_code=403, detail={"code": "trial_expired", "message": "免费体验已结束，请注册账号继续使用"})
        else:
            effective_tier = device_sub.subscription_tier
            subscription = device_sub.subscription_tier
        usage = await _get_or_create_usage_log(db, device_id)
        limits_map = LIMITS
        limit = limits_map.get(subscription, 1)
        remaining = max(limit - usage.count, 0)
        has_limit = remaining > 0 or is_first_trial

    if req.market not in ALLOWED_MARKETS.get(subscription, {"a"}):
        raise HTTPException(status_code=403, detail="Current subscription does not support this market")
    if not has_limit:
        raise HTTPException(
            status_code=429,
            detail="今日分析次数已用完，请升级套餐获取更多次数",
        )

    # --- Symbol format validation ---
    symbol_clean = req.symbol.strip().upper()
    if not symbol_clean:
        raise HTTPException(status_code=400, detail="股票/期货代码不能为空")
    if len(symbol_clean) > 20:
        raise HTTPException(status_code=400, detail="代码格式错误：长度超出范围")

    import re as _re
    _SYMBOL_PATTERNS = {
        "a":       (_re.compile(r"^\d{6}$"),       "A股代码应为6位数字，如 600519"),
        "hk":      (_re.compile(r"^\d{4,5}$"),     "港股代码应为4-5位数字，如 00700"),
        "us":      (_re.compile(r"^[A-Z]{1,5}$"),  "美股代码应为1-5个大写字母，如 AAPL"),
        "futures": (_re.compile(r"^[A-Z]{1,3}$"),  "期货代码应为1-3个大写字母，如 MA、SA"),
    }
    if req.market in _SYMBOL_PATTERNS:
        pattern, hint = _SYMBOL_PATTERNS[req.market]
        if not pattern.match(symbol_clean):
            raise HTTPException(status_code=400, detail=f"代码格式错误：{hint}")

    # Validate numeric inputs when provided
    if req.holding_quantity is not None and req.holding_quantity < 0:
        raise HTTPException(status_code=400, detail="持有数量不能为负数")
    if req.cost_price is not None and req.cost_price <= 0:
        raise HTTPException(status_code=400, detail="成本价必须大于0")
    if req.max_position is not None and req.max_position <= 0:
        raise HTTPException(status_code=400, detail="最大持仓必须大于0")

    # Check position analysis daily limit for basic tier
    has_position_params = any(
        x is not None for x in [req.holding_quantity, req.cost_price, req.max_position]
    )
    if has_position_params and subscription == "basic":
        if usage_mode == "device":
            _pos_log = await _get_or_create_usage_log(db, device_id)
            if (_pos_log.position_count or 0) >= 1:
                raise HTTPException(
                    status_code=429,
                    detail="今日持仓参数分析次数已用完（标准版每日1次），升级专业版可无限使用",
                )
        else:
            today = datetime.utcnow().date()
            last_pos_date = current_user.last_position_date.date() if current_user.last_position_date else None
            pos_used = current_user.daily_position_usage or 0
            if last_pos_date == today and pos_used >= 1:
                raise HTTPException(
                    status_code=429,
                    detail="今日持仓参数分析次数已用完（标准版每日1次），升级专业版可无限使用",
                )

    # --- Enqueue async task ---
    task_id = str(uuid.uuid4())
    if not settings.llm_api_key:
        raise HTTPException(status_code=503, detail="AI 分析服务暂未配置，请联系管理员")

    # Consume quota upfront (before queuing)
    if usage_mode == "account":
        await user_service.increment_usage(db, current_user)
        _, new_remaining = await user_service.check_daily_limit(db, current_user)
        used = current_user.daily_usage
        daily_limit_shown = USER_LIMITS.get(subscription, 3)
    else:
        usage_log = await _increment_device_usage(db, device_id)
        limit = LIMITS.get(subscription, 1)
        new_remaining = max(limit - usage_log.count, 0)
        used = usage_log.count
        daily_limit_shown = limit

    # Increment position analysis counter for basic tier
    has_position_params = any(x is not None for x in [req.holding_quantity, req.cost_price, req.max_position])
    if has_position_params and subscription == "basic":
        if usage_mode == "device":
            _pos_log = await _get_or_create_usage_log(db, device_id)
            _pos_log.position_count = (_pos_log.position_count or 0) + 1
            await db.commit()
        else:
            from sqlalchemy import update as _update
            now_dt = datetime.utcnow()
            today_dt = now_dt.date()
            last_pos = current_user.last_position_date.date() if current_user.last_position_date else None
            new_pos_usage = 1 if last_pos != today_dt else (current_user.daily_position_usage or 0) + 1
            await db.execute(
                _update(User).where(User.id == current_user.id).values(
                    daily_position_usage=new_pos_usage,
                    last_position_date=now_dt,
                )
            )
            await db.commit()

    # Enqueue the analysis task (with rollback notice if queue is unavailable)
    try:
        await request.app.state.redis.enqueue_job(
            "analyze_task",
            task_id,
            symbol_clean,
            req.market,
            req.period,
            req.history_days or 90,
            req.holding_quantity,
            req.cost_price,
            req.max_position,
            subscription,
            usage_mode,
            current_user.id if current_user else None,
            device_id if usage_mode == "device" else None,
            _job_id=task_id,
        )
    except Exception as eq_err:
        logger.error("enqueue_job failed after quota deducted: %s", eq_err)
        # Attempt to roll back the quota that was consumed
        try:
            if usage_mode == "account" and current_user:
                from sqlalchemy import update as _update_rb
                if current_user.daily_usage > 0:
                    await db.execute(
                        _update_rb(User).where(User.id == current_user.id)
                        .values(daily_usage=User.daily_usage - 1)
                    )
                else:
                    # was consuming from bonus
                    await db.execute(
                        _update_rb(User).where(User.id == current_user.id)
                        .values(bonus_quota=User.bonus_quota + 1)
                    )
                await db.commit()
            elif usage_mode == "device":
                from sqlalchemy import text as _text
                today = datetime.utcnow().date()
                await db.execute(
                    _text("UPDATE usage_logs SET count = GREATEST(0, count - 1) WHERE device_id = :did AND date = :d"),
                    {"did": device_id, "d": today}
                )
                await db.commit()
        except Exception as rb_err:
            logger.error("quota rollback also failed: %s", rb_err)
        raise HTTPException(status_code=503, detail="任务队列暂时不可用，请稍后重试（配额已尝试回滚）")

    # Mark trial as used (after successful enqueue)
    if is_first_trial:
        from sqlalchemy import update as _update_trial
        if usage_mode == "device":
            await db.execute(
                _update_trial(DeviceSubscription)
                .where(DeviceSubscription.device_id == device_id)
                .values(has_had_pro_trial=True)
            )
        else:
            await db.execute(
                _update_trial(User)
                .where(User.id == current_user.id)
                .values(has_had_pro_trial=True)
            )
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
    }


@app.get("/api/task/{task_id}")
async def get_task_status(task_id: str, request: Request):
    """Poll task status. Returns status + result when done."""
    raw = await request.app.state.redis.get(f"task:{task_id}")
    if raw is None:
        raise HTTPException(status_code=404, detail="Task not found or expired")
    return json.loads(raw)


@app.websocket("/ws/task/{task_id}")
async def ws_task_status(websocket: WebSocket, task_id: str):
    """WebSocket: push task result when ready, then close."""
    await websocket.accept()
    try:
        redis = websocket.app.state.redis
        # Poll Redis until result is ready (max 5 minutes = 600 × 0.5s)
        for _ in range(600):
            raw = await redis.get(f"task:{task_id}")
            if raw:
                data = json.loads(raw)
                if data.get("status") in ("done", "failed"):
                    await websocket.send_json(data)
                    break
            await asyncio.sleep(0.5)
        else:
            await websocket.send_json({"status": "timeout", "task_id": task_id})
    except WebSocketDisconnect:
        pass
    finally:
        try:
            await websocket.close()
        except Exception:
            pass


@app.get("/api/analyze/limits")
async def get_limits(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get user's daily usage limits."""
    _, remaining = await user_service.check_daily_limit(db=db, user=current_user)

    daily_limit = USER_LIMITS.get(current_user.subscription_tier, 1)

    return {
        "tier": current_user.subscription_tier,
        "daily_limit": daily_limit,
        "used": current_user.daily_usage,
        "remaining": remaining,
    }


@app.get("/api/usage")
async def get_usage_by_device(
    device_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Usage endpoint from commercial plan (device-based, no login required)."""
    usage = await _get_or_create_usage_log(db, device_id)
    daily_limit = LIMITS["free"]  # guests have a single tier
    remaining = max(daily_limit - usage.count, 0)
    sub_result = await db.execute(select(DeviceSubscription).where(DeviceSubscription.device_id == device_id))
    sub_row = sub_result.scalars().first()
    trial_used = bool(sub_row and sub_row.has_had_pro_trial and sub_row.subscription_tier == "free")
    is_banned = bool(sub_row and sub_row.is_banned)
    return {
        "subscription": usage.subscription,
        "remaining": remaining,
        "resets_at": _tomorrow_reset_iso(),
        "trial_used": trial_used,
        "is_banned": is_banned,
        "daily_limit": daily_limit,
    }


@app.post("/api/analyze/batch")
@limiter.limit("3/minute")
async def analyze_batch(
    request: Request,
    req: BatchAnalyzeRequest,
    current_user: Optional[User] = Depends(get_optional_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Batch analyze stocks (premium only)."""
    usage_mode = "account" if current_user else "device"
    device_id = (req.device_id or "").strip()
    if usage_mode == "device" and not device_id:
        raise HTTPException(status_code=400, detail="device_id is required for guest mode")

    subscription = current_user.subscription_tier if current_user else (await _get_or_create_usage_log(db, device_id)).subscription
    if subscription != "premium":
        raise HTTPException(status_code=403, detail="Batch analyze is only available for premium users")

    symbols = [s.strip() for s in req.symbols if s and s.strip()]
    if not symbols:
        raise HTTPException(status_code=400, detail="symbols cannot be empty")
    if len(symbols) > 5:
        raise HTTPException(status_code=400, detail="At most 5 symbols are allowed")

    if usage_mode == "account":
        has_limit, remaining = await user_service.check_daily_limit(db, current_user)
    else:
        usage = await _get_or_create_usage_log(db, device_id)
        remaining = max(LIMITS["free"] - usage.count, 0)
        has_limit = remaining > 0
    if not has_limit or remaining < len(symbols):
        raise HTTPException(status_code=429, detail=f"Not enough quota for batch analyze. Remaining: {remaining}")

    _llm = _llm_config()
    api_key = _llm["api_key"]
    if not api_key:
        raise HTTPException(status_code=503, detail="AI 分析服务暂未配置，请联系管理员")

    results = []
    failed = []

    for symbol in symbols:
        sym_clean = symbol.strip().upper()
        if usage_mode == "account":
            await user_service.increment_usage(db, current_user)
        else:
            await _increment_device_usage(db, device_id)
        try:
            df = await data_service.fetch_market_data(
                symbol=sym_clean,
                market=req.market,
                period=req.period,
                start_date=None,
                end_date=None,
            )
            if df is None or df.empty:
                failed.append({"symbol": sym_clean, "error": f'未找到 "{sym_clean}" 的市场数据'})
                continue

            result = await llm_service.analyze_with_llm(
                df=df,
                symbol=sym_clean,
                provider=_llm["provider"],
                api_key=api_key,
                base_url=_llm["base_url"],
                model=_llm["model"],
                max_tokens=_llm["max_tokens"],
                temperature=_llm["temperature"],
                user_context={},
            )

            latest_price = float(df.iloc[-1]["close"])
            normalized = _normalize_result(
                result,
                latest_price,
                AnalyzeRequest(symbol=sym_clean, market=req.market, period=req.period),
            )
            sym_name = await get_symbol_name(sym_clean, req.market)
            if sym_name:
                from src.services.data.name_service import save_symbol_name
                asyncio.create_task(save_symbol_name(sym_clean, req.market, sym_name))
            results.append({"symbol": sym_clean, "name": sym_name, **normalized})
            await _save_analysis_history(
                db=db,
                req_symbol=sym_clean,
                req_market=req.market,
                req_period=req.period,
                result_payload={
                    "success": True,
                    "result": normalized,
                    "data": {
                        "symbol": sym_clean,
                        "name": sym_name,
                        "market": req.market,
                        "latest_price": latest_price,
                        "latest_date": datetime.fromtimestamp(df.iloc[-1]["datetime"] / 1e9).isoformat(),
                    },
                },
                current_user=current_user,
                device_id=device_id if usage_mode == "device" else None,
            )
        except TimeoutError as e:
            failed.append({"symbol": sym_clean, "error": str(e)})
        except RuntimeError as e:
            failed.append({"symbol": sym_clean, "error": str(e)})
        except Exception as e:
            logger.exception("Batch analysis error for symbol=%s", sym_clean)
            failed.append({"symbol": sym_clean, "error": "分析失败，请重试"})

    if usage_mode == "account":
        _, new_remaining = await user_service.check_daily_limit(db, current_user)
        used = current_user.daily_usage
    else:
        usage = await _get_or_create_usage_log(db, device_id)
        new_remaining = max(LIMITS["free"] - usage.count, 0)
        used = usage.count
    return {
        "success": True,
        "remaining": new_remaining,
        "usage": {"tier": subscription, "remaining": new_remaining, "used": used, "daily_limit": 15},
        "results": results,
        "failed": failed,
    }


@app.get("/api/analyze/history")
async def get_analysis_history(
    limit: int = 30,
    device_id: Optional[str] = None,
    current_user: Optional[User] = Depends(get_optional_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get persisted analysis history for current user/device."""
    limit = max(1, min(limit, 100))
    stmt = select(AnalysisHistory)
    if current_user:
        stmt = stmt.where(AnalysisHistory.user_id == current_user.id)
    else:
        device_id = (device_id or "").strip()
        if not device_id:
            raise HTTPException(status_code=400, detail="device_id is required for guest mode")
        stmt = stmt.where(AnalysisHistory.device_id == device_id)
    stmt = stmt.order_by(AnalysisHistory.analyzed_at.desc()).limit(limit)

    rows = (await db.execute(stmt)).scalars().all()
    items = []
    for row in rows:
        detail = {}
        try:
            detail = json.loads(row.result) if row.result else {}
        except json.JSONDecodeError:
            detail = {"raw_result": row.result}
        items.append(
            {
                "id": row.id,
                "symbol": row.symbol,
                "market": row.market,
                "period": row.period,
                "analysis_date": row.analysis_date.isoformat() if row.analysis_date else None,
                "analyzed_at": row.analyzed_at.isoformat() if row.analyzed_at else None,
                "detail": detail,
            }
        )
    return {"items": items}


# ===================== Market Data Routes =====================


@app.get("/api/market/{market}/{symbol}")
async def get_market_data(
    market: str,
    symbol: str,
    period: str = "daily",
    history_days: int = 90,
):
    """Get raw market data (without LLM analysis)."""
    try:
        df = await data_service.fetch_market_data(
            symbol=symbol,
            market=market,
            period=period,
            start_date=None,
            end_date=None,
        )

        # Convert to dict (last 100 rows max)
        data = df.tail(100).to_dict(orient="records")

        # Convert datetime to string
        for row in data:
            if "datetime" in row:
                row["datetime"] = datetime.fromtimestamp(row["datetime"] / 1e9).isoformat()

        return {
            "symbol": symbol,
            "market": market,
            "period": period,
            "count": len(data),
            "data": data,
        }

    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ===================== Admin Routes =====================


def _verify_admin(x_admin_token: Optional[str] = Header(None)):
    """Verify admin token."""
    if not settings.admin_token:
        raise HTTPException(status_code=503, detail="Admin endpoint not configured")
    if x_admin_token != settings.admin_token:
        raise HTTPException(status_code=403, detail="Invalid admin token")


class AdminSubscriptionRequest(BaseModel):
    device_id: str
    tier: str  # free, basic, premium


class AdminUpdateUserRequest(BaseModel):
    subscription_tier: Optional[str] = None   # free, basic, premium
    is_active: Optional[bool] = None
    reset_usage: Optional[bool] = False


class AdminSetQuotaRequest(BaseModel):
    daily_usage: Optional[int] = None   # directly write users.daily_usage (0=reset, N=already used N times)
    bonus_quota: Optional[int] = None   # directly write users.bonus_quota (permanent quota pool)


@app.post("/api/admin/subscription")
async def admin_set_subscription(
    req: AdminSubscriptionRequest,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(_verify_admin),
):
    """Manually set device subscription tier (admin only)."""
    if req.tier not in ("free", "basic", "premium"):
        raise HTTPException(status_code=400, detail="Invalid tier")

    result = await db.execute(select(DeviceSubscription).where(DeviceSubscription.device_id == req.device_id))
    row = result.scalars().first()
    if row:
        row.subscription_tier = req.tier
    else:
        db.add(DeviceSubscription(device_id=req.device_id, subscription_tier=req.tier))
    await db.commit()

    usage = await _get_or_create_usage_log(db, req.device_id)
    usage.subscription = req.tier
    await db.commit()
    logger.info("admin set device=%s tier=%s", req.device_id, req.tier)
    return {"status": "ok", "device_id": req.device_id, "tier": req.tier}


@app.get("/api/admin/stats")
async def admin_stats(
    db: AsyncSession = Depends(get_db),
    _: None = Depends(_verify_admin),
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

    # Tier distribution
    tier_result = await db.execute(
        select(DeviceSubscription.subscription_tier, func.count(DeviceSubscription.id))
        .group_by(DeviceSubscription.subscription_tier)
    )
    tier_dist = {row[0]: row[1] for row in tier_result.all()}

    # Analysis records in last 24h
    since = datetime.utcnow() - timedelta(hours=24)
    analysis_result = await db.execute(
        select(func.count(AnalysisHistory.id)).where(AnalysisHistory.analyzed_at >= since)
    )
    analysis_24h = analysis_result.scalar() or 0

    return {
        "date": today.isoformat(),
        "active_devices_today": active_devices,
        "total_requests_today": total_requests,
        "analysis_last_24h": analysis_24h,
        "tier_distribution": tier_dist,
    }


@app.get("/api/admin/users")
async def admin_list_users(
    search: Optional[str] = None,
    tier: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(_verify_admin),
):
    """List all users with optional search and tier filter (admin only)."""
    stmt = select(User)
    if search:
        stmt = stmt.where(
            User.email.ilike(f"%{search}%") | User.username.ilike(f"%{search}%")
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
        "items": [
            {
                "id": u.id,
                "email": u.email,
                "username": u.username,
                "subscription_tier": u.subscription_tier,
                "daily_usage": u.daily_usage,
                "last_usage_date": u.last_usage_date.isoformat() if u.last_usage_date else None,
                "is_active": u.is_active,
                "created_at": u.created_at.isoformat() if u.created_at else None,
                "invite_code": u.invite_code,
                "bonus_quota": u.bonus_quota or 0,
            }
            for u in rows
        ],
    }


@app.put("/api/admin/users/{user_id}")
async def admin_update_user(
    user_id: int,
    req: AdminUpdateUserRequest,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(_verify_admin),
):
    """Update user subscription tier, active status, or reset daily usage (admin only)."""
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

    if req.reset_usage:
        user.daily_usage = 0
        user.last_usage_date = None

    await db.commit()
    logger.info("admin updated user=%d tier=%s is_active=%s reset=%s", user_id, req.subscription_tier, req.is_active, req.reset_usage)
    return {
        "id": user.id,
        "email": user.email,
        "subscription_tier": user.subscription_tier,
        "is_active": user.is_active,
        "daily_usage": user.daily_usage,
    }


@app.patch("/api/admin/users/{user_id}/quota")
async def admin_set_user_quota(
    user_id: int,
    req: AdminSetQuotaRequest,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(_verify_admin),
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
    logger.info(
        "admin set quota user=%d daily_usage=%s bonus_quota=%s",
        user_id, req.daily_usage, req.bonus_quota,
    )
    return {
        "id": user.id,
        "email": user.email,
        "daily_usage": user.daily_usage,
        "bonus_quota": user.bonus_quota,
        "subscription_tier": user.subscription_tier,
    }


@app.delete("/api/admin/users/{user_id}")
async def admin_delete_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(_verify_admin),
):
    """Delete a user account (admin only)."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    db.delete(user)
    await db.commit()
    logger.info("admin deleted user=%d email=%s", user_id, user.email)
    return {"status": "deleted", "user_id": user_id}


@app.get("/api/admin/devices")
async def admin_list_devices(
    search: Optional[str] = None,
    tier: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(_verify_admin),
):
    """List all device subscriptions (admin only)."""
    stmt = select(DeviceSubscription)
    if search:
        stmt = stmt.where(DeviceSubscription.device_id.ilike(f"%{search}%"))
    if tier:
        stmt = stmt.where(DeviceSubscription.subscription_tier == tier)

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await db.execute(count_stmt)).scalar() or 0

    stmt = stmt.order_by(DeviceSubscription.id.desc()).offset((page - 1) * page_size).limit(page_size)
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


@app.delete("/api/admin/devices/{device_id}")
async def admin_delete_device(
    device_id: str,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(_verify_admin),
):
    """Delete a device subscription record (admin only)."""
    result = await db.execute(select(DeviceSubscription).where(DeviceSubscription.device_id == device_id))
    row = result.scalars().first()
    if not row:
        raise HTTPException(status_code=404, detail="Device not found")
    db.delete(row)
    await db.commit()
    logger.info("admin deleted device=%s", device_id)
    return {"status": "deleted", "device_id": device_id}


@app.post("/api/admin/devices/{device_id}/ban")
async def admin_ban_device(
    device_id: str,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(_verify_admin),
):
    """Ban a device (admin only)."""
    await _get_or_create_device_subscription(db, device_id)
    from sqlalchemy import update as _upd
    await db.execute(
        _upd(DeviceSubscription)
        .where(DeviceSubscription.device_id == device_id)
        .values(is_banned=True)
    )
    await db.commit()
    logger.info("admin banned device=%s", device_id)
    return {"status": "banned", "device_id": device_id}


@app.post("/api/admin/devices/{device_id}/unban")
async def admin_unban_device(
    device_id: str,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(_verify_admin),
):
    """Unban a device (admin only)."""
    await _get_or_create_device_subscription(db, device_id)
    from sqlalchemy import update as _upd
    await db.execute(
        _upd(DeviceSubscription)
        .where(DeviceSubscription.device_id == device_id)
        .values(is_banned=False)
    )
    await db.commit()
    logger.info("admin unbanned device=%s", device_id)
    return {"status": "unbanned", "device_id": device_id}


@app.post("/api/admin/devices/{device_id}/reset-trial")
async def admin_reset_device_trial(
    device_id: str,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(_verify_admin),
):
    """Reset pro trial for a device (admin only)."""
    await _get_or_create_device_subscription(db, device_id)
    from sqlalchemy import update as _upd
    await db.execute(
        _upd(DeviceSubscription)
        .where(DeviceSubscription.device_id == device_id)
        .values(has_had_pro_trial=False)
    )
    await db.commit()
    logger.info("admin reset trial for device=%s", device_id)
    return {"status": "trial_reset", "device_id": device_id}


@app.get("/api/admin/devices/{device_id}/history")
async def admin_device_history(
    device_id: str,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(_verify_admin),
):
    """Get analysis history for a device (admin only, last 50 records)."""
    rows = (await db.execute(
        select(AnalysisHistory)
        .where(AnalysisHistory.device_id == device_id)
        .order_by(AnalysisHistory.analyzed_at.desc())
        .limit(50)
    )).scalars().all()
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


class BatchDeviceAction(BaseModel):
    action: str  # "ban" | "unban" | "delete" | "reset-trial"
    device_ids: list[str]


@app.post("/api/admin/devices/batch")
async def admin_batch_devices(
    body: BatchDeviceAction,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(_verify_admin),
):
    """Batch action on devices (admin only)."""
    from sqlalchemy import update as _upd, delete as _del
    affected = 0
    if body.action == "ban":
        r = await db.execute(
            _upd(DeviceSubscription)
            .where(DeviceSubscription.device_id.in_(body.device_ids))
            .values(is_banned=True)
        )
        affected = r.rowcount
    elif body.action == "unban":
        r = await db.execute(
            _upd(DeviceSubscription)
            .where(DeviceSubscription.device_id.in_(body.device_ids))
            .values(is_banned=False)
        )
        affected = r.rowcount
    elif body.action == "reset-trial":
        r = await db.execute(
            _upd(DeviceSubscription)
            .where(DeviceSubscription.device_id.in_(body.device_ids))
            .values(has_had_pro_trial=False)
        )
        affected = r.rowcount
    elif body.action == "delete":
        r = await db.execute(
            _del(DeviceSubscription)
            .where(DeviceSubscription.device_id.in_(body.device_ids))
        )
        affected = r.rowcount
    else:
        raise HTTPException(status_code=400, detail=f"Unknown action: {body.action}")
    await db.commit()
    logger.info("admin batch action=%s devices=%s affected=%d", body.action, body.device_ids, affected)
    return {"status": "ok", "action": body.action, "affected": affected}


@app.post("/api/admin/refresh-names")
async def admin_refresh_names(
    market: Optional[str] = None,
    _: None = Depends(_verify_admin),
):
    """Refresh stock name mappings (admin only).

    Query param ``?market=a``, ``?market=hk``, or ``?market=us`` to refresh a
    single market; omit to refresh all three.
    Returns the number of names loaded per market, plus any error messages.
    """
    markets = [market] if market else ["a", "hk", "us"]
    counts: Dict[str, int] = {}
    errors: Dict[str, str] = {}

    for m in markets:
        try:
            count = await refresh_names(m)
            counts[m] = count
        except Exception as e:
            logger.warning("Failed to refresh {} names: {}", m, e)
            counts[m] = 0
            # Include the error message for this market
            last_err = get_last_error(m)
            errors[m] = last_err or str(e)

    logger.info("admin triggered name refresh: %s", counts)

    # If there are errors, return a non-2xx status code so frontend shows error
    if errors:
        # Return partial success with error details
        return {
            "success": False,
            "counts": counts,
            "errors": errors,
            "message": f"部分市场刷新失败: {', '.join(errors.keys())}"
        }

    return {"success": True, "counts": counts}


@app.get("/api/admin/symbol-names")
async def admin_get_symbol_names(
    market: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = 500,
    _: None = Depends(_verify_admin),
):
    """Return stored symbol name mappings from the DB (admin only).

    Supports optional ``?market=a|hk|us|futures`` filter and
    ``?search=keyword`` for fuzzy match on symbol or name.
    """
    from sqlalchemy import select as _sel, or_, func as _func

    stmt = _sel(SymbolName)
    if market:
        stmt = stmt.where(SymbolName.market == market)
    if search:
        s = f"%{search}%"
        stmt = stmt.where(
            or_(SymbolName.symbol.ilike(s), SymbolName.name.ilike(s))
        )
    stmt = stmt.order_by(SymbolName.market, SymbolName.symbol).limit(limit)

    # Also fetch per-market totals
    count_stmt = _sel(SymbolName.market, _func.count().label("cnt")).group_by(SymbolName.market)

    async with async_session() as db:
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


# ===================== Admin: System Settings =====================


@app.get("/api/admin/settings")
async def admin_get_settings(db: AsyncSession = Depends(get_db), _: None = Depends(_verify_admin)):
    """Return all runtime-configurable system settings (admin only)."""
    import copy
    result = copy.deepcopy(_settings_cache)
    _SENSITIVE_KEYS = {"api_key", "api_token", "resend_api_key", "webhook_token"}
    for section in result.values():
        if isinstance(section, dict):
            for key in _SENSITIVE_KEYS:
                if key in section:
                    # Non-empty → "__CONFIGURED__" so frontend can show "已配置" hint
                    # Empty → "" so frontend shows "未填写" state
                    section[key] = "__CONFIGURED__" if section[key] else ""
    # Load pricing.features from DB
    row = await db.get(SystemSetting, "pricing")
    if row:
        try:
            db_pricing = json.loads(row.value)
            result["pricing"]["features"] = db_pricing.get("features", result["pricing"].get("features", []))
        except Exception:
            pass
    return result


@app.put("/api/admin/settings")
async def admin_update_settings(
    body: dict,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(_verify_admin),
):
    """Update one or more settings sections and persist to .env file (admin only)."""
    from dotenv import set_key, find_dotenv
    from src.database.db import Settings as AppSettings
    global settings, _settings_cache

    _SENSITIVE_KEYS = {"api_key", "api_token", "resend_api_key", "webhook_token"}
    env_file = find_dotenv(usecwd=True) or ".env"
    updated_sections = []

    for section, data in body.items():
        if section not in _SETTINGS_ENV_MAP and section != "pricing":
            continue
        if not isinstance(data, dict):
            continue

        if section == "pricing" and "features" in data:
            # Save features array to DB only
            row = await db.get(SystemSetting, "pricing")
            features = data.get("features", [])
            pricing_db = {"features": features}
            if row:
                row.value = json.dumps(pricing_db)
                row.updated_at = datetime.utcnow()
            else:
                db.add(SystemSetting(key="pricing", value=json.dumps(pricing_db)))
            _settings_cache["pricing"]["features"] = features

        # Write flat settings to .env
        section_map = _SETTINGS_ENV_MAP.get(section, {})
        if section == "quota":
            guest = data.get("guest", {})
            user = data.get("user", {})
            flat = {
                "guest_free": guest.get("free"),
                "guest_basic": guest.get("basic"),
                "guest_premium": guest.get("premium"),
                "user_free": user.get("free"),
                "user_basic": user.get("basic"),
                "user_premium": user.get("premium"),
            }
            for fk, ev in _SETTINGS_ENV_MAP["quota"].items():
                val = flat.get(fk)
                if val is not None:
                    set_key(env_file, ev, str(val))
        else:
            for field_key, env_key in section_map.items():
                val = data.get(field_key)
                if val is None:
                    continue
                if field_key in _SENSITIVE_KEYS and val in ("***REDACTED***", "__CONFIGURED__", ""):
                    continue
                set_key(env_file, env_key, str(val))

        # For pricing non-features fields, write to .env too
        if section == "pricing":
            pricing_map = {
                "period": "PRICING_PERIOD",
                "basic_price": None,
                "basic_daily": None,
                "premium_price": None,
                "premium_daily": None,
            }
            basic = data.get("basic", {})
            premium = data.get("premium", {})
            if data.get("period") is not None:
                set_key(env_file, "PRICING_PERIOD", str(data["period"]))
            if basic.get("price") is not None:
                set_key(env_file, "PRICING_BASIC_PRICE", str(basic["price"]))
            if basic.get("daily") is not None:
                set_key(env_file, "PRICING_BASIC_DAILY", str(basic["daily"]))
            if premium.get("price") is not None:
                set_key(env_file, "PRICING_PREMIUM_PRICE", str(premium["price"]))
            if premium.get("daily") is not None:
                set_key(env_file, "PRICING_PREMIUM_DAILY", str(premium["daily"]))

        updated_sections.append(section)

    await db.commit()

    # Reload settings from updated .env
    from dotenv import load_dotenv
    load_dotenv(env_file, override=True)
    settings = AppSettings()
    _load_settings_cache()
    # Reload pricing.features into cache from DB
    row = await db.get(SystemSetting, "pricing")
    if row:
        try:
            db_pricing = json.loads(row.value)
            _settings_cache["pricing"]["features"] = db_pricing.get("features", [])
        except Exception:
            pass

    logger.info("admin updated env settings: %s", updated_sections)
    return {"success": True, "updated": updated_sections}



# ===================== Admin: Market Data Pipeline =====================


@app.get("/api/admin/market-data/status")
async def admin_market_data_status(_: None = Depends(_verify_admin)):
    """Return DB coverage for every symbol in the watchlist (admin only)."""
    status = await get_market_data_status()
    return {"collecting": is_collecting(), "symbols": status}


class WatchlistRefreshRequest(BaseModel):
    symbols: Optional[List[dict]] = Field(
        None,
        description=(
            "Subset of watchlist entries to refresh. "
            "Each dict: {symbol, market, periods?, adjust?}. "
            "Omit to refresh the full watchlist."
        ),
    )


@app.post("/api/admin/market-data/refresh")
async def admin_market_data_refresh(
    req: WatchlistRefreshRequest,
    _: None = Depends(_verify_admin),
):
    """Trigger an immediate data collection cycle (admin only).

    Runs as a background task — returns immediately with ``triggered: true``.
    Poll ``/api/admin/market-data/status`` to track progress.
    """
    if is_collecting():
        return {"triggered": False, "reason": "采集任务正在运行中，请稍后再试"}

    target = req.symbols  # None → use full watchlist
    asyncio.create_task(run_collection_cycle(target))
    logger.info("admin triggered market-data refresh, target=%s", target)
    return {"triggered": True}


@app.get("/api/admin/watchlist")
async def admin_get_watchlist(_: None = Depends(_verify_admin)):
    """Return the current data-collector watchlist (admin only)."""
    watchlist = await load_watchlist()
    return {"watchlist": watchlist}


class WatchlistUpdateRequest(BaseModel):
    watchlist: List[dict] = Field(
        ...,
        description=(
            "Full replacement watchlist. "
            "Each entry: {symbol, market, periods: [...], adjust?: 'qfq'}."
        ),
    )


@app.put("/api/admin/watchlist")
async def admin_update_watchlist(
    req: WatchlistUpdateRequest,
    _: None = Depends(_verify_admin),
):
    """Replace the data-collector watchlist (admin only).

    The new list is persisted to ``system_settings`` and takes effect on the
    next collection cycle.
    """
    await save_watchlist(req.watchlist)
    logger.info("admin updated watchlist: %d symbols", len(req.watchlist))
    return {"success": True, "count": len(req.watchlist), "watchlist": req.watchlist}


@app.get("/api/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "ok", "timestamp": datetime.utcnow().isoformat()}


@app.get("/api/config")
async def get_config():
    """Public config — app name and other frontend settings."""
    return {
        "app_name": _app("name"),
        "version": "1.0.0",
        "afdian_basic_link": _afdian("basic_link"),
        "afdian_premium_link": _afdian("premium_link"),
    }


@app.get("/api/pricing")
async def get_pricing():
    """Return subscription pricing info (configurable via admin settings)."""
    p = _settings_cache.get("pricing", {})
    basic = p.get("basic", {})
    premium = p.get("premium", {})
    period = p.get("period", "月")
    features = p.get("features", [])
    return {
        "features": features,
        "guest": {"daily_limit": int(p.get("guest_daily", 1))},
        "free": {"daily_limit": int(p.get("free_daily", 3))},
        "basic": {
            "price": basic.get("price", "19.9"),
            "period": period,
            "daily_limit": int(basic.get("daily", 5)),
        },
        "premium": {
            "price": premium.get("price", "49"),
            "period": period,
            "daily_limit": int(premium.get("daily", 15)),
        },
    }


# ===================== Root =====================


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "name": "LLM Trading Analyzer API",
        "version": "1.0.0",
        "docs": "/docs",
    }
