"""
数据调试API - 用于诊断数据问题
"""
from fastapi import APIRouter, Query
from typing import Optional, List, Any
from datetime import datetime, time as dt_time
import sqlite3
from pathlib import Path

router = APIRouter(prefix="/api/debug", tags=["debug"])

# 定义期货交易时段
TRADING_SESSIONS = [
    (dt_time(9, 0), dt_time(10, 15)),    # 白盘上午
    (dt_time(10, 30), dt_time(11, 30)),  # 白盘上午
    (dt_time(13, 30), dt_time(15, 0)),   # 白盘下午
    (dt_time(21, 0), dt_time(23, 0)),    # 夜盘
]

def is_trading_time(dt: datetime) -> bool:
    """判断是否在交易时段"""
    t = dt.time()
    for start, end in TRADING_SESSIONS:
        if start <= t <= end:
            return True
    return False

def get_db_path():
    """获取数据库路径"""
    return Path(__file__).parent.parent.parent.parent / "data" / "market_data.db"

@router.get("/kline/raw")
async def get_raw_kline_data(
    period: int = Query(1, description="K线周期（分钟）"),
    limit: int = Query(500, description="返回条数"),
    offset: int = Query(0, description="偏移量"),
    start_date: Optional[str] = Query(None, description="开始日期 YYYY-MM-DD"),
    end_date: Optional[str] = Query(None, description="结束日期 YYYY-MM-DD"),
    only_abnormal: bool = Query(False, description="只显示异常数据")
):
    """
    获取原始K线数据，用于调试

    返回数据包括：
    - 所有字段的原始值
    - 是否在交易时段内
    - 数据异常标记（空值、异常价格、交易时段外等）
    """
    try:
        db_path = get_db_path()
        conn = sqlite3.connect(str(db_path))
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        # 构建查询
        query = f"""
            SELECT
                timestamp as datetime,
                open,
                high,
                low,
                close,
                volume,
                0 as open_interest,
                period
            FROM kline_minute
            WHERE period = ?
        """
        params = [period]

        # 添加日期过滤
        if start_date:
            query += " AND timestamp >= ?"
            params.append(f"{start_date} 00:00:00")

        if end_date:
            query += " AND timestamp <= ?"
            params.append(f"{end_date} 23:59:59")

        query += " ORDER BY timestamp DESC LIMIT ? OFFSET ?"
        params.extend([limit, offset])

        cursor.execute(query, params)
        rows = cursor.fetchall()

        # 处理数据并添加诊断信息
        result = []
        for row in rows:
            dt_str = row['datetime']
            dt = datetime.strptime(dt_str, "%Y-%m-%d %H:%M:%S")

            # 检测异常
            abnormal_flags = []

            # 1. 检查是否在交易时段
            is_trading = is_trading_time(dt)
            if not is_trading:
                abnormal_flags.append("非交易时段")

            # 2. 检查空值
            if row['open'] is None or row['close'] is None:
                abnormal_flags.append("价格为空")

            # 3. 检查异常价格（0或负数）
            if row['open'] and row['open'] <= 0:
                abnormal_flags.append("开盘价异常")
            if row['close'] and row['close'] <= 0:
                abnormal_flags.append("收盘价异常")

            # 4. 检查成交量
            if row['volume'] and row['volume'] < 0:
                abnormal_flags.append("成交量异常")

            # 5. 检查高低价逻辑
            if (row['high'] and row['low'] and
                row['open'] and row['close']):
                if row['high'] < row['low']:
                    abnormal_flags.append("高价<低价")
                if row['open'] > row['high'] or row['open'] < row['low']:
                    abnormal_flags.append("开盘价超出高低价")
                if row['close'] > row['high'] or row['close'] < row['low']:
                    abnormal_flags.append("收盘价超出高低价")

            item = {
                "datetime": dt_str,
                "weekday": ["周一", "周二", "周三", "周四", "周五", "周六", "周日"][dt.weekday()],
                "hour": dt.hour,
                "minute": dt.minute,
                "open": row['open'],
                "high": row['high'],
                "low": row['low'],
                "close": row['close'],
                "volume": row['volume'],
                "open_interest": row['open_interest'],
                "period": row['period'],
                "is_trading_time": is_trading,
                "abnormal": len(abnormal_flags) > 0,
                "abnormal_flags": abnormal_flags,
            }

            # 如果只要异常数据，则过滤
            if only_abnormal and not item['abnormal']:
                continue

            result.append(item)

        # 获取总数（用于分页）
        count_query = "SELECT COUNT(*) as total FROM kline_minute WHERE period = ?"
        count_params = [period]

        if start_date:
            count_query += " AND timestamp >= ?"
            count_params.append(f"{start_date} 00:00:00")

        if end_date:
            count_query += " AND timestamp <= ?"
            count_params.append(f"{end_date} 23:59:59")

        cursor.execute(count_query, count_params)
        total = cursor.fetchone()['total']

        conn.close()

        return {
            "code": 200,
            "msg": "success",
            "data": {
                "items": result,
                "total": total,
                "limit": limit,
                "offset": offset,
                "abnormal_count": sum(1 for item in result if item['abnormal'])
            }
        }

    except Exception as e:
        return {
            "code": 500,
            "msg": f"获取数据失败: {str(e)}",
            "data": None
        }

