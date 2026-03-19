"""AKShare data service - fetches stock and futures data.

Data-access strategy (DB-first):
1. Query the local ``market_bars`` PostgreSQL/SQLite table.
2. If enough rows exist, return from DB immediately.
   If the last bar is stale, trigger a background refresh so the NEXT
   caller gets fresher data.
3. If the DB has no usable data for this symbol, fall back to AKShare
   (protected by a per-symbol asyncio.Lock to prevent thundering-herd
   and a global Semaphore(3) to cap concurrent external requests).
   The fetched data is written back to DB in the background.

The public ``fetch_raw_ohlcv`` function is used by the data collector
to fetch incremental bars without warmup or indicator computation.
"""

import asyncio
import random
import time
from datetime import datetime, timedelta
from typing import Optional
import os
import pandas as pd
from loguru import logger

try:
    import akshare as ak
except ImportError:
    raise ImportError("akshare not installed")

from ta.trend import MACD, SMAIndicator
from ta.momentum import RSIIndicator
from ta.volatility import AverageTrueRange


MARKET_A = "a"
MARKET_HK = "hk"
MARKET_US = "us"
MARKET_FUTURES = "futures"
PERIOD_DAILY = "daily"

_MA_WARMUP_DAYS = 90

# ── DB-first thresholds ────────────────────────────────────────────────────────
_MIN_BARS_DAILY = 90      # minimum DB rows to consider daily cache usable
_MIN_BARS_MINUTE = 30     # minimum DB rows to consider intraday cache usable
_STALENESS_DAILY_DAYS = 1       # days before triggering a synchronous DB refresh
_WRITE_CHUNK = 500              # max rows per DB INSERT batch

# ── Concurrency guards ─────────────────────────────────────────────────────────
# Per-symbol locks: only ONE coroutine fetches from AKShare for a given symbol
# at a time; all others wait and then find the data in DB (double-checked locking).
_fetch_locks: dict = {}
# Global semaphore: cap total simultaneous external HTTP requests to avoid IP bans.
_fetch_semaphore: Optional[asyncio.Semaphore] = None


def _get_semaphore() -> asyncio.Semaphore:
    global _fetch_semaphore
    if _fetch_semaphore is None:
        _fetch_semaphore = asyncio.Semaphore(3)
    return _fetch_semaphore


def _get_lock(key: str) -> asyncio.Lock:
    if key not in _fetch_locks:
        _fetch_locks[key] = asyncio.Lock()
    return _fetch_locks[key]



_RETRY_EXCEPTIONS = ("Connection aborted", "RemoteDisconnected", "ConnectionError",
                     "timeout", "Timeout", "429", "503", "502", "reset by peer")

def _is_retriable(exc: Exception) -> bool:
    msg = str(exc)
    return any(k in msg for k in _RETRY_EXCEPTIONS)


def _try_sources(sources: list, context: str, max_retries: int = 3) -> pd.DataFrame:
    """Try each (name, callable) source in order with exponential backoff retry.
    Raises ValueError with all failure details when every source is exhausted.
    """
    errors: list[str] = []
    for name, fn in sources:
        last_exc = None
        for attempt in range(max_retries):
            try:
                df = fn()
                if df is not None and not df.empty:
                    logger.info(f"[{context}] 数据源 '{name}' 成功，共 {len(df)} 行")
                    return df
                logger.warning(f"[{context}] 数据源 '{name}' 返回空数据，尝试下一个")
                errors.append(f"{name}: 返回空数据")
                break
            except Exception as exc:
                last_exc = exc
                if attempt < max_retries - 1 and _is_retriable(exc):
                    delay = (2 ** attempt) * 3 + random.uniform(0, 2)
                    logger.warning(
                        f"[{context}] 数据源 '{name}' 第{attempt+1}次失败(可重试)，"
                        f"{delay:.1f}s 后重试: {exc}"
                    )
                    time.sleep(delay)
                else:
                    logger.warning(f"[{context}] 数据源 '{name}' 失败: {exc}，尝试下一个")
                    errors.append(f"{name}: {exc}")
                    break
    raise ValueError(f"[{context}] 所有数据源均失败:\n" + "\n".join(f"  • {e}" for e in errors))


