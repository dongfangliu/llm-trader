<script setup lang="ts">
import { computed, onUnmounted, reactive, ref, watch } from 'vue'
import {
  PhArrowLeft,
  PhArrowSquareOut,
  PhCards,
  PhDownloadSimple,
  PhImageSquare,
  PhStack,
  PhWarningCircle,
} from '@phosphor-icons/vue'
import type { CardPayload } from '~/server/utils/xbot-cards/types'
import { MOCK_HOLD_RESULT, MOCK_PREDICTION, MOCK_RESULT, MOCK_SUMMARY_A, MOCK_SUMMARY_HK } from '~/server/utils/xbot-cards/mock'

type ZoomLevel = 0.25 | 0.42 | 0.75 | 1

const ZOOM_OPTIONS: { value: ZoomLevel; label: string }[] = [
  { value: 0.25, label: '25%' },
  { value: 0.42, label: '42%' },
  { value: 0.75, label: '75%' },
  { value: 1, label: '100%' },
]

interface Slot {
  key: string
  name: string
  width: number
  height: number
  payload: () => CardPayload
}

const { data: appConfig } = await useFetch('/api/config')

const brandName = computed(() => (appConfig.value as any)?.app_name ?? undefined)
const productUrl = computed(() => MOCK_PREDICTION.product_url)

const basePred = computed(() => ({ ...MOCK_PREDICTION, brand_name: brandName.value, product_url: productUrl.value }))
const baseResult = computed(() => ({ ...MOCK_RESULT, brand_name: brandName.value, product_url: productUrl.value }))
const baseHoldResult = computed(() => ({ ...MOCK_HOLD_RESULT, brand_name: brandName.value, product_url: productUrl.value }))

const slots: Slot[] = [
  {
    key: 'promise',
    name: 'promise',
    width: 1080, height: 1350,
    payload: () => ({ ...basePred.value, variant: 'promise' }) as CardPayload,
  },
  {
    key: 'data_pred',
    name: 'data_record · prediction',
    width: 1080, height: 1080,
    payload: () => ({ ...basePred.value, variant: 'data_record' }) as CardPayload,
  },
  {
    key: 'proof',
    name: 'proof',
    width: 1080, height: 1350,
    payload: () => ({ ...baseResult.value, variant: 'proof' }) as CardPayload,
  },
  {
    key: 'data_proof',
    name: 'data_record · proof',
    width: 1080, height: 1080,
    payload: () => ({ ...baseResult.value, variant: 'data_record' }) as CardPayload,
  },
  {
    key: 'proof_miss',
    name: 'proof · missed',
    width: 1080, height: 1350,
    payload: () => ({
      ...baseResult.value,
      variant: 'proof',
      is_correct: false,
      actual_change_pct: -2.4,
    }) as CardPayload,
  },
  {
    key: 'proof_hold',
    name: 'proof · hold range',
    width: 1080, height: 1350,
    payload: () => ({ ...baseHoldResult.value, variant: 'proof' }) as CardPayload,
  },
  {
    key: 'summary_a',
    name: 'summary · A股',
    width: 1080, height: 1350,
    payload: () => ({ ...MOCK_SUMMARY_A, variant: 'summary', brand_name: brandName.value, product_url: productUrl.value }) as CardPayload,
  },
  {
    key: 'summary_hk',
    name: 'summary · 港股',
    width: 1080, height: 1350,
    payload: () => ({ ...MOCK_SUMMARY_HK, variant: 'summary', brand_name: brandName.value, product_url: productUrl.value }) as CardPayload,
  },
]

const compareSlots: Slot[] = [
  { key: 'cmp_up', name: 'promise · up', width: 1080, height: 1350,
    payload: () => ({ ...basePred.value, variant: 'promise', predicted_direction: 'up' as any }) as CardPayload },
  { key: 'cmp_down', name: 'promise · down', width: 1080, height: 1350,
    payload: () => ({ ...basePred.value, variant: 'promise', predicted_direction: 'down' as any }) as CardPayload },
  { key: 'cmp_hold', name: 'promise · hold', width: 1080, height: 1350,
    payload: () => ({ ...basePred.value, variant: 'promise', predicted_direction: 'hold' as any }) as CardPayload },
]

