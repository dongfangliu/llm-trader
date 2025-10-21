"""
每日复盘Prompt模板

触发时间：每日21:00
目标：分析当日交易，提取教训
"""

from typing import Dict, List, Any
import json
import logging

logger = logging.getLogger(__name__)


class DailyReviewPrompt:
    """每日复盘Prompt构建器"""
    
    @staticmethod
    def build_prompt(trades: List[Dict[str, Any]], market_summary: Dict[str, Any]) -> str:
        """
        构建每日复盘Prompt
        
        Args:
            trades: 当日交易列表
            market_summary: 市场表现总结
            
        Returns:
            str: Prompt文本（~550 tokens）
        """
        # 构建交易描述
        trade_desc = []
        for i, trade in enumerate(trades, 1):
            desc = f"""交易{i}:
- 时间：{trade.get('open_time', 'unknown')}
- 动作：{trade.get('action', 'unknown')} {trade.get('volume', 0)}手 @ {trade.get('open_price', 0):.0f}
- 信号来源：{trade.get('strategy', 'unknown')}（置信度{trade.get('confidence', 0)*100:.0f}%）
- 结果：{trade.get('result', 'unknown')} @ {trade.get('close_price', 0):.0f}，{trade.get('pnl_text', 'unknown')}
- 持仓时长：{trade.get('duration', 'unknown')}"""
            trade_desc.append(desc)
        
        prompt = f"""你是一位期货交易专家，负责复盘今日交易。

【今日交易记录】
{chr(10).join(trade_desc) if trade_desc else '今日无交易'}

【市场表现】
- 日内走势：{market_summary.get('price_range', 'unknown')}
- 波动率：{market_summary.get('volatility', 'unknown')}（ATR {market_summary.get('atr_percentile', 0)*100:.0f}分位数）
- 成交量：{market_summary.get('volume_level', 'unknown')}
- 主导趋势：{market_summary.get('dominant_trend', 'unknown')}

【统计数据】
- 总交易数：{len(trades)}笔
- 盈利交易：{market_summary.get('winning_trades', 0)}笔
- 亏损交易：{market_summary.get('losing_trades', 0)}笔
- 净盈亏：{market_summary.get('net_pnl', 0):+.0f}元
- 胜率：{market_summary.get('win_rate', 0)*100:.0f}%

【你的任务】
1. 总结今日交易的得失
2. 提取3-5条教训（lessons learned）
3. 教训格式：明确的规则或建议，可直接用于指导未来交易

请以JSON格式回复（不要包含```json等markdown标记）：
{{
    "summary": "今日交易总结（1-2句话）",
    "lessons": [
        {{
            "content": "教训内容（明确的规则）",
            "importance": "high/medium/low"
        }}
    ]
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
                - summary: str
                - lessons: List[Dict]
                    - content: str
                    - importance: str
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
                'summary': str(data.get('summary', '无有效总结')),
                'lessons': []
            }
            
            # 验证lessons
            lessons = data.get('lessons', [])
            valid_importance = ['high', 'medium', 'low']
            
            for lesson in lessons:
                if isinstance(lesson, dict):
                    importance = lesson.get('importance', 'medium')
                    if importance not in valid_importance:
                        importance = 'medium'
                    
                    result['lessons'].append({
                        'content': str(lesson.get('content', '')),
                        'importance': importance
                    })
            
            # 限制教训数量（3-5条）
            if len(result['lessons']) > 5:
                result['lessons'] = result['lessons'][:5]
            
            return result
            
        except Exception as e:
            logger.error(f"解析每日复盘响应失败: {e}")
            # 返回默认值
            return {
                'summary': f'解析失败: {str(e)}',
                'lessons': [
                    {
                        'content': 'LLM响应解析失败，建议人工复盘',
                        'importance': 'high'
                    }
                ]
            }
    
    @staticmethod
    def get_default_response() -> Dict[str, Any]:
        """
        获取默认响应（LLM失败时使用）
        
        Returns:
            dict: 默认响应
        """
        return {
            'summary': 'LLM服务不可用',
            'lessons': [
                {
                    'content': '每日复盘失败，建议人工复盘',
                    'importance': 'high'
                }
            ]
        }


# 测试代码
if __name__ == "__main__":
    # 测试Prompt构建
    trades = [
        {
            'open_time': '09:30',
            'action': '开多',
            'volume': 2,
            'open_price': 2080,
            'strategy': '趋势跟踪',
            'confidence': 0.85,
            'result': '止盈',
            'close_price': 2110,
            'pnl_text': '盈利+300元',
            'duration': '2小时'
        },
        {
            'open_time': '13:45',
            'action': '开空',
            'volume': 1,
            'open_price': 2115,
            'strategy': '均值回归',
            'confidence': 0.72,
            'result': '止损',
            'close_price': 2125,
            'pnl_text': '亏损-50元',
            'duration': '30分钟'
        },
        {
            'open_time': '14:30',
            'action': '开多',
            'volume': 2,
            'open_price': 2105,
            'strategy': '突破策略',
            'confidence': 0.78,
            'result': '持仓中',
            'close_price': 2120,
            'pnl_text': '浮盈+200元',
            'duration': '持仓中'
        }
    ]
    
    market_summary = {
        'price_range': '震荡上行（2080 → 2120）',
        'volatility': '正常',
        'atr_percentile': 0.40,
        'volume_level': '正常',
        'dominant_trend': '弱多头',
        'winning_trades': 2,
        'losing_trades': 1,
        'net_pnl': 450,
        'win_rate': 0.67
    }
    
    prompt = DailyReviewPrompt.build_prompt(trades, market_summary)
    print(prompt)
    print(f"\n\nPrompt长度: ~{len(prompt.split())} tokens")
    
    # 测试响应解析
    test_response = """{
    "summary": "今日3笔交易，2盈1亏，净盈利+450元。趋势策略表现优秀，均值回归策略在趋势市中失效。",
    "lessons": [
        {
            "content": "在强趋势市（ADX>25）中，避免使用均值回归策略，即使RSI显示超买",
            "importance": "high"
        },
        {
            "content": "置信度<75%的信号，减小仓位至1手",
            "importance": "medium"
        },
        {
            "content": "趋势策略在波动率正常时表现最佳，继续使用",
            "importance": "medium"
        }
    ]
}"""
    
    parsed = DailyReviewPrompt.parse_response(test_response)
    print(f"\n解析结果: {parsed}")
    print(f"教训数量: {len(parsed['lessons'])}")
