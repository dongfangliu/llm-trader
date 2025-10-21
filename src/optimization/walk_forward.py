"""
Walk-Forward分析器

滚动窗口优化，评估参数稳定性和策略鲁棒性。

Author: AI Assistant
Date: 2025-10-21
"""

import logging
from dataclasses import dataclass, field
from typing import Dict, List, Any, Callable, Tuple
from datetime import datetime, timedelta
import pandas as pd
import numpy as np

logger = logging.getLogger(__name__)


@dataclass
class WalkForwardWindow:
    """Walk-Forward窗口"""
    window_id: int
    train_start: datetime
    train_end: datetime
    test_start: datetime
    test_end: datetime
    optimal_params: Dict[str, Any] = field(default_factory=dict)
    train_metrics: Dict[str, float] = field(default_factory=dict)
    test_metrics: Dict[str, float] = field(default_factory=dict)


@dataclass
class WalkForwardResult:
    """Walk-Forward分析结果"""
    windows: List[WalkForwardWindow]
    overall_metrics: Dict[str, float]
    param_stability: Dict[str, float]  # 参数稳定性评分
    performance_decay: float  # 性能衰减
    
    def to_dict(self) -> Dict:
        """转换为字典"""
        return {
            'windows': [
                {
                    'window_id': w.window_id,
                    'train_period': f"{w.train_start} ~ {w.train_end}",
                    'test_period': f"{w.test_start} ~ {w.test_end}",
                    'optimal_params': w.optimal_params,
                    'train_metrics': w.train_metrics,
                    'test_metrics': w.test_metrics
                }
                for w in self.windows
            ],
            'overall_metrics': self.overall_metrics,
            'param_stability': self.param_stability,
            'performance_decay': self.performance_decay
        }


