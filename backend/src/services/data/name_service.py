"""Symbol display-name lookup with static in-memory mapping and on-demand refresh.

Names are refreshed manually via the admin panel (/api/admin/refresh-names).
Supported markets: A股 (akshare), 港股 (akshare East Money), 期货 (static).
US stock names are not fetched.

Persistence layer
-----------------
Names are written to / read from the ``symbol_names`` DB table so that they
survive server restarts.  Lookup order: in-memory cache → DB.
"""

import asyncio
import time
from typing import Dict, Optional

from loguru import logger

try:
    import akshare as ak
except ImportError:
    ak = None  # type: ignore


# ── Static futures mapping (code → Chinese name) ─────────────────────────────
_FUTURES_NAMES: Dict[str, str] = {
    # 上期所 SHFE
    "CU": "铜", "AL": "铝", "ZN": "锌", "PB": "铅", "NI": "镍", "SN": "锡",
    "AU": "黄金", "AG": "白银", "RB": "螺纹钢", "WR": "线材", "HC": "热卷板",
    "SS": "不锈钢", "BU": "沥青", "RU": "橡胶", "FU": "燃油", "SP": "纸浆",
    # 大商所 DCE
    "A": "豆一", "B": "豆二", "C": "玉米", "CS": "玉米淀粉", "M": "豆粕",
    "Y": "豆油", "P": "棕榈油", "J": "焦炭", "JM": "焦煤", "I": "铁矿石",
    "L": "塑料", "V": "PVC", "PP": "聚丙烯", "EB": "苯乙烯",
    "PG": "液化气", "RR": "粳米", "EG": "乙二醇", "LH": "生猪", "JD": "鸡蛋",
    # 郑商所 CZCE
    "SR": "白糖", "CF": "棉花", "OI": "菜油", "RM": "菜粕", "MA": "甲醇",
    "TA": "PTA", "ZC": "动力煤", "FG": "玻璃", "SA": "纯碱", "AP": "苹果",
    "CJ": "红枣", "PF": "短纤", "UR": "尿素", "PX": "对二甲苯", "SH": "烧碱",
    "SM": "锰硅", "SF": "硅铁", "WH": "强麦", "PM": "普麦", "RI": "早籼稻",
    "LR": "晚籼稻", "JR": "粳稻", "RS": "油菜籽",
    # 中金所 CFFEX
    "IF": "沪深300", "IH": "上证50", "IC": "中证500", "IM": "中证1000",
    "T": "10年国债", "TF": "5年国债", "TL": "30年国债", "TS": "2年国债",
    # 上期能源 INE
    "SC": "原油", "NR": "20号胶", "LU": "低硫燃油", "BC": "国际铜",
    # 广州期货 GFEX
    "SI": "工业硅", "LC": "碳酸锂",
}

# ── Static name stores: market → {symbol: name} ───────────────────────────────
_names: Dict[str, Dict[str, str]] = {"a": {}, "hk": {}, "us": {}}
_refresh_ts: Dict[str, float] = {"a": 0.0, "hk": 0.0, "us": 0.0}
_refresh_locks: Dict[str, asyncio.Lock] = {}

_DAILY_INTERVAL = 86400  # seconds between automatic refreshes


def _lock(market: str) -> asyncio.Lock:
    if market not in _refresh_locks:
        _refresh_locks[market] = asyncio.Lock()
    return _refresh_locks[market]


# ── Public API ────────────────────────────────────────────────────────────────

