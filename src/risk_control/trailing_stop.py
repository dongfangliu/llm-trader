"""
移动止损 (Trailing Stop)
自动保护已有利润，盈利后移动止损至盈亏平衡点或更高

特性:
1. 盈亏平衡止损 (Break-even Stop)
2. 百分比移动止损 (Percentage Trailing)
3. ATR移动止损 (ATR Trailing)
"""

from typing import Dict, Optional
from dataclasses import dataclass
from loguru import logger
import sys
import os

sys.path.append(os.path.join(os.path.dirname(__file__), '..'))
from trading.account import Position


@dataclass
class TrailingStopConfig:
    """移动止损配置"""
    # 盈亏平衡点设置
    breakeven_trigger_ratio: float = 1.5  # 触发盈亏平衡的盈利倍数 (1.5x风险)
    breakeven_offset: float = 0.0         # 盈亏平衡点偏移 (0=入场价)
    
    # 百分比移动止损
    trailing_percent: float = 0.02  # 移动止损百分比 (2%)
    
    # ATR移动止损
    trailing_atr_multiple: float = 1.5  # ATR移动止损倍数


class TrailingStopManager:
    """移动止损管理器"""
    
    def __init__(self, config: TrailingStopConfig = None):
        """
        初始化移动止损管理器
        
        Args:
            config: 移动止损配置
        """
        self.config = config or TrailingStopConfig()
        logger.info("移动止损管理器初始化完成")
        logger.info(f"  盈亏平衡触发: {self.config.breakeven_trigger_ratio}x 风险")
        logger.info(f"  移动止损百分比: {self.config.trailing_percent * 100}%")
        logger.info(f"  ATR移动止损倍数: {self.config.trailing_atr_multiple}x")
    
    def update_trailing_stop(
        self,
        position: Position,
        current_price: float,
        atr: Optional[float] = None,
        method: str = 'breakeven'
    ) -> Optional[float]:
        """
        更新移动止损
        
        Args:
            position: 持仓对象
            current_price: 当前价格
            atr: 当前ATR (用于ATR移动止损)
            method: 移动止损方法 ('breakeven', 'percentage', 'atr')
        
        Returns:
            新的止损价格 (None表示无需更新)
        """
        if method == 'breakeven':
            return self._update_breakeven_stop(position, current_price)
        elif method == 'percentage':
            return self._update_percentage_trailing(position, current_price)
        elif method == 'atr':
            if atr is None:
                logger.warning("ATR移动止损需要提供ATR值")
                return None
            return self._update_atr_trailing(position, current_price, atr)
        else:
            logger.error(f"未知的移动止损方法: {method}")
            return None
    
    def _update_breakeven_stop(
        self,
        position: Position,
        current_price: float
    ) -> Optional[float]:
        """
        盈亏平衡止损
        
        当盈利达到1.5倍风险时，将止损移至入场价（盈亏平衡点）
        
        Args:
            position: 持仓对象
            current_price: 当前价格
        
        Returns:
            新的止损价格 (None表示无需更新)
        """
        # 计算初始风险
        initial_risk = abs(position.entry_price - position.stop_loss)
        
        # 计算当前盈利
        if position.direction == 'long':
            current_profit = current_price - position.entry_price
            
            # 检查是否达到盈亏平衡触发条件
            if current_profit >= initial_risk * self.config.breakeven_trigger_ratio:
                # 计算新止损 (入场价 + 偏移)
                new_stop_loss = position.entry_price + self.config.breakeven_offset
                
                # 只有新止损更优才更新
                if new_stop_loss > position.stop_loss:
                    logger.info(f"多单触发盈亏平衡止损: "
                              f"当前价{current_price:.2f}, 盈利{current_profit:.2f}, "
                              f"初始风险{initial_risk:.2f}, 新止损{new_stop_loss:.2f}")
                    return round(new_stop_loss, 2)
        
        else:  # short
            current_profit = position.entry_price - current_price
            
            # 检查是否达到盈亏平衡触发条件
            if current_profit >= initial_risk * self.config.breakeven_trigger_ratio:
                # 计算新止损 (入场价 - 偏移)
                new_stop_loss = position.entry_price - self.config.breakeven_offset
                
                # 只有新止损更优才更新
                if new_stop_loss < position.stop_loss:
                    logger.info(f"空单触发盈亏平衡止损: "
                              f"当前价{current_price:.2f}, 盈利{current_profit:.2f}, "
                              f"初始风险{initial_risk:.2f}, 新止损{new_stop_loss:.2f}")
                    return round(new_stop_loss, 2)
        
        return None
    
    def _update_percentage_trailing(
        self,
        position: Position,
        current_price: float
    ) -> Optional[float]:
        """
        百分比移动止损
        
        止损始终保持在最高价下方一定百分比
        
        Args:
            position: 持仓对象
            current_price: 当前价格
        
        Returns:
            新的止损价格 (None表示无需更新)
        """
        if position.direction == 'long':
            # 计算从最高价回撤的止损位
            new_stop_loss = current_price * (1 - self.config.trailing_percent)
            
            # 只有新止损更优才更新
            if new_stop_loss > position.stop_loss:
                logger.info(f"多单百分比移动止损: "
                          f"当前价{current_price:.2f}, "
                          f"新止损{new_stop_loss:.2f} ({self.config.trailing_percent*100}%回撤)")
                return round(new_stop_loss, 2)
        
        else:  # short
            # 计算从最低价反弹的止损位
            new_stop_loss = current_price * (1 + self.config.trailing_percent)
            
            # 只有新止损更优才更新
            if new_stop_loss < position.stop_loss:
                logger.info(f"空单百分比移动止损: "
                          f"当前价{current_price:.2f}, "
                          f"新止损{new_stop_loss:.2f} ({self.config.trailing_percent*100}%反弹)")
                return round(new_stop_loss, 2)
        
        return None
    
    def _update_atr_trailing(
        self,
        position: Position,
        current_price: float,
        atr: float
    ) -> Optional[float]:
        """
        ATR移动止损
        
        止损始终保持在当前价下方N倍ATR
        
        Args:
            position: 持仓对象
            current_price: 当前价格
            atr: 当前ATR
        
        Returns:
            新的止损价格 (None表示无需更新)
        """
        if position.direction == 'long':
            # 计算ATR移动止损位
            new_stop_loss = current_price - (atr * self.config.trailing_atr_multiple)
            
            # 只有新止损更优才更新
            if new_stop_loss > position.stop_loss:
                logger.info(f"多单ATR移动止损: "
                          f"当前价{current_price:.2f}, ATR={atr:.2f}, "
                          f"新止损{new_stop_loss:.2f} ({self.config.trailing_atr_multiple}x ATR)")
                return round(new_stop_loss, 2)
        
        else:  # short
            # 计算ATR移动止损位
            new_stop_loss = current_price + (atr * self.config.trailing_atr_multiple)
            
            # 只有新止损更优才更新
            if new_stop_loss < position.stop_loss:
                logger.info(f"空单ATR移动止损: "
                          f"当前价{current_price:.2f}, ATR={atr:.2f}, "
                          f"新止损{new_stop_loss:.2f} ({self.config.trailing_atr_multiple}x ATR)")
                return round(new_stop_loss, 2)
        
        return None
    
    def should_lock_profit(
        self,
        position: Position,
        current_price: float,
        lock_profit_ratio: float = 0.8
    ) -> bool:
        """
        判断是否应该锁定利润
        
        当已实现80%的目标利润时，建议锁定利润
        
        Args:
            position: 持仓对象
            current_price: 当前价格
            lock_profit_ratio: 锁定利润比例 (默认0.8 = 80%)
        
        Returns:
            是否应该锁定利润
        """
        if not position.take_profit:
            return False
        
        # 计算目标利润
        target_profit = abs(position.take_profit - position.entry_price)
        
        # 计算当前利润
        if position.direction == 'long':
            current_profit = current_price - position.entry_price
        else:  # short
            current_profit = position.entry_price - current_price
        
        # 判断是否达到锁定条件
        if current_profit >= target_profit * lock_profit_ratio:
            logger.info(f"建议锁定利润: 当前利润{current_profit:.2f}, "
                      f"目标利润{target_profit:.2f}, "
                      f"已实现{current_profit/target_profit*100:.1f}%")
            return True
        
        return False


