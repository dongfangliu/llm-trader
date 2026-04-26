"""Config / health router — GET /api/health and GET /api/config."""

import json
from datetime import datetime
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from src.config import settings
from src.database.new_db import get_db
from src.models.settings import SystemSetting
from src.services.llm.llm_service import normalize_timeout_seconds

router = APIRouter(prefix="/api", tags=["config"])


@router.get("/health")
async def health():
    """Liveness probe."""
    return {"status": "ok", "timestamp": datetime.utcnow().isoformat(), "version": "2.0.0"}


@router.get("/config")
async def get_config(db: AsyncSession = Depends(get_db)):
    """Return public runtime configuration for the frontend, overlaid with DB settings."""
    # Start with env-based defaults
    app_name = settings.app_name
    require_invite_code = False
    pricing_period = settings.pricing_period
    pricing_guest_daily = settings.pricing_guest_daily
    pricing_free_daily = settings.pricing_free_daily
    pricing_basic_price = settings.pricing_basic_price
    pricing_basic_daily = settings.pricing_basic_daily
    pricing_basic_deep_daily = settings.pricing_basic_deep_daily
    pricing_premium_price = settings.pricing_premium_price
    pricing_premium_daily = settings.pricing_premium_daily
    afdian_basic_link = settings.afdian_basic_link
    afdian_premium_link = settings.afdian_premium_link
    analyze_timeout_seconds = normalize_timeout_seconds(settings.llm_timeout_seconds)

    # Overlay with DB settings
    for section_key in ("app", "pricing", "afdian", "llm"):
        row = await db.get(SystemSetting, section_key)
        if not row:
            continue
        try:
            data = json.loads(row.value)
        except Exception:
            continue
        if section_key == "app":
            app_name = data.get("name", app_name)
            require_invite_code = bool(data.get("require_invite_code", False))
        elif section_key == "pricing":
            pricing_period = data.get("period", pricing_period)
            pricing_guest_daily = data.get("guest_daily", pricing_guest_daily)
            pricing_free_daily = data.get("free_daily", pricing_free_daily)
            basic = data.get("basic", {})
            premium = data.get("premium", {})
            pricing_basic_price = basic.get("price", pricing_basic_price)
            pricing_basic_daily = basic.get("daily", pricing_basic_daily)
            pricing_basic_deep_daily = int(basic.get("deep_daily", pricing_basic_deep_daily))
            pricing_premium_price = premium.get("price", pricing_premium_price)
            pricing_premium_daily = premium.get("daily", pricing_premium_daily)
        elif section_key == "afdian":
            afdian_basic_link = data.get("basic_link", afdian_basic_link)
            afdian_premium_link = data.get("premium_link", afdian_premium_link)
        elif section_key == "llm":
            analyze_timeout_seconds = normalize_timeout_seconds(data.get("timeout_seconds"))

    return {
        "app_name": app_name,
        "require_invite_code": require_invite_code,
        "pricing_period": pricing_period,
        "pricing_guest_daily": pricing_guest_daily,
        "pricing_free_daily": pricing_free_daily,
        "pricing_basic_price": pricing_basic_price,
        "pricing_basic_daily": pricing_basic_daily,
        "pricing_basic_deep_daily": pricing_basic_deep_daily,
        "pricing_premium_price": pricing_premium_price,
        "pricing_premium_daily": pricing_premium_daily,
        "analyze_timeout_seconds": analyze_timeout_seconds,
        "afdian_basic_link": afdian_basic_link,
        "afdian_premium_link": afdian_premium_link,
        "markets": [
            {"value": "a", "label": "A股"},
            {"value": "hk", "label": "港股"},
            {"value": "us", "label": "美股"},
            {"value": "futures", "label": "期货"},
        ],
        "periods": [
            {"value": "daily", "label": "日线"},
            {"value": "60", "label": "60分"},
            {"value": "30", "label": "30分"},
            {"value": "15", "label": "15分"},
            {"value": "5", "label": "5分"},
            {"value": "1", "label": "1分"},
        ],
        "version": "2.0.0",
    }
