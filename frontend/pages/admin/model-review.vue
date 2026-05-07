<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import api from '~/lib/api'

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
const candidatesLoading = ref(false)
const generatingSymbols = ref<Set<string>>(new Set())
const activePanel = ref<'workflow' | 'history' | 'settings'>('workflow')
const historyStatus = ref('')
const showAdvanced = ref(false)

const manual = reactive({
  market: 'a',
  symbol: '',
  name: '',
})

const pendingPreds = computed(() => todayPreds.value.filter(p => p.status === 'pending'))
const approvedPreds = computed(() => todayPreds.value.filter(p => p.status === 'approved'))
const settledPreds = computed(() => todayPreds.value.filter(p => p.status === 'settled' || p.status === 'posted'))
const rejectedPreds = computed(() => todayPreds.value.filter(p => p.status === 'rejected'))
const candidateGroups = computed(() => ({
  a: candidates.value.filter(c => c.market === 'a'),
  hk: candidates.value.filter(c => c.market === 'hk'),
}))

const marketLabel: Record<string, string> = { a: 'A 股', hk: '港股' }
const statusLabel: Record<string, string> = {
  pending: '待审核',
  approved: '已通过待结算',
  rejected: '已拒绝',
  settled: '已结算复盘',
  posted: '历史已归档',
}
const directionLabel: Record<string, string> = { up: '看涨', down: '看跌', hold: '震荡' }
const statusColor: Record<string, string> = {
  pending: '#b45309',
  approved: '#1d4ed8',
  rejected: '#6b7280',
  settled: '#047857',
  posted: '#047857',
}

function showMsg(text: string, type: 'ok' | 'err' = 'ok') {
  msg.value = text
  msgType.value = type
  window.setTimeout(() => { msg.value = '' }, 2800)
}

async function loadDashboard() {
  const res = await api.get('/api/admin/xbot/dashboard', { headers: getAdminHeaders() })
  dashboard.value = res.data
}

async function loadTodayPreds() {
  const today = new Date().toISOString().slice(0, 10)
  const res = await api.get('/api/admin/xbot/predictions', {
    params: { prediction_date: today, limit: 100 },
    headers: getAdminHeaders(),
  })
  todayPreds.value = res.data
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
  await Promise.all([loadDashboard(), loadTodayPreds(), loadSettings()])
}

async function scanCandidates() {
  candidatesLoading.value = true
  try {
    const res = await api.get('/api/admin/xbot/candidates', { headers: getAdminHeaders() })
    candidates.value = res.data.candidates || []
    diagnostics.value = res.data.diagnostics || {}
    if (!candidates.value.length) showMsg('未扫描到候选标的，请查看数据源状态和过滤原因', 'err')
  } catch (e: any) {
    showMsg(e.response?.data?.detail || '扫描候选失败', 'err')
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
    showMsg(e.response?.data?.detail || '手动添加失败', 'err')
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
    await api.post('/api/admin/xbot/actions/generate-single', {
      symbol: c.symbol,
      market: c.market,
      name: c.name,
      hot_rank: c.hot_rank ?? 0,
    }, { headers: getAdminHeaders() })
    candidates.value = candidates.value.map(x => x.market === c.market && x.symbol === c.symbol
      ? { ...x, already_generated: true, existing_status: 'pending' }
      : x)
    showMsg(`${c.name || c.symbol} 分析生成成功`)
    await Promise.all([loadTodayPreds(), loadDashboard()])
  } catch (e: any) {
    showMsg(e.response?.data?.detail || `${c.name || c.symbol} 分析生成失败`, 'err')
  } finally {
    const s = new Set(generatingSymbols.value)
    s.delete(c.symbol)
    generatingSymbols.value = s
  }
}

async function approvePred(pred: Prediction) {
  loading.value = `approve-${pred.id}`
  try {
    await api.post(`/api/admin/xbot/predictions/${pred.id}/approve`, {}, { headers: getAdminHeaders() })
    showMsg('已通过审核')
    await refreshAll()
  } catch (e: any) {
    showMsg(e.response?.data?.detail || '通过失败', 'err')
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
    showMsg(e.response?.data?.detail || '拒绝失败', 'err')
  } finally {
    loading.value = ''
  }
}

