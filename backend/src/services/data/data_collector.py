"""Background data collector for market OHLCV bars.

Scheduling strategy
-------------------
The collector runs a **smart loop** that wakes up every
``COLLECTOR_INTRADAY_INTERVAL_MINUTES`` (default 5 min) and decides what to do:

1. **Intraday refresh** (minute-period bars, during trading hours):
   - Queries market_bars for all distinct symbols whose period is a minute
     interval ("1", "5", "15", "30", "60") in a market that is currently open.
   - Fetches incremental bars for each one and writes to DB.
   - Request sleep = ``COLLECTOR_INTRADAY_REQUEST_SLEEP`` (default 1 s).

2. **EOD refresh** (daily bars, once per day after each market closes):
   - Queries market_bars for all distinct (symbol, market) pairs with
     period = "daily".
   - Runs once per calendar day (UTC+8), starting 30 min after close.
   - Request sleep = ``COLLECTOR_REQUEST_SLEEP`` (default 2 s).

3. **Cold-start / watchlist history** (on first boot and daily):
   - Reads watchlist from system_settings.
   - For symbols with no data at all, pulls ``COLLECTOR_HISTORY_DAYS`` of
     history from AKShare.

Deployment modes
----------------
1. **Embedded** (ENABLE_COLLECTOR=true on the backend service — dev convenience).
2. **Standalone Docker** (recommended for production):
   ``python -m src.services.data.data_collector``

Market trading hours (UTC+8)
-----------------------------
  A股  / 期货: Mon–Fri 09:30–11:30, 13:00–15:00
  港股:         Mon–Fri 09:30–12:00, 13:00–16:00
  美股:         Mon–Fri (CN) 21:30–04:00 next day (Sat morning included)

Environment variables
---------------------
  COLLECTOR_INTRADAY_INTERVAL_MINUTES  — loop tick (default 5)
  COLLECTOR_INTRADAY_REQUEST_SLEEP     — sleep between intraday AKShare calls (default 1.0)
  COLLECTOR_REQUEST_SLEEP              — sleep between EOD/history AKShare calls (default 2.0)
  COLLECTOR_HISTORY_DAYS               — lookback for cold-start history (default 730)
  COLLECTOR_EOD_DELAY_MINUTES          — minutes after market close before running EOD (default 30)
"""

from __future__ import annotations

import asyncio
import json
import os
from datetime import datetime, timedelta, timezone
from typing import Optional

import pandas as pd
from loguru import logger

# ── Configurable knobs ─────────────────────────────────────────────────────────
_INTRADAY_INTERVAL_MIN = int(os.getenv("COLLECTOR_INTRADAY_INTERVAL_MINUTES", "5"))
_INTRADAY_REQUEST_SLEEP = float(os.getenv("COLLECTOR_INTRADAY_REQUEST_SLEEP", "1.0"))
_REQUEST_SLEEP = float(os.getenv("COLLECTOR_REQUEST_SLEEP", "2.0"))
_HISTORY_DAYS = int(os.getenv("COLLECTOR_HISTORY_DAYS", "730"))
_EOD_DELAY_MIN = int(os.getenv("COLLECTOR_EOD_DELAY_MINUTES", "30"))

# Semaphore: cap concurrent AKShare calls inside the collector process
_collector_semaphore = asyncio.Semaphore(2)

# Flag: becomes True while any collection pass is running
_collecting = False

# Track which markets have had EOD run today (key = market, value = CN date str)
_last_eod_run: dict[str, str] = {}

# CN timezone (UTC+8)
_TZ_CN = timezone(timedelta(hours=8))

# Minute-period identifiers
_MINUTE_PERIODS = {"1", "5", "15", "30", "60"}


def is_collecting() -> bool:
    return _collecting


# ── Time helpers ───────────────────────────────────────────────────────────────

def _cn_now() -> datetime:
    """Current time in China Standard Time (UTC+8)."""
    return datetime.now(_TZ_CN)


