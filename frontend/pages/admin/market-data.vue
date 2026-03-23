<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, computed } from 'vue'
import api from '~/lib/api'
import { clearCache } from '~/composables/useSymbolCache'

function getAdminHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('admin_token') : ''
  return { 'X-Admin-Token': token || '' }
}

// ── State ──────────────────────────────────────────────────────────────────────
const isCollecting = ref(false)
const symbols = ref<any[]>([])
const symbolNames = ref<any[]>([])
const marketTotals = ref<Record<string, number>>({})
const statusLoading = ref(false)
const refreshingKey = ref<string | null>(null)
const namesMarketFilter = ref('a')
const namesSearch = ref('')
const namesLoading = ref(false)
const refreshingNames = ref(false)
const refreshingAllNames = ref(false)
const msg = ref('')
const msgType = ref<'success' | 'error'>('success')
let pollTimer: any = null

// ── Labels ─────────────────────────────────────────────────────────────────────
const marketLabels: Record<string, string> = { a: 'A股', hk: '港股', us: '美股', futures: '期货' }
const periodLabels: Record<string, string> = { daily: '日线', '60': '60分', '30': '30分', '15': '15分' }
const marketTabs = ['a', 'hk', 'us', 'futures']

// ── Flash message ──────────────────────────────────────────────────────────────
function showMsg(text: string, type: 'success' | 'error' = 'success') {
  msg.value = text
  msgType.value = type
  setTimeout(() => { msg.value = '' }, 3000)
}

// ── Status logic ───────────────────────────────────────────────────────────────
async function loadStatus() {
  statusLoading.value = true
  try {
    const res = await api.get('/api/admin/market-data/status', { headers: getAdminHeaders() })
    isCollecting.value = res.data.is_collecting ?? false
    symbols.value = res.data.symbols || []
  } catch (e: any) {
    const detail = e.response?.data?.detail || '加载状态失败'
    showMsg(`❌ ${detail}`, 'error')
  } finally {
    statusLoading.value = false
  }
}

async function triggerFullRefresh() {
  try {
    await api.post('/api/admin/market-data/refresh', {}, { headers: getAdminHeaders() })
    showMsg('✅ 已触发全量采集', 'success')
    await loadStatus()
  } catch (e: any) {
    const detail = e.response?.data?.detail || '触发失败'
    showMsg(`❌ ${detail}`, 'error')
  }
}

async function refreshSymbol(row: any) {
  const key = `${row.symbol}|${row.market}|${row.period}`
  refreshingKey.value = key
  try {
    await api.post('/api/admin/market-data/refresh-symbol', {
      symbol: row.symbol,
      market: row.market,
      period: row.period,
    }, { headers: getAdminHeaders() })
    showMsg(`✅ ${row.symbol} 刷新已触发`, 'success')
    await loadStatus()
  } catch (e: any) {
    const detail = e.response?.data?.detail || '刷新失败'
    showMsg(`❌ ${detail}`, 'error')
  } finally {
    refreshingKey.value = null
  }
}

// ── Staleness logic ────────────────────────────────────────────────────────────
type RowStatus = 'empty' | 'stale' | 'ok'

// Trading sessions in minutes-since-midnight (local CST time, UTC+8)
const MARKET_SESSIONS: Record<string, [number, number][]> = {
  a:       [[9*60+30, 11*60+30], [13*60, 15*60]],
  hk:      [[9*60+30, 12*60],    [13*60, 16*60]],
  futures: [[9*60,    11*60+30], [13*60, 15*60], [21*60, 23*60]],
}

// Returns the end timestamp (ms) of the last complete minute bar that should exist now.
// Accounts for market sessions (no false stale during lunch break or after close).
function getExpectedLatestMinuteBarEnd(now: Date, market: string, periodMins: number): number {
  const sessions = MARKET_SESSIONS[market]
  if (!sessions) return now.getTime()

  const todayMins = now.getHours() * 60 + now.getMinutes()
  let effectiveMins: number | null = null

  for (const [open, close] of sessions) {
    if (todayMins >= close) {
      effectiveMins = close
    } else if (todayMins >= open) {
      effectiveMins = open + Math.floor((todayMins - open) / periodMins) * periodMins
      break
    }
  }

  if (effectiveMins !== null) {
    const result = new Date(now)
    result.setHours(Math.floor(effectiveMins / 60), effectiveMins % 60, 0, 0)
    return result.getTime()
  }

  // Before first session: last bar was previous trading day's last session close
  const lastClose = sessions[sessions.length - 1][1]
  const prev = new Date(now)
  prev.setDate(prev.getDate() - 1)
  while (prev.getDay() === 0 || prev.getDay() === 6) prev.setDate(prev.getDate() - 1)
  prev.setHours(Math.floor(lastClose / 60), lastClose % 60, 0, 0)
  return prev.getTime()
}

