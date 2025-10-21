"""
数据库扩展脚本
V4架构前端支持所需的数据库表
"""

import sqlite3
import sys
from pathlib import Path
from datetime import datetime

# 添加项目根目录到路径
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))


def get_db_path():
    """获取数据库路径"""
    return project_root / "data" / "market_data.db"


def create_v4_tables(db_path):
    """创建V4架构所需的新表"""
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    print("=" * 60)
    print("开始创建V4架构数据库表...")
    print("=" * 60)
    
    tables = []
    
    # 1. 市场状态历史表
    tables.append("""
    CREATE TABLE IF NOT EXISTS market_regime_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        regime TEXT NOT NULL,
        confidence REAL NOT NULL,
        adx REAL,
        atr REAL,
        volatility REAL,
        bollinger_width REAL,
        trend_alignment REAL,
        switch_reason TEXT,
        timestamp DATETIME NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(timestamp)
    )
    """)
    
    # 2. 趋势一致性表
    tables.append("""
    CREATE TABLE IF NOT EXISTS trend_alignment (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        period TEXT NOT NULL,
        trend_direction TEXT NOT NULL,
        adx REAL,
        ma_deviation REAL,
        timestamp DATETIME NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    """)
    
    # 3. LLM触发记录表
    tables.append("""
    CREATE TABLE IF NOT EXISTS llm_triggers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        trigger_id TEXT UNIQUE NOT NULL,
        timestamp DATETIME NOT NULL,
        trigger_type TEXT NOT NULL,
        quant_signal TEXT,
        llm_prompt TEXT,
        llm_response TEXT,
        llm_decision TEXT,
        tokens_used INTEGER,
        cost REAL,
        response_time REAL,
        final_action TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    """)
    
    # 4. 策略信号表（扩展）
    tables.append("""
    CREATE TABLE IF NOT EXISTS strategy_signals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp DATETIME NOT NULL,
        strategy TEXT NOT NULL,
        action TEXT NOT NULL,
        confidence REAL NOT NULL,
        market_regime TEXT,
        entry_price REAL,
        stop_loss REAL,
        take_profit REAL,
        position_size INTEGER,
        reasoning TEXT,
        source TEXT,
        executed BOOLEAN DEFAULT FALSE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    """)
    
    # 5. 回测任务表
    tables.append("""
    CREATE TABLE IF NOT EXISTS backtest_tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        strategy TEXT NOT NULL,
        start_date DATE,
        end_date DATE,
        parameters TEXT,
        optimization_mode TEXT,
        status TEXT,
        progress REAL DEFAULT 0,
        result TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME
    )
    """)
    
    # 6. VPIN历史数据表
    tables.append("""
    CREATE TABLE IF NOT EXISTS vpin_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp DATETIME NOT NULL,
        vpin REAL NOT NULL,
        bucket_number INTEGER,
        buy_volume INTEGER,
        sell_volume INTEGER,
        imbalance REAL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    """)
    
    # 7. 订单簿快照表
    tables.append("""
    CREATE TABLE IF NOT EXISTS order_book_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp DATETIME NOT NULL,
        bid_depth INTEGER,
        ask_depth INTEGER,
        bid_depth_change_rate REAL,
        ask_depth_change_rate REAL,
        imbalance REAL,
        imbalance_acceleration REAL,
        book_data TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    """)
    
    # 8. 大单追踪表
    tables.append("""
    CREATE TABLE IF NOT EXISTS large_orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp DATETIME NOT NULL,
        side TEXT NOT NULL,
        volume INTEGER NOT NULL,
        price REAL NOT NULL,
        price_impact REAL,
        toxicity_score REAL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    """)
    
    # 创建所有表
    table_names = [
        "market_regime_history",
        "trend_alignment", 
        "llm_triggers",
        "strategy_signals",
        "backtest_tasks",
        "vpin_history",
        "order_book_snapshots",
        "large_orders"
    ]
    
    for i, sql in enumerate(tables):
        try:
            cursor.execute(sql)
            print(f"✅ 创建表: {table_names[i]}")
        except Exception as e:
            print(f"❌ 创建表 {table_names[i]} 失败: {e}")
    
    # 创建索引
    print("\n创建索引...")
    
    indexes = [
        "CREATE INDEX IF NOT EXISTS idx_market_regime_timestamp ON market_regime_history(timestamp)",
        "CREATE INDEX IF NOT EXISTS idx_trend_alignment_timestamp ON trend_alignment(timestamp)",
        "CREATE INDEX IF NOT EXISTS idx_llm_triggers_timestamp ON llm_triggers(timestamp)",
        "CREATE INDEX IF NOT EXISTS idx_llm_triggers_type ON llm_triggers(trigger_type)",
        "CREATE INDEX IF NOT EXISTS idx_strategy_signals_timestamp ON strategy_signals(timestamp)",
        "CREATE INDEX IF NOT EXISTS idx_strategy_signals_strategy ON strategy_signals(strategy)",
        "CREATE INDEX IF NOT EXISTS idx_backtest_tasks_status ON backtest_tasks(status)",
        "CREATE INDEX IF NOT EXISTS idx_vpin_timestamp ON vpin_history(timestamp)",
        "CREATE INDEX IF NOT EXISTS idx_orderbook_timestamp ON order_book_snapshots(timestamp)",
        "CREATE INDEX IF NOT EXISTS idx_large_orders_timestamp ON large_orders(timestamp)"
    ]
    
    for idx_sql in indexes:
        try:
            cursor.execute(idx_sql)
            print(f"✅ 创建索引")
        except Exception as e:
            print(f"❌ 创建索引失败: {e}")
    
    conn.commit()
    conn.close()
    
    print("\n" + "=" * 60)
    print("✅ V4架构数据库表创建完成!")
    print("=" * 60)


