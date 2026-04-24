"""Settle yesterday's predictions and post result tweets."""

import asyncio
from datetime import date, timedelta
from typing import Optional, Tuple
from loguru import logger

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from src.models.xbot import XBotPrediction


async def settle_predictions(db: AsyncSession) -> int:
    """Settle all posted predictions with target_date = today (market-agnostic)."""
    return await settle_predictions_for_market(db, market=None)


async def settle_predictions_for_market(db: AsyncSession, market: str | None) -> int:
    """
    Fetch actual close prices for posted predictions with target_date = today.
    When market is None, settles all markets.
    Returns number of settled predictions.
    """
    today = date.today()
    q = select(XBotPrediction).where(
        XBotPrediction.target_date == today,
        XBotPrediction.status == "posted",
        XBotPrediction.actual_close.is_(None),
        XBotPrediction.prediction_tweet_id.is_not(None),   # 只结算真正发过推的
    )
    if market:
        q = q.where(XBotPrediction.market == market)
    result = await db.execute(q)
    predictions = result.scalars().all()

    if not predictions:
        logger.info(f"No predictions to settle for market={market or 'all'}")
        return 0

    settled = 0
    for pred in predictions:
        try:
            actual_close = await _fetch_actual_close(pred.symbol, pred.market, today)
            if actual_close is None or pred.close_price is None or pred.close_price <= 0:
                continue

            change_pct = (actual_close - pred.close_price) / pred.close_price * 100
            actual_direction = "up" if change_pct > 0.5 else ("down" if change_pct < -0.5 else "hold")
            is_correct = actual_direction == pred.predicted_direction

            pred.actual_close = actual_close
            pred.actual_change_pct = round(change_pct, 2)
            pred.is_correct = is_correct
            pred.status = "settled"
            settled += 1
            logger.info(
                f"Settled {pred.symbol}: predicted={pred.predicted_direction}, "
                f"actual={actual_direction} ({change_pct:+.2f}%), correct={is_correct}"
            )
        except Exception as e:
            logger.error(f"Failed to settle {pred.symbol}: {e}")

    await db.commit()
    return settled


async def get_accuracy_stats(db: AsyncSession) -> dict:
    """Compute accuracy stats for 7d, 30d, and all time."""
    from datetime import timedelta
    today = date.today()

    async def _count(days: Optional[int]) -> Tuple[int, int]:
        q = select(func.count()).where(
            XBotPrediction.status == "settled",
            XBotPrediction.is_correct.is_not(None),
        )
        if days:
            since = today - timedelta(days=days)
            q = q.where(XBotPrediction.prediction_date >= since)

        total_q = q
        correct_q = q.where(XBotPrediction.is_correct.is_(True))

        total = (await db.execute(total_q)).scalar() or 0
        correct = (await db.execute(correct_q)).scalar() or 0
        return correct, total

    c7, t7 = await _count(7)
    c30, t30 = await _count(30)
    call, tall = await _count(None)

    return {
        "7d": {"correct": c7, "total": t7, "pct": round(c7 / t7 * 100) if t7 else 0, "label": f"{c7}/{t7}"},
        "30d": {"correct": c30, "total": t30, "pct": round(c30 / t30 * 100) if t30 else 0, "label": f"{c30}/{t30}"},
        "all": {"correct": call, "total": tall, "pct": round(call / tall * 100) if tall else 0, "label": f"{call}/{tall}"},
    }


async def _fetch_actual_close(symbol: str, market: str, target_date: date) -> Optional[float]:
    """Fetch the actual closing price for a given date using AKShare."""
    import akshare as ak
    import pandas as pd

    start = str(target_date - timedelta(days=3))
    end = str(target_date)

    try:
        if market == "a":
            df = await asyncio.get_event_loop().run_in_executor(
                None,
                lambda: ak.stock_zh_a_hist(
                    symbol=symbol,
                    period="daily",
                    start_date=start.replace("-", ""),
                    end_date=end.replace("-", ""),
                    adjust="qfq",
                )
            )
            if df is not None and not df.empty:
                close_col = _find_col(df, ["收盘", "close"])
                if close_col:
                    return float(df.iloc[-1][close_col])
        elif market == "hk":
            df = await asyncio.get_event_loop().run_in_executor(
                None,
                lambda: ak.stock_hk_hist(
                    symbol=symbol,
                    period="daily",
                    start_date=start.replace("-", ""),
                    end_date=end.replace("-", ""),
                    adjust="qfq",
                )
            )
            if df is not None and not df.empty:
                close_col = _find_col(df, ["收盘", "close"])
                if close_col:
                    return float(df.iloc[-1][close_col])
    except Exception as e:
        logger.warning(f"AKShare close price fetch failed for {symbol}: {e}")
    return None


def _find_col(df, candidates):
    for col in candidates:
        if col in df.columns:
            return col
    return None


def _prev_trading_day(d: date) -> date:
    prev = d - timedelta(days=1)
    while prev.weekday() >= 5:
        prev -= timedelta(days=1)
    return prev