async function settleRecords() {
  if (!confirm('确认结算已通过且到达目标日的模型复盘记录？')) return
  loading.value = 'settle'
  try {
    await api.post('/api/admin/xbot/actions/settle', {}, { headers: getAdminHeaders() })
    showMsg('结算任务已启动，稍后刷新查看')
    window.setTimeout(() => { refreshAll(); loadHistory() }, 8000)
  } catch (e: any) {
    showMsg(e.response?.data?.detail || '结算失败', 'err')
  } finally {
    loading.value = ''
  }
}

async function approveAllPending() {
  const ids = pendingPreds.value.map(p => p.id)
  if (!ids.length) return
  loading.value = 'bulk-approve'
  try {
    await api.post('/api/admin/xbot/actions/bulk-approve', { ids }, { headers: getAdminHeaders() })
    showMsg(`${ids.length} 条记录已通过`)
    await refreshAll()
  } catch (e: any) {
    showMsg(e.response?.data?.detail || '批量通过失败', 'err')
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
    showMsg(e.response?.data?.detail || '保存失败', 'err')
  } finally {
    loading.value = ''
  }
}

function pctText(v: number | null | undefined) {
  if (v == null) return '-'
  return `${v >= 0 ? '+' : ''}${Number(v).toFixed(2)}%`
}

onMounted(refreshAll)
</script>

