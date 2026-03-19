"""Data collector utilities — on-demand fetching and scheduled refresh.

Data is fetched on-demand by data_service.py when a user request finds stale
or missing data.  Admins can also trigger a manual collection pass via the
/api/admin/refresh-market-data endpoint, which calls run_collection_cycle().

When run as __main__ (via supervisord), this module runs a periodic collection
loop, refreshing all DB symbols every COLLECTOR_INTERVAL_HOURS hours (default 4).
"""

from __future__ import annotations

import asyncio
import os
import random
from datetime import datetime, timedelta
from typing import Optional

import pandas as pd
from loguru import logger

_REQUEST_SLEEP = float(os.getenv("COLLECTOR_REQUEST_SLEEP", "2.0"))
_HISTORY_DAYS = int(os.getenv("COLLECTOR_HISTORY_DAYS", "730"))

# Semaphore: cap concurrent AKShare calls
_collector_semaphore = asyncio.Semaphore(2)

# Flag: becomes True while a manual collection pass is running
_collecting = False

# Minute-period identifiers
_MINUTE_PERIODS = {"1", "5", "15", "30", "60"}


def is_collecting() -> bool:
    return _collecting


# ── Per-symbol collection ──────────────────────────────────────────────────────

async def _get_last_bar_ts(symbol: str, market: str, period: str) -> Optional[int]:
    """Return the nanosecond timestamp of the newest stored bar, or ``None``."""
    try:
        from sqlalchemy import select as sa_select
        from src.database.db import async_session, MarketBar

        async with async_session() as db:
            result = await db.execute(
                sa_select(MarketBar.bar_ts)
                .where(
                    MarketBar.symbol == symbol,
                    MarketBar.market == market,
                    MarketBar.period == period,
                )
                .order_by(MarketBar.bar_ts.desc())
                .limit(1)
            )
            return result.scalar_one_or_none()
    except Exception as exc:
        logger.warning(f"[collector] 查询最新 bar 失败 {market}:{symbol}:{period}: {exc}")
        return None


async def collect_symbol(
    symbol: str,
    market: str,
    period: str = "daily",
    adjust: str = "qfq",
    request_sleep: float = _REQUEST_SLEEP,
) -> int:
    """Fetch incremental bars for one (symbol, market, period) and write to DB.

    Returns the number of new rows written, or 0 on error/up-to-date.
    """
    from src.services.data.data_service import fetch_raw_ohlcv, _db_write_bars

    start_date = ""  # initialised here so the except block can always reference it
    try:
        last_ts = await _get_last_bar_ts(symbol, market, period)

        if last_ts is not None:
            last_date = pd.Timestamp(last_ts)
            if period in _MINUTE_PERIODS:
                # Re-fetch from the last bar's date so today's new bars are picked up.
                # ON CONFLICT DO NOTHING handles any duplicate bars.
                start_date = last_date.strftime("%Y%m%d")
            else:
                start_date = (last_date + timedelta(days=1)).strftime("%Y%m%d")
        else:
            start_date = (datetime.now() - timedelta(days=_HISTORY_DAYS)).strftime("%Y%m%d")

        end_date = datetime.now().strftime("%Y%m%d")

        if start_date > end_date:
            logger.debug(f"[collector] {market}:{symbol}:{period} 已是最新，跳过")
            return 0

        logger.info(f"[collector] 采集 {market}:{symbol}:{period} [{start_date}~{end_date}]")

        async with _collector_semaphore:
            df = await fetch_raw_ohlcv(
                symbol=symbol,
                market=market,
                period=period,
                start_date=start_date,
                end_date=end_date,
                adjust=adjust,
            )

        if df is None or df.empty:
            logger.debug(f"[collector] {market}:{symbol}:{period} 无新数据")
            return 0

        await _db_write_bars(df, symbol, market, period)
        logger.info(f"[collector] {market}:{symbol}:{period} 写入 {len(df)} 行")
        return len(df)

    except Exception as exc:
        today = datetime.now().strftime("%Y%m%d")
        if start_date >= today and period not in _MINUTE_PERIODS:
            # Daily bar for today hasn't closed yet — sources returning empty/error is expected.
            logger.warning(f"[collector] {market}:{symbol}:{period} 今日数据暂不可用（交易中或休市）: {exc}")
        else:
            logger.error(f"[collector] {market}:{symbol}:{period} 失败: {exc}")
        return 0
    finally:
        jitter = random.uniform(0, request_sleep * 0.5)
        await asyncio.sleep(request_sleep + jitter)