async def _db_fetch_bars(
    symbol: str, market: str, period: str, start_ns: int, end_ns: int
) -> pd.DataFrame:
    """Return cached OHLCV bars from the local database."""
    try:
        from sqlalchemy import select as sa_select
        from src.database.db import async_session, MarketBar

        async with async_session() as db:
            result = await db.execute(
                sa_select(MarketBar)
                .where(
                    MarketBar.symbol == symbol,
                    MarketBar.market == market,
                    MarketBar.period == period,
                    MarketBar.bar_ts >= start_ns,
                    MarketBar.bar_ts <= end_ns,
                )
                .order_by(MarketBar.bar_ts)
            )
            rows = result.scalars().all()

        if not rows:
            return pd.DataFrame()

        df = pd.DataFrame(
            [
                {
                    "datetime": r.bar_ts,
                    "open": r.open,
                    "high": r.high,
                    "low": r.low,
                    "close": r.close,
                    "volume": r.volume if r.volume is not None else 0.0,
                    "timestamp": r.bar_ts,
                }
                for r in rows
            ]
        )
        return df
    except Exception as exc:
        logger.warning(f"[DB读取] {market}:{symbol}:{period} 失败: {exc}")
        return pd.DataFrame()


async def _db_write_bars(df: pd.DataFrame, symbol: str, market: str, period: str) -> None:
    """Persist OHLCV bars to the local database (upsert-safe, SQLite & PostgreSQL)."""
    if df is None or df.empty:
        return
    try:
        from src.database.db import async_session, engine, MarketBar

        rows = [
            {
                "symbol": symbol,
                "market": market,
                "period": period,
                "datetime": int(r.datetime),
                "open": float(r.open),
                "high": float(r.high),
                "low": float(r.low),
                "close": float(r.close),
                "volume": 0.0 if (r.volume is None or (hasattr(r.volume, '__class__') and pd.isna(r.volume))) else float(r.volume),
                "fetched_at": datetime.utcnow(),
            }
            for r in df.itertuples(index=False)
        ]

        dialect = engine.dialect.name
        async with async_session() as db:
            for i in range(0, len(rows), _WRITE_CHUNK):
                chunk = rows[i : i + _WRITE_CHUNK]
                if dialect == "postgresql":
                    from sqlalchemy.dialects.postgresql import insert as _pg_insert
                    stmt = _pg_insert(MarketBar).values(chunk).on_conflict_do_nothing(
                        index_elements=["symbol", "market", "period", "datetime"]
                    )
                else:
                    from sqlalchemy.dialects.sqlite import insert as _sqlite_insert
                    stmt = _sqlite_insert(MarketBar).values(chunk).on_conflict_do_nothing()
                await db.execute(stmt)
            await db.commit()

        logger.debug(f"[DB写入] {market}:{symbol}:{period} {len(rows)} 行")
    except Exception as exc:
        logger.error(f"[DB写入] {market}:{symbol}:{period} 失败: {exc}")


async def _dispatch_fetch(
    symbol: str, market: str, period: str, start: str, end: str, adjust: str = "qfq"
) -> pd.DataFrame:
    """Route to the appropriate market fetch function."""
    if market == MARKET_A:
        return await _fetch_a_share(symbol, period, start, end, adjust)
    elif market == MARKET_HK:
        return await _fetch_hk_stock(symbol, period, start, end, adjust)
    elif market == MARKET_US:
        return await _fetch_us_stock(symbol, period, start, end, adjust)
    elif market == MARKET_FUTURES:
        return await _fetch_futures(symbol, period, start, end)
    else:
        raise ValueError(f"不支持的市场: {market!r}")


async def _background_refresh(
    symbol: str, market: str, period: str, start: str, end: str, adjust: str = "qfq"
) -> None:
    """Silently refresh DB data for a symbol. Runs as a fire-and-forget task."""
    try:
        logger.info(f"[后台刷新] {market}:{symbol}:{period} 开始")
        async with _get_semaphore():
            df = await _dispatch_fetch(symbol, market, period, start, end, adjust)
        await _db_write_bars(df, symbol, market, period)
        logger.info(f"[后台刷新] {market}:{symbol}:{period} 完成，{len(df)} 行")
    except Exception as exc:
        logger.error(f"[后台刷新] {market}:{symbol}:{period} 失败: {exc}")


