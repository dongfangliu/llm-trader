"""
测试API修复效果
验证数据库表和API端点是否正常工作
"""

import requests
import sqlite3
from pathlib import Path
from loguru import logger

# API基础URL
BASE_URL = "http://localhost:8000"

# 数据库路径
project_root = Path(__file__).parent.parent
db_path = project_root / "data" / "market_data.db"


def test_database_tables():
    """测试数据库表是否存在"""
    logger.info("1️⃣ 测试数据库表...")

    try:
        conn = sqlite3.connect(str(db_path))
        cursor = conn.cursor()

        # 获取所有表
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = [row[0] for row in cursor.fetchall()]

        # 检查必需的表
        required_tables = [
            'strategy_signals',
            'market_regime_history',
            'trend_alignment'
        ]

        missing_tables = [t for t in required_tables if t not in tables]

        if missing_tables:
            logger.error(f"❌ 缺失的表: {', '.join(missing_tables)}")
            return False
        else:
            logger.info(f"✅ 所有必需的表都存在")
            logger.info(f"   数据库包含 {len(tables)} 个表: {', '.join(tables)}")
            return True

    except Exception as e:
        logger.error(f"❌ 数据库测试失败: {e}")
        return False
    finally:
        conn.close()


def test_api_endpoint(endpoint: str, name: str):
    """测试API端点"""
    try:
        url = f"{BASE_URL}{endpoint}"
        response = requests.get(url, timeout=5)

        if response.status_code == 200:
            data = response.json()
            logger.info(f"✅ {name}: 状态码 {response.status_code}")
            return True
        else:
            logger.error(f"❌ {name}: 状态码 {response.status_code}")
            return False

    except Exception as e:
        logger.error(f"❌ {name}: {e}")
        return False


def main():
    """主测试函数"""
    logger.info("=" * 60)
    logger.info("🧪 开始测试API修复效果")
    logger.info("=" * 60)

    results = []

    # 1. 测试数据库表
    results.append(("数据库表", test_database_tables()))

    logger.info("\n2️⃣ 测试API端点...")

    # 2. 测试各个API端点
    api_tests = [
        ("/api/v1/market-regime/current", "市场状态API"),
        ("/api/v1/strategy/signal-source-distribution", "信号来源分布API"),
        ("/api/v1/kline?period=1m&limit=100", "K线数据API"),
        ("/api/v1/account", "账户信息API"),
        ("/api/v1/data-source", "数据源信息API"),
    ]

    for endpoint, name in api_tests:
        results.append((name, test_api_endpoint(endpoint, name)))

    # 3. 汇总结果
    logger.info("\n" + "=" * 60)
    logger.info("📊 测试结果汇总")
    logger.info("=" * 60)

    passed = sum(1 for _, result in results if result)
    total = len(results)

    for name, result in results:
        status = "✅ 通过" if result else "❌ 失败"
        logger.info(f"{status}: {name}")

    logger.info("=" * 60)
    logger.info(f"总计: {passed}/{total} 通过")

    if passed == total:
        logger.info("🎉 所有测试通过！")
        print("\n✅ 修复成功！所有功能正常工作。")
    else:
        logger.warning(f"⚠️ 有 {total - passed} 个测试失败")
        print(f"\n⚠️ 部分测试失败，请检查日志。")


if __name__ == "__main__":
    main()
