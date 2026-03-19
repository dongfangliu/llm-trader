/**
 * Share card generator - creates a canvas image from analysis result.
 * Port the logic from the existing Next.js app if available, otherwise implement new.
 */

export interface ShareCardOptions {
  symbol: string
  market: string
  period: string
  result: any
  appName?: string
}

export async function generateShareCard(options: ShareCardOptions): Promise<string | null> {
  if (typeof window === 'undefined') return null

  const { symbol, market, period, result } = options
  const appName = options.appName || 'AI 股票分析'

  // Get action info
  const action = result?.action || 'hold'
  const actionMap: Record<string, { label: string; color: string }> = {
    buy: { label: '买入', color: '#34c759' },
    sell: { label: '卖出', color: '#ff3b30' },
    hold: { label: '持有', color: '#ff9500' },
    open_long: { label: '做多', color: '#34c759' },
    close_long: { label: '平多', color: '#ff3b30' },
    open_short: { label: '做空', color: '#ff3b30' },
  }
  const actionInfo = actionMap[action] || { label: '持有', color: '#ff9500' }

  const marketLabels: Record<string, string> = {
    a: 'A股', hk: '港股', us: '美股', futures: '期货'
  }
  const periodLabels: Record<string, string> = {
    daily: '日线', '60': '60分', '30': '30分', '15': '15分', '5': '5分', '1': '1分'
  }

  // Create canvas
  const canvas = document.createElement('canvas')
  const width = 375
  const height = 500
  canvas.width = width * 2  // 2x for retina
  canvas.height = height * 2
  canvas.style.width = `${width}px`
  canvas.style.height = `${height}px`

  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  ctx.scale(2, 2)

  // Background
  ctx.fillStyle = '#f2f2f7'
  ctx.fillRect(0, 0, width, height)

  // Card
  const cardX = 20
  const cardY = 20
  const cardW = width - 40
  const cardH = height - 40

  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.roundRect(cardX, cardY, cardW, cardH, 20)
  ctx.fill()

  // Shadow
  ctx.shadowColor = 'rgba(0,0,0,0.08)'
  ctx.shadowBlur = 16
  ctx.shadowOffsetY = 4

  // Reset shadow
  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0
  ctx.shadowOffsetY = 0

  const cx = cardX + cardW / 2
  let y = cardY + 40

  // App name
  ctx.font = '600 13px -apple-system, BlinkMacSystemFont, Arial'
  ctx.fillStyle = '#8e8e93'
  ctx.textAlign = 'center'
  ctx.fillText(appName, cx, y)
  y += 30

  // Symbol + market
  ctx.font = 'bold 36px -apple-system, BlinkMacSystemFont, Arial'
  ctx.fillStyle = '#000000'
  ctx.fillText(symbol, cx, y)
  y += 20

  ctx.font = '400 14px -apple-system, BlinkMacSystemFont, Arial'
  ctx.fillStyle = '#8e8e93'
  ctx.fillText(`${marketLabels[market] || market} · ${periodLabels[period] || period}`, cx, y)
  y += 40

  // Action badge
  const badgeW = 120
  const badgeH = 44
  const badgeX = cx - badgeW / 2

  ctx.fillStyle = actionInfo.color
  ctx.beginPath()
  ctx.roundRect(badgeX, y, badgeW, badgeH, 22)
  ctx.fill()

  ctx.font = 'bold 20px -apple-system, BlinkMacSystemFont, Arial'
  ctx.fillStyle = '#ffffff'
  ctx.fillText(actionInfo.label, cx, y + badgeH / 2 + 7)
  y += badgeH + 30

  // Summary text (truncated)
  const summary = result?.summary || result?.analysis || result?.reason || ''
  if (summary) {
    ctx.font = '400 14px -apple-system, BlinkMacSystemFont, Arial'
    ctx.fillStyle = '#3c3c43'
    ctx.textAlign = 'center'

    // Word wrap
    const words = summary.split('')
    let line = ''
    let lineY = y
    const maxWidth = cardW - 60
    const lineHeight = 22
    let lineCount = 0

    for (const char of words) {
      const testLine = line + char
      const metrics = ctx.measureText(testLine)
      if (metrics.width > maxWidth && line !== '') {
        ctx.fillText(line, cx, lineY)
        line = char
        lineY += lineHeight
        lineCount++
        if (lineCount >= 5) break
      } else {
        line = testLine
      }
    }
    if (line && lineCount < 5) {
      ctx.fillText(line, cx, lineY)
    }
    y = lineY + 30
  }

  // Footer
  y = cardY + cardH - 30
  ctx.font = '400 12px -apple-system, BlinkMacSystemFont, Arial'
  ctx.fillStyle = '#aeaeb2'
  ctx.textAlign = 'center'
  ctx.fillText(new Date().toLocaleDateString('zh-CN'), cx, y)

  return canvas.toDataURL('image/png')
}

export async function downloadShareCard(dataUrl: string, filename = 'analysis.png'): Promise<void> {
  const link = document.createElement('a')
  link.download = filename
  link.href = dataUrl
  link.click()
}