# 测试代码
if __name__ == "__main__":
    # 创建简单的测试Position类（避免导入问题）
    @dataclass
    class TestPosition:
        direction: str
        entry_price: float
        stop_loss: float
        take_profit: Optional[float] = None
    
    # 初始化移动止损管理器
    trailing_stop = TrailingStopManager()
    
    # 创建测试持仓
    print("\n=== 测试多头持仓 ===")
    long_position = TestPosition(
        direction='long',
        entry_price=2000.0,
        stop_loss=1960.0,  # 风险: 40元
        take_profit=2100.0  # 目标利润: 100元
    )
    
    # 测试1: 盈亏平衡止损
    print("\n测试1: 盈亏平衡止损")
    current_price = 2060.0  # 盈利60元 = 1.5倍风险
    new_stop = trailing_stop.update_trailing_stop(
        long_position, current_price, method='breakeven'
    )
    print(f"当前价: {current_price}, 新止损: {new_stop}")
    
    if new_stop:
        long_position.stop_loss = new_stop
    
    # 测试2: 百分比移动止损
    print("\n测试2: 百分比移动止损")
    current_price = 2080.0
    new_stop = trailing_stop.update_trailing_stop(
        long_position, current_price, method='percentage'
    )
    print(f"当前价: {current_price}, 新止损: {new_stop}")
    
    # 测试3: ATR移动止损
    print("\n测试3: ATR移动止损")
    current_price = 2090.0
    atr = 18.0
    new_stop = trailing_stop.update_trailing_stop(
        long_position, current_price, atr=atr, method='atr'
    )
    print(f"当前价: {current_price}, ATR: {atr}, 新止损: {new_stop}")
    
    # 测试4: 锁定利润判断
    print("\n测试4: 锁定利润判断")
    current_price = 2085.0  # 接近止盈
    should_lock = trailing_stop.should_lock_profit(long_position, current_price)
    print(f"当前价: {current_price}, 是否锁定利润: {should_lock}")
    
    print("\n=== 测试空头持仓 ===")
    short_position = TestPosition(
        direction='short',
        entry_price=2000.0,
        stop_loss=2040.0,  # 风险: 40元
        take_profit=1900.0  # 目标利润: 100元
    )
    
    # 测试5: 空头盈亏平衡
    print("\n测试5: 空头盈亏平衡")
    current_price = 1940.0  # 盈利60元
    new_stop = trailing_stop.update_trailing_stop(
        short_position, current_price, method='breakeven'
    )
    print(f"当前价: {current_price}, 新止损: {new_stop}")
    
    # 测试6: 空头ATR移动
    print("\n测试6: 空头ATR移动")
    current_price = 1920.0
    atr = 18.0
    new_stop = trailing_stop.update_trailing_stop(
        short_position, current_price, atr=atr, method='atr'
    )
    print(f"当前价: {current_price}, ATR: {atr}, 新止损: {new_stop}")
    
    print("\n✓ 移动止损系统测试完成")
