"""Settle approved model predictions."""

import asyncio
from datetime import date, timedelta
from typing import List, Optional, Tuple
from loguru import logger

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from src.models.xbot import XBotPrediction


async def settle_predictions(db: AsyncSession) -> int:
    """Settle all approved predictions with target_date = today (market-agnostic)."""
    return await settle_predictions_for_market(db, market=None)


async def settle_predictions_for_market(db: AsyncSession, market: str | None) -> int:
    """
    Fetch actual close prices for approved/legacy-posted predictions with target_date = today.
    When market is None, settles all markets.
    Returns number of settled predictions.
    """
    today = date.today()
    predictions = await _load_pending_settlements(db, market, today)
    if not predictions:
        logger.info(f"No predictions to settle for market={market or 'all'}")
        return 0

    settled = 0
    for pred in predictions:
        try:
            actual_close = await _fetch_actual_close(pred.symbol, pred.market, today)
            if _apply_settlement(pred, actual_close):
                settled += 1
        except Exception as e:
            logger.error(f"Failed to settle {pred.symbol}: {e}")

    await db.commit()
    return settled


async def settle_predictions_with_prices(
    db: AsyncSession,
    bars: dict[tuple[str, str], dict],
    market: str | None = None,
) -> Tuple[int, List[Tuple[str, str]]]:
    """Settle pending predictions using OHLC bars supplied by the caller (no akshare).

    ``bars`` keys are ``(market, symbol)`` tuples; values are dicts with at least
    ``close`` and optionally ``high``/``low``. ``high``/``low`` are needed for
    accurate band-touch judgment on hold predictions. Predictions without a
    matching key are left untouched and returned in the second element so the
    caller can report what still needs server-side fetching.
    """
    today = date.today()
    predictions = await _load_pending_settlements(db, market, today)
    if not predictions:
        return 0, []

    settled = 0
    missing: List[Tuple[str, str]] = []
    for pred in predictions:
        try:
            key = (pred.market, pred.symbol)
            bar = bars.get(key)
            if not bar or bar.get("close") is None:
                missing.append(key)
                continue
            if _apply_settlement(pred, bar["close"], high=bar.get("high"), low=bar.get("low")):
                settled += 1
        except Exception as e:
            logger.error(f"Failed to settle {pred.symbol}: {e}")

    await db.commit()
    return settled, missing


async def _load_pending_settlements(
    db: AsyncSession, market: str | None, target_day: date
):
    q = select(XBotPrediction).where(
        XBotPrediction.target_date == target_day,
        XBotPrediction.status.in_(["approved", "posted"]),
        XBotPrediction.actual_close.is_(None),
    )
    if market:
        q = q.where(XBotPrediction.market == market)
    result = await db.execute(q)
    return result.scalars().all()


_HOLD_FALLBACK_BAND_PCT = 2.0  # 当 target/stop 不可用时，hold 预测的 ±% 兜底带宽


def _apply_settlement(
    pred: XBotPrediction,
    actual_close: Optional[float],
    *,
    high: Optional[float] = None,
    low: Optional[float] = None,
) -> bool:
    """Write the settlement fields onto ``pred``. Returns True when applied.

    - up/down: 按收盘价相对入场价的正负号判定，任何同向变动都算命中（早期
      ±0.5% 死区会把 +0.06% 这类小涨判成"未命中"）。
    - hold/震荡：用预测自带的 target_price 和 stop_loss 作为允许的波动带；
      持仓期内最高价没破上沿、最低价没破下沿即算命中。当 target/stop 缺失
      或不构成有效带（≤ close 之类），退到 ±2% 收盘带兜底。
    """
    if actual_close is None or pred.close_price is None or pred.close_price <= 0:
        return False

    change_pct = (actual_close - pred.close_price) / pred.close_price * 100

    if pred.predicted_direction == "up":
        is_correct = change_pct > 0
    elif pred.predicted_direction == "down":
        is_correct = change_pct < 0
    elif pred.predicted_direction == "hold":
        is_correct = _judge_hold(pred, actual_close, high, low)
    else:
        is_correct = None

    pred.actual_close = float(actual_close)
    pred.actual_change_pct = round(change_pct, 2)
    pred.is_correct = is_correct
    pred.status = "settled"
    logger.info(
        f"Settled {pred.symbol}: predicted={pred.predicted_direction}, "
        f"change={change_pct:+.2f}%, correct={is_correct}"
    )
    return True


def _judge_hold(
    pred: XBotPrediction,
    actual_close: float,
    high: Optional[float],
    low: Optional[float],
) -> bool:
    """震荡命中判定：价格全程留在 (lower, upper) 带内即命中。

    优先使用 target_price 和 stop_loss 作为带边界（取 min/max）。若它们
    缺失或没有把入场价夹在中间，则退回到 ±_HOLD_FALLBACK_BAND_PCT% 兜底带。
    没有 high/low 时用 close 作代理（精度退化但不影响逻辑）。
    """
    entry = pred.close_price
    target = pred.target_price
    stop = pred.stop_loss

    upper: Optional[float] = None
    lower: Optional[float] = None
    if target and stop and target > 0 and stop > 0 and target != stop:
        cand_upper = max(target, stop)
        cand_lower = min(target, stop)
        if cand_lower < entry < cand_upper:
            upper = cand_upper
            lower = cand_lower

    if upper is None or lower is None:
        margin = entry * (_HOLD_FALLBACK_BAND_PCT / 100.0)
        upper = entry + margin
        lower = entry - margin

    h = high if high is not None and high > 0 else actual_close
    l = low if low is not None and low > 0 else actual_close
    return l > lower and h < upper


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