@router.get("/kline/daily-raw")
async def get_raw_daily_data(
    limit: int = Query(100, description="返回条数"),
    offset: int = Query(0, description="偏移量")
):
    """获取原始日线数据"""
    try:
        db_path = get_db_path()
        conn = sqlite3.connect(str(db_path))
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        query = """
            SELECT
                timestamp as date,
                open,
                high,
                low,
                close,
                volume,
                0 as open_interest
            FROM kline_daily
            ORDER BY timestamp DESC
            LIMIT ? OFFSET ?
        """

        cursor.execute(query, [limit, offset])
        rows = cursor.fetchall()

        result = []
        for row in rows:
            abnormal_flags = []

            # 检查异常
            if row['open'] is None or row['close'] is None:
                abnormal_flags.append("价格为空")

            if row['open'] and row['open'] <= 0:
                abnormal_flags.append("开盘价异常")
            if row['close'] and row['close'] <= 0:
                abnormal_flags.append("收盘价异常")

            if (row['high'] and row['low'] and
                row['open'] and row['close']):
                if row['high'] < row['low']:
                    abnormal_flags.append("高价<低价")

            result.append({
                "date": row['date'],
                "open": row['open'],
                "high": row['high'],
                "low": row['low'],
                "close": row['close'],
                "volume": row['volume'],
                "open_interest": row['open_interest'],
                "abnormal": len(abnormal_flags) > 0,
                "abnormal_flags": abnormal_flags,
            })

        # 获取总数
        cursor.execute("SELECT COUNT(*) as total FROM kline_daily")
        total = cursor.fetchone()['total']

        conn.close()

        return {
            "code": 200,
            "msg": "success",
            "data": {
                "items": result,
                "total": total,
                "limit": limit,
                "offset": offset,
                "abnormal_count": sum(1 for item in result if item['abnormal'])
            }
        }

    except Exception as e:
        return {
            "code": 500,
            "msg": f"获取数据失败: {str(e)}",
            "data": None
        }

@router.get("/stats")
async def get_data_stats():
    """获取数据统计信息"""
    try:
        db_path = get_db_path()
        conn = sqlite3.connect(str(db_path))
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        stats = {}

        # 分钟K线统计（按周期）
        for period in [1, 5, 15, 60, 240]:
            cursor.execute("""
                SELECT
                    COUNT(*) as total,
                    MIN(timestamp) as earliest,
                    MAX(timestamp) as latest,
                    COUNT(CASE WHEN open IS NULL OR close IS NULL THEN 1 END) as null_count,
                    COUNT(CASE WHEN volume = 0 THEN 1 END) as zero_volume_count
                FROM kline_minute
                WHERE period = ?
            """, [period])

            row = cursor.fetchone()
            stats[f"minute_{period}"] = {
                "total": row['total'],
                "earliest": row['earliest'],
                "latest": row['latest'],
                "null_count": row['null_count'],
                "zero_volume_count": row['zero_volume_count'],
            }

        # 日线统计
        cursor.execute("""
            SELECT
                COUNT(*) as total,
                MIN(timestamp) as earliest,
                MAX(timestamp) as latest,
                COUNT(CASE WHEN open IS NULL OR close IS NULL THEN 1 END) as null_count,
                COUNT(CASE WHEN volume = 0 THEN 1 END) as zero_volume_count
            FROM kline_daily
        """)

        row = cursor.fetchone()
        stats["daily"] = {
            "total": row['total'],
            "earliest": row['earliest'],
            "latest": row['latest'],
            "null_count": row['null_count'],
            "zero_volume_count": row['zero_volume_count'],
        }

        # 数据库文件大小
        db_size = db_path.stat().st_size if db_path.exists() else 0
        stats["database"] = {
            "path": str(db_path),
            "size_mb": round(db_size / 1024 / 1024, 2),
            "exists": db_path.exists(),
        }

        conn.close()

        return {
            "code": 200,
            "msg": "success",
            "data": stats
        }

    except Exception as e:
        return {
            "code": 500,
            "msg": f"获取统计信息失败: {str(e)}",
            "data": None
        }

