"""
性能分析器增强版 (Performance Analyzer Enhanced)
Phase 6.1.3 - 15+性能指标计算

特性:
1. 收益指标（总收益率、年化收益率、月度/年度分布）
2. 风险指标（夏普、Sortino、Calmar、VaR、CVaR、最大回撤）
3. 交易指标（胜率、盈亏比、平均持仓时间）
4. 时间序列（滚动夏普、滚动波动率、滚动回撤）
"""

import pandas as pd
import numpy as np
from typing import List, Dict, Optional
from datetime import datetime, timedelta
from dataclasses import dataclass
from loguru import logger


@dataclass
class PerformanceMetrics:
    """性能指标数据类"""
    # 收益指标
    total_return: float = 0.0
    annual_return: float = 0.0
    monthly_return: float = 0.0
    daily_return: float = 0.0
    
    # 风险指标
    sharpe_ratio: float = 0.0
    sortino_ratio: float = 0.0
    calmar_ratio: float = 0.0
    max_drawdown: float = 0.0
    max_drawdown_duration: int = 0
    volatility: float = 0.0
    downside_volatility: float = 0.0
    var_95: float = 0.0
    cvar_95: float = 0.0
    
    # 交易指标
    total_trades: int = 0
    win_trades: int = 0
    loss_trades: int = 0
    win_rate: float = 0.0
    profit_factor: float = 0.0
    avg_win: float = 0.0
    avg_loss: float = 0.0
    profit_loss_ratio: float = 0.0
    avg_holding_hours: float = 0.0
    max_consecutive_wins: int = 0
    max_consecutive_losses: int = 0
    
    # 时间指标
    trading_days: int = 0
    start_date: str = ''
    end_date: str = ''
    
    def to_dict(self) -> Dict:
        """转换为字典"""
        return {k: v for k, v in self.__dict__.items()}


