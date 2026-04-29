<script setup lang="ts">
useSeoMeta({
  title: '股票技术指标工具 - A股与港股K线观察',
  description: '按股票代码查看K线数据、MA、RSI、MACD、ATR等技术指标，并可进入AI分析工具自行研究。',
})

const groups = [
  {
    title: 'A股示例',
    market: 'a',
    items: [
      ['600519', '贵州茅台'],
      ['300750', '宁德时代'],
      ['002594', '比亚迪'],
      ['600036', '招商银行'],
      ['000858', '五粮液'],
    ],
  },
  {
    title: '港股示例',
    market: 'hk',
    items: [
      ['00700', '腾讯控股'],
      ['03690', '美团'],
      ['01810', '小米集团'],
      ['09988', '阿里巴巴'],
    ],
  },
]
</script>

<template>
  <main class="seo-page">
    <header class="hero">
      <NuxtLink to="/" class="back">返回分析工具</NuxtLink>
      <h1>股票技术指标工具</h1>
      <p>查看常见股票的K线数据与技术指标摘要。页面内容仅用于研究记录，不构成投资建议。</p>
    </header>

    <section v-for="group in groups" :key="group.market" class="section">
      <h2>{{ group.title }}</h2>
      <div class="grid">
        <NuxtLink
          v-for="item in group.items"
          :key="item[0]"
          class="tile"
          :to="`/stocks/${group.market}/${item[0]}`"
        >
          <strong>{{ item[1] }}</strong>
          <span>{{ item[0] }}</span>
        </NuxtLink>
      </div>
    </section>

    <section class="section">
      <h2>指标说明</h2>
      <div class="grid">
        <NuxtLink class="tile" to="/learn/ma"><strong>MA 均线</strong><span>趋势观察</span></NuxtLink>
        <NuxtLink class="tile" to="/learn/rsi"><strong>RSI</strong><span>强弱区间</span></NuxtLink>
        <NuxtLink class="tile" to="/learn/macd"><strong>MACD</strong><span>动能变化</span></NuxtLink>
        <NuxtLink class="tile" to="/learn/atr"><strong>ATR</strong><span>波动幅度</span></NuxtLink>
      </div>
    </section>
  </main>
</template>

<style scoped>
.seo-page { min-height: 100vh; background: #f8fafc; color: #111827; padding: 24px 16px 56px; }
.hero, .section { max-width: 920px; margin: 0 auto 18px; }
.back { color: #2563eb; text-decoration: none; font-weight: 600; }
h1 { font-size: 34px; margin: 22px 0 8px; letter-spacing: 0; }
h2 { font-size: 20px; margin: 0 0 12px; }
p { color: #4b5563; line-height: 1.8; max-width: 680px; }
.section { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 18px; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 10px; }
.tile { display: block; padding: 14px; border: 1px solid #e5e7eb; border-radius: 8px; color: inherit; text-decoration: none; background: #fff; }
.tile:hover { border-color: #93c5fd; }
.tile strong { display: block; margin-bottom: 4px; }
.tile span { color: #6b7280; font-size: 13px; }
</style>
