<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import api from '~/lib/api'

const route = useRoute()
const router = useRouter()
const pred = ref<Record<string, any> | null>(null)
const previewUrl = ref('')
const msg = ref('')
const msgType = ref<'ok' | 'err'>('ok')
const loading = ref('')

function getAdminHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('admin_token') : ''
  return { 'X-Admin-Token': token || '' }
}

function showMsg(text: string, type: 'ok' | 'err' = 'ok') {
  msg.value = text
  msgType.value = type
  window.setTimeout(() => { msg.value = '' }, 2800)
}

async function loadDetail() {
  loading.value = 'detail'
  try {
    const res = await api.get(`/api/admin/xbot/predictions/${route.params.id}`, { headers: getAdminHeaders() })
    pred.value = res.data
    await loadCardPreview()
  } catch (e: any) {
    showMsg(e.response?.data?.detail || '读取审核记录失败', 'err')
  } finally {
    loading.value = ''
  }
}

async function loadCardPreview() {
  if (!pred.value) return
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  const variant = pred.value.actual_change_pct != null ? 'proof' : 'promise'
  const res = await api.get(`/api/admin/xbot/predictions/${pred.value.id}/card-preview`, {
    params: { variant },
    headers: getAdminHeaders(),
    responseType: 'blob',
  })
  previewUrl.value = URL.createObjectURL(res.data)
}

async function approve() {
  if (!pred.value) return
  loading.value = 'approve'
  try {
    await api.post(`/api/admin/xbot/predictions/${pred.value.id}/approve`, {}, { headers: getAdminHeaders() })
    showMsg('已通过审核')
    await loadDetail()
  } catch (e: any) {
    showMsg(e.response?.data?.detail || '通过失败', 'err')
  } finally {
    loading.value = ''
  }
}

async function reject() {
  if (!pred.value) return
  loading.value = 'reject'
  try {
    await api.post(`/api/admin/xbot/predictions/${pred.value.id}/reject`, {}, { headers: getAdminHeaders() })
    showMsg('已拒绝')
    await loadDetail()
  } catch (e: any) {
    showMsg(e.response?.data?.detail || '拒绝失败', 'err')
  } finally {
    loading.value = ''
  }
}

function priceReasonable() {
  if (!pred.value) return false
  const close = Number(pred.value.close_price || 0)
  const target = Number(pred.value.target_price || 0)
  const stop = Number(pred.value.stop_loss || 0)
  if (!close || !target || !stop) return false
  if (pred.value.predicted_direction === 'up') return target > close && stop < close
  if (pred.value.predicted_direction === 'down') return target < close && stop > close
  return target > 0 && stop > 0
}

const checklist = computed(() => {
  const p = pred.value
  if (!p) return []
  const sections = [p.market_diagnosis, p.opportunity_assessment, p.risk_analysis, p.execution_plan]
  return [
    { label: '方向明确', ok: ['up', 'down', 'hold'].includes(p.predicted_direction) },
    { label: '目标日存在', ok: Boolean(p.target_date) },
    { label: '目标价/止损价合理', ok: priceReasonable() },
    { label: '摘要可读', ok: Boolean(p.analysis_summary && p.analysis_summary.length >= 10) },
    { label: '四段分析完整', ok: sections.every(Boolean) },
    { label: '页脚网址正确', ok: true },
  ]
})

