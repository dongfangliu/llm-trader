<script setup lang="ts">
const route = useRoute()
const symbol = computed(() => String(route.params.symbol || '').toUpperCase())
useSeoMeta({
  title: () => `${symbol.value} 期货K线技术指标观察`,
  description: () => `${symbol.value} 期货品种K线、均线、RSI、MACD等技术指标工具页，仅供研究参考。`,
})
</script>

<template>
  <main class="seo-page">
    <header class="hero">
      <NuxtLink to="/stocks" class="back">市场工具</NuxtLink>
      <h1>{{ symbol }} 期货技术指标观察</h1>
      <p>查看期货品种的K线与技术指标摘要。数据与分析仅用于研究，不构成投资建议。</p>
      <NuxtLink class="cta" :to="`/?market=futures&symbol=${symbol}`">用该代码做一次AI分析</NuxtLink>
    </header>
    <StockLike market="futures" :symbol="symbol" />
  </main>
</template>

<script lang="ts">
export default {
  components: {
    StockLike: {
      props: ['market', 'symbol'],
      async setup(props: any) {
        const data = await $fetch<any>(`/api/market/${props.market}/${props.symbol}`, { query: { period: 'daily', history_days: 180 } }).catch(() => null)
        return { latest: data?.data?.at(-1) || null }
      },
      template: `
        <section class="panel">
          <h2>最新数据</h2>
          <div v-if="latest" class="metrics">
            <div><span>收盘</span><strong>{{ Number(latest.close).toFixed(2) }}</strong></div>
            <div><span>MA10</span><strong>{{ latest.ma10 ? Number(latest.ma10).toFixed(2) : '-' }}</strong></div>
            <div><span>RSI</span><strong>{{ latest.rsi ? Number(latest.rsi).toFixed(1) : '-' }}</strong></div>
            <div><span>ATR</span><strong>{{ latest.atr ? Number(latest.atr).toFixed(3) : '-' }}</strong></div>
          </div>
          <p v-else>暂未取得行情数据。</p>
        </section>
      `,
    },
  },
}
</script>

<style scoped>
.seo-page { min-height: 100vh; background: #f8fafc; color: #111827; padding: 24px 16px 56px; }
.hero, :deep(.panel) { max-width: 920px; margin: 0 auto 16px; }
.back { color: #2563eb; text-decoration: none; font-weight: 600; }
h1 { font-size: 34px; margin: 20px 0 8px; letter-spacing: 0; }
p { color: #4b5563; line-height: 1.8; }
.cta { display: inline-flex; align-items: center; height: 42px; padding: 0 16px; margin-top: 10px; background: #2563eb; color: #fff; border-radius: 8px; text-decoration: none; font-weight: 700; }
:deep(.panel) { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 18px; }
:deep(.metrics) { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px; }
:deep(.metrics div) { border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; }
:deep(.metrics span) { display: block; color: #6b7280; font-size: 12px; margin-bottom: 6px; }
:deep(.metrics strong) { font-size: 20px; }
</style>
