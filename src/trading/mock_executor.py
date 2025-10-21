"""
模拟交易执行器
模拟真实交易的滑点、延迟、手续费等
"""

import time
import random
import uuid
from datetime import datetime
from typing import Dict, Optional
from loguru import logger

from .account import Account, Position


class MockExecutor:
    """模拟交易执行器"""

    def __init__(self,
                 account: Account,
                 slippage_ticks: int = 2,
                 commission_rate: float = 0.00002,
                 delay_range: tuple = (0.05, 0.2)):
        """
        初始化模拟执行器

        Args:
            account: 交易账户
            slippage_ticks: 滑点tick数，纯碱1tick=1元
            commission_rate: 手续费率
            delay_range: 延迟范围(秒)
        """
        self.account = account
        self.slippage_ticks = slippage_ticks
        self.commission_rate = commission_rate
        self.delay_range = delay_range

        logger.info(f"模拟执行器初始化: 滑点{slippage_ticks}tick, 手续费{commission_rate}")

    def _simulate_delay(self):
        """模拟网络延迟"""
        delay = random.uniform(*self.delay_range)
        time.sleep(delay)

    def _calculate_slippage(self, direction: str, base_price: float) -> float:
        """
        计算滑点后的成交价

        Args:
            direction: 'BUY' or 'SELL'
            base_price: 基准价格

        Returns:
            float: 实际成交价
        """
        # 随机滑点（1到slippage_ticks之间）
        slippage = random.randint(1, self.slippage_ticks)

        if direction == 'BUY':
            # 买入滑点向上
            fill_price = base_price + slippage
        else:  # SELL
            # 卖出滑点向下
            fill_price = base_price - slippage

        logger.debug(f"{direction} 滑点: {slippage}tick, 成交价: {fill_price}")
        return fill_price

    def _calculate_commission(self, price: float, quantity: int) -> float:
        """
        计算手续费

        Args:
            price: 成交价
            quantity: 手数

        Returns:
            float: 手续费金额
        """
        # 手续费 = 成交金额 × 手续费率
        # 纯碱: 1手=5吨
        commission = price * quantity * 5 * self.commission_rate
        return round(commission, 2)

    def execute_open(self,
                     direction: str,
                     market_price: float,
                     quantity: int = 1,
                     stop_loss: Optional[float] = None,
                     take_profit: Optional[float] = None) -> Optional[Dict]:
        """
        执行开仓

        Args:
            direction: 'LONG' or 'SHORT'
            market_price: 市场价格
            quantity: 手数
            stop_loss: 止损价
            take_profit: 止盈价

        Returns:
            dict: 成交信息，失败返回None
        """
        logger.info(f"执行开仓: {direction} {quantity}手 @ 市价{market_price}")

        # 模拟延迟
        self._simulate_delay()

        # 计算滑点
        if direction == 'LONG':
            fill_price = self._calculate_slippage('BUY', market_price)
        else:
            fill_price = self._calculate_slippage('SELL', market_price)

        # 计算手续费
        commission = self._calculate_commission(fill_price, quantity)

        # 检查资金是否足够（包含手续费）
        if not self.account.can_open_position(fill_price, quantity):
            logger.error("开仓失败：资金不足")
            return None

        # 执行开仓
        success = self.account.open_position(
            direction=direction,
            price=fill_price,
            quantity=quantity,
            stop_loss=stop_loss,
            take_profit=take_profit
        )

        if not success:
            return None

        # 扣除手续费
        self.account.balance -= commission

        # 生成交易ID
        trade_id = f"OPEN_{direction}_{uuid.uuid4().hex[:8]}"

        result = {
            'trade_id': trade_id,
            'timestamp': datetime.now(),
            'direction': direction,
            'action': 'OPEN',
            'market_price': market_price,
            'fill_price': fill_price,
            'quantity': quantity,
            'commission': commission,
            'stop_loss': stop_loss,
            'take_profit': take_profit,
            'slippage': fill_price - market_price if direction == 'LONG' else market_price - fill_price
        }

        logger.info(f"开仓成功: {result}")
        return result

    def execute_close(self, position: Position, market_price: float) -> Optional[Dict]:
        """
        执行平仓

        Args:
            position: 持仓对象
            market_price: 市场价格

        Returns:
            dict: 成交信息
        """
        logger.info(f"执行平仓: {position.direction} {position.quantity}手 @ 市价{market_price}")

        # 模拟延迟
        self._simulate_delay()

        # 计算滑点（平仓方向与开仓相反）
        if position.direction == 'LONG':
            fill_price = self._calculate_slippage('SELL', market_price)
        else:
            fill_price = self._calculate_slippage('BUY', market_price)

        # 计算手续费
        commission = self._calculate_commission(fill_price, position.quantity)

        # 执行平仓
        pnl = self.account.close_position(position, fill_price, commission)

        # 生成交易ID
        trade_id = f"CLOSE_{position.direction}_{uuid.uuid4().hex[:8]}"

        result = {
            'trade_id': trade_id,
            'timestamp': datetime.now(),
            'direction': position.direction,
            'action': 'CLOSE',
            'open_price': position.open_price,
            'market_price': market_price,
            'fill_price': fill_price,
            'quantity': position.quantity,
            'commission': commission,
            'pnl': pnl,
            'hold_hours': position.hold_hours,
            'slippage': fill_price - market_price if position.direction == 'SHORT' else market_price - fill_price
        }

        logger.info(f"平仓成功: {result}")
        return result

    def execute_close_all(self, market_price: float) -> list:
        """
        平掉所有持仓

        Args:
            market_price: 市场价格

        Returns:
            list: 所有成交信息
        """
        results = []

        for position in self.account.positions[:]:
            result = self.execute_close(position, market_price)
            if result:
                results.append(result)

        logger.info(f"全部平仓完成，共{len(results)}笔")
        return results

    def check_stop_conditions(self, current_price: float) -> list:
        """
        检查所有持仓的止损止盈条件

        Args:
            current_price: 当前市场价格

        Returns:
            list: 触发条件的平仓记录
        """
        triggered = []

        for position in self.account.positions[:]:
            position.update_price(current_price)

            reason = None

            if position.should_stop_loss():
                reason = "止损触发"
            elif position.should_take_profit():
                reason = "止盈触发"

            if reason:
                logger.warning(f"{reason}: {position.direction} @ {current_price}")
                result = self.execute_close(position, current_price)
                if result:
                    result['close_reason'] = reason
                    triggered.append(result)

        return triggered

    def get_status(self) -> Dict:
        """获取执行器状态"""
        return {
            'account_summary': self.account.get_summary(),
            'positions': [
                {
                    'direction': pos.direction,
                    'quantity': pos.quantity,
                    'open_price': pos.open_price,
                    'current_price': pos.current_price,
                    'unrealized_pnl': pos.unrealized_pnl,
                    'hold_hours': round(pos.hold_hours, 2),
                    'stop_loss': pos.stop_loss,
                    'take_profit': pos.take_profit
                }
                for pos in self.account.positions
            ]
        }


if __name__ == "__main__":
    # 测试代码
    from account import Account

    account = Account(initial_capital=50000)
    executor = MockExecutor(account, slippage_ticks=2, commission_rate=0.00002)

    print("=== 初始状态 ===")
    print(executor.get_status())

    # 测试开多仓
    print("\n=== 开多仓 ===")
    result = executor.execute_open('LONG', market_price=1850, quantity=1, stop_loss=1830)
    print(result)

    # 更新价格
    account.update_equity({'SA0': 1860})

    print("\n=== 持仓中 ===")
    print(executor.get_status())

    # 测试平仓
    print("\n=== 平仓 ===")
    if account.positions:
        result = executor.execute_close(account.positions[0], market_price=1860)
        print(result)

    print("\n=== 最终状态 ===")
    print(executor.get_status())

    # 测试止损
    print("\n=== 测试止损 ===")
    executor.execute_open('LONG', market_price=1850, quantity=1, stop_loss=1830)
    account.update_equity({'SA0': 1825})

    triggered = executor.check_stop_conditions(1825)
    print(f"触发止损: {triggered}")

    print("\n=== 最终账户 ===")
    print(account.get_summary())
