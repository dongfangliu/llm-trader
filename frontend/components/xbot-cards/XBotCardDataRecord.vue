<script setup lang="ts">
import type { CardPayload } from '~/server/utils/xbot-cards/types'
import { BRAND, prettyDomain, parsePct, pctColor } from '~/server/utils/xbot-cards/_helpers'

const props = defineProps<{ payload: CardPayload }>()

const domain    = computed(() => prettyDomain(props.payload.product_url))
const brandName = computed(() => props.payload.brand_name ?? BRAND.name)
const pct30     = computed(() => parsePct(props.payload.accuracy_all))
const wrColor   = computed(() => pctColor(pct30.value))

const parse = (s?: string) => {
  if (!s) return null
  const [a, b] = s.split('/').map(Number)
  return (!isNaN(a) && !isNaN(b) && b > 0) ? { hit: a, total: b } : null
}
const stats30 = computed(() => parse(props.payload.accuracy_all))
const dots    = computed(() => {
  if (!stats30.value) return []
  const { hit, total } = stats30.value
  return Array.from({ length: Math.min(total, 12) }, (_, i) => i < hit)
})
</script>

<template>
  <div class="card">

    <!-- 顶部品牌行（战绩卡唯一允许顶部品牌） -->
    <div class="top-bar">
      <div class="tb-left">
        <span class="tb-logo">⬢</span>
        <span class="tb-name">{{ brandName }}</span>
        <span class="tb-sep">·</span>
        <span class="tb-kind">战绩报告</span>
      </div>
      <div class="tb-date-badge">截至 {{ payload.prediction_date }}</div>
    </div>
    <div class="rule" />

    <!-- 胜率英雄区 -->
    <div class="hero-wrap">
      <div class="wr-label">累计胜率</div>
      <div class="wr-num" :style="{ color: wrColor }">
        {{ pct30 != null ? pct30 + '%' : '—' }}
      </div>
      <div class="wr-count" v-if="stats30">
        {{ stats30.hit }}胜 / {{ stats30.total }}场
      </div>
    </div>

    <!-- 近期信号 -->
    <div class="signals" v-if="dots.length">
      <div class="sig-label">近期信号</div>
      <div class="sig-dots">
        <div
          v-for="(hit, i) in dots" :key="i"
          class="dot"
          :class="hit ? 'hit' : 'miss'"
          :style="hit ? { background: wrColor } : {}"
        />
      </div>
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
.card {
  width: 1080px; height: 1080px;
  display: flex; flex-direction: column;
  padding: 52px 64px 48px;
  background: linear-gradient(160deg, rgba(138,104,32,0.09) 0%, transparent 40%), #F0EDE6;
  font-family: "PingFang SC","Helvetica Neue","Microsoft YaHei",sans-serif;
  box-sizing: border-box;
  color: #111111;
  position: relative; overflow: hidden;
}
.card::after {
  content: '';
  position: absolute; inset: 0;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)'/%3E%3C/svg%3E");
  opacity: 0.12; mix-blend-mode: overlay; pointer-events: none;
}

/* 顶部品牌 */
.top-bar {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 16px;
}
.tb-left { display: flex; align-items: center; gap: 10px }
.tb-logo { color: #3D4FA8; font-size: 20px }
.tb-name { font-size: 22px; font-weight: 700; letter-spacing: 3px }
.tb-sep  { color: rgba(17,17,17,0.30) }
.tb-kind { font-size: 20px; letter-spacing: 3px; color: rgba(17,17,17,0.62) }
.tb-date-badge {
  font-size: 17px; letter-spacing: 0.5px;
  border: 1.5px solid rgba(17,17,17,0.22);
  border-radius: 999px;
  padding: 5px 18px;
  color: rgba(17,17,17,0.62);
  font-family: "SF Mono","Menlo","Consolas",monospace;
}
.rule { height: 1px; background: rgba(17,17,17,0.18); margin-bottom: 0 }

/* 胜率英雄 */
.hero-wrap {
  flex: 1; display: flex; flex-direction: column;
  justify-content: center; align-items: center; gap: 4px;
}
.wr-label {
  font-size: 20px; letter-spacing: 8px; color: rgba(17,17,17,0.58);
  font-weight: 500; margin-bottom: 4px;
}
.wr-num {
  font-size: 240px; font-weight: 900; line-height: 0.88;
  letter-spacing: -8px;
}
.wr-count {
  font-size: 22px; color: rgba(17,17,17,0.48); letter-spacing: 2px;
  font-family: "SF Mono","Menlo","Consolas",monospace;
  margin-top: 12px;
}

/* 近期信号 */
.signals { padding: 28px 0 0 }
.sig-label {
  font-size: 18px; letter-spacing: 4px; color: rgba(17,17,17,0.55);
  font-weight: 500; margin-bottom: 16px; text-align: center;
}
.sig-dots {
  display: flex; gap: 14px; justify-content: center; flex-wrap: wrap;
}
.dot {
  width: 44px; height: 44px; border-radius: 50%;
}
.dot.miss {
  background: transparent;
  border: 2px solid rgba(17,17,17,0.28);
}

.grow { min-height: 24px }

/* Footer */
.footer {
  display: flex; justify-content: space-between; align-items: baseline;
  border-top: 1px solid rgba(17,17,17,0.18); padding-top: 18px;
}
.ft-left { display: flex; align-items: center; gap: 8px; font-size: 18px }
.ft-logo { color: #3D4FA8; font-size: 16px }
.ft-name { font-weight: 700; letter-spacing: 3px }
.ft-sep  { opacity: 0.3 }
.ft-url  {
  color: #3D4FA8;
  font-family: "SF Mono","Menlo","Consolas",monospace;
  font-size: 16px; letter-spacing: 1px;
}
.ft-disc { font-size: 16px; letter-spacing: 2px; color: rgba(17,17,17,0.44) }
</style>
