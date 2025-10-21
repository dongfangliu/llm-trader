"""
K线数据API
"""

from fastapi import APIRouter, Query
from typing import List

from server.models.schemas import StandardResponse, KlineData, Period
from server.core.bridge import bridge

router = APIRouter()


@router.get("", response_model=StandardResponse)
async def get_kline(
    period: Period = Query(default=Period.MIN_15, description="K线周期"),
    limit: int = Query(default=500, ge=1, le=10000, description="返回数量")
):
    """
    获取K线数据
    
    - **period**: K线周期（1m/5m/15m/1h/4h/1d）
    - **limit**: 返回K线数量（1-10000）
    """
    data = bridge.get_kline_data(period.value, limit)
    
    return StandardResponse(
        code=200,
        message="success",
        data={"klines": data, "count": len(data), "period": period.value}
    )
