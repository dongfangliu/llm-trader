r"""
LLM Direct Decision Backtest (TqSDK based)

Quick prototype to compare three modes:
- quant_only: simple MA/RSI quant logic
- hybrid: quant + LLM expert review when confidence is low
- llm_direct: LLM makes the trade decision directly

Usage:
  python src\backtest\llm_decision_backtest.py --mode llm_direct --symbol CZCE.SA0 --period 15 --cache logs\llm_decisions_cache.json --initial_units 2.0

Parameters:
  --period: K-line period in MINUTES (1=1min, 15=15min, 60=1hour, 1440=daily)
  --count: [Optional] Number of K-lines to fetch (auto-calculated if not specified)
  --initial_units: Set initial capital as price × contract_multiplier × units (default: 2.0)
                   Example: if SA price is 1500, initial_capital = 1500 × 20 × 2 = 60,000
  --visual_prompt: [Experimental] Use visual/neutral prompt with ASCII K-line charts
                   instead of structured JSON features
  --show_rationale: Show detailed rationale for each decision (default: False)

Examples:
  # 15-minute backtest (standard prompt)
  python src\backtest\llm_decision_backtest.py --mode llm_direct --symbol CZCE.SA0 --period 15

  # 15-minute backtest (visual prompt - experimental)
  python src\backtest\llm_decision_backtest.py --mode llm_direct --symbol CZCE.SA0 --period 15 --visual_prompt

  # Daily K-line backtest
  python src\backtest\llm_decision_backtest.py --mode llm_direct --symbol CZCE.SA0 --period 1440

Notes:
- Uses TqSDK native technical indicators (MA, RSI, MACD, ATR, etc.)
- If LLM credentials are missing, falls back to quant-only for that step.
- Cache can be used to make runs deterministic and avoid repeated LLM calls.
- Visual prompt mode presents data as ASCII charts and open-ended questions,
  reducing technical indicator bias and letting LLM discover patterns naturally.
"""

from __future__ import annotations

import argparse
import json
import os
import logging
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timedelta
from enum import Enum
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd
from loguru import logger

# Ensure project root on sys.path when run as a script
ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

# Local imports (avoid heavy dependencies; use light wrappers we already have)
from src.data_fetcher.tqsdk_client import TqSdkClient
from src.llm_engine.llm_factory import LLMFactory
from src.llm_engine.response_parser import ResponseParser


class DecisionMode(str, Enum):
    QUANT_ONLY = "quant_only"
    HYBRID = "hybrid"
    LLM_DIRECT = "llm_direct"


@dataclass
class Decision:
    action: str  # 'open_long' | 'open_short' | 'hold'
    position_size: int = 0
    stop_loss: float = 0.0
    take_profit: float = 0.0
    confidence: float = 0.0
    rationale: List[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "action": self.action,
            "position_size": int(self.position_size),
            "stop_loss": float(self.stop_loss or 0.0),
            "take_profit": float(self.take_profit or 0.0),
            "confidence": float(self.confidence or 0.0),
            "rationale": list(self.rationale or []),
        }


class SimpleQuantEngine:
    """Lightweight quant baseline: MA crossover + RSI filter.

    Note: Expects df to have pre-calculated indicators (ma10, ma30, rsi, atr).
    If not present, will compute them on-the-fly (less efficient).
    """

    def __init__(self, max_pos: int = 1):
        self.max_pos = max_pos

    def decide(self, row: pd.Series, df: pd.DataFrame) -> Decision:
        close = row["close"]
        idx = row.name

        # Try to use TqSDK-calculated indicators first (ma10, ma30, rsi, atr)
        # Fallback to manual calculation if not present
        if "ma10" in df.columns and "ma30" in df.columns:
            ma_fast = float(df.loc[idx, "ma10"]) if not pd.isna(df.loc[idx, "ma10"]) else np.nan
            ma_slow = float(df.loc[idx, "ma30"]) if not pd.isna(df.loc[idx, "ma30"]) else np.nan
        else:
            # Fallback: compute manually
            if "ma_fast" not in df.columns:
                df["ma_fast"] = df["close"].rolling(10).mean()
            if "ma_slow" not in df.columns:
                df["ma_slow"] = df["close"].rolling(30).mean()
            ma_fast = float(df.loc[idx, "ma_fast"]) if not pd.isna(df.loc[idx, "ma_fast"]) else np.nan
            ma_slow = float(df.loc[idx, "ma_slow"]) if not pd.isna(df.loc[idx, "ma_slow"]) else np.nan

        if "rsi" in df.columns:
            rsi = float(df.loc[idx, "rsi"]) if not pd.isna(df.loc[idx, "rsi"]) else 50.0
        else:
            # Fallback: compute manually
            diff = df["close"].diff()
            up = diff.clip(lower=0).rolling(14).mean()
            down = (-diff.clip(upper=0)).rolling(14).mean()
            rs = up / (down.replace(0, np.nan))
            df["rsi"] = 100 - (100 / (1 + rs))
            df.loc[:, "rsi"] = df["rsi"].fillna(50)
            rsi = float(df.loc[idx, "rsi"]) if not pd.isna(df.loc[idx, "rsi"]) else 50.0

        signal_strength = 0.0
        action = "hold"
        if not np.isnan(ma_fast) and not np.isnan(ma_slow):
            spread = (ma_fast - ma_slow) / max(1e-6, ma_slow)
            if spread > 0.001 and rsi > 52:
                action = "open_long"
                signal_strength = min(1.0, max(0.55, spread * 50))
            elif spread < -0.001 and rsi < 48:
                action = "open_short"
                signal_strength = min(1.0, max(0.55, -spread * 50))

        # Try to use TqSDK ATR, fallback to manual calculation
        if "atr" in df.columns:
            atr = float(df.loc[idx, "atr"]) if not pd.isna(df.loc[idx, "atr"]) else 0.0
        else:
            # Fallback: compute ATR manually
            tr1 = (df["high"] - df["low"]).abs()
            tr2 = (df["high"] - df["close"].shift(1)).abs()
            tr3 = (df["low"] - df["close"].shift(1)).abs()
            tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
            df["atr"] = tr.rolling(14).mean().fillna(tr.expanding().mean())
            atr = float(df.loc[idx, "atr"]) if not pd.isna(df.loc[idx, "atr"]) else 0.0

        if atr <= 0:
            atr = max(1.0, df["close"].rolling(20).std().iloc[-1] if len(df) >= 20 else close * 0.01)

        take = close + (2.5 * atr) if action == "open_long" else (close - 2.5 * atr if action == "open_short" else 0)
        stop = close - (1.5 * atr) if action == "open_long" else (close + 1.5 * atr if action == "open_short" else 0)

        pos = self.max_pos if action != "hold" else 0
        return Decision(action=action, position_size=pos, stop_loss=stop, take_profit=take, confidence=signal_strength, rationale=["simple_quant"])


