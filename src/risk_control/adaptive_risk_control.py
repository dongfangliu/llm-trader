"""
波动率自适应风险控制系统
Phase 3 核心组件 - 根据市场波动率动态调整止损止盈

特性:
1. ATR自适应止损 (波动率越大，止损越宽)
2. Kelly公式仓位管理
3. 账户级风控 (单笔、单日、总回撤)
4. 持仓时间管理
"""

from typing import Dict, Optional, Tuple
from dataclasses import dataclass
import numpy as np
from loguru import logger
import sys
import os

sys.path.append(os.path.join(os.path.dirname(__file__), '..'))
from trading.account import Account, Position


@dataclass
class AdaptiveRiskConfig:
    """自适应风控配置"""
    # ATR自适应止损
    base_stop_loss_atr_multiple: float = 2.0  # 基础止损倍数
    min_stop_loss_atr_multiple: float = 1.5   # 最小止损倍数
    max_stop_loss_atr_multiple: float = 3.5   # 最大止损倍数
    
    # ATR自适应止盈
    base_take_profit_atr_multiple: float = 3.0  # 基础止盈倍数
    profit_risk_ratio: float = 2.5              # 盈亏比
    
    # Kelly公式仓位管理
    kelly_fraction: float = 0.3  # Kelly分数 (保守: 使用30%的Kelly建议)
    min_position: int = 1        # 最小仓位
    max_position: int = 3        # 最大仓位
    
    # 账户级风控
    max_drawdown: float = 0.10           # 最大回撤 10%
    daily_max_loss: float = -1500.0      # 单日最大亏损
    single_trade_max_loss: float = -800.0  # 单笔最大亏损
    
    # 持仓时间管理
    max_hold_hours: float = 8.0       # 最大持仓时间
    warning_hold_hours: float = 6.0   # 持仓预警时间
    
    # 波动率阈值
    high_volatility_threshold: float = 80.0  # ATR高分位数 (80%以上为高波动)
    low_volatility_threshold: float = 20.0   # ATR低分位数 (20%以下为低波动)


