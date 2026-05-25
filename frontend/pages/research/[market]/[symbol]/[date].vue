<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  PhArchive,
  PhChartLineUp,
  PhCheck,
  PhDownloadSimple,
  PhLink,
  PhMagnifyingGlass,
  PhShareNetwork,
  PhTarget,
} from '@phosphor-icons/vue'
import { MARKET_LABELS, SITE_NAME, analyzePath } from '~/constants/seo'
import MrStatusBadge from '~/components/model-review/MrStatusBadge.vue'
import { stripClock } from '~/lib/format'
import { useShareCard } from '~/composables/useShareCard'

const route = useRoute()
const market = computed(() => String(route.params.market || '').toLowerCase())
const symbol = computed(() => String(route.params.symbol || '').toUpperCase())
const date = computed(() => String(route.params.date || ''))
const requestUrl = useRequestURL()

const { data } = await useAsyncData(`research-detail-${market.value}-${symbol.value}-${date.value}`, () =>
  $fetch<any>(`/api/public/research/${market.value}/${symbol.value}/${date.value}`).catch(() => ({ record: null }))
)
const record = computed(() => data.value?.record)
if (!record.value) {
  throw createError({ statusCode: 404, statusMessage: '未找到公开记录' })
}

const { data: symbolData } = await useAsyncData(`research-detail-symbol-${market.value}-${symbol.value}`, () =>
  $fetch<any>(`/api/public/research/${market.value}/${symbol.value}`).catch(() => ({ records: [] })),
)

const { data: discoverData } = await useAsyncData(`research-detail-discover-${market.value}-${symbol.value}`, () =>
  $fetch<any>('/api/public/predictions', { query: { limit: 12 } }).catch(() => ({ predictions: [] })),
)

const dir = computed(() => record.value?.predicted_direction === 'up' ? '看涨' : record.value?.predicted_direction === 'down' ? '看跌' : '震荡')
const signedPct = computed(() => {
  const value = record.value?.actual_change_pct
  if (value == null) return '待结算'
  return `${value >= 0 ? '+' : ''}${Number(value).toFixed(2)}%`
})
const marketLabel = computed(() => MARKET_LABELS[market.value] || market.value)
const awaitingResult = computed(() => ['approved', 'posted'].includes(record.value?.status) && record.value?.actual_change_pct == null && record.value?.is_correct == null)
const resultLabel = computed(() => {
  if (awaitingResult.value) return '待验证'
  if (record.value?.settlement_verdict_label) return record.value.settlement_verdict_label
  if (record.value?.is_correct === true) return '命中'
  if (record.value?.is_correct === false) return '未命中'
  return '已结算'
})
const resultTone = computed(() => {
  if (awaitingResult.value) return 'pending'
  if (record.value?.is_correct === true) return 'hit'
  if (record.value?.is_correct === false) return 'miss'
  return 'settled'
})
const priceMetrics = computed(() => [
  { label: '当时方向', value: dir.value },
  { label: '置信度', value: record.value?.confidence == null ? '-' : Math.round(record.value.confidence) + '%' },
  { label: '基准收盘', value: record.value?.close_price == null ? '-' : Number(record.value.close_price).toFixed(2) },
  { label: '目标价', value: record.value?.target_price == null ? '-' : Number(record.value.target_price).toFixed(2) },
  { label: '止损价', value: record.value?.stop_loss == null ? '-' : Number(record.value.stop_loss).toFixed(2) },
  ...(record.value?.settlement_band_low != null && record.value?.settlement_band_high != null
    ? [{ label: '震荡区间', value: `${Number(record.value.settlement_band_low).toFixed(2)} - ${Number(record.value.settlement_band_high).toFixed(2)}` }]
    : []),
  { label: '实际收盘', value: record.value?.actual_close == null ? '待结算' : Number(record.value.actual_close).toFixed(2) },
])
const analysisSections = computed(() => [
  { title: '市场诊断', text: stripClock(record.value?.market_diagnosis) },
  { title: '机会评估', text: stripClock(record.value?.opportunity_assessment) },
  { title: '风险分析', text: stripClock(record.value?.risk_analysis) },
  { title: '执行计划', text: stripClock(record.value?.execution_plan) },
].filter(item => item.text))

