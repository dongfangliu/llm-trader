"""
订单流分析API
Order Flow Analysis API
"""

from fastapi import APIRouter, HTTPException, Query
from typing import List, Dict, Any
from datetime import datetime, timedelta
from loguru import logger

from server.models.schemas import StandardResponse
from server.core.bridge import bridge

router = APIRouter()


@router.get("/vpin/current", summary="获取当前VPIN值")
async def get_current_vpin() -> StandardResponse:
    """
    获取当前VPIN（Volume-Synchronized Probability of Informed Trading）值
    
    Returns:
        - vpin: 当前VPIN值
        - level: 毒性水平（low/medium/high）
        - trend: 趋势（rising/falling/stable）
        - timestamp: 时间戳
    """
    try:
        db = bridge.get_db()
        
        # 获取最新VPIN数据
        query = """
            SELECT vpin, timestamp
            FROM vpin_history
            ORDER BY timestamp DESC
            LIMIT 1
        """
        result = db.execute_query(query)
        
        if not result:
            # Mock data
            vpin_value = 0.35
            timestamp = datetime.now().isoformat()
        else:
            vpin_value = result[0][0]
            timestamp = result[0][1]
        
        # 判断毒性水平
        if vpin_value < 0.3:
            level = "low"
        elif vpin_value < 0.5:
            level = "medium"
        else:
            level = "high"
        
        # 获取趋势（对比5分钟前）
        trend = await _get_vpin_trend(db, vpin_value)
        
        return StandardResponse(data={
            "vpin": round(vpin_value, 3),
            "level": level,
            "trend": trend,
            "timestamp": timestamp,
            "interpretation": _interpret_vpin(vpin_value, level)
        })
    
    except Exception as e:
        logger.error(f"获取VPIN失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/vpin/history", summary="获取VPIN历史")
async def get_vpin_history(
    minutes: int = Query(60, description="查询分钟数", ge=10, le=1440)
) -> StandardResponse:
    """
    获取VPIN历史数据
    
    Args:
        minutes: 查询分钟数（10-1440）
    
    Returns:
        - history: VPIN时间序列
        - statistics: 统计信息
    """
    try:
        db = bridge.get_db()
        
        start_time = datetime.now() - timedelta(minutes=minutes)
        query = """
            SELECT vpin, buy_volume, sell_volume, imbalance, timestamp
            FROM vpin_history
            WHERE timestamp >= ?
            ORDER BY timestamp ASC
        """
        results = db.execute_query(query, (start_time.isoformat(),))
        
        if not results:
            # Mock data
            history = [
                {
                    "vpin": 0.30 + (i % 20) * 0.01,
                    "buy_volume": 5000 + i * 100,
                    "sell_volume": 4800 + i * 95,
                    "imbalance": 0.02,
                    "timestamp": (datetime.now() - timedelta(minutes=minutes-i)).isoformat()
                }
                for i in range(0, minutes, 5)
            ]
        else:
            history = [
                {
                    "vpin": row[0],
                    "buy_volume": row[1],
                    "sell_volume": row[2],
                    "imbalance": row[3],
                    "timestamp": row[4]
                }
                for row in results
            ]
        
        # 计算统计信息
        vpin_values = [h["vpin"] for h in history]
        statistics = {
            "avg": round(sum(vpin_values) / len(vpin_values), 3) if vpin_values else 0,
            "max": round(max(vpin_values), 3) if vpin_values else 0,
            "min": round(min(vpin_values), 3) if vpin_values else 0,
            "current": vpin_values[-1] if vpin_values else 0
        }
        
        return StandardResponse(data={
            "history": history,
            "statistics": statistics
        })
    
    except Exception as e:
        logger.error(f"获取VPIN历史失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/orderbook/snapshot", summary="获取订单簿快照")
