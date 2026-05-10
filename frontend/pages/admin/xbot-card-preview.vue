<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import {
  PhArrowLeft,
  PhArrowSquareOut,
  PhCards,
  PhDownloadSimple,
  PhImageSquare,
  PhStack,
} from '@phosphor-icons/vue'
import type { CardPayload } from '~/server/utils/xbot-cards/types'
import { MOCK_PREDICTION, MOCK_RESULT, MOCK_SUMMARY_A, MOCK_SUMMARY_HK } from '~/server/utils/xbot-cards/mock'
import api from '~/lib/api'

import XBotCardPromise from '~/components/xbot-cards/XBotCardPromise.vue'
import XBotCardProof from '~/components/xbot-cards/XBotCardProof.vue'
import XBotCardDataRecord from '~/components/xbot-cards/XBotCardDataRecord.vue'
import XBotCardSummary from '~/components/xbot-cards/XBotCardSummary.vue'

type SlotKey = string
type ZoomLevel = 0.25 | 0.42 | 0.75 | 1

const ZOOM_OPTIONS: { value: ZoomLevel; label: string }[] = [
  { value: 0.25, label: '25%' },
  { value: 0.42, label: '42%' },
  { value: 0.75, label: '75%' },
  { value: 1, label: '100%' },
]

const zoomMap = reactive<Record<SlotKey, ZoomLevel>>({})
const downloadingMap = reactive<Record<SlotKey, boolean>>({})
const showCompare = ref(false)
const compareDirection = ref<'all' | 'up' | 'down' | 'hold'>('all')

function getZoom(key: SlotKey) {
  return zoomMap[key] ?? 0.42
}

function setZoom(key: SlotKey, z: ZoomLevel) {
  zoomMap[key] = z
}

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

const promiseUpPayload = computed((): CardPayload => ({ ...basePred.value, variant: 'promise', predicted_direction: 'up' }))
const promiseDownPayload = computed((): CardPayload => ({ ...basePred.value, variant: 'promise', predicted_direction: 'down' }))
const promiseHoldPayload = computed((): CardPayload => ({ ...basePred.value, variant: 'promise', predicted_direction: 'hold' }))

async function downloadPng(slotKey: string, payload: CardPayload) {
  if (downloadingMap[slotKey]) return
  downloadingMap[slotKey] = true
  try {
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
  } finally {
    downloadingMap[slotKey] = false
  }
}

async function openPng(slotKey: string, payload: CardPayload) {
  if (downloadingMap[slotKey]) return
  downloadingMap[slotKey] = true
  try {
    const res = await $fetch('/api/og/card', {
      method: 'POST',
      body: payload,
      responseType: 'blob',
    })
    const url = URL.createObjectURL(res as Blob)
    window.open(url, '_blank')
    window.setTimeout(() => URL.revokeObjectURL(url), 60000)
  } finally {
    downloadingMap[slotKey] = false
  }
}