const publicPath = computed(() => {
  if (!pred.value) return ''
  return `/research/${pred.value.market}/${pred.value.symbol}/${pred.value.prediction_date}`
})
const marketLabel = computed(() => {
  const m = pred.value?.market
  if (m === 'hk') return '港股'
  if (m === 'us') return '美股'
  return 'A股'
})
const directionText = computed(() => {
  const d = pred.value?.predicted_direction
  return d === 'up' ? '看涨' : d === 'down' ? '看跌' : '震荡'
})
const statusText = computed(() => {
  const s = pred.value?.status
  return s === 'pending' ? '待审核'
    : s === 'approved' ? '已通过待结算'
    : s === 'settled' ? '已结算'
    : s === 'rejected' ? '已拒绝'
    : s || '-'
})
const previewVariantText = computed(() => pred.value?.actual_change_pct != null ? 'Proof 结算卡' : 'Promise 预测卡')
const seoTitle = computed(() => {
  if (!pred.value) return ''
  return `${pred.value.symbol_name} ${pred.value.prediction_date} AI K线分析复盘`
})
const seoDescription = computed(() => {
  if (!pred.value) return ''
  const pct = pctText(pred.value.actual_change_pct)
  return `${pred.value.symbol_name} 的 AI K线分析历史复盘：当时方向 ${directionText.value}，目标日 ${pred.value.target_date || '-'}，实际涨跌 ${pct}。`
})
const resultLabel = computed(() => {
  if (!pred.value || pred.value.actual_change_pct == null) return '待结算'
  return pred.value.is_correct ? '命中' : '未命中'
})
const resultTone = computed(() => {
  if (!pred.value || pred.value.actual_change_pct == null) return 'pending'
  return pred.value.is_correct ? 'hit' : 'miss'
})
const publicLead = computed(() => {
  if (!pred.value) return ''
  const settleText = pred.value.actual_change_pct == null ? '尚未结算，当前为将来公开页首屏预览' : '已完成结算'
  return `${pred.value.symbol_name} 在 ${pred.value.prediction_date} 生成的 AI 技术面预测，目标日 ${pred.value.target_date || '-'} ${settleText}。本页保留原始判断、关键价格和实际结果，作为可追溯的历史复盘。`
})
const priceMetrics = computed(() => {
  if (!pred.value) return []
  return [
    { label: '当时方向', value: directionText.value },
    { label: '置信度', value: pred.value.confidence ? Math.round(pred.value.confidence) + '%' : '-' },
    { label: '基准收盘', value: pred.value.close_price ? Number(pred.value.close_price).toFixed(2) : '-' },
    { label: '目标价', value: pred.value.target_price ? Number(pred.value.target_price).toFixed(2) : '-' },
    { label: '止损价', value: pred.value.stop_loss ? Number(pred.value.stop_loss).toFixed(2) : '-' },
    { label: '实际收盘', value: pred.value.actual_close ? Number(pred.value.actual_close).toFixed(2) : '-' },
  ]
})
const analysisSections = computed(() => {
  if (!pred.value) return []
  return [
    { title: '市场诊断', text: pred.value.market_diagnosis },
    { title: '机会评估', text: pred.value.opportunity_assessment },
    { title: '风险分析', text: pred.value.risk_analysis },
    { title: '执行计划', text: pred.value.execution_plan },
  ].filter(item => item.text)
})

function pctText(v: number | null | undefined) {
  if (v == null) return '-'
  return `${v >= 0 ? '+' : ''}${Number(v).toFixed(2)}%`
}

onMounted(loadDetail)
onUnmounted(() => {
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
})
</script>

