"""
震荡市均值回归策略 (Mean Reversion Strategy)

适用场景: 震荡市 (ADX<20, 布林带收窄)
核心逻辑:
1. 价格触及布林带上下轨
2. RSI确认超买超卖
3. 订单流反转信号
4. 目标价位为布林带中轨 (快进快出)
"""

from typing import Dict, Any
from loguru import logger


class MeanReversionStrategy:
    """震荡市均值回归策略"""
    
    def __init__(self):
        self.name = "MeanReversion"
        
    def generate_signal(self, market_data: Dict[str, Any], market_regime: Dict[str, Any]) -> Dict[str, Any]:
        """
        生成交易信号
        
        Args:
            market_data: 市场数据
            market_regime: 市场状态信息
            
        Returns:
            交易信号字典
        """
        
        # 只在震荡市工作
        if market_regime['regime'] != 'range':
            return self._hold_signal(['非震荡市场'])
        
        kline_1h = market_data.get('1h', {})
        kline_15m = market_data.get('15m', {})
        order_flow = market_data.get('order_flow', {})
        
        if not all([kline_1h, kline_15m]):
            return self._hold_signal(['数据不完整'])
        
        current_price = kline_15m.get('basic', {}).get('current_price', 0)
        if current_price == 0:
            return self._hold_signal(['无效价格'])
        
        reasoning = []
        
        # 获取布林带数据
        bb_data = kline_1h.get('indicators', {}).get('bollinger', {})
        upper_band = bb_data.get('upper', current_price * 1.02)
        middle_band = bb_data.get('middle', current_price)
        lower_band = bb_data.get('lower', current_price * 0.98)
        
        # 获取RSI
        rsi = kline_1h.get('indicators', {}).get('rsi', {}).get('rsi', 50)
        
        # 获取订单流
        flow_data = order_flow.get('flow', {})
        buying_pressure = flow_data.get('buying_pressure', 0.5)
        
        action = 'hold'
        
        # 规则1: 价格触及下轨 + RSI超卖 -> 做多 (均值回归)
        distance_to_lower = (current_price - lower_band) / lower_band * 100
        if distance_to_lower < 0.5 and rsi < 35:  # 接近下轨且超卖
            if buying_pressure > 0.55:  # 订单流开始转多
                action = 'open_long'
                reasoning.append(f'价格触及下轨 (距离: {distance_to_lower:.2f}%)')
                reasoning.append(f'RSI超卖 (RSI: {rsi:.1f})')
                reasoning.append(f'订单流转多 (买压: {buying_pressure:.2f})')
        
        # 规则2: 价格触及上轨 + RSI超买 -> 做空 (均值回归)
        distance_to_upper = (upper_band - current_price) / upper_band * 100
        if distance_to_upper < 0.5 and rsi > 65:  # 接近上轨且超买
            if buying_pressure < 0.45:  # 订单流开始转空
                action = 'open_short'
                reasoning.append(f'价格触及上轨 (距离: {distance_to_upper:.2f}%)')
                reasoning.append(f'RSI超买 (RSI: {rsi:.1f})')
                reasoning.append(f'订单流转空 (买压: {buying_pressure:.2f})')
        
        if action == 'hold':
            return self._hold_signal(['未触发均值回归条件'])
        
        # 计算置信度
        confidence = self._calculate_confidence(
            price_extreme=(distance_to_lower < 0.5 or distance_to_upper < 0.5),
            rsi_extreme=(rsi < 35 or rsi > 65),
            order_flow_reversal=abs(buying_pressure - 0.5) > 0.05
        )
        
        # 止损止盈 (震荡市紧止损, 目标中轨)
        atr = kline_1h.get('indicators', {}).get('atr', {}).get('atr', current_price * 0.015)
        atr_multiplier = market_regime.get('strategy_params', {}).get('stop_loss_atr_multiplier', 1.5)
        
        if action == 'open_long':
            stop_loss = current_price - atr * atr_multiplier
            take_profit = middle_band  # 目标中轨
        else:  # open_short
            stop_loss = current_price + atr * atr_multiplier
            take_profit = middle_band
        
        # 仓位计算 (震荡市保守仓位)
        position_size = self._calculate_position_size(confidence, market_regime)
        
        signal = {
            'action': action,
            'confidence': confidence,
            'entry_price': current_price,
            'stop_loss': stop_loss,
            'take_profit': take_profit,
            'position_size': position_size,
            'reasoning': reasoning,
            'source': 'quant',
            'strategy': self.name
        }
        
        logger.info(f"[{self.name}] 生成信号: {action}, 置信度: {confidence:.2f}")
        
        return signal
    
    def _calculate_confidence(self, price_extreme: bool, rsi_extreme: bool, 
                            order_flow_reversal: bool) -> float:
        """计算信号置信度"""
        score = 0.0
        
        if price_extreme:
            score += 0.35
        if rsi_extreme:
            score += 0.35
        if order_flow_reversal:
            score += 0.30
        
        return min(score, 1.0)
    
    def _calculate_position_size(self, confidence: float, market_regime: Dict[str, Any]) -> int:
        """计算仓位"""
        sizing_mode = market_regime.get('strategy_params', {}).get('position_sizing', 'conservative')
        
        # 震荡市默认保守
        base_size = 1
        
        # 高置信度可以增加1手
        if confidence > 0.80:
            base_size = 2
        
        return base_size
    
    def _hold_signal(self, reasoning: list) -> Dict[str, Any]:
        """返回持仓信号"""
        return {
            'action': 'hold',
            'confidence': 0.0,
            'reasoning': reasoning,
            'source': 'quant',
            'strategy': self.name
        }
