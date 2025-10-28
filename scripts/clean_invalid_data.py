"""
清理数据库中的无效数据（非交易时段数据）
"""

import sqlite3
import sys
import io
from pathlib import Path
import platform

# Windows console UTF-8 support
if platform.system() == "Windows":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

project_root = Path(__file__).parent.parent

def is_valid_trading_time(hour, minute):
    """检查是否在有效交易时段"""
    time_minutes = hour * 60 + minute

    # 日盘时段
    day_sessions = [
        (9 * 60, 10 * 60 + 15),      # 9:00-10:15
        (10 * 60 + 30, 11 * 60 + 30),  # 10:30-11:30
        (13 * 60 + 30, 15 * 60),     # 13:30-15:00
    ]

    # 夜盘时段
    night_sessions = [
        (21 * 60, 23 * 60),          # 21:00-23:00
    ]

    for start, end in day_sessions + night_sessions:
        if start <= time_minutes < end:
            return True

    return False

def main():
    db_path = project_root / "data" / "market_data.db"

    if not db_path.exists():
        print(f"❌ 数据库文件不存在: {db_path}")
        return

    print("=" * 70)
    print("🧹 清理无效数据")
    print("=" * 70)

    conn = sqlite3.connect(str(db_path))
    cursor = conn.cursor()

    # 统计原始数据
    cursor.execute("SELECT COUNT(*) FROM kline_minute")
    original_count = cursor.fetchone()[0]
    print(f"\n原始K线数据: {original_count} 条")

    # 分析并删除无效数据
    cursor.execute("""
        SELECT
            id,
            timestamp,
            CAST(substr(timestamp, 12, 2) AS INTEGER) as hour,
            CAST(substr(timestamp, 15, 2) AS INTEGER) as minute
        FROM kline_minute
    """)

    rows = cursor.fetchall()
    invalid_ids = []

    for row in rows:
        row_id, timestamp, hour, minute = row
        if not is_valid_trading_time(hour, minute):
            invalid_ids.append(row_id)

    print(f"发现无效数据: {len(invalid_ids)} 条")

    if invalid_ids:
        print(f"\n是否删除这些无效数据？(y/n): ", end='')
        choice = input().strip().lower()

        if choice == 'y':
            # 分批删除（避免SQL语句过长）
            batch_size = 100
            for i in range(0, len(invalid_ids), batch_size):
                batch = invalid_ids[i:i+batch_size]
                placeholders = ','.join('?' * len(batch))
                cursor.execute(f"DELETE FROM kline_minute WHERE id IN ({placeholders})", batch)

            conn.commit()

            # 统计清理后数据
            cursor.execute("SELECT COUNT(*) FROM kline_minute")
            final_count = cursor.fetchone()[0]

            print(f"\n✅ 清理完成")
            print(f"  删除: {len(invalid_ids)} 条")
            print(f"  保留: {final_count} 条")
            print(f"  清理率: {len(invalid_ids)/original_count*100:.1f}%")
        else:
            print("❌ 取消清理")
    else:
        print("✅ 没有发现无效数据")

    # 清空realtime_quote表（如果有旧数据）
    cursor.execute("DELETE FROM realtime_quote")
    conn.commit()
    print(f"\n🗑️  已清空realtime_quote表")

    conn.close()

    print("\n" + "=" * 70)
    print("💡 提示：系统将在下次开盘时自动从TqSDK拉取真实数据")
    print("   夜盘开盘时间: 21:00")
    print("   日盘开盘时间: 09:00")
    print("=" * 70)

if __name__ == "__main__":
    main()