async def get_orderbook_snapshot() -> StandardResponse:
    """
    获取当前订单簿快照（5档盘口）
    
    Returns:
        - bids: 买盘5档
        - asks: 卖盘5档
        - imbalance: 买卖失衡度
        - depth_ratio: 深度比率
    """
    try:
        db = bridge.get_db()
        
        # 获取最新订单簿数据
        query = """
            SELECT book_data, bid_depth, ask_depth, imbalance, timestamp
            FROM order_book_snapshots
            ORDER BY timestamp DESC
            LIMIT 1
        """
        result = db.execute_query(query)
        
        if not result:
            # Mock data
            bids = [
                {"price": 1835.0, "volume": 120},
                {"price": 1834.0, "volume": 95},
                {"price": 1833.0, "volume": 88},
                {"price": 1832.0, "volume": 102},
                {"price": 1831.0, "volume": 76}
            ]
            asks = [
                {"price": 1836.0, "volume": 85},
                {"price": 1837.0, "volume": 92},
                {"price": 1838.0, "volume": 78},
                {"price": 1839.0, "volume": 110},
                {"price": 1840.0, "volume": 95}
            ]
            bid_depth = sum(b["volume"] for b in bids)
            ask_depth = sum(a["volume"] for a in asks)
            imbalance = 0.15
            timestamp = datetime.now().isoformat()
        else:
            import json
            book_data = json.loads(result[0][0])
            bids = book_data.get("bids", [])
            asks = book_data.get("asks", [])
            bid_depth = result[0][1]
            ask_depth = result[0][2]
            imbalance = result[0][3]
            timestamp = result[0][4]
        
        # 计算深度比率
        depth_ratio = bid_depth / ask_depth if ask_depth > 0 else 0
        
        # 判断盘口状态
        status = _interpret_orderbook(imbalance, depth_ratio)
        
        return StandardResponse(data={
            "bids": bids,
            "asks": asks,
            "bid_depth": bid_depth,
            "ask_depth": ask_depth,
            "imbalance": round(imbalance, 3),
            "depth_ratio": round(depth_ratio, 2),
            "status": status,
            "timestamp": timestamp
        })
    
    except Exception as e:
        logger.error(f"获取订单簿快照失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/orderbook/dynamics", summary="获取订单簿动态")
async def get_orderbook_dynamics(
    minutes: int = Query(30, description="查询分钟数", ge=5, le=240)
) -> StandardResponse:
    """
    获取订单簿动态变化
    
    Args:
        minutes: 查询分钟数
    
    Returns:
        - imbalance_history: 失衡度历史
        - depth_changes: 深度变化率
        - pressure_zones: 压力区域识别
    """
    try:
        db = bridge.get_db()
        
        start_time = datetime.now() - timedelta(minutes=minutes)
        query = """
            SELECT imbalance, imbalance_acceleration, 
                   bid_depth_change_rate, ask_depth_change_rate, timestamp
            FROM order_book_snapshots
            WHERE timestamp >= ?
            ORDER BY timestamp ASC
        """
        results = db.execute_query(query, (start_time.isoformat(),))
        
        if not results:
            # Mock data
            imbalance_history = [
                {
                    "timestamp": (datetime.now() - timedelta(minutes=minutes-i)).isoformat(),
                    "imbalance": 0.1 + (i % 10) * 0.02,
                    "acceleration": 0.001 * (i % 3 - 1)
                }
                for i in range(0, minutes, 2)
            ]
            depth_changes = [
                {
                    "timestamp": (datetime.now() - timedelta(minutes=minutes-i)).isoformat(),
                    "bid_change_rate": 0.05 * (i % 5 - 2),
                    "ask_change_rate": 0.04 * (i % 4 - 1)
                }
                for i in range(0, minutes, 2)
            ]
        else:
            imbalance_history = [
                {
                    "timestamp": row[4],
                    "imbalance": row[0],
                    "acceleration": row[1]
                }
                for row in results
            ]
            depth_changes = [
                {
                    "timestamp": row[4],
                    "bid_change_rate": row[2],
                    "ask_change_rate": row[3]
                }
                for row in results
            ]
        
        # 识别压力区域
        pressure_zones = _identify_pressure_zones(imbalance_history)
        
        return StandardResponse(data={
            "imbalance_history": imbalance_history,
            "depth_changes": depth_changes,
            "pressure_zones": pressure_zones
        })
    
    except Exception as e:
        logger.error(f"获取订单簿动态失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/large-orders", summary="获取大单追踪")
