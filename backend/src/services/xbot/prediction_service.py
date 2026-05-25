"""Generate internal model records, reusing the existing LLM analysis pipeline."""

from datetime import date, datetime, timedelta
from typing import Any, List, Dict, Optional
from loguru import logger

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from src.models.xbot import XBotPrediction


async def generate_predictions(
    hot_stocks: List[Dict],
    db: AsyncSession,
) -> List[XBotPrediction]:
    """
    For each hot stock, run AI analysis and save a pending internal record.
    Skips stocks that already have a prediction for today.
    Returns list of created predictions.
    """
    today = date.today()
    target = _next_trading_day(today)

    created = []
    for stock in hot_stocks:
        symbol = stock["symbol"]
        market = stock["market"]

        # Skip duplicates
        existing = await db.execute(
            select(XBotPrediction).where(
                XBotPrediction.symbol == symbol,
                XBotPrediction.prediction_date == today,
            )
        )
        if existing.scalar_one_or_none():
            logger.info(f"Skipping {symbol} - prediction already exists for today")
            continue

        try:
            prediction = await _analyze_stock(
                symbol=symbol,
                market=market,
                symbol_name=stock["name"],
                hot_rank=stock["hot_rank"],
                prediction_date=today,
                target_date=target,
            )
            db.add(prediction)
            await db.flush()
            created.append(prediction)
            logger.info(f"Created prediction for {symbol} ({stock['name']}): {prediction.predicted_direction}")
        except Exception as e:
            logger.error(f"Failed to analyze {symbol}: {e}")
            continue

    await db.commit()
    return created


async def _analyze_stock(
    symbol: str,
    market: str,
    symbol_name: str,
    hot_rank: int,
    prediction_date: date,
    target_date: date,
) -> XBotPrediction:
    from src.services.data.data_service import fetch_market_data
    from src.services.llm.llm_service import get_model_review_llm_config

    df = await fetch_market_data(
        symbol=symbol,
        market=market,
        period="daily",
        start_date=None,
        end_date=None,
    )

    if df is None or df.empty:
        raise ValueError(f"No market data for {symbol}")

    llm_cfg = await get_model_review_llm_config()
    result, attempts, met_confidence = await _analyze_with_retry(llm_cfg, df, symbol, market)

    direction = _map_action_to_direction(result.get("action", "hold"))
    confidence = _extract_confidence(result)
    target_price = _safe_float(result.get("target_price"))
    stop_loss = _safe_float(result.get("stop_loss"))
    summary = _extract_summary(result)
    close_price = float(df.iloc[-1]["close"])

    return XBotPrediction(
        symbol=symbol,
        market=market,
        symbol_name=symbol_name,
        hot_rank=hot_rank,
        prediction_date=prediction_date,
        target_date=target_date,
        predicted_direction=direction,
        confidence=confidence,
        target_price=target_price,
        stop_loss=stop_loss,
        close_price=close_price,
        analysis_summary=summary,
        market_diagnosis=result.get("market_diagnosis"),
        opportunity_assessment=result.get("opportunity_assessment"),
        risk_analysis=result.get("risk_analysis"),
        execution_plan=result.get("execution_plan"),
        status="pending",
        attempts=attempts,
        met_confidence=met_confidence,
    )


async def _analyze_with_retry(
    llm_cfg: dict,
    df,
    symbol: str,
    market: str,
):
    """Repeatedly sample the LLM until a result clears the configured confidence
    threshold, then return that result. If no attempt clears, return the
    best-effort result (highest confidence seen).

    Returns: (result_dict, attempts_used, met_threshold)
    """
    from src.services.llm.llm_service import analyze_with_llm

    threshold = float(llm_cfg.get("confidence_threshold", 75.0))
    max_attempts = int(llm_cfg.get("max_attempts", 3))
    step = float(llm_cfg.get("retry_temperature_step", 0.1))
    base_temp = float(llm_cfg.get("temperature", 0.7))

    best_conf = -1.0
    best_result = None
    last_error: Exception | None = None

    for i in range(max_attempts):
        temp_i = max(0.0, min(2.0, base_temp + i * step))
        try:
            r = await analyze_with_llm(
                df=df,
                symbol=symbol,
                market=market,
                provider=llm_cfg["provider"],
                api_key=llm_cfg["api_key"],
                base_url=llm_cfg["base_url"],
                model=llm_cfg["model"],
                max_tokens=llm_cfg["max_tokens"],
                temperature=temp_i,
                timeout=llm_cfg["timeout_seconds"],
                thinking_enabled=llm_cfg["thinking_enabled"],
                thinking_effort=llm_cfg["thinking_effort"],
                period="daily",
            )
        except Exception as e:
            last_error = e
            logger.warning(f"[ModelReview] {symbol} attempt {i+1}/{max_attempts} failed: {e}")
            continue

        c = _extract_confidence(r) or 0.0
        logger.info(f"[ModelReview] {symbol} attempt {i+1}/{max_attempts} confidence={c} threshold={threshold} temp={temp_i:.2f}")
        if c >= threshold:
            return r, i + 1, True
        if c > best_conf:
            best_conf = c
            best_result = r

    if best_result is None:
        if last_error is not None:
            raise last_error
        raise RuntimeError(f"LLM 未能产出有效预测 ({max_attempts} 次尝试均失败)")

    return best_result, max_attempts, False


