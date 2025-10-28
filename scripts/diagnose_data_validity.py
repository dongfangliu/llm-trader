"""
数据有效性诊断脚本
检查数据库中的数据是否符合真实交易时段
"""

import sqlite3
import sys
import io
from pathlib import Path
from datetime import datetime
import platform

# Windows console UTF-8 support
if platform.system() == "Windows":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

# 添加项目根目录到路径
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

# 纯碱期货真实交易时段
TRADING_HOURS = {
    'day': [
        (9, 0, 10, 15),   # 9:00-10:15
        (10, 30, 11, 30),  # 10:30-11:30
        (13, 30, 15, 0),   # 13:30-15:00
    ],
    'night': [
        (21, 0, 23, 0),    # 21:00-23:00
    ]
}

def is_valid_trading_time(hour, minute):
    """检查是否在有效交易时段"""
    time_minutes = hour * 60 + minute

    # 检查日盘
    for start_h, start_m, end_h, end_m in TRADING_HOURS['day']:
        start = start_h * 60 + start_m
        end = end_h * 60 + end_m
        if start <= time_minutes < end:
            return True, 'day'

    # 检查夜盘
    for start_h, start_m, end_h, end_m in TRADING_HOURS['night']:
        start = start_h * 60 + start_m
        end = end_h * 60 + end_m
        if start <= time_minutes < end:
            return True, 'night'

    return False, 'closed'

def main():
    db_path = project_root / "data" / "market_data.db"

    if not db_path.exists():
        print(f"❌ 数据库文件不存在: {db_path}")
        return

    print("=" * 70)
    print("🔍 数据有效性诊断")
    print("=" * 70)

    conn = sqlite3.connect(str(db_path))
    cursor = conn.cursor()

    # 1. 检查所有表
    print("\n📊 数据库表统计:")
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
    tables = cursor.fetchall()
    for table in tables:
        cursor.execute(f"SELECT COUNT(*) FROM {table[0]}")
        count = cursor.fetchone()[0]
        print(f"  {table[0]}: {count} 条记录")

    # 2. 分析K线数据的时间分布
    print("\n⏰ K线数据时间分布分析:")
    cursor.execute("""
        SELECT
            timestamp,
            substr(timestamp, 12, 2) as hour,
            substr(timestamp, 15, 2) as minute
        FROM kline_minute
        WHERE period='1'
        ORDER BY timestamp DESC
    """)

    rows = cursor.fetchall()

    valid_count = 0
    invalid_count = 0
    invalid_samples = []

    hour_dist = {}

    for row in rows:
        timestamp = row[0]
        hour = int(row[1])
        minute = int(row[2])

        hour_dist[hour] = hour_dist.get(hour, 0) + 1

        is_valid, session = is_valid_trading_time(hour, minute)

        if is_valid:
            valid_count += 1
        else:
            invalid_count += 1
            if len(invalid_samples) < 10:
                invalid_samples.append((timestamp, hour, minute))

    print(f"\n✅ 有效交易时段数据: {valid_count} 条 ({valid_count/len(rows)*100:.1f}%)")
    print(f"❌ 无效交易时段数据: {invalid_count} 条 ({invalid_count/len(rows)*100:.1f}%)")

    if invalid_samples:
        print(f"\n🚨 无效数据样本（前10条）:")
        for ts, h, m in invalid_samples:
            print(f"  {ts} (凌晨/非交易时段)")

    # 3. 各小时数据分布
    print(f"\n📈 各小时数据分布:")
    for hour in sorted(hour_dist.keys()):
        count = hour_dist[hour]
        is_trading = any(
            start_h <= hour < end_h
            for start_h, start_m, end_h, end_m in TRADING_HOURS['day'] + TRADING_HOURS['night']
        )
        status = "✅ 交易时段" if is_trading else "❌ 非交易时段"
        print(f"  {hour:02d}时: {count:4d} 条  {status}")

    # 4. 检查realtime_quote表
    print(f"\n💹 实时行情数据:")
    cursor.execute("SELECT COUNT(*) FROM realtime_quote")
    tick_count = cursor.fetchone()[0]
    print(f"  realtime_quote表: {tick_count} 条记录")

    if tick_count > 0:
        cursor.execute("SELECT timestamp, price FROM realtime_quote ORDER BY timestamp DESC LIMIT 5")
        ticks = cursor.fetchall()
        print(f"  最新5条tick数据:")
        for ts, price in ticks:
            print(f"    {ts} | 价格: {price}")

    # 5. 数据来源分析
    print(f"\n🔍 数据来源分析:")
    cursor.execute("SELECT MIN(timestamp), MAX(timestamp) FROM kline_minute")
    min_ts, max_ts = cursor.fetchone()
    print(f"  最早数据: {min_ts}")
    print(f"  最新数据: {max_ts}")

    if max_ts:
        latest = datetime.fromisoformat(max_ts)
        now = datetime.now()
        age_minutes = (now - latest).total_seconds() / 60
        print(f"  数据新鲜度: {age_minutes:.1f} 分钟前")

        if age_minutes > 60:
            print(f"  ⚠️ 数据已过期超过1小时，可能不是实时数据")

    # 6. 结论
    print(f"\n" + "=" * 70)
    print("📋 诊断结论:")
    print("=" * 70)

    if invalid_count > valid_count:
        print("❌ 数据库中大部分是无效数据（非交易时段）")
        print("   → 这些很可能是模拟/测试数据，不是真实市场行情")
        print("   → 建议：清空数据库，让系统从TqSDK重新拉取真实数据")
    elif invalid_count > 0:
        print("⚠️ 数据库中存在部分无效数据")
        print("   → 可能混合了真实数据和模拟数据")
    else:
        print("✅ 所有数据都在有效交易时段内")
        print("   → 数据看起来是真实的市场行情")

    conn.close()

if __name__ == "__main__":
    main()
