import type { CardPayload } from '../types'
import { BRAND, C, h, txt, prettyDomain, parsePct, pctColor, brandMark } from '../_helpers'

export function renderDataRecord(p: CardPayload): any {
  const domain    = prettyDomain(p.product_url)
  const brandName = p.brand_name ?? BRAND.name
  const pct30     = parsePct(p.accuracy_all)
  const wrColor   = pctColor(pct30)

  const parse = (s?: string) => {
    if (!s) return null
    const [a, b] = s.split('/').map(Number)
    return (!isNaN(a) && !isNaN(b) && b > 0) ? { hit: a, total: b } : null
  }
  const s30  = parse(p.accuracy_all)
  const dots = s30 ? Array.from({ length: Math.min(s30.total, 12) }, (_, i) => i < s30.hit) : []

  const MONO   = 'NotoSansSC'
  const TEXT   = '#111111'
  const DIM    = 'rgba(17,17,17,0.62)'
  const DIMMER = 'rgba(17,17,17,0.44)'
  const BORDER = 'rgba(17,17,17,0.18)'
  const BRAND_COLOR = '#3D4FA8'
  const BG_COLOR = '#F0EDE6'
  const BG_IMAGE = 'linear-gradient(160deg, rgba(138,104,32,0.09) 0%, transparent 40%)'

  return h('div', {
    display: 'flex', flexDirection: 'column',
    width: '100%', height: '100%',
    padding: '52px 64px 48px',
    backgroundColor: BG_COLOR,
    backgroundImage: BG_IMAGE,
    fontFamily: MONO, color: TEXT, boxSizing: 'border-box',
  },

    // ── 顶部品牌 ──────────────────────────────────────────────
    h('div', {
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      marginBottom: '16px',
    },
      h('div', { display: 'flex', alignItems: 'center', gap: '10px' },
        brandMark(BRAND_COLOR, 16),
        h('div', { fontSize: '22px', fontWeight: '700', letterSpacing: '3px' }, txt(brandName)),
        h('div', { color: 'rgba(17,17,17,0.30)' }, txt('·')),
        h('div', { fontSize: '20px', letterSpacing: '3px', color: DIM }, txt('战绩报告')),
      ),
      h('div', {
        fontSize: '17px', letterSpacing: '0.5px',
        border: `1.5px solid ${BORDER}`, borderRadius: '999px',
        padding: '5px 18px', color: DIM,
      }, txt(`截至 ${p.prediction_date}`)),
    ),
    h('div', { height: '1px', background: BORDER }),

    // ── 胜率英雄区 ─────────────────────────────────────────────
    h('div', {
      flex: '1', display: 'flex', flexDirection: 'column',
      justifyContent: 'center', alignItems: 'center', gap: '4px',
    },
      h('div', { fontSize: '20px', letterSpacing: '5px', color: DIM, fontWeight: '500', marginBottom: '4px' },
        txt('有效计划率'),
      ),
      h('div', { fontSize: '240px', fontWeight: '900', lineHeight: '0.88', letterSpacing: '-8px', color: wrColor },
        txt(pct30 != null ? `${pct30}%` : '—'),
      ),
      s30 ? h('div', { fontSize: '22px', color: DIMMER, letterSpacing: '2px', marginTop: '12px' },
        txt(`${s30.hit}胜 / ${s30.total}场`),
      ) : null,
    ),

    // ── 近期信号 ───────────────────────────────────────────────
    dots.length ? h('div', { display: 'flex', flexDirection: 'column', paddingTop: '28px' },
      h('div', { fontSize: '18px', letterSpacing: '4px', color: DIM, fontWeight: '500', marginBottom: '16px', textAlign: 'center' },
        txt('近期信号'),
      ),
      h('div', { display: 'flex', gap: '14px', justifyContent: 'center', flexWrap: 'wrap' },
        ...dots.map((hit) =>
          h('div', {
            width: '44px', height: '44px', borderRadius: '50%',
            background: hit ? wrColor : 'transparent',
            border: hit ? 'none' : `2px solid rgba(17,17,17,0.28)`,
          }),
        ),
      ),
    ) : null,

    h('div', { minHeight: '24px', display: 'flex' }),

    // ── Footer ─────────────────────────────────────────────────
    h('div', {
      display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
      borderTop: `1px solid ${BORDER}`, paddingTop: '18px',
    },
      h('div', { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '18px' },
        brandMark(BRAND_COLOR, 13),
        h('div', { fontWeight: '700', letterSpacing: '3px', color: TEXT }, txt(brandName)),
        h('div', { opacity: '0.3' }, txt('·')),
        h('div', { color: BRAND_COLOR, fontSize: '16px', letterSpacing: '1px' }, txt(domain)),
      ),
      h('div', { fontSize: '16px', letterSpacing: '2px', color: DIMMER }, txt('仅供研究参考，不构成投资建议')),
    ),
  )
}