<template>
  <div class="page">
    <header class="topbar">
      <button class="text-btn" @click="router.back()">返回</button>
      <strong>完整审核</strong>
      <NuxtLink class="text-btn" to="/admin/model-review">工作流</NuxtLink>
    </header>

    <div v-if="msg" :class="['toast', msgType]">{{ msg }}</div>

    <main v-if="pred" class="content">
      <section class="hero panel">
        <div>
          <span class="eyebrow">{{ statusText }} · {{ marketLabel }} · {{ pred.symbol }}</span>
          <h1>{{ pred.symbol_name }} 完整审核</h1>
          <p>{{ pred.prediction_date }} 生成，目标日 {{ pred.target_date || '-' }}。当前预览为 {{ previewVariantText }}。</p>
        </div>
        <div class="signal">
          <strong>{{ directionText }}</strong>
          <span>置信度 {{ Math.round(pred.confidence || 0) }}%</span>
        </div>
      </section>

      <section class="review-workbench">
        <aside class="panel audit-panel">
          <div class="panel-title">审核清单</div>
          <div class="check-list">
            <div v-for="item in checklist" :key="item.label" class="check">
              <span :class="['dot', item.ok ? 'ok' : 'bad']" />
              <span>{{ item.label }}</span>
            </div>
          </div>

          <div class="panel-title">关键价格</div>
          <div class="price-row"><span>基准收盘</span><strong>{{ pred.close_price?.toFixed?.(2) ?? '-' }}</strong></div>
          <div class="price-row"><span>目标价</span><strong>{{ pred.target_price?.toFixed?.(2) ?? '-' }}</strong></div>
          <div class="price-row"><span>止损价</span><strong>{{ pred.stop_loss?.toFixed?.(2) ?? '-' }}</strong></div>
          <div class="price-row"><span>目标日</span><strong>{{ pred.target_date }}</strong></div>
          <div v-if="pred.actual_change_pct != null" class="price-row"><span>结算涨跌</span><strong>{{ pctText(pred.actual_change_pct) }}</strong></div>

          <div class="actions">
            <button v-if="pred.status === 'pending'" class="primary" :disabled="loading === 'approve'" @click="approve">通过审核</button>
            <button v-if="['pending','approved'].includes(pred.status)" class="danger" :disabled="loading === 'reject'" @click="reject">拒绝</button>
            <NuxtLink v-if="pred.status === 'settled'" class="secondary" :to="publicPath" target="_blank">打开公开页</NuxtLink>
          </div>
        </aside>

        <section class="panel card-panel">
          <div class="panel-title">
            <span>真实生成 PNG</span>
            <small>{{ previewVariantText }}</small>
          </div>
          <img v-if="previewUrl" class="card-img" :src="previewUrl" alt="模型复盘卡片预览">
          <div v-else class="empty">卡片生成中...</div>
        </section>

        <aside class="panel publish-panel">
          <div class="panel-title">公开页与 SEO 预览</div>
          <div class="preview-label">SEO snippet</div>
          <div class="seo-preview">
            <span class="seo-url">{{ publicPath }}</span>
            <strong>{{ seoTitle }}</strong>
            <p>{{ seoDescription }}</p>
          </div>

          <div class="preview-label">公开页预览</div>
          <div class="public-page-preview">
            <header class="pub-hero">
              <div class="pub-copy">
                <span class="pub-back">该标的历史记录</span>
                <span class="pub-eyebrow">{{ marketLabel }} · {{ pred.symbol }} · {{ pred.prediction_date }}</span>
                <strong>{{ pred.symbol_name }} AI K线分析复盘：{{ resultLabel }}记录</strong>
                <p>{{ publicLead }}</p>
              </div>
              <figure class="pub-card">
                <img v-if="previewUrl" :src="previewUrl" alt="公开页卡图预览">
                <div v-else class="empty">卡片生成中...</div>
                <figcaption>{{ pred.actual_change_pct == null ? '审核时生成的预测卡片预览' : '审核时生成的原始预测卡片' }}</figcaption>
              </figure>
            </header>

            <section class="pub-result" :class="resultTone">
              <div>
                <span>结算结果</span>
                <strong>{{ resultLabel }}</strong>
                <p>预测方向 {{ directionText }}，实际涨跌 {{ pctText(pred.actual_change_pct) }}</p>
              </div>
              <div>
                <span>实际涨跌</span>
                <strong>{{ pctText(pred.actual_change_pct) }}</strong>
              </div>
              <div>
                <span>目标日</span>
                <strong>{{ pred.target_date || '-' }}</strong>
              </div>
            </section>

            <div class="pub-metrics">
              <div v-for="item in priceMetrics" :key="item.label">
                <span>{{ item.label }}</span>
                <strong>{{ item.value }}</strong>
              </div>
            </div>

            <section v-if="pred.analysis_summary" class="pub-section summary">
              <h3>摘要</h3>
              <p>{{ pred.analysis_summary }}</p>
            </section>

            <section v-if="analysisSections.length" class="pub-section">
              <h3>{{ pred.symbol_name }} AI K线分析四步记录</h3>
              <div class="pub-analysis">
                <div v-for="item in analysisSections" :key="item.title">
                  <strong>{{ item.title }}</strong>
                  <p>{{ item.text }}</p>
                </div>
              </div>
            </section>
          </div>
          <NuxtLink v-if="pred.status === 'settled'" class="secondary full" :to="publicPath" target="_blank">打开公开页</NuxtLink>
        </aside>
      </section>

      <section class="panel">
        <div class="panel-title">原始分析</div>
        <ArticleBlock title="摘要" :text="pred.analysis_summary" />
        <ArticleBlock title="市场诊断" :text="pred.market_diagnosis" />
        <ArticleBlock title="机会评估" :text="pred.opportunity_assessment" />
        <ArticleBlock title="风险收益" :text="pred.risk_analysis" />
        <ArticleBlock title="执行方案" :text="pred.execution_plan" />
      </section>
    </main>

    <main v-else class="content">
      <div class="panel empty">{{ loading === 'detail' ? '加载中...' : '未找到记录' }}</div>
    </main>
  </div>
