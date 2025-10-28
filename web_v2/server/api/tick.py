"""
Tick数据API
"""

from fastapi import APIRouter, Query
from typing import Optional

from server.models.schemas import StandardResponse
from server.core.bridge import bridge

router = APIRouter()


@router.get("", response_model=StandardResponse)
async def get_tick_data(
    limit: int = Query(default=100, ge=1, le=1000, description="返回数量")
):
    """
    获取最新tick数据（实时行情）

    - **limit**: 返回tick数量（1-1000）
    """
    data = bridge.get_tick_data(limit)

    return StandardResponse(
        code=200,
        message="success",
        data={"ticks": data, "count": len(data)}
    )


@router.get("/latest", response_model=StandardResponse)
async def get_latest_tick():
    """
    获取最新的一条tick数据
    """
    data = bridge.get_tick_data(limit=1)

    if data:
        return StandardResponse(
            code=200,
            message="success",
            data=data[0]
        )
    else:
        return StandardResponse(
            code=404,
            message="No tick data available",
            data=None
        )
