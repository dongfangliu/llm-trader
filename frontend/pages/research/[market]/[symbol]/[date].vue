<script setup lang="ts">
import { SITE_NAME, analyzePath } from '~/constants/seo'

const route = useRoute()
const market = computed(() => String(route.params.market || '').toLowerCase())
const symbol = computed(() => String(route.params.symbol || '').toUpperCase())
const date = computed(() => String(route.params.date || ''))
const requestUrl = useRequestURL()
const { data } = await useAsyncData(`research-detail-${market.value}-${symbol.value}-${date.value}`, () =>
  $fetch<any>(`/api/public/research/${market.value}/${symbol.value}/${date.value}`).catch(() => ({ record: null }))
)
const record = computed(() => data.value?.record)
if (!record.value) {
  throw createError({ statusCode: 404, statusMessage: '未找到复盘记录' })
}
const dir = computed(() => record.value?.predicted_direction === 'up' ? '看涨' : record.value?.predicted_direction === 'down' ? '看跌' : '震荡')
const signedPct = computed(() => {
  const value = record.value?.actual_change_pct
  if (value == null) return '-'
  return `${value >= 0 ? '+' : ''}${Number(value).toFixed(2)}%`
})
const cardPath = computed(() => `/api/public/research/${market.value}/${symbol.value}/${date.value}/card?variant=promise`)
const cardUrl = computed(() => `${requestUrl.origin}${cardPath.value}`)
const title = computed(() => `${record.value?.symbol_name || symbol.value} ${date.value} 已结算AI K线分析复盘`)
const description = computed(() => `${record.value?.symbol_name || symbol.value} 的AI K线分析历史复盘：当时技术面方向 ${dir.value}，实际涨跌 ${signedPct.value}，记录命中或失误，仅供研究参考。`)
usePublicSeo({
  title,
  description,
  path: () => `/research/${market.value}/${symbol.value}/${date.value}`,
  image: cardUrl,
  type: 'article',
})
useJsonLd('research-detail-jsonld', () => [
  breadcrumbJsonLd(requestUrl.origin, [
    { name: SITE_NAME, path: '/' },
    { name: '模型复盘档案', path: '/research' },
    { name: `${record.value?.symbol_name || symbol.value} ${symbol.value}`, path: `/research/${market.value}/${symbol.value}` },
    { name: `${date.value} 复盘`, path: `/research/${market.value}/${symbol.value}/${date.value}` },
  ]),
  {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: title.value,
    description: description.value,
    image: cardUrl.value,
    mainEntityOfPage: `${requestUrl.origin}/research/${market.value}/${symbol.value}/${date.value}`,
    publisher: { '@type': 'Organization', name: SITE_NAME },
  },
])
</script>

