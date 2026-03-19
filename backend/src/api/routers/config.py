"""Config / health router — GET /api/health and GET /api/config."""

from datetime import datetime
from fastapi import APIRouter
from src.config import settings

router = APIRouter(prefix="/api", tags=["config"])


@router.get("/health")
async def health():
    """Liveness probe."""
    return {"status": "ok", "timestamp": datetime.utcnow().isoformat(), "version": "2.0.0"}


@router.get("/config")
async def get_config():
    """Return public runtime configuration for the frontend."""
    return {
        "app_name": settings.app_name,
        "pricing_period": settings.pricing_period,
        "pricing_guest_daily": settings.pricing_guest_daily,
        "pricing_free_daily": settings.pricing_free_daily,
        "pricing_basic_price": settings.pricing_basic_price,
        "pricing_basic_daily": settings.pricing_basic_daily,
        "pricing_premium_price": settings.pricing_premium_price,
        "pricing_premium_daily": settings.pricing_premium_daily,
        "afdian_basic_link": settings.afdian_basic_link,
        "afdian_premium_link": settings.afdian_premium_link,
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
