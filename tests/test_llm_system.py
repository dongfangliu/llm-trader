"""
LLM系统单元测试

测试：
1. Prompt构建正确性
2. 触发逻辑
3. 响应解析
4. 异常处理
"""

import unittest
import sys
from pathlib import Path

# 添加src到路径
sys.path.insert(0, str(Path(__file__).parent.parent / 'src'))

from llm_engine.llm_trigger import LLMTrigger
from llm_engine.response_parser import ResponseParser
from llm_engine.prompts.expert_review import ExpertReviewPrompt
from llm_engine.prompts.abnormal_analysis import AbnormalAnalysisPrompt
from llm_engine.prompts.signal_conflict import SignalConflictPrompt
from llm_engine.prompts.daily_review import DailyReviewPrompt


class TestLLMTrigger(unittest.TestCase):
    """测试LLM触发逻辑"""
    
    def setUp(self):
        self.trigger = LLMTrigger(confidence_threshold=0.85)
    
    def test_low_confidence_trigger(self):
        """测试低置信度触发"""
        signal = {'action': 'open_long', 'confidence': 0.75}
        market_state = {'regime': 'trend', 'confidence': 0.90}
        
        should_trigger, trigger_type = self.trigger.should_trigger(
            signal=signal,
            market_state=market_state
        )
        
        self.assertTrue(should_trigger)
        self.assertEqual(trigger_type, 'expert_review')
    
    def test_high_confidence_no_trigger(self):
        """测试高置信度不触发"""
        signal = {'action': 'open_long', 'confidence': 0.90}
        market_state = {'regime': 'trend', 'confidence': 0.90}
        
        should_trigger, trigger_type = self.trigger.should_trigger(
            signal=signal,
            market_state=market_state
        )
        
        self.assertFalse(should_trigger)
        self.assertIsNone(trigger_type)
    
    def test_abnormal_market_trigger(self):
        """测试异常市场触发"""
        signal = {'action': 'open_long', 'confidence': 0.90}
        market_state = {'regime': 'abnormal', 'confidence': 0.80}
        
        should_trigger, trigger_type = self.trigger.should_trigger(
            signal=signal,
            market_state=market_state
        )
        
        self.assertTrue(should_trigger)
        self.assertEqual(trigger_type, 'abnormal_analysis')
    
    def test_signal_conflict_trigger(self):
        """测试信号冲突触发"""
        signals = [
            {'action': 'open_long', 'confidence': 0.85, 'source': 'trend'},
            {'action': 'open_short', 'confidence': 0.80, 'source': 'mean_reversion'}
        ]
        market_state = {'regime': 'range', 'confidence': 0.85}
        
        should_trigger, trigger_type = self.trigger.should_trigger(
            signal=signals[0],
            market_state=market_state,
            signals=signals
        )
        
        self.assertTrue(should_trigger)
        self.assertEqual(trigger_type, 'signal_conflict')
    
    def test_manual_trigger(self):
        """测试手动触发"""
        signal = {'action': 'hold', 'confidence': 1.0}
        market_state = {'regime': 'trend', 'confidence': 0.90}
        
        should_trigger, trigger_type = self.trigger.should_trigger(
            signal=signal,
            market_state=market_state,
            manual=True
        )
        
        self.assertTrue(should_trigger)
        self.assertEqual(trigger_type, 'manual_request')
    
    def test_trigger_stats(self):
        """测试触发统计"""
        # 触发几次
        self.trigger.should_trigger(
            signal={'action': 'open_long', 'confidence': 0.75},
            market_state={'regime': 'trend', 'confidence': 0.90}
        )
        
        self.trigger.should_trigger(
            signal={'action': 'open_long', 'confidence': 0.90},
            market_state={'regime': 'abnormal', 'confidence': 0.80}
        )
        
        stats = self.trigger.get_stats()
        self.assertEqual(stats['expert_review'], 1)
        self.assertEqual(stats['abnormal_analysis'], 1)
        self.assertEqual(stats['total'], 2)