<template>
  <main class="seo-page">
    <article v-if="record" class="article">
      <header class="article-head">
        <NuxtLink :to="`/research/${market}/${symbol}`" class="back">该标的历史记录</NuxtLink>
        <h1>{{ record.symbol_name }} {{ record.prediction_date }} 已结算AI K线分析复盘</h1>
        <p class="lead">顶部保留当时生成的 Promise 卡片；下方展示目标日后的实际结果。这里只展示已结算历史记录，不构成投资建议。</p>
      </header>

      <figure class="promise-figure">
        <img :src="cardPath" :alt="`${record.symbol_name} ${record.prediction_date} Promise 卡片`">
        <figcaption>当时审核使用的原始 Promise 图</figcaption>
      </figure>

      <section class="result-panel" :class="{ hit: record.is_correct, miss: record.is_correct === false }">
        <div>
          <span>结算结果</span>
          <strong>{{ record.is_correct ? '命中' : '未命中' }}</strong>
        </div>
        <div>
          <span>实际涨跌</span>
          <strong>{{ signedPct }}</strong>
        </div>
        <div>
          <span>目标日</span>
          <strong>{{ record.target_date || '-' }}</strong>
        </div>
      </section>

      <div class="metrics">
        <div><span>当时方向</span><strong>{{ dir }}</strong></div>
        <div><span>置信度</span><strong>{{ record.confidence ? Math.round(record.confidence) + '%' : '-' }}</strong></div>
        <div><span>基准收盘</span><strong>{{ record.close_price ? Number(record.close_price).toFixed(2) : '-' }}</strong></div>
        <div><span>目标价</span><strong>{{ record.target_price ? Number(record.target_price).toFixed(2) : '-' }}</strong></div>
        <div><span>止损价</span><strong>{{ record.stop_loss ? Number(record.stop_loss).toFixed(2) : '-' }}</strong></div>
        <div><span>实际收盘</span><strong>{{ record.actual_close ? Number(record.actual_close).toFixed(2) : '-' }}</strong></div>
      </div>

      <section v-if="record.analysis_summary">
        <h2>摘要</h2>
        <p>{{ record.analysis_summary }}</p>
      </section>
      <section>
        <h2>四步记录</h2>
        <p v-if="record.market_diagnosis"><strong>市场诊断：</strong>{{ record.market_diagnosis }}</p>
        <p v-if="record.opportunity_assessment"><strong>机会评估：</strong>{{ record.opportunity_assessment }}</p>
        <p v-if="record.risk_analysis"><strong>风险分析：</strong>{{ record.risk_analysis }}</p>
        <p v-if="record.execution_plan"><strong>执行计划：</strong>{{ record.execution_plan }}</p>
      </section>

      <div class="actions">
        <NuxtLink class="cta primary" :to="analyzePath(market, symbol)">自己分析该标的</NuxtLink>
        <NuxtLink class="cta secondary" to="/upgrade?tier=premium">升级专业版</NuxtLink>
      </div>
    </article>
    <article v-else class="article">
      <h1>未找到复盘记录</h1>
      <p>该记录可能尚未结算或未公开。</p>
    </article>
  </main>
</template>

<style scoped>
.seo-page { min-height: 100vh; background: #f8fafc; color: #111827; padding: 24px 16px 56px; }
.article { max-width: 920px; margin: 0 auto; }
.article-head, section, .metrics, .result-panel { margin-bottom: 18px; }
.back { color: #2563eb; text-decoration: none; font-weight: 600; }
h1 { font-size: 32px; margin: 20px 0 8px; letter-spacing: 0; }
h2 { font-size: 20px; margin: 24px 0 8px; }
p { color: #4b5563; line-height: 1.9; }
.lead { color: #6b7280; }
.promise-figure { margin: 22px 0 18px; }
.promise-figure img { display: block; width: min(520px, 100%); aspect-ratio: 4 / 5; object-fit: contain; background: #e5e7eb; border: 1px solid #e5e7eb; border-radius: 8px; }
.promise-figure figcaption { margin-top: 8px; color: #6b7280; font-size: 13px; }
.result-panel { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; padding: 14px; border: 1px solid #e5e7eb; border-radius: 8px; background: #fff; }
.result-panel div { min-width: 0; }
.result-panel span { display: block; color: #6b7280; font-size: 12px; margin-bottom: 6px; }
.result-panel strong { font-size: 24px; }
.result-panel.hit { border-color: #bbf7d0; background: #f0fdf4; }
.result-panel.miss { border-color: #fecaca; background: #fef2f2; }
.metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; margin: 20px 0; }
.metrics div { border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; background: #fff; }
.metrics span { display: block; color: #6b7280; font-size: 12px; margin-bottom: 6px; }
.metrics strong { font-size: 20px; }
.actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 18px; }
.cta { display: inline-flex; align-items: center; min-height: 42px; padding: 0 16px; border-radius: 8px; text-decoration: none; font-weight: 700; }
.cta.primary { background: #2563eb; color: #fff; }
.cta.secondary { background: #eef2ff; color: #3730a3; }
@media (max-width: 680px) {
  .result-panel { grid-template-columns: 1fr; }
  h1 { font-size: 28px; }
}
</style>