def is_trading_hours(market: str, now_cn: Optional[datetime] = None) -> bool:
    """Return True if *market* is currently in its normal trading session.

    Simplified rules (no public holiday awareness — AKShare returns empty on
    holidays, which is handled gracefully downstream):

    * A股 / futures: Mon–Fri 09:30–11:30, 13:00–15:00 (CST)
    * 港股:           Mon–Fri 09:30–12:00, 13:00–16:00 (HKT ≈ CST)
    * 美股:           Mon (21:30) – Tue (04:00), …, Fri (21:30) – Sat (04:00)
    """
    if now_cn is None:
        now_cn = _cn_now()

    wd = now_cn.weekday()  # 0=Mon … 6=Sun
    hm = now_cn.hour * 60 + now_cn.minute  # minutes since midnight

    market = market.lower()

    if market in ("a", "futures"):
        if wd >= 5:
            return False  # weekend
        return (570 <= hm <= 690) or (780 <= hm <= 900)

    if market == "hk":
        if wd >= 5:
            return False
        return (570 <= hm <= 720) or (780 <= hm <= 960)

    if market == "us":
        # Evening session: Mon–Fri CN, hm >= 21:30 (1290)
        # Morning session: Tue–Sat CN, hm < 04:00 (240)
        evening = hm >= 1290
        morning = hm < 240
        if evening and wd in (0, 1, 2, 3, 4):  # Mon-Fri CN evening
            return True
        if morning and wd in (1, 2, 3, 4, 5):  # Tue-Sat CN early morning
            return True
        return False

    return False


def _eod_threshold_hm(market: str) -> Optional[int]:
    """Return the EOD trigger time (minutes since midnight, CST) for a market.

    Returns None if the market has no fixed CN-day close (shouldn't happen).
    US market is treated as closing at 05:00 CST the following CN morning.
    """
    thresholds = {
        "a":       15 * 60 + 30 + _EOD_DELAY_MIN,  # 15:30 + delay
        "futures": 15 * 60 + 30 + _EOD_DELAY_MIN,
        "hk":      16 * 60 + 30 + _EOD_DELAY_MIN,  # 16:30 + delay (HKT)
        "us":       5 * 60 + 0  + _EOD_DELAY_MIN,  # 05:00 CST next morning + delay
    }
    return thresholds.get(market.lower())


def _should_run_eod(market: str, now_cn: Optional[datetime] = None) -> bool:
    """True if it is past the EOD trigger time and EOD has not yet run today."""
    if now_cn is None:
        now_cn = _cn_now()

    hm = now_cn.hour * 60 + now_cn.minute
    threshold = _eod_threshold_hm(market)
    if threshold is None:
        return False

    today_str = now_cn.strftime("%Y-%m-%d")

    # US EOD window: early morning (before noon) to avoid triggering at wrong time
    if market == "us":
        if not (0 <= hm < 12 * 60):
            return False
    else:
        # Domestic markets: must be afternoon
        if hm < threshold:
            return False
        # Don't run on weekends for CN markets
        if now_cn.weekday() >= 5:
            return False

    return _last_eod_run.get(market) != today_str


# ── DB symbol helpers ──────────────────────────────────────────────────────────

async def get_all_db_symbols(period_filter: Optional[set[str]] = None) -> list[dict]:
    """Return all distinct (symbol, market, period) tuples stored in market_bars.

    Args:
        period_filter: If given, only return rows whose period is in this set.
                       E.g. ``{"daily"}`` or ``{"1","5","15","30","60"}``.
    """
    try:
        from sqlalchemy import select as sa_select
        from src.database.db import async_session, MarketBar

        async with async_session() as db:
            result = await db.execute(
                sa_select(MarketBar.symbol, MarketBar.market, MarketBar.period).distinct()
            )
            rows = result.all()

        items = [
            {"symbol": r.symbol, "market": r.market, "period": r.period}
            for r in rows
            if (period_filter is None or r.period in period_filter)
        ]
        return items
    except Exception as exc:
        logger.error(f"[collector] 查询 DB 标的列表失败: {exc}")
        return []


# ── Watchlist helpers ──────────────────────────────────────────────────────────

async def load_watchlist() -> list[dict]:
    """Load the watchlist from ``system_settings``.  Returns ``[]`` if not set."""
    try:
        from src.database.db import async_session, SystemSetting

        async with async_session() as db:
            row = await db.get(SystemSetting, "watchlist")
            if row:
                val = json.loads(row.value)
                if isinstance(val, list):
                    return val
    except Exception as exc:
        logger.warning(f"[collector] 读取 watchlist 失败: {exc}")
    return []


async def save_watchlist(watchlist: list[dict]) -> None:
    """Persist the watchlist back to ``system_settings``."""
    try:
        from src.database.db import async_session, SystemSetting

        async with async_session() as db:
            row = await db.get(SystemSetting, "watchlist")
            if row:
                row.value = json.dumps(watchlist)
                row.updated_at = datetime.utcnow()
            else:
                db.add(SystemSetting(key="watchlist", value=json.dumps(watchlist)))
            await db.commit()
    except Exception as exc:
        logger.error(f"[collector] 保存 watchlist 失败: {exc}")


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

    try:
        last_ts = await _get_last_bar_ts(symbol, market, period)

        if last_ts is not None:
            last_date = pd.Timestamp(last_ts)
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
        logger.error(f"[collector] {market}:{symbol}:{period} 失败: {exc}")
        return 0
    finally:
        await asyncio.sleep(request_sleep)


