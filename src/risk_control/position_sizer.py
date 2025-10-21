"""
智能仓位计算器
根据ATR、置信度、市场状态、账户风险动态计算最优仓位

特性:
1. Kelly公式仓位优化
2. 波动率自适应
3. 置信度加权
4. 账户风险预算管理
"""

from typing import Dict, Optional
from dataclasses import dataclass
from loguru import logger
import numpy as np


@dataclass
class PositionSizerConfig:
    """仓位计算器配置"""
    # 基础配置
    min_position: int = 1      # 最小仓位
    max_position: int = 3      # 最大仓位
    default_position: int = 1  # 默认仓位
    
    # Kelly公式
    kelly_fraction: float = 0.25  # Kelly分数 (保守: 25%)
    min_win_rate: float = 0.50    # 最低胜率要求
    min_profit_loss_ratio: float = 1.5  # 最低盈亏比要求
    
    # 置信度加权
    confidence_weight: float = 0.3  # 置信度权重
    min_confidence: float = 0.70    # 最低置信度要求
    
    # 风险预算
    max_risk_per_trade: float = 0.02  # 单笔最大风险 (2%账户)
    max_total_risk: float = 0.06      # 总风险敞口 (6%账户)
    
    # 市场状态调整
    regime_multipliers: Dict[str, float] = None  # 市场状态仓位倍数
    
    def __post_init__(self):
        if self.regime_multipliers is None:
            self.regime_multipliers = {
                'trend': 1.0,      # 趋势市: 正常仓位
                'range': 0.7,      # 震荡市: 减小仓位
                'breakout': 1.2,   # 突破市: 稍微增大
                'abnormal': 0.5    # 异常市: 大幅减小
            }