// Returns the close timestamp (ms) of the most recent trading day.
// Used for daily bar staleness: stale if last bar predates this by >1 day.
function getLastTradingDayCloseMs(now: Date, market: string): number {
  const sessions = MARKET_SESSIONS[market]
  const closeMinutes = sessions ? sessions[sessions.length - 1][1] : 15 * 60
  const closeH = Math.floor(closeMinutes / 60)
  const closeM = closeMinutes % 60

  const todayClose = new Date(now)
  todayClose.setHours(closeH, closeM, 0, 0)

  const candidate = new Date(now >= todayClose ? now : now)
  candidate.setHours(closeH, closeM, 0, 0)
  if (now < todayClose) candidate.setDate(candidate.getDate() - 1)

  while (candidate.getDay() === 0 || candidate.getDay() === 6) {
    candidate.setDate(candidate.getDate() - 1)
  }
  return candidate.getTime()
}

function getRowStatus(row: any): RowStatus {
  if (!row.last_bar_date) return 'empty'
  const lastMs = new Date(row.last_bar_date).getTime()
  const now = new Date()

  if (row.period === 'daily') {
    if (row.market === 'us') {
      return (Date.now() - lastMs) > 24 * 3600 * 1000 ? 'stale' : 'ok'
    }
    const expectedMs = getLastTradingDayCloseMs(now, row.market)
    return lastMs < expectedMs ? 'stale' : 'ok'
  }

  const periodMins = parseInt(row.period, 10)
  if (!isNaN(periodMins)) {
    if (row.market === 'us') {
      return (Date.now() - lastMs) > periodMins * 60 * 1000 ? 'stale' : 'ok'
    }
    const expectedMs = getExpectedLatestMinuteBarEnd(now, row.market, periodMins)
    return lastMs < expectedMs ? 'stale' : 'ok'
  }

  return 'ok'
}

const statusStyles: Record<RowStatus, { bg: string; color: string; label: string }> = {
  empty: { bg: '#fee2e2', color: '#991b1b', label: '无数据' },
  stale: { bg: '#fef3c7', color: '#92400e', label: '数据陈旧' },
  ok:    { bg: '#dcfce7', color: '#166534', label: '正常' },
}

// ── Symbol names ───────────────────────────────────────────────────────────────
async function loadSymbolNames() {
  namesLoading.value = true
  try {
    const res = await api.get('/api/admin/symbol-names', {
      headers: getAdminHeaders(),
      params: {
        market: namesMarketFilter.value || undefined,
        search: namesSearch.value || undefined,
      },
    })
    symbolNames.value = res.data.items || []
    marketTotals.value = res.data.market_totals || {}
  } catch (e: any) {
    const detail = e.response?.data?.detail || '加载名称失败'
    showMsg(`❌ ${detail}`, 'error')
  } finally {
    namesLoading.value = false
  }
}

async function refreshNames() {
  refreshingNames.value = true
  try {
    const res = await api.post(`/api/admin/refresh-names`, {}, {
      headers: getAdminHeaders(),
      params: { market: namesMarketFilter.value },
    })
    const counts = res.data?.counts || {}
    const n = counts[namesMarketFilter.value] ?? '?'
    showMsg(`✅ ${marketLabels[namesMarketFilter.value]} 刷新完成，共 ${n} 条`, 'success')
    clearCache(namesMarketFilter.value)
    await loadSymbolNames()
  } catch (e: any) {
    const detail = e.response?.data?.detail || '刷新名称失败'
    showMsg(`❌ ${detail}`, 'error')
  } finally {
    refreshingNames.value = false
  }
}

async function refreshAllNames() {
  refreshingAllNames.value = true
  try {
    const res = await api.post(`/api/admin/refresh-names`, {}, { headers: getAdminHeaders() })
    const counts = res.data?.counts || {}
    const summary = Object.entries(counts).map(([m, n]) => `${marketLabels[m] ?? m}:${n}`).join(' ')
    showMsg(`✅ 全部刷新完成 ${summary}`, 'success')
    clearCache()
    await loadSymbolNames()
  } catch (e: any) {
    const detail = e.response?.data?.detail || '刷新失败'
    showMsg(`❌ ${detail}`, 'error')
  } finally {
    refreshingAllNames.value = false
  }
}

