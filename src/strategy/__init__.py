"""
量化策略模块

提供市场状态识别和多种交易策略
"""

from .market_regime import MarketRegimeDetector
from .trend_following import TrendFollowingStrategy
from .mean_reversion import MeanReversionStrategy
from .breakout import BreakoutStrategy
from .signal_router import SignalRouter

__all__ = [
    'MarketRegimeDetector',
    'TrendFollowingStrategy',
    'MeanReversionStrategy',
    'BreakoutStrategy',
    'SignalRouter',
]
