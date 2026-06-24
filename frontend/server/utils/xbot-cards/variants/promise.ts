import type { CardPayload } from '../types'
import {
  BRAND, C, CL, h, txt, prettyDomain,
  marketMeta, dirLabel, dirArrow,
  fmtPrice, fmtPct, predictionReportId, getDir, parsePct,
  brandMark, holdMark,
} from '../_helpers'

export function renderPromise(p: CardPayload): any {
  const dir     = getDir(p)
  const isLight = true
  const bgColor = '#F5F2EC'
  const bgImage = 'linear-gradient(160deg, rgba(122,92,24,0.08) 0%, transparent 42%)'
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
  const signalMark = dir === 'hold' ? holdMark(sigColor, 64, 12) : txt(dirArrow(dir))

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
    backgroundColor: bgColor,
    backgroundImage: bgImage,
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
      // 右：胜率（字距收敛到 -4，与 Promise 信号词一致）
      pct30 != null ? h('div', { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' },
        h('div', { fontSize: '17px', letterSpacing: '3px', color: dimColor, fontWeight: '500' }, txt('有效计划率')),
        h('div', { display: 'flex', alignItems: 'baseline', gap: '2px' },
          h('div', { fontSize: '80px', fontWeight: '800', lineHeight: '1', letterSpacing: '-4px', color: sigColor }, txt(String(pct30))),
          h('div', { fontSize: '38px', fontWeight: '700', color: sigColor }, txt('%')),
        ),
      ) : null,
    ),

    // ── 信号主体（字距 -4，与胜率对齐） ────────────────────────
    h('div', {
      display: 'flex', alignItems: 'center', gap: '20px',
      marginBottom: '24px',
    },
      h('div', { fontSize: '136px', fontWeight: '900', lineHeight: '1', letterSpacing: '-4px', color: sigColor }, txt(dirLabel(dir))),
      h('div', { display: 'flex', alignItems: 'center', fontSize: '72px', fontWeight: '900', lineHeight: '1', opacity: '0.88', color: sigColor }, signalMark),
    ),

    // ── 置信度：8px 仪表条 + 25/50/75% 刻度参考线 ─────────────
    p.confidence != null ? h('div', { display: 'flex', flexDirection: 'column', marginBottom: '52px' },
      h('div', { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '10px' },
        h('div', { fontSize: '17px', letterSpacing: '4px', color: dimColor }, txt('置信度')),
        h('div', { fontSize: '17px', fontWeight: '700', color: sigColor }, txt(`${p.confidence}%`)),
      ),
      // 仪表底槽 + 内嵌 25/50/75% 刻度（Satori 友好的固定百分比写法）
      h('div', {
        height: '8px', background: borderColor, borderRadius: '4px',
        display: 'flex', position: 'relative',
        backgroundImage: `linear-gradient(90deg, transparent 0% 24.7%, ${dimmerColor} 24.7% 25.3%, transparent 25.3% 49.7%, ${dimmerColor} 49.7% 50.3%, transparent 50.3% 74.7%, ${dimmerColor} 74.7% 75.3%, transparent 75.3% 100%)`,
      },
        h('div', { width: `${p.confidence}%`, height: '100%', background: sigColor, borderRadius: '4px' }),
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
    }, txt(`「${p.summary.slice(0, 36)}${p.summary.length > 36 ? '…' : ''}」`)) : null,

    // spacer
    h('div', { flex: '1', minHeight: '24px', display: 'flex' }),

    // ── Footer ─────────────────────────────────────────────────
    h('div', {
      display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
      borderTop: `1px solid ${borderColor}`, paddingTop: '18px',
    },
      h('div', { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '18px' },
        brandMark(brandColor, 13),
        h('div', { fontWeight: '700', letterSpacing: '3px', color: textColor }, txt(brandName)),
        h('div', { opacity: '0.3' }, txt('·')),
        h('div', { color: brandColor, fontSize: '16px', letterSpacing: '1px' }, txt(domain)),
      ),
      h('div', { fontSize: '16px', letterSpacing: '2px', color: dimmerColor }, txt('仅供研究参考，不构成投资建议')),
    ),
  )
}
