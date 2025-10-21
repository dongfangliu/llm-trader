"""
账户管理API
"""

from fastapi import APIRouter
from server.models.schemas import StandardResponse
from server.core.bridge import bridge

router = APIRouter()


@router.get("", response_model=StandardResponse)
async def get_account():
    """获取账户信息"""
    data = bridge.get_account_info()
    return StandardResponse(code=200, message="success", data=data)


@router.get("/positions", response_model=StandardResponse)
async def get_positions():
    """获取持仓列表"""
    data = bridge.get_positions()
    return StandardResponse(code=200, message="success", data={"positions": data})