</template>

<script lang="ts">
export default {
  components: {
    ArticleBlock: {
      props: ['title', 'text'],
      template: `
        <div v-if="text" class="article-block">
          <h3>{{ title }}</h3>
          <p>{{ text }}</p>
        </div>
      `,
    },
  },
}
</script>

<style scoped>
.page { min-height: 100vh; background: #f3f4f6; color: #111827; }
.topbar { position: sticky; top: 0; z-index: 10; height: 52px; display: grid; grid-template-columns: 90px 1fr 90px; align-items: center; padding: 0 16px; background: rgba(255,255,255,.94); border-bottom: 1px solid #e5e7eb; backdrop-filter: blur(14px); text-align: center; }
.text-btn { color: #2563eb; text-decoration: none; background: none; border: 0; font-size: 14px; }
.content { max-width: 1280px; margin: 0 auto; padding: 16px 16px 48px; }
.toast { position: fixed; top: 64px; left: 50%; transform: translateX(-50%); z-index: 20; padding: 10px 16px; border-radius: 10px; color: #fff; font-weight: 700; }
.toast.ok { background: #16a34a; }
.toast.err { background: #dc2626; }
.panel { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin-bottom: 14px; }
.hero { display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 20px; }
.eyebrow { display: block; color: #6b7280; font-size: 12px; font-weight: 800; margin-bottom: 8px; }
h1 { margin: 0 0 6px; font-size: 30px; letter-spacing: 0; }
p { color: #4b5563; line-height: 1.7; margin: 0; white-space: pre-wrap; word-break: break-word; }
.signal { text-align: right; }
.signal strong { display: block; color: #b45309; font-size: 28px; }
.signal span { color: #6b7280; font-size: 13px; }
.review-workbench { display: grid; grid-template-columns: minmax(260px, .82fr) minmax(360px, 1.15fr) minmax(300px, .9fr); gap: 14px; align-items: start; }
.audit-panel, .publish-panel { position: sticky; top: 66px; }
.card-panel { background: #111827; border-color: #111827; }
.card-panel .panel-title { color: #f9fafb; }
.card-panel .panel-title small { color: #9ca3af; }
.panel-title { display: flex; justify-content: space-between; align-items: center; gap: 12px; font-weight: 800; color: #374151; margin-bottom: 12px; }
.panel-title small { color: #6b7280; font-size: 12px; }
.check-list { margin-bottom: 18px; }
.check { display: flex; align-items: center; gap: 8px; padding: 8px 0; border-bottom: 1px solid #f3f4f6; }
.dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
.dot.ok { background: #16a34a; }
.dot.bad { background: #dc2626; }
.actions { display: flex; gap: 8px; margin-top: 14px; flex-wrap: wrap; }
.primary, .secondary, .danger { height: 40px; padding: 0 16px; border: 0; border-radius: 8px; font-weight: 800; display: inline-flex; align-items: center; justify-content: center; text-decoration: none; }
.primary { color: #fff; background: #2563eb; }
.secondary { color: #2563eb; background: #eff6ff; }
.danger { color: #dc2626; background: #fef2f2; }
.full { width: 100%; margin-top: 12px; }
.price-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #f3f4f6; }
.price-row span { color: #6b7280; }
.card-img { display: block; width: 100%; border-radius: 8px; background: #f9fafb; box-shadow: 0 18px 50px rgba(0,0,0,.28); }
.preview-label { margin: 12px 0 8px; color: #6b7280; font-size: 12px; font-weight: 900; text-transform: uppercase; letter-spacing: .04em; }
.seo-preview, .public-page-preview { border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px; background: #fafafa; margin-bottom: 12px; }
.seo-url { color: #15803d; font-size: 12px; display: block; margin-bottom: 6px; word-break: break-all; }
.seo-preview strong { display: block; color: #1d4ed8; font-size: 17px; line-height: 1.35; margin-bottom: 6px; }
.seo-preview p { color: #4b5563; font-size: 13px; line-height: 1.6; }
.public-page-preview { background: #f3f4f6; max-height: 760px; overflow: auto; }
.pub-hero { display: grid; grid-template-columns: minmax(0, 1fr) 150px; gap: 14px; align-items: center; padding: 14px; background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; }
.pub-copy { min-width: 0; }
.pub-back { color: #2563eb; font-size: 12px; font-weight: 800; }
.pub-eyebrow { display: block; margin-top: 10px; color: #6b7280; font-size: 12px; font-weight: 800; }
.pub-copy strong { display: block; font-size: 24px; line-height: 1.15; margin: 8px 0 10px; color: #111827; }
.pub-copy p { font-size: 13px; line-height: 1.7; }
.pub-card { margin: 0; min-width: 0; }
.pub-card img { display: block; width: 100%; aspect-ratio: 4 / 5; object-fit: contain; border-radius: 8px; background: #111827; border: 1px solid #111827; }
.pub-card figcaption { margin-top: 6px; color: #6b7280; font-size: 11px; text-align: center; }
.pub-result { display: grid; grid-template-columns: 1.4fr .8fr .8fr; gap: 8px; margin-top: 12px; padding: 10px; background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; }
.pub-result div, .pub-metrics div, .pub-analysis div { min-width: 0; padding: 10px; border-radius: 8px; background: #f9fafb; }
.pub-result.hit { border-color: #bbf7d0; }
.pub-result.hit div:first-child { background: #f0fdf4; }
.pub-result.miss { border-color: #fecaca; }
.pub-result.miss div:first-child { background: #fef2f2; }
.pub-result.pending div:first-child { background: #fffbeb; }
.pub-result span, .pub-metrics span { display: block; color: #6b7280; font-size: 11px; margin-bottom: 6px; font-weight: 800; }
.pub-result strong { font-size: 22px; line-height: 1; color: #111827; }
.pub-result p { margin-top: 8px; font-size: 12px; line-height: 1.5; }
.pub-metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 12px; }
.pub-metrics strong { font-size: 17px; color: #111827; word-break: break-word; }
.pub-section { margin-top: 12px; padding: 14px; background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; }
.pub-section h3 { margin: 0 0 10px; font-size: 15px; color: #111827; }
.pub-section p { font-size: 13px; line-height: 1.7; }
.pub-section.summary p { color: #374151; }
.pub-analysis { display: grid; gap: 8px; }
.pub-analysis strong { display: block; margin-bottom: 6px; font-size: 13px; color: #111827; }
.article-block { padding: 12px 0; border-top: 1px solid #f3f4f6; }
.article-block:first-of-type { border-top: 0; }
.article-block h3 { margin: 0 0 6px; font-size: 14px; color: #6b7280; }
.empty { text-align: center; color: #6b7280; }
@media (max-width: 760px) {
  .hero, .actions { flex-direction: column; align-items: stretch; }
  .signal { text-align: left; }
  .review-workbench, .pub-hero, .pub-result, .pub-metrics { grid-template-columns: 1fr; }
  .audit-panel, .publish-panel { position: static; }
  .card-panel { order: -1; }
}
@media (min-width: 761px) and (max-width: 1120px) {
  .review-workbench { grid-template-columns: 1fr 1fr; }
  .card-panel { grid-column: 1 / -1; max-width: 560px; justify-self: center; width: 100%; }
  .audit-panel, .publish-panel { position: static; }
}
</style>
