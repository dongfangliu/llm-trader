<script setup lang="ts">
import { MARKET_LABELS, SITE_NAME, analyzePath } from '~/constants/seo'

const route = useRoute()
const market = computed(() => String(route.params.market || '').toLowerCase())
const symbol = computed(() => String(route.params.symbol || '').toUpperCase())
const { data } = await useAsyncData(`research-${market.value}-${symbol.value}`, () =>
  $fetch<any>(`/api/public/research/${market.value}/${symbol.value}`).catch(() => ({ records: [] }))
)
const first = computed(() => data.value?.records?.[0])
const requestUrl = useRequestURL()
const displayName = computed(() => first.value?.symbol_name || symbol.value)
const title = computed(() => `${displayName.value}(${symbol.value}) 模型复盘历史记录`)
const description = computed(() => `${displayName.value} ${symbol.value} 的已结算模型复盘历史，展示历史方向、实际涨跌和命中情况，可进入AI分析工具自行研究。`)
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
</script>

<template>
  <main class="seo-page">
    <header class="hero">
      <NuxtLink to="/research" class="back">复盘档案</NuxtLink>
      <h1>{{ first?.symbol_name || symbol }} <span>{{ symbol }}</span></h1>
      <p>{{ MARKET_LABELS[market] || market }} 已结算模型复盘记录。页面只展示历史结果，不提供未结算预测。</p>
      <div class="actions">
        <NuxtLink class="cta primary" :to="analyzePath(market, symbol)">自己分析该标的</NuxtLink>
        <NuxtLink class="cta secondary" to="/upgrade?tier=premium">升级专业版</NuxtLink>
      </div>
    </header>
    <section class="list">
      <NuxtLink
        v-for="p in data?.records || []"
        :key="p.id"
        class="record"
        :to="`/research/${p.market}/${p.symbol}/${p.prediction_date}`"
      >
        <div><strong>{{ p.prediction_date }}</strong><span>目标日 {{ p.target_date }}</span></div>
        <div>{{ p.predicted_direction === 'up' ? '看涨' : p.predicted_direction === 'down' ? '看跌' : '震荡' }}</div>
        <div>{{ p.actual_change_pct == null ? '-' : `${p.actual_change_pct >= 0 ? '+' : ''}${Number(p.actual_change_pct).toFixed(2)}%` }}</div>
        <div :class="{ hit: p.is_correct, miss: p.is_correct === false }">{{ p.is_correct ? '命中' : '未命中' }}</div>
      </NuxtLink>
      <div v-if="!(data?.records || []).length" class="empty">暂无已结算记录</div>
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
.record { display: grid; grid-template-columns: 1fr .7fr .7fr .7fr; gap: 12px; align-items: center; padding: 14px 16px; border-bottom: 1px solid #f3f4f6; color: inherit; text-decoration: none; }
.record:hover { background: #f8fafc; }
.record span { display: block; font-size: 12px; margin-top: 3px; }
.hit { color: #15803d; font-weight: 700; }
.miss { color: #b91c1c; font-weight: 700; }
.empty { padding: 40px; text-align: center; color: #6b7280; }
@media (max-width: 680px) { .record { grid-template-columns: 1fr; } }
</style>