async def regenerate_prediction(existing: XBotPrediction, db: AsyncSession) -> XBotPrediction:
    """Re-run analysis for an existing prediction record and overwrite fields in place.

    Keeps id/prediction_date/target_date/created_at; resets status to 'pending' and
    clears settlement fields so the record re-enters the review queue.
    """
    try:
        fresh = await _analyze_stock(
            symbol=existing.symbol,
            market=existing.market,
            symbol_name=existing.symbol_name,
            hot_rank=existing.hot_rank or 0,
            prediction_date=existing.prediction_date,
            target_date=existing.target_date,
        )
    except Exception as e:
        await db.rollback()
        reason = str(e) or e.__class__.__name__
        logger.error(f"[Regenerate] Failed to re-analyze {existing.symbol}: {reason}")
        raise RuntimeError(reason) from e

    for attr in (
        "predicted_direction", "confidence", "target_price", "stop_loss",
        "close_price", "analysis_summary", "market_diagnosis",
        "opportunity_assessment", "risk_analysis", "execution_plan",
        "attempts", "met_confidence",
    ):
        setattr(existing, attr, getattr(fresh, attr))
    existing.status = "pending"
    existing.actual_close = None
    existing.actual_change_pct = None
    existing.is_correct = None
    await db.commit()
    await db.refresh(existing)
    logger.info(f"[Regenerate] Refreshed prediction {existing.id} ({existing.symbol})")
    return existing


async def generate_single_prediction(stock: Dict, db: AsyncSession) -> XBotPrediction:
    """Generate AI prediction for a single stock dict and save it.

    Raises with the underlying failure reason so the admin UI can show an
    actionable message instead of a generic "generation failed" toast.
    """
    today = date.today()
    target = _next_trading_day(today)
    try:
        prediction = await _analyze_stock(
            symbol=stock["symbol"],
            market=stock["market"],
            symbol_name=stock["name"],
            hot_rank=stock.get("hot_rank", 0),
            prediction_date=today,
            target_date=target,
        )
        db.add(prediction)
        await db.commit()
        await db.refresh(prediction)
        logger.info(f"[Single] Created prediction for {stock['symbol']} ({stock['name']}): {prediction.predicted_direction}")
        return prediction
    except Exception as e:
        await db.rollback()
        reason = str(e) or e.__class__.__name__
        logger.error(f"[Single] Failed to analyze {stock['symbol']}: {reason}")
        raise RuntimeError(reason) from e


def _next_trading_day(d: date) -> date:
    next_day = d + timedelta(days=1)
    # Skip weekends
    while next_day.weekday() >= 5:
        next_day += timedelta(days=1)
    return next_day


def _map_action_to_direction(action: str) -> str:
    action = str(action).lower()
    if action in ("buy", "open_long"):
        return "up"
    if action in ("sell", "open_short", "close_long"):
        return "down"
    return "hold"


def _extract_confidence(result: dict) -> Optional[float]:
    for key in ("confidence", "confidence_score", "score"):
        val = result.get(key)
        if val is not None:
            try:
                f = float(val)
                return round(f * 100 if f <= 1.0 else f, 1)
            except (TypeError, ValueError):
                pass
    return None


_SUMMARY_FALLBACK = "暂无完整摘要，需结合市场诊断、机会评估、风险收益与执行方案进一步人工复核。"
_SECTION_KEYS = ("market_diagnosis", "opportunity_assessment", "risk_analysis", "execution_plan")


def _extract_summary(result: dict) -> str:
    """Return a concise readable summary for new model-review records."""
    val = result.get("summary")
    if isinstance(val, str) and len(_clean_summary_text(val)) >= 10:
        return _clip_summary(val, max_len=200)

    reasons = result.get("reasons")
    if isinstance(reasons, list):
        reason_text = "；".join(_clean_summary_text(str(x)) for x in reasons if x)
        if reason_text:
            return _clip_summary(reason_text, min_len=80, max_len=120)

    for key in ("analysis", "reason", "reasoning", "comment"):
        val = result.get(key)
        if isinstance(val, str) and len(_clean_summary_text(val)) >= 10:
            return _clip_summary(val, min_len=80, max_len=120)

    section_text = "；".join(
        _clean_summary_text(str(result.get(key) or ""))
        for key in _SECTION_KEYS
        if result.get(key)
    )
    if section_text:
        return _clip_summary(section_text, min_len=80, max_len=120)

    return _SUMMARY_FALLBACK


def summarize_prediction(pred: Any) -> str:
    """Read-only summary fallback for historical DB rows."""
    if getattr(pred, "analysis_summary", None):
        summary = _clean_summary_text(str(pred.analysis_summary))
        if summary:
            return _clip_summary(summary, max_len=200)
    return _extract_summary({
        "market_diagnosis": getattr(pred, "market_diagnosis", None),
        "opportunity_assessment": getattr(pred, "opportunity_assessment", None),
        "risk_analysis": getattr(pred, "risk_analysis", None),
        "execution_plan": getattr(pred, "execution_plan", None),
    })


def _clean_summary_text(text: str) -> str:
    return " ".join(str(text or "").replace("\n", " ").replace("\r", " ").split())


def _clip_summary(text: str, min_len: int = 0, max_len: int = 120) -> str:
    cleaned = _clean_summary_text(text)
    if not cleaned:
        return _SUMMARY_FALLBACK
    if len(cleaned) <= max_len:
        return cleaned

    clipped = cleaned[:max_len].rstrip("，,；;。 ")
    if len(clipped) < min_len:
        clipped = cleaned[:min(max_len, len(cleaned))].rstrip("，,；;。 ")
    return f"{clipped}。"


def _safe_float(val) -> Optional[float]:
    if val is None:
        return None
    try:
        f = float(val)
        return f if f > 0 else None
    except (TypeError, ValueError):
        return None
