"""趋势跟随方法论量化特征（纯函数，无 IO）。

把方法论里"能算"的判据算成确定性信号喂给 LLM，避免让模型从原始数字里猜：
- 时钟方向 / 5 类趋势：对数价格线性回归斜率 + R² + 加速度对比
- MA & EMA 20/60/120（双算法互验）
- 抵扣价（deduction price）：预测下一根均线方向（仅对 SMA 成立）
- 密集成交区：均线密集度 + 向后扫描持续时长
- 多头/空头排列（完整三线）
- 破线 / 拐头 / 交叉（趋势转折三步）
- 回撤位（到各均线距离）

所有函数皆为纯函数：输入含 OHLCV 列的 DataFrame，输出 dict。
数据不足/缺失一律返回 None，绝不臆造。
窗口一律以"根(bar)"表达，跨周期通用。
"""

from __future__ import annotations

from typing import Optional

import numpy as np
import pandas as pd


# ── 窗口（单位：根，跨周期通用）────────────────────────────────────────────────
_SLOPE_WINDOW = 250          # 主斜率窗口 ≈ 日线 1 年
_SLOPE_SHORT_WINDOW = 60     # 加速度对比窗口
_MIN_SLOPE_BARS = 60         # 少于此根数斜率/分类不可靠 → None
_MA_WINDOWS = (20, 60, 120)
_CONSOLIDATION_WINDOW = 120  # 密集成交区扫描窗口 ≈ 日线半年
_REVERSAL_LOOKBACK = 5       # 破线/拐头/交叉回看根数

# ── 分类阈值（基于年化对数斜率）──────────────────────────────────────────────
_SPREAD_CONVERGED = 0.02     # 均线密集度 < 2% 视为密集（密集区结束信号）
_FLAT_EPS = 0.10             # |年化斜率| < 10%/年 视为横向
_STABLE_MAX = 0.60           # 10%~60%/年 稳定；超过视为斜率加速
_MIN_R2 = 0.20               # R² 低于此 → 无干净趋势 → 横向/纠缠


def _sma(close: pd.Series, n: int) -> pd.Series:
    return close.rolling(n).mean()


def _ema(close: pd.Series, n: int) -> pd.Series:
    return close.ewm(span=n, adjust=False).mean()


def _latest(series: Optional[pd.Series]) -> Optional[float]:
    """序列最后一个有限值，否则 None。"""
    if series is None or len(series) == 0:
        return None
    v = series.iloc[-1]
    if pd.isna(v):
        return None
    return float(v)


def _log_slope(
    close: pd.Series, window: int, bars_per_year: int
) -> tuple[Optional[float], Optional[float]]:
    """trailing `window` 根对数价格线性回归的年化斜率 + R²。

    slope_per_bar = 每根的连续复利收益（尺度无关，跨标的可比）。
    返回 (年化斜率, R²)，数据太短返回 (None, None)。
    """
    c = close.dropna()
    n = min(window, len(c))
    if n < _MIN_SLOPE_BARS:
        return None, None
    y = np.log(c.iloc[-n:].to_numpy(dtype=float))
    x = np.arange(n, dtype=float)
    coeffs = np.polyfit(x, y, 1)
    slope_per_bar = float(coeffs[0])
    yhat = np.polyval(coeffs, x)
    ss_res = float(((y - yhat) ** 2).sum())
    ss_tot = float(((y - y.mean()) ** 2).sum())
    r2 = (1.0 - ss_res / ss_tot) if ss_tot > 0 else None
    return slope_per_bar * bars_per_year, r2


def _classify_clock(
    slope_ann: Optional[float],
    slope_short_ann: Optional[float],
    r2: Optional[float],
    converged: bool,
) -> Optional[str]:
    """年化斜率 + 加速度 + 质量 → 5 类时钟方向之一。"""
    if slope_ann is None:
        return None
    # 无干净趋势 / 均线密集 → 横向整理（密集成交区）
    if converged or (r2 is not None and r2 < _MIN_R2) or abs(slope_ann) < _FLAT_EPS:
        return "3点 横向整理(密集成交区)"
    if slope_ann > 0:
        accelerating = slope_ann > _STABLE_MAX or (
            slope_short_ann is not None and slope_short_ann > slope_ann + _FLAT_EPS
        )
        return "12点 加速上涨" if accelerating else "2点 稳定上涨"
    accelerating = slope_ann < -_STABLE_MAX or (
        slope_short_ann is not None and slope_short_ann < slope_ann - _FLAT_EPS
    )
    return "6点 加速下跌" if accelerating else "4点 稳定下跌"


