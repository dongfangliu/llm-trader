"""
实时数据推送服务
使用TqSDK的wait_update()事件驱动模式，实时推送行情和K线数据到前端
"""

import sys
import threading
import time
import asyncio
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Optional
from loguru import logger

# 添加项目根目录到路径
project_root = Path(__file__).parent.parent.parent.parent
sys.path.insert(0, str(project_root))


class RealtimePushService:
    """实时数据推送服务（后台线程）"""

    def __init__(self, ws_manager=None, event_loop=None):
        """
        初始化推送服务

        Args:
            ws_manager: WebSocket管理器
            event_loop: 事件循环（用于从同步线程调用异步broadcast）
        """
        self.ws_manager = ws_manager
        self.event_loop = event_loop
        self.running = False
        self.thread = None
        self.tqsdk_client = None
        self.api = None
        self.quote = None
        self.klines = {}  # 多个周期的K线
        self.regime_service = None  # 市场态势服务
        self.order_flow_service = None  # 订单流服务

        # 新增：内存缓存（线程安全）
        self._cache_lock = threading.Lock()
        self._cache = {
            'quote': None,              # 最新行情
            'klines': {},               # {period: DataFrame}
            'last_update': None         # 最后更新时间
        }

        logger.info("内存缓存初始化完成")

    def _init_tqsdk(self):
        """初始化TqSDK连接"""
        try:
            import yaml
            from src.data_fetcher.tqsdk_client import get_tqsdk_client
            from src.strategy.market_regime_service import get_regime_service

            # 加载配置文件
            config_dir = project_root / 'config'

            # 加载交易参数
            with open(config_dir / 'trading_params.yaml', 'r', encoding='utf-8') as f:
                trading_config = yaml.safe_load(f)

            # 加载API密钥
            with open(config_dir / 'api_keys.yaml', 'r', encoding='utf-8') as f:
                api_keys = yaml.safe_load(f)

            # 提取TqSDK配置
            symbol = trading_config['trading'].get('tqsdk_symbol', 'KQ.m@CZCE.SA')
            tqsdk_config = api_keys.get('tqsdk', {})
            username = tqsdk_config.get('username')
            password = tqsdk_config.get('password')
            use_sim = tqsdk_config.get('use_sim', True)

            logger.info(f"TqSDK配置: symbol={symbol}, use_sim={use_sim}")

            # 获取单例客户端（传入凭据）
            self.tqsdk_client = get_tqsdk_client(
                symbol=symbol,
                auth_username=username,
                auth_password=password,
                use_sim=use_sim
            )
            if not self.tqsdk_client:
                logger.error("无法获取TqSDK客户端")
                return False

            # 获取API实例（用于wait_update）
            self.api = self.tqsdk_client.get_api()
            if not self.api:
                logger.error("无法获取TqApi实例")
                return False

            # 获取quote对象（用于is_changing）
            self.quote = self.tqsdk_client.get_quote_obj()

            # 初始化市场态势服务
            self.regime_service = get_regime_service()
            self.regime_service.set_websocket_manager(self.ws_manager)
            
            # 加载配置
            regime_config = trading_config.get('market_regime', {})
            if regime_config:
                self.regime_service.update_config(regime_config)
            
            logger.info("✅ 市场态势服务已初始化")
            
            # 初始化订单流服务
            from src.data.order_flow_service import get_order_flow_service
            self.order_flow_service = get_order_flow_service()
            logger.info("✅ 订单流服务已初始化")

            # 订阅多个周期的K线
            periods = {
                '1m': 60,       # 1分钟
                '5m': 300,      # 5分钟
                '15m': 900,     # 15分钟
                '1h': 3600,     # 1小时
                '4h': 14400,    # 4小时
            }

            symbol = self.tqsdk_client.symbol
            for period_name, duration_seconds in periods.items():
                kline = self.api.get_kline_serial(
                    symbol,
                    duration_seconds=duration_seconds,
                    data_length=200  # 保留最近200根
                )
                self.klines[period_name] = kline
                logger.info(f"订阅K线: {period_name} (symbol={symbol})")

            # 新增：初始化缓存数据
            with self._cache_lock:
                self._cache['quote'] = self.quote
                for period_name, kline in self.klines.items():
                    # 深拷贝避免引用问题
                    self._cache['klines'][period_name] = kline.copy()
                self._cache['last_update'] = datetime.now()

            # 新增：用历史K线初始化市场态势服务
            if self.regime_service:
                try:
                    # 使用1分钟K线喂数据
                    kline_1m = self.klines.get('1m')
                    if kline_1m is not None and len(kline_1m) > 0:
                        # 转换为字典列表
                        kline_list = []
                        for i in range(len(kline_1m)):
                            kline_list.append({
                                'close': float(kline_1m.close.iloc[i]),
                                'volume': int(kline_1m.volume.iloc[i]),
                                'timestamp': kline_1m.datetime.iloc[i]
                            })
                        
                        self.regime_service.feed_kline_data(kline_list)
                        logger.info(f"✅ 已用{len(kline_list)}根K线初始化市场态势服务")
                except Exception as e:
                    logger.error(f"初始化市场态势服务失败: {e}")

            logger.info("✅ TqSDK推送服务初始化成功，缓存已填充")
            return True

        except Exception as e:
            logger.error(f"❌ TqSDK推送服务初始化失败: {e}")
            import traceback
            logger.debug(traceback.format_exc())
            return False

    def _push_loop(self):
        """推送循环（事件驱动）"""
        logger.info("🔄 开始TqSDK事件监听循环...")

        try:
            while self.running:
                # 阻塞等待，直到有新数据推送（TqSDK的核心机制）
                if not self.api.wait_update(deadline=time.time() + 1):
                    # 超时，继续等待
                    continue

                # 检查行情是否变化
                if self.api.is_changing(self.quote):
                    # 更新缓存
                    with self._cache_lock:
                        self._cache['quote'] = self.quote
                        self._cache['last_update'] = datetime.now()

                    # WebSocket推送
                    self._push_quote_update()

                # 检查各周期K线是否变化
                for period_name, kline in self.klines.items():
                    if self.api.is_changing(kline):
                        # 更新缓存
                        with self._cache_lock:
                            self._cache['klines'][period_name] = kline.copy()
                            self._cache['last_update'] = datetime.now()

                        # WebSocket推送
                        self._push_kline_update(period_name, kline)

        except Exception as e:
            logger.error(f"推送循环出错: {e}")
            import traceback
            logger.debug(traceback.format_exc())
        finally:
            logger.info("推送循环结束")

    def _push_quote_update(self):
        """推送行情更新"""
        try:
            # 提取行情数据
            quote_datetime = self.quote.datetime
            if isinstance(quote_datetime, str):
                import pandas as pd
                timestamp = pd.to_datetime(quote_datetime).to_pydatetime()
            else:
                timestamp = datetime.fromtimestamp(quote_datetime / 1e9)

            # 辅助函数：检查并转换价格（过滤nan）
            import math
            def safe_price(value):
                try:
                    val = float(value)
                    return val if not math.isnan(val) else 0.0
                except:
                    return 0.0

            def safe_volume(value):
                try:
                    return int(value) if value and not math.isnan(float(value)) else 0
                except:
                    return 0

            data = {
                'symbol': self.tqsdk_client.symbol,
                'price': float(self.quote.last_price),
                'last_price': float(self.quote.last_price),  # 添加这个字段供MarketRegimeService使用
                'open': float(self.quote.open) if not math.isnan(self.quote.open) else 0.0,
                'high': float(self.quote.highest),
                'low': float(self.quote.lowest),
                'volume': int(self.quote.volume),
                'timestamp': timestamp.isoformat(),

                # 五档买卖盘口（TqSDK免费版只有一档，2~5档为nan）
                'bid_price1': safe_price(getattr(self.quote, 'bid_price1', 0)),
                'bid_volume1': safe_volume(getattr(self.quote, 'bid_volume1', 0)),
                'bid_price2': safe_price(getattr(self.quote, 'bid_price2', 0)),
                'bid_volume2': safe_volume(getattr(self.quote, 'bid_volume2', 0)),
                'bid_price3': safe_price(getattr(self.quote, 'bid_price3', 0)),
                'bid_volume3': safe_volume(getattr(self.quote, 'bid_volume3', 0)),
                'bid_price4': safe_price(getattr(self.quote, 'bid_price4', 0)),
                'bid_volume4': safe_volume(getattr(self.quote, 'bid_volume4', 0)),
                'bid_price5': safe_price(getattr(self.quote, 'bid_price5', 0)),
                'bid_volume5': safe_volume(getattr(self.quote, 'bid_volume5', 0)),

                'ask_price1': safe_price(getattr(self.quote, 'ask_price1', 0)),
                'ask_volume1': safe_volume(getattr(self.quote, 'ask_volume1', 0)),
                'ask_price2': safe_price(getattr(self.quote, 'ask_price2', 0)),
                'ask_volume2': safe_volume(getattr(self.quote, 'ask_volume2', 0)),
                'ask_price3': safe_price(getattr(self.quote, 'ask_price3', 0)),
                'ask_volume3': safe_volume(getattr(self.quote, 'ask_volume3', 0)),
                'ask_price4': safe_price(getattr(self.quote, 'ask_price4', 0)),
                'ask_volume4': safe_volume(getattr(self.quote, 'ask_volume4', 0)),
                'ask_price5': safe_price(getattr(self.quote, 'ask_price5', 0)),
                'ask_volume5': safe_volume(getattr(self.quote, 'ask_volume5', 0)),
            }

            # 触发市场态势计算（异步，不阻塞）
            if self.regime_service and self.event_loop:
                asyncio.run_coroutine_threadsafe(
                    self.regime_service.on_tick(data),
                    self.event_loop
                )
            
            # 计算订单流数据
            order_flow_data = None
            if self.order_flow_service:
                order_flow_data = self.order_flow_service.on_tick(data)

            # 推送到WebSocket（从同步线程调用异步方法）
            if self.ws_manager and self.event_loop:
                message = {
                    'type': 'tick',
                    'data': data
                }
                asyncio.run_coroutine_threadsafe(
                    self.ws_manager.broadcast(message),
                    self.event_loop
                )
                logger.debug(f"推送tick: {data['price']}")
                
                # 推送订单流更新（如果有数据）
                if order_flow_data:
                    order_flow_message = {
                        'type': 'order_flow',
                        'data': order_flow_data
                    }
                    asyncio.run_coroutine_threadsafe(
                        self.ws_manager.broadcast(order_flow_message),
                        self.event_loop
                    )
                    logger.debug(f"推送订单流: VPIN={order_flow_data.get('vpin', {}).get('vpin', 0)}")

        except Exception as e:
            logger.error(f"推送行情失败: {e}")

    def _push_kline_update(self, period: str, kline):
        """推送K线更新"""
        try:
            # 获取最新的K线数据（最近10根）
            import pandas as pd

            # 转换为标准格式
            recent_klines = kline.tail(10)
            kline_data = []

            for idx, row in recent_klines.iterrows():
                kline_data.append({
                    'timestamp': pd.to_datetime(row['datetime']).isoformat(),
                    'open': float(row['open']),
                    'high': float(row['high']),
                    'low': float(row['low']),
                    'close': float(row['close']),
                    'volume': int(row['volume'])
                })

            # 推送到WebSocket（从同步线程调用异步方法）
            if self.ws_manager and self.event_loop and kline_data:
                message = {
                    'type': 'kline',
                    'period': period,
                    'data': kline_data
                }
                asyncio.run_coroutine_threadsafe(
                    self.ws_manager.broadcast(message),
                    self.event_loop
                )
                logger.debug(f"推送K线: period={period}, count={len(kline_data)}")

        except Exception as e:
            logger.error(f"推送K线失败: {e}")

    def start(self):
        """启动推送服务"""
        if self.running:
            logger.warning("推送服务已在运行中")
            return

        if not self.ws_manager:
            logger.error("WebSocket管理器未初始化，推送服务无法启动")
            return

        logger.info("=" * 60)
        logger.info("🚀 实时推送服务启动中...")
        logger.info("=" * 60)

        # 初始化TqSDK
        if not self._init_tqsdk():
            logger.error("❌ TqSDK初始化失败，推送服务无法启动")
            return

        # 启动推送线程
        self.running = True
        self.thread = threading.Thread(
            target=self._push_loop,
            daemon=True,
            name="RealtimePush"
        )
        self.thread.start()

        logger.info("✅ 实时推送服务已启动（后台线程）")
        logger.info("   ↳ 使用TqSDK wait_update()事件驱动模式")
        logger.info("=" * 60)

    def stop(self):
        """停止推送服务"""
        if not self.running:
            return

        logger.info("🛑 停止实时推送服务...")
        self.running = False

        if self.thread:
            self.thread.join(timeout=5)

        logger.info("✅ 实时推送服务已停止")

    def get_cached_quote(self) -> Optional[Dict]:
        """
        从缓存读取最新行情（非阻塞）
        供Bridge层调用

        Returns:
            行情数据字典，如果缓存为空则返回None
        """
        with self._cache_lock:
            if self._cache['quote'] is None:
                logger.warning("行情缓存为空")
                return None

            q = self._cache['quote']

            # 转换为字典格式
            try:
                import math
                # 处理时间戳
                quote_datetime = q.datetime
                if isinstance(quote_datetime, str):
                    import pandas as pd
                    timestamp = pd.to_datetime(quote_datetime).to_pydatetime()
                else:
                    timestamp = datetime.fromtimestamp(quote_datetime / 1e9)

                # 辅助函数：检查并转换价格（过滤nan）
                def safe_price(value):
                    try:
                        val = float(value)
                        return val if not math.isnan(val) else 0.0
                    except:
                        return 0.0

                def safe_volume(value):
                    try:
                        return int(value) if value and not math.isnan(float(value)) else 0
                    except:
                        return 0

                return {
                    'symbol': self.tqsdk_client.symbol,
                    'price': float(q.last_price),
                    'open': safe_price(q.open),
                    'high': float(q.highest),
                    'low': float(q.lowest),
                    'volume': int(q.volume),
                    'timestamp': timestamp.isoformat(),

                    # 盘口数据（五档，TqSDK免费版只有一档）
                    'bid_price1': safe_price(getattr(q, 'bid_price1', 0)),
                    'bid_volume1': safe_volume(getattr(q, 'bid_volume1', 0)),
                    'bid_price2': safe_price(getattr(q, 'bid_price2', 0)),
                    'bid_volume2': safe_volume(getattr(q, 'bid_volume2', 0)),
                    'bid_price3': safe_price(getattr(q, 'bid_price3', 0)),
                    'bid_volume3': safe_volume(getattr(q, 'bid_volume3', 0)),
                    'bid_price4': safe_price(getattr(q, 'bid_price4', 0)),
                    'bid_volume4': safe_volume(getattr(q, 'bid_volume4', 0)),
                    'bid_price5': safe_price(getattr(q, 'bid_price5', 0)),
                    'bid_volume5': safe_volume(getattr(q, 'bid_volume5', 0)),
                    'ask_price1': safe_price(getattr(q, 'ask_price1', 0)),
                    'ask_volume1': safe_volume(getattr(q, 'ask_volume1', 0)),
                    'ask_price2': safe_price(getattr(q, 'ask_price2', 0)),
                    'ask_volume2': safe_volume(getattr(q, 'ask_volume2', 0)),
                    'ask_price3': safe_price(getattr(q, 'ask_price3', 0)),
                    'ask_volume3': safe_volume(getattr(q, 'ask_volume3', 0)),
                    'ask_price4': safe_price(getattr(q, 'ask_price4', 0)),
                    'ask_volume4': safe_volume(getattr(q, 'ask_volume4', 0)),
                    'ask_price5': safe_price(getattr(q, 'ask_price5', 0)),
                    'ask_volume5': safe_volume(getattr(q, 'ask_volume5', 0)),
                }
            except Exception as e:
                logger.error(f"解析行情缓存失败: {e}")
                return None

    def get_cached_kline(self, period: str, limit: int = 200) -> List[Dict]:
        """
        从缓存读取K线数据（非阻塞）
        供Bridge层调用

        Args:
            period: K线周期（1m/5m/15m/1h/4h）
            limit: 返回最近N根K线

        Returns:
            K线数据列表
        """
        with self._cache_lock:
            if period not in self._cache['klines']:
                logger.warning(f"K线缓存中无 {period} 周期数据")
                return []

            df = self._cache['klines'][period]

            if df is None or df.empty:
                return []

            # 取最近limit根K线
            recent_df = df.tail(limit)

            # 转换为字典列表
            result = []
            for idx, row in recent_df.iterrows():
                import pandas as pd
                result.append({
                    'timestamp': pd.to_datetime(row['datetime']).isoformat(),
                    'open': float(row['open']),
                    'high': float(row['high']),
                    'low': float(row['low']),
                    'close': float(row['close']),
                    'volume': int(row['volume'])
                })

            logger.debug(f"从缓存读取 {period} K线: {len(result)}根")
            return result

    def get_cache_status(self) -> Dict:
        """
        获取缓存状态（用于监控）

        Returns:
            缓存统计信息
        """
        with self._cache_lock:
            return {
                'quote_cached': self._cache['quote'] is not None,
                'kline_periods': list(self._cache['klines'].keys()),
                'last_update': self._cache['last_update'].isoformat() if self._cache['last_update'] else None
            }
    
    def get_order_flow_vpin(self) -> Dict:
        """获取最新VPIN数据"""
        if self.order_flow_service:
            return self.order_flow_service.get_latest_vpin()
        return {}
    
    def get_order_flow_orderbook(self) -> Dict:
        """获取最新订单簿数据"""
        if self.order_flow_service:
            return self.order_flow_service.get_latest_orderbook()
        return {}
    
    def get_order_flow_large_orders(self, count: int = 20) -> Dict:
        """获取最近的大单"""
        if self.order_flow_service:
            return self.order_flow_service.get_large_orders(count)
        return {'orders': [], 'count': 0}
    
    def get_order_flow_dynamics(self) -> Dict:
        """获取订单簿动态"""
        if self.order_flow_service:
            return self.order_flow_service.get_orderbook_dynamics()
        return {}


# 全局单例
_push_service = None


def get_push_service(ws_manager=None, event_loop=None):
    """获取推送服务单例"""
    global _push_service
    if _push_service is None:
        _push_service = RealtimePushService(
            ws_manager=ws_manager,
            event_loop=event_loop
        )
    return _push_service
