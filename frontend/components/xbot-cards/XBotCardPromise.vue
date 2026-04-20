<script setup lang="ts">
import type { CardPayload } from '~/server/utils/xbot-cards/types'
import {
  BRAND, prettyDomain, marketMeta, CL,
  dirLabel, dirArrow, dirColor, dirStopColor,
  fmtPrice, fmtPct, predictionReportId, parsePct, pctColor,
} from '~/server/utils/xbot-cards/_helpers'

const props = defineProps<{ payload: CardPayload }>()

const mkt       = computed(() => marketMeta(props.payload.market))
const dir       = computed(() => (props.payload.direction ?? props.payload.predicted_direction) as any)
const isLight   = computed(() => dir.value === 'up')
// 信号色（中国惯例：涨=红，跌=绿，观望=琥珀）
const sigColor  = computed(() => isLight.value ? CL.UP : dirColor(dir.value))
// 止损色 = 信号反方向
const stopColor = computed(() => dirStopColor(dir.value, isLight.value))
// 胜率色 = 金色
const wrColor   = computed(() => pctColor(pct30.value))
// 卡片主题类
const themeClass = computed(() => {
  if (dir.value === 'up')   return 'theme-up'
  if (dir.value === 'down') return 'theme-down'
  return 'theme-hold'
})
const reportId  = computed(() => predictionReportId(props.payload))
const domain    = computed(() => prettyDomain(props.payload.product_url))
const brandName = computed(() => props.payload.brand_name ?? BRAND.name)
const pct30     = computed(() => parsePct(props.payload.accuracy_30d))

const upside = computed(() => {
  const { close_price: c, target_price: t } = props.payload
  if (c == null || t == null || c === 0) return null
  return ((t - c) / c) * 100
})
const downside = computed(() => {
  const { close_price: c, stop_loss: s } = props.payload
  if (c == null || s == null || c === 0) return null
  return ((s - c) / c) * 100
})
</script>

<template>
  <div class="card" :class="themeClass">

    <!-- 单行报头 -->
    <div class="header">
      <span class="hdr-id">{{ reportId }}</span>
      <div class="hdr-date-badge">{{ payload.prediction_date }}</div>
    </div>
    <div class="rule" />

    <!-- 股票名 ↔ 胜率 -->
    <div class="ticker-row">
      <div class="tk-left">
        <div class="tk-name">{{ payload.symbol_name }}</div>
        <div class="tk-meta">
          {{ payload.symbol }}.{{ mkt.code }}
          <span class="dot">·</span>{{ mkt.cn }}
          <template v-if="payload.hot_rank">
            <span class="dot">·</span>
            <span class="tk-hot">热门 #{{ payload.hot_rank }}</span>
          </template>
        </div>
      </div>
      <div class="tk-right" v-if="pct30 != null">
        <div class="wr-label">累计胜率</div>
        <div class="wr-val" :style="{ color: wrColor }">{{ pct30 }}<span class="wr-unit">%</span></div>
      </div>
    </div>

    <!-- 信号主体 -->
    <div class="signal-block">
      <div class="sig-word" :style="{ color: sigColor }">
        {{ dirLabel(dir) }}<span class="sig-arrow" :style="{ color: sigColor }">{{ dirArrow(dir) }}</span>
      </div>
    </div>

    <!-- 置信度 -->
    <div class="conf-block" v-if="payload.confidence != null">
      <div class="conf-row">
        <span class="conf-label">置信度</span>
        <span class="conf-val" :style="{ color: sigColor }">{{ payload.confidence }}%</span>
      </div>
      <div class="conf-track">
        <div class="conf-fill" :style="{ width: payload.confidence + '%', background: sigColor }" />
      </div>
    </div>

    <!-- 价格双行 -->
    <div class="prices">
      <div class="lv-row">
        <span class="lv-lbl">目标价</span>
        <span class="lv-val" :style="{ color: sigColor }">{{ fmtPrice(payload.target_price) }}</span>
        <span class="lv-pct" :style="{ color: sigColor }" v-if="upside != null">{{ fmtPct(upside) }}</span>
      </div>
      <div class="lv-row lv-stop">
        <span class="lv-lbl">止损价</span>
        <span class="lv-val" :style="{ color: stopColor }">{{ fmtPrice(payload.stop_loss) }}</span>
        <span class="lv-pct" :style="{ color: stopColor }" v-if="downside != null">{{ fmtPct(downside) }}</span>
      </div>
    </div>

    <!-- LLM 一行结论 -->
    <div class="summary-line" v-if="payload.summary">
      「{{ payload.summary.slice(0, 28) }}{{ payload.summary.length > 28 ? '…' : '' }}」
    </div>

    <div class="grow" />

    <!-- Footer -->
    <div class="footer">
      <div class="ft-left">
        <span class="ft-logo">⬢</span>
        <span class="ft-name">{{ brandName }}</span>
        <span class="ft-sep">·</span>
        <span class="ft-url">{{ domain }}</span>
      </div>
      <div class="ft-disc">仅供研究参考，不构成投资建议</div>
    </div>
  </div>
</template>