async def fetch_market_data(
    symbol: str,
    market: str = "a",
    period: str = "daily",
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    adjust: str = "qfq",
) -> pd.DataFrame:
    """Fetch OHLCV data and compute technical indicators.

    Data-access order:
    1. Local DB cache (``market_bars`` table) — instant response.
       If the latest bar is stale, a background task refreshes the DB
       so subsequent calls get fresher data.
    2. AKShare fallback — only when DB has insufficient data.
       Protected by a per-symbol Lock + global Semaphore(3).
       Fetched data is written back to DB asynchronously.

    Args:
        symbol: Stock/futures ticker
        market: "a" (A股), "hk" (港股), "us" (美股), "futures" (期货)
        period: "daily" or minute string "1"/"5"/"15"/"30"/"60"
        start_date: "YYYYMMDD" or "YYYY-MM-DD"
        end_date: "YYYYMMDD" or "YYYY-MM-DD"

    Returns:
        DataFrame with OHLCV and technical indicators
    """
    market = market.lower()

    if start_date is None:
        start_date = (datetime.now() - timedelta(days=365)).strftime("%Y%m%d")
    if end_date is None:
        end_date = datetime.now().strftime("%Y%m%d")

    start_date = start_date.replace("-", "")
    end_date = end_date.replace("-", "")

    start_dt = datetime.strptime(start_date, "%Y%m%d")
    fetch_start = (start_dt - timedelta(days=_MA_WARMUP_DAYS)).strftime("%Y%m%d")

    start_ns = pd.Timestamp(start_date).value
    fetch_start_ns = pd.Timestamp(fetch_start).value
    end_ns = pd.Timestamp(end_date).value

    min_bars = _MIN_BARS_DAILY if period == PERIOD_DAILY else _MIN_BARS_MINUTE

    # ── 1. Try local DB ────────────────────────────────────────────────────────
    db_df = await _db_fetch_bars(symbol, market, period, fetch_start_ns, end_ns)

    if len(db_df) >= min_bars:
        last_ts = pd.Timestamp(int(db_df["datetime"].max()))
        now = datetime.utcnow()
        elapsed = (now - last_ts.to_pydatetime()).total_seconds()
        if period == PERIOD_DAILY:
            stale = elapsed > _STALENESS_DAILY_DAYS * 86400
        else:
            stale = elapsed > int(period) * 60  # 1× period length

        if stale:
            lock_key = f"{market}:{symbol}:{period}"
            async with _get_lock(lock_key):
                # Double-check: another coroutine may have refreshed while we waited
                db_df2 = await _db_fetch_bars(symbol, market, period, fetch_start_ns, end_ns)
                if not db_df2.empty:
                    last2 = pd.Timestamp(int(db_df2["datetime"].max()))
                    elapsed2 = (datetime.utcnow() - last2.to_pydatetime()).total_seconds()
                    if period == PERIOD_DAILY:
                        still_stale = elapsed2 > _STALENESS_DAILY_DAYS * 86400
                    else:
                        still_stale = elapsed2 > int(period) * 60
                else:
                    still_stale = True

                if still_stale:
                    logger.info(f"[DB陈旧] {market}:{symbol}:{period} 数据陈旧，同步拉取")
                    async with _get_semaphore():
                        fresh_df = await _dispatch_fetch(symbol, market, period, fetch_start, end_date, adjust)
                    if fresh_df is not None and not fresh_df.empty:
                        await _db_write_bars(fresh_df, symbol, market, period)
                db_df = await _db_fetch_bars(symbol, market, period, fetch_start_ns, end_ns)

        df = _calculate_indicators(db_df)
        df = df[df["datetime"] >= start_ns].reset_index(drop=True)
        logger.info(f"[DB命中] {market}:{symbol}:{period} {len(df)} 根K线")
        return df

    # ── 2. AKShare fallback with thundering-herd protection ───────────────────
    lock_key = f"{market}:{symbol}:{period}"
    async with _get_lock(lock_key):
        # Double-check: another coroutine may have populated DB while we waited
        db_df = await _db_fetch_bars(symbol, market, period, fetch_start_ns, end_ns)
        if len(db_df) >= min_bars:
            df = _calculate_indicators(db_df)
            df = df[df["datetime"] >= start_ns].reset_index(drop=True)
            logger.info(f"[DB命中(锁后)] {market}:{symbol}:{period} {len(df)} 根K线")
            return df

        logger.info(f"[AKShare] {market}:{symbol}:{period} DB无数据，外部拉取 {fetch_start}~{end_date}")
        async with _get_semaphore():
            raw_df = await _dispatch_fetch(symbol, market, period, fetch_start, end_date, adjust)

        if raw_df is None or raw_df.empty:
            raise ValueError(f"未获取到数据: {market.upper()} {symbol}")

        # Write to DB synchronously inside the lock so subsequent waiters find data
        await _db_write_bars(raw_df, symbol, market, period)

        df = _calculate_indicators(raw_df)
        df = df[df["datetime"] >= start_ns].reset_index(drop=True)
        logger.info(f"[AKShare完成] {market}:{symbol}:{period} {len(df)} 根K线")
        return df


