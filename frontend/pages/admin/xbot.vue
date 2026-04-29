<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import api from '~/lib/api'

type Prediction = Record<string, any>

function getAdminHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('admin_token') : ''
  return { 'X-Admin-Token': token || '' }
}

const activeTab = ref<'overview' | 'history' | 'settings'>('overview')
const dashboard = ref<any>(null)
const todayPreds = ref<Prediction[]>([])
const historyPreds = ref<Prediction[]>([])
const settings = ref<Record<string, any>>({})
const msg = ref('')
const msgType = ref<'ok' | 'err'>('ok')
const loading = ref('')
const historyStatus = ref('')
const previewUrl = ref('')
const previewVisible = ref(false)

const pendingPreds = computed(() => todayPreds.value.filter(p => p.status === 'pending'))
const approvedPreds = computed(() => todayPreds.value.filter(p => p.status === 'approved'))
const settledPreds = computed(() => todayPreds.value.filter(p => p.status === 'settled' || p.status === 'posted'))
const rejectedPreds = computed(() => todayPreds.value.filter(p => p.status === 'rejected'))

const directionLabel: Record<string, string> = { up: '看涨', down: '看跌', hold: '震荡' }
const directionColor: Record<string, string> = { up: '#c2410c', down: '#15803d', hold: '#a16207' }
const statusLabel: Record<string, string> = {
  pending: '待审核',
  approved: '已通过',
  rejected: '已拒绝',
  posted: '历史已归档',
  settled: '已结算',
}

