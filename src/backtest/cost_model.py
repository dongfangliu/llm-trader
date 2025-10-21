"""
成本模型 (Cost Model)
Phase 6.1.2 - 更真实的滑点和手续费计算

特性:
1. 基于订单簿深度的动态滑点计算
2. 区分市价单和限价单的滑点
3. 手续费分层（开仓、平昨、平今不同费率）
4. 大户折扣计算（月成交量>10000手享受8折）
5. 考虑日盘/夜盘手续费差异
"""

from typing import Dict, Optional, Tuple
from dataclasses import dataclass
from datetime import datetime, time
from loguru import logger
import numpy as np


@dataclass
class CostConfig:
    """成本配置"""
    # 纯碱期货手续费标准（元/手）
    open_commission: float = 2.5  # 开仓
    close_yesterday_commission: float = 2.5  # 平昨
    close_today_commission: float = 7.5  # 平今（纯碱特殊规则）
    
    # 大户折扣
    vip_volume_threshold: int = 10000  # 月成交量阈值（手）
    vip_discount: float = 0.8  # VIP折扣（8折）
    
    # 滑点相关
    base_slippage_ticks: int = 1  # 基础滑点（跳）
    tick_size: float = 1.0  # 最小变动价位（元）
    
    # 深度相关
    depth_levels: int = 5  # 盘口深度档位
    min_depth_ratio: float = 2.0  # 最小深度比（订单量/盘口量）
    
    # 时间相关（夜盘手续费可能不同）
    night_session_start: time = time(21, 0)  # 夜盘开始
    night_session_end: time = time(23, 30)  # 夜盘结束
    night_commission_multiplier: float = 1.0  # 夜盘手续费倍数


@dataclass
class OrderBookDepth:
    """订单簿深度数据"""
    bid_prices: list  # 买价列表（从高到低）
    bid_volumes: list  # 买量列表
    ask_prices: list  # 卖价列表（从低到高）
    ask_volumes: list  # 卖量列表
    
    def get_total_bid_volume(self, levels: int = 5) -> float:
        """获取买盘总量"""
        return sum(self.bid_volumes[:levels]) if self.bid_volumes else 0
    
    def get_total_ask_volume(self, levels: int = 5) -> float:
        """获取卖盘总量"""
        return sum(self.ask_volumes[:levels]) if self.ask_volumes else 0
    
    def get_imbalance(self, levels: int = 5) -> float:
        """
        计算盘口失衡度
        
        Returns:
            float: 失衡度 (-1到1，正值表示买盘强，负值表示卖盘强)
        """
        bid_vol = self.get_total_bid_volume(levels)
        ask_vol = self.get_total_ask_volume(levels)
        total = bid_vol + ask_vol
        
        if total == 0:
            return 0.0
        
        return (bid_vol - ask_vol) / total


