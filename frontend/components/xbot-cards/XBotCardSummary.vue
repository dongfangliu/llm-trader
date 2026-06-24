<script setup lang="ts">
import type { CardPayload, SummaryItem } from '~/server/utils/xbot-cards/types'
import { BRAND, prettyDomain, parsePct, CL } from '~/server/utils/xbot-cards/_helpers'

const props = defineProps<{ payload: CardPayload }>()

const domain    = computed(() => prettyDomain(props.payload.product_url))
const brandName = computed(() => props.payload.brand_name ?? BRAND.name)
const pct       = computed(() => parsePct(props.payload.accuracy_all))

const mktCode = computed(() =>
  (props.payload.summary_market || props.payload.market || 'A').toUpperCase()
)

const mktTitle = computed(() => {
  if (mktCode.value === 'HK') return '港  股'
  if (mktCode.value === 'US') return 'US Market'
  return 'A  股'
})

const reportId = computed(() => {
  const d = (props.payload.summary_date || props.payload.prediction_date).replace(/-/g, '')
  return `XRS-${d}-${mktCode.value}`
})

const settleDate = computed(() =>
  props.payload.summary_date || props.payload.prediction_date
)

const bgGradient = computed(() => {
  if (mktCode.value === 'HK') return `linear-gradient(180deg, rgba(43,200,132,0.07) 0%, transparent 38%), ${CL.BG}`
  if (mktCode.value === 'US') return `linear-gradient(180deg, rgba(107,127,212,0.07) 0%, transparent 38%), ${CL.BG}`
  return `linear-gradient(180deg, rgba(194,53,53,0.07) 0%, transparent 38%), ${CL.BG}`
})

const items = computed(() => props.payload.summary_items ?? [])

