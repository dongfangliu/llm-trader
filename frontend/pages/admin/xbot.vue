<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import api from '~/lib/api'

function getAdminHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('admin_token') : ''
  return { 'X-Admin-Token': token || '' }
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────
const activeTab = ref('overview')
const tabs = [
  { key: 'overview', label: '📊 总览' },
  { key: 'history', label: '🏆 历史战绩' },
  { key: 'content', label: '✏️ 内容配置' },
  { key: 'settings', label: '⚙️ 系统设置' },
]

// ─── Flash message ─────────────────────────────────────────────────────────────
const msg = ref('')
const msgType = ref<'success' | 'error'>('success')
function showMsg(text: string, type: 'success' | 'error' = 'success') {
  msg.value = text; msgType.value = type
  setTimeout(() => { msg.value = '' }, 3000)
}

// ─── Dashboard data ────────────────────────────────────────────────────────────
const dashboard = ref<any>(null)
const dashLoading = ref(false)
async function loadDashboard() {
  dashLoading.value = true
  try {
    const res = await api.get('/api/admin/xbot/dashboard', { headers: getAdminHeaders() })
    dashboard.value = res.data
  } catch (e: any) {
    showMsg(e.response?.data?.detail || '加载失败', 'error')
  } finally { dashLoading.value = false }
}

// ─── Today's predictions ───────────────────────────────────────────────────────
const todayPreds = ref<any[]>([])
const predsLoading = ref(false)
async function loadTodayPreds() {
  predsLoading.value = true
  try {
    const today = new Date().toISOString().split('T')[0]
    const res = await api.get('/api/admin/xbot/predictions', {
      params: { prediction_date: today, limit: 20 },
      headers: getAdminHeaders(),
    })
    todayPreds.value = res.data
  } catch (e: any) {
    showMsg(e.response?.data?.detail || '加载预测失败', 'error')
  } finally { predsLoading.value = false }
}

// ─── History ───────────────────────────────────────────────────────────────────
const historyPreds = ref<any[]>([])
const historyLoading = ref(false)
const historyDateFrom = ref('')
const historyStatus = ref('')
async function loadHistory() {
  historyLoading.value = true
  try {
    const params: any = { limit: 100 }
    if (historyDateFrom.value) params.prediction_date = historyDateFrom.value
    if (historyStatus.value) params.status = historyStatus.value
    const res = await api.get('/api/admin/xbot/predictions', { params, headers: getAdminHeaders() })
    historyPreds.value = res.data
  } catch (e: any) {
    showMsg(e.response?.data?.detail || '加载历史失败', 'error')
  } finally { historyLoading.value = false }
}

// ─── Settings ──────────────────────────────────────────────────────────────────
const settings = ref<any>({})
const settingsLoading = ref(false)
const settingsSaving = ref(false)
async function loadSettings() {
  settingsLoading.value = true
  try {
    const res = await api.get('/api/admin/xbot/settings', { headers: getAdminHeaders() })
    settings.value = res.data
  } catch (e: any) {
    showMsg(e.response?.data?.detail || '加载设置失败', 'error')
  } finally { settingsLoading.value = false }
}
async function saveSettings() {
  settingsSaving.value = true
  try {
    await api.put('/api/admin/xbot/settings', settings.value, { headers: getAdminHeaders() })
    showMsg('设置已保存')
  } catch (e: any) {
    showMsg(e.response?.data?.detail || '保存失败', 'error')
  } finally { settingsSaving.value = false }
}

// ─── Card preview ──────────────────────────────────────────────────────────────
const previewVisible = ref(false)
const previewLoading = ref(false)
type PreviewCard = { variant: string; label: string; url: string }
const previewCards = ref<PreviewCard[]>([])

const PREVIEW_VARIANTS = [
  { variant: 'promise',     label: '承诺卡 (推文1)' },
  { variant: 'data_conf',   label: '置信度卡' },
  { variant: 'data_price',  label: '价格空间卡' },
  { variant: 'data_heat',   label: '市场热度卡' },
  { variant: 'data_record', label: '近期战绩卡' },
]
const PREVIEW_VARIANTS_RESULT = [
  { variant: 'proof',       label: '兑现卡 (推文1)' },
  { variant: 'data_conf',   label: '置信度卡' },
  { variant: 'data_price',  label: '价格空间卡' },
  { variant: 'data_heat',   label: '市场热度卡' },
  { variant: 'data_record', label: '近期战绩卡' },
]

