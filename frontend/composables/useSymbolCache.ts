/**
 * Client-side symbol cache with localStorage persistence (24h TTL per market).
 * Fetches all symbols once, caches locally, and provides client-side fuzzy search
 * with ranked results — eliminates per-keystroke API calls.
 */
import api from '~/lib/api'

const CACHE_TTL = 24 * 60 * 60 * 1000 // 24 hours

export interface SymbolEntry {
  symbol: string
  market: string
  name: string
}

interface StoredCache {
  ts: number
  items: SymbolEntry[]
}

// Singleton in-memory store
const _memory: Record<string, SymbolEntry[]> = {}
const _loading: Record<string, Promise<void>> = {}

function storageKey(m: string) {
  return `symbol_cache_v1_${m}`
}

function readStorage(m: string): SymbolEntry[] | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(storageKey(m))
    if (!raw) return null
    const d: StoredCache = JSON.parse(raw)
    if (Date.now() - d.ts > CACHE_TTL) return null
    return d.items
  } catch {
    return null
  }
}

function writeStorage(m: string, items: SymbolEntry[]) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(storageKey(m), JSON.stringify({ ts: Date.now(), items }))
  } catch {}
}

async function _fetchMarket(m: string): Promise<void> {
  const stored = readStorage(m)
  if (stored) {
    _memory[m] = stored
    return
  }
  try {
    const res = await api.get('/api/market', { params: { market: m } })
    const items: SymbolEntry[] = res.data?.items || []
    _memory[m] = items
    writeStorage(m, items)
  } catch {
    _memory[m] = []
  }
}

/** Preload symbols for a single market. No-op for 'us'. */
export async function preloadMarket(m: string): Promise<void> {
  if (m === 'us') return
  if (_memory[m]?.length) return
  if (!_loading[m]) {
    ;(_loading as any)[m] = _fetchMarket(m)
  }
  await _loading[m]
}

/** Preload A股, 港股, and 期货 in parallel. */
export function preloadAll(): Promise<void[]> {
  return Promise.all(['a', 'hk', 'futures'].map(preloadMarket))
}

/**
 * Invalidate cache for a market (or all markets).
 * Call this from the admin panel after a name refresh so the frontend
 * re-fetches on next use.
 */
export function clearCache(m?: string) {
  const markets = m ? [m] : ['a', 'hk', 'futures']
  for (const market of markets) {
    delete _memory[market]
    delete (_loading as any)[market]
    if (typeof window !== 'undefined') {
      try { localStorage.removeItem(storageKey(market)) } catch {}
    }
  }
}

/**
 * Client-side fuzzy search with 5-tier ranking:
 *   0 = exact match
 *   1 = code prefix
 *   2 = name prefix
 *   3 = code contains
 *   4 = name contains
 */
export function searchSymbols(q: string, market: string, limit = 8): SymbolEntry[] {
  if (!q || market === 'us') return []
  const items = _memory[market] || []
  const qU = q.toUpperCase()

  type Ranked = { item: SymbolEntry; r: number }
  const out: Ranked[] = []

  for (const item of items) {
    const s = item.symbol.toUpperCase()
    const n = (item.name || '').toUpperCase()
    if (s === qU || n === qU) out.push({ item, r: 0 })
    else if (s.startsWith(qU)) out.push({ item, r: 1 })
    else if (n.startsWith(qU)) out.push({ item, r: 2 })
    else if (s.includes(qU)) out.push({ item, r: 3 })
    else if (n.includes(qU)) out.push({ item, r: 4 })
  }

  out.sort((a, b) => a.r - b.r || a.item.symbol.localeCompare(b.item.symbol))
  return out.slice(0, limit).map(x => x.item)
}

/** Look up a stock name from the in-memory cache. Returns '' if not found. */
export function getSymbolName(symbol: string, market: string): string {
  if (market === 'us') return ''
  const items = _memory[market] || []
  return items.find(i => i.symbol.toUpperCase() === symbol.toUpperCase())?.name || ''
}