class CostModel:
    """
    成本模型 - 计算真实的交易成本
    
    核心功能:
    1. 动态滑点计算（基于订单簿深度）
    2. 分层手续费计算
    3. VIP折扣
    4. 时段差异
    """
    
    def __init__(self, config: CostConfig = None):
        """
        初始化成本模型
        
        Args:
            config: 成本配置
        """
        self.config = config or CostConfig()
        
        # 统计数据
        self.total_volume = 0  # 累计成交量（手）
        self.monthly_volume = 0  # 当月成交量（手）
        self.current_month = datetime.now().month
        
        # 成本统计
        self.total_commission = 0.0  # 累计手续费
        self.total_slippage = 0.0  # 累计滑点成本
        
        logger.info("成本模型初始化完成")
        logger.info(f"  开仓手续费: {self.config.open_commission}元/手")
        logger.info(f"  平今手续费: {self.config.close_today_commission}元/手")
        logger.info(f"  平昨手续费: {self.config.close_yesterday_commission}元/手")
        logger.info(f"  VIP折扣阈值: {self.config.vip_volume_threshold}手/月")
    
    def calculate_commission(
        self,
        volume: int,
        action: str,
        is_today: bool = False,
        timestamp: datetime = None
    ) -> float:
        """
        计算手续费
        
        Args:
            volume: 成交手数
            action: 动作 ('open', 'close')
            is_today: 是否平今
            timestamp: 时间戳（用于判断夜盘）
            
        Returns:
            float: 手续费（元）
        """
        if timestamp is None:
            timestamp = datetime.now()
        
        # 1. 确定基础手续费率
        if action == 'open':
            base_commission = self.config.open_commission
        elif action == 'close':
            if is_today:
                base_commission = self.config.close_today_commission
            else:
                base_commission = self.config.close_yesterday_commission
        else:
            logger.warning(f"未知动作类型: {action}, 使用开仓费率")
            base_commission = self.config.open_commission
        
        # 2. 夜盘手续费调整
        is_night = self._is_night_session(timestamp.time())
        if is_night:
            base_commission *= self.config.night_commission_multiplier
        
        # 3. VIP折扣
        discount = 1.0
        if self.monthly_volume >= self.config.vip_volume_threshold:
            discount = self.config.vip_discount
            logger.debug(f"VIP折扣生效: {discount*100:.0f}%")
        
        # 4. 计算总手续费
        commission = base_commission * volume * discount
        
        # 5. 更新统计
        self._update_volume_stats(volume, timestamp)
        self.total_commission += commission
        
        logger.debug(
            f"手续费计算: {action} {volume}手 | "
            f"基础: {base_commission:.2f}元/手 | "
            f"折扣: {discount*100:.0f}% | "
            f"总计: {commission:.2f}元"
        )
        
        return commission
    
    def calculate_slippage(
        self,
        volume: int,
        direction: str,
        order_type: str = 'market',
        depth: Optional[OrderBookDepth] = None,
        current_price: float = 0
    ) -> Tuple[float, float]:
        """
        计算滑点
        
        Args:
            volume: 订单手数
            direction: 方向 ('long', 'short')
            order_type: 订单类型 ('market', 'limit')
            depth: 订单簿深度
            current_price: 当前价格
            
        Returns:
            Tuple[float, float]: (滑点成本(元), 平均成交价偏离(元))
        """
        # 限价单假设50%概率成交，滑点为0.5跳
        if order_type == 'limit':
            slippage_ticks = self.config.base_slippage_ticks * 0.5
            slippage_cost = slippage_ticks * self.config.tick_size * volume
            price_impact = slippage_ticks * self.config.tick_size
            
            logger.debug(f"限价单滑点: {slippage_ticks:.1f}跳 = {slippage_cost:.2f}元")
            
            self.total_slippage += slippage_cost
            return slippage_cost, price_impact
        
        # 市价单：基于订单簿深度计算
        if depth is None:
            # 无深度数据，使用固定滑点
            slippage_ticks = self.config.base_slippage_ticks
            slippage_cost = slippage_ticks * self.config.tick_size * volume
            price_impact = slippage_ticks * self.config.tick_size
            
            logger.debug(f"市价单滑点（无深度数据）: {slippage_ticks}跳 = {slippage_cost:.2f}元")
            
            self.total_slippage += slippage_cost
            return slippage_cost, price_impact
        
        # 有深度数据：计算穿透成本
        slippage_cost, price_impact = self._calculate_market_impact(
            volume, direction, depth, current_price
        )
        
        self.total_slippage += slippage_cost
        return slippage_cost, price_impact
    
    def _calculate_market_impact(
        self,
        volume: int,
        direction: str,
        depth: OrderBookDepth,
        current_price: float
    ) -> Tuple[float, float]:
        """
        计算市价单的市场冲击成本
        
        逻辑:
        1. 从最优价格开始吃单
        2. 如果当前档位量不足，穿透到下一档
        3. 计算加权平均成交价格
        4. 滑点 = (平均成交价 - 当前价) * 手数
        
        Args:
            volume: 订单手数
            direction: 方向
            depth: 订单簿深度
            current_price: 当前价格
            
        Returns:
            Tuple[float, float]: (滑点成本, 价格偏离)
        """
        remaining_volume = volume
        total_cost = 0.0
        filled_volume = 0
        
        if direction == 'long':
            # 买入：吃卖盘（ask）
            prices = depth.ask_prices
            volumes = depth.ask_volumes
        else:
            # 卖出：吃买盘（bid）
            prices = depth.bid_prices
            volumes = depth.bid_volumes
        
        # 逐档吃单
        for i, (price, vol) in enumerate(zip(prices, volumes)):
            if remaining_volume <= 0:
                break
            
            # 本档可成交量
            fill_vol = min(remaining_volume, vol)
            
            # 累计成本
            total_cost += price * fill_vol
            filled_volume += fill_vol
            remaining_volume -= fill_vol
            
            logger.debug(f"档位{i+1}: 价格{price:.2f}, 量{vol}, 成交{fill_vol}")
        
        # 如果档位不足，剩余部分以最差价格+额外滑点成交
        if remaining_volume > 0:
            worst_price = prices[-1] if prices else current_price
            extra_slippage = self.config.base_slippage_ticks * 2  # 双倍滑点
            
            if direction == 'long':
                worst_price += extra_slippage * self.config.tick_size
            else:
                worst_price -= extra_slippage * self.config.tick_size
            
            total_cost += worst_price * remaining_volume
            filled_volume += remaining_volume
            
            logger.warning(
                f"盘口深度不足！剩余{remaining_volume}手以最差价{worst_price:.2f}成交"
            )
        
        # 计算平均成交价
        avg_price = total_cost / filled_volume if filled_volume > 0 else current_price
        
        # 计算滑点
        if direction == 'long':
            price_impact = avg_price - current_price
        else:
            price_impact = current_price - avg_price
        
        slippage_cost = abs(price_impact * volume)
        
        logger.debug(
            f"市场冲击: 方向{direction} {volume}手 | "
            f"当前价{current_price:.2f} | 平均成交价{avg_price:.2f} | "
            f"滑点{price_impact:.2f}元 = {slippage_cost:.2f}元总成本"
        )
        
        return slippage_cost, price_impact
    
    def calculate_total_cost(
        self,
        volume: int,
        action: str,
        direction: str,
        order_type: str = 'market',
        is_today: bool = False,
        depth: Optional[OrderBookDepth] = None,
        current_price: float = 0,
        timestamp: datetime = None
    ) -> Dict[str, float]:
        """
        计算总交易成本（手续费 + 滑点）
        
        Args:
            volume: 手数
            action: 动作 ('open', 'close')
            direction: 方向 ('long', 'short')
            order_type: 订单类型
            is_today: 是否平今
            depth: 订单簿深度
            current_price: 当前价格
            timestamp: 时间戳
            
        Returns:
            Dict: {
                'commission': 手续费,
                'slippage_cost': 滑点成本,
                'price_impact': 价格偏离,
                'total_cost': 总成本
            }
        """
        # 计算手续费
        commission = self.calculate_commission(volume, action, is_today, timestamp)
        
        # 计算滑点
        slippage_cost, price_impact = self.calculate_slippage(
            volume, direction, order_type, depth, current_price
        )
        
        # 总成本
        total_cost = commission + slippage_cost
        
        return {
            'commission': commission,
            'slippage_cost': slippage_cost,
            'price_impact': price_impact,
            'total_cost': total_cost
        }
    
    def _is_night_session(self, t: time) -> bool:
        """判断是否夜盘时段"""
        return self.config.night_session_start <= t <= self.config.night_session_end
    
    def _update_volume_stats(self, volume: int, timestamp: datetime):
        """更新成交量统计"""
        self.total_volume += volume
        
        # 检查月份切换
        if timestamp.month != self.current_month:
            logger.info(
                f"月份切换: {self.current_month}月成交{self.monthly_volume}手 -> "
                f"{timestamp.month}月重置"
            )
            self.monthly_volume = 0
            self.current_month = timestamp.month
        
        self.monthly_volume += volume
    
    def get_statistics(self) -> Dict[str, float]:
        """
        获取成本统计
        
        Returns:
            Dict: 统计信息
        """
        return {
            'total_volume': self.total_volume,
            'monthly_volume': self.monthly_volume,
            'total_commission': self.total_commission,
            'total_slippage': self.total_slippage,
            'total_cost': self.total_commission + self.total_slippage,
            'avg_commission_per_lot': (
                self.total_commission / self.total_volume 
                if self.total_volume > 0 else 0
            ),
            'avg_slippage_per_lot': (
                self.total_slippage / self.total_volume 
                if self.total_volume > 0 else 0
            ),
            'is_vip': self.monthly_volume >= self.config.vip_volume_threshold
        }
    
    def reset_statistics(self):
        """重置统计数据"""
        self.total_volume = 0
        self.monthly_volume = 0
        self.total_commission = 0.0
        self.total_slippage = 0.0
        logger.info("成本统计已重置")


