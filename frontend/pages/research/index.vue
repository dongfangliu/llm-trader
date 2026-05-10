<script setup lang="ts">
import { PhArchive, PhChartLineUp, PhGlobeHemisphereEast, PhMagnifyingGlass, PhTarget } from '@phosphor-icons/vue'
import { SITE_NAME } from '~/constants/seo'
import MrMetric from '~/components/model-review/MrMetric.vue'
import MrState from '~/components/model-review/MrState.vue'
import MrStatusBadge from '~/components/model-review/MrStatusBadge.vue'

const { data } = await useAsyncData('research-index', () =>
  $fetch<any>('/api/public/research', { query: { limit: 100 } }).catch(() => ({ predictions: [], accuracy: null }))
)

const requestUrl = useRequestURL()
const title = 'AI K线预测与复盘档案 - 公开技术面历史记录'
const description = '查看已通过的AI K线预测和已结算复盘记录，包含技术面方向、目标日、实际涨跌、命中和失误情况，可从公开记录进入AI分析工具自行研究。'
usePublicSeo({ title, description, path: '/research' })
useJsonLd('research-index-breadcrumb-jsonld', breadcrumbJsonLd(requestUrl.origin, [
  { name: SITE_NAME, path: '/' },
  { name: '模型复盘档案', path: '/research' },
]))

function isAwaitingResult(p: any) {
  return ['approved', 'posted'].includes(p?.status) && p?.actual_change_pct == null && p?.is_correct == null
}

function directionLabel(value: string) {
  return value === 'up' ? '看涨' : value === 'down' ? '看跌' : '震荡'
}

function confidenceLabel(value: number | null | undefined) {
  return value == null ? '-' : `${Math.round(Number(value))}%`
}

function statusLabel(p: any) {
  if (isAwaitingResult(p)) return '待验证'
  if (p?.is_correct === true) return '命中'
  if (p?.is_correct === false) return '未命中'
  return '已结算'
}

function statusClass(p: any) {
  if (isAwaitingResult(p)) return 'pending'
  if (p?.is_correct === true) return 'hit'
  if (p?.is_correct === false) return 'miss'
  return 'settled'
}

const records = computed(() => [...(data.value?.predictions || [])].sort((a, b) => {
  const awaitingOrder = Number(isAwaitingResult(b)) - Number(isAwaitingResult(a))
  if (awaitingOrder) return awaitingOrder
  const dateOrder = String(b.prediction_date || '').localeCompare(String(a.prediction_date || ''))
  if (dateOrder) return dateOrder
  return Number(a.hot_rank || 0) - Number(b.hot_rank || 0)
}))
const awaitingCount = computed(() => records.value.filter(isAwaitingResult).length)
const settledCount = computed(() => records.value.filter(r => !isAwaitingResult(r)).length)
const accuracyLabel = computed(() => data.value?.accuracy?.total ? `${data.value.accuracy.pct}%` : '待统计')
</script>

<template>
  <main class="mr-page">
    <div class="mr-public-shell">
      <section class="mr-hero">
        <div class="mr-hero-main">
          <NuxtLink to="/" class="mr-btn mr-btn-ghost mr-btn-small">
            <PhMagnifyingGlass :size="16" weight="bold" />
            返回分析工具
          </NuxtLink>
          <div class="mr-kicker" style="margin-top: 18px">
            <PhArchive :size="16" weight="bold" />
            公开技术面档案
          </div>
          <h1 class="mr-title">模型复盘档案</h1>
          <p class="mr-lead">已通过预测会先进入待验证状态，结算后同一路径自动变成复盘记录，保留原始方向、关键价格和实际结果。</p>
          <div class="mr-toolbar" style="margin: 18px 0 0">
            <NuxtLink class="mr-btn mr-btn-primary" to="/">打开 AI 分析工具</NuxtLink>
            <NuxtLink class="mr-btn mr-btn-secondary" to="/upgrade?tier=premium">升级专业版</NuxtLink>
          </div>
        </div>
        <aside class="mr-hero-side">
          <div>
            <div class="mr-kicker">结算准确率</div>
            <strong>{{ accuracyLabel }}</strong>
            <small v-if="data?.accuracy?.total">已结算 {{ data.accuracy.correct }}/{{ data.accuracy.total }} 条。</small>
            <small v-else>记录结算后自动统计。</small>
          </div>
          <MrStatusBadge status="info" :label="`${records.length} 条公开记录`" />
        </aside>
      </section>

      <div class="mr-metrics">
        <MrMetric label="公开记录" :value="records.length" sub="按最新预测日排序">
          <template #icon><PhGlobeHemisphereEast :size="18" weight="bold" /></template>
        </MrMetric>
        <MrMetric label="待验证" :value="awaitingCount" sub="目标日后自动复盘">
          <template #icon><PhTarget :size="18" weight="bold" /></template>
        </MrMetric>
        <MrMetric label="已结算" :value="settledCount" sub="含命中和未命中">
          <template #icon><PhChartLineUp :size="18" weight="bold" /></template>
        </MrMetric>
        <MrMetric label="命中率" :value="accuracyLabel" sub="公开样本">
          <template #icon><PhArchive :size="18" weight="bold" /></template>
        </MrMetric>
      </div>

      <section class="mr-list-table" aria-label="公开复盘记录">
        <NuxtLink
          v-for="p in records"
          :key="p.id"
          class="mr-list-row"
          :to="`/research/${p.market}/${p.symbol}/${p.prediction_date}`"
        >
          <div>
            <strong>{{ p.symbol_name }}</strong>
            <span>{{ p.market }} / {{ p.symbol }} / 目标日 {{ p.target_date || '-' }}</span>
          </div>
          <div>
            <strong>{{ directionLabel(p.predicted_direction) }}</strong>
            <span>预测日 {{ p.prediction_date }}</span>
          </div>
          <div>
            <strong>{{ confidenceLabel(p.confidence) }}</strong>
            <span>置信度</span>
          </div>
          <MrStatusBadge :status="statusClass(p)" :label="statusLabel(p)" />
        </NuxtLink>
        <MrState v-if="!records.length" title="暂无公开预测记录" text="审核通过后的记录会显示在这里。" />
      </section>
    </div>
  </main>
</template>
