import type { CardPayload, Direction } from './types'

/**
 * Shared visual tokens + brand constants for both the Vue preview components
 * and the satori PNG renderers. Single source of truth, so preview === PNG.
 */

// ── Brand / product identity ────────────────────────────────────
export const BRAND = {
  name: 'K线AI分析助手',        // must match backend settings.app_name
  tagline: '技术面 AI 研判',      // subtle, non-promotional
  fallbackDomain: 'caicai.tech', // used only if payload.product_url missing
} as const

/** Extract pretty domain from product_url; fallback to BRAND.fallbackDomain */
export function prettyDomain(productUrl?: string): string {
  if (!productUrl) return BRAND.fallbackDomain
  try {
    return new URL(productUrl).hostname.replace(/^www\./, '')
  } catch {
    return BRAND.fallbackDomain
  }
}

// ── Color palette ─────────────────────────────────────────────────
// Dark theme (bearish / proof / data_record)
// 中国股市惯例：涨 = 红，跌 = 绿
export const C = {
  BG: '#0A0E17',
  BG_DEEP: '#080B12',
  SURFACE: '#141929',
  UP: '#E05060',        // 涨 → 红
  UP_BG: 'rgba(224,80,96,0.15)',
  DOWN: '#2BC884',      // 跌 → 绿
  DOWN_BG: 'rgba(43,200,132,0.15)',
  HOLD: '#D4A849',
  HOLD_BG: 'rgba(212,168,73,0.15)',
  GOLD: '#B8922A',
  BRAND: '#6B7FD4',
  TEXT: '#F0F4FF',
  DIM: 'rgba(240,244,255,0.45)',
  DIMMER: 'rgba(240,244,255,0.28)',
  BORDER: 'rgba(240,244,255,0.08)',
  // 性能评级色（与涨跌无关：高胜率=绿好，低胜率=红差）
  PERF_GOOD: '#2BC884',
  PERF_MID: '#D4A849',
  PERF_BAD: '#E05060',
} as const

// Light theme (bullish promise)
export const CL = {
  BG: '#F0EDE6',
  UP: '#C23535',        // 涨 → 深红（亮色背景）
  DOWN: '#1A7A4A',      // 跌 → 深绿（亮色背景）
  HOLD: '#C47F1A',
  GOLD: '#7A5C18',
  BRAND: '#3D4FA8',
  TEXT: '#111111',
  DIM: 'rgba(17,17,17,0.62)',
  DIMMER: 'rgba(17,17,17,0.44)',
  BORDER: 'rgba(17,17,17,0.18)',
} as const

/** 胜率颜色：金色代表质量，≥50% 金色，<50% 弱化显示 */
export function pctColor(pct: number | null): string {
  return (pct ?? 0) >= 50 ? C.GOLD : C.DIM
}

/**
 * 颜色铁律：红涨绿跌（CN 习惯），按"实际市场涨跌方向"映射颜色，**不**按"命中/未中"映射。
 * Reviewer 看到"做多+对=红"请不要"修正"——红色代表股价上涨，与胜负无关。
 *
 * 用于结算条 / 印章 / 实际涨跌值的着色：
 *   pctTone(+3.42, true)  → 深红 (CL.UP) — 因为涨了
 *   pctTone(-2.40, true)  → 深绿 (CL.DOWN) — 因为跌了
 *   pctTone(0, true)      → 琥珀/dim — 平盘
 */
export function pctTone(value: number | null | undefined, light = false): string {
  if (value == null || isNaN(value)) return light ? CL.DIM : C.DIM
  if (value > 0.05) return light ? CL.UP : C.UP        // 涨 → 红
  if (value < -0.05) return light ? CL.DOWN : C.DOWN   // 跌 → 绿
  return light ? CL.HOLD : C.HOLD                       // 平 → 琥珀
}

/** 派生：从 close + target 计算目标涨幅% */
export function targetPct(close?: number | null, target?: number | null): number | null {
  if (close == null || target == null || close === 0) return null
  return ((target - close) / close) * 100
}

/** 止损方向色：止损触发方向 = 信号反方向 */
export function dirStopColor(d?: Direction, light = false): string {
  if (d === 'up')   return light ? CL.DOWN : C.DOWN  // 多头止损=跌=绿
  if (d === 'down') return light ? CL.UP  : C.UP     // 空头止损=涨=红
  return light ? CL.DIM : C.DIM
}

