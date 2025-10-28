"""
策略表现API
Strategy Performance API
"""

from fastapi import APIRouter, HTTPException, Query
from typing import List, Dict, Any
from datetime import datetime, timedelta
from loguru import logger

from server.models.schemas import StandardResponse
from server.core.bridge import bridge

router = APIRouter()


@router.get("/summary", summary="获取策略表现摘要")
async def get_strategy_summary() -> StandardResponse:
    """
    获取三大策略的实时表现摘要
    
    Returns:
        - strategies: 各策略的状态、信号数、胜率、盈亏比等
    """
    try:
        db = bridge.get_db()
        
        strategies = ["trend_following", "mean_reversion", "breakout"]
        summary = {}
        
        for strategy in strategies:
            # 获取今日信号统计
            query = """
                SELECT COUNT(*) as total,
                       SUM(CASE WHEN executed = 1 THEN 1 ELSE 0 END) as executed,
                       AVG(confidence) as avg_confidence
                FROM strategy_signals
                WHERE strategy = ?
                AND DATE(timestamp) = DATE('now')
            """
            result = db.execute_query(query, (strategy,))
            
            # 获取胜率和盈亏比（需要关联trades表）
            win_rate_query = """
                SELECT 
                    COUNT(*) as total_trades,
                    SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) as winning_trades,
                    AVG(CASE WHEN pnl > 0 THEN pnl ELSE 0 END) as avg_win,
                    AVG(CASE WHEN pnl < 0 THEN ABS(pnl) ELSE 0 END) as avg_loss
                FROM trades
                WHERE strategy = ?
                AND DATE(created_at) = DATE('now')
            """
            win_result = db.execute_query(win_rate_query, (strategy,))
            
            if not result or not result[0][0]:
                # 数据库无数据时返回空结构
                summary[strategy] = {
                    "status": "standby",
                    "today_signals": 0,
                    "executed_signals": 0,
                    "win_rate": 0.0,
                    "profit_loss_ratio": 0.0,
                    "avg_confidence": 0.0,
                    "total_pnl": 0.0
                }
            else:
                row = result[0]
                win_row = win_result[0] if win_result else (0, 0, 0, 0)
                
                total_trades = win_row[0] or 0
                winning_trades = win_row[1] or 0
                avg_win = win_row[2] or 0
                avg_loss = win_row[3] or 0
                
                summary[strategy] = {
                    "status": "active" if strategy == "trend_following" else "standby",
                    "today_signals": row[0],
                    "executed_signals": row[1],
                    "win_rate": winning_trades / total_trades if total_trades > 0 else 0,
                    "profit_loss_ratio": avg_win / avg_loss if avg_loss > 0 else 0,
                    "avg_confidence": row[2] or 0,
                    "total_pnl": 0.0  # TODO: Calculate from trades
                }
        
        return StandardResponse(data={"strategies": summary})
    
    except Exception as e:
        logger.error(f"获取策略摘要失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{strategy}/signals", summary="获取策略信号列表")
async def get_strategy_signals(
    strategy: str,
    limit: int = Query(50, description="返回数量", ge=1, le=200)
) -> StandardResponse:
    """
    获取特定策略的信号列表

    Args:
        strategy: 策略名称（trend_following, mean_reversion, breakout）
        limit: 返回数量

    Returns:
        - signals: 信号列表
        - total: 总数量
    """
    try:
        db = bridge.get_db()

        # 查询信号列表
        query = """
            SELECT action, confidence, entry_price, stop_loss, take_profit,
                   reasoning, timestamp, executed, source
            FROM strategy_signals
            WHERE strategy = ?
            ORDER BY timestamp DESC
            LIMIT ?
        """
        results = db.execute_query(query, (strategy, limit))

        if not results:
            # 数据库无数据时返回空数组
            signals = []
            total = 0
        else:
            signals = [
                {
                    "action": row[0],
                    "confidence": row[1],
                    "entry_price": row[2],
                    "stop_loss": row[3],
                    "take_profit": row[4],
                    "reasoning": eval(row[5]) if row[5] and isinstance(row[5], str) else [],
                    "timestamp": row[6],
                    "executed": bool(row[7]),
                    "source": row[8] if len(row) > 8 else "quant"
                }
                for row in results
            ]
            total = len(signals)

        return StandardResponse(data={
            "signals": signals,
            "total": total
        })

    except Exception as e:
        logger.error(f"获取策略信号列表失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{strategy}/performance", summary="获取策略详细表现")
