<script setup lang="ts">
import { PhArchive, PhChartLineUp, PhMagnifyingGlass, PhTarget } from '@phosphor-icons/vue'
import { MARKET_LABELS, SITE_NAME, analyzePath } from '~/constants/seo'
import MrMetric from '~/components/model-review/MrMetric.vue'
import MrState from '~/components/model-review/MrState.vue'
import MrStatusBadge from '~/components/model-review/MrStatusBadge.vue'

const route = useRoute()
const market = computed(() => String(route.params.market || '').toLowerCase())
const symbol = computed(() => String(route.params.symbol || '').toUpperCase())
const { data } = await useAsyncData(`research-${market.value}-${symbol.value}`, () =>
  $fetch<any>(`/api/public/research/${market.value}/${symbol.value}`).catch(() => ({ records: [] }))
)
if (!(data.value?.records || []).length) {
  throw createError({ statusCode: 404, statusMessage: '暂无公开预测记录' })
}
const first = computed(() => data.value?.records?.[0])
const requestUrl = useRequestURL()
const displayName = computed(() => first.value?.symbol_name || symbol.value)
const title = computed(() => `${displayName.value}(${symbol.value}) AI K线预测与复盘/技术面历史记录`)
const description = computed(() => `${displayName.value} ${symbol.value} 的公开AI K线预测和已结算复盘，展示技术面方向、目标日、实际涨跌、命中与失误记录，可进入AI分析工具自行研究。`)
usePublicSeo({
  title,
  description,
  path: () => `/research/${market.value}/${symbol.value}`,
})
useJsonLd('research-symbol-breadcrumb-jsonld', () => breadcrumbJsonLd(requestUrl.origin, [
  { name: SITE_NAME, path: '/' },
  { name: '模型复盘档案', path: '/research' },
  { name: `${displayName.value} ${symbol.value}`, path: `/research/${market.value}/${symbol.value}` },
]))

function isAwaitingResult(p: any) {
  return ['approved', 'posted'].includes(p?.status) && p?.actual_change_pct == null && p?.is_correct == null
}

function directionLabel(value: string) {
  return value === 'up' ? '看涨' : value === 'down' ? '看跌' : '震荡'
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

function changeText(p: any) {
  if (isAwaitingResult(p) || p?.actual_change_pct == null) return '待结算'
  const value = Number(p.actual_change_pct)
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`
}

const records = computed(() => [...(data.value?.records || [])].sort((a, b) => {
  const awaitingOrder = Number(isAwaitingResult(b)) - Number(isAwaitingResult(a))
  if (awaitingOrder) return awaitingOrder
  return String(b.prediction_date || '').localeCompare(String(a.prediction_date || ''))
}))
const awaitingCount = computed(() => records.value.filter(isAwaitingResult).length)
const hitCount = computed(() => records.value.filter(r => r.is_correct === true).length)
const missCount = computed(() => records.value.filter(r => r.is_correct === false).length)
</script>

<template>
  <main class="mr-page">
    <div class="mr-public-shell">
      <section class="mr-hero">
        <div class="mr-hero-main">
          <NuxtLink to="/research" class="mr-btn mr-btn-ghost mr-btn-small">
            <PhArchive :size="16" weight="bold" />
            复盘档案
          </NuxtLink>
          <div class="mr-kicker" style="margin-top: 18px">
            <PhTarget :size="16" weight="bold" />
            {{ MARKET_LABELS[market] || market }} / {{ symbol }}
          </div>
          <h1 class="mr-title">{{ displayName }} <span style="color: var(--mr-muted)">{{ symbol }}</span></h1>
          <p class="mr-lead">{{ MARKET_LABELS[market] || market }} 已通过 AI K线预测和已结算复盘记录。待验证记录展示目标日与原始方向，结算后继续保留命中和失误。</p>
          <div class="mr-toolbar" style="margin: 18px 0 0">
            <NuxtLink class="mr-btn mr-btn-primary" :to="analyzePath(market, symbol)">自己分析该标的</NuxtLink>
            <NuxtLink class="mr-btn mr-btn-secondary" to="/upgrade?tier=premium">升级专业版</NuxtLink>
          </div>
        </div>
        <aside class="mr-hero-side">
          <div>
            <div class="mr-kicker">公开记录</div>
            <strong>{{ records.length }}</strong>
            <small>待验证 {{ awaitingCount }}，命中 {{ hitCount }}，未命中 {{ missCount }}。</small>
          </div>
          <MrStatusBadge status="info" :label="`${displayName} 档案`" />
        </aside>
      </section>

      <div class="mr-metrics">
        <MrMetric label="总记录" :value="records.length" sub="按预测日倒序">
          <template #icon><PhArchive :size="18" weight="bold" /></template>
        </MrMetric>
        <MrMetric label="待验证" :value="awaitingCount" sub="目标日后更新">
          <template #icon><PhTarget :size="18" weight="bold" /></template>
        </MrMetric>
        <MrMetric label="命中" :value="hitCount" sub="方向验证成功">
          <template #icon><PhChartLineUp :size="18" weight="bold" /></template>
        </MrMetric>
        <MrMetric label="未命中" :value="missCount" sub="保留失败记录">
          <template #icon><PhMagnifyingGlass :size="18" weight="bold" /></template>
        </MrMetric>
      </div>

      <section class="mr-list-table" aria-label="标的复盘记录">
        <NuxtLink
          v-for="p in records"
          :key="p.id"
          class="mr-list-row"
          :to="`/research/${p.market}/${p.symbol}/${p.prediction_date}`"
        >
          <div><strong>{{ p.prediction_date }}</strong><span>目标日 {{ p.target_date }}</span></div>
          <div><strong>{{ directionLabel(p.predicted_direction) }}</strong><span>置信度 {{ p.confidence == null ? '-' : `${Math.round(Number(p.confidence))}%` }}</span></div>
          <div><strong>{{ changeText(p) }}</strong><span>实际涨跌</span></div>
          <MrStatusBadge :status="statusClass(p)" :label="statusLabel(p)" />
        </NuxtLink>
        <MrState v-if="!records.length" title="暂无公开预测记录" text="审核通过后的该标的记录会显示在这里。" />
      </section>
    </div>
  </main>
</template>
