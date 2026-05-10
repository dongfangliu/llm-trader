import type { CardPayload } from '../types'
import {
  BRAND, C, CL, h, txt, prettyDomain,
  marketMeta, dirLabel, dirArrow,
  fmtPrice, fmtPct, resultReportId, getDir, parsePct,
  brandMark, holdMark, pctTone, targetPct,
} from '../_helpers'

/**
 * 兑现卡 = 预测卡为底 + 结算印章 + 结算条
 *
 * 设计原则：
 * - 整张卡视觉与 Promise 卡同源（同主题色、同 ticker、同信号块、同价格行、同 footer），
 *   让观众一眼能复习"当时是怎么预测的"。
 * - 在 prices 行与 summary 之间插入一条横向"结算条"（结算日 / 实际涨跌 / vs 目标）。
 * - 在 prices 行右上叠加一枚旋转印章（兑现 ✓ / 失效 ✗），半透明 0.85 让价格隐隐透出。
 * - 颜色铁律：印章 / 结算条边框 / 实际值 都跟"actual_change_pct 的方向"走（红涨绿跌 CN 习惯），
 *   ✓/✗ 字符独立承担命中/未中。Reviewer 看到"做多+对=红"请不要"修正"。
 */
export function renderProof(p: CardPayload): any {
  const dir       = getDir(p)
  const correct   = p.is_correct ?? false
  const verdictCn = correct ? '兑现' : '失效'
  const vGlyph    = correct ? '✓' : '✗'

  // 印章颜色：跟随实际涨跌方向（CN 习惯）
  const stampColor = pctTone(p.actual_change_pct ?? null, true)

  // 底层 Promise 风格令牌
  const isLight = true
  const bgColor = '#F5F2EC'
  const bgImage = 'linear-gradient(160deg, rgba(122,92,24,0.08) 0%, transparent 42%)'
  const sigColor   = isLight
    ? (dir === 'up' ? CL.UP : dir === 'down' ? CL.DOWN : CL.HOLD)
    : (dir === 'up' ? C.UP  : dir === 'down' ? C.DOWN  : C.HOLD)
  const stopColor   = isLight ? CL.DOWN : C.DOWN  // 跌=绿
  const textColor   = isLight ? CL.TEXT : C.TEXT
  const dimColor    = isLight ? 'rgba(17,17,17,0.62)' : C.DIM
  const dimmerColor = isLight ? 'rgba(17,17,17,0.44)' : C.DIMMER
  const borderColor = isLight ? 'rgba(17,17,17,0.18)' : C.BORDER
  const goldColor   = isLight ? '#7A5C18' : C.GOLD
  const brandColor  = isLight ? CL.BRAND : C.BRAND
  const signalMark  = dir === 'hold' ? holdMark(sigColor, 64, 12) : txt(dirArrow(dir))

  const mkt        = marketMeta(p.market)
  const reportId   = resultReportId(p)
  const domain     = prettyDomain(p.product_url)
  const brandName  = p.brand_name ?? BRAND.name
  const pct30      = parsePct(p.accuracy_all)

  const upside    = targetPct(p.close_price, p.target_price)
  const downside  = targetPct(p.close_price, p.stop_loss)

  const settleDate = p.target_date ?? p.prediction_date
  const actualPct  = p.actual_change_pct ?? null
  const actualText = actualPct == null ? '待结算' : fmtPct(actualPct)
  const targetText = upside == null ? '—' : fmtPct(upside)
  const actualColor = actualPct == null ? dimColor : stampColor

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
      }, txt(`结算 ${settleDate}`)),
    ),
    h('div', { height: '1px', background: borderColor, marginBottom: '44px' }),

    // ── Ticker ↔ 胜率 ──────────────────────────────────────────
    h('div', {
      display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
      marginBottom: '40px',
    },
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
      pct30 != null ? h('div', { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' },
        h('div', { fontSize: '17px', letterSpacing: '5px', color: dimColor, fontWeight: '500' }, txt('累计胜率')),
        h('div', { display: 'flex', alignItems: 'baseline', gap: '2px' },
          h('div', { fontSize: '80px', fontWeight: '800', lineHeight: '1', letterSpacing: '-4px', color: sigColor }, txt(String(pct30))),
          h('div', { fontSize: '38px', fontWeight: '700', color: sigColor }, txt('%')),
        ),
      ) : null,
    ),

    // ── 信号主体 ────────────────────────────────────────────────
    h('div', {
      display: 'flex', alignItems: 'center', gap: '20px',
      marginBottom: '24px',
    },
      h('div', { fontSize: '136px', fontWeight: '900', lineHeight: '1', letterSpacing: '-4px', color: sigColor }, txt(dirLabel(dir))),
      h('div', { display: 'flex', alignItems: 'center', fontSize: '72px', fontWeight: '900', lineHeight: '1', opacity: '0.88', color: sigColor }, signalMark),
    ),

    // ── 置信度（保留 Promise 节奏，方便对照） ─────────────────
    p.confidence != null ? h('div', { display: 'flex', flexDirection: 'column', marginBottom: '36px' },
      h('div', { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '10px' },
        h('div', { fontSize: '17px', letterSpacing: '4px', color: dimColor }, txt('置信度')),
        h('div', { fontSize: '17px', fontWeight: '700', color: sigColor }, txt(`${p.confidence}%`)),
      ),
      h('div', {
        height: '8px', background: borderColor, borderRadius: '4px',
        display: 'flex',
        backgroundImage: `linear-gradient(90deg, transparent 0% 24.7%, ${dimmerColor} 24.7% 25.3%, transparent 25.3% 49.7%, ${dimmerColor} 49.7% 50.3%, transparent 50.3% 74.7%, ${dimmerColor} 74.7% 75.3%, transparent 75.3% 100%)`,
      },
        h('div', { width: `${p.confidence}%`, height: '100%', background: sigColor, borderRadius: '4px' }),
      ),
    ) : null,

    // ── 价格双行 + 印章叠加（关键改造） ──────────────────────
    h('div', { display: 'flex', flexDirection: 'column', position: 'relative' },
      // 目标价
      h('div', {
        display: 'flex', alignItems: 'baseline',
        padding: '14px 0', borderBottom: `1px solid ${borderColor}`,
      },
        h('div', { fontSize: '20px', letterSpacing: '4px', color: dimColor, fontWeight: '600', width: '160px' }, txt('目标价')),
        h('div', { fontSize: '52px', fontWeight: '700', letterSpacing: '-1px', flex: '1', color: sigColor }, txt(fmtPrice(p.target_price))),
        upside != null ? h('div', { fontSize: '24px', fontWeight: '600', color: sigColor }, txt(fmtPct(upside))) : null,
      ),
      // 止损价
      h('div', {
        display: 'flex', alignItems: 'baseline',
        padding: '14px 0',
      },
        h('div', { fontSize: '20px', letterSpacing: '4px', color: dimColor, fontWeight: '600', width: '160px' }, txt('止损价')),
        h('div', { fontSize: '52px', fontWeight: '700', letterSpacing: '-1px', flex: '1', color: stopColor }, txt(fmtPrice(p.stop_loss))),
        downside != null ? h('div', { fontSize: '24px', fontWeight: '600', color: stopColor }, txt(fmtPct(downside))) : null,
      ),
      // 旋转印章（绝对定位，叠在价格行右上）
      h('div', {
        position: 'absolute',
        top: '-26px',
        right: '-12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: `3px solid ${stampColor}`,
        borderRadius: '10px',
        padding: '12px 28px',
        color: stampColor,
        fontSize: '46px',
        fontWeight: '900',
        letterSpacing: '6px',
        lineHeight: '1',
        transform: 'rotate(-8deg)',
        opacity: '0.92',
        boxShadow: `0 0 0 1px ${stampColor}`,
        backgroundColor: 'rgba(245,242,236,0.6)',
      },
        txt(`${verdictCn} ${vGlyph}`),
      ),
    ),

    // ── 结算条：实际 vs 目标 ─────────────────────────────────
    h('div', {
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      marginTop: '28px',
      padding: '14px 18px',
      border: `1px solid ${stampColor}`,
      borderRadius: '10px',
      backgroundColor: '#FAF7F0',
      boxShadow: `inset 0 1px 0 rgba(255,255,255,0.6)`,
    },
      h('div', { display: 'flex', alignItems: 'baseline', gap: '14px' },
        h('div', { fontSize: '15px', letterSpacing: '4px', color: dimColor, fontWeight: '600' }, txt('结算')),
        h('div', { fontSize: '20px', color: textColor, fontWeight: '700' }, txt(settleDate)),
      ),
      h('div', { display: 'flex', alignItems: 'baseline', gap: '14px' },
        h('div', { fontSize: '15px', letterSpacing: '4px', color: dimColor, fontWeight: '600' }, txt('实际')),
        h('div', { fontSize: '32px', fontWeight: '800', letterSpacing: '-1px', color: actualColor }, txt(actualText)),
      ),
      h('div', { display: 'flex', alignItems: 'baseline', gap: '10px' },
        h('div', { fontSize: '15px', letterSpacing: '4px', color: dimColor, fontWeight: '600' }, txt('vs 目标')),
        h('div', { fontSize: '20px', color: dimColor, fontWeight: '700' }, txt(targetText)),
      ),
    ),

    // ── LLM 一行结论（保留对照用） ─────────────────────────
    p.summary ? h('div', {
      marginTop: '20px',
      fontSize: '20px',
      fontStyle: 'italic',
      color: dimColor,
      letterSpacing: '0.5px',
      lineHeight: '1',
    }, txt(`「${p.summary.slice(0, 36)}${p.summary.length > 36 ? '…' : ''}」`)) : null,

    h('div', { flex: '1', minHeight: '20px', display: 'flex' }),

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