def insert_sample_data(db_path):
    """插入示例数据（用于测试）"""
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    print("\n插入示例数据...")
    
    now = datetime.now().isoformat()
    
    # 市场状态示例
    cursor.execute("""
        INSERT OR IGNORE INTO market_regime_history 
        (regime, confidence, adx, atr, volatility, bollinger_width, trend_alignment, switch_reason, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, ("trend", 0.87, 32.5, 15.8, 0.023, 0.045, 1.0, "ADX突破25，多周期趋势一致", now))
    
    # LLM触发示例
    import json
    cursor.execute("""
        INSERT OR IGNORE INTO llm_triggers
        (trigger_id, timestamp, trigger_type, quant_signal, llm_decision, 
         tokens_used, cost, response_time, final_action)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        "trigger_sample_001",
        now,
        "expert_review",
        json.dumps({"action": "open_long", "confidence": 0.78}),
        json.dumps({"action": "approve", "confidence_adjustment": 0.05}),
        450,
        0.0023,
        1.2,
        "open_long"
    ))
    
    # 策略信号示例
    cursor.execute("""
        INSERT INTO strategy_signals
        (timestamp, strategy, action, confidence, market_regime, entry_price, 
         stop_loss, take_profit, reasoning, source, executed)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        now,
        "trend_following",
        "open_long",
        0.85,
        "trend",
        1835.0,
        1810.0,
        1898.0,
        json.dumps(["强趋势", "多周期一致", "成交量确认"]),
        "quant",
        True
    ))
    
    conn.commit()
    conn.close()
    
    print("✅ 示例数据插入完成")


def check_existing_tables(db_path):
    """检查现有表"""
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
    tables = cursor.fetchall()
    
    print("\n当前数据库表:")
    for table in tables:
        print(f"  - {table[0]}")
    
    conn.close()


if __name__ == "__main__":
    db_path = get_db_path()
    
    print(f"数据库路径: {db_path}")
    
    if not db_path.parent.exists():
        db_path.parent.mkdir(parents=True, exist_ok=True)
        print(f"创建目录: {db_path.parent}")
    
    # 检查现有表
    if db_path.exists():
        check_existing_tables(db_path)
    
    # 创建新表
    create_v4_tables(db_path)
    
    # 插入示例数据
    insert_sample_data(db_path)
    
    # 再次检查
    check_existing_tables(db_path)
    
    print("\n✅ 数据库扩展完成!")
