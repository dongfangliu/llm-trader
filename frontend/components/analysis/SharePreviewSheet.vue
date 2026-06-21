<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import { generatePredictionCardBlob, generateStatementCardBlob } from '~/lib/shareCards/index'
import type { PredictionCardParams } from '~/lib/shareCards/index'
import { DEFAULT_APP_NAME } from '~/constants/app'
import { stripClock } from '~/lib/format'
import { useAuthStore } from '~/stores/auth'

const props = defineProps<{
  modelValue: boolean
  result: any
  symbol?: string
  market?: string
  period?: string
  tier?: string
  appName?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const auth = useAuthStore()

// ── State ──────────────────────────────────────────────────────────────────
const closing = ref(false)
const socialBlob = ref<Blob | null>(null)
const archiveBlob = ref<Blob | null>(null)
const socialImageUrl = ref<string | null>(null)
const archiveImageUrl = ref<string | null>(null)
const socialFilename = ref('')
const archiveFilename = ref('')
const mode = ref<'social' | 'archive'>('social')
const cardEntered = ref(false)
const swipeStartX = ref<number | null>(null)
const generatingSocial = ref(false)
const generatingArchive = ref(false)
const savedCardParams = ref<PredictionCardParams | null>(null)
const copiedLink = ref(false)

// ── Object URL lifecycle ────────────────────────────────────────────────────
let socialUrlRef: string | null = null
let archiveUrlRef: string | null = null

watch(socialBlob, (blob) => {
  if (socialUrlRef) URL.revokeObjectURL(socialUrlRef)
  if (blob) {
    socialUrlRef = URL.createObjectURL(blob)
    socialImageUrl.value = socialUrlRef
  } else {
    socialUrlRef = null
    socialImageUrl.value = null
  }
})

watch(archiveBlob, (blob) => {
  if (archiveUrlRef) URL.revokeObjectURL(archiveUrlRef)
  if (blob) {
    archiveUrlRef = URL.createObjectURL(blob)
    archiveImageUrl.value = archiveUrlRef
  } else {
    archiveUrlRef = null
    archiveImageUrl.value = null
  }
})

onUnmounted(() => {
  if (socialUrlRef) URL.revokeObjectURL(socialUrlRef)
  if (archiveUrlRef) URL.revokeObjectURL(archiveUrlRef)
})

// ── Computed ───────────────────────────────────────────────────────────────
const action = computed<'buy' | 'sell' | 'hold'>(() => props.result?.result?.action || 'hold')
const actionLabel = computed(() =>
  action.value === 'buy' ? '买入' : action.value === 'sell' ? '卖出' : '观望'
)
const actionColor = computed(() =>
  action.value === 'buy' ? '#EF4444' : action.value === 'sell' ? '#22C55E' : '#60A5FA'
)
const confidence = computed<number | null>(() => props.result?.result?.confidence ?? null)
const stockName = computed(() => props.result?.data?.name || props.result?.data?.symbol || '')
const landingUrl = computed(() => {
  if (typeof window === 'undefined') return ''
  const r = props.result
  const m = props.market || r?.data?.market || 'a'
  const s = props.symbol || r?.data?.symbol || ''
  const url = new URL('/', window.location.origin)
  if (m) url.searchParams.set('market', String(m).toLowerCase())
  if (s) url.searchParams.set('symbol', String(s).toUpperCase())
  if (auth.isLoggedIn && auth.user?.invite_code) {
    url.searchParams.set('invite', auth.user.invite_code)
  }
  return url.toString()
})
const hasInviteReward = computed(() => landingUrl.value.includes('invite='))

const activeImageUrl = computed(() =>
  mode.value === 'archive' ? archiveImageUrl.value : socialImageUrl.value
)

const analyzedAt = computed(() => {
  const r = props.result
  return r?.analyzed_at || r?.created_at || new Date().toISOString()
})

const dateStr = computed(() => {
  try {
    return new Date(analyzedAt.value).toLocaleString('zh-CN', {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return ''
  }
})

// ── Build card params ───────────────────────────────────────────────────────
function buildCardParams(): PredictionCardParams {
  const r = props.result
  return {
    stockName: r?.data?.name || r?.data?.symbol || '',
    stockCode: r?.data?.symbol || '',
    market: props.market || r?.data?.market || 'a',
    action: (r?.result?.action as 'buy' | 'sell' | 'hold') || 'hold',
    confidence: r?.result?.confidence ?? null,
    latestPrice: r?.data?.latest_price ?? null,
    targetPrice: r?.result?.target_price ?? null,
    stopLoss: r?.result?.stop_loss ?? null,
    opportunityGrade: r?.result?.opportunity_quality ?? null,
    reasonExcerpt: stripClock(r?.result?.reason || '').slice(0, 120),
    analyzedAt: analyzedAt.value,
    tier: props.tier || 'free',
    appName: props.appName || DEFAULT_APP_NAME,
    appBaseUrl: landingUrl.value || (typeof window !== 'undefined' ? window.location.origin : undefined),
    marketDiagnosis: stripClock(r?.result?.narrative?.market_diagnosis || r?.result?.market_diagnosis || ''),
    opportunityAssessment: r?.result?.narrative?.opportunity_assessment || r?.result?.opportunity_assessment || '',
    riskAnalysis: r?.result?.narrative?.risk_analysis || r?.result?.risk_analysis || '',
    executionPlan: r?.result?.narrative?.execution_plan || r?.result?.execution_plan || '',
  }
}

// ── Open/close logic ────────────────────────────────────────────────────────
watch(() => props.modelValue, async (open) => {
  if (open) {
    closing.value = false
    mode.value = 'social'
    cardEntered.value = false
    socialBlob.value = null
    archiveBlob.value = null
    document.body.style.overflow = 'hidden'

    const params = buildCardParams()
    savedCardParams.value = params

    generatingSocial.value = true
    setTimeout(() => { cardEntered.value = true }, 16)

    try {
      const result = await generateStatementCardBlob(params)
      socialBlob.value = result.blob
      socialFilename.value = result.filename
    } catch (e) {
      console.error('Failed to generate statement card:', e)
    } finally {
      generatingSocial.value = false
    }
  } else {
    cardEntered.value = false
    document.body.style.overflow = ''
  }
})

function dismiss() {
  closing.value = true
  document.body.style.overflow = ''
  setTimeout(() => {
    closing.value = false
    emit('update:modelValue', false)
  }, 360)
}

// ── Mode switching ──────────────────────────────────────────────────────────
async function switchMode(next: 'social' | 'archive') {
  if (next === mode.value) return

  if (next === 'archive' && !archiveBlob.value) {
    generatingArchive.value = true
    try {
      const params = savedCardParams.value || buildCardParams()
      const result = await generatePredictionCardBlob(params)
      archiveBlob.value = result.blob
      archiveFilename.value = result.filename
    } catch (e) {
      console.error('Failed to generate prediction card:', e)
    } finally {
      generatingArchive.value = false
    }
  }

  mode.value = next
  cardEntered.value = false
  setTimeout(() => { cardEntered.value = true }, 16)
}

// ── Touch swipe ─────────────────────────────────────────────────────────────
function onTouchStart(e: TouchEvent) {
  swipeStartX.value = e.touches[0].clientX
}
function onTouchEnd(e: TouchEvent) {
  if (swipeStartX.value === null) return
  const delta = e.changedTouches[0].clientX - swipeStartX.value
  if (Math.abs(delta) > 44) {
    switchMode(delta < 0 ? 'archive' : 'social')
  }
  swipeStartX.value = null
}

// ── Save / Download ──────────────────────────────────────────────────────────
async function handleSave(isArchive = false) {
  const blob = isArchive ? archiveBlob.value : socialBlob.value
  const filename = isArchive ? archiveFilename.value : socialFilename.value
  if (!blob) return

  if (navigator.share && navigator.canShare) {
    const file = new File([blob], filename, { type: blob.type })
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file] })
        return
      } catch {
        // user cancelled or share failed — fall through to download
      }
    }
  }

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

