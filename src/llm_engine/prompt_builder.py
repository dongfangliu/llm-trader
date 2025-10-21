"""
Prompt构建器
为不同决策层级构建高质量的prompt
"""

from typing import Dict, List, Optional
from datetime import datetime


class PromptBuilder:
    """Prompt构建器"""

    @staticmethod
    def build_strategic_prompt(market_data: Dict, kline_text: str) -> str:
        """
        构建战略层Prompt（4小时级别）

        Args:
            market_data: 市场数据摘要
            kline_text: 格式化的K线文本

        Returns:
            str: 完整的战略层prompt
        """
        prompt = f"""你是资深的纯碱期货分析师，拥有10年交易经验。

【市场数据】
时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}

最新价格: {market_data.get('current_price', 0)}
涨跌: {market_data.get('price_change', 0):+.2f} ({market_data.get('price_change_pct', 0):+.2f}%)

日K线数据:
{kline_text}

技术面:
- MA5: {market_data.get('ma5', 0):.2f}
- MA10: {market_data.get('ma10', 0):.2f}
- MA20: {market_data.get('ma20', 0):.2f}
- MACD: {market_data.get('macd', 0):.2f}, Signal: {market_data.get('macd_signal', 0):.2f}
- RSI(14): {market_data.get('rsi', 0):.1f}

价格位置:
- 前20期高点: {market_data.get('resistance', 0):.2f}
- 前20期低点: {market_data.get('support', 0):.2f}
- 价格 vs MA5: {'上方' if market_data.get('price_above_ma5') else '下方'}
- 价格 vs MA20: {'上方' if market_data.get('price_above_ma20') else '下方'}

成交量:
- 当前量能: {market_data.get('volume', 0)}
- 量比: {market_data.get('volume_ratio', 0):.1f}%

波动率: {market_data.get('volatility', 0):.2%}

【任务】
请进行深度分析未来4小时的市场趋势，输出JSON格式（不要包含markdown标记，直接输出JSON）:
{{
  "trend": "bullish/bearish/neutral",
  "strength": 7,
  "key_levels": {{
    "resistance": [1900, 1920],
    "support": [1850, 1830]
  }},
  "reasoning": "详细分析市场结构、趋势强度、关键位支撑阻力，至少200字",
  "risk_factors": ["风险因素1", "风险因素2"],
  "confidence": 85
}}

【要求】
1. 基于技术面客观分析，不要过度主观臆断
2. 识别关键支撑阻力位，结合前期高低点
3. 评估趋势强度时考虑量能配合（量价关系）
4. 明确指出可能的风险点和注意事项
5. confidence为0-100的整数，表示对判断的信心
6. 输出必须是纯JSON格式，不要包含```json等markdown标记
"""
        return prompt

    @staticmethod
    def build_tactical_prompt(market_data: Dict,
                              kline_text: str,
                              strategic_result: Dict,
                              position_info: str,
                              account_info: Dict,
                              recent_lessons: List[str]) -> str:
        """
        构建战术层Prompt（15分钟级别）

        Args:
            market_data: 市场数据
            kline_text: K线文本
            strategic_result: 战略层结论
            position_info: 持仓信息
            account_info: 账户信息
            recent_lessons: 最近的经验教训

        Returns:
            str: 完整的战术层prompt
        """
        lessons_text = "\n".join(f"- {lesson}" for lesson in recent_lessons) if recent_lessons else "暂无历史经验"

        prompt = f"""你是纯碱期货交易员，根据战略判断执行具体交易决策。

【战略层结论】(4小时前判断)
趋势: {strategic_result.get('trend', 'neutral')}
强度: {strategic_result.get('strength', 0)}/10
关键阻力位: {strategic_result.get('key_levels', {}).get('resistance', [])}
关键支撑位: {strategic_result.get('key_levels', {}).get('support', [])}
战略推理: {strategic_result.get('reasoning', '')[:100]}...

【当前市场】
时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
最新价: {market_data.get('current_price', 0)}

15分钟K线（最近10根）:
{kline_text}

技术指标:
- RSI(14): {market_data.get('rsi', 0):.1f}
- MACD: {market_data.get('macd', 0):.2f}
- MACD信号线: {market_data.get('macd_signal', 0):.2f}
- MACD柱状: {market_data.get('macd_hist', 0):.2f}
- 布林带: 上轨{market_data.get('bb_upper', 0):.0f}, 中轨{market_data.get('bb_middle', 0):.0f}, 下轨{market_data.get('bb_lower', 0):.0f}
- 成交量: {market_data.get('volume', 0)}, 量比{market_data.get('volume_ratio', 0):.1f}%

【持仓状态】
{position_info}

【账户状态】
可用资金: {account_info.get('balance', 0):.2f}元
今日盈亏: {account_info.get('today_pnl', 0):+.2f}元
今日交易: {account_info.get('today_trades', 0)}次

【历史经验】(最近5天复盘总结)
{lessons_text}

【任务】
基于战略方向，决定此刻的具体操作，输出JSON格式（不要包含markdown标记）:
{{
  "action": "open_long/open_short/close_position/hold",
  "quantity": 1,
  "confidence": 85,
  "stop_loss": 1830,
  "take_profit": 1870,
  "reasoning": "详细说明为何此刻交易，结合技术指标和战略方向，至少100字",
  "key_factors": ["决策关键因素1", "因素2"]
}}

【严格约束】
1. action必须符合战略方向：
   - 战略trend为bullish时，只能open_long/close_position/hold，不能open_short
   - 战略trend为bearish时，只能open_short/close_position/hold，不能open_long
   - 战略trend为neutral时，优先hold，除非有明确短线机会
2. confidence < 70 必须输出hold
3. 考虑2个tick滑点和万分之2手续费成本
4. 不要过度交易，宁可错过不要做错
5. 如果当前已有持仓，评估是否需要平仓或持有
6. 输出必须是纯JSON格式，不要包含```json等markdown标记
"""
        return prompt

    @staticmethod
    def build_review_prompt(trades_today: List[Dict],
                            decisions_today: List[Dict],
                            performance: Dict) -> str:
        """
        构建复盘Prompt

        Args:
            trades_today: 今日交易记录
            decisions_today: 今日决策记录
            performance: 今日表现数据

        Returns:
            str: 复盘prompt
        """
        # 格式化交易记录
        trades_text = []
        for i, trade in enumerate(trades_today, 1):
            trades_text.append(
                f"{i}. {trade.get('timestamp')} | "
                f"{trade.get('action')} {trade.get('direction')} | "
                f"价格{trade.get('price', 0)} | "
                f"盈亏{trade.get('pnl', 0):+.2f}"
            )
        trades_str = "\n".join(trades_text) if trades_text else "今日无交易"

        # 格式化决策记录（简化）
        decisions_text = []
        for i, dec in enumerate(decisions_today[:10], 1):  # 最多10条
            decisions_text.append(
                f"{i}. {dec.get('timestamp')} | "
                f"{dec.get('decision_layer')} | "
                f"执行:{dec.get('executed')}"
            )
        decisions_str = "\n".join(decisions_text) if decisions_text else "今日无决策"

        prompt = f"""请复盘今日的交易表现。

【今日交易记录】
{trades_str}

【今日决策记录】
{decisions_str}

【最终结果】
总交易次数: {performance.get('total_trades', 0)}
盈利交易: {performance.get('win_trades', 0)}
胜率: {performance.get('win_rate', 0):.1f}%
总盈亏: {performance.get('total_pnl', 0):+.2f}元
最大单笔盈利: {performance.get('max_win', 0):+.2f}元
最大单笔亏损: {performance.get('max_loss', 0):+.2f}元

【任务】
深度复盘今日表现，输出JSON格式（不要包含markdown标记）:
{{
  "performance_rating": 7,
  "good_decisions": [
    {{"trade_id": 3, "reason": "成功判断突破，止盈及时"}}
  ],
  "bad_decisions": [
    {{"trade_id": 5, "reason": "追高买入，应该等待回调"}}
  ],
  "patterns_found": [
    "发现在RSI>70时开多，胜率仅30%",
    "震荡市中交易过于频繁"
  ],
  "lessons": [
    "明天注意：在震荡市中减少交易频率",
    "优化策略：等待RSI回到50以下再考虑开多"
  ],
  "strategy_adjustment": "建议将战术层置信度阈值提高到75"
}}

【要求】
1. performance_rating为1-10的评分
2. 详细分析成功和失败的交易
3. 识别交易模式和规律
4. 提出明确可执行的改进建议
5. 输出必须是纯JSON格式
"""
        return prompt


