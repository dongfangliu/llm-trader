<script setup lang="ts">
const route = useRoute()
const market = computed(() => String(route.params.market || '').toLowerCase())
const symbol = computed(() => String(route.params.symbol || '').toUpperCase())
const date = computed(() => String(route.params.date || ''))
const { data } = await useAsyncData(`research-detail-${market.value}-${symbol.value}-${date.value}`, () =>
  $fetch<any>(`/api/public/research/${market.value}/${symbol.value}/${date.value}`).catch(() => ({ record: null }))
)
const record = computed(() => data.value?.record)
const dir = computed(() => record.value?.predicted_direction === 'up' ? '看涨' : record.value?.predicted_direction === 'down' ? '看跌' : '震荡')
useSeoMeta({
  title: () => `${record.value?.symbol_name || symbol.value} ${date.value} 模型复盘`,
  description: () => `${record.value?.symbol_name || symbol.value} 在 ${date.value} 的已结算模型复盘记录，包含历史方向、实际涨跌和命中情况。`,
})
</script>

<template>
  <main class="seo-page">
    <article v-if="record" class="article">
      <NuxtLink :to="`/research/${market}/${symbol}`" class="back">该标的历史记录</NuxtLink>
      <h1>{{ record.symbol_name }} {{ record.prediction_date }} 模型复盘</h1>
      <p class="lead">这是已结算历史记录，不展示未结算预测，不构成投资建议。</p>

      <div class="metrics">
        <div><span>当时方向</span><strong>{{ dir }}</strong></div>
        <div><span>置信度</span><strong>{{ record.confidence ? Math.round(record.confidence) + '%' : '-' }}</strong></div>
        <div><span>实际涨跌</span><strong>{{ record.actual_change_pct == null ? '-' : `${record.actual_change_pct >= 0 ? '+' : ''}${Number(record.actual_change_pct).toFixed(2)}%` }}</strong></div>
        <div><span>结果</span><strong>{{ record.is_correct ? '命中' : '未命中' }}</strong></div>
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

      <NuxtLink class="cta" :to="`/?market=${market}&symbol=${symbol}`">自己输入该代码分析</NuxtLink>
    </article>
    <article v-else class="article">
      <h1>未找到复盘记录</h1>
      <p>该记录可能尚未结算或未公开。</p>
    </article>
  </main>
</template>

<style scoped>
.seo-page { min-height: 100vh; background: #f8fafc; color: #111827; padding: 24px 16px 56px; }
.article { max-width: 820px; margin: 0 auto; background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 24px; }
.back { color: #2563eb; text-decoration: none; font-weight: 600; }
h1 { font-size: 32px; margin: 20px 0 8px; letter-spacing: 0; }
h2 { font-size: 20px; margin: 24px 0 8px; }
p { color: #4b5563; line-height: 1.9; }
.lead { color: #6b7280; }
.metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; margin: 20px 0; }
.metrics div { border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; }
.metrics span { display: block; color: #6b7280; font-size: 12px; margin-bottom: 6px; }
.metrics strong { font-size: 20px; }
.cta { display: inline-flex; align-items: center; height: 42px; padding: 0 16px; margin-top: 18px; background: #2563eb; color: #fff; border-radius: 8px; text-decoration: none; font-weight: 700; }
</style>
