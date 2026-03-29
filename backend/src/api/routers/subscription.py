"""Subscription router - Afdian payment and activation."""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from src.database.new_db import get_db
from src.api.schemas.subscription import ActivateRequest, ActivationResponse, FeatureItem, PricingResponse
from src.api.dependencies.auth import get_current_user_optional
from src.services.subscription_service import activate_subscription, get_pricing_plans
from src.models.user import User
from src.models.device import Device

router = APIRouter(prefix="/api", tags=["subscription"])


@router.post("/subscription/activate", response_model=ActivationResponse)
async def activate(
    req: ActivateRequest,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
):
    """Activate subscription with Afdian order ID.

    Requires authentication — mirrors exact behavior of main.py which returns 401
    when no user is logged in.
    """
    if not current_user:
        raise HTTPException(status_code=401, detail="请先登录账号后再激活订阅")

    device_id = (req.device_id or "").strip() or None

    try:
        result = await activate_subscription(
            db=db,
            order_id=req.order_id.strip(),
            user=current_user,
            device_id=device_id,
        )
    except ValueError as e:
        msg = str(e)
        if "already been activated" in msg:
            raise HTTPException(status_code=409, detail=msg)
        if "not configured" in msg:
            raise HTTPException(status_code=503, detail=msg)
        raise HTTPException(status_code=400, detail=msg)
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))

    return ActivationResponse(
        success=True,
        tier=result["tier"],
        message=f"订阅已激活：{result['tier']}，到期时间 {result['expires_at']}",
    )


@router.get("/subscription/status")
async def get_status(
    device_id: Optional[str] = None,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
):
    """Get current subscription status."""
    if current_user:
        tier = current_user.subscription_tier or "free"
        if tier in ("basic", "premium"):
            trial_state = "not_eligible"
        elif current_user.has_had_pro_trial:
            trial_state = "expired"
        else:
            trial_state = "available"
        return {
            "tier": tier,
            "expires_at": (
                current_user.subscription_expires_at.isoformat()
                if current_user.subscription_expires_at
                else None
            ),
            "trial_state": trial_state,
        }
    elif device_id:
        result = await db.execute(select(Device).where(Device.device_id == device_id))
        device = result.scalar_one_or_none()
        if device:
            tier = device.subscription_tier or "free"
            if tier in ("basic", "premium"):
                trial_state = "not_eligible"
            elif device.has_had_pro_trial:
                trial_state = "expired"
            else:
                trial_state = "available"
            return {
                "tier": tier,
                "expires_at": device.expires_at.isoformat() if device.expires_at else None,
                "trial_state": trial_state,
            }
    return {"tier": "free", "trial_state": "available"}


@router.get("/pricing", response_model=PricingResponse)
async def get_pricing(db: AsyncSession = Depends(get_db)):
    """Get pricing plans, overlaid with DB-stored settings."""
    import json
    from src.models.settings import SystemSetting
    base = get_pricing_plans()

    for section_key in ("afdian", "pricing"):
        row = await db.get(SystemSetting, section_key)
        if not row:
            continue
        try:
            data = json.loads(row.value)
        except Exception:
            continue
        if section_key == "afdian":
            if data.get("basic_link"):
                base.basic.afdian_link = data["basic_link"]
            if data.get("premium_link"):
                base.premium.afdian_link = data["premium_link"]
        elif section_key == "pricing":
            period = data.get("period", base.basic.period)
            base.basic.period = period
            base.premium.period = period
            if data.get("guest_daily") is not None:
                base.guest.daily_limit = int(data["guest_daily"])
            if data.get("free_daily") is not None:
                base.free.daily_limit = int(data["free_daily"])
            basic_d = data.get("basic", {})
            premium_d = data.get("premium", {})
            if basic_d.get("price"):
                base.basic.price = str(basic_d["price"])
            if basic_d.get("daily"):
                base.basic.daily_limit = int(basic_d["daily"])
            if premium_d.get("price"):
                base.premium.price = str(premium_d["price"])
            if premium_d.get("daily"):
                base.premium.daily_limit = int(premium_d["daily"])
            features = data.get("features")
            if features:
                base.features = [FeatureItem(**f) for f in features]
            if data.get("free_features") is not None:
                base.free_features = list(data["free_features"])
            if data.get("basic_features") is not None:
                base.basic_features = list(data["basic_features"])
            if data.get("premium_features") is not None:
                base.premium_features = list(data["premium_features"])
            basic_d = data.get("basic", {})
            if basic_d.get("deep_daily") is not None:
                base.basic_deep_daily = int(basic_d["deep_daily"])
    return base