const cardVariant = computed(() => awaitingResult.value ? 'promise' : (record.value?.is_correct != null ? 'proof' : 'promise'))
const cardVersion = computed(() => encodeURIComponent(record.value?.updated_at || record.value?.prediction_date || date.value))
const cardPath = computed(() => `/api/public/research/${market.value}/${symbol.value}/${date.value}/card?variant=${cardVariant.value}&v=${cardVersion.value}`)
const cardUrl = computed(() => `${requestUrl.origin}${cardPath.value}`)

const pageModeLabel = computed(() => awaitingResult.value ? '待验证 AI K线预测' : '已结算AI K线分析复盘')
const title = computed(() => `${record.value?.symbol_name || symbol.value} ${date.value} ${pageModeLabel.value}`)
const description = computed(() => awaitingResult.value
  ? `${record.value?.symbol_name || symbol.value} 的待验证AI K线预测：技术面方向 ${dir.value}，目标日 ${record.value?.target_date || '-'}，展示原始判断和关键价格，仅供研究参考。`
  : `${record.value?.symbol_name || symbol.value} 的AI K线分析历史复盘：当时技术面方向 ${dir.value}，实际涨跌 ${signedPct.value}，记录命中或失误，仅供研究参考。`
)

usePublicSeo({
  title,
  description,
  path: () => `/research/${market.value}/${symbol.value}/${date.value}`,
  image: cardUrl,
  imageWidth: 1080,
  imageHeight: 1350,
  type: 'article',
  preloadImage: true,
  robots: () => market.value === 'a' ? 'index,follow' : 'noindex,follow',
})

const articleJsonLd = computed(() => ({
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: title.value,
  description: description.value,
  image: cardUrl.value,
  datePublished: record.value?.prediction_date,
  dateModified: record.value?.updated_at || record.value?.prediction_date,
  mainEntityOfPage: `${requestUrl.origin}/research/${market.value}/${symbol.value}/${date.value}`,
  publisher: { '@type': 'Organization', name: SITE_NAME },
  about: {
    '@type': 'Thing',
    name: `${record.value?.symbol_name || symbol.value} ${symbol.value}`,
  },
}))

useJsonLd('research-detail-jsonld', () => [
  breadcrumbJsonLd(requestUrl.origin, [
    { name: SITE_NAME, path: '/' },
    { name: '模型复盘档案', path: '/research' },
    { name: `${record.value?.symbol_name || symbol.value} ${symbol.value}`, path: `/research/${market.value}/${symbol.value}` },
    { name: `${date.value} ${awaitingResult.value ? '预测' : '复盘'}`, path: `/research/${market.value}/${symbol.value}/${date.value}` },
  ]),
  articleJsonLd.value,
])

const symbolRecords = computed(() => {
  const list: any[] = symbolData.value?.records || []
  return [...list].sort((a, b) => String(b.prediction_date || '').localeCompare(String(a.prediction_date || '')))
})

const symbolNeighbours = computed(() => {
  const idx = symbolRecords.value.findIndex(r => r.prediction_date === date.value)
  if (idx < 0) return { prev: null, next: null }
  return {
    prev: idx > 0 ? symbolRecords.value[idx - 1] : null,
    next: idx < symbolRecords.value.length - 1 ? symbolRecords.value[idx + 1] : null,
  }
})

const otherPicks = computed(() => {
  const list = discoverData.value?.predictions || []
  return list
    .filter((p: any) => !(p.market === market.value && p.symbol === symbol.value))
    .slice(0, 3)
})