class LLMDirectEngine:
    def __init__(self, cache: Optional[Dict[str, Any]] = None, cache_write: Optional[Path] = None, max_pos: int = 1, feature_mode: str = "neutral", trade_meta: Optional[Dict[str, Any]] = None, use_visual_prompt: bool = False):
        self.max_pos = max_pos
        self.cache = cache or {}
        self.cache_write = cache_write
        self.feature_mode = feature_mode
        self.trade_meta = trade_meta or {}
        self.use_visual_prompt = use_visual_prompt  # New: enable visual/neutral prompt
        try:
            self.client = LLMFactory.create_client()
        except Exception as e:
            logger.warning(f"LLM client init failed, fallback to quant baseline: {e}")
            self.client = None
        self.quant_fallback = SimpleQuantEngine(max_pos=self.max_pos)
        self.current_pos = None  # Backtester会在每根bar前注入当前持仓
        self.current_balance = None  # Backtester会在每根bar前注入当前资金
    def _cache_get(self, key: str) -> Optional[Decision]:
        if key in self.cache:
            data = self.cache[key]
            return Decision(
                action=data.get("action", "hold"),
                position_size=int(data.get("position_size", 0)),
                stop_loss=float(data.get("stop_loss", 0) or 0),
                take_profit=float(data.get("take_profit", 0) or 0),
                confidence=float(data.get("confidence", 0) or 0),
                rationale=list(data.get("rationale", [])),
            )
        return None

    def _cache_put(self, key: str, decision: Decision):
        if self.cache_write is None:
            return
        self.cache[key] = decision.to_dict()
        try:
            self.cache_write.parent.mkdir(parents=True, exist_ok=True)
            with open(self.cache_write, "w", encoding="utf-8") as f:
                json.dump(self.cache, f, ensure_ascii=False, indent=2, default=str)
        except Exception as e:
            logger.warning(f"write cache failed: {e}")

    def _create_visual_kline(self, hist: List[Dict]) -> str:
        """Create ASCII art K-line chart for visual representation."""
        if len(hist) < 10:
            return ""

        # Take last 50 bars and normalize to fixed height
        data = hist[-50:] if len(hist) >= 50 else hist

        # Find price range
        all_prices = []
        for bar in data:
            all_prices.extend([bar["o%"], bar["h%"], bar["l%"], bar["c%"]])

        if not all_prices:
            return ""

        min_p = min(all_prices)
        max_p = max(all_prices)
        range_p = max_p - min_p if max_p > min_p else 1.0

        # Normalize to 20 rows height
        def normalize(val):
            return int(19 * (val - min_p) / range_p)

        # Build chart matrix
        chart = [[' ' for _ in range(len(data))] for _ in range(20)]

        for col, bar in enumerate(data):
            try:
                o_norm = normalize(bar["o%"])
                h_norm = normalize(bar["h%"])
                l_norm = normalize(bar["l%"])
                c_norm = normalize(bar["c%"])

                # Draw high-low line
                for row in range(min(l_norm, h_norm), max(l_norm, h_norm) + 1):
                    if row == o_norm or row == c_norm:
                        continue
                    chart[19 - row][col] = '│'

                # Draw body
                body_top = max(o_norm, c_norm)
                body_bottom = min(o_norm, c_norm)
                is_bull = c_norm > o_norm

                for row in range(body_bottom, body_top + 1):
                    if is_bull:
                        chart[19 - row][col] = '█'  # Bullish
                    else:
                        chart[19 - row][col] = '▓'  # Bearish
            except Exception:
                continue

        # Convert to string
        visual = f"\n{'═' * (len(data) + 2)}\n"
        visual += f"Price range: {min_p:+.2f}% to {max_p:+.2f}%\n"
        visual += f"{'═' * (len(data) + 2)}\n"

        for row in chart:
            visual += ''.join(row) + '\n'

        visual += f"{'─' * (len(data) + 2)}\n"
        visual += f"Time ►{'►' * (len(data) - 5)}►►►►►\n"
        visual += f"{' ' * (len(data) - 3)}NOW\n"

        return visual

    def _build_neutral_snapshot(self, row: pd.Series, df: pd.DataFrame, symbol: str) -> str:
        """Build neutral market snapshot with facts, no interpretations."""

        close = float(row["close"]) if not pd.isna(row["close"]) else 0.0
        ts = pd.to_datetime(row["timestamp"]) if "timestamp" in row else pd.Timestamp.now()

        # 1. Basic information (pure facts)
        basic = f"""
Symbol: {symbol}
Current Time: {ts.strftime('%Y-%m-%d %H:%M')} (Weekday: {ts.strftime('%A')})
Current Price: {close:.2f}

Current Bar:
  Open: {float(row['open']):.2f}
  High: {float(row['high']):.2f}
  Low: {float(row['low']):.2f}
  Close: {close:.2f}
  Volume: {int(row.get('volume', 0))}
"""

        # 2. Historical price sequence
        idx = row.name
        window = df.loc[:idx].tail(100) if idx in df.index else df.tail(100)

        recent_prices = "\nRecent 20 bars (close prices):\n"
        for i, (_, r) in enumerate(window.tail(20).iterrows(), 1):
            recent_prices += f"{i:2d}. {float(r['close']):7.2f}  "
            if i % 5 == 0:
                recent_prices += "\n"

        # 3. Price distribution (statistical, not technical indicators)
        closes = window["close"].values.astype(float)
        recent_10 = closes[-10:] if len(closes) >= 10 else closes
        recent_50 = closes[-50:] if len(closes) >= 50 else closes

        stats = f"""
Price Statistics:
  Last 10 bars: min={float(recent_10.min()):.2f}, max={float(recent_10.max()):.2f}, mean={float(recent_10.mean()):.2f}
  Last 50 bars: min={float(recent_50.min()):.2f}, max={float(recent_50.max()):.2f}, mean={float(recent_50.mean()):.2f}
  Current vs 10-bar mean: {((close / recent_10.mean() - 1) * 100):+.2f}%
  Current vs 50-bar mean: {((close / recent_50.mean() - 1) * 100):+.2f}%
"""

        # 4. Volume comparison (pure numbers)
        vols = window["volume"].values.astype(float)
        vol_recent = vols[-20:] if len(vols) >= 20 else vols
        vol_current = float(row.get("volume", 0))

        volume_info = f"""
Volume Comparison:
  Current bar: {int(vol_current)}
  20-bar average: {int(vol_recent.mean())}
  20-bar max: {int(vol_recent.max())}
  20-bar min: {int(vol_recent.min())}
"""

        # 5. Position and account (objective facts)
        pos_obj = getattr(self, "current_pos", None)
        account_balance = getattr(self, "current_balance", None)

        position_info = ""
        if pos_obj and pos_obj.direction != "none":
            entry = pos_obj.entry_price
            pnl_pct = ((close / entry - 1) * 100) if entry > 0 else 0.0
            position_info = f"""
Current Position:
  Direction: {pos_obj.direction.upper()}
  Quantity: {pos_obj.qty} lots
  Entry Price: {entry:.2f}
  Current P&L: {pnl_pct:+.2f}%
"""
        else:
            position_info = "\nCurrent Position: NONE (flat)\n"

        account_info = f"""
Account:
  Balance: {account_balance:.2f} (initial: {self.trade_meta.get('initial_capital', 0):.2f})
  Max Position: {self.max_pos} lots
"""

        # 6. Visual K-line chart
        hist = []
        base_price = close
        for _, b in window.tail(50).iterrows():
            hist.append({
                "o%": (float(b["open"]) / base_price - 1) * 100,
                "h%": (float(b["high"]) / base_price - 1) * 100,
                "l%": (float(b["low"]) / base_price - 1) * 100,
                "c%": (float(b["close"]) / base_price - 1) * 100,
                "v": int(b.get("volume", 0)),
            })

        visual_chart = self._create_visual_kline(hist)

        # 7. Simple, open-ended instruction with confidence guidance
        instruction = """
Based on the above market data, decide whether to take a trading action.

Consider:
- What pattern do you observe in the price movements?
- Is there any notable change in volume?
- If you have a position, how is it performing?
- What is the potential opportunity vs. risk?

Trading costs: {commission_per_lot:.2f} per lot, {slippage_ticks} tick slippage

Respond in strict JSON format:
{{
  "action": "open_long|open_short|close_long|close_short|hold",
  "position_size": <int>,
  "stop_loss": <float, absolute price>,
  "take_profit": <float, absolute price>,
  "confidence": <float 0-1>,
  "rationale": ["brief reason1", "brief reason2"]
}}

IMPORTANT - Confidence Guidelines:
- 0.9-1.0: Very strong signal, clear pattern, high volume confirmation
- 0.7-0.9: Strong signal, good pattern, reasonable confirmation
- 0.5-0.7: Moderate signal, some uncertainty
- 0.3-0.5: Weak signal, high uncertainty
- 0.0-0.3: Very weak/conflicting signal
Adjust confidence based on actual market conditions - don't use fixed values!
""".format(
            commission_per_lot=self.trade_meta.get('commission_per_lot', 0.0),
            slippage_ticks=self.trade_meta.get('slippage_ticks', 1)
        )

        return f"{basic}{stats}{volume_info}{position_info}{account_info}{visual_chart}\n{recent_prices}\n{instruction}"

    def decide(self, row: pd.Series, df: pd.DataFrame, symbol: str) -> Decision:
        ts_key = pd.to_datetime(row["timestamp"]).isoformat()
        cached = self._cache_get(ts_key)
        if cached is not None:
            return cached

        if self.client is None:
            return self.quant_fallback.decide(row, df)

        # Build market snapshot with configurable feature set (raw | neutral | full)
        idx = row.name
        close = float(row["close"]) if not pd.isna(row["close"]) else 0.0
        o = float(row["open"]) if not pd.isna(row["open"]) else close
        h = float(row["high"]) if not pd.isna(row["high"]) else close
        l = float(row["low"]) if not pd.isna(row["low"]) else close
        vol = float(row.get("volume", 0) or 0)

        # recent window and simple normalizations
        window = df.loc[:idx].tail(100)
        vol_mean20 = float(window["volume"].iloc[-20:].mean()) if len(window) >= 20 else 0.0
        vol_ratio = (vol / vol_mean20) if vol_mean20 and vol_mean20 > 0 else 1.0
        try:
            base = close if close else (float(window["close"].iloc[-1]) if len(window) else 1.0)
            den = vol_mean20 if vol_mean20 and vol_mean20 > 0 else 1.0
            hist = []
            for _, b in window.tail(50).iterrows():
                pc = lambda v: round(100.0 * (float(v) / base - 1.0), 2)
                hist.append({
                    "o%": pc(b.get("open", base)),
                    "h%": pc(b.get("high", base)),
                    "l%": pc(b.get("low", base)),
                    "c%": pc(b.get("close", base)),
                    "v": round(float(b.get("volume", 0)) / den, 2),
                })
        except Exception:
            hist = []

        # optional features
        features: Dict[str, Any] = {}
        if self.feature_mode == "full":
            chg20 = (close - float(window["close"].iloc[-20])) / max(1e-6, float(window["close"].iloc[-20])) if len(window) >= 20 else 0.0
            ma20 = float(window["close"].rolling(20).mean().iloc[-1]) if len(window) >= 20 else close
            ma60 = float(window["close"].rolling(60).mean().iloc[-1]) if len(window) >= 60 else close
            # RSI
            try:
                diff = window["close"].diff()
                up = diff.clip(lower=0).rolling(14).mean()
                down = (-diff.clip(upper=0)).rolling(14).mean()
                rs = up / down.replace(0, np.nan)
                rsi14 = float((100 - (100 / (1 + rs))).iloc[-1]) if len(window) >= 15 else 50.0
            except Exception:
                rsi14 = 50.0
            # MACD hist
            try:
                ema12 = window["close"].ewm(span=12, adjust=False).mean()
                ema26 = window["close"].ewm(span=26, adjust=False).mean()
                macd = ema12 - ema26
                signal = macd.ewm(span=9, adjust=False).mean()
                macd_hist = float((macd - signal).iloc[-1]) if len(window) >= 35 else 0.0
            except Exception:
                macd_hist = 0.0
            # ATR
            try:
                tr1 = (window["high"] - window["low"]).abs()
                tr2 = (window["high"] - window["close"].shift(1)).abs()
                tr3 = (window["low"] - window["close"].shift(1)).abs()
                tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
                atr_series = tr.rolling(14).mean().fillna(tr.expanding().mean())
                atr14 = float(atr_series.iloc[-1]) if len(window) >= 15 else float(tr.mean()) if len(tr) else 0.0
            except Exception:
                atr14 = 0.0
            # Bollinger relative position
            try:
                bb_ma = window["close"].rolling(20).mean().iloc[-1] if len(window) >= 20 else close
                bb_std = window["close"].rolling(20).std().iloc[-1] if len(window) >= 20 else 0.0
                bb_pos = float(np.clip(((close - bb_ma) / (2 * bb_std)) if bb_std and bb_std > 0 else 0.0, -1.0, 1.0))
            except Exception:
                bb_pos = 0.0
            # returns & slopes & distances
            try:
                ret5 = float((close - float(window["close"].iloc[-5])) / max(1e-6, float(window["close"].iloc[-5]))) if len(window) >= 5 else 0.0
                ret20 = float(chg20)
            except Exception:
                ret5, ret20 = 0.0, 0.0
            try:
                ma20_prev5 = float(window["close"].rolling(20).mean().iloc[-6]) if len(window) >= 25 else ma20
                slope_ma20 = float((ma20 - ma20_prev5) / max(1e-6, ma20_prev5)) if ma20_prev5 else 0.0
            except Exception:
                slope_ma20 = 0.0
            try:
                ma60_prev5 = float(window["close"].rolling(60).mean().iloc[-6]) if len(window) >= 65 else ma60
                slope_ma60 = float((ma60 - ma60_prev5) / max(1e-6, ma60_prev5)) if ma60_prev5 else 0.0
            except Exception:
                slope_ma60 = 0.0
            try:
                hist50 = window.tail(50)
                hi50 = float(hist50["high"].max()) if len(hist50) else close
                lo50 = float(hist50["low"].min()) if len(hist50) else close
                dist_high_50 = float((close / max(1e-6, hi50)) - 1.0)
                dist_low_50 = float((close / max(1e-6, lo50)) - 1.0)
            except Exception:
                dist_high_50, dist_low_50 = 0.0, 0.0
            trend_strength = float(abs(ma20 - ma60) / max(1e-6, close))
            vol_norm = float(atr14 / max(1e-6, close))
            features = {
                "ma20": ma20,
                "ma60": ma60,
                "chg20": chg20,
                "vol_ratio": vol_ratio,
                "rsi14": rsi14,
                "macd_hist": macd_hist,
                "atr14": atr14,
                "bb_pos": bb_pos,
                "ret5": ret5,
                "ret20": ret20,
                "slope_ma20": slope_ma20,
                "slope_ma60": slope_ma60,
                "dist_high_50": dist_high_50,
                "dist_low_50": dist_low_50,
                "trend_strength": trend_strength,
                "vol_norm": vol_norm,
            }
        elif self.feature_mode == "neutral":
            # neutral, descriptive only
            try:
                prev_close = float(window["close"].iloc[-2]) if len(window) >= 2 else close
                ret1 = (close - prev_close) / max(1e-6, prev_close)
            except Exception:
                ret1 = 0.0
            try:
                ret5 = float((close - float(window["close"].iloc[-5])) / max(1e-6, float(window["close"].iloc[-5]))) if len(window) >= 5 else 0.0
                ret20 = float((close - float(window["close"].iloc[-20])) / max(1e-6, float(window["close"].iloc[-20]))) if len(window) >= 20 else 0.0
            except Exception:
                ret5, ret20 = 0.0, 0.0
            # volatility: std of returns and ATR
            try:
                rets = window["close"].astype(float).pct_change().tail(20)
                vol_std20 = float(rets.std(skipna=True)) if len(rets) else 0.0
            except Exception:
                vol_std20 = 0.0
            try:
                tr1 = (window["high"] - window["low"]).abs()
                tr2 = (window["high"] - window["close"].shift(1)).abs()
                tr3 = (window["low"] - window["close"].shift(1)).abs()
                tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
                atr_series = tr.rolling(14).mean().fillna(tr.expanding().mean())
                atr14 = float(atr_series.iloc[-1]) if len(window) >= 15 else float(tr.mean()) if len(tr) else 0.0
            except Exception:
                atr14 = 0.0
            range_pct = float((h - l) / max(1e-6, close)) if close else 0.0
            features = {
                "ret1": ret1,
                "ret5": ret5,
                "ret20": ret20,
                "volatility20": vol_std20,
                "atr14": atr14,
                "range_pct": range_pct,
                "vol_ratio": vol_ratio,
            }
        else:
            # raw only: no engineered features
            features = {}

        # current position and allowances
        pos_obj = getattr(self, "current_pos", None)
        cur_dir = "none" if pos_obj is None else pos_obj.direction
        cur_qty = 0 if pos_obj is None else int(pos_obj.qty)
        cur_entry = 0.0 if pos_obj is None else float(pos_obj.entry_price)
        cur_stop = 0.0 if pos_obj is None else float(pos_obj.stop)
        cur_take = 0.0 if pos_obj is None else float(pos_obj.take)
        can_add = max(0, self.max_pos - cur_qty)
        pos_info = {"direction": cur_dir, "qty": cur_qty, "entry_price": cur_entry, "stop": cur_stop, "take": cur_take, "max_position": self.max_pos, "can_add": can_add}
        allowed_actions = ["open_long", "open_short", "add_long", "add_short", "close_long", "close_short", "hold"]

        # meta & costs
        ts_dt = pd.to_datetime(row["timestamp"]) if "timestamp" in row else pd.to_datetime(ts_key)
        meta = {"hour": int(ts_dt.hour), "minute": int(ts_dt.minute), "weekday": int(ts_dt.weekday())}
        costs = {
            "tick_size": float(self.trade_meta.get("tick_size", 1.0)),
            "slippage_ticks": int(self.trade_meta.get("slippage_ticks", 1)),
            "commission_per_lot": float(self.trade_meta.get("commission_per_lot", 0.0)),
        }
        account = {
            "initial_capital": float(self.trade_meta.get("initial_capital", 0.0)),
            "balance": float(self.current_balance) if self.current_balance is not None else None,
        }

        snapshot = {
            "symbol": symbol,
            "timestamp": ts_key,
            "bar": {"open": o, "high": h, "low": l, "close": close, "volume": vol},
            "features": features,
            "history": {"last_bars": hist},
            "position": pos_info,
            "rules": {"max_position": self.max_pos, "allowed_actions": allowed_actions},
            "costs": costs,
            "session": meta,
            "account": account,
        }

        # Choose prompt style based on configuration
        if self.use_visual_prompt:
            # Use new visual/neutral prompt with ASCII chart and open-ended questions
            prompt = self._build_neutral_snapshot(row, df, symbol)
        else:
            # Use original structured JSON prompt with confidence guidance
            prompt = (
                "You are a futures trading assistant deciding entries for Soda Ash (SA).\n"
                "Use the current bar, recent history (normalized), optional neutral features, trading costs/specs, and the current position/account to decide.\n"
                "Return STRICT JSON only with keys: action(one of 'open_long','open_short','add_long','add_short','close_long','close_short','hold'), position_size(int >=0; for add/close it's lots to add/close), stop_loss(number), take_profit(number), confidence(float 0..1), rationale(array of short strings).\n\n"
                "CONFIDENCE GUIDELINES (adjust based on market conditions, don't use fixed values):\n"
                "- 0.9-1.0: Very strong signal, clear pattern, high volume confirmation\n"
                "- 0.7-0.9: Strong signal, good pattern, reasonable confirmation\n"
                "- 0.5-0.7: Moderate signal, some uncertainty\n"
                "- 0.3-0.5: Weak signal, high uncertainty\n"
                "- 0.0-0.3: Very weak/conflicting signal\n\n"
                f"INPUT:\n{json.dumps(snapshot, ensure_ascii=False)}\n"
                "OUTPUT JSON:"
            )

        try:
            raw = self.client.chat(prompt)
            cleaned = ResponseParser.clean_response(raw)
            data = ResponseParser.parse_json(cleaned) or {}
            action = str(data.get("action", "hold"))
            if action not in ("open_long", "open_short", "add_long", "add_short", "close_long", "close_short", "hold"):
                action = "hold"
            decision = Decision(
                action=action,
                position_size=int(max(0, min(self.max_pos, int(data.get("position_size", 0))))),
                stop_loss=float(data.get("stop_loss", 0) or 0),
                take_profit=float(data.get("take_profit", 0) or 0),
                confidence=float(data.get("confidence", 0) or 0),
                rationale=[str(x) for x in (data.get("rationale") or [])][:5],
            )
        except Exception as e:
            logger.warning(f"LLM call failed, fallback to quant: {e}")
            decision = self.quant_fallback.decide(row, df)

        self._cache_put(ts_key, decision)
        return decision


