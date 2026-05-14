<script setup lang="ts">
import { ref, computed, onMounted, watch, onUnmounted } from 'vue'
import { useHead, useRequestURL, useSeoMeta } from '#app'
import { useRoute, useRouter } from 'vue-router'
import api from '~/lib/api'
import { preloadAll, preloadMarket, searchSymbols, getSymbolName } from '~/composables/useSymbolCache'
import { useAnalysis } from '~/composables/useAnalysis'
import { useQuota } from '~/composables/useQuota'
import { useTrial } from '~/composables/useTrial'
import { useAuthStore } from '~/stores/auth'
import { useAnalysisStore } from '~/stores/analysis'
import { useDevice } from '~/composables/useDevice'
import { DEFAULT_APP_NAME } from '~/constants/app'
import { SITE_DESCRIPTION, SITE_NAME } from '~/constants/seo'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
const analysisStore = useAnalysisStore()
const { getDeviceId } = useDevice()

const {
  isAnalyzing, taskId, result, historyId, error, errorCode, progress, statusMessage, isFirstTrial,
  submitAnalysis, clearState
} = useAnalysis()

const {
  remaining, dailyLimit, totalAvailable, tier, trialState, hasQuota, fetchQuota, deepRemaining, deepDailyLimit
} = useQuota()

const {
  showGuestTrialEndedScreen,
  showProTrialWelcomeModal,
  showProTrialEndedBanner,
  trialActivated,
  activateTrial,
  handleGuestTrialExpired,
  handleRegisteredTrialExpired,
  dismissGuestTrialScreen,
  dismissProTrialEndedBanner,
} = useTrial()

// ── Panel state ──
const activePanel = ref<'analyze' | 'loading' | 'result'>('analyze')
const resultSheetOpen = ref(false)
const selectedHistoryId = ref<string | null>(null)
const sheetResult = ref<any>(null)

// ── Form state ──
const symbol = ref('')
const market = ref('a')
const inviteCodeFromRoute = ref('')
const period = ref('daily')
const holdingQuantity = ref('')
const costPrice = ref('')
const maxPosition = ref('')
const advancedOpen = ref(false)
const multiPeriodEnabled = ref(false)
const auxiliaryPeriods = ref<string[]>([])
const symbolWarning = ref<string | null>(null)
const symbolInput = ref<HTMLInputElement | null>(null)
const symbolPreloadRequested = new Set<string>()

// ── Autocomplete ──
const suggestions = ref<Array<{ symbol: string; name: string; market: string }>>([])
const showSuggestions = ref(false)
const activeSuggIdx = ref(-1)
const selectedSymbolName = ref('')
let isComposing = false

// ── Hot stocks ──
const HOT_STOCKS_POOL = [
  { code: '600519', name: '贵州茅台', market: 'a' },
  { code: '300750', name: '宁德时代', market: 'a' },
  { code: '002594', name: '比亚迪', market: 'a' },
  { code: '600036', name: '招商银行', market: 'a' },
  { code: '000858', name: '五粮液', market: 'a' },
  { code: '00700', name: '腾讯', market: 'hk' },
  { code: '03690', name: '美团', market: 'hk' },
  { code: '01810', name: '小米', market: 'hk' },
  { code: '09988', name: '阿里巴巴', market: 'hk' },
  { code: 'AAPL', name: '苹果', market: 'us' },
  { code: 'NVDA', name: '英伟达', market: 'us' },
  { code: 'BABA', name: '阿里巴巴', market: 'us' },
  { code: 'TSLA', name: '特斯拉', market: 'us' },
  { code: 'MA', name: '甲醇', market: 'futures' },
  { code: 'RB', name: '螺纹钢', market: 'futures' },
  { code: 'CU', name: '沪铜', market: 'futures' },
  { code: 'SA', name: '纯碱', market: 'futures' },
]
const hotStocks = ref<Array<{ code: string; name: string; market: string }>>([])