class TestPromptBuilder(unittest.TestCase):
    """测试Prompt构建"""
    
    def test_expert_review_prompt(self):
        """测试专家复核Prompt"""
        prompt_builder = ExpertReviewPrompt()
        
        signal = {
            'action': 'open_long',
            'confidence': 0.75,
            'reason': 'MA金叉+MACD多头'
        }
        
        market_summary = {
            'current_price': 1850.0,
            'ma_5': 1845.0,
            'ma_20': 1840.0,
            'rsi': 65.0,
            'macd': 5.0
        }
        
        position = None
        
        prompt = prompt_builder.build(signal, market_summary, position)
        
        # 检查Prompt包含关键信息
        self.assertIn('open_long', prompt)
        self.assertIn('0.75', prompt)
        self.assertIn('1850', prompt)
        
        # 检查长度（应该简洁）
        self.assertLess(len(prompt), 3000, "Prompt过长，应该精简")
    
    def test_abnormal_analysis_prompt(self):
        """测试异常分析Prompt"""
        prompt_builder = AbnormalAnalysisPrompt()
        
        market_state = {
            'regime': 'abnormal',
            'confidence': 0.80,
            'reason': '成交量暴增+价格跳空'
        }
        
        market_summary = {
            'current_price': 1850.0,
            'volume': 50000,
            'volatility': 0.035
        }
        
        position = {
            'direction': 'long',
            'quantity': 1,
            'open_price': 1840.0,
            'unrealized_pnl': 50.0
        }
        
        prompt = prompt_builder.build(market_state, market_summary, position)
        
        self.assertIn('abnormal', prompt)
        self.assertIn('1850', prompt)
        self.assertIn('long', prompt)
    
    def test_signal_conflict_prompt(self):
        """测试信号冲突Prompt"""
        prompt_builder = SignalConflictPrompt()
        
        signals = [
            {'action': 'open_long', 'confidence': 0.85, 'source': 'trend'},
            {'action': 'open_short', 'confidence': 0.80, 'source': 'mean_reversion'}
        ]
        
        market_summary = {'current_price': 1850.0}
        position = None
        
        prompt = prompt_builder.build(signals, market_summary, position)
        
        self.assertIn('open_long', prompt)
        self.assertIn('open_short', prompt)
        self.assertIn('冲突', prompt)
    
    def test_daily_review_prompt(self):
        """测试每日复盘Prompt"""
        prompt_builder = DailyReviewPrompt()
        
        trades = [
            {
                'direction': 'long',
                'open_price': 1840.0,
                'close_price': 1850.0,
                'pnl': 50.0,
                'result': 'win'
            }
        ]
        
        market_stats = {
            'avg_price': 1845.0,
            'volatility': 0.025,
            'volume': 30000
        }
        
        decisions = []
        
        prompt = prompt_builder.build(trades, market_stats, decisions)
        
        self.assertIn('复盘', prompt)
        self.assertIn('50.0', prompt)


