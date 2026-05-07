<script setup lang="ts">
import type { CardPayload } from '~/server/utils/xbot-cards/types'
import { MOCK_PREDICTION, MOCK_RESULT, MOCK_SUMMARY_A, MOCK_SUMMARY_HK } from '~/server/utils/xbot-cards/mock'

import XBotCardPromise    from '~/components/xbot-cards/XBotCardPromise.vue'
import XBotCardProof      from '~/components/xbot-cards/XBotCardProof.vue'
import XBotCardDataRecord from '~/components/xbot-cards/XBotCardDataRecord.vue'
import XBotCardSummary    from '~/components/xbot-cards/XBotCardSummary.vue'

const SCALE = 0.42   // cards scale for on-screen review

// Pull brand_name from app settings and product_url from xbot settings
const { data: appConfig } = await useFetch('/api/config')
const { data: xbotSettings } = await useFetch('/api/admin/xbot/settings').catch(() => ({ data: ref(null) }))

const brandName  = computed(() => (appConfig.value as any)?.app_name ?? undefined)
const productUrl = computed(() => (xbotSettings.value as any)?.xbot_product_url || MOCK_PREDICTION.product_url)

const basePred   = computed(() => ({ ...MOCK_PREDICTION, brand_name: brandName.value, product_url: productUrl.value }))
const baseResult = computed(() => ({ ...MOCK_RESULT,     brand_name: brandName.value, product_url: productUrl.value }))

const predPayload   = (v: string): CardPayload => ({ ...basePred.value,   variant: v as any })
const resultPayload = (v: string): CardPayload => ({ ...baseResult.value, variant: v as any })

const resultMissPayload = (): CardPayload => ({
  ...baseResult.value,
  variant: 'proof' as any,
  is_correct: false,
  actual_change_pct: -2.4,
})

const summaryAPayload  = computed((): CardPayload => ({ ...MOCK_SUMMARY_A,  variant: 'summary', brand_name: brandName.value, product_url: productUrl.value }))
const summaryHKPayload = computed((): CardPayload => ({ ...MOCK_SUMMARY_HK, variant: 'summary', brand_name: brandName.value, product_url: productUrl.value }))