async def save_symbol_name(symbol: str, market: str, name: str) -> None:
    """Persist a single symbol→name mapping to DB (upsert).

    Safe to call fire-and-forget; failures are logged and swallowed.
    """
    if not name:
        return
    try:
        from src.database.db import async_session, engine, SymbolName
        from datetime import datetime as _dt

        dialect = engine.dialect.name
        async with async_session() as db:
            if dialect == "postgresql":
                from sqlalchemy.dialects.postgresql import insert as _pg_insert
                stmt = (
                    _pg_insert(SymbolName)
                    .values(symbol=symbol, market=market, name=name, updated_at=_dt.utcnow())
                    .on_conflict_do_update(
                        index_elements=["symbol", "market"],
                        set_={"name": name, "updated_at": _dt.utcnow()},
                    )
                )
            else:
                from sqlalchemy.dialects.sqlite import insert as _sqlite_insert
                stmt = (
                    _sqlite_insert(SymbolName)
                    .values(symbol=symbol, market=market, name=name, updated_at=_dt.utcnow())
                    .on_conflict_do_update(
                        index_elements=["symbol", "market"],
                        set_={"name": name, "updated_at": _dt.utcnow()},
                    )
                )
            await db.execute(stmt)
            await db.commit()
    except Exception as e:
        logger.debug("save_symbol_name failed for {}/{}: {}", symbol, market, e)


async def _db_lookup(symbol: str, market: str) -> str:
    """Look up a symbol name from the DB.  Returns '' on any failure."""
    try:
        from sqlalchemy import select as _select
        from src.database.db import async_session, SymbolName

        async with async_session() as db:
            row = await db.get(SymbolName, (symbol, market))
            if row and row.name:
                return row.name
    except Exception as e:
        logger.debug("_db_lookup failed for {}/{}: {}", symbol, market, e)
    return ""


async def get_symbol_name(symbol: str, market: str) -> str:
    """Return display name for *symbol*; empty string on any failure.

    Lookup order: in-memory cache → DB.
    US stocks always return ''.
    """
    try:
        if market == "futures":
            base = "".join(c for c in symbol if c.isalpha()).upper()
            return _FUTURES_NAMES.get(base, "")

        elif market == "a":
            store = _names["a"]
            name = store.get(symbol, "") or store.get(symbol.zfill(6), "") or store.get(symbol.lstrip("0"), "")
            if not name:
                name = await _db_lookup(symbol, market)
                if name:
                    store[symbol] = name  # warm up memory for next call
            return name

        elif market == "hk":
            store = _names["hk"]
            name = store.get(symbol, "") or store.get(symbol.zfill(5), "")
            if not name:
                name = await _db_lookup(symbol, market)
                if name:
                    store[symbol] = name
            return name

        elif market == "us":
            return ""

    except Exception as e:
        logger.debug("Name lookup failed for {}/{}: {}", symbol, market, e)
    return ""


async def preload_names() -> None:
    """No-op: auto-preload is disabled. Use admin panel to refresh manually."""
    pass


async def refresh_names(market: Optional[str] = None) -> Dict[str, int]:
    """Refresh name mappings on demand.  Pass *market* = 'a'/'hk' or None for both.

    Returns a dict of {market: count} with the number of entries loaded.
    US names are not fetched; futures names are static.
    """
    markets = [market] if market else ["a", "hk"]
    results: Dict[str, int] = {}
    for m in markets:
        if m == "us":
            results[m] = 0
            continue
        results[m] = await _refresh_market(m)
    return results


# ── Per-market refresh ────────────────────────────────────────────────────────

# Store last error per market for diagnostics
_last_error: Dict[str, str] = {}


async def _refresh_market(market: str) -> int:
    """Fetch and store names for *market*; returns count of loaded entries."""
    _last_error.pop(market, None)  # Clear previous error
    async with _lock(market):
        try:
            if market == "a":
                data = await _fetch_a_names()
            elif market == "hk":
                data = await _fetch_hk_names()
            else:
                return 0

            if data:
                _names[market] = data
                _refresh_ts[market] = time.time()
                logger.info("Name mapping refreshed for {}: {} entries", market, len(data))
                # Persist to DB in background so names survive restarts
                asyncio.create_task(_bulk_persist_names(market, data))
            else:
                logger.warning("Name mapping fetch returned empty for {}, keeping stale data", market)
                # Check if we have an error stored from the fetch function
                if market in _last_error:
                    raise ValueError(_last_error[market])
        except Exception as e:
            logger.warning("Failed to refresh {} names: {}", market, e)
            _last_error[market] = str(e)
            raise

        return len(_names.get(market, {}))


