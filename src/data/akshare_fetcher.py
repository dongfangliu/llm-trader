"""AKShare data fetcher for A-shares, HK stocks, and US stocks.

Fetches OHLCV data and computes the same technical indicators used by the
existing TqSDK-based backtester (MA10/MA30/MA60, RSI14, ATR14, MACD 12/26/9).

The returned DataFrame is compatible with the existing decision engine interface:
  - Numeric columns: open, high, low, close, volume
  - Indicator columns: ma10, ma30, ma60, rsi, atr, macd, macd_dea, macd_bar
  - datetime column: nanosecond int64 timestamp (compatible with tafunc.time_to_datetime)
  - timestamp column: same as datetime (used by LLM engine cache key)

Usage:
    from src.data.akshare_fetcher import fetch_stock_data
    df = fetch_stock_data("600519", market="a", start_date="20240101", end_date="20241231")
    df = fetch_stock_data("00700",  market="hk", start_date="20240101", end_date="20241231")
    df = fetch_stock_data("AAPL",   market="us", start_date="20240101", end_date="20241231")
    # Minute data (A-share only, period in minutes: "1","5","15","30","60"):
    df = fetch_stock_data("600519", market="a", period="15", start_date="20240901", end_date="20241031")
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Optional

import numpy as np
import pandas as pd
from loguru import logger

try:
    import akshare as ak
except ImportError:
    raise ImportError("akshare not installed. Run: pip install akshare")

try:
    from ta.trend import MACD, SMAIndicator
    from ta.momentum import RSIIndicator
    from ta.volatility import AverageTrueRange
except ImportError:
    raise ImportError("ta not installed. Run: pip install ta")


MARKET_A = "a"
MARKET_HK = "hk"
MARKET_US = "us"
PERIOD_DAILY = "daily"

# Extra calendar days prepended to the fetch window so that the largest MA
# window (MA60) has enough warm-up bars even when the user requests a short
# date range.  60 trading days ≈ 90 calendar days.
_MA_WARMUP_DAYS = 90


def _try_sources(sources: list, context: str) -> pd.DataFrame:
    """Try each (name, callable) source in order; return the first non-empty result.

    ``sources`` is a list of ``(label, fn)`` tuples where ``fn()`` returns a
    normalised DataFrame.  Each failure is logged as a warning.  Only when
    every source has been exhausted is a ``ValueError`` raised.
    """
    errors: list[str] = []
    for name, fn in sources:
        try:
            df = fn()
            if df is not None and not df.empty:
                logger.info(f"[{context}] 数据源 '{name}' 获取成功，共 {len(df)} 行")
                return df
            logger.warning(f"[{context}] 数据源 '{name}' 返回空数据，尝试下一个")
            errors.append(f"{name}: 返回空数据")
        except Exception as exc:
            logger.warning(f"[{context}] 数据源 '{name}' 失败: {exc}，尝试下一个")
            errors.append(f"{name}: {exc}")
    raise ValueError(f"[{context}] 所有数据源均失败:\n" + "\n".join(f"  • {e}" for e in errors))


def fetch_stock_data(
    symbol: str,
    market: str = MARKET_A,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    period: str = PERIOD_DAILY,
    adjust: str = "qfq",
) -> pd.DataFrame:
    """Fetch OHLCV data from AKShare and compute technical indicators.

    Args:
        symbol:     Stock ticker ("600519" / "00700" / "AAPL")
        market:     "a" (A股), "hk" (港股), "us" (美股)
        start_date: "YYYYMMDD" or "YYYY-MM-DD"
        end_date:   "YYYYMMDD" or "YYYY-MM-DD"
        period:     "daily" or minute string "1"/"5"/"15"/"30"/"60"
        adjust:     "qfq" (前复权), "hfq" (后复权), "" (不复权)

    Returns:
        DataFrame with columns:
            datetime (int64 ns), timestamp (int64 ns),
            open, high, low, close, volume (float),
            ma10, ma30, ma60, rsi, atr,
            macd, macd_dea, macd_bar (float)
    """
    market = market.lower()

    if start_date is None:
        start_date = (datetime.now() - timedelta(days=365)).strftime("%Y%m%d")
    if end_date is None:
        end_date = datetime.now().strftime("%Y%m%d")

    # Normalize to YYYYMMDD
    start_date = start_date.replace("-", "")
    end_date = end_date.replace("-", "")

    # Extend fetch window backward so MA60 (and other indicators) have enough
    # warm-up bars.  We trim back to the original start_date after calculation.
    start_dt = datetime.strptime(start_date, "%Y%m%d")
    fetch_start = (start_dt - timedelta(days=_MA_WARMUP_DAYS)).strftime("%Y%m%d")

    logger.info(f"AKShare 拉取 {market.upper()} {symbol} [{period}] {fetch_start}~{end_date} (预热起始 {start_date})")

    if market == MARKET_A:
        df = _fetch_a_share(symbol, period, fetch_start, end_date, adjust)
    elif market == MARKET_HK:
        df = _fetch_hk_stock(symbol, period, fetch_start, end_date, adjust)
    elif market == MARKET_US:
        df = _fetch_us_stock(symbol, period, fetch_start, end_date, adjust)
    else:
        raise ValueError(f"不支持的市场: {market!r}，请使用 a / hk / us")

    if df.empty:
        raise ValueError(f"未获取到数据: {market.upper()} {symbol}")

    df = _calculate_indicators(df)

    # Drop warm-up rows (before the originally requested start_date)
    start_ns = pd.Timestamp(start_date).value
    df = df[df["datetime"] >= start_ns].reset_index(drop=True)

    valid = (~df["ma60"].isna()).sum()
    logger.info(f"共 {len(df)} 根K线，MA60有效 {valid} 根")
    return df


# ---------------------------------------------------------------------------
# Market-specific fetchers
# ---------------------------------------------------------------------------

def _a_share_prefix(symbol: str) -> str:
    """Return 'sh'/'sz'/'bj' prefix for Sina API based on symbol number."""
    if symbol.startswith(("6",)):
        return f"sh{symbol}"
    if symbol.startswith(("4", "8")):
        return f"bj{symbol}"
    return f"sz{symbol}"


def _fetch_a_share(symbol: str, period: str, start: str, end: str, adjust: str) -> pd.DataFrame:
    ctx = f"A股 {symbol}"
    s_fmt = f"{start[:4]}-{start[4:6]}-{start[6:]}"
    e_fmt = f"{end[:4]}-{end[4:6]}-{end[6:]}"
    sina_symbol = _a_share_prefix(symbol)

    if period == PERIOD_DAILY:
        return _try_sources([
            ("新浪(Sina)", lambda: _normalize(
                ak.stock_zh_a_daily(symbol=sina_symbol, start_date=start, end_date=end, adjust=adjust),
                "date", "open", "high", "low", "close", "volume")),
            ("东方财富(EastMoney)", lambda: _normalize(
                ak.stock_zh_a_hist(symbol=symbol, period="daily",
                                   start_date=s_fmt, end_date=e_fmt, adjust=adjust),
                "日期", "开盘", "最高", "最低", "收盘", "成交量")),
            ("腾讯(Tencent)", lambda: _normalize(
                ak.stock_zh_a_hist_tx(symbol=sina_symbol, start_date=s_fmt, end_date=e_fmt, adjust=adjust),
                "date", "open", "high", "low", "close", "volume")),
        ], ctx)
    else:
        # Minute data
        s = f"{s_fmt} 09:30:00"
        e = f"{e_fmt} 15:00:00"
        return _try_sources([
            ("东方财富分钟(EastMoney-min)", lambda: _normalize(
                ak.stock_zh_a_hist_min_em(symbol=symbol, period=period,
                                          start_date=s, end_date=e, adjust=adjust),
                "时间", "开盘", "最高", "最低", "收盘", "成交量")),
            ("新浪分钟(Sina-min)", lambda: _filter_date_range(
                _normalize(
                    ak.stock_zh_a_minute(symbol=sina_symbol, period=period, adjust=adjust),
                    "day", "open", "high", "low", "close", "volume"),
                start, end)),
        ], ctx)


def _fetch_hk_stock(symbol: str, period: str, start: str, end: str, adjust: str) -> pd.DataFrame:
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


def _fetch_us_stock(symbol: str, period: str, start: str, end: str, adjust: str) -> pd.DataFrame:
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


# ---------------------------------------------------------------------------
# Normalization helpers
# ---------------------------------------------------------------------------

def _filter_date_range(df: pd.DataFrame, start: str, end: str) -> pd.DataFrame:
    """Keep only rows within [start, end] (both inclusive, 'YYYYMMDD' format)."""
    start_ts = pd.Timestamp(f"{start[:4]}-{start[4:6]}-{start[6:]}").value
    end_ts   = pd.Timestamp(f"{end[:4]}-{end[4:6]}-{end[6:]}").value
    return df[(df["datetime"] >= start_ts) & (df["datetime"] <= end_ts)].reset_index(drop=True)


# yfinance interval mapping — periods supported: 1m/2m/5m/15m/30m/60m/1d
_YFINANCE_INTERVAL_MAP = {
    "1": "1m", "2": "2m", "5": "5m", "15": "15m", "30": "30m", "60": "1h",
    "1m": "1m", "5m": "5m", "15m": "15m", "30m": "30m", "60m": "1h", "1d": "1d",
}
# yfinance: minute data availability limits (days back from today)
_YFINANCE_MINUTE_LIMIT_DAYS = {"1m": 7, "2m": 60, "5m": 60, "15m": 60, "30m": 60, "1h": 730}


def _yfinance_fetch(symbol: str, market: str, interval: str, start: str, end: str) -> pd.DataFrame:
    """Fetch OHLCV data via yfinance and return a normalised DataFrame.

    Args:
        symbol:   Ticker as used by this system (e.g. "00700" for HK, "AAPL" for US)
        market:   "hk" | "us"
        interval: yfinance interval string, e.g. "1m", "5m", "1h", "1d"
        start:    "YYYY-MM-DD"
        end:      "YYYY-MM-DD"
    """
    try:
        import yfinance as yf
    except ImportError:
        raise ImportError("yfinance not installed. Run: pip install yfinance")

    interval = _YFINANCE_INTERVAL_MAP.get(interval, interval)

    # Build yfinance ticker symbol
    if market == "hk":
        # Pad to 4 digits and append .HK (e.g. "700" → "0700.HK")
        yf_symbol = f"{symbol.lstrip('0').zfill(4)}.HK"
    else:
        yf_symbol = symbol.upper()

    # yfinance minute data has a rolling availability window; warn if out of range
    limit_days = _YFINANCE_MINUTE_LIMIT_DAYS.get(interval)
    if limit_days:
        from datetime import datetime as _dt
        days_back = (_dt.now() - _dt.strptime(start, "%Y-%m-%d")).days
        if days_back > limit_days:
            raise ValueError(
                f"yfinance '{interval}' 数据最多回溯 {limit_days} 天，"
                f"请求起始日 {start} 已超出限制 ({days_back} 天前)"
            )

    ticker = yf.Ticker(yf_symbol)
    raw = ticker.history(start=start, end=end, interval=interval, auto_adjust=True)

    if raw is None or raw.empty:
        raise ValueError(f"yfinance 返回空数据: {yf_symbol} [{interval}] {start}~{end}")

    raw = raw.reset_index()
    # Column name varies: "Datetime" for intraday, "Date" for daily
    date_col = "Datetime" if "Datetime" in raw.columns else "Date"
    df = raw.rename(columns={
        date_col:  "datetime",
        "Open":    "open",
        "High":    "high",
        "Low":     "low",
        "Close":   "close",
        "Volume":  "volume",
    })[["datetime", "open", "high", "low", "close", "volume"]].copy()

    df["datetime"] = pd.to_datetime(df["datetime"]).dt.tz_localize(None)
    df["datetime"] = df["datetime"].astype("int64")
    df["timestamp"] = df["datetime"]
    for col in ("open", "high", "low", "close", "volume"):
        df[col] = pd.to_numeric(df[col], errors="coerce")
    df = df.dropna(subset=["open", "high", "low", "close"]).reset_index(drop=True)
    return df

def _normalize(
    raw: pd.DataFrame,
    date_col: str,
    open_col: str,
    high_col: str,
    low_col: str,
    close_col: str,
    volume_col: str,
) -> pd.DataFrame:
    """Rename and type-cast columns; convert datetime to int64 nanoseconds."""
    df = raw.rename(columns={
        date_col:   "datetime",
        open_col:   "open",
        high_col:   "high",
        low_col:    "low",
        close_col:  "close",
        volume_col: "volume",
    })[["datetime", "open", "high", "low", "close", "volume"]].copy()

    # Parse datetime → nanosecond int64 (compatible with tafunc.time_to_datetime)
    df["datetime"] = pd.to_datetime(df["datetime"]).astype("int64")
    df["timestamp"] = df["datetime"]  # LLM engine cache key uses row["timestamp"]

    for col in ("open", "high", "low", "close", "volume"):
        df[col] = pd.to_numeric(df[col], errors="coerce")

    df = df.dropna(subset=["open", "high", "low", "close"]).reset_index(drop=True)
    return df


# ---------------------------------------------------------------------------
# Technical indicator calculation (mirrors backtester._calculate_technical_indicators)
# ---------------------------------------------------------------------------

def _calculate_indicators(df: pd.DataFrame) -> pd.DataFrame:
    """Compute MA10/MA30/MA60, RSI14, ATR14, MACD(12,26,9) using the `ta` library."""
    close = df["close"]
    high  = df["high"]
    low   = df["low"]

    # Moving averages
    df["ma10"] = SMAIndicator(close, window=10).sma_indicator()
    df["ma30"] = SMAIndicator(close, window=30).sma_indicator()
    df["ma60"] = SMAIndicator(close, window=60).sma_indicator()

    # RSI(14)
    df["rsi"] = RSIIndicator(close, window=14).rsi()

    # ATR(14)
    df["atr"] = AverageTrueRange(high=high, low=low, close=close, window=14).average_true_range()

    # MACD(12, 26, 9)  — diff / dea / bar match TqSDK naming
    macd_obj = MACD(close, window_fast=12, window_slow=26, window_sign=9)
    df["macd"]     = macd_obj.macd()          # MACD line (diff)
    df["macd_dea"] = macd_obj.macd_signal()   # Signal line (dea)
    df["macd_bar"] = macd_obj.macd_diff()     # Histogram (bar = diff - dea)

    return df
