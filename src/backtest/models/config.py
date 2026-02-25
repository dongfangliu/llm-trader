"""Backtest configuration model."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Optional
from zoneinfo import ZoneInfo


@dataclass
class BTConfig:
    symbol: str = "CZCE.SA0"
    count: Optional[int] = None  # Number of K-lines to fetch (auto-calculated if None)
    initial_capital: float = 100000.0
    max_position: int = 1
    commission_per_lot: Optional[float] = None  # 手续费（元/手），如果为None则从TqSDK的quote中获取
    slippage_ticks: int = 1
    tick_size: float = 1.0
    margin_ratio: float = 0.18  # 保证金比例，默认18%
    timezone: str = "Asia/Shanghai"  # 时区设置，默认北京时间

    # Multi-timeframe configuration
    decision_period: Optional[int] = None  # Primary decision period in MINUTES (if None, use period)
    auxiliary_periods: Optional[List[int]] = None  # Auxiliary periods for multi-timeframe analysis [60, 240, 1440] etc.
    
    # Initial position configuration
    initial_position: int = 0  # 初始持仓数量（正数=多头，负数=空头，0=空仓）
    entry_price: float = 0.0  # 初始持仓的开仓价格

    def __post_init__(self):
        """Initialize multi-timeframe configuration."""

        # If auxiliary_periods not specified, initialize as empty list
        if self.auxiliary_periods is None:
            self.auxiliary_periods = []


    def get_decision_duration_seconds(self) -> int:
        """Convert decision period (minutes) to TqSDK duration_seconds."""
        return self.decision_period * 60

    def get_auto_count(self) -> int:
        """Auto-calculate reasonable K-line count based on period."""
        # Ensure at least 250 data points for indicator calculation
        # Daily: 250 bars = ~1 year, 15min: 1200 bars = ~2 weeks
        if self.count is not None:
            return self.count
        if self.decision_period >= 1440:  # Daily or above
            return 300  # ~1 year
        elif self.decision_period >= 240:  # 4-hour
            return 500
        elif self.decision_period >= 60:  # 1-hour
            return 800
        elif self.decision_period >= 15:  # 15-min
            return 1200
        else:  # 1-min or 5-min
            return 3000

    def get_auto_count_for_period(self, period_minutes: int) -> int:
        """Auto-calculate reasonable K-line count for a specific period."""
        if period_minutes >= 1440:  # Daily or above
            return 300
        elif period_minutes >= 240:  # 4-hour
            return 500
        elif period_minutes >= 60:  # 1-hour
            return 800
        elif period_minutes >= 15:  # 15-min
            return 1200
        else:  # 1-min or 5-min
            return 3000

    def get_all_periods(self) -> Dict[str, int]:
        """Return all periods to fetch data for.

        Returns:
            Dict mapping period name to period in minutes
            Example: {"decision": 1440, "aux_240m": 240, "aux_60m": 60}
        """
        periods = {"decision": self.decision_period}

        for period in self.auxiliary_periods:
            periods[f"aux_{period}m"] = period

        return periods

    def get_period_name(self, minutes: int) -> str:
        """Convert minutes to human-readable period name."""
        if minutes >= 1440:
            days = minutes // 1440
            return f"{days}日线" if days == 1 else f"{days}天线"
        elif minutes >= 60:
            hours = minutes // 60
            return f"{hours}小时线"
        else:
            return f"{minutes}分钟线"

    def get_timezone(self) -> ZoneInfo:
        """Get ZoneInfo object for configured timezone."""
        return ZoneInfo(self.timezone)
