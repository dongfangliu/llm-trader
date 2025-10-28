"""
数据初始化脚本 - 启动时从 TqSDK 拉取真实数据填充数据库

用途：当数据库为空或需要重新初始化时，从 TqSDK 拉取历史和实时数据
使用：python scripts/init_realtime_data.py
"""

import sys
from pathlib import Path
from datetime import datetime, timedelta

# 确保项目根目录在路径中（兼容不同的启动方式）
project_root = Path(__file__).parent.parent
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))
if str(project_root / 'src') not in sys.path:
    sys.path.insert(0, str(project_root / 'src'))

import pandas as pd
from loguru import logger

from src.data_fetcher.database import Database
from src.data_fetcher.tqsdk_client import TqSdkClient


def check_database_empty(db: Database) -> bool:
    """检查数据库是否为空"""
    try:
        # 检查 kline_minute 表
        query = "SELECT COUNT(*) as count FROM kline_minute"
        df = pd.read_sql(query, db.conn)

        minute_count = df.iloc[0]['count'] if not df.empty else 0

        # 检查 kline_daily 表
        query = "SELECT COUNT(*) as count FROM kline_daily"
        df = pd.read_sql(query, db.conn)

        daily_count = df.iloc[0]['count'] if not df.empty else 0

        is_empty = minute_count == 0 and daily_count == 0

        logger.info(f"📊 数据库状态: kline_minute={minute_count}, kline_daily={daily_count}")
        return is_empty
    except Exception as e:
        logger.error(f"检查数据库出错: {e}")
        return True


def fetch_and_store_data(db: Database, days: int = 7):
    """从 TqSDK 拉取数据并存储到数据库"""

    logger.info(f"🔄 开始从 TqSDK 拉取 {days} 天的历史数据...")

    try:
        import yaml

        # 读取 TqSDK 配置
        config_path = project_root / "config" / "api_keys.yaml"
        with open(config_path, 'r', encoding='utf-8') as f:
            config = yaml.safe_load(f)

        tqsdk_config = config.get('tqsdk', {})

        # 创建 TqSDK 客户端
        client = TqSdkClient(
            symbol="CZCE.SA601",
            auth_username=tqsdk_config.get('username'),
            auth_password=tqsdk_config.get('password'),
            use_sim=tqsdk_config.get('use_sim', True)
        )

        logger.info(f"✅ TqSDK 客户端已连接")

        # 拉取分钟线数据
        logger.info("📥 拉取分钟线数据 (1m, 5m, 15m, 1h, 4h)...")

        periods = {
            '1': '1分钟线',
            '5': '5分钟线',
            '15': '15分钟线',
            '60': '1小时线',
            '240': '4小时线'
        }

        for period, desc in periods.items():
            try:
                logger.info(f"  拉取 {desc} ({period}分钟)...")
                df = client.get_minute_kline(period=period, count=500)  # 拉取约10天的数据

                if df is not None and not df.empty:
                    logger.info(f"  ✓ 获得 {len(df)} 根{desc}")

                    # 批量插入
                    insert_sql = """
                        INSERT OR REPLACE INTO kline_minute
                        (timestamp, period, open, high, low, close, volume)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                    """

                    for _, row in df.iterrows():
                        try:
                            # 将timestamp转换为字符串（处理pandas Timestamp）
                            timestamp_str = str(row['timestamp'])

                            db.conn.execute(insert_sql, (
                                timestamp_str,
                                period,
                                float(row['open']),
                                float(row['high']),
                                float(row['low']),
                                float(row['close']),
                                int(row['volume'])
                            ))
                        except Exception as e:
                            # 如果重复插入，忽略错误
                            if 'UNIQUE' not in str(e):
                                logger.warning(f"    插入失败: {e}")

                    db.conn.commit()
                else:
                    logger.warning(f"  ✗ 未获得{desc}数据")

            except Exception as e:
                logger.error(f"  ✗ 拉取{desc}失败: {e}")
                continue

        # 拉取日线数据
        logger.info("📥 拉取日线数据...")
        try:
            df = client.get_daily_kline(days=days)

            if df is not None and not df.empty:
                logger.info(f"✓ 获得 {len(df)} 根日线")

                insert_sql = """
                    INSERT OR REPLACE INTO kline_daily
                    (timestamp, open, high, low, close, volume)
                    VALUES (?, ?, ?, ?, ?, ?)
                """

                for _, row in df.iterrows():
                    try:
                        # 将timestamp转换为字符串（处理pandas Timestamp）
                        timestamp_str = str(row['timestamp'])

                        db.conn.execute(insert_sql, (
                            timestamp_str,
                            float(row['open']),
                            float(row['high']),
                            float(row['low']),
                            float(row['close']),
                            int(row['volume'])
                        ))
                    except Exception as e:
                        if 'UNIQUE' not in str(e):
                            logger.warning(f"插入日线失败: {e}")

                db.conn.commit()
            else:
                logger.warning("未获得日线数据")

        except Exception as e:
            logger.error(f"拉取日线失败: {e}")

        client.close()

        logger.info("✅ 数据初始化完成！")

        # 验证
        verify_database(db)

        return True

    except Exception as e:
        logger.error(f"❌ 数据初始化失败: {e}")
        import traceback
        logger.debug(traceback.format_exc())
        return False


def verify_database(db: Database):
    """验证数据库中的数据"""

    try:
        query = "SELECT COUNT(*) as count FROM kline_minute"
        df = pd.read_sql(query, db.conn)
        minute_count = df.iloc[0]['count'] if not df.empty else 0

        query = "SELECT COUNT(*) as count FROM kline_daily"
        df = pd.read_sql(query, db.conn)
        daily_count = df.iloc[0]['count'] if not df.empty else 0

        logger.info(f"📊 数据库验证结果:")
        logger.info(f"   分钟线: {minute_count} 条")
        logger.info(f"   日线: {daily_count} 条")

        if minute_count > 0:
            # 显示最新数据
            query = """
                SELECT timestamp, period, close FROM kline_minute
                ORDER BY timestamp DESC
                LIMIT 1
            """
            df = pd.read_sql(query, db.conn)
            if not df.empty:
                latest = df.iloc[0]
                logger.info(f"   最新数据: {latest['timestamp']} (period={latest['period']}) close={latest['close']}")

    except Exception as e:
        logger.error(f"验证失败: {e}")


def main():
    """主函数"""

    logger.info("=" * 60)
    logger.info("纯碱期货交易系统 - 数据初始化")
    logger.info("=" * 60)

    # 连接数据库
    db_path = project_root / "data" / "market_data.db"
    db = Database(str(db_path))

    # 检查数据库是否为空
    if not check_database_empty(db):
        logger.info("✓ 数据库已有数据，无需初始化")
        return

    logger.warning("⚠️ 数据库为空，需要初始化")

    # 从 TqSDK 拉取数据
    success = fetch_and_store_data(db, days=7)

    if success:
        logger.info("✅ 初始化成功！前端现在可以显示真实数据了")
    else:
        logger.error("❌ 初始化失败，请检查 TqSDK 配置和网络连接")

    logger.info("=" * 60)


if __name__ == '__main__':
    main()
