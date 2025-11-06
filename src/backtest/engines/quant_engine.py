"""Simple quantitative trading engine."""

from __future__ import annotations

import pandas as pd
from loguru import logger

from src.backtest.models.decision import Decision


class SimpleQuantEngine:
    """Lightweight quant baseline: MA crossover + RSI filter.

    Note: ONLY uses TqSDK pre-calculated indicators (ma10, ma30, rsi, atr).
    No manual calculation fallback to ensure data quality.
    """

    def __init__(self, max_pos: int = 1):
        self.max_pos = max_pos

    def decide(self, row: pd.Series, df: pd.DataFrame) -> Decision:
        close = row["close"]
        idx = row.name

        # ONLY use TqSDK-calculated indicators - no fallback
        # Return hold if indicators are missing or NaN
        required_indicators = ["ma10", "ma30", "rsi", "atr"]
        for indicator in required_indicators:
            if indicator not in row.index or pd.isna(row.get(indicator)):
                logger.debug(f"指标 {indicator} 缺失或为NaN，返回hold决策")
                return Decision(
                    action="hold",
                    position_size=0,
                    stop_loss=0.0,
                    take_profit=0.0,
                    confidence=0.0,
                    rationale=[f"missing_{indicator}"]
                )

        # Extract TqSDK indicators
        ma_fast = float(row["ma10"])
        ma_slow = float(row["ma30"])
        rsi = float(row["rsi"])
        atr = float(row["atr"])

        # Validate ATR is positive
        if atr <= 0:
            logger.warning(f"ATR无效 ({atr})，返回hold决策")
            return Decision(
                action="hold",
                position_size=0,
                stop_loss=0.0,
                take_profit=0.0,
                confidence=0.0,
                rationale=["invalid_atr"]
            )

        # Generate signal based on MA crossover and RSI filter
        signal_strength = 0.0
        action = "hold"

        spread = (ma_fast - ma_slow) / max(1e-6, ma_slow)
        if spread > 0.001 and rsi > 52:
            action = "open_long"
            signal_strength = min(1.0, max(0.55, spread * 50))
        elif spread < -0.001 and rsi < 48:
            action = "open_short"
            signal_strength = min(1.0, max(0.55, -spread * 50))

        # Calculate stop loss and take profit using TqSDK ATR
        take = close + (2.5 * atr) if action == "open_long" else (close - 2.5 * atr if action == "open_short" else 0)
        stop = close - (1.5 * atr) if action == "open_long" else (close + 1.5 * atr if action == "open_short" else 0)

        pos = self.max_pos if action != "hold" else 0
        return Decision(
            action=action,
            position_size=pos,
            stop_loss=stop,
            take_profit=take,
            confidence=signal_strength,
            rationale=["simple_quant_tqsdk"]
        )