const compareVisibleDirections = computed(() => {
  if (compareDirection.value === 'all') return ['up', 'down', 'hold']
  return [compareDirection.value]
})
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
            页面只负责外层预览、缩放和 PNG 下载。卡片样式仍由现有 Vue 组件和 Satori 渲染器输出，避免影响线上社交资产。
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
            <h2>主张卡 Promise（方向变体）</h2>
            <p class="mr-dark-muted">同时审阅看涨 / 看跌 / 震荡三种方向的预测卡</p>
          </div>
          <div class="mr-compare-controls">
            <button
              type="button"
              class="mr-btn mr-btn-ghost mr-btn-small"
              :aria-pressed="showCompare"
              @click="showCompare = !showCompare"
            >
              <PhStack :size="14" weight="bold" />
              {{ showCompare ? '收起对比' : '方向对比' }}
            </button>
          </div>
        </div>

        <div v-if="showCompare" class="mr-compare-panel">
          <div class="mr-chip-row" role="tablist" aria-label="方向筛选">
            <button
              v-for="d in [{ k: 'all', label: '全部' }, { k: 'up', label: '看涨' }, { k: 'down', label: '看跌' }, { k: 'hold', label: '震荡' }]"
              :key="d.k"
              type="button"
              class="mr-chip"
              :class="{ 'is-active': compareDirection === d.k }"
              :aria-pressed="compareDirection === d.k"
              @click="compareDirection = d.k as any"
            >
              {{ d.label }}
            </button>
          </div>
          <div class="mr-card-grid mr-card-grid-compact">
            <div v-if="compareVisibleDirections.includes('up')" class="mr-card-slot">
              <div class="mr-slot-label">
                <span class="mr-slot-name">promise · up</span>
                <span class="mr-slot-dim">1080 x 1350</span>
              </div>
              <div class="mr-card-frame" :style="{ width: 1080*0.32+'px', height: 1350*0.32+'px' }">
                <div :style="{ transform: 'scale(0.32)', transformOrigin: 'top left', width: '1080px', height: '1350px' }">
                  <XBotCardPromise :payload="promiseUpPayload" />
                </div>
              </div>
            </div>
            <div v-if="compareVisibleDirections.includes('down')" class="mr-card-slot">
              <div class="mr-slot-label">
                <span class="mr-slot-name">promise · down</span>
                <span class="mr-slot-dim">1080 x 1350</span>
              </div>
              <div class="mr-card-frame" :style="{ width: 1080*0.32+'px', height: 1350*0.32+'px' }">
                <div :style="{ transform: 'scale(0.32)', transformOrigin: 'top left', width: '1080px', height: '1350px' }">
                  <XBotCardPromise :payload="promiseDownPayload" />
                </div>
              </div>
            </div>
            <div v-if="compareVisibleDirections.includes('hold')" class="mr-card-slot">
              <div class="mr-slot-label">
                <span class="mr-slot-name">promise · hold</span>
                <span class="mr-slot-dim">1080 x 1350</span>
              </div>
              <div class="mr-card-frame" :style="{ width: 1080*0.32+'px', height: 1350*0.32+'px' }">
                <div :style="{ transform: 'scale(0.32)', transformOrigin: 'top left', width: '1080px', height: '1350px' }">
                  <XBotCardPromise :payload="promiseHoldPayload" />
                </div>
              </div>
            </div>
          </div>
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
              <div class="mr-zoom">
                <button
                  v-for="opt in ZOOM_OPTIONS"
                  :key="opt.value"
                  type="button"
                  class="mr-zoom-btn"
                  :class="{ 'is-active': getZoom('promise') === opt.value }"
                  @click="setZoom('promise', opt.value)"
                >{{ opt.label }}</button>
              </div>
              <button
                class="mr-btn mr-btn-secondary mr-btn-small"
                :disabled="downloadingMap['promise']"
                @click="downloadPng('promise', predPayload('promise'))"
              >
                <PhDownloadSimple :size="15" weight="bold" />
                {{ downloadingMap['promise'] ? '生成中' : 'PNG' }}
              </button>
              <button
                class="mr-btn mr-btn-ghost mr-btn-small"
                :disabled="downloadingMap['promise']"
                aria-label="新窗口打开"
                @click="openPng('promise', predPayload('promise'))"
              >
                <PhArrowSquareOut :size="14" weight="bold" />
              </button>
            </div>
            <div class="mr-card-frame mr-card-frame-scroll" :style="{ width: 1080*getZoom('promise')+'px', height: 1350*getZoom('promise')+'px' }">
              <div :style="{ transform: `scale(${getZoom('promise')})`, transformOrigin: 'top left', width:'1080px', height:'1350px' }">
                <XBotCardPromise :payload="predPayload('promise')" />
              </div>
            </div>
          </div>

          <div class="mr-card-slot">
            <div class="mr-slot-label">
              <span class="mr-slot-name">data_record</span>
              <span class="mr-slot-dim">1080 x 1080</span>
              <div class="mr-zoom">
                <button
                  v-for="opt in ZOOM_OPTIONS"
                  :key="opt.value"
                  type="button"
                  class="mr-zoom-btn"
                  :class="{ 'is-active': getZoom('data_pred') === opt.value }"
                  @click="setZoom('data_pred', opt.value)"
                >{{ opt.label }}</button>
              </div>
              <button
                class="mr-btn mr-btn-secondary mr-btn-small"
                :disabled="downloadingMap['data_pred']"
                @click="downloadPng('data_pred', predPayload('data_record'))"
              >
                <PhDownloadSimple :size="15" weight="bold" />
                {{ downloadingMap['data_pred'] ? '生成中' : 'PNG' }}
              </button>
            </div>
            <div class="mr-card-frame mr-card-frame-scroll" :style="{ width: 1080*getZoom('data_pred')+'px', height: 1080*getZoom('data_pred')+'px' }">
              <div :style="{ transform: `scale(${getZoom('data_pred')})`, transformOrigin: 'top left', width:'1080px', height:'1080px' }">
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
              <div class="mr-zoom">
                <button
                  v-for="opt in ZOOM_OPTIONS"
                  :key="opt.value"
                  type="button"
                  class="mr-zoom-btn"
                  :class="{ 'is-active': getZoom('proof') === opt.value }"
                  @click="setZoom('proof', opt.value)"
                >{{ opt.label }}</button>
              </div>
              <button
                class="mr-btn mr-btn-secondary mr-btn-small"
                :disabled="downloadingMap['proof']"
                @click="downloadPng('proof', resultPayload('proof'))"
              >
                <PhDownloadSimple :size="15" weight="bold" />
                {{ downloadingMap['proof'] ? '生成中' : 'PNG' }}
              </button>
            </div>
            <div class="mr-card-frame mr-card-frame-scroll" :style="{ width: 1080*getZoom('proof')+'px', height: 1350*getZoom('proof')+'px' }">
              <div :style="{ transform: `scale(${getZoom('proof')})`, transformOrigin: 'top left', width:'1080px', height:'1350px' }">
                <XBotCardProof :payload="resultPayload('proof')" />
              </div>
            </div>
          </div>

          <div class="mr-card-slot">
            <div class="mr-slot-label">
              <span class="mr-slot-name">data_record</span>
              <span class="mr-slot-dim">1080 x 1080</span>
              <div class="mr-zoom">
                <button
                  v-for="opt in ZOOM_OPTIONS"
                  :key="opt.value"
                  type="button"
                  class="mr-zoom-btn"
                  :class="{ 'is-active': getZoom('data_proof') === opt.value }"
                  @click="setZoom('data_proof', opt.value)"
                >{{ opt.label }}</button>
              </div>
              <button
                class="mr-btn mr-btn-secondary mr-btn-small"
                :disabled="downloadingMap['data_proof']"
                @click="downloadPng('data_proof', resultPayload('data_record'))"
              >
                <PhDownloadSimple :size="15" weight="bold" />
                {{ downloadingMap['data_proof'] ? '生成中' : 'PNG' }}
              </button>
            </div>
            <div class="mr-card-frame mr-card-frame-scroll" :style="{ width: 1080*getZoom('data_proof')+'px', height: 1080*getZoom('data_proof')+'px' }">
              <div :style="{ transform: `scale(${getZoom('data_proof')})`, transformOrigin: 'top left', width:'1080px', height:'1080px' }">
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
              <div class="mr-zoom">
                <button
                  v-for="opt in ZOOM_OPTIONS"
                  :key="opt.value"
                  type="button"
                  class="mr-zoom-btn"
                  :class="{ 'is-active': getZoom('proof_miss') === opt.value }"
                  @click="setZoom('proof_miss', opt.value)"
                >{{ opt.label }}</button>
              </div>
              <button
                class="mr-btn mr-btn-secondary mr-btn-small"
                :disabled="downloadingMap['proof_miss']"
                @click="downloadPng('proof_miss', resultMissPayload())"
              >
                <PhDownloadSimple :size="15" weight="bold" />
                {{ downloadingMap['proof_miss'] ? '生成中' : 'PNG' }}
              </button>
            </div>
            <div class="mr-card-frame mr-card-frame-scroll" :style="{ width: 1080*getZoom('proof_miss')+'px', height: 1350*getZoom('proof_miss')+'px' }">
              <div :style="{ transform: `scale(${getZoom('proof_miss')})`, transformOrigin: 'top left', width:'1080px', height:'1350px' }">
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
              <div class="mr-zoom">
                <button
                  v-for="opt in ZOOM_OPTIONS"
                  :key="opt.value"
                  type="button"
                  class="mr-zoom-btn"
                  :class="{ 'is-active': getZoom('summary_a') === opt.value }"
                  @click="setZoom('summary_a', opt.value)"
                >{{ opt.label }}</button>
              </div>
              <button
                class="mr-btn mr-btn-secondary mr-btn-small"
                :disabled="downloadingMap['summary_a']"
                @click="downloadPng('summary_a', summaryAPayload)"
              >
                <PhDownloadSimple :size="15" weight="bold" />
                {{ downloadingMap['summary_a'] ? '生成中' : 'PNG' }}
              </button>
            </div>
            <div class="mr-card-frame mr-card-frame-scroll" :style="{ width: 1080*getZoom('summary_a')+'px', height: 1350*getZoom('summary_a')+'px' }">
              <div :style="{ transform: `scale(${getZoom('summary_a')})`, transformOrigin: 'top left', width:'1080px', height:'1350px' }">
                <XBotCardSummary :payload="summaryAPayload" />
              </div>
            </div>
          </div>

          <div class="mr-card-slot">
            <div class="mr-slot-label">
              <span class="mr-slot-name">summary 港股</span>
              <span class="mr-slot-dim">1080 x 1350</span>
              <div class="mr-zoom">
                <button
                  v-for="opt in ZOOM_OPTIONS"
                  :key="opt.value"
                  type="button"
                  class="mr-zoom-btn"
                  :class="{ 'is-active': getZoom('summary_hk') === opt.value }"
                  @click="setZoom('summary_hk', opt.value)"
                >{{ opt.label }}</button>
              </div>
              <button
                class="mr-btn mr-btn-secondary mr-btn-small"
                :disabled="downloadingMap['summary_hk']"
                @click="downloadPng('summary_hk', summaryHKPayload)"
              >
                <PhDownloadSimple :size="15" weight="bold" />
                {{ downloadingMap['summary_hk'] ? '生成中' : 'PNG' }}
              </button>
            </div>
            <div class="mr-card-frame mr-card-frame-scroll" :style="{ width: 1080*getZoom('summary_hk')+'px', height: 1350*getZoom('summary_hk')+'px' }">
              <div :style="{ transform: `scale(${getZoom('summary_hk')})`, transformOrigin: 'top left', width:'1080px', height:'1350px' }">
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

