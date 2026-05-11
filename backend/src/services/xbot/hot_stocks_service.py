"""Fetch hot/trending stocks from retail investor attention rankings."""

import re
from typing import Dict, List, Optional, Tuple

from loguru import logger


def normalize_candidate_symbol(symbol: str, market: Optional[str] = None) -> Tuple[Optional[str], Optional[str]]:
    """Normalize external symbols for the legacy xbot/model-review workflow.

    A shares are stored as plain 6-digit codes. HK shares are stored as 5-digit
    codes. Examples: SZ000066 -> 000066, SH601991 -> 601991,
    HK00700/700 -> 00700.
    """
    raw = str(symbol or "").strip().upper().replace(".", "").replace("-", "")
    requested_market = (market or "").strip().lower()
    if not raw:
        return None, None

    if requested_market == "a":
        if raw.startswith(("SZ", "SH", "BJ")):
            raw = raw[2:]
        return ("a", raw) if re.fullmatch(r"\d{6}", raw) else (None, None)

    if requested_market == "hk":
        if raw.startswith("HK"):
            raw = raw[2:]
        return ("hk", raw.zfill(5)) if re.fullmatch(r"\d{1,5}", raw) else (None, None)

    if raw.startswith(("SZ", "SH", "BJ")):
        code = raw[2:]
        return ("a", code) if re.fullmatch(r"\d{6}", code) else (None, None)
    if raw.startswith("HK"):
        code = raw[2:]
        return ("hk", code.zfill(5)) if re.fullmatch(r"\d{1,5}", code) else (None, None)
    if re.fullmatch(r"\d{6}", raw) and raw.startswith(("0", "3", "4", "6", "8")):
        return "a", raw
    if re.fullmatch(r"\d{1,5}", raw):
        return "hk", raw.zfill(5)
    return None, None


def _new_diagnostics(market: str, enabled: bool = True) -> Dict:
    return {
        "market": market,
        "enabled": enabled,
        "requested": 0,
        "returned": 0,
        "filtered": 0,
        "filter_reasons": {},
        "error": None,
    }


def _bump_filter(diag: Dict, reason: str) -> None:
    diag["filtered"] += 1
    diag["filter_reasons"][reason] = diag["filter_reasons"].get(reason, 0) + 1


async def get_hot_stocks(
    count: int = 5,
    min_price: float = 5.0,
    with_diagnostics: bool = False,
):
    """
    Fetch top N hot A-share stocks from EastMoney retail investor attention ranking.
    Returns list of {symbol, market, name, hot_rank}; optionally returns diagnostics.
    """
    import asyncio
    import akshare as ak

    diag = _new_diagnostics("a")

    try:
        df = await asyncio.get_event_loop().run_in_executor(None, ak.stock_hot_rank_em)
    except Exception as e:
        logger.error(f"Failed to fetch A-share hot stocks from EastMoney: {e}")
        diag["error"] = str(e)
        return ([], diag) if with_diagnostics else []

    if df is None or df.empty:
        logger.warning("A-share hot stocks data is empty")
        return ([], diag) if with_diagnostics else []

    diag["requested"] = len(df)

    name_col = _find_col(df, ["股票名称", "名称", "name"])
    code_col = _find_col(df, ["股票代码", "代码", "code"])
    price_col = _find_col(df, ["最新价", "现价", "price"])

    if not name_col or not code_col:
        logger.error(f"Unexpected hot rank columns: {list(df.columns)}")
        diag["error"] = f"Unexpected columns: {list(df.columns)}"
        return ([], diag) if with_diagnostics else []

    results = []
    rank = 0
    for _, row in df.iterrows():
        if len(results) >= count:
            break

        rank += 1
        name = str(row.get(name_col, "")).strip()
        market, code = normalize_candidate_symbol(str(row.get(code_col, "")).strip(), "a")
        if market != "a" or not code:
            _bump_filter(diag, "invalid_symbol")
            continue

        if "ST" in name.upper() or "*" in name or "退" in name:
            _bump_filter(diag, "st_or_delisted")
            continue

        if price_col and min_price > 0:
            try:
                price = float(row.get(price_col, 0) or 0)
                if 0 < price < min_price:
                    _bump_filter(diag, "below_min_price")
                    continue
            except (ValueError, TypeError):
                pass

        results.append({"symbol": code, "market": market, "name": name, "hot_rank": rank})

    diag["returned"] = len(results)
    logger.info(f"A-share hot stocks fetched: {len(results)}")
    return (results, diag) if with_diagnostics else results