async function openPreview(pred: any) {
  previewVisible.value = true
  previewLoading.value = true
  previewCards.value = []
  const variants = pred.actual_change_pct != null ? PREVIEW_VARIANTS_RESULT : PREVIEW_VARIANTS
  try {
    const results = await Promise.allSettled(
      variants.map(v =>
        api.get(`/api/admin/xbot/predictions/${pred.id}/card-preview?variant=${v.variant}`, {
          headers: getAdminHeaders(),
          responseType: 'blob',
        }).then(res => ({ variant: v.variant, label: v.label, url: URL.createObjectURL(res.data) }))
      )
    )
    previewCards.value = results
      .filter((r): r is PromiseFulfilledResult<PreviewCard> => r.status === 'fulfilled')
      .map(r => r.value)
    if (!previewCards.value.length) {
      showMsg('卡片生成失败', 'error')
      previewVisible.value = false
    }
  } catch (e: any) {
    showMsg('卡片生成失败', 'error')
    previewVisible.value = false
  } finally { previewLoading.value = false }
}
function closePreview() {
  previewCards.value.forEach(c => URL.revokeObjectURL(c.url))
  previewCards.value = []
  previewVisible.value = false
}

// ─── Prediction actions ────────────────────────────────────────────────────────
const actionLoading = ref<Record<number, string>>({})
async function approvePred(pred: any) {
  actionLoading.value[pred.id] = 'approve'
  try {
    await api.post(`/api/admin/xbot/predictions/${pred.id}/approve`, {}, { headers: getAdminHeaders() })
    pred.status = 'approved'
    showMsg(`${pred.symbol_name} 已通过审核`)
  } catch (e: any) {
    showMsg(e.response?.data?.detail || '操作失败', 'error')
  } finally { delete actionLoading.value[pred.id] }
}
async function rejectPred(pred: any) {
  actionLoading.value[pred.id] = 'reject'
  try {
    await api.post(`/api/admin/xbot/predictions/${pred.id}/reject`, {}, { headers: getAdminHeaders() })
    pred.status = 'rejected'
    showMsg(`${pred.symbol_name} 已拒绝`)
  } catch (e: any) {
    showMsg(e.response?.data?.detail || '操作失败', 'error')
  } finally { delete actionLoading.value[pred.id] }
}
async function postPred(pred: any) {
  if (!confirm(`立即发布 ${pred.symbol_name} 的预测推文？`)) return
  actionLoading.value[pred.id] = 'post'
  try {
    const res = await api.post(`/api/admin/xbot/predictions/${pred.id}/post`, {}, { headers: getAdminHeaders() })
    pred.status = 'posted'
    pred.prediction_tweet_id = res.data.tweet_id
    showMsg(`${pred.symbol_name} 推文已发布！`)
  } catch (e: any) {
    showMsg(e.response?.data?.detail || '发布失败', 'error')
  } finally { delete actionLoading.value[pred.id] }
}
async function approveAll() {
  const pending = todayPreds.value.filter(p => p.status === 'pending')
  for (const pred of pending) await approvePred(pred)
}

// ─── Bulk actions ──────────────────────────────────────────────────────────────
const bulkLoading = ref('')
async function generatePredictions() {
  if (!confirm('确认立即选股并生成今日预测？')) return
  bulkLoading.value = 'generate'
  try {
    await api.post('/api/admin/xbot/actions/generate', {}, { headers: getAdminHeaders() })
    showMsg('预测生成已在后台启动，约30秒后刷新查看')
    setTimeout(() => { loadTodayPreds(); loadDashboard() }, 8000)
  } catch (e: any) {
    showMsg(e.response?.data?.detail || '操作失败', 'error')
  } finally { bulkLoading.value = '' }
}
async function postApproved() {
  const approvedCount = todayPreds.value.filter(p => p.status === 'approved').length
  if (!approvedCount) { showMsg('没有已审核的预测', 'error'); return }
  if (!confirm(`发布 ${approvedCount} 条已审核推文？`)) return
  bulkLoading.value = 'post'
  try {
    const res = await api.post('/api/admin/xbot/actions/post-approved', {}, { headers: getAdminHeaders() })
    showMsg(`已发布 ${res.data.posted} 条推文`)
    await loadTodayPreds()
  } catch (e: any) {
    showMsg(e.response?.data?.detail || '发布失败', 'error')
  } finally { bulkLoading.value = '' }
}
async function settleResults() {
  if (!confirm('确认结算昨日预测并发布结果推文？')) return
  bulkLoading.value = 'settle'
  try {
    await api.post('/api/admin/xbot/actions/settle', {}, { headers: getAdminHeaders() })
    showMsg('结算已在后台启动，稍后刷新历史战绩查看')
  } catch (e: any) {
    showMsg(e.response?.data?.detail || '结算失败', 'error')
  } finally { bulkLoading.value = '' }
}

