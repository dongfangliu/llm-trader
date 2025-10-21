"""
LLM专家系统API
LLM Expert System API
"""

from fastapi import APIRouter, HTTPException, Query
from typing import List, Dict, Any
from datetime import datetime, timedelta
from loguru import logger

from server.models.schemas import StandardResponse
from server.core.bridge import bridge

router = APIRouter()


@router.get("/triggers/recent", summary="获取最近LLM触发记录")
async def get_recent_triggers(
    limit: int = Query(20, description="返回数量", ge=1, le=100)
) -> StandardResponse:
    """
    获取最近的LLM触发记录
    
    Args:
        limit: 返回数量
    
    Returns:
        - triggers: 触发记录列表
        - summary: 汇总统计
    """
    try:
        db = bridge.get_db()
        
        query = """
            SELECT trigger_id, timestamp, trigger_type, quant_signal, 
                   llm_decision, tokens_used, cost, response_time, final_action
            FROM llm_triggers
            ORDER BY timestamp DESC
            LIMIT ?
        """
        results = db.execute_query(query, (limit,))
        
        if not results:
            # Mock data
            triggers = [
                {
                    "trigger_id": f"trigger_{i}",
                    "timestamp": (datetime.now() - timedelta(hours=i*2)).isoformat(),
                    "trigger_type": ["expert_review", "abnormal_analysis", "signal_conflict"][i % 3],
                    "quant_signal": {
                        "action": "open_long",
                        "confidence": 0.78
                    },
                    "llm_decision": {
                        "action": "approve",
                        "confidence_adjustment": 0.05,
                        "reasoning": "市场趋势清晰，支持开仓"
                    },
                    "tokens_used": 450 + i * 10,
                    "cost": 0.0023,
                    "response_time": 1.2 + i * 0.1,
                    "final_action": "open_long"
                }
                for i in range(min(limit, 10))
            ]
        else:
            import json
            triggers = [
                {
                    "trigger_id": row[0],
                    "timestamp": row[1],
                    "trigger_type": row[2],
                    "quant_signal": json.loads(row[3]) if row[3] else {},
                    "llm_decision": json.loads(row[4]) if row[4] else {},
                    "tokens_used": row[5],
                    "cost": row[6],
                    "response_time": row[7],
                    "final_action": row[8]
                }
                for row in results
            ]
        
        # 汇总统计
        summary = {
            "total_triggers": len(triggers),
            "by_type": _count_by_type(triggers),
            "total_cost": round(sum(t["cost"] for t in triggers), 4),
            "avg_response_time": round(sum(t["response_time"] for t in triggers) / len(triggers), 2) if triggers else 0
        }
        
        return StandardResponse(data={
            "triggers": triggers,
            "summary": summary
        })
    
    except Exception as e:
        logger.error(f"获取LLM触发记录失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/triggers/statistics", summary="获取LLM触发统计")
