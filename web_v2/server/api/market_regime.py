"""
市场态势与策略API
Market Regime & Strategy Performance API

✅ V2重构：实时计算，WebSocket推送，无数据库依赖
"""

from fastapi import APIRouter, HTTPException, Query, Body
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
from loguru import logger

from server.models.schemas import StandardResponse, MarketRegimeInfo
from server.core.bridge import bridge

router = APIRouter()


@router.get("/current", summary="获取当前市场状态")
async def get_current_regime() -> StandardResponse:
    """
    获取当前市场状态（趋势/震荡/突破/异常）
    
    ✅ V2改进：
    - 从内存实时计算（无数据库）
    - 纯量化算法（无LLM）
    - <100ms响应
    
    Returns:
        - regime: 市场状态类型
        - confidence: 置信度
        - features: 市场特征（ADX, 波动率等）
        - active_strategy: 激活的策略
        - duration: 状态持续时间
    """
    try:
        regime_service = bridge.get_regime_service()
        
        # 从内存获取当前状态（无I/O）
        current_regime = regime_service.current_regime
        
        if not current_regime:
            # 尚未计算过，立即计算一次
            logger.info("首次请求，立即计算市场状态")
            current_regime = await regime_service.calculate_now(force=True, reason="first_request")
        
        return StandardResponse(data=current_regime)
    
    except Exception as e:
        logger.error(f"获取市场状态失败: {e}")
        import traceback
        logger.debug(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/recalculate", summary="强制重新计算市场状态")
async def force_recalculate(force: bool = Query(False, description="是否忽略冷却期")) -> StandardResponse:
    """
    用户手动触发重算
    
    Args:
        force: 是否忽略冷却期强制计算
    
    Returns:
        最新的市场状态
    """
    try:
        regime_service = bridge.get_regime_service()
        
        logger.info(f"🔄 手动触发市场状态重算 (force={force})")
        new_regime = await regime_service.calculate_now(force=force, reason="manual_trigger")
        
        return StandardResponse(
            data=new_regime,
            message="市场状态已刷新" if force or new_regime else "处于冷却期，未重新计算"
        )
    
    except Exception as e:
        logger.error(f"强制重算失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/config", summary="获取市场态势配置")
async def get_regime_config() -> StandardResponse:
    """
    获取当前配置参数
    
    Returns:
        配置对象
    """
    try:
        regime_service = bridge.get_regime_service()
        config = regime_service.get_config()
        
        return StandardResponse(data=config)
    
    except Exception as e:
        logger.error(f"获取配置失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/config", summary="更新市场态势配置")
async def update_regime_config(config_update: Dict[str, Any] = Body(...)) -> StandardResponse:
    """
    更新配置参数（支持部分更新）
    
    Args:
        config_update: 要更新的配置项
    
    Returns:
        更新后的完整配置
    """
    try:
        regime_service = bridge.get_regime_service()
        
        logger.info(f"📝 更新市场态势配置: {config_update}")
        new_config = regime_service.update_config(config_update)
        
        return StandardResponse(
            data=new_config,
            message="配置已更新"
        )
    
    except Exception as e:
        logger.error(f"更新配置失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# 移除旧的数据库依赖代码，保持API简洁


@router.get("/history", summary="获取市场状态历史")
async def get_regime_history(
    hours: int = Query(24, description="查询小时数", ge=1, le=168)
) -> StandardResponse:
    """
    获取市场状态切换历史
    
    Args:
        hours: 查询小时数（1-168）
    
    Returns:
        - history: 状态切换时间线
        - statistics: 各状态占比
    """
    try:
        regime_service = bridge.get_regime_service()
        
        # V2: 从服务的内存历史记录获取（而非数据库）
        history_records = regime_service.get_history(hours=hours)
        
        # 计算统计信息
        stats = _calculate_regime_stats(history_records)
        
        return StandardResponse(data={
            "history": history_records,
            "statistics": stats,
            "total_switches": max(0, len(history_records) - 1)
        })
    
    except Exception as e:
        logger.error(f"获取市场状态历史失败: {e}")
        import traceback
        logger.debug(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/trend-alignment", summary="获取多周期趋势一致性")
async def get_trend_alignment() -> StandardResponse:
    """
    获取多周期趋势一致性矩阵
    
    Returns:
        - alignment: 各周期趋势方向和强度
        - consistency: 一致性百分比
    """
    try:
        # V2: 从TqSDK缓存实时计算多周期趋势
        periods = ['1m', '5m', '15m', '1h', '4h']
        alignment = {}
        
        for period in periods:
            klines = bridge.get_kline_data(period=period, limit=100)
            if not klines or len(klines) < 20:
                continue
            
            # 计算该周期的趋势
            closes = [k['close'] for k in klines]
            ma20 = sum(closes[-20:]) / 20
            ma5 = sum(closes[-5:]) / 5
            current_price = closes[-1]
            
            # 判断趋势方向
            if current_price > ma5 > ma20:
                direction = "up"
            elif current_price < ma5 < ma20:
                direction = "down"
            else:
                direction = "sideways"
            
            # 计算ADX（简化版）
            adx = _calculate_simple_adx_from_klines(klines[-20:])
            
            # MA偏离度
            ma_deviation = ((current_price - ma20) / ma20) * 100 if ma20 > 0 else 0
            
            alignment[period] = {
                "period": period,
                "trend": direction,
                "adx": round(adx, 1),
                "ma_deviation": round(ma_deviation, 2)
            }
        
        # 计算一致性
        if alignment:
            directions = [v["trend"] for v in alignment.values()]
            most_common = max(set(directions), key=directions.count)
            consistency = (directions.count(most_common) / len(directions)) * 100
        else:
            consistency = 0
        
        return StandardResponse(data={
            "timeframes": list(alignment.values()),
            "consistency": round(consistency, 1),
            "is_aligned": consistency >= 75
        })
    
    except Exception as e:
        logger.error(f"获取趋势一致性失败: {e}")
        import traceback
        logger.debug(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))


def _get_active_strategy(regime: str) -> str:
    """根据市场状态返回激活的策略"""
    strategy_map = {
        "trend": "trend_following",
        "ranging": "mean_reversion",
        "breakout": "breakout",
        "abnormal": "conservative"
    }
    return strategy_map.get(regime, "unknown")


def _calculate_duration(timestamp: str) -> int:
    """计算状态持续时间（分钟）"""
    try:
        start = datetime.fromisoformat(timestamp)
        duration = (datetime.now() - start).total_seconds() / 60
        return int(duration)
    except:
        return 0


def _calculate_regime_stats(history: List[Dict]) -> Dict[str, float]:
    """计算各市场状态占比"""
    if not history:
        return {}
    
    total_duration = 0
    regime_durations = {}
    
    for i in range(len(history) - 1):
        current = datetime.fromisoformat(history[i]["timestamp"])
        next_time = datetime.fromisoformat(history[i + 1]["timestamp"])
        duration = (next_time - current).total_seconds()
        
        regime = history[i]["regime"]
        regime_durations[regime] = regime_durations.get(regime, 0) + duration
        total_duration += duration
    
    # 添加最后一个状态的持续时间（到现在）
    if history:
        last = datetime.fromisoformat(history[-1]["timestamp"])
        duration = (datetime.now() - last).total_seconds()
        regime = history[-1]["regime"]
        regime_durations[regime] = regime_durations.get(regime, 0) + duration
        total_duration += duration
    
    # 计算百分比
    if total_duration == 0:
        return {}
    
    return {
        regime: round(duration / total_duration * 100, 1)
        for regime, duration in regime_durations.items()
    }


def _calculate_simple_adx_from_klines(klines: List[Dict], period: int = 14) -> float:
    """从K线数据计算简化版ADX"""
    if len(klines) < period:
        return 20.0  # 返回中性值
    
    import numpy as np
    
    closes = np.array([k['close'] for k in klines])
    
    # 计算方向运动
    price_changes = np.diff(closes)
    
    # 上涨和下跌的平均幅度
    up_moves = np.maximum(price_changes, 0)
    down_moves = np.abs(np.minimum(price_changes, 0))
    
    avg_up = np.mean(up_moves[-period:])
    avg_down = np.mean(down_moves[-period:])
    
    # 简化的ADX：基于方向运动的比例
    if avg_up + avg_down == 0:
        return 20.0
    
    directional_ratio = abs(avg_up - avg_down) / (avg_up + avg_down)
    adx = directional_ratio * 50  # 归一化到0-50范围
    
    return float(adx)