class AdaptiveRiskControl:
    """波动率自适应风险控制器"""
    
    def __init__(self, config: AdaptiveRiskConfig = None):
        """
        初始化自适应风控器
        
        Args:
            config: 风控配置
        """
        self.config = config or AdaptiveRiskConfig()
        logger.info("自适应风险控制器初始化完成")
        logger.info(f"  ATR止损倍数: {self.config.min_stop_loss_atr_multiple}-{self.config.max_stop_loss_atr_multiple}")
        logger.info(f"  Kelly分数: {self.config.kelly_fraction}")
        logger.info(f"  最大回撤: {self.config.max_drawdown * 100}%")
        logger.info(f"  单日最大亏损: {self.config.daily_max_loss}")
    
    def calculate_adaptive_stop_loss(
        self,
        entry_price: float,
        atr: float,
        atr_percentile: float,
        direction: str,
        market_regime: str = 'trend'
    ) -> float:
        """
        计算波动率自适应止损价格
        
        Args:
            entry_price: 入场价格
            atr: 当前ATR值
            atr_percentile: ATR历史分位数 (0-100)
            direction: 方向 ('long' or 'short')
            market_regime: 市场状态 ('trend', 'range', 'breakout', 'abnormal')
        
        Returns:
            止损价格
        """
        # 根据ATR分位数调整止损倍数
        if atr_percentile >= self.config.high_volatility_threshold:
            # 高波动率: 使用更宽的止损
            atr_multiple = self.config.max_stop_loss_atr_multiple
            logger.debug(f"高波动环境 (ATR分位数: {atr_percentile:.1f}%), 使用宽止损 {atr_multiple}x ATR")
        elif atr_percentile <= self.config.low_volatility_threshold:
            # 低波动率: 使用更紧的止损
            atr_multiple = self.config.min_stop_loss_atr_multiple
            logger.debug(f"低波动环境 (ATR分位数: {atr_percentile:.1f}%), 使用紧止损 {atr_multiple}x ATR")
        else:
            # 中等波动率: 使用基础止损
            atr_multiple = self.config.base_stop_loss_atr_multiple
            logger.debug(f"正常波动环境 (ATR分位数: {atr_percentile:.1f}%), 使用基础止损 {atr_multiple}x ATR")
        
        # 根据市场状态微调
        if market_regime == 'range':
            # 震荡市: 紧止损
            atr_multiple *= 0.8
        elif market_regime == 'abnormal':
            # 异常市: 超紧止损
            atr_multiple *= 0.6
        
        # 计算止损价格
        stop_loss_distance = atr * atr_multiple
        
        if direction == 'long':
            stop_loss = entry_price - stop_loss_distance
        else:  # short
            stop_loss = entry_price + stop_loss_distance
        
        logger.info(f"自适应止损: 入场{entry_price:.2f}, ATR={atr:.2f} ({atr_percentile:.1f}%), "
                   f"倍数={atr_multiple:.2f}x, 止损={stop_loss:.2f}")
        
        return round(stop_loss, 2)
    
    def calculate_adaptive_take_profit(
        self,
        entry_price: float,
        stop_loss: float,
        direction: str,
        profit_risk_ratio: Optional[float] = None
    ) -> float:
        """
        计算自适应止盈价格 (基于盈亏比)
        
        Args:
            entry_price: 入场价格
            stop_loss: 止损价格
            direction: 方向 ('long' or 'short')
            profit_risk_ratio: 盈亏比 (默认使用配置值)
        
        Returns:
            止盈价格
        """
        ratio = profit_risk_ratio or self.config.profit_risk_ratio
        
        # 计算风险金额
        risk = abs(entry_price - stop_loss)
        
        # 计算目标利润
        profit_target = risk * ratio
        
        if direction == 'long':
            take_profit = entry_price + profit_target
        else:  # short
            take_profit = entry_price - profit_target
        
        logger.info(f"自适应止盈: 入场{entry_price:.2f}, 止损{stop_loss:.2f}, "
                   f"风险{risk:.2f}, 盈亏比{ratio:.1f}:1, 止盈={take_profit:.2f}")
        
        return round(take_profit, 2)
    
    def calculate_kelly_position_size(
        self,
        account_equity: float,
        win_rate: float,
        profit_risk_ratio: float,
        current_position: int = 0
    ) -> int:
        """
        使用Kelly公式计算仓位大小
        
        Kelly公式: f = (p * b - q) / b
        其中:
            p = 胜率
            q = 1 - p (败率)
            b = 盈亏比
            f = 建议仓位比例
        
        Args:
            account_equity: 账户权益
            win_rate: 历史胜率 (0-1)
            profit_risk_ratio: 盈亏比
            current_position: 当前持仓手数
        
        Returns:
            建议仓位手数
        """
        # Kelly公式
        p = win_rate
        q = 1 - p
        b = profit_risk_ratio
        
        kelly_fraction_full = (p * b - q) / b
        
        # 保守调整: 只使用30%的Kelly建议 (避免过度激进)
        kelly_fraction_conservative = kelly_fraction_full * self.config.kelly_fraction
        
        # 限制范围 [0, 1]
        kelly_fraction_conservative = max(0.0, min(1.0, kelly_fraction_conservative))
        
        # 根据账户权益计算建议仓位
        # 简化版: 假设每手需要的保证金为账户权益的33%
        max_affordable_position = int(account_equity / (account_equity * 0.33))
        suggested_position = int(max_affordable_position * kelly_fraction_conservative)
        
        # 限制仓位范围
        suggested_position = max(self.config.min_position, min(self.config.max_position, suggested_position))
        
        logger.info(f"Kelly仓位计算: 胜率={win_rate:.2%}, 盈亏比={profit_risk_ratio:.1f}, "
                   f"Kelly={kelly_fraction_full:.2%}, 保守Kelly={kelly_fraction_conservative:.2%}, "
                   f"建议仓位={suggested_position}手")
        
        return suggested_position
    
    def check_account_risk(self, account: Account) -> Tuple[str, str]:
        """
        检查账户级风险
        
        Args:
            account: 账户对象
        
        Returns:
            (action, reason)
            action: 'FORCE_CLOSE_ALL', 'STOP_TRADING', 'WARNING', 'OK'
        """
        # 检查最大回撤
        if account.drawdown > self.config.max_drawdown:
            msg = f"账户回撤 {account.drawdown*100:.2f}% 超过最大回撤 {self.config.max_drawdown*100}%"
            logger.error(msg)
            return ('FORCE_CLOSE_ALL', msg)
        
        # 检查单日最大亏损
        if account.today_pnl < self.config.daily_max_loss:
            msg = f"今日亏损 {account.today_pnl:.2f} 超过单日最大亏损 {self.config.daily_max_loss}"
            logger.error(msg)
            return ('STOP_TRADING', msg)
        
        # 回撤预警 (80%阈值)
        warning_drawdown = self.config.max_drawdown * 0.8
        if account.drawdown > warning_drawdown:
            msg = f"回撤预警: {account.drawdown*100:.2f}% (阈值: {warning_drawdown*100:.2f}%)"
            logger.warning(msg)
            return ('WARNING', msg)
        
        return ('OK', '')
    
    def check_position_risk(
        self,
        position: Position,
        current_price: float,
        hold_hours: float
    ) -> Tuple[str, str]:
        """
        检查持仓风险
        
        Args:
            position: 持仓对象
            current_price: 当前价格
            hold_hours: 持仓时长(小时)
        
        Returns:
            (action, reason)
            action: 'FORCE_CLOSE', 'WARNING', 'OK'
        """
        # 检查止损
        if position.direction == 'long':
            if current_price <= position.stop_loss:
                msg = f"多单触及止损: 当前价{current_price:.2f} <= 止损价{position.stop_loss:.2f}"
                logger.error(msg)
                return ('FORCE_CLOSE', msg)
        else:  # short
            if current_price >= position.stop_loss:
                msg = f"空单触及止损: 当前价{current_price:.2f} >= 止损价{position.stop_loss:.2f}"
                logger.error(msg)
                return ('FORCE_CLOSE', msg)
        
        # 检查止盈
        if position.take_profit:
            if position.direction == 'long':
                if current_price >= position.take_profit:
                    msg = f"多单触及止盈: 当前价{current_price:.2f} >= 止盈价{position.take_profit:.2f}"
                    logger.info(msg)
                    return ('FORCE_CLOSE', msg)
            else:  # short
                if current_price <= position.take_profit:
                    msg = f"空单触及止盈: 当前价{current_price:.2f} <= 止盈价{position.take_profit:.2f}"
                    logger.info(msg)
                    return ('FORCE_CLOSE', msg)
        
        # 检查单笔最大亏损
        unrealized_pnl = position.unrealized_pnl
        if unrealized_pnl < self.config.single_trade_max_loss:
            msg = f"单笔亏损 {unrealized_pnl:.2f} 超过限制 {self.config.single_trade_max_loss}"
            logger.error(msg)
            return ('FORCE_CLOSE', msg)
        
        # 检查持仓时间
        if hold_hours >= self.config.max_hold_hours:
            msg = f"持仓时间 {hold_hours:.1f}h 超过最大持仓时间 {self.config.max_hold_hours}h"
            logger.warning(msg)
            return ('FORCE_CLOSE', msg)
        
        # 持仓时间预警
        if hold_hours >= self.config.warning_hold_hours:
            msg = f"持仓时间预警: {hold_hours:.1f}h (阈值: {self.config.warning_hold_hours}h)"
            logger.warning(msg)
            return ('WARNING', msg)
        
        return ('OK', '')
    
    def adjust_position_for_volatility(
        self,
        base_position_size: int,
        atr_percentile: float
    ) -> int:
        """
        根据波动率调整仓位大小
        
        高波动率 -> 减小仓位
        低波动率 -> 增大仓位
        
        Args:
            base_position_size: 基础仓位
            atr_percentile: ATR历史分位数
        
        Returns:
            调整后仓位
        """
        if atr_percentile >= self.config.high_volatility_threshold:
            # 高波动: 减小到70%
            adjusted = int(base_position_size * 0.7)
            logger.info(f"高波动调整仓位: {base_position_size} -> {adjusted}")
        elif atr_percentile <= self.config.low_volatility_threshold:
            # 低波动: 可以稍微增大
            adjusted = min(base_position_size + 1, self.config.max_position)
            logger.info(f"低波动调整仓位: {base_position_size} -> {adjusted}")
        else:
            adjusted = base_position_size
        
        # 确保在范围内
        adjusted = max(self.config.min_position, min(self.config.max_position, adjusted))
        
        return adjusted


