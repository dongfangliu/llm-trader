<script setup lang="ts">
import { SITE_NAME } from '~/constants/seo'

const { data } = await useAsyncData('research-index', () =>
  $fetch<any>('/api/public/research', { query: { limit: 100 } }).catch(() => ({ predictions: [], accuracy: null }))
)

const requestUrl = useRequestURL()
const title = 'AI K线预测与复盘档案 - 公开技术面历史记录'
const description = '查看已通过的AI K线预测和已结算复盘记录，包含技术面方向、目标日、实际涨跌、命中和失误情况，可从公开记录进入AI分析工具自行研究。'
usePublicSeo({ title, description, path: '/research' })
useJsonLd('research-index-breadcrumb-jsonld', breadcrumbJsonLd(requestUrl.origin, [
  { name: SITE_NAME, path: '/' },
  { name: '模型复盘档案', path: '/research' },
]))

function isAwaitingResult(p: any) {
  return ['approved', 'posted'].includes(p?.status) && p?.actual_change_pct == null && p?.is_correct == null
}

function directionLabel(value: string) {
  return value === 'up' ? '看涨' : value === 'down' ? '看跌' : '震荡'
}

function confidenceLabel(value: number | null | undefined) {
  return value == null ? '-' : `${Math.round(Number(value))}%`
}

function statusLabel(p: any) {
  if (isAwaitingResult(p)) return '待验证'
  if (p?.is_correct === true) return '命中'
  if (p?.is_correct === false) return '未命中'
  return '已结算'
}

function statusClass(p: any) {
  if (isAwaitingResult(p)) return 'pending'
  if (p?.is_correct === true) return 'hit'
  if (p?.is_correct === false) return 'miss'
  return 'settled'
}

const records = computed(() => [...(data.value?.predictions || [])].sort((a, b) => {
  const awaitingOrder = Number(isAwaitingResult(b)) - Number(isAwaitingResult(a))
  if (awaitingOrder) return awaitingOrder
  const dateOrder = String(b.prediction_date || '').localeCompare(String(a.prediction_date || ''))
  if (dateOrder) return dateOrder
  return Number(a.hot_rank || 0) - Number(b.hot_rank || 0)
}))
</script>

<template>
  <main class="seo-page">
    <header class="hero">
      <NuxtLink to="/" class="back">返回分析工具</NuxtLink>
      <h1>模型复盘档案</h1>
      <p>这里展示已通过预测和已结算复盘。待验证记录会保留完整原始判断，结算后同一页面自动变成复盘记录。</p>
      <div class="actions">
        <NuxtLink class="cta primary" to="/">打开 AI 分析工具</NuxtLink>
        <NuxtLink class="cta secondary" to="/upgrade?tier=premium">升级专业版</NuxtLink>
      </div>
      <div v-if="data?.accuracy?.total" class="badge">已结算准确率 {{ data.accuracy.correct }}/{{ data.accuracy.total }}，{{ data.accuracy.pct }}%</div>
    </header>

    <section class="list">
      <NuxtLink
        v-for="p in records"
        :key="p.id"
        class="record"
        :to="`/research/${p.market}/${p.symbol}/${p.prediction_date}`"
      >
        <div>
          <strong>{{ p.symbol_name }}</strong>
          <span>{{ p.market }} / {{ p.symbol }} / 目标日 {{ p.target_date || '-' }}</span>
        </div>
        <div class="direction">{{ directionLabel(p.predicted_direction) }}<span>预测日 {{ p.prediction_date }}</span></div>
        <div class="confidence">置信度 <strong>{{ confidenceLabel(p.confidence) }}</strong></div>
        <div :class="['status-badge', statusClass(p)]">{{ statusLabel(p) }}</div>
      </NuxtLink>
      <div v-if="!records.length" class="empty">暂无公开预测记录</div>
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
.record { display: grid; grid-template-columns: 1.4fr .75fr .65fr .6fr; gap: 12px; align-items: center; padding: 14px 16px; border-bottom: 1px solid #f3f4f6; color: inherit; text-decoration: none; }
.record:hover { background: #f8fafc; }
.record span { display: block; color: #6b7280; font-size: 12px; margin-top: 3px; }
.direction { font-weight: 800; }
.confidence { color: #4b5563; font-size: 13px; }
.confidence strong { display: block; color: #111827; font-size: 16px; margin-top: 3px; }
.status-badge { justify-self: start; padding: 6px 10px; border-radius: 8px; font-size: 13px; font-weight: 800; }
.status-badge.pending { color: #92400e; background: #fffbeb; }
.status-badge.settled { color: #1d4ed8; background: #eff6ff; }
.hit { color: #15803d; background: #f0fdf4; }
.miss { color: #b91c1c; background: #fef2f2; }
.empty { padding: 40px; text-align: center; color: #6b7280; }
@media (max-width: 680px) { .record { grid-template-columns: 1fr; } }
</style>
