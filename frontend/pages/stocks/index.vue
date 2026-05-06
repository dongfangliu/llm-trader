<script setup lang="ts">
import { CORE_STOCKS, LEARN_ARTICLES, MARKET_LABELS, SITE_NAME } from '~/constants/seo'

const requestUrl = useRequestURL()
const title = '股票技术指标工具 - A股港股美股K线分析入口'
const description = '按股票代码查看A股、港股、美股K线数据、MA、RSI、MACD、ATR等技术指标，并可一键进入AI分析工具生成研究参考。'
usePublicSeo({ title, description, path: '/stocks' })

const groups = ['a', 'hk', 'us'].map(market => ({
  title: `${MARKET_LABELS[market]}示例`,
  market,
  items: CORE_STOCKS.filter(item => item.market === market),
}))

useJsonLd('stocks-breadcrumb-jsonld', breadcrumbJsonLd(requestUrl.origin, [
  { name: SITE_NAME, path: '/' },
  { name: '股票技术指标工具', path: '/stocks' },
]))
</script>

<template>
  <main class="seo-page">
    <header class="hero">
      <NuxtLink to="/" class="back">返回分析工具</NuxtLink>
      <h1>股票技术指标工具</h1>
      <p>查看常见股票的K线数据与技术指标摘要。页面内容仅用于研究记录，不构成投资建议。</p>
      <div class="actions">
        <NuxtLink class="cta primary" to="/">打开 AI 分析工具</NuxtLink>
        <NuxtLink class="cta secondary" to="/upgrade?tier=premium">查看专业版权益</NuxtLink>
      </div>
    </header>

    <section v-for="group in groups" :key="group.market" class="section">
      <h2>{{ group.title }}</h2>
      <div class="grid">
        <NuxtLink
          v-for="item in group.items"
          :key="item.symbol"
          class="tile"
          :to="`/stocks/${group.market}/${item.symbol}`"
        >
          <strong>{{ item.name }}</strong>
          <span>{{ item.symbol }}</span>
        </NuxtLink>
      </div>
    </section>

    <section class="section">
      <h2>指标说明</h2>
      <div class="grid">
        <NuxtLink v-for="article in LEARN_ARTICLES.slice(0, 8)" :key="article.slug" class="tile" :to="`/learn/${article.slug}`">
          <strong>{{ article.title }}</strong>
          <span>{{ article.desc }}</span>
        </NuxtLink>
      </div>
    </section>
  </main>
</template>

<style scoped>
.seo-page { min-height: 100vh; background: #f8fafc; color: #111827; padding: 24px 16px 56px; }
.hero, .section { max-width: 920px; margin: 0 auto 18px; }
.back { color: #2563eb; text-decoration: none; font-weight: 600; }
.actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 16px; }
.cta { display: inline-flex; align-items: center; min-height: 42px; padding: 0 16px; border-radius: 8px; text-decoration: none; font-weight: 700; }
.cta.primary { background: #2563eb; color: #fff; }
.cta.secondary { background: #eef2ff; color: #3730a3; }
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
