"""
Iceberg Order 冰山订单
将大单拆分为多个小单，逐步下单以隐藏真实交易意图
"""

from datetime import datetime
from typing import List, Dict, Optional
from loguru import logger


class IcebergOrder:
    """冰山订单 - 隐藏大单真实规模"""

    def __init__(self,
                 symbol: str,
                 direction: str,  # 'buy' or 'sell'
                 total_volume: int,
                 visible_size: int = 1,
                 max_retry: int = 3):
        """
        初始化冰山订单
        
        Args:
            symbol: 合约代码
            direction: 方向 'buy'/'sell'
            total_volume: 总手数
            visible_size: 每次显示手数（默认1手）
            max_retry: 最大重试次数
        """
        self.symbol = symbol
        self.direction = direction
        self.total_volume = total_volume
        self.visible_size = visible_size
        self.max_retry = max_retry
        
        # 计算需要的订单数量
        self.num_orders = (total_volume + visible_size - 1) // visible_size
        
        # 执行状态
        self.executed_volume = 0
        self.active_order: Optional[Dict] = None
        self.order_history: List[Dict] = []
        self.start_time: Optional[datetime] = None
        self.end_time: Optional[datetime] = None
        self.status = 'pending'  # pending, executing, completed, cancelled
        
        logger.info(
            f"冰山订单初始化: {symbol} {direction} 总量{total_volume}手, "
            f"每次显示{visible_size}手, 需要{self.num_orders}次下单"
        )

    def start(self):
        """开始执行冰山订单"""
        self.start_time = datetime.now()
        self.status = 'executing'
        logger.info(f"冰山订单开始执行")

    def generate_next_order(self) -> Optional[Dict]:
        """
        生成下一个子订单
        
        Returns:
            Optional[Dict]: 下一个订单，若已完成则返回None
        """
        if self.status != 'executing':
            return None
            
        remaining = self.total_volume - self.executed_volume
        
        if remaining <= 0:
            self.complete()
            return None
        
        # 计算本次订单手数
        volume = min(remaining, self.visible_size)
        
        order = {
            'order_id': f"ICE_{len(self.order_history)+1}",
            'symbol': self.symbol,
            'direction': self.direction,
            'volume': volume,
            'status': 'pending',
            'submit_time': datetime.now(),
            'actual_price': None,
            'fill_time': None,
            'retry_count': 0
        }
        
        self.active_order = order
        logger.info(f"冰山订单生成子单: {order['order_id']} {volume}手")
        
        return order

    def mark_order_filled(self, order_id: str, fill_price: float, fill_volume: int):
        """
        标记订单已成交
        
        Args:
            order_id: 订单ID
            fill_price: 成交价格
            fill_volume: 成交手数
        """
        if self.active_order and self.active_order['order_id'] == order_id:
            self.active_order['status'] = 'filled'
            self.active_order['actual_price'] = fill_price
            self.active_order['fill_time'] = datetime.now()
            
            self.executed_volume += fill_volume
            self.order_history.append(self.active_order)
            
            logger.info(
                f"冰山子订单成交: {order_id} {fill_volume}手@{fill_price}, "
                f"进度{self.executed_volume}/{self.total_volume}"
            )
            
            # 清空当前订单，准备下一个
            self.active_order = None
            
            # 检查是否全部完成
            if self.executed_volume >= self.total_volume:
                self.complete()

    def mark_order_failed(self, order_id: str, reason: str) -> bool:
        """
        标记订单失败
        
        Args:
            order_id: 订单ID
            reason: 失败原因
            
        Returns:
            bool: 是否可以重试
        """
        if self.active_order and self.active_order['order_id'] == order_id:
            self.active_order['retry_count'] += 1
            
            if self.active_order['retry_count'] >= self.max_retry:
                # 超过重试次数，放弃
                self.active_order['status'] = 'failed'
                self.active_order['failure_reason'] = reason
                self.order_history.append(self.active_order)
                self.active_order = None
                
                logger.error(f"冰山子订单失败(超过重试): {order_id} - {reason}")
                return False
            else:
                logger.warning(
                    f"冰山子订单失败(将重试): {order_id} - {reason}, "
                    f"重试{self.active_order['retry_count']}/{self.max_retry}"
                )
                return True
        
        return False

    def complete(self):
        """完成冰山订单"""
        self.end_time = datetime.now()
        self.status = 'completed'
        
        duration = (self.end_time - self.start_time).total_seconds()
        avg_price = sum(o['actual_price'] * o['volume'] for o in self.order_history if o['actual_price']) / self.executed_volume if self.executed_volume > 0 else 0
        
        logger.info(
            f"冰山订单完成: 执行{self.executed_volume}/{self.total_volume}手, "
            f"耗时{duration:.1f}秒, 均价{avg_price:.2f}, 分{len(self.order_history)}笔"
        )

    def cancel(self):
        """取消冰山订单"""
        self.status = 'cancelled'
        if self.active_order:
            self.active_order['status'] = 'cancelled'
            self.order_history.append(self.active_order)
            self.active_order = None
        
        logger.info(f"冰山订单取消: 已执行{self.executed_volume}/{self.total_volume}手")

    def get_progress(self) -> Dict:
        """
        获取执行进度
        
        Returns:
            Dict: 进度信息
        """
        filled_orders = [o for o in self.order_history if o['status'] == 'filled']
        avg_price = sum(o['actual_price'] * o['volume'] for o in filled_orders) / self.executed_volume if self.executed_volume > 0 else 0
        
        return {
            'status': self.status,
            'total_volume': self.total_volume,
            'executed_volume': self.executed_volume,
            'progress': self.executed_volume / self.total_volume if self.total_volume > 0 else 0,
            'num_filled': len(filled_orders),
            'avg_price': round(avg_price, 2),
            'elapsed_time': (datetime.now() - self.start_time).total_seconds() if self.start_time else 0,
            'active_order': self.active_order['order_id'] if self.active_order else None
        }


if __name__ == "__main__":
    # 测试冰山订单
    iceberg = IcebergOrder(
        symbol='SA601',
        direction='buy',
        total_volume=10,
        visible_size=1
    )
    
    iceberg.start()
    
    # 模拟逐步成交
    for i in range(10):
        order = iceberg.generate_next_order()
        if order:
            print(f"\n生成订单: {order['order_id']} {order['volume']}手")
            # 模拟成交
            iceberg.mark_order_filled(order['order_id'], 2000.0 + i, order['volume'])
            print(f"进度: {iceberg.get_progress()}")