<style scoped>
.mr-zoom {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px;
  border: 1px solid rgba(255, 255, 255, .08);
  border-radius: 999px;
  background: rgba(255, 255, 255, .04);
}

.mr-zoom-btn {
  min-height: 22px;
  padding: 0 8px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: #9fb3aa;
  font-family: "JetBrains Mono", "SFMono-Regular", Consolas, monospace;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  transition: background .14s ease, color .14s ease;
}

.mr-zoom-btn:hover {
  color: #eef5ef;
}

.mr-zoom-btn.is-active {
  background: rgba(143, 198, 185, .2);
  color: #d5ebe4;
}

.mr-card-frame-scroll {
  overflow: auto;
  max-width: min(100%, 1080px);
  max-height: min(80vh, 1350px);
}

.mr-card-grid-compact {
  gap: 14px;
  margin-top: 14px;
}

.mr-card-grid-compact .mr-card-slot {
  padding: 8px;
}

.mr-compare-controls {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.mr-compare-panel {
  margin: 16px 0 24px;
  padding: 14px;
  border: 1px solid rgba(255, 255, 255, .08);
  border-radius: var(--mr-radius-md);
  background: rgba(255, 255, 255, .04);
}

.mr-compare-panel .mr-chip {
  background: rgba(255, 255, 255, .04);
  border-color: rgba(255, 255, 255, .12);
  color: #cfdcd6;
}

.mr-compare-panel .mr-chip.is-active {
  background: rgba(143, 198, 185, .25);
  border-color: rgba(143, 198, 185, .55);
  color: #f1faf6;
}
</style>
