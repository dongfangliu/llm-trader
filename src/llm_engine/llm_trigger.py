"""
LLM触发器

判断何时需要触发LLM专家复核，减少不必要的API调用
"""

from typing import Tuple, Optional, Dict, Any, List
from datetime import datetime, timedelta
import logging

logger = logging.getLogger(__name__)


class LLMTrigger:
    """
    LLM触发器
    
    判断4种触发条件：
    1. 量化信号置信度 < 0.85
    2. 市场状态为 abnormal
    3. 多策略信号冲突
    4. 人工主动请求
    """
    
    def __init__(self, confidence_threshold: float = 0.85):
        """
        初始化触发器
        
        Args:
            confidence_threshold: 置信度阈值，低于此值触发专家复核
        """
        self.confidence_threshold = confidence_threshold
        self.trigger_stats = {
            'expert_review': 0,
            'abnormal_analysis': 0,
            'signal_conflict': 0,
            'manual_request': 0,
            'total': 0
        }
        self.last_trigger_time = None
        
    def should_trigger(
        self,
        signal: Dict[str, Any],
        market_state: Dict[str, Any],
        signals: Optional[List[Dict[str, Any]]] = None,
        manual: bool = False
    ) -> Tuple[bool, Optional[str]]:
        """
        判断是否需要触发LLM
        
        Args:
            signal: 主信号（最佳信号）
            market_state: 市场状态
            signals: 所有策略信号列表（用于检测冲突）
            manual: 是否人工主动请求
            
        Returns:
            Tuple[bool, Optional[str]]: (是否触发, 触发场景)
                触发场景: 'expert_review', 'abnormal_analysis', 'signal_conflict', None
        """
        # 场景4：人工主动请求（最高优先级）
        if manual:
            self._record_trigger('manual_request')
            return True, 'manual_request'
        
        # 场景2：市场状态异常（高优先级）
        if market_state.get('regime') == 'abnormal':
            self._record_trigger('abnormal_analysis')
            logger.info(f"触发LLM: 市场异常（ATR={market_state.get('atr_percentile', 0)*100:.0f}分位数）")
            return True, 'abnormal_analysis'
        
        # 场景3：多策略信号冲突
        if signals and len(signals) > 1:
            if self._has_signal_conflict(signals):
                self._record_trigger('signal_conflict')
                logger.info(f"触发LLM: 信号冲突（{len(signals)}个策略，多空分歧）")
                return True, 'signal_conflict'
        
        # 场景1：量化信号置信度低
        confidence = signal.get('confidence', 1.0)
        if confidence < self.confidence_threshold:
            self._record_trigger('expert_review')
            logger.info(f"触发LLM: 置信度低（{confidence*100:.1f}% < {self.confidence_threshold*100:.0f}%）")
            return True, 'expert_review'
        
        # 不需要触发
        return False, None
    
    def _has_signal_conflict(self, signals: List[Dict[str, Any]]) -> bool:
        """
        检测信号冲突
        
        冲突定义：有开多信号和开空信号同时存在
        
        Args:
            signals: 信号列表
            
        Returns:
            bool: 是否存在冲突
        """
        actions = [sig.get('action', 'hold') for sig in signals]
        
        # 检查是否有相反的开仓信号
        has_long = 'open_long' in actions
        has_short = 'open_short' in actions
        
        return has_long and has_short
    
    def _record_trigger(self, scenario: str):
        """
        记录触发统计
        
        Args:
            scenario: 触发场景
        """
        self.trigger_stats[scenario] += 1
        self.trigger_stats['total'] += 1
        self.last_trigger_time = datetime.now()
        
        logger.debug(f"触发统计: {scenario}={self.trigger_stats[scenario]}, "
                    f"总计={self.trigger_stats['total']}")
    
    def get_trigger_stats(self) -> Dict[str, Any]:
        """
        获取触发统计信息
        
        Returns:
            dict: 统计信息
                - expert_review: int
                - abnormal_analysis: int
                - signal_conflict: int
                - manual_request: int
                - total: int
                - last_trigger_time: Optional[datetime]
                - avg_per_day: float（预估）
        """
        stats = self.trigger_stats.copy()
        stats['last_trigger_time'] = self.last_trigger_time
        
        # 预估日均触发次数（假设系统已运行24小时）
        if self.trigger_stats['total'] > 0:
            stats['avg_per_day'] = self.trigger_stats['total']  # 简化，实际需要根据运行时间计算
        else:
            stats['avg_per_day'] = 0
        
        return stats
    
    def reset_stats(self):
        """重置统计数据"""
        self.trigger_stats = {
            'expert_review': 0,
            'abnormal_analysis': 0,
            'signal_conflict': 0,
            'manual_request': 0,
            'total': 0
        }
        self.last_trigger_time = None
        logger.info("触发统计已重置")
    
    def estimate_monthly_cost(
        self,
        cost_per_call: float = 0.0032,
        days: int = 30
    ) -> Dict[str, float]:
        """
        预估月度成本
        
        Args:
            cost_per_call: 单次LLM调用成本（美元）
            days: 天数
            
        Returns:
            dict: 成本预估
                - daily_calls: 日均调用次数
                - monthly_calls: 月度调用次数
                - monthly_cost: 月度成本（美元）
        """
        stats = self.get_trigger_stats()
        daily_calls = stats['avg_per_day']
        monthly_calls = daily_calls * days
        monthly_cost = monthly_calls * cost_per_call
        
        return {
            'daily_calls': daily_calls,
            'monthly_calls': monthly_calls,
            'monthly_cost': monthly_cost,
            'cost_per_call': cost_per_call
        }