<style scoped>
/* ── 基础 & 主题变量 ──────────────────────────── */
.card {
  width: 1080px; height: 1350px;
  display: flex; flex-direction: column;
  padding: 52px 64px;
  box-sizing: border-box;
  font-family: "PingFang SC","Helvetica Neue","Microsoft YaHei",sans-serif;
  position: relative; overflow: hidden;
}
.card::after {
  content: '';
  position: absolute; inset: 0;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)'/%3E%3C/svg%3E");
  opacity: 0.12; mix-blend-mode: overlay; pointer-events: none;
}
/* 多头：奶油亮色 + 红色渐变顶 */
.theme-up {
  background: linear-gradient(180deg, rgba(194,53,53,0.08) 0%, transparent 38%), #F0EDE6;
  --text: #111111;
  --dim:  rgba(17,17,17,0.62);
  --dimmer: rgba(17,17,17,0.44);
  --border: rgba(17,17,17,0.18);
  --gold: #7A5C18;
  --brand: #3D4FA8;
}
/* 空头：深黑 + 绿色渐变顶 */
.theme-down {
  background: linear-gradient(180deg, rgba(43,200,132,0.09) 0%, transparent 38%), #0A0E17;
  --text: #F0F4FF;
  --dim:  rgba(240,244,255,0.45);
  --dimmer: rgba(240,244,255,0.28);
  --border: rgba(240,244,255,0.08);
  --gold: #B8922A;
  --brand: #6B7FD4;
}
/* 观望：深灰 + 琥珀渐变顶 */
.theme-hold {
  background: linear-gradient(180deg, rgba(212,168,73,0.08) 0%, transparent 38%), #0C1018;
  --text: #F0F4FF;
  --dim:  rgba(240,244,255,0.45);
  --dimmer: rgba(240,244,255,0.28);
  --border: rgba(240,244,255,0.08);
  --gold: #B8922A;
  --brand: #6B7FD4;
}
/* ── 报头 ──────────────────────────────────────── */
.header {
  display: flex; align-items: center; justify-content: space-between;
  font-family: "SF Mono","Menlo","Consolas",monospace;
  font-size: 18px; color: var(--dim);
  letter-spacing: 1px;
  margin-bottom: 16px;
}
.hdr-id { letter-spacing: 1px }
.hdr-date-badge {
  font-size: 17px; letter-spacing: 0.5px;
  border: 1.5px solid var(--border);
  border-radius: 999px;
  padding: 5px 18px;
  color: var(--dim);
}
.rule { height: 1px; background: var(--border); margin-bottom: 44px }

/* ── Ticker ↔ 胜率 ─────────────────────────────── */
.ticker-row {
  display: flex; justify-content: space-between; align-items: flex-end;
  margin-bottom: 52px;
}
.tk-left { display: flex; flex-direction: column; gap: 8px }
.tk-name {
  font-size: 68px; font-weight: 800; line-height: 1;
  letter-spacing: 1px; color: var(--text);
}
.tk-meta {
  font-size: 22px; color: var(--dim);
  font-family: "SF Mono","Menlo","Consolas",monospace;
  letter-spacing: 1px;
}
.dot { margin: 0 6px; opacity: 0.4 }
.tk-hot { color: var(--gold); font-weight: 600 }

.tk-right { display: flex; flex-direction: column; align-items: flex-end; gap: 2px }
.wr-label {
  font-size: 17px; letter-spacing: 5px; color: var(--dim);
  font-weight: 500;
}
.wr-val {
  font-size: 80px; font-weight: 800; line-height: 1;
  letter-spacing: -2px;
}
.wr-unit { font-size: 38px; font-weight: 700; letter-spacing: 0 }

/* ── 信号主体 ───────────────────────────────────── */
.signal-block { margin-bottom: 24px }
.sig-word {
  font-size: 136px; font-weight: 900; line-height: 1;
  letter-spacing: -3px;
  display: flex; align-items: center; gap: 20px;
}
.sig-arrow { font-size: 72px; font-weight: 900; opacity: 0.88 }

/* ── 置信度 ─────────────────────────────────────── */
.conf-block { margin-bottom: 52px }
.conf-row {
  display: flex; justify-content: space-between; align-items: baseline;
  margin-bottom: 10px;
}
.conf-label { font-size: 17px; letter-spacing: 4px; color: var(--dim) }
.conf-val   { font-size: 17px; font-weight: 700; letter-spacing: 1px }
.conf-track {
  height: 6px; background: var(--border); border-radius: 3px; overflow: hidden;
}
.conf-fill { height: 100%; border-radius: 3px }

/* ── 价格 ──────────────────────────────────────── */
.prices { display: flex; flex-direction: column }
.lv-row {
  display: flex; align-items: baseline; gap: 0;
  padding: 18px 0;
  border-bottom: 1px solid var(--border);
}
.lv-stop { border-bottom: none }
.lv-lbl {
  font-size: 20px; letter-spacing: 4px; color: var(--dim);
  font-weight: 600; width: 160px;
}
.lv-val {
  font-size: 56px; font-weight: 700; letter-spacing: -1px; flex: 1;
  font-family: "SF Mono","Menlo","Consolas",monospace;
}
.lv-pct {
  font-size: 26px; font-weight: 600; letter-spacing: 0;
  font-family: "SF Mono","Menlo","Consolas",monospace;
}

.summary-line {
  margin-top: 28px;
  font-size: 22px;
  font-style: italic;
  color: var(--dim);
  letter-spacing: 0.5px;
  line-height: 1;
}

.grow { flex: 1; min-height: 24px }

/* ── Footer ─────────────────────────────────────── */
.footer {
  display: flex; justify-content: space-between; align-items: baseline;
  border-top: 1px solid var(--border); padding-top: 18px;
}
.ft-left { display: flex; align-items: center; gap: 8px; font-size: 18px; color: var(--dim) }
.ft-logo { color: var(--brand); font-size: 16px }
.ft-name { font-weight: 700; letter-spacing: 3px; color: var(--text) }
.ft-sep  { opacity: 0.3 }
.ft-url  {
  color: var(--brand);
  font-family: "SF Mono","Menlo","Consolas",monospace;
  font-size: 16px; letter-spacing: 1px;
}
.ft-disc { font-size: 16px; letter-spacing: 2px; color: var(--dimmer) }
</style>
