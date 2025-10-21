"""
Smart Executor 智能执行器
根据订单大小和市场状况选择合适的执行算法
"""

from typing import Dict, Optional
from datetime import datetime
from loguru import logger

try:
    from .twap_order import TWAPOrder
    from .iceberg_order import IcebergOrder
    from .chase_order import ChaseOrder
    from .slippage_control import SlippageControl
except ImportError:
    from twap_order import TWAPOrder
    from iceberg_order import IcebergOrder
    from chase_order import ChaseOrder
    from slippage_control import SlippageControl


class SmartExecutor:
    """智能执行器 - 自动选择最优执行算法"""

    def __init__(self,
                 large_order_threshold: int = 3,
                 enable_twap: bool = True,
                 enable_iceberg: bool = True,
                 enable_chase: bool = True,
                 max_slippage_ticks: int = 2):
        """
        初始化智能执行器
        
        Args:
            large_order_threshold: 大单阈值（手数）
            enable_twap: 是否启用TWAP
            enable_iceberg: 是否启用冰山订单
            enable_chase: 是否启用追击订单
            max_slippage_ticks: 最大滑点
        """
        self.large_order_threshold = large_order_threshold
        self.enable_twap = enable_twap
        self.enable_iceberg = enable_iceberg
        self.enable_chase = enable_chase
        
        # 滑点控制
        self.slippage_control = SlippageControl(max_slippage_ticks=max_slippage_ticks)
        
        # 活跃订单
        self.active_orders: Dict[str, object] = {}
        
        logger.info(
            f"智能执行器初始化: 大单阈值{large_order_threshold}手, "
            f"TWAP={'启用' if enable_twap else '禁用'}, "
            f"冰山={'启用' if enable_iceberg else '禁用'}, "
            f"追击={'启用' if enable_chase else '禁用'}"
        )

    def select_algorithm(self,
                         symbol: str,
                         direction: str,
                         volume: int,
                         urgency: str = 'normal',
                         market_liquidity: str = 'normal') -> Dict:
        """
        选择执行算法
        
        Args:
            symbol: 合约代码
            direction: 方向
            volume: 手数
            urgency: 紧急程度 'low'/'normal'/'high'
            market_liquidity: 市场流动性 'low'/'normal'/'high'
            
        Returns:
            Dict: 算法选择结果
        """
        result = {
            'algorithm': 'direct',
            'reason': '',
            'params': {}
        }
        
        # 小单直接下单
        if volume <= 1:
            result['reason'] = '小单直接下单'
            return result
        
        # 紧急订单优先使用追击
        if urgency == 'high' and self.enable_chase:
            result['algorithm'] = 'chase'
            result['reason'] = '高紧急度，使用追击订单'
            result['params'] = {
                'max_chase_ticks': 3,
                'timeout_seconds': 30
            }
            return result
        
        # 大单处理
        if volume >= self.large_order_threshold:
            # 低流动性市场使用TWAP
            if market_liquidity == 'low' and self.enable_twap:
                result['algorithm'] = 'twap'
                result['reason'] = '大单+低流动性，使用TWAP分散冲击'
                result['params'] = {
                    'duration_seconds': 300,  # 5分钟
                    'min_order_size': 1
                }
                return result
            
            # 正常流动性使用冰山订单
            if self.enable_iceberg:
                result['algorithm'] = 'iceberg'
                result['reason'] = '大单隐藏交易意图，使用冰山订单'
                result['params'] = {
                    'visible_size': 1
                }
                return result
        
        # 中单使用追击
        if volume >= 2 and self.enable_chase:
            result['algorithm'] = 'chase'
            result['reason'] = '中等规模，使用追击订单提高成交率'
            result['params'] = {
                'max_chase_ticks': 2,
                'timeout_seconds': 20
            }
            return result
        
        # 默认直接下单
        result['reason'] = '普通订单，直接下单'
        return result

    def create_order(self,
                     order_id: str,
                     symbol: str,
                     direction: str,
                     volume: int,
                     algorithm: Optional[str] = None,
                     urgency: str = 'normal',
                     market_liquidity: str = 'normal') -> Dict:
        """
        创建订单
        
        Args:
            order_id: 订单ID
            symbol: 合约代码
            direction: 方向
            volume: 手数
            algorithm: 指定算法（None则自动选择）
            urgency: 紧急程度
            market_liquidity: 市场流动性
            
        Returns:
            Dict: 订单信息
        """
        # 选择算法
        if algorithm is None:
            selection = self.select_algorithm(symbol, direction, volume, urgency, market_liquidity)
            algorithm = selection['algorithm']
            params = selection['params']
        else:
            selection = {'reason': f'手动指定{algorithm}', 'params': {}}
            params = {}
        
        logger.info(
            f"创建订单: {order_id} {symbol} {direction} {volume}手, "
            f"算法={algorithm}, 原因={selection['reason']}"
        )
        
        # 创建对应的订单对象
        order_obj = None
        
        if algorithm == 'twap':
            order_obj = TWAPOrder(
                symbol=symbol,
                direction=direction,
                total_volume=volume,
                duration_seconds=params.get('duration_seconds', 300),
                min_order_size=params.get('min_order_size', 1)
            )
        
        elif algorithm == 'iceberg':
            order_obj = IcebergOrder(
                symbol=symbol,
                direction=direction,
                total_volume=volume,
                visible_size=params.get('visible_size', 1)
            )
        
        elif algorithm == 'chase':
            order_obj = ChaseOrder(
                symbol=symbol,
                direction=direction,
                volume=volume,
                max_chase_ticks=params.get('max_chase_ticks', 3),
                timeout_seconds=params.get('timeout_seconds', 30)
            )
        
        # 保存订单
        if order_obj:
            self.active_orders[order_id] = order_obj
        
        return {
            'order_id': order_id,
            'algorithm': algorithm,
            'reason': selection['reason'],
            'order_object': order_obj,
            'created_at': datetime.now()
        }

    def get_order(self, order_id: str) -> Optional[object]:
        """获取订单对象"""
        return self.active_orders.get(order_id)

    def remove_order(self, order_id: str):
        """移除订单"""
        if order_id in self.active_orders:
            del self.active_orders[order_id]
            logger.info(f"移除订单: {order_id}")

    def get_active_orders(self) -> Dict:
        """获取所有活跃订单"""
        return {
            order_id: {
                'type': type(order).__name__,
                'status': getattr(order, 'status', 'unknown')
            }
            for order_id, order in self.active_orders.items()
        }

    def check_slippage(self,
                       direction: str,
                       volume: int,
                       order_book: Dict,
                       current_price: float) -> Dict:
        """
        检查滑点
        
        Args:
            direction: 方向
            volume: 手数
            order_book: 订单簿
            current_price: 当前价格
            
        Returns:
            Dict: 滑点检查结果
        """
        can_execute, estimate = self.slippage_control.check_order(
            direction, volume, order_book, current_price
        )
        
        return {
            'can_execute': can_execute,
            'estimate': estimate
        }


