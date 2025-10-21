-- SQLite数据库性能优化脚本
-- 用途: 提升查询速度、减少锁等待
-- 执行: sqlite3 data/market_data.db < scripts/optimize_database.sql

-- 1. 为K线表创建索引
CREATE INDEX IF NOT EXISTS idx_kline_minute_timestamp ON kline_minute(timestamp);
CREATE INDEX IF NOT EXISTS idx_kline_minute_period ON kline_minute(period, timestamp);
CREATE INDEX IF NOT EXISTS idx_kline_daily_timestamp ON kline_daily(timestamp);

-- 2. 为交易表创建索引
CREATE INDEX IF NOT EXISTS idx_trades_timestamp ON trades(timestamp);
CREATE INDEX IF NOT EXISTS idx_trades_action ON trades(action);

-- 3. 为决策表创建索引
CREATE INDEX IF NOT EXISTS idx_decisions_timestamp ON decisions(timestamp);
CREATE INDEX IF NOT EXISTS idx_decisions_type ON decisions(decision_type);

-- 4. 为复盘表创建索引
CREATE INDEX IF NOT EXISTS idx_reviews_timestamp ON reviews(timestamp);

-- 5. 为经验教训表创建索引
CREATE INDEX IF NOT EXISTS idx_lessons_status ON lessons(status);
CREATE INDEX IF NOT EXISTS idx_lessons_importance ON lessons(importance);

-- 6. 为信号表创建索引 (V2系统)
CREATE INDEX IF NOT EXISTS idx_signals_timestamp ON signals(timestamp);
CREATE INDEX IF NOT EXISTS idx_signals_strategy ON signals(strategy);

-- 7. 启用WAL模式 (Write-Ahead Logging)
-- 优点: 提升并发性能，减少锁冲突
PRAGMA journal_mode=WAL;

-- 8. 设置同步模式为NORMAL
-- 优点: 平衡性能和安全性
PRAGMA synchronous=NORMAL;

-- 9. 增加缓存大小 (10000页 ≈ 40MB)
PRAGMA cache_size=10000;

-- 10. 启用内存映射I/O (128MB)
PRAGMA mmap_size=134217728;

-- 11. 分析数据库，更新统计信息
ANALYZE;

-- 12. 清理数据库，回收空间
VACUUM;

-- 完成信息
SELECT '✓ 数据库优化完成' as status;
SELECT 'Indexes: ' || COUNT(*) || ' 个' as info FROM sqlite_master WHERE type='index';
SELECT 'Journal Mode: ' || (SELECT * FROM pragma_journal_mode) as info;
SELECT 'Synchronous: ' || (SELECT * FROM pragma_synchronous) as info;