// ── History ──
const history = ref<Array<{
  id: string; symbol: string; name: string; market: string;
  action?: string; confidence?: number; analyzedAt?: string;
  detail?: any; positionParams?: any; isProTrial?: boolean; isFavorited?: boolean
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
const appName = ref(DEFAULT_APP_NAME)
const pricing = ref<any>(null)
const appConfig = ref<any>(null)
const requestUrl = useRequestURL()

useHead({ title: appName, link: [{ rel: 'canonical', href: `${requestUrl.origin}/` }] })
useSeoMeta({
  title: SITE_NAME,
  description: SITE_DESCRIPTION,
  ogTitle: SITE_NAME,
  ogDescription: SITE_DESCRIPTION,
  ogType: 'website',
  robots: 'index,follow',
})

// ── Unread ──
const unreadResults = ref(0)

// ── Background analysis (premium only) ──
const isBackgroundMode = ref(false)
const showAnalysisNotification = ref(false)
const pendingResult = ref<any>(null)
const pendingResultSymbol = ref('')

// ── User menus ──
const userMenuOpen = ref(false)      // mobile bottom sheet
const dtUserMenuOpen = ref(false)    // desktop popover

// ── Desktop detection ──
const isDesktop = ref(false)
function checkDesktop() {
  if (typeof window !== 'undefined') {
    isDesktop.value = window.innerWidth >= 1024
  }
}

// ── Quota exhausted ──
const showUpgradeBanner = computed(() => remaining.value !== null && !hasQuota.value)
const landingPrefilled = computed(() => !!symbol.value.trim() && !!route.query.symbol)
const inviteRewardText = computed(() => inviteCodeFromRoute.value ? '注册后双方各得 +10 次分析额度' : '')
const registerPath = computed(() =>
  inviteCodeFromRoute.value ? `/register?invite=${encodeURIComponent(inviteCodeFromRoute.value)}` : '/register'
)

// ── Tier display ──
const tierLabel = computed(() => {
  if (tier.value === 'premium') return '专业版'
  if (tier.value === 'basic') return '标准版'
  return '免费版'
})

const isGuestTrial = computed(() => !auth.isLoggedIn && trialState.value === 'available')
const isRegisteredProTrial = computed(() =>
  auth.isLoggedIn && auth.user &&
  (auth.user.tier === 'free' || auth.user.tier === 'basic') &&
  !auth.user.has_had_pro_trial
)
const effectiveTier = computed(() => (isGuestTrial.value || isRegisteredProTrial.value) ? 'premium' : tier.value)
const showTrialInProgressBanner = computed(() => trialActivated.value && isAnalyzing.value)

// Tier to pass to AnalysisResultSheet: if the selected history item is a pro trial, show as premium
const sheetTier = computed(() => {
  const item = selectedHistoryId.value
    ? history.value.find(h => h.id === selectedHistoryId.value)
    : null
  if (item?.isProTrial) return 'premium'
  return effectiveTier.value
})

const MARKET_LABELS: Record<string, string> = { a: 'A股', hk: '港股', us: '美股', futures: '期货' }
const VALID_MARKETS = ['a', 'hk', 'us', 'futures']
const PERIOD_OPTIONS = [
  { value: 'daily', label: '日线' },
  { value: '60', label: '60分' },
  { value: '30', label: '30分' },
  { value: '15', label: '15分' },
  { value: '5', label: '5分' },
  { value: '1', label: '1分' },
]

const analyzeTimeoutMs = computed(() => {
  const seconds = Number(appConfig.value?.analyze_timeout_seconds)
  if (!Number.isFinite(seconds) || seconds <= 0) return 300000
  return seconds * 1000
})

function toggleAuxPeriod(p: string) {
  if (p === '__clear__') { auxiliaryPeriods.value = []; return }
  const idx = auxiliaryPeriods.value.indexOf(p)
  if (idx >= 0) {
    auxiliaryPeriods.value.splice(idx, 1)
  } else if (auxiliaryPeriods.value.length < 3) {
    auxiliaryPeriods.value.push(p)
  }
}

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

function loadHotStocks() {
  hotStocks.value = HOT_STOCKS_POOL.filter(s => s.market === market.value).slice(0, 4)
}

async function loadHistory() {
  if (!auth.isLoggedIn) return
  try {
    const res = await api.get('/api/analyze/history')
    const rawItems = res.data?.items || (Array.isArray(res.data) ? res.data : [])
    history.value = rawItems.map((item: any) => ({
      id: String(item.id ?? `${item.symbol}_${item.analyzed_at || item.created_at}`),
      symbol: item.symbol,
      name: item.result?.data?.name || item.symbol,
      market: item.market,
      action: item.result?.result?.action,
      confidence: item.result?.result?.confidence,
      analyzedAt: item.analyzed_at || item.created_at,
      detail: item.result,
      positionParams: null,
      isProTrial: !!item.is_pro_trial,
      isFavorited: !!item.is_favorited,
    }))
  } catch {}
}

function scheduleIdle(task: () => void, timeout = 1200) {
  if (typeof window === 'undefined') return
  const requestIdle = (window as any).requestIdleCallback
  if (typeof requestIdle === 'function') {
    requestIdle(task, { timeout })
    return
  }
  window.setTimeout(task, 350)
}

function syncTrialPrompts() {
  if (!auth.isLoggedIn) {
    if (trialState.value === 'available') {
      showProTrialWelcomeModal.value = true
    } else if (trialState.value === 'expired') {
      // Guest already used their trial — show ended screen immediately
      showGuestTrialEndedScreen.value = true
    }
  } else if (auth.isLoggedIn && auth.user &&
    (auth.user.tier === 'free' || auth.user.tier === 'basic')) {
    if (!auth.user.has_had_pro_trial) {
      showProTrialWelcomeModal.value = true
    } else {
      // Registered user already used trial — show dismissible banner
      handleRegisteredTrialExpired()
    }
  }
}

function ensureMarketSymbols(m: string, rerunQuery = '') {
  if (m === 'us' || symbolPreloadRequested.has(m)) return
  symbolPreloadRequested.add(m)
  preloadMarket(m).then(() => {
    const currentQuery = symbol.value.toUpperCase()
    if (rerunQuery && market.value === m && currentQuery === rerunQuery.toUpperCase()) {
      _runSearch(rerunQuery)
    }
  }).catch(() => {})
}

function applyRoutePrefill() {
  const queryMarket = typeof route.query.market === 'string' ? route.query.market : ''
  const querySymbol = typeof route.query.symbol === 'string' ? route.query.symbol : ''
  const queryInvite = typeof route.query.invite === 'string' ? route.query.invite.trim().toUpperCase() : ''
  if (queryInvite) {
    inviteCodeFromRoute.value = queryInvite
    if (typeof window !== 'undefined') {
      localStorage.setItem('pendingInviteCode', queryInvite)
    }
  }
  if (queryMarket && VALID_MARKETS.includes(queryMarket)) {
    market.value = queryMarket
    analysisStore.setMarket(queryMarket)
  }
  if (querySymbol) {
    symbol.value = querySymbol.toUpperCase()
    analysisStore.setSymbol(symbol.value)
    selectedSymbolName.value = getSymbolName(symbol.value, market.value)
    ensureMarketSymbols(market.value, symbol.value)
    activePanel.value = 'analyze'
  }
}

onMounted(() => {
  checkDesktop()
  window.addEventListener('resize', checkDesktop)
  applyRoutePrefill()
  loadHotStocks()

  loadAppConfig()
  fetchQuota().finally(syncTrialPrompts)

  scheduleIdle(() => {
    loadHistory()
    loadPricing()
  })

  scheduleIdle(() => {
    preloadAll().catch(() => {})
  }, 3000)
})

watch(() => route.query, applyRoutePrefill)

// ── Watch analysis result ──
watch(result, (newResult) => {
  if (newResult) {
    const histItem = {
      id: historyId.value ? String(historyId.value) : `${analysisStore.symbol}_${Date.now()}`,
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
      isProTrial: isFirstTrial.value,
      isFavorited: false,
    }
    history.value = [histItem, ...history.value]
    selectedHistoryId.value = histItem.id
    sheetResult.value = newResult
    fetchQuota()
    trialActivated.value = false
    stopNarrativeLoop()
    clearTimeout(analyzeTimeoutTimer)

    if (isBackgroundMode.value) {
      pendingResult.value = newResult
      pendingResultSymbol.value = histItem.name
      showAnalysisNotification.value = true
      unreadResults.value += 1
    } else {
      activePanel.value = 'result'
      resultSheetOpen.value = true
      unreadResults.value = 0
    }
  }
})

watch(isAnalyzing, (analyzing) => {
  if (analyzing) {
    analyzingSymbol.value = symbol.value.toUpperCase()
    analyzeTimedOut.value = false

    if (effectiveTier.value === 'premium') {
      isBackgroundMode.value = true
    } else {
      isBackgroundMode.value = false
      activePanel.value = 'loading'
      narrativeIdx.value = 0
      startNarrativeLoop()
      analyzeTimeoutTimer = setTimeout(() => { analyzeTimedOut.value = true }, analyzeTimeoutMs.value)
    }
  } else {
    isBackgroundMode.value = false
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

watch(market, () => {
  loadHotStocks()
  selectedSymbolName.value = ''
  suggestions.value = []
  showSuggestions.value = false
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

function handleNotificationView() {
  resultSheetOpen.value = true
  unreadResults.value = 0
  pendingResult.value = null
}

function handleNotificationDismiss() {
  showAnalysisNotification.value = false
}

onUnmounted(() => {
  stopNarrativeLoop()
  clearTimeout(analyzeTimeoutTimer)
  window.removeEventListener('resize', checkDesktop)
})

async function handleToggleFavorite() {
  const id = selectedHistoryId.value
  if (!id || !auth.isLoggedIn) return
  const numId = Number(id)
  if (isNaN(numId)) return  // temp id (guest/not-yet-saved), can't favorite
  try {
    const res = await api.post(`/api/analyze/history/${numId}/favorite`)
    const item = history.value.find(h => h.id === id)
    if (item) {
      item.isFavorited = res.data?.is_favorited ?? !item.isFavorited
    }
  } catch (e) {
    console.error('Failed to toggle favorite:', e)
  }
}

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
    multiPeriodEnabled: multiPeriodEnabled.value,
    auxiliaryPeriods: multiPeriodEnabled.value ? auxiliaryPeriods.value : [],
  })
}

function openHistoryDetail(item: any) {
  sheetResult.value = item.detail
  selectedHistoryId.value = item.id
  resultSheetOpen.value = true
}

function _runSearch(q: string) {
  if (!q) { suggestions.value = []; showSuggestions.value = false; activeSuggIdx.value = -1; return }
  suggestions.value = searchSymbols(q, market.value)
  showSuggestions.value = suggestions.value.length > 0
  activeSuggIdx.value = -1
  if (!suggestions.value.length) {
    ensureMarketSymbols(market.value, q)
  }
}

function onSymbolInput(e: Event) {
  if (isComposing) return
  const val = (e.target as HTMLInputElement).value.toUpperCase()
  symbol.value = val
  selectedSymbolName.value = ''
  _runSearch(val)
}

function onSymbolCompositionStart() { isComposing = true }
function onSymbolCompositionEnd(e: Event) {
  isComposing = false
  const val = (e.target as HTMLInputElement).value.toUpperCase()
  symbol.value = val
  selectedSymbolName.value = ''
  _runSearch(val)
}

function onSymbolKeydown(e: KeyboardEvent) {
  if (!showSuggestions.value || !suggestions.value.length) return
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    activeSuggIdx.value = Math.min(activeSuggIdx.value + 1, suggestions.value.length - 1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    activeSuggIdx.value = Math.max(activeSuggIdx.value - 1, -1)
  } else if (e.key === 'Enter' && activeSuggIdx.value >= 0) {
    e.preventDefault()
    selectSuggestion(suggestions.value[activeSuggIdx.value])
  } else if (e.key === 'Escape') {
    showSuggestions.value = false
    activeSuggIdx.value = -1
  }
}

function selectSuggestion(s: { symbol: string; name: string; market: string }) {
  symbol.value = s.symbol
  market.value = s.market
  selectedSymbolName.value = s.name || ''
  showSuggestions.value = false
  suggestions.value = []
  activeSuggIdx.value = -1
}

function selectHotStock(stock: { code: string; name: string; market: string }) {
  symbol.value = stock.code
  market.value = stock.market
  selectedSymbolName.value = stock.name || getSymbolName(stock.code, stock.market)
  showSuggestions.value = false
  activeSuggIdx.value = -1
}

function setActivePanel(p: 'analyze' | 'loading' | 'result') {
  if (p === 'result') unreadResults.value = 0
  activePanel.value = p
  if (p === 'analyze' && !auth.isLoggedIn && trialState.value === 'expired') {
    showGuestTrialEndedScreen.value = true
  }
}

function handleTabAccount() {
  if (auth.isLoggedIn) {
    userMenuOpen.value = true
  } else {
    router.push('/login')
  }
}

function handleLogout() {
  auth.logout()
  userMenuOpen.value = false
  dtUserMenuOpen.value = false
}
</script>

<template>
  <h1 class="sr-only">K线AI分析助手</h1>
  <!-- ═══════════════════════════════════════════════════
       DESKTOP LAYOUT (≥1024px)
       ═══════════════════════════════════════════════════ -->
  <div v-if="isDesktop" style="display: flex; height: 100dvh; background: #f2f2f7; overflow: hidden;">

    <!-- Sidebar -->
    <LayoutDesktopSidebar
      :appName="appName"
      :tier="sheetTier"
      :tierLabel="tierLabel"
      :remaining="remaining"
      :dailyLimit="dailyLimit"
      :deepRemaining="deepRemaining"
      :deepDailyLimit="deepDailyLimit"
      :user="auth.user"
      :history="history"
      :activePanel="activePanel"
      :selectedHistoryId="selectedHistoryId"
      @new-analysis="activePanel = 'analyze'"
      @open-history="openHistoryDetail"
      @upgrade="router.push('/upgrade')"
      @user-menu-open="dtUserMenuOpen = !dtUserMenuOpen"
    />

    <!-- Workspace -->
    <div style="flex: 1; overflow-y: auto; position: relative; display: flex; flex-direction: column;">

      <!-- ── Desktop: ANALYZE panel ── -->
      <div v-if="activePanel === 'analyze'" style="flex: 1; display: flex; align-items: center; justify-content: center; padding: 40px 24px;">
        <div style="width: 100%; max-width: 540px;">
          <!-- Pro trial ended info banner (registered users, desktop) -->
          <TrialProTrialEndedBanner v-if="showProTrialEndedBanner" @dismiss="dismissProTrialEndedBanner" />
          <div style="margin: 0 0 16px;">
            <PwaInstallButton :appName="appName" variant="card" />
          </div>
          <div style="display: flex; align-items: center; gap: 10px; margin: 0 0 24px;">
            <h1 style="font-size: 22px; font-weight: 700; color: #1c1c1e; margin: 0; letter-spacing: -0.3px;">{{ landingPrefilled ? '立即分析该标的' : '分析一支股票' }}</h1>
            <span v-if="isGuestTrial || isRegisteredProTrial" style="font-size: 12px; font-weight: 700; color: #007aff; background: #e7f1ff; border-radius: 20px; padding: 3px 10px; letter-spacing: 0.2px;">专业版体验中</span>
          </div>
          <div v-if="landingPrefilled || inviteRewardText" style="margin: -12px 0 16px; padding: 12px 14px; border-radius: 12px; background: #f0f9ff; border: 1px solid #bae6fd;">
            <div style="font-size: 14px; font-weight: 700; color: #075985;">已填入 {{ MARKET_LABELS[market] || market }} {{ symbol }}</div>
            <div v-if="inviteRewardText" style="font-size: 12px; color: #047857; margin-top: 4px; font-weight: 600;">{{ inviteRewardText }}</div>
          </div>

          <!-- Market segmented -->
          <div class="segmented" style="margin-bottom: 16px;">
            <button v-for="m in [{ v: 'a', l: 'A股' }, { v: 'hk', l: '港股' }, { v: 'us', l: '美股' }, { v: 'futures', l: '期货' }]" :key="m.v" class="segmented-item" :class="{ active: market === m.v }" @click="market = m.v">{{ m.l }}</button>
          </div>

          <!-- Symbol input -->
          <div style="position: relative; margin-bottom: 12px;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#aeaeb2" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="position: absolute; left: 13px; top: 50%; transform: translateY(-50%); pointer-events: none; z-index: 1;">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              class="symbol-input"
              :value="symbol"
              @input="onSymbolInput"
              :placeholder="market === 'a' ? '输入股票代码，如 600519' : market === 'hk' ? '输入港股代码，如 00700' : market === 'us' ? '输入美股代码，如 AAPL' : '输入期货代码，如 MA'"
              @keyup.enter="handleAnalyze"
              autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"
            />
            <!-- Suggestions -->
            <div v-if="showSuggestions && suggestions.length > 0" style="position: absolute; left: 0; right: 0; top: calc(100% + 4px); background: white; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.12); z-index: 200; overflow: hidden;">
              <button v-for="s in suggestions" :key="s.symbol" @click="selectSuggestion(s)" style="display: flex; align-items: center; justify-content: space-between; width: 100%; padding: 12px 16px; background: none; border: none; border-bottom: 0.5px solid rgba(0,0,0,0.06); cursor: pointer; text-align: left;">
                <div>
                  <div style="font-size: 15px; font-weight: 600; color: #1c1c1e;">{{ s.symbol }}</div>
                  <div style="font-size: 12px; color: #8e8e93;">{{ s.name }}</div>
                </div>
                <span style="font-size: 11px; color: #0071e3; background: rgba(0,122,255,0.1); padding: 2px 8px; border-radius: 9999px; font-weight: 600;">{{ MARKET_LABELS[s.market] || s.market }}</span>
              </button>
            </div>
          </div>

          <!-- Hot stocks -->
          <div style="display: flex; gap: 8px; overflow-x: auto; scrollbar-width: none; margin-bottom: 16px; padding-bottom: 2px;">
            <button v-for="s in (hotStocks.length ? hotStocks : [{ code: '600519', name: '贵州茅台', market: 'a' }, { code: '000858', name: '五粮液', market: 'a' }, { code: '300750', name: '宁德时代', market: 'a' }, { code: '600036', name: '招商银行', market: 'a' }])" :key="s.code" @click="selectHotStock(s)" style="display: flex; flex-direction: column; align-items: flex-start; padding: 8px 14px; min-height: 44px; min-width: 80px; background: white; border: none; border-radius: 10px; cursor: pointer; flex-shrink: 0; box-shadow: 0 1px 4px rgba(0,0,0,0.08); -webkit-tap-highlight-color: transparent;">
              <span style="font-size: 15px; font-weight: 600; color: #1c1c1e; line-height: 1.2; white-space: nowrap;">{{ s.name }}</span>
              <span style="font-size: 12px; color: #8e8e93; margin-top: 1px;">{{ s.code }}</span>
            </button>
            <button @click="loadHotStocks" style="flex-shrink: 0; width: 44px; height: 44px; border-radius: 10px; background: white; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 18px; color: #8e8e93; box-shadow: 0 1px 4px rgba(0,0,0,0.08);">↻</button>
          </div>

          <div style="height: 0.5px; background: rgba(60,60,67,0.1); margin-bottom: 0;"/>

          <!-- Advanced settings: premium = always expanded -->
          <template v-if="effectiveTier === 'premium'">
            <!-- K线周期 -->
            <div style="padding: 12px 0 10px;">
              <p style="font-size: 12px; font-weight: 600; color: #8e8e93; text-transform: uppercase; letter-spacing: 0.06em; margin: 0 0 8px;">K线周期</p>
              <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                <button v-for="p in PERIOD_OPTIONS" :key="p.value" class="period-chip" :class="{ active: period === p.value }" @click="period = p.value">{{ p.label }}</button>
              </div>
            </div>
            <div style="height: 0.5px; background: rgba(60,60,67,0.1);"/>
            <!-- 多周期交叉分析 -->
            <div style="padding: 12px 0 10px;">
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: multiPeriodEnabled ? 10 : 0;">
                <p style="font-size: 12px; font-weight: 600; color: #8e8e93; text-transform: uppercase; letter-spacing: 0.06em; margin: 0;">多周期交叉分析</p>
                <label style="position: relative; display: inline-block; width: 44px; height: 26px; cursor: pointer;">
                  <input type="checkbox" v-model="multiPeriodEnabled" @change="!multiPeriodEnabled && toggleAuxPeriod('__clear__')" style="opacity: 0; width: 0; height: 0;"/>
                  <span :style="{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: multiPeriodEnabled ? '#34c759' : '#e5e5ea', borderRadius: '13px', transition: 'background 0.2s' }">
                    <span :style="{ position: 'absolute', top: '2px', left: multiPeriodEnabled ? '20px' : '2px', width: '22px', height: '22px', background: 'white', borderRadius: '50%', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left 0.2s' }"/>
                  </span>
                </label>
              </div>
              <div v-if="multiPeriodEnabled" style="margin-top: 10px;">
                <p style="font-size: 12px; color: #8e8e93; margin: 0 0 8px;">选择辅助周期（最多3个）</p>
                <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                  <button v-for="p in PERIOD_OPTIONS.filter(p => p.value !== period)" :key="p.value" class="period-chip" :class="{ active: auxiliaryPeriods.includes(p.value) }" :style="{ opacity: !auxiliaryPeriods.includes(p.value) && auxiliaryPeriods.length >= 3 ? 0.4 : 1 }" @click="toggleAuxPeriod(p.value)">{{ p.label }}</button>
                </div>
              </div>
            </div>
            <div style="height: 0.5px; background: rgba(60,60,67,0.1);"/>
            <!-- 持仓参数 -->
            <div style="padding: 12px 0 14px;">
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;">
                <p style="font-size: 12px; font-weight: 600; color: #8e8e93; text-transform: uppercase; letter-spacing: 0.06em; margin: 0;">持仓参数</p>
                <span style="font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 9999px; background: #e7f1ff; color: #007aff; letter-spacing: 0.2px;">专属功能</span>
              </div>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                <div>
                  <label style="font-size: 12px; color: #8e8e93; display: block; margin-bottom: 4px;">持有数量(股)</label>
                  <input v-model="holdingQuantity" type="number" placeholder="如 1000" class="input" style="height: 40px; font-size: 14px;"/>
                </div>
                <div>
                  <label style="font-size: 12px; color: #8e8e93; display: block; margin-bottom: 4px;">成本价</label>
                  <input v-model="costPrice" type="number" placeholder="如 15.50" class="input" style="height: 40px; font-size: 14px;"/>
                </div>
                <div style="grid-column: 1/-1;">
                  <label style="font-size: 12px; color: #8e8e93; display: block; margin-bottom: 4px;">最大持仓(股) — 不超过此仓位</label>
                  <input v-model="maxPosition" type="number" placeholder="如 5000" class="input" style="height: 40px; font-size: 14px;"/>
                </div>
                <p style="grid-column: 1/-1; font-size: 11px; color: #8e8e93; margin: 0;">不填=按空仓分析；若填写则 3 项需全部填写。</p>
              </div>
            </div>
          </template>
          <!-- Non-premium: collapsible -->
          <template v-else>
            <button class="adv-toggle" @click="advancedOpen = !advancedOpen">
              <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 15px; color: #3c3c43;">⚙ 高级设置</span>
                <span style="font-size: 12px; color: #8e8e93;">{{ PERIOD_OPTIONS.find(p => p.value === period)?.label }}</span>
              </div>
              <svg class="adv-chevron" :class="{ open: advancedOpen }" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#aeaeb2" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            <div v-if="advancedOpen" style="padding: 8px 0 16px;">
              <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px;">
                <button v-for="p in PERIOD_OPTIONS" :key="p.value" class="period-chip" :class="{ active: period === p.value }" @click="period = p.value">{{ p.label }}</button>
              </div>
              <NuxtLink to="/upgrade" style="display: flex; align-items: center; justify-content: space-between; padding: 14px 16px; background: linear-gradient(135deg, #f0f6ff, #e7f1ff); border-radius: 12px; text-decoration: none;">
                <div><div style="font-size: 14px; font-weight: 700; color: #0a4da3;">持仓智能分析</div><div style="font-size: 12px; color: #007aff; margin-top: 2px;">专业版专属 · 个性化建议</div></div>
                <span style="font-size: 13px; font-weight: 600; color: #007aff;">升级 →</span>
              </NuxtLink>
            </div>
          </template>

          <div v-if="error" style="color: #ff3b30; font-size: 13px; margin-bottom: 12px; line-height: 1.5;">{{ error }}</div>

          <!-- Analyze button -->
          <button
            @click="handleAnalyze"
            :disabled="!symbol.trim() || isAnalyzing"
            style="margin-top: 16px; width: 100%; height: 50px; border-radius: 14px; font-size: 17px; font-weight: 600; cursor: pointer; transition: background 0.15s, color 0.15s; border: none;"
            :style="{
              background: !symbol.trim() || isAnalyzing ? 'rgba(0,122,255,0.07)' : '#007aff',
              color: !symbol.trim() || isAnalyzing ? 'rgba(0,122,255,0.38)' : 'white',
            }"
          >
            {{ landingPrefilled ? '立即分析该标的' : '开始分析' }}
          </button>
        </div>
      </div>

      <!-- ── Desktop: LOADING panel ── -->
      <div v-else-if="activePanel === 'loading'" style="flex: 1; display: flex; align-items: center; justify-content: center; position: relative; overflow: hidden;">
        <div style="position: absolute; width: 360px; height: 360px; background: radial-gradient(circle at center, rgba(0,122,255,0.07) 0%, transparent 70%); border-radius: 50%; animation: loading-breathe 3.5s ease-in-out infinite; pointer-events: none;"/>
        <div v-if="analyzeTimedOut" style="display: flex; flex-direction: column; align-items: center; gap: 16px; max-width: 300px; position: relative; z-index: 1; text-align: center;">
          <div style="font-size: 48px;">⏰</div>
          <h2 style="font-size: 22px; font-weight: 700; color: #1c1c1e; margin: 0;">分析时间较长</h2>
          <p style="font-size: 15px; color: #8e8e93; line-height: 1.75; margin: 0;">AI 服务响应超过 3 分钟<br/>可等待继续，或返回重试</p>
          <button @click="activePanel = 'analyze'" style="padding: 12px 40px; border-radius: 14px; background: #f2f2f7; border: none; font-size: 15px; font-weight: 600; color: #1c1c1e; cursor: pointer;">返回重试</button>
        </div>
        <div v-else style="position: relative; z-index: 1; display: flex; flex-direction: column; align-items: center; text-align: center;">
          <div style="font-size: 60px; font-weight: 900; letter-spacing: -3px; color: #1c1c1e; line-height: 1; margin-bottom: 10px; animation: loading-symbol-in 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;">{{ analyzingSymbol }}</div>
          <div style="font-size: 12px; font-weight: 500; color: #aeaeb2; letter-spacing: 2.5px; text-transform: uppercase; margin-bottom: 48px; animation: loading-subtitle-in 0.6s 0.15s ease-out both;">深度研判中</div>
          <p :key="narrativeIdx" style="font-size: 14px; font-weight: 500; color: #3c3c43; margin: 0 0 28px; animation: narrative-fade 0.35s ease-out; min-height: 1.7em;">{{ NARRATIVE_TEXTS[narrativeIdx] }}</p>
          <div style="display: flex; gap: 8px;">
            <div v-for="i in [0, 1, 2]" :key="i" :style="{ width: '7px', height: '7px', borderRadius: '50%', background: '#007aff', opacity: 0.4, animation: `loading-dot 1.4s ${i * 0.22}s ease-in-out infinite` }"/>
          </div>
        </div>
      </div>

      <!-- ── Desktop: RESULT panel ── -->
      <div v-else-if="activePanel === 'result'" style="flex: 1; overflow-y: auto; padding: 32px 40px;">
        <!-- Empty state -->
        <div v-if="!sheetResult" style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: 16px; color: #8e8e93;">
          <svg width="56" height="56" viewBox="0 0 56 56" fill="none" style="opacity: 0.2;">
            <path d="M7 40L18 24L26 32L36 16L49 21" stroke="#1c1c1e" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
            <circle cx="49" cy="21" r="3.5" fill="#1c1c1e"/>
          </svg>
          <div style="font-size: 18px; font-weight: 700; color: #1c1c1e;">尚无分析结果</div>
          <div style="font-size: 14px; line-height: 1.6; text-align: center;">输入股票代码，AI 将生成买卖建议和深度研判</div>
          <button @click="activePanel = 'analyze'" style="margin-top: 8px; padding: 12px 28px; background: #007aff; color: white; border: none; border-radius: 12px; font-size: 15px; font-weight: 600; cursor: pointer;">开始分析</button>
        </div>

        <!-- Result content -->
        <div v-else style="max-width: 640px; margin: 0 auto;">
          <!-- Title row -->
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; flex-wrap: wrap; gap: 10px;">
            <div>
              <h2 style="font-size: 20px; font-weight: 700; letter-spacing: -0.4px; color: #1c1c1e; margin: 0 0 3px;">
                {{ sheetResult.data?.name || sheetResult.data?.symbol }}
                <span v-if="sheetResult.data?.name" style="font-size: 14px; font-weight: 400; color: #8e8e93;">({{ sheetResult.data?.symbol }})</span>
              </h2>
              <div style="font-size: 12px; color: #8e8e93;">{{ MARKET_LABELS[sheetResult.data?.market] || sheetResult.data?.market?.toUpperCase() }}</div>
            </div>
            <button @click="resultSheetOpen = true" style="height: 34px; padding: 0 16px; font-size: 13px; background: #007aff; border: none; border-radius: 8px; cursor: pointer; color: white; font-weight: 600;">
              查看完整分析
            </button>
          </div>

          <!-- Signal card -->
          <div style="background: white; border-radius: 16px; padding: 24px; margin-bottom: 16px;">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px;">
              <div>
                <div style="font-size: 13px; color: #8e8e93; margin-bottom: 4px;">研判信号</div>
                <div style="font-size: 32px; font-weight: 900; letter-spacing: -0.5px;"
                  :style="{ color: getActionDisplay(sheetResult.result?.action).color }">
                  {{ getActionDisplay(sheetResult.result?.action).text }}
                </div>
              </div>
              <div v-if="sheetResult.result?.confidence != null" style="text-align: right;">
                <div style="font-size: 13px; color: #8e8e93; margin-bottom: 4px;">置信度</div>
                <div style="font-size: 32px; font-weight: 900; color: #1c1c1e;">{{ sheetResult.result.confidence }}%</div>
              </div>
            </div>
            <p v-if="sheetResult.result?.reason" style="font-size: 14px; color: #3c3c43; line-height: 1.75; margin: 0; padding-top: 16px; border-top: 0.5px solid rgba(0,0,0,0.08);">
              {{ sheetResult.result.reason }}
            </p>
          </div>

          <!-- Key levels -->
          <div v-if="sheetResult.result?.target_price || sheetResult.result?.stop_loss" style="display: flex; gap: 12px; margin-bottom: 16px;">
            <div v-if="sheetResult.result?.target_price" style="flex: 1; background: white; border-radius: 12px; padding: 16px;">
              <div style="font-size: 12px; color: #8e8e93; margin-bottom: 4px;">目标价</div>
              <div style="font-size: 20px; font-weight: 700; color: #ef4444;">{{ sheetResult.result.target_price }}</div>
            </div>
            <div v-if="sheetResult.result?.stop_loss" style="flex: 1; background: white; border-radius: 12px; padding: 16px;">
              <div style="font-size: 12px; color: #8e8e93; margin-bottom: 4px;">止损价</div>
              <div style="font-size: 20px; font-weight: 700; color: #22c55e;">{{ sheetResult.result.stop_loss }}</div>
            </div>
          </div>

          <!-- Full analysis button -->
          <button @click="resultSheetOpen = true" style="width: 100%; height: 48px; background: white; border: 1px solid rgba(0,0,0,0.1); border-radius: 12px; font-size: 15px; font-weight: 600; color: #007aff; cursor: pointer;">
            查看完整深度分析 →
          </button>
        </div>
      </div>

    </div><!-- end workspace -->

    <!-- Desktop user popover -->
    <div v-if="dtUserMenuOpen && auth.isLoggedIn" style="position: fixed; top: auto; bottom: 80px; left: 220px; background: white; border-radius: 12px; box-shadow: 0 4px 24px rgba(0,0,0,0.14); z-index: 500; min-width: 180px; overflow: hidden; border: 0.5px solid rgba(0,0,0,0.1);">
      <button @click="() => { router.push('/account'); dtUserMenuOpen = false; }" style="display: flex; align-items: center; gap: 10px; width: 100%; padding: 12px 16px; background: none; border: none; border-bottom: 0.5px solid rgba(0,0,0,0.08); cursor: pointer; font-size: 14px; color: #1c1c1e; text-align: left;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        账号设置
      </button>
      <button v-if="tier !== 'premium'" @click="() => { router.push('/upgrade'); dtUserMenuOpen = false; }" style="display: flex; align-items: center; gap: 10px; width: 100%; padding: 12px 16px; background: none; border: none; border-bottom: 0.5px solid rgba(0,0,0,0.08); cursor: pointer; font-size: 14px; color: #1c1c1e; text-align: left;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
        升级套餐
      </button>
      <button @click="handleLogout" style="display: flex; align-items: center; gap: 10px; width: 100%; padding: 12px 16px; background: none; border: none; cursor: pointer; font-size: 14px; color: #ff3b30; text-align: left;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
        退出登录
      </button>
    </div>
    <div v-if="dtUserMenuOpen" @click="dtUserMenuOpen = false" style="position: fixed; inset: 0; z-index: 499;"/>

    <!-- Result sheet works on desktop too as an overlay -->
    <AnalysisResultSheet
      v-if="sheetResult"
      :isOpen="resultSheetOpen"
      :result="sheetResult"
      :tier="sheetTier"
      :period="analysisStore.period || period"
      :historyItems="history"
      :selectedHistoryId="selectedHistoryId"
      :isSaved="selectedHistoryId ? (history.find(h => h.id === selectedHistoryId)?.isFavorited ?? false) : false"
      :appName="appName"
      @close="resultSheetOpen = false"
      @save="handleToggleFavorite"
      @share="() => {}"
      @historySelect="(id: string) => { const item = history.find(h => h.id === id); if (item) { sheetResult = item.detail; selectedHistoryId = item.id; } }"
      @upgrade="router.push('/upgrade')"
    />

  </div><!-- end desktop -->


  <!-- ═══════════════════════════════════════════════════
       MOBILE LAYOUT (<1024px)
       ═══════════════════════════════════════════════════ -->
  <div v-else style="min-height: 100dvh; background: #f2f2f7;">

    <!-- ═══ MOBILE HEADER ═══ -->
    <header style="display: flex; align-items: center; justify-content: space-between; padding: 0 16px; height: 52px; position: sticky; top: 0; z-index: 100; background: rgba(249,249,249,0.94); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); border-bottom: 0.5px solid rgba(0,0,0,0.12);">
      <template v-if="activePanel === 'result'">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 20px; font-weight: 700; letter-spacing: -0.5px; color: #1c1c1e;">研判记录</span>
          <span v-if="history.length > 0" style="font-size: 11px; font-weight: 700; color: #fff; background: #aeaeb2; border-radius: 9999px; padding: 1px 7px; line-height: 1.6;">{{ history.length }}</span>
        </div>
        <button @click="setActivePanel('analyze')" style="display: flex; align-items: center; gap: 3px; padding: 7px 15px 7px 11px; background: #007aff; color: white; border: none; border-radius: 20px; font-size: 15px; font-weight: 600; cursor: pointer; -webkit-tap-highlight-color: transparent;">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1v12M1 7h12" stroke="white" stroke-width="2" stroke-linecap="round"/></svg>
          新分析
        </button>
      </template>
      <template v-else>
        <div style="display: flex; align-items: center; gap: 6px;">
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
            <rect x="2" y="9" width="5" height="7" rx="1.5" fill="#dc2626"/><line x1="4.5" y1="6" x2="4.5" y2="9" stroke="#dc2626" stroke-width="1.5" stroke-linecap="round"/><line x1="4.5" y1="16" x2="4.5" y2="19" stroke="#dc2626" stroke-width="1.5" stroke-linecap="round"/>
            <rect x="8.5" y="4" width="5" height="11" rx="1.5" fill="#34c759"/><line x1="11" y1="1.5" x2="11" y2="4" stroke="#34c759" stroke-width="1.5" stroke-linecap="round"/><line x1="11" y1="15" x2="11" y2="17.5" stroke="#34c759" stroke-width="1.5" stroke-linecap="round"/>
            <rect x="15" y="7" width="5" height="8" rx="1.5" fill="#dc2626"/><line x1="17.5" y1="4" x2="17.5" y2="7" stroke="#dc2626" stroke-width="1.5" stroke-linecap="round"/><line x1="17.5" y1="15" x2="17.5" y2="18" stroke="#dc2626" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          <span style="font-size: 15px; font-weight: 700; letter-spacing: -0.2px; color: #1c1c1e;">{{ appName }}</span>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <span :style="{ fontSize: '12px', fontWeight: 500, color: tier === 'premium' ? '#007aff' : tier === 'basic' ? '#007aff' : '#8e8e93' }">
            {{ tierLabel }} · {{ totalAvailable ?? '-' }}次
            <template v-if="tier === 'basic' && deepRemaining !== null">
              · 深度 {{ deepRemaining }}/{{ deepDailyLimit }}
            </template>
          </span>
          <button v-if="auth.isLoggedIn" @click="userMenuOpen = true" style="width: 32px; height: 32px; border-radius: 50%; background: #e9e9eb; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; -webkit-tap-highlight-color: transparent; color: #3c3c43;">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          </button>
          <template v-else>
            <NuxtLink to="/login" style="font-size: 15px; font-weight: 400; color: #007aff; text-decoration: none; padding: 6px 4px;">登录</NuxtLink>
            <NuxtLink :to="registerPath" style="font-size: 13px; font-weight: 600; color: white; background: #007aff; border-radius: 8px; padding: 6px 12px; text-decoration: none;">注册</NuxtLink>
          </template>
        </div>
      </template>
    </header>

    <!-- ═══ ANALYZE PANEL ═══ -->
    <template v-if="activePanel === 'analyze'">

      <!-- ── QUOTA EXHAUSTED: Premium tier ── -->
      <div v-if="showUpgradeBanner && tier === 'premium'" style="position: fixed; top: 52px; left: 0; right: 0; bottom: 56px; overflow-y: auto; z-index: 10; display: flex; flex-direction: column; height: calc(100dvh - 52px - 56px); background: #1c1c1e; align-items: center; justify-content: center; padding: 40px 24px; text-align: center;">
        <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -60%); width: 320px; height: 320px; border-radius: 50%; background: radial-gradient(circle, rgba(0,122,255,0.15) 0%, transparent 70%); pointer-events: none;"/>
        <div style="width: 72px; height: 72px; border-radius: 22px; background: linear-gradient(135deg, #007aff, #0a84ff); display: flex; align-items: center; justify-content: center; font-size: 36px; box-shadow: 0 8px 32px rgba(0,122,255,0.4); margin-bottom: 24px;">👑</div>
        <div style="font-size: 11px; font-weight: 700; color: #007aff; letter-spacing: 1.2px; text-transform: uppercase; margin-bottom: 12px;">专业版会员</div>
        <h2 style="font-size: 28px; font-weight: 800; color: #fff; margin: 0 0 10px; letter-spacing: -0.5px; line-height: 1.2;">今日研判已完成</h2>
        <p style="font-size: 14px; color: rgba(255,255,255,0.45); line-height: 1.7; max-width: 260px; margin: 0 0 36px;">
          今天的 {{ pricing?.premium?.daily_limit ?? 15 }} 次研判额度已用完<br/>明天凌晨将自动重置
        </p>
        <div style="background: rgba(0,122,255,0.15); border: 1px solid rgba(0,122,255,0.3); border-radius: 14px; padding: 14px 24px;">
          <div style="font-size: 12px; color: rgba(158,200,255,0.7); margin-bottom: 4px;">下次重置时间</div>
          <div style="font-size: 18px; font-weight: 700; color: #9ec8ff;">明天 00:00</div>
        </div>
      </div>

      <!-- ── QUOTA EXHAUSTED: Basic tier ── -->
      <div v-else-if="showUpgradeBanner && tier === 'basic'" style="position: fixed; top: 52px; left: 0; right: 0; bottom: 56px; overflow-y: auto; z-index: 10; background: #1c1c1e; display: flex; flex-direction: column;">
        <div style="padding: 32px 20px 24px; position: relative; overflow: hidden; flex-shrink: 0;">
          <div style="position: absolute; top: -60px; left: 50%; transform: translateX(-50%); width: 300px; height: 300px; border-radius: 50%; background: radial-gradient(circle, rgba(0,122,255,0.22) 0%, transparent 70%); pointer-events: none;"/>
          <div style="font-size: 11px; font-weight: 700; color: #007aff; letter-spacing: 1.2px; text-transform: uppercase; margin-bottom: 12px;">今日 {{ pricing?.basic?.daily_limit ?? 5 }} 次已用完</div>
          <h2 style="font-size: 32px; font-weight: 800; color: #fff; margin: 0 0 8px; letter-spacing: -0.5px; line-height: 1.15;">
            只差一步<br/><span style="color: #9ec8ff;">解锁专业版</span>
          </h2>
          <p style="font-size: 13px; color: rgba(255,255,255,0.4); margin: 0; line-height: 1.6;">明天自动重置 · 或每天 {{ pricing?.premium?.daily_limit ?? 15 }} 次无限制研判</p>
        </div>
        <div style="flex: 1; padding: 0 16px 16px; overflow-y: auto;">
          <NuxtLink to="/upgrade" style="display: flex; flex-direction: column; width: 100%; border-radius: 20px; border: 1.5px solid rgba(0,122,255,0.5); background: linear-gradient(160deg, #1c1c1e 0%, #2a2a32 60%, #20202a 100%); text-decoration: none; overflow: hidden; box-shadow: 0 8px 40px rgba(0,122,255,0.3);">
            <div style="padding: 20px 20px 16px; display: flex; align-items: flex-end; justify-content: space-between;">
              <div>
                <div style="font-size: 12px; font-weight: 700; color: #7fb4ff; margin-bottom: 6px;">👑 专业版</div>
                <div style="display: flex; align-items: baseline; gap: 1px;">
                  <span style="font-size: 14px; color: rgba(255,255,255,0.4);">¥</span>
                  <span style="font-size: 46px; font-weight: 900; color: #fff; letter-spacing: -2px; line-height: 1;">{{ pricing?.premium?.price ?? '49' }}</span>
                  <span style="font-size: 13px; color: rgba(255,255,255,0.4); margin-left: 2px;">/{{ pricing?.premium?.period ?? '月' }}</span>
                </div>
              </div>
              <div style="text-align: right; padding-bottom: 4px;">
                <div style="font-size: 56px; font-weight: 900; color: #9ec8ff; letter-spacing: -3px; line-height: 1;">{{ pricing?.premium?.daily_limit ?? 15 }}</div>
                <div style="font-size: 12px; color: rgba(158,200,255,0.6); margin-top: -2px;">次/天</div>
              </div>
            </div>
            <div style="height: 0.5px; background: rgba(0,122,255,0.3); margin: 0 20px;"/>
            <div style="padding: 14px 20px 18px; display: flex; flex-direction: column; gap: 10px;">
              <div style="font-size: 10px; font-weight: 700; color: rgba(167,139,250,0.6); text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 2px;">专业版独享</div>
              <div v-for="(item, i) in [{ icon: '⚡', text: '每天 15 次完整深度研判' }, { icon: '📍', text: '持仓参数个性化智能分析' }, { icon: '🔄', text: '连续多标的无缝查询' }]" :key="i" style="display: flex; align-items: center; gap: 10px;">
                <span style="width: 28px; height: 28px; border-radius: 8px; background: rgba(0,122,255,0.25); display: flex; align-items: center; justify-content: center; font-size: 14px; flex-shrink: 0;">{{ item.icon }}</span>
                <span style="font-size: 14px; color: rgba(255,255,255,0.8); font-weight: 500;">{{ item.text }}</span>
              </div>
            </div>
          </NuxtLink>
          <p style="font-size: 12px; color: rgba(255,255,255,0.2); text-align: center; margin: 12px 0 72px;">支付宝 · 微信支付 · 订阅后即时生效</p>
        </div>
      </div>

      <!-- ── QUOTA EXHAUSTED: Free / guest tier ── -->
      <div v-else-if="showUpgradeBanner" style="position: fixed; top: 52px; left: 0; right: 0; bottom: 56px; overflow-y: auto; z-index: 10; background: #f2f2f7; display: flex; flex-direction: column;">
        <div style="background: white; padding: 28px 20px 20px; flex-shrink: 0;">
          <div style="display: inline-flex; align-items: center; gap: 5px; background: #fff2f2; border-radius: 9999px; padding: 3px 10px; margin-bottom: 10px;">
            <span style="font-size: 10px; font-weight: 700; color: #ff3b30; letter-spacing: 0.5px; text-transform: uppercase;">今日限额</span>
          </div>
          <h2 style="font-size: 30px; font-weight: 800; color: #1c1c1e; margin: 0 0 6px; letter-spacing: -0.8px; line-height: 1.1;">免费次数用完了</h2>
          <p style="font-size: 14px; color: #8e8e93; margin: 0; line-height: 1.5;">明天自动重置 · 或升级继续分析</p>
        </div>
        <div style="height: 12px; flex-shrink: 0;"/>
        <div style="padding: 0 14px; display: flex; gap: 10px; flex-shrink: 0;">
          <!-- Basic card -->
          <NuxtLink to="/upgrade" style="flex: 1; border-radius: 20px; overflow: hidden; text-decoration: none; display: flex; flex-direction: column; box-shadow: 0 4px 20px rgba(0,122,255,0.2);">
            <div style="background: linear-gradient(160deg, #007aff 0%, #0a84ff 40%, #34aadc 100%); padding: 18px 16px 14px;">
              <div style="font-size: 10px; font-weight: 700; color: rgba(255,255,255,0.7); letter-spacing: 0.5px; margin-bottom: 6px;">📊 标准版</div>
              <div style="font-size: 38px; font-weight: 900; color: #fff; letter-spacing: -2px; line-height: 1; margin-bottom: 2px;">{{ pricing?.basic?.daily_limit ?? 5 }}<span style="font-size: 12px; font-weight: 400; margin-left: 3px;">次/天</span></div>
              <div style="font-size: 18px; font-weight: 800; color: #fff;">¥{{ pricing?.basic?.price ?? '19.9' }}<span style="font-size: 11px; font-weight: 400; color: rgba(255,255,255,0.6); margin-left: 2px;">/{{ pricing?.basic?.period ?? '月' }}</span></div>
            </div>
            <div style="background: white; padding: 12px 14px; flex: 1;">
              <div v-for="(f, i) in ['完整深度研判', '目标价·止损', '全市场覆盖']" :key="i" style="display: flex; align-items: center; gap: 7px; padding: 5px 0;" :style="i < 2 ? { borderBottom: '0.5px solid rgba(0,0,0,0.06)' } : {}">
                <span style="width: 14px; height: 14px; border-radius: 50%; background: #34c759; display: flex; align-items: center; justify-content: center; font-size: 9px; color: white; font-weight: 700; flex-shrink: 0;">✓</span>
                <span style="font-size: 12px; color: #1c1c1e;">{{ f }}</span>
              </div>
            </div>
          </NuxtLink>
          <!-- Premium card -->
          <NuxtLink to="/upgrade" style="flex: 1; border-radius: 20px; overflow: hidden; text-decoration: none; display: flex; flex-direction: column; position: relative; box-shadow: 0 6px 24px rgba(0,122,255,0.28);">
            <div style="position: absolute; top: -1px; left: 50%; transform: translateX(-50%); background: #1c1c1e; color: #fff; font-size: 9px; font-weight: 800; padding: 3px 10px; border-radius: 0 0 9px 9px; white-space: nowrap; z-index: 2;">最高权益</div>
            <div style="background: linear-gradient(160deg, #1c1c1e 0%, #2a2a32 50%, #0a84ff 100%); padding: 22px 16px 14px;">
              <div style="font-size: 10px; font-weight: 700; color: #7fb4ff; letter-spacing: 0.5px; margin-bottom: 6px;">👑 专业版</div>
              <div style="font-size: 38px; font-weight: 900; color: #fff; letter-spacing: -2px; line-height: 1; margin-bottom: 2px;">{{ pricing?.premium?.daily_limit ?? 15 }}<span style="font-size: 12px; font-weight: 400; color: rgba(255,255,255,0.6); margin-left: 3px;">次/天</span></div>
              <div style="font-size: 18px; font-weight: 800; color: #9ec8ff;">¥{{ pricing?.premium?.price ?? '49' }}<span style="font-size: 11px; font-weight: 400; color: rgba(158,200,255,0.5); margin-left: 2px;">/{{ pricing?.premium?.period ?? '月' }}</span></div>
            </div>
            <div style="background: #1c1c22; padding: 12px 14px; flex: 1;">
              <div v-for="(f, i) in ['完整深度研判', '持仓智能分析', '多标的查询']" :key="i" style="display: flex; align-items: center; gap: 7px; padding: 5px 0;" :style="i < 2 ? { borderBottom: '0.5px solid rgba(0,122,255,0.15)' } : {}">
                <span style="width: 14px; height: 14px; border-radius: 50%; background: #007aff; display: flex; align-items: center; justify-content: center; font-size: 9px; color: white; font-weight: 700; flex-shrink: 0;">✓</span>
                <span style="font-size: 12px; color: rgba(255,255,255,0.75);">{{ f }}</span>
              </div>
            </div>
          </NuxtLink>
        </div>
        <div style="padding: 14px 14px 0; flex-shrink: 0;">
          <div style="background: white; border-radius: 14px; padding: 12px 16px; display: flex; align-items: center; gap: 12px;">
            <div style="width: 32px; height: 32px; border-radius: 9px; background: #f2f2f7; display: flex; align-items: center; justify-content: center; font-size: 16px; flex-shrink: 0;">🆓</div>
            <div style="flex: 1;">
              <span style="font-size: 13px; color: #8e8e93;">免费版：每天 </span>
              <span style="font-size: 13px; font-weight: 700; color: #1c1c1e;">{{ pricing?.free?.daily_limit ?? 1 }} 次</span>
              <span style="font-size: 13px; color: #8e8e93;">，仅基础分析</span>
            </div>
            <span style="font-size: 11px; color: #aeaeb2;">当前</span>
          </div>
        </div>
        <div style="flex: 1; min-height: 0;"/>
        <div style="padding: 0 14px 80px; text-align: center;">
          <p style="font-size: 12px; color: #aeaeb2; margin: 0;">支付宝 · 微信支付 · 即时生效</p>
        </div>
      </div>

      <!-- ── Normal analyze form ── -->
      <div v-else style="background: white;">
        <!-- Pro trial ended info banner (registered users, mobile) -->
        <div v-if="showProTrialEndedBanner" style="padding: 12px 16px 0;">
          <TrialProTrialEndedBanner @dismiss="dismissProTrialEndedBanner" />
        </div>
        <div style="padding: 22px 16px 16px;">
          <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 16px; flex-wrap: wrap;">
            <h2 style="font-size: 28px; font-weight: 800; letter-spacing: -0.8px; color: #1c1c1e; margin: 0; line-height: 1.1;">{{ landingPrefilled ? '立即分析该标的' : '今天分析哪只？' }}</h2>
            <span v-if="isGuestTrial || isRegisteredProTrial" style="font-size: 12px; font-weight: 700; color: #007aff; background: #e7f1ff; border-radius: 20px; padding: 3px 10px; letter-spacing: 0.2px; line-height: 1.4;">专业版体验中</span>
          </div>
          <div v-if="landingPrefilled || inviteRewardText" style="margin-bottom: 16px; padding: 12px 14px; border-radius: 12px; background: #f0f9ff; border: 1px solid #bae6fd;">
            <div style="font-size: 14px; font-weight: 700; color: #075985;">已填入 {{ MARKET_LABELS[market] || market }} {{ symbol }}</div>
            <div v-if="inviteRewardText" style="font-size: 12px; color: #047857; margin-top: 4px; font-weight: 600;">{{ inviteRewardText }}</div>
          </div>
          <div style="margin-bottom: 16px;">
            <PwaInstallButton :appName="appName" variant="card" />
          </div>
          <div class="segmented">
            <button v-for="m in [{ v: 'a', l: 'A股' }, { v: 'hk', l: '港股' }, { v: 'us', l: '美股' }, { v: 'futures', l: '期货' }]" :key="m.v" class="segmented-item" :class="{ active: market === m.v }" @click="market = m.v">{{ m.l }}</button>
          </div>
        </div>
        <div style="height: 0.5px; background: rgba(60,60,67,0.1);"/>
        <div style="padding: 14px 16px 0; position: relative;">
          <div style="position: relative;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#aeaeb2" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="position: absolute; left: 14px; top: 50%; transform: translateY(-50%); pointer-events: none; z-index: 1;">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input ref="symbolInput" class="symbol-input" :value="symbol" @input="onSymbolInput" @keydown="onSymbolKeydown" @compositionstart="onSymbolCompositionStart" @compositionend="onSymbolCompositionEnd" :placeholder="market === 'a' ? '输入股票代码，如 600519' : market === 'hk' ? '输入港股代码，如 00700' : market === 'us' ? '输入美股代码，如 AAPL' : '输入期货代码，如 MA'" @keyup.enter="!showSuggestions || activeSuggIdx < 0 ? handleAnalyze() : undefined" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"/>
            <div v-if="selectedSymbolName && !showSuggestions" style="position: absolute; right: 14px; top: 50%; transform: translateY(-50%); font-size: 12px; color: #8e8e93; pointer-events: none; white-space: nowrap; max-width: 120px; overflow: hidden; text-overflow: ellipsis;">{{ selectedSymbolName }}</div>
          </div>
          <div v-if="showSuggestions && suggestions.length > 0" style="position: absolute; left: 16px; right: 16px; top: calc(100% + 4px); background: white; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.12); z-index: 200; overflow: hidden;">
            <button
              v-for="(s, i) in suggestions" :key="s.symbol"
              @click="selectSuggestion(s)"
              :style="{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                width: '100%', padding: '12px 16px',
                background: i === activeSuggIdx ? 'rgba(0,122,255,0.06)' : 'none',
                border: 'none', borderBottom: '0.5px solid rgba(0,0,0,0.06)',
                cursor: 'pointer', WebkitTapHighlightColor: 'transparent', textAlign: 'left',
              }"
            >
              <div><div style="font-size: 15px; font-weight: 600; color: #1c1c1e;">{{ s.symbol }}</div><div style="font-size: 12px; color: #8e8e93;">{{ s.name }}</div></div>
              <span style="font-size: 11px; color: #0071e3; background: rgba(0,122,255,0.1); padding: 2px 8px; border-radius: 9999px; font-weight: 600; flex-shrink: 0;">{{ MARKET_LABELS[s.market] || s.market }}</span>
            </button>
          </div>
        </div>
        <div style="padding: 12px 16px 16px;">
          <div style="display: flex; gap: 8px; overflow-x: auto; scrollbar-width: none; -webkit-overflow-scrolling: touch; padding-bottom: 2px;">
            <button v-for="s in (hotStocks.length ? hotStocks : [{ code: '600519', name: '贵州茅台', market: 'a' }, { code: '000858', name: '五粮液', market: 'a' }, { code: '300750', name: '宁德时代', market: 'a' }, { code: '600036', name: '招商银行', market: 'a' }])" :key="s.code" @click="selectHotStock(s)" style="display: flex; flex-direction: column; align-items: flex-start; padding: 8px 14px; min-height: 44px; min-width: 72px; background: white; border: none; border-radius: 10px; cursor: pointer; flex-shrink: 0; box-shadow: 0 1px 4px rgba(0,0,0,0.08); -webkit-tap-highlight-color: transparent;">
              <span style="font-size: 15px; font-weight: 600; color: #1c1c1e; line-height: 1.2; white-space: nowrap;">{{ s.name }}</span>
              <span style="font-size: 12px; color: #8e8e93; margin-top: 1px;">{{ s.code }}</span>
            </button>
            <button @click="loadHotStocks" style="flex-shrink: 0; width: 44px; height: 44px; border-radius: 10px; background: white; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 18px; color: #8e8e93; box-shadow: 0 1px 4px rgba(0,0,0,0.08); -webkit-tap-highlight-color: transparent;">↻</button>
          </div>
        </div>
        <div style="height: 0.5px; background: rgba(60,60,67,0.1);"/>
        <div style="background: white;">
          <!-- Premium: always-expanded layout -->
          <template v-if="effectiveTier === 'premium'">
            <!-- K线周期 -->
            <div style="padding: 12px 16px 10px;">
              <p style="font-size: 12px; font-weight: 600; color: #8e8e93; text-transform: uppercase; letter-spacing: 0.06em; margin: 0 0 8px;">K线周期</p>
              <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                <button v-for="p in PERIOD_OPTIONS" :key="p.value" class="period-chip" :class="{ active: period === p.value }" @click="period = p.value">{{ p.label }}</button>
              </div>
            </div>
            <div style="height: 0.5px; background: rgba(60,60,67,0.1); margin: 0 16px;"/>
            <!-- 多周期交叉分析 -->
            <div style="padding: 12px 16px 10px;">
              <div style="display: flex; align-items: center; justify-content: space-between;" :style="{ marginBottom: multiPeriodEnabled ? '10px' : 0 }">
                <p style="font-size: 12px; font-weight: 600; color: #8e8e93; text-transform: uppercase; letter-spacing: 0.06em; margin: 0;">多周期交叉分析</p>
                <label style="position: relative; display: inline-block; width: 44px; height: 26px; cursor: pointer;">
                  <input type="checkbox" v-model="multiPeriodEnabled" @change="!multiPeriodEnabled && toggleAuxPeriod('__clear__')" style="opacity: 0; width: 0; height: 0;"/>
                  <span :style="{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: multiPeriodEnabled ? '#34c759' : '#e5e5ea', borderRadius: '13px', transition: 'background 0.2s' }">
                    <span :style="{ position: 'absolute', top: '2px', left: multiPeriodEnabled ? '20px' : '2px', width: '22px', height: '22px', background: 'white', borderRadius: '50%', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left 0.2s' }"/>
                  </span>
                </label>
              </div>
              <div v-if="multiPeriodEnabled">
                <p style="font-size: 12px; color: #8e8e93; margin: 0 0 8px;">选择辅助周期（最多3个）</p>
                <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                  <button v-for="p in PERIOD_OPTIONS.filter(p => p.value !== period)" :key="p.value" class="period-chip" :class="{ active: auxiliaryPeriods.includes(p.value) }" :style="{ opacity: !auxiliaryPeriods.includes(p.value) && auxiliaryPeriods.length >= 3 ? 0.4 : 1 }" @click="toggleAuxPeriod(p.value)">{{ p.label }}</button>
                </div>
              </div>
            </div>
            <div style="height: 0.5px; background: rgba(60,60,67,0.1); margin: 0 16px;"/>
            <!-- 持仓参数 -->
            <div style="padding: 12px 16px 14px;">
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;">
                <p style="font-size: 12px; font-weight: 600; color: #8e8e93; text-transform: uppercase; letter-spacing: 0.06em; margin: 0;">持仓参数</p>
                <span style="font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 9999px; background: #e7f1ff; color: #007aff; letter-spacing: 0.2px;">专属功能</span>
              </div>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                <div>
                  <label style="font-size: 12px; color: #8e8e93; display: block; margin-bottom: 4px;">持有数量(股)</label>
                  <input v-model="holdingQuantity" inputmode="numeric" placeholder="如 1000" style="width: 100%; height: 44px; background: #f2f2f7; border: none; border-radius: 10px; padding: 0 14px; font-size: 15px; color: #1c1c1e; outline: none; box-sizing: border-box;"/>
                </div>
                <div>
                  <label style="font-size: 12px; color: #8e8e93; display: block; margin-bottom: 4px;">成本价</label>
                  <input v-model="costPrice" inputmode="decimal" placeholder="如 15.50" style="width: 100%; height: 44px; background: #f2f2f7; border: none; border-radius: 10px; padding: 0 14px; font-size: 15px; color: #1c1c1e; outline: none; box-sizing: border-box;"/>
                </div>
                <div style="grid-column: 1/-1;">
                  <label style="font-size: 12px; color: #8e8e93; display: block; margin-bottom: 4px;">最大持仓(股) — 不超过此仓位</label>
                  <input v-model="maxPosition" inputmode="numeric" placeholder="如 5000" style="width: 100%; height: 44px; background: #f2f2f7; border: none; border-radius: 10px; padding: 0 14px; font-size: 15px; color: #1c1c1e; outline: none; box-sizing: border-box;"/>
                </div>
                <p style="grid-column: 1/-1; font-size: 11px; color: #8e8e93; margin: 0;">不填=按空仓分析；若填写则 3 项需全部填写。</p>
              </div>
            </div>
          </template>
          <!-- Non-premium: collapsible -->
          <template v-else>
            <button class="adv-toggle" @click="advancedOpen = !advancedOpen">
              <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 15px; color: #3c3c43;">⚙ 高级设置</span>
                <span style="font-size: 12px; color: #8e8e93;">{{ PERIOD_OPTIONS.find(p => p.value === period)?.label }}</span>
              </div>
              <svg class="adv-chevron" :class="{ open: advancedOpen }" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#aeaeb2" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            <div v-if="advancedOpen" style="padding: 0 16px 16px;">
              <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px;">
                <button v-for="p in PERIOD_OPTIONS" :key="p.value" class="period-chip" :class="{ active: period === p.value }" @click="period = p.value">{{ p.label }}</button>
              </div>
              <NuxtLink to="/upgrade" style="display: flex; align-items: center; justify-content: space-between; padding: 14px 16px; background: linear-gradient(135deg, #f0f6ff, #e7f1ff); border-radius: 12px; text-decoration: none; margin-top: 8px;">
                <div><div style="font-size: 14px; font-weight: 700; color: #0a4da3;">持仓智能分析</div><div style="font-size: 12px; color: #007aff; margin-top: 2px;">专业版专属 · 个性化建议</div></div>
                <span style="font-size: 13px; font-weight: 600; color: #007aff;">升级 →</span>
              </NuxtLink>
            </div>
          </template>
        </div>
        <div style="height: calc(54px + 56px + 20px); background: white;"/>
      </div>

      <!-- ── FAB (tier-differentiated) ── -->
      <div class="fab-container">
        <div v-if="error" style="font-size: 13px; color: #ff3b30; margin-bottom: 8px; text-align: center;">{{ error }}</div>
        <!-- Quota exhausted CTAs -->
        <template v-if="showUpgradeBanner">
          <button v-if="tier === 'premium'" class="fab-btn" disabled style="background: rgba(0,122,255,0.25); color: rgba(158,200,255,0.6); cursor: default; opacity: 1;">
            明天重置 · 敬请期待
          </button>
          <button v-else class="fab-btn" @click="router.push('/upgrade')" :style="{ background: tier === 'basic' ? 'linear-gradient(135deg, #007aff, #0a84ff)' : 'linear-gradient(135deg, #ff9500, #ff6b00)', opacity: 1 }">
            {{ tier === 'basic' ? '升级专业版 →' : '立即升级 →' }}
          </button>
        </template>
        <!-- Normal analyze button -->
        <button v-else class="fab-btn" @click="handleAnalyze" :disabled="!symbol.trim() || isAnalyzing">
          {{ isAnalyzing ? '分析中…' : landingPrefilled ? '立即分析该标的' : '开始分析' }}
        </button>
      </div>
    </template>

    <!-- ═══ LOADING PANEL ═══ -->
    <template v-if="activePanel === 'loading'">
      <div style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; z-index: 300; background: #ffffff; display: flex; flex-direction: column; align-items: center; justify-content: center; overflow: hidden; text-align: center;">
        <div style="position: absolute; width: 360px; height: 360px; background: radial-gradient(circle at center, rgba(0,122,255,0.07) 0%, transparent 70%); border-radius: 50%; top: 50%; left: 50%; animation: loading-breathe 3.5s ease-in-out infinite; pointer-events: none;"/>
        <div v-if="analyzeTimedOut" style="display: flex; flex-direction: column; align-items: center; gap: 16px; max-width: 300px; padding: 0 40px; position: relative; z-index: 1;">
          <div style="font-size: 48px; line-height: 1;">⏰</div>
          <h2 style="font-size: 22px; font-weight: 700; color: #1c1c1e; margin: 0;">分析时间较长</h2>
          <p style="font-size: 15px; color: #8e8e93; line-height: 1.75; margin: 0;">AI 服务响应超过 3 分钟<br/>可等待继续，或返回重试</p>
          <button @click="activePanel = 'analyze'" style="margin-top: 8px; padding: 14px 40px; border-radius: 16px; background: #f2f2f7; border: none; font-size: 16px; font-weight: 600; color: #1c1c1e; cursor: pointer;">返回重试</button>
        </div>
        <div v-else style="position: relative; z-index: 1; display: flex; flex-direction: column; align-items: center; padding: 0 32px; width: 100%;">
          <div style="font-size: 72px; font-weight: 900; letter-spacing: -3px; color: #1c1c1e; line-height: 1; margin-bottom: 10px; animation: loading-symbol-in 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;">{{ analyzingSymbol }}</div>
          <div style="font-size: 13px; font-weight: 500; color: #aeaeb2; letter-spacing: 2.5px; text-transform: uppercase; margin-bottom: 64px; animation: loading-subtitle-in 0.6s 0.15s ease-out both;">深度研判中</div>
          <p :key="narrativeIdx" style="font-size: 15px; font-weight: 500; color: #3c3c43; line-height: 1.7; margin: 0 0 28px; animation: narrative-fade 0.35s ease-out; min-height: 1.7em;">{{ NARRATIVE_TEXTS[narrativeIdx] }}</p>
          <div style="display: flex; gap: 8px; align-items: center;">
            <div v-for="i in [0, 1, 2]" :key="i" :style="{ width: '7px', height: '7px', borderRadius: '50%', background: '#007aff', opacity: 0.4, animation: `loading-dot 1.4s ${i * 0.22}s ease-in-out infinite` }"/>
          </div>
        </div>
        <div style="position: absolute; bottom: 40px; left: 0; right: 0; display: flex; flex-direction: column; align-items: center; gap: 4px; pointer-events: none;">
          <p style="font-size: 12px; color: #c7c7cc; margin: 0;">预计耗时 1–3 分钟</p>
        </div>
      </div>
    </template>

    <!-- ═══ RESULT PANEL ═══ -->
    <template v-if="activePanel === 'result'">
      <div class="rg-screen">
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
        <div v-else class="rg-list">
          <template v-for="group in groupedHistory" :key="group.label">
            <div class="rg-group-label">{{ group.label }}</div>
            <button
              v-for="item in group.items"
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
                  <div v-if="item.isProTrial" class="rg-card-pro-trial-badge">
                    <span>✦</span>
                    <span>专业版体验</span>
                  </div>
                </div>
                <span class="rg-card-badge" :style="{ background: getActionDisplay(item.action).color }">{{ getActionDisplay(item.action).text }}</span>
              </div>
              <div v-if="item.confidence != null" class="rg-card-bar-row">
                <div class="rg-card-bar"><div class="rg-card-bar-fill" :style="{ width: `${item.confidence}%`, background: getActionDisplay(item.action).color }"/></div>
                <span class="rg-card-conf" :style="{ color: getActionDisplay(item.action).color }">{{ item.confidence }}%</span>
              </div>
              <p v-if="item.detail?.result?.reason" class="rg-card-reason">{{ item.detail.result.reason.slice(0, 68) }}…</p>
              <div class="rg-card-footer">
                <span class="rg-card-date">{{ item.analyzedAt ? formatCardTime(item.analyzedAt) : '' }}</span>
                <svg class="rg-card-chevron" width="7" height="12" viewBox="0 0 7 12" fill="none"><path d="M1 1l5 5-5 5" stroke="#c7c7cc" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </div>
            </button>
          </template>
        </div>
      </div>
      <div v-if="sheetResult && !resultSheetOpen" style="position: fixed; bottom: calc(env(safe-area-inset-bottom, 0px) + 72px); left: 16px; right: 16px; z-index: 50;">
        <button @click="resultSheetOpen = true" style="width: 100%; height: 52px; border-radius: 14px; background: linear-gradient(135deg, #007aff, #0a84ff); color: white; border: none; font-size: 16px; font-weight: 700; cursor: pointer; box-shadow: 0 4px 20px rgba(0,122,255,0.45); display: flex; align-items: center; justify-content: center; gap: 8px;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
          查看 {{ sheetResult?.data?.name || sheetResult?.data?.symbol }} 的分析结果
        </button>
      </div>
    </template>

    <!-- ═══ BOTTOM NAV ═══ -->
    <nav class="bottom-nav" aria-label="底部导航">
      <button class="bottom-nav-item" :class="{ active: activePanel === 'analyze' }" @click="setActivePanel('analyze')">
        <span class="bottom-nav-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" :stroke-width="activePanel === 'analyze' ? '2.2' : '1.7'" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>
          </svg>
        </span>
        <span>分析</span>
      </button>
      <button class="bottom-nav-item" :class="{ active: activePanel === 'result' }" @click="setActivePanel('result')">
        <span class="bottom-nav-icon" style="position: relative; display: inline-flex;">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" :stroke-width="activePanel === 'result' ? '2.2' : '1.7'" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
          </svg>
          <span v-if="unreadResults > 0 && activePanel !== 'result'" class="bottom-nav-badge bottom-nav-badge-pulse">{{ unreadResults > 9 ? '9+' : unreadResults }}</span>
          <span v-else-if="isAnalyzing && activePanel !== 'result'" style="position: absolute; top: -3px; right: -5px; width: 8px; height: 8px; background: #007aff; border-radius: 50%; border: 1.5px solid rgba(249,249,249,0.94); animation: badge-breathe 1.8s ease-in-out infinite;"/>
        </span>
        <span>结果</span>
      </button>
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

    <!-- ═══ RESULT SHEET ═══ -->
    <AnalysisResultSheet
      v-if="sheetResult"
      :isOpen="resultSheetOpen"
      :result="sheetResult"
      :tier="sheetTier"
      :period="analysisStore.period || period"
      :historyItems="history"
      :selectedHistoryId="selectedHistoryId"
      :isSaved="selectedHistoryId ? (history.find(h => h.id === selectedHistoryId)?.isFavorited ?? false) : false"
      :appName="appName"
      @close="resultSheetOpen = false"
      @save="handleToggleFavorite"
      @share="() => {}"
      @historySelect="(id: string) => { const item = history.find(h => h.id === id); if (item) { sheetResult = item.detail; selectedHistoryId = item.id; } }"
      @upgrade="router.push('/upgrade')"
    />

    <!-- ═══ USER MENU SHEET (mobile) ═══ -->
    <Teleport to="body">
      <div v-if="userMenuOpen" @click.self="userMenuOpen = false" style="position: fixed; inset: 0; z-index: 600; background: rgba(0,0,0,0.4);">
        <div style="position: absolute; bottom: 0; left: 0; right: 0; background: white; border-radius: 20px 20px 0 0; padding: 8px 0 calc(env(safe-area-inset-bottom, 0px) + 8px); animation: sheet-in 0.3s cubic-bezier(0.32, 0.72, 0, 1);">
          <!-- Drag handle -->
          <div style="width: 36px; height: 4px; background: #e5e5ea; border-radius: 2px; margin: 4px auto 16px;"/>
          <!-- User info -->
          <div style="display: flex; align-items: center; gap: 12px; padding: 0 20px 16px; border-bottom: 0.5px solid rgba(0,0,0,0.08);">
            <div style="width: 44px; height: 44px; border-radius: 50%; background: linear-gradient(135deg, #007aff, #5ac8fa); display: flex; align-items: center; justify-content: center; font-size: 18px; font-weight: 700; color: white; flex-shrink: 0;">
              {{ (auth.user?.email || '?')[0].toUpperCase() }}
            </div>
            <div>
              <div style="font-size: 16px; font-weight: 600; color: #1c1c1e;">{{ auth.user?.email }}</div>
              <div style="font-size: 13px; margin-top: 2px;" :style="{ color: tier === 'premium' ? '#007aff' : tier === 'basic' ? '#007aff' : '#8e8e93' }">{{ tierLabel }}</div>
            </div>
          </div>
          <!-- Menu items -->
          <button @click="() => { userMenuOpen = false; router.push('/account'); }" style="display: flex; align-items: center; gap: 14px; width: 100%; padding: 16px 20px; background: none; border: none; border-bottom: 0.5px solid rgba(0,0,0,0.06); cursor: pointer; text-align: left; -webkit-tap-highlight-color: transparent;">
            <div style="width: 32px; height: 32px; border-radius: 9px; background: #f2f2f7; display: flex; align-items: center; justify-content: center; font-size: 16px;">👤</div>
            <span style="font-size: 16px; color: #1c1c1e; font-weight: 500;">账号设置</span>
            <svg style="margin-left: auto;" width="7" height="12" viewBox="0 0 7 12" fill="none"><path d="M1 1l5 5-5 5" stroke="#c7c7cc" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
          <button v-if="tier !== 'premium'" @click="() => { userMenuOpen = false; router.push('/upgrade'); }" style="display: flex; align-items: center; gap: 14px; width: 100%; padding: 16px 20px; background: none; border: none; border-bottom: 0.5px solid rgba(0,0,0,0.06); cursor: pointer; text-align: left; -webkit-tap-highlight-color: transparent;">
            <div style="width: 32px; height: 32px; border-radius: 9px; background: linear-gradient(135deg, #f0f6ff, #e7f1ff); display: flex; align-items: center; justify-content: center; font-size: 16px;">⬆️</div>
            <span style="font-size: 16px; color: #1c1c1e; font-weight: 500;">升级套餐</span>
            <svg style="margin-left: auto;" width="7" height="12" viewBox="0 0 7 12" fill="none"><path d="M1 1l5 5-5 5" stroke="#c7c7cc" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
          <PwaInstallButton :appName="appName" variant="row" />
          <button @click="handleLogout" style="display: flex; align-items: center; gap: 14px; width: 100%; padding: 16px 20px; background: none; border: none; cursor: pointer; text-align: left; -webkit-tap-highlight-color: transparent;">
            <div style="width: 32px; height: 32px; border-radius: 9px; background: #fff2f2; display: flex; align-items: center; justify-content: center; font-size: 16px;">🚪</div>
            <span style="font-size: 16px; color: #ff3b30; font-weight: 500;">退出登录</span>
          </button>
        </div>
      </div>
    </Teleport>

    <!-- ═══ GUEST TRIAL ENDED ═══ -->
    <TrialGuestTrialEndedScreen v-if="showGuestTrialEndedScreen" :appName="appName" @dismiss="dismissGuestTrialScreen"/>

    <!-- ═══ PRO TRIAL WELCOME ═══ -->
    <TrialProTrialWelcomeModal v-if="showProTrialWelcomeModal" :appName="appName" @dismiss="activateTrial"/>

    <!-- ═══ PRO TRIAL IN PROGRESS (floating capsule, layout-agnostic) ═══ -->
    <TrialProTrialInProgressBanner v-if="showTrialInProgressBanner" />

    <!-- ═══ BACKGROUND ANALYSIS INDICATOR (premium) ═══ -->
    <AnalysisBackgroundAnalysisIndicator
      v-model="isBackgroundMode"
      :symbol="analyzingSymbol"
      :is-desktop="isDesktop"
    />

    <!-- ═══ ANALYSIS READY NOTIFICATION (premium) ═══ -->
    <AnalysisAnalysisReadyNotification
      v-model="showAnalysisNotification"
      :symbol="pendingResultSymbol"
      :is-desktop="isDesktop"
      @view="handleNotificationView"
      @dismiss="handleNotificationDismiss"
    />

  </div><!-- end mobile -->
</template>