// ─── Twitter test ──────────────────────────────────────────────────────────────
const twitterTesting = ref(false)
const twitterTestResult = ref('')
async function testTwitter() {
  twitterTesting.value = true
  twitterTestResult.value = ''
  try {
    const res = await api.post('/api/admin/xbot/test-twitter', {}, { headers: getAdminHeaders() })
    twitterTestResult.value = `✅ 连接成功：@${res.data.account.screen_name}（${res.data.account.followers_count} 关注者）`
  } catch (e: any) {
    twitterTestResult.value = `❌ ${e.response?.data?.detail || '连接失败'}`
  } finally { twitterTesting.value = false }
}

// ─── Test card ─────────────────────────────────────────────────────────────────
const testCardLoading = ref(false)
const testCardUrl = ref('')
async function testCard() {
  testCardLoading.value = true
  testCardUrl.value = ''
  try {
    const res = await api.post('/api/admin/xbot/test-card', {}, {
      headers: getAdminHeaders(),
      responseType: 'blob',
    })
    testCardUrl.value = URL.createObjectURL(res.data)
  } catch (e: any) {
    showMsg(e.response?.data?.detail || '卡片生成失败，请检查前端服务', 'error')
  } finally { testCardLoading.value = false }
}

// ─── Helpers ───────────────────────────────────────────────────────────────────
const directionLabel: Record<string, string> = { up: '📈 看涨', down: '📉 看跌', hold: '➡️ 震荡' }
const directionColor: Record<string, string> = { up: '#34c759', down: '#ff3b30', hold: '#ff9500' }
const statusLabel: Record<string, string> = {
  pending: '待审核', approved: '已通过', rejected: '已拒绝',
  posted: '已发布', settled: '已结算',
}
const statusColor: Record<string, string> = {
  pending: '#ff9500', approved: '#007aff', rejected: '#8e8e93',
  posted: '#34c759', settled: '#5856d6',
}

