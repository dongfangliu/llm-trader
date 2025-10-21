"""
网格搜索优化器

对策略参数进行网格搜索，寻找最优参数组合。
支持并行搜索、过拟合检测、结果排序。

Author: AI Assistant
Date: 2025-10-21
"""

import logging
from dataclasses import dataclass, field
from typing import Dict, List, Any, Tuple, Callable
from itertools import product
import pandas as pd
import numpy as np
from concurrent.futures import ProcessPoolExecutor, as_completed
from tqdm import tqdm

logger = logging.getLogger(__name__)


@dataclass
class ParamSpace:
    """参数空间定义"""
    name: str
    values: List[Any]
    
    def __len__(self):
        return len(self.values)


@dataclass
class OptimizationResult:
    """单次优化结果"""
    params: Dict[str, Any]  # 参数组合
    in_sample_metrics: Dict[str, float]  # 样本内指标
    out_sample_metrics: Dict[str, float] = field(default_factory=dict)  # 样本外指标
    overfitting_score: float = 0.0  # 过拟合得分
    
    def to_dict(self) -> Dict:
        """转换为字典"""
        return {
            'params': self.params,
            'in_sample': self.in_sample_metrics,
            'out_sample': self.out_sample_metrics,
            'overfitting_score': self.overfitting_score
        }


