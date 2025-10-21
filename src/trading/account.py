"""
账户管理模块
管理虚拟账户的资金、持仓、权益等
"""

from dataclasses import dataclass, field
from typing import Optional, List
from datetime import datetime
from loguru import logger


@dataclass
class Position:
    """持仓信息"""
    direction: str  # 'LONG' or 'SHORT'
    quantity: int   # 手数
    open_price: float  # 开仓价格
    open_time: datetime  # 开仓时间
    current_price: float = 0.0  # 当前价格
    stop_loss: Optional[float] = None  # 止损价
    take_profit: Optional[float] = None  # 止盈价

    @property
    def unrealized_pnl(self) -> float:
        """未实现盈亏"""
        if self.current_price == 0:
            return 0.0

        # 纯碱期货：1手=5吨，最小变动价位1元/吨
        multiplier = 5  # 每手乘数
        tick_size = 1   # 最小变动价位

        if self.direction == 'LONG':
            pnl = (self.current_price - self.open_price) * self.quantity * multiplier
        else:  # SHORT
            pnl = (self.open_price - self.current_price) * self.quantity * multiplier

        return round(pnl, 2)

    @property
    def hold_hours(self) -> float:
        """持仓时间（小时）"""
        return (datetime.now() - self.open_time).total_seconds() / 3600

    def update_price(self, price: float):
        """更新当前价格"""
        self.current_price = price

    def should_stop_loss(self) -> bool:
        """是否触发止损"""
        if self.stop_loss is None:
            return False

        if self.direction == 'LONG':
            return self.current_price <= self.stop_loss
        else:
            return self.current_price >= self.stop_loss

    def should_take_profit(self) -> bool:
        """是否触发止盈"""
        if self.take_profit is None:
            return False

        if self.direction == 'LONG':
            return self.current_price >= self.take_profit
        else:
            return self.current_price <= self.take_profit


