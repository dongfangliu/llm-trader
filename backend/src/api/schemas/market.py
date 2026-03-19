from pydantic import BaseModel
from typing import List, Optional

class SymbolSearchResult(BaseModel):
    symbol: str
    name: str
    market: str

class SymbolSearchResponse(BaseModel):
    results: List[SymbolSearchResult]

class MarketBarItem(BaseModel):
    datetime: int  # nanosecond timestamp
    open: float
    high: float
    low: float
    close: float
    volume: float

class MarketBarResponse(BaseModel):
    symbol: str
    market: str
    period: str
    bars: List[MarketBarItem]
