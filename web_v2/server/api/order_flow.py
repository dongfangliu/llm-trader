"""
订单流分析API
Order Flow Analysis API
基于实时Tick数据计算，WebSocket推送
"""

from fastapi import APIRouter, HTTPException, Query, Body
from datetime import datetime
from typing import Dict
from loguru import logger

from server.models.schemas import StandardResponse
from server.core.bridge import bridge

router = APIRouter()


@router.get("/vpin/current", summary="获取当前VPIN值")
async def get_current_vpin() -> StandardResponse:
    """
    获取当前VPIN（Volume-Synchronized Probability of Informed Trading）值
    从实时推送服务获取数据
    
    Returns:
        - vpin: 当前VPIN值
        - level: 毒性水平（low/medium/high）
        - buy_volume: 买入成交量
        - sell_volume: 卖出成交量
        - imbalance: 买卖不平衡度
        - timestamp: 时间戳
    """
    try:
        push_service = bridge.get_push_service()
        if not push_service:
            return StandardResponse(data={
                "vpin": 0.0,
                "level": "unknown",
                "buy_volume": 0,
                "sell_volume": 0,
                "imbalance": 0.0,
                "timestamp": datetime.now().isoformat(),
                "description": "推送服务未启动"
            })
        
        vpin_data = push_service.get_order_flow_vpin()
        return StandardResponse(data=vpin_data)
    
    except Exception as e:
        logger.error(f"获取VPIN失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# VPIN历史数据已弃用 - 现在使用实时WebSocket推送


@router.get("/orderbook/snapshot", summary="获取订单簿快照")
async def get_orderbook_snapshot() -> StandardResponse:
    """
    获取当前订单簿快照（5档盘口）
    从实时推送服务获取数据
    
    Returns:
        - bids: 买盘5档
        - asks: 卖盘5档
        - bid_depth: 买盘深度
        - ask_depth: 卖盘深度
        - imbalance: 买卖失衡度
        - depth_ratio: 深度比率
    """
    try:
        push_service = bridge.get_push_service()
        if not push_service:
            return StandardResponse(data={
                "bids": [],
                "asks": [],
                "bid_depth": 0,
                "ask_depth": 0,
                "imbalance": 0.0,
                "depth_ratio": 0.0,
                "timestamp": datetime.now().isoformat()
            })
        
        orderbook_data = push_service.get_order_flow_orderbook()
        return StandardResponse(data=orderbook_data)
    
    except Exception as e:
        logger.error(f"获取订单簿快照失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/orderbook/dynamics", summary="获取订单簿动态")
async def get_orderbook_dynamics() -> StandardResponse:
    """
    获取订单簿动态变化
    从实时推送服务获取数据
    
    Returns:
        - bid_depth_change_rate: 买盘深度变化率
        - ask_depth_change_rate: 卖盘深度变化率
        - imbalance_acceleration: 失衡加速度
        - interpretation: 解读
    """
    try:
        push_service = bridge.get_push_service()
        if not push_service:
            return StandardResponse(data={
                "bid_depth_change_rate": 0.0,
                "ask_depth_change_rate": 0.0,
                "imbalance_acceleration": 0.0,
                "interpretation": "推送服务未启动"
            })
        
        dynamics_data = push_service.get_order_flow_dynamics()
        return StandardResponse(data=dynamics_data)
    
    except Exception as e:
        logger.error(f"获取订单簿动态失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/config", summary="获取订单流配置")
async def get_order_flow_config() -> StandardResponse:
    """
    获取当前订单流配置参数
    
    Returns:
        - vpin: VPIN配置
        - large_order: 大单检测配置
        - orderbook: 订单簿配置
    """
    try:
        push_service = bridge.get_push_service()
        if not push_service or not push_service.order_flow_service:
            return StandardResponse(data={
                "vpin": {"bucket_size": 50},
                "large_order": {"lookback": 100, "threshold_multiplier": 2.5},
                "orderbook": {"max_history": 1000}
            })
        
        service = push_service.order_flow_service
        
        config = {
            "vpin": {
                "bucket_size": service.vpin_calculator.bucket_size
            },
            "large_order": {
                "lookback": service.large_order_detector.lookback,
                "threshold_multiplier": service.large_order_detector.threshold_multiplier
            },
            "orderbook": {
                "max_history": service.orderbook_tracker.depth_history.maxlen
            }
        }
        
        return StandardResponse(data=config)
    
    except Exception as e:
        logger.error(f"获取订单流配置失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/config", summary="更新订单流配置")
async def update_order_flow_config(config: Dict = Body(...)) -> StandardResponse:
    """
    更新订单流配置参数（立即生效并保存到配置文件）
    
    Args:
        config: {
            "vpin": {"bucket_size": 50},
            "large_order": {"lookback": 100, "threshold_multiplier": 2.5},
            "orderbook": {"max_history": 1000}
        }
    
    Returns:
        更新结果
    """
    try:
        push_service = bridge.get_push_service()
        if not push_service or not push_service.order_flow_service:
            raise HTTPException(status_code=503, detail="订单流服务未启动")
        
        service = push_service.order_flow_service
        
        # 验证并更新配置
        if "vpin" in config:
            bucket_size = config["vpin"].get("bucket_size")
            if bucket_size is not None:
                if 10 <= bucket_size <= 500:
                    service.vpin_calculator.bucket_size = int(bucket_size)
                    logger.info(f"VPIN bucket_size 更新为: {bucket_size}")
                else:
                    raise HTTPException(status_code=400, detail=f"bucket_size 必须在 10-500 范围内，当前值: {bucket_size}")
        
        if "large_order" in config:
            from collections import deque
            
            lookback = config["large_order"].get("lookback")
            threshold = config["large_order"].get("threshold_multiplier")
            
            if lookback is not None:
                if 10 <= lookback <= 500:
                    service.large_order_detector.lookback = int(lookback)
                    service.large_order_detector.recent_trades = deque(
                        service.large_order_detector.recent_trades,
                        maxlen=int(lookback)
                    )
                    logger.info(f"大单检测 lookback 更新为: {lookback}")
                else:
                    raise HTTPException(status_code=400, detail=f"lookback 必须在 10-500 范围内，当前值: {lookback}")
            
            if threshold is not None:
                if 1.5 <= threshold <= 10:
                    service.large_order_detector.threshold_multiplier = float(threshold)
                    logger.info(f"大单检测 threshold_multiplier 更新为: {threshold}")
                else:
                    raise HTTPException(status_code=400, detail=f"threshold_multiplier 必须在 1.5-10 范围内，当前值: {threshold}")
        
        if "orderbook" in config:
            from collections import deque
            
            max_history = config["orderbook"].get("max_history")
            if max_history is not None:
                if 100 <= max_history <= 5000:
                    # 重建deque
                    service.orderbook_tracker.depth_history = deque(
                        service.orderbook_tracker.depth_history,
                        maxlen=int(max_history)
                    )
                    logger.info(f"订单簿 max_history 更新为: {max_history}")
                else:
                    raise HTTPException(status_code=400, detail=f"max_history 必须在 100-5000 范围内，当前值: {max_history}")
        
        # 保存到配置文件
        try:
            from pathlib import Path
            import yaml
            
            config_path = Path(__file__).parent.parent.parent / 'config' / 'trading_params.yaml'
            with open(config_path, 'r', encoding='utf-8') as f:
                params = yaml.safe_load(f)
            
            # 更新订单流配置
            params['order_flow'] = config
            
            with open(config_path, 'w', encoding='utf-8') as f:
                yaml.safe_dump(params, f, allow_unicode=True, default_flow_style=False)
            
            logger.info(f"✅ 订单流配置已保存到文件: {config_path}")
        except Exception as e:
            logger.error(f"保存配置文件失败: {e}")
            # 不抛出异常，因为内存配置已生效
        
        return StandardResponse(
            data={
                "success": True,
                "message": "配置已更新并保存到文件（立即生效）",
                "current_config": {
                    "vpin": {"bucket_size": service.vpin_calculator.bucket_size},
                    "large_order": {
                        "lookback": service.large_order_detector.lookback,
                        "threshold_multiplier": service.large_order_detector.threshold_multiplier
                    },
                    "orderbook": {"max_history": service.orderbook_tracker.depth_history.maxlen}
                }
            }
        )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"更新订单流配置失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/large-orders", summary="获取大单追踪")
async def get_large_orders(
    count: int = Query(20, description="返回数量", ge=1, le=100)
) -> StandardResponse:
    """
    获取大单追踪数据
    从实时推送服务获取数据
    
    Args:
        count: 返回数量（1-100）
    
    Returns:
        - orders: 大单列表
        - count: 总数量
    """
    try:
        push_service = bridge.get_push_service()
        if not push_service:
            return StandardResponse(data={
                "orders": [],
                "count": 0
            })
        
        large_orders_data = push_service.get_order_flow_large_orders(count)
        return StandardResponse(data=large_orders_data)
    
    except Exception as e:
        logger.error(f"获取大单追踪失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))



