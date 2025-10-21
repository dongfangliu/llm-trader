"""
交易信号API
"""

from fastapi import APIRouter, Query
from typing import Optional

from server.models.schemas import StandardResponse
from server.core.bridge import bridge

router = APIRouter()


@router.get("", response_model=StandardResponse)
async def get_signals(
    limit: int = Query(default=10, ge=1, le=100),
    strategy: Optional[str] = Query(default=None)
):
    """获取交易信号"""
    data = bridge.get_signals(limit, strategy)
    return StandardResponse(code=200, message="success", data={"signals": data})


@router.get("/market_regime", response_model=StandardResponse)
async def get_market_regime():
    """获取市场状态"""
    data = bridge.get_market_regime()
    return StandardResponse(code=200, message="success", data=data)


@router.get("/order_flow", response_model=StandardResponse)
async def get_order_flow():
    """获取订单流数据"""
    data = bridge.get_order_flow()
    return StandardResponse(code=200, message="success", data=data)