class PerformanceAnalyzerEnhanced:
    """
    增强版性能分析器
    
    核心功能:
    1. 计算15+性能指标
    2. 滚动窗口分析
    3. 分组统计（月度/年度）
    4. 风险价值计算（VaR/CVaR）
    """
    
    def __init__(self,
                 initial_capital: float,
                 trades: List[Dict],
                 equity_curve: pd.DataFrame,
                 risk_free_rate: float = 0.03):
        """
        初始化性能分析器
        
        Args:
            initial_capital: 初始资金
            trades: 交易记录列表
            equity_curve: 权益曲线DataFrame
            risk_free_rate: 无风险利率（年化）
        """
        self.initial_capital = initial_capital
        self.trades = trades
        self.equity_curve = equity_curve
        self.risk_free_rate = risk_free_rate
        
        # 准备数据
        self._prepare_data()
        
        logger.info("增强版性能分析器初始化完成")
        logger.info(f"  交易记录: {len(self.trades)}笔")
        logger.info(f"  权益数据: {len(self.equity_curve)}条")
    
    def _prepare_data(self):
        """准备分析数据"""
        # 确保权益曲线有数据
        if self.equity_curve.empty:
            self.daily_returns = pd.Series()
            self.close_trades = []
            return
        
        # 计算日收益率
        if 'equity' in self.equity_curve.columns:
            self.equity_series = self.equity_curve['equity']
            self.daily_returns = self.equity_series.pct_change().dropna()
        else:
            self.equity_series = pd.Series()
            self.daily_returns = pd.Series()
        
        # 筛选平仓交易
        self.close_trades = [t for t in self.trades if t.get('action') == 'CLOSE']
    
    def analyze(self) -> PerformanceMetrics:
        """
        全面分析
        
        Returns:
            PerformanceMetrics: 性能指标对象
        """
        metrics = PerformanceMetrics()
        
        if self.equity_curve.empty:
            logger.warning("权益曲线为空，返回零指标")
            return metrics
        
        # 1. 收益指标
        metrics.total_return = self._calculate_total_return()
        metrics.annual_return = self._calculate_annual_return()
        metrics.monthly_return = metrics.annual_return / 12
        metrics.daily_return = self._calculate_avg_daily_return()
        
        # 2. 风险指标
        metrics.sharpe_ratio = self._calculate_sharpe_ratio()
        metrics.sortino_ratio = self._calculate_sortino_ratio()
        metrics.calmar_ratio = self._calculate_calmar_ratio(metrics.annual_return)
        metrics.max_drawdown, metrics.max_drawdown_duration = self._calculate_max_drawdown()
        metrics.volatility = self._calculate_volatility()
        metrics.downside_volatility = self._calculate_downside_volatility()
        metrics.var_95 = self._calculate_var(0.95)
        metrics.cvar_95 = self._calculate_cvar(0.95)
        
        # 3. 交易指标
        trade_metrics = self._calculate_trade_metrics()
        for key, value in trade_metrics.items():
            setattr(metrics, key, value)
        
        # 4. 时间指标
        metrics.trading_days = len(self.equity_curve)
        if hasattr(self.equity_curve.index, 'min'):
            metrics.start_date = str(self.equity_curve.index.min())[:10]
            metrics.end_date = str(self.equity_curve.index.max())[:10]
        
        logger.info("性能分析完成")
        logger.info(f"  总收益率: {metrics.total_return:.2f}%")
        logger.info(f"  夏普比率: {metrics.sharpe_ratio:.2f}")
        logger.info(f"  最大回撤: {metrics.max_drawdown:.2f}%")
        logger.info(f"  胜率: {metrics.win_rate:.2f}%")
        
        return metrics
    
    def _calculate_total_return(self) -> float:
        """计算总收益率"""
        if self.equity_series.empty:
            return 0.0
        
        final_equity = self.equity_series.iloc[-1]
        return ((final_equity - self.initial_capital) / self.initial_capital) * 100
    
    def _calculate_annual_return(self) -> float:
        """计算年化收益率"""
        if self.equity_series.empty or len(self.equity_series) < 2:
            return 0.0
        
        # 计算总天数
        if hasattr(self.equity_curve.index, 'min'):
            days = (self.equity_curve.index.max() - self.equity_curve.index.min()).days
        else:
            days = len(self.equity_curve)
        
        if days == 0:
            return 0.0
        
        # 年化收益 = (期末/期初)^(365/天数) - 1
        final_equity = self.equity_series.iloc[-1]
        annual_return = ((final_equity / self.initial_capital) ** (365 / days) - 1) * 100
        
        return annual_return
    
    def _calculate_avg_daily_return(self) -> float:
        """计算平均日收益率"""
        if self.daily_returns.empty:
            return 0.0
        return self.daily_returns.mean() * 100
    
    def _calculate_sharpe_ratio(self) -> float:
        """计算夏普比率"""
        if self.daily_returns.empty or len(self.daily_returns) < 2:
            return 0.0
        
        # 日均收益
        mean_return = self.daily_returns.mean()
        
        # 日收益标准差
        std_return = self.daily_returns.std()
        
        if std_return == 0:
            return 0.0
        
        # 日无风险利率
        daily_rf = self.risk_free_rate / 252
        
        # 夏普比率 = (日均收益 - 无风险利率) / 日收益标准差 * sqrt(252)
        sharpe = (mean_return - daily_rf) / std_return * np.sqrt(252)
        
        return sharpe
    
    def _calculate_sortino_ratio(self) -> float:
        """
        计算Sortino比率
        只考虑下行波动（负收益的标准差）
        """
        if self.daily_returns.empty or len(self.daily_returns) < 2:
            return 0.0
        
        # 日均收益
        mean_return = self.daily_returns.mean()
        
        # 下行收益（只取负值）
        downside_returns = self.daily_returns[self.daily_returns < 0]
        
        if len(downside_returns) == 0:
            return 0.0  # 没有负收益，无法计算
        
        # 下行标准差
        downside_std = downside_returns.std()
        
        if downside_std == 0:
            return 0.0
        
        # 日无风险利率
        daily_rf = self.risk_free_rate / 252
        
        # Sortino比率
        sortino = (mean_return - daily_rf) / downside_std * np.sqrt(252)
        
        return sortino
    
    def _calculate_calmar_ratio(self, annual_return: float) -> float:
        """
        计算Calmar比率
        Calmar = 年化收益率 / 最大回撤
        """
        max_dd, _ = self._calculate_max_drawdown()
        
        if max_dd == 0:
            return 0.0
        
        # 转换为小数
        return annual_return / max_dd
    
    def _calculate_max_drawdown(self) -> tuple:
        """
        计算最大回撤和最大回撤持续时间
        
        Returns:
            tuple: (最大回撤百分比, 持续天数)
        """
        if self.equity_series.empty:
            return 0.0, 0
        
        # 计算累计最大值
        cummax = self.equity_series.cummax()
        
        # 计算回撤
        drawdown = (self.equity_series - cummax) / cummax * 100
        
        # 最大回撤
        max_dd = abs(drawdown.min())
        
        # 计算最大回撤持续时间
        dd_duration = 0
        current_duration = 0
        
        for dd in drawdown:
            if dd < 0:
                current_duration += 1
                dd_duration = max(dd_duration, current_duration)
            else:
                current_duration = 0
        
        return max_dd, dd_duration
    
    def _calculate_volatility(self) -> float:
        """计算年化波动率"""
        if self.daily_returns.empty or len(self.daily_returns) < 2:
            return 0.0
        
        # 年化波动率 = 日收益标准差 * sqrt(252)
        return self.daily_returns.std() * np.sqrt(252) * 100
    
    def _calculate_downside_volatility(self) -> float:
        """计算年化下行波动率（只考虑负收益）"""
        if self.daily_returns.empty:
            return 0.0
        
        downside_returns = self.daily_returns[self.daily_returns < 0]
        
        if len(downside_returns) == 0:
            return 0.0
        
        return downside_returns.std() * np.sqrt(252) * 100
    
    def _calculate_var(self, confidence: float = 0.95) -> float:
        """
        计算风险价值（VaR）
        
        Args:
            confidence: 置信水平（如0.95表示95%）
            
        Returns:
            float: VaR值（百分比）
        """
        if self.daily_returns.empty:
            return 0.0
        
        # VaR = 收益分布的(1-置信度)分位数
        var = np.percentile(self.daily_returns, (1 - confidence) * 100)
        
        return abs(var * 100)
    
    def _calculate_cvar(self, confidence: float = 0.95) -> float:
        """
        计算条件风险价值（CVaR）
        CVaR = 超过VaR的损失的平均值
        
        Args:
            confidence: 置信水平
            
        Returns:
            float: CVaR值（百分比）
        """
        if self.daily_returns.empty:
            return 0.0
        
        # 计算VaR阈值
        var_threshold = np.percentile(self.daily_returns, (1 - confidence) * 100)
        
        # 找出超过VaR的收益
        tail_losses = self.daily_returns[self.daily_returns <= var_threshold]
        
        if len(tail_losses) == 0:
            return 0.0
        
        # CVaR = 尾部损失的平均值
        cvar = tail_losses.mean()
        
        return abs(cvar * 100)
    
    def _calculate_trade_metrics(self) -> Dict:
        """计算交易统计指标"""
        if not self.close_trades:
            return {
                'total_trades': 0,
                'win_trades': 0,
                'loss_trades': 0,
                'win_rate': 0.0,
                'profit_factor': 0.0,
                'avg_win': 0.0,
                'avg_loss': 0.0,
                'profit_loss_ratio': 0.0,
                'avg_holding_hours': 0.0,
                'max_consecutive_wins': 0,
                'max_consecutive_losses': 0
            }
        
        # 基础统计
        total_trades = len(self.close_trades)
        pnls = [t.get('pnl', 0) for t in self.close_trades]
        
        wins = [p for p in pnls if p > 0]
        losses = [p for p in pnls if p < 0]
        
        win_trades = len(wins)
        loss_trades = len(losses)
        
        # 胜率
        win_rate = (win_trades / total_trades * 100) if total_trades > 0 else 0.0
        
        # 平均盈利/亏损
        avg_win = np.mean(wins) if wins else 0.0
        avg_loss = abs(np.mean(losses)) if losses else 0.0
        
        # 盈亏比
        profit_loss_ratio = (avg_win / avg_loss) if avg_loss > 0 else 0.0
        
        # 盈利因子（总盈利/总亏损）
        total_win = sum(wins)
        total_loss = abs(sum(losses))
        profit_factor = (total_win / total_loss) if total_loss > 0 else 0.0
        
        # 平均持仓时间（小时）
        holding_times = []
        for trade in self.close_trades:
            # 假设trades有entry_time和exit_time
            if 'holding_time' in trade:
                holding_times.append(trade['holding_time'])
        
        avg_holding_hours = np.mean(holding_times) if holding_times else 0.0
        
        # 最大连续盈亏
        max_consec_wins = 0
        max_consec_losses = 0
        current_wins = 0
        current_losses = 0
        
        for pnl in pnls:
            if pnl > 0:
                current_wins += 1
                current_losses = 0
                max_consec_wins = max(max_consec_wins, current_wins)
            elif pnl < 0:
                current_losses += 1
                current_wins = 0
                max_consec_losses = max(max_consec_losses, current_losses)
        
        return {
            'total_trades': total_trades,
            'win_trades': win_trades,
            'loss_trades': loss_trades,
            'win_rate': win_rate,
            'profit_factor': profit_factor,
            'avg_win': avg_win,
            'avg_loss': avg_loss,
            'profit_loss_ratio': profit_loss_ratio,
            'avg_holding_hours': avg_holding_hours,
            'max_consecutive_wins': max_consec_wins,
            'max_consecutive_losses': max_consec_losses
        }
    
    def calculate_rolling_metrics(self, window: int = 30) -> pd.DataFrame:
        """
        计算滚动窗口指标
        
        Args:
            window: 滚动窗口大小（天）
            
        Returns:
            pd.DataFrame: 滚动指标
        """
        if self.daily_returns.empty or len(self.daily_returns) < window:
            return pd.DataFrame()
        
        # 滚动夏普比率
        rolling_sharpe = self.daily_returns.rolling(window).apply(
            lambda x: (x.mean() / x.std() * np.sqrt(252)) if x.std() > 0 else 0
        )
        
        # 滚动波动率
        rolling_vol = self.daily_returns.rolling(window).std() * np.sqrt(252) * 100
        
        # 滚动回撤
        rolling_equity = self.equity_series.rolling(window).apply(
            lambda x: abs((x.iloc[-1] - x.max()) / x.max() * 100) if len(x) > 0 else 0
        )
        
        result = pd.DataFrame({
            'rolling_sharpe': rolling_sharpe,
            'rolling_volatility': rolling_vol,
            'rolling_drawdown': rolling_equity
        })
        
        return result
    
    def get_monthly_returns(self) -> pd.Series:
        """获取月度收益率"""
        if self.equity_series.empty:
            return pd.Series()
        
        # 按月分组
        if hasattr(self.equity_series.index, 'to_period'):
            monthly = self.equity_series.resample('M').last()
            monthly_returns = monthly.pct_change() * 100
            return monthly_returns.dropna()
        
        return pd.Series()
    
    def generate_report(self) -> Dict:
        """
        生成完整报告（兼容旧接口）
        
        Returns:
            Dict: 性能指标字典
        """
        metrics = self.analyze()
        return metrics.to_dict()