<template>
  <div class="page">
    <header class="topbar">
      <NuxtLink to="/admin" class="back">返回</NuxtLink>
      <strong>模型复盘</strong>
      <button class="text-btn" @click="refreshAll">刷新</button>
    </header>

    <div v-if="msg" :class="['toast', msgType]">{{ msg }}</div>

    <nav class="tabs">
      <button :class="{ active: activePanel === 'workflow' }" @click="activePanel = 'workflow'">工作流</button>
      <button :class="{ active: activePanel === 'history' }" @click="activePanel = 'history'; loadHistory()">历史复盘</button>
      <button :class="{ active: activePanel === 'settings' }" @click="activePanel = 'settings'">运行设置</button>
    </nav>

    <main class="content">
      <section v-if="activePanel === 'workflow'">
        <div v-if="dashboard" class="stats">
          <div><b>{{ candidates.length }}</b><span>候选标的</span></div>
          <div><b>{{ pendingPreds.length }}</b><span>待审核</span></div>
          <div><b>{{ approvedPreds.length }}</b><span>已通过待结算</span></div>
          <div><b>{{ dashboard.accuracy?.all?.pct ?? 0 }}%</b><span>累计命中率</span></div>
        </div>

        <div class="toolbar">
          <button class="primary" :disabled="candidatesLoading" @click="scanCandidates">
            {{ candidatesLoading ? '扫描中...' : '扫描候选' }}
          </button>
          <button class="secondary" :disabled="loading === 'settle'" @click="settleRecords">
            {{ loading === 'settle' ? '结算中...' : '结算' }}
          </button>
          <NuxtLink class="secondary link" to="/admin/model-review-cards">卡片预览</NuxtLink>
        </div>

        <section class="panel">
          <div class="panel-title">
            <span>手动添加标的</span>
          </div>
          <div class="manual-form">
            <select v-model="manual.market">
              <option value="a">A 股</option>
              <option value="hk">港股</option>
            </select>
            <input v-model.trim="manual.symbol" placeholder="例如 SZ000066 / 00700">
            <input v-model.trim="manual.name" placeholder="名称可选">
            <button class="secondary" :disabled="loading === 'manual-add'" @click="addManual(false)">加入候选</button>
            <button class="primary" :disabled="loading === 'manual-generate'" @click="addManual(true)">加入并生成</button>
          </div>
        </section>

        <section class="panel">
          <div class="panel-title">
            <span>候选标的</span>
            <small>A 股 {{ candidateGroups.a.length }} / 港股 {{ candidateGroups.hk.length }}</small>
          </div>
          <div class="diagnostics">
            <div v-for="m in ['a', 'hk']" :key="m" class="diag">
              <strong>{{ marketLabel[m] }}</strong>
              <span>{{ diagnostics[m]?.enabled === false ? '未启用' : '已启用' }}</span>
              <span>返回 {{ diagnostics[m]?.returned ?? 0 }} / 请求 {{ diagnostics[m]?.requested ?? 0 }}</span>
              <span>过滤 {{ diagnostics[m]?.filtered ?? 0 }}</span>
              <em v-if="diagnostics[m]?.error">{{ diagnostics[m].error }}</em>
              <em v-else-if="diagnostics[m]?.filter_reasons && Object.keys(diagnostics[m].filter_reasons).length">
                {{ diagnostics[m].filter_reasons }}
              </em>
            </div>
          </div>
          <div v-if="!candidates.length" class="empty">先扫描候选，或手动添加一只标的。</div>
          <template v-for="m in ['a', 'hk']" :key="m">
            <div v-if="candidateGroups[m].length" class="market-group">{{ marketLabel[m] }}</div>
            <div v-for="c in candidateGroups[m]" :key="`${c.market}-${c.symbol}`" class="record">
              <div class="record-main">
                <strong>{{ c.name || c.symbol }}</strong>
                <span>{{ marketLabel[c.market] }} / {{ c.symbol }} / 热度 {{ c.hot_rank ?? '-' }}</span>
              </div>
              <div class="record-actions">
                <span v-if="c.already_generated" class="state">{{ statusLabel[c.existing_status] || '已生成' }}</span>
                <button v-else class="small ok" :disabled="isGenerating(c.symbol)" @click="generateSingle(c)">
                  {{ isGenerating(c.symbol) ? '生成中...' : '生成分析' }}
                </button>
              </div>
            </div>
          </template>
        </section>

        <StagePanel title="待生成" :items="[]" empty="候选标的生成分析后会进入待审核。" />

        <StagePanel title="待审核" :items="pendingPreds" empty="暂无待审核记录。">
          <template #default="{ item }">
            <NuxtLink class="small" :to="`/admin/model-review/${item.id}`">完整审核</NuxtLink>
            <button class="small ok" @click="approvePred(item)">通过</button>
            <button class="small danger" @click="rejectPred(item)">拒绝</button>
          </template>
        </StagePanel>

        <StagePanel title="已通过待结算" :items="approvedPreds" empty="暂无已通过记录。">
          <template #default="{ item }">
            <NuxtLink class="small" :to="`/admin/model-review/${item.id}`">查看</NuxtLink>
            <button class="small danger" @click="rejectPred(item)">拒绝</button>
          </template>
        </StagePanel>

        <StagePanel title="已结算复盘" :items="settledPreds" empty="暂无结算复盘。">
          <template #default="{ item }">
            <NuxtLink class="small" :to="`/research/${item.market}/${item.symbol}/${item.prediction_date}`" target="_blank">查看公开复盘</NuxtLink>
          </template>
        </StagePanel>

        <StagePanel title="已拒绝" :items="rejectedPreds" empty="暂无已拒绝记录。">
          <template #default="{ item }">
            <NuxtLink class="small" :to="`/admin/model-review/${item.id}`">查看</NuxtLink>
          </template>
        </StagePanel>

        <section class="panel">
          <button class="text-btn advanced-toggle" @click="showAdvanced = !showAdvanced">
            {{ showAdvanced ? '收起高级操作' : '显示高级操作' }}
          </button>
          <div v-if="showAdvanced" class="advanced-actions">
            <button class="secondary" :disabled="!pendingPreds.length || loading === 'bulk-approve'" @click="approveAllPending">
              批量通过当前待审核
            </button>
            <span>默认建议逐条进入完整审核页。</span>
          </div>
        </section>
      </section>

      <section v-else-if="activePanel === 'history'" class="panel">
        <div class="filter">
          <select v-model="historyStatus" @change="loadHistory">
            <option value="">全部状态</option>
            <option value="approved">已通过</option>
            <option value="settled">已结算</option>
            <option value="rejected">已拒绝</option>
          </select>
        </div>
        <div v-for="p in historyPreds" :key="p.id" class="history-row">
          <div>
            <strong>{{ p.symbol_name }}</strong>
            <span>{{ p.market }} / {{ p.symbol }} / {{ p.prediction_date }}</span>
          </div>
          <div>{{ directionLabel[p.predicted_direction] || p.predicted_direction }}</div>
          <div>{{ pctText(p.actual_change_pct) }}</div>
          <NuxtLink class="small" :to="`/admin/model-review/${p.id}`">查看</NuxtLink>
        </div>
        <div v-if="!historyPreds.length" class="empty">暂无记录</div>
      </section>

      <section v-else class="settings panel">
        <label><span>启用自动调度</span><input v-model="settings.xbot_enabled" true-value="true" false-value="false" type="checkbox"></label>
        <label><span>运行模式</span><select v-model="settings.xbot_operation_mode"><option value="manual">手动</option><option value="auto">自动</option></select></label>
        <label><span>市场</span><input v-model="settings.xbot_markets" placeholder="a,hk"></label>
        <label><span>每市场候选数</span><input v-model="settings.xbot_hot_stock_count" type="number"></label>
        <label><span>A 股最低价格</span><input v-model="settings.xbot_min_price_a" type="number"></label>
        <label><span>港股最低价格</span><input v-model="settings.xbot_min_price_hk" type="number"></label>
        <label><span>A 股结算时间</span><input v-model="settings.xbot_a_settle_time" type="time"></label>
        <label><span>港股结算时间</span><input v-model="settings.xbot_hk_settle_time" type="time"></label>
        <label><span>生成时间</span><input v-model="settings.xbot_predict_time" type="time"></label>
        <label><span>旧产品链接兜底</span><input v-model="settings.xbot_product_url" placeholder="App Base URL 缺失时使用"></label>
        <button class="primary full" :disabled="loading === 'save-settings'" @click="saveSettings">
          {{ loading === 'save-settings' ? '保存中...' : '保存设置' }}
        </button>
      </section>
    </main>
  </div>
