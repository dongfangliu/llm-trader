"""
风险控制规则引擎
硬编码的风控规则，不依赖LLM
"""

from typing import Dict, List, Tuple, Optional
from dataclasses import dataclass
from loguru import logger

import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from trading.account import Account, Position


@dataclass
class RiskConfig:
    """风控配置"""
    stop_loss_amount: float = -500  # 单笔止损金额
    max_drawdown: float = 0.10      # 最大回撤比例
    max_hold_hours: float = 8       # 最大持仓时间(小时)
    volatility_threshold: float = 0.03  # 异常波动阈值
    daily_max_loss: float = -1000   # 每日最大亏损
    max_position: int = 2           # 最大持仓手数


class RiskController:
    """风险控制器"""

    def __init__(self, config: RiskConfig = None):
        """
        初始化风控器

        Args:
            config: 风控配置
        """
        self.config = config or RiskConfig()
        logger.info("风险控制器初始化:")
        logger.info(f"  单笔止损: {self.config.stop_loss_amount}")
        logger.info(f"  最大回撤: {self.config.max_drawdown * 100}%")
        logger.info(f"  最大持仓时间: {self.config.max_hold_hours}小时")
        logger.info(f"  每日最大亏损: {self.config.daily_max_loss}")

    def check_all(self,
                  account: Account,
                  market_data: Dict) -> List[Tuple[str, str, Optional[Position]]]:
        """
        执行所有风控检查

        Args:
            account: 账户对象
            market_data: 市场数据

        Returns:
            list: [(action, reason, position), ...]
            action: 'FORCE_CLOSE', 'STOP_TRADING', 'WARNING', 'OK'
        """
        actions = []

        # 更新账户权益
        current_price = market_data.get('current_price', 0)
        account.update_equity({'SA0': current_price})

        # 1. 检查账户级风控
        account_action = self._check_account_level(account)
        if account_action[0] != 'OK':
            actions.append(account_action)

        # 2. 检查每个持仓
        for position in account.positions[:]:
            pos_action = self._check_position_level(position, market_data)
            if pos_action[0] != 'OK':
                actions.append(pos_action)

        # 3. 检查市场异常
        market_action = self._check_market_level(market_data)
        if market_action[0] != 'OK':
            actions.append(market_action)

        return actions

    def _check_account_level(self, account: Account) -> Tuple[str, str, None]:
        """检查账户级风控"""
        # 规则1: 最大回撤
        if account.drawdown > self.config.max_drawdown:
            logger.error(f"触发最大回撤: {account.drawdown*100:.2f}%")
            return ('FORCE_CLOSE', f'账户回撤{account.drawdown*100:.2f}%超过{self.config.max_drawdown*100}%', None)

        # 规则2: 每日最大亏损
        if account.today_pnl < self.config.daily_max_loss:
            logger.error(f"触发每日最大亏损: {account.today_pnl}")
            return ('STOP_TRADING', f'今日亏损{account.today_pnl}元超过{self.config.daily_max_loss}元', None)

        # 规则3: 总持仓限制
        if account.total_position > self.config.max_position:
            logger.warning(f"持仓{account.total_position}手超过限制{self.config.max_position}手")
            return ('WARNING', f'持仓超限', None)

        # 回撤预警（80%阈值）
        if account.drawdown > self.config.max_drawdown * 0.8:
            logger.warning(f"回撤预警: {account.drawdown*100:.2f}%")
            return ('WARNING', f'回撤接近限制', None)

        return ('OK', '', None)

    def _check_position_level(self,
                              position: Position,
                              market_data: Dict) -> Tuple[str, str, Position]:
        """检查持仓级风控"""
        current_price = market_data.get('current_price', 0)
        position.update_price(current_price)

        # 规则1: 单笔止损
        if position.unrealized_pnl < self.config.stop_loss_amount:
            logger.error(f"触发止损: 持仓亏损{position.unrealized_pnl}")
            return ('FORCE_CLOSE', f'止损触发(亏损{position.unrealized_pnl})', position)

        # 规则2: 持仓时间
        if position.hold_hours > self.config.max_hold_hours:
            logger.warning(f"持仓时间过长: {position.hold_hours:.1f}小时")
            return ('FORCE_CLOSE', f'持仓{position.hold_hours:.1f}小时超过{self.config.max_hold_hours}小时', position)

        # 规则3: 止损价触发
        if position.should_stop_loss():
            logger.error(f"触发止损价: {position.stop_loss}")
            return ('FORCE_CLOSE', f'价格触及止损位{position.stop_loss}', position)

        # 规则4: 止盈价触发
        if position.should_take_profit():
            logger.info(f"触发止盈价: {position.take_profit}")
            return ('FORCE_CLOSE', f'价格触及止盈位{position.take_profit}', position)

        # 单笔亏损预警（80%阈值）
        if position.unrealized_pnl < self.config.stop_loss_amount * 0.8:
            logger.warning(f"亏损预警: {position.unrealized_pnl}")
            return ('WARNING', f'浮亏接近止损位', position)

        return ('OK', '', position)

    def _check_market_level(self, market_data: Dict) -> Tuple[str, str, None]:
        """检查市场级风控"""
        volatility = market_data.get('volatility', 0)

        # 规则1: 异常波动
        if volatility > self.config.volatility_threshold:
            logger.warning(f"市场异常波动: {volatility*100:.2f}%")
            return ('WARNING', f'市场波动{volatility*100:.2f}%超过{self.config.volatility_threshold*100}%', None)

        return ('OK', '', None)

    def can_open_position(self,
                          account: Account,
                          direction: str,
                          quantity: int,
                          price: float) -> Tuple[bool, str]:
        """
        检查是否允许开仓

        Args:
            account: 账户
            direction: 方向
            quantity: 手数
            price: 价格

        Returns:
            (bool, str): (是否允许, 原因)
        """
        # 1. 检查持仓限制
        if account.total_position + quantity > self.config.max_position:
            return False, f"超过最大持仓限制{self.config.max_position}手"

        # 2. 检查资金是否足够
        if not account.can_open_position(price, quantity):
            return False, "可用资金不足"

        # 3. 检查今日是否已触发止损
        if account.today_pnl < self.config.daily_max_loss:
            return False, "今日已触发止损，停止交易"

        # 4. 检查回撤是否过大
        if account.drawdown > self.config.max_drawdown:
            return False, f"账户回撤{account.drawdown*100:.2f}%超限"

        return True, "风控检查通过"

    def calculate_stop_loss(self,
                            direction: str,
                            entry_price: float,
                            loss_amount: float = None) -> float:
        """
        计算止损价位

        Args:
            direction: 'LONG' or 'SHORT'
            entry_price: 入场价格
            loss_amount: 止损金额（默认使用配置）

        Returns:
            float: 止损价位
        """
        if loss_amount is None:
            loss_amount = abs(self.config.stop_loss_amount)

        # 纯碱：1手=5吨，1tick=1元
        # 假设1手止损
        quantity = 1
        multiplier = 5

        # 计算止损点数
        ticks = loss_amount / (quantity * multiplier)

        if direction == 'LONG':
            stop_loss = entry_price - ticks
        else:  # SHORT
            stop_loss = entry_price + ticks

        return round(stop_loss, 0)  # 纯碱价格取整

    def get_risk_summary(self, account: Account) -> Dict:
        """获取风险摘要"""
        return {
            'drawdown': round(account.drawdown * 100, 2),
            'drawdown_limit': self.config.max_drawdown * 100,
            'drawdown_usage': round(account.drawdown / self.config.max_drawdown * 100, 1),
            'today_pnl': account.today_pnl,
            'daily_loss_limit': self.config.daily_max_loss,
            'loss_usage': round(account.today_pnl / self.config.daily_max_loss * 100, 1) if self.config.daily_max_loss < 0 else 0,
            'total_position': account.total_position,
            'max_position': self.config.max_position,
            'position_usage': round(account.total_position / self.config.max_position * 100, 1),
            'risk_level': self._calculate_risk_level(account)
        }

    def _calculate_risk_level(self, account: Account) -> str:
        """计算风险等级"""
        drawdown_ratio = account.drawdown / self.config.max_drawdown
        loss_ratio = abs(account.today_pnl / self.config.daily_max_loss) if account.today_pnl < 0 else 0

        max_ratio = max(drawdown_ratio, loss_ratio)

        if max_ratio < 0.5:
            return "低风险"
        elif max_ratio < 0.8:
            return "中等风险"
        else:
            return "高风险"


