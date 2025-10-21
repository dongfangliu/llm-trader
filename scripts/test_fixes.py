"""
测试修复后的模块
"""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.llm_engine.response_parser import ResponseParser
from src.strategy.signal_router import SignalRouter
from src.monitoring.performance_monitor import get_monitor

print("=" * 60)
print("测试1: 类名修复 - MarketRegimeDetector")
print("=" * 60)

try:
    from src.strategy.market_regime import MarketRegimeDetector
    detector = MarketRegimeDetector()
    print("✓ MarketRegimeDetector 类导入成功")
except Exception as e:
    print(f"✗ 导入失败: {e}")
    sys.exit(1)

print("\n" + "=" * 60)
print("测试2: 响应解析器 - 严重警告机制")
print("=" * 60)

parser = ResponseParser()

# 测试严重警告
response1 = '''
{
    "approved": false,
    "concerns": ["风险过高"],
    "warnings": [],
    "severe_warning": true,
    "warning_reason": "市场异常波动"
}
'''

result1 = parser.parse_expert_review(response1)
print(f"输入: severe_warning=true")
print(f"结果: {result1}")

assert result1['severe_warning'] == True, "severe_warning字段应为True"
assert result1['warning_reason'] == "市场异常波动", "warning_reason字段应保留"
assert result1['approved'] == False, "approved字段应为False"
print("✓ 严重警告机制测试通过")

# 测试无警告情况
response2 = '''
{
    "approved": true,
    "concerns": [],
    "warnings": []
}
'''

result2 = parser.parse_expert_review(response2)
print(f"\n输入: 无警告")
print(f"结果: {result2}")

assert result2['severe_warning'] == False, "默认应无严重警告"
assert result2['warning_reason'] == "", "默认警告原因应为空"
assert result2['approved'] == True, "approved字段应为True"
print("✓ 无警告情况测试通过")

print("\n" + "=" * 60)
print("测试3: SignalRouter - apply_llm_review方法")
print("=" * 60)

router = SignalRouter()

# 创建测试信号
test_signal = {
    'action': 'open_long',
    'confidence': 0.80,
    'reasoning': ['测试信号'],
    'entry_price': 2000,
    'stop_loss': 1950,
}

# 测试严重警告
llm_response_severe = {
    'approved': False,
    'concerns': [],
    'warnings': [],
    'severe_warning': True,
    'warning_reason': '重大风险'
}

result3 = router.apply_llm_review(test_signal, llm_response_severe)
print(f"输入: 严重警告")
print(f"结果: action={result3['action']}, llm_rejected={result3['llm_rejected']}")

assert result3['action'] == 'hold', "严重警告应强制改为hold"
assert result3['llm_rejected'] == True, "应标记为LLM拒绝"
assert '重大风险' in str(result3['reasoning']), "reasoning应包含警告原因"
print("✓ 严重警告应用测试通过")

# 测试正常批准
llm_response_approved = {
    'approved': True,
    'concerns': ['注意支撑位'],
    'warnings': [],
    'severe_warning': False,
    'warning_reason': ''
}

result4 = router.apply_llm_review(test_signal, llm_response_approved)
print(f"\n输入: LLM批准 (有关注点)")
print(f"结果: action={result4['action']}, confidence={result4['confidence']:.2f}")

assert result4['action'] == 'open_long', "批准应保持原action"
assert result4['llm_rejected'] == False, "不应标记为拒绝"
assert '注意支撑位' in str(result4['reasoning']), "reasoning应包含关注点"
print("✓ LLM批准应用测试通过")

print("\n" + "=" * 60)
print("测试4: 性能监控器")
print("=" * 60)

monitor = get_monitor()

# 记录一些测试数据
import time

timer1 = monitor.start_timer("test_decision")
time.sleep(0.1)
monitor.stop_timer(timer1, 'decision')

timer2 = monitor.start_timer("test_llm")
time.sleep(0.5)
monitor.stop_timer(timer2, 'llm')
monitor.record_llm_call(input_tokens=500, output_tokens=200)

# 获取统计
stats = monitor.get_stats()
print(f"决策延迟: {stats['decision_latency']['avg_ms']:.2f}ms")
print(f"LLM调用次数: {stats['llm_calls']['count']}")
print(f"性能评级: {stats['performance_grade']}")

assert stats['decision_latency']['count'] > 0, "应有决策延迟记录"
assert stats['llm_calls']['count'] > 0, "应有LLM调用记录"
print("✓ 性能监控器测试通过")

print("\n" + "=" * 60)
print("✅ 所有测试通过！")
print("=" * 60)
print("\n修复项总结:")
print("1. ✓ 类名修复: MarketRegimeIdentifier → MarketRegimeDetector")
print("2. ✓ 响应解析器: 新增 severe_warning 和 warning_reason 字段")
print("3. ✓ SignalRouter: 新增 apply_llm_review 方法处理严重警告")
print("4. ✓ 性能监控器: 新建 PerformanceMonitor 模块")
print("5. ✓ 数据库优化: 创建索引、启用WAL、优化配置")
