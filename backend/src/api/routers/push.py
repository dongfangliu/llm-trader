"""Web Push notification router.

Public endpoints (no auth):
  POST   /api/push/subscribe      — register a push subscription
  DELETE /api/push/unsubscribe    — remove a push subscription
  GET    /api/push/vapid-public   — retrieve the VAPID public key

Admin-only:
  POST   /api/push/broadcast      — send a notification to all subscribers
"""

from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.dependencies.auth import get_admin_token_or_admin_user
from src.database.new_db import get_db
from src.models.push_subscription import PushSubscription
from src.services.push_service import (
    get_vapid_public_key,
    send_push_to_all,
)

router = APIRouter(prefix="/api/push", tags=["push"])

_Admin = Depends(get_admin_token_or_admin_user)


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------

class SubscribeKeys(BaseModel):
    p256dh: str
    auth: str


class SubscribeRequest(BaseModel):
    endpoint: str
    keys: SubscribeKeys


class UnsubscribeRequest(BaseModel):
    endpoint: str


class BroadcastRequest(BaseModel):
    title: str
    body: str
    url: str = ""


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/subscribe")
async def subscribe(
    body: SubscribeRequest,
    user_agent: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db),
):
    """Register (or refresh) a Web Push subscription.

    If a subscription with the same endpoint already exists it is updated
    in-place (keys may rotate after a browser re-subscription).
    """
    result = await db.execute(
        select(PushSubscription).where(PushSubscription.endpoint == body.endpoint)
    )
    existing = result.scalar_one_or_none()

    if existing:
        existing.p256dh = body.keys.p256dh
        existing.auth = body.keys.auth
        if user_agent is not None:
            existing.user_agent = user_agent
    else:
        db.add(
            PushSubscription(
                endpoint=body.endpoint,
                p256dh=body.keys.p256dh,
                auth=body.keys.auth,
                user_agent=user_agent,
            )
        )

    await db.commit()
    return {"ok": True}


@router.delete("/unsubscribe")
async def unsubscribe(
    body: UnsubscribeRequest,
    db: AsyncSession = Depends(get_db),
):
    """Remove a Web Push subscription by endpoint."""
    result = await db.execute(
        select(PushSubscription).where(PushSubscription.endpoint == body.endpoint)
    )
    sub = result.scalar_one_or_none()

    if sub:
        await db.delete(sub)
        await db.commit()

    return {"ok": True}


@router.get("/vapid-public")
async def vapid_public(db: AsyncSession = Depends(get_db)):
    """Return the VAPID public key required to subscribe in the browser.

    Generates and persists the key pair on first call.
    """
    public_key = await get_vapid_public_key(db)
    return {"public_key": public_key}


@router.post("/broadcast")
async def broadcast(
    body: BroadcastRequest,
    db: AsyncSession = Depends(get_db),
    _=_Admin,
):
    """Send a push notification to all registered subscribers (admin only)."""
    sent, failed = await send_push_to_all(
        db=db,
        title=body.title,
        body=body.body,
        url=body.url,
    )
    return {"sent": sent, "failed": failed}