async function handleCopyLink() {
  if (!landingUrl.value) return
  await navigator.clipboard?.writeText(landingUrl.value)
  copiedLink.value = true
  setTimeout(() => { copiedLink.value = false }, 1800)
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="modelValue || closing"
      class="sps2-root"
      :style="{ opacity: closing ? 0 : 1, transition: closing ? 'opacity 0.28s 0.1s ease' : 'opacity 0.22s ease' }"
      @click="dismiss"
    >
      <div
        :class="['sps2-panel', { 'sps2-panel-out': closing }]"
        @click.stop
      >
        <!-- Drag handle -->
        <div class="sps2-handle-zone">
          <div class="sps2-handle-pill" />
        </div>

        <!-- X close button -->
        <button class="sps2-close-x" @click="dismiss">×</button>

        <!-- Card stage with swipe + entrance animation -->
        <div
          :class="['sps2-stage', { 'sps2-stage-entered': cardEntered }]"
          @touchstart="onTouchStart"
          @touchend="onTouchEnd"
        >
          <div class="sps2-glow" :style="{ background: actionColor }" />
          <img
            v-if="activeImageUrl"
            :src="activeImageUrl"
            alt="分析卡片预览"
            class="sps2-preview-img"
            draggable="false"
          />
          <div v-else class="sps2-preview-placeholder">
            <div class="sps2-preview-spinner" />
          </div>
        </div>

        <!-- Dot indicators -->
        <div class="sps2-dot-row">
          <span class="sps2-swipe-hint">‹</span>
          <div
            :class="['sps2-dot', { 'sps2-dot-active': mode === 'social' }]"
            @click="switchMode('social')"
          />
          <div
            :class="['sps2-dot', { 'sps2-dot-active': mode === 'archive' }]"
            @click="switchMode('archive')"
          />
          <span class="sps2-swipe-hint">›</span>
        </div>

        <!-- Meta strip -->
        <div class="sps2-meta-strip">
          <span class="sps2-meta-name">{{ stockName }}</span>
          <span class="sps2-meta-dot">·</span>
          <span class="sps2-meta-detail" :style="{ color: actionColor }">{{ actionLabel }}</span>
          <template v-if="confidence != null">
            <span class="sps2-meta-dot">·</span>
            <span class="sps2-meta-detail" style="color: rgba(60,60,67,0.45)">置信度 {{ confidence }}%</span>
          </template>
        </div>

        <!-- Social mode -->
        <template v-if="mode === 'social'">
          <div style="margin: 0 20px 10px; padding: 10px 12px; background: rgba(60,60,67,0.06); border-radius: 12px;">
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px;">
              <div style="min-width: 0;">
                <div style="font-size: 13px; font-weight: 700; color: #1c1c1e;">扫码分析同一只股票</div>
                <div style="font-size: 12px; color: #8e8e93; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">{{ landingUrl }}</div>
              </div>
              <button
                type="button"
                @click="handleCopyLink"
                style="height: 34px; padding: 0 12px; border: none; border-radius: 9px; background: #fff; color: #007aff; font-size: 13px; font-weight: 700; cursor: pointer; flex-shrink: 0;"
              >
                {{ copiedLink ? '已复制' : '复制链接' }}
              </button>
            </div>
            <div v-if="hasInviteReward" style="font-size: 12px; color: #16a34a; margin-top: 6px; font-weight: 600;">注册后双方各得 +10 次分析额度</div>
          </div>
          <button
            class="sps2-primary-btn sps2-cta-shimmer"
            :style="{ background: `linear-gradient(135deg, ${actionColor}bb 0%, ${actionColor} 100%)` }"
            @click="handleSave(false)"
          >
            保存到相册
          </button>
          <div class="sps2-platform-scroll">
            <div class="sps2-platform-pill" @click="handleSave(false)">
              <span class="sps2-pill-icon"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 4 16 7h3a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h3l1.5-3h5Z"/><circle cx="12" cy="13" r="3"/></svg></span>
              <span class="sps2-pill-text">小红书发笔记</span>
            </div>
            <div class="sps2-platform-pill" @click="handleSave(false)">
              <span class="sps2-pill-icon"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-8 8H7l-4 3 1.3-5.1A8 8 0 1 1 21 12Z"/></svg></span>
              <span class="sps2-pill-text">发给朋友</span>
            </div>
            <div class="sps2-platform-pill" @click="handleSave(false)">
              <span class="sps2-pill-icon"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14 14 0 0 1 0 18"/><path d="M12 3a14 14 0 0 0 0 18"/></svg></span>
              <span class="sps2-pill-text">朋友圈</span>
            </div>
          </div>
        </template>

        <!-- Archive mode -->
        <template v-else>
          <div class="sps2-archive-zone">
            <div class="sps2-archive-seal">
              <div class="sps2-seal-accent-bar" :style="{ background: actionColor }" />
              <div class="sps2-seal-content">
                <span class="sps2-seal-title">研判时间戳</span>
                <span class="sps2-seal-date">{{ dateStr }}</span>
              </div>
              <div class="sps2-seal-lock">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2.5"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
              </div>
            </div>
            <button
              class="sps2-archive-save-btn"
              :disabled="generatingArchive"
              @click="handleSave(true)"
            >
              <span v-if="generatingArchive">生成中…</span>
              <span v-else>保存存证图</span>
            </button>
            <p class="sps2-archive-hint">保存后可截图或打印，作为研判时间凭据</p>
          </div>
        </template>

        <!-- Compliance note -->
        <div class="sps2-compliance">仅供参考，不构成投资建议</div>
      </div>
    </div>
  </Teleport>
</template>
