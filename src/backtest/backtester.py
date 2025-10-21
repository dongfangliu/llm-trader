"""
回测引擎 - 基于 TqSDK 原生回测功能
使用 TqSDK 的 BacktestFinished 机制运行历史数据回测
"""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from datetime import datetime, timedelta
from typing import Dict, Optional
from loguru import logger

from tqsdk import TqApi, TqAuth, TqSim, BacktestFinished
from tqsdk.objs import Quote

from data_fetcher.data_processor import DataProcessor
from llm_engine.llm_factory import LLMFactory
from llm_engine.strategic_agent import StrategicAgent
from llm_engine.tactical_agent import TacticalAgent
from risk_control.risk_rules import RiskController, RiskConfig
from .performance import PerformanceAnalyzer


class TqBacktester:
    """基于 TqSDK 的回测引擎"""

    def __init__(self,
                 symbol: str,
                 start_date: str,
                 end_date: str,
                 initial_capital: float = 50000,
                 strategic_interval_hours: int = 4,
                 tactical_interval_minutes: int = 15,
                 config: dict = None,
                 api_keys_config: dict = None):
        """
        初始化回测引擎

        Args:
            symbol: 合约代码（如 CZCE.SA601）
            start_date: 回测开始日期 'YYYY-MM-DD'
            end_date: 回测结束日期 'YYYY-MM-DD'
            initial_capital: 初始资金
            strategic_interval_hours: 战略层间隔（小时）
            tactical_interval_minutes: 战术层间隔（分钟）
            config: 配置字典
            api_keys_config: API密钥配置
        """
        self.symbol = symbol
        self.start_date = start_date
        self.end_date = end_date
        self.initial_capital = initial_capital
        self.strategic_interval = strategic_interval_hours
        self.tactical_interval = tactical_interval_minutes
        
        self.config = config or {}
        self.api_keys_config = api_keys_config or {}
        
        # 初始化 TqSDK API（回测模式）
        self.api: Optional[TqApi] = None
        
        # 初始化组件
        self.data_processor = DataProcessor()
        
        # 初始化 LLM 和决策层
        llm_client = LLMFactory.create_client(config, api_keys_config)
        self.strategic_agent = StrategicAgent(llm_client) if llm_client else None
        self.tactical_agent = TacticalAgent(llm_client) if llm_client else None
        
        # 风控
        risk_config = RiskConfig.from_yaml(config) if config else RiskConfig()
        self.risk_controller = RiskController(risk_config)
        
        # 记录
        self.all_trades = []
        self.all_decisions = []
        self.equity_curve = []
        
        # 策略状态
        self.current_strategic_view = None
        self.last_strategic_time = None
        self.last_tactical_time = None
        self.position_quantity = 0  # 当前持仓数量（正数=多仓，负数=空仓）
        
        logger.info(f"TqSDK回测引擎初始化: {symbol} | {start_date} ~ {end_date} | 初始资金{initial_capital}")

    def _init_tqsdk_api(self):
        """初始化 TqSDK 回测 API"""
        try:
            # 从配置获取认证信息
            tqsdk_config = self.api_keys_config.get('tqsdk', {})
            username = tqsdk_config.get('username', '')
            password = tqsdk_config.get('password', '')
            
            if not username or not password:
                logger.warning("TqSDK认证信息未配置，尝试使用环境变量")
                import os
                username = os.getenv('TQSDK_USERNAME', '')
                password = os.getenv('TQSDK_PASSWORD', '')
            
            if not username or not password:
                raise ValueError("TqSDK认证信息未配置")
            
            # 创建回测账户
            account = TqSim(init_balance=self.initial_capital)
            
            # 创建回测 API（使用 backtest 参数）
            self.api = TqApi(
                account=account,
                auth=TqAuth(username, password),
                backtest=BacktestFinished(
                    start_dt=datetime.strptime(self.start_date, '%Y-%m-%d'),
                    end_dt=datetime.strptime(self.end_date, '%Y-%m-%d')
                )
            )
            
            logger.info(f"TqSDK回测API初始化成功: {self.start_date} ~ {self.end_date}")
            return True
            
        except Exception as e:
            logger.error(f"TqSDK回测API初始化失败: {e}")
            return False

    def run(self) -> Dict:
        """
        运行回测（基于 TqSDK 事件驱动）

        Returns:
            dict: 回测结果
        """
        logger.info("=" * 80)
        logger.info("开始TqSDK回测")
        logger.info("=" * 80)
        
        # 初始化 TqSDK API
        if not self._init_tqsdk_api():
            logger.error("无法初始化TqSDK API")
            return None
        
        try:
            # 订阅合约
            quote: Quote = self.api.get_quote(self.symbol)
            
            # 获取K线数据（用于决策）
            klines_1m = self.api.get_kline_serial(self.symbol, duration_seconds=60, data_length=500)
            klines_15m = self.api.get_kline_serial(self.symbol, duration_seconds=900, data_length=200)
            klines_1h = self.api.get_kline_serial(self.symbol, duration_seconds=3600, data_length=100)
            klines_1d = self.api.get_kline_serial(self.symbol, duration_seconds=86400, data_length=50)
            
            # 获取账户信息
            account = self.api.get_account()
            position = self.api.get_position(self.symbol)
            
            logger.info(f"订阅合约: {self.symbol}")
            
            # 主循环 - TqSDK 事件驱动
            tick_count = 0
            while True:
                # 等待数据更新
                self.api.wait_update()
                
                # 检查是否回测结束
                if self.api.is_changing(quote, "datetime"):
                    tick_count += 1
                    current_time = quote.datetime
                    current_price = quote.last_price
                    
                    # 记录权益曲线
                    if tick_count % 60 == 0:  # 每分钟记录一次
                        self._record_equity(current_time, account, position, current_price)
                    
                    # 1. 战略层决策（每N小时）
                    if self._should_run_strategic(current_time):
                        self._run_strategic_decision(klines_1d, klines_1h, current_time)
                    
                    # 2. 战术层决策（每N分钟）
                    if self._should_run_tactical(current_time):
                        self._run_tactical_decision(klines_15m, klines_1m, position, account, current_price, current_time)
                    
                    # 3. 风控检查（实时）
                    self._run_risk_control(position, account, current_price, current_time)
                    
                    # 打印进度
                    if tick_count % 1000 == 0:
                        logger.info(f"回测进度: {current_time} | 权益: {account.balance:.2f} | 持仓: {position.volume_long - position.volume_short}")
                        
        except BacktestFinished as e:
            logger.info("回测完成（TqSDK BacktestFinished）")
            
        except Exception as e:
            logger.error(f"回测异常: {e}")
            import traceback
            traceback.print_exc()
            
        finally:
            # 关闭API
            if self.api:
                self.api.close()
        
        logger.info("=" * 80)
        logger.info("回测结束")
        logger.info("=" * 80)
        
        # 生成回测报告
        return self._generate_report()
    
    def _should_run_strategic(self, current_time: datetime) -> bool:
        """判断是否应该运行战略决策"""
        if self.last_strategic_time is None:
            return True
        
        time_diff = (current_time - self.last_strategic_time).total_seconds()
        return time_diff >= self.strategic_interval * 3600
    
    def _should_run_tactical(self, current_time: datetime) -> bool:
        """判断是否应该运行战术决策"""
        if self.current_strategic_view is None:
            return False  # 战略层未运行前不执行战术
        
        if self.last_tactical_time is None:
            return True
        
        time_diff = (current_time - self.last_tactical_time).total_seconds()
        return time_diff >= self.tactical_interval * 60
    
    def _record_equity(self, timestamp: datetime, account, position, current_price: float):
        """记录权益曲线"""
        # 计算持仓市值
        net_position = position.volume_long - position.volume_short
        position_value = net_position * current_price * 5  # 纯碱1手=5吨
        
        equity = account.balance + position_value
        
        self.equity_curve.append({
            'timestamp': timestamp,
            'equity': equity,
            'balance': account.balance,
            'unrealized_pnl': position_value
        })
    
    def _run_strategic_decision(self, klines_1d, klines_1h, current_time: datetime):
        """运行战略层决策"""
        if not self.strategic_agent:
            return
        
        try:
            # 转换 TqSDK K线为 pandas DataFrame
            import pandas as pd
            df_daily = pd.DataFrame({
                'timestamp': pd.to_datetime(klines_1d['datetime'], unit='ns'),
                'open': klines_1d['open'],
                'high': klines_1d['high'],
                'low': klines_1d['low'],
                'close': klines_1d['close'],
                'volume': klines_1d['volume']
            })
            
            # 计算指标
            df_with_indicators = self.data_processor.calculate_all_indicators(df_daily)
            
            # 获取市场摘要
            market_summary = self.data_processor.get_market_summary(df_with_indicators)
            kline_text = self.data_processor.format_klines_for_llm(df_with_indicators, count=10)
            
            # 战略决策
            strategic_result = self.strategic_agent.analyze(market_summary, kline_text)
            
            if strategic_result:
                self.current_strategic_view = strategic_result
                self.last_strategic_time = current_time
                
                self.all_decisions.append({
                    'timestamp': current_time,
                    'layer': 'strategic',
                    'result': strategic_result
                })
                
                logger.info(f"[战略层] {strategic_result.get('trend', 'N/A')} | 信心: {strategic_result.get('confidence', 0)}")
                
        except Exception as e:
            logger.error(f"战略决策异常: {e}")
    
    def _run_tactical_decision(self, klines_15m, klines_1m, position, account, current_price: float, current_time: datetime):
        """运行战术层决策"""
        if not self.tactical_agent:
            return
        
        try:
            # 转换 K线数据
            import pandas as pd
            df_15m = pd.DataFrame({
                'timestamp': pd.to_datetime(klines_15m['datetime'], unit='ns'),
                'open': klines_15m['open'],
                'high': klines_15m['high'],
                'low': klines_15m['low'],
                'close': klines_15m['close'],
                'volume': klines_15m['volume']
            })
            
            # 计算指标
            df_with_indicators = self.data_processor.calculate_all_indicators(df_15m)
            
            # 获取市场摘要
            market_summary = self.data_processor.get_market_summary(df_with_indicators)
            kline_text = self.data_processor.format_klines_for_llm(df_with_indicators, count=10)
            
            # 持仓信息
            net_position = position.volume_long - position.volume_short
            if net_position > 0:
                position_info = f"多头 {net_position}手"
            elif net_position < 0:
                position_info = f"空头 {abs(net_position)}手"
            else:
                position_info = "空仓"
            
            # 账户信息
            account_info = {
                'balance': account.balance,
                'today_pnl': account.float_profit,
                'today_trades': len([t for t in self.all_trades if t.get('timestamp', '').startswith(current_time.strftime('%Y-%m-%d'))])
            }
            
            # 战术决策
            tactical_result = self.tactical_agent.decide(
                market_data=market_summary,
                kline_text=kline_text,
                strategic_result=self.current_strategic_view,
                position_info=position_info,
                account_info=account_info
            )
            
            if tactical_result:
                self.last_tactical_time = current_time
                
                self.all_decisions.append({
                    'timestamp': current_time,
                    'layer': 'tactical',
                    'result': tactical_result
                })
                
                # 执行决策
                self._execute_decision(tactical_result, position, current_price, current_time)
                
        except Exception as e:
            logger.error(f"战术决策异常: {e}")
    
    def _execute_decision(self, decision: Dict, position, current_price: float, current_time: datetime):
        """执行交易决策（基于TqSDK下单）"""
        action = decision.get('action')
        confidence = decision.get('confidence', 0)
        
        net_position = position.volume_long - position.volume_short
        
        try:
            if action == 'open_long' and net_position == 0:
                # 开多仓
                logger.info(f"[执行] 开多 @ {current_price} | 信心: {confidence}")
                self.api.insert_order(symbol=self.symbol, direction="BUY", offset="OPEN", volume=1)
                
                self.all_trades.append({
                    'timestamp': current_time,
                    'action': 'OPEN_LONG',
                    'price': current_price,
                    'quantity': 1,
                    'confidence': confidence
                })
                
            elif action == 'open_short' and net_position == 0:
                # 开空仓
                logger.info(f"[执行] 开空 @ {current_price} | 信心: {confidence}")
                self.api.insert_order(symbol=self.symbol, direction="SELL", offset="OPEN", volume=1)
                
                self.all_trades.append({
                    'timestamp': current_time,
                    'action': 'OPEN_SHORT',
                    'price': current_price,
                    'quantity': 1,
                    'confidence': confidence
                })
                
            elif action == 'close_position':
                if net_position > 0:
                    # 平多仓
                    logger.info(f"[执行] 平多 @ {current_price}")
                    self.api.insert_order(symbol=self.symbol, direction="SELL", offset="CLOSE", volume=net_position)
                    
                    self.all_trades.append({
                        'timestamp': current_time,
                        'action': 'CLOSE',
                        'price': current_price,
                        'quantity': net_position,
                        'pnl': (current_price - position.open_price_long) * net_position * 5
                    })
                    
                elif net_position < 0:
                    # 平空仓
                    logger.info(f"[执行] 平空 @ {current_price}")
                    self.api.insert_order(symbol=self.symbol, direction="BUY", offset="CLOSE", volume=abs(net_position))
                    
                    self.all_trades.append({
                        'timestamp': current_time,
                        'action': 'CLOSE',
                        'price': current_price,
                        'quantity': abs(net_position),
                        'pnl': (position.open_price_short - current_price) * abs(net_position) * 5
                    })
                    
        except Exception as e:
            logger.error(f"订单执行失败: {e}")
    
    def _run_risk_control(self, position, account, current_price: float, current_time: datetime):
        """运行风控检查"""
        # 简化版风控：止损和最大持仓时间
        net_position = position.volume_long - position.volume_short
        
        if net_position == 0:
            return
        
        # 计算浮动盈亏
        if net_position > 0:
            unrealized_pnl = (current_price - position.open_price_long) * net_position * 5
        else:
            unrealized_pnl = (position.open_price_short - current_price) * abs(net_position) * 5
        
        # 止损检查（-500元）
        if unrealized_pnl < -500:
            logger.warning(f"[风控] 触发止损: {unrealized_pnl:.2f}元")
            self._force_close_position(position, current_price, current_time, "止损")
    
    def _force_close_position(self, position, current_price: float, current_time: datetime, reason: str):
        """强制平仓"""
        net_position = position.volume_long - position.volume_short
        
        if net_position == 0:
            return
        
        try:
            if net_position > 0:
                self.api.insert_order(symbol=self.symbol, direction="SELL", offset="CLOSE", volume=net_position)
                pnl = (current_price - position.open_price_long) * net_position * 5
            else:
                self.api.insert_order(symbol=self.symbol, direction="BUY", offset="CLOSE", volume=abs(net_position))
                pnl = (position.open_price_short - current_price) * abs(net_position) * 5
            
            self.all_trades.append({
                'timestamp': current_time,
                'action': 'FORCE_CLOSE',
                'price': current_price,
                'quantity': abs(net_position),
                'pnl': pnl,
                'close_reason': reason
            })
            
            logger.warning(f"[强平] {reason} @ {current_price} | 盈亏: {pnl:.2f}")
            
        except Exception as e:
            logger.error(f"强制平仓失败: {e}")

    def _generate_report(self) -> Dict:
        """生成回测报告"""
        analyzer = PerformanceAnalyzer(
            initial_capital=self.initial_capital,
            trades=self.all_trades,
            equity_curve=self.equity_curve
        )

        report = analyzer.generate_report()

        logger.info("\n" + "=" * 80)
        logger.info("TqSDK 回测结果")
        logger.info("=" * 80)
        logger.info(f"回测周期: {self.start_date} ~ {self.end_date}")
        logger.info(f"初始资金: {self.initial_capital:.2f}")
        logger.info(f"最终权益: {report.get('final_equity', 0):.2f}")
        logger.info(f"总收益: {report.get('total_return', 0):.2f}%")
        logger.info(f"最大回撤: {report.get('max_drawdown', 0):.2f}%")
        logger.info(f"夏普比率: {report.get('sharpe_ratio', 0):.2f}")
        logger.info(f"总交易次数: {report.get('total_trades', 0)}")
        logger.info(f"胜率: {report.get('win_rate', 0):.2f}%")
        logger.info(f"盈亏比: {report.get('profit_factor', 0):.2f}")
        logger.info("=" * 80)

        return report


