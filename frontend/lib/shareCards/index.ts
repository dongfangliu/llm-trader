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
  marketDiagnosis: string
  opportunityAssessment: string
  riskAnalysis: string
  executionPlan: string
}

type CardResult = { blob: Blob; filename: string }

const MARKET_LABELS: Record<string, string> = {
  a: 'A股', hk: '港股', us: '美股', futures: '期货',
}

const ACTION_MAP: Record<string, { label: string; color: string; bg: string }> = {
  buy:  { label: '看涨 ▲', color: '#ffffff', bg: '#EF4444' },
  sell: { label: '看跌 ▼', color: '#ffffff', bg: '#22C55E' },
  hold: { label: '观望 —', color: '#ffffff', bg: '#60A5FA' },
}

function getActionInfo(action: string) {
  return ACTION_MAP[action] || ACTION_MAP.hold
}

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

/** Draw rounded rect helper */
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
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

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => b ? resolve(b) : reject(new Error('toBlob failed')),
      'image/png',
    )
  })
}

// ─── Statement card (social share) ────────────────────────────────────────────
// Square-ish: 1080×1080 @2x canvas

export async function generateStatementCardBlob(p: PredictionCardParams): Promise<CardResult> {
  if (typeof window === 'undefined') throw new Error('SSR not supported')

  const W = 1080, H = 1080
  const DPR = 2
  const canvas = document.createElement('canvas')
  canvas.width = W * DPR
  canvas.height = H * DPR
  const ctx = canvas.getContext('2d')!
  ctx.scale(DPR, DPR)

  const ai = getActionInfo(p.action)
  const PAD = 48

  // Background gradient
  const bg = ctx.createLinearGradient(0, 0, 0, H)
  bg.addColorStop(0, '#0d0d0d')
  bg.addColorStop(1, '#1a1a2e')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)

  // Subtle glow circle behind badge
  const glow = ctx.createRadialGradient(W / 2, 340, 0, W / 2, 340, 260)
  glow.addColorStop(0, ai.bg + '28')
  glow.addColorStop(1, 'transparent')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, H)

  // ── App name ──
  ctx.font = `500 ${28}px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif`
  ctx.fillStyle = 'rgba(255,255,255,0.35)'
  ctx.textAlign = 'center'
  ctx.fillText(p.appName, W / 2, PAD + 28)

  // ── Stock code + market ──
  ctx.font = `700 ${96}px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif`
  ctx.fillStyle = '#ffffff'
  ctx.fillText(p.stockCode, W / 2, 180)

  if (p.stockName && p.stockName !== p.stockCode) {
    ctx.font = `400 ${34}px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif`
    ctx.fillStyle = 'rgba(255,255,255,0.55)'
    ctx.fillText(`${p.stockName}  ·  ${MARKET_LABELS[p.market] || p.market}`, W / 2, 228)
  } else {
    ctx.font = `400 ${34}px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif`
    ctx.fillStyle = 'rgba(255,255,255,0.55)'
    ctx.fillText(MARKET_LABELS[p.market] || p.market, W / 2, 228)
  }

  // ── Action badge ──
  const BADGE_W = 280, BADGE_H = 72, BADGE_Y = 270
  roundRect(ctx, (W - BADGE_W) / 2, BADGE_Y, BADGE_W, BADGE_H, 36)
  ctx.fillStyle = ai.bg
  ctx.fill()

  ctx.font = `700 ${32}px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif`
  ctx.fillStyle = ai.color
  ctx.textAlign = 'center'
  ctx.fillText(ai.label, W / 2, BADGE_Y + BADGE_H / 2 + 11)

  // ── Price row ──
  let priceY = 398
  if (p.latestPrice != null || p.targetPrice != null || p.confidence != null) {
    const items: Array<{ label: string; val: string }> = []
    if (p.latestPrice != null) items.push({ label: '现价', val: String(p.latestPrice) })
    if (p.targetPrice != null) items.push({ label: '目标', val: String(p.targetPrice) })
    if (p.confidence != null) items.push({ label: '置信度', val: `${p.confidence}%` })

    const itemW = (W - PAD * 2) / items.length
    items.forEach((item, i) => {
      const cx = PAD + itemW * i + itemW / 2
      ctx.font = `400 ${24}px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif`
      ctx.fillStyle = 'rgba(255,255,255,0.35)'
      ctx.textAlign = 'center'
      ctx.fillText(item.label, cx, priceY)
      ctx.font = `600 ${36}px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif`
      ctx.fillStyle = 'rgba(255,255,255,0.9)'
      ctx.fillText(item.val, cx, priceY + 42)
    })
    priceY += 80
  }

  // ── Separator ──
  const sepY = priceY + 20
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(PAD, sepY)
  ctx.lineTo(W - PAD, sepY)
  ctx.stroke()

  // ── Reason excerpt ──
  if (p.reasonExcerpt) {
    ctx.font = `400 ${30}px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif`
    ctx.fillStyle = 'rgba(255,255,255,0.65)'
    ctx.textAlign = 'center'
    const lines = wrapText(ctx, p.reasonExcerpt, W - PAD * 2 - 40, 4)
    const lh = 46
    const startY = sepY + 50
    lines.forEach((line, i) => ctx.fillText(line, W / 2, startY + i * lh))
  }

  // ── Footer ──
  const footerY = H - 60
  ctx.font = `400 ${24}px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif`
  ctx.fillStyle = 'rgba(255,255,255,0.2)'
  ctx.textAlign = 'center'
  ctx.fillText(`${formatDate(p.analyzedAt)}  ·  仅供参考，不构成投资建议`, W / 2, footerY)

  const blob = await canvasToBlob(canvas)
  return { blob, filename: buildFilename(p, 'share') }
}