# ── Collection cycles ──────────────────────────────────────────────────────────

async def run_intraday_cycle(open_markets: set[str]) -> dict:
    """Refresh minute-period bars for all DB symbols whose market is currently open.

    Only symbols already present in market_bars (any minute period) are updated —
    we never create new minute-bar series here; that is driven by user queries
    triggering the AKShare fallback in data_service.
    """
    global _collecting
    items = await get_all_db_symbols(period_filter=_MINUTE_PERIODS)
    # Filter to markets that are actually open right now
    items = [it for it in items if it["market"] in open_markets]

    if not items:
        return {"total": 0, "symbols": []}

    logger.info(
        f"[collector/intraday] 盘中刷新 {len(items)} 个分钟线任务，"
        f"市场: {open_markets}"
    )
    _collecting = True
    results = []
    try:
        for it in items:
            count = await collect_symbol(
                it["symbol"], it["market"], it["period"],
                request_sleep=_INTRADAY_REQUEST_SLEEP,
            )
            results.append({**it, "rows": count})
    finally:
        _collecting = False

    total = sum(r["rows"] for r in results)
    logger.info(f"[collector/intraday] 完成，新增 {total} 行")
    return {"total": total, "symbols": results}


async def run_eod_cycle(market: str) -> dict:
    """Refresh daily-period bars for ALL DB symbols in the given market.

    Runs once per calendar day (UTC+8) after the market's EOD trigger time.
    """
    global _collecting, _last_eod_run
    items = await get_all_db_symbols(period_filter={"daily"})
    items = [it for it in items if it["market"] == market]

    if not items:
        logger.info(f"[collector/eod] {market.upper()} 无日线标的，跳过")
        _last_eod_run[market] = _cn_now().strftime("%Y-%m-%d")
        return {"total": 0, "symbols": []}

    logger.info(f"[collector/eod] {market.upper()} 收盘刷新 {len(items)} 个日线标的")
    _collecting = True
    results = []
    try:
        for it in items:
            count = await collect_symbol(
                it["symbol"], it["market"], it["period"],
                request_sleep=_REQUEST_SLEEP,
            )
            results.append({**it, "rows": count})
    finally:
        _collecting = False
        _last_eod_run[market] = _cn_now().strftime("%Y-%m-%d")

    total = sum(r["rows"] for r in results)
    logger.info(f"[collector/eod] {market.upper()} 完成，新增 {total} 行")
    return {"total": total, "symbols": results}


async def run_collection_cycle(watchlist: Optional[list[dict]] = None) -> dict:
    """Run one full history/watchlist collection pass.

    Used by the admin refresh endpoint.  Pass a custom ``watchlist`` subset, or
    omit to use the full DB watchlist.
    """
    global _collecting
    if watchlist is None:
        watchlist = await load_watchlist()

    if not watchlist:
        logger.info("[collector] watchlist 为空，跳过本次采集")
        return {"total": 0, "errors": 0, "symbols": []}

    _collecting = True
    results = []
    try:
        for item in watchlist:
            sym = item.get("symbol", "").strip()
            mkt = item.get("market", "a").strip().lower()
            periods = item.get("periods") or ["daily"]
            adj = item.get("adjust", "qfq")

            if not sym:
                continue

            for period in periods:
                count = await collect_symbol(sym, mkt, period, adj)
                results.append({"symbol": sym, "market": mkt, "period": period, "rows": count})
    finally:
        _collecting = False

    total = sum(r["rows"] for r in results)
    logger.info(f"[collector] watchlist 采集完成，新增 {total} 行，共 {len(results)} 个任务")
    return {"total": total, "errors": 0, "symbols": results}


# ── Market data status helper (used by admin API) ──────────────────────────────