if __name__ == "__main__":
    # 测试TqSDK回测
    import yaml
    from pathlib import Path

    # 加载配置
    config_path = Path(__file__).parent.parent.parent / "config" / "trading_params.yaml"
    keys_path = Path(__file__).parent.parent.parent / "config" / "api_keys.yaml"

    try:
        with open(config_path, 'r', encoding='utf-8') as f:
            config = yaml.safe_load(f)

        with open(keys_path, 'r', encoding='utf-8') as f:
            api_keys = yaml.safe_load(f)

        # 获取合约代码
        symbol = config.get('trading', {}).get('tqsdk_symbol', 'CZCE.SA601')
        
        # 设置回测时间范围（最近30天）
        end_date = datetime.now().strftime('%Y-%m-%d')
        start_date = (datetime.now() - timedelta(days=30)).strftime('%Y-%m-%d')

        logger.info(f"准备回测: {symbol} | {start_date} ~ {end_date}")

        # 创建回测器
        backtester = TqBacktester(
            symbol=symbol,
            start_date=start_date,
            end_date=end_date,
            initial_capital=50000,
            strategic_interval_hours=4,
            tactical_interval_minutes=15,
            config=config,
            api_keys_config=api_keys
        )

        # 运行回测
        report = backtester.run()

        if report:
            print("\n" + "=" * 80)
            print("回测完成！")
            print("=" * 80)
            print(f"总收益率: {report.get('total_return', 0):.2f}%")
            print(f"夏普比率: {report.get('sharpe_ratio', 0):.2f}")
            print(f"最大回撤: {report.get('max_drawdown', 0):.2f}%")
            print(f"总交易: {report.get('total_trades', 0)} 次")
            print(f"胜率: {report.get('win_rate', 0):.2f}%")
            print("=" * 80)
        else:
            print("回测失败，请检查日志")

    except Exception as e:
        print(f"回测失败: {e}")
        import traceback
        traceback.print_exc()
