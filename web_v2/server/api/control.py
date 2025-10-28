"""
交易控制API
"""

from fastapi import APIRouter

from server.models.schemas import StandardResponse, StrategyToggleRequest, TradingPauseRequest, ManualTradeRequest
from server.core.bridge import bridge

router = APIRouter()


@router.post("/emergency_close", response_model=StandardResponse)
async def emergency_close():
    """紧急平仓所有持仓"""
    result = bridge.emergency_close_all()
    return StandardResponse(code=200, message=result['message'], data=result)


@router.post("/strategy/toggle", response_model=StandardResponse)
async def toggle_strategy(request: StrategyToggleRequest):
    """启用/禁用策略"""
    result = bridge.toggle_strategy(request.strategy, request.enabled)
    return StandardResponse(code=200, message=result['message'], data=result)


@router.post("/trading/pause", response_model=StandardResponse)
async def pause_trading(request: TradingPauseRequest):
    """暂停/恢复交易"""
    result = bridge.pause_trading(request.paused, request.reason)
    return StandardResponse(code=200, message=result['message'], data=result)


@router.post("/manual_trade", response_model=StandardResponse)
async def manual_trade(request: ManualTradeRequest):
    """手动下单"""
    result = bridge.manual_trade(request.action, request.direction, request.volume)

    if result['status'] == 'error':
        return StandardResponse(code=400, message=result['message'], data=result)

    return StandardResponse(code=200, message=result['message'], data=result)