class WalkForwardAnalyzer:
    """
    Walk-Forward分析器
    
    功能：
    1. 滚动窗口优化（训练期/测试期）
    2. 自动参数更新
    3. 稳定性评估（参数漂移检测）
    4. 性能衰减分析
    """
    
    def __init__(
        self,
        optimization_func: Callable,
        backtest_func: Callable,
        train_period: int = 180,  # 训练期天数
        test_period: int = 60,    # 测试期天数
        step_size: int = 30,      # 滑动步长天数
        metric_name: str = 'sharpe_ratio',
        verbose: bool = True
    ):
        """
        初始化Walk-Forward分析器
        
        Args:
            optimization_func: 优化函数，接收训练数据，返回最优参数
            backtest_func: 回测函数，接收参数和数据，返回性能指标
            train_period: 训练期长度（天）
            test_period: 测试期长度（天）
            step_size: 滑动步长（天）
            metric_name: 评估指标名称
            verbose: 是否显示详细信息
        """
        self.optimization_func = optimization_func
        self.backtest_func = backtest_func
        self.train_period = train_period
        self.test_period = test_period
        self.step_size = step_size
        self.metric_name = metric_name
        self.verbose = verbose
        
        self.windows: List[WalkForwardWindow] = []
        
        logger.info(f"Walk-Forward分析器初始化完成")
        logger.info(f"  训练期: {train_period}天")
        logger.info(f"  测试期: {test_period}天")
        logger.info(f"  滑动步长: {step_size}天")
        logger.info(f"  评估指标: {metric_name}")
    
    def _generate_windows(
        self,
        start_date: datetime,
        end_date: datetime
    ) -> List[WalkForwardWindow]:
        """
        生成Walk-Forward窗口序列
        
        Args:
            start_date: 开始日期
            end_date: 结束日期
        
        Returns:
            窗口列表
        """
        windows = []
        window_id = 1
        current_date = start_date
        
        while True:
            # 训练期
            train_start = current_date
            train_end = current_date + timedelta(days=self.train_period)
            
            # 测试期
            test_start = train_end
            test_end = test_start + timedelta(days=self.test_period)
            
            # 检查是否超出结束日期
            if test_end > end_date:
                break
            
            # 创建窗口
            window = WalkForwardWindow(
                window_id=window_id,
                train_start=train_start,
                train_end=train_end,
                test_start=test_start,
                test_end=test_end
            )
            windows.append(window)
            
            # 滑动到下一个窗口
            current_date += timedelta(days=self.step_size)
            window_id += 1
        
        logger.info(f"生成{len(windows)}个Walk-Forward窗口")
        return windows
    
    def run(
        self,
        data: pd.DataFrame,
        start_date: datetime,
        end_date: datetime
    ) -> WalkForwardResult:
        """
        运行Walk-Forward分析
        
        Args:
            data: 完整数据集
            start_date: 分析开始日期
            end_date: 分析结束日期
        
        Returns:
            Walk-Forward分析结果
        """
        logger.info(f"开始Walk-Forward分析: {start_date} ~ {end_date}")
        
        # 生成窗口
        self.windows = self._generate_windows(start_date, end_date)
        
        # 处理每个窗口
        for window in self.windows:
            if self.verbose:
                logger.info(f"处理窗口#{window.window_id}: 训练={window.train_start}~{window.train_end}, "
                          f"测试={window.test_start}~{window.test_end}")
            
            # 分割数据
            train_data = data[(data['datetime'] >= window.train_start) & 
                            (data['datetime'] < window.train_end)]
            test_data = data[(data['datetime'] >= window.test_start) & 
                           (data['datetime'] < window.test_end)]
            
            # 训练期优化
            window.optimal_params = self.optimization_func(train_data)
            window.train_metrics = self.backtest_func(window.optimal_params, train_data)
            
            # 测试期验证
            window.test_metrics = self.backtest_func(window.optimal_params, test_data)
            
            if self.verbose:
                train_val = window.train_metrics.get(self.metric_name, 0)
                test_val = window.test_metrics.get(self.metric_name, 0)
                logger.info(f"  训练期{self.metric_name}: {train_val:.4f}")
                logger.info(f"  测试期{self.metric_name}: {test_val:.4f}")
        
        # 计算整体指标
        overall_metrics = self._calculate_overall_metrics()
        
        # 计算参数稳定性
        param_stability = self._calculate_param_stability()
        
        # 计算性能衰减
        performance_decay = self._calculate_performance_decay()
        
        result = WalkForwardResult(
            windows=self.windows,
            overall_metrics=overall_metrics,
            param_stability=param_stability,
            performance_decay=performance_decay
        )
        
        logger.info(f"Walk-Forward分析完成")
        logger.info(f"  整体{self.metric_name}: {overall_metrics.get(self.metric_name, 0):.4f}")
        logger.info(f"  性能衰减: {performance_decay:.2%}")
        
        return result
    
    def _calculate_overall_metrics(self) -> Dict[str, float]:
        """
        计算整体性能指标
        
        基于所有测试期的综合表现
        
        Returns:
            整体指标字典
        """
        # 收集所有测试期指标
        all_metrics = {}
        
        for window in self.windows:
            for key, val in window.test_metrics.items():
                if key not in all_metrics:
                    all_metrics[key] = []
                all_metrics[key].append(val)
        
        # 计算平均值
        overall = {key: np.mean(values) for key, values in all_metrics.items()}
        
        # 添加一致性指标（标准差）
        overall[f'{self.metric_name}_std'] = np.std(all_metrics.get(self.metric_name, []))
        
        return overall
    
    def _calculate_param_stability(self) -> Dict[str, float]:
        """
        计算参数稳定性
        
        稳定性 = 1 - (参数变异系数)
        变异系数 = 标准差 / 平均值
        
        Returns:
            各参数稳定性得分（0-1，越高越稳定）
        """
        if not self.windows:
            return {}
        
        # 收集所有窗口的参数
        param_values = {}
        for window in self.windows:
            for param_name, param_val in window.optimal_params.items():
                if param_name not in param_values:
                    param_values[param_name] = []
                param_values[param_name].append(param_val)
        
        # 计算稳定性
        stability = {}
        for param_name, values in param_values.items():
            values_array = np.array(values, dtype=float)
            mean = np.mean(values_array)
            std = np.std(values_array)
            
            # 变异系数
            cv = std / mean if mean != 0 else 1.0
            
            # 稳定性得分（限制在[0, 1]）
            stability[param_name] = max(0, min(1, 1 - cv))
        
        return stability
    
    def _calculate_performance_decay(self) -> float:
        """
        计算性能衰减
        
        衰减 = (平均训练期性能 - 平均测试期性能) / 平均训练期性能
        
        Returns:
            性能衰减比例（0-1）
        """
        train_values = [w.train_metrics.get(self.metric_name, 0) for w in self.windows]
        test_values = [w.test_metrics.get(self.metric_name, 0) for w in self.windows]
        
        avg_train = np.mean(train_values)
        avg_test = np.mean(test_values)
        
        if avg_train == 0:
            return 1.0
        
        decay = (avg_train - avg_test) / abs(avg_train)
        return max(0, min(1, decay))
    
    def plot_results(self, save_path: str = None):
        """
        绘制Walk-Forward分析结果
        
        Args:
            save_path: 保存路径（可选）
        """
        try:
            import matplotlib.pyplot as plt
            
            fig, axes = plt.subplots(2, 2, figsize=(15, 10))
            
            # 1. 训练期 vs 测试期性能对比
            ax1 = axes[0, 0]
            window_ids = [w.window_id for w in self.windows]
            train_vals = [w.train_metrics.get(self.metric_name, 0) for w in self.windows]
            test_vals = [w.test_metrics.get(self.metric_name, 0) for w in self.windows]
            
            ax1.plot(window_ids, train_vals, 'b-o', label='训练期', linewidth=2)
            ax1.plot(window_ids, test_vals, 'r-s', label='测试期', linewidth=2)
            ax1.set_xlabel('窗口编号')
            ax1.set_ylabel(self.metric_name)
            ax1.set_title('训练期 vs 测试期性能')
            ax1.legend()
            ax1.grid(True, alpha=0.3)
            
            # 2. 参数漂移
            ax2 = axes[0, 1]
            if self.windows and self.windows[0].optimal_params:
                param_name = list(self.windows[0].optimal_params.keys())[0]
                param_vals = [w.optimal_params.get(param_name, 0) for w in self.windows]
                ax2.plot(window_ids, param_vals, 'g-^', linewidth=2)
                ax2.set_xlabel('窗口编号')
                ax2.set_ylabel(param_name)
                ax2.set_title(f'参数漂移: {param_name}')
                ax2.grid(True, alpha=0.3)
            
            # 3. 性能分布
            ax3 = axes[1, 0]
            ax3.hist(train_vals, bins=10, alpha=0.7, label='训练期', color='blue')
            ax3.hist(test_vals, bins=10, alpha=0.7, label='测试期', color='red')
            ax3.set_xlabel(self.metric_name)
            ax3.set_ylabel('频数')
            ax3.set_title('性能分布')
            ax3.legend()
            
            # 4. 滚动累计收益
            ax4 = axes[1, 1]
            test_returns = [w.test_metrics.get('total_return', 0) for w in self.windows]
            cumulative_returns = np.cumsum(test_returns)
            ax4.plot(window_ids, cumulative_returns, 'purple', linewidth=2)
            ax4.fill_between(window_ids, 0, cumulative_returns, alpha=0.3)
            ax4.set_xlabel('窗口编号')
            ax4.set_ylabel('累计收益')
            ax4.set_title('滚动累计收益')
            ax4.grid(True, alpha=0.3)
            
            plt.tight_layout()
            
            if save_path:
                plt.savefig(save_path, dpi=300, bbox_inches='tight')
                logger.info(f"图表已保存到: {save_path}")
            else:
                plt.show()
                
        except ImportError:
            logger.warning("matplotlib未安装，跳过绘图")
    
    def to_dataframe(self) -> pd.DataFrame:
        """
        将结果转换为DataFrame
        
        Returns:
            结果DataFrame
        """
        rows = []
        
        for window in self.windows:
            row = {
                'window_id': window.window_id,
                'train_start': window.train_start,
                'train_end': window.train_end,
                'test_start': window.test_start,
                'test_end': window.test_end,
            }
            
            # 参数
            for key, val in window.optimal_params.items():
                row[f'param_{key}'] = val
            
            # 训练期指标
            for key, val in window.train_metrics.items():
                row[f'train_{key}'] = val
            
            # 测试期指标
            for key, val in window.test_metrics.items():
                row[f'test_{key}'] = val
            
            rows.append(row)
        
        return pd.DataFrame(rows)
    
    def save_results(self, filepath: str):
        """
        保存结果到CSV
        
        Args:
            filepath: 文件路径
        """
        df = self.to_dataframe()
        df.to_csv(filepath, index=False)
        logger.info(f"结果已保存到: {filepath}")


