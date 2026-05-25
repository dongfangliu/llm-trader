/**
 * 技术指标 + 趋势跟随方法论特征（纯函数，前端计算）。
 *
 * 与后端严格对齐：
 *  - 基础指标对齐 backend/.../data_service.py `_calculate_indicators`（ta 库）
 *  - 方法论特征对齐 backend/.../trend_features.py
 * 输出结构与后端 compute_trend_features 同构（供后端拼 prompt 与前端展示共用）。
 * bars 需按时间升序（最新在末尾）。
 */

export interface OhlcvBar {
  d: string
  o: number
  h: number
  l: number
  c: number
  v: number
}

export interface Deduction {
  price: number | null
  will_rise: boolean | null
}

export interface TrendFeatures {
  trend_type: string | null
  slope_ann: number | null
  r2: number | null
  ma20: number | null
  ma60: number | null
  ma120: number | null
  ema20: number | null
  ema60: number | null
  ema120: number | null
  alignment: string | null
  ma_spread_pct: number | null
  converged: boolean | null
  deduction: Record<string, Deduction>
  consolidation: { in: boolean | null; days: number | null; box_hi: number | null; box_lo: number | null }
  reversal: Record<string, boolean | null>
  pullback: { ma20: number | null; ma60: number | null; ma120: number | null }
}

export interface LegacyIndicators {
  ma10: number | null
  ma30: number | null
  ma60: number | null
  rsi: number | null
  atr: number | null
  macd: number | null
  macd_dea: number | null
  macd_bar: number | null
}

// ── 窗口/阈值（与 trend_features.py 完全一致）──────────────────────────────
const SLOPE_WINDOW = 250
const SLOPE_SHORT_WINDOW = 60
const MIN_SLOPE_BARS = 60
const CONSOLIDATION_WINDOW = 120
const REVERSAL_LOOKBACK = 5
const SPREAD_CONVERGED = 0.02
const FLAT_EPS = 0.1
const STABLE_MAX = 0.6
const MIN_R2 = 0.2

// ── 指标基元 ──────────────────────────────────────────────────────────────
/** 简单移动平均，对齐 pandas rolling(n).mean()（前 n-1 个为 null）。 */
function sma(values: number[], n: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null)
  let sum = 0
  for (let i = 0; i < values.length; i++) {
    sum += values[i]
    if (i >= n) sum -= values[i - n]
    if (i >= n - 1) out[i] = sum / n
  }
  return out
}

/** EMA，对齐 pandas ewm(span=n, adjust=False)：alpha=2/(n+1)，初值=values[0]。 */
function ema(values: number[], n: number): number[] {
  const out: number[] = new Array(values.length).fill(NaN)
  if (values.length === 0) return out
  const alpha = 2 / (n + 1)
  let prev = values[0]
  out[0] = prev
  for (let i = 1; i < values.length; i++) {
    prev = alpha * values[i] + (1 - alpha) * prev
    out[i] = prev
  }
  return out
}

/** Wilder 平滑，对齐 ta 库 ewm(alpha=1/n, adjust=False)：初值=values[0]。 */
function wilderEwm(values: number[], n: number): number[] {
  const out: number[] = new Array(values.length).fill(NaN)
  if (values.length === 0) return out
  const alpha = 1 / n
  let prev = values[0]
  out[0] = prev
  for (let i = 1; i < values.length; i++) {
    prev = alpha * values[i] + (1 - alpha) * prev
    out[i] = prev
  }
  return out
}

/** RSI(14)，对齐 ta.momentum.RSIIndicator：rsi = 100*emaUp/(emaUp+emaDown)，Wilder ewm。 */
function rsi(closes: number[], n = 14): (number | null)[] {
  const len = closes.length
  const out: (number | null)[] = new Array(len).fill(null)
  if (len < 2) return out
  const up = new Array(len).fill(0)
  const down = new Array(len).fill(0)
  for (let i = 1; i < len; i++) {
    const diff = closes[i] - closes[i - 1]
    up[i] = diff > 0 ? diff : 0
    down[i] = diff < 0 ? -diff : 0
  }
  const emaUp = wilderEwm(up, n)
  const emaDown = wilderEwm(down, n)
  for (let i = 0; i < len; i++) {
    const denom = emaUp[i] + emaDown[i]
    out[i] = denom === 0 ? 100 : (100 * emaUp[i]) / denom
  }
  return out
}

/** ATR(14)，对齐 ta：TR 后用 SMA(前 n 根 TR) 作 seed + Wilder 递推。 */
function atr(highs: number[], lows: number[], closes: number[], n = 14): (number | null)[] {
  const len = closes.length
  const out: (number | null)[] = new Array(len).fill(null)
  if (len <= n) return out
  const tr = new Array(len).fill(0)
  tr[0] = highs[0] - lows[0]
  for (let i = 1; i < len; i++) {
    tr[i] = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1]),
    )
  }
  let seed = 0
  for (let i = 1; i <= n; i++) seed += tr[i]
  out[n] = seed / n
  for (let i = n + 1; i < len; i++) out[i] = ((out[i - 1] as number) * (n - 1) + tr[i]) / n
  return out
}