class PositionSizer:
    """智能仓位计算器"""
    
    def __init__(self, config: PositionSizerConfig = None):
        """
        初始化仓位计算器
        
        Args:
            config: 仓位计算器配置
        """
        self.config = config or PositionSizerConfig()
        logger.info("智能仓位计算器初始化完成")
        logger.info(f"  仓位范围: {self.config.min_position}-{self.config.max_position}手")
        logger.info(f"  Kelly分数: {self.config.kelly_fraction}")
        logger.info(f"  单笔风险: {self.config.max_risk_per_trade * 100}%")
    
    def calculate_position_size(
        self,
        account_equity: float,
        entry_price: float,
        stop_loss: float,
        confidence: float,
        market_regime: str = 'trend',
        win_rate: Optional[float] = None,
        profit_loss_ratio: Optional[float] = None,
        current_risk_exposure: float = 0.0,
        atr_percentile: Optional[float] = None
    ) -> int:
        """
        计算最优仓位大小
        
        Args:
            account_equity: 账户权益
            entry_price: 入场价格
            stop_loss: 止损价格
            confidence: 信号置信度 (0-1)
            market_regime: 市场状态 ('trend', 'range', 'breakout', 'abnormal')
            win_rate: 历史胜率 (可选)
            profit_loss_ratio: 历史盈亏比 (可选)
            current_risk_exposure: 当前风险敞口 (占账户比例)
            atr_percentile: ATR分位数 (可选，用于波动率调整)
        
        Returns:
            建议仓位手数
        """
        logger.info(f"开始计算仓位: 账户权益={account_equity:.2f}, 入场价={entry_price:.2f}, "
                   f"止损={stop_loss:.2f}, 置信度={confidence:.2%}")
        
        # 1. 基础风险计算
        base_position = self._calculate_risk_based_position(
            account_equity, entry_price, stop_loss
        )
        logger.debug(f"  基础风险仓位: {base_position}手")
        
        # 2. Kelly公式调整 (如果提供了胜率和盈亏比)
        if win_rate and profit_loss_ratio:
            kelly_position = self._calculate_kelly_position(
                account_equity, win_rate, profit_loss_ratio, entry_price, stop_loss
            )
            logger.debug(f"  Kelly仓位: {kelly_position}手")
            # 取两者较小值 (更保守)
            base_position = min(base_position, kelly_position)
        
        # 3. 置信度加权
        confidence_adjusted = self._adjust_for_confidence(base_position, confidence)
        logger.debug(f"  置信度调整后: {confidence_adjusted}手")
        
        # 4. 市场状态调整
        regime_adjusted = self._adjust_for_market_regime(confidence_adjusted, market_regime)
        logger.debug(f"  市场状态调整后: {regime_adjusted}手")
        
        # 5. 波动率调整 (如果提供了ATR分位数)
        if atr_percentile is not None:
            volatility_adjusted = self._adjust_for_volatility(regime_adjusted, atr_percentile)
            logger.debug(f"  波动率调整后: {volatility_adjusted}手")
        else:
            volatility_adjusted = regime_adjusted
        
        # 6. 风险预算检查
        final_position = self._check_risk_budget(
            volatility_adjusted, account_equity, entry_price, stop_loss, current_risk_exposure
        )
        logger.debug(f"  风险预算检查后: {final_position}手")
        
        # 7. 最终限制
        final_position = max(self.config.min_position, min(self.config.max_position, final_position))
        
        logger.info(f"最终仓位: {final_position}手")
        
        return final_position
    
    def _calculate_risk_based_position(
        self,
        account_equity: float,
        entry_price: float,
        stop_loss: float
    ) -> int:
        """
        基于风险计算仓位
        
        风险金额 = 账户权益 × 风险比例
        仓位 = 风险金额 / (入场价 - 止损价) / 每手乘数
        
        Args:
            account_equity: 账户权益
            entry_price: 入场价格
            stop_loss: 止损价格
        
        Returns:
            仓位手数
        """
        # 计算允许的风险金额
        max_risk_amount = account_equity * self.config.max_risk_per_trade
        
        # 计算每手风险
        price_risk = abs(entry_price - stop_loss)
        contract_multiplier = 5  # 纯碱: 5吨/手
        risk_per_lot = price_risk * contract_multiplier
        
        # 计算仓位
        position = int(max_risk_amount / risk_per_lot)
        
        logger.debug(f"    风险金额: {max_risk_amount:.2f}, 每手风险: {risk_per_lot:.2f}, 仓位: {position}手")
        
        return max(1, position)
    
    def _calculate_kelly_position(
        self,
        account_equity: float,
        win_rate: float,
        profit_loss_ratio: float,
        entry_price: float,
        stop_loss: float
    ) -> int:
        """
        使用Kelly公式计算仓位
        
        Kelly公式: f = (p * b - q) / b
        其中:
            p = 胜率
            q = 败率 = 1 - p
            b = 盈亏比
            f = 建议仓位比例
        
        Args:
            account_equity: 账户权益
            win_rate: 胜率
            profit_loss_ratio: 盈亏比
            entry_price: 入场价格
            stop_loss: 止损价格
        
        Returns:
            仓位手数
        """
        # 检查最低要求
        if win_rate < self.config.min_win_rate:
            logger.warning(f"胜率{win_rate:.2%}低于最低要求{self.config.min_win_rate:.2%}, 使用最小仓位")
            return self.config.min_position
        
        if profit_loss_ratio < self.config.min_profit_loss_ratio:
            logger.warning(f"盈亏比{profit_loss_ratio:.2f}低于最低要求{self.config.min_profit_loss_ratio:.2f}, 使用最小仓位")
            return self.config.min_position
        
        # Kelly公式
        p = win_rate
        q = 1 - p
        b = profit_loss_ratio
        
        kelly_fraction_full = (p * b - q) / b
        
        # 保守调整
        kelly_fraction_conservative = kelly_fraction_full * self.config.kelly_fraction
        
        # 限制范围
        kelly_fraction_conservative = max(0.0, min(1.0, kelly_fraction_conservative))
        
        # 计算仓位
        price_risk = abs(entry_price - stop_loss)
        contract_multiplier = 5
        risk_per_lot = price_risk * contract_multiplier
        
        # Kelly建议的风险金额
        kelly_risk_amount = account_equity * kelly_fraction_conservative
        
        # 转换为手数
        position = int(kelly_risk_amount / risk_per_lot)
        
        logger.debug(f"    Kelly: p={p:.2%}, b={b:.2f}, f={kelly_fraction_full:.2%}, "
                    f"保守f={kelly_fraction_conservative:.2%}, 仓位={position}手")
        
        return max(1, position)
    
    def _adjust_for_confidence(self, base_position: int, confidence: float) -> int:
        """
        根据置信度调整仓位
        
        置信度越高，仓位越大
        
        Args:
            base_position: 基础仓位
            confidence: 置信度 (0-1)
        
        Returns:
            调整后仓位
        """
        if confidence < self.config.min_confidence:
            logger.warning(f"置信度{confidence:.2%}低于最低要求{self.config.min_confidence:.2%}, 使用最小仓位")
            return self.config.min_position
        
        # 置信度加权: 0.7->0.85, 0.85->1.0, 1.0->1.15
        confidence_factor = 0.7 + (confidence - self.config.min_confidence) * self.config.confidence_weight / (1 - self.config.min_confidence)
        
        adjusted = int(base_position * confidence_factor)
        
        return max(1, adjusted)
    
    def _adjust_for_market_regime(self, base_position: int, market_regime: str) -> int:
        """
        根据市场状态调整仓位
        
        Args:
            base_position: 基础仓位
            market_regime: 市场状态
        
        Returns:
            调整后仓位
        """
        multiplier = self.config.regime_multipliers.get(market_regime, 1.0)
        adjusted = int(base_position * multiplier)
        
        logger.debug(f"    市场状态={market_regime}, 倍数={multiplier}, 调整={adjusted}手")
        
        return max(1, adjusted)
    
    def _adjust_for_volatility(self, base_position: int, atr_percentile: float) -> int:
        """
        根据波动率调整仓位
        
        高波动率 -> 减小仓位
        低波动率 -> 可以增大仓位
        
        Args:
            base_position: 基础仓位
            atr_percentile: ATR历史分位数 (0-100)
        
        Returns:
            调整后仓位
        """
        if atr_percentile >= 80:
            # 高波动: 减小到70%
            adjusted = int(base_position * 0.7)
            logger.debug(f"    高波动(ATR分位{atr_percentile:.1f}%), 减小到70%")
        elif atr_percentile <= 20:
            # 低波动: 可以增大
            adjusted = min(base_position + 1, self.config.max_position)
            logger.debug(f"    低波动(ATR分位{atr_percentile:.1f}%), 增大仓位")
        else:
            adjusted = base_position
        
        return max(1, adjusted)
    
    def _check_risk_budget(
        self,
        position: int,
        account_equity: float,
        entry_price: float,
        stop_loss: float,
        current_risk_exposure: float
    ) -> int:
        """
        检查风险预算
        
        确保新仓位不会导致总风险敞口超限
        
        Args:
            position: 建议仓位
            account_equity: 账户权益
            entry_price: 入场价格
            stop_loss: 止损价格
            current_risk_exposure: 当前风险敞口 (占账户比例)
        
        Returns:
            符合风险预算的仓位
        """
        # 计算新仓位的风险
        price_risk = abs(entry_price - stop_loss)
        contract_multiplier = 5
        new_risk_amount = price_risk * contract_multiplier * position
        new_risk_ratio = new_risk_amount / account_equity
        
        # 检查总风险敞口
        total_risk = current_risk_exposure + new_risk_ratio
        
        if total_risk > self.config.max_total_risk:
            # 减小仓位以满足风险预算
            max_new_risk = self.config.max_total_risk - current_risk_exposure
            max_position = int(max_new_risk * account_equity / (price_risk * contract_multiplier))
            max_position = max(0, max_position)
            
            logger.warning(f"风险预算超限: 当前风险{current_risk_exposure:.2%}, "
                         f"新增风险{new_risk_ratio:.2%}, 总风险{total_risk:.2%}, "
                         f"限制仓位: {position} -> {max_position}手")
            
            return max_position
        
        logger.debug(f"    风险预算检查: 当前风险{current_risk_exposure:.2%}, "
                    f"新增风险{new_risk_ratio:.2%}, 总风险{total_risk:.2%} (< {self.config.max_total_risk:.2%})")
        
        return position
    
    def get_max_position_for_regime(self, market_regime: str) -> int:
        """
        获取特定市场状态下的最大仓位
        
        Args:
            market_regime: 市场状态
        
        Returns:
            最大仓位手数
        """
        multiplier = self.config.regime_multipliers.get(market_regime, 1.0)
        max_pos = int(self.config.max_position * multiplier)
        
        return max(self.config.min_position, max_pos)


