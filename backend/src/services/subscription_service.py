"""Subscription service - Afdian payment integration."""
import json
import hashlib
import time
import logging
from typing import Optional
from datetime import datetime, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import httpx

from src.config import settings
from src.models.subscription import AfdianOrder
from src.models.user import User
from src.models.device import Device
from src.api.schemas.subscription import FeatureItem, TierConfig, PricingResponse

logger = logging.getLogger(__name__)


def _afdian_sign(token: str, user_id: str, params: str, ts: int) -> str:
    """Compute Afdian API signature: md5(token + params{params} + ts{ts} + user_id{user_id})."""
    raw = f"{token}params{params}ts{ts}user_id{user_id}"
    return hashlib.md5(raw.encode("utf-8")).hexdigest()


def _tier_from_order(order: dict) -> str:
    """Determine subscription tier from an Afdian order dict."""
    plan_id = str(order.get("plan_id") or "")
    if settings.afdian_premium_plan_id and plan_id == settings.afdian_premium_plan_id:
        return "premium"
    if settings.afdian_basic_plan_id and plan_id == settings.afdian_basic_plan_id:
        return "basic"
    # Fallback: determine by amount
    amount = float(order.get("total_amount") or 0)
    if amount >= 49:
        return "premium"
    if amount >= 19.9:
        return "basic"
    return "free"


async def verify_afdian_order(order_id: str) -> dict:
    """Query Afdian API to verify an order exists and is paid.

    Returns the matched order dict from Afdian, or raises on error.
    Raises ValueError for logical errors, httpx errors for network issues.
    """
    params_str = json.dumps({"out_trade_no": order_id})
    ts = int(datetime.utcnow().timestamp())
    sign = _afdian_sign(settings.afdian_api_token, settings.afdian_user_id, params_str, ts)

    payload = {
        "user_id": settings.afdian_user_id,
        "params": params_str,
        "ts": ts,
        "sign": sign,
    }

    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(
            "https://afdian.net/api/open/query-order",
            json=payload,
        )
        data = resp.json()

    if data.get("ec") != 200:
        logger.warning("Afdian API error: %s", data)
        raise ValueError(f"Afdian API error: {data.get('em', 'unknown')}")

    orders = (data.get("data") or {}).get("list") or []
    matched = next((o for o in orders if str(o.get("out_trade_no")) == order_id), None)

    if not matched:
        raise ValueError("Order not found — check your order number")
    if matched.get("status") != 2:
        raise ValueError("Order not yet paid (status != 2)")

    return matched


async def activate_subscription(
    db: AsyncSession,
    order_id: str,
    user: Optional[User] = None,
    device_id: Optional[str] = None,
) -> dict:
    """Activate subscription for user or device.

    Ports the exact activation logic from main.py:
    - Requires either an authenticated user or a device_id
    - In this rewrite, activation requires a logged-in user (mirrors main.py behavior)
    - Idempotent check: if order already processed, raises ValueError
    - On new order: updates user.subscription_tier / device subscription_tier
    - Stacks 30 days if renewing the same tier while still active
    """
    if not settings.afdian_user_id or not settings.afdian_api_token:
        raise ValueError("Afdian API not configured")

    # Check idempotency — order already activated
    existing = await db.execute(
        select(AfdianOrder).where(AfdianOrder.out_trade_no == order_id)
    )
    if existing.scalars().first():
        raise ValueError("This order has already been activated")

    # Query Afdian API to verify order
    try:
        matched = await verify_afdian_order(order_id)
    except httpx.RequestError as e:
        logger.error("Afdian API request failed: %s", e)
        raise RuntimeError("Failed to reach Afdian API")

    tier = _tier_from_order(matched)
    if tier == "free":
        raise ValueError("Order amount does not match any subscription plan")

    now = datetime.utcnow()
    new_expires = now + timedelta(days=30)

    if user is not None:
        # Account-linked activation — stack 30 days if renewing same tier while active
        if (
            user.subscription_tier == tier
            and user.subscription_expires_at is not None
            and user.subscription_expires_at > now
        ):
            new_expires = user.subscription_expires_at + timedelta(days=30)
        user.subscription_tier = tier
        user.subscription_expires_at = new_expires
        bind_target = f"user:{user.id}"
        order_device_id = device_id or f"user:{user.id}"
    else:
        # Device-linked activation (legacy / guest)
        result = await db.execute(
            select(Device).where(Device.device_id == device_id)
        )
        row = result.scalars().first()
        if row:
            same_tier = row.subscription_tier == tier
            still_active = row.expires_at is not None and row.expires_at > now
            if same_tier and still_active:
                new_expires = row.expires_at + timedelta(days=30)
            row.expires_at = new_expires
            row.subscription_tier = tier
        else:
            db.add(Device(device_id=device_id, subscription_tier=tier, expires_at=new_expires))
        bind_target = f"device:{device_id}"
        order_device_id = device_id

    # Record order to prevent reuse
    db.add(AfdianOrder(
        out_trade_no=order_id,
        device_id=order_device_id,
        plan_id=str(matched.get("plan_id") or ""),
        tier=tier,
        total_amount=str(matched.get("total_amount") or ""),
    ))

    await db.commit()
    logger.info(
        "afdian_activate bind=%s tier=%s order=%s expires=%s",
        bind_target, tier, order_id, new_expires,
    )
    return {"status": "activated", "tier": tier, "expires_at": new_expires.isoformat()}


_DEFAULT_FEATURES = [
    {"text": "全市场支持（A股/港股/美股/期货）", "tiers": ["basic", "premium"]},
    {"text": "多周期技术分析", "tiers": ["basic", "premium"]},
    {"text": "AI智能解读", "tiers": ["basic", "premium"]},
    {"text": "优先响应速度", "tiers": ["premium"]},
    {"text": "专属客服支持", "tiers": ["premium"]},
]

_DEFAULT_FREE_FEATURES: list[str] = ["基础股票分析", "每日限额次数分析"]
_DEFAULT_BASIC_FEATURES: list[str] = ["全市场支持（A股/港股/美股/期货）", "多周期技术分析", "AI智能解读"]
_DEFAULT_PREMIUM_FEATURES: list[str] = ["全市场支持（A股/港股/美股/期货）", "多周期技术分析", "AI智能解读", "优先响应速度", "专属客服支持"]


def get_pricing_plans() -> PricingResponse:
    """Return default pricing plans from settings."""
    period = settings.pricing_period
    return PricingResponse(
        features=[FeatureItem(**f) for f in _DEFAULT_FEATURES],
        free_features=list(_DEFAULT_FREE_FEATURES),
        basic_features=list(_DEFAULT_BASIC_FEATURES),
        premium_features=list(_DEFAULT_PREMIUM_FEATURES),
        basic_deep_daily=settings.pricing_basic_deep_daily,
        guest=TierConfig(daily_limit=settings.pricing_guest_daily),
        free=TierConfig(daily_limit=settings.pricing_free_daily),
        basic=TierConfig(
            daily_limit=settings.pricing_basic_daily,
            price=settings.pricing_basic_price,
            period=period,
            afdian_link=settings.afdian_basic_link,
        ),
        premium=TierConfig(
            daily_limit=settings.pricing_premium_daily,
            price=settings.pricing_premium_price,
            period=period,
            afdian_link=settings.afdian_premium_link,
        ),
    )