function formatDate(dt: string | null | undefined) {
  if (!dt) return '—'
  try {
    return new Date(dt).toLocaleString('zh-CN', { hour12: false })
  } catch {
    return dt
  }
}

// ── Polling ────────────────────────────────────────────────────────────────────
watch(isCollecting, (val) => {
  if (val) {
    pollTimer = setInterval(loadStatus, 8000)
  } else {
    clearInterval(pollTimer)
  }
})

onMounted(() => {
  loadStatus()
  loadSymbolNames()
})

onUnmounted(() => {
  clearInterval(pollTimer)
})

// ── Watch filter/search for names ──────────────────────────────────────────────
watch([namesMarketFilter, namesSearch], () => {
  loadSymbolNames()
})
</script>

<template>
  <div style="position:fixed;inset:0;background:#f2f2f7;display:flex;flex-direction:column;overflow-y:auto;">

    <!-- Flash message -->
    <Transition name="flash">
      <div
        v-if="msg"
        style="position:fixed;top:16px;right:16px;z-index:9999;padding:10px 18px;border-radius:10px;font-size:14px;font-weight:600;color:#fff;box-shadow:0 4px 16px rgba(0,0,0,0.18);"
        :style="{ background: msgType === 'success' ? '#34c759' : '#ff3b30' }"
      >
        {{ msg }}
      </div>
    </Transition>

    <!-- Header -->
    <div style="display:flex;align-items:center;padding:48px 16px 16px;">
      <NuxtLink to="/admin" style="color:#007aff;text-decoration:none;font-size:15px;">← 返回</NuxtLink>
      <h1 style="flex:1;text-align:center;font-size:17px;font-weight:600;color:#1c1c1e;margin-right:40px;">行情数据管理</h1>
    </div>

    <div style="padding:0 16px 40px;max-width:900px;margin:0 auto;width:100%;box-sizing:border-box;display:flex;flex-direction:column;gap:16px;">

      <!-- ── Status banner ─────────────────────────────────────────────────────── -->
      <div style="background:#fff;border-radius:16px;padding:20px 24px;">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
          <!-- Collecting indicator -->
          <div style="display:flex;align-items:center;gap:10px;">
            <template v-if="statusLoading">
              <div style="width:20px;height:20px;border:2px solid #007aff;border-top-color:transparent;border-radius:50%;animation:spin 0.8s linear infinite;flex-shrink:0;" />
              <span style="font-size:15px;color:#6e6e73;">加载中...</span>
            </template>
            <template v-else-if="isCollecting">
              <div style="width:20px;height:20px;border:2px solid #007aff;border-top-color:transparent;border-radius:50%;animation:spin 0.8s linear infinite;flex-shrink:0;" />
              <span style="font-size:15px;font-weight:600;color:#007aff;">采集中...</span>
            </template>
            <template v-else>
              <div style="width:10px;height:10px;border-radius:50%;background:#34c759;flex-shrink:0;" />
              <span style="font-size:15px;font-weight:600;color:#1c1c1e;">空闲</span>
            </template>
          </div>

          <!-- Action buttons -->
          <div style="display:flex;gap:8px;">
            <button
              @click="triggerFullRefresh"
              :disabled="isCollecting"
              style="padding:9px 16px;background:#007aff;color:#fff;border:none;border-radius:9px;font-size:13px;font-weight:600;cursor:pointer;transition:opacity 0.15s;"
              :style="{ opacity: isCollecting ? 0.5 : 1 }"
            >
              触发全量采集
            </button>
            <button
              @click="loadStatus"
              style="padding:9px 16px;background:#f2f2f7;color:#3c3c43;border:none;border-radius:9px;font-size:13px;font-weight:600;cursor:pointer;"
            >
              刷新状态
            </button>
          </div>
        </div>
      </div>

      <!-- ── Data coverage table ────────────────────────────────────────────────── -->
      <div style="background:#fff;border-radius:16px;padding:20px 24px;">
        <h2 style="font-size:15px;font-weight:700;color:#1c1c1e;margin:0 0 16px;">数据覆盖情况</h2>

        <div v-if="symbols.length === 0 && !statusLoading" style="text-align:center;padding:32px 0;color:#8e8e93;font-size:14px;">
          暂无数据
        </div>

        <div v-else style="overflow-x:auto;-webkit-overflow-scrolling:touch;">
          <table style="width:100%;border-collapse:collapse;font-size:13px;min-width:580px;">
            <thead>
              <tr style="border-bottom:1px solid rgba(0,0,0,0.08);">
                <th style="text-align:left;padding:8px 10px;font-size:12px;font-weight:600;color:#8e8e93;white-space:nowrap;">代码 / 名称</th>
                <th style="text-align:left;padding:8px 10px;font-size:12px;font-weight:600;color:#8e8e93;white-space:nowrap;">市场</th>
                <th style="text-align:left;padding:8px 10px;font-size:12px;font-weight:600;color:#8e8e93;white-space:nowrap;">周期</th>
                <th style="text-align:right;padding:8px 10px;font-size:12px;font-weight:600;color:#8e8e93;white-space:nowrap;">K线数</th>
                <th style="text-align:left;padding:8px 10px;font-size:12px;font-weight:600;color:#8e8e93;white-space:nowrap;">最新日期</th>
                <th style="text-align:left;padding:8px 10px;font-size:12px;font-weight:600;color:#8e8e93;white-space:nowrap;">状态</th>
                <th style="text-align:left;padding:8px 10px;font-size:12px;font-weight:600;color:#8e8e93;white-space:nowrap;">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in symbols"
                :key="`${row.symbol}|${row.market}|${row.period}`"
                style="border-bottom:1px solid rgba(0,0,0,0.04);"
              >
                <td style="padding:10px 10px;white-space:nowrap;">
                  <span style="font-weight:600;color:#1c1c1e;">{{ row.symbol }}</span>
                  <span v-if="row.name" style="color:#8e8e93;margin-left:4px;">{{ row.name }}</span>
                </td>
                <td style="padding:10px 10px;color:#3c3c43;white-space:nowrap;">
                  {{ marketLabels[row.market] || row.market }}
                </td>
                <td style="padding:10px 10px;color:#3c3c43;white-space:nowrap;">
                  {{ periodLabels[row.period] || row.period }}
                </td>
                <td style="padding:10px 10px;text-align:right;color:#3c3c43;white-space:nowrap;">
                  {{ row.bar_count ?? '—' }}
                </td>
                <td style="padding:10px 10px;color:#3c3c43;white-space:nowrap;font-size:12px;">
                  {{ formatDate(row.last_bar_date) }}
                </td>
                <td style="padding:10px 10px;white-space:nowrap;">
                  <span
                    :style="{
                      display:'inline-block',
                      padding:'2px 8px',
                      borderRadius:'6px',
                      fontSize:'12px',
                      fontWeight:'600',
                      background: statusStyles[getRowStatus(row)].bg,
                      color: statusStyles[getRowStatus(row)].color,
                    }"
                  >
                    {{ statusStyles[getRowStatus(row)].label }}
                  </span>
                </td>
                <td style="padding:10px 10px;white-space:nowrap;">
                  <button
                    @click="refreshSymbol(row)"
                    :disabled="refreshingKey === `${row.symbol}|${row.market}|${row.period}`"
                    style="padding:5px 12px;background:#f2f2f7;color:#007aff;border:none;border-radius:7px;font-size:12px;font-weight:600;cursor:pointer;transition:opacity 0.15s;"
                    :style="{ opacity: refreshingKey === `${row.symbol}|${row.market}|${row.period}` ? 0.5 : 1 }"
                  >
                    {{ refreshingKey === `${row.symbol}|${row.market}|${row.period}` ? '...' : '刷新' }}
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- ── Symbol names management ────────────────────────────────────────────── -->
      <div style="background:#fff;border-radius:16px;padding:20px 24px;">
        <h2 style="font-size:15px;font-weight:700;color:#1c1c1e;margin:0 0 16px;">Symbol 名称管理</h2>

        <!-- Market filter tabs + global refresh -->
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:12px;">
          <div style="display:flex;gap:4px;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none;">
            <button
              v-for="mkt in marketTabs"
              :key="mkt"
              @click="namesMarketFilter = mkt"
              :style="{
                flex:'none',
                padding:'7px 14px',
                borderRadius:'8px',
                border:'none',
                cursor:'pointer',
                fontSize:'13px',
                fontWeight:'600',
                transition:'background 0.15s,color 0.15s',
                background: namesMarketFilter === mkt ? '#007aff' : '#f2f2f7',
                color: namesMarketFilter === mkt ? '#fff' : '#3c3c43',
              }"
            >
              {{ marketLabels[mkt] }}
              <span v-if="marketTotals[mkt]" :style="{ fontSize:'11px', opacity:0.8, marginLeft:'4px' }">{{ marketTotals[mkt].toLocaleString() }}</span>
            </button>
          </div>
          <button
            @click="refreshAllNames"
            :disabled="refreshingAllNames || refreshingNames"
            style="flex:none;padding:7px 14px;background:#5856d6;color:#fff;border:none;border-radius:9px;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap;transition:opacity 0.15s;"
            :style="{ opacity: refreshingAllNames ? 0.6 : 1 }"
          >
            {{ refreshingAllNames ? '全部刷新中...' : '全部刷新' }}
          </button>
        </div>

        <!-- Search + per-market refresh -->
        <div style="display:flex;gap:10px;margin-bottom:16px;align-items:center;">
          <input
            v-model="namesSearch"
            type="text"
            placeholder="搜索代码或名称..."
            style="flex:1;padding:9px 12px;border-radius:8px;border:1px solid rgba(0,0,0,0.12);font-size:14px;outline:none;box-sizing:border-box;"
          />
          <button
            @click="refreshNames"
            :disabled="refreshingNames || refreshingAllNames"
            style="flex:none;padding:9px 16px;background:#34c759;color:#fff;border:none;border-radius:9px;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap;transition:opacity 0.15s;"
            :style="{ opacity: refreshingNames ? 0.6 : 1 }"
          >
            {{ refreshingNames ? '刷新中...' : `刷新 ${marketLabels[namesMarketFilter]}` }}
          </button>
        </div>

        <!-- Names table -->
        <div v-if="namesLoading" style="display:flex;justify-content:center;padding:32px 0;">
          <div style="width:24px;height:24px;border:2px solid #007aff;border-top-color:transparent;border-radius:50%;animation:spin 0.8s linear infinite;" />
        </div>

        <div v-else-if="symbolNames.length === 0" style="text-align:center;padding:32px 0;color:#8e8e93;font-size:14px;">
          暂无数据
        </div>

        <div v-else style="overflow-x:auto;-webkit-overflow-scrolling:touch;">
          <table style="width:100%;border-collapse:collapse;font-size:13px;">
            <thead>
              <tr style="border-bottom:1px solid rgba(0,0,0,0.08);">
                <th style="text-align:left;padding:8px 10px;font-size:12px;font-weight:600;color:#8e8e93;white-space:nowrap;">代码</th>
                <th style="text-align:left;padding:8px 10px;font-size:12px;font-weight:600;color:#8e8e93;white-space:nowrap;">市场</th>
                <th style="text-align:left;padding:8px 10px;font-size:12px;font-weight:600;color:#8e8e93;white-space:nowrap;">名称</th>
                <th style="text-align:left;padding:8px 10px;font-size:12px;font-weight:600;color:#8e8e93;white-space:nowrap;">更新时间</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="item in symbolNames"
                :key="`${item.symbol}|${item.market}`"
                style="border-bottom:1px solid rgba(0,0,0,0.04);"
              >
                <td style="padding:9px 10px;font-weight:600;color:#1c1c1e;white-space:nowrap;">{{ item.symbol }}</td>
                <td style="padding:9px 10px;color:#3c3c43;white-space:nowrap;">{{ marketLabels[item.market] || item.market }}</td>
                <td style="padding:9px 10px;color:#3c3c43;">{{ item.name || '—' }}</td>
                <td style="padding:9px 10px;color:#8e8e93;font-size:12px;white-space:nowrap;">{{ formatDate(item.updated_at) }}</td>
              </tr>
            </tbody>
          </table>
        </div>

      </div>
    </div>
  </div>
</template>

<style scoped>
@keyframes spin {
  to { transform: rotate(360deg); }
}
.flash-enter-active, .flash-leave-active { transition: opacity 0.3s, transform 0.3s; }
.flash-enter-from, .flash-leave-to { opacity: 0; transform: translateY(-8px); }
input:focus { border-color: #007aff !important; box-shadow: 0 0 0 3px rgba(0,122,255,0.15); }
</style>