# 示例用法
if __name__ == "__main__":
    # 配置日志
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    # 模拟数据
    dates = pd.date_range(start='2023-01-01', end='2024-12-31', freq='D')
    data = pd.DataFrame({
        'datetime': dates,
        'close': np.random.randn(len(dates)).cumsum() + 100
    })
    
    # 模拟优化函数
    def mock_optimize(train_data: pd.DataFrame) -> Dict[str, Any]:
        """模拟参数优化"""
        return {
            'ma_period': np.random.choice([10, 20, 30]),
            'threshold': np.random.uniform(0.01, 0.05)
        }
    
    # 模拟回测函数
    def mock_backtest(params: Dict[str, Any], data: pd.DataFrame) -> Dict[str, float]:
        """模拟回测"""
        return {
            'sharpe_ratio': np.random.uniform(0.5, 2.0),
            'total_return': np.random.uniform(-0.1, 0.3),
            'max_drawdown': np.random.uniform(0.05, 0.2)
        }
    
    # 创建分析器
    analyzer = WalkForwardAnalyzer(
        optimization_func=mock_optimize,
        backtest_func=mock_backtest,
        train_period=180,
        test_period=60,
        step_size=30,
        metric_name='sharpe_ratio',
        verbose=True
    )
    
    # 运行分析
    result = analyzer.run(
        data=data,
        start_date=datetime(2023, 1, 1),
        end_date=datetime(2024, 12, 31)
    )
    
    # 打印结果
    print("\n" + "="*80)
    print("Walk-Forward分析结果")
    print("="*80)
    print(f"窗口数量: {len(result.windows)}")
    print(f"整体夏普比率: {result.overall_metrics.get('sharpe_ratio', 0):.4f}")
    print(f"性能衰减: {result.performance_decay:.2%}")
    print(f"参数稳定性: {result.param_stability}")
    
    # 保存结果
    analyzer.save_results('walk_forward_results.csv')
    
    print("\n✓ Walk-Forward分析器测试完成")