async def get_market_data_status() -> list[dict]:
    """Return DB coverage stats for ALL symbols in market_bars, plus any
    watchlist-only symbols (with zero bars) that are not yet in the DB.

    Each entry includes:
    - ``in_watchlist``: whether the symbol is in the scheduled watchlist.
    - ``name``: human-readable display name resolved via name_service.
    """
    try:
        from sqlalchemy import select as sa_select, func
        from src.database.db import async_session, MarketBar
        from src.services.data.name_service import get_symbol_name

        watchlist = await load_watchlist()

        # Build a set of (symbol, market, period) tuples from the watchlist for
        # fast in_watchlist lookup and to detect watchlist-only entries.
        wl_keys: set[tuple[str, str, str]] = set()
        for item in watchlist:
            sym = item.get("symbol", "").strip()
            mkt = item.get("market", "a").strip().lower()
            for period in (item.get("periods") or ["daily"]):
                wl_keys.add((sym, mkt, period))

        # Query all distinct (symbol, market, period) combinations and their
        # aggregate stats in a single DB round-trip.
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

        # Collect unique (symbol, market) pairs for name resolution
        sym_market_pairs: set[tuple[str, str]] = {(r.symbol, r.market) for r in rows}
        for sym, mkt, _ in wl_keys:
            sym_market_pairs.add((sym, mkt))

        # Resolve names concurrently (one call per unique symbol+market)
        name_tasks = {(sym, mkt): get_symbol_name(sym, mkt) for sym, mkt in sym_market_pairs}
        name_map: dict[tuple[str, str], str] = {}
        for key, coro in name_tasks.items():
            try:
                name_map[key] = await coro
            except Exception:
                name_map[key] = ""

        # Convert DB rows → status dicts
        seen_keys: set[tuple[str, str, str]] = set()
        status_list: list[dict] = []
        for row in rows:
            key = (row.symbol, row.market, row.period)
            seen_keys.add(key)
            last_bar_date = pd.Timestamp(row.last_ts).isoformat() if row.last_ts else None
            status_list.append(
                {
                    "symbol": row.symbol,
                    "market": row.market,
                    "period": row.period,
                    "name": name_map.get((row.symbol, row.market), ""),
                    "bar_count": row.bar_count,
                    "last_bar_date": last_bar_date,
                    "is_empty": row.bar_count == 0,
                    "in_watchlist": key in wl_keys,
                }
            )

        # Append watchlist entries that have no data in the DB at all
        for sym, mkt, period in sorted(wl_keys - seen_keys):
            status_list.append(
                {
                    "symbol": sym,
                    "market": mkt,
                    "period": period,
                    "name": name_map.get((sym, mkt), ""),
                    "bar_count": 0,
                    "last_bar_date": None,
                    "is_empty": True,
                    "in_watchlist": True,
                }
            )

        # Sort: watchlist symbols first, then by market / symbol / period
        status_list.sort(key=lambda x: (not x["in_watchlist"], x["market"], x["symbol"], x["period"]))
        return status_list
    except Exception as exc:
        logger.error(f"[collector] 查询数据状态失败: {exc}")
        return []


# ── Main loop (smart scheduler) ───────────────────────────────────────────────

async def run_collector() -> None:
    """Smart scheduler — wakes every COLLECTOR_INTRADAY_INTERVAL_MINUTES.

    On each tick:
    1. Identify which markets are currently in trading hours.
       → Run intraday refresh for minute-period symbols in those markets.
    2. Identify which markets have passed their EOD time (and haven't been
       refreshed today).
       → Run EOD refresh for daily-period symbols in those markets.
    3. On the very first tick, run the watchlist cold-start pass so that any
       symbols configured in the watchlist that have no history get populated.
    """
    logger.info(
        "[collector] 智能采集服务启动 | "
        f"检查间隔 {_INTRADAY_INTERVAL_MIN} min | "
        f"盘中请求间隔 {_INTRADAY_REQUEST_SLEEP}s | "
        f"收盘请求间隔 {_REQUEST_SLEEP}s | "
        f"历史天数 {_HISTORY_DAYS}d | "
        f"收盘延迟 {_EOD_DELAY_MIN} min"
    )

    first_tick = True

    while True:
        try:
            now_cn = _cn_now()

            # ── 1. Watchlist cold-start (first tick only) ───────────────────
            if first_tick:
                first_tick = False
                logger.info("[collector] 启动：执行 watchlist 历史冷启动")
                await run_collection_cycle()

            # ── 2. Intraday: refresh minute bars for open markets ───────────
            open_markets = {
                m for m in ("a", "hk", "us", "futures")
                if is_trading_hours(m, now_cn)
            }
            if open_markets:
                await run_intraday_cycle(open_markets)
            else:
                logger.debug(
                    f"[collector] {now_cn.strftime('%H:%M')} CST — 无市场处于交易时段"
                )

            # ── 3. EOD: refresh daily bars for markets that just closed ─────
            for market in ("a", "hk", "us", "futures"):
                if _should_run_eod(market, now_cn):
                    logger.info(f"[collector] {market.upper()} 触发收盘日线刷新")
                    await run_eod_cycle(market)

        except Exception as exc:
            logger.error(f"[collector] 调度器顶层异常: {exc}")

        await asyncio.sleep(_INTRADAY_INTERVAL_MIN * 60)


if __name__ == "__main__":
    # Standalone entrypoint: python -m src.services.data.data_collector
    async def _main():
        from src.database.db import init_db

        await init_db()
        await run_collector()

    asyncio.run(_main())