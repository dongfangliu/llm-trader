"""FastAPI main application."""

import os
import uuid
import json
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from typing import Optional, List
import re

from fastapi import FastAPI, HTTPException, Depends, Header, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from src.database.db import (
    init_db,
    get_db,
    User,
    UsageLog,
    DeviceSubscription,
    AnalysisHistory,
    settings,
)
from src.services.user import user_service
from src.services.data import data_service
from src.services.llm import llm_service

# Initialize database on startup
@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(
    title="LLM Trading Analyzer API",
    description="AI-powered stock and futures analysis service",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ===================== Request Models =====================


class LoginRequest(BaseModel):
    """WeChat login request."""
    openid: str
    username: Optional[str] = None


class AnalyzeRequest(BaseModel):
    """Analysis request."""
    symbol: str
    market: str = "a"  # a, hk, us, futures
    period: str = "daily"  # daily, 1, 5, 15, 30, 60
    history_days: int = 90
    holding_quantity: Optional[int] = None
    cost_price: Optional[float] = None
    planned_investment: Optional[float] = None
    max_position: Optional[int] = None
    holding_text: Optional[str] = None
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


class KoFiWebhookRequest(BaseModel):
    """Ko-fi webhook request."""
    # Ko-fi sends form data, we'll handle it manually


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


LIMITS = {"free": 1, "basic": 5, "premium": 15}
ALLOWED_MARKETS = {
    "free": {"a"},
    "basic": {"a", "hk", "us", "futures"},
    "premium": {"a", "hk", "us", "futures"},
}


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
    if m_plan:
        parsed = _parse_money_value(m_plan.group(1))
        if parsed is not None:
            out["planned_investment"] = parsed
    if m_max:
        out["max_position"] = int(m_max.group(1))
    return out


def _build_position_advice(
    action: str,
    current_price: float,
    holding_quantity: Optional[int],
    cost_price: Optional[float],
    planned_investment: Optional[float],
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
        "planned_investment": planned_investment,
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
    planned_investment = req.planned_investment if req.planned_investment is not None else parsed_text.get("planned_investment")
    max_position = req.max_position if req.max_position is not None else parsed_text.get("max_position")
    position_advice = _build_position_advice(action, current_price, holding_quantity, cost_price, planned_investment, max_position)
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


async def _get_device_subscription(db: AsyncSession, device_id: str) -> str:
    result = await db.execute(select(DeviceSubscription).where(DeviceSubscription.device_id == device_id))
    row = result.scalars().first()
    return row.subscription_tier if row else "free"


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


@app.post("/api/auth/login")
async def login(req: LoginRequest, db: AsyncSession = Depends(get_db)):
    """WeChat login - get or create user."""
    user = await user_service.get_or_create_user(db, req.openid, req.username)

    # Create access token
    access_token = user_service.create_access_token(
        data={"sub": str(user.id)},
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "username": user.username,
            "subscription_tier": user.subscription_tier,
        },
    }


@app.get("/api/auth/me")
async def get_me(current_user: User = Depends(get_current_user)):
    """Get current user info."""
    return {
        "id": current_user.id,
        "username": current_user.username,
        "subscription_tier": current_user.subscription_tier,
        "daily_usage": current_user.daily_usage,
        "last_usage_date": current_user.last_usage_date.isoformat() if current_user.last_usage_date else None,
    }


# ===================== Subscription Routes =====================


@app.post("/api/subscription/upgrade")
async def upgrade_subscription(
    req: SubscriptionRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Upgrade user subscription (manual for now, can integrate Ko-fi later)."""
    if req.tier not in ["basic", "premium"]:
        raise HTTPException(status_code=400, detail="Invalid tier")

    await user_service.update_subscription(db, current_user.id, req.tier)

    return {"message": f"Subscription upgraded to {req.tier}"}


@app.get("/api/subscription/status")
async def get_subscription_status(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get user subscription status."""
    _, remaining = await user_service.check_daily_limit(db, current_user)
    limits = {"free": 1, "basic": 5, "premium": 15}
    daily_limit = limits.get(current_user.subscription_tier, 1)
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
    usage = await _get_or_create_usage_log(db, device_id)
    daily_limit = LIMITS.get(usage.subscription, 1)
    remaining = max(daily_limit - usage.count, 0)
    return {
        "subscription": usage.subscription,
        "remaining": remaining,
        "daily_limit": daily_limit,
        "used": usage.count,
        "resets_at": _tomorrow_reset_iso(),
    }


# ===================== Ko-fi Webhook =====================


@app.post("/api/webhook/kofi")
async def kofi_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Handle Ko-fi subscription webhook."""
    body = await request.json()
    if isinstance(body, dict) and isinstance(body.get("data"), str):
        import json
        try:
            body = json.loads(body["data"])
        except Exception:
            pass

    tier_raw = str(body.get("subscription_tier") or body.get("tier") or "").lower()
    if "premium" in tier_raw or "19" in tier_raw:
        tier = "premium"
    elif "basic" in tier_raw or "9" in tier_raw:
        tier = "basic"
    else:
        tier = "free"

    metadata = body.get("metadata") or {}
    device_id = (
        body.get("device_id")
        or body.get("custom")
        or (metadata.get("device_id") if isinstance(metadata, dict) else None)
    )
    if not device_id:
        return {"status": "ignored", "reason": "missing_device_id"}

    result = await db.execute(select(DeviceSubscription).where(DeviceSubscription.device_id == device_id))
    row = result.scalars().first()
    if row:
        row.subscription_tier = tier
    else:
        db.add(DeviceSubscription(device_id=device_id, subscription_tier=tier))
    await db.commit()

    usage = await _get_or_create_usage_log(db, device_id)
    usage.subscription = tier
    await db.commit()
    return {"status": "received", "device_id": device_id, "subscription": tier}


# ===================== Analysis Routes =====================


@app.post("/api/analyze")
async def analyze(
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
        has_limit, remaining = await user_service.check_daily_limit(db, current_user)
    else:
        usage = await _get_or_create_usage_log(db, device_id)
        subscription = usage.subscription
        limit = LIMITS.get(subscription, 1)
        remaining = max(limit - usage.count, 0)
        has_limit = remaining > 0

    if req.market not in ALLOWED_MARKETS.get(subscription, {"a"}):
        raise HTTPException(status_code=403, detail="Current subscription does not support this market")
    if not has_limit:
        raise HTTPException(
            status_code=429,
            detail=f"Daily limit reached. Please upgrade to continue.",
        )

    # Validate inputs
    if not req.symbol.strip():
        raise HTTPException(status_code=400, detail="Symbol cannot be empty")

    api_key = settings.llm_api_key or os.getenv("LLM_API_KEY", "") or os.getenv("OPENAI_API_KEY", "")
    if not api_key:
        raise HTTPException(status_code=500, detail="LLM API key not configured on server")

    try:
        # Fetch market data
        df = await data_service.fetch_market_data(
            symbol=req.symbol.strip(),
            market=req.market,
            period=req.period,
            start_date=None,
            end_date=None,
        )

        if df.empty:
            raise HTTPException(status_code=404, detail="No data found for symbol")

        # Analyze with LLM
        result = await llm_service.analyze_with_llm(
            df=df,
            provider=settings.llm_provider,
            api_key=api_key,
            base_url=settings.llm_base_url,
            model=settings.llm_model,
            max_tokens=settings.llm_max_tokens,
            temperature=settings.llm_temperature,
            user_context={
                "holding_quantity": req.holding_quantity,
                "cost_price": req.cost_price,
                "planned_investment": req.planned_investment,
                "max_position": req.max_position,
            },
        )

        latest_price = float(df.iloc[-1]["close"])
        normalized_result = _normalize_result(result, latest_price, req)
        if usage_mode == "account":
            await user_service.increment_usage(db, current_user)
            _, new_remaining = await user_service.check_daily_limit(db, current_user)
            used = current_user.daily_usage
        else:
            usage = await _get_or_create_usage_log(db, device_id)
            usage.count += 1
            await db.commit()
            limit = LIMITS.get(subscription, 1)
            new_remaining = max(limit - usage.count, 0)
            used = usage.count

        latest_row = df.iloc[-1]
        response_payload = {
            "success": True,
            "remaining": new_remaining,
            "result": {
                **normalized_result,
                "indicators": {
                    "ma10": float(latest_row.get("ma10", 0) or 0),
                    "ma30": float(latest_row.get("ma30", 0) or 0),
                    "ma60": float(latest_row.get("ma60", 0) or 0),
                    "rsi": float(latest_row.get("rsi", 0) or 0),
                    "macd": float(latest_row.get("macd", 0) or 0),
                    "macd_dea": float(latest_row.get("macd_dea", 0) or 0),
                    "macd_bar": float(latest_row.get("macd_bar", 0) or 0),
                    "atr": float(latest_row.get("atr", 0) or 0),
                },
                "raw_signal": result,
            },
            "usage": {
                "remaining": new_remaining,
                "tier": subscription,
                "daily_limit": LIMITS.get(subscription, 1),
                "used": used,
            },
            "data": {
                "symbol": req.symbol,
                "market": req.market,
                "latest_price": latest_price,
                "latest_date": datetime.fromtimestamp(df.iloc[-1]["datetime"] / 1e9).isoformat(),
            },
        }
        history_record = await _save_analysis_history(
            db=db,
            req_symbol=req.symbol,
            req_market=req.market,
            req_period=req.period,
            result_payload=response_payload,
            current_user=current_user,
            device_id=device_id if usage_mode == "device" else None,
        )
        response_payload["history"] = {
            "id": history_record.id,
            "analysis_date": history_record.analysis_date.isoformat(),
            "analyzed_at": history_record.analyzed_at.isoformat(),
        }
        return response_payload

    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


@app.get("/api/analyze/limits")
async def get_limits(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get user's daily usage limits."""
    _, remaining = await user_service.check_daily_limit(db=db, user=current_user)

    limits = {"free": 1, "basic": 5, "premium": 15}
    daily_limit = limits.get(current_user.subscription_tier, 1)

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
    daily_limit = LIMITS.get(usage.subscription, 1)
    remaining = max(daily_limit - usage.count, 0)
    return {
        "subscription": usage.subscription,
        "remaining": remaining,
        "resets_at": _tomorrow_reset_iso(),
    }


@app.post("/api/analyze/batch")
async def analyze_batch(
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
        remaining = max(LIMITS.get(subscription, 15) - usage.count, 0)
        has_limit = remaining > 0
    if not has_limit or remaining < len(symbols):
        raise HTTPException(status_code=429, detail=f"Not enough quota for batch analyze. Remaining: {remaining}")

    api_key = settings.llm_api_key or os.getenv("LLM_API_KEY", "") or os.getenv("OPENAI_API_KEY", "")
    if not api_key:
        raise HTTPException(status_code=500, detail="LLM API key not configured on server")

    results = []
    failed = []

    for symbol in symbols:
        if usage_mode == "account":
            await user_service.increment_usage(db, current_user)
        else:
            usage = await _get_or_create_usage_log(db, device_id)
            usage.count += 1
            await db.commit()
        try:
            df = await data_service.fetch_market_data(
                symbol=symbol,
                market=req.market,
                period=req.period,
                start_date=None,
                end_date=None,
            )
            if df.empty:
                failed.append({"symbol": symbol, "error": "No data found"})
                continue

            result = await llm_service.analyze_with_llm(
                df=df,
                symbol=symbol,
                provider=settings.llm_provider,
                api_key=api_key,
                base_url=settings.llm_base_url,
                model=settings.llm_model,
                max_tokens=settings.llm_max_tokens,
                temperature=settings.llm_temperature,
                user_context={},
            )

            latest_price = float(df.iloc[-1]["close"])
            normalized = _normalize_result(
                result,
                latest_price,
                AnalyzeRequest(symbol=symbol, market=req.market, period=req.period),
            )
            results.append({"symbol": symbol, **normalized})
            await _save_analysis_history(
                db=db,
                req_symbol=symbol,
                req_market=req.market,
                req_period=req.period,
                result_payload={
                    "success": True,
                    "result": normalized,
                    "data": {
                        "symbol": symbol,
                        "market": req.market,
                        "latest_price": latest_price,
                        "latest_date": datetime.fromtimestamp(df.iloc[-1]["datetime"] / 1e9).isoformat(),
                    },
                },
                current_user=current_user,
                device_id=device_id if usage_mode == "device" else None,
            )
        except Exception as e:
            failed.append({"symbol": symbol, "error": str(e)})

    if usage_mode == "account":
        _, new_remaining = await user_service.check_daily_limit(db, current_user)
        used = current_user.daily_usage
    else:
        usage = await _get_or_create_usage_log(db, device_id)
        new_remaining = max(LIMITS.get(subscription, 15) - usage.count, 0)
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


# ===================== Health Check =====================


@app.get("/api/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "ok", "timestamp": datetime.utcnow().isoformat()}


# ===================== Root =====================


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "name": "LLM Trading Analyzer API",
        "version": "1.0.0",
        "docs": "/docs",
    }
