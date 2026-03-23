from pydantic import BaseModel, Field
from typing import Optional, List, Any
from enum import Enum


class OhlcvBarInput(BaseModel):
    d: str
    o: float
    h: float
    l: float
    c: float
    v: float = 0.0

class MarketEnum(str, Enum):
    a = "a"
    hk = "hk"
    us = "us"
    futures = "futures"

class PeriodEnum(str, Enum):
    daily = "daily"
    m1 = "1"
    m5 = "5"
    m15 = "15"
    m30 = "30"
    m60 = "60"

class AnalyzeRequest(BaseModel):
    symbol: str
    market: str = "a"
    period: str = "daily"
    history_days: int = 90
    holding_quantity: Optional[int] = None
    cost_price: Optional[float] = None
    max_position: Optional[int] = None
    holding_text: Optional[str] = Field(None, max_length=500)
    device_id: Optional[str] = None
    ohlcv_bars: Optional[List[OhlcvBarInput]] = Field(default=None)

class AnalyzeResponse(BaseModel):
    task_id: str
    status: str
    message: str
    remaining: int
    daily_limit: int

class TaskStatusResponse(BaseModel):
    task_id: str
    status: str  # pending, running, completed, failed
    result: Optional[Any] = None
    error: Optional[str] = None
    progress: Optional[int] = None

class LimitsResponse(BaseModel):
    remaining: int
    daily_limit: int
    total_available: int
    tier: str
    trial_used: bool
    trial_state: str
    reset_at: Optional[str] = None

class HistoryItem(BaseModel):
    id: int
    symbol: str
    market: str
    period: str
    created_at: str
    result: Optional[Any] = None
    is_favorited: bool = False
    is_pro_trial: bool = False

    class Config:
        from_attributes = True

class HistoryResponse(BaseModel):
    items: List[HistoryItem]
    total: int
    page: int
    per_page: int
