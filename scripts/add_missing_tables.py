"""
添加缺失的数据库表
为已存在的数据库添加 strategy_signals、market_regime_history 和 trend_alignment 表
"""

import sqlite3
from pathlib import Path
from loguru import logger

# 设置项目根目录
project_root = Path(__file__).parent.parent
db_path = project_root / "data" / "market_data.db"

def add_missing_tables():
    """添加缺失的表"""

    if not db_path.exists():
        logger.error(f"数据库文件不存在: {db_path}")
        return False

    try:
        conn = sqlite3.connect(str(db_path))
        cursor = conn.cursor()

        logger.info("开始添加缺失的表...")

        # 1. 添加 strategy_signals 表
        logger.info("创建 strategy_signals 表...")
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS strategy_signals (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp DATETIME NOT NULL,
                strategy TEXT NOT NULL,
                action TEXT NOT NULL,
                confidence REAL NOT NULL,
                reasoning TEXT,
                entry_price REAL,
                stop_loss REAL,
                take_profit REAL,
                market_regime TEXT,
                indicators TEXT,
                executed BOOLEAN DEFAULT 0,
                source TEXT DEFAULT 'quant',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')

        # 2. 添加 market_regime_history 表
        logger.info("创建 market_regime_history 表...")
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS market_regime_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp DATETIME NOT NULL,
                regime TEXT NOT NULL,
                confidence REAL NOT NULL,
                adx REAL,
                atr REAL,
                volatility REAL,
                bollinger_width REAL,
                trend_alignment REAL,
                switch_reason TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')

        # 3. 添加 trend_alignment 表
        logger.info("创建 trend_alignment 表...")
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS trend_alignment (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp DATETIME NOT NULL,
                period TEXT NOT NULL,
                trend_direction TEXT NOT NULL,
                adx REAL,
                ma_deviation REAL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')

        conn.commit()
        logger.info("✅ 所有表创建成功！")

        # 验证表是否存在
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = [row[0] for row in cursor.fetchall()]
        logger.info(f"当前数据库包含的表: {', '.join(tables)}")

        conn.close()
        return True

    except Exception as e:
        logger.error(f"❌ 添加表失败: {e}")
        return False

if __name__ == "__main__":
    logger.info(f"数据库路径: {db_path}")
    success = add_missing_tables()

    if success:
        logger.info("✅ 数据库迁移完成！")
        print("\n✅ 成功添加以下表：")
        print("  - strategy_signals (策略信号)")
        print("  - market_regime_history (市场状态历史)")
        print("  - trend_alignment (多周期趋势一致性)")
    else:
        logger.error("❌ 数据库迁移失败！")
