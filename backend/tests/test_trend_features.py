"""trend_features 纯函数单测：无网络、无 LLM。

重点锁定抵扣价 off-by-one、R²、5 类分类、优雅降级。
"""

import numpy as np
import pandas as pd

from src.services.data.trend_features import (
    _deduction,
    compute_trend_features,
)


def _make_df(closes, highs=None, lows=None):
    closes = np.asarray(closes, dtype=float)
    n = len(closes)
    return pd.DataFrame(
        {
            "open": closes,
            "high": closes if highs is None else np.asarray(highs, dtype=float),
            "low": closes if lows is None else np.asarray(lows, dtype=float),
            "close": closes,
            "volume": np.ones(n),
        }
    )


# ── 抵扣价 off-by-one（最关键）─────────────────────────────────────────────────
def test_deduction_off_by_one_exact():
    """构造 close[-20] < close[-1] < close[-21]，正确实现(用 iloc[-20])→True，
    若错用 iloc[-21] 会得 False。能精确抓 off-by-one。"""
    closes = [100.0] * 30
    closes[9] = 1000.0   # iloc[-21]（len=30）
    closes[10] = 1.0     # iloc[-20]
    closes[-1] = 100.0
    s = pd.Series(closes)
    price, will_rise = _deduction(s, 20)
    assert price == 1.0          # 抵扣价 = close.iloc[-20]
    assert will_rise is True     # 100 > 1（正确）；若错用 iloc[-21] 则 100 > 1000 = False


def test_deduction_matches_sma_direction():
    """will_rise 必须与"假设下一根=现价时 SMA 的实际涨跌"一致。"""
    rng = np.random.default_rng(42)
    for _ in range(20):
        closes = (100 + rng.normal(0, 5, size=200).cumsum()).clip(min=1.0)
        s = pd.Series(closes)
        for n in (20, 60, 120):
            price, will_rise = _deduction(s, n)
            sma_now = s.iloc[-n:].mean()
            # 下一根 = 现价：滑出 close[-n]，加入 close[-1]
            sma_next = sma_now + (s.iloc[-1] - s.iloc[-n]) / n
            assert will_rise == (sma_next > sma_now)
            assert price == s.iloc[-n]


def test_deduction_insufficient():
    s = pd.Series([100.0] * 50)
    assert _deduction(s, 120) == (None, None)   # len < n


# ── 5 类趋势分类 ──────────────────────────────────────────────────────────────
def test_perfect_uptrend():
    closes = 100 * np.exp(0.001 * np.arange(300))   # 对数线性上涨
    out = compute_trend_features(_make_df(closes))
    assert out["r2"] is not None and out["r2"] > 0.99
    assert out["slope_ann"] is not None and out["slope_ann"] > 0
    assert out["alignment"] == "多头排列"
    assert out["trend_type"] == "2点 稳定上涨"
    assert out["pullback"]["ma120"] is not None and out["pullback"]["ma120"] > 0


def test_acceleration_uptrend():
    inc = np.array([0.0003] * 200 + [0.004] * 100)
    closes = 100 * np.exp(np.cumsum(inc))
    out = compute_trend_features(_make_df(closes))
    assert out["trend_type"] == "12点 加速上涨"


def test_flat_consolidation():
    closes = 100 + 0.3 * np.sin(np.arange(300) / 3.0)   # 窄幅横盘
    out = compute_trend_features(_make_df(closes))
    assert out["converged"] is True
    assert out["trend_type"] == "3点 横向整理(密集成交区)"
    assert out["consolidation"]["in"] is True
    assert out["consolidation"]["days"] > 0
    assert out["consolidation"]["box_hi"] is not None


def test_downtrend():
    closes = 100 * np.exp(-0.001 * np.arange(300))
    out = compute_trend_features(_make_df(closes))
    assert out["alignment"] == "空头排列"
    assert out["trend_type"] == "4点 稳定下跌"


def test_acceleration_downtrend():
    inc = np.array([-0.0003] * 200 + [-0.004] * 100)
    closes = 100 * np.exp(np.cumsum(inc))
    out = compute_trend_features(_make_df(closes))
    assert out["trend_type"] == "6点 加速下跌"


# ── 优雅降级 ──────────────────────────────────────────────────────────────────
def test_empty_df():
    out = compute_trend_features(pd.DataFrame())
    assert out["trend_type"] is None
    assert out["ma20"] is None
    assert out["deduction"][120]["price"] is None


def test_short_history_below_slope_min():
    closes = 100 + np.arange(50)   # 50 根 < 60
    out = compute_trend_features(_make_df(closes))
    assert out["slope_ann"] is None
    assert out["trend_type"] is None      # 斜率不可靠 → 不分类
    assert out["ma20"] is not None        # 但 MA20 仍可算
    assert out["ma120"] is None           # 不足 120 根
    assert out["deduction"][120]["price"] is None


def test_classify_trend_false_keeps_other_fields():
    """分钟线主图模式：不做 5 类分类，但其余特征照常。"""
    closes = 100 * np.exp(0.001 * np.arange(300))
    out = compute_trend_features(_make_df(closes), classify_trend=False)
    assert out["trend_type"] is None
    assert out["alignment"] == "多头排列"
    assert out["deduction"][20]["will_rise"] is True
