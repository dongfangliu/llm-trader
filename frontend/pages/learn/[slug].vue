<script setup lang="ts">
import { LEARN_ARTICLES, SITE_NAME, getLearnArticle } from '~/constants/seo'

const route = useRoute()
const slug = computed(() => String(route.params.slug || '').toLowerCase())
const doc = computed(() => getLearnArticle(slug.value))
if (!doc.value) {
  throw createError({ statusCode: 404, statusMessage: '未找到该学习页面' })
}
const requestUrl = useRequestURL()
const title = computed(() => `${doc.value!.title} - 技术指标解释与AI分析入口`)
const description = computed(() => doc.value!.desc)
const analyzeLink = computed(() => doc.value?.market ? `/?market=${doc.value.market}` : '/')
usePublicSeo({
  title,
  description,
  path: () => `/learn/${slug.value}`,
  type: 'article',
})
useJsonLd('learn-article-jsonld', () => [
  breadcrumbJsonLd(requestUrl.origin, [
    { name: SITE_NAME, path: '/' },
    { name: '股票技术指标工具', path: '/stocks' },
    { name: doc.value!.title, path: `/learn/${slug.value}` },
  ]),
  {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: doc.value!.title,
    description: doc.value!.desc,
    mainEntityOfPage: `${requestUrl.origin}/learn/${slug.value}`,
    author: { '@type': 'Organization', name: SITE_NAME },
    publisher: { '@type': 'Organization', name: SITE_NAME },
  },
])
</script>

<template>
  <main class="seo-page">
    <article class="article">
      <NuxtLink to="/stocks" class="back">股票工具</NuxtLink>
      <h1>{{ doc?.title }}</h1>
      <p class="lead">{{ doc?.desc }}</p>
      <ul>
        <li v-for="p in doc?.points || []" :key="p">{{ p }}</li>
      </ul>
      <section>
        <h2>怎么把指标用于分析</h2>
        <p>单个指标只描述价格、成交量或波动率的一个侧面。实际研究时，应同时检查趋势方向、动能变化、波动空间、关键支撑压力和计划内止损仓位，避免把单一信号当成结论。</p>
      </section>
      <p class="risk">技术指标只能描述历史价格和成交数据，不构成投资建议。使用指标时应结合自身风险承受能力。</p>
      <div class="actions">
        <NuxtLink class="cta primary" :to="analyzeLink">打开 AI 分析工具</NuxtLink>
        <NuxtLink class="cta secondary" to="/upgrade?tier=premium">升级专业版</NuxtLink>
      </div>
      <div class="links">
        <NuxtLink v-for="article in LEARN_ARTICLES" :key="article.slug" :to="`/learn/${article.slug}`">{{ article.title }}</NuxtLink>
      </div>
    </article>
  </main>
</template>

<style scoped>
.seo-page { min-height: 100vh; background: #f8fafc; color: #111827; padding: 24px 16px 56px; }
.article { max-width: 760px; margin: 0 auto; background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 24px; }
.back, .links a { color: #2563eb; text-decoration: none; font-weight: 600; }
h1 { font-size: 34px; margin: 20px 0 12px; letter-spacing: 0; }
h2 { font-size: 20px; margin: 22px 0 8px; }
.lead, li, .risk { color: #4b5563; line-height: 1.9; }
ul { padding-left: 20px; }
.risk { border-top: 1px solid #e5e7eb; padding-top: 16px; }
.actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 18px; }
.cta { display: inline-flex; align-items: center; min-height: 42px; padding: 0 16px; border-radius: 8px; text-decoration: none; font-weight: 700; }
.cta.primary { background: #2563eb; color: #fff; }
.cta.secondary { background: #eef2ff; color: #3730a3; }
.links { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 18px; }
</style>
