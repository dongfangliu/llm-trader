"""Growth event collection and admin funnel reporting."""

import json
import logging
from datetime import datetime, timedelta
from typing import Any, Optional

from fastapi import APIRouter, Depends, Query, Response
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.dependencies.auth import get_admin_token_or_admin_user, get_current_user_optional
from src.database.new_db import get_db
from src.models.growth import GrowthEvent
from src.models.user import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["growth"])
_Admin = Depends(get_admin_token_or_admin_user)


class GrowthEventCreate(BaseModel):
    event_name: str = Field(min_length=1, max_length=80)
    session_id: Optional[str] = Field(default=None, max_length=80)
    device_id: Optional[str] = Field(default=None, max_length=255)
    path: Optional[str] = Field(default=None, max_length=500)
    landing_path: Optional[str] = Field(default=None, max_length=500)
    referrer: Optional[str] = Field(default=None, max_length=500)
    source: Optional[str] = Field(default=None, max_length=80)
    market: Optional[str] = Field(default=None, max_length=20)
    symbol: Optional[str] = Field(default=None, max_length=50)
    metadata: dict[str, Any] = Field(default_factory=dict)


def _clean(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    value = value.strip()
    return value or None


@router.post("/growth/events", status_code=204)
async def create_growth_event(
    body: GrowthEventCreate,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
):
    """Record a client-side funnel event.

    Event collection is best-effort from the caller's perspective. Validation
    errors still return normally from FastAPI, but DB write failures are logged
    and swallowed so analytics cannot break the core product flow.
    """
    try:
        db.add(GrowthEvent(
            event_name=_clean(body.event_name) or "unknown",
            session_id=_clean(body.session_id),
            device_id=_clean(body.device_id),
            user_id=current_user.id if current_user else None,
            path=_clean(body.path),
            landing_path=_clean(body.landing_path),
            referrer=_clean(body.referrer),
            source=_clean(body.source),
            market=_clean(body.market.lower()) if body.market else None,
            symbol=_clean(body.symbol.upper()) if body.symbol else None,
            payload=json.dumps(body.metadata or {}, ensure_ascii=False),
        ))
        await db.commit()
    except Exception as exc:
        await db.rollback()
        logger.warning("growth_event_write_failed event=%s err=%s", body.event_name, exc)
    return Response(status_code=204)


@router.get("/admin/growth/funnel")
async def admin_growth_funnel(
    days: int = Query(default=7, ge=1, le=90),
    source: Optional[str] = Query(default=None, max_length=80),
    market: Optional[str] = Query(default=None, max_length=20),
    db: AsyncSession = Depends(get_db),
    _: bool = _Admin,
):
    """Return simple event counts and unique-device counts for the growth funnel."""
    since = datetime.utcnow() - timedelta(days=days)
    filters = [GrowthEvent.created_at >= since]
    if source:
        filters.append(GrowthEvent.source == source)
    if market:
        filters.append(GrowthEvent.market == market.lower())

    counts_stmt = (
        select(
            GrowthEvent.event_name,
            func.count(GrowthEvent.id).label("events"),
            func.count(func.distinct(GrowthEvent.device_id)).label("devices"),
            func.count(func.distinct(GrowthEvent.user_id)).label("users"),
        )
        .where(*filters)
        .group_by(GrowthEvent.event_name)
    )
    counts_rows = (await db.execute(counts_stmt)).all()

    landing_stmt = (
        select(
            GrowthEvent.landing_path,
            func.count(GrowthEvent.id).label("events"),
            func.count(func.distinct(GrowthEvent.device_id)).label("devices"),
        )
        .where(*filters, GrowthEvent.landing_path.is_not(None))
        .group_by(GrowthEvent.landing_path)
        .order_by(func.count(GrowthEvent.id).desc())
        .limit(30)
    )
    landing_rows = (await db.execute(landing_stmt)).all()

    return {
        "days": days,
        "since": since.isoformat(),
        "filters": {"source": source, "market": market},
        "events": [
            {
                "event_name": row.event_name,
                "events": row.events,
                "devices": row.devices,
                "users": row.users,
            }
            for row in counts_rows
        ],
        "top_landings": [
            {
                "landing_path": row.landing_path,
                "events": row.events,
                "devices": row.devices,
            }
            for row in landing_rows
        ],
    }
