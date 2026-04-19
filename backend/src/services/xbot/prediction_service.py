"""Generate AI predictions for xbot, reusing existing LLM analysis pipeline."""

import json
from datetime import date, datetime, timedelta
from typing import List, Dict, Optional
from loguru import logger

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from src.models.xbot import XBotPrediction


async def generate_predictions(
    hot_stocks: List[Dict],
    db: AsyncSession,
) -> List[XBotPrediction]:
    """
    For each hot stock, run AI analysis and save a pending XBotPrediction.
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
    from src.services.llm.llm_service import analyze_with_llm
    from src.database.db import settings as _settings

    df = await fetch_market_data(
        symbol=symbol,
        market=market,
        period="daily",
        start_date=None,
        end_date=None,
    )

    if df is None or df.empty:
        raise ValueError(f"No market data for {symbol}")

    result = await analyze_with_llm(
        df=df,
        symbol=symbol,
        market=market,
        provider=_settings.llm_provider,
        api_key=_settings.llm_api_key,
        base_url=_settings.llm_base_url,
        model=_settings.llm_model,
        max_tokens=_settings.llm_max_tokens,
        temperature=_settings.llm_temperature,
    )

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
    )


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


def _extract_summary(result: dict) -> Optional[str]:
    for key in ("summary", "analysis", "reason", "reasoning", "comment"):
        val = result.get(key)
        if val and isinstance(val, str) and len(val) > 10:
            return val[:200]
    return None


def _safe_float(val) -> Optional[float]:
    if val is None:
        return None
    try:
        f = float(val)
        return f if f > 0 else None
    except (TypeError, ValueError):
        return None
