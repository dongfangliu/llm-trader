"""
回测API
Backtest API
"""

from fastapi import APIRouter, HTTPException, Body
from typing import List, Dict, Any, Optional
from datetime import datetime
from pydantic import BaseModel, Field
from loguru import logger

from server.models.schemas import StandardResponse
from server.core.bridge import bridge

router = APIRouter()


# ==================== 请求模型 ====================

class BacktestRequest(BaseModel):
    """回测请求"""
    name: str = Field(..., description="回测任务名称")
    strategy: str = Field(..., description="策略名称")
    start_date: str = Field(..., description="开始日期 (YYYY-MM-DD)")
    end_date: str = Field(..., description="结束日期 (YYYY-MM-DD)")
    initial_capital: float = Field(50000, description="初始资金")
    parameters: Dict[str, Any] = Field(default_factory=dict, description="策略参数")


class OptimizationRequest(BaseModel):
    """参数优化请求"""
    name: str = Field(..., description="优化任务名称")
    strategy: str = Field(..., description="策略名称")
    start_date: str = Field(..., description="开始日期")
    end_date: str = Field(..., description="结束日期")
    optimization_mode: str = Field("grid_search", description="优化模式")
    parameter_ranges: Dict[str, List] = Field(..., description="参数搜索范围")
    target_metric: str = Field("sharpe_ratio", description="优化目标指标")


# ==================== API端点 ====================

@router.post("/run", summary="运行回测")
async def run_backtest(request: BacktestRequest) -> StandardResponse:
    """
    运行单次回测
    
    Args:
        request: 回测请求参数
    
    Returns:
        - task_id: 任务ID
        - status: 任务状态
    """
    try:
        import uuid
        task_id = f"backtest_{uuid.uuid4().hex[:8]}"
        
        db = bridge.get_db()
        
        # 创建回测任务
        import json
        query = """
            INSERT INTO backtest_tasks 
            (task_id, name, strategy, start_date, end_date, parameters, 
             optimization_mode, status, progress)
            VALUES (?, ?, ?, ?, ?, ?, 'single', 'pending', 0)
        """
        db.execute_update(
            query,
            (task_id, request.name, request.strategy, request.start_date, 
             request.end_date, json.dumps(request.parameters))
        )
        
        # TODO: 实际调用回测引擎
        # from src.backtest.backtester import Backtester
        # backtester = Backtester(...)
        # result = backtester.run()
        
        logger.info(f"创建回测任务: {task_id}")
        
        return StandardResponse(data={
            "task_id": task_id,
            "status": "pending",
            "message": "回测任务已创建，正在排队执行"
        })
    
    except Exception as e:
        logger.error(f"创建回测任务失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/optimize", summary="参数优化")
async def run_optimization(request: OptimizationRequest) -> StandardResponse:
    """
    运行参数优化
    
    Args:
        request: 优化请求参数
    
    Returns:
        - task_id: 任务ID
        - status: 任务状态
        - estimated_time: 预计耗时
    """
    try:
        import uuid
        task_id = f"optimize_{uuid.uuid4().hex[:8]}"
        
        db = bridge.get_db()
        
        # 计算参数组合数量
        import json
        param_combinations = 1
        for param_range in request.parameter_ranges.values():
            param_combinations *= len(param_range)
        
        # 创建优化任务
        query = """
            INSERT INTO backtest_tasks 
            (task_id, name, strategy, start_date, end_date, parameters, 
             optimization_mode, status, progress)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 0)
        """
        db.execute_update(
            query,
            (task_id, request.name, request.strategy, request.start_date,
             request.end_date, json.dumps(request.parameter_ranges),
             request.optimization_mode)
        )
        
        # 预估时间（每个参数组合约30秒）
        estimated_minutes = param_combinations * 0.5
        
        logger.info(f"创建优化任务: {task_id}, {param_combinations}个参数组合")
        
        return StandardResponse(data={
            "task_id": task_id,
            "status": "pending",
            "parameter_combinations": param_combinations,
            "estimated_minutes": round(estimated_minutes, 1),
            "message": "优化任务已创建"
        })
    
    except Exception as e:
        logger.error(f"创建优化任务失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/tasks", summary="获取回测任务列表")