class GridSearchOptimizer:
    """
    网格搜索优化器
    
    功能：
    1. 定义参数搜索空间（范围、步长）
    2. 并行网格搜索（多进程）
    3. 过拟合检测（样本内/样本外对比）
    4. 结果排序和筛选
    """
    
    def __init__(
        self,
        param_spaces: List[ParamSpace],
        backtest_func: Callable,
        metric_name: str = 'sharpe_ratio',
        n_jobs: int = 4,
        verbose: bool = True
    ):
        """
        初始化网格搜索优化器
        
        Args:
            param_spaces: 参数空间列表
            backtest_func: 回测函数，接收参数字典，返回性能指标字典
            metric_name: 优化目标指标（默认夏普比率）
            n_jobs: 并行进程数
            verbose: 是否显示进度条
        """
        self.param_spaces = param_spaces
        self.backtest_func = backtest_func
        self.metric_name = metric_name
        self.n_jobs = n_jobs
        self.verbose = verbose
        
        # 统计信息
        self.total_combinations = self._count_combinations()
        self.results: List[OptimizationResult] = []
        
        logger.info(f"网格搜索优化器初始化完成")
        logger.info(f"  参数空间: {[f'{p.name}({len(p)})' for p in param_spaces]}")
        logger.info(f"  总组合数: {self.total_combinations}")
        logger.info(f"  优化目标: {metric_name}")
        logger.info(f"  并行进程: {n_jobs}")
    
    def _count_combinations(self) -> int:
        """计算参数组合总数"""
        count = 1
        for space in self.param_spaces:
            count *= len(space)
        return count
    
    def _generate_param_combinations(self) -> List[Dict[str, Any]]:
        """生成所有参数组合"""
        # 获取所有参数名和值列表
        param_names = [space.name for space in self.param_spaces]
        param_values = [space.values for space in self.param_spaces]
        
        # 生成笛卡尔积
        combinations = []
        for values in product(*param_values):
            param_dict = dict(zip(param_names, values))
            combinations.append(param_dict)
        
        return combinations
    
    def _run_single_backtest(
        self,
        params: Dict[str, Any],
        data_split: str = 'in_sample'
    ) -> Dict[str, float]:
        """
        运行单次回测
        
        Args:
            params: 参数字典
            data_split: 数据集类型（'in_sample'或'out_sample'）
        
        Returns:
            性能指标字典
        """
        try:
            # 调用回测函数
            metrics = self.backtest_func(params, data_split=data_split)
            return metrics
        except Exception as e:
            logger.error(f"回测失败，参数: {params}, 错误: {e}")
            return {}
    
    def run(
        self,
        in_sample_data: Any = None,
        out_sample_data: Any = None,
        enable_out_sample: bool = True
    ) -> List[OptimizationResult]:
        """
        运行网格搜索
        
        Args:
            in_sample_data: 样本内数据（训练集）
            out_sample_data: 样本外数据（测试集）
            enable_out_sample: 是否启用样本外测试（过拟合检测）
        
        Returns:
            优化结果列表，按目标指标降序排列
        """
        logger.info(f"开始网格搜索，共{self.total_combinations}组参数...")
        
        # 生成所有参数组合
        param_combinations = self._generate_param_combinations()
        
        # 并行运行回测
        results = []
        
        if self.n_jobs == 1:
            # 单进程模式（方便调试）
            iterator = tqdm(param_combinations) if self.verbose else param_combinations
            for params in iterator:
                result = self._optimize_single(params, enable_out_sample)
                if result:
                    results.append(result)
        else:
            # 多进程模式
            with ProcessPoolExecutor(max_workers=self.n_jobs) as executor:
                # 提交所有任务
                futures = {
                    executor.submit(self._optimize_single, params, enable_out_sample): params
                    for params in param_combinations
                }
                
                # 收集结果
                iterator = tqdm(as_completed(futures), total=len(futures)) if self.verbose else as_completed(futures)
                for future in iterator:
                    result = future.result()
                    if result:
                        results.append(result)
        
        # 排序结果
        self.results = self._sort_results(results)
        
        logger.info(f"网格搜索完成，有效结果: {len(self.results)}/{self.total_combinations}")
        
        return self.results
    
    def _optimize_single(
        self,
        params: Dict[str, Any],
        enable_out_sample: bool
    ) -> OptimizationResult:
        """
        优化单个参数组合
        
        Args:
            params: 参数字典
            enable_out_sample: 是否启用样本外测试
        
        Returns:
            优化结果
        """
        # 样本内回测
        in_sample_metrics = self._run_single_backtest(params, 'in_sample')
        
        if not in_sample_metrics:
            return None
        
        # 样本外回测
        out_sample_metrics = {}
        overfitting_score = 0.0
        
        if enable_out_sample:
            out_sample_metrics = self._run_single_backtest(params, 'out_sample')
            
            if out_sample_metrics:
                # 计算过拟合得分
                overfitting_score = self._calculate_overfitting_score(
                    in_sample_metrics,
                    out_sample_metrics
                )
        
        return OptimizationResult(
            params=params,
            in_sample_metrics=in_sample_metrics,
            out_sample_metrics=out_sample_metrics,
            overfitting_score=overfitting_score
        )
    
    def _calculate_overfitting_score(
        self,
        in_sample: Dict[str, float],
        out_sample: Dict[str, float]
    ) -> float:
        """
        计算过拟合得分
        
        过拟合得分 = (样本内指标 - 样本外指标) / 样本内指标
        
        得分越高，过拟合越严重：
        - < 0.1: 低过拟合
        - 0.1-0.3: 中度过拟合
        - > 0.3: 高过拟合
        
        Args:
            in_sample: 样本内指标
            out_sample: 样本外指标
        
        Returns:
            过拟合得分（0-1）
        """
        in_val = in_sample.get(self.metric_name, 0)
        out_val = out_sample.get(self.metric_name, 0)
        
        if in_val == 0:
            return 1.0  # 样本内指标为0，视为严重过拟合
        
        # 计算相对衰减
        decay = (in_val - out_val) / abs(in_val)
        
        # 限制在[0, 1]范围
        return max(0, min(1, decay))
    
    def _sort_results(self, results: List[OptimizationResult]) -> List[OptimizationResult]:
        """
        排序结果
        
        排序规则：
        1. 主要按样本内目标指标降序
        2. 次要按过拟合得分升序（低过拟合优先）
        
        Args:
            results: 优化结果列表
        
        Returns:
            排序后的结果列表
        """
        return sorted(
            results,
            key=lambda x: (
                x.in_sample_metrics.get(self.metric_name, -999),  # 主要排序：目标指标（降序）
                -x.overfitting_score  # 次要排序：过拟合得分（升序）
            ),
            reverse=True
        )
    
    def get_top_results(self, n: int = 10, max_overfitting: float = 0.3) -> List[OptimizationResult]:
        """
        获取前N个最优结果，过滤高过拟合组合
        
        Args:
            n: 返回结果数量
            max_overfitting: 最大允许过拟合得分
        
        Returns:
            前N个结果
        """
        # 过滤高过拟合
        filtered = [r for r in self.results if r.overfitting_score <= max_overfitting]
        
        # 返回前N个
        return filtered[:n]
    
    def to_dataframe(self) -> pd.DataFrame:
        """
        将结果转换为DataFrame
        
        Returns:
            结果DataFrame
        """
        rows = []
        
        for result in self.results:
            row = {}
            
            # 参数
            row.update(result.params)
            
            # 样本内指标
            for key, val in result.in_sample_metrics.items():
                row[f'in_{key}'] = val
            
            # 样本外指标
            for key, val in result.out_sample_metrics.items():
                row[f'out_{key}'] = val
            
            # 过拟合得分
            row['overfitting_score'] = result.overfitting_score
            
            rows.append(row)
        
        return pd.DataFrame(rows)
    
    def save_results(self, filepath: str):
        """
        保存结果到CSV文件
        
        Args:
            filepath: 文件路径
        """
        df = self.to_dataframe()
        df.to_csv(filepath, index=False)
        logger.info(f"结果已保存到: {filepath}")
    
    def print_summary(self, n: int = 10):
        """
        打印优化摘要
        
        Args:
            n: 显示前N个结果
        """
        print("\n" + "="*80)
        print("网格搜索优化结果摘要")
        print("="*80)
        
        print(f"\n总参数组合: {self.total_combinations}")
        print(f"有效结果: {len(self.results)}")
        print(f"优化目标: {self.metric_name}")
        
        print(f"\n前{n}个最优参数组合:")
        print("-"*80)
        
        for i, result in enumerate(self.results[:n], 1):
            in_val = result.in_sample_metrics.get(self.metric_name, 0)
            out_val = result.out_sample_metrics.get(self.metric_name, 0)
            
            print(f"\n#{i} 参数: {result.params}")
            print(f"   样本内{self.metric_name}: {in_val:.4f}")
            if result.out_sample_metrics:
                print(f"   样本外{self.metric_name}: {out_val:.4f}")
                print(f"   过拟合得分: {result.overfitting_score:.4f}")


