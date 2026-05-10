<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import {
  PhArrowLeft,
  PhArticle,
  PhCheckCircle,
  PhGlobeHemisphereEast,
  PhImageSquare,
  PhListChecks,
  PhShieldCheck,
  PhXCircle,
} from '@phosphor-icons/vue'
import api from '~/lib/api'
import MrButton from '~/components/model-review/MrButton.vue'
import MrMetric from '~/components/model-review/MrMetric.vue'
import MrMotion from '~/components/model-review/MrMotion.vue'
import MrShell from '~/components/model-review/MrShell.vue'
import MrState from '~/components/model-review/MrState.vue'
import MrStatusBadge from '~/components/model-review/MrStatusBadge.vue'

const route = useRoute()
const router = useRouter()
const pred = ref<Record<string, any> | null>(null)
const previewUrl = ref('')
const previewError = ref('')
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

function apiErrorMessage(e: any, fallback: string) {
  const detail = e?.response?.data?.detail
  if (typeof detail === 'string' && detail.trim()) return detail
  if (detail?.message) return detail.message
  if (e?.message) return `${fallback}：${e.message}`
  return fallback
}

async function loadDetail() {
  loading.value = 'detail'
  try {
    const res = await api.get(`/api/admin/xbot/predictions/${route.params.id}`, { headers: getAdminHeaders() })
    pred.value = res.data
    await loadCardPreview()
  } catch (e: any) {
    showMsg(apiErrorMessage(e, '读取审核记录失败'), 'err')
  } finally {
    loading.value = ''
  }
}

async function loadCardPreview() {
  if (!pred.value) return
  previewError.value = ''
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  previewUrl.value = ''
  const variant = pred.value.actual_change_pct != null ? 'proof' : 'promise'
  try {
    const res = await api.get(`/api/admin/xbot/predictions/${pred.value.id}/card-preview`, {
      params: { variant },
      headers: getAdminHeaders(),
      responseType: 'blob',
    })
    previewUrl.value = URL.createObjectURL(res.data)
  } catch (e: any) {
    previewError.value = apiErrorMessage(e, '卡片预览生成失败')
  }
}

async function approve() {
  if (!pred.value) return
  loading.value = 'approve'
  try {
    await api.post(`/api/admin/xbot/predictions/${pred.value.id}/approve`, {}, { headers: getAdminHeaders() })
    showMsg('已通过审核')
    await loadDetail()
  } catch (e: any) {
    showMsg(apiErrorMessage(e, '通过失败'), 'err')
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
    showMsg(apiErrorMessage(e, '拒绝失败'), 'err')
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
    { label: '目标价和止损价合理', ok: priceReasonable() },
    { label: '摘要可读', ok: Boolean(p.analysis_summary && p.analysis_summary.length >= 10) },
    { label: '四段分析完整', ok: sections.every(Boolean) },
    { label: '公开路径可生成', ok: Boolean(publicPath.value) },
  ]
})

const publicPath = computed(() => {
  if (!pred.value) return ''
  return `/research/${pred.value.market}/${pred.value.symbol}/${pred.value.prediction_date}`
})

function isPublicStatus(p: Record<string, any> | null | undefined) {
  return ['approved', 'posted', 'settled'].includes(p?.status)
}

function isAwaitingResult(p: Record<string, any> | null | undefined) {
  return ['approved', 'posted'].includes(p?.status) && p?.actual_change_pct == null && p?.is_correct == null
}

