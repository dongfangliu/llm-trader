"""XBot admin router — manage prediction bot operations."""

import json
from datetime import date, timedelta
from typing import Optional, List
from loguru import logger

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy import select, update, func
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.dependencies.auth import get_admin_token_or_admin_user
from src.database.new_db import get_db
from src.models.xbot import XBotPrediction
from src.models.settings import SystemSetting

router = APIRouter(prefix="/api/admin/xbot", tags=["xbot"])
_Admin = Depends(get_admin_token_or_admin_user)


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class XBotSettingsUpdate(BaseModel):
    xbot_enabled: Optional[str] = None
    xbot_auto_post: Optional[str] = None
    xbot_stocks_count: Optional[str] = None
    xbot_product_url: Optional[str] = None
    xbot_predict_time: Optional[str] = None
    xbot_post_time: Optional[str] = None
    xbot_result_time: Optional[str] = None
    xbot_hashtags: Optional[str] = None
    xbot_disclaimer: Optional[str] = None
    xbot_tweet_template: Optional[str] = None
    xbot_result_template: Optional[str] = None
    xbot_twitter_api_key: Optional[str] = None
    xbot_twitter_api_secret: Optional[str] = None
    xbot_twitter_access_token: Optional[str] = None
    xbot_twitter_access_token_secret: Optional[str] = None


_XBOT_KEYS = [
    "xbot_enabled", "xbot_auto_post", "xbot_stocks_count",
    "xbot_product_url", "xbot_predict_time", "xbot_post_time",
    "xbot_result_time", "xbot_hashtags", "xbot_disclaimer",
    "xbot_tweet_template", "xbot_result_template",
    "xbot_twitter_api_key", "xbot_twitter_api_secret",
    "xbot_twitter_access_token", "xbot_twitter_access_token_secret",
]

_DEFAULT_SETTINGS = {
    "xbot_enabled": "false",
    "xbot_auto_post": "false",
    "xbot_stocks_count": "5",
    "xbot_product_url": "",
    "xbot_predict_time": "16:15",
    "xbot_post_time": "16:30",
    "xbot_result_time": "09:30",
    "xbot_hashtags": "#A股 #AI选股 #股票预测",
    "xbot_disclaimer": "⚠️ 仅供参考，非投资建议",
    "xbot_tweet_template": "",
    "xbot_result_template": "",
    "xbot_twitter_api_key": "",
    "xbot_twitter_api_secret": "",
    "xbot_twitter_access_token": "",
    "xbot_twitter_access_token_secret": "",
}


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------

@router.get("/dashboard")
async def get_dashboard(db: AsyncSession = Depends(get_db), _=_Admin):
    """Overview: bot status, today's prediction progress, accuracy stats."""
    config = await _load_config(db)
    today = date.today()

    total_today = await _count(db, XBotPrediction.prediction_date == today)
    pending_today = await _count(db, XBotPrediction.prediction_date == today, XBotPrediction.status == "pending")
    approved_today = await _count(db, XBotPrediction.prediction_date == today, XBotPrediction.status == "approved")
    posted_today = await _count(db, XBotPrediction.prediction_date == today, XBotPrediction.status == "posted")

    from src.services.xbot.result_service import get_accuracy_stats
    accuracy = await get_accuracy_stats(db)

    total_predictions = await _count(db)
    total_posted = await _count(db, XBotPrediction.prediction_tweet_id.is_not(None))

    predict_time = config.get("xbot_predict_time", "16:15")
    post_time = config.get("xbot_post_time", "16:30")
    auto_post = config.get("xbot_auto_post", "false") == "true"
    enabled = config.get("xbot_enabled", "false") == "true"

    return {
        "enabled": enabled,
        "auto_post": auto_post,
        "predict_time": predict_time,
        "post_time": post_time,
        "today": {
            "total": total_today,
            "pending": pending_today,
            "approved": approved_today,
            "posted": posted_today,
        },
        "accuracy": accuracy,
        "totals": {
            "predictions": total_predictions,
            "posted": total_posted,
        },
    }


# ---------------------------------------------------------------------------
# Predictions list
# ---------------------------------------------------------------------------

@router.get("/predictions")
async def list_predictions(
    prediction_date: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    _=_Admin,
):
    filters = []
    if prediction_date:
        filters.append(XBotPrediction.prediction_date == date.fromisoformat(prediction_date))
    if status:
        filters.append(XBotPrediction.status == status)

    q = select(XBotPrediction).order_by(
        XBotPrediction.prediction_date.desc(),
        XBotPrediction.hot_rank.asc(),
    ).offset(offset).limit(limit)
    if filters:
        q = q.where(*filters)

    result = await db.execute(q)
    predictions = result.scalars().all()
    return [_pred_dict(p) for p in predictions]