# 示例用法
if __name__ == "__main__":
    # 配置日志
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    # 定义参数空间
    param_spaces = [
        ParamSpace('ma_period', [10, 20, 30, 50]),
        ParamSpace('rsi_period', [7, 14, 21]),
        ParamSpace('stop_loss', [0.02, 0.03, 0.05]),
    ]
    
    # 模拟回测函数
    def mock_backtest(params: Dict[str, Any], data_split: str = 'in_sample') -> Dict[str, float]:
        """模拟回测函数"""
        # 模拟性能指标
        np.random.seed(hash(str(params)) % 2**32)
        
        sharpe = np.random.uniform(0.5, 2.5)
        total_return = np.random.uniform(-0.1, 0.5)
        max_drawdown = np.random.uniform(0.05, 0.25)
        
        # 样本外性能衰减
        if data_split == 'out_sample':
            sharpe *= 0.8
            total_return *= 0.85
            max_drawdown *= 1.1
        
        return {
            'sharpe_ratio': sharpe,
            'total_return': total_return,
            'max_drawdown': max_drawdown,
            'win_rate': np.random.uniform(0.4, 0.7)
        }
    
    # 创建优化器
    optimizer = GridSearchOptimizer(
        param_spaces=param_spaces,
        backtest_func=mock_backtest,
        metric_name='sharpe_ratio',
        n_jobs=4,
        verbose=True
    )
    
    # 运行优化
    results = optimizer.run(enable_out_sample=True)
    
    # 打印摘要
    optimizer.print_summary(n=5)
    
    # 保存结果
    optimizer.save_results('grid_search_results.csv')
    
    print("\n✓ 网格搜索优化器测试完成")
