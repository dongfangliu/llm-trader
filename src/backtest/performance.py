"""
性能分析器
计算回测的各项性能指标
"""

import pandas as pd
import numpy as np
from typing import List, Dict
from loguru import logger


class PerformanceAnalyzer:
    """性能分析器"""

    def __init__(self,
                 initial_capital: float,
                 trades: List[Dict],
                 equity_curve: List[Dict]):
        """
        初始化性能分析器

        Args:
            initial_capital: 初始资金
            trades: 交易记录列表
            equity_curve: 权益曲线
        """
        self.initial_capital = initial_capital
        self.trades = trades
        self.equity_curve = equity_curve

    def generate_report(self) -> Dict:
        """
        生成完整的性能报告

        Returns:
            dict: 性能指标
        """
        report = {}

        # 基础指标
        report['initial_capital'] = self.initial_capital

        if self.equity_curve:
            final_equity = self.equity_curve[-1]['equity']
            report['final_equity'] = final_equity
            report['total_return'] = ((final_equity - self.initial_capital) / self.initial_capital) * 100
        else:
            report['final_equity'] = self.initial_capital
            report['total_return'] = 0.0

        # 交易统计
        report.update(self._calculate_trade_stats())

        # 风险指标
        report.update(self._calculate_risk_metrics())

        # 时间指标
        report.update(self._calculate_time_metrics())

        return report

    def _calculate_trade_stats(self) -> Dict:
        """计算交易统计"""
        close_trades = [t for t in self.trades if t.get('action') == 'CLOSE']

        if not close_trades:
            return {
                'total_trades': 0,
                'win_trades': 0,
                'loss_trades': 0,
                'win_rate': 0.0,
                'avg_win': 0.0,
                'avg_loss': 0.0,
                'largest_win': 0.0,
                'largest_loss': 0.0,
                'profit_factor': 0.0
            }

        total_trades = len(close_trades)
        pnls = [t.get('pnl', 0) for t in close_trades if t.get('pnl') is not None]

        wins = [p for p in pnls if p > 0]
        losses = [p for p in pnls if p < 0]

        win_trades = len(wins)
        loss_trades = len(losses)
        win_rate = (win_trades / total_trades * 100) if total_trades > 0 else 0

        avg_win = np.mean(wins) if wins else 0
        avg_loss = np.mean(losses) if losses else 0
        largest_win = max(wins) if wins else 0
        largest_loss = min(losses) if losses else 0

        total_wins = sum(wins) if wins else 0
        total_losses = abs(sum(losses)) if losses else 0
        profit_factor = (total_wins / total_losses) if total_losses > 0 else 0

        return {
            'total_trades': total_trades,
            'win_trades': win_trades,
            'loss_trades': loss_trades,
            'win_rate': round(win_rate, 2),
            'avg_win': round(avg_win, 2),
            'avg_loss': round(avg_loss, 2),
            'largest_win': round(largest_win, 2),
            'largest_loss': round(largest_loss, 2),
            'profit_factor': round(profit_factor, 2)
        }

    def _calculate_risk_metrics(self) -> Dict:
        """计算风险指标"""
        if not self.equity_curve:
            return {
                'max_drawdown': 0.0,
                'sharpe_ratio': 0.0,
                'calmar_ratio': 0.0
            }

        df = pd.DataFrame(self.equity_curve)

        # 最大回撤
        df['cummax'] = df['equity'].cummax()
        df['drawdown'] = (df['equity'] - df['cummax']) / df['cummax'] * 100
        max_drawdown = abs(df['drawdown'].min())

        # 夏普比率（简化版，假设无风险利率为0）
        df['returns'] = df['equity'].pct_change()
        returns = df['returns'].dropna()

        if len(returns) > 0 and returns.std() > 0:
            sharpe_ratio = (returns.mean() / returns.std()) * np.sqrt(252 * 16)  # 年化
        else:
            sharpe_ratio = 0.0

        # Calmar比率
        if max_drawdown > 0:
            annual_return = ((df['equity'].iloc[-1] / self.initial_capital) - 1) * 100
            calmar_ratio = annual_return / max_drawdown
        else:
            calmar_ratio = 0.0

        return {
            'max_drawdown': round(max_drawdown, 2),
            'sharpe_ratio': round(sharpe_ratio, 2),
            'calmar_ratio': round(calmar_ratio, 2)
        }

    def _calculate_time_metrics(self) -> Dict:
        """计算时间相关指标"""
        close_trades = [t for t in self.trades if t.get('action') == 'CLOSE']

        if not close_trades:
            return {
                'avg_hold_time_hours': 0.0,
                'max_hold_time_hours': 0.0
            }

        hold_times = [t.get('hold_hours', 0) for t in close_trades if t.get('hold_hours')]

        if hold_times:
            avg_hold = np.mean(hold_times)
            max_hold = max(hold_times)
        else:
            avg_hold = 0.0
            max_hold = 0.0

        return {
            'avg_hold_time_hours': round(avg_hold, 2),
            'max_hold_time_hours': round(max_hold, 2)
        }

    def print_report(self, report: Dict):
        """打印格式化的报告"""
        print("\n" + "=" * 80)
        print("性能分析报告")
        print("=" * 80)

        print("\n【资金情况】")
        print(f"  初始资金: {report['initial_capital']:,.2f}")
        print(f"  最终权益: {report['final_equity']:,.2f}")
        print(f"  总收益率: {report['total_return']:+.2f}%")

        print("\n【交易统计】")
        print(f"  总交易次数: {report['total_trades']}")
        print(f"  盈利交易: {report['win_trades']}")
        print(f"  亏损交易: {report['loss_trades']}")
        print(f"  胜率: {report['win_rate']:.2f}%")
        print(f"  平均盈利: {report['avg_win']:,.2f}")
        print(f"  平均亏损: {report['avg_loss']:,.2f}")
        print(f"  最大盈利: {report['largest_win']:,.2f}")
        print(f"  最大亏损: {report['largest_loss']:,.2f}")
        print(f"  盈亏比: {report['profit_factor']:.2f}")

        print("\n【风险指标】")
        print(f"  最大回撤: {report['max_drawdown']:.2f}%")
        print(f"  夏普比率: {report['sharpe_ratio']:.2f}")
        print(f"  Calmar比率: {report['calmar_ratio']:.2f}")

        print("\n【时间指标】")
        print(f"  平均持仓时间: {report['avg_hold_time_hours']:.2f} 小时")
        print(f"  最长持仓时间: {report['max_hold_time_hours']:.2f} 小时")

        print("\n" + "=" * 80)


if __name__ == "__main__":
    # 测试代码
    mock_trades = [
        {'action': 'CLOSE', 'pnl': 50, 'hold_hours': 2.5},
        {'action': 'CLOSE', 'pnl': -30, 'hold_hours': 1.5},
        {'action': 'CLOSE', 'pnl': 80, 'hold_hours': 3.0},
        {'action': 'CLOSE', 'pnl': -20, 'hold_hours': 1.0},
        {'action': 'CLOSE', 'pnl': 100, 'hold_hours': 4.0}
    ]

    mock_equity_curve = [
        {'timestamp': '2025-01-01 09:00', 'equity': 50000},
        {'timestamp': '2025-01-01 10:00', 'equity': 50050},
        {'timestamp': '2025-01-01 11:00', 'equity': 50020},
        {'timestamp': '2025-01-01 12:00', 'equity': 50100},
        {'timestamp': '2025-01-01 13:00', 'equity': 50080},
        {'timestamp': '2025-01-01 14:00', 'equity': 50180}
    ]

    analyzer = PerformanceAnalyzer(
        initial_capital=50000,
        trades=mock_trades,
        equity_curve=mock_equity_curve
    )

    report = analyzer.generate_report()
    analyzer.print_report(report)
