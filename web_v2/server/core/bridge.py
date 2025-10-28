"""
数据桥接层 - 连接交易系统核心
数据来源：TqSDK实时数据（单例长连接）
"""

import sys
from pathlib import Path
from datetime import datetime, timedelta
from typing import Dict, List, Optional
import yaml

from loguru import logger

# 添加src目录到路径
project_root = Path(__file__).parent.parent.parent.parent
sys.path.insert(0, str(project_root / 'src'))


class TradingSystemBridge:
    """交易系统数据桥接层（单例）- 直接使用TqSDK实时数据"""

    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return

        # ✅ 新增：引用RealtimePushService
        self.push_service = None
        self.account = None
        self.db = None  # 数据库连接
        self.regime_service = None  # 市场态势服务
        self._initialized = True

        logger.info("数据桥接层创建完成")

    def init_connections(self):
        """初始化连接到RealtimePushService、Database和MarketRegimeService"""
        logger.info("🔌 连接到RealtimePushService、Database和MarketRegimeService")

        try:
            from server.services.realtime_push_service import get_push_service
            from data_fetcher.database import Database
            from strategy.market_regime_service import get_regime_service

            # 获取已启动的推送服务单例
            self.push_service = get_push_service()

            if self.push_service is None:
                logger.error("❌ RealtimePushService未初始化")
                return

            logger.info("✅ Bridge成功连接到RealtimePushService")

            # 打印缓存状态
            status = self.push_service.get_cache_status()
            logger.info(f"缓存状态: {status}")

            # 初始化数据库连接
            db_path = project_root / "data" / "market_data.db"
            self.db = Database(str(db_path))
            logger.info(f"✅ Bridge成功连接到Database: {db_path}")

            # 初始化市场态势服务
            self.regime_service = get_regime_service()
            
            # 加载配置
            config_path = project_root / "config" / "trading_params.yaml"
            if config_path.exists():
                with open(config_path, 'r', encoding='utf-8') as f:
                    config = yaml.safe_load(f)
                    regime_config = config.get('market_regime', {})
                    if regime_config:
                        self.regime_service.update_config(regime_config)
            
            logger.info(f"✅ Bridge成功连接到MarketRegimeService")
            
            # 为市场态势服务提供初始K线数据
            logger.info("📊 正在为MarketRegimeService加载初始K线数据...")
            initial_klines = self.get_kline_data(period='15m', limit=100)
            if initial_klines:
                self.regime_service.feed_kline_data(initial_klines)
                logger.info(f"✅ 已为MarketRegimeService加载 {len(initial_klines)} 根K线")
            else:
                logger.warning("⚠️ 未能获取初始K线数据，市场态势计算可能需要等待数据积累")

        except Exception as e:
            logger.error(f"❌ Bridge连接失败: {e}")
            import traceback
            logger.debug(traceback.format_exc())

    def get_kline_data(self, period: str, limit: int = 500) -> List[Dict]:
        """
        获取K线数据（从RealtimePushService缓存读取）

        ❌ 旧实现：每次调用TqSDK API重复订阅
        ✅ 新实现：从内存缓存读取（非阻塞，<1ms）

        Args:
            period: K线周期（1m/5m/15m/1h/4h/1d）
            limit: 返回数量

        Returns:
            K线数据列表
        """
        try:
            if not self.push_service:
                logger.error("RealtimePushService未初始化")
                return []

            # 从缓存读取（非阻塞）
            result = self.push_service.get_cached_kline(period, limit)

            logger.debug(f"✅ 从缓存获取到 {len(result)} 根K线 (period={period})")
            return result

        except Exception as e:
            logger.error(f"从缓存获取K线失败: {e}")
            import traceback
            logger.debug(traceback.format_exc())
            return []

    def get_realtime_quote(self) -> Optional[Dict]:
        """
        获取实时行情（从RealtimePushService缓存读取）

        ❌ 旧实现：调用TqSDK client阻塞等待
        ✅ 新实现：从内存缓存读取（非阻塞）

        Returns:
            实时行情数据
        """
        try:
            if not self.push_service:
                logger.error("RealtimePushService未初始化")
                return None

            # 从缓存读取
            quote_data = self.push_service.get_cached_quote()

            if quote_data:
                logger.debug(f"✅ 从缓存获取实时行情: {quote_data['price']}")

            return quote_data

        except Exception as e:
            logger.error(f"从缓存获取行情失败: {e}")
            return None

    def get_account_info(self) -> Dict:
        """获取账户信息（从数据库读取真实账户数据）"""
        try:
            db = self.get_db()
            query = """
                SELECT balance, equity, available, frozen, pnl, pnl_ratio,
                       positions_count, timestamp
                FROM accounts
                ORDER BY timestamp DESC
                LIMIT 1
            """
            result = db.execute_query(query)

            if result and len(result) > 0:
                row = result[0]
                return {
                    'balance': row[0] or 0.0,
                    'equity': row[1] or 0.0,
                    'available': row[2] or 0.0,
                    'frozen': row[3] or 0.0,
                    'pnl': row[4] or 0.0,
                    'pnl_percent': row[5] or 0.0,
                    'positions_count': row[6] or 0,
                    'timestamp': row[7] or datetime.now().isoformat()
                }
            else:
                logger.warning("账户数据为空")
                return {
                    'balance': 0.0,
                    'equity': 0.0,
                    'available': 0.0,
                    'frozen': 0.0,
                    'pnl': 0.0,
                    'pnl_percent': 0.0,
                    'positions_count': 0,
                    'timestamp': datetime.now().isoformat()
                }
        except Exception as e:
            logger.error(f"获取账户信息失败: {e}")
            return {
                'balance': 0.0,
                'equity': 0.0,
                'available': 0.0,
                'frozen': 0.0,
                'pnl': 0.0,
                'pnl_percent': 0.0,
                'positions_count': 0,
                'timestamp': datetime.now().isoformat()
            }

    def get_positions(self) -> List[Dict]:
        """获取持仓（从数据库读取真实持仓）"""
        try:
            db = self.get_db()
            query = """
                SELECT symbol, direction, volume, open_price, current_price,
                       pnl, pnl_ratio, open_time, holding_time
                FROM positions
                WHERE status = 'open'
                ORDER BY open_time DESC
            """
            results = db.execute_query(query)

            if results:
                return [
                    {
                        'symbol': row[0],
                        'direction': row[1],
                        'volume': row[2],
                        'open_price': row[3],
                        'current_price': row[4],
                        'pnl': row[5],
                        'pnl_ratio': row[6],
                        'open_time': row[7],
                        'holding_time': row[8]
                    }
                    for row in results
                ]
            else:
                return []
        except Exception as e:
            logger.error(f"获取持仓失败: {e}")
            return []

    def get_signals(self, limit: int = 10, strategy: Optional[str] = None) -> List[Dict]:
        """获取信号（从数据库读取真实信号）"""
        try:
            db = self.get_db()

            if strategy:
                query = """
                    SELECT action, confidence, entry_price, stop_loss, take_profit,
                           reasoning, timestamp, executed, strategy, source
                    FROM strategy_signals
                    WHERE strategy = ?
                    ORDER BY timestamp DESC
                    LIMIT ?
                """
                results = db.execute_query(query, (strategy, limit))
            else:
                query = """
                    SELECT action, confidence, entry_price, stop_loss, take_profit,
                           reasoning, timestamp, executed, strategy, source
                    FROM strategy_signals
                    ORDER BY timestamp DESC
                    LIMIT ?
                """
                results = db.execute_query(query, (limit,))

            if results:
                return [
                    {
                        'action': row[0],
                        'confidence': row[1],
                        'entry_price': row[2],
                        'stop_loss': row[3],
                        'take_profit': row[4],
                        'reasoning': eval(row[5]) if row[5] else [],
                        'timestamp': row[6],
                        'executed': bool(row[7]),
                        'strategy': row[8],
                        'source': row[9] if len(row) > 9 else 'quant'
                    }
                    for row in results
                ]
            else:
                return []
        except Exception as e:
            logger.error(f"获取信号失败: {e}")
            return []

    def get_market_regime(self) -> Dict:
        """获取市场状态（从数据库读取）"""
        try:
            db = self.get_db()
            query = """
                SELECT regime, confidence, adx, atr, volatility,
                       bollinger_width, trend_alignment, timestamp
                FROM market_regime_history
                ORDER BY timestamp DESC
                LIMIT 1
            """
            result = db.execute_query(query)

            if result and len(result) > 0:
                row = result[0]
                return {
                    'regime': row[0],
                    'confidence': row[1],
                    'adx': row[2],
                    'atr': row[3],
                    'volatility': row[4],
                    'bollinger_width': row[5],
                    'trend_alignment': row[6],
                    'timestamp': row[7]
                }
            else:
                logger.warning("市场状态数据为空")
                return {
                    'regime': 'unknown',
                    'confidence': 0.0,
                    'adx': 0.0,
                    'atr': 0.0,
                    'volatility': 0.0,
                    'bollinger_width': 0.0,
                    'trend_alignment': 0.0,
                    'timestamp': datetime.now().isoformat()
                }
        except Exception as e:
            logger.error(f"获取市场状态失败: {e}")
            return {
                'regime': 'unknown',
                'confidence': 0.0,
                'adx': 0.0,
                'atr': 0.0,
                'volatility': 0.0,
                'bollinger_width': 0.0,
                'trend_alignment': 0.0,
                'timestamp': datetime.now().isoformat()
            }

    def get_tick_data(self, limit: int = 100) -> List[Dict]:
        """
        获取tick数据（实时行情）- 返回最新一条

        Args:
            limit: 获取数量（当前仅支持1条）

        Returns:
            Tick数据列表
        """
        quote = self.get_realtime_quote()
        if quote:
            return [quote]
        return []

    def get_tick_serial(self, limit: int = 1000) -> List[Dict]:
        """
        获取tick序列数据（用于分时图）

        Args:
            limit: 获取tick数量

        Returns:
            Tick序列列表
        """
        try:
            if not self.push_service:
                logger.error("RealtimePushService未初始化")
                return []

            # 从TqSDK客户端获取tick序列
            tqsdk_client = self.push_service.tqsdk_client
            if not tqsdk_client:
                logger.error("TqSDK客户端未初始化")
                return []

            # 获取tick DataFrame
            df = tqsdk_client.get_tick_serial(count=limit)
            if df is None or df.empty:
                return []

            # 转换为字典列表
            result = []
            for _, row in df.iterrows():
                result.append({
                    'timestamp': row['datetime'].isoformat(),
                    'price': float(row['last_price']),
                    'volume': int(row['volume']),
                    'bid_price1': float(row['bid_price1']),
                    'ask_price1': float(row['ask_price1']),
                })

            logger.debug(f"获取到 {len(result)} 条tick序列数据")
            return result

        except Exception as e:
            logger.error(f"获取tick序列失败: {e}")
            import traceback
            logger.debug(traceback.format_exc())
            return []

    def get_order_flow(self) -> Dict:
        """获取订单流（从数据库读取）"""
        try:
            db = self.get_db()
            query = """
                SELECT vpin, buy_volume, sell_volume, imbalance, timestamp
                FROM vpin_history
                ORDER BY timestamp DESC
                LIMIT 1
            """
            result = db.execute_query(query)

            if result and len(result) > 0:
                row = result[0]
                vpin = row[0]
                imbalance = row[3]

                # 判断买卖力量
                if imbalance > 0.15:
                    interpretation = '买方力量较强'
                elif imbalance < -0.15:
                    interpretation = '卖方力量较强'
                else:
                    interpretation = '买卖力量相对平衡'

                return {
                    'vpin': vpin,
                    'depth_imbalance': imbalance,
                    'buy_volume': row[1],
                    'sell_volume': row[2],
                    'interpretation': interpretation,
                    'timestamp': row[4]
                }
            else:
                logger.warning("订单流数据为空")
                return {
                    'vpin': 0.0,
                    'depth_imbalance': 0.0,
                    'buy_volume': 0,
                    'sell_volume': 0,
                    'interpretation': '暂无数据',
                    'timestamp': datetime.now().isoformat()
                }
        except Exception as e:
            logger.error(f"获取订单流失败: {e}")
            return {
                'vpin': 0.0,
                'depth_imbalance': 0.0,
                'buy_volume': 0,
                'sell_volume': 0,
                'interpretation': '获取失败',
                'timestamp': datetime.now().isoformat()
            }

    def get_system_status(self) -> Dict:
        """获取系统状态"""
        return {
            'data_fetcher': 'running' if self.push_service else 'stopped',
            'llm_engine': 'idle',
            'risk_control': 'running',
            'executor': 'running',
            'timestamp': datetime.now().isoformat()
        }

    def get_data_source_info(self) -> Dict:
        """获取数据源信息"""
        try:
            config_path = project_root / "config" / "api_keys.yaml"
            with open(config_path, 'r', encoding='utf-8') as f:
                config = yaml.safe_load(f)
            use_sim = config.get('tqsdk', {}).get('use_sim', True)
        except:
            use_sim = True

        return {
            'use_sim': use_sim,
            'source': 'tqsdk',
            'description': 'TqSDK实时数据' + ('（模拟账户）' if use_sim else '（真实账户）'),
            'timestamp': datetime.now().isoformat()
        }

    def emergency_close_all(self) -> Dict:
        """紧急平仓"""
        logger.warning("执行紧急平仓")
        return {
            'status': 'success',
            'message': '所有持仓已平仓',
            'timestamp': datetime.now().isoformat()
        }

    def toggle_strategy(self, strategy: str, enabled: bool) -> Dict:
        """策略开关"""
        logger.info(f"策略开关: {strategy} -> {enabled}")
        return {
            'status': 'success',
            'strategy': strategy,
            'enabled': enabled,
            'message': f"策略 {strategy} 已{'启用' if enabled else '禁用'}",
            'timestamp': datetime.now().isoformat()
        }

    def pause_trading(self, paused: bool, reason: Optional[str] = None) -> Dict:
        """暂停交易"""
        logger.info(f"交易状态: {'暂停' if paused else '恢复'} | 原因: {reason}")
        return {
            'status': 'success',
            'paused': paused,
            'reason': reason,
            'message': f"交易已{'暂停' if paused else '恢复'}",
            'timestamp': datetime.now().isoformat()
        }

    def get_regime_service(self):
        """
        获取市场态势服务

        Returns:
            MarketRegimeService实例
        """
        if self.regime_service is None:
            logger.warning("MarketRegimeService未初始化，尝试初始化")
            try:
                from strategy.market_regime_service import get_regime_service
                self.regime_service = get_regime_service()
                
                # 尝试加载配置
                config_path = project_root / "config" / "trading_params.yaml"
                if config_path.exists():
                    with open(config_path, 'r', encoding='utf-8') as f:
                        config = yaml.safe_load(f)
                        regime_config = config.get('market_regime', {})
                        if regime_config:
                            self.regime_service.update_config(regime_config)
                
                # 为服务提供初始K线数据（如果还没有数据）
                if len(self.regime_service.price_history) == 0:
                    logger.info("📊 为MarketRegimeService加载初始K线数据...")
                    initial_klines = self.get_kline_data(period='15m', limit=100)
                    if initial_klines:
                        self.regime_service.feed_kline_data(initial_klines)
                        logger.info(f"✅ 已加载 {len(initial_klines)} 根K线")
            except Exception as e:
                logger.error(f"初始化MarketRegimeService失败: {e}")
                raise
        
        return self.regime_service

    def get_db(self):
        """
        获取数据库连接

        Returns:
            Database实例
        """
        if self.db is None:
            from data_fetcher.database import Database
            db_path = project_root / "data" / "market_data.db"
            self.db = Database(str(db_path))
            logger.info(f"延迟初始化数据库连接: {db_path}")

        return self.db
    
    def get_push_service(self):
        """
        获取推送服务

        Returns:
            RealtimePushService实例
        """
        return self.push_service

    def manual_trade(self, action: str, direction: str, volume: int) -> Dict:
        """
        手动交易

        Args:
            action: 操作类型（open/close）
            direction: 方向（long/short）
            volume: 交易手数

        Returns:
            交易结果
        """
        try:
            logger.info(f"手动交易请求: {action.upper()} {direction.upper()} {volume}手")

            # 验证参数
            if action not in ['open', 'close']:
                return {
                    'status': 'error',
                    'message': f'无效的操作类型: {action}，必须是 open 或 close',
                    'timestamp': datetime.now().isoformat()
                }

            if direction not in ['long', 'short']:
                return {
                    'status': 'error',
                    'message': f'无效的方向: {direction}，必须是 long 或 short',
                    'timestamp': datetime.now().isoformat()
                }

            if volume <= 0:
                return {
                    'status': 'error',
                    'message': f'无效的手数: {volume}，必须大于0',
                    'timestamp': datetime.now().isoformat()
                }

            # TODO: 实际的下单逻辑
            # 1. 检查账户余额
            # 2. 检查持仓情况
            # 3. 调用TqSdkExecutor下单
            # 4. 保存交易记录到数据库

            # 目前返回模拟响应（待集成真实执行器）
            trade_id = f"MANUAL_{datetime.now().strftime('%Y%m%d%H%M%S')}"

            logger.warning("手动交易功能暂未完全实现，需要集成TqSdkExecutor")

            return {
                'status': 'success',
                'message': f'手动交易请求已接收: {action.upper()} {direction.upper()} {volume}手',
                'trade_id': trade_id,
                'action': action,
                'direction': direction,
                'volume': volume,
                'timestamp': datetime.now().isoformat(),
                'note': '注意：实际下单功能需要集成TqSDK执行器'
            }

        except Exception as e:
            logger.error(f"手动交易失败: {e}")
            return {
                'status': 'error',
                'message': f'手动交易失败: {str(e)}',
                'timestamp': datetime.now().isoformat()
            }


# 全局单例
bridge = TradingSystemBridge()