function showMsg(text: string, type: 'ok' | 'err' = 'ok') {
  msg.value = text
  msgType.value = type
  setTimeout(() => { msg.value = '' }, 2800)
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

async function loadHistory() {
  const params: Record<string, any> = { limit: 100 }
  if (historyStatus.value) params.status = historyStatus.value
  const res = await api.get('/api/admin/xbot/predictions', { params, headers: getAdminHeaders() })
  historyPreds.value = res.data
}

async function loadSettings() {
  const res = await api.get('/api/admin/xbot/settings', { headers: getAdminHeaders() })
  settings.value = res.data
}

async function refreshAll() {
  await Promise.all([loadDashboard(), loadTodayPreds(), loadSettings()])
}

async function generatePredictions() {
  if (!confirm('确认立即生成内部模型记录？')) return
  loading.value = 'generate'
  try {
    await api.post('/api/admin/xbot/actions/generate', {}, { headers: getAdminHeaders() })
    showMsg('生成任务已启动，稍后刷新查看')
    setTimeout(() => { refreshAll() }, 8000)
  } catch (e: any) {
    showMsg(e.response?.data?.detail || '生成失败', 'err')
  } finally {
    loading.value = ''
  }
}

async function settleRecords() {
  if (!confirm('确认结算已通过且到达目标日期的记录？')) return
  loading.value = 'settle'
  try {
    await api.post('/api/admin/xbot/actions/settle', {}, { headers: getAdminHeaders() })
    showMsg('结算任务已启动，稍后刷新查看')
    setTimeout(() => { refreshAll(); loadHistory() }, 8000)
  } catch (e: any) {
    showMsg(e.response?.data?.detail || '结算失败', 'err')
  } finally {
    loading.value = ''
  }
}

async function approvePred(pred: Prediction) {
  loading.value = `approve-${pred.id}`
  try {
    await api.post(`/api/admin/xbot/predictions/${pred.id}/approve`, {}, { headers: getAdminHeaders() })
    pred.status = 'approved'
    showMsg('已通过')
    await loadDashboard()
  } catch (e: any) {
    showMsg(e.response?.data?.detail || '操作失败', 'err')
  } finally {
    loading.value = ''
  }
}

async function rejectPred(pred: Prediction) {
  loading.value = `reject-${pred.id}`
  try {
    await api.post(`/api/admin/xbot/predictions/${pred.id}/reject`, {}, { headers: getAdminHeaders() })
    pred.status = 'rejected'
    showMsg('已拒绝')
    await loadDashboard()
  } catch (e: any) {
    showMsg(e.response?.data?.detail || '操作失败', 'err')
  } finally {
    loading.value = ''
  }
}

async function approveAll() {
  for (const pred of [...pendingPreds.value]) await approvePred(pred)
}

async function openPreview(pred: Prediction) {
  loading.value = `preview-${pred.id}`
  previewUrl.value = ''
  try {
    const variant = pred.status === 'settled' || pred.actual_change_pct != null ? 'proof' : 'promise'
    const res = await api.get(`/api/admin/xbot/predictions/${pred.id}/card-preview`, {
      params: { variant },
      headers: getAdminHeaders(),
      responseType: 'blob',
    })
    previewUrl.value = URL.createObjectURL(res.data)
    previewVisible.value = true
  } catch (e: any) {
    showMsg(e.response?.data?.detail || '卡片生成失败', 'err')
  } finally {
    loading.value = ''
  }
}

async function saveSettings() {
  loading.value = 'save'
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

function pctColor(v: number | null | undefined) {
  if (v == null) return '#6b7280'
  return v > 0 ? '#c2410c' : v < 0 ? '#15803d' : '#6b7280'
}

onMounted(refreshAll)
</script>

<template>
  <div class="page">
    <div class="topbar">
      <NuxtLink to="/admin" class="back">返回</NuxtLink>
      <div class="title">模型复盘档案</div>
      <button class="text-btn" @click="refreshAll">刷新</button>
    </div>

    <div v-if="msg" :class="['toast', msgType]">{{ msg }}</div>

    <div class="tabs">
      <button :class="{ active: activeTab === 'overview' }" @click="activeTab = 'overview'">今日队列</button>
      <button :class="{ active: activeTab === 'history' }" @click="activeTab = 'history'; loadHistory()">历史档案</button>
      <button :class="{ active: activeTab === 'settings' }" @click="activeTab = 'settings'">运行设置</button>
    </div>

    <main class="content">
      <section v-if="activeTab === 'overview'">
        <div v-if="dashboard" class="stats">
          <div><b>{{ dashboard.accuracy?.all?.pct ?? 0 }}%</b><span>累计命中率</span></div>
          <div><b>{{ dashboard.totals?.predictions ?? 0 }}</b><span>总记录</span></div>
          <div><b>{{ dashboard.totals?.settled ?? 0 }}</b><span>已结算</span></div>
          <div><b>{{ dashboard.operation_mode === 'auto' ? '自动' : '手动' }}</b><span>运行模式</span></div>
        </div>

        <div class="actions">
          <button class="primary" :disabled="loading === 'generate'" @click="generatePredictions">
            {{ loading === 'generate' ? '生成中...' : '生成内部记录' }}
          </button>
          <button class="secondary" @click="approveAll">全部通过</button>
          <button class="secondary" :disabled="loading === 'settle'" @click="settleRecords">
            {{ loading === 'settle' ? '结算中...' : '结算记录' }}
          </button>
        </div>

        <RecordGroup title="待审核" :items="pendingPreds" tone="orange">
          <template #default="{ item }">
            <button class="small" @click="openPreview(item)">卡片</button>
            <button class="small ok" @click="approvePred(item)">通过</button>
            <button class="small danger" @click="rejectPred(item)">拒绝</button>
          </template>
        </RecordGroup>

        <RecordGroup title="已通过，待结算" :items="approvedPreds" tone="blue">
          <template #default="{ item }">
            <button class="small" @click="openPreview(item)">卡片</button>
            <button class="small danger" @click="rejectPred(item)">拒绝</button>
          </template>
        </RecordGroup>

        <RecordGroup title="已结算/历史兼容" :items="settledPreds" tone="green">
          <template #default="{ item }">
            <button class="small" @click="openPreview(item)">卡片</button>
          </template>
        </RecordGroup>

        <RecordGroup title="已拒绝" :items="rejectedPreds" tone="gray" />
      </section>

      <section v-else-if="activeTab === 'history'">
        <div class="filter">
          <select v-model="historyStatus" @change="loadHistory">
            <option value="">全部状态</option>
            <option value="approved">已通过</option>
            <option value="settled">已结算</option>
            <option value="rejected">已拒绝</option>
          </select>
        </div>
        <div class="table">
          <div v-for="p in historyPreds" :key="p.id" class="row">
            <div>
              <strong>{{ p.symbol_name }}</strong>
              <span>{{ p.market }} / {{ p.symbol }} / {{ p.prediction_date }}</span>
            </div>
            <div :style="{ color: directionColor[p.predicted_direction] || '#374151' }">
              {{ directionLabel[p.predicted_direction] || p.predicted_direction }}
            </div>
            <div :style="{ color: pctColor(p.actual_change_pct) }">{{ pctText(p.actual_change_pct) }}</div>
            <div>{{ statusLabel[p.status] || p.status }}</div>
          </div>
          <div v-if="!historyPreds.length" class="empty">暂无记录</div>
        </div>
      </section>

      <section v-else class="settings">
        <label>
          <span>启用自动调度</span>
          <input v-model="settings.xbot_enabled" true-value="true" false-value="false" type="checkbox">
        </label>
        <label>
          <span>运行模式</span>
          <select v-model="settings.xbot_operation_mode">
            <option value="manual">手动</option>
            <option value="auto">自动</option>
          </select>
        </label>
        <label>
          <span>市场</span>
          <input v-model="settings.xbot_markets" placeholder="a,hk">
        </label>
        <label>
          <span>每市场选股数</span>
          <input v-model="settings.xbot_hot_stock_count" type="number">
        </label>
        <label>
          <span>A 股最低价格</span>
          <input v-model="settings.xbot_min_price_a" type="number">
        </label>
        <label>
          <span>港股最低价格</span>
          <input v-model="settings.xbot_min_price_hk" type="number">
        </label>
        <label>
          <span>A 股结算时间</span>
          <input v-model="settings.xbot_a_settle_time" type="time">
        </label>
        <label>
          <span>港股结算时间</span>
          <input v-model="settings.xbot_hk_settle_time" type="time">
        </label>
        <label>
          <span>生成时间</span>
          <input v-model="settings.xbot_predict_time" type="time">
        </label>
        <button class="primary full" :disabled="loading === 'save'" @click="saveSettings">
          {{ loading === 'save' ? '保存中...' : '保存设置' }}
        </button>
      </section>
    </main>

    <div v-if="previewVisible" class="modal" @click.self="previewVisible = false">
      <div class="modal-body">
        <img v-if="previewUrl" :src="previewUrl" alt="复盘卡片预览">
        <button class="secondary full" @click="previewVisible = false">关闭</button>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
export default {
  components: {
    RecordGroup: {
      props: ['title', 'items', 'tone'],
      template: `
        <div class="group" v-if="items && items.length">
          <div class="group-title">{{ title }} <span>{{ items.length }}</span></div>
          <div class="record" v-for="item in items" :key="item.id">
            <div class="record-main">
              <strong>{{ item.symbol_name }}</strong>
              <span>{{ item.market }} / {{ item.symbol }} / {{ item.target_date }}</span>
              <p v-if="item.analysis_summary">{{ item.analysis_summary }}</p>
            </div>
            <div class="record-actions"><slot :item="item" /></div>
          </div>
        </div>
      `,
    },
  },
}
</script>

<style scoped>
.page { min-height: 100vh; background: #f3f4f6; color: #111827; }
.topbar { position: sticky; top: 0; z-index: 10; height: 52px; display: grid; grid-template-columns: 80px 1fr 80px; align-items: center; padding: 0 16px; background: rgba(255,255,255,.94); border-bottom: 1px solid #e5e7eb; backdrop-filter: blur(14px); }
.title { text-align: center; font-weight: 700; }
.back, .text-btn { color: #2563eb; text-decoration: none; background: none; border: 0; font-size: 14px; }
.tabs { max-width: 920px; margin: 16px auto; display: flex; gap: 6px; padding: 4px; background: #e5e7eb; border-radius: 10px; }
.tabs button { flex: 1; height: 36px; border: 0; border-radius: 8px; background: transparent; color: #4b5563; font-weight: 600; }
.tabs button.active { background: #fff; color: #111827; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
.content { max-width: 920px; margin: 0 auto; padding: 0 16px 48px; }
.toast { position: fixed; top: 64px; left: 50%; transform: translateX(-50%); z-index: 20; padding: 10px 16px; border-radius: 10px; color: #fff; font-weight: 600; }
.toast.ok { background: #16a34a; }
.toast.err { background: #dc2626; }
.stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 14px; }
.stats div, .group, .table, .settings, .actions { background: #fff; border-radius: 12px; border: 1px solid #e5e7eb; }
.stats div { padding: 16px; text-align: center; }
.stats b { display: block; font-size: 24px; color: #2563eb; }
.stats span { font-size: 12px; color: #6b7280; }
.actions { display: flex; gap: 10px; padding: 14px; margin-bottom: 14px; }
button { cursor: pointer; }
button:disabled { opacity: .55; cursor: default; }
.primary, .secondary, .small { border: 0; border-radius: 9px; font-weight: 700; }
.primary { height: 40px; padding: 0 16px; color: #fff; background: #2563eb; }
.secondary { height: 40px; padding: 0 16px; color: #2563eb; background: #eff6ff; }
.full { width: 100%; }
.small { height: 32px; padding: 0 10px; color: #2563eb; background: #eff6ff; }
.small.ok { color: #15803d; background: #ecfdf5; }
.small.danger { color: #dc2626; background: #fef2f2; }
.group { padding: 14px; margin-bottom: 14px; }
.group-title { font-size: 13px; color: #6b7280; font-weight: 800; margin-bottom: 10px; }
.group-title span { color: #111827; }
.record { display: flex; gap: 12px; align-items: center; padding: 12px 0; border-top: 1px solid #f3f4f6; }
.record:first-of-type { border-top: 0; }
.record-main { flex: 1; min-width: 0; }
.record-main strong { display: block; }
.record-main span, .record-main p { color: #6b7280; font-size: 12px; margin: 3px 0 0; }
.record-actions { display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
.filter { margin-bottom: 12px; }
.filter select, .settings input, .settings select { height: 40px; border: 1px solid #d1d5db; border-radius: 8px; padding: 0 10px; background: #fff; }
.row { display: grid; grid-template-columns: 1.8fr .7fr .7fr .7fr; gap: 12px; align-items: center; padding: 12px 14px; border-bottom: 1px solid #f3f4f6; font-size: 14px; }
.row span { display: block; color: #6b7280; font-size: 12px; margin-top: 2px; }
.empty { text-align: center; color: #6b7280; padding: 36px; }
.settings { padding: 16px; display: grid; gap: 12px; }
.settings label { display: grid; grid-template-columns: 160px 1fr; gap: 12px; align-items: center; }
.settings label span { color: #374151; font-size: 14px; font-weight: 600; }
.settings input[type='checkbox'] { width: 20px; height: 20px; }
.modal { position: fixed; inset: 0; z-index: 30; background: rgba(0,0,0,.55); display: flex; align-items: center; justify-content: center; padding: 20px; }
.modal-body { width: min(480px, 100%); background: #fff; border-radius: 12px; padding: 14px; }
.modal-body img { display: block; width: 100%; border-radius: 8px; margin-bottom: 12px; }
@media (max-width: 720px) {
  .stats { grid-template-columns: repeat(2, 1fr); }
  .actions, .record { flex-direction: column; align-items: stretch; }
  .row { grid-template-columns: 1fr; }
  .settings label { grid-template-columns: 1fr; }
}
</style>
