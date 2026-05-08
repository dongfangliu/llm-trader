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
  throw createError({ statusCode: 404, statusMessage: '未找到公开记录' })
}
const dir = computed(() => record.value?.predicted_direction === 'up' ? '看涨' : record.value?.predicted_direction === 'down' ? '看跌' : '震荡')
const signedPct = computed(() => {
  const value = record.value?.actual_change_pct
  if (value == null) return '待结算'
  return `${value >= 0 ? '+' : ''}${Number(value).toFixed(2)}%`
})
const marketLabel = computed(() => {
  if (market.value === 'hk') return '港股'
  if (market.value === 'us') return '美股'
  return 'A股'
})
const awaitingResult = computed(() => ['approved', 'posted'].includes(record.value?.status) && record.value?.actual_change_pct == null && record.value?.is_correct == null)
const resultLabel = computed(() => {
  if (awaitingResult.value) return '待验证'
  if (record.value?.is_correct === true) return '命中'
  if (record.value?.is_correct === false) return '未命中'
  return '已结算'
})
const resultTone = computed(() => {
  if (awaitingResult.value) return 'pending'
  if (record.value?.is_correct === true) return 'hit'
  if (record.value?.is_correct === false) return 'miss'
  return 'settled'
})
const priceMetrics = computed(() => [
  { label: '当时方向', value: dir.value },
  { label: '置信度', value: record.value?.confidence == null ? '-' : Math.round(record.value.confidence) + '%' },
  { label: '基准收盘', value: record.value?.close_price == null ? '-' : Number(record.value.close_price).toFixed(2) },
  { label: '目标价', value: record.value?.target_price == null ? '-' : Number(record.value.target_price).toFixed(2) },
  { label: '止损价', value: record.value?.stop_loss == null ? '-' : Number(record.value.stop_loss).toFixed(2) },
  { label: '实际收盘', value: record.value?.actual_close == null ? '待结算' : Number(record.value.actual_close).toFixed(2) },
])
const analysisSections = computed(() => [
  { title: '市场诊断', text: record.value?.market_diagnosis },
  { title: '机会评估', text: record.value?.opportunity_assessment },
  { title: '风险分析', text: record.value?.risk_analysis },
  { title: '执行计划', text: record.value?.execution_plan },
].filter(item => item.text))
const cardPath = computed(() => `/api/public/research/${market.value}/${symbol.value}/${date.value}/card?variant=promise`)
const cardUrl = computed(() => `${requestUrl.origin}${cardPath.value}`)
const pageModeLabel = computed(() => awaitingResult.value ? '待验证 AI K线预测' : '已结算AI K线分析复盘')
const title = computed(() => `${record.value?.symbol_name || symbol.value} ${date.value} ${pageModeLabel.value}`)
const description = computed(() => awaitingResult.value
  ? `${record.value?.symbol_name || symbol.value} 的待验证AI K线预测：技术面方向 ${dir.value}，目标日 ${record.value?.target_date || '-'}，展示原始判断和关键价格，仅供研究参考。`
  : `${record.value?.symbol_name || symbol.value} 的AI K线分析历史复盘：当时技术面方向 ${dir.value}，实际涨跌 ${signedPct.value}，记录命中或失误，仅供研究参考。`
)
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
    { name: `${date.value} ${awaitingResult.value ? '预测' : '复盘'}`, path: `/research/${market.value}/${symbol.value}/${date.value}` },
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
      <header class="article-head hero">
        <div class="hero-copy">
          <NuxtLink :to="`/research/${market}/${symbol}`" class="back">该标的历史记录</NuxtLink>
          <div class="eyebrow">{{ marketLabel }} · {{ symbol }} · {{ record.prediction_date }}</div>
          <h1>{{ record.symbol_name }} {{ awaitingResult ? '待验证 AI K线预测' : `AI K线分析复盘：${resultLabel}记录` }}</h1>
          <p class="lead">{{ awaitingResult ? `${record.symbol_name} 在 ${record.prediction_date} 生成的 AI 技术面预测，目标日 ${record.target_date || '-'} 尚待结算。本页展示原始判断、方向、置信度和关键价格，结算后会自动更新为复盘记录。` : `${record.symbol_name} 在 ${record.prediction_date} 生成的 AI 技术面预测，目标日 ${record.target_date || '-'} 已完成结算。本页保留原始判断、关键价格和实际结果，作为可追溯的历史复盘。` }}</p>
          <div class="hero-actions">
            <NuxtLink class="cta primary" :to="analyzePath(market, symbol)">自己分析该标的</NuxtLink>
            <NuxtLink class="cta secondary" to="/research">查看复盘档案</NuxtLink>
          </div>
        </div>
        <figure class="promise-figure hero-card">
          <img :src="cardPath" :alt="`${record.symbol_name} ${record.prediction_date} AI K线分析 Promise 卡片`">
          <figcaption>审核时生成的原始预测卡片</figcaption>
        </figure>
      </header>

      <section class="result-panel" :class="resultTone">
        <div class="result-verdict">
          <span>{{ awaitingResult ? '验证状态' : '结算结果' }}</span>
          <strong>{{ resultLabel }}</strong>
          <p>{{ awaitingResult ? `预测方向 ${dir}，目标日 ${record.target_date || '-'}` : `预测方向 ${dir}，实际涨跌 ${signedPct}` }}</p>
        </div>
        <div><span>实际涨跌</span><strong>{{ signedPct }}</strong></div>
        <div><span>目标日</span><strong>{{ record.target_date || '-' }}</strong></div>
      </section>

      <div class="metrics">
        <div v-for="item in priceMetrics" :key="item.label">
          <span>{{ item.label }}</span>
          <strong>{{ item.value }}</strong>
        </div>
      </div>

      <section v-if="record.analysis_summary" class="content-section summary-section">
        <h2>摘要</h2>
        <p>{{ record.analysis_summary }}</p>
      </section>

      <section class="content-section">
        <h2>{{ record.symbol_name }} AI K线分析四步记录</h2>
        <div class="analysis-list">
          <section v-for="item in analysisSections" :key="item.title" class="analysis-item">
            <h3>{{ item.title }}</h3>
            <p>{{ item.text }}</p>
          </section>
        </div>
      </section>

      <div class="actions">
        <NuxtLink class="cta primary" :to="analyzePath(market, symbol)">自己分析该标的</NuxtLink>
        <NuxtLink class="cta secondary" :to="`/research/${market}/${symbol}`">查看该标的更多复盘</NuxtLink>
        <NuxtLink class="cta secondary" to="/upgrade?tier=premium">升级专业版</NuxtLink>
      </div>
    </article>
    <article v-else class="article">
      <h1>未找到公开记录</h1>
      <p>该记录可能尚未通过审核或未公开。</p>
    </article>
  </main>
