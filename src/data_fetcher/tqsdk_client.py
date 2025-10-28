"""
TqSDK数据客户端封装
负责从TqSDK获取纯碱期货数据
使用单例模式，维护长连接
"""

import pandas as pd
from datetime import datetime, timedelta
from loguru import logger
from typing import Optional, Dict
import os
import asyncio
import threading
import time


# 全局单例
_client_instance = None
_client_lock = threading.Lock()


class TqSdkClient:
    """TqSDK数据客户端"""

    def __init__(self,
                 symbol: str = "CZCE.SA0",
                 auth_username: Optional[str] = None,
                 auth_password: Optional[str] = None,
                 use_sim: bool = True):
        """
        初始化TqSDK客户端

        Args:
            symbol: 期货合约代码
                   - CZCE.SA0: 纯碱主力合约
                   - CZCE.SA2601: 2026年1月合约
                   注意：TqSDK使用交易所.合约代码格式
            auth_username: 天勤账户用户名（优先使用环境变量 TQSDK_USERNAME）
            auth_password: 天勤账户密码（优先使用环境变量 TQSDK_PASSWORD）
            use_sim: 是否使用模拟账户
        """
        self.symbol = symbol
        self.use_sim = use_sim

        # 从环境变量或参数获取认证信息
        self.auth_username = os.getenv("TQSDK_USERNAME", auth_username)
        self.auth_password = os.getenv("TQSDK_PASSWORD", auth_password)

        # 延迟导入和初始化TqApi（避免在非交易时段阻塞）
        self._api = None
        self._quote = None
        self._connected = False

        logger.info(f"TqSDK客户端配置完成，合约: {symbol}, 模拟账户: {use_sim}")

    def _init_api(self):
        """初始化TqAPI连接（延迟初始化）"""
        if self._api is not None and self._connected:
            return True

        try:
            from tqsdk import TqApi, TqAuth, TqSim

            if not self.auth_username or not self.auth_password:
                logger.error("TqSDK认证信息未配置，请设置环境变量 TQSDK_USERNAME 和 TQSDK_PASSWORD")
                return False

            # 创建认证对象
            auth = TqAuth(self.auth_username, self.auth_password)

            # 创建API实例
            if self.use_sim:
                # 使用模拟账户
                self._api = TqApi(auth=auth, account=TqSim())
                logger.info("TqSDK连接成功（模拟账户）")
            else:
                # 仅获取行情（不交易）
                self._api = TqApi(auth=auth)
                logger.info("TqSDK连接成功（行情模式）")

            # 订阅行情
            self._quote = self._api.get_quote(self.symbol)
            self._connected = True

            return True

        except ImportError:
            logger.error("TqSDK未安装，请运行: pip install tqsdk")
            return False
        except Exception as e:
            logger.error(f"TqSDK连接失败: {e}")
            import traceback
            logger.debug(traceback.format_exc())
            return False

    def get_realtime_price(self) -> Optional[Dict]:
        """
        获取实时行情（包含盘口数据）

        Returns:
            dict: {
                'symbol': 'CZCE.SA0',
                'price': 1850.0,
                'open': 1845.0,
                'high': 1855.0,
                'low': 1840.0,
                'volume': 12000,
                'timestamp': datetime,

                # 新增：五档买卖盘口
                'bid_price1': 1849.5,
                'bid_volume1': 100,
                'ask_price1': 1850.5,
                'ask_volume1': 80,
                # ... bid_price2~5, ask_price2~5
            }
        """
        try:
            # 确保API已初始化
            if not self._connected and not self._init_api():
                return None

            # 等待数据更新（避免在协程中调用 wait_update）
            try:
                asyncio.get_running_loop()
                # 在协程环境中：不调用 wait_update，直接读取当前缓存数据
                pass
            except RuntimeError:
                # 非协程环境：阻塞等待最多2秒
                import time
                self._api.wait_update(deadline=time.time() + 2)

            # 提取行情数据
            # 处理时间戳：可能是纳秒整数或字符串格式
            quote_datetime = self._quote.datetime
            if isinstance(quote_datetime, str):
                # 字符串格式，直接解析
                timestamp = pd.to_datetime(quote_datetime).to_pydatetime()
            else:
                # 纳秒整数格式，需要转换
                timestamp = datetime.fromtimestamp(quote_datetime / 1e9)

            data = {
                'symbol': self.symbol,
                'price': float(self._quote.last_price),
                'open': float(self._quote.open),
                'high': float(self._quote.highest),
                'low': float(self._quote.lowest),
                'volume': int(self._quote.volume),
                'timestamp': timestamp,

                # 新增：五档买卖盘口
                'bid_price1': float(self._quote.bid_price1) if hasattr(self._quote, 'bid_price1') else 0.0,
                'bid_volume1': int(self._quote.bid_volume1) if hasattr(self._quote, 'bid_volume1') else 0,
                'bid_price2': float(self._quote.bid_price2) if hasattr(self._quote, 'bid_price2') else 0.0,
                'bid_volume2': int(self._quote.bid_volume2) if hasattr(self._quote, 'bid_volume2') else 0,
                'bid_price3': float(self._quote.bid_price3) if hasattr(self._quote, 'bid_price3') else 0.0,
                'bid_volume3': int(self._quote.bid_volume3) if hasattr(self._quote, 'bid_volume3') else 0,
                'bid_price4': float(self._quote.bid_price4) if hasattr(self._quote, 'bid_price4') else 0.0,
                'bid_volume4': int(self._quote.bid_volume4) if hasattr(self._quote, 'bid_volume4') else 0,
                'bid_price5': float(self._quote.bid_price5) if hasattr(self._quote, 'bid_price5') else 0.0,
                'bid_volume5': int(self._quote.bid_volume5) if hasattr(self._quote, 'bid_volume5') else 0,

                'ask_price1': float(self._quote.ask_price1) if hasattr(self._quote, 'ask_price1') else 0.0,
                'ask_volume1': int(self._quote.ask_volume1) if hasattr(self._quote, 'ask_volume1') else 0,
                'ask_price2': float(self._quote.ask_price2) if hasattr(self._quote, 'ask_price2') else 0.0,
                'ask_volume2': int(self._quote.ask_volume2) if hasattr(self._quote, 'ask_volume2') else 0,
                'ask_price3': float(self._quote.ask_price3) if hasattr(self._quote, 'ask_price3') else 0.0,
                'ask_volume3': int(self._quote.ask_volume3) if hasattr(self._quote, 'ask_volume3') else 0,
                'ask_price4': float(self._quote.ask_price4) if hasattr(self._quote, 'ask_price4') else 0.0,
                'ask_volume4': int(self._quote.ask_volume4) if hasattr(self._quote, 'ask_volume4') else 0,
                'ask_price5': float(self._quote.ask_price5) if hasattr(self._quote, 'ask_price5') else 0.0,
                'ask_volume5': int(self._quote.ask_volume5) if hasattr(self._quote, 'ask_volume5') else 0,
            }

            logger.debug(f"实时价格: {data['price']}, 买一: {data['bid_price1']}, 卖一: {data['ask_price1']}")
            return data

        except Exception as e:
            logger.error(f"获取实时行情失败: {e}")
            import traceback
            logger.debug(traceback.format_exc())
            return None

    def get_minute_kline(self, period: str = "15", count: int = 100) -> Optional[pd.DataFrame]:
        """
        获取分钟K线数据

        Args:
            period: K线周期，"1", "5", "15", "30", "60"
            count: 获取K线数量

        Returns:
            DataFrame: 包含 timestamp, open, high, low, close, volume
        """
        try:
            if not self._connected and not self._init_api():
                return None

            # TqSDK使用秒数表示周期
            period_seconds = int(period) * 60

            # 获取K线数据
            klines = self._api.get_kline_serial(
                self.symbol,
                duration_seconds=period_seconds,
                data_length=count
            )

            if klines is None or klines.empty:
                logger.warning(f"未获取到{self.symbol}分钟K线")
                return None

            # 转换为标准格式
            df = pd.DataFrame({
                'timestamp': pd.to_datetime(klines['datetime']),
                'open': klines['open'].astype(float),
                'high': klines['high'].astype(float),
                'low': klines['low'].astype(float),
                'close': klines['close'].astype(float),
                'volume': klines['volume'].astype(int)
            })

            logger.info(f"获取到{len(df)}根{period}分钟K线")
            return df

        except Exception as e:
            logger.error(f"获取分钟K线失败: {e}")
            import traceback
            logger.debug(traceback.format_exc())
            return None

    def get_daily_kline(self, days: int = 30) -> Optional[pd.DataFrame]:
        """
        获取日K线数据

        Args:
            days: 获取最近N天数据

        Returns:
            DataFrame: 包含 timestamp, open, high, low, close, volume
        """
        try:
            if not self._connected and not self._init_api():
                return None

            # TqSDK日K线：86400秒 = 1天
            klines = self._api.get_kline_serial(
                self.symbol,
                duration_seconds=86400,
                data_length=days
            )

            if klines is None or klines.empty:
                logger.warning(f"未获取到{self.symbol}日K线")
                return None

            # 转换为标准格式
            df = pd.DataFrame({
                'timestamp': pd.to_datetime(klines['datetime']),
                'open': klines['open'].astype(float),
                'high': klines['high'].astype(float),
                'low': klines['low'].astype(float),
                'close': klines['close'].astype(float),
                'volume': klines['volume'].astype(int)
            })

            logger.info(f"获取到{len(df)}根日K线")
            return df

        except Exception as e:
            logger.error(f"获取日K线失败: {e}")
            import traceback
            logger.debug(traceback.format_exc())
            return None

    def get_tick_serial(self, count: int = 1000) -> Optional[pd.DataFrame]:
        """
        获取tick序列数据（用于分时图）

        Args:
            count: 获取tick数量（默认1000条）

        Returns:
            DataFrame: 包含 timestamp, last_price, volume, bid_price1, ask_price1
        """
        try:
            if not self._connected and not self._init_api():
                return None

            # 获取tick序列
            ticks = self._api.get_tick_serial(self.symbol, data_length=count)

            # 等待数据更新
            try:
                asyncio.get_running_loop()
            except RuntimeError:
                import time
                self._api.wait_update(deadline=time.time() + 2)

            # 转换为DataFrame
            df = pd.DataFrame({
                'datetime': pd.to_datetime(ticks['datetime']),
                'last_price': ticks['last_price'],
                'volume': ticks['volume'],
                'bid_price1': ticks['bid_price1'],
                'ask_price1': ticks['ask_price1'],
            })

            logger.debug(f"获取到 {len(df)} 条tick数据")
            return df

        except Exception as e:
            logger.error(f"获取tick序列失败: {e}")
            import traceback
            logger.debug(traceback.format_exc())
            return None

    def test_connection(self) -> bool:
        """
        测试连接是否正常（轻量级检查，不获取数据）

        Returns:
            bool: 连接是否成功
        """
        try:
            # 只检查连接状态，不主动获取数据
            if self._connected and self._api is not None:
                logger.debug(f"TqSDK连接已建立（合约: {self.symbol}）")
                return True

            # 如果未连接，尝试初始化
            logger.info(f"初始化TqSDK连接，合约: {self.symbol}")
            if self._init_api():
                logger.info(f"TqSDK连接成功（合约: {self.symbol}）")
                return True
            else:
                logger.warning("TqSDK连接失败")
                return False

        except Exception as e:
            logger.error(f"TqSDK连接测试失败: {e}")
            import traceback
            logger.debug(traceback.format_exc())
            return False

    def close(self):
        """关闭连接"""
        if self._api:
            try:
                self._api.close()
                logger.info("TqSDK连接已关闭")
            except Exception as e:
                logger.error(f"关闭TqSDK连接失败: {e}")
            finally:
                self._api = None
                self._connected = False

    def get_api(self):
        """获取TqApi实例（供外部wait_update使用）"""
        if not self._connected:
            self._init_api()
        return self._api

    def get_quote_obj(self):
        """获取quote对象（供外部is_changing使用）"""
        if not self._connected:
            self._init_api()
        return self._quote


