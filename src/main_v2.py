"""
主程序入口 V2 - 集成新LLM系统
协调所有模块，实现完整的交易流程（量化策略 + LLM专家复核）
"""

import os
import sys
import time
import yaml
import argparse
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, Any
from loguru import logger
from apscheduler.schedulers.background import BackgroundScheduler

# 添加src目录到路径
sys.path.insert(0, str(Path(__file__).parent))

from data_fetcher.data_processor import DataProcessor
from data_fetcher.database import Database
from data_fetcher.data_source_factory import DataSourceFactory
from trading.account import Account

# 新的量化策略层
from strategy.market_regime import MarketRegimeDetector
from strategy.signal_router import SignalRouter

# 新的LLM系统
from llm_engine.llm_factory import LLMFactory
from llm_engine.llm_trigger import LLMTrigger
from llm_engine.response_parser import ResponseParser
from llm_engine.daily_review_agent import DailyReviewAgent
from llm_engine.prompts.expert_review import ExpertReviewPrompt
from llm_engine.prompts.abnormal_analysis import AbnormalAnalysisPrompt
from llm_engine.prompts.signal_conflict import SignalConflictPrompt
from llm_engine.strategic_agent import StrategicAgent
from llm_engine.tactical_agent import TacticalAgent

# 风控
from risk_control.risk_rules import RiskController, RiskConfig


