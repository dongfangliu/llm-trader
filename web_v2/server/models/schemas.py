"""
Pydantic数据模型
"""

from pydantic import BaseModel, Field
from typing import Optional, List, Dict
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


class ManualTradeRequest(BaseModel):
    """手动交易请求"""
    action: str = Field(..., description="操作类型: open 或 close")
    direction: str = Field(..., description="方向: long 或 short")
    volume: int = Field(..., gt=0, description="交易手数")


# ==================== 配置管理模型 ====================

class TradingConfigModel(BaseModel):
    """交易配置"""
    initial_capital: Optional[float] = None
    max_position: Optional[int] = None
    single_trade: Optional[int] = None
    symbol: Optional[str] = None
    tqsdk_symbol: Optional[str] = None


class RiskConfigModel(BaseModel):
    """风控配置"""
    stop_loss: Optional[float] = None
    daily_max_loss: Optional[float] = None
    max_drawdown: Optional[float] = None
    max_hold_hours: Optional[int] = None
    volatility_threshold: Optional[float] = None


class DecisionConfigModel(BaseModel):
    """决策配置"""
    confidence_threshold: Optional[int] = None
    max_daily_trades: Optional[int] = None
    min_trade_gap: Optional[int] = None
    tactical_interval: Optional[int] = None
    strategic_interval: Optional[int] = None
    llm_direct_enabled: Optional[bool] = None
    llm_direct_interval: Optional[int] = None
    llm_allow_reverse: Optional[bool] = None


class LLMConfigModel(BaseModel):
    """LLM配置"""
    model: Optional[str] = None
    temperature: Optional[float] = None
    max_tokens: Optional[int] = None
    timeout: Optional[int] = None


class DataConfigModel(BaseModel):
    """数据配置"""
    fetch_interval: Optional[int] = None
    history_days: Optional[int] = None
    kline_period: Optional[str] = None


class SystemConfigModel(BaseModel):
    """系统配置"""
    log_level: Optional[str] = None
    review_time: Optional[str] = None
    timezone: Optional[str] = None


class BacktestConfigModel(BaseModel):
    """回测配置"""
    commission_rate: Optional[float] = None
    slippage_ticks: Optional[int] = None


class TradingParamsModel(BaseModel):
    """trading_params.yaml配置"""
    trading: Optional[TradingConfigModel] = None
    risk: Optional[RiskConfigModel] = None
    decision: Optional[DecisionConfigModel] = None
    llm: Optional[LLMConfigModel] = None
    data: Optional[DataConfigModel] = None
    system: Optional[SystemConfigModel] = None
    backtest: Optional[BacktestConfigModel] = None


class ProviderConfigModel(BaseModel):
    """LLM提供商配置"""
    api_key: Optional[str] = None
    base_url: Optional[str] = None


class TqSDKConfigModel(BaseModel):
    """TqSDK配置"""
    username: Optional[str] = None
    password: Optional[str] = None
    use_sim: Optional[bool] = None


class APIKeysModel(BaseModel):
    """api_keys.yaml配置"""
    provider: Optional[str] = None
    providers: Optional[Dict[str, ProviderConfigModel]] = None
    tqsdk: Optional[TqSDKConfigModel] = None


class ConfigUpdateRequest(BaseModel):
    """配置更新请求"""
    trading_params: Optional[TradingParamsModel] = None
    api_keys: Optional[APIKeysModel] = None


class ConfigResponse(BaseModel):
    """配置响应"""
    trading_params: Optional[dict] = None
    api_keys: Optional[dict] = None
