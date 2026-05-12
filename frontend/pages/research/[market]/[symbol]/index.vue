<script setup lang="ts">
import { computed } from 'vue'
import { PhArchive, PhChartLineUp, PhMagnifyingGlass, PhTarget } from '@phosphor-icons/vue'
import { MARKET_LABELS, SITE_NAME, analyzePath } from '~/constants/seo'
import MrMetric from '~/components/model-review/MrMetric.vue'
import MrState from '~/components/model-review/MrState.vue'
import MrStatusBadge from '~/components/model-review/MrStatusBadge.vue'

const route = useRoute()
const market = computed(() => String(route.params.market || '').toLowerCase())
const symbol = computed(() => String(route.params.symbol || '').toUpperCase())
const { data } = await useAsyncData(`research-${market.value}-${symbol.value}`, () =>
  $fetch<any>(`/api/public/research/${market.value}/${symbol.value}`).catch(() => ({ records: [] }))
)
if (!(data.value?.records || []).length) {
  throw createError({ statusCode: 404, statusMessage: '暂无公开预测记录' })
}
const first = computed(() => data.value?.records?.[0])
const requestUrl = useRequestURL()
const displayName = computed(() => first.value?.symbol_name || symbol.value)
const title = computed(() => `${displayName.value}(${symbol.value}) AI K线预测与复盘/技术面历史记录`)
const description = computed(() => `${displayName.value} ${symbol.value} 的公开AI K线预测和已结算复盘，展示技术面方向、目标日、实际涨跌、命中与失误记录，可进入AI分析工具自行研究。`)

const cardImage = computed(() => first.value
  ? `/api/public/research/${market.value}/${symbol.value}/${first.value.prediction_date}/card?variant=${first.value.is_correct != null ? 'proof' : 'promise'}&v=${encodeURIComponent(first.value.updated_at || first.value.prediction_date)}`
  : '')

usePublicSeo({
  title,
  description,
  path: () => `/research/${market.value}/${symbol.value}`,
  image: () => cardImage.value,
  imageWidth: 1080,
  imageHeight: 1350,
})
useJsonLd('research-symbol-breadcrumb-jsonld', () => breadcrumbJsonLd(requestUrl.origin, [
  { name: SITE_NAME, path: '/' },
  { name: '模型复盘档案', path: '/research' },
  { name: `${displayName.value} ${symbol.value}`, path: `/research/${market.value}/${symbol.value}` },
]))

const { data: relatedData } = await useAsyncData(`research-related-${market.value}-${symbol.value}`, () =>
  $fetch<any>('/api/public/predictions', { query: { limit: 12 } }).catch(() => ({ predictions: [] })),
)

const otherPicks = computed(() => {
  const list = relatedData.value?.predictions || []
  return list
    .filter((p: any) => !(p.market === market.value && p.symbol === symbol.value))
    .slice(0, 6)
})

function isAwaitingResult(p: any) {
  return ['approved', 'posted'].includes(p?.status) && p?.actual_change_pct == null && p?.is_correct == null
}

function directionLabel(value: string) {
  return value === 'up' ? '看涨' : value === 'down' ? '看跌' : '震荡'
}

