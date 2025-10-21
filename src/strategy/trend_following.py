"""
趋势跟踪策略 (Trend Following Strategy)

适用场景: 强趋势市 (ADX>25)
核心逻辑:
1. 多周期趋势一致性确认 (1h/4h/1d同向)
2. 价格回调至均线附近 (买点)
3. 订单流确认 (主动买入>60%)
4. 进场后趋势跟踪 (移动止损)
"""

from typing import Dict, Any
from loguru import logger


class TrendFollowingStrategy:
    """趋势跟踪策略"""
    
    def __init__(self):
        self.name = "TrendFollowing"
        
    def generate_signal(self, market_data: Dict[str, Any], market_regime: Dict[str, Any]) -> Dict[str, Any]:
        """
        生成交易信号
        
        Args:
            market_data: 市场数据
            market_regime: 市场状态信息
            
        Returns:
            {
                'action': 'open_long' | 'open_short' | 'hold',
                'confidence': 0.0-1.0,
                'entry_price': float,
                'stop_loss': float,
                'take_profit': float,
                'position_size': int,
                'reasoning': [str],
                'source': 'quant'
            }
        """
        
        # 只在趋势市工作
        if market_regime['regime'] != 'trend':
            return self._hold_signal(['非趋势市场'])
        
        # 提取数据
        kline_1d = market_data.get('1d', {})
        kline_4h = market_data.get('4h', {})
        kline_1h = market_data.get('1h', {})
        kline_15m = market_data.get('15m', {})
        order_flow = market_data.get('order_flow', {})
        
        if not all([kline_1d, kline_4h, kline_1h, kline_15m]):
            return self._hold_signal(['数据不完整'])
        
        current_price = kline_15m.get('basic', {}).get('current_price', 0)
        if current_price == 0:
            return self._hold_signal(['无效价格'])
        
        reasoning = []
        
        # 步骤1: 多周期趋势一致性
        trend_1d = kline_1d.get('trend', {}).get('direction', 'neutral')
        trend_4h = kline_4h.get('trend', {}).get('direction', 'neutral')
        trend_1h = kline_1h.get('trend', {}).get('direction', 'neutral')
        
        if trend_1d == trend_4h == trend_1h and trend_1d != 'neutral':
            reasoning.append(f'多周期趋势一致: {trend_1d}')
            direction = trend_1d
        else:
            return self._hold_signal(['多周期趋势不一致'])
        
        # 步骤2: 回调确认
        indicators_1h = kline_1h.get('indicators', {})
        ma20 = indicators_1h.get('ma', {}).get('ma20', current_price)
        ma60 = indicators_1h.get('ma', {}).get('ma60', current_price)
        
        if direction == 'uptrend':
            # 做多: 回调至MA20附近, 但在MA60上方
            pullback_to_ma20 = abs(current_price - ma20) / ma20 * 100 < 1.0
            above_ma60 = current_price > ma60
            
            if not (pullback_to_ma20 and above_ma60):
                return self._hold_signal(['未回调至买点'])
            
            reasoning.append('价格回调至MA20附近且在MA60上方')
            action = 'open_long'
            
        elif direction == 'downtrend':
            # 做空: 反弹至MA20附近, 但在MA60下方
            pullback_to_ma20 = abs(current_price - ma20) / ma20 * 100 < 1.0
            below_ma60 = current_price < ma60
            
            if not (pullback_to_ma20 and below_ma60):
                return self._hold_signal(['未回调至卖点'])
            
            reasoning.append('价格反弹至MA20附近且在MA60下方')
            action = 'open_short'
        else:
            return self._hold_signal(['趋势方向不明确'])
        
        # 步骤3: 订单流确认
        flow_data = order_flow.get('flow', {})
        buying_pressure = flow_data.get('buying_pressure', 0.5)
        
        if action == 'open_long' and buying_pressure < 0.6:
            return self._hold_signal(['订单流未确认多头'])
        
        if action == 'open_short' and buying_pressure > 0.4:
            return self._hold_signal(['订单流未确认空头'])
        
        reasoning.append(f'订单流确认 (买压: {buying_pressure:.2f})')
        
        # 步骤4: RSI过滤 (避免追高杀跌)
        rsi = indicators_1h.get('rsi', {}).get('rsi', 50)
        if action == 'open_long' and rsi > 70:
            return self._hold_signal(['RSI超买，避免追高'])
        
        if action == 'open_short' and rsi < 30:
            return self._hold_signal(['RSI超卖，避免杀跌'])
        
        reasoning.append(f'RSI过滤通过 (RSI: {rsi:.1f})')
        
        # 计算置信度
        confidence = self._calculate_confidence(
            trend_consistency=(trend_1d == trend_4h == trend_1h),
            pullback_quality=True,
            order_flow_score=abs(buying_pressure - 0.5) * 2,
            rsi_ok=True
        )
        
        # 计算止损止盈
        atr = indicators_1h.get('atr', {}).get('atr', current_price * 0.02)
        atr_multiplier = market_regime.get('strategy_params', {}).get('stop_loss_atr_multiplier', 2.5)
        tp_ratio = market_regime.get('strategy_params', {}).get('take_profit_ratio', 2.5)
        
        if action == 'open_long':
            stop_loss = current_price - atr * atr_multiplier
            take_profit = current_price + atr * atr_multiplier * tp_ratio
        else:  # open_short
            stop_loss = current_price + atr * atr_multiplier
            take_profit = current_price - atr * atr_multiplier * tp_ratio
        
        # 仓位计算 (趋势市激进仓位)
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
    
    def _calculate_confidence(self, trend_consistency: bool, pullback_quality: bool, 
                            order_flow_score: float, rsi_ok: bool) -> float:
        """计算信号置信度"""
        score = 0.0
        
        if trend_consistency:
            score += 0.3
        if pullback_quality:
            score += 0.2
        score += order_flow_score * 0.3  # 订单流权重30%
        if rsi_ok:
            score += 0.2
        
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
        if confidence < 0.7:
            base_size = max(1, base_size - 1)
        elif confidence > 0.85:
            base_size = min(3, base_size + 1)
        
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