class TestResponseParser(unittest.TestCase):
    """测试响应解析"""
    
    def setUp(self):
        self.parser = ResponseParser()
    
    def test_parse_expert_review_valid(self):
        """测试解析有效的专家复核响应"""
        response = """
        {
            "adjust_action": "hold",
            "adjust_confidence": 0.60,
            "reasoning": "当前RSI过高，建议观望"
        }
        """
        
        result = self.parser.parse_expert_review(response)
        
        self.assertIsNotNone(result)
        self.assertEqual(result['adjust_action'], 'hold')
        self.assertEqual(result['adjust_confidence'], 0.60)
    
    def test_parse_expert_review_with_markdown(self):
        """测试解析带markdown标记的响应"""
        response = """
        ```json
        {
            "adjust_action": "close",
            "adjust_confidence": 0.80,
            "reasoning": "止损"
        }
        ```
        """
        
        result = self.parser.parse_expert_review(response)
        
        self.assertIsNotNone(result)
        self.assertEqual(result['adjust_action'], 'close')
    
    def test_parse_expert_review_invalid(self):
        """测试解析无效响应（容错）"""
        response = "这不是JSON"
        
        result = self.parser.parse_expert_review(response)
        
        # 应该返回保守的默认值
        self.assertIsNotNone(result)
        self.assertEqual(result['adjust_action'], 'hold')
        self.assertLess(result['adjust_confidence'], 0.5)
    
    def test_parse_abnormal_analysis(self):
        """测试解析异常分析响应"""
        response = """
        {
            "market_risk": "high",
            "suggested_action": "reduce_position",
            "reasoning": "市场波动过大"
        }
        """
        
        result = self.parser.parse_abnormal_analysis(response)
        
        self.assertIsNotNone(result)
        self.assertEqual(result['market_risk'], 'high')
        self.assertEqual(result['suggested_action'], 'reduce_position')
    
    def test_parse_signal_conflict(self):
        """测试解析信号冲突响应"""
        response = """
        {
            "recommended_action": "open_long",
            "confidence": 0.75,
            "reasoning": "趋势信号更可靠"
        }
        """
        
        result = self.parser.parse_signal_conflict(response)
        
        self.assertIsNotNone(result)
        self.assertEqual(result['recommended_action'], 'open_long')
        self.assertEqual(result['confidence'], 0.75)
    
    def test_parse_daily_review(self):
        """测试解析每日复盘响应"""
        response = """
        {
            "lessons": [
                "RSI>70时开多胜率低",
                "震荡市应减少交易"
            ],
            "overall_performance": "需改进",
            "suggestions": ["增加风控力度"]
        }
        """
        
        result = self.parser.parse_daily_review(response)
        
        self.assertIsNotNone(result)
        self.assertEqual(len(result['lessons']), 2)
        self.assertIn('RSI', result['lessons'][0])


class TestEdgeCases(unittest.TestCase):
    """测试边界情况"""
    
    def setUp(self):
        self.parser = ResponseParser()
    
    def test_empty_response(self):
        """测试空响应"""
        result = self.parser.parse_expert_review("")
        self.assertIsNotNone(result)
        self.assertEqual(result['adjust_action'], 'hold')
    
    def test_malformed_json(self):
        """测试格式错误的JSON"""
        response = "{ action: 'open_long', }"  # 缺少引号
        result = self.parser.parse_expert_review(response)
        self.assertIsNotNone(result)
    
    def test_missing_fields(self):
        """测试缺少字段的响应"""
        response = '{"adjust_action": "open_long"}'  # 缺少confidence
        result = self.parser.parse_expert_review(response)
        self.assertIsNotNone(result)
        self.assertIn('adjust_confidence', result)
    
    def test_invalid_action(self):
        """测试无效的action"""
        response = '{"adjust_action": "invalid_action", "adjust_confidence": 0.80}'
        result = self.parser.parse_expert_review(response)
        # 应该修正为hold
        self.assertEqual(result['adjust_action'], 'hold')
    
    def test_confidence_out_of_range(self):
        """测试置信度超出范围"""
        response = '{"adjust_action": "open_long", "adjust_confidence": 1.5}'
        result = self.parser.parse_expert_review(response)
        # 应该修正到[0,1]范围
        self.assertLessEqual(result['adjust_confidence'], 1.0)
        self.assertGreaterEqual(result['adjust_confidence'], 0.0)


def run_tests():
    """运行所有测试"""
    # 创建测试套件
    loader = unittest.TestLoader()
    suite = unittest.TestSuite()
    
    # 添加测试
    suite.addTests(loader.loadTestsFromTestCase(TestLLMTrigger))
    suite.addTests(loader.loadTestsFromTestCase(TestPromptBuilder))
    suite.addTests(loader.loadTestsFromTestCase(TestResponseParser))
    suite.addTests(loader.loadTestsFromTestCase(TestEdgeCases))
    
    # 运行测试
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    
    # 返回结果
    return result.wasSuccessful()


if __name__ == '__main__':
    success = run_tests()
    sys.exit(0 if success else 1)
