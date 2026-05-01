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

const pendingPreds  = computed(() => todayPreds.value.filter(p => p.status === 'pending'))
const approvedPreds = computed(() => todayPreds.value.filter(p => p.status === 'approved'))
const settledPreds  = computed(() => todayPreds.value.filter(p => p.status === 'settled' || p.status === 'posted'))
const rejectedPreds = computed(() => todayPreds.value.filter(p => p.status === 'rejected'))

const directionLabel: Record<string, string> = { up: '看涨', down: '看跌', hold: '震荡' }
const directionColor: Record<string, string> = { up: '#c2410c', down: '#15803d', hold: '#a16207' }
const statusLabel: Record<string, string> = {
  pending: '待审核', approved: '已通过', rejected: '已拒绝',
  posted: '历史已归档', settled: '已结算',
}
const statusColor: Record<string, string> = {
  pending: '#d97706', approved: '#2563eb', rejected: '#6b7280',
  posted: '#16a34a', settled: '#7c3aed',
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
  } finally { loading.value = '' }
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
  } finally { loading.value = '' }
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
  } finally { loading.value = '' }
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
  } finally { loading.value = '' }
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
  } finally { loading.value = '' }
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
  } finally { loading.value = '' }
}

function pctText(v: number | null | undefined) {
  if (v == null) return '-'
  return `${v >= 0 ? '+' : ''}${Number(v).toFixed(2)}%`
}

function pctColor(v: number | null | undefined) {
  if (v == null) return '#6b7280'
  return v > 0 ? '#c2410c' : v < 0 ? '#15803d' : '#6b7280'
}

// ─── Detail drawer ─────────────────────────────────────────────────────────────
const detailVisible = ref(false)
const detailPred = ref<any>(null)
function openDetail(pred: any) { detailPred.value = pred; detailVisible.value = true }
function closeDetail() { detailVisible.value = false; detailPred.value = null }

// ─── Selection ─────────────────────────────────────────────────────────────────
const selectedIds = ref<number[]>([])
const selectedSet = computed(() => new Set(selectedIds.value))
function isSelected(id: number) { return selectedSet.value.has(id) }
function toggleSelect(id: number, e: Event) {
  e.stopPropagation()
  const idx = selectedIds.value.indexOf(id)
  if (idx === -1) selectedIds.value.push(id)
  else selectedIds.value.splice(idx, 1)
}
function isAllSelected(preds: any[]) {
  return preds.length > 0 && preds.every((p: any) => selectedSet.value.has(p.id))
}
function toggleSelectAll(preds: any[], e: Event) {
  e.stopPropagation()
  if (isAllSelected(preds)) {
    const ids = new Set(preds.map((p: any) => p.id))
    selectedIds.value = selectedIds.value.filter(id => !ids.has(id))
  } else {
    preds.forEach((p: any) => { if (!selectedSet.value.has(p.id)) selectedIds.value.push(p.id) })
  }
}
const selectedPendingIds  = computed(() => pendingPreds.value.filter(p => selectedSet.value.has(p.id)).map(p => p.id))
const selectedApprovedIds = computed(() => approvedPreds.value.filter(p => selectedSet.value.has(p.id)).map(p => p.id))

