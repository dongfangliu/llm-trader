"""
市场态势与策略API
Market Regime & Strategy Performance API
"""

from fastapi import APIRouter, HTTPException, Query
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
    
    Returns:
        - regime: 市场状态类型
        - confidence: 置信度
        - features: 市场特征（ADX, 波动率等）
        - active_strategy: 激活的策略
        - duration: 状态持续时间
    """
    try:
        db = bridge.get_db()
        
        # 获取最新市场状态数据
        query = """
            SELECT regime, confidence, adx, atr, volatility, 
                   bollinger_width, trend_alignment, timestamp
            FROM market_regime_history 
            ORDER BY timestamp DESC 
            LIMIT 1
        """
        result = db.execute_query(query)
        
        if not result:
            # Mock data for development
            data = {
                "regime": "trend",
                "confidence": 0.87,
                "features": {
                    "adx": 32.5,
                    "volatility": 0.023,
                    "bollinger_width": 0.045,
                    "trend_alignment": 1.0,
                    "atr": 15.8
                },
                "active_strategy": "trend_following",
                "duration_minutes": 125,
                "timestamp": datetime.now().isoformat()
            }
        else:
            row = result[0]
            data = {
                "regime": row[0],
                "confidence": row[1],
                "features": {
                    "adx": row[2],
                    "atr": row[3],
                    "volatility": row[4],
                    "bollinger_width": row[5],
                    "trend_alignment": row[6]
                },
                "active_strategy": _get_active_strategy(row[0]),
                "duration_minutes": _calculate_duration(row[7]),
                "timestamp": row[7]
            }
        
        return StandardResponse(data=data)
    
    except Exception as e:
        logger.error(f"获取市场状态失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


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
        db = bridge.get_db()
        
        start_time = datetime.now() - timedelta(hours=hours)
        query = """
            SELECT regime, confidence, timestamp, switch_reason
            FROM market_regime_history 
            WHERE timestamp >= ?
            ORDER BY timestamp ASC
        """
        results = db.execute_query(query, (start_time.isoformat(),))
        
        if not results:
            # Mock data
            history = [
                {
                    "regime": "ranging",
                    "confidence": 0.75,
                    "timestamp": (datetime.now() - timedelta(hours=5)).isoformat(),
                    "switch_reason": "ADX下降至20以下"
                },
                {
                    "regime": "trend",
                    "confidence": 0.87,
                    "timestamp": (datetime.now() - timedelta(hours=2)).isoformat(),
                    "switch_reason": "ADX突破25，多周期趋势一致"
                }
            ]
        else:
            history = [
                {
                    "regime": row[0],
                    "confidence": row[1],
                    "timestamp": row[2],
                    "switch_reason": row[3]
                }
                for row in results
            ]
        
        # 计算统计信息
        stats = _calculate_regime_stats(history)
        
        return StandardResponse(data={
            "history": history,
            "statistics": stats,
            "total_switches": len(history) - 1
        })
    
    except Exception as e:
        logger.error(f"获取市场状态历史失败: {e}")
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
        db = bridge.get_db()
        
        # 获取各周期趋势数据
        query = """
            SELECT period, trend_direction, adx, ma_deviation
            FROM trend_alignment
            WHERE timestamp = (SELECT MAX(timestamp) FROM trend_alignment)
        """
        results = db.execute_query(query)
        
        if not results:
            # Mock data
            alignment = {
                "1d": {"direction": "up", "adx": 28.3, "ma_deviation": 3.2},
                "4h": {"direction": "up", "adx": 30.1, "ma_deviation": 2.8},
                "1h": {"direction": "up", "adx": 32.5, "ma_deviation": 1.5},
                "15m": {"direction": "up", "adx": 25.8, "ma_deviation": 0.8}
            }
        else:
            alignment = {
                row[0]: {
                    "direction": row[1],
                    "adx": row[2],
                    "ma_deviation": row[3]
                }
                for row in results
            }
        
        # 计算一致性
        directions = [v["direction"] for v in alignment.values()]
        consistency = sum(1 for d in directions if d == directions[0]) / len(directions)
        
        return StandardResponse(data={
            "alignment": alignment,
            "consistency": consistency,
            "is_aligned": consistency >= 0.75
        })
    
    except Exception as e:
        logger.error(f"获取趋势一致性失败: {e}")
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
    return {
        regime: round(duration / total_duration * 100, 1)
        for regime, duration in regime_durations.items()
    }
