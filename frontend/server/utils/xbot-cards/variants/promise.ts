import type { CardPayload } from '../types'
import {
  BRAND, C, CL, h, txt, prettyDomain,
  marketMeta, dirLabel, dirArrow,
  fmtPrice, fmtPct, predictionReportId, getDir, parsePct,
} from '../_helpers'

export function renderPromise(p: CardPayload): any {
  const dir     = getDir(p)
  const isLight = dir === 'up'
  const T       = isLight ? CL : { ...C, text: C.TEXT, dim: C.DIM, dimmer: C.DIMMER, border: C.BORDER }
  const bg      = isLight
    ? `linear-gradient(180deg, rgba(194,53,53,0.07) 0%, transparent 35%), ${CL.BG}`
    : `linear-gradient(180deg, rgba(107,127,212,0.06) 0%, transparent 35%), ${C.BG}`
  const sigColor = isLight
    ? (dir === 'up' ? CL.UP : dir === 'down' ? CL.DOWN : CL.HOLD)
    : (dir === 'up' ? C.UP  : dir === 'down' ? C.DOWN  : C.HOLD)
  const stopColor = isLight ? CL.DOWN : C.DOWN   // 跌=绿
  const textColor = isLight ? CL.TEXT : C.TEXT
  const dimColor  = isLight ? 'rgba(17,17,17,0.62)' : C.DIM
  const dimmerColor = isLight ? 'rgba(17,17,17,0.44)' : C.DIMMER
  const borderColor = isLight ? 'rgba(17,17,17,0.18)' : C.BORDER
  const goldColor = isLight ? '#7A5C18' : C.GOLD
  const brandColor = isLight ? CL.BRAND : C.BRAND

  const mkt      = marketMeta(p.market)
  const reportId = predictionReportId(p)
  const domain   = prettyDomain(p.product_url)
  const brandName = p.brand_name ?? BRAND.name
  const pct30    = parsePct(p.accuracy_all)

  const upside = (p.close_price != null && p.target_price != null && p.close_price !== 0)
    ? ((p.target_price - p.close_price) / p.close_price) * 100 : null
  const downside = (p.close_price != null && p.stop_loss != null && p.close_price !== 0)
    ? ((p.stop_loss - p.close_price) / p.close_price) * 100 : null

  const MONO = 'NotoSansSC'

  return h('div', {
    display: 'flex', flexDirection: 'column',
    width: '100%', height: '100%',
    padding: '52px 64px',
    background: bg,
    fontFamily: MONO,
    color: textColor,
    boxSizing: 'border-box',
  },

    // ── 报头 ──────────────────────────────────────────────────
    h('div', {
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      fontSize: '18px', color: dimColor, letterSpacing: '1px',
      marginBottom: '16px',
    },
      h('div', { letterSpacing: '1px' }, txt(reportId)),
      h('div', {
        fontSize: '17px', letterSpacing: '0.5px',
        border: `1.5px solid ${borderColor}`, borderRadius: '999px',
        padding: '5px 18px', color: dimColor,
      }, txt(p.prediction_date)),
    ),
    h('div', { height: '1px', background: borderColor, marginBottom: '44px' }),

    // ── Ticker ↔ 胜率 ──────────────────────────────────────────
    h('div', {
      display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
      marginBottom: '52px',
    },
      // 左：股票
      h('div', { display: 'flex', flexDirection: 'column', gap: '8px' },
        h('div', { fontSize: '68px', fontWeight: '800', lineHeight: '1', letterSpacing: '1px' }, txt(p.symbol_name)),
        h('div', { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '22px', color: dimColor },
          h('div', {}, txt(`${p.symbol}.${mkt.code}`)),
          h('div', { opacity: '0.4' }, txt('·')),
          h('div', {}, txt(mkt.cn)),
          ...(p.hot_rank != null ? [
            h('div', { opacity: '0.4' }, txt('·')),
            h('div', { color: goldColor, fontWeight: '600' }, txt(`热门 #${p.hot_rank}`)),
          ] : []),
        ),
      ),
      // 右：胜率
      pct30 != null ? h('div', { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' },
        h('div', { fontSize: '17px', letterSpacing: '5px', color: dimColor, fontWeight: '500' }, txt('累计胜率')),
        h('div', { display: 'flex', alignItems: 'baseline', gap: '2px' },
          h('div', { fontSize: '80px', fontWeight: '800', lineHeight: '1', letterSpacing: '-2px', color: sigColor }, txt(String(pct30))),
          h('div', { fontSize: '38px', fontWeight: '700', color: sigColor }, txt('%')),
        ),
      ) : null,
    ),

    // ── 信号主体 ────────────────────────────────────────────────
    h('div', {
      display: 'flex', alignItems: 'center', gap: '20px',
      marginBottom: '24px',
    },
      h('div', { fontSize: '136px', fontWeight: '900', lineHeight: '1', letterSpacing: '-3px', color: sigColor }, txt(dirLabel(dir))),
      h('div', { fontSize: '72px', fontWeight: '900', lineHeight: '1', opacity: '0.88', color: sigColor }, txt(dirArrow(dir))),
    ),

    // ── 置信度 ─────────────────────────────────────────────────
    p.confidence != null ? h('div', { display: 'flex', flexDirection: 'column', marginBottom: '52px' },
      h('div', { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '10px' },
        h('div', { fontSize: '17px', letterSpacing: '4px', color: dimColor }, txt('置信度')),
        h('div', { fontSize: '17px', fontWeight: '700', color: sigColor }, txt(`${p.confidence}%`)),
      ),
      h('div', { height: '6px', background: borderColor, borderRadius: '3px', display: 'flex' },
        h('div', { width: `${p.confidence}%`, height: '100%', background: sigColor, borderRadius: '3px' }),
      ),
    ) : null,

    // ── 价格双行 ────────────────────────────────────────────────
    h('div', { display: 'flex', flexDirection: 'column' },
      // 目标价
      h('div', {
        display: 'flex', alignItems: 'baseline',
        padding: '18px 0', borderBottom: `1px solid ${borderColor}`,
      },
        h('div', { fontSize: '20px', letterSpacing: '4px', color: dimColor, fontWeight: '600', width: '160px' }, txt('目标价')),
        h('div', { fontSize: '56px', fontWeight: '700', letterSpacing: '-1px', flex: '1', color: sigColor }, txt(fmtPrice(p.target_price))),
        upside != null ? h('div', { fontSize: '26px', fontWeight: '600', color: sigColor }, txt(fmtPct(upside))) : null,
      ),
      // 止损价
      h('div', {
        display: 'flex', alignItems: 'baseline',
        padding: '18px 0',
      },
        h('div', { fontSize: '20px', letterSpacing: '4px', color: dimColor, fontWeight: '600', width: '160px' }, txt('止损价')),
        h('div', { fontSize: '56px', fontWeight: '700', letterSpacing: '-1px', flex: '1', color: stopColor }, txt(fmtPrice(p.stop_loss))),
        downside != null ? h('div', { fontSize: '26px', fontWeight: '600', color: stopColor }, txt(fmtPct(downside))) : null,
      ),
    ),

    // LLM 一行结论
    p.summary ? h('div', {
      marginTop: '28px',
      fontSize: '22px',
      fontStyle: 'italic',
      color: dimColor,
      letterSpacing: '0.5px',
      lineHeight: '1',
    }, txt(`「${p.summary.slice(0, 28)}${p.summary.length > 28 ? '…' : ''}」`)) : null,

    // spacer
    h('div', { flex: '1', minHeight: '24px', display: 'flex' }),

    // ── Footer ─────────────────────────────────────────────────
    h('div', {
      display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
      borderTop: `1px solid ${borderColor}`, paddingTop: '18px',
    },
      h('div', { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '18px' },
        h('div', { color: brandColor, fontSize: '16px' }, txt('⬢')),
        h('div', { fontWeight: '700', letterSpacing: '3px', color: textColor }, txt(brandName)),
        h('div', { opacity: '0.3' }, txt('·')),
        h('div', { color: brandColor, fontSize: '16px', letterSpacing: '1px' }, txt(domain)),
      ),
      h('div', { fontSize: '16px', letterSpacing: '2px', color: dimmerColor }, txt('仅供研究参考，不构成投资建议')),
    ),
  )
}