/** MACD(12,26,9)，对齐 ta：macd=ema12-ema26, dea=ema9(macd), bar=macd-dea。 */
function macd(closes: number[], fast = 12, slow = 26, sign = 9) {
  const ef = ema(closes, fast)
  const es = ema(closes, slow)
  const line = closes.map((_, i) => ef[i] - es[i])
  const dea = ema(line, sign)
  const bar = line.map((v, i) => v - dea[i])
  return { macd: line, dea, bar }
}

function lastValid(arr: (number | null)[] | number[]): number | null {
  for (let i = arr.length - 1; i >= 0; i--) {
    const v = arr[i]
    if (v !== null && Number.isFinite(v as number)) return v as number
  }
  return null
}

// ── legacy 指标集（经典四步用）──────────────────────────────────────────────
export function computeLegacyIndicators(bars: OhlcvBar[]): LegacyIndicators {
  const closes = bars.map((b) => b.c)
  const highs = bars.map((b) => b.h)
  const lows = bars.map((b) => b.l)
  const m = macd(closes)
  return {
    ma10: lastValid(sma(closes, 10)),
    ma30: lastValid(sma(closes, 30)),
    ma60: lastValid(sma(closes, 60)),
    rsi: lastValid(rsi(closes, 14)),
    atr: lastValid(atr(highs, lows, closes, 14)),
    macd: lastValid(m.macd),
    macd_dea: lastValid(m.dea),
    macd_bar: lastValid(m.bar),
  }
}

// ── 方法论特征（趋势跟随）──────────────────────────────────────────────────
/** trailing window 对数价格线性回归年化斜率 + R²，对齐 trend_features._log_slope。 */
function logSlope(closes: number[], window: number, barsPerYear: number): [number | null, number | null] {
  const c = closes.filter((v) => Number.isFinite(v) && v > 0)
  const n = Math.min(window, c.length)
  if (n < MIN_SLOPE_BARS) return [null, null]
  const ys = c.slice(c.length - n).map((v) => Math.log(v))
  const meanX = (n - 1) / 2
  const meanY = ys.reduce((a, b) => a + b, 0) / n
  let sxy = 0
  let sxx = 0
  for (let i = 0; i < n; i++) {
    sxy += (i - meanX) * (ys[i] - meanY)
    sxx += (i - meanX) ** 2
  }
  const slope = sxx === 0 ? 0 : sxy / sxx
  const intercept = meanY - slope * meanX
  let ssRes = 0
  let ssTot = 0
  for (let i = 0; i < n; i++) {
    const yhat = slope * i + intercept
    ssRes += (ys[i] - yhat) ** 2
    ssTot += (ys[i] - meanY) ** 2
  }
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : null
  return [slope * barsPerYear, r2]
}

function classifyClock(
  slopeAnn: number | null,
  slopeShortAnn: number | null,
  r2: number | null,
  converged: boolean,
): string | null {
  if (slopeAnn === null) return null
  if (converged || (r2 !== null && r2 < MIN_R2) || Math.abs(slopeAnn) < FLAT_EPS) {
    return '3点 横向整理(密集成交区)'
  }
  if (slopeAnn > 0) {
    const acc = slopeAnn > STABLE_MAX || (slopeShortAnn !== null && slopeShortAnn > slopeAnn + FLAT_EPS)
    return acc ? '12点 加速上涨' : '2点 稳定上涨'
  }
  const acc = slopeAnn < -STABLE_MAX || (slopeShortAnn !== null && slopeShortAnn < slopeAnn - FLAT_EPS)
  return acc ? '6点 加速下跌' : '4点 稳定下跌'
}

function alignmentOf(ma20: number | null, ma60: number | null, ma120: number | null): string | null {
  if (ma20 === null || ma60 === null || ma120 === null) return null
  if (ma20 > ma60 && ma60 > ma120) return '多头排列'
  if (ma20 < ma60 && ma60 < ma120) return '空头排列'
  return '纠缠'
}

/** 抵扣价(N)=当前窗口最老收盘价=close[-N]；will_rise=close[-1]>close[-N]。仅 SMA。 */
function deductionOf(closes: number[], n: number): Deduction {
  const c = closes.filter((v) => Number.isFinite(v))
  if (c.length < n) return { price: null, will_rise: null }
  const dprice = c[c.length - n]
  const cur = c[c.length - 1]
  return { price: dprice, will_rise: cur > dprice }
}

