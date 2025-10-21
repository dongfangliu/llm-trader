"""
Slippage Control 滑点控制
估算预期滑点，滑点过大时拒绝下单
"""

from typing import Dict, Optional, Tuple
from loguru import logger


class SlippageControl:
    """滑点控制器"""

    def __init__(self,
                 max_slippage_ticks: int = 2,
                 min_depth_ratio: float = 2.0):
        """
        初始化滑点控制器
        
        Args:
            max_slippage_ticks: 最大允许滑点跳数
            min_depth_ratio: 最小深度比率（订单量/盘口深度）
        """
        self.max_slippage_ticks = max_slippage_ticks
        self.min_depth_ratio = min_depth_ratio
        
        logger.info(
            f"滑点控制初始化: 最大{max_slippage_ticks}跳, "
            f"最小深度比{min_depth_ratio}"
        )

    def estimate_slippage(self,
                          direction: str,
                          volume: int,
                          order_book: Dict) -> Dict:
        """
        估算滑点
        
        Args:
            direction: 方向 'buy'/'sell'
            volume: 订单手数
            order_book: 订单簿 {'bids': [(price, vol), ...], 'asks': [(price, vol), ...]}
            
        Returns:
            Dict: {
                'estimated_slippage': 预估滑点(跳数),
                'estimated_price': 预估成交价,
                'depth_ratio': 深度比率,
                'can_execute': 是否可以执行,
                'reason': 原因
            }
        """
        result = {
            'estimated_slippage': 0,
            'estimated_price': None,
            'depth_ratio': 0.0,
            'can_execute': False,
            'reason': ''
        }
        
        # 选择对应的盘口
        if direction == 'buy':
            book = order_book.get('asks', [])
            if not book:
                result['reason'] = '卖盘为空'
                return result
            best_price = book[0][0]
        else:  # sell
            book = order_book.get('bids', [])
            if not book:
                result['reason'] = '买盘为空'
                return result
            best_price = book[0][0]
        
        # 计算需要穿透多少档
        remaining_volume = volume
        total_cost = 0.0
        levels_consumed = 0
        
        for price, vol in book:
            if remaining_volume <= 0:
                break
            
            consume_vol = min(remaining_volume, vol)
            total_cost += price * consume_vol
            remaining_volume -= consume_vol
            levels_consumed += 1
        
        # 如果盘口深度不够
        if remaining_volume > 0:
            result['reason'] = f'盘口深度不足，缺少{remaining_volume}手'
            return result
        
        # 计算平均成交价
        avg_price = total_cost / volume
        result['estimated_price'] = round(avg_price, 2)
        
        # 计算滑点跳数（纯碱最小变动价位1元）
        tick_size = 1.0
        slippage_ticks = abs(avg_price - best_price) / tick_size
        result['estimated_slippage'] = round(slippage_ticks, 1)
        
        # 计算深度比率
        first_level_depth = book[0][1] if book else 0
        result['depth_ratio'] = first_level_depth / volume if volume > 0 else 0
        
        # 判断是否可以执行
        if slippage_ticks > self.max_slippage_ticks:
            result['reason'] = f'滑点过大: {slippage_ticks:.1f}跳 > {self.max_slippage_ticks}跳'
            return result
        
        if result['depth_ratio'] < self.min_depth_ratio:
            result['reason'] = f'盘口深度不足: {result["depth_ratio"]:.2f} < {self.min_depth_ratio}'
            return result
        
        result['can_execute'] = True
        result['reason'] = 'OK'
        
        return result

    def check_order(self,
                    direction: str,
                    volume: int,
                    order_book: Dict,
                    current_price: float) -> Tuple[bool, Dict]:
        """
        检查订单是否可以执行
        
        Args:
            direction: 方向
            volume: 手数
            order_book: 订单簿
            current_price: 当前价格
            
        Returns:
            Tuple[bool, Dict]: (是否可执行, 详细信息)
        """
        estimate = self.estimate_slippage(direction, volume, order_book)
        
        if estimate['can_execute']:
            logger.info(
                f"滑点检查通过: {direction} {volume}手, "
                f"预估滑点{estimate['estimated_slippage']}跳, "
                f"深度比{estimate['depth_ratio']:.2f}"
            )
        else:
            logger.warning(
                f"滑点检查不通过: {direction} {volume}手, "
                f"原因: {estimate['reason']}"
            )
        
        return estimate['can_execute'], estimate

    def calculate_impact_cost(self,
                              direction: str,
                              volume: int,
                              order_book: Dict,
                              reference_price: float) -> Dict:
        """
        计算市场冲击成本
        
        Args:
            direction: 方向
            volume: 手数
            order_book: 订单簿
            reference_price: 参考价格（如VWAP或中间价）
            
        Returns:
            Dict: 冲击成本信息
        """
        estimate = self.estimate_slippage(direction, volume, order_book)
        
        if not estimate['estimated_price']:
            return {
                'impact_cost_yuan': 0,
                'impact_cost_bps': 0,
                'impact_cost_pct': 0
            }
        
        # 计算成本（纯碱1手=5吨）
        contract_size = 5
        
        if direction == 'buy':
            cost = (estimate['estimated_price'] - reference_price) * volume * contract_size
        else:
            cost = (reference_price - estimate['estimated_price']) * volume * contract_size
        
        cost_bps = (cost / (reference_price * volume * contract_size)) * 10000 if reference_price > 0 else 0
        cost_pct = (cost / (reference_price * volume * contract_size)) * 100 if reference_price > 0 else 0
        
        return {
            'impact_cost_yuan': round(cost, 2),
            'impact_cost_bps': round(cost_bps, 2),
            'impact_cost_pct': round(cost_pct, 4)
        }


if __name__ == "__main__":
    # 测试滑点控制
    controller = SlippageControl(
        max_slippage_ticks=2,
        min_depth_ratio=2.0
    )
    
    # 模拟订单簿
    order_book = {
        'bids': [
            (2000, 5),
            (1999, 3),
            (1998, 2)
        ],
        'asks': [
            (2001, 4),
            (2002, 3),
            (2003, 5)
        ]
    }
    
    # 测试买单
    print("\n测试1: 买2手（深度充足）")
    can_exec, info = controller.check_order('buy', 2, order_book, 2000)
    print(f"可执行: {can_exec}")
    print(f"详情: {info}")
    
    # 计算冲击成本
    impact = controller.calculate_impact_cost('buy', 2, order_book, 2000)
    print(f"冲击成本: {impact}")
    
    print("\n测试2: 买5手（会穿透多档）")
    can_exec, info = controller.check_order('buy', 5, order_book, 2000)
    print(f"可执行: {can_exec}")
    print(f"详情: {info}")
    
    print("\n测试3: 买10手（深度不足）")
    can_exec, info = controller.check_order('buy', 10, order_book, 2000)
    print(f"可执行: {can_exec}")
    print(f"详情: {info}")