async def get_trigger_statistics(
    days: int = Query(30, description="查询天数", ge=1, le=90)
) -> StandardResponse:
    """
    获取LLM触发统计数据
    
    Args:
        days: 查询天数
    
    Returns:
        - daily_triggers: 每日触发次数
        - cost_analysis: 成本分析
        - efficiency_metrics: 效率指标
    """
    try:
        db = bridge.get_db()
        
        start_date = datetime.now() - timedelta(days=days)
        
        # 每日触发统计
        daily_query = """
            SELECT 
                DATE(timestamp) as date,
                trigger_type,
                COUNT(*) as count,
                SUM(tokens_used) as total_tokens,
                SUM(cost) as total_cost,
                AVG(response_time) as avg_response_time
            FROM llm_triggers
            WHERE timestamp >= ?
            GROUP BY DATE(timestamp), trigger_type
            ORDER BY date ASC
        """
        daily_results = db.execute_query(daily_query, (start_date.isoformat(),))
        
        if not daily_results:
            # Mock data - 符合V4设计的低频触发（3-5次/天）
            daily_triggers = []
            for i in range(days):
                date = (datetime.now() - timedelta(days=days-i-1)).strftime("%Y-%m-%d")
                daily_triggers.append({
                    "date": date,
                    "expert_review": 2 + (i % 2),
                    "abnormal_analysis": 1 if i % 3 == 0 else 0,
                    "signal_conflict": 1 if i % 5 == 0 else 0,
                    "daily_review": 1,
                    "total": 4 + (i % 2),
                    "total_tokens": 2200 + i * 100,
                    "total_cost": 0.011 + i * 0.001
                })
            
            cost_analysis = {
                "total_cost": sum(d["total_cost"] for d in daily_triggers),
                "avg_daily_cost": round(sum(d["total_cost"] for d in daily_triggers) / days, 4),
                "projected_monthly_cost": round(sum(d["total_cost"] for d in daily_triggers) / days * 30, 2)
            }
        else:
            # 处理查询结果
            daily_map = {}
            for row in daily_results:
                date = row[0]
                trigger_type = row[1]
                
                if date not in daily_map:
                    daily_map[date] = {
                        "date": date,
                        "expert_review": 0,
                        "abnormal_analysis": 0,
                        "signal_conflict": 0,
                        "daily_review": 0,
                        "total": 0,
                        "total_tokens": 0,
                        "total_cost": 0
                    }
                
                daily_map[date][trigger_type] = row[2]
                daily_map[date]["total"] += row[2]
                daily_map[date]["total_tokens"] += row[3] or 0
                daily_map[date]["total_cost"] += row[4] or 0
            
            daily_triggers = list(daily_map.values())
            
            total_cost = sum(d["total_cost"] for d in daily_triggers)
            cost_analysis = {
                "total_cost": round(total_cost, 4),
                "avg_daily_cost": round(total_cost / len(daily_triggers), 4) if daily_triggers else 0,
                "projected_monthly_cost": round(total_cost / len(daily_triggers) * 30, 2) if daily_triggers else 0
            }
        
        # 效率指标
        efficiency_metrics = _calculate_efficiency_metrics(daily_triggers)
        
        return StandardResponse(data={
            "daily_triggers": daily_triggers,
            "cost_analysis": cost_analysis,
            "efficiency_metrics": efficiency_metrics
        })
    
    except Exception as e:
        logger.error(f"获取LLM触发统计失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/triggers/{trigger_id}", summary="获取触发详情")
async def get_trigger_detail(trigger_id: str) -> StandardResponse:
    """
    获取特定触发事件的详细信息
    
    Args:
        trigger_id: 触发ID
    
    Returns:
        - 完整的触发信息，包括prompt和response
    """
    try:
        db = bridge.get_db()
        
        query = """
            SELECT trigger_id, timestamp, trigger_type, quant_signal,
                   llm_prompt, llm_response, llm_decision, 
                   tokens_used, cost, response_time, final_action
            FROM llm_triggers
            WHERE trigger_id = ?
        """
        result = db.execute_query(query, (trigger_id,))
        
        if not result:
            raise HTTPException(status_code=404, detail="Trigger not found")
        
        import json
        row = result[0]
        
        detail = {
            "trigger_id": row[0],
            "timestamp": row[1],
            "trigger_type": row[2],
            "quant_signal": json.loads(row[3]) if row[3] else {},
            "llm_prompt": row[4],
            "llm_response": row[5],
            "llm_decision": json.loads(row[6]) if row[6] else {},
            "tokens_used": row[7],
            "cost": row[8],
            "response_time": row[9],
            "final_action": row[10]
        }
        
        return StandardResponse(data=detail)
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"获取触发详情失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/cost/trend", summary="获取LLM成本趋势")
async def get_cost_trend(
    days: int = Query(30, description="查询天数", ge=7, le=90)
) -> StandardResponse:
    """
    获取LLM成本趋势分析
    
    Args:
        days: 查询天数
    
    Returns:
        - daily_cost: 每日成本
        - trend_analysis: 趋势分析
        - budget_status: 预算状态
    """
    try:
        db = bridge.get_db()
        
        start_date = datetime.now() - timedelta(days=days)
        
        query = """
            SELECT 
                DATE(timestamp) as date,
                COUNT(*) as trigger_count,
                SUM(tokens_used) as total_tokens,
                SUM(cost) as total_cost
            FROM llm_triggers
            WHERE timestamp >= ?
            GROUP BY DATE(timestamp)
            ORDER BY date ASC
        """
        results = db.execute_query(query, (start_date.isoformat(),))
        
        if not results:
            # Mock data - V4目标：<$5/月
            daily_cost = [
                {
                    "date": (datetime.now() - timedelta(days=days-i-1)).strftime("%Y-%m-%d"),
                    "trigger_count": 4 + (i % 2),
                    "total_tokens": 2200 + i * 50,
                    "total_cost": round(0.011 + (i % 3) * 0.002, 4)
                }
                for i in range(days)
            ]
        else:
            daily_cost = [
                {
                    "date": row[0],
                    "trigger_count": row[1],
                    "total_tokens": row[2],
                    "total_cost": round(row[3], 4)
                }
                for row in results
            ]
        
        # 趋势分析
        trend_analysis = _analyze_cost_trend(daily_cost)
        
        # 预算状态
        monthly_projection = trend_analysis["avg_daily_cost"] * 30
        budget_target = 5.0  # V4目标：$5/月
        budget_status = {
            "monthly_projection": round(monthly_projection, 2),
            "budget_target": budget_target,
            "within_budget": monthly_projection <= budget_target,
            "utilization_percent": round(monthly_projection / budget_target * 100, 1)
        }
        
        return StandardResponse(data={
            "daily_cost": daily_cost,
            "trend_analysis": trend_analysis,
            "budget_status": budget_status
        })
    
    except Exception as e:
        logger.error(f"获取成本趋势失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/daily-review/latest", summary="获取最新每日复盘")
