<script setup lang="ts">
import { PhArrowLeft, PhCards, PhDownloadSimple, PhImageSquare, PhStack } from '@phosphor-icons/vue'
import type { CardPayload } from '~/server/utils/xbot-cards/types'
import { MOCK_PREDICTION, MOCK_RESULT, MOCK_SUMMARY_A, MOCK_SUMMARY_HK } from '~/server/utils/xbot-cards/mock'
import api from '~/lib/api'

import XBotCardPromise from '~/components/xbot-cards/XBotCardPromise.vue'
import XBotCardProof from '~/components/xbot-cards/XBotCardProof.vue'
import XBotCardDataRecord from '~/components/xbot-cards/XBotCardDataRecord.vue'
import XBotCardSummary from '~/components/xbot-cards/XBotCardSummary.vue'

const SCALE = 0.42

const { data: appConfig } = await useFetch('/api/config')
const xbotSettings = ref<Record<string, any> | null>(null)

onMounted(async () => {
  const token = localStorage.getItem('admin_token') || ''
  if (!token) return
  const res = await api.get('/api/admin/xbot/settings', { headers: { 'X-Admin-Token': token } }).catch(() => null)
  xbotSettings.value = res?.data || null
})

const brandName = computed(() => (appConfig.value as any)?.app_name ?? undefined)
const productUrl = computed(() => (xbotSettings.value as any)?.xbot_product_url || MOCK_PREDICTION.product_url)

const basePred = computed(() => ({ ...MOCK_PREDICTION, brand_name: brandName.value, product_url: productUrl.value }))
const baseResult = computed(() => ({ ...MOCK_RESULT, brand_name: brandName.value, product_url: productUrl.value }))

const predPayload = (v: string): CardPayload => ({ ...basePred.value, variant: v as any })
const resultPayload = (v: string): CardPayload => ({ ...baseResult.value, variant: v as any })

const resultMissPayload = (): CardPayload => ({
  ...baseResult.value,
  variant: 'proof' as any,
  is_correct: false,
  actual_change_pct: -2.4,
})

