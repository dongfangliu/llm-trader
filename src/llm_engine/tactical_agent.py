"""
战术层Agent
负责15分钟级别的具体交易决策
"""

from typing import Optional, Dict, List, Union
from datetime import datetime, timedelta
from loguru import logger

from .claude_client import ClaudeClient
from .openai_client import OpenAIClient
from .prompt_builder import PromptBuilder


class TacticalAgent:
    """战术层决策Agent"""

    def __init__(self,
                 llm_client: Union[ClaudeClient, OpenAIClient],
                 min_confidence: int = 70,
                 min_trade_gap_minutes: int = 30,
                 max_daily_trades: int = 8):
        """
        初始化战术Agent

        Args:
            llm_client: LLM客户端（支持Claude或OpenAI-compatible）
            min_confidence: 最小置信度阈值
            min_trade_gap_minutes: 最小交易间隔（分钟）
            max_daily_trades: 每日最大交易次数
        """
        self.client = llm_client
        self.prompt_builder = PromptBuilder()
        self.min_confidence = min_confidence
        self.min_trade_gap_minutes = min_trade_gap_minutes
        self.max_daily_trades = max_daily_trades

        self.last_trade_time = None
        self.today_trades = 0
        self.today_date = datetime.now().date()

        logger.info(f"战术层Agent初始化: 最小置信度{min_confidence}, 最小间隔{min_trade_gap_minutes}分钟")

    def decide(self,
               market_data: Dict,
               kline_text: str,
               strategic_result: Dict,
               position_info: str,
               account_info: Dict,
               recent_lessons: List[str] = None) -> Optional[Dict]:
        """
        进行战术层决策

        Args:
            market_data: 市场数据
            kline_text: K线文本
            strategic_result: 战略层结论
            position_info: 持仓信息
            account_info: 账户信息
            recent_lessons: 历史经验

        Returns:
            dict: {
                'action': 'open_long/open_short/close_position/hold',
                'quantity': 1,
                'confidence': 85,
                'stop_loss': 1830,
                'take_profit': 1870,
                'reasoning': '...',
                'key_factors': [...]
            }
        """
        logger.info("-" * 60)
        logger.info("开始战术层决策...")

        # 检查是否重置每日计数
        self._check_daily_reset()

        # 检查交易频率限制
        if not self._can_trade():
            logger.warning("交易频率限制，本次跳过")
            return {
                'action': 'hold',
                'quantity': 0,
                'confidence': 0,
                'reasoning': '交易频率限制'
            }

        # 构建prompt
        prompt = self.prompt_builder.build_tactical_prompt(
            market_data=market_data,
            kline_text=kline_text,
            strategic_result=strategic_result,
            position_info=position_info,
            account_info=account_info,
            recent_lessons=recent_lessons or []
        )

        # 调用Claude
        response = self.client.chat_json(prompt)

        if not response:
            logger.error("战术层决策失败：Claude未返回有效响应")
            return None

        # 验证响应
        required_keys = ['action', 'quantity', 'confidence', 'reasoning']
        if not self.client.validate_response(response, required_keys):
            logger.error("战术层响应格式不正确")
            return None

        # 验证action值
        valid_actions = ['open_long', 'open_short', 'close_position', 'hold']
        if response['action'] not in valid_actions:
            logger.warning(f"无效的action: {response['action']}, 默认为hold")
            response['action'] = 'hold'

        # 验证置信度
        if not (0 <= response['confidence'] <= 100):
            logger.warning(f"置信度异常: {response['confidence']}, 调整为50")
            response['confidence'] = 50

        # 应用置信度阈值
        if response['confidence'] < self.min_confidence:
            logger.info(f"置信度{response['confidence']}低于阈值{self.min_confidence}，改为hold")
            response['action'] = 'hold'

        # 验证方向是否符合战略
        if response['action'] in ['open_long', 'open_short']:
            direction = 'LONG' if response['action'] == 'open_long' else 'SHORT'
            trend = strategic_result.get('trend')

            if trend == 'bullish' and direction == 'SHORT':
                logger.warning("战略看多但想开空，不符合战略，改为hold")
                response['action'] = 'hold'
            elif trend == 'bearish' and direction == 'LONG':
                logger.warning("战略看空但想开多，不符合战略，改为hold")
                response['action'] = 'hold'
            elif trend == 'neutral':
                # 震荡市要求更高置信度
                if response['confidence'] < 75:
                    logger.info("震荡市需要更高置信度(≥75)，改为hold")
                    response['action'] = 'hold'

        # 输出决策结果
        logger.info("战术层决策完成:")
        logger.info(f"  操作: {response['action']}")
        logger.info(f"  手数: {response.get('quantity', 0)}")
        logger.info(f"  置信度: {response['confidence']}%")
        logger.info(f"  止损: {response.get('stop_loss')}")
        logger.info(f"  止盈: {response.get('take_profit')}")
        logger.info(f"  推理: {response['reasoning'][:100]}...")

        # 如果要执行交易，更新计数
        if response['action'] in ['open_long', 'open_short', 'close_position']:
            self.last_trade_time = datetime.now()
            self.today_trades += 1
            logger.info(f"今日交易次数: {self.today_trades}/{self.max_daily_trades}")

        return response

    def _check_daily_reset(self):
        """检查是否需要重置每日计数"""
        today = datetime.now().date()
        if today != self.today_date:
            logger.info(f"新的一天，重置交易计数")
            self.today_date = today
            self.today_trades = 0
            self.last_trade_time = None

    def _can_trade(self) -> bool:
        """检查是否可以交易"""
        # 检查每日交易次数
        if self.today_trades >= self.max_daily_trades:
            logger.warning(f"今日交易次数已达上限({self.max_daily_trades})")
            return False

        # 检查最小交易间隔
        if self.last_trade_time:
            elapsed = datetime.now() - self.last_trade_time
            required_gap = timedelta(minutes=self.min_trade_gap_minutes)

            if elapsed < required_gap:
                remaining = (required_gap - elapsed).total_seconds() / 60
                logger.info(f"距上次交易仅{elapsed.total_seconds()/60:.1f}分钟，需等待{remaining:.1f}分钟")
                return False

        return True

    def get_stats(self) -> Dict:
        """获取统计信息"""
        return {
            'today_trades': self.today_trades,
            'max_daily_trades': self.max_daily_trades,
            'can_trade': self._can_trade(),
            'last_trade_time': self.last_trade_time.isoformat() if self.last_trade_time else None
        }