async def get_backtest_tasks(
    status: Optional[str] = None,
    limit: int = 50
) -> StandardResponse:
    """
    获取回测任务列表
    
    Args:
        status: 过滤状态（pending/running/completed/failed）
        limit: 返回数量
    
    Returns:
        - tasks: 任务列表
    """
    try:
        db = bridge.get_db()
        
        if status:
            query = """
                SELECT task_id, name, strategy, start_date, end_date,
                       optimization_mode, status, progress, created_at, completed_at
                FROM backtest_tasks
                WHERE status = ?
                ORDER BY created_at DESC
                LIMIT ?
            """
            results = db.execute_query(query, (status, limit))
        else:
            query = """
                SELECT task_id, name, strategy, start_date, end_date,
                       optimization_mode, status, progress, created_at, completed_at
                FROM backtest_tasks
                ORDER BY created_at DESC
                LIMIT ?
            """
            results = db.execute_query(query, (limit,))
        
        if not results:
            # Mock data
            tasks = [
                {
                    "task_id": "backtest_abc123",
                    "name": "趋势策略回测",
                    "strategy": "trend_following",
                    "start_date": "2024-01-01",
                    "end_date": "2024-12-31",
                    "optimization_mode": "single",
                    "status": "completed",
                    "progress": 100,
                    "created_at": (datetime.now()).isoformat(),
                    "completed_at": (datetime.now()).isoformat()
                }
            ]
        else:
            tasks = [
                {
                    "task_id": row[0],
                    "name": row[1],
                    "strategy": row[2],
                    "start_date": row[3],
                    "end_date": row[4],
                    "optimization_mode": row[5],
                    "status": row[6],
                    "progress": row[7],
                    "created_at": row[8],
                    "completed_at": row[9]
                }
                for row in results
            ]
        
        return StandardResponse(data={"tasks": tasks})
    
    except Exception as e:
        logger.error(f"获取任务列表失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/tasks/{task_id}", summary="获取任务详情")
async def get_task_detail(task_id: str) -> StandardResponse:
    """
    获取回测任务详情和结果
    
    Args:
        task_id: 任务ID
    
    Returns:
        - task_info: 任务信息
        - result: 回测结果（如果已完成）
    """
    try:
        db = bridge.get_db()
        
        query = """
            SELECT task_id, name, strategy, start_date, end_date, parameters,
                   optimization_mode, status, progress, result, created_at, completed_at
            FROM backtest_tasks
            WHERE task_id = ?
        """
        result = db.execute_query(query, (task_id,))
        
        if not result:
            # Mock data
            task_info = {
                "task_id": task_id,
                "name": "趋势策略回测",
                "strategy": "trend_following",
                "start_date": "2024-01-01",
                "end_date": "2024-12-31",
                "parameters": {"ma_period": 20, "atr_multiplier": 2.5},
                "optimization_mode": "single",
                "status": "completed",
                "progress": 100,
                "created_at": datetime.now().isoformat(),
                "completed_at": datetime.now().isoformat()
            }
            
            backtest_result = {
                "performance": {
                    "total_return": 0.245,
                    "annual_return": 0.245,
                    "sharpe_ratio": 1.85,
                    "max_drawdown": 0.085,
                    "win_rate": 0.68,
                    "profit_loss_ratio": 2.5
                },
                "trades": {
                    "total_trades": 125,
                    "winning_trades": 85,
                    "losing_trades": 40,
                    "avg_win": 280.0,
                    "avg_loss": 112.0
                },
                "equity_curve": [
                    {"date": "2024-01-01", "equity": 50000},
                    {"date": "2024-06-30", "equity": 56000},
                    {"date": "2024-12-31", "equity": 62250}
                ],
                "monthly_returns": [
                    {"month": "2024-01", "return": 0.025},
                    {"month": "2024-02", "return": 0.018}
                ]
            }
        else:
            import json
            row = result[0]
            
            task_info = {
                "task_id": row[0],
                "name": row[1],
                "strategy": row[2],
                "start_date": row[3],
                "end_date": row[4],
                "parameters": json.loads(row[5]) if row[5] else {},
                "optimization_mode": row[6],
                "status": row[7],
                "progress": row[8],
                "created_at": row[10],
                "completed_at": row[11]
            }
            
            backtest_result = json.loads(row[9]) if row[9] else None
        
        return StandardResponse(data={
            "task_info": task_info,
            "result": backtest_result
        })
    
    except Exception as e:
        logger.error(f"获取任务详情失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/tasks/{task_id}", summary="删除任务")
