"""Market data router."""

import asyncio
import logging
import re
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession

from src.database.new_db import get_db
from src.models.market import SymbolName
from src.services.data.data_service import fetch_market_data

router = APIRouter(prefix="/api/market", tags=["market"])

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Tier 2 代理：透传东方财富 K 线接口，作为浏览器直连失败的备用路径
# 必须在 /{market}/{symbol} 之前定义，否则会被动态路由拦截
# ---------------------------------------------------------------------------

# 合法 secid 格式: 市场代码.股票代码（仅允许数字和字母）
_SECID_RE = re.compile(r"^\d{1,3}\.\w{1,10}$")
# 合法的 klt 值白名单
_VALID_KLT = {1, 5, 15, 30, 60, 101, 102, 103}
# 合法日期格式
_DATE_RE = re.compile(r"^\d{8}$")


@router.get("/proxy/kline")
async def proxy_kline(
    secid: str = Query(..., description="东方财富 secid，如 1.600519"),
    klt: int = Query(101, description="K线周期 101=日 60=60分 30=30分 15=15分 5=5分 1=1分"),
    beg: str = Query("20200101", description="开始日期 YYYYMMDD"),
    end: str = Query("20991231", description="结束日期 YYYYMMDD"),
):
    """透传东方财富 K 线接口，作为浏览器直连失败的 Tier 2 备用路径。"""
    import httpx

    # 严格校验输入，防止代理被滥用
    if not _SECID_RE.match(secid):
        raise HTTPException(status_code=400, detail="secid 格式无效")
    if klt not in _VALID_KLT:
        raise HTTPException(status_code=400, detail="klt 值无效")
    if not _DATE_RE.match(beg) or not _DATE_RE.match(end):
        raise HTTPException(status_code=400, detail="日期格式无效，应为 YYYYMMDD")

    url = "https://push2his.eastmoney.com/api/qt/stock/kline/get"
    params = {
        "fields1": "f1,f2,f3,f4,f5,f6",
        "fields2": "f51,f52,f53,f54,f55,f56",
        "klt": klt,
        "fqt": 1,
        "secid": secid,
        "beg": beg,
        "end": end,
    }

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()
            kline_count = len((data.get("data") or {}).get("klines") or [])
            logger.info("[Tier2代理] secid=%s klt=%s 返回 %d 根K线", secid, klt, kline_count)
            return data
    except httpx.TimeoutException:
        logger.warning("[Tier2代理] 请求超时 secid=%s", secid)
        raise HTTPException(status_code=504, detail="东方财富接口超时")
    except httpx.HTTPStatusError as e:
        logger.warning("[Tier2代理] 上游返回 %d secid=%s", e.response.status_code, secid)
        raise HTTPException(status_code=502, detail=f"上游返回 {e.response.status_code}")
    except Exception as e:
        logger.error("[Tier2代理] 未知错误 secid=%s: %s", secid, e)
        raise HTTPException(status_code=502, detail="代理请求失败")


@router.get("/{market}/{symbol}")
async def get_market_data(
    market: str,
    symbol: str,
    period: str = "daily",
    history_days: int = 90,
):
    """Get raw OHLCV market data (without LLM analysis)."""
    try:
        df = await fetch_market_data(
            symbol=symbol,
            market=market,
            period=period,
            start_date=None,
            end_date=None,
        )

        # Convert to dict (last 100 rows max)
        data = df.tail(100).to_dict(orient="records")

        # Convert nanosecond timestamps to ISO strings
        for row in data:
            if "datetime" in row:
                try:
                    row["datetime"] = datetime.fromtimestamp(row["datetime"] / 1e9).isoformat()
                except Exception:
                    pass

        return {
            "symbol": symbol,
            "market": market,
            "period": period,
            "count": len(data),
            "data": data,
        }

    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------------------
# Public symbols list (used by search/autocomplete dropdowns)
# ---------------------------------------------------------------------------

@router.get("")
async def get_symbols(
    market: str = Query(..., description="Market: a, hk, us, futures"),
    q: Optional[str] = Query(None, description="Search query (symbol or name prefix)"),
    db: AsyncSession = Depends(get_db),
):
    """Return symbol names for a given market, optionally filtered by search query.

    US stocks return an empty list (users type codes directly).
    """
    if market == "us":
        return {"items": [], "count": 0}
    if market not in ("a", "hk", "futures"):
        raise HTTPException(
            status_code=400, detail="market must be one of: a, hk, us, futures"
        )
    stmt = select(SymbolName).where(SymbolName.market == market)
    if q:
        q_upper = q.upper()
        stmt = stmt.where(
            or_(
                SymbolName.symbol.ilike(f"%{q}%"),
                SymbolName.name.ilike(f"%{q}%"),
            )
        ).limit(20)
    else:
        stmt = stmt.limit(10000)
    result = await db.execute(stmt)
    rows = result.scalars().all()
    items = [{"symbol": r.symbol, "market": r.market, "name": r.name} for r in rows]
    return {"items": items, "count": len(items)}
