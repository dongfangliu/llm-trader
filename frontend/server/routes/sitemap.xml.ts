function xmlEscape(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export default defineEventHandler(async (event) => {
  const origin = getRequestURL(event).origin
  const backendUrl = process.env.BACKEND_URL || 'http://localhost:8000'
  const staticPaths = [
    '/',
    '/stocks',
    '/research',
    '/learn/ma',
    '/learn/rsi',
    '/learn/macd',
    '/learn/atr',
    '/stocks/a/600519',
    '/stocks/a/300750',
    '/stocks/a/002594',
    '/stocks/a/600036',
    '/stocks/a/000858',
    '/stocks/hk/00700',
    '/stocks/hk/03690',
    '/stocks/hk/01810',
    '/stocks/hk/09988',
    '/futures/MA',
    '/futures/RB',
    '/futures/CU',
    '/futures/SA',
  ]

  const urls = new Set(staticPaths.map(path => `${origin}${path}`))

  try {
    const res = await $fetch<any>(`${backendUrl}/api/public/research`, { query: { limit: 300 } })
    for (const p of res.predictions || []) {
      urls.add(`${origin}/research/${p.market}/${p.symbol}`)
      urls.add(`${origin}/research/${p.market}/${p.symbol}/${p.prediction_date}`)
    }
  } catch {}

  const body = [...urls].map(loc => `  <url><loc>${xmlEscape(loc)}</loc></url>`).join('\n')
  setHeader(event, 'content-type', 'application/xml; charset=utf-8')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`
})
