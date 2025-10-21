"""
策略回测引擎 (Strategy Backtester)
Phase 6 核心模块 - 支持多策略协同回测

特性:
1. 多策略并行运行（趋势跟踪、均值回归、突破）
2. 集成智能风控层（自适应止损、仓位管理）
3. 集成执行层算法（TWAP、冰山、追击）
4. 支持多周期K线数据（1m, 15m, 1h, 4h, 1d）
5. 事件驱动架构（与TqSDK对齐）
6. 完整的成本模拟（滑点+手续费）
"""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, field
from loguru import logger
import pandas as pd
import numpy as np

from strategy.signal_router import SignalRouter
from strategy.trend_following import TrendFollowingStrategy
from strategy.mean_reversion import MeanReversionStrategy
from strategy.breakout import BreakoutStrategy
from risk_control.adaptive_risk_control import AdaptiveRiskControl, AdaptiveRiskConfig
from execution.smart_executor import SmartExecutor
from data.multi_timeframe_kline_v2 import MultiTimeframeKline
from data.indicators_v2 import IndicatorsCalculator
from data.order_flow_v2 import OrderFlowToxicity
from backtest.performance import PerformanceAnalyzer
from backtest.cost_model import CostModel, CostConfig, OrderBookDepth


@dataclass
class BacktestConfig:
    """回测配置"""
    # 基础配置
    symbol: str = 'CZCE.SA601'
    start_date: str = '2024-01-01'
    end_date: str = '2024-12-31'
    initial_capital: float = 100000.0
    
    # 策略配置
    enable_trend: bool = True
    enable_mean_reversion: bool = True
    enable_breakout: bool = True
    
    # 风控配置
    max_position: int = 2
    max_drawdown: float = 0.10
    daily_max_loss: float = -1500.0
    
    # 执行配置
    enable_smart_execution: bool = True
    max_slippage_ticks: int = 2
    
    # 数据配置
    bar_interval: str = '15m'  # 回测主周期
    
    # 成本配置
    commission_rate: float = 0.0003  # 手续费率
    slippage_ticks: int = 1  # 默认滑点


@dataclass
class Position:
    """持仓信息"""
    symbol: str = ''
    direction: str = ''  # 'long' or 'short'
    quantity: int = 0
    entry_price: float = 0.0
    entry_time: datetime = None
    stop_loss: float = 0.0
    take_profit: float = 0.0
    current_price: float = 0.0
    unrealized_pnl: float = 0.0
    strategy_name: str = ''
    
    def __post_init__(self):
        if self.entry_time is None:
            self.entry_time = datetime.now()
    
    def update_price(self, price: float):
        """更新当前价格和未实现盈亏"""
        self.current_price = price
        if self.direction == 'long':
            self.unrealized_pnl = (price - self.entry_price) * self.quantity
        elif self.direction == 'short':
            self.unrealized_pnl = (self.entry_price - price) * self.quantity


@dataclass
class Trade:
    """交易记录"""
    timestamp: datetime
    symbol: str
    action: str  # 'OPEN' or 'CLOSE'
    direction: str  # 'long' or 'short'
    quantity: int
    price: float
    commission: float
    slippage: float
    pnl: float = 0.0
    strategy_name: str = ''
    reasoning: List[str] = field(default_factory=list)


@dataclass
class BacktestResult:
    """回测结果"""
    config: BacktestConfig
    trades: List[Trade] = field(default_factory=list)
    equity_curve: pd.DataFrame = None
    performance_metrics: Dict = field(default_factory=dict)
    positions_history: List[Position] = field(default_factory=list)
    
    def __post_init__(self):
        if self.equity_curve is None:
            self.equity_curve = pd.DataFrame()