function isAwaitingResultRow(p: any) {
  return ['approved', 'posted'].includes(p?.status) && p?.actual_change_pct == null && p?.is_correct == null
}
function statusLabelRow(p: any) {
  if (isAwaitingResultRow(p)) return '待验证'
  if (p?.settlement_verdict_label) return p.settlement_verdict_label
  if (p?.is_correct === true) return '命中'
  if (p?.is_correct === false) return '未命中'
  return '已结算'
}
function statusClassRow(p: any) {
  if (isAwaitingResultRow(p)) return 'pending'
  if (p?.is_correct === true) return 'hit'
  if (p?.is_correct === false) return 'miss'
  return 'settled'
}
function directionLabelRow(value: string) {
  return value === 'up' ? '看涨' : value === 'down' ? '看跌' : '震荡'
}

// ── 分享 / 下载 ──────────────────────────────────────────────────
const shareToast = ref<{ msg: string; type: 'ok' | 'err' | 'info' } | null>(null)
let shareToastTimer: number | null = null

function showShareToast(msg: string, type: 'ok' | 'err' | 'info' = 'ok') {
  shareToast.value = { msg, type }
  if (shareToastTimer) window.clearTimeout(shareToastTimer)
  shareToastTimer = window.setTimeout(() => { shareToast.value = null }, type === 'err' ? 6000 : 3500)
}

const shareTitle = computed(() => `${record.value?.symbol_name || symbol.value} · ${date.value} · ${pageModeLabel.value}`)
const shareText = computed(() => description.value)
const shareCanonical = computed(() => `${requestUrl.origin}/research/${market.value}/${symbol.value}/${date.value}`)

const proofUrl = computed(() => `${requestUrl.origin}/api/public/research/${market.value}/${symbol.value}/${date.value}/card?variant=proof&v=${cardVersion.value}`)
const promiseUrl = computed(() => `${requestUrl.origin}/api/public/research/${market.value}/${symbol.value}/${date.value}/card?variant=promise&v=${cardVersion.value}`)

const proofShare = useShareCard({
  url: () => proofUrl.value,
  filename: () => `${symbol.value}-${date.value}-proof.png`,
  title: () => shareTitle.value,
  text: () => shareText.value,
  shareUrl: () => shareCanonical.value,
  onSuccess: () => showShareToast('已保存兑现卡', 'ok'),
  onCancel: () => showShareToast('已取消', 'info'),
  onError: () => showShareToast('保存失败，稍后重试', 'err'),
})

const promiseShare = useShareCard({
  url: () => promiseUrl.value,
  filename: () => `${symbol.value}-${date.value}-promise.png`,
  title: () => shareTitle.value,
  text: () => shareText.value,
  shareUrl: () => shareCanonical.value,
  onSuccess: () => showShareToast('已保存预测卡', 'ok'),
  onCancel: () => showShareToast('已取消', 'info'),
  onError: () => showShareToast('保存失败，稍后重试', 'err'),
})

const linkCopied = ref(false)
async function copyLink() {
  try {
    await navigator.clipboard.writeText(shareCanonical.value)
    linkCopied.value = true
    showShareToast('链接已复制', 'ok')
    window.setTimeout(() => { linkCopied.value = false }, 2500)
  } catch {
    showShareToast('复制失败，请手动选择地址栏', 'err')
  }
}
</script>

