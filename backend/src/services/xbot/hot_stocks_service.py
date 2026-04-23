"""Fetch hot/trending stocks from retail investor attention rankings."""

from typing import List, Dict
from loguru import logger


async def get_hot_stocks(count: int = 5, min_price: float = 5.0) -> List[Dict]:
    """
    Fetch top N hot A-share stocks from EastMoney retail investor attention ranking.
    Returns list of {symbol, market, name, hot_rank}.
    """
    import akshare as ak
    import asyncio

    try:
        df = await asyncio.get_event_loop().run_in_executor(
            None, ak.stock_hot_rank_em
        )
    except Exception as e:
        logger.error(f"Failed to fetch A-share hot stocks from EastMoney: {e}")
        return []

    if df is None or df.empty:
        logger.warning("A-share hot stocks data is empty")
        return []

    name_col = _find_col(df, ["股票名称", "名称", "name"])
    code_col = _find_col(df, ["股票代码", "代码", "code"])
    price_col = _find_col(df, ["最新价", "现价", "price"])

    if not name_col or not code_col:
        logger.error(f"Unexpected hot rank columns: {list(df.columns)}")
        return []

    results = []
    rank = 0
    for _, row in df.iterrows():
        if len(results) >= count:
            break

        rank += 1
        name = str(row.get(name_col, "")).strip()
        code = str(row.get(code_col, "")).strip()

        if "ST" in name.upper() or "*" in name or "退" in name:
            continue

        if price_col and min_price > 0:
            try:
                price = float(row.get(price_col, 0) or 0)
                if 0 < price < min_price:
                    continue
            except (ValueError, TypeError):
                pass

        if code.startswith(("6", "0", "3")):
            market = "a"
        else:
            continue

        results.append({"symbol": code, "market": market, "name": name, "hot_rank": rank})

    logger.info(f"A-share hot stocks fetched: {len(results)}")
    return results


async def get_hk_hot_stocks(count: int = 5, min_price: float = 1.0) -> List[Dict]:
    """
    Fetch top N hot HK stocks from EastMoney HK attention ranking.
    Returns list of {symbol, market, name, hot_rank}.
    """
    import akshare as ak
    import asyncio

    try:
        df = await asyncio.get_event_loop().run_in_executor(
            None, ak.stock_hk_hot_rank_em
        )
    except Exception as e:
        logger.error(f"Failed to fetch HK hot stocks from EastMoney: {e}")
        return []

    if df is None or df.empty:
        logger.warning("HK hot stocks data is empty")
        return []

    name_col = _find_col(df, ["股票名称", "名称", "name"])
    code_col = _find_col(df, ["股票代码", "代码", "code"])
    price_col = _find_col(df, ["最新价", "现价", "price"])

    if not name_col or not code_col:
        logger.error(f"Unexpected HK hot rank columns: {list(df.columns)}")
        return []

    results = []
    rank = 0
    for _, row in df.iterrows():
        if len(results) >= count:
            break

        rank += 1
        name = str(row.get(name_col, "")).strip()
        code = str(row.get(code_col, "")).strip()

        if "ST" in name.upper() or "退" in name:
            continue

        if price_col and min_price > 0:
            try:
                price = float(row.get(price_col, 0) or 0)
                if 0 < price < min_price:
                    continue
            except (ValueError, TypeError):
                pass

        results.append({"symbol": code, "market": "hk", "name": name, "hot_rank": rank})

    logger.info(f"HK hot stocks fetched: {len(results)}")
    return results


def _find_col(df, candidates: List[str]):
    for col in candidates:
        if col in df.columns:
            return col
    return None