if __name__ == "__main__":
    # 测试代码
    builder = PromptBuilder()

    # 测试战略层prompt
    mock_market_data = {
        'current_price': 1850,
        'price_change': 10,
        'price_change_pct': 0.54,
        'ma5': 1845,
        'ma10': 1840,
        'ma20': 1835,
        'macd': 5.2,
        'macd_signal': 3.8,
        'rsi': 62.5,
        'resistance': 1880,
        'support': 1820,
        'price_above_ma5': True,
        'price_above_ma20': True,
        'volume': 12000,
        'volume_ratio': 115.3,
        'volatility': 0.025
    }

    mock_kline = "时间 | 开 | 高 | 低 | 收\n10-11 09:00 | 1840 | 1850 | 1838 | 1848"

    strategic_prompt = builder.build_strategic_prompt(mock_market_data, mock_kline)
    print("=== 战略层Prompt ===")
    print(strategic_prompt[:500] + "...\n")

    # 测试战术层prompt
    mock_strategic = {
        'trend': 'bullish',
        'strength': 7,
        'key_levels': {'resistance': [1880, 1900], 'support': [1820, 1800]},
        'reasoning': '价格突破MA20，MACD金叉，量能放大...'
    }

    mock_position = "当前空仓"
    mock_account = {'balance': 48500, 'today_pnl': -150, 'today_trades': 2}
    mock_lessons = ["震荡市中减少交易", "等待RSI<50再开多"]

    tactical_prompt = builder.build_tactical_prompt(
        mock_market_data,
        mock_kline,
        mock_strategic,
        mock_position,
        mock_account,
        mock_lessons
    )
    print("=== 战术层Prompt ===")
    print(tactical_prompt[:500] + "...")
