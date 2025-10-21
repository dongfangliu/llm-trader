"""
蒙特卡洛模拟器

通过随机重排交易序列，评估策略风险分布和破产概率。

Author: AI Assistant
Date: 2025-10-21
"""

import logging
from dataclasses import dataclass
from typing import List, Dict, Any
import pandas as pd
import numpy as np
from tqdm import tqdm

logger = logging.getLogger(__name__)


@dataclass
class MonteCarloResult:
    """蒙特卡洛模拟结果"""
    simulations: int  # 模拟次数
    original_metrics: Dict[str, float]  # 原始策略指标
    simulated_metrics: Dict[str, List[float]]  # 模拟结果分布
    confidence_intervals: Dict[str, Dict[str, float]]  # 置信区间
    risk_of_ruin: float  # 破产概率
    
    def to_dict(self) -> Dict:
        """转换为字典"""
        return {
            'simulations': self.simulations,
            'original_metrics': self.original_metrics,
            'confidence_intervals': self.confidence_intervals,
            'risk_of_ruin': self.risk_of_ruin
        }


class MonteCarloSimulator:
    """
    蒙特卡洛模拟器
    
    功能：
    1. 交易序列随机重排
    2. 收益分布估计
    3. 置信区间计算（5%, 25%, 50%, 75%, 95%）
    4. 破产概率估计
    """
    
    def __init__(
        self,
        n_simulations: int = 1000,
        confidence_levels: List[float] = None,
        ruin_threshold: float = 0.5,  # 破产阈值（权益下降50%）
        verbose: bool = True
    ):
        """
        初始化蒙特卡洛模拟器
        
        Args:
            n_simulations: 模拟次数
            confidence_levels: 置信水平列表
            ruin_threshold: 破产阈值（权益相对初始资金的最大损失比例）
            verbose: 是否显示进度
        """
        self.n_simulations = n_simulations
        self.confidence_levels = confidence_levels or [0.05, 0.25, 0.50, 0.75, 0.95]
        self.ruin_threshold = ruin_threshold
        self.verbose = verbose
        
        logger.info(f"蒙特卡洛模拟器初始化完成")
        logger.info(f"  模拟次数: {n_simulations}")
        logger.info(f"  置信水平: {confidence_levels}")
        logger.info(f"  破产阈值: {ruin_threshold:.1%}")
    
    def run(
        self,
        trades: pd.DataFrame,
        initial_capital: float = 100000.0
    ) -> MonteCarloResult:
        """
        运行蒙特卡洛模拟
        
        Args:
            trades: 交易记录DataFrame，需包含'pnl'列
            initial_capital: 初始资金
        
        Returns:
            蒙特卡洛模拟结果
        """
        logger.info(f"开始蒙特卡洛模拟，共{self.n_simulations}次...")
        
        # 提取交易盈亏
        trade_pnls = trades['pnl'].values
        n_trades = len(trade_pnls)
        
        if n_trades == 0:
            logger.warning("交易记录为空，跳过模拟")
            return self._empty_result()
        
        # 计算原始策略指标
        original_metrics = self._calculate_metrics(trade_pnls, initial_capital)
        
        # 模拟
        simulated_results = {
            'total_return': [],
            'max_drawdown': [],
            'sharpe_ratio': [],
            'final_equity': []
        }
        
        ruin_count = 0
        
        iterator = tqdm(range(self.n_simulations)) if self.verbose else range(self.n_simulations)
        
        for _ in iterator:
            # 随机重排交易序列
            shuffled_pnls = np.random.choice(trade_pnls, size=n_trades, replace=True)
            
            # 计算指标
            metrics = self._calculate_metrics(shuffled_pnls, initial_capital)
            
            simulated_results['total_return'].append(metrics['total_return'])
            simulated_results['max_drawdown'].append(metrics['max_drawdown'])
            simulated_results['sharpe_ratio'].append(metrics['sharpe_ratio'])
            simulated_results['final_equity'].append(metrics['final_equity'])
            
            # 检查破产
            if metrics['max_drawdown'] >= self.ruin_threshold:
                ruin_count += 1
        
        # 计算置信区间
        confidence_intervals = self._calculate_confidence_intervals(simulated_results)
        
        # 计算破产概率
        risk_of_ruin = ruin_count / self.n_simulations
        
        result = MonteCarloResult(
            simulations=self.n_simulations,
            original_metrics=original_metrics,
            simulated_metrics=simulated_results,
            confidence_intervals=confidence_intervals,
            risk_of_ruin=risk_of_ruin
        )
        
        logger.info(f"蒙特卡洛模拟完成")
        logger.info(f"  破产概率: {risk_of_ruin:.2%}")
        logger.info(f"  原始收益率: {original_metrics['total_return']:.2%}")
        logger.info(f"  95%置信区间: [{confidence_intervals['total_return']['5%']:.2%}, "
                   f"{confidence_intervals['total_return']['95%']:.2%}]")
        
        return result
    
    def _calculate_metrics(
        self,
        pnls: np.ndarray,
        initial_capital: float
    ) -> Dict[str, float]:
        """
        计算性能指标
        
        Args:
            pnls: 交易盈亏数组
            initial_capital: 初始资金
        
        Returns:
            性能指标字典
        """
        # 权益曲线
        equity_curve = initial_capital + np.cumsum(pnls)
        equity_curve = np.insert(equity_curve, 0, initial_capital)
        
        # 总收益率
        final_equity = equity_curve[-1]
        total_return = (final_equity - initial_capital) / initial_capital
        
        # 最大回撤
        peak = np.maximum.accumulate(equity_curve)
        drawdown = (peak - equity_curve) / peak
        max_drawdown = np.max(drawdown)
        
        # 夏普比率（简化版）
        if len(pnls) > 1 and np.std(pnls) > 0:
            sharpe_ratio = np.mean(pnls) / np.std(pnls) * np.sqrt(252)
        else:
            sharpe_ratio = 0.0
        
        return {
            'total_return': total_return,
            'max_drawdown': max_drawdown,
            'sharpe_ratio': sharpe_ratio,
            'final_equity': final_equity
        }
    
    def _calculate_confidence_intervals(
        self,
        simulated_results: Dict[str, List[float]]
    ) -> Dict[str, Dict[str, float]]:
        """
        计算置信区间
        
        Args:
            simulated_results: 模拟结果字典
        
        Returns:
            各指标的置信区间
        """
        confidence_intervals = {}
        
        for metric_name, values in simulated_results.items():
            values_array = np.array(values)
            
            intervals = {}
            for level in self.confidence_levels:
                percentile = level * 100
                intervals[f'{int(percentile)}%'] = np.percentile(values_array, percentile)
            
            confidence_intervals[metric_name] = intervals
        
        return confidence_intervals
    
    def _empty_result(self) -> MonteCarloResult:
        """返回空结果"""
        return MonteCarloResult(
            simulations=0,
            original_metrics={},
            simulated_metrics={},
            confidence_intervals={},
            risk_of_ruin=0.0
        )
    
    def plot_distribution(
        self,
        result: MonteCarloResult,
        metric: str = 'total_return',
        save_path: str = None
    ):
        """
        绘制指标分布图
        
        Args:
            result: 蒙特卡洛结果
            metric: 指标名称
            save_path: 保存路径（可选）
        """
        try:
            import matplotlib.pyplot as plt
            
            fig, axes = plt.subplots(2, 2, figsize=(15, 10))
            
            metrics = ['total_return', 'max_drawdown', 'sharpe_ratio', 'final_equity']
            titles = ['总收益率分布', '最大回撤分布', '夏普比率分布', '最终权益分布']
            
            for ax, metric_name, title in zip(axes.flatten(), metrics, titles):
                values = result.simulated_metrics.get(metric_name, [])
                
                if not values:
                    continue
                
                # 直方图
                ax.hist(values, bins=50, alpha=0.7, color='skyblue', edgecolor='black')
                
                # 原始值
                original_val = result.original_metrics.get(metric_name, 0)
                ax.axvline(original_val, color='red', linestyle='--', linewidth=2, label=f'原始值: {original_val:.4f}')
                
                # 置信区间
                ci = result.confidence_intervals.get(metric_name, {})
                if ci:
                    ax.axvline(ci.get('5%', 0), color='green', linestyle=':', linewidth=1, alpha=0.7, label='5%')
                    ax.axvline(ci.get('95%', 0), color='green', linestyle=':', linewidth=1, alpha=0.7, label='95%')
                
                ax.set_xlabel(metric_name)
                ax.set_ylabel('频数')
                ax.set_title(title)
                ax.legend()
                ax.grid(True, alpha=0.3)
            
            plt.tight_layout()
            
            if save_path:
                plt.savefig(save_path, dpi=300, bbox_inches='tight')
                logger.info(f"图表已保存到: {save_path}")
            else:
                plt.show()
                
        except ImportError:
            logger.warning("matplotlib未安装，跳过绘图")
    
    def print_summary(self, result: MonteCarloResult):
        """
        打印模拟摘要
        
        Args:
            result: 蒙特卡洛结果
        """
        print("\n" + "="*80)
        print("蒙特卡洛模拟结果摘要")
        print("="*80)
        
        print(f"\n模拟次数: {result.simulations}")
        print(f"破产概率: {result.risk_of_ruin:.2%} (回撤>{self.ruin_threshold:.0%})")
        
        print("\n原始策略指标:")
        print("-"*80)
        for key, val in result.original_metrics.items():
            print(f"  {key}: {val:.4f}")
        
        print("\n置信区间:")
        print("-"*80)
        for metric_name, intervals in result.confidence_intervals.items():
            print(f"\n{metric_name}:")
            for level, value in intervals.items():
                print(f"  {level}: {value:.4f}")
        
        # 风险评估
        print("\n风险评估:")
        print("-"*80)
        
        total_return_ci = result.confidence_intervals.get('total_return', {})
        worst_case = total_return_ci.get('5%', 0)
        best_case = total_return_ci.get('95%', 0)
        
        print(f"  最坏情况(5%): {worst_case:.2%}")
        print(f"  最好情况(95%): {best_case:.2%}")
        print(f"  风险收益比: {abs(worst_case)/best_case if best_case != 0 else float('inf'):.2f}")
        
        if result.risk_of_ruin < 0.05:
            print(f"  ✓ 破产风险低 ({result.risk_of_ruin:.2%})")
        elif result.risk_of_ruin < 0.15:
            print(f"  ⚠ 破产风险中等 ({result.risk_of_ruin:.2%})")
        else:
            print(f"  ✗ 破产风险高 ({result.risk_of_ruin:.2%})")


# 示例用法
if __name__ == "__main__":
    # 配置日志
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    # 模拟交易记录
    np.random.seed(42)
    n_trades = 100
    
    # 生成盈亏（胜率55%，盈亏比1.5）
    win_trades = np.random.uniform(100, 300, int(n_trades * 0.55))
    lose_trades = np.random.uniform(-200, -100, int(n_trades * 0.45))
    pnls = np.concatenate([win_trades, lose_trades])
    np.random.shuffle(pnls)
    
    trades = pd.DataFrame({
        'pnl': pnls
    })
    
    # 创建模拟器
    simulator = MonteCarloSimulator(
        n_simulations=1000,
        confidence_levels=[0.05, 0.25, 0.50, 0.75, 0.95],
        ruin_threshold=0.5,
        verbose=True
    )
    
    # 运行模拟
    result = simulator.run(trades, initial_capital=100000.0)
    
    # 打印摘要
    simulator.print_summary(result)
    
    # 绘制分布图
    # simulator.plot_distribution(result, save_path='monte_carlo_distribution.png')
    
    print("\n✓ 蒙特卡洛模拟器测试完成")