class HybridEngine:
    """Quant decision with optional LLM expert review when confidence is low."""

    def __init__(self, low_conf_th: float = 0.7, cache: Optional[Dict[str, Any]] = None, cache_write: Optional[Path] = None, max_pos: int = 1, feature_mode: str = "neutral", trade_meta: Optional[Dict[str, Any]] = None, use_visual_prompt: bool = False):
        self.low_conf_th = low_conf_th
        self.quant = SimpleQuantEngine(max_pos=max_pos)
        self.llm_direct = LLMDirectEngine(cache=cache, cache_write=cache_write, max_pos=max_pos, feature_mode=feature_mode, trade_meta=trade_meta, use_visual_prompt=use_visual_prompt)

    def decide(self, row: pd.Series, df: pd.DataFrame, symbol: str) -> Decision:
        q = self.quant.decide(row, df)
        if q.action == "hold" or q.confidence >= self.low_conf_th:
            return q
        # Ask LLM to approve/reject
        ts_key = pd.to_datetime(row["timestamp"]).isoformat()
        cache_key = f"review::{ts_key}"
        cached = self.llm_direct._cache_get(cache_key)
        if cached is not None:
            # Interpret cached as final decision
            return cached

        review_prompt = (
            "You are reviewing a quant signal. Return STRICT JSON: {\"approved\":bool, \"concerns\":[str], \"warnings\":[str]}\n"
            f"Signal: {json.dumps(q.to_dict(), ensure_ascii=False)}\n"
            "If not confident, set approved=false and add reasons."
        )
        try:
            client = self.llm_direct.client
            if client is None:
                return q
            raw = client.chat(review_prompt)
            resp = ResponseParser.parse_expert_review(raw)
            if not resp.get("approved", False):
                d = Decision(action="hold", position_size=0, confidence=0.0, rationale=["llm_reject"] + (resp.get("concerns") or []))
                self.llm_direct._cache_put(cache_key, d)
                return d
            # approved: keep quant
            d = Decision(**q.to_dict())
            d.rationale = (d.rationale or []) + ["llm_approved"]
            self.llm_direct._cache_put(cache_key, d)
            return d
        except Exception:
            return q