class TradingSystemV2:
    """智能交易系统 V2 - 量化策略主导 + LLM专家复核"""

    def __init__(self, config_path: str = "config/trading_params.yaml"):
        """
        初始化交易系统
        
        Args:
            config_path: 配置文件路径
        """
        logger.info("=" * 80)
        logger.info("初始化智能交易系统 V2 (量化+LLM)")
        logger.info("=" * 80)

        # 加载配置
        self.config = self._load_config(config_path)
        
        # 初始化各模块
        self._init_modules()
        
        # 调度器
        self.scheduler = BackgroundScheduler()
        self.is_running = False
        
        logger.info("系统初始化完成")

    def _load_config(self, config_path: str) -> dict:
        """加载配置文件"""
        config_file = Path(config_path)
        if not config_file.exists():
            logger.error(f"配置文件不存在: {config_path}")
            raise FileNotFoundError(f"配置文件不存在: {config_path}")

        with open(config_file, 'r', encoding='utf-8') as f:
            config = yaml.safe_load(f)

        # 加载 API 密钥配置
        api_keys_file = Path("config/api_keys.yaml")
        if api_keys_file.exists():
            with open(api_keys_file, 'r', encoding='utf-8') as f:
                self.api_keys_config = yaml.safe_load(f)
        else:
            self.api_keys_config = {}

        logger.info(f"配置加载成功: {config_path}")
        return config

    def _init_modules(self):
        """初始化各个模块"""
        # 1. 数据模块
        logger.info(f"数据源: {self.config['trading'].get('data_source', 'akshare')}")
        self.data_client = DataSourceFactory.create_client(self.config, self.api_keys_config)
        self.data_processor = DataProcessor()
        self.database = Database("data/market_data.db")

        # 2. 账户和执行
        self.account = Account(initial_capital=self.config['trading']['initial_capital'])
        self.executor = DataSourceFactory.create_executor(
            config=self.config,
            account=self.account,
            data_client=self.data_client,
            api_keys_config=self.api_keys_config
        )

        # 保存合约代码
        data_source = self.config['trading'].get('data_source', 'akshare').lower()
        if data_source == 'tqsdk':
            self.symbol = self.config['trading'].get('tqsdk_symbol', 'CZCE.SA0')
        else:
            self.symbol = self.config['trading']['symbol']

        # 3. 量化策略层（核心决策）
        logger.info("初始化量化策略层...")
        self.market_regime = MarketRegimeDetector()
        self.signal_router = SignalRouter(
            initial_capital=self.config['trading']['initial_capital'],
            max_position=self.config['trading']['max_position']
        )
        logger.info("✓ 量化策略层初始化完成")

        # 4. LLM专家系统（辅助复核）
        try:
            self.llm_client = LLMFactory.create_client()
            if hasattr(self.llm_client, 'is_configured') and not self.llm_client.is_configured():
                logger.warning("LLM客户端未配置，将仅使用量化策略")
                self.llm_client = None
            else:
                logger.info("✓ LLM客户端初始化成功")
                
                # 初始化LLM组件
                self.llm_trigger = LLMTrigger(confidence_threshold=0.85)
                self.response_parser = ResponseParser()
                self.daily_review_agent = DailyReviewAgent(
                    llm_client=self.llm_client,
                    database=self.database
                )
                
                # Prompt模板
                self.expert_review_prompt = ExpertReviewPrompt()
                self.abnormal_analysis_prompt = AbnormalAnalysisPrompt()
                self.signal_conflict_prompt = SignalConflictPrompt()
                
                logger.info("✓ LLM专家系统初始化完成")
        except Exception as e:
            logger.warning(f"LLM初始化失败: {e}，将仅使用量化策略")
            self.llm_client = None

        # 5. 风控
        risk_config = RiskConfig(
            stop_loss_amount=self.config['risk']['stop_loss'],
            max_drawdown=self.config['risk']['max_drawdown'],
            max_hold_hours=self.config['risk']['max_hold_hours'],
            daily_max_loss=self.config['risk']['daily_max_loss'],
            max_position=self.config['trading']['max_position']
        )
        self.risk_controller = RiskController(risk_config)

        logger.info("所有模块初始化完成")

    def start(self):
        """启动系统"""
        logger.info("=" * 80)
        logger.info("启动交易系统 V2")
        logger.info("=" * 80)

        # 测试数据连接
        if not self.data_client.test_connection():
            logger.error("数据连接测试失败，无法启动")
            return

        # 添加定时任务
        self._setup_scheduler()

        # 启动调度器
        self.scheduler.start()
        self.is_running = True

        logger.info("系统启动成功，进入运行状态")
        logger.info(f"决策间隔: {self.config['decision']['tactical_interval']}分钟")
        logger.info(f"数据拉取间隔: {self.config['data']['fetch_interval']}秒")

        # 立即执行一次数据拉取
        self._fetch_and_update_data()

    def _setup_scheduler(self):
        """设置定时任务"""
        # 任务1: 数据拉取（每3秒）
        self.scheduler.add_job(
            self._fetch_and_update_data,
            'interval',
            seconds=self.config['data']['fetch_interval'],
            id='fetch_data'
        )

        # 任务2: 量化策略决策（每15分钟）
        self.scheduler.add_job(
            self._quant_decision,
            'interval',
            minutes=self.config['decision']['tactical_interval'],
            id='quant_decision'
        )

        # 任务3: 风控检查（每3秒）
        self.scheduler.add_job(
            self._risk_check,
            'interval',
            seconds=self.config['data']['fetch_interval'],
            id='risk_check'
        )

        # 任务4: 每日复盘（每天21:00）
        if self.llm_client:
            self.scheduler.add_job(
                self._daily_review_job,
                'cron',
                hour=21,
                minute=0,
                id='daily_review'
            )

        # LLM 直接决策 调度
        if self.llm_client and self.config['decision'].get('llm_direct_enabled', True):
            self.scheduler.add_job(
                self._llm_direct_decision,
                'interval',
                minutes=self.config['decision'].get('llm_direct_interval', 240),
                id='llm_direct_decision'
            )

        logger.info("定时任务设置完成")

    def _fetch_and_update_data(self):
        """拉取并更新市场数据"""
        try:
            # 获取实时行情
            quote = self.data_client.get_realtime_price()
            if quote:
                self.database.save_realtime_quote(quote)
                # 更新账户权益
                self.account.update_equity({self.symbol: quote['price']})

            # 获取K线
            kline = self.data_client.get_minute_kline(
                period=str(self.config['data']['kline_period']),
                count=100
            )
            if kline is not None and not kline.empty:
                self.database.save_kline_minute(kline, period=str(self.config['data']['kline_period']))

        except Exception as e:
            logger.error(f"数据拉取失败: {e}")

    def _quant_decision(self):
        """量化策略决策（核心）"""
        try:
            logger.info("\n" + "=" * 80)
            logger.info("执行量化策略决策")
            logger.info("=" * 80)

            # 1. 获取K线数据
            kline = self.database.get_latest_kline(
                period=str(self.config['data']['kline_period']),
                count=100
            )
            
            if kline is None or kline.empty:
                logger.warning("无法获取K线数据，跳过决策")
                return

            # 2. 计算指标
            kline = self.data_processor.calculate_all_indicators(kline)
            
            # 3. 识别市场状态
            market_state = self.market_regime.identify(kline)
            logger.info(f"市场状态: {market_state['regime']} (置信度: {market_state['confidence']:.2%})")
            
            # 4. 获取量化信号
            current_price = kline['close'].iloc[-1]
            signal = self.signal_router.generate_signal(
                market_state=market_state,
                kline=kline,
                account=self.account
            )
            
            logger.info(f"量化信号: {signal['action']} (置信度: {signal['confidence']:.2%})")
            
            # 5. 检查是否需要LLM专家复核
            final_signal = signal.copy()
            if self.llm_client:
                should_trigger, trigger_type = self.llm_trigger.should_trigger(
                    signal=signal,
                    market_state=market_state,
                    signals=None,  # 如果有多策略可以传入
                    manual=False
                )
                
                if should_trigger:
                    logger.info(f"触发LLM专家复核: {trigger_type}")
                    llm_result = self._llm_expert_review(
                        trigger_type=trigger_type,
                        signal=signal,
                        market_state=market_state,
                        kline=kline
                    )
                    
                    if llm_result:
                        # LLM建议的调整
                        if llm_result.get('adjust_action'):
                            final_signal['action'] = llm_result['adjust_action']
                            final_signal['confidence'] = llm_result.get('adjust_confidence', signal['confidence'])
                            logger.info(f"LLM调整后信号: {final_signal['action']} (置信度: {final_signal['confidence']:.2%})")
            
            # 6. 执行信号
            self._execute_signal(final_signal, current_price)

        except Exception as e:
            logger.error(f"量化决策异常: {e}", exc_info=True)

    def _llm_expert_review(
        self,
        trigger_type: str,
        signal: Dict[str, Any],
        market_state: Dict[str, Any],
        kline
    ) -> Optional[Dict[str, Any]]:
        """
        LLM专家复核
        
        Args:
            trigger_type: 触发类型 (expert_review, abnormal_analysis, signal_conflict)
            signal: 量化信号
            market_state: 市场状态
            kline: K线数据
            
        Returns:
            LLM复核结果，包含adjust_action和adjust_confidence
        """
        try:
            # 准备市场数据摘要
            market_summary = self.data_processor.get_market_summary(kline)
            
            # 准备持仓信息
            if self.account.positions:
                pos = self.account.positions[0]
                position_info = {
                    'direction': pos.direction,
                    'quantity': pos.quantity,
                    'open_price': pos.open_price,
                    'unrealized_pnl': pos.unrealized_pnl
                }
            else:
                position_info = None
            
            # 根据触发类型选择Prompt
            if trigger_type == 'expert_review':
                prompt = self.expert_review_prompt.build(
                    signal=signal,
                    market_summary=market_summary,
                    position=position_info
                )
            elif trigger_type == 'abnormal_analysis':
                prompt = self.abnormal_analysis_prompt.build(
                    market_state=market_state,
                    market_summary=market_summary,
                    position=position_info
                )
            elif trigger_type == 'signal_conflict':
                # 需要多策略信号，这里简化处理
                prompt = self.signal_conflict_prompt.build(
                    signals=[signal],
                    market_summary=market_summary,
                    position=position_info
                )
            else:
                logger.warning(f"未知触发类型: {trigger_type}")
                return None
            
            # 调用LLM
            response = self.llm_client.chat(prompt)
            
            # 解析响应
            if trigger_type == 'expert_review':
                result = self.response_parser.parse_expert_review(response)
            elif trigger_type == 'abnormal_analysis':
                result = self.response_parser.parse_abnormal_analysis(response)
            elif trigger_type == 'signal_conflict':
                result = self.response_parser.parse_signal_conflict(response)
            else:
                result = None
            
            # 保存LLM调用记录到数据库
            self.database.save_llm_decision(
                decision_type=trigger_type,
                prompt=prompt,
                response=response,
                result=result
            )
            
            return result
            
        except Exception as e:
            logger.error(f"LLM专家复核失败: {e}", exc_info=True)
            return None

    def _execute_signal(self, signal: Dict[str, Any], current_price: float):
        """执行交易信号"""
        action = signal['action']
        confidence = signal['confidence']
        
        # 置信度检查
        min_confidence = self.config['decision'].get('confidence_threshold', 0.70)
        if confidence < min_confidence:
            logger.info(f"置信度不足 ({confidence:.2%} < {min_confidence:.2%})，不执行")
            return
        
        # 执行动作
        if action == 'open_long':
            quantity = signal.get('quantity', 1)
            if not self.account.positions:
                self._execute_open('long', current_price, quantity)
            else:
                pos = self.account.positions[0]
                if pos.direction == 'short':
                    if self.config['decision'].get('llm_allow_reverse', True):
                        logger.info("反手: 平空后开多")
                        self._execute_close_all(current_price)
                        self._execute_open('long', current_price, quantity)
                    else:
                        logger.info("反手被禁用，保持当前仓位")
                else:
                    logger.info("已持有多单，保持/忽略")
        
        elif action == 'open_short':
            quantity = signal.get('quantity', 1)
            if not self.account.positions:
                self._execute_open('short', current_price, quantity)
            else:
                pos = self.account.positions[0]
                if pos.direction == 'long':
                    if self.config['decision'].get('llm_allow_reverse', True):
                        logger.info("反手: 平多后开空")
                        self._execute_close_all(current_price)
                        self._execute_open('short', current_price, quantity)
                    else:
                        logger.info("反手被禁用，保持当前仓位")
                else:
                    logger.info("已持有空单，保持/忽略")
        
        elif action == 'close':
            if self.account.positions:
                self._execute_close_all(current_price)
        
        elif action == 'hold':
            logger.info("保持当前状态")
        
        else:
            logger.warning(f"未知动作: {action}")

    def _execute_open(self, direction: str, market_price: float, quantity: int):
        """开仓"""
        from trading.tqsdk_executor import TqSdkExecutor
        
        try:
            if isinstance(self.executor, TqSdkExecutor):
                success = self.executor.execute_open(
                    direction=direction,
                    market_price=market_price,
                    symbol=self.symbol,
                    quantity=quantity
                )
            else:
                success = self.executor.execute_open(
                    direction=direction,
                    market_price=market_price,
                    quantity=quantity
                )
            
            if success:
                logger.info(f"✓ 开仓成功: {direction} {quantity}手 @ {market_price}")
            else:
                logger.error("✗ 开仓失败")
                
        except Exception as e:
            logger.error(f"开仓异常: {e}", exc_info=True)

    def _execute_close_all(self, market_price: float):
        """平仓"""
        from trading.tqsdk_executor import TqSdkExecutor
        
        try:
            if isinstance(self.executor, TqSdkExecutor):
                success = self.executor.execute_close_all(market_price, self.symbol)
            else:
                success = self.executor.execute_close_all(market_price)
            
            if success:
                logger.info(f"✓ 平仓成功 @ {market_price}")
            else:
                logger.error("✗ 平仓失败")
                
        except Exception as e:
            logger.error(f"平仓异常: {e}", exc_info=True)

    def _risk_check(self):
        """风控检查"""
        try:
            if not self.account.positions:
                return
            
            # 获取当前价格
            quote = self.data_client.get_realtime_price()
            if not quote:
                return
            
            current_price = quote['price']
            
            # 执行风控检查
            actions = self.risk_controller.check_all(self.account, {self.symbol: current_price})
            
            # 执行风控动作
            for action in actions:
                if action['action'] == 'force_close':
                    logger.warning(f"⚠️ 触发风控: {action['reason']}")
                    self._execute_close_all(current_price)
                
        except Exception as e:
            logger.error(f"风控检查异常: {e}", exc_info=True)

    def _format_kline_text(self, kline, rows: int = 100) -> str:
        """K线转文本，供LLM阅读"""
        try:
            tail = kline.tail(rows)
            lines = ["时间 | 开 | 高 | 低 | 收 | 量"]
            for _, row in tail.iterrows():
                ts = str(row.get('timestamp') or row.name)
                lines.append(f"{ts} | {row['open']:.2f} | {row['high']:.2f} | {row['low']:.2f} | {row['close']:.2f} | {int(row.get('volume', 0))}")
            return "\n".join(lines)
        except Exception:
            return ""

    def _llm_direct_decision(self):
        """LLM 直接决策：战略+战术合成信号并自动执行（模拟账户）"""
        try:
            logger.info("\n" + "=" * 80)
            logger.info("执行LLM直接决策")
            logger.info("=" * 80)

            kline = self.database.get_latest_kline(
                period=str(self.config['data']['kline_period']),
                count=200
            )
            if kline is None or kline.empty:
                logger.warning("无法获取K线数据，跳过LLM决策")
                return

            kline = self.data_processor.calculate_all_indicators(kline)
            market_data = self.data_processor.get_market_summary(kline)
            kline_text = self._format_kline_text(kline, rows=100)

            # 持仓/账户信息
            if self.account.positions:
                pos = self.account.positions[0]
                position_info = f"持仓: {pos.direction} {pos.quantity}手, 开仓价 {pos.open_price}, 浮动盈亏 {pos.unrealized_pnl}"
            else:
                position_info = "当前空仓"
            account_info = {
                'balance': getattr(self.account, 'balance', 0),
                'equity': getattr(self.account, 'equity', 0),
                'today_pnl': getattr(self.account, 'today_pnl', 0)
            }

            # 战略层分析 + 战术层决策
            strategic = self.strategic_agent.analyze(market_data, kline_text)
            if not strategic:
                return
            tactical = self.tactical_agent.decide(
                market_data=market_data,
                kline_text=kline_text,
                strategic_result=strategic,
                position_info=position_info,
                account_info=account_info,
                recent_lessons=[]
            )
            if not tactical:
                return

            action_map = {
                'open_long': 'open_long',
                'open_short': 'open_short',
                'close_position': 'close',
                'hold': 'hold'
            }
            final_signal = {
                'action': action_map.get(tactical.get('action', 'hold'), 'hold'),
                'quantity': tactical.get('quantity', 1),
                'confidence': tactical.get('confidence', 0)
            }

            current_price = kline['close'].iloc[-1]
            self._execute_signal(final_signal, current_price)
        except Exception as e:
            logger.error(f"LLM直接决策异常: {e}", exc_info=True)

    def _format_kline_text(self, kline, rows: int = 100) -> str:
        """K线转文本，供LLM阅读"""
        try:
            tail = kline.tail(rows)
            lines = ["时间 | 开 | 高 | 低 | 收 | 量"]
            for _, row in tail.iterrows():
                ts = str(row.get('timestamp') or row.name)
                lines.append(f"{ts} | {row['open']:.2f} | {row['high']:.2f} | {row['low']:.2f} | {row['close']:.2f} | {int(row.get('volume', 0))}")
            return "\n".join(lines)
        except Exception:
            return ""

    def _llm_direct_decision(self):
        """LLM 直接决策：战略+战术合成信号并自动执行（模拟账户）"""
        try:
            logger.info("\n" + "=" * 80)
            logger.info("执行LLM直接决策")
            logger.info("=" * 80)

            kline = self.database.get_latest_kline(
                period=str(self.config['data']['kline_period']),
                count=200
            )
            if kline is None or kline.empty:
                logger.warning("无法获取K线数据，跳过LLM决策")
                return

            kline = self.data_processor.calculate_all_indicators(kline)
            market_data = self.data_processor.get_market_summary(kline)
            kline_text = self._format_kline_text(kline, rows=100)

            # 持仓/账户信息
            if self.account.positions:
                pos = self.account.positions[0]
                position_info = f"持仓: {pos.direction} {pos.quantity}手, 开仓价 {pos.open_price}, 浮动盈亏 {pos.unrealized_pnl}"
            else:
                position_info = "当前空仓"
            account_info = {
                'balance': getattr(self.account, 'balance', 0),
                'equity': getattr(self.account, 'equity', 0),
                'today_pnl': getattr(self.account, 'today_pnl', 0)
            }

            # 战略层分析 + 战术层决策
            strategic = self.strategic_agent.analyze(market_data, kline_text)
            if not strategic:
                return
            tactical = self.tactical_agent.decide(
                market_data=market_data,
                kline_text=kline_text,
                strategic_result=strategic,
                position_info=position_info,
                account_info=account_info,
                recent_lessons=[]
            )
            if not tactical:
                return

            action_map = {
                'open_long': 'open_long',
                'open_short': 'open_short',
                'close_position': 'close',
                'hold': 'hold'
            }
            final_signal = {
                'action': action_map.get(tactical.get('action', 'hold'), 'hold'),
                'quantity': tactical.get('quantity', 1),
                'confidence': tactical.get('confidence', 0)
            }

            current_price = kline['close'].iloc[-1]
            self._execute_signal(final_signal, current_price)
        except Exception as e:
            logger.error(f"LLM直接决策异常: {e}", exc_info=True)

    def _daily_review_job(self):
        """每日复盘任务"""
        if not self.llm_client or not self.daily_review_agent:
            logger.warning("LLM未配置，跳过每日复盘")
            return
        
        try:
            logger.info("\n" + "=" * 80)
            logger.info("执行每日复盘")
            logger.info("=" * 80)
            
            # 执行复盘
            self.daily_review_agent.run_review()
            
            logger.info("每日复盘完成")
            
        except Exception as e:
            logger.error(f"每日复盘异常: {e}", exc_info=True)

    def stop(self):
        """停止系统"""
        logger.info("正在停止系统...")
        
        if self.scheduler.running:
            self.scheduler.shutdown()
        
        self.is_running = False
        logger.info("系统已停止")

    def run_forever(self):
        """持续运行"""
        try:
            while self.is_running:
                time.sleep(1)
        except KeyboardInterrupt:
            logger.info("\n收到停止信号")
            self.stop()


def main():
    """主函数"""
    parser = argparse.ArgumentParser(description='智能交易系统 V2')
    parser.add_argument('--config', type=str, default='config/trading_params.yaml',
                       help='配置文件路径')
    args = parser.parse_args()
    
    # 初始化并启动系统
    system = TradingSystemV2(config_path=args.config)
    system.start()
    system.run_forever()


if __name__ == '__main__':
    main()