const zoomMap = reactive<Record<string, ZoomLevel>>({})
const urlMap = reactive<Record<string, string>>({})
const errorMap = reactive<Record<string, string>>({})
const loadingMap = reactive<Record<string, boolean>>({})
const downloadingMap = reactive<Record<string, boolean>>({})
const showCompare = ref(false)

function getZoom(key: string): ZoomLevel {
  return (zoomMap[key] ?? 0.42) as ZoomLevel
}

function setZoom(key: string, z: ZoomLevel) {
  zoomMap[key] = z
}

async function renderSlot(slot: Slot) {
  loadingMap[slot.key] = true
  errorMap[slot.key] = ''
  if (urlMap[slot.key]) {
    URL.revokeObjectURL(urlMap[slot.key])
    urlMap[slot.key] = ''
  }
  try {
    const blob = await $fetch<Blob>('/api/og/card', {
      method: 'POST',
      body: slot.payload(),
      responseType: 'blob',
    })
    urlMap[slot.key] = URL.createObjectURL(blob)
  } catch (err: any) {
    errorMap[slot.key] = err?.statusMessage || err?.message || '渲染失败'
  } finally {
    loadingMap[slot.key] = false
  }
}

async function renderAll() {
  await Promise.all([...slots, ...compareSlots].map(renderSlot))
}

