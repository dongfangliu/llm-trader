"""
配置管理API
支持获取、更新系统配置
"""

from fastapi import APIRouter, HTTPException
from typing import Dict, Any

from server.models.schemas import StandardResponse, ConfigUpdateRequest, ConfigResponse
from server.services.config_service import config_service
from server.core.bridge import bridge

router = APIRouter()


@router.get("/config", response_model=StandardResponse)
async def get_config():
    """
    获取所有配置（敏感信息自动掩码）

    Returns:
        StandardResponse包含完整配置
    """
    try:
        config = config_service.get_config()
        return StandardResponse(
            code=200,
            message="success",
            data=config
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取配置失败: {str(e)}")


@router.put("/config", response_model=StandardResponse)
async def update_config(request: ConfigUpdateRequest):
    """
    更新配置

    Args:
        request: 配置更新请求，包含trading_params和/或api_keys

    Returns:
        StandardResponse包含更新后的配置
    """
    try:
        # 转换为字典
        updates = {}

        if request.trading_params is not None:
            trading_params_dict = {}
            tp = request.trading_params

            if tp.trading is not None:
                trading_params_dict['trading'] = {
                    k: v for k, v in tp.trading.dict().items() if v is not None
                }
            if tp.risk is not None:
                trading_params_dict['risk'] = {
                    k: v for k, v in tp.risk.dict().items() if v is not None
                }
            if tp.decision is not None:
                trading_params_dict['decision'] = {
                    k: v for k, v in tp.decision.dict().items() if v is not None
                }
            if tp.llm is not None:
                trading_params_dict['llm'] = {
                    k: v for k, v in tp.llm.dict().items() if v is not None
                }
            if tp.data is not None:
                trading_params_dict['data'] = {
                    k: v for k, v in tp.data.dict().items() if v is not None
                }
            if tp.system is not None:
                trading_params_dict['system'] = {
                    k: v for k, v in tp.system.dict().items() if v is not None
                }
            if tp.backtest is not None:
                trading_params_dict['backtest'] = {
                    k: v for k, v in tp.backtest.dict().items() if v is not None
                }

            if trading_params_dict:
                updates['trading_params'] = trading_params_dict

        if request.api_keys is not None:
            api_keys_dict = {}
            ak = request.api_keys

            if ak.provider is not None:
                api_keys_dict['provider'] = ak.provider

            if ak.providers is not None:
                api_keys_dict['providers'] = {}
                for provider_name, provider_config in ak.providers.items():
                    api_keys_dict['providers'][provider_name] = {
                        k: v for k, v in provider_config.dict().items() if v is not None
                    }

            if ak.tqsdk is not None:
                api_keys_dict['tqsdk'] = {
                    k: v for k, v in ak.tqsdk.dict().items() if v is not None
                }

            if api_keys_dict:
                updates['api_keys'] = api_keys_dict

        # 更新配置
        if not updates:
            raise ValueError("没有提供任何更新内容")

        result = config_service.update_config(updates)

        return StandardResponse(
            code=200,
            message="配置更新成功",
            data=result
        )

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"更新配置失败: {str(e)}")


@router.post("/config/reload", response_model=StandardResponse)
async def reload_config():
    """
    重新加载配置（热加载）

    注意：部分配置需要重启系统才能生效

    Returns:
        StandardResponse包含reload结果
    """
    try:
        # TODO: 实现配置热加载逻辑
        # 目前只是返回提示信息，实际的热加载需要在bridge层实现

        return StandardResponse(
            code=200,
            message="配置重载请求已提交。注意：部分配置需要重启系统才能生效。",
            data={
                "reload_time": "now",
                "note": "trading、risk等核心配置需要重启main_v2.py才能生效，LLM model等部分配置可以热加载"
            }
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"重载配置失败: {str(e)}")


@router.get("/config/schema", response_model=StandardResponse)
async def get_config_schema():
    """
    获取配置项的元数据（字段说明、类型、范围等）
    用于前端动态生成表单

    Returns:
        StandardResponse包含配置schema
    """
    try:
        schema = config_service.get_config_schema()
        return StandardResponse(
            code=200,
            message="success",
            data=schema
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取配置schema失败: {str(e)}")


@router.get("/data-source", response_model=StandardResponse)
async def get_data_source():
    """
    获取当前数据源状态

    返回数据源类型（模拟/真实）和详细信息

    Returns:
        StandardResponse包含数据源信息：
        - use_sim: 配置文件中的设置
        - use_mock: 当前运行模式
        - source: 实际数据源类型
        - description: 数据源描述
    """
    try:
        data_source_info = bridge.get_data_source_info()
        return StandardResponse(
            code=200,
            message="success",
            data=data_source_info
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取数据源信息失败: {str(e)}")
