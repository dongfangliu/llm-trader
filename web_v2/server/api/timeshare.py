"""
分时图API
获取当日分时数据（tick级别）
"""

from fastapi import APIRouter
from datetime import datetime

from server.models.schemas import StandardResponse
from server.core.bridge import bridge

router = APIRouter()


@router.get("", response_model=StandardResponse)
async def get_timeshare():
    """
    获取分时图数据（tick序列）

    分时图显示tick级别的价格走势（无过滤）
    """
    # 获取tick序列数据（默认1000条）
    tick_data = bridge.get_tick_serial(limit=1000)

    return StandardResponse(
        code=200,
        message="success",
        data={
            "timeshare": tick_data,
            "count": len(tick_data)
        }
    )
