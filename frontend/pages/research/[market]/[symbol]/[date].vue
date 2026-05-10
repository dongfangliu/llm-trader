<script setup lang="ts">
import { PhArchive, PhChartLineUp, PhMagnifyingGlass, PhTarget } from '@phosphor-icons/vue'
import { SITE_NAME, analyzePath } from '~/constants/seo'
import MrMetric from '~/components/model-review/MrMetric.vue'
import MrStatusBadge from '~/components/model-review/MrStatusBadge.vue'

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
  <main class="mr-page">
    <article v-if="record" class="mr-public-article mr-public-shell">
      <header class="mr-public-hero">
        <div>
          <NuxtLink :to="`/research/${market}/${symbol}`" class="mr-btn mr-btn-ghost mr-btn-small">
            <PhArchive :size="16" weight="bold" />
            该标的历史记录
          </NuxtLink>
          <div class="mr-kicker" style="margin-top: 18px">
            <PhTarget :size="16" weight="bold" />
            {{ marketLabel }} / {{ symbol }} / {{ record.prediction_date }}
          </div>
          <h1 class="mr-title">{{ record.symbol_name }} {{ awaitingResult ? '待验证 AI K线预测' : `AI K线分析复盘：${resultLabel}` }}</h1>
          <p class="mr-lead">
            {{ awaitingResult ? `${record.symbol_name} 在 ${record.prediction_date} 生成的 AI 技术面预测，目标日 ${record.target_date || '-'} 尚待结算。本页展示原始判断、方向、置信度和关键价格，结算后会自动更新为复盘记录。` : `${record.symbol_name} 在 ${record.prediction_date} 生成的 AI 技术面预测，目标日 ${record.target_date || '-'} 已完成结算。本页保留原始判断、关键价格和实际结果，作为可追溯的历史复盘。` }}
          </p>
          <div class="mr-toolbar" style="margin: 20px 0 0">
            <NuxtLink class="mr-btn mr-btn-primary" :to="analyzePath(market, symbol)">自己分析该标的</NuxtLink>
            <NuxtLink class="mr-btn mr-btn-secondary" to="/research">查看复盘档案</NuxtLink>
          </div>
        </div>
        <figure class="mr-public-figure">
          <img :src="cardPath" :alt="`${record.symbol_name} ${record.prediction_date} AI K线分析 Promise 卡片`">
          <figcaption>审核时生成的原始预测卡片</figcaption>
        </figure>
      </header>

      <section :class="['mr-result-grid', `mr-result-tone-${resultTone}`]" style="margin-bottom: 14px">
        <div class="mr-result-cell">
          <span>{{ awaitingResult ? '验证状态' : '结算结果' }}</span>
          <strong>{{ resultLabel }}</strong>
          <p>{{ awaitingResult ? `预测方向 ${dir}，目标日 ${record.target_date || '-'}` : `预测方向 ${dir}，实际涨跌 ${signedPct}` }}</p>
        </div>
        <div class="mr-result-cell"><span>实际涨跌</span><strong>{{ signedPct }}</strong></div>
        <div class="mr-result-cell"><span>目标日</span><strong>{{ record.target_date || '-' }}</strong></div>
      </section>

      <div class="mr-metrics">
        <MrMetric v-for="item in priceMetrics" :key="item.label" :label="item.label" :value="item.value">
          <template #icon><PhChartLineUp :size="18" weight="bold" /></template>
        </MrMetric>
      </div>

      <section v-if="record.analysis_summary" class="mr-content-section">
        <div class="mr-panel-header">
          <h2 class="mr-panel-title">摘要</h2>
          <MrStatusBadge :status="resultTone" :label="resultLabel" />
        </div>
        <p class="mr-copy">{{ record.analysis_summary }}</p>
      </section>

      <section class="mr-content-section">
        <div class="mr-panel-header">
          <div>
            <h2 class="mr-panel-title">{{ record.symbol_name }} AI K线分析四步记录</h2>
            <p class="mr-panel-sub">保留预测当时的完整判断，结算后不改写原始分析。</p>
          </div>
        </div>
        <div class="mr-analysis-list">
          <section v-for="item in analysisSections" :key="item.title" class="mr-analysis-cell">
            <strong>{{ item.title }}</strong>
            <p>{{ item.text }}</p>
          </section>
        </div>
      </section>

      <div class="mr-toolbar">
        <NuxtLink class="mr-btn mr-btn-primary" :to="analyzePath(market, symbol)">
          <PhMagnifyingGlass :size="17" weight="bold" />
          自己分析该标的
        </NuxtLink>
        <NuxtLink class="mr-btn mr-btn-secondary" :to="`/research/${market}/${symbol}`">查看该标的更多复盘</NuxtLink>
        <NuxtLink class="mr-btn mr-btn-secondary" to="/upgrade?tier=premium">升级专业版</NuxtLink>
      </div>
    </article>
  </main>
</template>