async def get_hk_hot_stocks(
    count: int = 5,
    min_price: float = 1.0,
    with_diagnostics: bool = False,
):
    """
    Fetch top N hot HK stocks from EastMoney HK attention ranking.
    Returns list of {symbol, market, name, hot_rank}; optionally returns diagnostics.
    """
    import asyncio
    import akshare as ak

    diag = _new_diagnostics("hk")

    try:
        df = await asyncio.get_event_loop().run_in_executor(None, ak.stock_hk_hot_rank_em)
    except Exception as e:
        logger.error(f"Failed to fetch HK hot stocks from EastMoney: {e}")
        diag["error"] = str(e)
        return ([], diag) if with_diagnostics else []

    if df is None or df.empty:
        logger.warning("HK hot stocks data is empty")
        return ([], diag) if with_diagnostics else []

    diag["requested"] = len(df)

    name_col = _find_col(df, ["股票名称", "名称", "name"])
    code_col = _find_col(df, ["股票代码", "代码", "code"])
    price_col = _find_col(df, ["最新价", "现价", "price"])

    if not name_col or not code_col:
        logger.error(f"Unexpected HK hot rank columns: {list(df.columns)}")
        diag["error"] = f"Unexpected columns: {list(df.columns)}"
        return ([], diag) if with_diagnostics else []

    results = []
    rank = 0
    for _, row in df.iterrows():
        if len(results) >= count:
            break

        rank += 1
        name = str(row.get(name_col, "")).strip()
        market, code = normalize_candidate_symbol(str(row.get(code_col, "")).strip(), "hk")
        if market != "hk" or not code:
            _bump_filter(diag, "invalid_symbol")
            continue

        if "ST" in name.upper() or "退" in name:
            _bump_filter(diag, "st_or_delisted")
            continue

        if price_col and min_price > 0:
            try:
                price = float(row.get(price_col, 0) or 0)
                if 0 < price < min_price:
                    _bump_filter(diag, "below_min_price")
                    continue
            except (ValueError, TypeError):
                pass

        results.append({"symbol": code, "market": market, "name": name, "hot_rank": rank})

    diag["returned"] = len(results)
    logger.info(f"HK hot stocks fetched: {len(results)}")
    return (results, diag) if with_diagnostics else results


def _find_col(df, candidates: List[str]):
    for col in candidates:
        if col in df.columns:
            return col
    return None


def filter_hot_candidates(
    rows: List[Dict],
    market: str,
    min_price: float,
    count: int,
) -> Tuple[List[Dict], Dict]:
    """Filter a list of pre-fetched hot stocks (e.g. from the admin browser).

    Each input row must include ``symbol`` and may include ``name``,
    ``hot_rank`` and ``latest_price``. Rows missing ``latest_price`` skip the
    price filter (we still keep them — partial enrichment beats nothing).
    Returns the filtered slice plus a diagnostics dict matching the shape used
    by :func:`get_hot_stocks`.
    """
    diag = _new_diagnostics(market)
    diag["requested"] = len(rows)

    results: List[Dict] = []
    for idx, row in enumerate(rows):
        if len(results) >= count:
            break

        raw_symbol = str(row.get("symbol", "")).strip()
        normalized_market, code = normalize_candidate_symbol(raw_symbol, market)
        if normalized_market != market or not code:
            _bump_filter(diag, "invalid_symbol")
            continue

        name = str(row.get("name", "") or "").strip()
        if name:
            upper = name.upper()
            if "ST" in upper or "*" in name or "退" in name:
                _bump_filter(diag, "st_or_delisted")
                continue

        price_raw = row.get("latest_price")
        if price_raw is not None and min_price > 0:
            try:
                price = float(price_raw)
                if 0 < price < min_price:
                    _bump_filter(diag, "below_min_price")
                    continue
            except (ValueError, TypeError):
                pass

        hot_rank = row.get("hot_rank")
        try:
            hot_rank = int(hot_rank) if hot_rank is not None else idx + 1
        except (ValueError, TypeError):
            hot_rank = idx + 1

        results.append(
            {
                "symbol": code,
                "market": market,
                "name": name or code,
                "hot_rank": hot_rank,
            }
        )

    diag["returned"] = len(results)
    logger.info(f"{market} hot stocks (client-fed) filtered: {len(results)}")
    return results, diag