if __name__ == "__main__":
    # 测试智能执行器
    executor = SmartExecutor(
        large_order_threshold=3,
        enable_twap=True,
        enable_iceberg=True,
        enable_chase=True
    )
    
    # 测试算法选择
    test_cases = [
        ('SA601', 'buy', 1, 'normal', 'normal'),
        ('SA601', 'buy', 2, 'normal', 'normal'),
        ('SA601', 'buy', 5, 'normal', 'normal'),
        ('SA601', 'buy', 5, 'high', 'normal'),
        ('SA601', 'buy', 10, 'normal', 'low'),
    ]
    
    print("\n算法选择测试:")
    for symbol, direction, volume, urgency, liquidity in test_cases:
        result = executor.select_algorithm(symbol, direction, volume, urgency, liquidity)
        print(f"\n{direction} {volume}手 (紧急度={urgency}, 流动性={liquidity})")
        print(f"  算法: {result['algorithm']}")
        print(f"  原因: {result['reason']}")
        print(f"  参数: {result['params']}")
    
    # 测试订单创建
    print("\n\n订单创建测试:")
    order1 = executor.create_order('TEST001', 'SA601', 'buy', 5, urgency='normal', market_liquidity='normal')
    print(f"订单1: {order1['order_id']} - {order1['algorithm']} - {order1['reason']}")
    
    print(f"\n活跃订单: {executor.get_active_orders()}")
