"""Subscription router - Afdian payment and activation."""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from src.database.new_db import get_db
from src.api.schemas.subscription import ActivateRequest, ActivationResponse, PricingResponse
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
async def get_pricing():
    """Get pricing plans."""
    return get_pricing_plans()
