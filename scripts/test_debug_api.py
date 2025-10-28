"""
测试调试API并直接查询数据库
"""
import sqlite3
from pathlib import Path

def test_database():
    """测试数据库结构和数据"""
    db_path = Path(__file__).parent.parent / "data" / "market_data.db"

    if not db_path.exists():
        print(f"[ERROR] Database not found: {db_path}")
        return

    print(f"[OK] Database file: {db_path}")
    print(f"[INFO] File size: {db_path.stat().st_size / 1024 / 1024:.2f} MB\n")

    conn = sqlite3.connect(str(db_path))
    cursor = conn.cursor()

    # 1. 查看表结构
    print("=" * 60)
    print("[TABLE SCHEMA] kline_minute:")
    print("=" * 60)
    cursor.execute("PRAGMA table_info(kline_minute)")
    columns = cursor.fetchall()
    for col in columns:
        print(f"  {col[1]:20s} {col[2]:15s}")

    # 2. 查看数据条数
    print("\n" + "=" * 60)
    print("[DATA STATS] Count by period:")
    print("=" * 60)
    cursor.execute("SELECT period, COUNT(*) as count FROM kline_minute GROUP BY period")
    for row in cursor.fetchall():
        print(f"  {row[0]}: {row[1]:,} rows")

    #  3. 查看最早和最晚的数据
    print("\n" + "=" * 60)
    print("[TIME RANGE] 1-minute klines:")
    print("=" * 60)
    cursor.execute("""
        SELECT MIN(timestamp), MAX(timestamp)
        FROM kline_minute
        WHERE period = '1'
    """)
    earliest, latest = cursor.fetchone()
    print(f"  Earliest: {earliest}")
    print(f"  Latest: {latest}")

    # 4. 查看按小时分布
    print("\n" + "=" * 60)
    print("[HOUR DISTRIBUTION] 1-minute klines:")
    print("=" * 60)
    cursor.execute("""
        SELECT
            CAST(strftime('%H', timestamp) AS INTEGER) as hour,
            COUNT(*) as count
        FROM kline_minute
        WHERE period = '1'
        GROUP BY hour
        ORDER BY hour
    """)

    trading_hours = {9, 10, 11, 13, 14, 21, 22}  # 交易时段

    for row in cursor.fetchall():
        hour, count = row
        status = "[OK]" if hour in trading_hours else "[!!]"
        print(f"  {status} {hour:02d}:00 - {count:,} rows")

    # 5. 查看样例数据
    print("\n" + "=" * 60)
    print("[SAMPLE DATA] Latest 5 rows:")
    print("=" * 60)
    cursor.execute("""
        SELECT timestamp, open, high, low, close, volume
        FROM kline_minute
        WHERE period = '1'
        ORDER BY timestamp DESC
        LIMIT 5
    """)

    for row in cursor.fetchall():
        print(f"  {row[0]} | O:{row[1]:.2f} H:{row[2]:.2f} L:{row[3]:.2f} C:{row[4]:.2f} V:{row[5]}")

    conn.close()

if __name__ == "__main__":
    test_database()
