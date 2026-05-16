import { CORE_STOCKS, LEARN_ARTICLES } from '~/constants/seo'

function xmlEscape(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export default defineEventHandler(async (event) => {
  // Prefer APP_BASE_URL env so prod sitemap uses the real public domain even when
  // requests come from a 127.0.0.1 health-check / reverse-proxy probe.
  const origin = (process.env.APP_BASE_URL || getRequestURL(event).origin).replace(/\/$/, '')
  const backendUrl = process.env.BACKEND_URL || 'http://localhost:8000'
  const today = new Date().toISOString().slice(0, 10)
  const urls = new Map<string, string>()
  const addUrl = (path: string, lastmod = today) => urls.set(`${origin}${path}`, lastmod)

  addUrl('/')
  addUrl('/upgrade')
  addUrl('/stocks')
  addUrl('/research')
  addUrl('/predictions')
  addUrl('/terms')
  addUrl('/privacy')
  for (const article of LEARN_ARTICLES) addUrl(`/learn/${article.slug}`)
  for (const stock of CORE_STOCKS.filter(item => item.market === 'a')) {
    addUrl(`/stocks/${stock.market}/${stock.symbol}`)
  }

  try {
    const res = await $fetch<any>(`${backendUrl}/api/public/research`, { query: { limit: 300 } })
    for (const p of res.predictions || []) {
      if (p.market !== 'a') continue
      addUrl(`/research/${p.market}/${p.symbol}`, p.updated_at?.slice?.(0, 10) || p.prediction_date || today)
      addUrl(`/research/${p.market}/${p.symbol}/${p.prediction_date}`, p.updated_at?.slice?.(0, 10) || p.prediction_date || today)
    }
  } catch {}

  const body = [...urls.entries()]
    .map(([loc, lastmod]) => `  <url><loc>${xmlEscape(loc)}</loc><lastmod>${xmlEscape(lastmod)}</lastmod></url>`)
    .join('\n')
  setHeader(event, 'content-type', 'application/xml; charset=utf-8')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`
})