async def fetch_raw_ohlcv(
    symbol: str,
    market: str = "a",
    period: str = "daily",
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    adjust: str = "qfq",
) -> pd.DataFrame:
    """Fetch raw OHLCV from an external source — no warmup prefix, no indicators.

    Intended for the data collector which manages its own date range and writes
    raw bars directly to the DB.
    """
    market = market.lower()
    if start_date is None:
        start_date = (datetime.now() - timedelta(days=730)).strftime("%Y%m%d")
    if end_date is None:
        end_date = datetime.now().strftime("%Y%m%d")

    start_date = start_date.replace("-", "")
    end_date = end_date.replace("-", "")

    logger.info(f"[fetch_raw] {market.upper()} {symbol} [{period}] {start_date}~{end_date}")
    return await _dispatch_fetch(symbol, market, period, start_date, end_date, adjust)



async def _fetch_a_share(symbol: str, period: str, start: str, end: str, adjust: str) -> pd.DataFrame:
    """Fetch A-share data with multi-source fallback."""
    ctx = f"A股 {symbol}"
    sina_symbol = f"sh{symbol}" if symbol.startswith("6") else (
        f"bj{symbol}" if symbol.startswith(("4", "8")) else f"sz{symbol}")
    s_fmt = f"{start[:4]}-{start[4:6]}-{start[6:]}"
    e_fmt = f"{end[:4]}-{end[4:6]}-{end[6:]}"

    if period == PERIOD_DAILY:
        return _try_sources([
            ("新浪(Sina)", lambda: _normalize(
                ak.stock_zh_a_daily(symbol=sina_symbol, start_date=start, end_date=end, adjust=adjust),
                "date", "open", "high", "low", "close", "volume")),
            ("东方财富(EastMoney)", lambda: _normalize(
                ak.stock_zh_a_hist(symbol=symbol, period="daily",
                                   start_date=s_fmt, end_date=e_fmt, adjust=adjust),
                "日期", "开盘", "最高", "最低", "收盘", "成交量")),
        ], ctx)
    else:
        # Minute data: Sina source has no server-side date filter, filter after fetch
        s = f"{s_fmt} 09:30:00"
        e = f"{e_fmt} 15:00:00"
        return _try_sources([
            ("新浪分钟(Sina-min)", lambda: _filter_and_normalize_minute(
                ak.stock_zh_a_minute(symbol=sina_symbol, period=period, adjust=adjust),
                "day", start, end)),
            ("东方财富分钟(EastMoney-min)", lambda: _normalize(
                ak.stock_zh_a_hist_min_em(symbol=symbol, period=period,
                                          start_date=s, end_date=e, adjust=adjust),
                "时间", "开盘", "最高", "最低", "收盘", "成交量")),
        ], ctx)


