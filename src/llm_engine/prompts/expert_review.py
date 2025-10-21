"""
专家复核Prompt模板

触发条件：量化信号置信度 < 0.85
目标：LLM复核量化信号，判断是否同意
"""

from typing import Dict, List, Any
import json
import logging

logger = logging.getLogger(__name__)


class ExpertReviewPrompt:
    """专家复核Prompt构建器"""
    
    @staticmethod
    def build_prompt(market_data: Dict[str, Any], signal: Dict[str, Any]) -> str:
        """
        构建专家复核Prompt
        
        Args:
            market_data: 市场数据快照
            signal: 量化信号
            
        Returns:
            str: Prompt文本（~480 tokens）
        """
        prompt = f"""你是一位期货交易专家，负责复核量化系统的交易信号。

【市场快照】
- 合约：{market_data.get('symbol', 'SA601')}
- 当前价格：{market_data.get('close', 0):.0f}元/吨
- 市场状态：{market_data.get('market_regime', 'unknown')}（置信度{market_data.get('regime_confidence', 0)*100:.0f}%）
- 主要指标：
  - MA20: {market_data.get('ma_20', 0):.0f}, MA60: {market_data.get('ma_60', 0):.0f}, MA120: {market_data.get('ma_120', 0):.0f}
  - MACD: {market_data.get('macd', 0):.2f}, Signal: {market_data.get('macd_signal', 0):.2f}
  - RSI: {market_data.get('rsi', 0):.1f}
  - ATR: {market_data.get('atr', 0):.1f}（{market_data.get('atr_percentile', 0)*100:.0f}分位数）
- 订单流：
  - VPIN: {market_data.get('vpin', 0):.2f}（毒性等级：{market_data.get('vpin_level', 'unknown')}）
  - 买卖盘深度比: {market_data.get('depth_ratio', 0):.2f}

【量化信号】
- 动作：{signal.get('action', 'hold')}
- 置信度：{signal.get('confidence', 0)*100:.0f}%（略低于阈值85%）
- 策略来源：{signal.get('strategy', 'unknown')}
- 推理：
{chr(10).join([f"  {i+1}. {r}" for i, r in enumerate(signal.get('reasoning', []))])}

【你的任务】
1. 判断是否同意这个信号（yes/no）
2. 如果不同意，说明主要关注点（1-2点）
3. 如果市场有严重风险，给出警告

请以JSON格式回复（不要包含```json等markdown标记）：
{{
    "approved": true/false,
    "concerns": ["关注点1", "关注点2"],
    "warnings": ["警告1"]
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
                - approved: bool
                - concerns: List[str]
                - warnings: List[str]
        """
        try:
            # 去除可能的markdown标记
            cleaned = response_text.strip()
            if cleaned.startswith('```'):
                # 移除markdown代码块
                lines = cleaned.split('\n')
                if len(lines) > 2:
                    cleaned = '\n'.join(lines[1:-1])
            
            # 解析JSON
            data = json.loads(cleaned)
            
            # 验证和转换
            result = {
                'approved': bool(data.get('approved', False)),
                'concerns': list(data.get('concerns', [])),
                'warnings': list(data.get('warnings', []))
            }
            
            return result
            
        except Exception as e:
            logger.error(f"解析专家复核响应失败: {e}")
            # 返回保守的默认值（不同意信号）
            return {
                'approved': False,
                'concerns': ['解析LLM响应失败，出于安全考虑不同意信号'],
                'warnings': [f'技术错误: {str(e)}']
            }
    
    @staticmethod
    def get_default_response() -> Dict[str, Any]:
        """
        获取默认响应（LLM失败时使用）
        
        Returns:
            dict: 默认响应（不同意信号）
        """
        return {
            'approved': False,
            'concerns': ['LLM服务不可用'],
            'warnings': ['建议人工复核']
        }


# 测试代码
if __name__ == "__main__":
    # 测试Prompt构建
    market_data = {
        'symbol': 'SA601',
        'close': 2100,
        'market_regime': '强趋势市',
        'regime_confidence': 0.82,
        'ma_20': 2090,
        'ma_60': 2050,
        'ma_120': 2000,
        'macd': 5.2,
        'macd_signal': 3.8,
        'rsi': 55.0,
        'atr': 45.0,
        'atr_percentile': 0.60,
        'vpin': 0.35,
        'vpin_level': '低毒性',
        'depth_ratio': 1.2
    }
    
    signal = {
        'action': 'open_long',
        'confidence': 0.78,
        'strategy': '趋势跟踪',
        'reasoning': [
            '多周期趋势一致（1h/4h/1d均上涨）',
            '价格回调至MA20附近（支撑位）',
            '订单流支持（买压65%）',
            'RSI未超买（<70）'
        ]
    }
    
    prompt = ExpertReviewPrompt.build_prompt(market_data, signal)
    print(prompt)
    print(f"\n\nPrompt长度: ~{len(prompt.split())} tokens")
    
    # 测试响应解析
    test_response = """```json
{
    "approved": true,
    "concerns": ["置信度略低，建议减小仓位至1手", "关注2090支撑是否有效"],
    "warnings": []
}
```"""
    
    parsed = ExpertReviewPrompt.parse_response(test_response)
    print(f"\n解析结果: {parsed}")