def _alignment(
    ma20: Optional[float], ma60: Optional[float], ma120: Optional[float]
) -> Optional[str]:
    """完整三线排列。"""
    if ma20 is None or ma60 is None or ma120 is None:
        return None
    if ma20 > ma60 > ma120:
        return "多头排列"
    if ma20 < ma60 < ma120:
        return "空头排列"
    return "纠缠"


def _ma_spread(
    ma20: Optional[float],
    ma60: Optional[float],
    ma120: Optional[float],
    close: Optional[float],
) -> tuple[Optional[float], Optional[bool]]:
    """均线密集度 = (最高均线 - 最低均线) / 现价；< 2% 视为密集。"""
    vals = [v for v in (ma20, ma60, ma120) if v is not None]
    if len(vals) < 3 or not close:
        return None, None
    spread = (max(vals) - min(vals)) / close
    return spread, spread < _SPREAD_CONVERGED


def _deduction(close: pd.Series, n: int) -> tuple[Optional[float], Optional[bool]]:
    """N 根 SMA 的抵扣价 = 当前窗口中最老的那根收盘价 = close.iloc[-n]。

    预测下一根 SMA 方向（假设新价 ≈ 现价）：
        SMA_{t+1} - SMA_t = (close_{t+1} - close_{t-n+1}) / n
        滑出窗口的是 close_{t-n+1} = close.iloc[-n]
        will_rise ≈ close.iloc[-1] > close.iloc[-n]
    仅对 SMA 成立（EMA 无单根滑出，不可用此法）。
    """
    c = close.dropna()
    if len(c) < n:
        return None, None
    dprice = float(c.iloc[-n])
    cur = float(c.iloc[-1])
    return dprice, cur > dprice


def _detect_consolidation(
    df: pd.DataFrame,
    ma20s: pd.Series,
    ma60s: pd.Series,
    ma120s: pd.Series,
    window: int = _CONSOLIDATION_WINDOW,
    spread_thr: float = _SPREAD_CONVERGED,
) -> tuple[Optional[bool], Optional[int], Optional[float], Optional[float]]:
    """向后扫描：统计最近连续多少根满足"均线密集度 < 阈值"。

    返回 (是否密集, 持续根数, 箱体上沿, 箱体下沿)。遇 NaN 即中断streak。
    """
    close = df["close"]
    n = len(close)
    if n == 0 or ma120s is None:
        return None, None, None, None
    days = 0
    for i in range(n - 1, max(-1, n - 1 - window), -1):
        a, b, c = ma20s.iloc[i], ma60s.iloc[i], ma120s.iloc[i]
        px = close.iloc[i]
        if pd.isna(a) or pd.isna(b) or pd.isna(c) or pd.isna(px) or px <= 0:
            break
        spread = (max(a, b, c) - min(a, b, c)) / px
        if spread < spread_thr:
            days += 1
        else:
            break
    if days == 0:
        return False, 0, None, None
    hi_src = df["high"] if "high" in df else close
    lo_src = df["low"] if "low" in df else close
    box_hi = float(hi_src.iloc[n - days:].max())
    box_lo = float(lo_src.iloc[n - days:].min())
    return True, days, box_hi, box_lo


def _sign_changed(series: pd.Series, lookback: int) -> Optional[bool]:
    """最近 lookback 根内符号是否发生过翻转（且当前非零）。"""
    s = series.dropna()
    if len(s) < lookback + 1:
        return None
    arr = np.sign(s.iloc[-(lookback + 1):].to_numpy())
    return bool((arr[:-1] != arr[-1]).any() and arr[-1] != 0)