</template>

<script lang="ts">
export default {
  components: {
    StagePanel: {
      props: ['title', 'items', 'empty'],
      template: `
        <section class="panel">
          <div class="panel-title"><span>{{ title }}</span><small>{{ items?.length || 0 }}</small></div>
          <div v-if="!items?.length" class="empty">{{ empty }}</div>
          <div v-for="item in items" :key="item.id" class="record">
            <div class="record-main">
              <strong>{{ item.symbol_name }}</strong>
              <span>{{ item.market }} / {{ item.symbol }} / 目标日 {{ item.target_date }}</span>
              <p v-if="item.analysis_summary">{{ item.analysis_summary }}</p>
            </div>
            <div class="record-actions"><slot :item="item" /></div>
          </div>
        </section>
      `,
    },
  },
}
</script>

<style scoped>
.page { min-height: 100vh; background: #f4f5f7; color: #111827; }
.topbar { position: sticky; top: 0; z-index: 10; height: 52px; display: grid; grid-template-columns: 90px 1fr 90px; align-items: center; padding: 0 16px; background: rgba(255,255,255,.94); border-bottom: 1px solid #e5e7eb; backdrop-filter: blur(14px); text-align: center; }
.back, .text-btn { color: #2563eb; text-decoration: none; background: none; border: 0; font-size: 14px; }
.tabs { max-width: 1040px; margin: 16px auto; display: flex; gap: 6px; padding: 4px; background: #e5e7eb; border-radius: 10px; }
.tabs button { flex: 1; height: 36px; border: 0; border-radius: 8px; background: transparent; color: #4b5563; font-weight: 700; }
.tabs button.active { background: #fff; color: #111827; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
.content { max-width: 1040px; margin: 0 auto; padding: 0 16px 48px; }
.toast { position: fixed; top: 64px; left: 50%; transform: translateX(-50%); z-index: 20; padding: 10px 16px; border-radius: 10px; color: #fff; font-weight: 700; }
.toast.ok { background: #16a34a; }
.toast.err { background: #dc2626; }
.stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 14px; }
.stats div, .panel, .toolbar { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; }
.stats div { padding: 16px; text-align: center; }
.stats b { display: block; font-size: 24px; color: #1d4ed8; }
.stats span, .panel-title small, .record-main span, .record-main p, .advanced-actions span { color: #6b7280; font-size: 12px; }
.toolbar { display: flex; gap: 10px; padding: 14px; margin-bottom: 14px; flex-wrap: wrap; }
.panel { padding: 14px; margin-bottom: 14px; }
.panel-title { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; font-weight: 800; color: #374151; }
.manual-form { display: grid; grid-template-columns: 110px 1fr 1fr auto auto; gap: 8px; }
input, select { height: 40px; border: 1px solid #d1d5db; border-radius: 8px; padding: 0 10px; background: #fff; min-width: 0; }
button { cursor: pointer; }
button:disabled { opacity: .55; cursor: default; }
.primary, .secondary, .small { border: 0; border-radius: 8px; font-weight: 800; text-decoration: none; display: inline-flex; align-items: center; justify-content: center; }
.primary { height: 40px; padding: 0 16px; color: #fff; background: #2563eb; }
.secondary { height: 40px; padding: 0 16px; color: #2563eb; background: #eff6ff; }
.small { min-height: 32px; padding: 0 10px; color: #2563eb; background: #eff6ff; font-size: 13px; }
.small.ok { color: #15803d; background: #ecfdf5; }
.small.danger { color: #dc2626; background: #fef2f2; }
.link { width: auto; }
.full { width: 100%; }
.diagnostics { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 8px; }
.diag { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding: 10px; background: #f9fafb; border-radius: 8px; color: #6b7280; font-size: 12px; }
.diag strong { color: #111827; }
.diag em { flex-basis: 100%; color: #b45309; font-style: normal; word-break: break-word; }
.market-group { margin: 14px 0 4px; font-size: 12px; font-weight: 800; color: #6b7280; }
.record { display: flex; gap: 12px; align-items: center; padding: 12px 0; border-top: 1px solid #f3f4f6; }
.record:first-of-type { border-top: 0; }
.record-main { flex: 1; min-width: 0; }
.record-main strong { display: block; }
.record-main p { margin: 4px 0 0; line-height: 1.5; }
.record-actions { display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
.state { font-size: 12px; font-weight: 800; color: #047857; }
.empty { text-align: center; color: #6b7280; padding: 18px; background: #f9fafb; border-radius: 8px; }
.advanced-toggle { padding: 0; font-weight: 700; }
.advanced-actions { display: flex; align-items: center; gap: 10px; margin-top: 12px; }
.filter { margin-bottom: 12px; }
.history-row { display: grid; grid-template-columns: 1.7fr .7fr .7fr auto; gap: 12px; align-items: center; padding: 12px 0; border-top: 1px solid #f3f4f6; }
.history-row span { display: block; color: #6b7280; font-size: 12px; margin-top: 2px; }
.settings { display: grid; gap: 12px; }
.settings label { display: grid; grid-template-columns: 160px 1fr; gap: 12px; align-items: center; }
.settings label span { font-weight: 700; color: #374151; font-size: 14px; }
.settings input[type='checkbox'] { width: 20px; height: 20px; }
@media (max-width: 760px) {
  .stats, .diagnostics { grid-template-columns: 1fr 1fr; }
  .manual-form, .history-row, .settings label { grid-template-columns: 1fr; }
  .record, .toolbar, .advanced-actions { flex-direction: column; align-items: stretch; }
}
</style>