@dataclass
class Account:
    """交易账户"""
    initial_capital: float  # 初始资金
    balance: float = field(init=False)  # 可用资金
    equity: float = field(init=False)   # 账户权益
    positions: List[Position] = field(default_factory=list)  # 持仓列表
    today_pnl: float = 0.0  # 今日盈亏
    total_pnl: float = 0.0  # 累计盈亏
    max_equity: float = field(init=False)  # 最大权益（用于计算回撤）
    total_trades: int = 0   # 累计交易次数
    win_trades: int = 0     # 盈利交易次数

    def __post_init__(self):
        self.balance = self.initial_capital
        self.equity = self.initial_capital
        self.max_equity = self.initial_capital

    @property
    def total_position(self) -> int:
        """总持仓手数"""
        return sum(pos.quantity for pos in self.positions)

    @property
    def unrealized_pnl(self) -> float:
        """未实现盈亏"""
        return sum(pos.unrealized_pnl for pos in self.positions)

    @property
    def drawdown(self) -> float:
        """当前回撤比例"""
        if self.max_equity == 0:
            return 0.0
        return (self.max_equity - self.equity) / self.max_equity

    @property
    def win_rate(self) -> float:
        """胜率"""
        if self.total_trades == 0:
            return 0.0
        return (self.win_trades / self.total_trades) * 100

    def update_equity(self, current_prices: dict):
        """
        更新账户权益

        Args:
            current_prices: {'symbol': price}
        """
        # 更新所有持仓的当前价格
        for pos in self.positions:
            if 'SA0' in current_prices:
                pos.update_price(current_prices['SA0'])

        # 计算权益 = 可用资金 + 未实现盈亏
        self.equity = self.balance + self.unrealized_pnl

        # 更新最大权益
        if self.equity > self.max_equity:
            self.max_equity = self.equity

    def can_open_position(self, price: float, quantity: int = 1) -> bool:
        """
        检查是否有足够资金开仓

        Args:
            price: 开仓价格
            quantity: 开仓手数

        Returns:
            bool: 是否可以开仓
        """
        # 纯碱期货保证金比例约10%，每手5吨
        margin_rate = 0.10
        required_margin = price * quantity * 5 * margin_rate

        if self.balance < required_margin:
            logger.warning(f"资金不足，需要{required_margin}，可用{self.balance}")
            return False

        return True

    def open_position(self,
                      direction: str,
                      price: float,
                      quantity: int = 1,
                      stop_loss: Optional[float] = None,
                      take_profit: Optional[float] = None) -> bool:
        """
        开仓

        Args:
            direction: 'LONG' or 'SHORT'
            price: 开仓价格
            quantity: 手数
            stop_loss: 止损价
            take_profit: 止盈价

        Returns:
            bool: 是否成功
        """
        if not self.can_open_position(price, quantity):
            return False

        # 创建持仓
        position = Position(
            direction=direction,
            quantity=quantity,
            open_price=price,
            open_time=datetime.now(),
            current_price=price,
            stop_loss=stop_loss,
            take_profit=take_profit
        )

        self.positions.append(position)

        # 扣除保证金
        margin_rate = 0.10
        margin = price * quantity * 5 * margin_rate
        self.balance -= margin

        logger.info(f"开仓成功: {direction} {quantity}手 @ {price}, 保证金{margin:.2f}")
        return True

    def close_position(self, position: Position, price: float, commission: float = 0.0) -> float:
        """
        平仓

        Args:
            position: 持仓对象
            price: 平仓价格
            commission: 手续费

        Returns:
            float: 实现盈亏
        """
        if position not in self.positions:
            logger.error("持仓不存在")
            return 0.0

        # 更新价格并计算盈亏
        position.update_price(price)
        pnl = position.unrealized_pnl - commission

        # 返还保证金
        margin_rate = 0.10
        margin = position.open_price * position.quantity * 5 * margin_rate
        self.balance += margin + pnl

        # 更新统计
        self.total_pnl += pnl
        self.today_pnl += pnl
        self.total_trades += 1

        if pnl > 0:
            self.win_trades += 1

        # 移除持仓
        self.positions.remove(position)

        logger.info(f"平仓成功: {position.direction} {position.quantity}手 @ {price}, 盈亏{pnl:.2f}")
        return pnl

    def close_all_positions(self, price: float, commission: float = 0.0) -> float:
        """
        平掉所有持仓

        Args:
            price: 平仓价格
            commission: 每手手续费

        Returns:
            float: 总盈亏
        """
        total_pnl = 0.0

        for position in self.positions[:]:  # 复制列表以避免迭代时修改
            pnl = self.close_position(position, price, commission)
            total_pnl += pnl

        logger.info(f"全部平仓，总盈亏{total_pnl:.2f}")
        return total_pnl

    def reset_daily_stats(self):
        """重置每日统计"""
        self.today_pnl = 0.0
        logger.info("每日统计已重置")

    def get_summary(self) -> dict:
        """获取账户摘要"""
        return {
            'balance': round(self.balance, 2),
            'equity': round(self.equity, 2),
            'unrealized_pnl': round(self.unrealized_pnl, 2),
            'today_pnl': round(self.today_pnl, 2),
            'total_pnl': round(self.total_pnl, 2),
            'total_position': self.total_position,
            'drawdown': round(self.drawdown * 100, 2),
            'win_rate': round(self.win_rate, 2),
            'total_trades': self.total_trades,
            'win_trades': self.win_trades
        }


if __name__ == "__main__":
    # 测试代码
    account = Account(initial_capital=50000)

    print("初始账户:")
    print(account.get_summary())

    # 开多仓
    account.open_position('LONG', price=1850, quantity=1, stop_loss=1830)

    # 更新价格
    account.update_equity({'SA0': 1860})

    print("\n开仓后:")
    print(account.get_summary())
    print(f"持仓: {account.positions}")

    # 平仓
    if account.positions:
        pnl = account.close_position(account.positions[0], price=1860, commission=10)
        print(f"\n平仓盈亏: {pnl}")

    print("\n平仓后:")
    print(account.get_summary())
