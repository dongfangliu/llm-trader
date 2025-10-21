"""
突破策略 (Breakout Strategy)

适用场景: 价格接近关键位 + 成交量放大
核心逻辑:
1. 识别关键支撑阻力位
2. 价格接近关键位 (±0.5%)
3. 成交量放大确认 (>1.5倍)
4. 订单流验证突破真实性
5. 假突破过滤
"""

from typing import Dict, Any
from loguru import logger


class BreakoutStrategy:
    """突破策略"""
    
    def __init__(self):
        self.name = "Breakout"
        
    def generate_signal(self, market_data: Dict[str, Any], market_regime: Dict[str, Any]) -> Dict[str, Any]:
        """
        生成交易信号
        
        Args:
            market_data: 市场数据
            market_regime: 市场状态信息
            
        Returns:
            交易信号字典
        """
        
        # 只在突破市工作
        if market_regime['regime'] != 'breakout':
            return self._hold_signal(['非突破市场'])
        
        kline_4h = market_data.get('4h', {})
        kline_1h = market_data.get('1h', {})
        kline_15m = market_data.get('15m', {})
        order_flow = market_data.get('order_flow', {})
        
        if not all([kline_4h, kline_1h, kline_15m]):
            return self._hold_signal(['数据不完整'])
        
        current_price = kline_15m.get('basic', {}).get('current_price', 0)
        if current_price == 0:
            return self._hold_signal(['无效价格'])
        
        reasoning = []
        
        # 获取关键位
        key_levels = kline_1h.get('key_levels', {})
        support_levels = key_levels.get('support', [])
        resistance_levels = key_levels.get('resistance', [])
        
        # 获取成交量数据
        volume_ratio = kline_15m.get('indicators', {}).get('volume', {}).get('ratio', 1.0)
        
        # 获取订单流
        flow_data = order_flow.get('flow', {})
        buying_pressure = flow_data.get('buying_pressure', 0.5)
        
        # 判断突破方向
        action = 'hold'
        nearest_level = None
        level_type = None
        
        # 检查是否接近阻力位 (向上突破)
        for resistance in resistance_levels:
            distance_pct = (resistance - current_price) / current_price * 100
            if -0.5 < distance_pct < 1.0:  # 接近或刚突破
                nearest_level = resistance
                level_type = 'resistance'
                
                # 突破确认条件
                if current_price > resistance and volume_ratio > 1.5 and buying_pressure > 0.6:
                    action = 'open_long'
                    reasoning.append(f'向上突破阻力位 {resistance:.2f}')
                    reasoning.append(f'成交量放大 {volume_ratio:.2f}x')
                    reasoning.append(f'订单流确认 (买压: {buying_pressure:.2f})')
                    break
        
        # 检查是否接近支撑位 (向下突破)
        if action == 'hold':
            for support in support_levels:
                distance_pct = (current_price - support) / support * 100
                if -0.5 < distance_pct < 1.0:  # 接近或刚突破
                    nearest_level = support
                    level_type = 'support'
                    
                    # 突破确认条件
                    if current_price < support and volume_ratio > 1.5 and buying_pressure < 0.4:
                        action = 'open_short'
                        reasoning.append(f'向下突破支撑位 {support:.2f}')
                        reasoning.append(f'成交量放大 {volume_ratio:.2f}x')
                        reasoning.append(f'订单流确认 (买压: {buying_pressure:.2f})')
                        break
        
        if action == 'hold':
            return self._hold_signal(['未触发突破条件'])
        
        # 假突破过滤
        if not self._validate_breakout(kline_15m, action, nearest_level):
            return self._hold_signal(['疑似假突破'])
        
        reasoning.append('假突破过滤通过')
        
        # 计算置信度
        confidence = self._calculate_confidence(
            volume_ratio=volume_ratio,
            order_flow_strength=abs(buying_pressure - 0.5) * 2,
            price_momentum=self._calculate_momentum(kline_15m)
        )
        
        # 止损止盈 (突破成功后大空间)
        atr = kline_1h.get('indicators', {}).get('atr', {}).get('atr', current_price * 0.02)
        atr_multiplier = market_regime.get('strategy_params', {}).get('stop_loss_atr_multiplier', 1.8)
        tp_ratio = market_regime.get('strategy_params', {}).get('take_profit_ratio', 3.0)
        
        if action == 'open_long':
            stop_loss = nearest_level - atr * 0.5  # 止损设在关键位下方
            take_profit = current_price + atr * atr_multiplier * tp_ratio
        else:  # open_short
            stop_loss = nearest_level + atr * 0.5  # 止损设在关键位上方
            take_profit = current_price - atr * atr_multiplier * tp_ratio
        
        # 仓位计算
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
            'strategy': self.name,
            'breakout_level': nearest_level,
            'level_type': level_type
        }
        
        logger.info(f"[{self.name}] 生成信号: {action}, 置信度: {confidence:.2f}, 突破位: {nearest_level}")
        
        return signal
    
    def _validate_breakout(self, kline_15m: Dict[str, Any], action: str, level: float) -> bool:
        """验证突破真实性 (过滤假突破)"""
        current_price = kline_15m.get('basic', {}).get('current_price', 0)
        
        # 简单验证: 突破幅度需要超过0.3%
        if action == 'open_long':
            breakout_strength = (current_price - level) / level * 100
            return breakout_strength > 0.3
        else:  # open_short
            breakout_strength = (level - current_price) / level * 100
            return breakout_strength > 0.3
    
    def _calculate_momentum(self, kline_15m: Dict[str, Any]) -> float:
        """计算价格动量"""
        # 简化实现: 使用MACD柱状图
        macd_data = kline_15m.get('indicators', {}).get('macd', {})
        histogram = macd_data.get('histogram', 0)
        
        # 归一化到0-1
        momentum = min(abs(histogram) / 20, 1.0)
        return momentum
    
    def _calculate_confidence(self, volume_ratio: float, order_flow_strength: float, 
                            price_momentum: float) -> float:
        """计算信号置信度"""
        score = 0.0
        
        # 成交量权重40%
        score += min(volume_ratio / 3.0, 0.4)
        
        # 订单流权重35%
        score += order_flow_strength * 0.35
        
        # 价格动量权重25%
        score += price_momentum * 0.25
        
        return min(score, 1.0)
    
    def _calculate_position_size(self, confidence: float, market_regime: Dict[str, Any]) -> int:
        """计算仓位"""
        sizing_mode = market_regime.get('strategy_params', {}).get('position_sizing', 'moderate')
        
        if sizing_mode == 'aggressive':
            base_size = 3
        elif sizing_mode == 'conservative':
            base_size = 1
        else:  # moderate
            base_size = 2
        
        # 根据置信度调整
        if confidence < 0.75:
            base_size = max(1, base_size - 1)
        
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
