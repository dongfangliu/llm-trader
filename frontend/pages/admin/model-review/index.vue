<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import {
  PhArrowLeft,
  PhArrowsClockwise,
  PhCards,
  PhChartLineUp,
  PhCheckCircle,
  PhClockCounterClockwise,
  PhGauge,
  PhGlobeHemisphereEast,
  PhListChecks,
  PhMagnifyingGlass,
  PhPlay,
  PhPlus,
  PhSlidersHorizontal,
  PhWarningCircle,
  PhX,
  PhXCircle,
} from '@phosphor-icons/vue'
import api from '~/lib/api'
import { fetchOhlcv } from '~/composables/useMarketDataFetcher'
import { fetchHotA, fetchHotHk, type HotStock } from '~/composables/useHotStocksFetcher'
import MrButton from '~/components/model-review/MrButton.vue'
import MrMetric from '~/components/model-review/MrMetric.vue'
import MrMotion from '~/components/model-review/MrMotion.vue'
import MrShell from '~/components/model-review/MrShell.vue'
import MrStagePanel from '~/components/model-review/MrStagePanel.vue'
import MrState from '~/components/model-review/MrState.vue'
import MrStatusBadge from '~/components/model-review/MrStatusBadge.vue'

type Prediction = Record<string, any>
type Candidate = Record<string, any>

function getAdminHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('admin_token') : ''
  return { 'X-Admin-Token': token || '' }
}

const dashboard = ref<any>(null)
const todayPreds = ref<Prediction[]>([])
const historyPreds = ref<Prediction[]>([])
const settings = ref<Record<string, any>>({})
const candidates = ref<Candidate[]>([])
const diagnostics = ref<Record<string, any>>({})
const msg = ref('')
const msgType = ref<'ok' | 'err'>('ok')
const loading = ref('')
const initialLoading = ref(true)
const candidatesLoading = ref(false)
const generatingSymbols = ref<Set<string>>(new Set())
const activePanel = ref<'workflow' | 'history' | 'settings'>('workflow')
const historyStatus = ref('')
const showAdvanced = ref(false)
const showGenerationTools = ref(false)
const candidateMarket = ref<'all' | 'a' | 'hk'>('all')
const candidateSearch = ref('')
const settleProgress = ref<{ fetched: number; total: number; failed: number } | null>(null)
let toastTimer: number | null = null

const markets = ['a', 'hk']
const router = useRouter()

const manual = reactive({
  market: 'a',
  symbol: '',
  name: '',
})

const pendingPreds = computed(() => todayPreds.value.filter(p => p.status === 'pending'))
const approvedPreds = computed(() => todayPreds.value.filter(p => p.status === 'approved' || p.status === 'posted'))
const settledPreds = computed(() => todayPreds.value.filter(p => p.status === 'settled'))
const rejectedPreds = computed(() => todayPreds.value.filter(p => p.status === 'rejected'))
const dueSettlePreds = computed(() => approvedPreds.value.filter(p =>
  p.target_date && p.target_date <= localDateString() && !hasCompleteSettlement(p),
))
const candidateGroups = computed<Record<string, Candidate[]>>(() => {
  const term = candidateSearch.value.trim().toLowerCase()
  const matches = (c: Candidate) => {
    if (!term) return true
    return String(c.symbol || '').toLowerCase().includes(term)
      || String(c.name || '').toLowerCase().includes(term)
  }
  return {
    a: candidates.value.filter(c => c.market === 'a' && matches(c)),
    hk: candidates.value.filter(c => c.market === 'hk' && matches(c)),
  }
})
const filteredCandidates = computed(() => {
  const m = candidateMarket.value
  if (m === 'all') return [...candidateGroups.value.a, ...candidateGroups.value.hk]
  return candidateGroups.value[m] || []
})

const marketLabel: Record<string, string> = { a: 'A股', hk: '港股' }
const statusLabel: Record<string, string> = {
  pending: '待审核',
  approved: '已通过待结算',
  posted: '已发布待结算',
  rejected: '已拒绝',
  settled: '已结算复盘',
}
const directionLabel: Record<string, string> = { up: '看涨', down: '看跌', hold: '震荡' }

const accuracyLabel = computed(() => {
  const all = dashboard.value?.accuracy?.all
  if (!all) return '0%'
  return all.label || `${all.pct ?? 0}%`
})

const highConfAccuracyLabel = computed(() => {
  const hc = dashboard.value?.accuracy?.high_conf
  if (!hc) return '—'
  return hc.label || `${hc.pct ?? 0}%`
})

const highConfSettledCount = computed(() => {
  return dashboard.value?.accuracy?.high_conf?.total ?? 0
})

const nextAction = computed(() => {
  if (pendingPreds.value.length) {
    return { label: `${pendingPreds.value.length} 条待审核 · 立即处理`, action: 'review-first' }
  }
  if (candidates.value.some(c => !c.already_generated)) {
    return { label: '从候选生成分析', action: 'open-tools' }
  }
  if (approvedPreds.value.length) {
    return { label: `${approvedPreds.value.length} 条等待结算`, action: 'wait' }
  }
  return { label: '扫描候选或手动添加', action: 'open-tools' }
})

function showMsg(text: string, type: 'ok' | 'err' = 'ok') {
  msg.value = text
  msgType.value = type
  if (toastTimer) window.clearTimeout(toastTimer)
  if (type === 'ok') {
    toastTimer = window.setTimeout(() => { msg.value = '' }, 4000)
  } else {
    toastTimer = window.setTimeout(() => { msg.value = '' }, 8000)
  }
}

function dismissMsg() {
  if (toastTimer) window.clearTimeout(toastTimer)
  msg.value = ''
}

