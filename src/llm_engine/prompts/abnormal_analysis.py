"""
异常分析Prompt模板

触发条件：市场状态为 abnormal
目标：分析市场异常原因，评估风险，给出建议
"""

from typing import Dict, List, Any
import json
import logging

logger = logging.getLogger(__name__)


class AbnormalAnalysisPrompt:
    """异常分析Prompt构建器"""
    
    @staticmethod
    def build_prompt(market_data: Dict[str, Any], abnormal_indicators: Dict[str, Any]) -> str:
        """
        构建异常分析Prompt
        
        Args:
            market_data: 市场数据快照
            abnormal_indicators: 异常指标详情
            
        Returns:
            str: Prompt文本（~520 tokens）
        """
        prompt = f"""你是一位期货交易专家，负责分析市场异常情况。

【异常指标】
- ATR暴增：当前{abnormal_indicators.get('atr', 0):.1f}，历史{abnormal_indicators.get('atr_percentile', 0)*100:.0f}分位数（极高波动）
- 成交量变化：{abnormal_indicators.get('volume_change', 0):.1f}倍正常水平
- VPIN毒性：{abnormal_indicators.get('vpin', 0):.2f}（{abnormal_indicators.get('vpin_level', 'unknown')}）
- 价格跳动：{abnormal_indicators.get('price_jump', 0):.1f}点（{abnormal_indicators.get('price_jump_pct', 0):.1f}%）
- 流动性变化：{abnormal_indicators.get('liquidity_change', 'unknown')}

【市场快照】
- 价格走势：{market_data.get('price_from', 0):.0f} → {market_data.get('price_to', 0):.0f}
- 趋势强度：ADX={market_data.get('adx', 0):.0f}（{market_data.get('trend_strength', 'unknown')}）
- 买卖压：买压{market_data.get('buy_pressure', 0)*100:.0f}%，卖压{market_data.get('sell_pressure', 0)*100:.0f}%
- 时间：{market_data.get('timestamp', 'unknown')}

【量化系统建议】
动作：{market_data.get('suggested_action', 'wait')}
理由：{market_data.get('reason', '市场异常，避免冲动交易')}

【你的任务】
1. 判断异常原因（可能是：重大消息、资金异动、技术性突破、系统故障、其他）
2. 评估风险等级（low/medium/high/critical）
3. 给出建议（是否继续观望，或有其他操作）

请以JSON格式回复（不要包含```json等markdown标记）：
{{
    "cause": "异常原因推测",
    "risk_level": "low/medium/high/critical",
    "recommendation": "建议",
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
                - cause: str
                - risk_level: str
                - recommendation: str
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
                'cause': str(data.get('cause', '未知原因')),
                'risk_level': str(data.get('risk_level', 'high')),
                'recommendation': str(data.get('recommendation', '暂停交易')),
                'rationale': str(data.get('rationale', '市场异常，风险不明'))
            }
            
            # 验证risk_level有效性
            valid_levels = ['low', 'medium', 'high', 'critical']
            if result['risk_level'] not in valid_levels:
                result['risk_level'] = 'high'
            
            return result
            
        except Exception as e:
            logger.error(f"解析异常分析响应失败: {e}")
            # 返回保守的默认值
            return {
                'cause': '解析失败',
                'risk_level': 'critical',
                'recommendation': '暂停交易',
                'rationale': f'技术错误: {str(e)}'
            }
    
    @staticmethod
    def get_default_response() -> Dict[str, Any]:
        """
        获取默认响应（LLM失败时使用）
        
        Returns:
            dict: 默认响应（高风险）
        """
        return {
            'cause': 'LLM服务不可用',
            'risk_level': 'critical',
            'recommendation': '暂停交易',
            'rationale': '无法获取专家分析，建议人工复核'
        }


# 测试代码
if __name__ == "__main__":
    # 测试Prompt构建
    market_data = {
        'price_from': 2100,
        'price_to': 2130,
        'adx': 15,
        'trend_strength': '不明确',
        'buy_pressure': 0.85,
        'sell_pressure': 0.15,
        'timestamp': '2025-10-20 14:30',
        'suggested_action': 'wait',
        'reason': '市场异常，避免冲动交易'
    }
    
    abnormal_indicators = {
        'atr': 45,
        'atr_percentile': 0.92,
        'volume_change': 2.5,
        'vpin': 0.78,
        'vpin_level': '高毒性',
        'price_jump': 30,
        'price_jump_pct': 1.5,
        'liquidity_change': '急剧下降'
    }
    
    prompt = AbnormalAnalysisPrompt.build_prompt(market_data, abnormal_indicators)
    print(prompt)
    print(f"\n\nPrompt长度: ~{len(prompt.split())} tokens")
    
    # 测试响应解析
    test_response = """{
    "cause": "可能是产能政策消息导致的资金涌入",
    "risk_level": "high",
    "recommendation": "继续观望，等待波动率回归正常",
    "rationale": "高波动+高毒性表明市场有重大分歧，此时入场风险极大"
}"""
    
    parsed = AbnormalAnalysisPrompt.parse_response(test_response)
    print(f"\n解析结果: {parsed}")
