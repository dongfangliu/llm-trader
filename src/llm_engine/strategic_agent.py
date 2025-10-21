"""
战略层Agent
负责4小时级别的趋势判断和方向设定
"""

from typing import Optional, Dict, Union
from loguru import logger

from .claude_client import ClaudeClient
from .openai_client import OpenAIClient
from .prompt_builder import PromptBuilder


class StrategicAgent:
    """战略层决策Agent"""

    def __init__(self, llm_client: Union[ClaudeClient, OpenAIClient]):
        """
        初始化战略Agent

        Args:
            llm_client: LLM客户端（支持Claude或OpenAI-compatible）
        """
        self.client = llm_client
        self.prompt_builder = PromptBuilder()
        self.current_strategy = None  # 当前战略判断
        logger.info("战略层Agent初始化完成")

    def analyze(self, market_data: Dict, kline_text: str) -> Optional[Dict]:
        """
        进行战略层分析

        Args:
            market_data: 市场数据摘要
            kline_text: 格式化的K线数据

        Returns:
            dict: {
                'trend': 'bullish/bearish/neutral',
                'strength': 7,
                'key_levels': {...},
                'reasoning': '...',
                'risk_factors': [...],
                'confidence': 85
            }
        """
        logger.info("=" * 60)
        logger.info("开始战略层分析...")

        # 构建prompt
        prompt = self.prompt_builder.build_strategic_prompt(market_data, kline_text)

        # 调用Claude
        response = self.client.chat_json(prompt)

        if not response:
            logger.error("战略层分析失败：Claude未返回有效响应")
            return None

        # 验证响应
        required_keys = ['trend', 'strength', 'key_levels', 'reasoning', 'confidence']
        if not self.client.validate_response(response, required_keys):
            logger.error("战略层响应格式不正确")
            return None

        # 验证字段值
        if response['trend'] not in ['bullish', 'bearish', 'neutral']:
            logger.warning(f"趋势值异常: {response['trend']}, 默认为neutral")
            response['trend'] = 'neutral'

        if not (1 <= response['strength'] <= 10):
            logger.warning(f"强度值异常: {response['strength']}, 调整为5")
            response['strength'] = 5

        if not (0 <= response['confidence'] <= 100):
            logger.warning(f"置信度异常: {response['confidence']}, 调整为50")
            response['confidence'] = 50

        # 保存当前战略
        self.current_strategy = response

        # 输出分析结果
        logger.info("战略层分析完成:")
        logger.info(f"  趋势: {response['trend']}")
        logger.info(f"  强度: {response['strength']}/10")
        logger.info(f"  置信度: {response['confidence']}%")
        logger.info(f"  支撑位: {response['key_levels'].get('support', [])}")
        logger.info(f"  阻力位: {response['key_levels'].get('resistance', [])}")
        logger.info(f"  推理: {response['reasoning'][:100]}...")

        return response

    def get_current_strategy(self) -> Optional[Dict]:
        """获取当前战略判断"""
        return self.current_strategy

    def is_direction_allowed(self, direction: str) -> bool:
        """
        检查交易方向是否符合战略

        Args:
            direction: 'LONG' or 'SHORT'

        Returns:
            bool: 是否允许
        """
        if not self.current_strategy:
            logger.warning("尚无战略判断，默认不允许交易")
            return False

        trend = self.current_strategy.get('trend')

        if trend == 'bullish' and direction == 'LONG':
            return True
        elif trend == 'bearish' and direction == 'SHORT':
            return True
        elif trend == 'neutral':
            # 震荡市可以双向，但要求更高置信度
            logger.info("震荡市，允许交易但需要更高的战术层置信度")
            return True
        else:
            logger.warning(f"战略{trend}与方向{direction}不符，不允许交易")
            return False


if __name__ == "__main__":
    # 测试代码
    from claude_client import ClaudeClient

    client = ClaudeClient()
    agent = StrategicAgent(client)

    # 模拟市场数据
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

    mock_kline = """时间 | 开 | 高 | 低 | 收 | 量
10-11 09:00 | 1840 | 1850 | 1838 | 1848 | 11000
10-11 10:00 | 1848 | 1855 | 1845 | 1852 | 12500
10-11 11:00 | 1852 | 1860 | 1850 | 1858 | 13000"""

    # 执行分析
    result = agent.analyze(mock_market_data, mock_kline)

    if result:
        print("\n战略分析结果:")
        print(f"趋势: {result['trend']}")
        print(f"强度: {result['strength']}/10")
        print(f"置信度: {result['confidence']}%")
        print(f"推理:\n{result['reasoning']}")

        # 测试方向检查
        print(f"\n是否允许开多: {agent.is_direction_allowed('LONG')}")
        print(f"是否允许开空: {agent.is_direction_allowed('SHORT')}")