const canOpenPublicPage = computed(() => isPublicStatus(pred.value))
const isDraftStatus = computed(() => ['pending', 'rejected'].includes(pred.value?.status))
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
    : s === 'posted' ? '已发布待结算'
    : s === 'settled' ? '已结算'
    : s === 'rejected' ? '已拒绝'
    : s || '-'
})
const previewVariantText = computed(() => pred.value?.actual_change_pct != null ? 'Proof 结算卡' : 'Promise 预测卡')
const resultStatusText = computed(() => {
  if (!pred.value) return '-'
  if (pred.value.status === 'pending') return '待审核'
  if (pred.value.status === 'rejected') return '已拒绝'
  if (isAwaitingResult(pred.value)) return '待验证'
  if (pred.value.is_correct === true) return '命中'
  if (pred.value.is_correct === false) return '未命中'
  return pred.value.status === 'settled' ? '已结算' : '-'
})
const settlementText = computed(() => pctText(pred.value?.actual_change_pct))
const publicPreviewTitle = computed(() => {
  if (!pred.value) return ''
  if (isDraftStatus.value) return `${pred.value.symbol_name} 审核草稿预览`
  return isAwaitingResult(pred.value) ? `${pred.value.symbol_name} 待验证 AI K线预测` : `${pred.value.symbol_name} AI K线分析复盘`
})
const seoTitle = computed(() => {
  if (!pred.value) return ''
  if (isDraftStatus.value) return `${pred.value.symbol_name} ${pred.value.prediction_date} 审核草稿预览`
  return isAwaitingResult(pred.value)
    ? `${pred.value.symbol_name} ${pred.value.prediction_date} 待验证 AI K线预测`
    : `${pred.value.symbol_name} ${pred.value.prediction_date} AI K线分析复盘`
})
const seoDescription = computed(() => {
  if (!pred.value) return ''
  if (isDraftStatus.value) return `${pred.value.symbol_name} 的模型复盘记录仍在审核中：当时方向 ${directionText.value}，目标日 ${pred.value.target_date || '-'}，通过审核后才会公开。`
  return isAwaitingResult(pred.value)
    ? `${pred.value.symbol_name} 的待验证 AI K线预测：当时方向 ${directionText.value}，目标日 ${pred.value.target_date || '-'}，实际涨跌待结算。`
    : `${pred.value.symbol_name} 的 AI K线分析历史复盘：当时方向 ${directionText.value}，目标日 ${pred.value.target_date || '-'}，实际涨跌 ${settlementText.value}。`
})
const resultTone = computed(() => {
  if (!pred.value || isAwaitingResult(pred.value)) return 'pending'
  if (pred.value.is_correct === true) return 'hit'
  if (pred.value.is_correct === false) return 'miss'
  return 'settled'
})
const publicLead = computed(() => {
  if (!pred.value) return ''
  if (isDraftStatus.value) {
    return `${pred.value.symbol_name} 仍处于${statusText.value}状态。本预览用于检查审核通过后的公开页结构，正式公开需要先通过审核。`
  }
  if (isAwaitingResult(pred.value)) {
    return `${pred.value.symbol_name} 在 ${pred.value.prediction_date} 生成的 AI 技术面预测，目标日 ${pred.value.target_date || '-'} 尚待结算。本页展示原始判断、方向、置信度和关键价格，结算后会自动更新为复盘记录。`
  }
  return `${pred.value.symbol_name} 在 ${pred.value.prediction_date} 生成的 AI 技术面预测，目标日 ${pred.value.target_date || '-'} 已完成结算。本页保留原始判断、关键价格和实际结果，作为可追溯的历史复盘。`
})
const priceMetrics = computed(() => {
  if (!pred.value) return []
  return [
    { label: '当时方向', value: directionText.value },
    { label: '置信度', value: pred.value.confidence == null ? '-' : Math.round(pred.value.confidence) + '%' },
    { label: '基准收盘', value: formatPrice(pred.value.close_price) },
    { label: '目标价', value: formatPrice(pred.value.target_price) },
    { label: '止损价', value: formatPrice(pred.value.stop_loss) },
    { label: '实际收盘', value: pred.value.actual_close == null ? '待结算' : formatPrice(pred.value.actual_close) },
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
const confidenceLabel = computed(() => `${Math.round(pred.value?.confidence || 0)}%`)

function pctText(v: number | null | undefined) {
  if (v == null) return '待结算'
  return `${v >= 0 ? '+' : ''}${Number(v).toFixed(2)}%`
}

function formatPrice(v: number | null | undefined) {
  if (v == null) return '-'
  return Number(v).toFixed(2)
}

onMounted(loadDetail)
onUnmounted(() => {
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
})
</script>

<template>
  <MrShell title="完整审核" back-to="/admin/model-review" back-label="工作流">
    <template #backIcon>
      <PhArrowLeft :size="16" weight="bold" />
    </template>
    <template #titleIcon>
      <PhShieldCheck :size="18" weight="bold" />
    </template>
    <template #actions>
      <NuxtLink v-if="canOpenPublicPage" class="mr-btn mr-btn-ghost mr-btn-small" :to="publicPath" target="_blank">
        <PhGlobeHemisphereEast :size="16" weight="bold" />
        公开页
      </NuxtLink>
    </template>

    <div v-if="msg" :class="['mr-toast', msgType]">{{ msg }}</div>

    <main v-if="pred">
      <MrMotion>
        <section class="mr-hero">
          <div class="mr-hero-main">
            <div class="mr-kicker">
              <PhListChecks :size="16" weight="bold" />
              {{ marketLabel }} / {{ pred.symbol }} / {{ statusText }}
            </div>
            <h1 class="mr-title">{{ pred.symbol_name }} 完整审核</h1>
            <p class="mr-lead">
              {{ pred.prediction_date }} 生成，目标日 {{ pred.target_date || '-' }}。当前预览为 {{ previewVariantText }}，审核通过后公开页按同一路径展示。
            </p>
          </div>
          <aside class="mr-hero-side">
            <div>
              <div class="mr-kicker">模型信号</div>
              <strong>{{ directionText }}</strong>
              <small>置信度 {{ confidenceLabel }}，结算状态 {{ resultStatusText }}。</small>
            </div>
            <MrStatusBadge :status="pred.status" :label="statusText" />
          </aside>
        </section>
      </MrMotion>

      <section class="mr-workbench-3">
        <aside class="mr-panel mr-sticky">
          <div class="mr-panel-header">
            <div>
              <h2 class="mr-panel-title">审核清单</h2>
              <p class="mr-panel-sub">先确认结构完整，再执行通过或拒绝。</p>
            </div>
            <PhListChecks :size="20" weight="bold" />
          </div>

          <div>
            <div v-for="item in checklist" :key="item.label" class="mr-check-row">
              <span :class="['mr-check-dot', item.ok ? 'ok' : '']" />
              <span>{{ item.label }}</span>
            </div>
          </div>

          <div class="mr-panel-header" style="margin-top: 18px">
            <div>
              <h2 class="mr-panel-title">关键价格</h2>
              <p class="mr-panel-sub">价格逻辑用于快速排查方向错误。</p>
            </div>
          </div>
          <div class="mr-price-row"><span>基准收盘</span><strong>{{ formatPrice(pred.close_price) }}</strong></div>
          <div class="mr-price-row"><span>目标价</span><strong>{{ formatPrice(pred.target_price) }}</strong></div>
          <div class="mr-price-row"><span>止损价</span><strong>{{ formatPrice(pred.stop_loss) }}</strong></div>
          <div class="mr-price-row"><span>目标日</span><strong>{{ pred.target_date || '-' }}</strong></div>
          <div class="mr-price-row"><span>验证状态</span><strong>{{ resultStatusText }}</strong></div>
          <div class="mr-price-row"><span>结算涨跌</span><strong>{{ settlementText }}</strong></div>

          <div class="mr-toolbar" style="margin: 16px 0 0">
            <MrButton v-if="pred.status === 'pending'" variant="primary" :disabled="loading === 'approve'" @click="approve">
              <template #icon><PhCheckCircle :size="17" weight="bold" /></template>
              通过审核
            </MrButton>
            <MrButton v-if="['pending', 'approved', 'posted'].includes(pred.status)" variant="danger" :disabled="loading === 'reject'" @click="reject">
              <template #icon><PhXCircle :size="17" weight="bold" /></template>
              拒绝
            </MrButton>
            <NuxtLink v-if="canOpenPublicPage" class="mr-btn mr-btn-secondary" :to="publicPath" target="_blank">
              打开公开页
            </NuxtLink>
          </div>
        </aside>

        <section class="mr-panel mr-card-dark">
          <div class="mr-panel-header">
            <div>
              <h2 class="mr-panel-title">真实生成 PNG</h2>
              <p class="mr-panel-sub">{{ previewVariantText }}，来自后台 card-preview 接口。</p>
            </div>
            <PhImageSquare :size="20" weight="bold" />
          </div>
          <img v-if="previewUrl" class="mr-png-preview" :src="previewUrl" alt="模型复盘卡片预览">
          <MrState v-else-if="previewError" title="卡片生成失败" :text="previewError" variant="error" />
          <MrState v-else title="卡片生成中" text="正在读取实际 PNG 输出。" variant="loading" />
        </section>

        <aside class="mr-panel mr-sticky">
          <div class="mr-panel-header">
            <div>
              <h2 class="mr-panel-title">公开页与 SEO 预览</h2>
              <p class="mr-panel-sub">确认标题、摘要、结果状态和公开路径。</p>
            </div>
            <PhArticle :size="20" weight="bold" />
          </div>

          <div class="mr-label" style="margin-bottom: 8px">搜索结果片段</div>
          <div class="mr-seo-snippet">
            <span class="mr-seo-url">{{ publicPath }}</span>
            <strong>{{ seoTitle }}</strong>
            <p>{{ seoDescription }}</p>
          </div>

          <div class="mr-label" style="margin: 14px 0 8px">公开页预览</div>
          <div class="mr-public-preview">
            <header class="mr-public-card">
              <div>
                <NuxtLink class="mr-btn mr-btn-ghost mr-btn-small" :to="`/research/${pred.market}/${pred.symbol}`" target="_blank">该标的历史记录</NuxtLink>
                <div class="mr-kicker" style="margin-top: 12px">{{ marketLabel }} / {{ pred.symbol }} / {{ pred.prediction_date }}</div>
                <h3 class="mr-title-sm">{{ publicPreviewTitle }}</h3>
                <p class="mr-copy" style="margin-top: 10px">{{ publicLead }}</p>
              </div>
              <figure class="mr-public-figure">
                <img v-if="previewUrl" :src="previewUrl" alt="公开页卡图预览">
                <MrState v-else title="生成中" variant="loading" />
                <figcaption>{{ pred.actual_change_pct == null ? '预测卡片预览' : '原始预测卡片' }}</figcaption>
              </figure>
            </header>

            <section :class="['mr-result-grid', `mr-result-tone-${resultTone}`]">
              <div class="mr-result-cell">
                <span>{{ isAwaitingResult(pred) ? '验证状态' : '结算结果' }}</span>
                <strong>{{ resultStatusText }}</strong>
                <p>{{ isDraftStatus ? `预测方向 ${directionText}，目标日 ${pred.target_date || '-'}` : isAwaitingResult(pred) ? `预测方向 ${directionText}，目标日 ${pred.target_date || '-'}` : `预测方向 ${directionText}，实际涨跌 ${settlementText}` }}</p>
              </div>
              <div class="mr-result-cell"><span>实际涨跌</span><strong>{{ settlementText }}</strong></div>
              <div class="mr-result-cell"><span>目标日</span><strong>{{ pred.target_date || '-' }}</strong></div>
            </section>

            <div class="mr-public-metrics">
              <div v-for="item in priceMetrics" :key="item.label">
                <span>{{ item.label }}</span>
                <strong>{{ item.value }}</strong>
              </div>
            </div>
          </div>
        </aside>
      </section>

      <section class="mr-content-section" style="margin-top: 14px">
        <div class="mr-panel-header">
          <div>
            <h2 class="mr-panel-title">原始分析</h2>
            <p class="mr-panel-sub">保留模型输出文本，便于与卡片和公开页交叉核对。</p>
          </div>
        </div>
        <div class="mr-analysis-list">
          <div v-if="pred.analysis_summary" class="mr-analysis-cell">
            <strong>摘要</strong>
            <p>{{ pred.analysis_summary }}</p>
          </div>
          <div v-for="item in analysisSections" :key="item.title" class="mr-analysis-cell">
            <strong>{{ item.title }}</strong>
            <p>{{ item.text }}</p>
          </div>
        </div>
      </section>
    </main>

    <MrState
      v-else
      :title="loading === 'detail' ? '正在读取记录' : '未找到记录'"
      :text="loading === 'detail' ? '读取预测详情和卡片预览。' : '该记录可能已删除或令牌无权限访问。'"
      :variant="loading === 'detail' ? 'loading' : 'error'"
    />
  </MrShell>
</template>