async def delete_task(task_id: str) -> StandardResponse:
    """
    删除回测任务
    
    Args:
        task_id: 任务ID
    """
    try:
        db = bridge.get_db()
        
        query = "DELETE FROM backtest_tasks WHERE task_id = ?"
        db.execute_update(query, (task_id,))
        
        logger.info(f"删除回测任务: {task_id}")
        
        return StandardResponse(message="任务已删除")
    
    except Exception as e:
        logger.error(f"删除任务失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/templates", summary="获取策略模板")
async def get_strategy_templates() -> StandardResponse:
    """
    获取可用的策略模板和默认参数
    
    Returns:
        - templates: 策略模板列表
    """
    templates = [
        {
            "strategy": "trend_following",
            "name": "趋势跟踪策略",
            "description": "基于多周期趋势一致性的趋势跟踪",
            "default_parameters": {
                "ma_period": 20,
                "atr_period": 14,
                "atr_multiplier": 2.5,
                "adx_threshold": 25
            },
            "parameter_ranges": {
                "ma_period": [10, 15, 20, 30, 50],
                "atr_multiplier": [1.5, 2.0, 2.5, 3.0],
                "adx_threshold": [20, 25, 30]
            }
        },
        {
            "strategy": "mean_reversion",
            "name": "均值回归策略",
            "description": "基于布林带和RSI的均值回归",
            "default_parameters": {
                "bb_period": 20,
                "bb_std": 2.0,
                "rsi_period": 14,
                "rsi_oversold": 30,
                "rsi_overbought": 70
            },
            "parameter_ranges": {
                "bb_period": [15, 20, 25],
                "bb_std": [1.5, 2.0, 2.5],
                "rsi_oversold": [25, 30, 35],
                "rsi_overbought": [65, 70, 75]
            }
        },
        {
            "strategy": "breakout",
            "name": "突破策略",
            "description": "基于成交量确认的价格突破",
            "default_parameters": {
                "lookback_period": 20,
                "volume_threshold": 1.5,
                "min_consolidation_bars": 10
            },
            "parameter_ranges": {
                "lookback_period": [15, 20, 30],
                "volume_threshold": [1.2, 1.5, 2.0],
                "min_consolidation_bars": [5, 10, 15]
            }
        }
    ]
    
    return StandardResponse(data={"templates": templates})


@router.get("/compare", summary="对比多个回测结果")
async def compare_backtests(task_ids: str) -> StandardResponse:
    """
    对比多个回测结果
    
    Args:
        task_ids: 任务ID列表，逗号分隔
    
    Returns:
        - comparison: 对比结果
    """
    try:
        task_id_list = task_ids.split(",")
        
        db = bridge.get_db()
        
        # 获取所有任务结果
        placeholders = ",".join(["?" for _ in task_id_list])
        query = f"""
            SELECT task_id, name, strategy, parameters, result
            FROM backtest_tasks
            WHERE task_id IN ({placeholders})
            AND status = 'completed'
        """
        results = db.execute_query(query, tuple(task_id_list))
        
        if not results:
            raise HTTPException(status_code=404, detail="No completed tasks found")
        
        import json
        comparison = []
        for row in results:
            result_data = json.loads(row[4]) if row[4] else {}
            comparison.append({
                "task_id": row[0],
                "name": row[1],
                "strategy": row[2],
                "parameters": json.loads(row[3]) if row[3] else {},
                "performance": result_data.get("performance", {})
            })
        
        return StandardResponse(data={"comparison": comparison})
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"对比回测结果失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))