async def _fetch_hk_stock(symbol: str, period: str, start: str, end: str, adjust: str) -> pd.DataFrame:
    """Fetch HK stock data with multi-source fallback including yfinance."""
    ctx = f"港股 {symbol}"
    s_fmt = f"{start[:4]}-{start[4:6]}-{start[6:]}"
    e_fmt = f"{end[:4]}-{end[4:6]}-{end[6:]}"

    if period == PERIOD_DAILY:
        return _try_sources([
            ("Yahoo(stock_hk_daily)", lambda: _filter_date_range(
                _normalize(ak.stock_hk_daily(symbol=symbol, adjust=adjust),
                           "date", "open", "high", "low", "close", "volume"),
                start, end)),
            ("东方财富(stock_hk_hist)", lambda: _normalize(
                ak.stock_hk_hist(symbol=symbol, period="daily",
                                 start_date=s_fmt, end_date=e_fmt, adjust=adjust),
                "日期", "开盘", "最高", "最低", "收盘", "成交量")),
            ("yfinance(HK)", lambda: _yfinance_fetch(symbol, "hk", "1d", s_fmt, e_fmt)),
        ], ctx)
    else:
        s = f"{s_fmt} 09:30:00"
        e = f"{e_fmt} 16:30:00"
        return _try_sources([
            ("东方财富分钟(stock_hk_hist_min_em)", lambda: _normalize(
                ak.stock_hk_hist_min_em(symbol=symbol, period=period,
                                        adjust=adjust, start_date=s, end_date=e),
                "时间", "开盘", "最高", "最低", "收盘", "成交量")),
            ("yfinance分钟(HK)", lambda: _yfinance_fetch(symbol, "hk", f"{period}m", s_fmt, e_fmt)),
        ], ctx)


async def _fetch_us_stock(symbol: str, period: str, start: str, end: str, adjust: str) -> pd.DataFrame:
    """Fetch US stock data with multi-source fallback including yfinance."""
    ctx = f"美股 {symbol}"
    s_fmt = f"{start[:4]}-{start[4:6]}-{start[6:]}"
    e_fmt = f"{end[:4]}-{end[4:6]}-{end[6:]}"

    if period == PERIOD_DAILY:
        return _try_sources([
            ("Yahoo/Stooq(stock_us_daily)", lambda: _filter_date_range(
                _normalize(ak.stock_us_daily(symbol=symbol, adjust=adjust),
                           "date", "open", "high", "low", "close", "volume"),
                start, end)),
            ("东方财富(stock_us_hist)", lambda: _normalize(
                ak.stock_us_hist(symbol=symbol, period="daily",
                                 start_date=s_fmt, end_date=e_fmt, adjust=adjust),
                "日期", "开盘", "最高", "最低", "收盘", "成交量")),
            ("yfinance(US)", lambda: _yfinance_fetch(symbol, "us", "1d", s_fmt, e_fmt)),
        ], ctx)
    else:
        s = f"{s_fmt} 09:30:00"
        e = f"{e_fmt} 16:00:00"
        return _try_sources([
            ("东方财富分钟(stock_us_hist_min_em)", lambda: _normalize(
                ak.stock_us_hist_min_em(symbol=symbol, period=period,
                                        adjust=adjust, start_date=s, end_date=e),
                "时间", "开盘", "最高", "最低", "收盘", "成交量")),
            ("yfinance分钟(US)", lambda: _yfinance_fetch(symbol, "us", f"{period}m", s_fmt, e_fmt)),
        ], ctx)


