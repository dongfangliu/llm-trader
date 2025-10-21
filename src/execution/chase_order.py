"""
Chase Order 盘口追击订单
动态调整限价单价格以追击盘口，提高成交概率
"""

import time
from datetime import datetime, timedelta
from typing import Optional, Dict
from loguru import logger


class ChaseOrder:
    """盘口追击订单 - 动态调整价格以快速成交"""

    def __init__(self,
                 symbol: str,
                 direction: str,  # 'buy' or 'sell'
                 volume: int,
                 initial_price: Optional[float] = None,
                 max_chase_ticks: int = 3,
                 chase_interval_seconds: float = 2.0,
                 timeout_seconds: int = 30):
        """
        初始化盘口追击订单
        
        Args:
            symbol: 合约代码
            direction: 方向 'buy'/'sell'
            volume: 手数
            initial_price: 初始价格（None则使用对手价）
            max_chase_ticks: 最大追击跳数
            chase_interval_seconds: 追击间隔（秒）
            timeout_seconds: 超时时间（秒），超时后转市价单
        """
        self.symbol = symbol
        self.direction = direction
        self.volume = volume
        self.initial_price = initial_price
        self.max_chase_ticks = max_chase_ticks
        self.chase_interval_seconds = chase_interval_seconds
        self.timeout_seconds = timeout_seconds
        
        # 执行状态
        self.current_price: Optional[float] = initial_price
        self.chase_count = 0
        self.order_id: Optional[str] = None
        self.start_time: Optional[datetime] = None
        self.end_time: Optional[datetime] = None
        self.last_chase_time: Optional[datetime] = None
        self.status = 'pending'  # pending, chasing, filled, timeout, cancelled
        
        # 成交信息
        self.fill_price: Optional[float] = None
        self.fill_time: Optional[datetime] = None
        
        logger.info(
            f"追击订单初始化: {symbol} {direction} {volume}手, "
            f"最多追击{max_chase_ticks}跳, 超时{timeout_seconds}秒"
        )

    def start(self, market_price: Dict):
        """
        开始执行追击订单
        
        Args:
            market_price: 市场价格 {'bid1': xx, 'ask1': xx, 'last': xx}
        """
        self.start_time = datetime.now()
        self.status = 'chasing'
        
        # 如果没有设定初始价格，使用对手价
        if self.initial_price is None:
            if self.direction == 'buy':
                self.current_price = market_price.get('ask1')
            else:
                self.current_price = market_price.get('bid1')
        
        logger.info(f"追击订单开始: 初始价格{self.current_price}")

    def should_chase(self, market_price: Dict) -> bool:
        """
        判断是否应该追击
        
        Args:
            market_price: 市场价格
            
        Returns:
            bool: 是否应该追击
        """
        if self.status != 'chasing':
            return False
        
        # 检查是否超时
        if self.start_time:
            elapsed = (datetime.now() - self.start_time).total_seconds()
            if elapsed >= self.timeout_seconds:
                self.timeout()
                return False
        
        # 检查是否达到最大追击次数
        if self.chase_count >= self.max_chase_ticks:
            logger.info(f"追击订单达到最大追击次数{self.max_chase_ticks}")
            return False
        
        # 检查追击间隔
        if self.last_chase_time:
            since_last = (datetime.now() - self.last_chase_time).total_seconds()
            if since_last < self.chase_interval_seconds:
                return False
        
        # 判断价格是否需要调整
        if self.direction == 'buy':
            target_price = market_price.get('ask1')
            if target_price and self.current_price and target_price > self.current_price:
                return True
        else:  # sell
            target_price = market_price.get('bid1')
            if target_price and self.current_price and target_price < self.current_price:
                return True
        
        return False

    def chase(self, market_price: Dict) -> Optional[float]:
        """
        执行追击，返回新价格
        
        Args:
            market_price: 市场价格
            
        Returns:
            Optional[float]: 新价格，若无需追击则返回None
        """
        if not self.should_chase(market_price):
            return None
        
        # 获取新价格
        if self.direction == 'buy':
            new_price = market_price.get('ask1')
        else:
            new_price = market_price.get('bid1')
        
        if new_price is None:
            return None
        
        old_price = self.current_price
        self.current_price = new_price
        self.chase_count += 1
        self.last_chase_time = datetime.now()
        
        logger.info(
            f"追击订单调价: {old_price} → {new_price}, "
            f"第{self.chase_count}/{self.max_chase_ticks}次追击"
        )
        
        return new_price

    def mark_filled(self, fill_price: float):
        """
        标记订单已成交
        
        Args:
            fill_price: 成交价格
        """
        self.status = 'filled'
        self.fill_price = fill_price
        self.fill_time = datetime.now()
        self.end_time = datetime.now()
        
        duration = (self.end_time - self.start_time).total_seconds() if self.start_time else 0
        
        logger.info(
            f"追击订单成交: {self.volume}手@{fill_price}, "
            f"追击{self.chase_count}次, 耗时{duration:.1f}秒"
        )

    def timeout(self):
        """订单超时，转为市价单"""
        self.status = 'timeout'
        self.end_time = datetime.now()
        
        elapsed = (self.end_time - self.start_time).total_seconds() if self.start_time else 0
        
        logger.warning(
            f"追击订单超时: 耗时{elapsed:.1f}秒, 追击{self.chase_count}次, "
            f"建议转市价单"
        )

    def cancel(self):
        """取消订单"""
        self.status = 'cancelled'
        self.end_time = datetime.now()
        logger.info(f"追击订单取消")

    def get_status(self) -> Dict:
        """
        获取订单状态
        
        Returns:
            Dict: 状态信息
        """
        return {
            'status': self.status,
            'symbol': self.symbol,
            'direction': self.direction,
            'volume': self.volume,
            'current_price': self.current_price,
            'chase_count': self.chase_count,
            'elapsed_time': (datetime.now() - self.start_time).total_seconds() if self.start_time else 0,
            'fill_price': self.fill_price,
            'is_timeout': self.status == 'timeout',
            'should_convert_to_market': self.status == 'timeout'
        }


if __name__ == "__main__":
    # 测试追击订单
    chase = ChaseOrder(
        symbol='SA601',
        direction='buy',
        volume=2,
        max_chase_ticks=3,
        chase_interval_seconds=2.0,
        timeout_seconds=10
    )
    
    # 模拟市场数据
    market = {'bid1': 2000, 'ask1': 2001, 'last': 2000}
    
    chase.start(market)
    print(f"初始状态: {chase.get_status()}")
    
    # 模拟价格变化
    for i in range(5):
        time.sleep(2)
        market['ask1'] += 1
        
        new_price = chase.chase(market)
        if new_price:
            print(f"\n追击到新价格: {new_price}")
        
        print(f"当前状态: {chase.get_status()}")
        
        if chase.status != 'chasing':
            break