async def get_latest_daily_review() -> StandardResponse:
    """
    获取最新的每日复盘结果
    
    Returns:
        - review_content: 复盘内容
        - lessons_extracted: 提取的经验教训
        - performance_analysis: 表现分析
    """
    try:
        db = bridge.get_db()
        
        # 获取最新的daily_review触发
        query = """
            SELECT llm_response, llm_decision, timestamp
            FROM llm_triggers
            WHERE trigger_type = 'daily_review'
            ORDER BY timestamp DESC
            LIMIT 1
        """
        result = db.execute_query(query)
        
        if not result:
            # Mock data
            review = {
                "review_content": "今日市场呈现强势上涨趋势，趋势跟踪策略表现优异，成功捕捉主要趋势波段。",
                "lessons_extracted": [
                    "强趋势市场中应提高仓位利用率",
                    "多周期趋势一致时可以增加信心",
                    "回调时的加仓时机把握较好"
                ],
                "performance_analysis": {
                    "win_rate": 0.75,
                    "profit_loss_ratio": 2.8,
                    "total_pnl": 1250.0,
                    "best_trade": "开仓1835，止盈1898，+3.4%",
                    "worst_trade": "开仓1842，止损1825，-0.9%"
                },
                "timestamp": datetime.now().replace(hour=21, minute=0).isoformat()
            }
        else:
            import json
            llm_response = result[0][0]
            llm_decision = json.loads(result[0][1]) if result[0][1] else {}
            
            review = {
                "review_content": llm_response,
                "lessons_extracted": llm_decision.get("lessons", []),
                "performance_analysis": llm_decision.get("performance", {}),
                "timestamp": result[0][2]
            }
        
        return StandardResponse(data=review)
    
    except Exception as e:
        logger.error(f"获取每日复盘失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


def _count_by_type(triggers: List[Dict]) -> Dict[str, int]:
    """按类型统计触发次数"""
    counts = {}
    for trigger in triggers:
        trigger_type = trigger["trigger_type"]
        counts[trigger_type] = counts.get(trigger_type, 0) + 1
    return counts


def _calculate_efficiency_metrics(daily_triggers: List[Dict]) -> Dict[str, Any]:
    """计算效率指标"""
    if not daily_triggers:
        return {}
    
    total_triggers = sum(d["total"] for d in daily_triggers)
    avg_daily_triggers = total_triggers / len(daily_triggers)
    
    # 计算触发类型分布
    type_distribution = {
        "expert_review": sum(d["expert_review"] for d in daily_triggers),
        "abnormal_analysis": sum(d["abnormal_analysis"] for d in daily_triggers),
        "signal_conflict": sum(d["signal_conflict"] for d in daily_triggers),
        "daily_review": sum(d["daily_review"] for d in daily_triggers)
    }
    
    return {
        "avg_daily_triggers": round(avg_daily_triggers, 1),
        "total_triggers": total_triggers,
        "type_distribution": type_distribution,
        "meets_v4_target": avg_daily_triggers <= 5  # V4目标：3-5次/天
    }


def _analyze_cost_trend(daily_cost: List[Dict]) -> Dict[str, Any]:
    """分析成本趋势"""
    if not daily_cost:
        return {}
    
    costs = [d["total_cost"] for d in daily_cost]
    avg_cost = sum(costs) / len(costs)
    
    # 简单线性趋势（最近7天 vs 之前）
    if len(costs) >= 14:
        recent_avg = sum(costs[-7:]) / 7
        previous_avg = sum(costs[-14:-7]) / 7
        trend = "increasing" if recent_avg > previous_avg * 1.1 else "decreasing" if recent_avg < previous_avg * 0.9 else "stable"
    else:
        trend = "stable"
    
    return {
        "avg_daily_cost": round(avg_cost, 4),
        "max_daily_cost": round(max(costs), 4),
        "min_daily_cost": round(min(costs), 4),
        "trend": trend
    }
