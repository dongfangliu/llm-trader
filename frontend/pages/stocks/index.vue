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

useGsapReveal()
</script>

<template>
  <main class="seo-page">
    <header class="hero" data-reveal>
      <NuxtLink to="/" class="back">返回分析工具</NuxtLink>
      <h1>股票技术指标工具</h1>
      <p>查看常见股票的K线数据与技术指标摘要。页面内容仅用于研究记录，不构成投资建议。</p>
      <div class="actions">
        <NuxtLink class="cta primary" to="/?src=seo_stocks_index">打开 AI 分析工具</NuxtLink>
        <NuxtLink class="cta secondary" to="/upgrade?tier=premium">查看专业版权益</NuxtLink>
      </div>
    </header>

    <section v-for="group in groups" :key="group.market" class="section" data-reveal>
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

    <section class="section" data-reveal>
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
.seo-page { min-height: 100vh; background: var(--ios-bg); color: var(--ios-label); padding: 24px 16px 64px; font-family: var(--app-font); }
.hero, .section { max-width: 980px; margin: 0 auto 18px; }
.back { color: var(--ios-blue); text-decoration: none; font-weight: 700; }
.actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 16px; }
.cta { display: inline-flex; align-items: center; min-height: 42px; padding: 0 16px; border-radius: 8px; text-decoration: none; font-weight: 760; transition: transform .18s ease, background .18s ease; }
.cta:active { transform: translateY(1px) scale(.99); }
.cta.primary { background: var(--ios-blue); color: #fff; }
.cta.secondary { background: var(--ios-card); color: var(--ios-blue); border: 1px solid var(--ios-separator); }
h1 { font-size: clamp(32px, 5vw, 52px); margin: 22px 0 8px; letter-spacing: 0; line-height: 1.04; max-width: 760px; }
h2 { font-size: 20px; margin: 0 0 12px; }
p { color: var(--ios-label2); line-height: 1.8; max-width: 680px; }
.section { background: color-mix(in srgb, var(--ios-card) 94%, transparent); border: 1px solid var(--ios-separator); border-radius: 8px; padding: 18px; box-shadow: var(--ios-shadow-sm); }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 10px; }
.tile { display: block; padding: 14px; border: 1px solid var(--ios-separator); border-radius: 8px; color: inherit; text-decoration: none; background: var(--ios-card); transition: border-color .18s ease, transform .18s ease, background .18s ease; }
.tile:hover { border-color: var(--ios-blue); background: color-mix(in srgb, var(--ios-blue) 5%, var(--ios-card)); transform: translateY(-1px); }
.tile strong { display: block; margin-bottom: 4px; }
.tile span { color: var(--ios-secondary); font-size: 13px; }
</style>