# 测试代码
if __name__ == "__main__":
    # 初始化仓位计算器
    sizer = PositionSizer()
    
    # 测试场景1: 趋势市 + 高置信度
    print("\n=== 测试1: 趋势市 + 高置信度 ===")
    position = sizer.calculate_position_size(
        account_equity=50000.0,
        entry_price=2000.0,
        stop_loss=1960.0,
        confidence=0.85,
        market_regime='trend',
        win_rate=0.60,
        profit_loss_ratio=2.5,
        current_risk_exposure=0.02,
        atr_percentile=50.0
    )
    print(f"建议仓位: {position}手\n")
    
    # 测试场景2: 震荡市 + 中等置信度
    print("=== 测试2: 震荡市 + 中等置信度 ===")
    position = sizer.calculate_position_size(
        account_equity=50000.0,
        entry_price=2000.0,
        stop_loss=1970.0,
        confidence=0.75,
        market_regime='range',
        win_rate=0.55,
        profit_loss_ratio=1.8,
        current_risk_exposure=0.03,
        atr_percentile=30.0
    )
    print(f"建议仓位: {position}手\n")
    
    # 测试场景3: 异常市 + 低置信度
    print("=== 测试3: 异常市 + 低置信度 ===")
    position = sizer.calculate_position_size(
        account_equity=50000.0,
        entry_price=2000.0,
        stop_loss=1950.0,
        confidence=0.72,
        market_regime='abnormal',
        current_risk_exposure=0.04,
        atr_percentile=85.0
    )
    print(f"建议仓位: {position}手\n")
    
    # 测试场景4: 风险预算超限
    print("=== 测试4: 风险预算超限 ===")
    position = sizer.calculate_position_size(
        account_equity=50000.0,
        entry_price=2000.0,
        stop_loss=1960.0,
        confidence=0.90,
        market_regime='breakout',
        current_risk_exposure=0.055,  # 已经接近6%的总风险上限
        atr_percentile=60.0
    )
    print(f"建议仓位: {position}手 (风险预算限制)\n")
    
    # 测试场景5: 高波动 + 突破市
    print("=== 测试5: 高波动 + 突破市 ===")
    position = sizer.calculate_position_size(
        account_equity=50000.0,
        entry_price=2000.0,
        stop_loss=1970.0,
        confidence=0.88,
        market_regime='breakout',
        win_rate=0.65,
        profit_loss_ratio=3.0,
        current_risk_exposure=0.01,
        atr_percentile=82.0  # 高波动
    )
    print(f"建议仓位: {position}手\n")
    
    print("✓ 智能仓位计算器测试完成")
