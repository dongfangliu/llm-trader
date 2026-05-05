import type { CardPayload, SummaryItem, Direction } from '../types'
import {
  BRAND, CL, h, txt, prettyDomain,
  fmtPct, parsePct,
} from '../_helpers'

const MONO = 'NotoSansSC'

// ── Helpers ────────────────────────────────────────────────────
function dirLabel(d: Direction): string {
  return d === 'up' ? '多头' : d === 'down' ? '空头' : '震荡'
}
function dirArrow(d: Direction): string {
  return d === 'up' ? '▲' : d === 'down' ? '▼' : '▬'
}
function dirColor(d: Direction): string {
  return d === 'up' ? CL.UP : d === 'down' ? CL.DOWN : CL.HOLD
}
function actualColor(v: number | null): string {
  if (v == null) return CL.DIM
  return v > 0 ? CL.UP : v < 0 ? CL.DOWN : CL.DIM
}
function stockCode(symbol: string, market: string): string {
  if (market === 'HK') return `${symbol} · HK`
  if (market === 'US') return symbol
  return `${symbol} · ${symbol.startsWith('6') ? 'SH' : 'SZ'}`
}

export function renderSummary(p: CardPayload): any {
  const summaryMarket = (p.summary_market || p.market || 'A').toUpperCase()
  const settleDate    = p.summary_date || p.prediction_date
  const items         = p.summary_items ?? []
  const pct           = parsePct(p.accuracy_all)
  const brandName     = p.brand_name ?? BRAND.name
  const domain        = prettyDomain(p.product_url)

  const reportId = `XRS-${settleDate.replace(/-/g, '')}-${summaryMarket}`

  const mktTitle = summaryMarket === 'HK' ? '港  股'
                 : summaryMarket === 'US'  ? 'US Market'
                 : 'A  股'

  // Background gradient per market
  const bgColor = CL.BG
  const bgImage = summaryMarket === 'HK'
    ? 'linear-gradient(180deg, rgba(43,200,132,0.07) 0%, transparent 38%)'
    : summaryMarket === 'US'
    ? 'linear-gradient(180deg, rgba(107,127,212,0.07) 0%, transparent 38%)'
    : 'linear-gradient(180deg, rgba(194,53,53,0.07) 0%, transparent 38%)'

  const TEXT    = '#111111'
  const DIM     = 'rgba(17,17,17,0.50)'
  const DIMMER  = 'rgba(17,17,17,0.44)'
  const BORDER  = 'rgba(17,17,17,0.15)'
  const GOLD    = '#7A5C18'
  const BRAND_C = CL.BRAND

  // ── Stamp for each row ────────────────────────────────────
  const stamp = (correct: boolean | null) => {
    const color = correct ? CL.UP : CL.DOWN    // 命中=红（涨色），未中=绿（跌色）
    const label = correct ? '命中 ✓' : '未中 ✗'
    return h('div', {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '148px',
    },
      h('div', {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: `3.5px solid ${color}`,
        borderRadius: '6px',
        padding: '10px 20px',
        fontSize: '30px',
        fontWeight: '900',
        letterSpacing: '8px',
        color,
        transform: 'rotate(-8deg)',
      }, txt(label))
    )
  }

  // ── One stock row ─────────────────────────────────────────
  const stockRow = (item: SummaryItem, isLast: boolean) =>
    h('div', {
      display: 'flex',
      alignItems: 'center',
      padding: '18px 0',
      borderBottom: isLast ? 'none' : `1px solid ${BORDER}`,
    },
      // Left: name + code
      h('div', { display: 'flex', flexDirection: 'column', gap: '4px', width: '220px' },
        h('div', { fontSize: '28px', fontWeight: '700', letterSpacing: '1px', lineHeight: '1', color: TEXT },
          txt(item.symbol_name)
        ),
        h('div', { fontSize: '15px', color: DIM, letterSpacing: '1px', fontFamily: MONO },
          txt(stockCode(item.symbol, summaryMarket))
        ),
      ),
      // Direction
      h('div', { fontSize: '20px', fontWeight: '600', letterSpacing: '2px', color: dirColor(item.predicted_direction), width: '160px' },
        txt(`${dirLabel(item.predicted_direction)} ${dirArrow(item.predicted_direction)}`)
      ),
      // Actual %
      h('div', { fontSize: '26px', fontWeight: '700', letterSpacing: '-0.5px', flex: '1', color: actualColor(item.actual_change_pct), fontFamily: MONO },
        txt(item.actual_change_pct != null ? fmtPct(item.actual_change_pct) : '—')
      ),
      // Stamp
      stamp(item.is_correct),
    )

  // ── Main vnode ────────────────────────────────────────────
  return h('div', {
    display: 'flex', flexDirection: 'column',
    width: '100%', height: '100%',
    padding: '52px 64px',
    backgroundColor: bgColor,
    backgroundImage: bgImage,
    fontFamily: MONO,
    color: TEXT,
    boxSizing: 'border-box',
  },

    // Header
    h('div', {
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      fontSize: '18px', color: DIM, letterSpacing: '1px',
      marginBottom: '16px',
    },
      h('div', { letterSpacing: '1px', fontFamily: MONO }, txt(reportId)),
      h('div', {
        fontSize: '17px', letterSpacing: '0.5px',
        border: `1.5px solid ${BORDER}`, borderRadius: '999px',
        padding: '5px 18px', color: DIM, fontFamily: MONO,
      }, txt(`结算日 ${settleDate}`)),
    ),
    h('div', { height: '1px', background: BORDER, marginBottom: '36px' }),

    // Market title block
    h('div', { display: 'flex', flexDirection: 'column', gap: '6px' },
      h('div', { fontSize: '80px', fontWeight: '900', lineHeight: '1', letterSpacing: '8px', color: TEXT },
        txt(mktTitle)
      ),
      h('div', { fontSize: '26px', fontWeight: '500', letterSpacing: '10px', color: DIM },
        txt('今 日 结 算')
      ),
    ),

    // Divider before list
    h('div', { height: '1px', background: BORDER, margin: '24px 0 0' }),

    // Stock list
    h('div', { display: 'flex', flexDirection: 'column' },
      ...items.map((item, i) => stockRow(item, i === items.length - 1))
    ),

    // Spacer
    h('div', { flex: '1', minHeight: '20px', display: 'flex' }),

    // Win rate row
    h('div', {
      display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
      padding: '20px 0',
      borderTop: `1px solid ${BORDER}`,
      borderBottom: `1px solid ${BORDER}`,
      marginBottom: '24px',
    },
      h('div', { fontSize: '20px', fontWeight: '500', letterSpacing: '7px', color: DIM },
        txt('累 计 胜 率')
      ),
      h('div', { display: 'flex', alignItems: 'baseline', gap: '2px' },
        h('div', { fontSize: '140px', fontWeight: '900', lineHeight: '0.85', letterSpacing: '-4px', color: GOLD },
          txt(pct != null ? String(pct) : '—')
        ),
        pct != null
          ? h('div', { fontSize: '64px', fontWeight: '800', color: GOLD }, txt('%'))
          : null,
      ),
    ),

    // Footer
    h('div', {
      display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
    },
      h('div', { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '18px' },
        h('div', { color: BRAND_C, fontSize: '16px' }, txt('⬢')),
        h('div', { fontWeight: '700', letterSpacing: '3px', color: TEXT }, txt(brandName)),
        h('div', { opacity: '0.3' }, txt('·')),
        h('div', { color: BRAND_C, fontSize: '16px', letterSpacing: '1px' }, txt(domain)),
      ),
      h('div', { fontSize: '16px', letterSpacing: '2px', color: DIMMER }, txt('仅供研究参考，不构成投资建议')),
    ),
  )
}