def get_last_error(market: str) -> Optional[str]:
    """Get the last error message for a market, if any."""
    return _last_error.get(market)


async def _bulk_persist_names(market: str, data: Dict[str, str]) -> None:
    """Write a full {symbol: name} mapping for *market* to the DB (upsert, chunked)."""
    try:
        from src.database.db import async_session, engine, SymbolName
        from datetime import datetime as _dt

        now = _dt.utcnow()
        rows = [{"symbol": sym, "market": market, "name": name, "updated_at": now}
                for sym, name in data.items() if name]
        if not rows:
            return

        dialect = engine.dialect.name
        _CHUNK = 500
        async with async_session() as db:
            for i in range(0, len(rows), _CHUNK):
                chunk = rows[i: i + _CHUNK]
                if dialect == "postgresql":
                    from sqlalchemy.dialects.postgresql import insert as _pg_insert
                    stmt = (
                        _pg_insert(SymbolName)
                        .values(chunk)
                        .on_conflict_do_update(
                            index_elements=["symbol", "market"],
                            set_={"name": _pg_insert(SymbolName).excluded.name,
                                  "updated_at": _pg_insert(SymbolName).excluded.updated_at},
                        )
                    )
                else:
                    from sqlalchemy.dialects.sqlite import insert as _sqlite_insert
                    stmt = (
                        _sqlite_insert(SymbolName)
                        .values(chunk)
                        .on_conflict_do_update(
                            index_elements=["symbol", "market"],
                            set_={"name": _sqlite_insert(SymbolName).excluded.name,
                                  "updated_at": _sqlite_insert(SymbolName).excluded.updated_at},
                        )
                    )
                await db.execute(stmt)
            await db.commit()
        logger.info("Persisted {} name entries for {} to DB", len(rows), market)
    except Exception as e:
        logger.warning("Failed to bulk-persist names for {}: {}", market, e)

async def _fetch_a_names() -> Dict[str, str]:
    if ak is None:
        return {}
    loop = asyncio.get_event_loop()
    df = await asyncio.wait_for(
        loop.run_in_executor(None, ak.stock_info_a_code_name),
        timeout=20,
    )
    return dict(zip(df["code"].astype(str), df["name"]))


async def _fetch_hk_names() -> Dict[str, str]:
    """Fetch HK stock names.

    Source priority (stops at first success):
    1. HKEX official listed-securities Excel — hosted in Hong Kong, always reachable from HK servers
    2. East Money (stock_hk_spot_em) — reachable from mainland / international servers
    3. Sina Finance (stock_hk_spot) — last-resort mainland fallback
    """
    loop = asyncio.get_event_loop()

    # ── 1. HKEX codes + Tencent Chinese names ─────────────────────────────────
    result = await asyncio.wait_for(
        loop.run_in_executor(None, _fetch_hk_names_hkex),
        timeout=120,
    )
    if result:
        logger.info("HK names fetched via HKEX+Tencent: {} entries", len(result))
        return result

    if ak is None:
        _last_error["hk"] = "akshare not installed and HKEX fetch failed"
        return {}

    def _extract(df) -> Dict[str, str]:
        code_col = next((c for c in df.columns if "代码" in c or c.lower() in ("code", "symbol")), None)
        name_col = next((c for c in df.columns if "名称" in c or "name" in c.lower()), None)
        if code_col and name_col:
            return {str(code).zfill(5): str(name) for code, name in zip(df[code_col], df[name_col])}
        return {}

    # ── 2. East Money ─────────────────────────────────────────────────────────
    try:
        df = await asyncio.wait_for(
            loop.run_in_executor(None, ak.stock_hk_spot_em),
            timeout=40,
        )
        result = _extract(df)
        if result:
            logger.info("HK names fetched via East Money: {} entries", len(result))
            return result
    except Exception as e:
        logger.warning("HK name fetch via East Money failed: {}", e)

    # ── 3. Sina Finance ───────────────────────────────────────────────────────
    try:
        df = await asyncio.wait_for(
            loop.run_in_executor(None, ak.stock_hk_spot),
            timeout=30,
        )
        result = _extract(df)
        if result:
            logger.info("HK names fetched via Sina (fallback): {} entries", len(result))
            return result
    except Exception as e:
        logger.warning("HK name fetch via Sina failed: {}", e)
        _last_error["hk"] = str(e)

    return {}


