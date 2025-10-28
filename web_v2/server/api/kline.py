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
    获取K线数据（全量获取）

    - **period**: K线周期（1m/5m/15m/1h/4h/1d）
    - **limit**: 返回K线数量（1-10000）
    """
    data = bridge.get_kline_data(period.value, limit)

    return StandardResponse(
        code=200,
        message="success",
        data={"klines": data, "count": len(data), "period": period.value}
    )


@router.get("/incremental", response_model=StandardResponse)
async def get_kline_incremental(
    period: Period = Query(default=Period.MIN_15, description="K线周期"),
    since: str = Query(default=None, description="获取此时间戳之后的K线（格式: YYYY-MM-DD HH:MM:SS）")
):
    """
    获取增量K线数据（只返回新数据）

    用于前端增量更新，避免每次全量拉取

    - **period**: K线周期（1m/5m/15m/1h/4h/1d）
    - **since**: 时间戳，只返回此时间之后的新K线

    如果 since 为空，返回最近10根K线作为初始数据
    """
    if since:
        # 增量模式：只返回新数据
        data = bridge.get_kline_data_since(period.value, since)
    else:
        # 初始化模式：返回最近200根
        data = bridge.get_kline_data(period.value, 200)

    return StandardResponse(
        code=200,
        message="success",
        data={
            "klines": data,
            "count": len(data),
            "period": period.value,
            "is_incremental": since is not None
        }
    )