<template>
  <main class="mr-page mr-detail-page">
    <article v-if="record" class="mr-public-article mr-public-shell">
      <nav class="mr-breadcrumb" aria-label="面包屑">
        <NuxtLink to="/">首页</NuxtLink>
        <span class="sep" aria-hidden="true">/</span>
        <NuxtLink to="/research">公开复盘档案</NuxtLink>
        <span class="sep" aria-hidden="true">/</span>
        <NuxtLink :to="`/research/${market}/${symbol}`">{{ record.symbol_name || symbol }}</NuxtLink>
        <span class="sep" aria-hidden="true">/</span>
        <span aria-current="page">{{ date }}</span>
      </nav>

      <header class="mr-public-hero">
        <div>
          <NuxtLink :to="`/research/${market}/${symbol}`" class="mr-btn mr-btn-ghost mr-btn-small">
            <PhArchive :size="16" weight="bold" />
            该标的历史记录
          </NuxtLink>
          <div class="mr-kicker" style="margin-top: 18px">
            <PhTarget :size="16" weight="bold" />
            {{ marketLabel }} / {{ symbol }} / {{ record.prediction_date }}
          </div>
          <h1 class="mr-title">{{ record.symbol_name }} {{ awaitingResult ? '待验证 AI K线预测' : `AI K线分析复盘：${resultLabel}` }}</h1>
          <p class="mr-lead">
            {{ awaitingResult ? `${record.symbol_name} 在 ${record.prediction_date} 生成的 AI 技术面预测，目标日 ${record.target_date || '-'} 尚待结算。本页展示原始判断、方向、置信度和关键价格，结算后会自动更新为复盘记录。` : `${record.symbol_name} 在 ${record.prediction_date} 生成的 AI 技术面预测，目标日 ${record.target_date || '-'} 已完成结算。本页保留原始判断、关键价格和实际结果，作为可追溯的历史复盘。` }}
          </p>
          <div class="mr-toolbar mr-toolbar-desktop" style="margin: 20px 0 0">
            <NuxtLink class="mr-btn mr-btn-primary" :to="analyzePath(market, symbol, 'seo_research_detail')">自己分析该标的</NuxtLink>
            <NuxtLink class="mr-btn mr-btn-secondary" to="/research">查看复盘档案</NuxtLink>
          </div>
        </div>
        <figure class="mr-public-figure">
          <img :src="cardPath" :alt="`${record.symbol_name} ${record.prediction_date} AI K线分析卡片`" loading="eager" decoding="async">
          <figcaption>{{ awaitingResult ? '审核时生成的原始预测卡片' : '结算后的兑现裁决卡' }}</figcaption>

          <div class="mr-share-cluster" role="group" aria-label="分享或保存卡片">
            <button
              v-if="!awaitingResult"
              type="button"
              class="mr-btn mr-btn-primary mr-share-primary"
              :disabled="proofShare.downloading.value"
              @click="proofShare.share"
            >
              <PhShareNetwork v-if="!proofShare.downloading.value" :size="16" weight="bold" />
              <span v-else class="mr-share-spinner" aria-hidden="true" />
              <span>{{ proofShare.downloading.value ? '生成中…' : '保存兑现卡' }}</span>
            </button>

            <button
              type="button"
              class="mr-btn mr-btn-secondary"
              :disabled="promiseShare.downloading.value"
              @click="promiseShare.share"
            >
              <PhDownloadSimple v-if="!promiseShare.downloading.value" :size="15" weight="bold" />
              <span v-else class="mr-share-spinner" aria-hidden="true" />
              <span>{{ awaitingResult ? '保存预测卡' : '保存原始预测' }}</span>
            </button>

            <button
              type="button"
              class="mr-btn mr-btn-ghost mr-share-link"
              @click="copyLink"
              :aria-pressed="linkCopied"
            >
              <PhCheck v-if="linkCopied" :size="15" weight="bold" />
              <PhLink v-else :size="15" weight="bold" />
              <span>{{ linkCopied ? '已复制' : '复制链接' }}</span>
            </button>
          </div>
        </figure>
      </header>

      <transition name="mr-share-toast">
        <div v-if="shareToast" :class="['mr-share-toast', `mr-share-toast-${shareToast.type}`]" role="status">
          {{ shareToast.msg }}
        </div>
      </transition>

      <section :class="['mr-result-grid', `mr-result-tone-${resultTone}`]" style="margin-bottom: 14px">
        <div class="mr-result-cell">
          <span>{{ awaitingResult ? '验证状态' : '结算结果' }}</span>
          <strong>{{ resultLabel }}</strong>
          <p>{{ record.settlement_explanation || (awaitingResult ? `预测方向 ${dir}，目标日 ${record.target_date || '-'}` : `预测方向 ${dir}，实际涨跌 ${signedPct}`) }}</p>
        </div>
        <div class="mr-result-cell"><span>实际涨跌</span><strong>{{ signedPct }}</strong></div>
        <div class="mr-result-cell"><span>目标日</span><strong>{{ record.target_date || '-' }}</strong></div>
      </section>

      <div class="mr-stat-list mr-detail-stats">
        <div v-for="item in priceMetrics" :key="item.label" class="mr-stat-row">
          <span>{{ item.label }}</span>
          <strong>{{ item.value }}</strong>
        </div>
      </div>

      <section v-if="record.analysis_summary" class="mr-content-section">
        <div class="mr-panel-header">
          <h2 class="mr-panel-title">摘要</h2>
          <MrStatusBadge :status="resultTone" :label="resultLabel" />
        </div>
        <p class="mr-copy">{{ stripClock(record.analysis_summary) }}</p>
      </section>

      <section class="mr-content-section">
        <div class="mr-panel-header">
          <div>
            <h2 class="mr-panel-title">{{ record.symbol_name }} AI K线分析四步记录</h2>
            <p class="mr-panel-sub">保留预测当时的完整判断，结算后不改写原始分析。</p>
          </div>
        </div>
        <div class="mr-analysis-list">
          <section v-for="item in analysisSections" :key="item.title" class="mr-analysis-cell">
            <strong>{{ item.title }}</strong>
            <p>{{ item.text }}</p>
          </section>
        </div>
      </section>

      <section v-if="symbolNeighbours.prev || symbolNeighbours.next || otherPicks.length" class="mr-related-section" aria-labelledby="related-title">
        <h2 id="related-title" class="mr-panel-title">相关预测</h2>
        <p class="mr-panel-sub">同标的的前后预测和近期热门记录。</p>
        <div class="mr-related-grid">
          <NuxtLink
            v-if="symbolNeighbours.prev"
            class="mr-related-card mr-related-card-strong"
            :to="`/research/${market}/${symbol}/${symbolNeighbours.prev.prediction_date}`"
          >
            <div class="mr-related-meta">
              <span class="mr-related-tag">上一条 · {{ symbol }}</span>
              <MrStatusBadge :status="statusClassRow(symbolNeighbours.prev)" :label="statusLabelRow(symbolNeighbours.prev)" />
            </div>
            <strong class="mr-related-name">{{ record.symbol_name }} {{ symbolNeighbours.prev.prediction_date }}</strong>
            <span class="mr-related-date">方向 {{ directionLabelRow(symbolNeighbours.prev.predicted_direction) }} · 目标 {{ symbolNeighbours.prev.target_date || '-' }}</span>
          </NuxtLink>
          <NuxtLink
            v-if="symbolNeighbours.next"
            class="mr-related-card mr-related-card-strong"
            :to="`/research/${market}/${symbol}/${symbolNeighbours.next.prediction_date}`"
          >
            <div class="mr-related-meta">
              <span class="mr-related-tag">下一条 · {{ symbol }}</span>
              <MrStatusBadge :status="statusClassRow(symbolNeighbours.next)" :label="statusLabelRow(symbolNeighbours.next)" />
            </div>
            <strong class="mr-related-name">{{ record.symbol_name }} {{ symbolNeighbours.next.prediction_date }}</strong>
            <span class="mr-related-date">方向 {{ directionLabelRow(symbolNeighbours.next.predicted_direction) }} · 目标 {{ symbolNeighbours.next.target_date || '-' }}</span>
          </NuxtLink>
          <NuxtLink
            v-for="p in otherPicks"
            :key="`${p.market}-${p.symbol}-${p.prediction_date}`"
            class="mr-related-card"
            :to="`/research/${p.market}/${p.symbol}/${p.prediction_date}`"
          >
            <div class="mr-related-meta">
              <span class="mr-related-tag">{{ MARKET_LABELS[p.market] || p.market }} · {{ p.symbol }}</span>
              <MrStatusBadge :status="statusClassRow(p)" :label="statusLabelRow(p)" />
            </div>
            <strong class="mr-related-name">{{ p.symbol_name || p.symbol }}</strong>
            <span class="mr-related-date">预测 {{ p.prediction_date }}</span>
          </NuxtLink>
        </div>
      </section>

      <div class="mr-toolbar mr-toolbar-desktop">
        <NuxtLink class="mr-btn mr-btn-primary" :to="analyzePath(market, symbol, 'seo_research_detail')">
          <PhMagnifyingGlass :size="17" weight="bold" />
          自己分析该标的
        </NuxtLink>
        <NuxtLink class="mr-btn mr-btn-secondary" :to="`/research/${market}/${symbol}`">查看该标的更多复盘</NuxtLink>
        <NuxtLink class="mr-btn mr-btn-secondary" to="/upgrade?tier=premium">升级专业版</NuxtLink>
      </div>
    </article>

    <div class="mr-mobile-cta">
      <NuxtLink class="mr-btn mr-btn-primary mr-btn-full" :to="analyzePath(market, symbol, 'seo_research_detail')">
        <PhMagnifyingGlass :size="16" weight="bold" />
        去分析 {{ record.symbol_name || symbol }}
      </NuxtLink>
    </div>
  </main>