function apiErrorMessage(e: any, fallback: string) {
  const detail = e?.response?.data?.detail
  if (typeof detail === 'string' && detail.trim()) return detail
  if (detail?.message) return detail.message
  if (e?.message) return `${fallback}：${e.message}`
  return fallback
}

async function loadDashboard() {
  const res = await api.get('/api/admin/xbot/dashboard', { headers: getAdminHeaders() })
  dashboard.value = res.data
}

async function loadTodayPreds() {
  const all: Prediction[] = []
  const limit = 500
  let offset = 0
  while (true) {
    const res = await api.get('/api/admin/xbot/predictions', {
      params: { limit, offset },
      headers: getAdminHeaders(),
    })
    const batch = res.data || []
    all.push(...batch)
    if (batch.length < limit) break
    offset += limit
  }
  todayPreds.value = all
}

async function loadSettings() {
  const res = await api.get('/api/admin/xbot/settings', { headers: getAdminHeaders() })
  settings.value = res.data
}

async function loadHistory() {
  const params: Record<string, any> = { limit: 100 }
  if (historyStatus.value) params.status = historyStatus.value
  const res = await api.get('/api/admin/xbot/predictions', { params, headers: getAdminHeaders() })
  historyPreds.value = res.data
}

async function refreshAll() {
  initialLoading.value = true
  try {
    await Promise.all([loadDashboard(), loadTodayPreds(), loadSettings()])
  } catch (e: any) {
    showMsg(apiErrorMessage(e, '加载模型复盘数据失败'), 'err')
  } finally {
    initialLoading.value = false
  }
}

async function scanCandidates() {
  candidatesLoading.value = true
  showGenerationTools.value = true
  try {
    // 浏览器直连东方财富拉热门榜，绕开服务器 IP 限流
    const [aHot, hkHot] = await Promise.all([fetchHotA(20), fetchHotHk(20)])
    const body: { a: HotStock[] | null; hk: HotStock[] | null } = { a: aHot, hk: hkHot }
    const res = await api.post('/api/admin/xbot/candidates/client', body, { headers: getAdminHeaders() })
    candidates.value = res.data.candidates || []
    diagnostics.value = res.data.diagnostics || {}

    const browserMarkets: string[] = []
    if (aHot) browserMarkets.push('A股')
    if (hkHot) browserMarkets.push('港股')
    const fallbackMarkets: string[] = []
    if (!aHot) fallbackMarkets.push('A股')
    if (!hkHot) fallbackMarkets.push('港股')

    if (!candidates.value.length) {
      showMsg('未扫描到候选标的，请查看数据源状态和过滤原因', 'err')
    } else if (fallbackMarkets.length) {
      showMsg(`${browserMarkets.join('/')} 浏览器直连成功；${fallbackMarkets.join('/')} 走服务器兜底`)
    }
  } catch (e: any) {
    showMsg(apiErrorMessage(e, '扫描候选失败'), 'err')
  } finally {
    candidatesLoading.value = false
  }
}

async function addManual(generateNow = false) {
  if (!manual.symbol.trim()) {
    showMsg('请输入股票代码', 'err')
    return
  }
  loading.value = generateNow ? 'manual-generate' : 'manual-add'
  try {
    const res = await api.post('/api/admin/xbot/candidates/manual', {
      market: manual.market,
      symbol: manual.symbol,
      name: manual.name || undefined,
    }, { headers: getAdminHeaders() })
    const candidate = res.data.candidate
    candidates.value = [
      candidate,
      ...candidates.value.filter(c => !(c.market === candidate.market && c.symbol === candidate.symbol)),
    ]
    manual.symbol = ''
    manual.name = ''
    if (generateNow && !candidate.already_generated) {
      await generateSingle(candidate)
    } else {
      showMsg(candidate.already_generated ? '今天已存在该标的分析记录' : '已加入候选标的')
    }
  } catch (e: any) {
    showMsg(apiErrorMessage(e, '手动添加失败'), 'err')
  } finally {
    loading.value = ''
  }
}

function isGenerating(symbol: string) {
  return generatingSymbols.value.has(symbol)
}

async function generateSingle(c: Candidate) {
  generatingSymbols.value = new Set([...generatingSymbols.value, c.symbol])
  try {
    const res = await api.post('/api/admin/xbot/actions/generate-single', {
      symbol: c.symbol,
      market: c.market,
      name: c.name,
      hot_rank: c.hot_rank ?? 0,
    }, { headers: getAdminHeaders() })
    candidates.value = candidates.value.map(x => x.market === c.market && x.symbol === c.symbol
      ? { ...x, already_generated: true, existing_status: 'pending', existing_prediction_id: res.data?.id }
      : x)
    showMsg(`${c.name || c.symbol} 分析生成成功`)
    await Promise.all([loadTodayPreds(), loadDashboard()])
  } catch (e: any) {
    showMsg(apiErrorMessage(e, `${c.name || c.symbol} 分析生成失败`), 'err')
  } finally {
    const s = new Set(generatingSymbols.value)
    s.delete(c.symbol)
    generatingSymbols.value = s
  }
}

function predictionIdForCandidate(c: Candidate) {
  return c.existing_prediction_id
    || todayPreds.value.find(p => p.market === c.market && p.symbol === c.symbol)?.id
}

function openReview(id: string | number | null | undefined) {
  if (!id) {
    showMsg('未找到对应审核记录，请先刷新列表', 'err')
    return
  }
  router.push(`/admin/model-review/${id}`)
}

function openCandidateReview(c: Candidate) {
  openReview(predictionIdForCandidate(c))
}