function statusLabel(p: any) {
  if (isAwaitingResult(p)) return '待验证'
  if (p?.settlement_verdict_label) return p.settlement_verdict_label
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

function changeText(p: any) {
  if (isAwaitingResult(p) || p?.actual_change_pct == null) return '待结算'
  const value = Number(p.actual_change_pct)
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`
}

function dotKind(p: any) {
  if (isAwaitingResult(p)) return 'pending'
  if (p?.is_correct === true) return 'hit'
  if (p?.is_correct === false) return 'miss'
  return ''
}

const records = computed(() => [...(data.value?.records || [])].sort((a, b) => {
  const awaitingOrder = Number(isAwaitingResult(b)) - Number(isAwaitingResult(a))
  if (awaitingOrder) return awaitingOrder
  return String(b.prediction_date || '').localeCompare(String(a.prediction_date || ''))
}))

const recentDots = computed(() => records.value.slice(0, 7).reverse())

const awaitingCount = computed(() => records.value.filter(isAwaitingResult).length)
const hitCount = computed(() => records.value.filter(r => r.is_correct === true).length)
const missCount = computed(() => records.value.filter(r => r.is_correct === false).length)
</script>

<template>
  <main class="mr-page">
    <div class="mr-public-shell">
      <nav class="mr-breadcrumb" aria-label="面包屑">
        <NuxtLink to="/">首页</NuxtLink>
        <span class="sep" aria-hidden="true">/</span>
        <NuxtLink to="/research">公开复盘档案</NuxtLink>
        <span class="sep" aria-hidden="true">/</span>
        <span aria-current="page">{{ displayName }} {{ symbol }}</span>
      </nav>

      <section class="mr-hero">
        <div class="mr-hero-main">
          <NuxtLink to="/research" class="mr-btn mr-btn-ghost mr-btn-small">
            <PhArchive :size="16" weight="bold" />
            复盘档案
          </NuxtLink>
          <div class="mr-kicker" style="margin-top: 18px">
            <PhTarget :size="16" weight="bold" />
            {{ MARKET_LABELS[market] || market }} / {{ symbol }}
          </div>
          <h1 class="mr-title">{{ displayName }} <span style="color: var(--mr-muted)">{{ symbol }}</span></h1>
          <p class="mr-lead">{{ MARKET_LABELS[market] || market }} 已通过 AI K线预测和已结算复盘记录。待验证记录展示目标日与原始方向，结算后继续保留命中和失误。</p>
          <div v-if="recentDots.length" class="mr-symbol-dots" aria-label="近期 7 次记录">
            <span class="mr-symbol-dots-label">近期</span>
            <span class="mr-dot-strip">
              <span
                v-for="(p, idx) in recentDots"
                :key="`${p.prediction_date}-${idx}`"
                class="mr-dot"
                :class="dotKind(p)"
                :title="`${p.prediction_date} · ${statusLabel(p)}`"
              />
            </span>
          </div>
          <div class="mr-toolbar" style="margin: 18px 0 0">
            <NuxtLink class="mr-btn mr-btn-primary" :to="analyzePath(market, symbol)">自己分析该标的</NuxtLink>
            <NuxtLink class="mr-btn mr-btn-secondary" to="/upgrade?tier=premium">升级专业版</NuxtLink>
          </div>
        </div>
        <aside class="mr-hero-side">
          <div>
            <div class="mr-kicker">公开记录</div>
            <strong>{{ records.length }}</strong>
            <small>待验证 {{ awaitingCount }}，命中 {{ hitCount }}，未命中 {{ missCount }}。</small>
          </div>
          <MrStatusBadge status="info" :label="`${displayName} 档案`" />
        </aside>
      </section>

      <div class="mr-metrics">
        <MrMetric label="总记录" :value="records.length" sub="按预测日倒序">
          <template #icon><PhArchive :size="18" weight="bold" /></template>
        </MrMetric>
        <MrMetric label="待验证" :value="awaitingCount" sub="目标日后更新">
          <template #icon><PhTarget :size="18" weight="bold" /></template>
        </MrMetric>
        <MrMetric label="命中" :value="hitCount" sub="方向验证成功">
          <template #icon><PhChartLineUp :size="18" weight="bold" /></template>
        </MrMetric>
        <MrMetric label="未命中" :value="missCount" sub="保留失败记录">
          <template #icon><PhMagnifyingGlass :size="18" weight="bold" /></template>
        </MrMetric>
      </div>

      <section class="mr-list-table" aria-label="标的复盘记录">
        <NuxtLink
          v-for="p in records"
          :key="p.id"
          class="mr-list-row"
          :to="`/research/${p.market}/${p.symbol}/${p.prediction_date}`"
        >
          <div><strong>{{ p.prediction_date }}</strong><span>目标日 {{ p.target_date }}</span></div>
          <div><strong>{{ directionLabel(p.predicted_direction) }}</strong><span>置信度 {{ p.confidence == null ? '-' : `${Math.round(Number(p.confidence))}%` }}</span></div>
          <div><strong>{{ changeText(p) }}</strong><span>实际涨跌</span></div>
          <MrStatusBadge :status="statusClass(p)" :label="statusLabel(p)" />
        </NuxtLink>
        <MrState v-if="!records.length" title="暂无公开预测记录" text="审核通过后的该标的记录会显示在这里。" />
      </section>

      <section v-if="otherPicks.length" class="mr-related-section" aria-labelledby="other-picks-title">
        <h2 id="other-picks-title" class="mr-panel-title">其他热门标的复盘</h2>
        <p class="mr-panel-sub">来自最近的公开预测和结算记录。</p>
        <div class="mr-related-grid">
          <NuxtLink
            v-for="p in otherPicks"
            :key="`${p.market}-${p.symbol}-${p.prediction_date}`"
            class="mr-related-card"
            :to="`/research/${p.market}/${p.symbol}/${p.prediction_date}`"
          >
            <div class="mr-related-meta">
              <span class="mr-related-tag">{{ MARKET_LABELS[p.market] || p.market }} · {{ p.symbol }}</span>
              <MrStatusBadge :status="statusClass(p)" :label="statusLabel(p)" />
            </div>
            <strong class="mr-related-name">{{ p.symbol_name || p.symbol }}</strong>
            <span class="mr-related-date">预测 {{ p.prediction_date }} · 目标 {{ p.target_date || '-' }}</span>
          </NuxtLink>
        </div>
      </section>
    </div>
  </main>
</template>

<style scoped>
.mr-symbol-dots {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  margin-top: 16px;
  padding: 6px 12px;
  border: 1px solid var(--mr-line);
  border-radius: 999px;
  background: rgba(255, 255, 255, .65);
}

.mr-symbol-dots-label {
  color: var(--mr-faint);
  font-size: 11px;
  font-weight: 720;
  letter-spacing: .12em;
  text-transform: uppercase;
}

.mr-related-section {
  margin-top: 28px;
  padding: 22px;
  border: 1px solid var(--mr-line);
  border-radius: var(--mr-radius-md);
  background: #fff;
  box-shadow: var(--mr-elev-1);
}

.mr-related-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
  margin-top: 14px;
}

.mr-related-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px;
  border: 1px solid var(--mr-line);
  border-radius: var(--mr-radius-sm);
  background: #fafbf8;
  color: inherit;
  text-decoration: none;
  transition: border-color .18s ease, transform .18s ease, background .18s ease;
}

.mr-related-card:hover {
  border-color: var(--mr-accent);
  background: #fff;
  transform: translateY(-1px);
}

.mr-related-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.mr-related-tag {
  font-family: "JetBrains Mono", "SFMono-Regular", Consolas, monospace;
  font-size: 11px;
  color: var(--mr-muted);
  font-weight: 700;
  letter-spacing: .04em;
}

.mr-related-name {
  color: var(--mr-text);
  font-size: 16px;
  font-weight: 800;
  line-height: 1.25;
}

.mr-related-date {
  color: var(--mr-muted);
  font-size: 12px;
}
</style>
