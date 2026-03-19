<script setup lang="ts">
import { ref, computed, onMounted, watch, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import api from '~/lib/api'
import { useAnalysis } from '~/composables/useAnalysis'
import { useQuota } from '~/composables/useQuota'
import { useTrial } from '~/composables/useTrial'
import { useSavedRecords } from '~/composables/useSavedRecords'
import { useAuthStore } from '~/stores/auth'
import { useAnalysisStore } from '~/stores/analysis'
import { useDevice } from '~/composables/useDevice'

const router = useRouter()
const auth = useAuthStore()
const analysisStore = useAnalysisStore()
const { getDeviceId } = useDevice()

const {
  isAnalyzing, taskId, result, error, errorCode, progress, statusMessage, isFirstTrial,
  submitAnalysis, clearState
} = useAnalysis()

const {
  remaining, dailyLimit, totalAvailable, tier, trialState, fetchQuota
} = useQuota()

const {
  showGuestTrialEndedScreen, showProTrialWelcomeModal,
  handleGuestTrialExpired, handleProTrialConsumed,
  dismissGuestTrialScreen, dismissProTrialModal
} = useTrial()

const { saveRecord, loadSaved, isSaved } = useSavedRecords()

// ── Panel state ──
const activePanel = ref<'analyze' | 'loading' | 'result'>('analyze')
const resultSheetOpen = ref(false)
const selectedHistoryId = ref<string | null>(null)
const sheetResult = ref<any>(null)

// ── Form state ──
const symbol = ref('')
const market = ref('a')
const period = ref('daily')
const holdingQuantity = ref('')
const costPrice = ref('')
const maxPosition = ref('')
const advancedOpen = ref(false)
const symbolWarning = ref<string | null>(null)
const symbolInput = ref<HTMLInputElement | null>(null)

// ── Autocomplete ──
const suggestions = ref<Array<{ symbol: string; name: string; market: string }>>([])
const showSuggestions = ref(false)
let suggestTimer: any = null

// ── Hot stocks ──
const hotStocks = ref<Array<{ code: string; name: string; market: string }>>([])

// ── History ──
const history = ref<Array<{
  id: string; symbol: string; name: string; market: string;
  action?: string; confidence?: number; analyzedAt?: string;
  detail?: any; positionParams?: any
}>>([])

// ── Loading narrative ──
const NARRATIVE_TEXTS = [
  '正在读取历史 K 线数据…',
  '分析技术形态与趋势…',
  '评估主力资金动向…',
  'AI 正在生成研判建议…',
  '整合多维度信号…',
]
const narrativeIdx = ref(0)
const analyzingSymbol = ref('')
let narrativeTimer: any = null
let analyzeTimedOut = ref(false)
let analyzeTimeoutTimer: any = null

// ── App config ──
const appName = ref('AI 选股')
const pricing = ref<any>(null)
const appConfig = ref<any>(null)

// ── Unread ──
const unreadResults = ref(0)

// ── User menu ──
const userMenuOpen = ref(false)

// ── Quota exhausted banner ──
const showUpgradeBanner = computed(() => {
  if (!remaining.value && remaining.value !== null) return true
  return remaining.value !== null && remaining.value <= 0
})

// ── Tier display ──
const tierLabel = computed(() => {
  if (tier.value === 'premium') return '专业版'
  if (tier.value === 'basic') return '标准版'
  return '免费版'
})

const MARKET_LABELS: Record<string, string> = { a: 'A股', hk: '港股', us: '美股', futures: '期货' }
const PERIOD_OPTIONS = [
  { value: 'daily', label: '日线' },
  { value: '60', label: '60分' },
  { value: '30', label: '30分' },
  { value: '15', label: '15分' },
]

function getActionDisplay(action: string | undefined) {
  if (!action) return { text: '观望', color: '#f59e0b' }
  const a = action.toLowerCase()
  if (a === 'buy' || a === '买入') return { text: '买入', color: '#ef4444' }
  if (a === 'sell' || a === '卖出') return { text: '卖出', color: '#22c55e' }
  return { text: '观望', color: '#f59e0b' }
}

function getTimeGroupLabel(isoString: string): string {
  const d = new Date(isoString)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 86400000)
  const weekAgo = new Date(today.getTime() - 6 * 86400000)
  const itemDay = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  if (itemDay.getTime() === today.getTime()) return '今日'
  if (itemDay.getTime() === yesterday.getTime()) return '昨日'
  if (itemDay >= weekAgo) return '本周'
  return `${d.getMonth() + 1}月`
}