if __name__ == "__main__":
    # 测试代码
    from claude_client import ClaudeClient

    client = ClaudeClient()
    agent = TacticalAgent(client, min_confidence=70, min_trade_gap_minutes=30)

    # 模拟数据
    mock_market_data = {
        'current_price': 1850,
        'ma5': 1845,
        'ma10': 1840,
        'macd': 5.2,
        'macd_signal': 3.8,
        'macd_hist': 1.4,
        'rsi': 62.5,
        'bb_upper': 1870,
        'bb_middle': 1845,
        'bb_lower': 1820,
        'volume': 12000,
        'volume_ratio': 115.3
    }

    mock_kline = """时间 | 开 | 高 | 低 | 收
10-11 14:00 | 1840 | 1850 | 1838 | 1848
10-11 14:15 | 1848 | 1855 | 1845 | 1852"""

    mock_strategic = {
        'trend': 'bullish',
        'strength': 7,
        'key_levels': {'resistance': [1880, 1900], 'support': [1820, 1800]},
        'reasoning': '价格突破MA20，MACD金叉，量能放大，短期看多。',
        'confidence': 80
    }

    mock_position = "当前空仓"
    mock_account = {'balance': 48500, 'today_pnl': -150, 'today_trades': 2}
    mock_lessons = ["震荡市中减少交易频率", "等待RSI<50再开多"]

    # 执行决策
    result = agent.decide(
        market_data=mock_market_data,
        kline_text=mock_kline,
        strategic_result=mock_strategic,
        position_info=mock_position,
        account_info=mock_account,
        recent_lessons=mock_lessons
    )

    if result:
        print("\n战术决策结果:")
        print(f"操作: {result['action']}")
        print(f"置信度: {result['confidence']}%")
        print(f"推理:\n{result['reasoning']}")

    print(f"\n统计信息: {agent.get_stats()}")
