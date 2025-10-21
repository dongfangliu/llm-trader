"""
回测结果可视化模块

提供多种专业的回测结果可视化图表。

Author: AI Assistant
Date: 2025-10-21
"""

import logging
from typing import Dict, List, Any, Optional
import pandas as pd
import numpy as np

logger = logging.getLogger(__name__)


class BacktestVisualizer:
    """
    回测结果可视化器
    
    功能：
    1. 权益曲线图（含回撤标注）
    2. 持仓分布图
    3. 收益分布直方图
    4. 滚动指标曲线（夏普、波动率）
    """
    
    def __init__(self, figsize: tuple = (15, 10), style: str = 'default'):
        """
        初始化可视化器
        
        Args:
            figsize: 图表尺寸
            style: 图表样式
        """
        self.figsize = figsize
        self.style = style
        
        logger.info("回测可视化器初始化完成")
    
    def plot_all(
        self,
        equity_curve: pd.DataFrame,
        trades: pd.DataFrame,
        metrics: Dict[str, float],
        save_path: str = None
    ) -> Dict[str, Any]:
        """
        绘制所有图表
        
        Args:
            equity_curve: 权益曲线数据
            trades: 交易记录
            metrics: 性能指标
            save_path: 保存路径（可选）
        
        Returns:
            图表对象字典
        """
        try:
            import matplotlib.pyplot as plt
            plt.style.use(self.style)
            
            fig = plt.figure(figsize=self.figsize)
            gs = fig.add_gridspec(3, 2, hspace=0.3, wspace=0.3)
            
            # 1. 权益曲线和回撤
            ax1 = fig.add_subplot(gs[0, :])
            self._plot_equity_curve(ax1, equity_curve)
            
            # 2. 收益分布
            ax2 = fig.add_subplot(gs[1, 0])
            self._plot_returns_distribution(ax2, trades)
            
            # 3. 月度收益
            ax3 = fig.add_subplot(gs[1, 1])
            self._plot_monthly_returns(ax3, equity_curve)
            
            # 4. 滚动夏普比率
            ax4 = fig.add_subplot(gs[2, 0])
            self._plot_rolling_sharpe(ax4, equity_curve)
            
            # 5. 性能指标摘要
            ax5 = fig.add_subplot(gs[2, 1])
            self._plot_metrics_table(ax5, metrics)
            
            plt.suptitle('回测结果分析报告', fontsize=16, fontweight='bold', y=0.995)
            
            if save_path:
                plt.savefig(save_path, dpi=300, bbox_inches='tight')
                logger.info(f"图表已保存到: {save_path}")
            
            return {'figure': fig}
            
        except ImportError:
            logger.warning("matplotlib未安装，无法生成图表")
            return {}
    
    def _plot_equity_curve(self, ax, equity_curve: pd.DataFrame):
        """绘制权益曲线和回撤"""
        # 权益曲线
        ax.plot(equity_curve['datetime'], equity_curve['equity'], 
                'b-', linewidth=2, label='权益曲线')
        
        # 最高点
        peak = equity_curve['equity'].cummax()
        ax.plot(equity_curve['datetime'], peak, 
                'g--', linewidth=1, alpha=0.5, label='历史最高')
        
        # 回撤区域
        drawdown = (peak - equity_curve['equity']) / peak
        ax2 = ax.twinx()
        ax2.fill_between(equity_curve['datetime'], 0, -drawdown * 100, 
                         color='red', alpha=0.3, label='回撤')
        
        ax.set_xlabel('日期')
        ax.set_ylabel('权益', color='b')
        ax2.set_ylabel('回撤 (%)', color='r')
        ax.set_title('权益曲线与回撤')
        ax.legend(loc='upper left')
        ax2.legend(loc='upper right')
        ax.grid(True, alpha=0.3)
    
    def _plot_returns_distribution(self, ax, trades: pd.DataFrame):
        """绘制收益分布"""
        if 'pnl' not in trades.columns or len(trades) == 0:
            ax.text(0.5, 0.5, '无交易数据', ha='center', va='center')
            return
        
        pnls = trades['pnl'].values
        
        # 分离盈利和亏损
        wins = pnls[pnls > 0]
        losses = pnls[pnls < 0]
        
        # 绘制直方图
        ax.hist(wins, bins=20, alpha=0.7, color='green', label=f'盈利 ({len(wins)}笔)')
        ax.hist(losses, bins=20, alpha=0.7, color='red', label=f'亏损 ({len(losses)}笔)')
        
        # 均值线
        ax.axvline(np.mean(wins) if len(wins) > 0 else 0, 
                   color='darkgreen', linestyle='--', linewidth=1.5, label='平均盈利')
        ax.axvline(np.mean(losses) if len(losses) > 0 else 0, 
                   color='darkred', linestyle='--', linewidth=1.5, label='平均亏损')
        
        ax.set_xlabel('盈亏 (元)')
        ax.set_ylabel('频数')
        ax.set_title('收益分布')
        ax.legend()
        ax.grid(True, alpha=0.3)
    
    def _plot_monthly_returns(self, ax, equity_curve: pd.DataFrame):
        """绘制月度收益"""
        if len(equity_curve) == 0:
            ax.text(0.5, 0.5, '无数据', ha='center', va='center')
            return
        
        # 计算月度收益
        equity_curve['month'] = pd.to_datetime(equity_curve['datetime']).dt.to_period('M')
        monthly = equity_curve.groupby('month').agg({
            'equity': ['first', 'last']
        })
        monthly['return'] = (monthly[('equity', 'last')] - monthly[('equity', 'first')]) / monthly[('equity', 'first')] * 100
        
        # 绘制柱状图
        colors = ['green' if r > 0 else 'red' for r in monthly['return']]
        ax.bar(range(len(monthly)), monthly['return'], color=colors, alpha=0.7)
        
        ax.set_xlabel('月份')
        ax.set_ylabel('收益率 (%)')
        ax.set_title('月度收益率')
        ax.axhline(0, color='black', linewidth=0.5)
        ax.grid(True, alpha=0.3, axis='y')
        
        # 设置x轴标签
        ax.set_xticks(range(len(monthly)))
        ax.set_xticklabels([str(m) for m in monthly.index], rotation=45, ha='right')
    
    def _plot_rolling_sharpe(self, ax, equity_curve: pd.DataFrame, window: int = 20):
        """绘制滚动夏普比率"""
        if len(equity_curve) < window:
            ax.text(0.5, 0.5, '数据不足', ha='center', va='center')
            return
        
        # 计算日收益率
        returns = equity_curve['equity'].pct_change().dropna()
        
        # 计算滚动夏普比率
        rolling_sharpe = returns.rolling(window=window).apply(
            lambda x: x.mean() / x.std() * np.sqrt(252) if x.std() > 0 else 0
        )
        
        # 绘制
        ax.plot(equity_curve['datetime'].iloc[window:], rolling_sharpe.iloc[window:], 
                'purple', linewidth=2)
        ax.axhline(0, color='black', linewidth=0.5, linestyle='--')
        ax.axhline(1, color='green', linewidth=0.5, linestyle='--', alpha=0.5, label='夏普=1')
        ax.axhline(2, color='darkgreen', linewidth=0.5, linestyle='--', alpha=0.5, label='夏普=2')
        
        ax.set_xlabel('日期')
        ax.set_ylabel('夏普比率')
        ax.set_title(f'滚动夏普比率 ({window}日窗口)')
        ax.legend()
        ax.grid(True, alpha=0.3)
    
    def _plot_metrics_table(self, ax, metrics: Dict[str, float]):
        """绘制性能指标表格"""
        ax.axis('off')
        
        # 选择关键指标
        key_metrics = [
            ('总收益率', 'total_return', '%'),
            ('年化收益率', 'annual_return', '%'),
            ('夏普比率', 'sharpe_ratio', ''),
            ('最大回撤', 'max_drawdown', '%'),
            ('胜率', 'win_rate', '%'),
            ('盈亏比', 'profit_factor', ''),
            ('交易次数', 'total_trades', ''),
        ]
        
        # 准备表格数据
        table_data = []
        for label, key, unit in key_metrics:
            value = metrics.get(key, 0)
            if unit == '%':
                formatted = f"{value*100:.2f}%" if abs(value) < 10 else f"{value:.2f}%"
            else:
                formatted = f"{value:.2f}" if isinstance(value, float) else str(value)
            table_data.append([label, formatted])
        
        # 创建表格
        table = ax.table(
            cellText=table_data,
            colLabels=['指标', '数值'],
            cellLoc='left',
            loc='center',
            colWidths=[0.6, 0.4]
        )
        
        table.auto_set_font_size(False)
        table.set_fontsize(10)
        table.scale(1, 2)
        
        # 设置表格样式
        for (i, j), cell in table.get_celld().items():
            if i == 0:
                cell.set_facecolor('#4CAF50')
                cell.set_text_props(weight='bold', color='white')
            else:
                cell.set_facecolor('#f0f0f0' if i % 2 == 0 else 'white')
        
        ax.set_title('核心性能指标', fontsize=12, fontweight='bold', pad=20)
    
    def plot_single(
        self,
        data: Any,
        plot_type: str,
        save_path: str = None,
        **kwargs
    ):
        """
        绘制单个图表
        
        Args:
            data: 数据
            plot_type: 图表类型（equity/distribution/monthly/rolling_sharpe/metrics）
            save_path: 保存路径
            **kwargs: 额外参数
        """
        try:
            import matplotlib.pyplot as plt
            
            fig, ax = plt.subplots(figsize=(12, 6))
            
            if plot_type == 'equity':
                self._plot_equity_curve(ax, data)
            elif plot_type == 'distribution':
                self._plot_returns_distribution(ax, data)
            elif plot_type == 'monthly':
                self._plot_monthly_returns(ax, data)
            elif plot_type == 'rolling_sharpe':
                self._plot_rolling_sharpe(ax, data, kwargs.get('window', 20))
            elif plot_type == 'metrics':
                self._plot_metrics_table(ax, data)
            else:
                logger.warning(f"未知图表类型: {plot_type}")
                return None
            
            plt.tight_layout()
            
            if save_path:
                plt.savefig(save_path, dpi=300, bbox_inches='tight')
                logger.info(f"图表已保存到: {save_path}")
            
            return fig
            
        except ImportError:
            logger.warning("matplotlib未安装，无法生成图表")
            return None


# 示例用法
if __name__ == "__main__":
    # 配置日志
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    # 模拟数据
    dates = pd.date_range(start='2024-01-01', end='2024-12-31', freq='D')
    equity_curve = pd.DataFrame({
        'datetime': dates,
        'equity': 100000 + np.random.randn(len(dates)).cumsum() * 1000
    })
    
    trades = pd.DataFrame({
        'pnl': np.random.randn(100) * 500
    })
    
    metrics = {
        'total_return': 0.15,
        'annual_return': 0.20,
        'sharpe_ratio': 1.5,
        'max_drawdown': 0.08,
        'win_rate': 0.65,
        'profit_factor': 2.3,
        'total_trades': 100
    }
    
    # 创建可视化器
    visualizer = BacktestVisualizer()
    
    # 绘制所有图表
    visualizer.plot_all(
        equity_curve=equity_curve,
        trades=trades,
        metrics=metrics,
        save_path='backtest_report.png'
    )
    
    print("✓ 回测可视化器测试完成")