function dirLabel(d: string) {
  return d === 'up' ? '多头' : d === 'down' ? '空头' : '震荡'
}
function dirArrow(d: string) {
  return d === 'up' ? '▲' : d === 'down' ? '▼' : ''
}
function dirColor(d: string) {
  return d === 'up' ? CL.UP : d === 'down' ? CL.DOWN : CL.HOLD
}
function actualColor(v: number | null) {
  if (v == null) return CL.DIM
  return v > 0 ? CL.UP : v < 0 ? CL.DOWN : CL.DIM
}
function fmtPct(v: number | null) {
  if (v == null) return '—'
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`
}
function stockCode(item: SummaryItem) {
  // Infer exchange suffix from market or symbol prefix
  if (mktCode.value === 'HK') return `${item.symbol} · HK`
  if (mktCode.value === 'US') return item.symbol
  // A-share: 6xxxxx → SH, others → SZ
  const suffix = item.symbol.startsWith('6') ? 'SH' : 'SZ'
  return `${item.symbol} · ${suffix}`
}
function planEffective(item: SummaryItem) {
  if (typeof item.plan_effective === 'boolean') return item.plan_effective
  const label = item.settlement_verdict_label
  if (label) return label !== '破位' && label !== '区间失效'
  return item.is_correct === true
}
function stampLabel(item: SummaryItem) {
  const base = item.settlement_verdict_label || (item.is_correct === true ? '达标' : '破位')
  return `${base} ${planEffective(item) ? '✓' : '×'}`
}
function stampClass(item: SummaryItem) {
  return planEffective(item) ? 'stamp-hit' : 'stamp-miss'
}
</script>

<template>
  <div class="card" :style="{ background: bgGradient }">
    <!-- Noise texture overlay -->
    <div class="noise" />

    <!-- ── Header ── -->
    <div class="header">
      <span class="hdr-id">{{ reportId }}</span>
      <div class="hdr-date-badge">结算日 {{ settleDate }}</div>
    </div>
    <div class="rule" />

    <!-- ── Market title ── -->
    <div class="mkt-block">
      <div class="mkt-title">{{ mktTitle }}</div>
      <div class="mkt-sub">今 日 结 算</div>
    </div>

    <!-- ── Stock list ── -->
    <div class="rule2" />
    <div class="stock-list">
      <div
        v-for="(item, i) in items"
        :key="i"
        class="stock-row"
        :class="{ 'row-last': i === items.length - 1 }"
      >
        <!-- Left: name + code -->
        <div class="sr-left">
          <div class="sr-name">{{ item.symbol_name }}</div>
          <div class="sr-code">{{ stockCode(item) }}</div>
        </div>

        <!-- Direction -->
        <div class="sr-dir" :style="{ color: dirColor(item.predicted_direction) }">
          <span>{{ dirLabel(item.predicted_direction) }}</span>
          <span v-if="item.predicted_direction === 'hold'" class="hold-mark" :style="{ background: dirColor(item.predicted_direction) }" />
          <span v-else>{{ dirArrow(item.predicted_direction) }}</span>
        </div>

        <!-- Actual % -->
        <div class="sr-pct" :style="{ color: actualColor(item.actual_change_pct) }">
          {{ fmtPct(item.actual_change_pct) }}
        </div>

        <!-- Stamp -->
        <div class="sr-stamp-wrap">
          <div
            class="sr-stamp"
            :class="[stampClass(item), { 'stamp-hold': item.predicted_direction === 'hold' }]"
          >{{ stampLabel(item) }}</div>
        </div>
      </div>
    </div>

    <div class="grow" />

    <!-- ── Win rate row ── -->
    <div class="wr-section">
      <span class="wr-label">有效计划率</span>
      <div class="wr-right">
        <span class="wr-num">{{ pct != null ? pct : '—' }}</span>
        <span class="wr-unit" v-if="pct != null">%</span>
      </div>
    </div>

    <!-- ── Footer ── -->
    <div class="footer">
      <div class="ft-left">
        <span class="brand-mark ft-logo" />
        <span class="ft-name">{{ brandName }}</span>
        <span class="ft-sep">·</span>
        <span class="ft-url">{{ domain }}</span>
      </div>
      <div class="ft-disc">仅供研究参考，不构成投资建议</div>
    </div>
  </div>
</template>

<style scoped>
/* ── Base ──────────────────────────────────────────── */
.card {
  width: 1080px; height: 1350px;
  display: flex; flex-direction: column;
  padding: 52px 64px;
  box-sizing: border-box;
  font-family: "PingFang SC","Helvetica Neue","Microsoft YaHei",sans-serif;
  color: #111111;
  position: relative; overflow: hidden;
}

/* Grain texture – same technique as other cards */
.noise {
  position: absolute; inset: 0; pointer-events: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)'/%3E%3C/svg%3E");
  opacity: 0.12; mix-blend-mode: overlay;
}

/* ── Header ──────────────────────────────────────────── */
.header {
  display: flex; align-items: center; justify-content: space-between;
  font-size: 18px; color: rgba(17,17,17,0.55); letter-spacing: 1px;
  margin-bottom: 16px;
}
.hdr-id { letter-spacing: 1px; font-family: "SF Mono","Menlo","Consolas",monospace }
.hdr-date-badge {
  font-size: 17px; letter-spacing: 0.5px;
  border: 1.5px solid rgba(17,17,17,0.18);
  border-radius: 999px; padding: 5px 18px;
  color: rgba(17,17,17,0.55);
  font-family: "SF Mono","Menlo","Consolas",monospace;
}
.rule  { height: 1px; background: rgba(17,17,17,0.15); margin-bottom: 36px }
.rule2 { height: 1px; background: rgba(17,17,17,0.15); margin: 24px 0 0 }

/* ── Market title block ──────────────────────────────── */
.mkt-block { display: flex; flex-direction: column; gap: 6px }
.mkt-title {
  font-size: 80px; font-weight: 900; line-height: 1; letter-spacing: 8px;
  color: #111111;
}
.mkt-sub {
  font-size: 26px; font-weight: 500; letter-spacing: 10px;
  color: rgba(17,17,17,0.45);
}

/* ── Stock list ──────────────────────────────────────── */
.stock-list { display: flex; flex-direction: column }

.stock-row {
  display: flex; align-items: center; gap: 0;
  padding: 22px 0;
  border-bottom: 1px solid rgba(17,17,17,0.10);
}
.stock-row.row-last { border-bottom: none }

/* Left: name + code */
.sr-left {
  display: flex; flex-direction: column; gap: 5px;
  flex: 0 0 230px;
}
.sr-name {
  font-size: 36px; font-weight: 700; letter-spacing: 1px; line-height: 1;
}
.sr-code {
  font-size: 18px; color: rgba(17,17,17,0.45); letter-spacing: 1px;
  font-family: "SF Mono","Menlo","Consolas",monospace;
}

/* Direction */
.sr-dir {
  flex: 0 0 180px;
  font-size: 26px; font-weight: 600; letter-spacing: 2px;
  display: flex; align-items: center; gap: 8px;
}
.hold-mark {
  width: 30px;
  height: 7px;
  border-radius: 7px;
  display: inline-block;
  flex: 0 0 auto;
}

/* Actual % */
.sr-pct {
  flex: 1;
  font-size: 32px; font-weight: 700; letter-spacing: -0.5px;
  font-family: "SF Mono","Menlo","Consolas",monospace;
}

/* Stamp wrapper – fixed width so rotation doesn't shift layout */
.sr-stamp-wrap {
  flex: 0 0 148px;
  display: flex; align-items: center; justify-content: center;
}
.sr-stamp {
  display: inline-flex; align-items: center; justify-content: center;
  border: 3.5px solid;
  border-radius: 6px;
  padding: 10px 20px;
  font-size: 30px; font-weight: 900; letter-spacing: 8px;
  transform: rotate(-8deg);
  white-space: nowrap;
}
.sr-stamp.stamp-hold {
  padding: 10px 16px;
  font-size: 25px;
  letter-spacing: 4px;
}
.stamp-hit  { color: #C23535; border-color: #C23535 }   /* 命中 = 红（涨色） */
.stamp-miss { color: #1A7A4A; border-color: #1A7A4A }   /* 未中 = 绿（跌色） */

/* ── Spacer ────────────────────────────────────────── */
.grow { flex: 1; min-height: 16px }

/* ── Win rate row ──────────────────────────────────── */
.wr-section {
  display: flex; align-items: baseline; justify-content: space-between;
  padding: 20px 0;
  border-bottom: 1px solid rgba(17,17,17,0.15);
  margin-bottom: 24px;
}
.wr-label {
  font-size: 20px; font-weight: 500; letter-spacing: 7px;
  color: rgba(17,17,17,0.50);
}
.wr-right {
  display: flex; align-items: baseline; gap: 2px;
}
.wr-num {
  font-size: 140px; font-weight: 900; line-height: 0.85;
  letter-spacing: -4px; color: #C4901E;
}
.wr-unit {
  font-size: 64px; font-weight: 800; color: #C4901E;
}

/* ── Footer ──────────────────────────────────────────── */
.footer {
  display: flex; justify-content: space-between; align-items: baseline;
}
.ft-left { display: flex; align-items: center; gap: 8px; font-size: 18px }
.brand-mark {
  width: 13px;
  height: 13px;
  background: #3D4FA8;
  border-radius: 2px;
  transform: rotate(45deg);
  display: inline-block;
  flex: 0 0 auto;
}
.ft-logo { margin-right: 1px }
.ft-name { font-weight: 700; letter-spacing: 3px }
.ft-sep  { opacity: 0.3 }
.ft-url  {
  color: #3D4FA8;
  font-family: "SF Mono","Menlo","Consolas",monospace;
  font-size: 16px; letter-spacing: 1px;
}
.ft-disc { font-size: 16px; letter-spacing: 2px; color: rgba(17,17,17,0.44) }
</style>