async def _fetch_futures(symbol: str, period: str, start: str, end: str) -> pd.DataFrame:
    """Fetch futures data (domestic)."""
    # Map common futures symbols
    symbol_map = {
        "MA": "MA.CZCE",  # 甲醇
        "RU": "RU.SHFE",  # 橡胶
        "RM": "RM.CZCE",  # 菜粕
        "TA": "TA.CZCE",  # PTA
        "FG": "FG.CZCE",  # 玻璃
        "CF": "CF.CZCE",  # 棉花
        "SR": "SR.CZCE",  # 白糖
        "CU": "CU.SHFE",  # 铜
        "AL": "AL.SHFE",  # 铝
        "ZN": "ZN.SHFE",  # 锌
        "PB": "PB.SHFE",  # 铅
        "AU": "AU.SHFE",  # 黄金
        "AG": "AG.SHFE",  # 白银
        "I": "I.DCE",     # 铁矿石
        "J": "J.DCE",     # 焦炭
        "JM": "JM.DCE",   # 焦煤
        "RB": "RB.SHFE",  # 螺纹钢
        "HC": "HC.SHFE",  # 热卷
        "IF": "IF.CFFEX", # 股指期货
        "IC": "IC.CFFEX",
        "IH": "IH.CFFEX",
    }

    akshare_symbol = symbol_map.get(symbol.upper(), symbol)

    if period == PERIOD_DAILY:
        # Use futures daily data
        try:
            raw = ak.futures_zh_daily_sina(symbol=akshare_symbol, start_date=start, end_date=end)
            if raw is not None and not raw.empty:
                return _normalize_futures(raw)
        except Exception as e:
            logger.warning(f"期货获取失败: {e}")

        # Fallback: try using futures_zh_index_sina
        try:
            raw = ak.futures_zh_index_sina(symbol=akshare_symbol)
            if raw is not None and not raw.empty:
                return _normalize_futures(raw)
        except Exception as e:
            logger.warning(f"期货指数获取失败: {e}")

        raise ValueError(f"无法获取期货数据: {symbol}")
    else:
        # Minute data
        s = f"{start[:4]}-{start[4:6]}-{start[6:]} 09:00:00"
        e = f"{end[:4]}-{end[4:6]}-{end[6:]} 15:00:00"
        try:
            raw = ak.futures_zh_min_sina(symbol=akshare_symbol, period=period, start_date=s, end_date=e)
            return _normalize(raw, "time", "open", "high", "low", "close", "volume")
        except Exception as e:
            logger.warning(f"期货分钟数据获取失败: {e}")
            raise ValueError(f"无法获取期货分钟数据: {symbol}")


def _filter_date_range(df: pd.DataFrame, start: str, end: str) -> pd.DataFrame:
    """Keep rows within [start, end] (both 'YYYYMMDD')."""
    s_ns = pd.Timestamp(f"{start[:4]}-{start[4:6]}-{start[6:]}").value
    e_ns = pd.Timestamp(f"{end[:4]}-{end[4:6]}-{end[6:]}").value
    return df[(df["datetime"] >= s_ns) & (df["datetime"] <= e_ns)].reset_index(drop=True)


def _filter_and_normalize_minute(raw: pd.DataFrame, date_col: str,
                                  start: str, end: str) -> pd.DataFrame:
    """Normalize A-share Sina minute data and filter to [start, end]."""
    raw = raw.copy()
    raw[date_col] = pd.to_datetime(raw[date_col])
    s_ts = pd.Timestamp(f"{start[:4]}-{start[4:6]}-{start[6:]}")
    e_ts = pd.Timestamp(f"{end[:4]}-{end[4:6]}-{end[6:]} 23:59:59")
    raw = raw[(raw[date_col] >= s_ts) & (raw[date_col] <= e_ts)].reset_index(drop=True)
    return _normalize(raw, date_col, "open", "high", "low", "close", "volume")


_YFINANCE_INTERVAL_MAP = {
    "1": "1m", "5": "5m", "15": "15m", "30": "30m", "60": "1h",
    "1m": "1m", "5m": "5m", "15m": "15m", "30m": "30m", "60m": "1h", "1d": "1d",
}
_YFINANCE_MINUTE_LIMIT_DAYS = {"1m": 7, "5m": 60, "15m": 60, "30m": 60, "1h": 730}


