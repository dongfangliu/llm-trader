"""Methodology prompt rendering regression tests.

These tests do not call the LLM. They only validate the user prompt text built
from OHLCV data and precomputed trend features.
"""

import numpy as np
import pandas as pd

from src.services.data.trend_features import compute_trend_features
from src.services.llm.llm_service import _build_methodology_prompt

# 提示词中不应再出现的 emoji
EMOJI = "📊📈📉📋💰💸🎯🔍💡⚖️📝📤📐🧭"


def _df(closes):
    closes = np.asarray(closes, dtype=float)
    n = len(closes)
    return pd.DataFrame(
        {
            "open": closes,
            "high": closes * 1.01,
            "low": closes * 0.99,
            "close": closes,
            "volume": np.ones(n) * 1000.0,
            "rsi": np.full(n, 55.0),
            "atr": np.full(n, 1.0),
            "macd": np.full(n, 0.1),
            "macd_dea": np.full(n, 0.05),
            "macd_bar": np.full(n, 0.05),
        }
    )


def test_daily_prompt_has_methodology_and_no_emoji():
    closes = 100 * np.exp(0.001 * np.arange(300))
    p = _build_methodology_prompt(_df(closes), symbol="600519", market="a", period="daily")
    assert "主图(日线)趋势诊断" in p
    assert "趋势类型:" in p
    assert "多头排列" in p
    assert "抵扣价" in p
    assert "第一步：趋势诊断" in p
    assert "日线大周期方向" not in p                  # daily 不加大周期块
    assert '"opportunity_quality": "A|B|C|D"' in p     # JSON schema 保持不变
    assert not any(e in p for e in EMOJI)              # 无 emoji


def test_intraday_prompt_has_higher_tf_block():
    closes = 100 * np.exp(0.001 * np.arange(300))
    higher = compute_trend_features(_df(closes), classify_trend=True)
    p = _build_methodology_prompt(
        _df(closes), symbol="600519", market="a", period="5", higher_tf_features=higher
    )
    assert "日线大周期方向" in p
    assert "5分钟线" in p
    assert not any(e in p for e in EMOJI)


def test_intraday_without_higher_tf_degrades():
    closes = 100 * np.exp(0.001 * np.arange(300))
    p = _build_methodology_prompt(
        _df(closes), symbol="X", market="a", period="15", higher_tf_features=None
    )
    assert "大周期数据暂缺" in p
    assert not any(e in p for e in EMOJI)


def test_futures_prompt_keeps_action_enum():
    closes = 100 * np.exp(-0.001 * np.arange(300))
    p = _build_methodology_prompt(_df(closes), symbol="rb2410", market="futures", period="daily")
    assert "open_long|close_long|open_short|close_short|hold" in p
    assert "空头排列" in p
    assert not any(e in p for e in EMOJI)