/** Parse "21/30" → 70 */
export function parsePct(s?: string | null): number | null {
  if (!s) return null
  const [a, b] = s.split('/').map(Number)
  return (!isNaN(a) && !isNaN(b) && b > 0) ? Math.round(a / b * 100) : null
}

// ── Market / direction vocab (Chinese primary) ─────────────────
export const MARKET_LABEL: Record<string, { cn: string; code: string; ccy: string }> = {
  A:  { cn: 'A股',  code: 'SZ', ccy: 'CNY' },
  HK: { cn: '港股', code: 'HK', ccy: 'HKD' },
  US: { cn: '美股', code: 'US', ccy: 'USD' },
}

export function marketMeta(m: string) {
  return MARKET_LABEL[m] ?? MARKET_LABEL.A
}
export function marketLabel(m: string): string {
  return marketMeta(m).cn
}

export function dirColor(d?: Direction): string {
  return d === 'up' ? C.UP : d === 'down' ? C.DOWN : C.HOLD
}
export function dirBg(d?: Direction): string {
  return d === 'up' ? C.UP_BG : d === 'down' ? C.DOWN_BG : C.HOLD_BG
}
export function dirLabel(d?: Direction): string {
  return d === 'up' ? '建议多头' : d === 'down' ? '建议空头' : '观望震荡'
}
export function dirShort(d?: Direction): string {
  return d === 'up' ? '多头' : d === 'down' ? '空头' : '震荡'
}
export function dirArrow(d?: Direction): string {
  return d === 'up' ? '▲' : d === 'down' ? '▼' : ''
}

// ── Value formatters ───────────────────────────────────────────
export function fmtPrice(v?: number | null): string {
  if (v == null) return '—'
  return v.toFixed(2)
}
export function fmtPct(v?: number | null, withSign = true): string {
  if (v == null) return '—'
  const s = withSign && v > 0 ? '+' : ''
  return `${s}${v.toFixed(2)}%`
}

// ── Report IDs ─────────────────────────────────────────────────
export function predictionReportId(p: CardPayload): string {
  return `XRP-${p.prediction_date.replace(/-/g, '')}-${p.symbol}`
}
export function resultReportId(p: CardPayload): string {
  const d = (p.target_date ?? p.prediction_date).replace(/-/g, '')
  return `XRV-${d}-${p.symbol}`
}

// ── satori vnode factory ───────────────────────────────────────
export function h(type: string, style: Record<string, any> = {}, ...children: any[]): any {
  const flat = children.flat(Infinity).filter(c => c != null && c !== false)
  return {
    type,
    props: {
      style,
      children: flat.length === 0 ? undefined : flat.length === 1 ? flat[0] : flat,
    },
  }
}
export const txt = (s: string | number) => String(s)

export function getDir(p: CardPayload): Direction | undefined {
  return (p.direction || p.predicted_direction) as Direction | undefined
}

/**
 * 品牌标记：账册 / 印谱风格 logomark。
 * 上栏窄 + 间距 + 下栏宽，右侧切去一个缺口，整体读起来像研究公报的封口戳。
 * 替代原来的"45° 旋转方块"——后者跟任何 SaaS logo 都重复。
 */
export function brandMark(color: string, size = 14): any {
  const w = size + 2  // 视觉宽略大于高
  return h('div', {
    display: 'flex',
    flexDirection: 'column',
    width: `${w}px`,
    height: `${size}px`,
    flexShrink: 0,
    justifyContent: 'space-between',
  },
    // 上栏：窄
    h('div', {
      display: 'flex',
      width: `${w - 3}px`,
      height: `${Math.max(2, Math.round(size * 0.18))}px`,
      background: color,
      borderRadius: '1px',
    }),
    // 下栏：宽 + 右侧缺口
    h('div', {
      display: 'flex',
      width: `${w - 1}px`,
      height: `${Math.max(3, Math.round(size * 0.32))}px`,
      background: color,
      borderRadius: '1px',
      marginLeft: '0px',
    }),
  )
}

export function holdMark(color: string, width = 56, height = 10): any {
  return h('div', {
    display: 'flex',
    width: `${width}px`,
    height: `${height}px`,
    background: color,
    borderRadius: `${height}px`,
    flexShrink: 0,
  })
}