async def get_strategy_performance(
    strategy: str,
    days: int = Query(7, description="查询天数", ge=1, le=90)
) -> StandardResponse:
    """
    获取特定策略的详细表现数据
    
    Args:
        strategy: 策略名称（trend_following, mean_reversion, breakout）
        days: 查询天数
    
    Returns:
        - daily_performance: 每日表现
        - metrics: 关键指标
        - recent_signals: 最近信号列表
    """
    try:
        db = bridge.get_db()
        
        start_date = datetime.now() - timedelta(days=days)
        
        # 每日表现
        daily_query = """
            SELECT 
                DATE(timestamp) as date,
                COUNT(*) as signal_count,
                AVG(confidence) as avg_confidence,
                SUM(CASE WHEN executed = 1 THEN 1 ELSE 0 END) as executed_count
            FROM strategy_signals
            WHERE strategy = ?
            AND timestamp >= ?
            GROUP BY DATE(timestamp)
            ORDER BY date ASC
        """
        daily_results = db.execute_query(daily_query, (strategy, start_date.isoformat()))
        
        # 最近信号
        recent_query = """
            SELECT action, confidence, entry_price, stop_loss, take_profit, 
                   reasoning, timestamp, executed
            FROM strategy_signals
            WHERE strategy = ?
            ORDER BY timestamp DESC
            LIMIT 10
        """
        recent_results = db.execute_query(recent_query, (strategy,))
        
        if not daily_results:
            # 数据库无数据时返回空数组
            daily_performance = []
            recent_signals = []
        else:
            daily_performance = [
                {
                    "date": row[0],
                    "signal_count": row[1],
                    "avg_confidence": row[2],
                    "executed_count": row[3],
                    "pnl": 0.0  # TODO: Calculate
                }
                for row in daily_results
            ]
            recent_signals = [
                {
                    "action": row[0],
                    "confidence": row[1],
                    "entry_price": row[2],
                    "stop_loss": row[3],
                    "take_profit": row[4],
                    "reasoning": eval(row[5]) if row[5] else [],
                    "timestamp": row[6],
                    "executed": bool(row[7])
                }
                for row in recent_results
            ]
        
        # 计算关键指标
        metrics = _calculate_strategy_metrics(daily_performance)
        
        return StandardResponse(data={
            "daily_performance": daily_performance,
            "metrics": metrics,
            "recent_signals": recent_signals
        })
    
    except Exception as e:
        logger.error(f"获取策略表现失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/signal-source-distribution", summary="获取信号来源分布")
async def get_signal_source_distribution(
    days: int = Query(30, description="查询天数", ge=1, le=90)
) -> StandardResponse:
    """
    获取信号来源分布（量化 vs LLM）- 验证80/20原则
    
    Returns:
        - daily: 每日信号来源统计
        - total: 总体分布
        - ratio: 量化/LLM比例
    """
    try:
        db = bridge.get_db()
        
        start_date = datetime.now() - timedelta(days=days)
        
        # 查询信号来源分布
        query = """
            SELECT 
                DATE(timestamp) as date,
                source,
                COUNT(*) as count
            FROM strategy_signals
            WHERE timestamp >= ?
            GROUP BY DATE(timestamp), source
            ORDER BY date ASC
        """
        results = db.execute_query(query, (start_date.isoformat(),))
        
        if not results:
            # 数据库无数据时返回空数组
            daily = []
            total = {
                "quant": 0,
                "llm": 0,
                "quant_llm": 0
            }
        else:
            # 处理查询结果
            daily_map = {}
            for row in results:
                date = row[0]
                source = row[1]
                count = row[2]
                
                if date not in daily_map:
                    daily_map[date] = {"date": date, "quant": 0, "llm": 0, "quant_llm": 0}
                
                daily_map[date][source] = count
            
            daily = list(daily_map.values())
            
            total = {
                "quant": sum(d["quant"] for d in daily),
                "llm": sum(d["llm"] for d in daily),
                "quant_llm": sum(d["quant_llm"] for d in daily)
            }
        
        # 计算比例
        total_count = sum(total.values())
        ratio = {
            "quant_percent": round(total["quant"] / total_count * 100, 1) if total_count > 0 else 0,
            "llm_percent": round((total["llm"] + total["quant_llm"]) / total_count * 100, 1) if total_count > 0 else 0
        }
        
        return StandardResponse(data={
            "daily": daily,
            "total": total,
            "ratio": ratio,
            "meets_80_20": ratio["quant_percent"] >= 75  # 允许5%误差
        })
    
    except Exception as e:
        logger.error(f"获取信号来源分布失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


def _calculate_strategy_metrics(daily_performance: List[Dict]) -> Dict[str, Any]:
    """计算策略关键指标"""
    if not daily_performance:
        return {}
    
    total_signals = sum(d["signal_count"] for d in daily_performance)
    total_executed = sum(d["executed_count"] for d in daily_performance)
    avg_confidence = sum(d["avg_confidence"] for d in daily_performance) / len(daily_performance)
    
    # 计算执行率
    execution_rate = total_executed / total_signals if total_signals > 0 else 0
    
    return {
        "total_signals": total_signals,
        "total_executed": total_executed,
        "execution_rate": round(execution_rate, 2),
        "avg_confidence": round(avg_confidence, 2),
        "active_days": len(daily_performance)
    }