@dataclass
class BTConfig:
    symbol: str = "CZCE.SA0"
    period: int = 15  # Period in MINUTES (1=1min, 15=15min, 60=1hour, 1440=daily)
    count: Optional[int] = None  # Number of K-lines to fetch (auto-calculated if None)
    initial_capital: float = 100000.0
    max_position: int = 1
    commission_per_lot: float = 3.0
    slippage_ticks: int = 1
    tick_size: float = 1.0

    def get_duration_seconds(self) -> int:
        """Convert period (minutes) to TqSDK duration_seconds."""
        return self.period * 60

    def get_auto_count(self) -> int:
        """Auto-calculate reasonable K-line count based on period."""
        # Ensure at least 250 data points for indicator calculation
        # Daily: 250 bars = ~1 year, 15min: 1200 bars = ~2 weeks
        if self.count is not None:
            return self.count
        if self.period >= 1440:  # Daily or above
            return 300  # ~1 year
        elif self.period >= 240:  # 4-hour
            return 500
        elif self.period >= 60:  # 1-hour
            return 800
        elif self.period >= 15:  # 15-min
            return 1200
        else:  # 1-min or 5-min
            return 3000


@dataclass
class Position:
    direction: str  # 'long'|'short'
    qty: int
    entry_price: float
    stop: float
    take: float


