<script setup lang="ts">
import { computed, ref } from 'vue'
import { PhArchive, PhCaretDown, PhChartLineUp, PhGlobeHemisphereEast, PhMagnifyingGlass, PhTarget } from '@phosphor-icons/vue'
import { SITE_NAME } from '~/constants/seo'
import MrMetric from '~/components/model-review/MrMetric.vue'
import MrState from '~/components/model-review/MrState.vue'
import MrStatusBadge from '~/components/model-review/MrStatusBadge.vue'

type Prediction = Record<string, any>

const { data } = await useAsyncData('research-index', () =>
  $fetch<any>('/api/public/research', { query: { limit: 100 } }).catch(() => ({ predictions: [], accuracy: null }))
)

const requestUrl = useRequestURL()
const title = 'AI K线预测与复盘档案 - 公开技术面历史记录'
const description = '查看已通过的AI K线预测和已结算复盘记录，包含技术面方向、目标日、实际涨跌、命中和失误情况，可从公开记录进入AI分析工具自行研究。'
usePublicSeo({ title, description, path: '/research' })

const marketFilter = ref<'all' | 'a' | 'hk' | 'us'>('all')
const statusFilter = ref<'all' | 'pending' | 'hit' | 'miss'>('all')
const search = ref('')

function isAwaitingResult(p: Prediction) {
  return ['approved', 'posted'].includes(p?.status) && p?.actual_change_pct == null && p?.is_correct == null
}

function directionLabel(value: string) {
  return value === 'up' ? '看涨' : value === 'down' ? '看跌' : '震荡'
}

function confidenceLabel(value: number | null | undefined) {
  return value == null ? '-' : `${Math.round(Number(value))}%`
}

function statusLabel(p: Prediction) {
  if (isAwaitingResult(p)) return '待验证'
  if (p?.settlement_verdict_label) return p.settlement_verdict_label
  if (p?.is_correct === true) return '命中'
  if (p?.is_correct === false) return '未命中'
  return '已结算'
}

function statusClass(p: Prediction) {
  if (isAwaitingResult(p)) return 'pending'
  if (p?.is_correct === true) return 'hit'
  if (p?.is_correct === false) return 'miss'
  return 'settled'
}