class StrategyBacktester:
    """
    多策略回测引擎
    
    核心功能:
    1. 支持多个策略同时运行
    2. 信号路由与冲突解决
    3. 智能风控管理
    4. 执行层算法选择
    5. 完整成本计算
    """
    
    def __init__(self,
                 config: BacktestConfig = None,
                 strategies: List[Any] = None,
                 risk_control: AdaptiveRiskControl = None,
                 executor: SmartExecutor = None):
        """
        初始化回测引擎
        
        Args:
            config: 回测配置
            strategies: 策略列表（如果为None则使用默认策略）
            risk_control: 风控器（如果为None则使用默认配置）
            executor: 执行器（如果为None则使用默认配置）
        """
        self.config = config or BacktestConfig()
        
        # 初始化策略
        if strategies is not None:
            self.strategies = strategies
        else:
            # 默认策略列表
            self.strategies = []
            if self.config.enable_trend:
                self.strategies.append(TrendFollowingStrategy())
            if self.config.enable_mean_reversion:
                self.strategies.append(MeanReversionStrategy())
            if self.config.enable_breakout:
                self.strategies.append(BreakoutStrategy())
        
        # 初始化信号路由器
        self.signal_router = SignalRouter()
        
        # 初始化风控
        if risk_control is not None:
            self.risk_control = risk_control
        else:
            risk_config = AdaptiveRiskConfig(
                max_position=self.config.max_position,
                max_drawdown=self.config.max_drawdown,
                daily_max_loss=self.config.daily_max_loss
            )
            self.risk_control = AdaptiveRiskControl(risk_config)
        
        # 初始化执行器
        if executor is not None:
            self.executor = executor
        else:
            self.executor = SmartExecutor(
                max_slippage_ticks=self.config.max_slippage_ticks
            ) if self.config.enable_smart_execution else None
        
        # 初始化数据引擎
        self.kline_manager = MultiTimeframeKline(None)  # 回测模式不需要实时客户端
        self.indicators_calculator = IndicatorsCalculator()
        self.order_flow_toxicity = OrderFlowToxicity()
        
        # 初始化成本模型
        self.cost_model = CostModel(CostConfig())
        
        # 回测状态
        self.current_position: Optional[Position] = None
        self.account_balance = self.config.initial_capital
        self.peak_balance = self.config.initial_capital
        self.trades: List[Trade] = []
        self.equity_curve_data: List[Dict] = []
        
        # 统计
        self.total_signals = 0
        self.executed_trades = 0
        self.rejected_by_risk = 0
        
        logger.info(f"策略回测引擎初始化完成")
        logger.info(f"  合约: {self.config.symbol}")
        logger.info(f"  周期: {self.config.start_date} ~ {self.config.end_date}")
        logger.info(f"  初始资金: {self.config.initial_capital:,.0f}")
        logger.info(f"  策略数量: {len(self.strategies)}")
        logger.info(f"  风控: {'启用' if risk_control else '默认'}")
        logger.info(f"  执行器: {'智能' if self.executor else '直接'}")
    
    def run(self, market_data: pd.DataFrame = None) -> BacktestResult:
        """
        运行回测
        
        Args:
            market_data: 市场数据（如果为None则自动加载）
            
        Returns:
            BacktestResult: 回测结果
        """
        logger.info(f"开始回测: {self.config.start_date} ~ {self.config.end_date}")
        
        # 加载数据
        if market_data is None:
            market_data = self._load_market_data()
        
        if market_data.empty:
            logger.error("市场数据为空，回测终止")
            return BacktestResult(config=self.config)
        
        logger.info(f"数据加载完成: {len(market_data)} 条K线")
        
        # 事件驱动回测循环
        for idx, row in market_data.iterrows():
            try:
                self._process_bar(row)
            except Exception as e:
                logger.error(f"处理K线时出错 (时间: {row.get('timestamp', idx)}): {e}")
                continue
        
        # 回测结束，平掉所有持仓
        if self.current_position:
            last_price = market_data.iloc[-1]['close']
            self._close_position(last_price, "回测结束强制平仓")
        
        # 生成回测结果
        result = self._generate_result()
        
        logger.info(f"回测完成")
        logger.info(f"  总信号数: {self.total_signals}")
        logger.info(f"  执行交易: {self.executed_trades}")
        logger.info(f"  风控拒绝: {self.rejected_by_risk}")
        logger.info(f"  最终权益: {self.account_balance:,.2f}")
        logger.info(f"  总收益率: {result.performance_metrics.get('total_return', 0):.2f}%")
        
        return result
    
    def _load_market_data(self) -> pd.DataFrame:
        """
        加载市场数据
        
        Returns:
            pd.DataFrame: K线数据
        """
        logger.info("加载市场数据...")
        
        # TODO: 实现从数据源加载K线数据
        # 这里应该调用 TqSDK 或数据库获取历史数据
        # 暂时返回空DataFrame
        
        logger.warning("市场数据加载未实现，返回空数据")
        return pd.DataFrame()
    
    def _process_bar(self, bar: pd.Series):
        """
        处理单根K线（事件驱动核心）
        
        Args:
            bar: K线数据
        """
        current_time = bar.get('timestamp', datetime.now())
        current_price = bar.get('close', 0)
        
        if current_price == 0:
            return
        
        # 1. 更新持仓状态
        if self.current_position:
            self.current_position.update_price(current_price)
            
            # 检查风控（止损/止盈）
            if self._check_stop_conditions(self.current_position, current_price):
                return  # 已平仓，不再生成新信号
        
        # 2. 准备市场数据
        market_data = self._prepare_market_data(bar)
        
        # 3. 生成交易信号
        if not self.current_position:  # 只在空仓时生成信号
            signal = self._generate_signal(market_data)
            
            if signal and signal['action'] != 'hold':
                self.total_signals += 1
                
                # 4. 风控检查
                if self._risk_check(signal, current_price):
                    # 5. 执行交易
                    self._execute_signal(signal, current_price, current_time)
                else:
                    self.rejected_by_risk += 1
                    logger.debug(f"信号被风控拒绝: {signal['action']}")
        
        # 6. 记录权益曲线
        self._record_equity(current_time, current_price)
    
    def _prepare_market_data(self, bar: pd.Series) -> Dict[str, Any]:
        """
        准备市场数据（多周期K线+指标+订单流）
        
        Args:
            bar: 当前K线
            
        Returns:
            Dict: 市场数据
        """
        # TODO: 实现多周期数据准备
        # 这里应该从历史数据中提取多周期K线和指标
        
        # 简化版本：只返回当前K线数据
        return {
            '15m': {
                'basic': {
                    'current_price': bar.get('close', 0),
                    'high': bar.get('high', 0),
                    'low': bar.get('low', 0),
                    'open': bar.get('open', 0),
                    'volume': bar.get('volume', 0),
                },
                'indicators': {},
                'trend': {'direction': 'neutral'},
            },
            '1h': {'indicators': {}, 'trend': {'direction': 'neutral'}},
            '4h': {'indicators': {}, 'trend': {'direction': 'neutral'}},
            '1d': {'indicators': {}, 'trend': {'direction': 'neutral'}},
            'order_flow': {},
        }
    
    def _generate_signal(self, market_data: Dict[str, Any]) -> Optional[Dict]:
        """
        生成交易信号（使用信号路由器）
        
        Args:
            market_data: 市场数据
            
        Returns:
            Dict: 交易信号
        """
        try:
            signal = self.signal_router.generate_signal(market_data)
            return signal
        except Exception as e:
            logger.error(f"生成信号时出错: {e}")
            return None
    
    def _risk_check(self, signal: Dict, current_price: float) -> bool:
        """
        风控检查
        
        Args:
            signal: 交易信号
            current_price: 当前价格
            
        Returns:
            bool: 是否通过风控检查
        """
        # 1. 检查账户级风控
        if self.account_balance < self.config.initial_capital * (1 - self.config.max_drawdown):
            logger.warning(f"达到最大回撤限制")
            return False
        
        # 2. 检查持仓数量
        if self.current_position and self.current_position.quantity >= self.config.max_position:
            logger.warning(f"达到最大持仓限制")
            return False
        
        # 3. 检查单日亏损
        today_trades = [t for t in self.trades if t.timestamp.date() == datetime.now().date()]
        today_pnl = sum(t.pnl for t in today_trades)
        if today_pnl < self.config.daily_max_loss:
            logger.warning(f"达到单日亏损限制: {today_pnl:.2f}")
            return False
        
        # 4. 检查信号置信度
        if signal.get('confidence', 0) < 0.6:
            logger.debug(f"信号置信度过低: {signal.get('confidence', 0):.2f}")
            return False
        
        return True
    
    def _execute_signal(self, signal: Dict, price: float, timestamp: datetime):
        """
        执行交易信号
        
        Args:
            signal: 交易信号
            price: 执行价格
            timestamp: 时间戳
        """
        action = signal['action']
        direction = 'long' if 'long' in action else 'short'
        quantity = signal.get('position_size', 1)
        
        # 计算成本
        commission = self._calculate_commission(price, quantity)
        slippage = self._calculate_slippage(price, action)
        
        # 调整价格（考虑滑点）
        executed_price = price + slippage if direction == 'long' else price - slippage
        
        # 创建持仓
        self.current_position = Position(
            symbol=self.config.symbol,
            direction=direction,
            quantity=quantity,
            entry_price=executed_price,
            entry_time=timestamp,
            stop_loss=signal.get('stop_loss', 0),
            take_profit=signal.get('take_profit', 0),
            current_price=executed_price,
            strategy_name=signal.get('strategy', 'unknown')
        )
        
        # 记录交易
        trade = Trade(
            timestamp=timestamp,
            symbol=self.config.symbol,
            action='OPEN',
            direction=direction,
            quantity=quantity,
            price=executed_price,
            commission=commission,
            slippage=abs(slippage),
            strategy_name=signal.get('strategy', 'unknown'),
            reasoning=signal.get('reasoning', [])
        )
        self.trades.append(trade)
        
        # 更新账户
        self.account_balance -= commission
        self.executed_trades += 1
        
        logger.info(f"开仓: {direction.upper()} {quantity}手 @ {executed_price:.2f} "
                   f"(手续费: {commission:.2f}, 滑点: {abs(slippage):.2f})")
    
    def _check_stop_conditions(self, position: Position, current_price: float) -> bool:
        """
        检查止损止盈条件
        
        Args:
            position: 持仓
            current_price: 当前价格
            
        Returns:
            bool: 是否触发平仓
        """
        if not position:
            return False
        
        # 更新未实现盈亏
        position.update_price(current_price)
        
        # 检查止损
        if position.stop_loss > 0:
            if position.direction == 'long' and current_price <= position.stop_loss:
                self._close_position(current_price, "止损")
                return True
            elif position.direction == 'short' and current_price >= position.stop_loss:
                self._close_position(current_price, "止损")
                return True
        
        # 检查止盈
        if position.take_profit > 0:
            if position.direction == 'long' and current_price >= position.take_profit:
                self._close_position(current_price, "止盈")
                return True
            elif position.direction == 'short' and current_price <= position.take_profit:
                self._close_position(current_price, "止盈")
                return True
        
        return False
    
    def _close_position(self, price: float, reason: str):
        """
        平仓
        
        Args:
            price: 平仓价格
            reason: 平仓原因
        """
        if not self.current_position:
            return
        
        position = self.current_position
        
        # 计算盈亏
        if position.direction == 'long':
            pnl = (price - position.entry_price) * position.quantity
        else:
            pnl = (position.entry_price - price) * position.quantity
        
        # 计算成本
        commission = self._calculate_commission(price, position.quantity)
        slippage = self._calculate_slippage(price, 'close')
        
        # 净盈亏
        net_pnl = pnl - commission - abs(slippage)
        
        # 记录交易
        trade = Trade(
            timestamp=datetime.now(),
            symbol=self.config.symbol,
            action='CLOSE',
            direction=position.direction,
            quantity=position.quantity,
            price=price,
            commission=commission,
            slippage=abs(slippage),
            pnl=net_pnl,
            strategy_name=position.strategy_name,
            reasoning=[reason]
        )
        self.trades.append(trade)
        
        # 更新账户
        self.account_balance += net_pnl - commission
        
        # 更新峰值
        if self.account_balance > self.peak_balance:
            self.peak_balance = self.account_balance
        
        logger.info(f"平仓: {position.direction.upper()} {position.quantity}手 @ {price:.2f} "
                   f"| 盈亏: {net_pnl:+.2f} | 原因: {reason}")
        
        # 清空持仓
        self.current_position = None
    
    def _calculate_commission(self, price: float, quantity: int, action: str = 'open', is_today: bool = False) -> float:
        """
        计算手续费（使用成本模型）
        
        Args:
            price: 价格
            quantity: 数量
            action: 动作 ('open' or 'close')
            is_today: 是否平今
            
        Returns:
            float: 手续费
        """
        return self.cost_model.calculate_commission(
            volume=quantity,
            action=action,
            is_today=is_today
        )
    
    def _calculate_slippage(self, price: float, action: str) -> float:
        """
        计算滑点
        
        Args:
            price: 价格
            action: 动作
            
        Returns:
            float: 滑点（元）
        """
        # 简化处理：固定1跳滑点
        tick_size = 1.0  # 纯碱最小变动价位1元
        return self.config.slippage_ticks * tick_size
    
    def _record_equity(self, timestamp: datetime, price: float):
        """
        记录权益曲线
        
        Args:
            timestamp: 时间戳
            price: 当前价格
        """
        # 计算当前权益
        equity = self.account_balance
        if self.current_position:
            self.current_position.update_price(price)
            equity += self.current_position.unrealized_pnl
        
        # 计算回撤
        drawdown = (self.peak_balance - equity) / self.peak_balance * 100 if self.peak_balance > 0 else 0
        
        self.equity_curve_data.append({
            'timestamp': timestamp,
            'equity': equity,
            'balance': self.account_balance,
            'unrealized_pnl': self.current_position.unrealized_pnl if self.current_position else 0,
            'drawdown': drawdown,
            'position': 1 if self.current_position else 0
        })
    
    def _generate_result(self) -> BacktestResult:
        """
        生成回测结果
        
        Returns:
            BacktestResult: 回测结果
        """
        # 创建权益曲线DataFrame
        equity_df = pd.DataFrame(self.equity_curve_data)
        if not equity_df.empty and 'timestamp' in equity_df.columns:
            equity_df.set_index('timestamp', inplace=True)
        
        # 计算性能指标
        performance_metrics = {}
        if self.trades:
            # 使用现有的性能分析器
            trade_dicts = [
                {
                    'action': t.action,
                    'pnl': t.pnl,
                    'timestamp': t.timestamp
                }
                for t in self.trades
            ]
            equity_curve_dicts = [
                {
                    'equity': row['equity'],
                    'timestamp': row['timestamp']
                }
                for row in self.equity_curve_data
            ]
            
            analyzer = PerformanceAnalyzer(
                initial_capital=self.config.initial_capital,
                trades=trade_dicts,
                equity_curve=equity_curve_dicts
            )
            performance_metrics = analyzer.generate_report()
        
        # 创建结果对象
        result = BacktestResult(
            config=self.config,
            trades=self.trades,
            equity_curve=equity_df,
            performance_metrics=performance_metrics
        )
        
        return result


# 测试代码
if __name__ == "__main__":
    # 配置日志
    logger.add("logs/strategy_backtester_{time}.log", rotation="1 day")
    
    # 创建回测配置
    config = BacktestConfig(
        symbol='CZCE.SA601',
        start_date='2024-01-01',
        end_date='2024-06-30',
        initial_capital=100000.0,
        enable_trend=True,
        enable_mean_reversion=True,
        enable_breakout=True
    )
    
    # 创建回测引擎
    backtester = StrategyBacktester(config=config)
    
    # 运行回测
    logger.info("=" * 60)
    logger.info("开始策略回测测试")
    logger.info("=" * 60)
    
    # 注意：需要提供实际的市场数据才能运行
    # result = backtester.run()
    
    logger.info("=" * 60)
    logger.info("策略回测引擎创建完成")
    logger.info(f"配置: {config.symbol} | {config.start_date} ~ {config.end_date}")
    logger.info(f"策略: 趋势跟踪, 均值回归, 突破")
    logger.info(f"风控: 最大回撤{config.max_drawdown*100}%, 单日亏损{config.daily_max_loss}")
    logger.info("=" * 60)