function pctText(pct: number | null): string {
  if (pct === null || pct === undefined) return '—'
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`
}
function pctColor(pct: number | null): string {
  if (!pct) return '#8e8e93'
  return pct > 0 ? '#34c759' : '#ff3b30'
}

// ─── Init ──────────────────────────────────────────────────────────────────────
onMounted(async () => {
  await Promise.all([loadDashboard(), loadTodayPreds(), loadSettings()])
})
</script>

<template>
  <div style="position:fixed;inset:0;background:#f2f2f7;overflow-y:auto;font-family:-apple-system,BlinkMacSystemFont,sans-serif;">

    <!-- Flash message -->
    <Transition name="fade">
      <div v-if="msg" :style="`position:fixed;top:16px;right:16px;z-index:9999;padding:12px 20px;border-radius:12px;font-size:14px;font-weight:500;color:#fff;background:${msgType==='success'?'#34c759':'#ff3b30'};box-shadow:0 4px 16px rgba(0,0,0,0.15)`">
        {{ msg }}
      </div>
    </Transition>

    <!-- Card preview sheet -->
    <Transition name="sheet">
      <div v-if="previewVisible" style="position:fixed;inset:0;z-index:1000;display:flex;flex-direction:column;justify-content:flex-end;">
        <div style="position:absolute;inset:0;background:rgba(0,0,0,0.4)" @click="closePreview"></div>
        <div style="position:relative;background:#fff;border-radius:20px 20px 0 0;padding:16px;max-height:92vh;overflow-y:auto">
          <div style="width:40px;height:4px;border-radius:2px;background:#e5e5ea;margin:0 auto 16px"></div>
          <div style="font-size:17px;font-weight:600;text-align:center;margin-bottom:16px">推文卡片预览</div>
          <div v-if="previewLoading" style="text-align:center;padding:60px 0;color:#8e8e93">生成中，并发渲染5张卡片...</div>
          <div v-else style="display:flex;flex-direction:column;gap:16px">
            <div v-for="card in previewCards" :key="card.variant">
              <div style="font-size:12px;font-weight:600;color:#8e8e93;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px">{{ card.label }}</div>
              <img :src="card.url" style="width:100%;border-radius:12px;display:block" />
            </div>
          </div>
          <div style="height:16px"></div>
          <button @click="closePreview" style="width:100%;height:44px;border-radius:12px;background:#f2f2f7;border:none;font-size:16px;font-weight:500;cursor:pointer">关闭</button>
        </div>
      </div>
    </Transition>

    <!-- Header -->
    <div style="padding:52px 16px 0;max-width:800px;margin:0 auto">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px">
        <NuxtLink to="/admin" style="width:32px;height:32px;border-radius:8px;background:#e5e5ea;display:flex;align-items:center;justify-content:center;text-decoration:none;font-size:18px">‹</NuxtLink>
        <div style="font-size:17px;font-weight:600;flex:1;text-align:center">X Bot 运营中心</div>
        <div style="width:32px"></div>
      </div>

      <!-- Bot status banner -->
      <div v-if="dashboard" :style="`background:${dashboard.enabled ? '#34c759' : '#ff9500'};border-radius:16px;padding:14px 20px;display:flex;align-items:center;justify-content:space-between;margin-bottom:20px`">
        <div style="color:#fff;font-size:15px;font-weight:600">
          {{ dashboard.enabled ? '🟢 机器人运行中' : '🟡 机器人已暂停' }}
          <span style="font-weight:400;opacity:0.85;margin-left:8px;font-size:13px">
            {{ dashboard.auto_post ? '自动发帖模式' : '人工审核模式' }}
          </span>
        </div>
        <div style="color:rgba(255,255,255,0.9);font-size:13px">
          预测 {{ dashboard.predict_time }} · 发布 {{ dashboard.post_time }}
        </div>
      </div>

      <!-- Tabs -->
      <div style="display:flex;gap:4px;background:#e5e5ea;border-radius:12px;padding:4px;margin-bottom:20px;overflow-x:auto">
        <button
          v-for="tab in tabs" :key="tab.key"
          @click="activeTab = tab.key; tab.key === 'history' && loadHistory()"
          :style="`flex:1;min-width:80px;height:36px;border:none;border-radius:9px;font-size:13px;font-weight:500;cursor:pointer;transition:all .2s;background:${activeTab===tab.key?'#fff':'transparent'};color:${activeTab===tab.key?'#1c1c1e':'#636366'};box-shadow:${activeTab===tab.key?'0 1px 4px rgba(0,0,0,0.1)':'none'}`">
          {{ tab.label }}
        </button>
      </div>
    </div>

    <!-- ══════════════════ Tab: 总览 ══════════════════ -->
    <div v-if="activeTab === 'overview'" style="max-width:800px;margin:0 auto;padding:0 16px 40px">

      <!-- Key metrics -->
      <div v-if="dashboard" style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px;margin-bottom:16px">
        <div v-for="(stat, i) in [
          { label: '7日准确率', value: dashboard.accuracy['7d'].pct + '%', color: '#007aff' },
          { label: '30日准确率', value: dashboard.accuracy['30d'].pct + '%', color: '#34c759' },
          { label: '累计预测', value: dashboard.totals.predictions, color: '#ff9500' },
          { label: '总发推数', value: dashboard.totals.posted, color: '#5856d6' },
        ]" :key="i"
          style="background:#fff;border-radius:14px;padding:16px;text-align:center">
          <div :style="`font-size:26px;font-weight:700;color:${stat.color}`">{{ stat.value }}</div>
          <div style="font-size:12px;color:#8e8e93;margin-top:4px">{{ stat.label }}</div>
        </div>
      </div>

      <!-- Today's progress -->
      <div v-if="dashboard" style="background:#fff;border-radius:16px;padding:16px 20px;margin-bottom:16px">
        <div style="font-size:15px;font-weight:600;margin-bottom:12px">今日进度</div>
        <div style="display:flex;gap:16px;flex-wrap:wrap">
          <div v-for="(item, i) in [
            { label: '已生成', value: dashboard.today.total, color: '#007aff' },
            { label: '待审核', value: dashboard.today.pending, color: '#ff9500' },
            { label: '已通过', value: dashboard.today.approved, color: '#34c759' },
            { label: '已发布', value: dashboard.today.posted, color: '#5856d6' },
          ]" :key="i">
            <div :style="`font-size:22px;font-weight:700;color:${item.color}`">{{ item.value }}</div>
            <div style="font-size:12px;color:#8e8e93">{{ item.label }}</div>
          </div>
        </div>
      </div>

      <!-- Quick actions -->
      <div style="background:#fff;border-radius:16px;padding:16px 20px;margin-bottom:16px">
        <div style="font-size:15px;font-weight:600;margin-bottom:12px">快捷操作</div>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <button @click="generatePredictions" :disabled="bulkLoading === 'generate'"
            style="height:40px;padding:0 16px;border-radius:10px;background:#007aff;color:#fff;border:none;font-size:14px;font-weight:500;cursor:pointer;opacity:1" :style="bulkLoading === 'generate' ? 'opacity:0.6' : ''">
            {{ bulkLoading === 'generate' ? '生成中...' : '🔮 立即生成预测' }}
          </button>
          <button @click="approveAll"
            style="height:40px;padding:0 16px;border-radius:10px;background:#f2f2f7;color:#007aff;border:none;font-size:14px;font-weight:500;cursor:pointer">
            ✅ 全部通过
          </button>
          <button @click="postApproved" :disabled="bulkLoading === 'post'"
            style="height:40px;padding:0 16px;border-radius:10px;background:#34c759;color:#fff;border:none;font-size:14px;font-weight:500;cursor:pointer" :style="bulkLoading === 'post' ? 'opacity:0.6' : ''">
            {{ bulkLoading === 'post' ? '发布中...' : '🚀 发布已通过' }}
          </button>
          <button @click="settleResults" :disabled="bulkLoading === 'settle'"
            style="height:40px;padding:0 16px;border-radius:10px;background:#5856d6;color:#fff;border:none;font-size:14px;font-weight:500;cursor:pointer" :style="bulkLoading === 'settle' ? 'opacity:0.6' : ''">
            {{ bulkLoading === 'settle' ? '结算中...' : '📊 结算昨日' }}
          </button>
        </div>
      </div>

      <!-- Today's predictions list -->
      <div style="background:#fff;border-radius:16px;padding:16px 20px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
          <div style="font-size:15px;font-weight:600">今日预测</div>
          <button @click="loadTodayPreds" style="font-size:13px;color:#007aff;background:none;border:none;cursor:pointer">刷新</button>
        </div>

        <div v-if="predsLoading" style="text-align:center;padding:40px 0;color:#8e8e93">加载中...</div>
        <div v-else-if="!todayPreds.length" style="text-align:center;padding:40px 0;color:#8e8e93">暂无今日预测</div>

        <div v-for="pred in todayPreds" :key="pred.id"
          style="border-bottom:1px solid #f2f2f7;padding:14px 0;display:flex;align-items:center;gap:10px">
          <!-- Stock info -->
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
              <span style="font-size:15px;font-weight:600">{{ pred.symbol_name }}</span>
              <span style="font-size:12px;color:#8e8e93">{{ pred.symbol }}</span>
              <span v-if="pred.hot_rank" style="font-size:11px;background:#fff7ed;color:#c2410c;border-radius:6px;padding:2px 6px">
                热度 #{{ pred.hot_rank }}
              </span>
            </div>
            <div style="display:flex;align-items:center;gap:8px">
              <span :style="`font-size:13px;font-weight:600;color:${directionColor[pred.predicted_direction] || '#636366'}`">
                {{ directionLabel[pred.predicted_direction] || pred.predicted_direction }}
              </span>
              <span v-if="pred.confidence" style="font-size:12px;color:#8e8e93">{{ Math.round(pred.confidence) }}%</span>
              <span :style="`font-size:11px;border-radius:6px;padding:2px 8px;background:${statusColor[pred.status]}20;color:${statusColor[pred.status]}`">
                {{ statusLabel[pred.status] || pred.status }}
              </span>
            </div>
          </div>

          <!-- Action buttons -->
          <div style="display:flex;gap:6px;flex-shrink:0">
            <button @click="openPreview(pred)"
              style="height:32px;padding:0 10px;border-radius:8px;background:#f2f2f7;color:#007aff;border:none;font-size:12px;cursor:pointer">
              预览
            </button>
            <button v-if="pred.status === 'pending'" @click="approvePred(pred)" :disabled="!!actionLoading[pred.id]"
              style="height:32px;padding:0 10px;border-radius:8px;background:#34c75920;color:#34c759;border:none;font-size:12px;cursor:pointer">
              {{ actionLoading[pred.id] === 'approve' ? '...' : '通过' }}
            </button>
            <button v-if="pred.status === 'pending' || pred.status === 'approved'" @click="rejectPred(pred)" :disabled="!!actionLoading[pred.id]"
              style="height:32px;padding:0 10px;border-radius:8px;background:#ff3b3020;color:#ff3b30;border:none;font-size:12px;cursor:pointer">
              {{ actionLoading[pred.id] === 'reject' ? '...' : '拒绝' }}
            </button>
            <button v-if="pred.status === 'approved'" @click="postPred(pred)" :disabled="!!actionLoading[pred.id]"
              style="height:32px;padding:0 10px;border-radius:8px;background:#007aff;color:#fff;border:none;font-size:12px;cursor:pointer">
              {{ actionLoading[pred.id] === 'post' ? '发布中...' : '发布' }}
            </button>
            <a v-if="pred.prediction_tweet_id" :href="`https://x.com/i/web/status/${pred.prediction_tweet_id}`" target="_blank"
              style="height:32px;padding:0 10px;border-radius:8px;background:#f2f2f7;color:#5856d6;border:none;font-size:12px;cursor:pointer;display:flex;align-items:center;text-decoration:none">
              查看推文
            </a>
          </div>
        </div>
      </div>
    </div>

    <!-- ══════════════════ Tab: 历史战绩 ══════════════════ -->
    <div v-if="activeTab === 'history'" style="max-width:800px;margin:0 auto;padding:0 16px 40px">

      <!-- Filters -->
      <div style="background:#fff;border-radius:16px;padding:16px 20px;margin-bottom:16px;display:flex;gap:12px;flex-wrap:wrap;align-items:center">
        <input v-model="historyDateFrom" type="date" @change="loadHistory"
          style="height:36px;padding:0 12px;border-radius:8px;border:1px solid #e5e5ea;font-size:14px;background:#f2f2f7">
        <select v-model="historyStatus" @change="loadHistory"
          style="height:36px;padding:0 12px;border-radius:8px;border:1px solid #e5e5ea;font-size:14px;background:#f2f2f7">
          <option value="">全部状态</option>
          <option value="posted">已发布</option>
          <option value="settled">已结算</option>
          <option value="rejected">已拒绝</option>
        </select>
        <button @click="loadHistory" style="height:36px;padding:0 16px;border-radius:8px;background:#007aff;color:#fff;border:none;font-size:14px;cursor:pointer">筛选</button>
      </div>

      <!-- Table -->
      <div style="background:#fff;border-radius:16px;overflow:hidden">
        <div v-if="historyLoading" style="text-align:center;padding:40px 0;color:#8e8e93">加载中...</div>
        <div v-else-if="!historyPreds.length" style="text-align:center;padding:40px 0;color:#8e8e93">暂无记录</div>
        <div v-else style="overflow-x:auto">
          <table style="width:100%;border-collapse:collapse;font-size:13px">
            <thead>
              <tr style="border-bottom:1px solid #f2f2f7">
                <th v-for="h in ['日期','股票','预测','置信','实际涨跌','命中','❤️','🔁']" :key="h"
                  style="padding:10px 12px;text-align:left;font-size:11px;font-weight:600;color:#8e8e93;text-transform:uppercase;white-space:nowrap">{{ h }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in historyPreds" :key="p.id" style="border-bottom:1px solid #f9f9f9;cursor:pointer" @mouseenter="($event.target as HTMLElement).closest('tr')!.style.background='#f9f9f9'" @mouseleave="($event.target as HTMLElement).closest('tr')!.style.background=''">
                <td style="padding:10px 12px;color:#636366;white-space:nowrap">{{ p.prediction_date }}</td>
                <td style="padding:10px 12px;font-weight:600;white-space:nowrap">{{ p.symbol_name }}<br><span style="font-weight:400;color:#8e8e93">{{ p.symbol }}</span></td>
                <td :style="`padding:10px 12px;font-weight:600;color:${directionColor[p.predicted_direction] || '#636366'};white-space:nowrap`">
                  {{ directionLabel[p.predicted_direction] || '—' }}
                </td>
                <td style="padding:10px 12px;color:#636366">{{ p.confidence ? Math.round(p.confidence) + '%' : '—' }}</td>
                <td :style="`padding:10px 12px;font-weight:600;color:${pctColor(p.actual_change_pct)};white-space:nowrap`">
                  {{ pctText(p.actual_change_pct) }}
                </td>
                <td style="padding:10px 12px;font-size:16px">
                  <span v-if="p.is_correct === true">✅</span>
                  <span v-else-if="p.is_correct === false">❌</span>
                  <span v-else style="color:#8e8e93">—</span>
                </td>
                <td style="padding:10px 12px;color:#636366">{{ p.likes_count || 0 }}</td>
                <td style="padding:10px 12px;color:#636366">{{ p.retweets_count || 0 }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- ══════════════════ Tab: 内容配置 ══════════════════ -->
    <div v-if="activeTab === 'content'" style="max-width:800px;margin:0 auto;padding:0 16px 40px">

      <div style="background:#fff;border-radius:16px;padding:20px;margin-bottom:16px">
        <div style="font-size:15px;font-weight:600;margin-bottom:16px">产品信息</div>
        <div style="margin-bottom:14px">
          <div style="font-size:13px;color:#8e8e93;margin-bottom:6px">产品链接（推文中展示）</div>
          <input v-model="settings.xbot_product_url" type="text" placeholder="https://your-product.com"
            style="width:100%;height:44px;padding:0 14px;border-radius:10px;border:1px solid #e5e5ea;font-size:15px;background:#f2f2f7;box-sizing:border-box">
        </div>
        <div style="margin-bottom:14px">
          <div style="font-size:13px;color:#8e8e93;margin-bottom:6px">固定标签（用空格分隔）</div>
          <input v-model="settings.xbot_hashtags" type="text" placeholder="#A股 #AI选股 #股票预测"
            style="width:100%;height:44px;padding:0 14px;border-radius:10px;border:1px solid #e5e5ea;font-size:15px;background:#f2f2f7;box-sizing:border-box">
        </div>
        <div>
          <div style="font-size:13px;color:#8e8e93;margin-bottom:6px">免责声明</div>
          <input v-model="settings.xbot_disclaimer" type="text" placeholder="⚠️ 仅供参考，非投资建议"
            style="width:100%;height:44px;padding:0 14px;border-radius:10px;border:1px solid #e5e5ea;font-size:15px;background:#f2f2f7;box-sizing:border-box">
        </div>
      </div>

      <div style="background:#fff;border-radius:16px;padding:20px;margin-bottom:16px">
        <div style="font-size:15px;font-weight:600;margin-bottom:4px">预测推文模板</div>
        <div style="font-size:12px;color:#8e8e93;margin-bottom:12px">
          可用变量：{name} {symbol} {direction_emoji} {direction_cn} {confidence} {target_price} {stop_loss} {summary_line} {date} {hashtags} {disclaimer} {product_url}
        </div>
        <textarea v-model="settings.xbot_tweet_template" rows="8" placeholder="留空使用默认模板"
          style="width:100%;padding:12px 14px;border-radius:10px;border:1px solid #e5e5ea;font-size:14px;background:#f2f2f7;resize:vertical;box-sizing:border-box;font-family:inherit"></textarea>
      </div>

      <div style="background:#fff;border-radius:16px;padding:20px;margin-bottom:16px">
        <div style="font-size:15px;font-weight:600;margin-bottom:4px">结果推文模板</div>
        <div style="font-size:12px;color:#8e8e93;margin-bottom:12px">
          可用变量：{name} {symbol} {pred_emoji} {direction_cn} {confidence} {actual_pct} {hit_emoji} {result_emoji} {accuracy_7d} {pct_7d} {accuracy_30d} {pct_30d} {product_url} {hashtags}
        </div>
        <textarea v-model="settings.xbot_result_template" rows="8" placeholder="留空使用默认模板"
          style="width:100%;padding:12px 14px;border-radius:10px;border:1px solid #e5e5ea;font-size:14px;background:#f2f2f7;resize:vertical;box-sizing:border-box;font-family:inherit"></textarea>
      </div>

      <!-- Test card preview -->
      <div style="background:#fff;border-radius:16px;padding:20px;margin-bottom:16px">
        <div style="font-size:15px;font-weight:600;margin-bottom:12px">卡片预览测试</div>
        <button @click="testCard" :disabled="testCardLoading"
          style="height:44px;padding:0 20px;border-radius:10px;background:#007aff;color:#fff;border:none;font-size:15px;font-weight:500;cursor:pointer;opacity:1" :style="testCardLoading ? 'opacity:0.6' : ''">
          {{ testCardLoading ? '生成中...' : '生成示例卡片' }}
        </button>
        <div v-if="testCardUrl" style="margin-top:16px">
          <img :src="testCardUrl" style="width:100%;max-width:360px;border-radius:12px;display:block" />
        </div>
      </div>

      <button @click="saveSettings" :disabled="settingsSaving"
        style="width:100%;height:50px;border-radius:14px;background:#007aff;color:#fff;border:none;font-size:16px;font-weight:600;cursor:pointer" :style="settingsSaving ? 'opacity:0.6' : ''">
        {{ settingsSaving ? '保存中...' : '保存配置' }}
      </button>
    </div>

    <!-- ══════════════════ Tab: 系统设置 ══════════════════ -->
    <div v-if="activeTab === 'settings'" style="max-width:800px;margin:0 auto;padding:0 16px 40px">

      <!-- On/Off switches -->
      <div style="background:#fff;border-radius:16px;padding:20px;margin-bottom:16px">
        <div style="font-size:15px;font-weight:600;margin-bottom:16px">运行控制</div>

        <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid #f2f2f7">
          <div>
            <div style="font-size:15px;font-weight:500">机器人总开关</div>
            <div style="font-size:12px;color:#8e8e93;margin-top:2px">关闭后定时任务停止执行</div>
          </div>
          <label style="position:relative;width:51px;height:31px;cursor:pointer">
            <input type="checkbox" :checked="settings.xbot_enabled === 'true'" @change="settings.xbot_enabled = ($event.target as HTMLInputElement).checked ? 'true' : 'false'" style="opacity:0;width:0;height:0;position:absolute">
            <span :style="`position:absolute;inset:0;border-radius:34px;transition:.3s;background:${settings.xbot_enabled==='true'?'#34c759':'#e5e5ea'}`"></span>
            <span :style="`position:absolute;width:27px;height:27px;border-radius:50%;background:#fff;top:2px;transition:.3s;left:${settings.xbot_enabled==='true'?'22px':'2px'};box-shadow:0 2px 4px rgba(0,0,0,0.2)`"></span>
          </label>
        </div>

        <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 0">
          <div>
            <div style="font-size:15px;font-weight:500">自动发帖模式</div>
            <div style="font-size:12px;color:#8e8e93;margin-top:2px">关闭后需手动审核才会发布</div>
          </div>
          <label style="position:relative;width:51px;height:31px;cursor:pointer">
            <input type="checkbox" :checked="settings.xbot_auto_post === 'true'" @change="settings.xbot_auto_post = ($event.target as HTMLInputElement).checked ? 'true' : 'false'" style="opacity:0;width:0;height:0;position:absolute">
            <span :style="`position:absolute;inset:0;border-radius:34px;transition:.3s;background:${settings.xbot_auto_post==='true'?'#007aff':'#e5e5ea'}`"></span>
            <span :style="`position:absolute;width:27px;height:27px;border-radius:50%;background:#fff;top:2px;transition:.3s;left:${settings.xbot_auto_post==='true'?'22px':'2px'};box-shadow:0 2px 4px rgba(0,0,0,0.2)`"></span>
          </label>
        </div>
      </div>

      <!-- Scheduling -->
      <div style="background:#fff;border-radius:16px;padding:20px;margin-bottom:16px">
        <div style="font-size:15px;font-weight:600;margin-bottom:16px">时间配置（北京时间）</div>
        <div v-for="(item, i) in [
          { key: 'xbot_stocks_count', label: '每日选股数量', type: 'number', placeholder: '5', note: '1-10只' },
          { key: 'xbot_predict_time', label: '预测生成时间', type: 'time', placeholder: '16:15', note: '收盘后' },
          { key: 'xbot_post_time', label: '自动发帖时间', type: 'time', placeholder: '16:30', note: '仅自动模式' },
          { key: 'xbot_result_time', label: '结果发布时间', type: 'time', placeholder: '09:30', note: '次日开盘前' },
        ]" :key="i" style="margin-bottom:14px">
          <div style="font-size:13px;color:#8e8e93;margin-bottom:6px">{{ item.label }} <span style="color:#c7c7cc">{{ item.note }}</span></div>
          <input v-model="settings[item.key]" :type="item.type" :placeholder="item.placeholder"
            style="width:160px;height:44px;padding:0 14px;border-radius:10px;border:1px solid #e5e5ea;font-size:15px;background:#f2f2f7">
        </div>
      </div>

      <!-- Twitter API -->
      <div style="background:#fff;border-radius:16px;padding:20px;margin-bottom:16px">
        <div style="font-size:15px;font-weight:600;margin-bottom:16px">Twitter API 配置</div>
        <div v-for="field in [
          { key: 'xbot_twitter_api_key', label: 'API Key' },
          { key: 'xbot_twitter_api_secret', label: 'API Secret' },
          { key: 'xbot_twitter_access_token', label: 'Access Token' },
          { key: 'xbot_twitter_access_token_secret', label: 'Access Token Secret' },
        ]" :key="field.key" style="margin-bottom:12px">
          <div style="font-size:13px;color:#8e8e93;margin-bottom:6px">{{ field.label }}</div>
          <input v-model="settings[field.key]" type="password"
            style="width:100%;height:44px;padding:0 14px;border-radius:10px;border:1px solid #e5e5ea;font-size:15px;background:#f2f2f7;box-sizing:border-box">
        </div>

        <div style="display:flex;align-items:center;gap:12px;margin-top:4px">
          <button @click="testTwitter" :disabled="twitterTesting"
            style="height:40px;padding:0 16px;border-radius:10px;background:#f2f2f7;color:#007aff;border:none;font-size:14px;font-weight:500;cursor:pointer">
            {{ twitterTesting ? '测试中...' : '测试连通性' }}
          </button>
          <span v-if="twitterTestResult" style="font-size:14px;color:#3c3c43">{{ twitterTestResult }}</span>
        </div>
      </div>

      <button @click="saveSettings" :disabled="settingsSaving"
        style="width:100%;height:50px;border-radius:14px;background:#007aff;color:#fff;border:none;font-size:16px;font-weight:600;cursor:pointer" :style="settingsSaving ? 'opacity:0.6' : ''">
        {{ settingsSaving ? '保存中...' : '保存设置' }}
      </button>
    </div>

  </div>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity .2s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
.sheet-enter-active, .sheet-leave-active { transition: opacity .3s; }
.sheet-enter-from, .sheet-leave-to { opacity: 0; }
</style>
