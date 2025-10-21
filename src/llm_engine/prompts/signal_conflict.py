"""
信号冲突Prompt模板

触发条件：多个策略给出相反信号
目标：解决策略冲突，选择最佳行动
"""

from typing import Dict, List, Any
import json
import logging

logger = logging.getLogger(__name__)


class SignalConflictPrompt:
    """信号冲突Prompt构建器"""
    
    @staticmethod
    def build_prompt(market_data: Dict[str, Any], signals: List[Dict[str, Any]]) -> str:
        """
        构建信号冲突Prompt
        
        Args:
            market_data: 市场数据快照
            signals: 冲突的信号列表
            
        Returns:
            str: Prompt文本（~450 tokens）
        """
        # 构建信号描述
        signal_desc = []
        for i, sig in enumerate(signals, 1):
            desc = f"""信号{i}：{sig.get('strategy', 'unknown')}策略
- 动作：{sig.get('action', 'hold')}
- 置信度：{sig.get('confidence', 0)*100:.0f}%
- 理由：{chr(10).join([f"  · {r}" for r in sig.get('reasoning', [])])}"""
            signal_desc.append(desc)
        
        prompt = f"""你是一位期货交易专家，负责解决策略冲突。

【冲突信号】
{chr(10).join(signal_desc)}

【市场快照】
- 价格：{market_data.get('close', 0):.0f}（布林带位置：{market_data.get('bb_position', 'unknown')}）
- 趋势：{market_data.get('trend', 'unknown')}（ADX={market_data.get('adx', 0):.0f}）
- RSI: {market_data.get('rsi', 0):.1f}（{market_data.get('rsi_zone', 'unknown')}）
- 订单流：买压{market_data.get('buy_pressure', 0)*100:.0f}%，卖压{market_data.get('sell_pressure', 0)*100:.0f}%

【你的任务】
1. 判断应该听从哪个策略，或者都不听（wait）
2. 给出理由

请以JSON格式回复（不要包含```json等markdown标记）：
{{
    "decision": "follow_signal_1/follow_signal_2/wait",
    "rationale": "理由（1-2句话）"
}}"""
        
        return prompt
    
    @staticmethod
    def parse_response(response_text: str) -> Dict[str, Any]:
        """
        解析LLM响应
        
        Args:
            response_text: LLM原始响应
            
        Returns:
            dict: 解析后的结构化数据
                - decision: str (follow_signal_1/follow_signal_2/wait)
                - rationale: str
        """
        try:
            # 去除可能的markdown标记
            cleaned = response_text.strip()
            if cleaned.startswith('```'):
                lines = cleaned.split('\n')
                if len(lines) > 2:
                    cleaned = '\n'.join(lines[1:-1])
            
            # 解析JSON
            data = json.loads(cleaned)
            
            # 验证和转换
            result = {
                'decision': str(data.get('decision', 'wait')),
                'rationale': str(data.get('rationale', '信号冲突，建议观望'))
            }
            
            # 验证decision有效性
            valid_decisions = ['follow_signal_1', 'follow_signal_2', 'wait']
            if result['decision'] not in valid_decisions:
                result['decision'] = 'wait'
            
            return result
            
        except Exception as e:
            logger.error(f"解析信号冲突响应失败: {e}")
            # 返回保守的默认值（观望）
            return {
                'decision': 'wait',
                'rationale': f'解析失败，出于安全考虑选择观望: {str(e)}'
            }
    
    @staticmethod
    def get_default_response() -> Dict[str, Any]:
        """
        获取默认响应（LLM失败时使用）
        
        Returns:
            dict: 默认响应（观望）
        """
        return {
            'decision': 'wait',
            'rationale': 'LLM服务不可用，信号冲突无法解决，建议观望'
        }


# 测试代码
if __name__ == "__main__":
    # 测试Prompt构建
    market_data = {
        'close': 2100,
        'bb_position': '布林带上轨',
        'trend': '强趋势市',
        'adx': 30,
        'rsi': 68.0,
        'rsi_zone': '接近超买',
        'buy_pressure': 0.52,
        'sell_pressure': 0.48
    }
    
    signals = [
        {
            'strategy': '趋势跟踪',
            'action': 'open_long',
            'confidence': 0.75,
            'reasoning': [
                '多周期趋势一致，价格回调至MA20',
                '订单流支持（买压65%）'
            ]
        },
        {
            'strategy': '均值回归',
            'action': 'open_short',
            'confidence': 0.72,
            'reasoning': [
                '价格触及布林带上轨',
                'RSI=68（接近超买）'
            ]
        }
    ]
    
    prompt = SignalConflictPrompt.build_prompt(market_data, signals)
    print(prompt)
    print(f"\n\nPrompt长度: ~{len(prompt.split())} tokens")
    
    # 测试响应解析
    test_response = """{
    "decision": "wait",
    "rationale": "趋势强劲但RSI偏高，存在短期回调风险。建议等待价格回落至更安全位置再开多。"
}"""
    
    parsed = SignalConflictPrompt.parse_response(test_response)
    print(f"\n解析结果: {parsed}")