// ─── Prediction card (archive/evidence) ───────────────────────────────────────
// Tall: 1080×1620 @2x canvas, white background with full narrative

export async function generatePredictionCardBlob(p: PredictionCardParams): Promise<CardResult> {
  if (typeof window === 'undefined') throw new Error('SSR not supported')

  const W = 1080, H = 1620
  const DPR = 2
  const canvas = document.createElement('canvas')
  canvas.width = W * DPR
  canvas.height = H * DPR
  const ctx = canvas.getContext('2d')!
  ctx.scale(DPR, DPR)

  const ai = getActionInfo(p.action)
  const PAD = 60
  let y = 0

  // White background
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, W, H)

  // Top accent bar
  ctx.fillStyle = ai.bg
  ctx.fillRect(0, 0, W, 8)

  y = 60

  // ── App name ──
  ctx.font = `500 ${26}px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif`
  ctx.fillStyle = '#8e8e93'
  ctx.textAlign = 'left'
  ctx.fillText(p.appName, PAD, y + 20)

  // Timestamp top-right
  ctx.textAlign = 'right'
  ctx.font = `400 ${24}px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif`
  ctx.fillStyle = '#aeaeb2'
  ctx.fillText(formatDate(p.analyzedAt), W - PAD, y + 20)

  y += 64

  // ── Divider ──
  ctx.strokeStyle = '#e5e5ea'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(PAD, y)
  ctx.lineTo(W - PAD, y)
  ctx.stroke()
  y += 48

  // ── Stock header ──
  ctx.textAlign = 'left'
  ctx.font = `700 ${64}px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif`
  ctx.fillStyle = '#000000'
  ctx.fillText(p.stockCode, PAD, y + 56)

  // Action pill — right aligned
  const pill = getActionInfo(p.action)
  const pillW = 160, pillH = 52
  roundRect(ctx, W - PAD - pillW, y + 14, pillW, pillH, 26)
  ctx.fillStyle = pill.bg
  ctx.fill()
  ctx.font = `700 ${26}px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif`
  ctx.fillStyle = pill.color
  ctx.textAlign = 'center'
  ctx.fillText(pill.label, W - PAD - pillW / 2, y + 14 + pillH / 2 + 9)
  ctx.textAlign = 'left'

  y += 80

  if (p.stockName && p.stockName !== p.stockCode) {
    ctx.font = `400 ${30}px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif`
    ctx.fillStyle = '#636366'
    ctx.fillText(`${p.stockName}  ·  ${MARKET_LABELS[p.market] || p.market}`, PAD, y)
  } else {
    ctx.font = `400 ${30}px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif`
    ctx.fillStyle = '#636366'
    ctx.fillText(MARKET_LABELS[p.market] || p.market, PAD, y)
  }
  y += 52

  // ── Price/confidence grid ──
  const gridItems: Array<{ label: string; val: string }> = []
  if (p.latestPrice != null) gridItems.push({ label: '现价', val: String(p.latestPrice) })
  if (p.targetPrice != null) gridItems.push({ label: '目标价', val: String(p.targetPrice) })
  if (p.stopLoss != null) gridItems.push({ label: '止损', val: String(p.stopLoss) })
  if (p.confidence != null) gridItems.push({ label: '置信度', val: `${p.confidence}%` })

  if (gridItems.length) {
    y += 12
    const cols = Math.min(gridItems.length, 4)
    const cellW = (W - PAD * 2) / cols
    const cellH = 90

    roundRect(ctx, PAD, y, W - PAD * 2, cellH, 14)
    ctx.fillStyle = '#f2f2f7'
    ctx.fill()

    gridItems.slice(0, cols).forEach((item, i) => {
      const cx = PAD + cellW * i + cellW / 2
      ctx.font = `400 ${22}px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif`
      ctx.fillStyle = '#8e8e93'
      ctx.textAlign = 'center'
      ctx.fillText(item.label, cx, y + 28)
      ctx.font = `600 ${30}px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif`
      ctx.fillStyle = '#1c1c1e'
      ctx.fillText(item.val, cx, y + 66)
    })
    ctx.textAlign = 'left'
    y += cellH + 36
  }

  // ── Narrative sections ──
  const sections = [
    { label: '市场诊断', text: p.marketDiagnosis },
    { label: '机会评估', text: p.opportunityAssessment },
    { label: '风险分析', text: p.riskAnalysis },
    { label: '执行方案', text: p.executionPlan },
  ].filter(s => s.text)

  for (const sec of sections) {
    if (y > H - 200) break

    // Section label
    ctx.font = `600 ${26}px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif`
    ctx.fillStyle = ai.bg
    ctx.fillText('● ' + sec.label, PAD, y)
    y += 38

    // Section text
    ctx.font = `400 ${27}px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif`
    ctx.fillStyle = '#3c3c43'
    const lines = wrapText(ctx, sec.text, W - PAD * 2, 5)
    for (const line of lines) {
      if (y > H - 160) break
      ctx.fillText(line, PAD, y)
      y += 40
    }
    y += 20
  }

  // ── Footer with watermark ──
  const footerY = H - 80
  ctx.strokeStyle = '#e5e5ea'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(PAD, footerY - 24)
  ctx.lineTo(W - PAD, footerY - 24)
  ctx.stroke()

  ctx.font = `400 ${22}px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif`
  ctx.fillStyle = '#c7c7cc'
  ctx.textAlign = 'center'
  ctx.fillText('本图仅供参考，不构成投资建议。投资有风险，入市须谨慎。', W / 2, footerY)

  if (p.appBaseUrl) {
    ctx.font = `400 ${20}px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif`
    ctx.fillStyle = '#c7c7cc'
    ctx.fillText(p.appBaseUrl, W / 2, footerY + 30)
  }

  const blob = await canvasToBlob(canvas)
  return { blob, filename: buildFilename(p, 'archive') }
}
