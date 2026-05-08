<script setup lang="ts">
import { MARKET_LABELS, SITE_NAME, analyzePath } from '~/constants/seo'

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
</script>

<template>
  <main class="seo-page">
    <header class="hero">
      <NuxtLink to="/research" class="back">复盘档案</NuxtLink>
      <h1>{{ first?.symbol_name || symbol }} <span>{{ symbol }}</span></h1>
      <p>{{ MARKET_LABELS[market] || market }} 已通过AI K线预测和已结算复盘记录。待验证记录展示目标日与原始方向，结算后继续保留命中和失误。</p>
      <div class="actions">
        <NuxtLink class="cta primary" :to="analyzePath(market, symbol)">自己分析该标的</NuxtLink>
        <NuxtLink class="cta secondary" to="/upgrade?tier=premium">升级专业版</NuxtLink>
      </div>
    </header>
    <section class="list">
      <NuxtLink
        v-for="p in records"
        :key="p.id"
        class="record"
        :to="`/research/${p.market}/${p.symbol}/${p.prediction_date}`"
      >
        <div><strong>{{ p.prediction_date }}</strong><span>目标日 {{ p.target_date }}</span></div>
        <div>{{ directionLabel(p.predicted_direction) }}<span>置信度 {{ p.confidence == null ? '-' : `${Math.round(Number(p.confidence))}%` }}</span></div>
        <div>{{ changeText(p) }}</div>
        <div :class="['status-badge', statusClass(p)]">{{ statusLabel(p) }}</div>
      </NuxtLink>
      <div v-if="!records.length" class="empty">暂无公开预测记录</div>
    </section>
  </main>
</template>

<style scoped>
.seo-page { min-height: 100vh; background: #f8fafc; color: #111827; padding: 24px 16px 56px; }
.hero, .list { max-width: 920px; margin: 0 auto 16px; }
.back { color: #2563eb; text-decoration: none; font-weight: 600; }
.actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 14px; }
.cta { display: inline-flex; align-items: center; min-height: 42px; padding: 0 16px; border-radius: 8px; text-decoration: none; font-weight: 700; }
.cta.primary { background: #2563eb; color: #fff; }
.cta.secondary { background: #eef2ff; color: #3730a3; }
h1 { font-size: 34px; margin: 20px 0 8px; letter-spacing: 0; }
h1 span, p, .record span { color: #6b7280; }
p { line-height: 1.8; }
.list { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; }
.record { display: grid; grid-template-columns: 1fr .75fr .7fr .65fr; gap: 12px; align-items: center; padding: 14px 16px; border-bottom: 1px solid #f3f4f6; color: inherit; text-decoration: none; }
.record:hover { background: #f8fafc; }
.record span { display: block; font-size: 12px; margin-top: 3px; }
.status-badge { justify-self: start; padding: 6px 10px; border-radius: 8px; font-size: 13px; font-weight: 800; }
.status-badge.pending { color: #92400e; background: #fffbeb; }
.status-badge.settled { color: #1d4ed8; background: #eff6ff; }
.hit { color: #15803d; background: #f0fdf4; }
.miss { color: #b91c1c; background: #fef2f2; }
.empty { padding: 40px; text-align: center; color: #6b7280; }
@media (max-width: 680px) { .record { grid-template-columns: 1fr; } }
</style>
