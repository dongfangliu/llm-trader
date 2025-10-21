"""
TqSDK交易执行器
基于TqSDK的真实/模拟交易执行
"""

import time
import uuid
from datetime import datetime
from typing import Dict, Optional
from loguru import logger

from .account import Account, Position


class TqSdkExecutor:
    """TqSDK交易执行器"""

    def __init__(self,
                 account: Account,
                 tqsdk_api,
                 commission_rate: float = 0.00002):
        """
        初始化TqSDK执行器

        Args:
            account: 交易账户（用于本地状态跟踪）
            tqsdk_api: TqSDK的API实例
            commission_rate: 手续费率
        """
        self.account = account
        self.api = tqsdk_api
        self.commission_rate = commission_rate

        logger.info(f"TqSDK执行器初始化: 手续费{commission_rate}")

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
                     symbol: str,
                     quantity: int = 1,
                     stop_loss: Optional[float] = None,
                     take_profit: Optional[float] = None) -> Optional[Dict]:
        """
        执行开仓

        Args:
            direction: 'LONG' or 'SHORT'
            market_price: 市场价格（用于本地计算，实际以成交价为准）
            symbol: 合约代码（如 CZCE.SA0）
            quantity: 手数
            stop_loss: 止损价
            take_profit: 止盈价

        Returns:
            dict: 成交信息，失败返回None
        """
        logger.info(f"执行开仓: {direction} {quantity}手 @ 市价{market_price}")

        try:
            # 转换为TqSDK的方向和开平标志
            if direction == 'LONG':
                tq_direction = "BUY"
            else:
                tq_direction = "SELL"

            # 检查资金是否足够
            if not self.account.can_open_position(market_price, quantity):
                logger.error("开仓失败：资金不足")
                return None

            # 下单（TqSDK会自动处理市价单）
            order = self.api.insert_order(
                symbol=symbol,
                direction=tq_direction,
                offset="OPEN",
                volume=quantity
            )

            # 等待订单成交
            while True:
                self.api.wait_update()
                if order.status == "FINISHED":
                    # 订单完成
                    break
                elif order.status in ["ALIVE", "QUEUING"]:
                    # 订单还在进行中
                    continue
                else:
                    # 订单失败
                    logger.error(f"订单状态异常: {order.status}")
                    return None

            # 获取成交信息
            fill_price = order.trade_price if order.trade_price else market_price
            actual_quantity = order.volume_orign - order.volume_left

            if actual_quantity <= 0:
                logger.error("开仓失败：未成交")
                return None

            # 计算手续费
            commission = self._calculate_commission(fill_price, actual_quantity)

            # 执行开仓（更新本地账户状态）
            success = self.account.open_position(
                direction=direction,
                price=fill_price,
                quantity=actual_quantity,
                stop_loss=stop_loss,
                take_profit=take_profit
            )

            if not success:
                logger.error("更新本地账户失败")
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
                'quantity': actual_quantity,
                'commission': commission,
                'stop_loss': stop_loss,
                'take_profit': take_profit,
                'slippage': fill_price - market_price if direction == 'LONG' else market_price - fill_price,
                'order_id': order.order_id
            }

            logger.info(f"开仓成功: {result}")
            return result

        except Exception as e:
            logger.error(f"开仓执行失败: {e}")
            import traceback
            logger.debug(traceback.format_exc())
            return None

    def execute_close(self,
                      position: Position,
                      market_price: float,
                      symbol: str) -> Optional[Dict]:
        """
        执行平仓

        Args:
            position: 持仓对象
            market_price: 市场价格
            symbol: 合约代码

        Returns:
            dict: 成交信息
        """
        logger.info(f"执行平仓: {position.direction} {position.quantity}手 @ 市价{market_price}")

        try:
            # 转换为TqSDK的方向（平仓方向与开仓相反）
            if position.direction == 'LONG':
                tq_direction = "SELL"
            else:
                tq_direction = "BUY"

            # 下单平仓
            order = self.api.insert_order(
                symbol=symbol,
                direction=tq_direction,
                offset="CLOSE",
                volume=position.quantity
            )

            # 等待订单成交
            while True:
                self.api.wait_update()
                if order.status == "FINISHED":
                    break
                elif order.status in ["ALIVE", "QUEUING"]:
                    continue
                else:
                    logger.error(f"订单状态异常: {order.status}")
                    return None

            # 获取成交信息
            fill_price = order.trade_price if order.trade_price else market_price
            actual_quantity = order.volume_orign - order.volume_left

            if actual_quantity <= 0:
                logger.error("平仓失败：未成交")
                return None

            # 计算手续费
            commission = self._calculate_commission(fill_price, actual_quantity)

            # 执行平仓（更新本地账户状态）
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
                'quantity': actual_quantity,
                'commission': commission,
                'pnl': pnl,
                'hold_hours': position.hold_hours,
                'slippage': fill_price - market_price if position.direction == 'SHORT' else market_price - fill_price,
                'order_id': order.order_id
            }

            logger.info(f"平仓成功: {result}")
            return result

        except Exception as e:
            logger.error(f"平仓执行失败: {e}")
            import traceback
            logger.debug(traceback.format_exc())
            return None

    def execute_close_all(self, market_price: float, symbol: str) -> list:
        """
        平掉所有持仓

        Args:
            market_price: 市场价格
            symbol: 合约代码

        Returns:
            list: 所有成交信息
        """
        results = []

        for position in self.account.positions[:]:
            result = self.execute_close(position, market_price, symbol)
            if result:
                results.append(result)

        logger.info(f"全部平仓完成，共{len(results)}笔")
        return results

    def check_stop_conditions(self, current_price: float, symbol: str) -> list:
        """
        检查所有持仓的止损止盈条件

        Args:
            current_price: 当前市场价格
            symbol: 合约代码

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
                result = self.execute_close(position, current_price, symbol)
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
    print("TqSDK执行器需要在完整的交易系统环境中测试")
    print("请使用 main.py 启动完整系统进行测试")