function changeText(p: Prediction) {
  if (isAwaitingResult(p) || p?.actual_change_pct == null) return '待结算'
  const value = Number(p.actual_change_pct)
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`
}

const baseRecords = computed<Prediction[]>(() => [...(data.value?.predictions || [])].sort((a, b) => {
  const awaitingOrder = Number(isAwaitingResult(b)) - Number(isAwaitingResult(a))
  if (awaitingOrder) return awaitingOrder
  const dateOrder = String(b.prediction_date || '').localeCompare(String(a.prediction_date || ''))
  if (dateOrder) return dateOrder
  return Number(a.hot_rank || 0) - Number(b.hot_rank || 0)
}))

const records = computed<Prediction[]>(() => {
  const term = search.value.trim().toLowerCase()
  return baseRecords.value.filter(p => {
    if (marketFilter.value !== 'all' && p.market !== marketFilter.value) return false
    if (statusFilter.value === 'pending' && !isAwaitingResult(p)) return false
    if (statusFilter.value === 'hit' && p.is_correct !== true) return false
    if (statusFilter.value === 'miss' && p.is_correct !== false) return false
    if (term) {
      const pool = `${p.symbol || ''} ${p.symbol_name || ''}`.toLowerCase()
      if (!pool.includes(term)) return false
    }
    return true
  })
})

interface StockGroup {
  key: string
  symbol: string
  market: string
  symbol_name: string
  records: Prediction[]
  latestDate: string
  hitCount: number
  missCount: number
  awaitingCount: number
}

const groups = computed<StockGroup[]>(() => {
  const map = new Map<string, StockGroup>()
  for (const p of records.value) {
    const key = `${p.market}-${p.symbol}`
    let g = map.get(key)
    if (!g) {
      g = {
        key,
        symbol: p.symbol,
        market: p.market,
        symbol_name: p.symbol_name || p.symbol,
        records: [],
        latestDate: '',
        hitCount: 0,
        missCount: 0,
        awaitingCount: 0,
      }
      map.set(key, g)
    }
    g.records.push(p)
    const d = String(p.prediction_date || '')
    if (d > g.latestDate) g.latestDate = d
    if (isAwaitingResult(p)) g.awaitingCount += 1
    else if (p.is_correct === true) g.hitCount += 1
    else if (p.is_correct === false) g.missCount += 1
  }
  const list = [...map.values()]
  for (const g of list) {
    g.records.sort((a, b) => String(b.prediction_date || '').localeCompare(String(a.prediction_date || '')))
  }
  return list.sort((a, b) => b.latestDate.localeCompare(a.latestDate))
})

const initialPage = 20
const pageSize = 20
const visibleCount = ref(initialPage)
watch(() => groups.value.length, () => { visibleCount.value = initialPage })

const visibleGroups = computed<StockGroup[]>(() => groups.value.slice(0, visibleCount.value))
const hasMore = computed(() => groups.value.length > visibleCount.value)

function loadMore() {
  visibleCount.value = Math.min(groups.value.length, visibleCount.value + pageSize)
}

const expandedKeys = ref<Set<string>>(new Set())
function isExpanded(key: string) {
  return expandedKeys.value.has(key)
}
function toggleGroup(key: string) {
  const next = new Set(expandedKeys.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  expandedKeys.value = next
}

const marketCounts = computed(() => ({
  all: baseRecords.value.length,
  a: baseRecords.value.filter(p => p.market === 'a').length,
  hk: baseRecords.value.filter(p => p.market === 'hk').length,
  us: baseRecords.value.filter(p => p.market === 'us').length,
}))

const awaitingCount = computed(() => baseRecords.value.filter(isAwaitingResult).length)
const settledCount = computed(() => baseRecords.value.filter(r => !isAwaitingResult(r)).length)
const hitCount = computed(() => baseRecords.value.filter(r => r.is_correct === true).length)
const missCount = computed(() => baseRecords.value.filter(r => r.is_correct === false).length)
const accuracyLabel = computed(() => data.value?.accuracy?.total ? `${data.value.accuracy.pct}%` : '待统计')

const itemListJsonLd = computed(() => ({
  '@context': 'https://schema.org',
  '@type': 'ItemList',
  itemListElement: visibleGroups.value.slice(0, 30).map((g, idx) => ({
    '@type': 'ListItem',
    position: idx + 1,
    url: `${requestUrl.origin}/research/${g.market}/${g.symbol}`,
    name: `${g.symbol_name} ${g.symbol}`,
  })),
}))

useJsonLd('research-index-jsonld', () => [
  breadcrumbJsonLd(requestUrl.origin, [
    { name: SITE_NAME, path: '/' },
    { name: '模型复盘档案', path: '/research' },
  ]),
  itemListJsonLd.value,
])

function marketLabel(m: string) {
  return m === 'a' ? 'A股' : m === 'hk' ? '港股' : m === 'us' ? '美股' : m
}
</script>

<template>
  <main class="mr-page">
    <div class="mr-public-shell">
      <nav class="mr-breadcrumb" aria-label="面包屑">
        <NuxtLink to="/">首页</NuxtLink>
        <span class="sep" aria-hidden="true">/</span>
        <span aria-current="page">公开复盘档案</span>
      </nav>

      <section class="mr-hero">
        <div class="mr-hero-main">
          <NuxtLink to="/" class="mr-btn mr-btn-ghost mr-btn-small">
            <PhMagnifyingGlass :size="16" weight="bold" />
            返回分析工具
          </NuxtLink>
          <div class="mr-kicker" style="margin-top: 18px">
            <PhArchive :size="16" weight="bold" />
            公开技术面档案
          </div>
          <h1 class="mr-title">模型复盘档案</h1>
          <p class="mr-lead">已通过预测会先进入待验证状态，结算后同一路径自动变成复盘记录，保留原始方向、关键价格和实际结果。</p>
          <div class="mr-toolbar" style="margin: 18px 0 0">
            <NuxtLink class="mr-btn mr-btn-primary" to="/">打开 AI 分析工具</NuxtLink>
            <NuxtLink class="mr-btn mr-btn-secondary" to="/upgrade?tier=premium">升级专业版</NuxtLink>
          </div>
        </div>
        <aside class="mr-hero-side">
          <div>
            <div class="mr-kicker">结算准确率</div>
            <strong>{{ accuracyLabel }}</strong>
            <small v-if="data?.accuracy?.total">已结算 {{ data.accuracy.correct }}/{{ data.accuracy.total }} 条。</small>
            <small v-else>记录结算后自动统计。</small>
          </div>
          <MrStatusBadge status="info" :label="`${baseRecords.length} 条公开记录`" />
        </aside>
      </section>

      <div class="mr-metrics">
        <MrMetric label="公开记录" :value="baseRecords.length" sub="按最新预测日排序">
          <template #icon><PhGlobeHemisphereEast :size="18" weight="bold" /></template>
        </MrMetric>
        <MrMetric label="待验证" :value="awaitingCount" sub="目标日后自动复盘">
          <template #icon><PhTarget :size="18" weight="bold" /></template>
        </MrMetric>
        <MrMetric label="已结算" :value="settledCount" :sub="`命中 ${hitCount} · 未中 ${missCount}`">
          <template #icon><PhChartLineUp :size="18" weight="bold" /></template>
        </MrMetric>
        <MrMetric label="命中率" :value="accuracyLabel" sub="公开样本">
          <template #icon><PhArchive :size="18" weight="bold" /></template>
        </MrMetric>
      </div>

      <div class="mr-filter-bar" role="search" aria-label="筛选公开记录">
        <div class="mr-chip-row" role="group" aria-label="市场筛选">
          <button
            type="button"
            class="mr-chip"
            :class="{ 'is-active': marketFilter === 'all' }"
            :aria-pressed="marketFilter === 'all'"
            @click="marketFilter = 'all'"
          >全部 <span class="mr-chip-count">{{ marketCounts.all }}</span></button>
          <button
            type="button"
            class="mr-chip"
            :class="{ 'is-active': marketFilter === 'a' }"
            :aria-pressed="marketFilter === 'a'"
            @click="marketFilter = 'a'"
          >A股 <span class="mr-chip-count">{{ marketCounts.a }}</span></button>
          <button
            type="button"
            class="mr-chip"
            :class="{ 'is-active': marketFilter === 'hk' }"
            :aria-pressed="marketFilter === 'hk'"
            @click="marketFilter = 'hk'"
          >港股 <span class="mr-chip-count">{{ marketCounts.hk }}</span></button>
          <span class="mr-filter-sep" aria-hidden="true" />
          <button
            type="button"
            class="mr-chip"
            :class="{ 'is-active': statusFilter === 'all' }"
            :aria-pressed="statusFilter === 'all'"
            @click="statusFilter = 'all'"
          >全部状态</button>
          <button
            type="button"
            class="mr-chip"
            :class="{ 'is-active': statusFilter === 'pending' }"
            :aria-pressed="statusFilter === 'pending'"
            @click="statusFilter = 'pending'"
          >待验证</button>
          <button
            type="button"
            class="mr-chip"
            :class="{ 'is-active': statusFilter === 'hit' }"
            :aria-pressed="statusFilter === 'hit'"
            @click="statusFilter = 'hit'"
          >命中</button>
          <button
            type="button"
            class="mr-chip"
            :class="{ 'is-active': statusFilter === 'miss' }"
            :aria-pressed="statusFilter === 'miss'"
            @click="statusFilter = 'miss'"
          >未中</button>
        </div>
        <input
          v-model.trim="search"
          class="mr-input"
          type="search"
          placeholder="按代码或名称搜索"
          aria-label="搜索记录"
        >
      </div>

      <section class="mr-public-list" aria-label="公开复盘记录（按股票分组）">
        <div
          v-for="g in visibleGroups"
          :key="g.key"
          class="mr-group"
          :class="{ 'is-open': isExpanded(g.key) }"
        >
          <button
            type="button"
            class="mr-group-head"
            :aria-expanded="isExpanded(g.key)"
            @click="toggleGroup(g.key)"
          >
            <div class="mr-group-main">
              <div class="mr-group-title">
                <strong>{{ g.symbol_name }}</strong>
                <span class="mr-public-row-tag">{{ marketLabel(g.market) }} · {{ g.symbol }}</span>
              </div>
              <div class="mr-public-row-meta">
                {{ g.records.length }} 条复盘 · 最近 {{ g.latestDate }}
              </div>
            </div>
            <div class="mr-group-stats">
              <span v-if="g.awaitingCount" class="mr-group-stat is-pending">待验证 {{ g.awaitingCount }}</span>
              <span v-if="g.hitCount" class="mr-group-stat is-hit">命中 {{ g.hitCount }}</span>
              <span v-if="g.missCount" class="mr-group-stat is-miss">未中 {{ g.missCount }}</span>
            </div>
            <PhCaretDown :size="16" weight="bold" class="mr-group-chevron" />
          </button>

          <div v-if="isExpanded(g.key)" class="mr-group-body">
            <NuxtLink
              v-for="p in g.records"
              :key="p.id"
              class="mr-public-row"
              :to="`/research/${p.market}/${p.symbol}/${p.prediction_date}`"
            >
              <div class="mr-public-row-main">
                <div class="mr-public-row-title">
                  <strong>预测 {{ p.prediction_date }}</strong>
                </div>
                <div class="mr-public-row-meta">
                  目标 {{ p.target_date || '-' }} · 置信 {{ confidenceLabel(p.confidence) }}
                </div>
              </div>
              <div class="mr-public-row-direction" :data-dir="p.predicted_direction">
                <strong>{{ directionLabel(p.predicted_direction) }}</strong>
                <span>{{ changeText(p) }}</span>
              </div>
              <MrStatusBadge :status="statusClass(p)" :label="statusLabel(p)" />
            </NuxtLink>
          </div>
        </div>

        <MrState v-if="!groups.length" title="无符合条件的记录" text="清空筛选或换一个市场试试。" />

        <div v-if="hasMore" class="mr-public-loadmore">
          <button type="button" class="mr-btn mr-btn-secondary" @click="loadMore">加载更多（剩余 {{ groups.length - visibleCount }} 只股票）</button>
        </div>
      </section>
    </div>
  </main>
</template>

<style scoped>
.mr-filter-sep {
  display: inline-block;
  width: 1px;
  height: 18px;
  margin: 0 6px;
  background: var(--mr-line);
}

.mr-public-list {
  display: grid;
  gap: 10px;
  margin-top: 12px;
}

.mr-public-row {
  display: grid;
  grid-template-columns: minmax(0, 1.3fr) minmax(110px, .5fr) auto;
  gap: 14px;
  align-items: center;
  padding: 14px 16px;
  border: 1px solid var(--mr-line);
  border-radius: var(--mr-radius-sm);
  background: #fff;
  color: inherit;
  text-decoration: none;
  transition: background .18s ease, border-color .18s ease, transform .18s ease;
  box-shadow: var(--mr-elev-1);
}

.mr-public-row:hover {
  background: #fafbf8;
  border-color: var(--mr-line-strong);
  transform: translateY(-1px);
}

.mr-public-row-main {
  min-width: 0;
}

.mr-public-row-title {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 4px;
}

.mr-public-row-title strong {
  color: var(--mr-text);
  font-size: 16px;
  font-weight: 800;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.mr-public-row-tag {
  font-family: "JetBrains Mono", "SFMono-Regular", Consolas, monospace;
  font-size: 11px;
  color: var(--mr-faint);
  font-weight: 700;
  letter-spacing: .04em;
}

.mr-public-row-meta {
  color: var(--mr-muted);
  font-size: 12.5px;
  line-height: 1.55;
}

.mr-public-row-direction {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  min-width: 0;
}

.mr-public-row-direction strong {
  color: var(--mr-text);
  font-size: 14px;
  font-weight: 800;
}

.mr-public-row-direction[data-dir="up"] strong {
  color: #b03333;
}

.mr-public-row-direction[data-dir="down"] strong {
  color: #1a7a4a;
}

.mr-public-row-direction span {
  color: var(--mr-muted);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.mr-public-loadmore {
  display: flex;
  justify-content: center;
  margin-top: 16px;
}

.mr-group {
  border: 1px solid var(--mr-line);
  border-radius: var(--mr-radius-sm);
  background: #fff;
  box-shadow: var(--mr-elev-1);
  overflow: hidden;
  transition: border-color .18s ease;
}

.mr-group.is-open {
  border-color: var(--mr-line-strong);
}

.mr-group-head {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) auto auto;
  gap: 14px;
  align-items: center;
  width: 100%;
  padding: 14px 16px;
  border: 0;
  background: transparent;
  text-align: left;
  color: inherit;
  cursor: pointer;
  transition: background .18s ease;
}

.mr-group-head:hover {
  background: #fafbf8;
}

.mr-group-head:active {
  transform: translateY(1px);
}

.mr-group-main {
  min-width: 0;
}

.mr-group-title {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 4px;
}

.mr-group-title strong {
  color: var(--mr-text);
  font-size: 16px;
  font-weight: 800;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.mr-group-stats {
  display: inline-flex;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.mr-group-stat {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.mr-group-stat.is-pending {
  color: #8a6d1f;
  background: rgba(255, 196, 0, .16);
}

.mr-group-stat.is-hit {
  color: #1f7a45;
  background: rgba(52, 199, 89, .16);
}

.mr-group-stat.is-miss {
  color: #c0392b;
  background: rgba(255, 59, 48, .14);
}

.mr-group-chevron {
  color: var(--mr-faint);
  transition: transform .2s ease;
  flex-shrink: 0;
}

.mr-group.is-open .mr-group-chevron {
  transform: rotate(180deg);
}

.mr-group-body {
  display: grid;
  gap: 8px;
  padding: 12px 16px 14px;
  border-top: 1px solid var(--mr-line);
}

.mr-group-body .mr-public-row {
  box-shadow: none;
  background: #fafbf8;
}

@media (max-width: 760px) {
  .mr-public-row {
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-rows: auto auto;
    row-gap: 8px;
  }

  .mr-public-row-direction {
    grid-row: 2;
    grid-column: 1 / span 2;
    flex-direction: row;
    align-items: baseline;
    justify-content: space-between;
    border-top: 1px dashed var(--mr-line);
    padding-top: 8px;
  }

  .mr-public-row-direction strong {
    font-size: 13px;
  }

  .mr-group-head {
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-rows: auto auto;
    row-gap: 8px;
    column-gap: 10px;
  }

  .mr-group-chevron {
    grid-row: 1;
    grid-column: 2;
    align-self: center;
  }

  .mr-group-stats {
    grid-row: 2;
    grid-column: 1 / span 2;
    justify-content: flex-start;
  }
}
</style>