async function downloadPng(slot: Slot) {
  if (downloadingMap[slot.key]) return
  downloadingMap[slot.key] = true
  try {
    const blob = await $fetch<Blob>('/api/og/card', {
      method: 'POST',
      body: slot.payload(),
      responseType: 'blob',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `model-review-${slot.key}.png`
    a.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  } finally {
    downloadingMap[slot.key] = false
  }
}

function openInTab(slot: Slot) {
  if (urlMap[slot.key]) {
    window.open(urlMap[slot.key], '_blank')
  }
}

watch([brandName, productUrl, showCompare], () => {
  // Re-render when brand/product url load asynchronously, or when comparison toggles
  renderAll()
}, { immediate: true })

onUnmounted(() => {
  Object.values(urlMap).forEach((u) => u && URL.revokeObjectURL(u))
})

const sectionPromise = computed(() => slots.filter((s) => ['promise', 'data_pred'].includes(s.key)))
const sectionProof   = computed(() => slots.filter((s) => ['proof', 'data_proof'].includes(s.key)))
const sectionMissed  = computed(() => slots.filter((s) => ['proof_miss', 'proof_hold'].includes(s.key)))
const sectionSummary = computed(() => slots.filter((s) => s.key.startsWith('summary_')))
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
          <button class="mr-btn mr-btn-ghost mr-btn-small" type="button" @click="renderAll">重新渲染全部</button>
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
          <h1>真实 Satori 渲染输出 · 与公开页同源</h1>
          <p>
            此页面直接调用 <code>POST /api/og/card</code>，与公开页 <code>/api/public/research/.../card</code> 走同一渲染管线。
            修改 <code>variants/*.ts</code> 后点"重新渲染全部"即时校验。
          </p>
        </div>
        <div class="mr-spec-stack">
          <div><span>竖版</span><strong>1080 x 1350</strong></div>
          <div><span>方版</span><strong>1080 x 1080</strong></div>
          <div><span>品牌</span><strong>{{ brandName || '默认' }}</strong></div>
        </div>
      </section>

      <!-- Promise 方向对比 -->
      <section>
        <div class="mr-card-section-header">
          <div>
            <h2>主张卡 Promise（方向变体）</h2>
            <p class="mr-dark-muted">同时审阅做多 / 做空 / 观望三种方向的计划卡</p>
          </div>
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

        <div v-if="showCompare" class="mr-compare-panel">
          <div class="mr-card-grid mr-card-grid-compact">
            <div v-for="slot in compareSlots" :key="slot.key" class="mr-card-slot">
              <div class="mr-slot-label">
                <span class="mr-slot-name">{{ slot.name }}</span>
                <span class="mr-slot-dim">{{ slot.width }} x {{ slot.height }}</span>
              </div>
              <div class="mr-card-frame" :style="{ width: slot.width * 0.32 + 'px', height: slot.height * 0.32 + 'px' }">
                <img v-if="urlMap[slot.key]" class="mr-png-cap" :src="urlMap[slot.key]" :alt="slot.name" :width="slot.width * 0.32" :height="slot.height * 0.32" />
                <div v-else-if="errorMap[slot.key]" class="mr-png-error" :style="{ height: slot.height * 0.32 + 'px' }">
                  <PhWarningCircle :size="20" weight="bold" />
                  <span>{{ errorMap[slot.key] }}</span>
                </div>
                <div v-else class="mr-png-skeleton" :style="{ height: slot.height * 0.32 + 'px' }" aria-busy="true" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- 预测分析卡 -->
      <section>
        <div class="mr-card-section-header">
          <div>
            <h2>交易计划卡</h2>
            <p class="mr-dark-muted">主张卡与依据卡</p>
          </div>
          <PhStack :size="20" weight="bold" />
        </div>
        <div class="mr-card-grid">
          <article v-for="slot in sectionPromise" :key="slot.key" class="mr-card-slot">
            <div class="mr-slot-label">
              <span class="mr-slot-name">{{ slot.name }}</span>
              <span class="mr-slot-dim">{{ slot.width }} x {{ slot.height }}</span>
              <div class="mr-zoom">
                <button v-for="opt in ZOOM_OPTIONS" :key="opt.value" type="button" class="mr-zoom-btn"
                  :class="{ 'is-active': getZoom(slot.key) === opt.value }"
                  @click="setZoom(slot.key, opt.value)"
                >{{ opt.label }}</button>
              </div>
              <button class="mr-btn mr-btn-secondary mr-btn-small"
                :disabled="downloadingMap[slot.key]"
                @click="downloadPng(slot)"
              >
                <PhDownloadSimple :size="15" weight="bold" />
                {{ downloadingMap[slot.key] ? '生成中' : 'PNG' }}
              </button>
              <button class="mr-btn mr-btn-ghost mr-btn-small" :disabled="!urlMap[slot.key]" aria-label="新窗口打开" @click="openInTab(slot)">
                <PhArrowSquareOut :size="14" weight="bold" />
              </button>
            </div>
            <div class="mr-card-frame mr-card-frame-scroll" :style="{ width: slot.width * getZoom(slot.key) + 'px', height: slot.height * getZoom(slot.key) + 'px' }">
              <img v-if="urlMap[slot.key]" class="mr-png-cap" :src="urlMap[slot.key]" :alt="slot.name" :width="slot.width * getZoom(slot.key)" :height="slot.height * getZoom(slot.key)" />
              <div v-else-if="errorMap[slot.key]" class="mr-png-error" :style="{ height: slot.height * getZoom(slot.key) + 'px' }">
                <PhWarningCircle :size="20" weight="bold" />
                <span>{{ errorMap[slot.key] }}</span>
                <button class="mr-btn mr-btn-secondary mr-btn-small" type="button" @click="renderSlot(slot)">重试</button>
              </div>
              <div v-else class="mr-png-skeleton" :style="{ height: slot.height * getZoom(slot.key) + 'px' }" aria-busy="true" />
            </div>
          </article>
        </div>
      </section>

      <!-- 结算复盘卡 -->
      <section>
        <div class="mr-card-section-header">
          <div>
            <h2>结算复盘卡</h2>
            <p class="mr-dark-muted">计划复盘书 + 战绩卡</p>
          </div>
          <PhStack :size="20" weight="bold" />
        </div>
        <div class="mr-card-grid">
          <article v-for="slot in sectionProof" :key="slot.key" class="mr-card-slot">
            <div class="mr-slot-label">
              <span class="mr-slot-name">{{ slot.name }}</span>
              <span class="mr-slot-dim">{{ slot.width }} x {{ slot.height }}</span>
              <div class="mr-zoom">
                <button v-for="opt in ZOOM_OPTIONS" :key="opt.value" type="button" class="mr-zoom-btn"
                  :class="{ 'is-active': getZoom(slot.key) === opt.value }"
                  @click="setZoom(slot.key, opt.value)"
                >{{ opt.label }}</button>
              </div>
              <button class="mr-btn mr-btn-secondary mr-btn-small"
                :disabled="downloadingMap[slot.key]"
                @click="downloadPng(slot)"
              >
                <PhDownloadSimple :size="15" weight="bold" />
                {{ downloadingMap[slot.key] ? '生成中' : 'PNG' }}
              </button>
              <button class="mr-btn mr-btn-ghost mr-btn-small" :disabled="!urlMap[slot.key]" aria-label="新窗口打开" @click="openInTab(slot)">
                <PhArrowSquareOut :size="14" weight="bold" />
              </button>
            </div>
            <div class="mr-card-frame mr-card-frame-scroll" :style="{ width: slot.width * getZoom(slot.key) + 'px', height: slot.height * getZoom(slot.key) + 'px' }">
              <img v-if="urlMap[slot.key]" class="mr-png-cap" :src="urlMap[slot.key]" :alt="slot.name" :width="slot.width * getZoom(slot.key)" :height="slot.height * getZoom(slot.key)" />
              <div v-else-if="errorMap[slot.key]" class="mr-png-error" :style="{ height: slot.height * getZoom(slot.key) + 'px' }">
                <PhWarningCircle :size="20" weight="bold" />
                <span>{{ errorMap[slot.key] }}</span>
                <button class="mr-btn mr-btn-secondary mr-btn-small" type="button" @click="renderSlot(slot)">重试</button>
              </div>
              <div v-else class="mr-png-skeleton" :style="{ height: slot.height * getZoom(slot.key) + 'px' }" aria-busy="true" />
            </div>
          </article>
        </div>
      </section>

      <!-- 未命中场景 -->
      <section>
        <div class="mr-card-section-header">
          <div>
            <h2>破位场景</h2>
            <p class="mr-dark-muted">检查破位印章颜色与 vs 目标参考</p>
          </div>
          <PhStack :size="20" weight="bold" />
        </div>
        <div class="mr-card-grid">
          <article v-for="slot in sectionMissed" :key="slot.key" class="mr-card-slot">
            <div class="mr-slot-label">
              <span class="mr-slot-name">{{ slot.name }}</span>
              <span class="mr-slot-dim">{{ slot.width }} x {{ slot.height }}</span>
              <div class="mr-zoom">
                <button v-for="opt in ZOOM_OPTIONS" :key="opt.value" type="button" class="mr-zoom-btn"
                  :class="{ 'is-active': getZoom(slot.key) === opt.value }"
                  @click="setZoom(slot.key, opt.value)"
                >{{ opt.label }}</button>
              </div>
              <button class="mr-btn mr-btn-secondary mr-btn-small"
                :disabled="downloadingMap[slot.key]"
                @click="downloadPng(slot)"
              >
                <PhDownloadSimple :size="15" weight="bold" />
                {{ downloadingMap[slot.key] ? '生成中' : 'PNG' }}
              </button>
              <button class="mr-btn mr-btn-ghost mr-btn-small" :disabled="!urlMap[slot.key]" aria-label="新窗口打开" @click="openInTab(slot)">
                <PhArrowSquareOut :size="14" weight="bold" />
              </button>
            </div>
            <div class="mr-card-frame mr-card-frame-scroll" :style="{ width: slot.width * getZoom(slot.key) + 'px', height: slot.height * getZoom(slot.key) + 'px' }">
              <img v-if="urlMap[slot.key]" class="mr-png-cap" :src="urlMap[slot.key]" :alt="slot.name" :width="slot.width * getZoom(slot.key)" :height="slot.height * getZoom(slot.key)" />
              <div v-else-if="errorMap[slot.key]" class="mr-png-error" :style="{ height: slot.height * getZoom(slot.key) + 'px' }">
                <PhWarningCircle :size="20" weight="bold" />
                <span>{{ errorMap[slot.key] }}</span>
                <button class="mr-btn mr-btn-secondary mr-btn-small" type="button" @click="renderSlot(slot)">重试</button>
              </div>
              <div v-else class="mr-png-skeleton" :style="{ height: slot.height * getZoom(slot.key) + 'px' }" aria-busy="true" />
            </div>
          </article>
        </div>
      </section>

      <!-- 市场汇总 -->
      <section>
        <div class="mr-card-section-header">
          <div>
            <h2>市场汇总兑现图</h2>
            <p class="mr-dark-muted">A股与港股收盘后的汇总卡</p>
          </div>
          <PhStack :size="20" weight="bold" />
        </div>
        <div class="mr-card-grid">
          <article v-for="slot in sectionSummary" :key="slot.key" class="mr-card-slot">
            <div class="mr-slot-label">
              <span class="mr-slot-name">{{ slot.name }}</span>
              <span class="mr-slot-dim">{{ slot.width }} x {{ slot.height }}</span>
              <div class="mr-zoom">
                <button v-for="opt in ZOOM_OPTIONS" :key="opt.value" type="button" class="mr-zoom-btn"
                  :class="{ 'is-active': getZoom(slot.key) === opt.value }"
                  @click="setZoom(slot.key, opt.value)"
                >{{ opt.label }}</button>
              </div>
              <button class="mr-btn mr-btn-secondary mr-btn-small"
                :disabled="downloadingMap[slot.key]"
                @click="downloadPng(slot)"
              >
                <PhDownloadSimple :size="15" weight="bold" />
                {{ downloadingMap[slot.key] ? '生成中' : 'PNG' }}
              </button>
              <button class="mr-btn mr-btn-ghost mr-btn-small" :disabled="!urlMap[slot.key]" aria-label="新窗口打开" @click="openInTab(slot)">
                <PhArrowSquareOut :size="14" weight="bold" />
              </button>
            </div>
            <div class="mr-card-frame mr-card-frame-scroll" :style="{ width: slot.width * getZoom(slot.key) + 'px', height: slot.height * getZoom(slot.key) + 'px' }">
              <img v-if="urlMap[slot.key]" class="mr-png-cap" :src="urlMap[slot.key]" :alt="slot.name" :width="slot.width * getZoom(slot.key)" :height="slot.height * getZoom(slot.key)" />
              <div v-else-if="errorMap[slot.key]" class="mr-png-error" :style="{ height: slot.height * getZoom(slot.key) + 'px' }">
                <PhWarningCircle :size="20" weight="bold" />
                <span>{{ errorMap[slot.key] }}</span>
                <button class="mr-btn mr-btn-secondary mr-btn-small" type="button" @click="renderSlot(slot)">重试</button>
              </div>
              <div v-else class="mr-png-skeleton" :style="{ height: slot.height * getZoom(slot.key) + 'px' }" aria-busy="true" />
            </div>
          </article>
        </div>
      </section>

      <div class="mr-content-section" style="margin-top: 42px; background: rgba(255,255,255,.05); border-color: rgba(255,255,255,.08)">
        <p class="mr-dark-muted">
          所有缩略图都来自 <code>POST /api/og/card</code> 实际渲染（Satori + Resvg），与公开页 <code>/api/public/research/.../card</code> 同源。
          调整 <code>frontend/server/utils/xbot-cards/variants/*.ts</code> 后点"重新渲染全部"即时校验。
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

.mr-zoom-btn:hover { color: #eef5ef; }

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

.mr-card-grid-compact .mr-card-slot { padding: 8px; }

.mr-compare-panel {
  margin: 16px 0 24px;
  padding: 14px;
  border: 1px solid rgba(255, 255, 255, .08);
  border-radius: var(--mr-radius-md);
  background: rgba(255, 255, 255, .04);
}

.mr-png-cap {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.mr-png-skeleton {
  width: 100%;
  background:
    linear-gradient(110deg,
      rgba(255, 255, 255, .04) 0%,
      rgba(255, 255, 255, .12) 40%,
      rgba(255, 255, 255, .04) 80%
    );
  background-size: 200% 100%;
  border-radius: var(--mr-radius-sm);
  animation: mr-shimmer 1.6s ease-in-out infinite;
}

.mr-png-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  width: 100%;
  padding: 20px;
  text-align: center;
  color: #f5d9d3;
  background: rgba(224, 80, 96, .08);
  border-radius: var(--mr-radius-sm);
}

.mr-png-error span {
  max-width: 280px;
  color: #f5d9d3;
  font-size: 13px;
  line-height: 1.5;
}
</style>