const summaryAPayload = computed((): CardPayload => ({ ...MOCK_SUMMARY_A, variant: 'summary', brand_name: brandName.value, product_url: productUrl.value }))
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
  <main class="mr-card-preview-page">
    <div class="mr-card-preview-shell">
      <header class="mr-dark-topbar">
        <div class="mr-dark-title">
          <PhCards :size="20" weight="bold" />
          <span>模型复盘卡片工作台</span>
        </div>
        <div class="mr-topbar-actions">
          <NuxtLink class="mr-btn mr-btn-ghost mr-btn-small" to="/admin/model-review">
            <PhArrowLeft :size="16" weight="bold" />
            返回工作流
          </NuxtLink>
        </div>
      </header>

      <section class="mr-card-preview-hero">
        <div>
          <div class="mr-kicker">
            <PhImageSquare :size="16" weight="bold" />
            社交卡片预览
          </div>
          <h1>保留卡片本体，校验每一种真实输出场景</h1>
          <p>
            页面只负责外层预览、分组和 PNG 下载。卡片样式仍由现有 Vue 组件和 Satori 渲染器输出，避免影响线上社交资产。
          </p>
        </div>
        <div class="mr-spec-stack">
          <div><span>竖版</span><strong>1080 x 1350</strong></div>
          <div><span>方版</span><strong>1080 x 1080</strong></div>
          <div><span>品牌</span><strong>{{ brandName || '默认' }}</strong></div>
        </div>
      </section>

      <section>
        <div class="mr-card-section-header">
          <div>
            <h2>预测分析卡</h2>
            <p class="mr-dark-muted">主张卡与依据卡</p>
          </div>
          <PhStack :size="20" weight="bold" />
        </div>

        <div class="mr-card-grid">
          <div class="mr-card-slot">
            <div class="mr-slot-label">
              <span class="mr-slot-name">promise</span>
              <span class="mr-slot-dim">1080 x 1350</span>
              <button class="mr-btn mr-btn-secondary mr-btn-small" @click="downloadPng(predPayload('promise'))">
                <PhDownloadSimple :size="15" weight="bold" />
                PNG
              </button>
            </div>
            <div class="mr-card-frame" :style="{ width: 1080*SCALE+'px', height: 1350*SCALE+'px' }">
              <div :style="{ transform: `scale(${SCALE})`, transformOrigin: 'top left', width:'1080px', height:'1350px' }">
                <XBotCardPromise :payload="predPayload('promise')" />
              </div>
            </div>
          </div>

          <div class="mr-card-slot">
            <div class="mr-slot-label">
              <span class="mr-slot-name">data_record</span>
              <span class="mr-slot-dim">1080 x 1080</span>
              <button class="mr-btn mr-btn-secondary mr-btn-small" @click="downloadPng(predPayload('data_record'))">
                <PhDownloadSimple :size="15" weight="bold" />
                PNG
              </button>
            </div>
            <div class="mr-card-frame" :style="{ width: 1080*SCALE+'px', height: 1080*SCALE+'px' }">
              <div :style="{ transform: `scale(${SCALE})`, transformOrigin: 'top left', width:'1080px', height:'1080px' }">
                <XBotCardDataRecord :payload="predPayload('data_record')" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div class="mr-card-section-header">
          <div>
            <h2>结算复盘卡</h2>
            <p class="mr-dark-muted">命中场景的裁决卡与战绩卡</p>
          </div>
          <PhStack :size="20" weight="bold" />
        </div>

        <div class="mr-card-grid">
          <div class="mr-card-slot">
            <div class="mr-slot-label">
              <span class="mr-slot-name">proof</span>
              <span class="mr-slot-dim">1080 x 1350</span>
              <button class="mr-btn mr-btn-secondary mr-btn-small" @click="downloadPng(resultPayload('proof'))">
                <PhDownloadSimple :size="15" weight="bold" />
                PNG
              </button>
            </div>
            <div class="mr-card-frame" :style="{ width: 1080*SCALE+'px', height: 1350*SCALE+'px' }">
              <div :style="{ transform: `scale(${SCALE})`, transformOrigin: 'top left', width:'1080px', height:'1350px' }">
                <XBotCardProof :payload="resultPayload('proof')" />
              </div>
            </div>
          </div>

          <div class="mr-card-slot">
            <div class="mr-slot-label">
              <span class="mr-slot-name">data_record</span>
              <span class="mr-slot-dim">1080 x 1080</span>
              <button class="mr-btn mr-btn-secondary mr-btn-small" @click="downloadPng(resultPayload('data_record'))">
                <PhDownloadSimple :size="15" weight="bold" />
                PNG
              </button>
            </div>
            <div class="mr-card-frame" :style="{ width: 1080*SCALE+'px', height: 1080*SCALE+'px' }">
              <div :style="{ transform: `scale(${SCALE})`, transformOrigin: 'top left', width:'1080px', height:'1080px' }">
                <XBotCardDataRecord :payload="resultPayload('data_record')" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div class="mr-card-section-header">
          <div>
            <h2>未命中场景</h2>
            <p class="mr-dark-muted">用于检查失误文案和红色状态的可信度</p>
          </div>
          <PhStack :size="20" weight="bold" />
        </div>

        <div class="mr-card-grid">
          <div class="mr-card-slot">
            <div class="mr-slot-label">
              <span class="mr-slot-name">proof missed</span>
              <span class="mr-slot-dim">1080 x 1350</span>
              <button class="mr-btn mr-btn-secondary mr-btn-small" @click="downloadPng(resultMissPayload())">
                <PhDownloadSimple :size="15" weight="bold" />
                PNG
              </button>
            </div>
            <div class="mr-card-frame" :style="{ width: 1080*SCALE+'px', height: 1350*SCALE+'px' }">
              <div :style="{ transform: `scale(${SCALE})`, transformOrigin: 'top left', width:'1080px', height:'1350px' }">
                <XBotCardProof :payload="resultMissPayload()" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div class="mr-card-section-header">
          <div>
            <h2>市场汇总兑现图</h2>
            <p class="mr-dark-muted">A股与港股收盘后的汇总卡</p>
          </div>
          <PhStack :size="20" weight="bold" />
        </div>

        <div class="mr-card-grid">
          <div class="mr-card-slot">
            <div class="mr-slot-label">
              <span class="mr-slot-name">summary A股</span>
              <span class="mr-slot-dim">1080 x 1350</span>
              <button class="mr-btn mr-btn-secondary mr-btn-small" @click="downloadPng(summaryAPayload)">
                <PhDownloadSimple :size="15" weight="bold" />
                PNG
              </button>
            </div>
            <div class="mr-card-frame" :style="{ width: 1080*SCALE+'px', height: 1350*SCALE+'px' }">
              <div :style="{ transform: `scale(${SCALE})`, transformOrigin: 'top left', width:'1080px', height:'1350px' }">
                <XBotCardSummary :payload="summaryAPayload" />
              </div>
            </div>
          </div>

          <div class="mr-card-slot">
            <div class="mr-slot-label">
              <span class="mr-slot-name">summary 港股</span>
              <span class="mr-slot-dim">1080 x 1350</span>
              <button class="mr-btn mr-btn-secondary mr-btn-small" @click="downloadPng(summaryHKPayload)">
                <PhDownloadSimple :size="15" weight="bold" />
                PNG
              </button>
            </div>
            <div class="mr-card-frame" :style="{ width: 1080*SCALE+'px', height: 1350*SCALE+'px' }">
              <div :style="{ transform: `scale(${SCALE})`, transformOrigin: 'top left', width:'1080px', height:'1350px' }">
                <XBotCardSummary :payload="summaryHKPayload" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <div class="mr-content-section" style="margin-top: 42px; background: rgba(255,255,255,.05); border-color: rgba(255,255,255,.08)">
        <p class="mr-dark-muted">
          PNG 按钮调用 <code>POST /api/og/card</code> 进行 Satori 渲染。Docker 镜像会准备 Noto Sans SC 字体，运行时仍保留 CDN 兜底。
        </p>
      </div>
    </div>
  </main>
</template>