</template>

<style scoped>
.mr-detail-stats {
  margin-bottom: 14px;
}

/* ── 分享按钮组：紧贴在卡片下方，桌面横排 / 移动竖排 ────────── */
.mr-share-cluster {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-top: 14px;
}

.mr-share-cluster .mr-btn {
  min-height: 40px;
}

.mr-share-cluster .mr-share-primary {
  flex: 0 0 auto;
}

.mr-share-cluster .mr-share-link {
  margin-left: auto;
}

.mr-share-spinner {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid currentColor;
  border-top-color: transparent;
  animation: mr-spin .8s linear infinite;
  display: inline-block;
}

/* ── 分享 toast：贴在视口底部，含 dvh 兜底 ──────────────────── */
.mr-share-toast {
  position: fixed;
  left: 50%;
  bottom: calc(20px + env(safe-area-inset-bottom));
  z-index: 60;
  transform: translateX(-50%);
  max-width: min(92vw, 360px);
  padding: 10px 16px;
  border-radius: 999px;
  color: #f7faf7;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: .02em;
  box-shadow: 0 18px 50px rgba(23, 32, 29, .26);
}

.mr-share-toast-ok {
  background: var(--mr-good);
}

.mr-share-toast-err {
  background: var(--mr-bad);
}

.mr-share-toast-info {
  background: var(--mr-surface-strong);
}

.mr-share-toast-enter-active,
.mr-share-toast-leave-active {
  transition: opacity .18s ease, transform .18s ease;
}

.mr-share-toast-enter-from,
.mr-share-toast-leave-to {
  opacity: 0;
  transform: translate(-50%, 12px);
}

@media (max-width: 760px) {
  .mr-share-cluster {
    flex-direction: column;
    align-items: stretch;
  }
  .mr-share-cluster .mr-btn {
    width: 100%;
    justify-content: center;
  }
  .mr-share-cluster .mr-share-link {
    margin-left: 0;
  }
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

.mr-related-card-strong {
  border-color: var(--mr-line-strong);
  background: #fff;
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

.mr-mobile-cta {
  display: none;
}

@media (max-width: 760px) {
  .mr-detail-page {
    padding-bottom: 84px;
  }

  .mr-toolbar-desktop {
    display: none;
  }

  .mr-mobile-cta {
    display: block;
    position: fixed;
    left: 12px;
    right: 12px;
    bottom: calc(12px + env(safe-area-inset-bottom));
    z-index: 30;
  }

  .mr-mobile-cta .mr-btn {
    box-shadow: 0 18px 40px rgba(23, 32, 29, .18);
  }
}
</style>