# 便捷函数
def create_default_cost_model() -> CostModel:
    """创建默认成本模型（纯碱期货）"""
    return CostModel(CostConfig())


def calculate_sa_commission(volume: int, action: str, is_today: bool = False) -> float:
    """
    纯碱期货手续费快速计算
    
    Args:
        volume: 手数
        action: 'open' or 'close'
        is_today: 是否平今
        
    Returns:
        float: 手续费（元）
    """
    if action == 'open':
        return 2.5 * volume
    elif action == 'close':
        return (7.5 if is_today else 2.5) * volume
    else:
        return 2.5 * volume


# 测试代码
if __name__ == "__main__":
    logger.add("logs/cost_model_{time}.log", rotation="1 day")
    
    logger.info("=" * 60)
    logger.info("成本模型测试")
    logger.info("=" * 60)
    
    # 创建成本模型
    cost_model = CostModel()
    
    # 测试1: 基础手续费计算
    logger.info("\n【测试1: 手续费计算】")
    
    open_comm = cost_model.calculate_commission(1, 'open')
    logger.info(f"开仓1手: {open_comm:.2f}元")
    
    close_today_comm = cost_model.calculate_commission(1, 'close', is_today=True)
    logger.info(f"平今1手: {close_today_comm:.2f}元")
    
    close_yesterday_comm = cost_model.calculate_commission(1, 'close', is_today=False)
    logger.info(f"平昨1手: {close_yesterday_comm:.2f}元")
    
    # 测试2: 滑点计算（无深度数据）
    logger.info("\n【测试2: 滑点计算（固定）】")
    
    slippage_cost, price_impact = cost_model.calculate_slippage(
        volume=1,
        direction='long',
        order_type='market',
        current_price=1500
    )
    logger.info(f"市价单1手: 滑点成本{slippage_cost:.2f}元, 价格影响{price_impact:.2f}元")
    
    # 测试3: 滑点计算（有深度数据）
    logger.info("\n【测试3: 滑点计算（基于深度）】")
    
    depth = OrderBookDepth(
        bid_prices=[1500, 1499, 1498],
        bid_volumes=[10, 20, 30],
        ask_prices=[1501, 1502, 1503],
        ask_volumes=[10, 20, 30]
    )
    
    slippage_cost, price_impact = cost_model.calculate_slippage(
        volume=5,
        direction='long',
        order_type='market',
        depth=depth,
        current_price=1500
    )
    logger.info(f"市价单5手（有深度）: 滑点成本{slippage_cost:.2f}元, 价格影响{price_impact:.2f}元")
    
    # 测试4: 总成本计算
    logger.info("\n【测试4: 总成本计算】")
    
    total = cost_model.calculate_total_cost(
        volume=2,
        action='open',
        direction='long',
        order_type='market',
        depth=depth,
        current_price=1500
    )
    
    logger.info(f"开仓2手总成本: {total['total_cost']:.2f}元")
    logger.info(f"  手续费: {total['commission']:.2f}元")
    logger.info(f"  滑点: {total['slippage_cost']:.2f}元")
    
    # 测试5: 统计信息
    logger.info("\n【测试5: 成本统计】")
    
    stats = cost_model.get_statistics()
    logger.info(f"累计成交: {stats['total_volume']}手")
    logger.info(f"累计手续费: {stats['total_commission']:.2f}元")
    logger.info(f"累计滑点: {stats['total_slippage']:.2f}元")
    logger.info(f"总成本: {stats['total_cost']:.2f}元")
    logger.info(f"每手平均手续费: {stats['avg_commission_per_lot']:.2f}元")
    logger.info(f"每手平均滑点: {stats['avg_slippage_per_lot']:.2f}元")
    
    logger.info("\n" + "=" * 60)
    logger.info("成本模型测试完成")
    logger.info("=" * 60)
