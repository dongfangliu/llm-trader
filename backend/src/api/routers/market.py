"""Market data router."""

import asyncio
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession

from src.database.new_db import get_db
from src.models.market import SymbolName
from src.services.data.data_service import fetch_market_data

router = APIRouter(prefix="/api/market", tags=["market"])


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
    db: AsyncSession = Depends(get_db),
):
    """Return symbol names for a given market.

    US stocks return an empty list (users type codes directly).
    """
    if market == "us":
        return {"items": [], "count": 0}
    if market not in ("a", "hk", "futures"):
        raise HTTPException(
            status_code=400, detail="market must be one of: a, hk, us, futures"
        )
    stmt = select(SymbolName).where(SymbolName.market == market).limit(10000)
    result = await db.execute(stmt)
    rows = result.scalars().all()
    items = [{"symbol": r.symbol, "market": r.market, "name": r.name} for r in rows]
    return {"items": items, "count": len(items)}
