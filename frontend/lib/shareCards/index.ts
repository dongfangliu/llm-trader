/**
 * Share card generators — canvas-based image generation for analysis results.
 * Returns Blob + filename for save/share.
 */

export interface PredictionCardParams {
  stockName: string
  stockCode: string
  market: string
  action: 'buy' | 'sell' | 'hold'
  confidence: number | null
  latestPrice: number | null
  targetPrice: number | null
  stopLoss: number | null
  opportunityGrade: string | null
  reasonExcerpt: string
  analyzedAt: string
  tier: string
  appName: string
  appBaseUrl?: string
  basicDailyLimit?: number
  marketDiagnosis: string
  opportunityAssessment: string
  riskAnalysis: string
  executionPlan: string
}

type CardResult = { blob: Blob; filename: string }

const F = '"PingFang SC","Helvetica Neue","Microsoft YaHei",sans-serif'
const M = '"SF Mono","Menlo","Courier New",monospace'

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString('zh-CN', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function buildFilename(p: PredictionCardParams, suffix: string): string {
  const code = p.stockCode || 'stock'
  const d = new Date(p.analyzedAt)
  const ds = isNaN(d.getTime())
    ? 'unknown'
    : `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  return `${code}_${suffix}_${ds}.png`
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => b ? resolve(b) : reject(new Error('toBlob failed')),
      'image/png',
    )
  })
}

/** Wrap text and return lines array */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines = 4,
): string[] {
  const lines: string[] = []
  let line = ''
  for (const ch of text) {
    const test = line + ch
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line)
      line = ch
      if (lines.length >= maxLines) break
    } else {
      line = test
    }
  }
  if (line && lines.length < maxLines) lines.push(line)
  return lines
}

/** Format price with currency prefix based on market */
function fmtPrice(price: number | null, market: string): string {
  if (price == null) return '—'
  const isCN = market === 'a' || market === 'futures'
  return isCN ? `¥${price.toFixed(2)}` : `$${price.toFixed(2)}`
}

/** Draw a placeholder QR-like pattern when qrcode lib is unavailable */
function drawQR(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, size: number,
  fgColor: string, bgFill: string,
): void {
  const grid = [
    [1,1,1,0,1,1,1],[1,0,1,0,1,0,1],[1,1,1,0,1,1,1],
    [0,0,0,1,0,0,0],[1,1,1,0,1,1,1],[1,0,1,0,1,0,1],[1,1,1,0,1,1,1],
  ]
  const cell = (size - 12) / 7
  ctx.fillStyle = bgFill
  ctx.beginPath(); ctx.roundRect(x, y, size, size, 5); ctx.fill()
  ctx.fillStyle = fgColor
  grid.forEach((row, ri) => row.forEach((c, ci) => {
    if (c) {
      ctx.beginPath()
      ctx.roundRect(x + 6 + ci * cell, y + 6 + ri * cell, cell - 0.8, cell - 0.8, 1)
      ctx.fill()
    }
  }))
}

// ─── Statement card (social share) ────────────────────────────────────────────
// 600×900 @2x, vibrant action-color gradient background

export async function generateStatementCardBlob(p: PredictionCardParams): Promise<CardResult> {
  if (typeof window === 'undefined') throw new Error('SSR not supported')

  const { stockName, stockCode, market, action, confidence, latestPrice, targetPrice, stopLoss,
    opportunityGrade, reasonExcerpt, analyzedAt, tier, appName } = p

  const isBuy  = action === 'buy'
  const isSell = action === 'sell'
  const isMasked = tier === 'free'

  const grade = (opportunityGrade || 'C').toUpperCase().slice(0, 1)
  const bgTop  = isBuy ? '#EF4444' : isSell ? '#16A34A' : '#64748B'
  const bgBot  = isBuy ? '#991B1B' : isSell ? '#14532D' : '#334155'
  const accent = bgTop
  const actionCN = isBuy ? '看涨' : isSell ? '看跌' : '观望'

  const impliedReturn: number | null =
    targetPrice != null && latestPrice != null && latestPrice > 0
      ? ((targetPrice - latestPrice) / latestPrice) * 100 : null
  const protectPct: number | null =
    stopLoss != null && latestPrice != null && latestPrice > 0
      ? ((latestPrice - stopLoss) / latestPrice) * 100 : null

  const W = 600, H = 900
  const DPR = 2
  const canvas = document.createElement('canvas')
  canvas.width = W * DPR; canvas.height = H * DPR
  const ctx = canvas.getContext('2d')!
  ctx.scale(DPR, DPR)

  // ── BACKGROUND ────────────────────────────────────────────────
  const bgGrad = ctx.createLinearGradient(0, 0, W * 0.4, H)
  bgGrad.addColorStop(0, bgTop); bgGrad.addColorStop(1, bgBot)
  ctx.fillStyle = bgGrad; ctx.fillRect(0, 0, W, H)

  // Radial bloom top-right
  const bloom = ctx.createRadialGradient(W * 0.78, 160, 0, W * 0.78, 160, 340)
  bloom.addColorStop(0, 'rgba(255,255,255,0.18)'); bloom.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = bloom; ctx.fillRect(0, 0, W, H)

  // Bottom shade
  const shade = ctx.createLinearGradient(0, H * 0.55, 0, H)
  shade.addColorStop(0, 'rgba(0,0,0,0)'); shade.addColorStop(1, 'rgba(0,0,0,0.28)')
  ctx.fillStyle = shade; ctx.fillRect(0, 0, W, H)

  // ── GRADE WATERMARK ───────────────────────────────────────────
  ctx.font = `900 280px ${F}`; ctx.textAlign = 'center'
  ctx.fillStyle = 'rgba(255,255,255,0.07)'
  ctx.fillText(grade, W / 2, 360)

  // ── TOP STRIP ─────────────────────────────────────────────────
  ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fillRect(0, 0, W, 5)

  // Stock code pill (top-left)
  const pillY = 26
  ctx.font = `700 12px ${F}`; ctx.textAlign = 'left'
  const codeW = ctx.measureText(stockCode).width + 24
  ctx.fillStyle = 'rgba(255,255,255,0.2)'
  ctx.beginPath(); ctx.roundRect(28, pillY, codeW, 26, 13); ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1
  ctx.beginPath(); ctx.roundRect(28, pillY, codeW, 26, 13); ctx.stroke()
  ctx.fillStyle = '#ffffff'; ctx.fillText(stockCode, 40, pillY + 17)

  // Market label sub-pill
  const mktLabel = market === 'hk' ? '港股' : market === 'us' ? '美股' : market === 'futures' ? '期货' : 'A股'
  ctx.font = `500 11px ${F}`; ctx.textAlign = 'left'
  const mktX = 28 + codeW + 8
  const mktW = ctx.measureText(mktLabel).width + 16
  ctx.fillStyle = 'rgba(255,255,255,0.14)'
  ctx.beginPath(); ctx.roundRect(mktX, pillY, mktW, 26, 13); ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillText(mktLabel, mktX + 8, pillY + 17)

  // Tier badge (top-right, premium only)
  if (tier === 'premium') {
    const tLabel = '✦ 专业版'
    ctx.font = `700 11px ${F}`; ctx.textAlign = 'right'
    const tpW = ctx.measureText(tLabel).width + 20
    ctx.fillStyle = 'rgba(255,255,255,0.2)'
    ctx.beginPath(); ctx.roundRect(W - 28 - tpW, pillY, tpW, 26, 13); ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.roundRect(W - 28 - tpW, pillY, tpW, 26, 13); ctx.stroke()
    ctx.fillStyle = '#ffffff'; ctx.fillText(tLabel, W - 28 - 10, pillY + 17)
  } else if (tier === 'basic') {
    ctx.font = `500 11px ${F}`; ctx.textAlign = 'right'
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fillText('标准版', W - 28, pillY + 17)
  }

  // ── STOCK NAME ────────────────────────────────────────────────
  ctx.font = `900 54px ${F}`; ctx.textAlign = 'left'; ctx.fillStyle = '#ffffff'
  ctx.shadowColor = 'rgba(0,0,0,0.2)'; ctx.shadowBlur = 12
  ctx.fillText(stockName.length > 8 ? stockName.slice(0, 8) + '…' : stockName, 28, 132)
  ctx.shadowBlur = 0

  // ── HERO NUMBER ───────────────────────────────────────────────
  const heroBaseY = 252, heroLabelY = 284

  const drawHero = (txt: string) => {
    ctx.font = `900 92px ${F}`; ctx.textAlign = 'center'
    ctx.fillStyle = '#ffffff'
    ctx.shadowColor = 'rgba(0,0,0,0.25)'; ctx.shadowBlur = 20
    ctx.fillText(txt, W / 2, heroBaseY)
    ctx.shadowBlur = 0
  }
  const heroSubLabel = (txt: string) => {
    ctx.font = `500 14px ${F}`; ctx.textAlign = 'center'
    ctx.fillStyle = 'rgba(255,255,255,0.62)'
    ctx.fillText(txt, W / 2, heroLabelY)
  }

  if (isMasked) {
    ctx.font = `900 108px ${F}`; ctx.textAlign = 'center'; ctx.fillStyle = '#ffffff'
    ctx.shadowColor = 'rgba(0,0,0,0.28)'; ctx.shadowBlur = 24
    ctx.fillText(actionCN, W / 2, heroBaseY + 8)
    ctx.shadowBlur = 0
  } else if (isBuy) {
    if (impliedReturn != null) {
      const sign = impliedReturn > 0 ? '+' : ''
      drawHero(`${sign}${impliedReturn.toFixed(1)}%`); heroSubLabel('上涨空间估算')
    } else if (confidence != null) {
      drawHero(`${confidence}%`); heroSubLabel('AI 置信度')
    } else {
      drawHero(actionCN)
    }
  } else if (isSell) {
    if (protectPct != null) {
      drawHero(`\u2212${Math.abs(protectPct).toFixed(1)}%`); heroSubLabel('止损保护距离')
    } else if (confidence != null) {
      drawHero(`${confidence}%`); heroSubLabel('AI 置信度')
    } else {
      drawHero(actionCN)
    }
  } else {
    // HOLD: grade in hexagon
    const hexCX = W / 2, hexCY = 238, hexR = 74
    ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 1.5
    ctx.beginPath()
    for (let j = 0; j < 6; j++) {
      const ang = (Math.PI / 3) * j - Math.PI / 6
      ctx.lineTo(hexCX + (hexR + 16) * Math.cos(ang), hexCY + (hexR + 16) * Math.sin(ang))
    }
    ctx.closePath(); ctx.stroke()
    ctx.fillStyle = 'rgba(255,255,255,0.18)'
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2
    ctx.beginPath()
    for (let j = 0; j < 6; j++) {
      const ang = (Math.PI / 3) * j - Math.PI / 6
      ctx.lineTo(hexCX + hexR * Math.cos(ang), hexCY + hexR * Math.sin(ang))
    }
    ctx.closePath(); ctx.fill(); ctx.stroke()
    ctx.font = `900 96px ${F}`; ctx.textAlign = 'center'; ctx.fillStyle = '#ffffff'
    ctx.shadowColor = 'rgba(0,0,0,0.3)'; ctx.shadowBlur = 16
    ctx.fillText(grade, hexCX, hexCY + 36); ctx.shadowBlur = 0
  }

  // ── ACTION PILL (paid only) ────────────────────────────────────
  if (!isMasked) {
    const pillActionY = 318
    ctx.font = `800 30px ${F}`; ctx.textAlign = 'center'
    const apW = ctx.measureText(actionCN).width + 64
    const apX = W / 2 - apW / 2
    ctx.fillStyle = '#ffffff'
    ctx.shadowColor = 'rgba(0,0,0,0.2)'; ctx.shadowBlur = 16
    ctx.beginPath(); ctx.roundRect(apX, pillActionY, apW, 56, 28); ctx.fill()
    ctx.shadowBlur = 0
    ctx.fillStyle = accent; ctx.fillText(actionCN, W / 2, pillActionY + 38)
  }

  // ── FROSTED GLASS DATA PANEL ──────────────────────────────────
  const panelY = 400, panelH = 200
  ctx.fillStyle = 'rgba(0,0,0,0.18)'
  ctx.beginPath(); ctx.roundRect(24, panelY, W - 48, panelH, 22); ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.16)'; ctx.lineWidth = 1
  ctx.beginPath(); ctx.roundRect(24, panelY, W - 48, panelH, 22); ctx.stroke()

  // Confidence bar
  const barY = 422
  if (confidence != null) {
    ctx.fillStyle = 'rgba(255,255,255,0.15)'
    ctx.beginPath(); ctx.roundRect(48, barY, W - 96, 6, 3); ctx.fill()
    const filled = Math.round((W - 96) * confidence / 100)
    ctx.fillStyle = 'rgba(255,255,255,0.75)'
    ctx.beginPath(); ctx.roundRect(48, barY, filled, 6, 3); ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.beginPath(); ctx.arc(48 + filled, barY + 3, 5, 0, Math.PI * 2); ctx.fill()
    ctx.font = `500 12px ${F}`; ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(255,255,255,0.5)'
    ctx.fillText('AI 置信度', 48, barY + 22)
    ctx.font = `700 13px ${F}`; ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(255,255,255,0.9)'
    ctx.fillText(`${confidence}%`, W - 48, barY + 22)
  }

  // Price row
  const priceY = 464
  if (isMasked) {
    ctx.font = `400 11px ${F}`; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,0.45)'
    ctx.fillText('最新价', W / 2, priceY + 13)
    ctx.font = `700 18px ${F}`; ctx.fillStyle = '#ffffff'
    ctx.fillText(fmtPrice(latestPrice, market), W / 2, priceY + 34)
  } else {
    const colW = Math.floor((W - 96) / 3)
    const priceItems = [
      { label: '最新价', val: fmtPrice(latestPrice, market) },
      { label: '目标价', val: fmtPrice(targetPrice, market) },
      { label: '止损价', val: fmtPrice(stopLoss, market) },
    ]
    priceItems.forEach((item, i) => {
      const cx = 48 + colW * i + colW / 2
      ctx.font = `400 11px ${F}`; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,0.45)'
      ctx.fillText(item.label, cx, priceY + 13)
      ctx.font = `700 18px ${F}`; ctx.fillStyle = '#ffffff'
      ctx.fillText(item.val, cx, priceY + 34)
      if (i < 2) {
        ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1
        ctx.beginPath(); ctx.moveTo(48 + colW * (i + 1), priceY + 4); ctx.lineTo(48 + colW * (i + 1), priceY + 42); ctx.stroke()
      }
    })
  }

  // Reason excerpt
  if (reasonExcerpt) {
    const maxW2 = W - 96
    const zoneTop = priceY + 50
    const zoneBot = isMasked ? panelY + panelH - 34 : panelY + panelH - 14
    const lineH = 20
    ctx.font = `400 13px ${F}`; ctx.fillStyle = 'rgba(255,255,255,0.52)'
    const lines: string[] = []
    let line = ''
    for (const ch of reasonExcerpt) {
      const test = line + ch
      if (ctx.measureText(test).width > maxW2) {
        lines.push(line); line = ch
        if (lines.length >= 2) {
          while (line.length > 0 && ctx.measureText(line + '…').width > maxW2) line = line.slice(0, -1)
          line += '…'; break
        }
      } else { line = test }
    }
    if (line) lines.push(line)
    const totalH = lines.length * lineH
    const startY = Math.round(zoneTop + (zoneBot - zoneTop - totalH) / 2 + lineH)
    ctx.textAlign = 'center'
    lines.forEach((l, i) => ctx.fillText(l, W / 2, startY + i * lineH))
  }

  // Free upgrade nudge
  if (isMasked) {
    ctx.font = `600 12px ${F}`; ctx.textAlign = 'center'
    ctx.fillStyle = 'rgba(255,255,255,0.45)'
    ctx.fillText('升级解锁完整研判 →', W / 2, panelY + panelH - 16)
  }

  // ── VIRAL HOOK ────────────────────────────────────────────────
  const hookLine1 = isBuy ? '我看好它了' : isSell ? '我已锁定收益' : '我选择等待'
  const hookLine2 = isBuy ? '你的判断呢？' : isSell ? '你的策略呢？' : '这个机会值得等'
  ctx.font = `500 17px ${F}`; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,0.68)'
  ctx.fillText(hookLine1, W / 2, 645)
  ctx.font = `900 32px ${F}`; ctx.fillStyle = '#ffffff'
  ctx.shadowColor = 'rgba(0,0,0,0.2)'; ctx.shadowBlur = 10
  ctx.fillText(hookLine2, W / 2, 690)
  ctx.shadowBlur = 0

  // ── BRANDING ──────────────────────────────────────────────────
  const divG = ctx.createLinearGradient(0, 0, W, 0)
  divG.addColorStop(0, 'rgba(255,255,255,0)')
  divG.addColorStop(0.2, 'rgba(255,255,255,0.2)')
  divG.addColorStop(0.8, 'rgba(255,255,255,0.2)')
  divG.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.strokeStyle = divG; ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(0, 722); ctx.lineTo(W, 722); ctx.stroke()

  ctx.font = `700 14px ${F}`; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,0.9)'
  ctx.fillText(appName, W / 2, 750)
  ctx.font = `400 12px ${F}`; ctx.fillStyle = 'rgba(255,255,255,0.4)'
  ctx.fillText(formatDate(analyzedAt), W / 2, 770)

  // ── DISCLAIMER ────────────────────────────────────────────────
  ctx.font = `400 10px ${F}`; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,0.22)'
  ctx.fillText('AI 生成 · 仅供技术分析参考 · 不构成投资建议 · 投资有风险，入市须谨慎', W / 2, 852)

  // ── BOTTOM STRIP ──────────────────────────────────────────────
  ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.fillRect(0, 896, W, 4)

  const blob = await canvasToBlob(canvas)
  return { blob, filename: buildFilename(p, 'share') }
}

// ─── Prediction card (archive/evidence) ───────────────────────────────────────
// 1080×(dynamic) @2x, solid hero zone + white zone, iOS-style cards, QR code

export async function generatePredictionCardBlob(p: PredictionCardParams): Promise<CardResult> {
  if (typeof window === 'undefined') throw new Error('SSR not supported')

  const { stockName, stockCode, market, action, confidence, latestPrice, targetPrice, stopLoss,
    opportunityGrade, reasonExcerpt, analyzedAt, tier, appName, appBaseUrl,
    marketDiagnosis, opportunityAssessment, riskAnalysis, executionPlan } = p
  const basicDailyLimit = p.basicDailyLimit ?? 5

  const isBuy  = action === 'buy'
  const isSell = action === 'sell'
  const isHold = action === 'hold'

  const impliedReturn: number | null = (targetPrice != null && latestPrice != null && latestPrice > 0)
    ? ((targetPrice - latestPrice) / latestPrice) * 100 : null
  const maxLoss: number | null = (stopLoss != null && latestPrice != null && latestPrice > 0)
    ? ((stopLoss - latestPrice) / latestPrice) * 100 : null
  const rr: number | null = (impliedReturn != null && maxLoss != null && maxLoss < 0 && Math.abs(impliedReturn) > 0.1)
    ? Math.abs(impliedReturn / maxLoss) : null

  const heroIsRisk = isHold && (impliedReturn == null || Math.abs(impliedReturn) < 0.5)
  const heroValue  = heroIsRisk ? maxLoss : impliedReturn
  const heroLabel  = heroIsRisk ? '止损参考距离' : '预期潜在空间'
  const heroSign   = heroValue != null && heroValue > 0 ? '+' : ''
  const heroStr    = (heroValue != null && Math.abs(heroValue) >= 0.05) ? `${heroSign}${heroValue.toFixed(1)}%` : '—'

  const heroColor  = isBuy ? '#FF3B30' : isSell ? '#34C759' : '#6B7280'
  const accentText = heroColor
  const actionCN   = isBuy ? '看好' : isSell ? '看空' : '观望'
  const isFree     = tier === 'free'
  const finalHeroStr   = isFree ? actionCN : heroStr
  const finalHeroLabel = isFree ? 'AI研判' : heroLabel

  const W = 1080, H = 2400
  const HERO_H = 580
  const PAD = 64
  const DPR = 2
  const canvas = document.createElement('canvas')
  canvas.width = W * DPR; canvas.height = H * DPR
  const ctx = canvas.getContext('2d')!
  ctx.scale(DPR, DPR)

  // ── HERO ZONE: solid strategy color ──────────────────────────
  ctx.fillStyle = heroColor; ctx.fillRect(0, 0, W, HERO_H)

  // Radial dark vignette
  const vgr = ctx.createRadialGradient(W / 2, HERO_H / 2, W * 0.15, W / 2, HERO_H / 2, W * 0.8)
  vgr.addColorStop(0, 'rgba(0,0,0,0)'); vgr.addColorStop(1, 'rgba(0,0,0,0.28)')
  ctx.fillStyle = vgr; ctx.fillRect(0, 0, W, HERO_H)

  // Fade into white zone
  const heroFade = ctx.createLinearGradient(0, HERO_H - 72, 0, HERO_H)
  heroFade.addColorStop(0, 'rgba(250,250,250,0)')
  heroFade.addColorStop(0.4, 'rgba(250,250,250,0.05)')
  heroFade.addColorStop(0.75, 'rgba(250,250,250,0.45)')
  heroFade.addColorStop(1, '#FAFAFA')
  ctx.fillStyle = heroFade; ctx.fillRect(0, HERO_H - 72, W, 72)

  // ── WHITE ZONE ────────────────────────────────────────────────
  ctx.fillStyle = '#FAFAFA'; ctx.fillRect(0, HERO_H, W, H - HERO_H)

  // ── HEADER ────────────────────────────────────────────────────
  ctx.font = `700 26px ${F}`; ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(255,255,255,0.92)'
  ctx.fillText(`◆ ${appName}`, PAD, 70)

  const dateStamp = formatDate(analyzedAt)
  ctx.font = `400 21px ${M}`; ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(255,255,255,0.52)'
  ctx.fillText(dateStamp, W - PAD, 70)

  // Tier badge
  const tierBadge = tier === 'premium' ? '◈ 专业版' : tier === 'basic' ? '◉ 标准版' : '免费版'
  const tierColor = tier === 'premium' ? '#F59E0B' : tier === 'basic' ? '#60A5FA' : 'rgba(255,255,255,0.55)'
  const tierBgColor = tier === 'premium' ? 'rgba(245,158,11,0.22)' : tier === 'basic' ? 'rgba(96,165,250,0.18)' : 'rgba(255,255,255,0.12)'
  ctx.font = `600 16px ${F}`
  const tbW2 = ctx.measureText(tierBadge).width + 22
  ctx.fillStyle = tierBgColor
  ctx.beginPath(); ctx.roundRect(W - PAD - tbW2, 84, tbW2, 28, 8); ctx.fill()
  ctx.fillStyle = tierColor; ctx.textAlign = 'right'
  ctx.fillText(tierBadge, W - PAD - 11, 103)

  // ── STOCK NAME ────────────────────────────────────────────────
  ctx.font = `800 62px ${F}`; ctx.textAlign = 'left'; ctx.fillStyle = '#FFFFFF'
  ctx.fillText(stockName, PAD, 164)

  // Badge chips
  const badgeItems: { text: string; alpha: number }[] = []
  if (stockCode) badgeItems.push({ text: stockCode, alpha: 0.22 })
  const mktLabel = market === 'hk' ? '港股' : market === 'us' ? '美股' : market === 'futures' ? '期货' : 'A股'
  badgeItems.push({ text: mktLabel, alpha: 0.15 })
  if (opportunityGrade && ['A', 'B', 'C'].includes(opportunityGrade))
    badgeItems.push({ text: `${opportunityGrade}级机会`, alpha: 0.22 })

  let bx = PAD
  const bY = 192, bH = 34
  ctx.font = `600 16px ${F}`
  for (const b of badgeItems) {
    const tw = ctx.measureText(b.text).width
    const bw = tw + 22
    ctx.fillStyle = `rgba(255,255,255,${b.alpha})`
    ctx.beginPath(); ctx.roundRect(bx, bY, bw, bH, 8); ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.88)'; ctx.textAlign = 'left'
    ctx.fillText(b.text, bx + 11, bY + 22)
    bx += bw + 10
  }

  // ── HERO NUMBER ───────────────────────────────────────────────
  ctx.shadowColor = 'rgba(0,0,0,0.25)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 8
  const heroFontSize = finalHeroStr.length > 7 ? 118 : finalHeroStr.length > 5 ? 136 : 152
  ctx.font = `800 ${heroFontSize}px ${F}`; ctx.textAlign = 'center'; ctx.fillStyle = '#FFFFFF'
  ctx.fillText(finalHeroStr, W / 2, 440)
  ctx.shadowBlur = 0; ctx.shadowColor = 'transparent'; ctx.shadowOffsetY = 0

  ctx.font = `500 24px ${F}`; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,0.72)'
  ctx.fillText(finalHeroLabel, W / 2, 490)

  const rrNote = isFree
    ? (isBuy ? '技术面看好 · 升级解锁完整分析'
       : isSell ? '技术面看空 · 升级解锁完整分析'
       : '观望等待 · 升级解锁完整研判')
    : rr != null
    ? `风险收益比  ${rr.toFixed(1)} : 1`
    : isBuy ? '技术面看好 · 目标上行空间估算'
    : isSell ? '技术面看空 · 目标下行空间估算'
    : '止损保护为首要考量 · 等待更佳入场'
  ctx.font = `400 20px ${F}`; ctx.fillStyle = 'rgba(255,255,255,0.46)'
  ctx.fillText(rrNote, W / 2, 538)

  // ── WHITE ZONE: Action pill + stock name ──────────────────────
  let y = 620

  ctx.font = `700 30px ${F}`
  const pillTw = ctx.measureText(actionCN).width
  const pillW2 = pillTw + 28, pillH2 = 46
  ctx.fillStyle = accentText
  ctx.beginPath(); ctx.roundRect(PAD, y - 36, pillW2, pillH2, 10); ctx.fill()
  ctx.fillStyle = '#FFFFFF'; ctx.textAlign = 'left'
  ctx.fillText(actionCN, PAD + 14, y - 1)

  ctx.font = `700 34px ${F}`; ctx.fillStyle = '#1C1C1E'
  ctx.fillText(stockName, PAD + pillW2 + 18, y - 1)
  y += 42

  // ── STATS CARDS ───────────────────────────────────────────────
  const statColW = Math.floor((W - PAD * 2 - 24) / 3)
  const statH = 100
  const showPrices = !isFree

  // Current price card
  const sx0 = PAD
  ctx.fillStyle = '#FFFFFF'
  ctx.shadowColor = 'rgba(0,0,0,0.07)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 5
  ctx.beginPath(); ctx.roundRect(sx0, y, statColW, statH, 14); ctx.fill()
  ctx.font = `400 17px ${F}`; ctx.textAlign = 'left'; ctx.fillStyle = '#8E8E93'
  ctx.fillText('研判时价', sx0 + 20, y + 30)
  ctx.font = `700 27px ${M}`; ctx.fillStyle = '#1C1C1E'
  ctx.fillText(fmtPrice(latestPrice, market), sx0 + 20, y + 66)

  if (showPrices) {
    // Target price card
    const sx1 = PAD + statColW + 12
    ctx.fillStyle = '#FFFFFF'
    ctx.beginPath(); ctx.roundRect(sx1, y, statColW, statH, 14); ctx.fill()
    ctx.font = `400 17px ${F}`; ctx.textAlign = 'left'; ctx.fillStyle = '#8E8E93'
    ctx.fillText('目标估价', sx1 + 20, y + 30)
    ctx.font = `700 27px ${M}`; ctx.fillStyle = accentText
    ctx.fillText(fmtPrice(targetPrice, market), sx1 + 20, y + 66)

    // Stop loss card
    const sx2 = PAD + (statColW + 12) * 2
    ctx.fillStyle = '#FFFFFF'
    ctx.beginPath(); ctx.roundRect(sx2, y, statColW, statH, 14); ctx.fill()
    ctx.shadowBlur = 0; ctx.shadowColor = 'transparent'; ctx.shadowOffsetY = 0
    ctx.font = `400 17px ${F}`; ctx.textAlign = 'left'; ctx.fillStyle = '#8E8E93'
    ctx.fillText('止损参考', sx2 + 20, y + 30)
    ctx.font = `700 27px ${M}`; ctx.fillStyle = '#FF9F0A'
    ctx.fillText(fmtPrice(stopLoss, market), sx2 + 20, y + 66)
    if (maxLoss != null && Math.abs(maxLoss) >= 0.05) {
      ctx.font = `400 15px ${F}`; ctx.fillStyle = '#FF9F0Acc'
      ctx.fillText(`${maxLoss.toFixed(1)}%`, sx2 + 20, y + 86)
    }
  } else {
    // Locked block spanning 2 right columns
    const lockX = PAD + statColW + 12
    const lockW = (statColW + 12) * 2 - 12
    const lockTint = '#60A5FA'

    ctx.fillStyle = '#FFFFFF'
    ctx.shadowColor = 'rgba(0,0,0,0.06)'; ctx.shadowBlur = 12; ctx.shadowOffsetY = 4
    ctx.beginPath(); ctx.roundRect(lockX, y, lockW, statH, 14); ctx.fill()
    ctx.shadowBlur = 0; ctx.shadowColor = 'transparent'; ctx.shadowOffsetY = 0

    const lockGrad = ctx.createLinearGradient(lockX, y, lockX + lockW, y + statH)
    lockGrad.addColorStop(0, lockTint + '10'); lockGrad.addColorStop(1, lockTint + '05')
    ctx.fillStyle = lockGrad
    ctx.beginPath(); ctx.roundRect(lockX, y, lockW, statH, 14); ctx.fill()

    ctx.fillStyle = lockTint + '55'
    ctx.beginPath(); ctx.roundRect(lockX, y + 14, 3, statH - 28, 2); ctx.fill()

    ctx.font = `400 14px ${F}`; ctx.textAlign = 'left'; ctx.fillStyle = '#C7C7CC'
    ctx.fillText('目标估价', lockX + 20, y + 24)
    ctx.textAlign = 'right'; ctx.fillText('止损参考', lockX + lockW - 20, y + 24)
    ctx.textAlign = 'left'

    ctx.font = `600 19px ${F}`; ctx.fillStyle = lockTint
    const ctaTxt = '升级解锁价格目标'
    const ctaW2 = ctx.measureText(ctaTxt).width
    ctx.fillText(ctaTxt, lockX + (lockW - ctaW2) / 2, y + 58)

    ctx.font = `400 13px ${F}`; ctx.fillStyle = '#AEAEB2'
    const hint = '标准版起可见'
    const hintW = ctx.measureText(hint).width
    ctx.fillText(hint, lockX + (lockW - hintW) / 2, y + 80)
  }
  ctx.shadowBlur = 0; ctx.shadowColor = 'transparent'; ctx.shadowOffsetY = 0
  y += statH + 28

  // ── DIVIDER ───────────────────────────────────────────────────
  ctx.strokeStyle = '#E5E5EA'; ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(PAD, y); ctx.lineTo(W - PAD, y); ctx.stroke()
  y += 30

  // ── DEEP ANALYSIS SECTIONS ────────────────────────────────────
  const allSections = [
    { label: '市场诊断', icon: '诊', tint: '#0071e3', content: marketDiagnosis || reasonExcerpt || '' },
    { label: '机会评估', icon: '机', tint: '#f59e0b', content: opportunityAssessment || '' },
    { label: '风险收益', icon: '险', tint: '#ef4444', content: riskAnalysis || '' },
    { label: '执行方案', icon: '行', tint: '#10b981', content: executionPlan || '' },
  ]
  const visibleCount = isFree ? 0 : 4
  const sections = allSections.slice(0, visibleCount)
  const showUpgradeCTA = isFree || tier === 'basic'

  const drawWrappedText = (text: string, x: number, startY: number, maxW: number, lineH: number, maxLines: number): number => {
    if (!text) return startY
    ctx.textAlign = 'left'
    let line = ''
    let drawnLines = 0
    let curY = startY
    for (const ch of text) {
      const test = line + ch
      if (ctx.measureText(test).width > maxW) {
        if (drawnLines >= maxLines - 1) {
          while (line.length > 0 && ctx.measureText(line + '…').width > maxW) line = line.slice(0, -1)
          ctx.fillText(line + '…', x, curY)
          return curY + lineH
        }
        ctx.fillText(line, x, curY)
        curY += lineH; drawnLines++; line = ch
      } else { line = test }
    }
    if (line) { ctx.fillText(line, x, curY); curY += lineH }
    return curY
  }

  // Free tier: summary card
  if (isFree) {
    const summary = reasonExcerpt || (marketDiagnosis || '').slice(0, 60).trim()
    const summaryH = 84
    ctx.fillStyle = '#FFFFFF'
    ctx.shadowColor = 'rgba(0,0,0,0.06)'; ctx.shadowBlur = 12; ctx.shadowOffsetY = 4
    ctx.beginPath(); ctx.roundRect(PAD, y, W - PAD * 2, summaryH, 14); ctx.fill()
    ctx.shadowBlur = 0; ctx.shadowColor = 'transparent'; ctx.shadowOffsetY = 0

    ctx.fillStyle = accentText + 'AA'
    ctx.beginPath(); ctx.roundRect(PAD, y + 12, 3, summaryH - 24, 2); ctx.fill()

    ctx.font = `500 16px ${F}`; ctx.textAlign = 'left'; ctx.fillStyle = '#8E8E93'
    ctx.fillText('研判摘要', PAD + 20, y + 28)
    ctx.font = `400 19px ${F}`; ctx.fillStyle = '#3A3A3C'
    let rem = summary, lineY = y + 52, linesLeft = 2
    while (rem && linesLeft > 0) {
      let seg = rem
      while (seg.length > 0 && ctx.measureText(seg + (linesLeft === 1 ? '…' : '')).width > W - PAD * 2 - 40) seg = seg.slice(0, -1)
      ctx.fillText(seg + (linesLeft === 1 && seg.length < rem.length ? '…' : ''), PAD + 20, lineY)
      rem = rem.slice(seg.length); lineY += 28; linesLeft--
    }
    y += summaryH + 16
  }

  for (const sec of sections) {
    const cardPad = 28
    const iconSize = 44
    const textX = PAD + cardPad + iconSize + 18
    const textMaxW = W - PAD * 2 - cardPad * 2 - iconSize - 18

    ctx.font = `400 20px ${F}`
    const linesNeeded = Math.min(5, Math.ceil((ctx.measureText(sec.content).width || 1) / textMaxW) + 1)
    const contentH = Math.max(1, linesNeeded) * 30
    const cardH = cardPad + 28 + 12 + contentH + cardPad

    ctx.fillStyle = '#FFFFFF'
    ctx.shadowColor = 'rgba(0,0,0,0.07)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 4
    ctx.beginPath(); ctx.roundRect(PAD, y, W - PAD * 2, cardH, 16); ctx.fill()
    ctx.shadowBlur = 0; ctx.shadowColor = 'transparent'; ctx.shadowOffsetY = 0

    // Left accent bar
    ctx.fillStyle = sec.tint; ctx.fillRect(PAD, y + 14, 4, cardH - 28)

    // Icon circle
    ctx.fillStyle = sec.tint + '18'
    ctx.beginPath(); ctx.arc(PAD + cardPad + iconSize / 2, y + cardPad + iconSize / 2, iconSize / 2, 0, Math.PI * 2); ctx.fill()
    ctx.font = `700 20px ${F}`; ctx.textAlign = 'center'; ctx.fillStyle = sec.tint
    ctx.fillText(sec.icon, PAD + cardPad + iconSize / 2, y + cardPad + iconSize / 2 + 7)

    ctx.font = `600 20px ${F}`; ctx.textAlign = 'left'; ctx.fillStyle = '#1C1C1E'
    ctx.fillText(sec.label, textX, y + cardPad + 22)

    ctx.font = `400 20px ${F}`; ctx.fillStyle = '#3A3A3C'
    drawWrappedText(sec.content, textX, y + cardPad + 22 + 14 + 20, textMaxW, 30, 5)

    y += cardH + 16
  }

  // ── UPGRADE CTA ───────────────────────────────────────────────
  if (showUpgradeCTA) {
    const upgradeTint = isFree ? '#60A5FA' : '#A855F7'

    if (isFree) {
      for (const sec of allSections) {
        const lockCardH = 58
        ctx.fillStyle = '#F5F5F7'
        ctx.shadowColor = 'rgba(0,0,0,0.03)'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 2
        ctx.beginPath(); ctx.roundRect(PAD, y, W - PAD * 2, lockCardH, 12); ctx.fill()
        ctx.shadowBlur = 0; ctx.shadowColor = 'transparent'; ctx.shadowOffsetY = 0
        ctx.font = `500 16px ${F}`; ctx.textAlign = 'left'; ctx.fillStyle = '#C7C7CC'
        ctx.fillText(sec.label, PAD + 20, y + 22)
        ctx.fillStyle = '#E5E5EA'
        ctx.beginPath(); ctx.roundRect(PAD + 20, y + 32, 380, 9, 4); ctx.fill()
        ctx.fillStyle = '#EBEBF0'
        ctx.beginPath(); ctx.roundRect(PAD + 20, y + 44, 240, 9, 4); ctx.fill()
        y += lockCardH + 8
      }
    }

    const ctaLine1 = isFree ? '升级标准版，解锁每日深度研判' : '升级专业版，解锁优先通道'
    const ctaLine2 = isFree ? `标准版起每天 ${basicDailyLimit} 次完整分析` : '深度研判 + 持仓针对性分析 · 更多分析次数'
    const ctaH = 80
    const ctaGrad = ctx.createLinearGradient(PAD, y, W - PAD, y + ctaH)
    ctaGrad.addColorStop(0, upgradeTint + '1A'); ctaGrad.addColorStop(1, upgradeTint + '0A')
    ctx.fillStyle = ctaGrad
    ctx.beginPath(); ctx.roundRect(PAD, y, W - PAD * 2, ctaH, 14); ctx.fill()
    ctx.strokeStyle = upgradeTint + '35'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.roundRect(PAD, y, W - PAD * 2, ctaH, 14); ctx.stroke()

    ctx.font = `600 20px ${F}`; ctx.textAlign = 'center'; ctx.fillStyle = upgradeTint
    ctx.fillText(ctaLine1, W / 2, y + 32)
    ctx.font = `400 15px ${F}`; ctx.fillStyle = upgradeTint + 'AA'
    ctx.fillText(ctaLine2, W / 2, y + 57)
    y += ctaH + 16
  }

  y += 10

  // ── TIMESTAMP SEAL ────────────────────────────────────────────
  const sealH = 90
  ctx.fillStyle = '#FFFFFF'
  ctx.shadowColor = 'rgba(0,0,0,0.07)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 5
  ctx.beginPath(); ctx.roundRect(PAD, y, W - PAD * 2, sealH, 14); ctx.fill()
  ctx.shadowBlur = 0; ctx.shadowColor = 'transparent'; ctx.shadowOffsetY = 0
  ctx.fillStyle = accentText; ctx.fillRect(PAD, y + 12, 4, sealH - 24)

  ctx.font = `600 19px ${F}`; ctx.textAlign = 'left'; ctx.fillStyle = accentText
  ctx.fillText('🔒  研判时间戳已封存', PAD + 24, y + 34)
  ctx.font = `500 19px ${M}`; ctx.textAlign = 'right'; ctx.fillStyle = '#1C1C1E'
  ctx.fillText(dateStamp, W - PAD - 20, y + 34)
  ctx.font = `400 15px ${F}`; ctx.textAlign = 'left'; ctx.fillStyle = '#8E8E93'
  ctx.fillText('此研判截面已锁定 · 可于未来核验分析准确性', PAD + 24, y + 62)
  y += sealH + 36

  // ── DIVIDER ───────────────────────────────────────────────────
  ctx.strokeStyle = '#E5E5EA'; ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(PAD, y); ctx.lineTo(W - PAD, y); ctx.stroke()

  // ── QR CODE + CTA ─────────────────────────────────────────────
  const qrSize = 168
  const qrStartY = y + 20
  const qrX = PAD
  const ctaX = qrX + qrSize + 48

  ctx.font = `400 15px ${F}`; ctx.textAlign = 'center'; ctx.fillStyle = '#DEDEDE'
  ctx.fillText('— 扫码体验 —', W / 2, qrStartY - 22)

  const qrUrl = appBaseUrl || 'https://example.com'
  try {
    const QRCode = (await import('qrcode')) as typeof import('qrcode')
    const qrDataUrl = await QRCode.toDataURL(qrUrl, {
      width: qrSize * DPR,
      margin: 1,
      color: { dark: '#1C1C1E', light: '#FFFFFF' },
    })
    await new Promise<void>((resolve, reject) => {
      const img = new Image()
      img.onload = () => { ctx.drawImage(img, qrX, qrStartY, qrSize, qrSize); resolve() }
      img.onerror = reject
      img.src = qrDataUrl
    })
  } catch {
    drawQR(ctx, qrX, qrStartY, qrSize, '#1C1C1E', '#FFFFFF')
  }

  ctx.font = `800 40px ${F}`; ctx.textAlign = 'left'; ctx.fillStyle = '#1C1C1E'
  ctx.fillText('我已布局，你呢？', ctaX, qrStartY + 46)

  ctx.font = `400 22px ${F}`; ctx.fillStyle = '#636366'
  ctx.fillText('比分析师早 3 小时拿到信号', ctaX, qrStartY + 86)

  ctx.font = `600 22px ${F}`; ctx.fillStyle = accentText
  ctx.fillText('→  免费解锁每日 AI 研判', ctaX, qrStartY + 128)

  ctx.font = `400 15px ${M}`; ctx.fillStyle = '#AEAEB2'
  ctx.fillText(qrUrl, ctaX, qrStartY + 156)

  // ── DISCLAIMER ────────────────────────────────────────────────
  const footerY = qrStartY + qrSize + 60
  ctx.font = `400 14px ${F}`; ctx.textAlign = 'center'; ctx.fillStyle = '#C7C7CC'
  ctx.fillText('本内容仅供技术分析参考，不构成投资建议 · 投资有风险，入市须谨慎', W / 2, footerY)

  ctx.fillStyle = heroColor; ctx.fillRect(0, footerY + 20, W, 6)

  // ── CROP TO CONTENT HEIGHT ────────────────────────────────────
  const actualH = footerY + 28
  const croppedCanvas = document.createElement('canvas')
  croppedCanvas.width = W * DPR; croppedCanvas.height = actualH * DPR
  const croppedCtx = croppedCanvas.getContext('2d')!
  croppedCtx.drawImage(canvas, 0, 0, W * DPR, actualH * DPR, 0, 0, W * DPR, actualH * DPR)

  const blob = await canvasToBlob(croppedCanvas)
  return { blob, filename: buildFilename(p, 'archive') }
}
