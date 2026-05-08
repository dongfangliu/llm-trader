import type { CardPayload } from '../types'
import {
  BRAND, C, h, txt, prettyDomain,
  marketMeta, dirShort, dirColor, dirArrow,
  fmtPct, resultReportId, parsePct, pctColor,
  brandMark, holdMark,
} from '../_helpers'

export function renderProof(p: CardPayload): any {
  const dir       = (p.predicted_direction ?? p.direction) as any
  const correct   = p.is_correct ?? false
  const verdictCn = correct ? '兑  现' : '失  效'
  const vGlyph    = correct ? '✓' : '✗'
  // correct → actual direction matches prediction; wrong → opposite
  const vColor = dir === 'up'
    ? (correct ? '#C23535' : '#1A7A4A')
    : dir === 'down'
      ? (correct ? '#1A7A4A' : '#C23535')
      : (correct ? '#1A7A4A' : '#C23535')
  const mkt       = marketMeta(p.market)
  const reportId  = resultReportId(p)
  const domain    = prettyDomain(p.product_url)
  const brandName = p.brand_name ?? BRAND.name
  const pct30     = parsePct(p.accuracy_all)
  const wrColor   = pctColor(pct30)
  const predictionMark = dir === 'hold' ? holdMark(dirColor(dir), 34, 7) : txt(dirArrow(dir))

  const MONO = 'NotoSansSC'
  const DIM    = 'rgba(17,17,17,0.62)'
  const DIMMER = 'rgba(17,17,17,0.44)'
  const BORDER = 'rgba(17,17,17,0.18)'
  const BRAND_COLOR = '#3D4FA8'
  const BG_COLOR = '#F5F2EC'
  const BG_IMAGE = correct
    ? 'linear-gradient(160deg, rgba(26,122,74,0.06) 0%, transparent 45%)'
    : 'linear-gradient(160deg, rgba(194,53,53,0.06) 0%, transparent 45%)'
  const textColor = '#111111'
  const date = p.target_date ?? p.prediction_date

  return h('div', {
    display: 'flex', flexDirection: 'column',
    width: '100%', height: '100%',
    padding: '52px 64px',
    backgroundColor: BG_COLOR,
    backgroundImage: BG_IMAGE,
    fontFamily: MONO, color: textColor, boxSizing: 'border-box',
  },

    // ── 报头 ──────────────────────────────────────────────────
    h('div', {
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      fontSize: '18px', color: DIM, letterSpacing: '1px', marginBottom: '16px',
    },
      h('div', { letterSpacing: '1px' }, txt(reportId)),
      h('div', {
        fontSize: '17px', letterSpacing: '0.5px',
        border: `1.5px solid ${BORDER}`, borderRadius: '999px',
        padding: '5px 18px', color: DIM,
      }, txt(date)),
    ),
    h('div', { height: '1px', background: BORDER, marginBottom: '44px' }),

    // ── 股票 ──────────────────────────────────────────────────
    h('div', {
      display: 'flex', alignItems: 'baseline', gap: '12px', marginBottom: '52px',
    },
      h('div', { fontSize: '64px', fontWeight: '800', lineHeight: '1', letterSpacing: '1px' }, txt(p.symbol_name)),
      h('div', { fontSize: '26px', fontWeight: '500', color: DIM }, txt(`${p.symbol}.${mkt.code}`)),
      h('div', { color: DIMMER, fontSize: '18px' }, txt('·')),
      h('div', { fontSize: '22px', color: DIM }, txt(mkt.cn)),
    ),

    // ── 三栏 ──────────────────────────────────────────────────
    h('div', {
      display: 'flex', alignItems: 'stretch',
      padding: '28px 0',
      borderTop: `1px solid ${BORDER}`,
      borderBottom: `1px solid ${BORDER}`,
      marginBottom: '64px',
    },
      // 预测
      h('div', { flex: '1', display: 'flex', flexDirection: 'column', gap: '10px', paddingRight: '8px' },
        h('div', { fontSize: '18px', letterSpacing: '5px', color: DIM, fontWeight: '600', marginBottom: '6px' }, txt('预  测')),
        h('div', { display: 'flex', alignItems: 'center', fontSize: '52px', fontWeight: '800', lineHeight: '1', letterSpacing: '-1px', color: dirColor(dir) },
          h('div', { display: 'flex', alignItems: 'center', gap: '12px' },
            h('div', { display: 'flex' }, txt(dirShort(dir))),
            h('div', { display: 'flex', alignItems: 'center' }, predictionMark),
          ),
        ),
        p.confidence != null
          ? h('div', { fontSize: '20px', color: DIM, letterSpacing: '2px' }, txt(`置信 ${p.confidence}%`))
          : null,
      ),
      // 竖线
      h('div', { width: '1px', background: BORDER, margin: '4px 24px' }),
      // 实际
      h('div', { flex: '1', display: 'flex', flexDirection: 'column', gap: '10px', padding: '0 8px' },
        h('div', { fontSize: '18px', letterSpacing: '5px', color: DIM, fontWeight: '600', marginBottom: '6px' }, txt('实  际')),
        h('div', { fontSize: '52px', fontWeight: '800', lineHeight: '1', letterSpacing: '-1px', color: vColor },
          txt(fmtPct(p.actual_change_pct)),
        ),
      ),
      // 竖线
      h('div', { width: '1px', background: BORDER, margin: '4px 24px' }),
      // 胜率
      h('div', { flex: '1', display: 'flex', flexDirection: 'column', gap: '10px', paddingLeft: '8px' },
        h('div', { fontSize: '18px', letterSpacing: '5px', color: DIM, fontWeight: '600', marginBottom: '6px' }, txt('累计胜率')),
        h('div', { fontSize: '52px', fontWeight: '800', lineHeight: '1', letterSpacing: '-1px', color: wrColor },
          txt(pct30 != null ? `${pct30}%` : '—'),
        ),
      ),
    ),

    // ── 印章 ──────────────────────────────────────────────────
    h('div', { flex: '1', display: 'flex', justifyContent: 'center', alignItems: 'center' },
      h('div', {
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: `5px solid ${vColor}`,
        borderRadius: '8px',
        padding: '20px 80px',
        transform: 'rotate(-7deg)',
        color: vColor,
        fontSize: '88px', fontWeight: '900', letterSpacing: '12px',
        lineHeight: '1',
      },
        txt(`${verdictCn}  ${vGlyph}`),
      ),
    ),

    h('div', { minHeight: '24px', display: 'flex' }),

    // ── Footer ─────────────────────────────────────────────────
    h('div', {
      display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
      borderTop: `1px solid ${BORDER}`, paddingTop: '18px',
    },
      h('div', { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '18px' },
        brandMark(BRAND_COLOR, 13),
        h('div', { fontWeight: '700', letterSpacing: '3px', color: textColor }, txt(brandName)),
        h('div', { opacity: '0.3' }, txt('·')),
        h('div', { color: BRAND_COLOR, fontSize: '16px', letterSpacing: '1px' }, txt(domain)),
      ),
      h('div', { fontSize: '16px', letterSpacing: '2px', color: DIMMER }, txt('仅供研究参考，不构成投资建议')),
    ),
  )
}