async function downloadPng(payload: CardPayload) {
  const res = await $fetch('/api/og/card', {
    method: 'POST',
    body: payload,
    responseType: 'blob',
  })
  const url = URL.createObjectURL(res as Blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `model-review-${payload.variant}-${payload.symbol}.png`
  a.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <div class="preview-root">
    <div class="top-bar">
      <div class="top-title">
        <span class="dot" />
        <span>模型复盘卡片工作台</span>
        <span class="sub">预测卡 · 结算卡 · 战绩卡 · 汇总卡</span>
      </div>
      <div class="top-actions">
        <span class="hint">Vue 预览用于校稿，PNG 按钮验证真实生成效果</span>
      </div>
    </div>

    <div class="preview-hero">
      <div>
        <span class="eyebrow">XBot Social Cards</span>
        <h1>保留卡片风格，检查每一种真实输出场景</h1>
        <p>当前页面只承载预览和校稿。卡片本体仍由现有组件和 Satori 渲染器输出，重点确认文字、比例和不同状态下的视觉一致性。</p>
      </div>
      <div class="hero-specs">
        <div><span>竖版</span><strong>1080 × 1350</strong></div>
        <div><span>方版</span><strong>1080 × 1080</strong></div>
        <div><span>品牌</span><strong>{{ brandName || '默认' }}</strong></div>
      </div>
    </div>

    <!-- Prediction Set -->
    <div class="section-header">
      <div class="section-label">预测分析卡</div>
      <div class="section-sub">THE PROMISE（主张）+ THE EDGE（底气）</div>
    </div>

    <div class="card-grid">
      <div class="card-slot hero-slot">
        <div class="slot-label">
          <span class="variant-name">promise</span>
          <span class="slot-dim">1080 × 1350</span>
          <button class="dl-btn" @click="downloadPng(predPayload('promise'))">↓ PNG</button>
        </div>
        <div class="card-frame" :style="{ width: 1080*SCALE+'px', height: 1350*SCALE+'px' }">
          <div class="card-scale-wrap" :style="{ transform: `scale(${SCALE})`, transformOrigin: 'top left', width:'1080px', height:'1350px' }">
            <XBotCardPromise :payload="predPayload('promise')" />
          </div>
        </div>
      </div>

      <div class="card-slot">
        <div class="slot-label">
          <span class="variant-name">data_record (Edge)</span>
          <span class="slot-dim">1080 × 1080</span>
          <button class="dl-btn" @click="downloadPng(predPayload('data_record'))">↓ PNG</button>
        </div>
        <div class="card-frame" :style="{ width: 1080*SCALE+'px', height: 1080*SCALE+'px' }">
          <div class="card-scale-wrap" :style="{ transform: `scale(${SCALE})`, transformOrigin: 'top left', width:'1080px', height:'1080px' }">
            <XBotCardDataRecord :payload="predPayload('data_record')" />
          </div>
        </div>
      </div>
    </div>

    <!-- Result Set (correct) -->
    <div class="section-header">
      <div class="section-label">结算复盘卡</div>
      <div class="section-sub">THE VERDICT（裁决）+ THE EDGE（更新战绩）</div>
    </div>

    <div class="card-grid">
      <div class="card-slot hero-slot">
        <div class="slot-label">
          <span class="variant-name">proof</span>
          <span class="slot-dim">1080 × 1350</span>
          <button class="dl-btn" @click="downloadPng(resultPayload('proof'))">↓ PNG</button>
        </div>
        <div class="card-frame" :style="{ width: 1080*SCALE+'px', height: 1350*SCALE+'px' }">
          <div class="card-scale-wrap" :style="{ transform: `scale(${SCALE})`, transformOrigin: 'top left', width:'1080px', height:'1350px' }">
            <XBotCardProof :payload="resultPayload('proof')" />
          </div>
        </div>
      </div>

      <div class="card-slot">
        <div class="slot-label">
          <span class="variant-name">data_record (Edge)</span>
          <span class="slot-dim">1080 × 1080</span>
          <button class="dl-btn" @click="downloadPng(resultPayload('data_record'))">↓ PNG</button>
        </div>
        <div class="card-frame" :style="{ width: 1080*SCALE+'px', height: 1080*SCALE+'px' }">
          <div class="card-scale-wrap" :style="{ transform: `scale(${SCALE})`, transformOrigin: 'top left', width:'1080px', height:'1080px' }">
            <XBotCardDataRecord :payload="resultPayload('data_record')" />
          </div>
        </div>
      </div>
    </div>

    <!-- Miss case (credibility test) -->
    <div class="section-header">
      <div class="section-label">未中场景</div>
      <div class="section-sub">Proof card · missed case</div>
    </div>

    <div class="card-grid">
      <div class="card-slot hero-slot">
        <div class="slot-label">
          <span class="variant-name">proof · missed</span>
          <span class="slot-dim">1080 × 1350</span>
          <button class="dl-btn" @click="downloadPng(resultMissPayload())">↓ PNG</button>
        </div>
        <div class="card-frame" :style="{ width: 1080*SCALE+'px', height: 1350*SCALE+'px' }">
          <div class="card-scale-wrap" :style="{ transform: `scale(${SCALE})`, transformOrigin: 'top left', width:'1080px', height:'1350px' }">
            <XBotCardProof :payload="resultMissPayload()" />
          </div>
        </div>
      </div>
    </div>

    <!-- Summary Set -->
    <div class="section-header">
      <div class="section-label">市场汇总兑现图</div>
      <div class="section-sub">Summary settlement card · A股 / 港股</div>
    </div>

    <div class="card-grid">
      <div class="card-slot hero-slot">
        <div class="slot-label">
          <span class="variant-name">summary · A股</span>
          <span class="slot-dim">1080 × 1350</span>
          <button class="dl-btn" @click="downloadPng(summaryAPayload)">↓ PNG</button>
        </div>
        <div class="card-frame" :style="{ width: 1080*SCALE+'px', height: 1350*SCALE+'px' }">
          <div class="card-scale-wrap" :style="{ transform: `scale(${SCALE})`, transformOrigin: 'top left', width:'1080px', height:'1350px' }">
            <XBotCardSummary :payload="summaryAPayload" />
          </div>
        </div>
      </div>

      <div class="card-slot hero-slot">
        <div class="slot-label">
          <span class="variant-name">summary · 港股</span>
          <span class="slot-dim">1080 × 1350</span>
          <button class="dl-btn" @click="downloadPng(summaryHKPayload)">↓ PNG</button>
        </div>
        <div class="card-frame" :style="{ width: 1080*SCALE+'px', height: 1350*SCALE+'px' }">
          <div class="card-scale-wrap" :style="{ transform: `scale(${SCALE})`, transformOrigin: 'top left', width:'1080px', height:'1350px' }">
            <XBotCardSummary :payload="summaryHKPayload" />
          </div>
        </div>
      </div>
    </div>

    <div class="bottom-note">
      PNG 按钮调用 <code>POST /api/og/card</code> 进行 Satori 渲染。Docker 镜像会准备 Noto Sans SC 字体，运行时仍保留 CDN 兜底。
    </div>
  </div>
</template>

<style scoped>
.preview-root {
  min-height: 100vh;
  background:
    linear-gradient(180deg, rgba(37,99,235,0.12), transparent 360px),
    #060a14;
  padding: 32px 40px 80px;
  font-family: "PingFang SC", "Helvetica Neue", "Microsoft YaHei", sans-serif;
  color: #e2e8f0;
}

.top-bar {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 18px; padding-bottom: 18px;
  border-bottom: 1px solid rgba(255,255,255,0.08);
}
.top-title {
  display: flex; align-items: center; gap: 10px;
  font-size: 20px; font-weight: 700; color: #818cf8;
}
.top-title .dot { width: 8px; height: 8px; border-radius: 50%; background: #818cf8 }
.sub { font-size: 14px; font-weight: 400; color: #64748b }
.hint { font-size: 13px; color: #475569 }
.hint code { color: #94a3b8; font-size: 12px }

.preview-hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(280px, 420px);
  gap: 24px;
  align-items: end;
  margin: 28px 0 36px;
}
.eyebrow { color: #93c5fd; font-size: 12px; font-weight: 900; letter-spacing: 0; }
.preview-hero h1 {
  margin: 8px 0 10px;
  color: #f8fafc;
  font-size: clamp(30px, 4vw, 46px);
  line-height: 1.08;
  letter-spacing: 0;
}
.preview-hero p {
  max-width: 760px;
  margin: 0;
  color: #94a3b8;
  line-height: 1.8;
}
.hero-specs {
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
}
.hero-specs div {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 8px;
  background: rgba(15,23,42,0.72);
}
.hero-specs span { color: #64748b; font-size: 12px; }
.hero-specs strong { color: #e2e8f0; font-size: 13px; }

.section-header { margin: 40px 0 18px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.06); }
.section-label { font-size: 18px; font-weight: 700; color: #e2e8f0; margin-bottom: 4px }
.section-sub   { font-size: 13px; color: #64748b }

.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(360px, max-content));
  gap: 28px;
  align-items: flex-start;
}

.card-slot {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 8px;
  background: rgba(15,23,42,0.5);
}

.slot-label {
  display: flex; align-items: center; gap: 10px; min-height: 28px;
  font-size: 13px;
}
.variant-name { font-weight: 700; color: #818cf8; font-family: monospace }
.slot-dim { color: #64748b }
.dl-btn {
  margin-left: auto;
  padding: 4px 10px; border-radius: 6px; border: 1px solid rgba(129,140,248,0.3);
  background: rgba(129,140,248,0.1); color: #818cf8; font-size: 12px;
  cursor: pointer; transition: background 0.15s;
}
.dl-btn:hover { background: rgba(129,140,248,0.2) }

.card-frame { overflow: hidden; border-radius: 8px; border: 1px solid rgba(255,255,255,0.08); box-shadow: 0 24px 64px rgba(0,0,0,.34); }
.card-scale-wrap { overflow: hidden }

.bottom-note {
  margin-top: 60px; padding: 20px 24px; border-radius: 12px;
  background: rgba(129,140,248,0.08); border: 1px solid rgba(129,140,248,0.15);
  font-size: 13px; color: #94a3b8; line-height: 1.8;
}
.bottom-note code { color: #818cf8 }
@media (max-width: 760px) {
  .preview-root { padding: 22px 14px 56px; }
  .top-bar, .preview-hero { grid-template-columns: 1fr; flex-direction: column; align-items: flex-start; }
  .top-title { flex-wrap: wrap; }
  .preview-hero { display: grid; gap: 18px; }
  .card-grid { display: flex; gap: 18px; overflow-x: auto; padding-bottom: 8px; }
  .card-slot { flex: 0 0 auto; }
}
</style>