const batchLoading = ref('')
async function bulkApproveSelected() {
  const ids = selectedPendingIds.value
  if (!ids.length) return
  batchLoading.value = 'approve'
  try {
    await api.post('/api/admin/xbot/actions/bulk-approve', { ids }, { headers: getAdminHeaders() })
    showMsg(`${ids.length} 条记录已通过`)
    const idSet = new Set(ids)
    selectedIds.value = selectedIds.value.filter(id => !idSet.has(id))
    await loadTodayPreds()
  } catch (e: any) {
    showMsg(e.response?.data?.detail || '批量操作失败', 'err')
  } finally { batchLoading.value = '' }
}
async function bulkRejectSelected(sourceIds: number[]) {
  if (!sourceIds.length) return
  batchLoading.value = 'reject'
  try {
    await api.post('/api/admin/xbot/actions/bulk-reject', { ids: sourceIds }, { headers: getAdminHeaders() })
    showMsg(`${sourceIds.length} 条记录已废弃`)
    const idSet = new Set(sourceIds)
    selectedIds.value = selectedIds.value.filter(id => !idSet.has(id))
    await loadTodayPreds()
  } catch (e: any) {
    showMsg(e.response?.data?.detail || '批量操作失败', 'err')
  } finally { batchLoading.value = '' }
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

      <!-- ══════════════ 今日队列 ══════════════ -->
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

        <!-- 待审核 bucket (inline with checkboxes) -->
        <div v-if="pendingPreds.length" class="group">
          <div class="group-title" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
            <div style="display:flex;align-items:center;gap:8px">
              <input type="checkbox" :checked="isAllSelected(pendingPreds)" @change="toggleSelectAll(pendingPreds, $event)" style="width:15px;height:15px;cursor:pointer;accent-color:#d97706">
              待审核 <span>{{ pendingPreds.length }}</span>
            </div>
            <div v-if="selectedPendingIds.length" style="display:flex;gap:6px">
              <button class="small ok" :disabled="batchLoading === 'approve'" @click="bulkApproveSelected">
                {{ batchLoading === 'approve' ? '...' : `批量通过(${selectedPendingIds.length})` }}
              </button>
              <button class="small danger" :disabled="batchLoading === 'reject'" @click="bulkRejectSelected(selectedPendingIds)">
                批量废弃
              </button>
            </div>
          </div>
          <div class="record" v-for="item in pendingPreds" :key="item.id" style="cursor:pointer" @click="openDetail(item)">
            <input type="checkbox" :checked="isSelected(item.id)" @change="toggleSelect(item.id, $event)" @click.stop style="width:15px;height:15px;flex-shrink:0;cursor:pointer;accent-color:#d97706">
            <div class="record-main">
              <strong>{{ item.symbol_name }}</strong>
              <span>{{ item.market }} / {{ item.symbol }} / {{ item.target_date }}</span>
              <p v-if="item.analysis_summary">{{ item.analysis_summary }}</p>
            </div>
            <div class="record-actions" @click.stop>
              <button class="small" @click="openPreview(item)">卡片</button>
              <button class="small ok" @click="approvePred(item)">通过</button>
              <button class="small danger" @click="rejectPred(item)">拒绝</button>
            </div>
          </div>
        </div>

        <!-- 已通过 bucket (inline with checkboxes) -->
        <div v-if="approvedPreds.length" class="group">
          <div class="group-title" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
            <div style="display:flex;align-items:center;gap:8px">
              <input type="checkbox" :checked="isAllSelected(approvedPreds)" @change="toggleSelectAll(approvedPreds, $event)" style="width:15px;height:15px;cursor:pointer;accent-color:#2563eb">
              已通过，待结算 <span>{{ approvedPreds.length }}</span>
            </div>
            <div v-if="selectedApprovedIds.length" style="display:flex;gap:6px">
              <button class="small danger" :disabled="batchLoading === 'reject'" @click="bulkRejectSelected(selectedApprovedIds)">
                批量废弃({{ selectedApprovedIds.length }})
              </button>
            </div>
          </div>
          <div class="record" v-for="item in approvedPreds" :key="item.id" style="cursor:pointer" @click="openDetail(item)">
            <input type="checkbox" :checked="isSelected(item.id)" @change="toggleSelect(item.id, $event)" @click.stop style="width:15px;height:15px;flex-shrink:0;cursor:pointer;accent-color:#2563eb">
            <div class="record-main">
              <strong>{{ item.symbol_name }}</strong>
              <span>{{ item.market }} / {{ item.symbol }} / {{ item.target_date }}</span>
              <p v-if="item.analysis_summary">{{ item.analysis_summary }}</p>
            </div>
            <div class="record-actions" @click.stop>
              <button class="small" @click="openPreview(item)">卡片</button>
              <button class="small danger" @click="rejectPred(item)">拒绝</button>
            </div>
          </div>
        </div>

        <!-- 已结算 bucket -->
        <RecordGroup title="已结算/历史兼容" :items="settledPreds" tone="green">
          <template #default="{ item }">
            <button class="small" @click="openDetail(item)">详情</button>
            <button class="small" @click="openPreview(item)">卡片</button>
          </template>
        </RecordGroup>

        <!-- 已拒绝 bucket -->
        <RecordGroup title="已拒绝" :items="rejectedPreds" tone="gray">
          <template #default="{ item }">
            <button class="small" @click="openDetail(item)">详情</button>
            <button class="small ok" @click="approvePred(item)">恢复</button>
          </template>
        </RecordGroup>
      </section>

      <!-- ══════════════ 历史档案 ══════════════ -->
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
          <div v-for="p in historyPreds" :key="p.id" class="row history-row" @click="openDetail(p)">
            <input type="checkbox" :checked="isSelected(p.id)" @change="toggleSelect(p.id, $event)" @click.stop style="width:15px;height:15px;cursor:pointer;accent-color:#2563eb">
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

      <!-- ══════════════ 运行设置 ══════════════ -->
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
        <label>
          <span>产品链接</span>
          <input v-model="settings.xbot_product_url" placeholder="https://...">
        </label>
        <button class="primary full" :disabled="loading === 'save'" @click="saveSettings">
          {{ loading === 'save' ? '保存中...' : '保存设置' }}
        </button>
      </section>
    </main>

    <!-- 卡片预览 modal -->
    <div v-if="previewVisible" class="modal" @click.self="previewVisible = false">
      <div class="modal-body">
        <img v-if="previewUrl" :src="previewUrl" alt="复盘卡片预览">
        <button class="secondary full" @click="previewVisible = false">关闭</button>
      </div>
    </div>

    <!-- 详情抽屉 modal -->
    <div v-if="detailVisible" class="modal" @click.self="closeDetail">
      <div class="modal-body detail-body">
        <div class="detail-header">
          <div>
            <div class="detail-name">{{ detailPred?.symbol_name }}</div>
            <div class="detail-meta">
              {{ detailPred?.symbol }} · {{ detailPred?.market === 'a' ? 'A股' : detailPred?.market === 'hk' ? '港股' : detailPred?.market }}
              <span v-if="detailPred?.hot_rank" class="hot-badge">热度 #{{ detailPred?.hot_rank }}</span>
            </div>
          </div>
          <div style="text-align:right">
            <div :style="`font-size:18px;font-weight:700;color:${directionColor[detailPred?.predicted_direction]||'#374151'}`">
              {{ directionLabel[detailPred?.predicted_direction] || '—' }}
            </div>
            <div style="font-size:13px;color:#6b7280">置信度 {{ Math.round(detailPred?.confidence||0) }}%</div>
          </div>
        </div>

        <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
          <span :style="`font-size:12px;padding:3px 10px;border-radius:8px;background:${statusColor[detailPred?.status]}18;color:${statusColor[detailPred?.status]};font-weight:700`">
            {{ statusLabel[detailPred?.status] }}
          </span>
          <span style="font-size:12px;color:#6b7280">{{ detailPred?.prediction_date }}</span>
        </div>

        <!-- 价格行 -->
        <div v-if="detailPred?.close_price || detailPred?.target_price || detailPred?.stop_loss" class="price-row">
          <div v-for="item in [
            { label: '基准收盘', value: detailPred?.close_price },
            { label: '目标价', value: detailPred?.target_price },
            { label: '止损价', value: detailPred?.stop_loss },
          ].filter((i: any) => i.value)" :key="item.label" class="price-item">
            <div class="price-label">{{ item.label }}</div>
            <div class="price-val">{{ item.value?.toFixed(2) }}</div>
          </div>
        </div>

        <!-- AI 分析各段 -->
        <div v-for="sec in [
          { label: 'AI 分析摘要', value: detailPred?.analysis_summary },
          { label: '市场诊断', value: detailPred?.market_diagnosis },
          { label: '机会评估', value: detailPred?.opportunity_assessment },
          { label: '风险收益', value: detailPred?.risk_analysis },
          { label: '执行方案', value: detailPred?.execution_plan },
        ].filter((s: any) => s.value)" :key="sec.label" style="margin-bottom:12px">
          <div style="font-size:11px;font-weight:700;color:#6b7280;letter-spacing:1px;margin-bottom:4px;text-transform:uppercase">{{ sec.label }}</div>
          <div class="analysis-block">{{ sec.value }}</div>
        </div>

        <!-- 结算结果 -->
        <div v-if="detailPred?.actual_change_pct !== null && detailPred?.actual_change_pct !== undefined" class="result-row">
          <div>
            <div style="font-size:11px;color:#6b7280;margin-bottom:4px">结算结果</div>
            <div style="font-size:22px;font-weight:700" :style="`color:${pctColor(detailPred?.actual_change_pct)}`">
              {{ pctText(detailPred?.actual_change_pct) }}
            </div>
          </div>
          <div style="font-size:32px">{{ detailPred?.is_correct ? '✅' : '❌' }}</div>
        </div>

        <!-- 操作按钮 -->
        <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:10px">
          <button v-if="detailPred?.status === 'pending'" class="primary full" @click="approvePred(detailPred); closeDetail()">
            ✅ 通过审核
          </button>
          <button v-if="['pending','approved'].includes(detailPred?.status)" class="secondary full" @click="openPreview(detailPred); closeDetail()">
            👁 查看卡片预览
          </button>
          <button v-if="['pending','approved'].includes(detailPred?.status)" class="danger-btn full" @click="rejectPred(detailPred); closeDetail()">
            🗑 废弃
          </button>
          <a v-if="detailPred?.status === 'settled'"
            :href="`/research/${detailPred?.market}/${detailPred?.symbol}/${detailPred?.prediction_date}`"
            target="_blank" class="link-btn full">
            🌐 查看公开展示
          </a>
        </div>

        <button class="secondary full" @click="closeDetail">关闭</button>
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
.tabs button { flex: 1; height: 36px; border: 0; border-radius: 8px; background: transparent; color: #4b5563; font-weight: 600; cursor: pointer; }
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
.actions { display: flex; gap: 10px; padding: 14px; margin-bottom: 14px; flex-wrap: wrap; }
button { cursor: pointer; }
button:disabled { opacity: .55; cursor: default; }
.primary, .secondary, .small { border: 0; border-radius: 9px; font-weight: 700; }
.primary { height: 40px; padding: 0 16px; color: #fff; background: #2563eb; }
.secondary { height: 40px; padding: 0 16px; color: #2563eb; background: #eff6ff; }
.full { width: 100%; }
.small { height: 32px; padding: 0 10px; color: #2563eb; background: #eff6ff; }
.small.ok { color: #15803d; background: #ecfdf5; }
.small.danger { color: #dc2626; background: #fef2f2; }
.danger-btn { height: 40px; padding: 0 16px; color: #dc2626; background: #fef2f2; border: 0; border-radius: 9px; font-weight: 700; }
.link-btn { height: 40px; padding: 0 16px; color: #2563eb; background: #eff6ff; border: 0; border-radius: 9px; font-weight: 700; display: flex; align-items: center; justify-content: center; text-decoration: none; }
.group { padding: 14px; margin-bottom: 14px; }
.group-title { font-size: 13px; color: #6b7280; font-weight: 800; }
.group-title span { color: #111827; }
.record { display: flex; gap: 12px; align-items: center; padding: 12px 0; border-top: 1px solid #f3f4f6; }
.record:first-of-type { border-top: 0; }
.record-main { flex: 1; min-width: 0; }
.record-main strong { display: block; }
.record-main span, .record-main p { color: #6b7280; font-size: 12px; margin: 3px 0 0; }
.record-actions { display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
.filter { margin-bottom: 12px; }
.filter select, .settings input, .settings select { height: 40px; border: 1px solid #d1d5db; border-radius: 8px; padding: 0 10px; background: #fff; }
.history-row { display: grid; grid-template-columns: 28px 1.8fr .7fr .7fr .7fr; gap: 12px; align-items: center; padding: 12px 14px; border-bottom: 1px solid #f3f4f6; font-size: 14px; cursor: pointer; }
.history-row:hover { background: #f9fafb; }
.history-row span { display: block; color: #6b7280; font-size: 12px; margin-top: 2px; }
.empty { text-align: center; color: #6b7280; padding: 36px; }
.settings { padding: 16px; display: grid; gap: 12px; }
.settings label { display: grid; grid-template-columns: 160px 1fr; gap: 12px; align-items: center; }
.settings label span { color: #374151; font-size: 14px; font-weight: 600; }
.settings input[type='checkbox'] { width: 20px; height: 20px; }
.modal { position: fixed; inset: 0; z-index: 30; background: rgba(0,0,0,.55); display: flex; align-items: center; justify-content: center; padding: 20px; }
.modal-body { width: min(480px, 100%); background: #fff; border-radius: 12px; padding: 14px; max-height: 90vh; overflow-y: auto; }
.modal-body img { display: block; width: 100%; border-radius: 8px; margin-bottom: 12px; }
.detail-body { width: min(560px, 100%); }
.detail-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; }
.detail-name { font-size: 20px; font-weight: 700; }
.detail-meta { font-size: 13px; color: #6b7280; margin-top: 3px; }
.hot-badge { margin-left: 6px; background: #fff7ed; color: #c2410c; border-radius: 6px; padding: 2px 6px; font-size: 11px; }
.price-row { display: flex; gap: 20px; flex-wrap: wrap; background: #f3f4f6; border-radius: 10px; padding: 12px 14px; margin-bottom: 14px; }
.price-item { display: flex; flex-direction: column; gap: 2px; }
.price-label { font-size: 11px; color: #6b7280; letter-spacing: 1px; }
.price-val { font-size: 20px; font-weight: 700; }
.analysis-block { background: #f3f4f6; border-radius: 10px; padding: 10px 12px; font-size: 14px; line-height: 1.7; color: #111827; white-space: pre-wrap; word-break: break-word; }
.result-row { display: flex; align-items: center; justify-content: space-between; background: #f3f4f6; border-radius: 10px; padding: 12px 14px; margin-bottom: 14px; }
@media (max-width: 720px) {
  .stats { grid-template-columns: repeat(2, 1fr); }
  .actions, .record { flex-direction: column; align-items: stretch; }
  .history-row { grid-template-columns: 1fr; }
  .settings label { grid-template-columns: 1fr; }
}
</style>
