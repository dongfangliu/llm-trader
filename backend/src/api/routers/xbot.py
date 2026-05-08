"""Legacy xbot admin router backing the model-review workflow."""

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
from src.models.market import SymbolName
from src.models.xbot import XBotPrediction
from src.models.settings import SystemSetting
from src.services.xbot.prediction_service import summarize_prediction

router = APIRouter(prefix="/api/admin/xbot", tags=["xbot"])
public_router = APIRouter(prefix="/api/public", tags=["public"])
_Admin = Depends(get_admin_token_or_admin_user)
PUBLIC_RESEARCH_STATUSES = ("approved", "posted", "settled")


# ---------------------------------------------------------------------------
# Public endpoints (no auth required)
# ---------------------------------------------------------------------------

@public_router.get("/predictions")
async def public_list_predictions(
    limit: int = Query(default=20, le=50),
    market: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    """Public feed: latest approved, posted, or settled model records (no auth)."""
    filters = [
        XBotPrediction.status.in_(PUBLIC_RESEARCH_STATUSES),
    ]
    if market:
        filters.append(XBotPrediction.market == market.lower())

    q = (
        select(XBotPrediction)
        .where(*filters)
        .order_by(XBotPrediction.prediction_date.desc(), XBotPrediction.hot_rank.asc())
        .limit(limit)
    )
    result = await db.execute(q)
    predictions = result.scalars().all()

    from src.services.xbot.result_service import get_accuracy_stats
    stats = await get_accuracy_stats(db)
    config = await _load_config(db)

    return {
        "predictions": [_public_pred_dict(p, config) for p in predictions],
        "accuracy": stats.get("all", {}),
    }


@public_router.get("/research")
async def public_research_index(
    limit: int = Query(default=100, le=300),
    market: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    """SEO-safe index of public model records."""
    return await public_list_predictions(limit=limit, market=market, db=db)


@public_router.get("/research/{market}/{symbol}")
async def public_research_symbol(
    market: str,
    symbol: str,
    limit: int = Query(default=50, le=100),
    db: AsyncSession = Depends(get_db),
):
    q = (
        select(XBotPrediction)
        .where(
            XBotPrediction.status.in_(PUBLIC_RESEARCH_STATUSES),
            XBotPrediction.market == market.lower(),
            XBotPrediction.symbol == symbol.upper(),
        )
        .order_by(XBotPrediction.prediction_date.desc())
        .limit(limit)
    )
    result = await db.execute(q)
    predictions = result.scalars().all()
    config = await _load_config(db)
    from src.services.xbot.result_service import get_accuracy_stats
    stats = await get_accuracy_stats(db)
    return {
        "symbol": symbol.upper(),
        "market": market.lower(),
        "records": [_public_pred_dict(p, config) for p in predictions],
        "accuracy": stats.get("all", {}),
    }


@public_router.get("/research/{market}/{symbol}/{prediction_date}")
async def public_research_detail(
    market: str,
    symbol: str,
    prediction_date: str,
    db: AsyncSession = Depends(get_db),
):
    try:
        pred_date = date.fromisoformat(prediction_date)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date")

    pred = await _get_public_prediction(db, market, symbol, pred_date)
    config = await _load_config(db)
    return {"record": _public_pred_dict(pred, config)}


@public_router.get("/research/{market}/{symbol}/{prediction_date}/card")
async def public_research_card(
    market: str,
    symbol: str,
    prediction_date: str,
    variant: str = Query(default="promise", pattern="^(promise|proof)$"),
    db: AsyncSession = Depends(get_db),
):
    """Public image for a public research record.

    Approved/posted records can render the original prediction card. Result
    proof cards require a settled record or settlement fields.
    """
    try:
        pred_date = date.fromisoformat(prediction_date)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date")

    pred = await _get_public_prediction(db, market, symbol, pred_date)
    if variant == "proof" and not _has_settlement_result(pred):
        raise HTTPException(status_code=404, detail="卡片暂不可用")
    config = await _load_config(db)

    from src.services.xbot.card_service import generate_prediction_card_set, generate_result_card_set
    from src.services.xbot.result_service import get_accuracy_stats

    stats = await get_accuracy_stats(db)
    acc_all = stats.get("all", {})
    product_url = await _get_public_base_url(db, config)
    brand_name = await _get_app_name(db)

    if variant == "proof":
        cards = await generate_result_card_set(
            pred,
            accuracy_all=acc_all.get("label", "—"),
            product_url=product_url,
            brand_name=brand_name,
        )
    else:
        cards = await generate_prediction_card_set(
            pred,
            product_url=product_url,
            brand_name=brand_name,
            accuracy_all=acc_all.get("label", "—"),
        )

    png = cards.get(variant)
    if not png:
        raise HTTPException(status_code=502, detail=f"Card generation failed for variant: {variant}")
    return Response(
        content=png,
        media_type="image/png",
        headers={"Cache-Control": "public, max-age=3600"},
    )


async def _get_public_prediction(
    db: AsyncSession,
    market: str,
    symbol: str,
    prediction_date: date,
) -> XBotPrediction:
    result = await db.execute(
        select(XBotPrediction).where(
            XBotPrediction.status.in_(PUBLIC_RESEARCH_STATUSES),
            XBotPrediction.market == market.lower(),
            XBotPrediction.symbol == symbol.upper(),
            XBotPrediction.prediction_date == prediction_date,
        )
    )
    pred = result.scalar_one_or_none()
    if not pred:
        raise HTTPException(status_code=404, detail="Record not found")
    return pred


def _has_settlement_result(p: XBotPrediction) -> bool:
    return (
        p.status == "settled"
        or p.actual_close is not None
        or p.actual_change_pct is not None
        or p.is_correct is not None
    )


def _public_pred_dict(p: XBotPrediction, config: dict) -> dict:
    product_url = config.get("public_base_url") or config.get("xbot_product_url", "")
    return {
        "id": p.id,
        "symbol": p.symbol,
        "market": p.market,
        "symbol_name": p.symbol_name,
        "hot_rank": p.hot_rank,
        "prediction_date": str(p.prediction_date),
        "target_date": str(p.target_date) if p.target_date else None,
        "predicted_direction": p.predicted_direction,
        "confidence": p.confidence,
        "close_price": p.close_price,
        "target_price": p.target_price,
        "stop_loss": p.stop_loss,
        "analysis_summary": summarize_prediction(p),
        "market_diagnosis": p.market_diagnosis,
        "opportunity_assessment": p.opportunity_assessment,
        "risk_analysis": p.risk_analysis,
        "execution_plan": p.execution_plan,
        "status": p.status,
        "actual_change_pct": p.actual_change_pct,
        "actual_close": p.actual_close,
        "is_correct": p.is_correct,
        "product_url": product_url,
    }


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class BulkActionRequest(BaseModel):
    ids: List[int]


class XBotSettingsUpdate(BaseModel):
    xbot_enabled: Optional[str] = None
    xbot_operation_mode: Optional[str] = None
    xbot_markets: Optional[str] = None
    xbot_hot_stock_count: Optional[str] = None
    xbot_min_price_a: Optional[str] = None
    xbot_min_price_hk: Optional[str] = None
    xbot_product_url: Optional[str] = None
    xbot_predict_time: Optional[str] = None
    xbot_a_settle_time: Optional[str] = None
    xbot_hk_settle_time: Optional[str] = None
    xbot_settlement_mode: Optional[str] = None
    xbot_hashtags: Optional[str] = None
    xbot_disclaimer: Optional[str] = None


_XBOT_KEYS = [
    "xbot_enabled", "xbot_operation_mode", "xbot_markets", "xbot_hot_stock_count",
    "xbot_min_price_a", "xbot_min_price_hk",
    "xbot_product_url", "xbot_predict_time",
    "xbot_a_settle_time", "xbot_hk_settle_time",
    "xbot_settlement_mode", "xbot_hashtags", "xbot_disclaimer",
]

_DEFAULT_SETTINGS = {
    "xbot_enabled": "false",
    "xbot_operation_mode": "manual",
    "xbot_markets": "a,hk",
    "xbot_hot_stock_count": "5",
    "xbot_min_price_a": "5",
    "xbot_min_price_hk": "1",
    "xbot_product_url": "",
    "xbot_predict_time": "16:45",
    "xbot_a_settle_time": "15:30",
    "xbot_hk_settle_time": "16:30",
    "xbot_settlement_mode": "per_stock",
    "xbot_hashtags": "#A股 #K线AI分析 #股票预测",
    "xbot_disclaimer": "⚠️ 仅供参考，非投资建议",
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
    settled_today = await _count(db, XBotPrediction.prediction_date == today, XBotPrediction.status == "settled")

    from src.services.xbot.result_service import get_accuracy_stats
    accuracy = await get_accuracy_stats(db)

    total_predictions = await _count(db)
    total_settled = await _count(db, XBotPrediction.status == "settled")

    predict_time    = config.get("xbot_predict_time", "16:45")
    a_settle_time   = config.get("xbot_a_settle_time", "15:30")
    hk_settle_time  = config.get("xbot_hk_settle_time", "16:30")
    markets         = config.get("xbot_markets", "a,hk")
    enabled = config.get("xbot_enabled", "false") == "true"
    operation_mode = config.get("xbot_operation_mode", "manual")

    return {
        "enabled": enabled,
        "operation_mode": operation_mode,
        "markets": markets,
        "predict_time": predict_time,
        "a_settle_time": a_settle_time,
        "hk_settle_time": hk_settle_time,
        "today": {
            "total": total_today,
            "pending": pending_today,
            "approved": approved_today,
            "settled": settled_today,
        },
        "accuracy": accuracy,
        "totals": {
            "predictions": total_predictions,
            "settled": total_settled,
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


@router.get("/predictions/{prediction_id}")
async def get_prediction_detail(
    prediction_id: int,
    db: AsyncSession = Depends(get_db),
    _=_Admin,
):
    """Return full detail for a single prediction."""
    pred = await _get_prediction(db, prediction_id)
    return _pred_dict(pred)


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
    product_url = await _get_public_base_url(db, config)
    brand_name = await _get_app_name(db)
    acc_all = stats.get("all", {})

    result_variants = {"proof", "data_record"}
    if variant in result_variants and pred.actual_change_pct is not None:
        cards = await generate_result_card_set(
            pred,
            accuracy_all=acc_all.get("label", "—"),
            product_url=product_url,
            brand_name=brand_name,
        )
    else:
        cards = await generate_prediction_card_set(
            pred,
            product_url=product_url,
            brand_name=brand_name,
            accuracy_all=acc_all.get("label", "—"),
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


# ---------------------------------------------------------------------------
# Bulk actions
# ---------------------------------------------------------------------------

@router.get("/candidates")
async def get_candidates(db: AsyncSession = Depends(get_db), _=_Admin):
    """Scan hot stocks and return candidate list WITHOUT generating predictions."""
    from src.services.xbot.hot_stocks_service import get_hot_stocks, get_hk_hot_stocks
    config = await _load_config(db)
    markets = [m.strip() for m in config.get("xbot_markets", "a,hk").split(",") if m.strip()]
    count = int(config.get("xbot_hot_stock_count", 5))

    candidates = []
    diagnostics = {
        "a": {"market": "a", "enabled": "a" in markets, "requested": 0, "returned": 0, "filtered": 0, "filter_reasons": {}, "error": None},
        "hk": {"market": "hk", "enabled": "hk" in markets, "requested": 0, "returned": 0, "filtered": 0, "filter_reasons": {}, "error": None},
    }
    if "a" in markets:
        rows, diag = await get_hot_stocks(
            count=count,
            min_price=float(config.get("xbot_min_price_a", 5)),
            with_diagnostics=True,
        )
        diagnostics["a"] = diag
        candidates.extend(rows)
    if "hk" in markets:
        rows, diag = await get_hk_hot_stocks(
            count=count,
            min_price=float(config.get("xbot_min_price_hk", 1)),
            with_diagnostics=True,
        )
        diagnostics["hk"] = diag
        candidates.extend(rows)

    # Mark which candidates already have a prediction today
    return {
        "candidates": await _mark_candidate_status(db, candidates),
        "diagnostics": diagnostics,
    }


class GenerateSingleRequest(BaseModel):
    symbol: str
    market: str
    name: Optional[str] = None
    hot_rank: int = 0


class ManualCandidateRequest(BaseModel):
    market: str
    symbol: str
    name: Optional[str] = None


@router.post("/candidates/manual")
async def add_manual_candidate(
    body: ManualCandidateRequest,
    db: AsyncSession = Depends(get_db),
    _=_Admin,
):
    """Validate and return one manual candidate without creating a prediction record."""
    market, symbol = _normalize_candidate_or_400(body.market, body.symbol)
    name = (body.name or "").strip() or await _lookup_symbol_name(db, market, symbol) or symbol
    hot_rank = 9000
    marked = await _mark_candidate_status(
        db,
        [{"symbol": symbol, "market": market, "name": name, "hot_rank": hot_rank, "source": "manual"}],
    )
    return {"candidate": marked[0]}


@router.post("/actions/generate-single")
async def action_generate_single(body: GenerateSingleRequest, db: AsyncSession = Depends(get_db), _=_Admin):
    """Generate AI prediction for a single candidate stock."""
    from src.services.xbot.prediction_service import generate_single_prediction

    market, symbol = _normalize_candidate_or_400(body.market, body.symbol)
    name = (body.name or "").strip() or await _lookup_symbol_name(db, market, symbol) or symbol
    today = date.today()
    existing = await db.execute(
        select(XBotPrediction).where(
            XBotPrediction.prediction_date == today,
            XBotPrediction.market == market,
            XBotPrediction.symbol == symbol,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail=f"{symbol} 今日预测已存在")

    stock = {"symbol": symbol, "market": market, "name": name, "hot_rank": body.hot_rank}
    try:
        pred = await generate_single_prediction(stock, db)
    except Exception as exc:
        reason = str(exc) or "未知错误"
        raise HTTPException(status_code=500, detail=f"{symbol} 分析生成失败：{reason}")
    return _pred_dict(pred)


@router.post("/actions/generate")
async def action_generate(_=_Admin):
    """Manually trigger hot stock selection + prediction generation (legacy, generates all at once)."""
    from src.services.xbot.scheduler import job_generate_predictions
    import asyncio
    task = asyncio.create_task(job_generate_predictions(force=True))
    task.add_done_callback(lambda t: t.exception() and logger.error(f"[XBot] generate task error: {t.exception()}"))
    return {"ok": True, "message": "Prediction generation started in background"}


@router.post("/actions/reload-scheduler")
async def action_reload_scheduler(db: AsyncSession = Depends(get_db), _=_Admin):
    """Reload scheduler jobs from current DB settings (call after changing times or toggling enabled)."""
    from src.services.xbot.scheduler import get_scheduler, _load_config, _register_jobs, _is_auto_enabled
    config = await _load_config()
    scheduler = get_scheduler()
    if not _is_auto_enabled(config):
        if scheduler.running:
            scheduler.shutdown(wait=False)
            return {"ok": True, "message": "Scheduler stopped (manual mode or disabled)"}
        return {"ok": True, "message": "Scheduler already stopped"}
    if not scheduler.running:
        scheduler.start()
    _register_jobs(scheduler, config)
    return {"ok": True, "message": "Scheduler jobs reloaded with latest config"}


@router.post("/actions/settle")
async def action_settle(
    market: Optional[str] = Query(default=None, description="a or hk; omit for all"),
    _=_Admin,
):
    """Manually trigger settlement of today's predictions (by market or all)."""
    from src.services.xbot.scheduler import job_settle_a_shares, job_settle_hk_shares
    import asyncio
    if market == "a":
        task = asyncio.create_task(job_settle_a_shares(force=True))
    elif market == "hk":
        task = asyncio.create_task(job_settle_hk_shares(force=True))
    else:
        async def _settle_all():
            await job_settle_a_shares(force=True)
            await job_settle_hk_shares(force=True)
        task = asyncio.create_task(_settle_all())
    task.add_done_callback(lambda t: t.exception() and logger.error(f"[XBot] settle task error: {t.exception()}"))
    return {"ok": True, "message": f"Settlement started for market={market or 'all'}"}


# ---------------------------------------------------------------------------
# Bulk approve / reject
# ---------------------------------------------------------------------------

@router.post("/actions/bulk-approve")
async def action_bulk_approve(
    body: BulkActionRequest,
    db: AsyncSession = Depends(get_db),
    _=_Admin,
):
    """Bulk approve pending/rejected predictions by ID list."""
    if not body.ids:
        return {"ok": True, "approved": 0}
    await db.execute(
        update(XBotPrediction)
        .where(XBotPrediction.id.in_(body.ids), XBotPrediction.status.in_(["pending", "rejected"]))
        .values(status="approved")
    )
    await db.commit()
    return {"ok": True, "approved": len(body.ids)}


@router.post("/actions/bulk-reject")
async def action_bulk_reject(
    body: BulkActionRequest,
    db: AsyncSession = Depends(get_db),
    _=_Admin,
):
    """Bulk reject pending/approved predictions by ID list."""
    if not body.ids:
        return {"ok": True, "rejected": 0}
    await db.execute(
        update(XBotPrediction)
        .where(XBotPrediction.id.in_(body.ids), XBotPrediction.status.in_(["pending", "approved"]))
        .values(status="rejected")
    )
    await db.commit()
    return {"ok": True, "rejected": len(body.ids)}


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
    return {k: config.get(k, _DEFAULT_SETTINGS.get(k, "")) for k in _XBOT_KEYS}


@router.put("/settings")
async def update_settings(
    body: XBotSettingsUpdate,
    db: AsyncSession = Depends(get_db),
    _=_Admin,
):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    for key, value in updates.items():
        existing = await db.get(SystemSetting, key)
        if existing:
            existing.value = value
        else:
            db.add(SystemSetting(key=key, value=value))
    await db.commit()
    return {"ok": True, "updated": list(updates.keys())}


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
        product_url=await _get_public_base_url(db, config),
    )
    png = cards.get(variant)
    if not png:
        raise HTTPException(status_code=502, detail=f"Card generation failed for variant: {variant}")
    return Response(content=png, media_type="image/png")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def ensure_default_settings(db: AsyncSession) -> None:
    """Write default values for any missing xbot settings. Called on app startup."""
    result = await db.execute(select(SystemSetting).where(SystemSetting.key.in_(_XBOT_KEYS)))
    existing = {row.key for row in result.scalars().all()}
    for key, default_val in _DEFAULT_SETTINGS.items():
        if key not in existing:
            db.add(SystemSetting(key=key, value=default_val))
    await db.commit()


async def _load_config(db: AsyncSession) -> dict:
    result = await db.execute(select(SystemSetting).where(SystemSetting.key.in_(_XBOT_KEYS)))
    rows = {row.key: row.value for row in result.scalars().all()}
    config = {k: rows.get(k, _DEFAULT_SETTINGS.get(k, "")) for k in _XBOT_KEYS}
    config["public_base_url"] = await _get_public_base_url(db, config)
    return config


async def _get_public_base_url(db: AsyncSession, config: Optional[dict] = None) -> str:
    """Prefer admin/settings email.app_base_url for public card footers."""
    row = await db.get(SystemSetting, "email")
    if row:
        try:
            app_base_url = (json.loads(row.value).get("app_base_url") or "").strip()
            if app_base_url:
                return app_base_url
        except Exception:
            pass
    return ((config or {}).get("xbot_product_url") or "").strip()


async def _get_app_name(db: AsyncSession) -> str:
    row = await db.get(SystemSetting, "app")
    if row:
        try:
            return json.loads(row.value).get("name", "")
        except Exception:
            pass
    return ""


def _normalize_candidate_or_400(market: str, symbol: str) -> tuple[str, str]:
    from src.services.xbot.hot_stocks_service import normalize_candidate_symbol

    normalized_market, normalized_symbol = normalize_candidate_symbol(symbol, market)
    if normalized_market not in ("a", "hk") or not normalized_symbol:
        raise HTTPException(status_code=400, detail="标的代码格式不正确")
    return normalized_market, normalized_symbol


async def _lookup_symbol_name(db: AsyncSession, market: str, symbol: str) -> Optional[str]:
    row = await db.get(SymbolName, {"market": market, "symbol": symbol})
    return row.name if row and row.name else None


async def _mark_candidate_status(db: AsyncSession, candidates: List[dict]) -> List[dict]:
    today = date.today()
    if not candidates:
        return []

    symbols = sorted({c["symbol"] for c in candidates})
    markets = sorted({c["market"] for c in candidates})
    result = await db.execute(
        select(XBotPrediction).where(
            XBotPrediction.prediction_date == today,
            XBotPrediction.symbol.in_(symbols),
            XBotPrediction.market.in_(markets),
        )
    )
    existing = {
        (p.market, p.symbol): {"id": getattr(p, "id", None), "status": p.status}
        for p in result.scalars().all()
    }
    return [
        {
            **c,
            "already_generated": (c["market"], c["symbol"]) in existing,
            "existing_status": existing.get((c["market"], c["symbol"]), {}).get("status"),
            "existing_prediction_id": existing.get((c["market"], c["symbol"]), {}).get("id"),
        }
        for c in candidates
    ]


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
        "analysis_summary": summarize_prediction(p),
        "market_diagnosis": p.market_diagnosis,
        "opportunity_assessment": p.opportunity_assessment,
        "risk_analysis": p.risk_analysis,
        "execution_plan": p.execution_plan,
        "status": p.status,
        "actual_close": p.actual_close,
        "actual_change_pct": p.actual_change_pct,
        "is_correct": p.is_correct,
        "created_at": p.created_at.isoformat() if p.created_at else None,
    }