@router.get("/predictions/{prediction_id}/card-preview")
async def preview_card(
    prediction_id: int,
    variant: str = Query(default="promise"),
    db: AsyncSession = Depends(get_db),
    _=_Admin,
):
    """Return a single card PNG by variant for admin preview."""
    pred = await _get_prediction(db, prediction_id)
    config = await _load_config(db)

    from src.services.xbot.card_service import generate_prediction_card_set, generate_result_card_set
    from src.services.xbot.result_service import get_accuracy_stats

    stats = await get_accuracy_stats(db)
    product_url = config.get("xbot_product_url", "")
    acc_7d = stats.get("7d", {})
    acc_30d = stats.get("30d", {})

    result_variants = {"proof", "data_conf", "data_price", "data_heat", "data_record"}
    if variant in result_variants and pred.actual_change_pct is not None:
        cards = await generate_result_card_set(
            pred,
            accuracy_7d=acc_7d.get("label", "—"),
            accuracy_7d_pct=acc_7d.get("pct", 0),
            accuracy_30d=acc_30d.get("label", "—"),
            product_url=product_url,
        )
    else:
        cards = await generate_prediction_card_set(
            pred,
            product_url=product_url,
            accuracy_7d=acc_7d.get("label", "—"),
            accuracy_7d_pct=acc_7d.get("pct", 0),
        )

    png = cards.get(variant)
    if not png:
        raise HTTPException(status_code=502, detail=f"Card generation failed for variant: {variant}")
    return Response(content=png, media_type="image/png")


# ---------------------------------------------------------------------------
# Prediction lifecycle actions
# ---------------------------------------------------------------------------

@router.post("/predictions/{prediction_id}/approve")
async def approve_prediction(
    prediction_id: int,
    db: AsyncSession = Depends(get_db),
    _=_Admin,
):
    pred = await _get_prediction(db, prediction_id)
    if pred.status not in ("pending",):
        raise HTTPException(status_code=400, detail=f"Cannot approve prediction with status '{pred.status}'")
    await db.execute(
        update(XBotPrediction).where(XBotPrediction.id == prediction_id).values(status="approved")
    )
    await db.commit()
    return {"ok": True, "status": "approved"}


@router.post("/predictions/{prediction_id}/reject")
async def reject_prediction(
    prediction_id: int,
    db: AsyncSession = Depends(get_db),
    _=_Admin,
):
    pred = await _get_prediction(db, prediction_id)
    if pred.status not in ("pending", "approved"):
        raise HTTPException(status_code=400, detail=f"Cannot reject prediction with status '{pred.status}'")
    await db.execute(
        update(XBotPrediction).where(XBotPrediction.id == prediction_id).values(status="rejected")
    )
    await db.commit()
    return {"ok": True, "status": "rejected"}


@router.post("/predictions/{prediction_id}/post")
async def post_single_prediction(
    prediction_id: int,
    db: AsyncSession = Depends(get_db),
    _=_Admin,
):
    """Immediately post one prediction (auto-approves if pending)."""
    pred = await _get_prediction(db, prediction_id)
    if pred.status in ("posted", "settled"):
        raise HTTPException(status_code=400, detail="Already posted")

    config = await _load_config(db)
    from src.services.xbot.x_publisher import get_publisher_from_settings
    from src.services.xbot.scheduler import _post_prediction_thread
    from src.services.xbot.result_service import get_accuracy_stats

    publisher = await get_publisher_from_settings()
    if not publisher:
        raise HTTPException(status_code=503, detail="Twitter API not configured")

    stats = await get_accuracy_stats(db)
    tweet_id = await _post_prediction_thread(pred, publisher, config, stats)

    if not tweet_id:
        raise HTTPException(status_code=502, detail="Tweet posting failed")

    await db.execute(
        update(XBotPrediction).where(XBotPrediction.id == prediction_id)
        .values(status="posted", prediction_tweet_id=tweet_id)
    )
    await db.commit()
    return {"ok": True, "tweet_id": tweet_id}


# ---------------------------------------------------------------------------
# Bulk actions
# ---------------------------------------------------------------------------

@router.post("/actions/generate")
async def action_generate(_=_Admin):
    """Manually trigger hot stock selection + prediction generation."""
    from src.services.xbot.scheduler import job_generate_predictions
    import asyncio
    task = asyncio.create_task(job_generate_predictions())
    task.add_done_callback(lambda t: t.exception() and logger.error(f"[XBot] generate task error: {t.exception()}"))
    return {"ok": True, "message": "Prediction generation started in background"}


@router.post("/actions/post-approved")
async def action_post_approved(_=_Admin):
    """Post all approved predictions immediately."""
    from src.services.xbot.scheduler import post_approved_predictions
    posted = await post_approved_predictions()
    return {"ok": True, "posted": posted}


@router.post("/actions/settle")
async def action_settle(db: AsyncSession = Depends(get_db), _=_Admin):
    """Manually trigger settlement of yesterday's predictions."""
    from src.services.xbot.scheduler import job_settle_and_post_results
    import asyncio
    task = asyncio.create_task(job_settle_and_post_results())
    task.add_done_callback(lambda t: t.exception() and logger.error(f"[XBot] settle task error: {t.exception()}"))
    return {"ok": True, "message": "Settlement started in background"}


