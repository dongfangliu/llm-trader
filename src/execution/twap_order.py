"""
TWAP (Time-Weighted Average Price) 时间加权平均价格算法
将大单拆分为多个小单，在指定时间内均匀下单
"""

import time
from datetime import datetime, timedelta
from typing import List, Dict, Optional
from loguru import logger


class TWAPOrder:
    """TWAP算法订单"""

    def __init__(self, 
                 symbol: str,
                 direction: str,  # 'buy' or 'sell'
                 total_volume: int,
                 duration_seconds: int,
                 min_order_size: int = 1):
        """
        初始化TWAP订单
        
        Args:
            symbol: 合约代码
            direction: 方向 'buy'/'sell'
            total_volume: 总手数
            duration_seconds: 执行时长(秒)
            min_order_size: 最小订单手数
        """
        self.symbol = symbol
        self.direction = direction
        self.total_volume = total_volume
        self.duration_seconds = duration_seconds
        self.min_order_size = min_order_size
        
        # 计算拆单方案
        self.num_orders = max(1, total_volume // min_order_size)
        self.order_size = total_volume // self.num_orders
        self.remainder = total_volume % self.num_orders
        
        # 计算时间间隔
        self.interval_seconds = duration_seconds / self.num_orders if self.num_orders > 1 else 0
        
        # 执行状态
        self.executed_volume = 0
        self.child_orders: List[Dict] = []
        self.start_time: Optional[datetime] = None
        self.end_time: Optional[datetime] = None
        self.status = 'pending'  # pending, executing, completed, cancelled
        
        logger.info(
            f"TWAP订单初始化: {symbol} {direction} 总量{total_volume}手, "
            f"拆分{self.num_orders}笔, 每笔{self.order_size}手, "
            f"间隔{self.interval_seconds:.1f}秒"
        )

    def generate_child_orders(self) -> List[Dict]:
        """
        生成子订单列表
        
        Returns:
            List[Dict]: 子订单列表
        """
        child_orders = []
        
        for i in range(self.num_orders):
            # 最后一笔包含余数
            volume = self.order_size + (self.remainder if i == self.num_orders - 1 else 0)
            
            # 计算预计下单时间
            scheduled_time = self.start_time + timedelta(seconds=i * self.interval_seconds) if self.start_time else None
            
            child_orders.append({
                'order_id': f"TWAP_{i+1}_{self.num_orders}",
                'symbol': self.symbol,
                'direction': self.direction,
                'volume': volume,
                'scheduled_time': scheduled_time,
                'status': 'pending',
                'actual_price': None,
                'fill_time': None
            })
        
        return child_orders

    def start(self):
        """开始执行TWAP订单"""
        self.start_time = datetime.now()
        self.status = 'executing'
        self.child_orders = self.generate_child_orders()
        
        logger.info(f"TWAP订单开始执行: 预计{self.duration_seconds}秒完成")

    def get_next_order(self) -> Optional[Dict]:
        """
        获取下一个应该执行的订单
        
        Returns:
            Optional[Dict]: 下一个订单，若无则返回None
        """
        if self.status != 'executing':
            return None
            
        current_time = datetime.now()
        
        for order in self.child_orders:
            if order['status'] == 'pending':
                # 检查是否到达预定时间
                if order['scheduled_time'] and current_time >= order['scheduled_time']:
                    return order
                # 如果没有预定时间，直接返回
                elif not order['scheduled_time']:
                    return order
        
        return None

    def mark_order_filled(self, order_id: str, fill_price: float):
        """
        标记订单已成交
        
        Args:
            order_id: 订单ID
            fill_price: 成交价格
        """
        for order in self.child_orders:
            if order['order_id'] == order_id:
                order['status'] = 'filled'
                order['actual_price'] = fill_price
                order['fill_time'] = datetime.now()
                self.executed_volume += order['volume']
                
                logger.info(
                    f"TWAP子订单成交: {order_id} {order['volume']}手@{fill_price}, "
                    f"进度{self.executed_volume}/{self.total_volume}"
                )
                
                # 检查是否全部完成
                if self.executed_volume >= self.total_volume:
                    self.complete()
                
                break

    def mark_order_failed(self, order_id: str, reason: str):
        """
        标记订单失败
        
        Args:
            order_id: 订单ID
            reason: 失败原因
        """
        for order in self.child_orders:
            if order['order_id'] == order_id:
                order['status'] = 'failed'
                order['failure_reason'] = reason
                
                logger.warning(f"TWAP子订单失败: {order_id} - {reason}")
                break

    def complete(self):
        """完成TWAP订单"""
        self.end_time = datetime.now()
        self.status = 'completed'
        
        duration = (self.end_time - self.start_time).total_seconds()
        avg_price = sum(o['actual_price'] * o['volume'] for o in self.child_orders if o['actual_price']) / self.executed_volume if self.executed_volume > 0 else 0
        
        logger.info(
            f"TWAP订单完成: 执行{self.executed_volume}/{self.total_volume}手, "
            f"耗时{duration:.1f}秒, 均价{avg_price:.2f}"
        )

    def cancel(self):
        """取消TWAP订单"""
        self.status = 'cancelled'
        logger.info(f"TWAP订单取消: 已执行{self.executed_volume}/{self.total_volume}手")

    def get_progress(self) -> Dict:
        """
        获取执行进度
        
        Returns:
            Dict: 进度信息
        """
        filled_orders = [o for o in self.child_orders if o['status'] == 'filled']
        avg_price = sum(o['actual_price'] * o['volume'] for o in filled_orders) / self.executed_volume if self.executed_volume > 0 else 0
        
        return {
            'status': self.status,
            'total_volume': self.total_volume,
            'executed_volume': self.executed_volume,
            'progress': self.executed_volume / self.total_volume if self.total_volume > 0 else 0,
            'num_orders': self.num_orders,
            'filled_orders': len(filled_orders),
            'avg_price': round(avg_price, 2),
            'elapsed_time': (datetime.now() - self.start_time).total_seconds() if self.start_time else 0
        }


if __name__ == "__main__":
    # 测试TWAP订单
    twap = TWAPOrder(
        symbol='SA601',
        direction='buy',
        total_volume=10,
        duration_seconds=300,  # 5分钟
        min_order_size=1
    )
    
    twap.start()
    
    print("\n子订单列表:")
    for order in twap.child_orders:
        print(f"  {order['order_id']}: {order['volume']}手 @ {order['scheduled_time']}")
    
    print(f"\n进度: {twap.get_progress()}")
