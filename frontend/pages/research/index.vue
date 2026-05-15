<script setup lang="ts">
import { computed, ref } from 'vue'
import { PhArchive, PhCaretRight, PhChartLineUp, PhGlobeHemisphereEast, PhTarget } from '@phosphor-icons/vue'
import { SITE_NAME } from '~/constants/seo'

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

function statusVariant(p: Prediction): 'orange' | 'green' | 'red' | 'gray' {
  if (isAwaitingResult(p)) return 'orange'
  if (p?.is_correct === true) return 'green'
  if (p?.is_correct === false) return 'red'
  return 'gray'
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

useGsapReveal()

function marketLabel(m: string) {
  return m === 'a' ? 'A股' : m === 'hk' ? '港股' : m === 'us' ? '美股' : m
}

const marketChips = [
  { key: 'all', label: '全部' },
  { key: 'a', label: 'A股' },
  { key: 'hk', label: '港股' },
] as const

const statusChips = [
  { key: 'all', label: '全部状态' },
  { key: 'pending', label: '待验证' },
  { key: 'hit', label: '命中' },
  { key: 'miss', label: '未中' },
] as const

const metrics = computed(() => [
  { label: '公开记录', value: baseRecords.value.length, sub: '按最新预测日排序', icon: PhGlobeHemisphereEast },
  { label: '待验证', value: awaitingCount.value, sub: '目标日后自动复盘', icon: PhTarget },
  { label: '已结算', value: settledCount.value, sub: `命中 ${hitCount.value} · 未中 ${missCount.value}`, icon: PhChartLineUp },
  { label: '命中率', value: accuracyLabel.value, sub: '公开样本', icon: PhArchive },
])
</script>

<template>
  <main class="min-h-[100dvh] bg-ios-bg">
    <IosNavBar title="复盘档案" back="/" />

    <div class="max-w-[680px] mx-auto px-4 pb-12">
      <!-- Hero -->
      <header class="pt-6 pb-1" data-reveal>
        <p class="text-xs font-semibold uppercase tracking-wide text-ios-secondary mb-2">公开技术面档案</p>
        <h1 class="text-[28px] font-extrabold text-ios-label tracking-ios-tight leading-tight">模型复盘档案</h1>
        <p class="mt-2 text-sm text-ios-label2 leading-relaxed">
          已通过预测会先进入待验证状态，结算后同一路径自动变成复盘记录，保留原始方向、关键价格和实际结果。
        </p>
        <div class="flex flex-wrap gap-2.5 mt-4">
          <NuxtLink to="/?src=seo_research_index"><IosButton size="md">打开 AI 分析工具</IosButton></NuxtLink>
          <NuxtLink to="/upgrade?tier=premium"><IosButton variant="secondary" size="md">升级专业版</IosButton></NuxtLink>
        </div>
      </header>

      <!-- Metrics grid -->
      <div class="grid grid-cols-2 gap-3 mt-6" data-reveal>
        <IosCard
          v-for="m in metrics"
          :key="m.label"
          elevation="flat"
          rounded="ios"
          padding="md"
        >
          <div class="flex items-start justify-between">
            <span class="text-xs text-ios-secondary">{{ m.label }}</span>
            <component :is="m.icon" :size="17" weight="bold" class="text-ios-tertiary" />
          </div>
          <div class="text-[26px] font-extrabold text-ios-label tracking-ios-tight leading-none mt-1.5 tabular-nums">
            {{ m.value }}
          </div>
          <div class="text-[11px] text-ios-secondary mt-1.5">{{ m.sub }}</div>
        </IosCard>
      </div>

      <!-- Filters -->
      <div class="mt-6 flex flex-col gap-3" role="search" aria-label="筛选公开记录" data-reveal>
        <div class="flex flex-wrap items-center gap-2">
          <button
            v-for="c in marketChips"
            :key="c.key"
            type="button"
            class="research-chip"
            :class="{ 'is-active': marketFilter === c.key }"
            :aria-pressed="marketFilter === c.key"
            @click="marketFilter = c.key"
          >
            {{ c.label }}
            <span class="research-chip-count">{{ marketCounts[c.key] }}</span>
          </button>
          <span class="w-px h-4 bg-ios-separator mx-1" aria-hidden="true" />
          <button
            v-for="c in statusChips"
            :key="c.key"
            type="button"
            class="research-chip"
            :class="{ 'is-active': statusFilter === c.key }"
            :aria-pressed="statusFilter === c.key"
            @click="statusFilter = c.key"
          >
            {{ c.label }}
          </button>
        </div>
        <input
          v-model.trim="search"
          type="search"
          placeholder="按代码或名称搜索"
          aria-label="搜索记录"
          class="w-full h-11 px-4 rounded-ios bg-ios-card border border-ios-separator text-ios-label text-base placeholder:text-ios-tertiary outline-none focus:border-ios-blue focus:ring-2 focus:ring-ios-blue/15 transition-all"
        />
      </div>

      <!-- Grouped list -->
      <section class="mt-4 flex flex-col gap-2.5" aria-label="公开复盘记录（按股票分组）" data-reveal>
        <IosCard
          v-for="g in visibleGroups"
          :key="g.key"
          elevation="flat"
          rounded="ios"
          padding="none"
        >
          <button
            type="button"
            class="w-full px-4 py-3.5 text-left transition-colors active:bg-ios-fill"
            :aria-expanded="isExpanded(g.key)"
            @click="toggleGroup(g.key)"
          >
            <div class="flex items-start gap-3">
              <div class="flex-1 min-w-0">
                <div class="research-stock-title">
                  <strong class="research-stock-name">{{ g.symbol_name }}</strong>
                  <span class="research-stock-code">
                    {{ marketLabel(g.market) }} · {{ g.symbol }}
                  </span>
                </div>
                <div class="text-xs text-ios-secondary mt-1">
                  {{ g.records.length }} 条复盘 · 最近 {{ g.latestDate }}
                </div>
              </div>
              <PhCaretRight
                :size="15"
                weight="bold"
                class="text-ios-tertiary flex-shrink-0 transition-transform duration-200 mt-1"
                :class="{ 'rotate-90': isExpanded(g.key) }"
              />
            </div>
            <div
              v-if="g.awaitingCount || g.hitCount || g.missCount"
              class="research-result-row"
            >
              <div class="flex items-center gap-1.5 flex-wrap min-w-0">
                <IosBadge v-if="g.awaitingCount" variant="orange">待验证 {{ g.awaitingCount }}</IosBadge>
                <IosBadge v-if="g.hitCount" variant="green">命中 {{ g.hitCount }}</IosBadge>
                <IosBadge v-if="g.missCount" variant="red">未中 {{ g.missCount }}</IosBadge>
              </div>
            </div>
          </button>

          <Transition name="research-accordion">
            <div v-if="isExpanded(g.key)" class="border-t border-ios-separator">
              <div class="divide-y divide-ios-separator">
                <NuxtLink
                  v-for="p in g.records"
                  :key="p.id"
                  :to="`/research/${p.market}/${p.symbol}/${p.prediction_date}`"
                  class="research-record-link"
                >
                  <div class="flex-1 min-w-0">
                    <strong class="text-sm font-semibold text-ios-label">预测 {{ p.prediction_date }}</strong>
                    <div class="text-xs text-ios-secondary mt-0.5">
                      目标 {{ p.target_date || '-' }} · 置信 {{ confidenceLabel(p.confidence) }}
                    </div>
                  </div>
                  <div class="flex flex-col items-end flex-shrink-0">
                    <strong
                      class="text-[13px] font-bold"
                      :class="p.predicted_direction === 'up' ? 'text-ios-red' : p.predicted_direction === 'down' ? 'text-ios-green' : 'text-ios-label'"
                    >{{ directionLabel(p.predicted_direction) }}</strong>
                    <span class="text-[11px] text-ios-secondary tabular-nums">{{ changeText(p) }}</span>
                  </div>
                  <IosBadge :variant="statusVariant(p)">{{ statusLabel(p) }}</IosBadge>
                </NuxtLink>
              </div>
            </div>
          </Transition>
        </IosCard>

        <IosEmptyState
          v-if="!groups.length"
          title="无符合条件的记录"
          description="清空筛选或换一个市场试试。"
        />

        <div v-if="hasMore" class="flex justify-center mt-3">
          <IosButton variant="secondary" size="md" @click="loadMore">
            加载更多（剩余 {{ groups.length - visibleCount }} 只股票）
          </IosButton>
        </div>
      </section>
    </div>
  </main>
</template>

<style scoped>
.research-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  min-height: 34px;
  border-radius: 9999px;
  font-size: 13px;
  font-weight: 600;
  color: var(--ios-label2);
  background: var(--ios-card);
  border: 1px solid var(--ios-separator);
  transition: background 0.15s ease, color 0.15s ease, transform 0.15s ease;
}
.research-chip:active {
  transform: scale(0.96);
}
.research-chip.is-active {
  background: var(--ios-blue);
  border-color: var(--ios-blue);
  color: #fff;
}
.research-chip-count {
  font-size: 11px;
  font-weight: 700;
  opacity: 0.75;
  font-variant-numeric: tabular-nums;
}
.research-stock-title {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}
.research-stock-name {
  min-width: 0;
  color: var(--ios-label);
  font-size: 15px;
  font-weight: 800;
  line-height: 1.35;
  overflow-wrap: anywhere;
}
.research-stock-code {
  flex-shrink: 0;
  color: var(--ios-tertiary);
  font-family: var(--mono-font);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0;
}
.research-result-row {
  display: flex;
  justify-content: flex-start;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--ios-separator);
}
.research-record-link {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  transition: background-color 0.15s ease;
}
.research-record-link:active {
  background: var(--ios-fill);
}
.research-accordion-enter-active,
.research-accordion-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.research-accordion-enter-from,
.research-accordion-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

@media (max-width: 520px) {
  .research-stock-title {
    align-items: flex-start;
    flex-direction: column;
    gap: 3px;
  }
  .research-stock-name {
    width: 100%;
    font-size: 16px;
  }
  .research-result-row {
    margin-top: 12px;
  }
  .research-record-link {
    align-items: flex-start;
    flex-wrap: wrap;
    gap: 10px;
  }
  .research-record-link > :first-child {
    flex-basis: 100%;
  }
}
</style>