# ---------------------------------------------------------------------------
# Accuracy stats
# ---------------------------------------------------------------------------

@router.get("/accuracy")
async def get_accuracy(db: AsyncSession = Depends(get_db), _=_Admin):
    from src.services.xbot.result_service import get_accuracy_stats
    return await get_accuracy_stats(db)


# ---------------------------------------------------------------------------
# Settings
# ---------------------------------------------------------------------------

@router.get("/settings")
async def get_settings(db: AsyncSession = Depends(get_db), _=_Admin):
    config = await _load_config(db)
    # Mask secret keys in response
    masked = dict(config)
    for secret_key in ("xbot_twitter_api_key", "xbot_twitter_api_secret",
                       "xbot_twitter_access_token", "xbot_twitter_access_token_secret"):
        if masked.get(secret_key):
            masked[secret_key] = "•" * 8
    return {k: masked.get(k, _DEFAULT_SETTINGS.get(k, "")) for k in _XBOT_KEYS}


@router.put("/settings")
async def update_settings(
    body: XBotSettingsUpdate,
    db: AsyncSession = Depends(get_db),
    _=_Admin,
):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    for key, value in updates.items():
        # Don't overwrite credentials with masked placeholder
        if value == "•" * 8:
            continue
        existing = await db.get(SystemSetting, key)
        if existing:
            existing.value = value
        else:
            db.add(SystemSetting(key=key, value=value))
    await db.commit()
    return {"ok": True, "updated": list(updates.keys())}


# ---------------------------------------------------------------------------
# Twitter connectivity test
# ---------------------------------------------------------------------------

@router.post("/test-twitter")
async def test_twitter(_=_Admin):
    from src.services.xbot.x_publisher import get_publisher_from_settings
    publisher = await get_publisher_from_settings()
    if not publisher:
        raise HTTPException(status_code=400, detail="Twitter API credentials not configured")
    try:
        info = publisher.verify_credentials()
        return {"ok": True, "account": info}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Twitter API error: {e}")


@router.post("/test-card")
async def test_card(
    variant: str = Query(default="promise"),
    db: AsyncSession = Depends(get_db),
    _=_Admin,
):
    """Generate a sample card by variant for visual testing."""
    from datetime import date
    from src.services.xbot.card_service import generate_prediction_card_set

    config = await _load_config(db)
    sample = XBotPrediction(
        id=0,
        symbol="600519",
        market="a",
        symbol_name="贵州茅台",
        hot_rank=1,
        prediction_date=date.today(),
        target_date=date.today() + timedelta(days=1),
        predicted_direction="up",
        confidence=87.0,
        target_price=1850.0,
        stop_loss=1780.0,
        close_price=1820.0,
        analysis_summary="MACD金叉，量能持续放大，技术面强势，短期有望继续上行",
        status="pending",
    )
    cards = await generate_prediction_card_set(
        sample,
        product_url=config.get("xbot_product_url", ""),
    )
    png = cards.get(variant)
    if not png:
        raise HTTPException(status_code=502, detail=f"Card generation failed for variant: {variant}")
    return Response(content=png, media_type="image/png")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _load_config(db: AsyncSession) -> dict:
    result = await db.execute(select(SystemSetting).where(SystemSetting.key.in_(_XBOT_KEYS)))
    return {row.key: row.value for row in result.scalars().all()}


async def _get_prediction(db: AsyncSession, prediction_id: int) -> XBotPrediction:
    result = await db.execute(select(XBotPrediction).where(XBotPrediction.id == prediction_id))
    pred = result.scalar_one_or_none()
    if not pred:
        raise HTTPException(status_code=404, detail="Prediction not found")
    return pred


async def _count(db: AsyncSession, *filters) -> int:
    q = select(func.count()).select_from(XBotPrediction)
    if filters:
        q = q.where(*filters)
    return (await db.execute(q)).scalar() or 0


def _pred_dict(p: XBotPrediction) -> dict:
    return {
        "id": p.id,
        "symbol": p.symbol,
        "market": p.market,
        "symbol_name": p.symbol_name,
        "hot_rank": p.hot_rank,
        "prediction_date": str(p.prediction_date),
        "target_date": str(p.target_date),
        "predicted_direction": p.predicted_direction,
        "confidence": p.confidence,
        "target_price": p.target_price,
        "stop_loss": p.stop_loss,
        "close_price": p.close_price,
        "analysis_summary": p.analysis_summary,
        "market_diagnosis": p.market_diagnosis,
        "opportunity_assessment": p.opportunity_assessment,
        "risk_analysis": p.risk_analysis,
        "execution_plan": p.execution_plan,
        "status": p.status,
        "prediction_tweet_id": p.prediction_tweet_id,
        "result_tweet_id": p.result_tweet_id,
        "actual_close": p.actual_close,
        "actual_change_pct": p.actual_change_pct,
        "is_correct": p.is_correct,
        "likes_count": p.likes_count,
        "retweets_count": p.retweets_count,
        "created_at": p.created_at.isoformat() if p.created_at else None,
    }