# 测试代码
if __name__ == "__main__":
    # 配置日志
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    trigger = LLMTrigger(confidence_threshold=0.85)
    
    # 测试1: 低置信度触发
    print("=" * 60)
    print("测试1: 低置信度触发")
    signal = {'action': 'open_long', 'confidence': 0.78}
    market_state = {'regime': 'trend'}
    should, scenario = trigger.should_trigger(signal, market_state)
    print(f"触发: {should}, 场景: {scenario}")
    assert should and scenario == 'expert_review'
    
    # 测试2: 市场异常触发
    print("\n" + "=" * 60)
    print("测试2: 市场异常触发")
    signal = {'action': 'hold', 'confidence': 0.90}
    market_state = {'regime': 'abnormal', 'atr_percentile': 0.92}
    should, scenario = trigger.should_trigger(signal, market_state)
    print(f"触发: {should}, 场景: {scenario}")
    assert should and scenario == 'abnormal_analysis'
    
    # 测试3: 信号冲突触发
    print("\n" + "=" * 60)
    print("测试3: 信号冲突触发")
    signal = {'action': 'open_long', 'confidence': 0.90}
    market_state = {'regime': 'trend'}
    signals = [
        {'action': 'open_long', 'confidence': 0.75},
        {'action': 'open_short', 'confidence': 0.72}
    ]
    should, scenario = trigger.should_trigger(signal, market_state, signals)
    print(f"触发: {should}, 场景: {scenario}")
    assert should and scenario == 'signal_conflict'
    
    # 测试4: 不触发
    print("\n" + "=" * 60)
    print("测试4: 高置信度，不触发")
    signal = {'action': 'open_long', 'confidence': 0.90}
    market_state = {'regime': 'trend'}
    should, scenario = trigger.should_trigger(signal, market_state)
    print(f"触发: {should}, 场景: {scenario}")
    assert not should and scenario is None
    
    # 测试5: 人工请求触发
    print("\n" + "=" * 60)
    print("测试5: 人工主动请求")
    signal = {'action': 'open_long', 'confidence': 0.90}
    market_state = {'regime': 'trend'}
    should, scenario = trigger.should_trigger(signal, market_state, manual=True)
    print(f"触发: {should}, 场景: {scenario}")
    assert should and scenario == 'manual_request'
    
    # 统计信息
    print("\n" + "=" * 60)
    print("触发统计:")
    stats = trigger.get_trigger_stats()
    for key, value in stats.items():
        if key != 'last_trigger_time':
            print(f"  {key}: {value}")
    
    # 成本预估
    print("\n" + "=" * 60)
    print("成本预估（假设日均4次触发）:")
    trigger.trigger_stats['total'] = 4  # 模拟日均4次
    cost_estimate = trigger.estimate_monthly_cost()
    print(f"  日均调用: {cost_estimate['daily_calls']:.1f}次")
    print(f"  月度调用: {cost_estimate['monthly_calls']:.0f}次")
    print(f"  月度成本: ${cost_estimate['monthly_cost']:.2f}")
    
    print("\n✓ 所有测试通过")
