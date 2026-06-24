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


async def settle_prediction_items_with_prices(
    db: AsyncSession,
    items: list[dict],
) -> tuple[int, list[dict], list[dict]]:
    """Settle/re-settle explicit prediction items using caller-supplied prices.

    Items should include either ``id`` or ``(market, symbol, target_date)`` plus
    a positive close. This is intentionally explicit so historical re-settlement
    cannot accidentally apply one symbol's latest bar to a different prediction
    date.
    """
    settled = 0
    missing: list[dict] = []
    skipped: list[dict] = []

    for item in items:
        pred = None
        pred_id = item.get("id")
        market = item.get("market")
        symbol = item.get("symbol")
        target_date = item.get("target_date")

        if pred_id is not None:
            pred = await db.get(XBotPrediction, int(pred_id))
        elif market and symbol and target_date:
            try:
                target_day = date.fromisoformat(str(target_date))
            except ValueError:
                target_day = None
            if target_day:
                result = await db.execute(
                    select(XBotPrediction).where(
                        XBotPrediction.market == market,
                        XBotPrediction.symbol == symbol,
                        XBotPrediction.target_date == target_day,
                    ).limit(1)
                )
                pred = result.scalars().first()

        if pred is None:
            missing.append({
                "id": pred_id,
                "market": market,
                "symbol": symbol,
                "target_date": target_date,
                "reason": "not_found",
            })
            continue

        if pred.status not in ("approved", "posted", "settled"):
            skipped.append({
                "id": pred.id,
                "market": pred.market,
                "symbol": pred.symbol,
                "target_date": str(pred.target_date),
                "status": pred.status,
                "reason": "status_not_settleable",
            })
            continue

        try:
            if _apply_settlement(
                pred,
                item.get("close"),
                high=item.get("high"),
                low=item.get("low"),
            ):
                settled += 1
            else:
                skipped.append({
                    "id": pred.id,
                    "market": pred.market,
                    "symbol": pred.symbol,
                    "target_date": str(pred.target_date),
                    "status": pred.status,
                    "reason": "invalid_settlement_inputs",
                })
        except Exception as e:
            logger.error(f"Failed to settle item {item}: {e}")
            skipped.append({
                "id": getattr(pred, "id", pred_id),
                "market": getattr(pred, "market", market),
                "symbol": getattr(pred, "symbol", symbol),
                "target_date": str(getattr(pred, "target_date", target_date)),
                "reason": str(e) or e.__class__.__name__,
            })

    await db.commit()
    return settled, missing, skipped


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
    """震荡命中判定：目标日收盘价留在 [lower, upper] 带内即命中。

    优先使用 target_price 和 stop_loss 作为带边界（取 min/max）。若它们
    缺失或没有把入场价夹在中间，则退回到 ±_HOLD_FALLBACK_BAND_PCT% 兜底带。
    high/low 参数保留用于兼容旧调用，但不参与震荡结算，避免盘中影线误杀
    收盘仍在震荡带内的记录。
    """
    band = get_hold_settlement_band(pred)
    if not band:
        return False
    lower, upper = band
    return lower <= float(actual_close) <= upper


def get_hold_settlement_band(pred: XBotPrediction) -> Optional[tuple[float, float]]:
    """Return the effective settlement band for a hold prediction."""
    entry = pred.close_price
    target = pred.target_price
    stop = pred.stop_loss
    if entry is None or entry <= 0:
        return None

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

    return float(lower), float(upper)


def _valid_price(v) -> bool:
    try:
        return v is not None and float(v) > 0
    except (TypeError, ValueError):
        return False


# 计划结果三态（重定位核心）：把二元"命中/未中"换成"达标 / 计划内(止损保护) / 破位"。
# 方向虽走反，只要没破止损，就算"计划内·止损保护住了"，而不是"未命中"。
# 全部由现有存量字段实时派生：close_price(入场E)/target_price(T)/stop_loss(S)/actual_close(C)。
PLAN_OUTCOME_META = {
    "target_hit": {"label": "达标", "tone": "success"},
    "in_plan": {"label": "计划内", "tone": "neutral"},
    "stop_breached": {"label": "破位", "tone": "warn"},
    "hold_in_band": {"label": "区间内", "tone": "success"},
    "hold_breached": {"label": "破位", "tone": "warn"},
}

# 计入"有效计划"的结果（有效计划率分子）
EFFECTIVE_OUTCOMES = ("target_hit", "in_plan", "hold_in_band")