if __name__ == "__main__":
    # 测试代码
    from trading.account import Account

    # 创建账户
    account = Account(initial_capital=50000)

    # 开仓
    account.open_position('LONG', price=1850, quantity=1, stop_loss=1830)

    # 创建风控器
    risk_controller = RiskController()

    # 模拟市场数据
    market_data = {
        'current_price': 1820,  # 亏损中
        'volatility': 0.02
    }

    # 执行风控检查
    print("=== 风控检查 ===")
    actions = risk_controller.check_all(account, market_data)

    for action, reason, position in actions:
        print(f"动作: {action}")
        print(f"原因: {reason}")
        if position:
            print(f"持仓: {position.direction} {position.quantity}手, 浮盈{position.unrealized_pnl}")
        print()

    # 风险摘要
    print("=== 风险摘要 ===")
    summary = risk_controller.get_risk_summary(account)
    for key, value in summary.items():
        print(f"{key}: {value}")

    # 测试是否可以开仓
    print("\n=== 开仓检查 ===")
    can_open, reason = risk_controller.can_open_position(account, 'LONG', 1, 1850)
    print(f"是否允许开仓: {can_open}")
    print(f"原因: {reason}")

    # 计算止损价
    print("\n=== 止损计算 ===")
    stop_loss = risk_controller.calculate_stop_loss('LONG', 1850)
    print(f"多单入场1850，止损价: {stop_loss}")
