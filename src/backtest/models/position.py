"""Position model for trading system."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class Position:
    direction: str  # 'long'|'short'
    qty: int
    entry_price: float
    stop: float
    take: float