def get_tqsdk_client(
    symbol: str = "KQ.m@CZCE.SA",
    auth_username: Optional[str] = None,
    auth_password: Optional[str] = None,
    use_sim: bool = True
) -> TqSdkClient:
    """
    获取TqSDK客户端单例

    Args:
        symbol: 期货合约代码
        auth_username: 认证用户名
        auth_password: 认证密码
        use_sim: 是否使用模拟账户

    Returns:
        TqSdkClient单例
    """
    global _client_instance

    with _client_lock:
        if _client_instance is None:
            logger.info("创建TqSDK客户端单例...")
            _client_instance = TqSdkClient(
                symbol=symbol,
                auth_username=auth_username,
                auth_password=auth_password,
                use_sim=use_sim
            )
            # 立即初始化连接
            _client_instance._init_api()

        return _client_instance


def close_tqsdk_client():
    """关闭TqSDK客户端单例"""
    global _client_instance

    with _client_lock:
        if _client_instance is not None:
            _client_instance.close()
            _client_instance = None
            logger.info("TqSDK客户端单例已关闭")


if __name__ == "__main__":
    # 测试代码
    import sys
    # 设置输出编码为UTF-8
    if sys.platform == 'win32':
        import io
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

    print("="*60)
    print("TqSDK纯碱期货数据接口测试")
    print("="*60)

    # 创建客户端（需要配置环境变量 TQSDK_USERNAME 和 TQSDK_PASSWORD）
    client = TqSdkClient("CZCE.SA0", use_sim=True)

    print("\n[1] 测试连接...")
    if client.test_connection():
        print("连接测试通过！")

        print("\n[2] 测试实时行情获取...")
        price = client.get_realtime_price()
        if price:
            print("成功！实时行情:")
            for key, value in price.items():
                print(f"   {key}: {value}")
        else:
            print("失败：未获取到实时行情")

        print("\n[3] 测试15分钟K线获取...")
        kline = client.get_minute_kline(period="15", count=20)
        if kline is not None and not kline.empty:
            print(f"成功！获取到{len(kline)}根K线")
            print(f"\n最近5根K线:")
            print(kline.tail())
        else:
            print("失败：未获取到分钟K线")

        print("\n[4] 测试日K线获取...")
        daily = client.get_daily_kline(days=10)
        if daily is not None and not daily.empty:
            print(f"成功！获取到{len(daily)}根日K线")
            print(f"\n最近5根日K线:")
            print(daily.tail())
        else:
            print("失败：未获取到日K线")

        # 关闭连接
        client.close()
    else:
        print("连接测试失败！请检查：")
        print("1. 是否安装了 TqSDK: pip install tqsdk")
        print("2. 是否设置了环境变量 TQSDK_USERNAME 和 TQSDK_PASSWORD")
        print("3. 是否在交易时段（TqSDK需要市场开放）")

    print("\n" + "="*60)
    print("测试完成")
    print("="*60)
