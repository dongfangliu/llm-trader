<script setup lang="ts">
import type { CardPayload } from '~/server/utils/xbot-cards/types'
import {
  BRAND, prettyDomain, marketMeta,
  dirShort, dirColor, dirArrow,
  fmtPct, resultReportId, parsePct, pctColor,
} from '~/server/utils/xbot-cards/_helpers'

const props = defineProps<{ payload: CardPayload }>()

const mkt       = computed(() => marketMeta(props.payload.market))
const dir       = computed(() => (props.payload.predicted_direction ?? props.payload.direction) as any)
const correct   = computed(() => props.payload.is_correct ?? false)
const verdictCn = computed(() => correct.value ? '兑  现' : '失  效')
const verdictGlyph = computed(() => correct.value ? '✓' : '✗')
const verdictColor = computed(() => {
  const d = dir.value
  // correct → actual matches prediction direction; wrong → opposite direction
  if (d === 'up')   return correct.value ? '#C23535' : '#1A7A4A'
  if (d === 'down') return correct.value ? '#1A7A4A' : '#C23535'
  return correct.value ? '#1A7A4A' : '#C23535'
})
const reportId  = computed(() => resultReportId(props.payload))
const domain    = computed(() => prettyDomain(props.payload.product_url))
const brandName = computed(() => props.payload.brand_name ?? BRAND.name)
const pct30     = computed(() => parsePct(props.payload.accuracy_all))
const wrColor   = computed(() => pctColor(pct30.value))
</script>

<template>
  <div class="card" :class="correct ? 'verdict-correct' : 'verdict-wrong'">

    <!-- 单行报头 -->
    <div class="header">
      <span class="hdr-id">{{ reportId }}</span>
      <div class="hdr-date-badge">{{ payload.target_date ?? payload.prediction_date }}</div>
    </div>
    <div class="rule" />

    <!-- 股票 -->
    <div class="ticker">
      <span class="tk-name">{{ payload.symbol_name }}</span>
      <span class="tk-code">{{ payload.symbol }}.{{ mkt.code }}</span>
      <span class="tk-dot">·</span>
      <span class="tk-mkt">{{ mkt.cn }}</span>
    </div>

    <!-- 三栏：预测 | 实际 | 胜率 -->
    <div class="three-col">
      <!-- 预测 -->
      <div class="col">
        <div class="col-hd">预  测</div>
        <div class="col-main" :style="{ color: dirColor(dir) }">
          <span>{{ dirShort(dir) }}</span>
          <span v-if="dir === 'hold'" class="hold-mark" :style="{ background: dirColor(dir) }" />
          <span v-else>{{ dirArrow(dir) }}</span>
        </div>
        <div class="col-sub" v-if="payload.confidence != null">置信 {{ payload.confidence }}%</div>
      </div>

      <div class="col-divider" />

      <!-- 实际 -->
      <div class="col">
        <div class="col-hd">实  际</div>
        <div class="col-main" :style="{ color: verdictColor }">
          {{ fmtPct(payload.actual_change_pct) }}
        </div>
      </div>

      <div class="col-divider" />

      <!-- 累计胜率 -->
      <div class="col">
        <div class="col-hd">累计胜率</div>
        <div class="col-main" :style="{ color: wrColor }">
          {{ pct30 != null ? pct30 + '%' : '—' }}
        </div>
      </div>
    </div>

    <!-- 印章 -->
    <div class="stamp-wrap">
      <div class="stamp" :style="{ borderColor: verdictColor, color: verdictColor }">
        {{ verdictCn }}&nbsp;&nbsp;{{ verdictGlyph }}
      </div>
    </div>

    <div class="grow" />

    <!-- Footer -->
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
.card {
  width: 1080px; height: 1350px;
  display: flex; flex-direction: column;
  padding: 52px 64px;
  font-family: "PingFang SC","Helvetica Neue","Microsoft YaHei",sans-serif;
  box-sizing: border-box;
  position: relative; overflow: hidden;
}
.card::after {
  content: '';
  position: absolute; inset: 0;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)'/%3E%3C/svg%3E");
  opacity: 0.12; mix-blend-mode: overlay; pointer-events: none;
}
.card.verdict-correct {
  background: linear-gradient(160deg, rgba(26,122,74,0.06) 0%, transparent 45%), #F5F2EC;
  color: #111111;
  --dim: rgba(17,17,17,0.42);
  --dimmer: rgba(17,17,17,0.25);
  --border: rgba(17,17,17,0.10);
  --gold: #8A6820;
  --brand: #3D4FA8;
}
.card.verdict-wrong {
  background: linear-gradient(160deg, rgba(194,53,53,0.06) 0%, transparent 45%), #F5F2EC;
  color: #111111;
  --dim: rgba(17,17,17,0.42);
  --dimmer: rgba(17,17,17,0.25);
  --border: rgba(17,17,17,0.10);
  --gold: #8A6820;
  --brand: #3D4FA8;
}

