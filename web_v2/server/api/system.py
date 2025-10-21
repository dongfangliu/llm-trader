"""
系统监控API
"""

from fastapi import APIRouter

from server.models.schemas import StandardResponse
from server.core.bridge import bridge

router = APIRouter()


@router.get("/status", response_model=StandardResponse)
async def get_system_status():
    """获取系统状态"""
    data = bridge.get_system_status()
    return StandardResponse(code=200, message="success", data=data)
