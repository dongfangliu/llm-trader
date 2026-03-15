export interface SymbolEntry {
  symbol: string;
  market: string;
  name: string;
}

const CACHE_KEY = 'symbol_cache_v1';
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface CacheData {
  items: SymbolEntry[];
  timestamp: number;
}

let _memCache: SymbolEntry[] | null = null;

export async function loadSymbolCache(): Promise<SymbolEntry[]> {
  if (_memCache) return _memCache;

  // Try localStorage
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      const data: CacheData = JSON.parse(raw);
      if (Date.now() - data.timestamp < TTL_MS) {
        _memCache = data.items;
        return _memCache;
      }
    }
  } catch {}

  // Fetch from API (3 markets in parallel)
  try {
    const [aRes, hkRes, futRes] = await Promise.all([
      fetch('/api/symbols?market=a'),
      fetch('/api/symbols?market=hk'),
      fetch('/api/symbols?market=futures'),
    ]);
    const [aData, hkData, futData] = await Promise.all([
      aRes.ok ? aRes.json() : { items: [] },
      hkRes.ok ? hkRes.json() : { items: [] },
      futRes.ok ? futRes.json() : { items: [] },
    ]);
    const items: SymbolEntry[] = [
      ...(aData.items || []),
      ...(hkData.items || []),
      ...(futData.items || []),
    ];
    const cacheData: CacheData = { items, timestamp: Date.now() };
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
    } catch {}
    _memCache = items;
    return items;
  } catch {
    return [];
  }
}

export function getSymbolEntry(symbol: string, market: string): SymbolEntry | undefined {
  if (!_memCache) return undefined;
  return _memCache.find(e => e.symbol === symbol && e.market === market);
}

export function searchSymbols(query: string, market: string, limit = 8): SymbolEntry[] {
  if (!_memCache || !query.trim()) return [];
  const q = query.trim().toLowerCase();
  type R = { entry: SymbolEntry; rank: number };
  const ranked: R[] = [];
  for (const e of _memCache) {
    if (e.market !== market) continue;
    const sym = e.symbol.toLowerCase();
    const name = e.name.toLowerCase();
    let rank = -1;
    if (sym === q)               rank = 0; // 完全匹配代码
    else if (sym.startsWith(q))  rank = 1; // 代码前缀
    else if (name.startsWith(q)) rank = 2; // 名称前缀
    else if (sym.includes(q))    rank = 3; // 代码包含
    else if (name.includes(q))   rank = 4; // 名称包含
    if (rank >= 0) ranked.push({ entry: e, rank });
  }
  ranked.sort((a, b) => a.rank - b.rank);
  return ranked.slice(0, limit).map(r => r.entry);
}
