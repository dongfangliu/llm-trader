"""
数据库优化脚本 (Python版本)
运行: python scripts/optimize_database.py
"""

import sqlite3
from pathlib import Path
import sys

# 添加src目录到路径
sys.path.insert(0, str(Path(__file__).parent.parent))

from loguru import logger


def optimize_database(db_path: str = "data/market_data.db"):
    """
    优化SQLite数据库性能
    
    Args:
        db_path: 数据库文件路径
    """
    logger.info("=" * 80)
    logger.info("开始数据库优化...")
    logger.info("=" * 80)
    
    db_file = Path(db_path)
    if not db_file.exists():
        logger.warning(f"数据库文件不存在: {db_path}")
        logger.info("将在首次运行时自动创建")
        return
    
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # 1. 创建索引
        logger.info("1/6 创建索引...")
        
        indexes = [
            # K线表索引
            ("idx_kline_minute_timestamp", "kline_minute", "timestamp"),
            ("idx_kline_minute_period", "kline_minute", "period, timestamp"),
            ("idx_kline_daily_timestamp", "kline_daily", "timestamp"),
            
            # 交易表索引
            ("idx_trades_timestamp", "trades", "timestamp"),
            ("idx_trades_action", "trades", "action"),
            
            # 决策表索引
            ("idx_decisions_timestamp", "decisions", "timestamp"),
            ("idx_decisions_type", "decisions", "decision_type"),
            
            # 复盘表索引
            ("idx_reviews_timestamp", "reviews", "timestamp"),
            
            # 经验教训表索引
            ("idx_lessons_status", "lessons", "status"),
            ("idx_lessons_importance", "lessons", "importance"),
            
            # 信号表索引 (V2系统)
            ("idx_signals_timestamp", "signals", "timestamp"),
            ("idx_signals_strategy", "signals", "strategy"),
        ]
        
        created_count = 0
        for index_name, table_name, columns in indexes:
            try:
                cursor.execute(f"CREATE INDEX IF NOT EXISTS {index_name} ON {table_name}({columns})")
                created_count += 1
            except sqlite3.OperationalError as e:
                if "no such table" not in str(e):
                    logger.warning(f"创建索引失败 {index_name}: {e}")
        
        logger.info(f"✓ 索引创建完成 ({created_count}个)")
        
        # 2. 启用WAL模式
        logger.info("2/6 启用WAL模式...")
        cursor.execute("PRAGMA journal_mode=WAL")
        mode = cursor.fetchone()[0]
        logger.info(f"✓ Journal Mode: {mode}")
        
        # 3. 设置同步模式
        logger.info("3/6 设置同步模式...")
        cursor.execute("PRAGMA synchronous=NORMAL")
        logger.info("✓ Synchronous: NORMAL")
        
        # 4. 增加缓存大小
        logger.info("4/6 增加缓存大小...")
        cursor.execute("PRAGMA cache_size=10000")
        logger.info("✓ Cache Size: 10000页 (≈40MB)")
        
        # 5. 分析数据库
        logger.info("5/6 分析数据库...")
        cursor.execute("ANALYZE")
        logger.info("✓ 数据库分析完成")
        
        # 6. 清理数据库
        logger.info("6/6 清理数据库...")
        cursor.execute("VACUUM")
        logger.info("✓ 数据库清理完成")
        
        # 统计信息
        cursor.execute("SELECT COUNT(*) FROM sqlite_master WHERE type='index'")
        index_count = cursor.fetchone()[0]
        
        logger.info("=" * 80)
        logger.info("优化完成！")
        logger.info(f"总索引数: {index_count}")
        logger.info("=" * 80)
        
        conn.commit()
        conn.close()
        
    except Exception as e:
        logger.error(f"数据库优化失败: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="优化SQLite数据库")
    parser.add_argument('--db', default='data/market_data.db', help='数据库文件路径')
    args = parser.parse_args()
    
    optimize_database(args.db)