class Backtester:
    def __init__(self, cfg: BTConfig, mode: DecisionMode, cache_path: Optional[Path] = None, llm_input: str = "neutral", llm_ignore_risk: bool = False, initial_units: Optional[float] = None, use_visual_prompt: bool = False, show_rationale: bool = False):
        self.cfg = cfg
        self.mode = mode
        self.cache_path = cache_path
        self.llm_input = llm_input
        self.llm_ignore_risk = llm_ignore_risk
        self.initial_units = initial_units  # None表示使用cfg.initial_capital，否则根据价格*units计算
        self.use_visual_prompt = use_visual_prompt  # New: enable visual/neutral prompt
        self.show_rationale = show_rationale  # Control rationale output
        # load cache
        cache: Dict[str, Any] = {}
        if cache_path and cache_path.exists():
            try:
                cache = json.loads(cache_path.read_text(encoding="utf-8"))
            except Exception as e:
                logger.warning(f"load cache failed: {e}")
        # common meta for LLM
        trade_meta = {
            "tick_size": cfg.tick_size,
            "slippage_ticks": cfg.slippage_ticks,
            "commission_per_lot": cfg.commission_per_lot,
            "initial_capital": cfg.initial_capital,
        }
        # engines
        if mode == DecisionMode.QUANT_ONLY:
            self.engine = SimpleQuantEngine(max_pos=cfg.max_position)
        elif mode == DecisionMode.HYBRID:
            self.engine = HybridEngine(cache=cache, cache_write=cache_path, max_pos=cfg.max_position, feature_mode=self.llm_input, trade_meta=trade_meta, use_visual_prompt=self.use_visual_prompt)
        else:
            self.engine = LLMDirectEngine(cache=cache, cache_write=cache_path, max_pos=cfg.max_position, feature_mode=self.llm_input, trade_meta=trade_meta, use_visual_prompt=self.use_visual_prompt)

    def run_tqsdk(self, start_dt: datetime, end_dt: datetime, username: Optional[str] = None, password: Optional[str] = None, use_sim: bool = True) -> Dict[str, Any]:
        try:
            from tqsdk import TqApi, TqBacktest, TqAuth, TqSim, TargetPosTask
            from tqsdk.ta import MA, RSI, ATR, MACD
        except Exception as e:
            logger.error(f"未安装或无法导入TqSDK: {e}")
            raise

        # Setup authentication
        auth = None
        if username and password:
            try:
                auth = TqAuth(username, password)
            except Exception:
                auth = None

        # Calculate initial capital if using units-based sizing
        # Need to create a temporary API to fetch first price
        initial_capital = self.cfg.initial_capital
        if self.initial_units is not None:
            logger.info(f"准备根据单位数 {self.initial_units} 计算初始资金...")
            try:
                # Create temporary API to fetch price
                temp_api = TqApi(auth=auth) if auth else TqApi()
                sym_up = (self.cfg.symbol or "").strip().upper()
                symbol_tq_data = "KQ.m@CZCE.SA" if (sym_up == "SA0" or sym_up.endswith(".SA0") or sym_up == "CZCE.SA0" or sym_up == "SA" or sym_up == "CZCE.SA") else (f"CZCE.{self.cfg.symbol}" if (sym_up.startswith("SA") and "." not in sym_up) else self.cfg.symbol)
                temp_quote = temp_api.get_quote(symbol_tq_data)
                # Add timeout to prevent hanging
                temp_api.wait_update(deadline=time.time() + 10)  # 10 second timeout
                first_price = float(temp_quote.last_price)
                temp_api.close()

                contract_multiplier = 20  # 纯碱合约乘数：20吨/手
                initial_capital = first_price * contract_multiplier * self.initial_units
                self.cfg.initial_capital = initial_capital
                logger.info(f"根据单位数计算初始资金: {first_price:.2f} × {contract_multiplier} × {self.initial_units} = {initial_capital:,.2f}")
            except Exception as e:
                logger.warning(f"无法获取价格计算初始资金，使用默认值: {e}")
                initial_capital = self.cfg.initial_capital

        # Create backtest API with calculated initial capital
        if auth:
            api = TqApi(account=TqSim(init_balance=initial_capital), auth=auth, backtest=TqBacktest(start_dt=start_dt, end_dt=end_dt))
        else:
            api = TqApi(account=TqSim(init_balance=initial_capital), backtest=TqBacktest(start_dt=start_dt, end_dt=end_dt))

        # Get trading symbol and K-line data
        duration_seconds = self.cfg.get_duration_seconds()
        data_length = self.cfg.get_auto_count() + 50  # Extra for warmup
        sym_up = (self.cfg.symbol or "").strip().upper()

        # For data: use continuous contract KQ.m@CZCE.SA
        symbol_tq_data = "KQ.m@CZCE.SA" if (sym_up == "SA0" or sym_up.endswith(".SA0") or sym_up == "CZCE.SA0" or sym_up == "SA" or sym_up == "CZCE.SA") else (f"CZCE.{self.cfg.symbol}" if (sym_up.startswith("SA") and "." not in sym_up) else self.cfg.symbol)

        # Get dominant contract for trading
        quote = api.get_quote(symbol_tq_data)
        klines = api.get_kline_serial(symbol_tq_data, duration_seconds=duration_seconds, data_length=data_length)
        api.wait_update()  # Wait for first update after subscriptions
        symbol_tq_trade = quote.underlying_symbol if hasattr(quote, 'underlying_symbol') and quote.underlying_symbol else "CZCE.SA501"

        # Calculate technical indicators using TqSDK
        try:
            ma10 = MA(klines, 10)
            ma30 = MA(klines, 30)
            ma60 = MA(klines, 60)
            rsi_series = RSI(klines, 14)
            atr_series = ATR(klines, 14)
            macd_series = MACD(klines, 12, 26, 9)

            # Add to klines DataFrame
            klines["ma10"] = ma10["ma"]
            klines["ma30"] = ma30["ma"]
            klines["ma60"] = ma60["ma"]
            klines["rsi"] = rsi_series["rsi"]
            klines["atr"] = atr_series["atr"]
            klines["macd"] = macd_series["diff"]
            klines["macd_dea"] = macd_series["dea"]
            klines["macd_bar"] = macd_series["bar"]

            logger.info(f"技术指标计算完成: MA(10,30,60), RSI(14), ATR(14), MACD(12,26,9)")
        except Exception as e:
            logger.warning(f"TqSDK指标计算失败，将使用手动计算: {e}")

        logger.info(f"=== TqSDK原生回测 ===")
        logger.info(f"数据合约: {symbol_tq_data}")
        logger.info(f"交易合约: {symbol_tq_trade}")
        logger.info(f"回测区间: {start_dt} ~ {end_dt}")
        logger.info(f"决策周期: {self.cfg.period}分钟 ({duration_seconds}秒)")
        logger.info(f"数据长度: {data_length} bars")
        logger.info(f"初始资金: {self.cfg.initial_capital:,.2f}")

        # Get TqSDK objects
        account = api.get_account()
        position = api.get_position(symbol_tq_trade)

        # Create target position task (handles order timing automatically)
        target_pos_task = TargetPosTask(api, symbol_tq_trade)

        # Trading state tracking
        processed_bars = set()
        trade_count = 0
        initial_balance = account.balance
        update_count = 0
        MAX_UPDATES = 100000  # Safety limit (increased from 10000 to handle more updates)
        total_bars_expected = int((end_dt - start_dt).days) if self.cfg.period >= 1440 else None

        logger.info(f"初始资金: {initial_balance:,.2f}")
        logger.info(f"使用TargetPosTask自动处理订单时间")
        if total_bars_expected:
            logger.info(f"预计处理 {total_bars_expected} 根K线")
        
        # Main backtest loop
        while api.wait_update():  # Returns False when backtest ends
            update_count += 1
            if update_count > MAX_UPDATES:
                logger.warning(f"达到最大更新次数 {MAX_UPDATES}")
                break
            
            # Check if new bar completed
            if api.is_changing(klines):
                if len(klines) < 2:
                    continue
                
                # Get completed bar (second to last)
                bar = klines.iloc[-2]
                bar_time = pd.to_datetime(bar["datetime"])
                
                # Skip if already processed
                if bar_time in processed_bars:
                    continue
                processed_bars.add(bar_time)

                # Show progress
                bars_processed = len(processed_bars)
                if total_bars_expected and bars_processed % max(1, total_bars_expected // 10) == 0:
                    progress_pct = (bars_processed / total_bars_expected) * 100
                    logger.info(f"进度: {bars_processed}/{total_bars_expected} bars ({progress_pct:.1f}%)")
                
                # Check if we've reached end
                if bar_time >= end_dt:
                    logger.info(f"达到回测结束时间: {bar_time}")
                    break
                
                # Prepare context data (all bars before current)
                ctx = klines.iloc[: len(klines) - 1].copy()
                df_ctx = pd.DataFrame({
                    "timestamp": pd.to_datetime(ctx["datetime"]),
                    "open": ctx["open"].astype(float),
                    "high": ctx["high"].astype(float),
                    "low": ctx["low"].astype(float),
                    "close": ctx["close"].astype(float),
                    "volume": ctx["volume"].astype(float),
                })
                
                # Current bar as Series
                row = pd.Series({
                    "timestamp": bar_time,
                    "open": float(bar["open"]),
                    "high": float(bar["high"]),
                    "low": float(bar["low"]),
                    "close": float(bar["close"]),
                    "volume": float(bar["volume"]),
                })
                # Set row.name to the index it will have in the dataframe
                row.name = len(df_ctx)
                # Append row to df_ctx so indicators can be computed
                df_ctx = pd.concat([df_ctx, row.to_frame().T], ignore_index=False)

                current_price = float(row["close"]) if not pd.isna(row["close"]) else float(row["open"])
                
                # Get current position from TqSDK
                current_pos_qty = position.pos_long - position.pos_short  # >0 = long, <0 = short, 0 = flat
                
                # Inject position state to decision engine
                if hasattr(self.engine, "current_pos"):
                    if current_pos_qty > 0:
                        self.engine.current_pos = Position(direction="long", qty=current_pos_qty, entry_price=position.open_price_long, stop=0, take=0)
                    elif current_pos_qty < 0:
                        self.engine.current_pos = Position(direction="short", qty=abs(current_pos_qty), entry_price=position.open_price_short, stop=0, take=0)
                    else:
                        self.engine.current_pos = None
                    setattr(self.engine, "current_balance", account.balance)
                elif hasattr(self.engine, "llm_direct") and hasattr(self.engine.llm_direct, "current_pos"):
                    if current_pos_qty > 0:
                        self.engine.llm_direct.current_pos = Position(direction="long", qty=current_pos_qty, entry_price=position.open_price_long, stop=0, take=0)
                    elif current_pos_qty < 0:
                        self.engine.llm_direct.current_pos = Position(direction="short", qty=abs(current_pos_qty), entry_price=position.open_price_short, stop=0, take=0)
                    else:
                        self.engine.llm_direct.current_pos = None
                    setattr(self.engine.llm_direct, "current_balance", account.balance)
                
                # Make trading decision
                try:
                    if self.mode == DecisionMode.QUANT_ONLY:
                        decision = self.engine.decide(row, df_ctx)
                    else:
                        decision = self.engine.decide(row, df_ctx, symbol=self.cfg.symbol)

                    # Output LLM rationale if enabled
                    if self.show_rationale and decision.rationale and len(decision.rationale) > 0:
                        logger.info(f"[{bar_time.strftime('%Y-%m-%d %H:%M')}] 决策依据: {' | '.join(decision.rationale)}")
                        if decision.confidence > 0:
                            logger.info(f"  → 置信度: {decision.confidence:.2%}, 操作: {decision.action}")
                except Exception as e:
                    logger.warning(f"决策失败 @ {bar_time}: {e}")
                    continue
                
                # Execute decision via TqSDK using TargetPosTask
                # TargetPosTask automatically handles order timing and execution
                try:
                    new_target_pos = current_pos_qty  # Default: maintain current position

                    if decision.action == "open_long" and current_pos_qty == 0 and decision.position_size > 0:
                        logger.info(f"[{bar_time.strftime('%Y-%m-%d %H:%M')}] 📈 开多 {decision.position_size}手 @ {current_price:.2f}")
                        if self.show_rationale and decision.rationale:
                            logger.info(f"  └─ 理由: {' | '.join(decision.rationale)}")
                        if decision.stop_loss > 0 or decision.take_profit > 0:
                            logger.info(f"  └─ 止损: {decision.stop_loss:.2f}, 止盈: {decision.take_profit:.2f}")
                        new_target_pos = int(decision.position_size)
                        trade_count += 1

                    elif decision.action == "open_short" and current_pos_qty == 0 and decision.position_size > 0:
                        logger.info(f"[{bar_time.strftime('%Y-%m-%d %H:%M')}] 📉 开空 {decision.position_size}手 @ {current_price:.2f}")
                        if self.show_rationale and decision.rationale:
                            logger.info(f"  └─ 理由: {' | '.join(decision.rationale)}")
                        if decision.stop_loss > 0 or decision.take_profit > 0:
                            logger.info(f"  └─ 止损: {decision.stop_loss:.2f}, 止盈: {decision.take_profit:.2f}")
                        new_target_pos = -int(decision.position_size)
                        trade_count += 1

                    elif decision.action == "close_long" and current_pos_qty > 0:
                        close_qty = int(decision.position_size) if decision.position_size else current_pos_qty
                        logger.info(f"[{bar_time.strftime('%Y-%m-%d %H:%M')}] 🔻 平多 {close_qty}手 @ {current_price:.2f}")
                        if self.show_rationale and decision.rationale:
                            logger.info(f"  └─ 理由: {' | '.join(decision.rationale)}")
                        new_target_pos = max(0, current_pos_qty - close_qty)
                        trade_count += 1

                    elif decision.action == "close_short" and current_pos_qty < 0:
                        close_qty = int(decision.position_size) if decision.position_size else abs(current_pos_qty)
                        logger.info(f"[{bar_time.strftime('%Y-%m-%d %H:%M')}] 🔺 平空 {close_qty}手 @ {current_price:.2f}")
                        if self.show_rationale and decision.rationale:
                            logger.info(f"  └─ 理由: {' | '.join(decision.rationale)}")
                        new_target_pos = min(0, current_pos_qty + close_qty)
                        trade_count += 1

                    # Set target position (TargetPosTask will execute when market is open)
                    if new_target_pos != current_pos_qty:
                        target_pos_task.set_target_volume(new_target_pos)

                except Exception as order_err:
                    logger.warning(f"设置目标持仓失败: {order_err}")
        
        # Close any remaining position at end using TargetPosTask
        final_pos = position.pos_long - position.pos_short
        if final_pos != 0:
            logger.info(f"收盘平仓: {final_pos}手")
            target_pos_task.set_target_volume(0)
        
        # Wait a few updates for final orders to process
        for _ in range(3):
            api.wait_update()
        
        # Collect final statistics
        final_balance = account.balance
        total_return = ((final_balance - initial_balance) / initial_balance) * 100.0 if initial_balance > 0 else 0.0
        
        logger.info("=== 回测完成 ===")
        logger.info(f"交易次数: {trade_count}")
        logger.info(f"初始资金: {initial_balance:,.2f}")
        logger.info(f"最终权益: {final_balance:,.2f}")
        logger.info(f"总收益率: {total_return:.2f}%")
        
        api.close()
        
        return {
            "initial": initial_balance,
            "final": final_balance,
            "return_pct": total_return,
            "trades": [],  # TqSDK manages trades internally
            "wins": 0,
            "losses": 0,
        }



def load_kline(symbol: str, period_min: int, count: int) -> pd.DataFrame:
    # Prefer credentials from config/api_keys.yaml, fallback to environment variables
    username = os.getenv("TQSDK_USERNAME")
    password = os.getenv("TQSDK_PASSWORD")
    use_sim = True
    try:
        import yaml  # local import to avoid global dependency if unused
        cfg_path = ROOT / "config" / "api_keys.yaml"
        if cfg_path.exists():
            cfg = yaml.safe_load(cfg_path.read_text(encoding="utf-8")) or {}
            tcfg = cfg.get("tqsdk", {}) or {}
            username = tcfg.get("username") or username
            password = tcfg.get("password") or password
            use_sim = bool(tcfg.get("use_sim", True))
    except Exception:
        # ignore config errors, rely on env vars
        pass

    # Normalize user-friendly symbols to TqSDK format
    sym_up = (symbol or "").strip().upper()
    symbol_tq = "KQ.m@CZCE.SA" if (sym_up == "SA0" or sym_up.endswith(".SA0")) else symbol
    if symbol_tq != symbol:
        logger.info(f"符号映射 {symbol} -> {symbol_tq}（用于 TqSDK）")
    client = TqSdkClient(symbol=symbol_tq, auth_username=username, auth_password=password, use_sim=use_sim)
    try:
        df = client.get_minute_kline(period=str(period_min), count=count)
        if df is None or df.empty:
            raise RuntimeError("empty kline from TqSDK")
        return df
    finally:
        try:
            client.close()
        except Exception:
            pass


def main():
    parser = argparse.ArgumentParser(description="LLM Direct Decision Backtest using TqSDK")
    parser.add_argument("--mode", choices=[m.value for m in DecisionMode], default=DecisionMode.LLM_DIRECT.value, help="Decision mode")
    parser.add_argument("--symbol", default="KQ.m@CZCE.SA", help="Trading symbol (default: KQ.m@CZCE.SA)")
    parser.add_argument("--period", type=int, default=15, help="K-line period in MINUTES (1=1min, 15=15min, 60=1hour, 1440=daily)")
    parser.add_argument("--count", type=int, default=None, help="Number of K-lines to fetch (auto-calculated if not specified)")
    parser.add_argument("--cache", default=str(Path("logs") / "llm_decisions_cache.json"), help="Cache file path")
    parser.add_argument("--llm_input", choices=["raw", "neutral", "full"], default="neutral", help="LLM input feature mode")
    parser.add_argument("--llm_ignore_risk", action="store_true", help="LLM ignores risk warnings")
    parser.add_argument("--start", help="Backtest start datetime, e.g. 2024-09-01 09:00")
    parser.add_argument("--end", help="Backtest end datetime, e.g. 2024-10-31 15:00")
    parser.add_argument("--initial_units", type=float, default=2.0, help="Initial capital = price × contract_multiplier × units (default: 2.0)")
    parser.add_argument("--visual_prompt", action="store_true", help="Use visual/neutral prompt with ASCII charts (experimental)")
    parser.add_argument("--show_rationale", action="store_true", help="Show detailed rationale for each decision (default: False)")
    args = parser.parse_args()

    logger.add(str(Path("logs") / f"llm_backtest_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log"), rotation="1 day")
    try:
        logging.getLogger("tqsdk").setLevel(logging.WARNING)
    except Exception:
        pass

    cache_path = Path(args.cache) if args.cache else None
    cfg = BTConfig(symbol=args.symbol or "KQ.m@CZCE.SA", period=args.period, count=args.count)

    # 使用TqSDK回测
    mode = DecisionMode(args.mode)
    bt = Backtester(cfg, mode, cache_path=cache_path, llm_input=args.llm_input, llm_ignore_risk=args.llm_ignore_risk, initial_units=args.initial_units, use_visual_prompt=args.visual_prompt, show_rationale=args.show_rationale)
    # 回测区间：参考 TqSDK 教程，支持命令行指定开始/结束时间
    def _parse_dt(s, default):
        if not s:
            return default
        for fmt in ("%Y-%m-%d %H:%M", "%Y-%m-%d", "%Y/%m/%d %H:%M", "%Y/%m/%d"):
            try:
                return datetime.strptime(s, fmt)
            except Exception:
                continue
        return default
    default_start = datetime(2024, 9, 1, 9, 0, 0)
    default_end = datetime(2024, 10, 31, 15, 0, 0)
    start_dt = _parse_dt(args.start, default_start)
    end_dt = _parse_dt(args.end, default_end)

    # 读取TqSDK认证配置
    username = os.getenv("TQSDK_USERNAME")
    password = os.getenv("TQSDK_PASSWORD")
    use_sim = True
    try:
        import yaml
        cfg_path = ROOT / "config" / "api_keys.yaml"
        if cfg_path.exists():
            cfg_yaml = yaml.safe_load(cfg_path.read_text(encoding="utf-8")) or {}
            tcfg = cfg_yaml.get("tqsdk", {}) or {}
            username = tcfg.get("username") or username
            password = tcfg.get("password") or password
            use_sim = bool(tcfg.get("use_sim", True))
    except Exception:
        pass
    logger.info("已启用基于TqSDK的回测下单：请以TqSDK输出的‘模拟交易账户’汇总为准（本脚本摘要仅供参考）")
    logger.info(f"使用TqSDK回测：{args.symbol}, {args.period}m, bars≈{args.count}, 区间 {start_dt} ~ {end_dt}")
    report = bt.run_tqsdk(start_dt=start_dt, end_dt=end_dt, username=username, password=password, use_sim=use_sim)

    print("=== Backtest Summary ===")
    print(f"Mode: {mode.value}")
    print(f"Initial: {report['initial']:.2f}")
    print(f"Final:   {report['final']:.2f}")
    print(f"Return:  {report['return_pct']:.2f}%")
    print(f"Trades:  {len([t for t in report['trades'] if t['side']=='OPEN'])}")
    print(f"Wins/Losses: {report['wins']}/{report['losses']}")
    print("Note: 以 TqSDK ‘模拟交易账户’ 汇总为准；本脚本摘要仅供快速参考。")


if __name__ == "__main__":
    main()