/* 报头 */
.header {
  display: flex; align-items: center; justify-content: space-between;
  font-family: "SF Mono","Menlo","Consolas",monospace;
  font-size: 18px; color: var(--dim);
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

/* 股票 */
.ticker {
  display: flex; align-items: baseline; gap: 12px;
  margin-bottom: 52px;
}
.tk-name { font-size: 64px; font-weight: 800; line-height: 1; letter-spacing: 1px }
.tk-code {
  font-size: 26px; font-weight: 500; color: var(--dim);
  font-family: "SF Mono","Menlo","Consolas",monospace;
}
.tk-dot  { color: var(--dimmer); font-size: 18px }
.tk-mkt  { font-size: 22px; color: var(--dim) }

/* 三栏 */
.three-col {
  display: flex; align-items: stretch;
  margin-bottom: 64px;
  padding: 28px 0;
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
}
.col {
  flex: 1; display: flex; flex-direction: column; gap: 10px;
  padding: 0 8px;
}
.col:first-child { padding-left: 0 }
.col:last-child  { padding-right: 0 }
.col-divider {
  width: 1px; background: var(--border);
  margin: 4px 24px;
}
.col-hd {
  font-size: 18px; letter-spacing: 5px; color: var(--dim);
  font-weight: 600; margin-bottom: 6px;
}
.col-main {
  font-size: 52px; font-weight: 800; line-height: 1; letter-spacing: -1px;
  display: flex; align-items: center; gap: 12px;
}
.col-sub {
  font-size: 20px; color: var(--dim); letter-spacing: 2px;
}

/* 印章 */
.stamp-wrap {
  display: flex; justify-content: center; align-items: center;
  flex: 1;
}
.stamp {
  display: inline-flex; align-items: center; justify-content: center;
  border: 3px solid;
  border-radius: 10px;
  padding: 22px 80px;
  font-size: 88px; font-weight: 900;
  letter-spacing: 12px;
  transform: rotate(-7deg);
  line-height: 1;
  box-shadow: 0 0 0 1px currentColor;
}

.grow { min-height: 24px }

/* Footer */
.footer {
  display: flex; justify-content: space-between; align-items: baseline;
  border-top: 1px solid var(--border); padding-top: 18px;
}
.ft-left { display: flex; align-items: center; gap: 8px; font-size: 18px }
.hold-mark {
  width: 34px;
  height: 7px;
  border-radius: 7px;
  display: inline-block;
  flex: 0 0 auto;
}
.brand-mark {
  width: 13px;
  height: 13px;
  background: var(--brand);
  border-radius: 2px;
  transform: rotate(45deg);
  display: inline-block;
  flex: 0 0 auto;
}
.ft-logo { margin-right: 1px }
.ft-name { font-weight: 700; letter-spacing: 3px }
.ft-sep  { opacity: 0.3 }
.ft-url  {
  color: var(--brand);
  font-family: "SF Mono","Menlo","Consolas",monospace;
  font-size: 16px; letter-spacing: 1px;
}
.ft-disc { font-size: 16px; letter-spacing: 2px; color: var(--dimmer) }
</style>
