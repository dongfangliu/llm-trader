/**
 * 客户端行情数据拉取 — 三层降级架构
 * Tier 1: 浏览器直连东方财富 (用户IP)
 * Tier 2: 经服务端代理 /api/proxy/kline (服务器IP备用)
 * Tier 3: ohlcv_bars 为空 → Worker 走 akshare (原有路径)
 */

export interface OhlcvBar {
  d: string   // 日期 YYYY-MM-DD
  o: number   // 开盘
  h: number   // 最高
  l: number   // 最低
  c: number   // 收盘
  v: number   // 成交量
}

// 模块级 Promise 去重 Map（跨 composable 实例共享）
const _inFlight = new Map<string, Promise<OhlcvBar[]>>()

// 已知 NASDAQ 股票（跳过 NYSE 二次尝试）
const KNOWN_NASDAQ = new Set(['AAPL', 'NVDA', 'TSLA', 'MSFT', 'GOOGL', 'META', 'AMZN', 'GOOG', 'NFLX', 'ADBE'])

/**
 * 根据 symbol 和 market 生成东方财富 secid
 * 返回 null 表示不支持（期货、北交所等），直接走 Tier 3
 */
function buildSecid(symbol: string, market: string): string | null {
  const s = symbol.toUpperCase()
  if (market === 'a') {
    if (s.startsWith('6')) return `1.${s}`
    if (s.startsWith('4') || s.startsWith('8')) return null  // 北交所不支持
    return `0.${s}`
  }
  if (market === 'hk') {
    const padded = s.padStart(5, '0')
    return `116.${padded}`
  }
  if (market === 'us') {
    return `105.${s}`  // NASDAQ 先试，空则 fetchFromEastMoney 内部重试 106
  }
  // 期货等不支持
  return null
}

/** period 字符串 → 东财 klt 参数 */
function periodToKlt(period: string): number {
  const map: Record<string, number> = {
    daily: 101,
    '60': 60,
    '30': 30,
    '15': 15,
    '5': 5,
    '1': 1,
  }
  return map[period] ?? 101
}

/** 计算拉取日期范围，多取 90 天供 MA60 预热 */
function calcDateRange(historyDays: number): { beg: string; end: string } {
  const now = new Date()
  const localYmd = (d: Date) => {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}${m}${day}`
  }
  const endDate = localYmd(now)
  const begDate = new Date(now.getTime() - (historyDays + 90) * 86400 * 1000)
  const beg = localYmd(begDate)
  return { beg, end: endDate }
}

/** 解析东财 klines 字符串数组 → OhlcvBar[] */
function parseKlines(klines: string[]): OhlcvBar[] {
  const bars: OhlcvBar[] = []
  for (const line of klines) {
    const parts = line.split(',')
    // 格式: 日期,开盘,收盘,最高,最低,成交量,...
    if (parts.length < 6) continue
    const o = parseFloat(parts[1])
    const c = parseFloat(parts[2])
    const h = parseFloat(parts[3])
    const l = parseFloat(parts[4])
    const v = parseFloat(parts[5])
    if (isNaN(o) || isNaN(c) || isNaN(h) || isNaN(l)) continue
    bars.push({ d: parts[0], o, h, l, c, v: isNaN(v) ? 0 : v })
  }
  return bars
}

/** 直连东方财富拉 K 线，带 8s 超时。美股自动重试 NYSE (secid 106.XXX) */
async function fetchFromEastMoney(
  secid: string,
  klt: number,
  beg: string,
  end: string,
): Promise<OhlcvBar[]> {
  const BASE = 'https://push2his.eastmoney.com/api/qt/stock/kline/get'
  const params = new URLSearchParams({
    fields1: 'f1,f2,f3,f4,f5,f6',
    fields2: 'f51,f52,f53,f54,f55,f56',
    klt: String(klt),
    fqt: '1',
    secid,
    beg,
    end,
  })

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)

  try {
    const resp = await fetch(`${BASE}?${params}`, { signal: controller.signal })
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    const json = await resp.json()
    const klines: string[] = json?.data?.klines ?? []

    // 美股：若 NASDAQ (105.XXX) 返回空，尝试 NYSE (106.XXX)
    if (klines.length === 0 && secid.startsWith('105.')) {
      const symbol = secid.slice(4)
      if (!KNOWN_NASDAQ.has(symbol)) {
        const nyseSecid = `106.${symbol}`
        const params2 = new URLSearchParams({ ...Object.fromEntries(params), secid: nyseSecid })
        const resp2 = await fetch(`${BASE}?${params2}`, { signal: controller.signal })
        if (resp2.ok) {
          const json2 = await resp2.json()
          return parseKlines(json2?.data?.klines ?? [])
        }
      }
    }

    return parseKlines(klines)
  } finally {
    clearTimeout(timer)
  }
}

/** 经服务端代理拉取 (Tier 2) */
async function fetchViaProxy(
  secid: string,
  klt: number,
  beg: string,
  end: string,
): Promise<OhlcvBar[]> {
  const params = new URLSearchParams({
    secid,
    klt: String(klt),
    beg,
    end,
  })
  const resp = await fetch(`/api/market/proxy/kline?${params}`)
  if (!resp.ok) throw new Error(`proxy HTTP ${resp.status}`)
  const json = await resp.json()
  const klines: string[] = json?.data?.klines ?? []
  return parseKlines(klines)
}

async function _doFetch(
  symbol: string,
  market: string,
  period: string,
  historyDays: number,
): Promise<OhlcvBar[]> {
  const secid = buildSecid(symbol, market)
  if (!secid) return []  // 期货等，直接走 Tier 3

  const klt = periodToKlt(period)
  const { beg, end } = calcDateRange(historyDays)

  // Tier 1: 直连东财
  try {
    const bars = await fetchFromEastMoney(secid, klt, beg, end)
    if (bars.length >= 20) return bars
    console.warn('[行情] 直连返回数据不足，尝试服务端代理')
  } catch (e) {
    console.warn('[行情] 直连失败，尝试服务端代理:', e)
  }

  // Tier 2: 经服务端代理
  try {
    const bars = await fetchViaProxy(secid, klt, beg, end)
    if (bars.length >= 20) return bars
    console.warn('[行情] 代理返回数据不足，降级至服务端拉取')
  } catch (e) {
    console.warn('[行情] 代理也失败，降级至服务端拉取:', e)
  }

  return []  // Tier 3 由 Worker 兜底
}

/**
 * 主导出函数 — 带 Promise 去重，任何错误都返回空数组
 */
export function fetchOhlcv(
  symbol: string,
  market: string,
  period: string,
  historyDays: number = 90,
): Promise<OhlcvBar[]> {
  const key = `${market}:${symbol.toUpperCase()}:${period}:${historyDays}`

  if (_inFlight.has(key)) return _inFlight.get(key)!

  const promise = _doFetch(symbol, market, period, historyDays)
    .catch((e) => {
      console.warn('[行情] fetchOhlcv 未捕获异常，返回空数组:', e)
      return [] as OhlcvBar[]
    })
    .finally(() => _inFlight.delete(key))

  _inFlight.set(key, promise)
  return promise
}