# 测试代码
if __name__ == "__main__":
    logger.add("logs/performance_analyzer_{time}.log", rotation="1 day")
    
    logger.info("=" * 60)
    logger.info("性能分析器增强版测试")
    logger.info("=" * 60)
    
    # 模拟数据
    np.random.seed(42)
    dates = pd.date_range('2024-01-01', periods=100, freq='D')
    
    # 模拟权益曲线（随机游走）
    returns = np.random.normal(0.001, 0.02, 100)
    equity = 100000 * (1 + returns).cumprod()
    
    equity_df = pd.DataFrame({
        'equity': equity,
        'timestamp': dates
    }).set_index('timestamp')
    
    # 模拟交易记录
    trades = []
    for i in range(20):
        pnl = np.random.normal(100, 500)
        trades.append({
            'action': 'CLOSE',
            'pnl': pnl,
            'timestamp': dates[i * 5]
        })
    
    # 创建分析器
    analyzer = PerformanceAnalyzerEnhanced(
        initial_capital=100000,
        trades=trades,
        equity_curve=equity_df
    )
    
    # 分析
    metrics = analyzer.analyze()
    
    # 输出结果
    logger.info("\n【收益指标】")
    logger.info(f"总收益率: {metrics.total_return:.2f}%")
    logger.info(f"年化收益率: {metrics.annual_return:.2f}%")
    logger.info(f"月度收益率: {metrics.monthly_return:.2f}%")
    
    logger.info("\n【风险指标】")
    logger.info(f"夏普比率: {metrics.sharpe_ratio:.2f}")
    logger.info(f"Sortino比率: {metrics.sortino_ratio:.2f}")
    logger.info(f"Calmar比率: {metrics.calmar_ratio:.2f}")
    logger.info(f"最大回撤: {metrics.max_drawdown:.2f}%")
    logger.info(f"波动率: {metrics.volatility:.2f}%")
    logger.info(f"VaR(95%): {metrics.var_95:.2f}%")
    logger.info(f"CVaR(95%): {metrics.cvar_95:.2f}%")
    
    logger.info("\n【交易指标】")
    logger.info(f"总交易: {metrics.total_trades}笔")
    logger.info(f"胜率: {metrics.win_rate:.2f}%")
    logger.info(f"盈亏比: {metrics.profit_loss_ratio:.2f}")
    logger.info(f"盈利因子: {metrics.profit_factor:.2f}")
    logger.info(f"最大连胜: {metrics.max_consecutive_wins}笔")
    logger.info(f"最大连亏: {metrics.max_consecutive_losses}笔")
    
    logger.info("\n" + "=" * 60)
    logger.info("测试完成")
    logger.info("=" * 60)