def _fetch_hk_names_hkex() -> Dict[str, str]:
    """Get HK stock codes from HKEX Excel, then fetch Chinese names from Tencent API.

    Step 1: Download HKEX listed-securities Excel to get all equity stock codes.
    Step 2: Batch query Tencent Finance API (qt.gtimg.cn) for Chinese names.
    Returns {} on any failure so the caller can try the next source.
    """
    try:
        import io
        import requests
        import pandas as pd

        # ── Step 1: Get stock codes from HKEX Excel ───────────────────────────
        url = "https://www.hkex.com.hk/eng/services/trading/securities/securitieslists/ListOfSecurities.xlsx"
        headers = {
            "User-Agent": "Mozilla/5.0 (compatible; stock-name-fetcher/1.0)",
            "Referer": "https://www.hkex.com.hk/",
        }
        resp = requests.get(url, headers=headers, timeout=30)
        resp.raise_for_status()

        df = pd.read_excel(io.BytesIO(resp.content), header=2)

        code_col = next(
            (c for c in df.columns if str(c).strip() in ("Stock Code", "Code") or "Stock Code" in str(c)),
            None,
        )
        cat_col = next(
            (c for c in df.columns if str(c).strip() == "Category"),
            None,
        )
        if code_col is None:
            logger.warning("HKEX Excel: could not identify code column. Columns: {}", list(df.columns))
            return {}

        # Filter to equity securities only (skip bonds, ETFs, warrants, etc.)
        codes: list = []
        for i, row in df.iterrows():
            try:
                code_str = str(int(float(str(row[code_col])))).zfill(5)
                category = str(row[cat_col]).strip() if cat_col else ""
                if code_str and category.lower() in ("equity", ""):
                    codes.append(code_str)
            except (ValueError, TypeError):
                continue

        if not codes:
            logger.warning("HKEX Excel: no equity codes extracted")
            return {}

        logger.info("HKEX Excel: {} equity codes found, fetching Chinese names via Tencent...", len(codes))

        # ── Step 2: Batch fetch Chinese names from Tencent API ────────────────
        result: Dict[str, str] = {}
        _BATCH = 50  # Tencent handles ~50 symbols per request comfortably
        for i in range(0, len(codes), _BATCH):
            batch = codes[i: i + _BATCH]
            query = ",".join(f"r_hk{c}" for c in batch)
            try:
                r = requests.get(
                    f"http://qt.gtimg.cn/q={query}",
                    timeout=15,
                )
                text = r.content.decode("gbk", errors="replace")
                for line in text.strip().split("\n"):
                    parts = line.split("~")
                    if len(parts) > 2:
                        name = parts[1].strip()
                        # Extract code from line like: v_r_hk00700="100~腾讯控股~..."
                        raw_key = line.split("=")[0].strip().strip('"')
                        if "hk" in raw_key:
                            code_from_line = raw_key.split("hk")[-1].zfill(5)
                            if name and name not in ("nan", "NaN", ""):
                                result[code_from_line] = name
            except Exception as e:
                logger.debug("Tencent batch failed for chunk {}: {}", i, e)
                continue

        return result

    except Exception as e:
        logger.warning("HKEX+Tencent fetch failed: {}", e)
        return {}
