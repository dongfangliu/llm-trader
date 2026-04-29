<script setup lang="ts">
const route = useRoute()
const market = computed(() => String(route.params.market || '').toLowerCase())
const symbol = computed(() => String(route.params.symbol || '').toUpperCase())

const { data } = await useAsyncData(`stock-${market.value}-${symbol.value}`, async () => {
  const [bars, names] = await Promise.all([
    $fetch<any>(`/api/market/${market.value}/${symbol.value}`, { query: { period: 'daily', history_days: 180 } }).catch(() => null),
    $fetch<any>('/api/market', { query: { market: market.value, q: symbol.value } }).catch(() => null),
  ])
  const name = names?.items?.find((i: any) => String(i.symbol).toUpperCase() === symbol.value)?.name || symbol.value
  return { bars, name }
})

const latest = computed(() => data.value?.bars?.data?.at(-1) || null)
const prev = computed(() => data.value?.bars?.data?.at(-2) || null)
const changePct = computed(() => {
  if (!latest.value || !prev.value?.close) return null
  return ((latest.value.close - prev.value.close) / prev.value.close) * 100
})
const title = computed(() => `${data.value?.name || symbol.value}(${symbol.value}) K线技术指标观察`)

useSeoMeta({
  title: () => title.value,
  description: () => `${data.value?.name || symbol.value} ${symbol.value} 的K线、MA、RSI、MACD、ATR等技术指标摘要，仅供研究参考。`,
  ogTitle: () => title.value,
  ogDescription: () => '股票技术指标工具页，可进入AI分析工具自行研究。',
})
</script>

<template>
  <main class="seo-page">
    <header class="hero">
      <NuxtLink to="/stocks" class="back">股票工具</NuxtLink>
      <h1>{{ data?.name || symbol }} <span>{{ symbol }}</span></h1>
      <p>{{ market.toUpperCase() }} 市场技术指标观察。数据用于研究和工具演示，不构成投资建议。</p>
      <NuxtLink class="cta" :to="`/?market=${market}&symbol=${symbol}`">用该代码做一次AI分析</NuxtLink>
    </header>

    <section v-if="latest" class="panel">
      <h2>最新K线摘要</h2>
      <div class="metrics">
        <div><span>收盘</span><strong>{{ Number(latest.close).toFixed(2) }}</strong></div>
        <div><span>涨跌幅</span><strong :class="{ up: (changePct ?? 0) > 0, down: (changePct ?? 0) < 0 }">{{ changePct == null ? '-' : `${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%` }}</strong></div>
        <div><span>成交量</span><strong>{{ Math.round(latest.volume || 0).toLocaleString() }}</strong></div>
        <div><span>更新时间</span><strong>{{ String(latest.datetime || '').slice(0, 10) || '-' }}</strong></div>
      </div>
    </section>

    <section v-if="latest" class="panel">
      <h2>技术指标</h2>
      <div class="metrics">
        <div><span>MA10</span><strong>{{ latest.ma10 ? Number(latest.ma10).toFixed(2) : '-' }}</strong></div>
        <div><span>MA30</span><strong>{{ latest.ma30 ? Number(latest.ma30).toFixed(2) : '-' }}</strong></div>
        <div><span>RSI</span><strong>{{ latest.rsi ? Number(latest.rsi).toFixed(1) : '-' }}</strong></div>
        <div><span>MACD</span><strong>{{ latest.macd ? Number(latest.macd).toFixed(4) : '-' }}</strong></div>
        <div><span>ATR</span><strong>{{ latest.atr ? Number(latest.atr).toFixed(3) : '-' }}</strong></div>
      </div>
    </section>

    <section v-else class="panel">
      <h2>暂未取得行情数据</h2>
      <p>可以返回分析工具手动输入代码，或稍后在数据源恢复后再访问本页。</p>
    </section>

    <section class="panel">
      <h2>相关说明</h2>
      <div class="links">
        <NuxtLink to="/learn/ma">MA均线说明</NuxtLink>
        <NuxtLink to="/learn/rsi">RSI说明</NuxtLink>
        <NuxtLink to="/learn/macd">MACD说明</NuxtLink>
        <NuxtLink to="/learn/atr">ATR说明</NuxtLink>
        <NuxtLink :to="`/research/${market}/${symbol}`">查看已结算模型复盘</NuxtLink>
      </div>
    </section>
  </main>
</template>

<style scoped>
.seo-page { min-height: 100vh; background: #f8fafc; color: #111827; padding: 24px 16px 56px; }
.hero, .panel { max-width: 920px; margin: 0 auto 16px; }
.back, .links a { color: #2563eb; text-decoration: none; font-weight: 600; }
h1 { font-size: 34px; margin: 20px 0 8px; letter-spacing: 0; }
h1 span { color: #6b7280; font-size: 22px; }
h2 { font-size: 20px; margin: 0 0 14px; }
p { color: #4b5563; line-height: 1.8; }
.cta { display: inline-flex; align-items: center; height: 42px; padding: 0 16px; margin-top: 10px; background: #2563eb; color: #fff; border-radius: 8px; text-decoration: none; font-weight: 700; }
.panel { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 18px; }
.metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px; }
.metrics div { border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; }
.metrics span { display: block; color: #6b7280; font-size: 12px; margin-bottom: 6px; }
.metrics strong { font-size: 20px; }
.up { color: #c2410c; }
.down { color: #15803d; }
.links { display: flex; flex-wrap: wrap; gap: 12px; }
</style>