function detectConsolidation(
  bars: OhlcvBar[],
  ma20s: (number | null)[],
  ma60s: (number | null)[],
  ma120s: (number | null)[],
): { in: boolean | null; days: number | null; box_hi: number | null; box_lo: number | null } {
  const n = bars.length
  if (n === 0) return { in: null, days: null, box_hi: null, box_lo: null }
  let days = 0
  const lower = Math.max(-1, n - 1 - CONSOLIDATION_WINDOW)
  for (let i = n - 1; i > lower; i--) {
    const a = ma20s[i]
    const b = ma60s[i]
    const c = ma120s[i]
    const px = bars[i].c
    if (a === null || b === null || c === null || !Number.isFinite(px) || px <= 0) break
    const spread = (Math.max(a, b, c) - Math.min(a, b, c)) / px
    if (spread < SPREAD_CONVERGED) days++
    else break
  }
  if (days === 0) return { in: false, days: 0, box_hi: null, box_lo: null }
  let hi = -Infinity
  let lo = Infinity
  for (let i = n - days; i < n; i++) {
    hi = Math.max(hi, bars[i].h)
    lo = Math.min(lo, bars[i].l)
  }
  return { in: true, days, box_hi: hi, box_lo: lo }
}

function signChanged(series: (number | null)[], lookback: number): boolean | null {
  const s = series.filter((v) => v !== null && Number.isFinite(v as number)) as number[]
  if (s.length < lookback + 1) return null
  const recent = s.slice(s.length - (lookback + 1)).map((v) => Math.sign(v))
  const last = recent[recent.length - 1]
  if (last === 0) return false
  return recent.slice(0, -1).some((x) => x !== last)
}

function reversalFlags(
  closes: number[],
  ma20s: (number | null)[],
  ma60s: (number | null)[],
): Record<string, boolean | null> {
  const cMinusMa = closes.map((c, i) => (ma20s[i] === null ? null : c - (ma20s[i] as number)))
  const slope = ma20s.map((v, i) =>
    i === 0 || v === null || ma20s[i - 1] === null ? null : (v as number) - (ma20s[i - 1] as number),
  )
  const cross = ma20s.map((v, i) => (v === null || ma60s[i] === null ? null : (v as number) - (ma60s[i] as number)))
  return {
    破线: signChanged(cMinusMa, REVERSAL_LOOKBACK),
    拐头: signChanged(slope, REVERSAL_LOOKBACK),
    交叉: signChanged(cross, REVERSAL_LOOKBACK),
  }
}

function emptyTrendFeatures(): TrendFeatures {
  return {
    trend_type: null,
    slope_ann: null,
    r2: null,
    ma20: null,
    ma60: null,
    ma120: null,
    ema20: null,
    ema60: null,
    ema120: null,
    alignment: null,
    ma_spread_pct: null,
    converged: null,
    deduction: {
      '20': { price: null, will_rise: null },
      '60': { price: null, will_rise: null },
      '120': { price: null, will_rise: null },
    },
    consolidation: { in: null, days: null, box_hi: null, box_lo: null },
    reversal: { 破线: null, 拐头: null, 交叉: null },
    pullback: { ma20: null, ma60: null, ma120: null },
  }
}

export function computeTrendFeatures(
  bars: OhlcvBar[],
  opts?: { classifyTrend?: boolean; barsPerYear?: number },
): TrendFeatures {
  const classifyTrend = opts?.classifyTrend ?? true
  const barsPerYear = opts?.barsPerYear ?? 250
  const out = emptyTrendFeatures()
  if (!bars || bars.length === 0) return out

  const closes = bars.map((b) => Math.max(b.c, 1e-9))
  const ma20s = sma(closes, 20)
  const ma60s = sma(closes, 60)
  const ma120s = sma(closes, 120)
  const ma20 = lastValid(ma20s)
  const ma60 = lastValid(ma60s)
  const ma120 = lastValid(ma120s)
  const closeLatest = lastValid(closes)

  out.ma20 = ma20
  out.ma60 = ma60
  out.ma120 = ma120
  out.ema20 = lastValid(ema(closes, 20))
  out.ema60 = lastValid(ema(closes, 60))
  out.ema120 = lastValid(ema(closes, 120))

  if (ma20 !== null && ma60 !== null && ma120 !== null && closeLatest) {
    const spread = (Math.max(ma20, ma60, ma120) - Math.min(ma20, ma60, ma120)) / closeLatest
    out.ma_spread_pct = spread * 100
    out.converged = spread < SPREAD_CONVERGED
  }
  out.alignment = alignmentOf(ma20, ma60, ma120)

  const [slopeAnn, r2] = logSlope(closes, SLOPE_WINDOW, barsPerYear)
  const [slopeShort] = logSlope(closes, SLOPE_SHORT_WINDOW, barsPerYear)
  out.slope_ann = slopeAnn
  out.r2 = r2
  if (classifyTrend) out.trend_type = classifyClock(slopeAnn, slopeShort, r2, !!out.converged)

  for (const n of [20, 60, 120]) out.deduction[String(n)] = deductionOf(closes, n)
  out.consolidation = detectConsolidation(bars, ma20s, ma60s, ma120s)
  out.pullback = {
    ma20: ma20 !== null && closeLatest ? ((closeLatest - ma20) / ma20) * 100 : null,
    ma60: ma60 !== null && closeLatest ? ((closeLatest - ma60) / ma60) * 100 : null,
    ma120: ma120 !== null && closeLatest ? ((closeLatest - ma120) / ma120) * 100 : null,
  }
  out.reversal = reversalFlags(closes, ma20s, ma60s)
  return out
}
