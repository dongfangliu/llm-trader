"""
完全清空数据库所有表
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
db_path = project_root / "data" / "market_data.db"

print("=" * 70)
print("清空数据库所有数据")
print("=" * 70)

conn = sqlite3.connect(str(db_path))
cursor = conn.cursor()

# 要清空的所有表
tables = [
    'kline_minute',
    'kline_daily',
    'realtime_quote',
    'trades',
    'decisions',
    'reviews',
    'lessons',
    'signals',
    'strategy_signals',
    'market_regime_history',
    'trend_alignment'
]

print("\n开始清空数据...")

for table in tables:
    try:
        cursor.execute(f'DELETE FROM {table}')
        count = cursor.execute(f'SELECT COUNT(*) FROM {table}').fetchone()[0]
        print(f"✓ {table}: 已清空（当前 {count} 条）")
    except Exception as e:
        print(f"✗ {table}: 清空失败 - {e}")

conn.commit()

print("\n" + "=" * 70)
print("数据统计:")
print("=" * 70)

total = 0
for table in tables:
    try:
        count = cursor.execute(f'SELECT COUNT(*) FROM {table}').fetchone()[0]
        print(f"  {table:25s}: {count:5d} 条")
        total += count
    except:
        pass

print("=" * 70)
print(f"总计: {total} 条记录")
print("=" * 70)

if total == 0:
    print("\n✅ 数据库已完全清空！")
else:
    print(f"\n⚠️ 仍有 {total} 条记录")

conn.close()