@router.get("/time-distribution")
async def get_time_distribution(period: int = Query(1, description="K线周期")):
    """获取时间分布（按小时统计）"""
    try:
        db_path = get_db_path()
        conn = sqlite3.connect(str(db_path))
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        # 按小时分组统计
        cursor.execute("""
            SELECT
                CAST(strftime('%H', timestamp) AS INTEGER) as hour,
                COUNT(*) as count
            FROM kline_minute
            WHERE period = ?
            GROUP BY hour
            ORDER BY hour
        """, [period])

        rows = cursor.fetchall()

        result = []
        for row in rows:
            hour = row['hour']
            count = row['count']

            # 判断是否应该在交易时段
            is_expected_trading_hour = any(
                start.hour <= hour <= end.hour
                for start, end in TRADING_SESSIONS
            )

            result.append({
                "hour": hour,
                "count": count,
                "is_trading_hour": is_expected_trading_hour,
                "abnormal": not is_expected_trading_hour and count > 0
            })

        conn.close()

        return {
            "code": 200,
            "msg": "success",
            "data": result
        }

    except Exception as e:
        return {
            "code": 500,
            "msg": f"获取时间分布失败: {str(e)}",
            "data": None
        }

@router.get("/realtime/quote")
async def get_realtime_quote():
    """获取实时行情（从TqSDK缓存读取）"""
    try:
        from server.services.realtime_push_service import get_push_service

        push_service = get_push_service()
        if not push_service:
            return {
                "code": 500,
                "msg": "推送服务未初始化",
                "data": None
            }

        quote_data = push_service.get_cached_quote()
        if not quote_data:
            return {
                "code": 404,
                "msg": "暂无实时行情数据",
                "data": None
            }

        return {
            "code": 200,
            "msg": "success",
            "data": quote_data
        }

    except Exception as e:
        return {
            "code": 500,
            "msg": f"获取实时行情失败: {str(e)}",
            "data": None
        }

@router.get("/realtime/kline")
async def get_realtime_kline(
    period: str = Query("1m", description="K线周期（1m/5m/15m/1h/4h）"),
    limit: int = Query(100, description="返回条数")
):
    """获取实时K线（从TqSDK缓存读取）"""
    try:
        from server.services.realtime_push_service import get_push_service

        push_service = get_push_service()
        if not push_service:
            return {
                "code": 500,
                "msg": "推送服务未初始化",
                "data": None
            }

        kline_data = push_service.get_cached_kline(period, limit)

        return {
            "code": 200,
            "msg": "success",
            "data": {
                "period": period,
                "items": kline_data,
                "count": len(kline_data)
            }
        }

    except Exception as e:
        return {
            "code": 500,
            "msg": f"获取实时K线失败: {str(e)}",
            "data": None
        }

@router.get("/realtime/status")
async def get_realtime_status():
    """获取实时数据服务状态"""
    try:
        from server.services.realtime_push_service import get_push_service

        push_service = get_push_service()
        if not push_service:
            return {
                "code": 500,
                "msg": "推送服务未初始化",
                "data": {
                    "running": False,
                    "message": "服务未启动"
                }
            }

        cache_status = push_service.get_cache_status()

        return {
            "code": 200,
            "msg": "success",
            "data": {
                "running": push_service.running,
                "cache_status": cache_status,
                "message": "服务正常运行" if push_service.running else "服务未运行"
            }
        }

    except Exception as e:
        return {
            "code": 500,
            "msg": f"获取服务状态失败: {str(e)}",
            "data": None
        }