async def run_collection_cycle() -> dict:
    """Refresh all symbols already stored in market_bars."""
    global _collecting

    try:
        from sqlalchemy import select as sa_select
        from src.database.db import async_session, MarketBar

        async with async_session() as db:
            result = await db.execute(
                sa_select(MarketBar.symbol, MarketBar.market, MarketBar.period).distinct()
            )
            db_symbols = result.all()
    except Exception as exc:
        logger.error(f"[collector] 查询 DB 标的列表失败: {exc}")
        return {"total": 0, "errors": 0, "symbols": []}

    if not db_symbols:
        logger.info("[collector] DB 无数据，跳过本次采集")
        return {"total": 0, "errors": 0, "symbols": []}

    logger.info(f"[collector] 开始刷新 DB 中全部 {len(db_symbols)} 个标的")
    _collecting = True
    results = []
    try:
        for row in db_symbols:
            count = await collect_symbol(row.symbol, row.market, row.period)
            results.append({"symbol": row.symbol, "market": row.market, "period": row.period, "rows": count})
    finally:
        _collecting = False

    total = sum(r["rows"] for r in results)
    logger.info(f"[collector] 采集完成，新增 {total} 行，共 {len(results)} 个任务")
    return {"total": total, "errors": 0, "symbols": results}


# ── Market data status helper (used by admin API) ──────────────────────────────

async def get_market_data_status() -> list[dict]:
    """Return DB coverage stats for all symbols in market_bars."""
    try:
        from sqlalchemy import select as sa_select, func
        from src.database.db import async_session, MarketBar
        from src.services.data.name_service import get_symbol_name

        async with async_session() as db:
            rows = (
                await db.execute(
                    sa_select(
                        MarketBar.symbol,
                        MarketBar.market,
                        MarketBar.period,
                        func.count().label("bar_count"),
                        func.max(MarketBar.bar_ts).label("last_ts"),
                    ).group_by(MarketBar.symbol, MarketBar.market, MarketBar.period)
                )
            ).all()

        sym_market_pairs: set[tuple[str, str]] = {(r.symbol, r.market) for r in rows}
        name_map: dict[tuple[str, str], str] = {}
        for key in sym_market_pairs:
            try:
                name_map[key] = await get_symbol_name(key[0], key[1])
            except Exception:
                name_map[key] = ""

        status_list = [
            {
                "symbol": row.symbol,
                "market": row.market,
                "period": row.period,
                "name": name_map.get((row.symbol, row.market), ""),
                "bar_count": row.bar_count,
                "last_bar_date": pd.Timestamp(row.last_ts).isoformat() if row.last_ts else None,
                "is_empty": row.bar_count == 0,
            }
            for row in rows
        ]
        status_list.sort(key=lambda x: (x["market"], x["symbol"], x["period"]))
        return status_list
    except Exception as exc:
        logger.error(f"[collector] 查询数据状态失败: {exc}")
        return []


if __name__ == "__main__":
    _INTERVAL_HOURS = int(os.getenv("COLLECTOR_INTERVAL_HOURS", "4"))

    async def _scheduled_loop() -> None:
        logger.info(f"[collector] 定时采集服务启动，每 {_INTERVAL_HOURS} 小时刷新一次")
        # Initialise DB before first cycle
        from src.database.new_db import init_db
        await init_db()
        while True:
            await run_collection_cycle()
            logger.info(f"[collector] 下次采集在 {_INTERVAL_HOURS} 小时后")
            await asyncio.sleep(_INTERVAL_HOURS * 3600)

    asyncio.run(_scheduled_loop())

