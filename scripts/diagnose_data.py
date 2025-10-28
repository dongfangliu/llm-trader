"""
数据诊断脚本 - 检查数据库数据质量
"""
import sys
sys.path.insert(0, 'C:\\Users\\Administrator\\Desktop\\trader')

from src.data_fetcher.database import Database
import json

def diagnose_kline_data():
    """诊断 K线数据"""
    print("=" * 60)
    print("K线数据诊断")
    print("=" * 60)

    db = Database("data/market_data.db")

    # 获取最近的 K线数据
    query = """
        SELECT timestamp, open, high, low, close, volume
        FROM kline_minute
        ORDER BY id DESC
        LIMIT 10
    """
    rows = db.conn.execute(query).fetchall()

    if not rows:
        print("[ERROR] 数据库中没有 K线数据！")
        return False

    print(f"\n[OK] 找到 {len(rows)} 条最新K线数据")
    print("\n最新的 5 条记录:")
    print("-" * 80)
    print(f"{'时间':<22} {'开盘':<10} {'最高':<10} {'最低':<10} {'收盘':<10} {'成交量':<10}")
    print("-" * 80)

    data_ok = True
    for row in rows[:5]:
        timestamp, open_p, high, low, close, volume = row
        print(f"{timestamp:<22} {open_p:<10.2f} {high:<10.2f} {low:<10.2f} {close:<10.2f} {volume:<10}")

        # 检查数据是否为 0
        if close == 0 or open_p == 0:
            print(f"  [WARN] 警告: 价格为 0!")
            data_ok = False

        if high < low:
            print(f"  [WARN] 警告: 最高价 < 最低价!")
            data_ok = False

        if close > high or close < low:
            print(f"  [WARN] 警告: 收盘价超出最高/最低范围!")
            data_ok = False

    if data_ok:
        print("\n[OK] K线数据质量检查通过")
    else:
        print("\n[ERROR] K线数据存在问题")

    return data_ok


def diagnose_account_data():
    """诊断账户数据"""
    print("\n" + "=" * 60)
    print("账户数据诊断")
    print("=" * 60)

    db = Database("data/market_data.db")

    # 检查 trades 表
    query = "SELECT COUNT(*) FROM trades"
    try:
        count = db.conn.execute(query).fetchone()[0]
        print(f"\n[OK] 交易记录数: {count}")
    except Exception as e:
        print(f"\n[ERROR] 无法查询交易记录: {e}")
        return False

    # 获取最近的交易
    if count > 0:
        query = """
            SELECT timestamp, action, price, quantity, profit
            FROM trades
            ORDER BY id DESC
            LIMIT 5
        """
        rows = db.conn.execute(query).fetchall()
        print("\n最近的 5 笔交易:")
        print("-" * 80)
        for row in rows:
            print(f"  {row[0]} | {row[1]} | ¥{row[2]:.2f} | {row[3]} 手 | 盈亏: ¥{row[4] or 0:.2f}")

    return True


def diagnose_api_response():
    """模拟 API 响应格式"""
    print("\n" + "=" * 60)
    print("API 响应格式诊断")
    print("=" * 60)

    db = Database("data/market_data.db")

    # 模拟 /api/kline/1m 接口
    query = """
        SELECT timestamp, open, high, low, close, volume
        FROM kline_minute
        ORDER BY id DESC
        LIMIT 10
    """
    rows = db.conn.execute(query).fetchall()

    if not rows:
        print("\n[ERROR] 数据库返回空数据！这会导致前端黑屏！")
        return False

    # 构造 API 响应
    klines = []
    for row in rows:
        klines.append({
            "timestamp": row[0],
            "open": row[1],
            "high": row[2],
            "low": row[3],
            "close": row[4],
            "volume": row[5]
        })

    api_response = {
        "code": 200,
        "message": "success",
        "data": {
            "klines": klines[::-1]  # 反转，最旧的在前
        }
    }

    print("\n模拟 API 响应 (前 2 条):")
    print(json.dumps(api_response["data"]["klines"][:2], indent=2, ensure_ascii=False))

    # 检查数据完整性
    for i, kline in enumerate(klines):
        if kline["close"] == 0:
            print(f"\n[ERROR] 第 {i+1} 条数据的收盘价为 0！")
            return False
        if kline["timestamp"] is None or kline["timestamp"] == "":
            print(f"\n[ERROR] 第 {i+1} 条数据的时间戳为空！")
            return False

    print("\n[OK] API 响应格式正常")
    return True


def check_data_continuity():
    """检查数据连续性"""
    print("\n" + "=" * 60)
    print("数据连续性检查")
    print("=" * 60)

    db = Database("data/market_data.db")

    query = """
        SELECT COUNT(*) as cnt,
               MAX(timestamp) as latest,
               MIN(timestamp) as earliest
        FROM kline_minute
    """
    row = db.conn.execute(query).fetchone()

    count, latest, earliest = row
    print(f"\n总数据量: {count} 条")
    print(f"最早时间: {earliest}")
    print(f"最新时间: {latest}")

    # 检查最近 5 分钟是否有新数据
    from datetime import datetime, timedelta

    if latest:
        latest_dt = datetime.fromisoformat(latest.replace('Z', '+00:00'))
        now = datetime.now()
        time_diff = now - latest_dt.replace(tzinfo=None)

        print(f"距离现在: {time_diff}")

        if time_diff.total_seconds() > 300:  # 超过 5 分钟
            print(f"\n[WARN] 警告: 数据已经 {time_diff} 没有更新了！")
            print("   这可能导致前端一直显示旧数据或加载中...")
            return False
        else:
            print("\n[OK] 数据更新及时")
            return True
    else:
        print("\n[ERROR] 无法获取最新时间戳")
        return False


if __name__ == "__main__":
    print("\n[Diagnose] 开始数据诊断...\n")

    results = {
        "kline": diagnose_kline_data(),
        "account": diagnose_account_data(),
        "api": diagnose_api_response(),
        "continuity": check_data_continuity()
    }

    print("\n" + "=" * 60)
    print("诊断总结")
    print("=" * 60)

    all_ok = all(results.values())

    for key, value in results.items():
        status = "[OK] 正常" if value else "[ERROR] 异常"
        print(f"{key.upper()}: {status}")

    if all_ok:
        print("\n[OK] 所有检查通过！数据库状态正常。")
        print("\n建议操作：")
        print("1. 打开浏览器开发者工具 (F12)")
        print("2. 切换到 Console 标签，查看是否有 JavaScript 错误")
        print("3. 切换到 Network 标签，查看 API 请求是否正常")
    else:
        print("\n[ERROR] 发现数据问题！这可能是导致前端黑屏的原因。")
        print("\n建议操作：")
        print("1. 检查交易系统是否正在运行")
        print("2. 检查 TqSDK 数据连接是否正常")
        print("3. 考虑重启交易系统: python start_web_v2.py")

    print("\n" + "=" * 60)
