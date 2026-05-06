<script setup lang="ts">
import { SITE_NAME } from '~/constants/seo'

const { data } = await useAsyncData('research-index', () =>
  $fetch<any>('/api/public/research', { query: { limit: 100 } }).catch(() => ({ predictions: [], accuracy: null }))
)

const requestUrl = useRequestURL()
const title = 'AI K线分析复盘档案 - 已结算技术面历史记录'
const description = '查看已结算的AI K线分析复盘记录，包含历史技术面方向、实际涨跌、命中和失误情况，可从公开记录进入AI分析工具自行研究。'
usePublicSeo({ title, description, path: '/research' })
useJsonLd('research-index-breadcrumb-jsonld', breadcrumbJsonLd(requestUrl.origin, [
  { name: SITE_NAME, path: '/' },
  { name: '模型复盘档案', path: '/research' },
]))
</script>

<template>
  <main class="seo-page">
    <header class="hero">
      <NuxtLink to="/" class="back">返回分析工具</NuxtLink>
      <h1>模型复盘档案</h1>
      <p>这里只展示已结算记录，用于观察模型历史表现。命中和失误都会展示，未结算内部记录不会公开展示。</p>
      <div class="actions">
        <NuxtLink class="cta primary" to="/">打开 AI 分析工具</NuxtLink>
        <NuxtLink class="cta secondary" to="/upgrade?tier=premium">升级专业版</NuxtLink>
      </div>
      <div v-if="data?.accuracy?.total" class="badge">累计 {{ data.accuracy.correct }}/{{ data.accuracy.total }}，{{ data.accuracy.pct }}%</div>
    </header>

    <section class="list">
      <NuxtLink
        v-for="p in data?.predictions || []"
        :key="p.id"
        class="record"
        :to="`/research/${p.market}/${p.symbol}/${p.prediction_date}`"
      >
        <div>
          <strong>{{ p.symbol_name }}</strong>
          <span>{{ p.market }} / {{ p.symbol }} / {{ p.prediction_date }}</span>
        </div>
        <div>{{ p.predicted_direction === 'up' ? '看涨' : p.predicted_direction === 'down' ? '看跌' : '震荡' }}</div>
        <div :class="{ hit: p.is_correct, miss: p.is_correct === false }">{{ p.is_correct ? '命中' : '未命中' }}</div>
      </NuxtLink>
      <div v-if="!(data?.predictions || []).length" class="empty">暂无已结算记录</div>
    </section>
  </main>
</template>

<style scoped>
.seo-page { min-height: 100vh; background: #f8fafc; color: #111827; padding: 24px 16px 56px; }
.hero, .list { max-width: 920px; margin: 0 auto 16px; }
.back { color: #2563eb; text-decoration: none; font-weight: 600; }
.actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 14px; }
.cta { display: inline-flex; align-items: center; min-height: 42px; padding: 0 16px; border-radius: 8px; text-decoration: none; font-weight: 700; }
.cta.primary { background: #2563eb; color: #fff; }
.cta.secondary { background: #eef2ff; color: #3730a3; }
h1 { font-size: 34px; margin: 20px 0 8px; letter-spacing: 0; }
p { color: #4b5563; line-height: 1.8; }
.badge { display: inline-flex; margin-top: 10px; padding: 8px 12px; border-radius: 8px; background: #eff6ff; color: #1d4ed8; font-weight: 700; }
.list { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; }
.record { display: grid; grid-template-columns: 1.6fr .6fr .6fr; gap: 12px; align-items: center; padding: 14px 16px; border-bottom: 1px solid #f3f4f6; color: inherit; text-decoration: none; }
.record:hover { background: #f8fafc; }
.record span { display: block; color: #6b7280; font-size: 12px; margin-top: 3px; }
.hit { color: #15803d; font-weight: 700; }
.miss { color: #b91c1c; font-weight: 700; }
.empty { padding: 40px; text-align: center; color: #6b7280; }
@media (max-width: 680px) { .record { grid-template-columns: 1fr; } }
</style>