async def get_large_orders(
    minutes: int = Query(60, description="查询分钟数", ge=10, le=1440)
) -> StandardResponse:
    """
    获取大单追踪数据
    
    Args:
        minutes: 查询分钟数
    
    Returns:
        - orders: 大单列表
        - statistics: 统计信息
    """
    try:
        db = bridge.get_db()
        
        start_time = datetime.now() - timedelta(minutes=minutes)
        query = """
            SELECT side, volume, price, price_impact, toxicity_score, timestamp
            FROM large_orders
            WHERE timestamp >= ?
            ORDER BY timestamp DESC
        """
        results = db.execute_query(query, (start_time.isoformat(),))
        
        if not results:
            # Mock data
            orders = [
                {
                    "side": "buy" if i % 2 == 0 else "sell",
                    "volume": 50 + i * 5,
                    "price": 1835.0 + i * 0.5,
                    "price_impact": 0.02 * (i % 3 + 1),
                    "toxicity_score": 0.6 + (i % 4) * 0.1,
                    "timestamp": (datetime.now() - timedelta(minutes=i*5)).isoformat()
                }
                for i in range(10)
            ]
        else:
            orders = [
                {
                    "side": row[0],
                    "volume": row[1],
                    "price": row[2],
                    "price_impact": row[3],
                    "toxicity_score": row[4],
                    "timestamp": row[5]
                }
                for row in results
            ]
        
        # 统计信息
        buy_orders = [o for o in orders if o["side"] == "buy"]
        sell_orders = [o for o in orders if o["side"] == "sell"]
        
        statistics = {
            "total_count": len(orders),
            "buy_count": len(buy_orders),
            "sell_count": len(sell_orders),
            "buy_volume": sum(o["volume"] for o in buy_orders),
            "sell_volume": sum(o["volume"] for o in sell_orders),
            "avg_toxicity": round(sum(o["toxicity_score"] for o in orders) / len(orders), 2) if orders else 0,
            "net_pressure": "buy" if len(buy_orders) > len(sell_orders) else "sell"
        }
        
        return StandardResponse(data={
            "orders": orders,
            "statistics": statistics
        })
    
    except Exception as e:
        logger.error(f"获取大单追踪失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


async def _get_vpin_trend(db, current_vpin: float) -> str:
    """判断VPIN趋势"""
    query = """
        SELECT vpin
        FROM vpin_history
        WHERE timestamp <= datetime('now', '-5 minutes')
        ORDER BY timestamp DESC
        LIMIT 1
    """
    result = db.execute_query(query)
    
    if not result:
        return "stable"
    
    previous_vpin = result[0][0]
    diff = current_vpin - previous_vpin
    
    if diff > 0.05:
        return "rising"
    elif diff < -0.05:
        return "falling"
    else:
        return "stable"


def _interpret_vpin(vpin: float, level: str) -> str:
    """解释VPIN值"""
    interpretations = {
        "low": "订单流毒性较低，知情交易者较少，市场相对平静",
        "medium": "订单流毒性中等，有一定知情交易活动，需要关注",
        "high": "订单流毒性较高，知情交易者活跃，市场可能面临变化"
    }
    return interpretations.get(level, "未知")


def _interpret_orderbook(imbalance: float, depth_ratio: float) -> str:
    """解释订单簿状态"""
    if imbalance > 0.2 and depth_ratio > 1.2:
        return "strong_buy_pressure"
    elif imbalance < -0.2 and depth_ratio < 0.8:
        return "strong_sell_pressure"
    elif abs(imbalance) < 0.1 and 0.9 < depth_ratio < 1.1:
        return "balanced"
    else:
        return "moderate_pressure"


def _identify_pressure_zones(imbalance_history: List[Dict]) -> List[Dict]:
    """识别压力区域"""
    zones = []
    
    if not imbalance_history:
        return zones
    
    # 简单识别：连续3个点失衡度>0.15或<-0.15
    for i in range(len(imbalance_history) - 2):
        window = imbalance_history[i:i+3]
        avg_imbalance = sum(w["imbalance"] for w in window) / 3
        
        if avg_imbalance > 0.15:
            zones.append({
                "start_time": window[0]["timestamp"],
                "end_time": window[-1]["timestamp"],
                "type": "buy_pressure",
                "intensity": round(avg_imbalance, 2)
            })
        elif avg_imbalance < -0.15:
            zones.append({
                "start_time": window[0]["timestamp"],
                "end_time": window[-1]["timestamp"],
                "type": "sell_pressure",
                "intensity": round(abs(avg_imbalance), 2)
            })
    
    return zones
