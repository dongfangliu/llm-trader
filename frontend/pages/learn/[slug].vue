<script setup lang="ts">
const route = useRoute()
const slug = computed(() => String(route.params.slug || '').toLowerCase())

const docs: Record<string, any> = {
  ma: {
    title: 'MA均线怎么看',
    desc: 'MA均线用于观察价格在不同周期上的平均位置，常用于判断趋势方向和价格偏离程度。',
    points: ['MA10更贴近短期波动', 'MA30和MA60更适合观察中期趋势', '均线多头排列只代表趋势状态，不代表确定收益'],
  },
  rsi: {
    title: 'RSI指标怎么看',
    desc: 'RSI用于观察一段时间内上涨与下跌力量的相对强弱，常见区间为0到100。',
    points: ['RSI高于70常被视为偏热区', 'RSI低于30常被视为偏弱区', '强趋势中RSI可能长时间停留在极端区域'],
  },
  macd: {
    title: 'MACD指标怎么看',
    desc: 'MACD用于观察价格动能变化，常结合DIF、DEA和柱状线变化判断动能方向。',
    points: ['金叉和死叉只是一种动能变化信号', '柱状线扩大通常代表动能增强', '震荡行情中MACD容易反复发出信号'],
  },
  atr: {
    title: 'ATR指标怎么看',
    desc: 'ATR用于衡量价格波动幅度，不直接判断方向，更适合观察风险和波动空间。',
    points: ['ATR变大代表波动扩大', 'ATR变小代表波动收敛', 'ATR可辅助观察止损距离和仓位风险，但不能预测方向'],
  },
}

const doc = computed(() => docs[slug.value] || docs.ma)

useSeoMeta({
  title: () => `${doc.value.title} - 技术指标解释`,
  description: () => doc.value.desc,
})
</script>

<template>
  <main class="seo-page">
    <article class="article">
      <NuxtLink to="/stocks" class="back">股票工具</NuxtLink>
      <h1>{{ doc.title }}</h1>
      <p class="lead">{{ doc.desc }}</p>
      <ul>
        <li v-for="p in doc.points" :key="p">{{ p }}</li>
      </ul>
      <p class="risk">技术指标只能描述历史价格和成交数据，不构成投资建议。使用指标时应结合自身风险承受能力。</p>
      <div class="links">
        <NuxtLink to="/learn/ma">MA</NuxtLink>
        <NuxtLink to="/learn/rsi">RSI</NuxtLink>
        <NuxtLink to="/learn/macd">MACD</NuxtLink>
        <NuxtLink to="/learn/atr">ATR</NuxtLink>
      </div>
    </article>
  </main>
</template>

<style scoped>
.seo-page { min-height: 100vh; background: #f8fafc; color: #111827; padding: 24px 16px 56px; }
.article { max-width: 760px; margin: 0 auto; background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 24px; }
.back, .links a { color: #2563eb; text-decoration: none; font-weight: 600; }
h1 { font-size: 34px; margin: 20px 0 12px; letter-spacing: 0; }
.lead, li, .risk { color: #4b5563; line-height: 1.9; }
ul { padding-left: 20px; }
.risk { border-top: 1px solid #e5e7eb; padding-top: 16px; }
.links { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 18px; }
</style>
