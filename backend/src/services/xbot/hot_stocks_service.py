"""Fetch hot/trending stocks from retail investor attention rankings."""

from typing import List, Dict
from loguru import logger


async def get_hot_stocks(count: int = 5) -> List[Dict]:
    """
    Fetch top N hot stocks from EastMoney retail investor attention ranking.
    Returns list of {symbol, market, name, hot_rank}.
    Filters out ST stocks, delisted stocks, and price < 5 CNY.
    """
    import akshare as ak
    import asyncio

    try:
        df = await asyncio.get_event_loop().run_in_executor(
            None, ak.stock_hot_rank_em
        )
    except Exception as e:
        logger.error(f"Failed to fetch hot stocks from EastMoney: {e}")
        return []

    if df is None or df.empty:
        logger.warning("Hot stocks data is empty")
        return []

    results = []
    rank = 0

    # EastMoney hot rank columns vary; normalize common variants
    name_col = _find_col(df, ["股票名称", "名称", "name"])
    code_col = _find_col(df, ["股票代码", "代码", "code"])
    price_col = _find_col(df, ["最新价", "现价", "price"])

    if not name_col or not code_col:
        logger.error(f"Unexpected hot rank columns: {list(df.columns)}")
        return []

    for _, row in df.iterrows():
        if len(results) >= count:
            break

        rank += 1
        name = str(row.get(name_col, "")).strip()
        code = str(row.get(code_col, "")).strip()

        # Skip ST / delisted stocks
        if "ST" in name.upper() or "*" in name or "退" in name:
            continue

        # Skip low-price stocks if price info available
        if price_col:
            try:
                price = float(row.get(price_col, 0) or 0)
                if 0 < price < 5:
                    continue
            except (ValueError, TypeError):
                pass

        # Determine market: 6xxxxx → Shanghai A, 0/3xxxxx → Shenzhen A
        if code.startswith("6"):
            market = "a"
        elif code.startswith(("0", "3")):
            market = "a"
        else:
            # Ignore other markets (US, HK) from this list
            continue

        results.append({
            "symbol": code,
            "market": market,
            "name": name,
            "hot_rank": rank,
        })

    logger.info(f"Hot stocks fetched: {len(results)} stocks")
    return results


def _find_col(df, candidates: List[str]):
    for col in candidates:
        if col in df.columns:
            return col
    return None