def _reversal_flags(
    close: pd.Series, ma20s: pd.Series, ma60s: pd.Series, lookback: int = _REVERSAL_LOOKBACK
) -> dict:
    """趋势转折三步在 20 均线组上的迹象：破线 / 拐头 / 交叉。"""
    out = {"破线": None, "拐头": None, "交叉": None}
    if ma20s is None or ma60s is None:
        return out
    out["破线"] = _sign_changed(close - ma20s, lookback)        # 价格上穿/下破 MA20
    out["拐头"] = _sign_changed(ma20s.diff(), lookback)         # MA20 自身斜率翻向
    out["交叉"] = _sign_changed(ma20s - ma60s, lookback)        # MA20 与 MA60 交叉
    return out


def _pullback_distances(
    close: Optional[float],
    ma20: Optional[float],
    ma60: Optional[float],
    ma120: Optional[float],
) -> dict:
    """现价相对各均线的距离%（正=在均线上方，负=下方）。"""
    out: dict = {}
    for name, ma in (("ma20", ma20), ("ma60", ma60), ("ma120", ma120)):
        out[name] = ((close - ma) / ma * 100.0) if (ma and close) else None
    return out


def compute_trend_features(
    df: pd.DataFrame, *, classify_trend: bool = True, bars_per_year: int = 250
) -> dict:
    """计算方法论量化特征。

    Args:
        df: 含 OHLCV 列（至少 close，理想含 high/low）的 DataFrame，按时间升序。
        classify_trend: 是否做 5 类时钟方向分类（日线 True；分钟线主图传 False，
            方向交给日线大周期，避免年化失真）。
        bars_per_year: 年化因子（日线 250）。

    Returns:
        dict，缺失项为 None。
    """
    out: dict = {
        "trend_type": None,
        "slope_ann": None,
        "r2": None,
        "ma20": None, "ma60": None, "ma120": None,
        "ema20": None, "ema60": None, "ema120": None,
        "alignment": None,
        "ma_spread_pct": None,
        "converged": None,
        "deduction": {n: {"price": None, "will_rise": None} for n in _MA_WINDOWS},
        "consolidation": {"in": None, "days": None, "box_hi": None, "box_lo": None},
        "reversal": {"破线": None, "拐头": None, "交叉": None},
        "pullback": {"ma20": None, "ma60": None, "ma120": None},
    }
    if df is None or len(df) == 0 or "close" not in df:
        return out

    close = pd.to_numeric(df["close"], errors="coerce").clip(lower=1e-9)

    ma20s, ma60s, ma120s = _sma(close, 20), _sma(close, 60), _sma(close, 120)
    ema20s, ema60s, ema120s = _ema(close, 20), _ema(close, 60), _ema(close, 120)
    ma20, ma60, ma120 = _latest(ma20s), _latest(ma60s), _latest(ma120s)
    close_latest = _latest(close)

    out.update(
        ma20=ma20, ma60=ma60, ma120=ma120,
        ema20=_latest(ema20s), ema60=_latest(ema60s), ema120=_latest(ema120s),
    )

    spread, converged = _ma_spread(ma20, ma60, ma120, close_latest)
    out["ma_spread_pct"] = (spread * 100.0) if spread is not None else None
    out["converged"] = converged
    out["alignment"] = _alignment(ma20, ma60, ma120)

    slope_ann, r2 = _log_slope(close, _SLOPE_WINDOW, bars_per_year)
    slope_short_ann, _ = _log_slope(close, _SLOPE_SHORT_WINDOW, bars_per_year)
    out["slope_ann"], out["r2"] = slope_ann, r2
    if classify_trend:
        out["trend_type"] = _classify_clock(slope_ann, slope_short_ann, r2, bool(converged))

    for n in _MA_WINDOWS:
        p, wr = _deduction(close, n)
        out["deduction"][n] = {"price": p, "will_rise": wr}

    in_c, days, box_hi, box_lo = _detect_consolidation(df, ma20s, ma60s, ma120s)
    out["consolidation"] = {"in": in_c, "days": days, "box_hi": box_hi, "box_lo": box_lo}

    out["pullback"] = _pullback_distances(close_latest, ma20, ma60, ma120)
    out["reversal"] = _reversal_flags(close, ma20s, ma60s)
    return out