function formatCardTime(isoString: string): string {
  const d = new Date(isoString)
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  if (isToday) {
    const h = d.getHours().toString().padStart(2, '0')
    const m = d.getMinutes().toString().padStart(2, '0')
    return `今天 ${h}:${m}`
  }
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

// ── Group history ──
const groupedHistory = computed(() => {
  const groups: { label: string; items: typeof history.value }[] = []
  let currentLabel = ''
  history.value.forEach((item) => {
    const label = item.analyzedAt ? getTimeGroupLabel(item.analyzedAt) : '更早'
    if (label !== currentLabel) {
      groups.push({ label, items: [] })
      currentLabel = label
    }
    groups[groups.length - 1].items.push(item)
  })
  return groups
})

async function loadAppConfig() {
  try {
    const res = await api.get('/api/config')
    appConfig.value = res.data
    if (res.data?.app_name) appName.value = res.data.app_name
  } catch {}
}

async function loadPricing() {
  try {
    const res = await api.get('/api/pricing')
    pricing.value = res.data
  } catch {}
}

async function loadHotStocks() {
  try {
    const res = await api.get('/api/market/hot')
    hotStocks.value = res.data?.slice?.(0, 8) || []
  } catch {}
}

async function loadHistory() {
  if (!auth.isLoggedIn) return
  try {
    const res = await api.get('/api/history')
    history.value = res.data || []
  } catch {}
}

onMounted(async () => {
  await Promise.all([fetchQuota(), loadHistory(), loadSaved(), loadHotStocks(), loadAppConfig(), loadPricing()])
})

// ── Watch analysis result ──
watch(result, (newResult) => {
  if (newResult) {
    const histItem = {
      id: `${analysisStore.symbol}_${Date.now()}`,
      symbol: analysisStore.symbol,
      name: newResult?.data?.name || analysisStore.symbol,
      market: analysisStore.market,
      action: newResult?.result?.action,
      confidence: newResult?.result?.confidence,
      analyzedAt: new Date().toISOString(),
      detail: newResult,
      positionParams: holdingQuantity.value ? {
        holdingQuantity: holdingQuantity.value,
        costPrice: costPrice.value,
        maxPosition: maxPosition.value,
      } : null,
    }
    history.value = [histItem, ...history.value]
    selectedHistoryId.value = histItem.id
    sheetResult.value = newResult
    activePanel.value = 'result'
    resultSheetOpen.value = true
    unreadResults.value = 0
    fetchQuota()
    if (isFirstTrial.value) handleProTrialConsumed()
    stopNarrativeLoop()
    clearTimeout(analyzeTimeoutTimer)
  }
})

watch(isAnalyzing, (analyzing) => {
  if (analyzing) {
    activePanel.value = 'loading'
    analyzingSymbol.value = symbol.value.toUpperCase()
    narrativeIdx.value = 0
    analyzeTimedOut.value = false
    startNarrativeLoop()
    analyzeTimeoutTimer = setTimeout(() => { analyzeTimedOut.value = true }, 180000)
  } else {
    stopNarrativeLoop()
    clearTimeout(analyzeTimeoutTimer)
    if (!result.value && activePanel.value === 'loading') {
      activePanel.value = 'analyze'
    }
  }
})

watch(errorCode, (code) => {
  if (code === 'trial_expired') handleGuestTrialExpired()
})

function startNarrativeLoop() {
  clearInterval(narrativeTimer)
  narrativeTimer = setInterval(() => {
    narrativeIdx.value = (narrativeIdx.value + 1) % NARRATIVE_TEXTS.length
  }, 3500)
}

function stopNarrativeLoop() {
  clearInterval(narrativeTimer)
}

onUnmounted(() => {
  stopNarrativeLoop()
  clearTimeout(analyzeTimeoutTimer)
})

async function handleAnalyze() {
  if (!symbol.value.trim() || isAnalyzing.value) return
  clearState()
  analysisStore.setSymbol(symbol.value.toUpperCase())
  analysisStore.setMarket(market.value)
  analysisStore.setPeriod(period.value)
  await submitAnalysis(symbol.value, market.value, period.value, {
    holdingQuantity: holdingQuantity.value ? Number(holdingQuantity.value) : undefined,
    costPrice: costPrice.value ? Number(costPrice.value) : undefined,
    maxPosition: maxPosition.value ? Number(maxPosition.value) : undefined,
  })
}

function openHistoryDetail(item: any) {
  sheetResult.value = item.detail
  selectedHistoryId.value = item.id
  resultSheetOpen.value = true
}

async function fetchSuggestions(q: string) {
  if (!q || q.length < 1) { suggestions.value = []; showSuggestions.value = false; return }
  clearTimeout(suggestTimer)
  suggestTimer = setTimeout(async () => {
    try {
      const res = await api.get(`/api/market/search?q=${encodeURIComponent(q)}&market=${market.value}`)
      suggestions.value = res.data?.slice?.(0, 6) || []
      showSuggestions.value = suggestions.value.length > 0
    } catch {
      suggestions.value = []
      showSuggestions.value = false
    }
  }, 300)
}

function onSymbolInput(e: Event) {
  const val = (e.target as HTMLInputElement).value.toUpperCase()
  symbol.value = val
  fetchSuggestions(val)
}

function selectSuggestion(s: { symbol: string; name: string; market: string }) {
  symbol.value = s.symbol
  market.value = s.market
  showSuggestions.value = false
  suggestions.value = []
}

function selectHotStock(stock: { code: string; name: string; market: string }) {
  symbol.value = stock.code
  market.value = stock.market
  showSuggestions.value = false
}

function setActivePanel(p: 'analyze' | 'loading' | 'result') {
  if (p === 'result') unreadResults.value = 0
  activePanel.value = p
}

function handleTabAccount() {
  if (auth.isLoggedIn) {
    router.push('/account')
  } else {
    router.push('/login')
  }
}
</script>

<template>
  <div style="min-height: 100dvh; background: #f2f2f7;">

    <!-- ═══ MOBILE HEADER ═══ -->
    <header style="
      display: flex; align-items: center; justify-content: space-between;
      padding: 0 16px; height: 52px; position: sticky; top: 0; z-index: 100;
      background: rgba(249,249,249,0.94);
      backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
      border-bottom: 0.5px solid rgba(0,0,0,0.12);
    ">
      <!-- Results mode header -->
      <template v-if="activePanel === 'result'">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 20px; font-weight: 700; letter-spacing: -0.5px; color: #1c1c1e;">研判记录</span>
          <span v-if="history.length > 0" style="font-size: 11px; font-weight: 700; color: #fff; background: #aeaeb2; border-radius: 9999px; padding: 1px 7px; line-height: 1.6;">
            {{ history.length }}
          </span>
        </div>
        <button
          @click="setActivePanel('analyze')"
          style="display: flex; align-items: center; gap: 3px; padding: 7px 15px 7px 11px; background: #007aff; color: white; border: none; border-radius: 20px; font-size: 15px; font-weight: 600; cursor: pointer; letter-spacing: -0.2px; -webkit-tap-highlight-color: transparent;"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M7 1v12M1 7h12" stroke="white" stroke-width="2" stroke-linecap="round"/>
          </svg>
          新分析
        </button>
      </template>

      <!-- Default header -->
      <template v-else>
        <div style="display: flex; align-items: center; gap: 6px;">
          <!-- Candlestick SVG icon -->
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
            <rect x="2" y="9" width="5" height="7" rx="1.5" fill="#dc2626"/>
            <line x1="4.5" y1="6" x2="4.5" y2="9" stroke="#dc2626" stroke-width="1.5" stroke-linecap="round"/>
            <line x1="4.5" y1="16" x2="4.5" y2="19" stroke="#dc2626" stroke-width="1.5" stroke-linecap="round"/>
            <rect x="8.5" y="4" width="5" height="11" rx="1.5" fill="#34c759"/>
            <line x1="11" y1="1.5" x2="11" y2="4" stroke="#34c759" stroke-width="1.5" stroke-linecap="round"/>
            <line x1="11" y1="15" x2="11" y2="17.5" stroke="#34c759" stroke-width="1.5" stroke-linecap="round"/>
            <rect x="15" y="7" width="5" height="8" rx="1.5" fill="#dc2626"/>
            <line x1="17.5" y1="4" x2="17.5" y2="7" stroke="#dc2626" stroke-width="1.5" stroke-linecap="round"/>
            <line x1="17.5" y1="15" x2="17.5" y2="18" stroke="#dc2626" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          <span style="font-size: 15px; font-weight: 700; letter-spacing: -0.2px; color: #000;">{{ appName }}</span>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <span :style="{
            fontSize: '12px', fontWeight: 500,
            color: tier === 'premium' ? '#7c3aed' : tier === 'basic' ? '#007aff' : '#8e8e93'
          }">{{ tierLabel }} · {{ remaining ?? '-' }}次</span>
          <button
            v-if="auth.isLoggedIn"
            @click="userMenuOpen = true"
            style="width: 32px; height: 32px; border-radius: 50%; background: #e9e9eb; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; -webkit-tap-highlight-color: transparent; color: #3c3c43;"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
            </svg>
          </button>
          <template v-else>
            <NuxtLink to="/login" style="font-size: 15px; font-weight: 400; color: #007aff; text-decoration: none; padding: 6px 4px;">登录</NuxtLink>
            <NuxtLink to="/register" style="font-size: 13px; font-weight: 600; color: white; background: #007aff; border-radius: 8px; padding: 6px 12px; text-decoration: none;">注册</NuxtLink>
          </template>
        </div>
      </template>
    </header>

    <!-- ═══ ANALYZE PANEL ═══ -->
    <template v-if="activePanel === 'analyze'">
      <!-- Guest trial ended / quota exhausted -->
      <div v-if="showUpgradeBanner && !auth.isLoggedIn" style="position: fixed; top: 52px; left: 0; right: 0; bottom: 56px; overflow-y: auto; z-index: 10; background: #f2f2f7;">
        <!-- Free tier quota exhausted screen — matches original exactly -->
        <div style="display: flex; flex-direction: column; height: 100%; background: #f2f2f7;">
          <div style="background: white; padding: 28px 20px 20px; flex-shrink: 0;">
            <div style="display: inline-flex; align-items: center; gap: 5px; background: #fff2f2; border-radius: 9999px; padding: 3px 10px; margin-bottom: 10px;">
              <span style="font-size: 10px; font-weight: 700; color: #ff3b30; letter-spacing: 0.5px; text-transform: uppercase;">今日限额</span>
            </div>
            <h2 style="font-size: 30px; font-weight: 800; color: #1c1c1e; margin: 0 0 6px; letter-spacing: -0.8px; line-height: 1.1;">免费次数用完了</h2>
            <p style="font-size: 14px; color: #8e8e93; margin: 0; line-height: 1.5;">明天自动重置 · 或升级继续分析</p>
          </div>
          <div style="height: 12px; flex-shrink: 0;"/>
          <div style="padding: 0 14px; display: flex; gap: 10px; flex-shrink: 0;">
            <NuxtLink to="/upgrade" style="flex: 1; border-radius: 20px; overflow: hidden; text-decoration: none; display: flex; flex-direction: column; box-shadow: 0 4px 20px rgba(0,122,255,0.2);">
              <div style="background: linear-gradient(160deg, #007aff 0%, #0a84ff 40%, #34aadc 100%); padding: 18px 16px 14px;">
                <div style="font-size: 10px; font-weight: 700; color: rgba(255,255,255,0.7); letter-spacing: 0.5px; margin-bottom: 6px;">📊 标准版</div>
                <div style="display: flex; align-items: baseline; gap: 1px; margin-bottom: 2px;">
                  <span style="font-size: 38px; font-weight: 900; color: #fff; letter-spacing: -2px; line-height: 1;">{{ pricing?.basic?.daily_limit ?? 5 }}</span>
                  <span style="font-size: 12px; color: rgba(255,255,255,0.7); margin-left: 3px;">次/天</span>
                </div>
                <div style="display: flex; align-items: baseline; gap: 1px;">
                  <span style="font-size: 18px; font-weight: 800; color: #fff;">¥{{ pricing?.basic?.price ?? '19.9' }}</span>
                  <span style="font-size: 11px; color: rgba(255,255,255,0.6); margin-left: 2px;">/{{ pricing?.basic?.period ?? '月' }}</span>
                </div>
              </div>
              <div style="background: white; padding: 12px 14px; flex: 1;">
                <div v-for="(f, i) in ['完整深度研判', '目标价·止损', '全市场覆盖']" :key="i" style="display: flex; align-items: center; gap: 7px; padding: 5px 0;" :style="i < 2 ? { borderBottom: '0.5px solid rgba(0,0,0,0.06)' } : {}">
                  <span style="width: 14px; height: 14px; border-radius: 50%; background: #34c759; display: flex; align-items: center; justify-content: center; font-size: 9px; color: white; font-weight: 700; flex-shrink: 0;">✓</span>
                  <span style="font-size: 12px; color: #1c1c1e;">{{ f }}</span>
                </div>
              </div>
            </NuxtLink>
            <NuxtLink to="/upgrade" style="flex: 1; border-radius: 20px; overflow: hidden; text-decoration: none; display: flex; flex-direction: column; position: relative; box-shadow: 0 6px 24px rgba(124,58,237,0.28);">
              <div style="position: absolute; top: -1px; left: 50%; transform: translateX(-50%); background: linear-gradient(90deg, #f59e0b, #fbbf24); color: #000; font-size: 9px; font-weight: 800; padding: 3px 10px; border-radius: 0 0 9px 9px; white-space: nowrap; z-index: 2;">最高权益</div>
              <div style="background: linear-gradient(160deg, #1e0a3c 0%, #3b1d8a 50%, #4f46e5 100%); padding: 22px 16px 14px; position: relative; overflow: hidden;">
                <div style="font-size: 10px; font-weight: 700; color: #a78bfa; letter-spacing: 0.5px; margin-bottom: 6px;">👑 专业版</div>
                <div style="display: flex; align-items: baseline; gap: 1px; margin-bottom: 2px;">
                  <span style="font-size: 38px; font-weight: 900; color: #fff; letter-spacing: -2px; line-height: 1;">{{ pricing?.premium?.daily_limit ?? 15 }}</span>
                  <span style="font-size: 12px; color: rgba(255,255,255,0.6); margin-left: 3px;">次/天</span>
                </div>
                <div style="display: flex; align-items: baseline; gap: 1px;">
                  <span style="font-size: 18px; font-weight: 800; color: #c4b5fd;">¥{{ pricing?.premium?.price ?? '49' }}</span>
                  <span style="font-size: 11px; color: rgba(196,181,253,0.5); margin-left: 2px;">/{{ pricing?.premium?.period ?? '月' }}</span>
                </div>
              </div>
              <div style="background: #1a1040; padding: 12px 14px; flex: 1;">
                <div v-for="(f, i) in ['完整深度研判', '持仓智能分析', '多标的查询']" :key="i" style="display: flex; align-items: center; gap: 7px; padding: 5px 0;" :style="i < 2 ? { borderBottom: '0.5px solid rgba(124,58,237,0.15)' } : {}">
                  <span style="width: 14px; height: 14px; border-radius: 50%; background: #7c3aed; display: flex; align-items: center; justify-content: center; font-size: 9px; color: white; font-weight: 700; flex-shrink: 0;">✓</span>
                  <span style="font-size: 12px; color: rgba(255,255,255,0.75);">{{ f }}</span>
                </div>
              </div>
            </NuxtLink>
          </div>
        </div>
      </div>

      <!-- Normal analyze form -->
      <div v-else style="background: white;">
        <!-- Hero title + market -->
        <div style="padding: 22px 16px 16px;">
          <h2 style="font-size: 28px; font-weight: 800; letter-spacing: -0.8px; color: #1c1c1e; margin: 0 0 16px; line-height: 1.1;">今天分析哪只？</h2>
          <!-- Market segmented control -->
          <div class="segmented">
            <button
              v-for="m in [{ v: 'a', l: 'A股' }, { v: 'hk', l: '港股' }, { v: 'us', l: '美股' }, { v: 'futures', l: '期货' }]"
              :key="m.v"
              class="segmented-item"
              :class="{ active: market === m.v }"
              @click="market = m.v"
            >{{ m.l }}</button>
          </div>
        </div>

        <div style="height: 0.5px; background: rgba(60,60,67,0.1);"/>

        <!-- Symbol search input -->
        <div style="padding: 14px 16px 0; position: relative;">
          <div style="position: relative;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#aeaeb2" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"
              style="position: absolute; left: 14px; top: 50%; transform: translateY(-50%); pointer-events: none; z-index: 1;">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              ref="symbolInput"
              class="symbol-input"
              :value="symbol"
              @input="onSymbolInput"
              :placeholder="market === 'a' ? '输入股票代码，如 600519' : market === 'hk' ? '输入港股代码，如 00700' : market === 'us' ? '输入美股代码，如 AAPL' : '输入期货代码，如 MA'"
              @keyup.enter="handleAnalyze"
              autocomplete="off"
              autocorrect="off"
              autocapitalize="off"
              spellcheck="false"
            />
          </div>
          <!-- Suggestions dropdown -->
          <div v-if="showSuggestions && suggestions.length > 0" style="position: absolute; left: 16px; right: 16px; top: calc(100% + 4px); background: white; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.12); z-index: 200; overflow: hidden;">
            <button
              v-for="s in suggestions"
              :key="s.symbol"
              @click="selectSuggestion(s)"
              style="display: flex; align-items: center; justify-content: space-between; width: 100%; padding: 12px 16px; background: none; border: none; border-bottom: 0.5px solid rgba(0,0,0,0.06); cursor: pointer; -webkit-tap-highlight-color: transparent; text-align: left;"
            >
              <div>
                <div style="font-size: 15px; font-weight: 600; color: #1c1c1e;">{{ s.symbol }}</div>
                <div style="font-size: 12px; color: #8e8e93;">{{ s.name }}</div>
              </div>
              <span style="font-size: 11px; color: #0071e3; background: rgba(0,122,255,0.1); padding: 2px 8px; border-radius: 9999px; font-weight: 600;">{{ MARKET_LABELS[s.market] || s.market }}</span>
            </button>
          </div>
        </div>

        <!-- Hot stocks -->
        <div style="padding: 12px 16px 16px;">
          <div v-if="hotStocks.length > 0" style="display: flex; gap: 8px; overflow-x: auto; scrollbar-width: none; -webkit-overflow-scrolling: touch; padding-bottom: 2px;">
            <button
              v-for="s in hotStocks"
              :key="s.code"
              class="hot-chip"
              @click="selectHotStock(s)"
            >
              <span style="font-size: 11px; color: #007aff; font-weight: 700;">{{ s.code }}</span>
              <span style="color: #636366;">{{ s.name }}</span>
            </button>
          </div>
          <div v-else style="display: flex; gap: 8px; overflow-x: auto; scrollbar-width: none;">
            <button v-for="s in [{ code: '600519', name: '贵州茅台' }, { code: '000858', name: '五粮液' }, { code: '300750', name: '宁德时代' }]" :key="s.code" class="hot-chip" @click="selectHotStock({ code: s.code, name: s.name, market: 'a' })">
              <span style="font-size: 11px; color: #007aff; font-weight: 700;">{{ s.code }}</span>
              <span style="color: #636366;">{{ s.name }}</span>
            </button>
          </div>
        </div>

        <div style="height: 0.5px; background: rgba(60,60,67,0.1);"/>

        <!-- Advanced settings -->
        <div style="background: white;">
          <button class="adv-toggle" @click="advancedOpen = !advancedOpen">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 15px; color: #3c3c43;">⚙ 分析参数</span>
              <span style="font-size: 12px; color: #8e8e93;">{{ PERIOD_OPTIONS.find(p => p.value === period)?.label }}</span>
            </div>
            <svg class="adv-chevron" :class="{ open: advancedOpen }" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#aeaeb2" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>
          <div v-if="advancedOpen" style="padding: 0 16px 16px;">
            <!-- Period selector -->
            <div style="margin-bottom: 16px;">
              <div style="font-size: 12px; font-weight: 600; color: #8e8e93; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 10px;">周期</div>
              <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                <button
                  v-for="p in PERIOD_OPTIONS"
                  :key="p.value"
                  class="period-chip"
                  :class="{ active: period === p.value }"
                  @click="period = p.value"
                >{{ p.label }}</button>
              </div>
            </div>
            <!-- Holding params (premium) -->
            <template v-if="tier === 'premium'">
              <div style="font-size: 12px; font-weight: 600; color: #8e8e93; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 10px;">持仓参数（可选）</div>
              <div style="display: flex; flex-direction: column; gap: 8px;">
                <input v-model="holdingQuantity" type="number" placeholder="持仓数量（股）" style="height: 44px; background: #f2f2f7; border: none; border-radius: 10px; padding: 0 14px; font-size: 15px; color: #000; outline: none; width: 100%;"/>
                <input v-model="costPrice" type="number" placeholder="持仓成本价" style="height: 44px; background: #f2f2f7; border: none; border-radius: 10px; padding: 0 14px; font-size: 15px; color: #000; outline: none; width: 100%;"/>
                <input v-model="maxPosition" type="number" placeholder="最大持仓金额（可选）" style="height: 44px; background: #f2f2f7; border: none; border-radius: 10px; padding: 0 14px; font-size: 15px; color: #000; outline: none; width: 100%;"/>
              </div>
            </template>
            <template v-else>
              <NuxtLink to="/upgrade" style="display: flex; align-items: center; justify-content: space-between; padding: 14px 16px; background: linear-gradient(135deg, #f5f3ff, #ede9fe); border-radius: 12px; text-decoration: none; margin-top: 8px;">
                <div>
                  <div style="font-size: 14px; font-weight: 700; color: #5b21b6;">持仓智能分析</div>
                  <div style="font-size: 12px; color: #7c3aed; margin-top: 2px;">专业版专属 · 个性化建议</div>
                </div>
                <span style="font-size: 13px; font-weight: 600; color: #7c3aed;">升级 →</span>
              </NuxtLink>
            </template>
          </div>
        </div>

        <!-- Bottom clearance -->
        <div style="height: calc(54px + 56px + 20px); background: white;"/>
      </div>

      <!-- ── FAB ── -->
      <div class="fab-container">
        <div v-if="error" style="font-size: 13px; color: #ff3b30; margin-bottom: 8px; text-align: center;">{{ error }}</div>
        <button
          class="fab-btn"
          @click="handleAnalyze"
          :disabled="!symbol.trim() || isAnalyzing"
          :style="showUpgradeBanner ? { background: 'linear-gradient(135deg, #ff9500, #ff6b00)' } : {}"
        >
          {{ showUpgradeBanner ? '立即升级 →' : '开始分析' }}
        </button>
      </div>
    </template>

    <!-- ═══ LOADING PANEL ═══ -->
    <template v-if="activePanel === 'loading'">
      <div style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; z-index: 300; background: #ffffff; display: flex; flex-direction: column; align-items: center; justify-content: center; overflow: hidden; text-align: center;">
        <!-- Breathing glow -->
        <div style="position: absolute; width: 360px; height: 360px; background: radial-gradient(circle at center, rgba(0,122,255,0.07) 0%, transparent 70%); border-radius: 50%; top: 50%; left: 50%; animation: loading-breathe 3.5s ease-in-out infinite; pointer-events: none;"/>

        <!-- Timeout state -->
        <div v-if="analyzeTimedOut" style="display: flex; flex-direction: column; align-items: center; gap: 16px; max-width: 300px; padding: 0 40px; position: relative; z-index: 1;">
          <div style="font-size: 48px; line-height: 1;">⏰</div>
          <h2 style="font-size: 22px; font-weight: 700; color: #1c1c1e; margin: 0;">分析时间较长</h2>
          <p style="font-size: 15px; color: #8e8e93; line-height: 1.75; margin: 0;">AI 服务响应超过 3 分钟<br/>可等待继续，或返回重试</p>
          <button @click="activePanel = 'analyze'" style="margin-top: 8px; padding: 14px 40px; border-radius: 16px; background: #f2f2f7; border: none; font-size: 16px; font-weight: 600; color: #1c1c1e; cursor: pointer;">返回重试</button>
        </div>

        <!-- Normal loading -->
        <div v-else style="position: relative; z-index: 1; display: flex; flex-direction: column; align-items: center; padding: 0 32px; width: 100%;">
          <div style="font-size: 72px; font-weight: 900; letter-spacing: -3px; color: #1c1c1e; line-height: 1; margin-bottom: 10px; animation: loading-symbol-in 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;">
            {{ analyzingSymbol }}
          </div>
          <div style="font-size: 13px; font-weight: 500; color: #aeaeb2; letter-spacing: 2.5px; text-transform: uppercase; margin-bottom: 64px; animation: loading-subtitle-in 0.6s 0.15s ease-out both;">
            深度研判中
          </div>
          <p :key="narrativeIdx" style="font-size: 15px; font-weight: 500; color: #3c3c43; line-height: 1.7; margin: 0 0 28px; animation: narrative-fade 0.35s ease-out; min-height: 1.7em;">
            {{ NARRATIVE_TEXTS[narrativeIdx] }}
          </p>
          <div style="display: flex; gap: 8px; align-items: center;">
            <div v-for="i in [0, 1, 2]" :key="i" :style="{ width: '7px', height: '7px', borderRadius: '50%', background: '#007aff', opacity: 0.4, animation: `loading-dot 1.4s ${i * 0.22}s ease-in-out infinite` }"/>
          </div>
        </div>

        <!-- Footer -->
        <div style="position: absolute; bottom: 40px; left: 0; right: 0; display: flex; flex-direction: column; align-items: center; gap: 4px; pointer-events: none;">
          <p style="font-size: 12px; color: #c7c7cc; margin: 0;">预计耗时 1–3 分钟</p>
        </div>
      </div>
    </template>

    <!-- ═══ RESULT PANEL ═══ -->
    <template v-if="activePanel === 'result'">
      <div class="rg-screen">
        <!-- Empty state -->
        <div v-if="history.length === 0" class="rg-empty">
          <div class="rg-empty-icon-wrap">
            <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
              <path d="M6 32 L14 20 L20 26 L28 13 L38 16" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
              <circle cx="38" cy="16" r="3" fill="white"/>
            </svg>
          </div>
          <p class="rg-empty-title">开始你的第一次研判</p>
          <p class="rg-empty-sub">输入股票或期货代码，AI 将生成<br/>专业的买卖建议和深度分析报告</p>
          <button class="rg-empty-cta" @click="setActivePanel('analyze')">开始分析</button>
          <p class="rg-empty-hint">支持 A股 · 港股 · 美股 · 期货</p>
        </div>

        <!-- History list -->
        <div v-else class="rg-list">
          <template v-for="group in groupedHistory" :key="group.label">
            <div class="rg-group-label">{{ group.label }}</div>
            <button
              v-for="(item, cardIdx) in group.items"
              :key="item.id"
              class="rg-card"
              :class="{ 'rg-card-active': item.id === selectedHistoryId }"
              :style="{
                '--card-accent': getActionDisplay(item.action).color,
                ...(item.id === selectedHistoryId ? { background: `color-mix(in srgb, ${getActionDisplay(item.action).color} 9%, #fff)` } : {})
              }"
              @click="openHistoryDetail(item)"
            >
              <div class="rg-card-header">
                <div class="rg-card-info">
                  <span class="rg-card-name">{{ item.name || item.symbol }}</span>
                  <div style="display: flex; align-items: center; gap: 5px; margin-top: 1px;">
                    <span class="rg-card-symbol">{{ item.symbol }}</span>
                    <span v-if="item.market" class="rg-card-market-chip">{{ MARKET_LABELS[item.market] || item.market }}</span>
                  </div>
                </div>
                <span class="rg-card-badge" :style="{ background: getActionDisplay(item.action).color }">{{ getActionDisplay(item.action).text }}</span>
              </div>
              <div v-if="item.confidence != null" class="rg-card-bar-row">
                <div class="rg-card-bar">
                  <div class="rg-card-bar-fill" :style="{ width: `${item.confidence}%`, background: getActionDisplay(item.action).color }"/>
                </div>
                <span class="rg-card-conf" :style="{ color: getActionDisplay(item.action).color }">{{ item.confidence }}%</span>
              </div>
              <p v-if="item.detail?.result?.reason" class="rg-card-reason">{{ item.detail.result.reason.slice(0, 68) }}…</p>
              <div class="rg-card-footer">
                <span class="rg-card-date">{{ item.analyzedAt ? formatCardTime(item.analyzedAt) : '' }}</span>
                <svg class="rg-card-chevron" width="7" height="12" viewBox="0 0 7 12" fill="none">
                  <path d="M1 1l5 5-5 5" stroke="#c7c7cc" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </div>
            </button>
          </template>
        </div>
      </div>

      <!-- Re-open result button when sheet is dismissed -->
      <div v-if="sheetResult && !resultSheetOpen" style="position: fixed; bottom: calc(env(safe-area-inset-bottom, 0px) + 72px); left: 16px; right: 16px; z-index: 50;">
        <button
          @click="resultSheetOpen = true"
          style="width: 100%; height: 52px; border-radius: 14px; background: linear-gradient(135deg, #2563eb, #4f46e5); color: white; border: none; font-size: 16px; font-weight: 700; cursor: pointer; box-shadow: 0 4px 20px rgba(37,99,235,0.45); display: flex; align-items: center; justify-content: center; gap: 8px;"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
          查看 {{ sheetResult?.data?.name || sheetResult?.data?.symbol }} 的分析结果
        </button>
      </div>
    </template>

    <!-- ═══ BOTTOM NAV ═══ -->
    <nav class="bottom-nav" aria-label="底部导航">
      <!-- 分析 -->
      <button
        class="bottom-nav-item"
        :class="{ active: activePanel === 'analyze' }"
        @click="setActivePanel('analyze')"
      >
        <span class="bottom-nav-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" :stroke-width="activePanel === 'analyze' ? '2.2' : '1.7'" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>
          </svg>
        </span>
        <span>分析</span>
      </button>

      <!-- 结果 -->
      <button
        class="bottom-nav-item"
        :class="{ active: activePanel === 'result' }"
        @click="setActivePanel('result')"
      >
        <span class="bottom-nav-icon" style="position: relative; display: inline-flex;">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" :stroke-width="activePanel === 'result' ? '2.2' : '1.7'" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
          </svg>
          <span v-if="unreadResults > 0 && activePanel !== 'result'" class="bottom-nav-badge bottom-nav-badge-pulse">
            {{ unreadResults > 9 ? '9+' : unreadResults }}
          </span>
          <span v-else-if="isAnalyzing && activePanel !== 'result'" style="position: absolute; top: -3px; right: -5px; width: 8px; height: 8px; background: #007aff; border-radius: 50%; border: 1.5px solid rgba(249,249,249,0.94); animation: badge-breathe 1.8s ease-in-out infinite;"/>
        </span>
        <span>结果</span>
      </button>

      <!-- 我的 -->
      <button class="bottom-nav-item" @click="handleTabAccount">
        <span class="bottom-nav-icon" style="position: relative; display: inline-flex;">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
          </svg>
          <span v-if="tier !== 'premium'" style="position: absolute; top: -3px; right: -5px; width: 8px; height: 8px; background: #ff9500; border-radius: 50%; border: 1.5px solid rgba(249,249,249,0.94);"/>
        </span>
        <span>我的</span>
      </button>
    </nav>

    <!-- ═══ RESULT SHEET OVERLAY ═══ -->
    <ResultSheet
      v-if="sheetResult"
      :isOpen="resultSheetOpen"
      :result="sheetResult"
      :tier="tier || 'free'"
      :period="analysisStore.period || period"
      :historyItems="history"
      :selectedHistoryId="selectedHistoryId"
      :isSaved="selectedHistoryId ? isSaved(selectedHistoryId) : false"
      @close="resultSheetOpen = false"
      @save="selectedHistoryId && saveRecord({ id: selectedHistoryId, symbol: sheetResult?.data?.symbol, market: sheetResult?.data?.market, period: analysisStore.period, result: sheetResult })"
      @share="() => {}"
      @historySelect="(id) => { const item = history.find(h => h.id === id); if (item) { sheetResult = item.detail; selectedHistoryId = item.id; } }"
      @upgrade="router.push('/upgrade')"
    />

    <!-- ═══ GUEST TRIAL ENDED ═══ -->
    <GuestTrialEndedScreen
      v-if="showGuestTrialEndedScreen"
      @dismiss="dismissGuestTrialScreen"
    />

    <!-- ═══ PRO TRIAL WELCOME ═══ -->
    <ProTrialWelcomeModal
      v-if="showProTrialWelcomeModal"
      @dismiss="dismissProTrialModal"
    />

  </div>
</template>