def classify_plan_outcome(pred: XBotPrediction) -> Optional[str]:
    """把已结算预测分类为计划结果三态；未结算或数据不足返回 None。"""
    entry = pred.close_price
    actual = pred.actual_close
    if actual is None or entry is None or entry <= 0:
        return None

    direction = pred.predicted_direction
    target = pred.target_price
    stop = pred.stop_loss
    c = float(actual)
    e = float(entry)

    if direction == "hold":
        band = get_hold_settlement_band(pred)
        if not band:
            return None
        lo, hi = band
        return "hold_in_band" if lo <= c <= hi else "hold_breached"

    if direction == "up":
        if _valid_price(target) and float(target) > e and c >= float(target):
            return "target_hit"
        if _valid_price(stop) and float(stop) < e and c < float(stop):
            return "stop_breached"
        # 止损价缺失时，用方向判定兜底：明显走反才算破位，否则给"计划内"
        if not _valid_price(stop) and pred.is_correct is False and c < e:
            return "stop_breached"
        return "in_plan"

    if direction == "down":
        if _valid_price(target) and float(target) < e and c <= float(target):
            return "target_hit"
        if _valid_price(stop) and float(stop) > e and c > float(stop):
            return "stop_breached"
        if not _valid_price(stop) and pred.is_correct is False and c > e:
            return "stop_breached"
        return "in_plan"

    return None


def plan_outcome_fields(pred: XBotPrediction) -> dict:
    """对外暴露的计划结果字段（label/tone），未结算时为 None。"""
    outcome = classify_plan_outcome(pred)
    meta = PLAN_OUTCOME_META.get(outcome) if outcome else None
    return {
        "plan_outcome": outcome,
        "plan_outcome_label": meta["label"] if meta else None,
        "plan_outcome_tone": meta["tone"] if meta else None,
        "plan_effective": (outcome in EFFECTIVE_OUTCOMES) if outcome else None,
    }


def settlement_display_fields(pred: XBotPrediction) -> dict:
    """Derived copy/metadata used by admin UI, public pages, and cards."""
    is_hold = pred.predicted_direction == "hold"
    is_settled = pred.actual_close is not None and pred.actual_change_pct is not None and pred.is_correct is not None
    plan_fields = plan_outcome_fields(pred)

    if is_hold:
        band = get_hold_settlement_band(pred)
        verdict = plan_fields["plan_outcome_label"] if is_settled else None
        explanation = "目标日收盘价留在目标价与止损价形成的区间内（计划有效）" if pred.is_correct is True else "目标日收盘价离开计划区间（破位）"
        if not is_settled:
            explanation = "目标日收盘价将按目标价与止损价形成的区间验证"
        return {
            "settlement_rule_label": "收盘区间",
            "settlement_verdict_label": verdict,
            "settlement_explanation": explanation,
            "settlement_band_low": round(band[0], 4) if band else None,
            "settlement_band_high": round(band[1], 4) if band else None,
            **plan_fields,
        }

    verdict = plan_fields["plan_outcome_label"] if is_settled else None
    return {
        "settlement_rule_label": "计划结果",
        "settlement_verdict_label": verdict,
        "settlement_explanation": "达标=收盘达到目标价；计划内=未达标但未破止损（止损保护住）；破位=收盘越过止损价",
        "settlement_band_low": None,
        "settlement_band_high": None,
        **plan_fields,
    }


async def get_accuracy_stats(db: AsyncSession) -> dict:
    """Compute plan-outcome stats for 7d, 30d, all time, and high-confidence-only.

    在保留旧字段(correct/total/pct/label，向后兼容)的同时，新增计划口径指标:
    - effective_rate(有效计划率) = (达标 + 计划内 + 区间内) / 总数
    - target_rate(达标率)        = 达标 / 总数
    计划结果由 classify_plan_outcome 用存量字段实时派生，历史记录无需迁移即生效。
    """
    from datetime import timedelta
    today = date.today()

    # 一次加载全部已结算记录，按窗口在 Python 侧聚合（日频量级，开销可忽略）
    q = select(XBotPrediction).where(
        XBotPrediction.status == "settled",
        XBotPrediction.is_correct.is_not(None),
    )
    rows = (await db.execute(q)).scalars().all()

    def _subset(days: Optional[int], high_conf_only: bool = False):
        subset = rows
        if days:
            since = today - timedelta(days=days)
            subset = [p for p in subset if p.prediction_date and p.prediction_date >= since]
        if high_conf_only:
            subset = [p for p in subset if p.met_confidence is True]
        return subset

    def _bucket(subset) -> dict:
        total = len(subset)
        correct = sum(1 for p in subset if p.is_correct is True)
        outcomes = [classify_plan_outcome(p) for p in subset]
        effective = sum(1 for o in outcomes if o in EFFECTIVE_OUTCOMES)
        target = sum(1 for o in outcomes if o == "target_hit")
        breached = sum(1 for o in outcomes if o in ("stop_breached", "hold_breached"))
        return {
            # 旧字段（向后兼容）
            "correct": correct,
            "total": total,
            "pct": round(correct / total * 100) if total else 0,
            "label": f"{correct}/{total}",
            # 新计划口径字段
            "effective": effective,
            "effective_rate": round(effective / total * 100) if total else 0,
            "target": target,
            "target_rate": round(target / total * 100) if total else 0,
            "breached": breached,
        }

    return {
        "7d": _bucket(_subset(7)),
        "30d": _bucket(_subset(30)),
        "all": _bucket(_subset(None)),
        "high_conf": _bucket(_subset(None, high_conf_only=True)),
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