# 测试代码
if __name__ == "__main__":
    # 初始化自适应风控器
    risk_control = AdaptiveRiskControl()
    
    # 测试1: 计算自适应止损
    print("\n=== 测试1: 自适应止损 ===")
    entry_price = 2000.0
    atr = 20.0
    
    # 低波动环境
    stop_loss_low = risk_control.calculate_adaptive_stop_loss(
        entry_price, atr, atr_percentile=15.0, direction='long', market_regime='range'
    )
    print(f"低波动止损: {stop_loss_low}")
    
    # 正常波动环境
    stop_loss_normal = risk_control.calculate_adaptive_stop_loss(
        entry_price, atr, atr_percentile=50.0, direction='long', market_regime='trend'
    )
    print(f"正常波动止损: {stop_loss_normal}")
    
    # 高波动环境
    stop_loss_high = risk_control.calculate_adaptive_stop_loss(
        entry_price, atr, atr_percentile=85.0, direction='long', market_regime='trend'
    )
    print(f"高波动止损: {stop_loss_high}")
    
    # 测试2: 计算自适应止盈
    print("\n=== 测试2: 自适应止盈 ===")
    take_profit = risk_control.calculate_adaptive_take_profit(
        entry_price, stop_loss_normal, direction='long', profit_risk_ratio=2.5
    )
    print(f"止盈价格: {take_profit}")
    
    # 测试3: Kelly仓位计算
    print("\n=== 测试3: Kelly仓位计算 ===")
    position_size = risk_control.calculate_kelly_position_size(
        account_equity=50000.0,
        win_rate=0.60,
        profit_risk_ratio=2.5
    )
    print(f"Kelly建议仓位: {position_size}手")
    
    # 测试4: 波动率调整仓位
    print("\n=== 测试4: 波动率调整仓位 ===")
    base_size = 2
    adjusted_high = risk_control.adjust_position_for_volatility(base_size, atr_percentile=85.0)
    adjusted_low = risk_control.adjust_position_for_volatility(base_size, atr_percentile=15.0)
    print(f"基础仓位: {base_size}手")
    print(f"高波动调整: {adjusted_high}手")
    print(f"低波动调整: {adjusted_low}手")
    
    print("\n✓ 自适应风控系统测试完成")
