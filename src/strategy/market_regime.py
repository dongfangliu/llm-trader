"""
市场状态识别器 (Market Regime Detector)

负责识别市场所处的状态：趋势、震荡、突破、异常
并为每个状态推荐合适的策略参数
"""

from typing import Dict, Any, Optional
from loguru import logger


class MarketRegimeDetector:
    """
    市场状态识别器
    
    识别4种市场状态：
    1. 趋势市 (trend): ADX>25, 价格远离均线
    2. 震荡市 (range): ADX<20, 布林带收窄, 价格在均线附近
    3. 突破市 (breakout): 价格接近关键位 + 成交量放大
    4. 异常市 (abnormal): 波动率暴增 or 流动性枯竭
    """
    
    def __init__(self):
        self.current_regime: Optional[str] = None
        self.regime_confidence: float = 0.0
        self.regime_duration: int = 0  # 状态持续周期数
        self.liquidity_history = []  # 用于计算流动性Z分数
        
    def detect(self, market_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        检测当前市场状态
        
        Args:
            market_data: 市场数据字典，包含:
                - '1h': 1小时K线数据和指标
                - '4h': 4小时K线数据
                - 'order_flow': 订单流数据
                
        Returns:
            {
                'regime': str,  # 'trend', 'range', 'breakout', 'abnormal'
                'confidence': float,  # 0-1
                'duration': int,  # 状态持续周期数
                'characteristics': dict,  # 状态特征
                'strategy_params': dict,  # 推荐的策略参数
            }
        """
        
        kline_1h = market_data.get('1h', {})
        order_flow = market_data.get('order_flow', {})
        
        if not kline_1h:
            logger.warning("缺少1小时K线数据，无法识别市场状态")
            return self._default_regime()
        
        # 提取关键指标
        indicators = kline_1h.get('indicators', {})
        basic = kline_1h.get('basic', {})
        
        # ADX (趋势强度)
        adx = indicators.get('adx', {}).get('adx', 20)
        
        # ATR波动率
        atr = indicators.get('atr', {}).get('atr', 0)
        atr_pct = indicators.get('atr', {}).get('atr_pct', 2.0)
        
        # 价格与MA20距离
        price = basic.get('current_price', 0)
        ma20 = indicators.get('ma', {}).get('ma20', price)
        distance_pct = abs(price - ma20) / ma20 * 100 if ma20 > 0 else 0
        
        # 布林带宽度
        bb_width = indicators.get('bollinger', {}).get('width', 3.0)
        
        # 成交量比率
        volume_ratio = indicators.get('volume', {}).get('ratio', 1.0)
        
        # 流动性评估
        depth_data = order_flow.get('depth', {})
        liquidity = depth_data.get('total_depth', 0)
        liquidity_z_score = self._calculate_liquidity_zscore(liquidity)
        
        # 状态识别逻辑
        regime = 'range'  # 默认震荡
        confidence = 0.5
        characteristics = {}
        strategy_params = {}
        
        # 规则1: 趋势市识别
        if adx > 25 and distance_pct > 3:
            regime = 'trend'
            confidence = min((adx - 25) / 25, 1.0)
            characteristics = {
                'trend_strength': 'strong' if adx > 35 else 'moderate',
                'direction': 'up' if price > ma20 else 'down',
                'volatility': 'high' if atr_pct > 3 else 'normal'
            }
            strategy_params = {
                'primary_strategy': 'trend_following',
                'signal_threshold': 0.65,
                'stop_loss_atr_multiplier': 2.5,
                'take_profit_ratio': 2.5,
                'position_sizing': 'aggressive'
            }
        
        # 规则2: 震荡市识别
        elif adx < 20 and bb_width < 3 and distance_pct < 2:
            regime = 'range'
            confidence = (20 - adx) / 20
            characteristics = {
                'range_tight': bb_width < 2,
                'center': ma20,
                'volatility': 'low'
            }
            strategy_params = {
                'primary_strategy': 'mean_reversion',
                'signal_threshold': 0.75,
                'stop_loss_atr_multiplier': 1.5,
                'take_profit_ratio': 1.2,
                'position_sizing': 'conservative'
            }
        
        # 规则3: 突破市识别
        elif self._near_key_level(price, kline_1h.get('key_levels', {})) and volume_ratio > 1.5:
            regime = 'breakout'
            confidence = min(volume_ratio / 2.0, 1.0)
            
            buying_pressure = order_flow.get('flow', {}).get('buying_pressure', 0.5)
            characteristics = {
                'breakout_direction': 'up' if volume_ratio > 2 and buying_pressure > 0.6 else 'down',
                'volume_confirmation': volume_ratio > 2,
                'key_level_nearby': True
            }
            strategy_params = {
                'primary_strategy': 'breakout',
                'signal_threshold': 0.80,
                'stop_loss_atr_multiplier': 1.8,
                'take_profit_ratio': 3.0,
                'position_sizing': 'moderate'
            }
        
        # 规则4: 异常市识别 (波动率暴增 or 流动性枯竭)
        elif atr_pct > 5 or liquidity_z_score < -2:
            regime = 'abnormal'
            confidence = 1.0
            characteristics = {
                'volatility_spike': atr_pct > 5,
                'liquidity_crisis': liquidity_z_score < -2,
                'risk_level': 'extreme'
            }
            strategy_params = {
                'primary_strategy': 'defensive',
                'signal_threshold': 0.90,
                'stop_loss_atr_multiplier': 1.0,
                'take_profit_ratio': 1.0,
                'position_sizing': 'minimal',
                'use_llm': True
            }
        
        else:
            # 不确定状态，保持上一状态
            regime = self.current_regime or 'range'
            confidence = 0.3
            characteristics = {'uncertain': True}
            strategy_params = {
                'primary_strategy': 'hold',
                'signal_threshold': 0.85
            }
        
        # 更新状态持续时间
        if regime == self.current_regime:
            self.regime_duration += 1
        else:
            self.regime_duration = 1
        
        self.current_regime = regime
        self.regime_confidence = confidence
        
        result = {
            'regime': regime,
            'confidence': confidence,
            'duration': self.regime_duration,
            'characteristics': characteristics,
            'strategy_params': strategy_params
        }
        
        logger.info(f"市场状态: {regime} (置信度: {confidence:.2f}, 持续: {self.regime_duration}周期)")
        
        return result
    
    def _near_key_level(self, price: float, key_levels: Dict[str, list], threshold: float = 0.5) -> bool:
        """判断价格是否接近关键位 (±0.5%范围内)"""
        if not key_levels:
            return False
        
        support_levels = key_levels.get('support', [])
        resistance_levels = key_levels.get('resistance', [])
        all_levels = support_levels + resistance_levels
        
        for level in all_levels:
            if abs(price - level) / price * 100 < threshold:
                return True
        
        return False
    
    def _calculate_liquidity_zscore(self, current_liquidity: float) -> float:
        """计算流动性Z分数"""
        # 维护最近100个流动性数据点
        self.liquidity_history.append(current_liquidity)
        if len(self.liquidity_history) > 100:
            self.liquidity_history.pop(0)
        
        if len(self.liquidity_history) < 10:
            return 0.0  # 数据不足，返回中性
        
        # 计算Z分数
        import numpy as np
        mean = np.mean(self.liquidity_history)
        std = np.std(self.liquidity_history)
        
        if std == 0:
            return 0.0
        
        z_score = (current_liquidity - mean) / std
        return z_score
    
    def _default_regime(self) -> Dict[str, Any]:
        """返回默认状态 (震荡市)"""
        return {
            'regime': 'range',
            'confidence': 0.3,
            'duration': 0,
            'characteristics': {'default': True},
            'strategy_params': {
                'primary_strategy': 'hold',
                'signal_threshold': 0.85
            }
        }
