"""
Pydantic数据模型
"""

from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from enum import Enum


# ==================== 枚举 ====================

class Period(str, Enum):
    MIN_1 = '1m'
    MIN_5 = '5m'
    MIN_15 = '15m'
    HOUR_1 = '1h'
    HOUR_4 = '4h'
    DAY_1 = '1d'


class Action(str, Enum):
    OPEN_LONG = 'open_long'
    OPEN_SHORT = 'open_short'
    CLOSE_LONG = 'close_long'
    CLOSE_SHORT = 'close_short'
    HOLD = 'hold'


class MarketRegime(str, Enum):
    TREND = 'trend'
    RANGING = 'ranging'
    BREAKOUT = 'breakout'
    ABNORMAL = 'abnormal'
    UNKNOWN = 'unknown'


# ==================== 响应模型 ====================

class StandardResponse(BaseModel):
    """标准响应格式"""
    code: int = 200
    message: str = "success"
    data: Optional[dict] = None


class KlineData(BaseModel):
    """K线数据"""
    timestamp: str
    open: float
    high: float
    low: float
    close: float
    volume: int


class AccountInfo(BaseModel):
    """账户信息"""
    balance: float
    equity: float
    pnl: float
    pnl_percent: float
    drawdown: float
    positions_count: int
    timestamp: str


class PositionInfo(BaseModel):
    """持仓信息"""
    symbol: str
    direction: str
    volume: int
    entry_price: float
    current_price: float
    pnl: float
    pnl_percent: float


class SignalInfo(BaseModel):
    """信号信息"""
    action: Action
    confidence: float = Field(ge=0, le=1)
    source: str
    strategy: Optional[str] = None
    reasoning: Optional[str] = None
    timestamp: str


class MarketRegimeInfo(BaseModel):
    """市场状态"""
    regime: MarketRegime
    confidence: float
    adx: float
    atr: float
    volatility: float


class SystemStatus(BaseModel):
    """系统状态"""
    data_fetcher: str
    llm_engine: str
    risk_control: str
    executor: str
    timestamp: str


# ==================== 请求模型 ====================

class StrategyToggleRequest(BaseModel):
    """策略开关"""
    strategy: str
    enabled: bool


class TradingPauseRequest(BaseModel):
    """交易暂停"""
    paused: bool
    reason: Optional[str] = None