</template>

<style scoped>
.seo-page { min-height: 100vh; background: #f3f4f6; color: #111827; padding: 24px 16px 64px; }
.article { max-width: 1120px; margin: 0 auto; }
.article-head, .content-section, .metrics, .result-panel { margin-bottom: 18px; }
.hero {
  display: grid;
  grid-template-columns: minmax(0, 1.05fr) minmax(320px, 430px);
  gap: 28px;
  align-items: center;
  padding: 28px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}
.hero-copy { min-width: 0; }
.back { color: #2563eb; text-decoration: none; font-weight: 700; font-size: 14px; }
.eyebrow { margin-top: 24px; color: #6b7280; font-size: 13px; font-weight: 800; letter-spacing: 0; }
h1 { font-size: clamp(30px, 4vw, 48px); line-height: 1.12; margin: 12px 0 14px; letter-spacing: 0; }
h2 { font-size: 22px; margin: 0 0 14px; letter-spacing: 0; }
h3 { font-size: 15px; margin: 0 0 8px; color: #111827; }
p { color: #4b5563; line-height: 1.9; margin: 0; }
.lead { color: #4b5563; font-size: 16px; max-width: 680px; }
.hero-actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 22px; }
.promise-figure { margin: 0; }
.promise-figure img {
  display: block;
  width: 100%;
  aspect-ratio: 4 / 5;
  object-fit: contain;
  background: #111827;
  border: 1px solid #111827;
  border-radius: 8px;
  box-shadow: 0 18px 45px rgba(17,24,39,.18);
}
.promise-figure figcaption { margin-top: 10px; color: #6b7280; font-size: 13px; text-align: center; }
.result-panel {
  display: grid;
  grid-template-columns: 1.5fr .75fr .75fr;
  gap: 12px;
  padding: 16px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #fff;
}
.result-panel div { min-width: 0; padding: 12px; border-radius: 8px; background: #f9fafb; }
.result-panel span { display: block; color: #6b7280; font-size: 12px; margin-bottom: 6px; font-weight: 800; }
.result-panel strong { font-size: 28px; line-height: 1; }
.result-panel p { margin-top: 8px; font-size: 13px; line-height: 1.6; color: #6b7280; }
.result-panel.hit { border-color: #bbf7d0; }
.result-panel.hit .result-verdict { background: #f0fdf4; }
.result-panel.miss { border-color: #fecaca; }
.result-panel.miss .result-verdict { background: #fef2f2; }
.result-panel.pending { border-color: #fde68a; }
.result-panel.pending .result-verdict { background: #fffbeb; }
.result-panel.settled { border-color: #bfdbfe; }
.result-panel.settled .result-verdict { background: #eff6ff; }
.metrics { display: grid; grid-template-columns: repeat(6, 1fr); gap: 10px; margin: 18px 0; }
.metrics div { border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px; background: #fff; min-width: 0; }
.metrics span { display: block; color: #6b7280; font-size: 12px; margin-bottom: 8px; font-weight: 800; }
.metrics strong { font-size: 20px; word-break: break-word; }
.content-section {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 22px;
}
.summary-section p { font-size: 16px; color: #374151; }
.analysis-list { display: grid; gap: 12px; }
.analysis-item {
  padding: 16px;
  border: 1px solid #eef0f3;
  border-radius: 8px;
  background: #fbfbfc;
}
.actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 18px; }
.cta { display: inline-flex; align-items: center; justify-content: center; min-height: 44px; padding: 0 16px; border-radius: 8px; text-decoration: none; font-weight: 800; }
.cta.primary { background: #2563eb; color: #fff; box-shadow: 0 8px 22px rgba(37,99,235,.22); }
.cta.secondary { background: #eef2ff; color: #3730a3; }
@media (max-width: 680px) {
  .seo-page { padding: 12px 12px 48px; }
  .hero { grid-template-columns: 1fr; padding: 18px; gap: 18px; }
  .eyebrow { margin-top: 18px; }
  h1 { font-size: 30px; }
  .lead { font-size: 15px; }
  .result-panel, .metrics { grid-template-columns: 1fr; }
  .content-section { padding: 18px; }
  .cta { width: 100%; }
}
@media (min-width: 681px) and (max-width: 980px) {
  .hero { grid-template-columns: 1fr; }
  .hero-card { max-width: 440px; justify-self: center; }
  .metrics { grid-template-columns: repeat(3, 1fr); }
}
</style>
