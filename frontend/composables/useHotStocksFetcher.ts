/**
 * Admin 浏览器直连东方财富热门榜，避免服务器 IP 被限流。
 * 与 akshare.stock_hot_rank_em / stock_hk_hot_rank_em 行为对齐：
 *   1. POST emappdata.eastmoney.com/stockrank/getAllCurr* 拿排行
 *   2. GET push2.eastmoney.com/api/qt/ulist.np/get 富集最新价
 * 任一步失败返回 null，由调用方决定回退到服务器路径。
 */

export interface HotStock {
  symbol: string
  name?: string
  hot_rank: number
  latest_price?: number
}

const RANK_PAYLOAD = {
  appId: 'appId01',
  globalId: '786e4c21-70dc-435a-93bb-38',
}
const A_RANK_URL = 'https://emappdata.eastmoney.com/stockrank/getAllCurrentList'
const HK_RANK_URL = 'https://emappdata.eastmoney.com/stockrank/getAllCurrHkUsList'
const ULIST_URL = 'https://push2.eastmoney.com/api/qt/ulist.np/get'

interface RankRow { sc: string; rk: number }

async function fetchRank(url: string, marketType: string, pageSize: number, signal: AbortSignal): Promise<RankRow[]> {
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...RANK_PAYLOAD, marketType, pageNo: 1, pageSize }),
    signal,
  })
  if (!resp.ok) throw new Error(`rank HTTP ${resp.status}`)
  const json = await resp.json()
  return (json?.data ?? []) as RankRow[]
}

interface UlistRow { f2?: number; f12?: string; f14?: string }

async function fetchUlist(secids: string[], signal: AbortSignal): Promise<UlistRow[]> {
  const params = new URLSearchParams({
    ut: 'f057cbcbce2a86e2866ab8877db1d059',
    fltt: '2',
    invt: '2',
    fields: 'f2,f12,f14',
    secids: `${secids.join(',')},?v=08926209912590994`,
  })
  const resp = await fetch(`${ULIST_URL}?${params}`, { signal })
  if (!resp.ok) throw new Error(`ulist HTTP ${resp.status}`)
  const json = await resp.json()
  return (json?.data?.diff ?? []) as UlistRow[]
}

function withTimeout(ms: number): { signal: AbortSignal; cancel: () => void } {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  return { signal: controller.signal, cancel: () => clearTimeout(timer) }
}

function buildAMark(sc: string): string | null {
  // sc 形如 SH601991 / SZ002081
  if (sc.startsWith('SH')) return `1.${sc.slice(2)}`
  if (sc.startsWith('SZ')) return `0.${sc.slice(2)}`
  return null
}

function buildHkMark(sc: string): string | null {
  // sc 形如 HK|00700
  const parts = sc.split('|')
  if (parts.length < 2) return null
  return `116.${parts[1]}`
}

async function fetchHotInternal(
  market: 'a' | 'hk',
  count: number,
): Promise<HotStock[] | null> {
  const { signal, cancel } = withTimeout(8000)
  try {
    const rankRows = market === 'a'
      ? await fetchRank(A_RANK_URL, '', Math.max(count * 2, 30), signal)
      : await fetchRank(HK_RANK_URL, '000003', Math.max(count * 2, 30), signal)

    if (!rankRows.length) return null

    // 按 rk 升序，构造 mark 与 symbol
    const ordered = rankRows
      .slice()
      .sort((a, b) => a.rk - b.rk)
      .map((row) => {
        const mark = market === 'a' ? buildAMark(row.sc) : buildHkMark(row.sc)
        if (!mark) return null
        const symbol = market === 'a' ? row.sc.slice(2) : row.sc.split('|')[1]
        return { rk: row.rk, mark, symbol }
      })
      .filter((x): x is { rk: number; mark: string; symbol: string } => !!x)

    if (!ordered.length) return null

    // 富集名称与最新价；失败时退化为只有 symbol+rank
    let priceMap = new Map<string, { name?: string; price?: number }>()
    try {
      const ulist = await fetchUlist(ordered.map((o) => o.mark), signal)
      for (const row of ulist) {
        if (!row.f12) continue
        const key = String(row.f12).trim()
        priceMap.set(key, {
          name: row.f14 ? String(row.f14).trim() : undefined,
          price: typeof row.f2 === 'number' ? row.f2 : undefined,
        })
      }
    } catch (e) {
      console.warn('[热门榜] ulist 富集失败，仅返回排行:', e)
    }

    const out: HotStock[] = []
    for (const item of ordered) {
      const enrich = priceMap.get(item.symbol)
      out.push({
        symbol: item.symbol,
        name: enrich?.name,
        hot_rank: item.rk,
        latest_price: enrich?.price,
      })
    }
    return out
  } catch (e) {
    console.warn(`[热门榜] ${market} 直连失败:`, e)
    return null
  } finally {
    cancel()
  }
}

export function fetchHotA(count: number = 10): Promise<HotStock[] | null> {
  return fetchHotInternal('a', count)
}

export function fetchHotHk(count: number = 10): Promise<HotStock[] | null> {
  return fetchHotInternal('hk', count)
}