def _yfinance_fetch(symbol: str, market: str, interval: str,
                    start: str, end: str) -> pd.DataFrame:
    """Fetch via yfinance (Yahoo Finance)."""
    try:
        import yfinance as yf
    except ImportError:
        raise ImportError("yfinance not installed. Run: pip install yfinance")

    interval = _YFINANCE_INTERVAL_MAP.get(interval, interval)
    yf_symbol = f"{symbol.lstrip('0').zfill(4)}.HK" if market == "hk" else symbol.upper()

    limit_days = _YFINANCE_MINUTE_LIMIT_DAYS.get(interval)
    if limit_days:
        from datetime import datetime as _dt
        days_back = (_dt.now() - _dt.strptime(start, "%Y-%m-%d")).days
        if days_back > limit_days:
            raise ValueError(
                f"yfinance '{interval}' 最多回溯 {limit_days} 天，"
                f"请求起始日 {start} 超出限制 ({days_back} 天前)"
            )

    ticker = yf.Ticker(yf_symbol)
    raw = ticker.history(start=start, end=end, interval=interval, auto_adjust=True)
    if raw is None or raw.empty:
        raise ValueError(f"yfinance 返回空数据: {yf_symbol}")

    raw = raw.reset_index()
    date_col = "Datetime" if "Datetime" in raw.columns else "Date"
    df = raw.rename(columns={
        date_col: "datetime", "Open": "open", "High": "high",
        "Low": "low", "Close": "close", "Volume": "volume",
    })[["datetime", "open", "high", "low", "close", "volume"]].copy()

    df["datetime"] = pd.to_datetime(df["datetime"]).dt.tz_convert(None).astype("int64")
    df["timestamp"] = df["datetime"]
    for col in ("open", "high", "low", "close", "volume"):
        df[col] = pd.to_numeric(df[col], errors="coerce")
    return df.dropna(subset=["open", "high", "low", "close"]).reset_index(drop=True)


def _normalize(raw: pd.DataFrame, date_col: str, open_col: str, high_col: str, low_col: str, close_col: str, volume_col: str) -> pd.DataFrame:
    """Normalize DataFrame columns."""
    df = raw.rename(columns={
        date_col: "datetime",
        open_col: "open",
        high_col: "high",
        low_col: "low",
        close_col: "close",
        volume_col: "volume",
    })
    missing = [c for c in ("datetime", "open", "high", "low", "close", "volume") if c not in df.columns]
    if missing:
        raise ValueError(
            f"列名映射失败，缺少 {missing}；"
            f"期望源列 [{date_col},{open_col},{high_col},{low_col},{close_col},{volume_col}]，"
            f"实际列 {list(raw.columns)}"
        )
    df = df[["datetime", "open", "high", "low", "close", "volume"]].copy()

    df["datetime"] = pd.to_datetime(df["datetime"]).astype("datetime64[ns]").astype("int64")
    df["timestamp"] = df["datetime"]

    for col in ("open", "high", "low", "close", "volume"):
        df[col] = pd.to_numeric(df[col], errors="coerce")

    df = df.dropna(subset=["open", "high", "low", "close"]).reset_index(drop=True)
    return df


def _normalize_futures(raw: pd.DataFrame) -> pd.DataFrame:
    """Normalize futures DataFrame."""
    # Try to find the right column names
    col_map = {
        "日期": "datetime", "date": "datetime",
        "开盘": "open", "open": "open",
        "最高": "high", "high": "high",
        "最低": "low", "low": "low",
        "收盘": "close", "close": "close",
        "成交量": "volume", "volume": "volume",
    }

    df = raw.copy()
    df = df.rename(columns=col_map)

    required = ["datetime", "open", "high", "low", "close", "volume"]
    df = df[required].copy()

    df["datetime"] = pd.to_datetime(df["datetime"]).astype("datetime64[ns]").astype("int64")
    df["timestamp"] = df["datetime"]

    for col in required[1:]:
        df[col] = pd.to_numeric(df[col], errors="coerce")

    df = df.dropna(subset=["open", "high", "low", "close"]).reset_index(drop=True)
    return df


def _calculate_indicators(df: pd.DataFrame) -> pd.DataFrame:
    """Calculate technical indicators."""
    close = df["close"]
    high = df["high"]
    low = df["low"]

    # Moving averages
    df["ma10"] = SMAIndicator(close, window=10).sma_indicator()
    df["ma30"] = SMAIndicator(close, window=30).sma_indicator()
    df["ma60"] = SMAIndicator(close, window=60).sma_indicator()

    # RSI(14)
    df["rsi"] = RSIIndicator(close, window=14).rsi()

    # ATR(14)
    df["atr"] = AverageTrueRange(high=high, low=low, close=close, window=14).average_true_range()

    # MACD(12, 26, 9)
    macd_obj = MACD(close, window_fast=12, window_slow=26, window_sign=9)
    df["macd"] = macd_obj.macd()
    df["macd_dea"] = macd_obj.macd_signal()
    df["macd_bar"] = macd_obj.macd_diff()

    return df