async function approvePred(pred: Prediction) {
  loading.value = `approve-${pred.id}`
  try {
    await api.post(`/api/admin/xbot/predictions/${pred.id}/approve`, {}, { headers: getAdminHeaders() })
    showMsg('已通过审核')
    await refreshAll()
  } catch (e: any) {
    showMsg(apiErrorMessage(e, '通过失败'), 'err')
  } finally {
    loading.value = ''
  }
}

async function rejectPred(pred: Prediction) {
  loading.value = `reject-${pred.id}`
  try {
    await api.post(`/api/admin/xbot/predictions/${pred.id}/reject`, {}, { headers: getAdminHeaders() })
    showMsg('已拒绝')
    await refreshAll()
  } catch (e: any) {
    showMsg(apiErrorMessage(e, '拒绝失败'), 'err')
  } finally {
    loading.value = ''
  }
}

function localDateString(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function historyDaysForTarget(targetDate: string | null | undefined) {
  if (!targetDate) return 10
  const target = new Date(`${targetDate}T00:00:00`)
  if (Number.isNaN(target.getTime())) return 10
  const now = new Date()
  const diff = Math.ceil((now.getTime() - target.getTime()) / 86400000)
  return Math.max(10, diff + 10)
}

function hasCompleteSettlement(p: Prediction) {
  return p.actual_close != null && p.actual_change_pct != null && p.is_correct != null
}

async function settlePredictionsBatch(records: Prediction[], confirmText: string, emptyText: string, donePrefix: string) {
  if (!records.length) {
    showMsg(emptyText)
    return
  }
  if (!confirm(confirmText)) return
  loading.value = 'settle'
  settleProgress.value = null
  try {
    settleProgress.value = { fetched: 0, total: records.length, failed: 0 }

    // 浏览器并发拉行情，限制并发 6
    const settlements: { id: number; market: string; symbol: string; target_date: string; close: number; high?: number; low?: number }[] = []
    const concurrency = 6
    let cursor = 0

    async function worker() {
      while (cursor < records.length) {
        const idx = cursor++
        const pred = records[idx]
        try {
          const bars = await fetchOhlcv(pred.symbol, pred.market, 'daily', historyDaysForTarget(pred.target_date))
          const targetBar = bars.find(b => b.d === pred.target_date)
          if (targetBar && targetBar.c > 0) {
            settlements.push({
              id: pred.id,
              market: pred.market,
              symbol: pred.symbol,
              target_date: pred.target_date,
              close: targetBar.c,
              high: targetBar.h,
              low: targetBar.l,
            })
          } else {
            settleProgress.value!.failed += 1
          }
        } catch {
          settleProgress.value!.failed += 1
        } finally {
          settleProgress.value!.fetched += 1
        }
      }
    }

    const workers = Array.from({ length: Math.min(concurrency, pendingForToday.length) }, () => worker())
    await Promise.all(workers)

    if (!settlements.length) {
      showMsg('未能从浏览器拉到任何收盘价，结算未执行', 'err')
      return
    }

    const res = await api.post(
      '/api/admin/xbot/actions/settle/client',
      { settlements },
      { headers: getAdminHeaders() },
    )
    const { settled, missing, skipped, invalid } = res.data
    const failedCount = settleProgress.value.failed + (missing?.length || 0) + (skipped?.length || 0) + (invalid?.length || 0)
    if (failedCount) {
      showMsg(`${donePrefix} ${settled} 条；${failedCount} 条未匹配、跳过或拉取失败`, failedCount > settled ? 'err' : 'ok')
    } else {
      showMsg(`${donePrefix} ${settled} 条`)
    }
    await Promise.all([refreshAll(), loadHistory()])
  } catch (e: any) {
    showMsg(apiErrorMessage(e, '结算失败'), 'err')
  } finally {
    loading.value = ''
    settleProgress.value = null
  }
}

async function settleRecords() {
  await settlePredictionsBatch(
    dueSettlePreds.value,
    `确认结算全部到期待结算记录（${dueSettlePreds.value.length} 条）？`,
    '暂无到达目标日的待结算记录',
    '结算',
  )
}

async function resettleSettledRecords() {
  await settlePredictionsBatch(
    settledPreds.value,
    `确认按最新规则重新结算全部已结算记录（${settledPreds.value.length} 条）？会覆盖旧结果。`,
    '暂无已结算记录可重新结算',
    '重新结算',
  )
}

async function repredictPred(pred: Prediction) {
  if (!confirm(`重新预测会覆盖 ${pred.symbol_name || pred.symbol} 的当前分析并重置为待审核，确认？`)) return
  loading.value = `repredict-${pred.id}`
  try {
    await api.post(`/api/admin/xbot/predictions/${pred.id}/re-predict`, {}, { headers: getAdminHeaders() })
    showMsg(`${pred.symbol_name || pred.symbol} 已重新预测`)
    await Promise.all([loadHistory(), loadTodayPreds(), loadDashboard()])
  } catch (e: any) {
    showMsg(apiErrorMessage(e, '重新预测失败'), 'err')
  } finally {
    loading.value = ''
  }
}

async function settleSinglePred(pred: Prediction) {
  const note = pred.status === 'rejected'
    ? '（结算后状态会变为「已结算」，如需仍隐藏可再次拒绝）'
    : pred.status === 'settled'
      ? '（将以最新逻辑重新计算）'
      : ''
  if (!confirm(`为 ${pred.symbol_name || pred.symbol} 拉取目标日 ${pred.target_date} 收盘价并结算？${note}`)) return
  loading.value = `settle-${pred.id}`
  try {
    const bars = await fetchOhlcv(pred.symbol, pred.market, 'daily', historyDaysForTarget(pred.target_date))
    const targetBar = bars.find(b => b.d === pred.target_date)
    if (!targetBar || !(targetBar.c > 0)) {
      showMsg('未拉到目标日收盘价，结算失败', 'err')
      return
    }
    await api.post(
      `/api/admin/xbot/predictions/${pred.id}/settle`,
      { close: targetBar.c, high: targetBar.h, low: targetBar.l },
      { headers: getAdminHeaders() },
    )
    showMsg(`${pred.symbol_name || pred.symbol} 结算完成`)
    await Promise.all([loadHistory(), loadTodayPreds(), loadDashboard()])
  } catch (e: any) {
    showMsg(apiErrorMessage(e, '结算失败'), 'err')
  } finally {
    loading.value = ''
  }
}

async function rejectFromHistory(pred: Prediction) {
  if (!confirm(`确认拒绝 ${pred.symbol_name || pred.symbol}？已发布/已结算的将从公开列表移除。`)) return
  loading.value = `reject-${pred.id}`
  try {
    await api.post(`/api/admin/xbot/predictions/${pred.id}/reject`, {}, { headers: getAdminHeaders() })
    showMsg('已拒绝')
    await Promise.all([loadHistory(), loadTodayPreds(), loadDashboard()])
  } catch (e: any) {
    showMsg(apiErrorMessage(e, '拒绝失败'), 'err')
  } finally {
    loading.value = ''
  }
}

function canSettle(p: Prediction) {
  // 已拒绝也允许结算（之前的 ±0.5% 死区可能误拒）；已结算允许重算
  return p.status !== 'pending'
}

async function approveAllPending() {
  const ids = pendingPreds.value.map(p => p.id)
  if (!ids.length) return
  loading.value = 'bulk-approve'
  try {
    const res = await api.post('/api/admin/xbot/actions/bulk-approve', { ids }, { headers: getAdminHeaders() })
    showMsg(`${res.data?.approved ?? 0} 条记录已通过`)
    await refreshAll()
  } catch (e: any) {
    showMsg(apiErrorMessage(e, '批量通过失败'), 'err')
  } finally {
    loading.value = ''
  }
}

async function saveSettings() {
  loading.value = 'save-settings'
  try {
    await api.put('/api/admin/xbot/settings', settings.value, { headers: getAdminHeaders() })
    await api.post('/api/admin/xbot/actions/reload-scheduler', {}, { headers: getAdminHeaders() })
    showMsg('设置已保存')
    await loadDashboard()
  } catch (e: any) {
    showMsg(apiErrorMessage(e, '保存失败'), 'err')
  } finally {
    loading.value = ''
  }
}

function pctText(v: number | null | undefined) {
  if (v == null) return '待结算'
  return `${v >= 0 ? '+' : ''}${Number(v).toFixed(2)}%`
}

function hitLabel(p: Prediction) {
  if (p.settlement_verdict_label) return p.settlement_verdict_label
  if (p.is_correct === true) return '命中'
  if (p.is_correct === false) return '未命中'
  return '持平'
}

function settlementRuleLabel(p: Prediction) {
  return p.predicted_direction === 'hold' && p.settlement_rule_label ? p.settlement_rule_label : ''
}

function hitClass(p: Prediction) {
  if (p.is_correct === true) return 'is-hit'
  if (p.is_correct === false) return 'is-miss'
  return 'is-flat'
}

function filterReasonsText(value: any) {
  if (!value || typeof value !== 'object') return ''
  return Object.entries(value).map(([key, val]) => `${key}: ${val}`).join(' / ')
}

function handleNextAction() {
  const action = nextAction.value.action
  if (action === 'review-first') {
    const first = pendingPreds.value[0]
    if (first?.id) openReview(first.id)
    return
  }
  if (action === 'open-tools') {
    showGenerationTools.value = true
    if (!candidates.value.length && !candidatesLoading.value) {
      scanCandidates()
    }
    if (typeof window !== 'undefined') {
      window.setTimeout(() => {
        document.getElementById('mr-generation-tools')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 80)
    }
  }
}

onMounted(refreshAll)
</script>

<template>
  <MrShell title="模型复盘" back-to="/admin" back-label="后台">
    <template #backIcon>
      <PhArrowLeft :size="16" weight="bold" />
    </template>
    <template #titleIcon>
      <PhListChecks :size="18" weight="bold" />
    </template>
    <template #actions>
      <MrButton variant="ghost" size="sm" @click="refreshAll">
        <template #icon><PhArrowsClockwise :size="16" weight="bold" /></template>
        刷新
      </MrButton>
    </template>

    <transition name="mr-toast">
      <div v-if="msg" :class="['mr-toast', msgType]" role="status" :aria-live="msgType === 'err' ? 'assertive' : 'polite'">
        <span>{{ msg }}</span>
        <button v-if="msgType === 'err'" class="mr-toast-dismiss" aria-label="关闭提示" @click="dismissMsg">
          <PhX :size="14" weight="bold" />
        </button>
      </div>
    </transition>

    <MrMotion>
      <section class="mr-hero">
        <div class="mr-hero-main">
          <div class="mr-kicker">
            <PhGauge :size="16" weight="bold" />
            审核工作台
          </div>
          <h1 class="mr-title">模型复盘审核工作台</h1>
          <p class="mr-lead">
            候选扫描、单条生成、完整审核、通过公开与结算复盘集中在一条工作流里。
          </p>
          <div class="mr-next-action">
            <span class="mr-next-action-label">下一步</span>
            <button
              class="mr-btn mr-btn-primary"
              :disabled="nextAction.action === 'wait'"
              @click="handleNextAction"
            >
              <PhPlay :size="14" weight="bold" />
              {{ nextAction.label }}
            </button>
          </div>
        </div>
        <aside class="mr-hero-side">
          <div>
            <div class="mr-kicker">
              <PhClockCounterClockwise :size="16" weight="bold" />
              调度状态
            </div>
            <strong>{{ dashboard?.operation_mode === 'auto' ? 'Auto' : 'Manual' }}</strong>
            <small>
              {{ dashboard?.enabled ? '自动调度已启用' : '当前为手动运行' }}。
              生成 {{ dashboard?.predict_time || '-' }}，A股结算 {{ dashboard?.a_settle_time || '-' }}，港股结算 {{ dashboard?.hk_settle_time || '-' }}。
            </small>
          </div>
          <MrStatusBadge :status="dashboard?.enabled ? 'ok' : 'neutral'" :label="dashboard?.enabled ? '已启用' : '未启用'" />
        </aside>
      </section>
    </MrMotion>

    <nav class="mr-tabs" aria-label="模型复盘分区">
      <button :class="{ active: activePanel === 'workflow' }" @click="activePanel = 'workflow'">工作流</button>
      <button :class="{ active: activePanel === 'history' }" @click="activePanel = 'history'; loadHistory()">历史复盘</button>
      <button :class="{ active: activePanel === 'settings' }" @click="activePanel = 'settings'">运行设置</button>
    </nav>

    <section v-if="activePanel === 'workflow'">
      <div class="mr-metrics mr-metrics-scroll">
        <MrMetric label="候选标的" :value="candidates.length" sub="扫描或手动加入">
          <template #icon><PhMagnifyingGlass :size="18" weight="bold" /></template>
        </MrMetric>
        <MrMetric label="待审核" :value="pendingPreds.length" sub="建议逐条完整审核">
          <template #icon><PhWarningCircle :size="18" weight="bold" /></template>
        </MrMetric>
        <MrMetric label="已通过待结算" :value="approvedPreds.length" sub="目标日后结算">
          <template #icon><PhCheckCircle :size="18" weight="bold" /></template>
        </MrMetric>
        <MrMetric label="累计命中率" :value="accuracyLabel" :sub="`${dashboard?.totals?.settled ?? 0} 条已结算`">
          <template #icon><PhChartLineUp :size="18" weight="bold" /></template>
        </MrMetric>
        <MrMetric label="高置信命中率" :value="highConfAccuracyLabel" :sub="`${highConfSettledCount} 条达门槛`">
          <template #icon><PhChartLineUp :size="18" weight="bold" /></template>
        </MrMetric>
      </div>

      <MrState
        v-if="initialLoading"
        title="正在读取工作流"
        text="加载全部工作流记录、调度状态和运行设置。"
        variant="loading"
      />

      <template v-else>
        <MrStagePanel
          title="待审核"
          description="建议逐条进入完整审核页，依据检查清单决定通过或拒绝"
          :items="pendingPreds"
          empty="暂无待审核记录。"
          status="pending"
          :default-expanded="true"
        >
          <template #default="{ item }">
            <MrButton size="sm" variant="primary" @click="openReview(item.id)">完整审核</MrButton>
            <MrButton size="sm" variant="secondary" :disabled="loading === `approve-${item.id}`" @click="approvePred(item)">
              <template #icon><PhCheckCircle :size="15" weight="bold" /></template>
              快速通过
            </MrButton>
            <MrButton size="sm" variant="danger" :disabled="loading === `reject-${item.id}`" @click="rejectPred(item)">
              <template #icon><PhXCircle :size="15" weight="bold" /></template>
              拒绝
            </MrButton>
          </template>
        </MrStagePanel>

        <MrStagePanel
          title="已通过待结算"
          description="等待目标日结算自动更新结果"
          :items="approvedPreds"
          empty="暂无已通过记录。"
          status="approved"
          :default-expanded="true"
        >
          <template #default="{ item }">
            <MrButton size="sm" variant="secondary" @click="openReview(item.id)">查看</MrButton>
            <MrButton size="sm" variant="danger" :disabled="loading === `reject-${item.id}`" @click="rejectPred(item)">拒绝</MrButton>
          </template>
        </MrStagePanel>

        <MrStagePanel
          title="已结算复盘"
          description="可直接打开公开复盘验证内容"
          :items="settledPreds"
          empty="暂无结算复盘。"
          status="settled"
          :default-expanded="false"
        >
          <template #default="{ item }">
            <NuxtLink class="mr-btn mr-btn-secondary mr-btn-small" :to="`/research/${item.market}/${item.symbol}/${item.prediction_date}`" target="_blank">
              <PhGlobeHemisphereEast :size="15" weight="bold" />
              查看公开复盘
            </NuxtLink>
          </template>
        </MrStagePanel>

        <MrStagePanel
          title="已拒绝"
          description="不会进入公开档案"
          :items="rejectedPreds"
          empty="暂无已拒绝记录。"
          status="rejected"
          :default-expanded="false"
        >
          <template #default="{ item }">
            <MrButton size="sm" variant="secondary" @click="openReview(item.id)">查看</MrButton>
          </template>
        </MrStagePanel>

        <section id="mr-generation-tools" class="mr-panel">
          <header class="mr-panel-header">
            <div>
              <h2 class="mr-panel-title">
                <button
                  type="button"
                  class="mr-collapse-trigger"
                  :aria-expanded="showGenerationTools"
                  @click="showGenerationTools = !showGenerationTools"
                >
                  <span class="chevron" aria-hidden="true">▾</span>
                  生成工具
                </button>
              </h2>
              <p class="mr-panel-sub">扫描候选、手动添加、查看数据源诊断和高级批量操作。</p>
            </div>
            <div class="mr-toolbar-mini">
              <MrButton variant="primary" size="sm" :disabled="candidatesLoading" @click="scanCandidates">
                <template #icon><PhMagnifyingGlass :size="15" weight="bold" /></template>
                {{ candidatesLoading ? '扫描中' : '扫描候选' }}
              </MrButton>
              <MrButton variant="secondary" size="sm" :disabled="loading === 'settle'" @click="settleRecords">
                <template #icon><PhClockCounterClockwise :size="15" weight="bold" /></template>
                <template v-if="loading === 'settle' && settleProgress">
                  结算中 {{ settleProgress.fetched }}/{{ settleProgress.total }}
                </template>
                <template v-else-if="loading === 'settle'">
                  结算中
                </template>
                <template v-else>
                  结算到期（{{ dueSettlePreds.length }}）
                </template>
              </MrButton>
              <NuxtLink class="mr-btn mr-btn-secondary mr-btn-small" to="/admin/xbot-card-preview">
                <PhCards :size="15" weight="bold" />
                卡片
              </NuxtLink>
            </div>
          </header>

          <div v-show="showGenerationTools">
            <div class="mr-grid mr-grid-2 mr-grid-flow">
              <section class="mr-subpanel">
                <div class="mr-panel-header">
                  <div>
                    <h3 class="mr-subpanel-title">手动添加标的</h3>
                    <p class="mr-panel-sub">补充扫描结果之外的临时审核对象。</p>
                  </div>
                  <MrStatusBadge status="info" label="手动" />
                </div>
                <div class="mr-form-grid">
                  <label class="mr-field">
                    <span class="mr-label">市场</span>
                    <select v-model="manual.market" class="mr-select">
                      <option value="a">A股</option>
                      <option value="hk">港股</option>
                    </select>
                  </label>
                  <label class="mr-field">
                    <span class="mr-label">代码</span>
                    <input v-model.trim="manual.symbol" class="mr-input" placeholder="SZ000066 / 00700">
                  </label>
                  <label class="mr-field">
                    <span class="mr-label">名称</span>
                    <input v-model.trim="manual.name" class="mr-input" placeholder="可选">
                  </label>
                  <MrButton variant="secondary" :disabled="loading === 'manual-add'" @click="addManual(false)">
                    <template #icon><PhPlus :size="17" weight="bold" /></template>
                    加入候选
                  </MrButton>
                  <MrButton variant="primary" :disabled="loading === 'manual-generate'" @click="addManual(true)">
                    <template #icon><PhPlay :size="17" weight="bold" /></template>
                    加入并生成
                  </MrButton>
                </div>
              </section>

              <section class="mr-subpanel">
                <div class="mr-panel-header">
                  <div>
                    <h3 class="mr-subpanel-title">候选诊断</h3>
                    <p class="mr-panel-sub">数据源返回量、过滤量与错误原因。</p>
                  </div>
                  <MrStatusBadge :status="candidates.length ? 'ok' : 'neutral'" :label="`${candidates.length} 只`" />
                </div>
                <div class="mr-diag-grid">
                  <div v-for="m in markets" :key="m" class="mr-diag">
                    <div class="mr-record-title">
                      <strong>{{ marketLabel[m] }}</strong>
                      <MrStatusBadge :status="diagnostics[m]?.enabled === false ? 'neutral' : 'ok'" :label="diagnostics[m]?.enabled === false ? '未启用' : '已启用'" />
                    </div>
                    <div class="mr-diag-line">
                      <span>返回 {{ diagnostics[m]?.returned ?? 0 }}</span>
                      <span>请求 {{ diagnostics[m]?.requested ?? 0 }}</span>
                      <span>过滤 {{ diagnostics[m]?.filtered ?? 0 }}</span>
                    </div>
                    <div v-if="diagnostics[m]?.error" class="mr-diag-error">{{ diagnostics[m].error }}</div>
                    <div v-else-if="filterReasonsText(diagnostics[m]?.filter_reasons)" class="mr-diag-error">
                      {{ filterReasonsText(diagnostics[m]?.filter_reasons) }}
                    </div>
                  </div>
                </div>
              </section>
            </div>

            <section class="mr-subpanel">
              <div class="mr-panel-header">
                <div>
                  <h3 class="mr-subpanel-title">候选标的</h3>
                  <p class="mr-panel-sub">A股 {{ candidateGroups.a.length }} / 港股 {{ candidateGroups.hk.length }}</p>
                </div>
              </div>
              <div class="mr-filter-row">
                <div class="mr-chip-row" role="tablist" aria-label="市场筛选">
                  <button
                    type="button"
                    class="mr-chip"
                    :class="{ 'is-active': candidateMarket === 'all' }"
                    :aria-pressed="candidateMarket === 'all'"
                    @click="candidateMarket = 'all'"
                  >
                    全部
                    <span class="mr-chip-count">{{ candidates.length }}</span>
                  </button>
                  <button
                    type="button"
                    class="mr-chip"
                    :class="{ 'is-active': candidateMarket === 'a' }"
                    :aria-pressed="candidateMarket === 'a'"
                    @click="candidateMarket = 'a'"
                  >
                    A股
                    <span class="mr-chip-count">{{ candidateGroups.a.length }}</span>
                  </button>
                  <button
                    type="button"
                    class="mr-chip"
                    :class="{ 'is-active': candidateMarket === 'hk' }"
                    :aria-pressed="candidateMarket === 'hk'"
                    @click="candidateMarket = 'hk'"
                  >
                    港股
                    <span class="mr-chip-count">{{ candidateGroups.hk.length }}</span>
                  </button>
                </div>
                <input
                  v-model.trim="candidateSearch"
                  class="mr-input mr-input-sm"
                  placeholder="按代码或名称筛选"
                  aria-label="筛选候选"
                >
              </div>

              <MrState v-if="candidatesLoading && !candidates.length" title="扫描中" text="正在拉取候选标的，请稍候。" variant="loading" />
              <MrState v-else-if="!candidates.length" title="暂无候选" text="先扫描候选，或手动添加一只标的。" />
              <MrState v-else-if="!filteredCandidates.length" title="未匹配候选" text="试试清空筛选或切换市场。" />
              <template v-else>
                <div v-for="c in filteredCandidates" :key="`${c.market}-${c.symbol}`" class="mr-record">
                  <div class="mr-record-main">
                    <div class="mr-record-title">
                      <strong>{{ c.name || c.symbol }}</strong>
                      <MrStatusBadge :status="c.already_generated ? (c.existing_status || 'info') : 'neutral'" :label="c.already_generated ? (statusLabel[c.existing_status] || '已生成') : '未生成'" />
                    </div>
                    <div class="mr-record-meta">{{ marketLabel[c.market] }} / {{ c.symbol }} / 热度 {{ c.hot_rank ?? '-' }}</div>
                  </div>
                  <div class="mr-record-actions">
                    <MrButton
                      v-if="c.already_generated"
                      size="sm"
                      variant="secondary"
                      :disabled="!predictionIdForCandidate(c)"
                      @click="openCandidateReview(c)"
                    >
                      完整审核
                    </MrButton>
                    <MrButton v-else size="sm" variant="primary" :disabled="isGenerating(c.symbol)" @click="generateSingle(c)">
                      <template #icon><PhPlay :size="15" weight="bold" /></template>
                      {{ isGenerating(c.symbol) ? '生成中' : '生成分析' }}
                    </MrButton>
                  </div>
                </div>
              </template>
            </section>

            <section class="mr-subpanel mr-subpanel-quiet">
              <div class="mr-panel-header">
                <div>
                  <h3 class="mr-subpanel-title">高级批量操作</h3>
                  <p class="mr-panel-sub">对当前工作流全部记录执行快速操作，重算会覆盖旧结算结果。</p>
                </div>
                <MrButton variant="ghost" size="sm" @click="showAdvanced = !showAdvanced">
                  <template #icon><PhSlidersHorizontal :size="16" weight="bold" /></template>
                  {{ showAdvanced ? '收起' : '展开' }}
                </MrButton>
              </div>
              <div v-if="showAdvanced" class="mr-toolbar">
                <MrButton variant="secondary" :disabled="!pendingPreds.length || loading === 'bulk-approve'" @click="approveAllPending">
                  批量通过待审核（{{ pendingPreds.length }}）
                </MrButton>
                <MrButton variant="secondary" :disabled="!dueSettlePreds.length || loading === 'settle'" @click="settleRecords">
                  结算全部到期（{{ dueSettlePreds.length }}）
                </MrButton>
                <MrButton variant="secondary" :disabled="!settledPreds.length || loading === 'settle'" @click="resettleSettledRecords">
                  重新结算已结算（{{ settledPreds.length }}）
                </MrButton>
              </div>
            </section>
          </div>
        </section>
      </template>
    </section>

    <section v-else-if="activePanel === 'history'" class="mr-panel">
      <div class="mr-panel-header">
        <div>
          <h2 class="mr-panel-title">历史复盘</h2>
          <p class="mr-panel-sub">按状态筛选最近 100 条记录。</p>
        </div>
        <select v-model="historyStatus" class="mr-select" style="max-width: 180px" @change="loadHistory">
          <option value="">全部状态</option>
          <option value="approved">已通过</option>
          <option value="settled">已结算</option>
          <option value="rejected">已拒绝</option>
        </select>
      </div>
      <div v-if="historyPreds.length" class="mr-list-table">
        <div v-for="p in historyPreds" :key="p.id" class="mr-list-row">
          <div>
            <strong>{{ p.symbol_name }}</strong>
            <span
              v-if="p.met_confidence === false"
              style="display:inline-flex;align-items:center;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600;color:#8e8e93;background:rgba(120,120,128,0.12);letter-spacing:0.2px;margin-left:6px;"
              :title="`未达置信门槛 · ${p.attempts || 1} 次尝试`"
            >best-effort ×{{ p.attempts || 1 }}</span>
            <span>{{ p.market }} / {{ p.symbol }} / {{ p.prediction_date }}</span>
          </div>
          <div><strong>{{ directionLabel[p.predicted_direction] || p.predicted_direction }}</strong><span>目标日 {{ p.target_date || '-' }}</span></div>
          <div>
            <strong>
              {{ pctText(p.actual_change_pct) }}
              <span v-if="p.status === 'settled'" :class="['mr-hit-badge', hitClass(p)]">{{ hitLabel(p) }}</span>
              <span v-if="settlementRuleLabel(p)" class="mr-rule-badge">{{ settlementRuleLabel(p) }}</span>
            </strong>
            <span>结算涨跌</span>
          </div>
          <div class="mr-row-actions">
            <MrButton size="sm" variant="secondary" @click="openReview(p.id)">查看</MrButton>
            <MrButton
              size="sm"
              variant="ghost"
              :disabled="loading === `repredict-${p.id}`"
              @click="repredictPred(p)"
            >
              {{ loading === `repredict-${p.id}` ? '生成中' : '重新预测' }}
            </MrButton>
            <MrButton
              size="sm"
              variant="primary"
              :disabled="!canSettle(p) || loading === `settle-${p.id}`"
              @click="settleSinglePred(p)"
            >
              {{ loading === `settle-${p.id}` ? '结算中' : '结算' }}
            </MrButton>
            <MrButton
              size="sm"
              variant="danger"
              :disabled="p.status === 'rejected' || loading === `reject-${p.id}`"
              @click="rejectFromHistory(p)"
            >
              {{ loading === `reject-${p.id}` ? '处理中' : '拒绝' }}
            </MrButton>
          </div>
        </div>
      </div>
      <MrState v-else title="暂无历史记录" text="切换状态或先完成审核与结算。" />
    </section>

    <section v-else class="mr-panel">
      <div class="mr-panel-header">
        <div>
          <h2 class="mr-panel-title">运行设置</h2>
          <p class="mr-panel-sub">影响自动候选、生成时间和结算时间。</p>
        </div>
        <MrStatusBadge :status="settings.xbot_enabled === 'true' ? 'ok' : 'neutral'" :label="settings.xbot_enabled === 'true' ? '自动调度' : '手动模式'" />
      </div>
      <div class="mr-grid mr-grid-2">
        <label class="mr-field">
          <span class="mr-label">启用自动调度</span>
          <input v-model="settings.xbot_enabled" true-value="true" false-value="false" type="checkbox">
        </label>
        <label class="mr-field">
          <span class="mr-label">运行模式</span>
          <select v-model="settings.xbot_operation_mode" class="mr-select">
            <option value="manual">手动</option>
            <option value="auto">自动</option>
          </select>
        </label>
        <label class="mr-field"><span class="mr-label">市场</span><input v-model="settings.xbot_markets" class="mr-input" placeholder="a,hk"></label>
        <label class="mr-field"><span class="mr-label">每市场候选数</span><input v-model="settings.xbot_hot_stock_count" class="mr-input" type="number"></label>
        <label class="mr-field"><span class="mr-label">A股最低价格</span><input v-model="settings.xbot_min_price_a" class="mr-input" type="number"></label>
        <label class="mr-field"><span class="mr-label">港股最低价格</span><input v-model="settings.xbot_min_price_hk" class="mr-input" type="number"></label>
        <label class="mr-field"><span class="mr-label">A股结算时间</span><input v-model="settings.xbot_a_settle_time" class="mr-input" type="time"></label>
        <label class="mr-field"><span class="mr-label">港股结算时间</span><input v-model="settings.xbot_hk_settle_time" class="mr-input" type="time"></label>
        <label class="mr-field"><span class="mr-label">生成时间</span><input v-model="settings.xbot_predict_time" class="mr-input" type="time"></label>
        <label class="mr-field"><span class="mr-label">公开页链接兜底</span><input v-model="settings.xbot_product_url" class="mr-input" placeholder="App Base URL 缺失时使用"></label>
      </div>
      <div class="mr-toolbar" style="margin-top: 16px">
        <MrButton variant="primary" :disabled="loading === 'save-settings'" @click="saveSettings">
          {{ loading === 'save-settings' ? '保存中' : '保存设置' }}
        </MrButton>
      </div>
    </section>
  </MrShell>
</template>

<style scoped>
.mr-next-action {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  margin-top: 22px;
  padding: 10px 12px 10px 16px;
  border: 1px solid var(--mr-line);
  border-radius: 999px;
  background: rgba(47, 111, 104, .06);
}

.mr-next-action-label {
  color: var(--mr-muted);
  font-size: 12px;
  font-weight: 720;
  letter-spacing: .04em;
  text-transform: uppercase;
}

.mr-toast {
  display: inline-flex;
  align-items: center;
  gap: 12px;
}

.mr-toast-dismiss {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: 0;
  border-radius: 50%;
  background: rgba(255, 255, 255, .18);
  color: inherit;
  cursor: pointer;
}

.mr-toast-dismiss:hover {
  background: rgba(255, 255, 255, .28);
}

.mr-toast-enter-active,
.mr-toast-leave-active {
  transition: opacity .18s ease, transform .18s ease;
}

.mr-toast-enter-from,
.mr-toast-leave-to {
  opacity: 0;
  transform: translate(-50%, -8px);
}

.mr-subpanel {
  border: 1px solid #edf0ec;
  border-radius: var(--mr-radius-sm);
  padding: 14px 14px 16px;
  background: #fafbf8;
  margin-bottom: 12px;
}

.mr-subpanel-quiet {
  background: transparent;
  border-style: dashed;
}

.mr-subpanel-title {
  margin: 0;
  color: var(--mr-text);
  font-size: 14px;
  font-weight: 800;
}

.mr-toolbar-mini {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.mr-filter-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.mr-input-sm {
  height: 36px;
  max-width: 240px;
}

.mr-row-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.mr-hit-badge {
  display: inline-flex;
  align-items: center;
  margin-left: 8px;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.2px;
  vertical-align: middle;
}

.mr-hit-badge.is-hit {
  color: #1f7a45;
  background: rgba(52, 199, 89, 0.16);
}

.mr-hit-badge.is-miss {
  color: #c0392b;
  background: rgba(255, 59, 48, 0.14);
}

.mr-hit-badge.is-flat {
  color: #8e8e93;
  background: rgba(120, 120, 128, 0.14);
}

.mr-rule-badge {
  display: inline-flex;
  align-items: center;
  margin-left: 6px;
  padding: 2px 7px;
  border: 1px solid rgba(47, 111, 104, .22);
  border-radius: 999px;
  color: var(--mr-accent-strong);
  background: rgba(47, 111, 104, .07);
  font-size: 11px;
  font-weight: 720;
  letter-spacing: 0.2px;
  vertical-align: middle;
}

@media (max-width: 760px) {
  .mr-next-action {
    width: 100%;
    margin-top: 16px;
  }

  .mr-next-action .mr-btn {
    flex: 1;
  }

  .mr-filter-row {
    flex-direction: column;
    align-items: stretch;
  }

  .mr-input-sm {
    max-width: none;
    width: 100%;
  }

  .mr-toolbar-mini {
    width: 100%;
    justify-content: flex-start;
  }
}
</style>
