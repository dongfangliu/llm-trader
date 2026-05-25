<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import SharePreviewSheet from '~/components/analysis/SharePreviewSheet.vue'
import { stripClock } from '~/lib/format'

const props = defineProps<{
  isOpen: boolean
  result: any
  tier: string
  period: string
  historyItems?: Array<{ id: string; symbol: string; name?: string; action?: string; analyzedAt?: string; confidence?: number }>
  selectedHistoryId?: string
  isSaved?: boolean
  appName?: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'share'): void
  (e: 'save'): void
  (e: 'historySelect', id: string): void
  (e: 'upgrade'): void
}>()

const closing = ref(false)
const dragOffset = ref(0)
const dragStartY = ref(0)
const isDragging = ref(false)
const displayedConfidence = ref(0)
const shareLoading = ref(false)
const shareCopied = ref(false)
const saveLongLoading = ref(false)
const showSharePreview = ref(false)

function dismiss() {
  closing.value = true
  setTimeout(() => {
    closing.value = false
    emit('close')
  }, 380)
}

watch(() => props.isOpen, (open) => {
  if (open) {
    document.body.style.overflow = 'hidden'
    setTimeout(() => {
      displayedConfidence.value = confidence.value ?? 0
    }, 80)
  } else {
    document.body.style.overflow = ''
    displayedConfidence.value = 0
  }
}, { immediate: true })

onMounted(() => {
  if (props.isOpen) {
    setTimeout(() => {
      displayedConfidence.value = confidence.value ?? 0
    }, 80)
  }
})

watch(() => props.result, () => {
  displayedConfidence.value = 0
  setTimeout(() => {
    displayedConfidence.value = confidence.value ?? 0
  }, 80)
})

// Drag-to-dismiss
function onTouchStart(e: TouchEvent) {
  dragStartY.value = e.touches[0].clientY
  isDragging.value = true
}
function onTouchMove(e: TouchEvent) {
  if (!isDragging.value) return
  const dy = e.touches[0].clientY - dragStartY.value
  if (dy > 0) dragOffset.value = dy
}
function onTouchEnd() {
  isDragging.value = false
  if (dragOffset.value > 110) {
    dragOffset.value = 0
    dismiss()
  } else {
    dragOffset.value = 0
  }
}

// ── Data ──
const action = computed(() => props.result?.result?.action || 'hold')
const isFree = computed(() => props.tier === 'free')
const confidence = computed<number | null>(() => props.result?.result?.confidence ?? null)
const oq = computed<string | undefined>(() => props.result?.result?.opportunity_quality)
const latest = computed<number | null>(() => props.result?.data?.latest_price ?? null)
const target = computed<number | null>(() => props.result?.result?.target_price ?? null)
const stopLoss = computed<number | null>(() => props.result?.result?.stop_loss ?? null)

// ── 趋势诊断（趋势跟随方法论特征；前端自算 / 后端透传，存于 result.result.trend）──
const trend = computed<any>(() => props.result?.result?.trend ?? null)
const trendHigher = computed<any>(() => props.result?.result?.trend_higher ?? null)
const revFlags = computed<string[]>(() => {
  const r = trend.value?.reversal || {}
  return Object.keys(r).filter((k) => r[k])
})
const dedItems = computed(() => {
  const d = trend.value?.deduction || {}
  return [20, 60, 120].map((n) => ({ n, ...(d[n] || d[String(n)] || {}) }))
})
const pbItems = computed(() => {
  const p = trend.value?.pullback || {}
  return [20, 60, 120].map((n) => ({ n, v: p['ma' + n] })).filter((x) => x.v != null)
})
function fmtNum(v: any): string {
  return v == null || !Number.isFinite(Number(v)) ? '—' : Number(v).toFixed(2)
}
function alignColor(a: string | null | undefined): string {
  if (a === '多头排列') return '#dc2626'
  if (a === '空头排列') return '#16a34a'
  return '#8e8e93'
}
function dirColor(wr: boolean | null | undefined): string {
  if (wr === true) return '#dc2626'
  if (wr === false) return '#16a34a'
  return '#8e8e93'
}
function dirLabel(wr: boolean | null | undefined): string {
  if (wr === true) return '将上行'
  if (wr === false) return '将下行'
  return '—'
}
function cleanType(t: string | null | undefined): string {
  // 展示用：去掉「X点」时钟方向数字（如 "4点 稳定下跌" → "稳定下跌"）
  return stripClock(t) || '—'
}
// LLM 自由文本展示前统一过滤掉「X点」时钟数字（兼顾旧缓存/历史残留数据）
function sec(k: string): string {
  return stripClock(props.result?.result?.[k] || '')
}
const reasonText = computed<string>(() => stripClock(props.result?.result?.reason || ''))

const ACTION_CONFIG: Record<string, any> = {
  buy: {
    text: '看涨', color: '#dc2626', dimColor: 'rgba(220,38,38,0.55)',
    heroBg: 'linear-gradient(160deg, #5a0a0a 0%, #991b1b 52%, #ef4444 100%)',
    glow: 'radial-gradient(ellipse at 75% 20%, rgba(239,68,68,0.75) 0%, transparent 60%)',
    shine: 'linear-gradient(125deg, rgba(255,255,255,0.11) 0%, rgba(255,255,255,0) 52%)',
    handleColor: 'rgba(255,255,255,0.28)',
    divColor: 'rgba(255,255,255,0.14)',
    dark: true,
  },
  sell: {
    text: '看跌', color: '#16a34a', dimColor: 'rgba(22,163,74,0.55)',
    heroBg: 'linear-gradient(160deg, #052e16 0%, #065f46 52%, #059669 100%)',
    glow: 'radial-gradient(ellipse at 75% 20%, rgba(16,185,129,0.65) 0%, transparent 60%)',
    shine: 'linear-gradient(125deg, rgba(255,255,255,0.09) 0%, rgba(255,255,255,0) 52%)',
    handleColor: 'rgba(255,255,255,0.28)',
    divColor: 'rgba(255,255,255,0.14)',
    dark: true,
  },
  hold: {
    text: '观望', color: '#64748b', dimColor: 'rgba(100,116,139,0.55)',
    heroBg: 'linear-gradient(160deg, #0f172a 0%, #1e293b 52%, #334155 100%)',
    glow: 'radial-gradient(ellipse at 75% 20%, rgba(148,163,184,0.28) 0%, transparent 60%)',
    shine: 'linear-gradient(125deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0) 52%)',
    handleColor: 'rgba(255,255,255,0.28)',
    divColor: 'rgba(255,255,255,0.14)',
    dark: true,
  },
}

const info = computed(() => ACTION_CONFIG[action.value] || ACTION_CONFIG.hold)

const OQ_C: Record<string, string> = { A: '#16a34a', B: '#0369a1', C: '#d97706', D: '#dc2626' }
const OQ_B: Record<string, string> = { A: '#f0fdf4', B: '#e0f2fe', C: '#fffbeb', D: '#fef2f2' }

const PERIOD_LABELS: Record<string, string> = {
  daily: '日线', '60': '60分', '30': '30分', '15': '15分', '5': '5分', '1': '1分',
}

const NARRATIVE_SECTIONS = [
  { key: 'market_diagnosis',       icon: '诊', title: '市场诊断', tint: '#0071e3' },
  { key: 'opportunity_assessment', icon: '机', title: '机会评估', tint: '#f59e0b' },
  { key: 'risk_analysis',          icon: '险', title: '风险收益', tint: '#ef4444' },
  { key: 'execution_plan',         icon: '行', title: '执行方案', tint: '#10b981' },
]

const KEYWORDS = ['RSI', 'MACD', 'MA10', 'MA20', 'MA30', 'MA60', 'MA120', 'KDJ', 'EMA', 'ATR',
  '均线', '金叉', '死叉', '支撑', '阻力', '超买', '超卖', '成交量', '换手率', '布林',
  '趋势', '突破', '压力', '量能', '筑底', '顶部', '背离',
  '密集成交区', '抵扣价', '多头排列', '空头排列', '拐头', '交叉', '破线',
  '底部构造', '顶部构造', '回撤', '排列', '密集', '时钟方向']

function highlightText(text: string, accent: string): Array<{ text: string; isKeyword: boolean; isNumber: boolean }> {
  const pattern = new RegExp(`(\\d+\\.?\\d*%|\\d+\\.?\\d*x|${KEYWORDS.join('|')})`, 'g')
  const parts = text.split(pattern)
  return parts.map(p => ({
    text: p,
    isNumber: /^\d+\.?\d*[%x]$/.test(p),
    isKeyword: KEYWORDS.includes(p),
  }))
}

// Profit potential
const profitData = computed(() => {
  const a = action.value
  const t = target.value
  const s = stopLoss.value
  const l = latest.value
  if (!t || !s || !l) return null

  let profitPct: number, riskPct: number
  let profitLabel = '上行空间', riskLabel = '下行风险'
  let profitArrow = '↑', riskArrow = '↓'

  if (a === 'buy') {
    profitPct = (t - l) / l * 100
    riskPct = (l - s) / l * 100
  } else if (a === 'sell') {
    profitPct = (l - t) / l * 100
    riskPct = (s - l) / l * 100
    profitLabel = '下行空间'; riskLabel = '上方止损'
    profitArrow = '↓'; riskArrow = '↑'
  } else {
    profitPct = Math.abs((t - l) / l * 100)
    riskPct = Math.abs((l - s) / l * 100)
    profitLabel = '目标空间'; riskLabel = '止损距离'
    profitArrow = t > l ? '↑' : '↓'
  }

  if (profitPct <= 0 || riskPct <= 0) return null
  const ratio = riskPct > 0 ? profitPct / riskPct : null
  return { profitPct, riskPct, ratio, profitLabel, riskLabel, profitArrow, riskArrow }
})

// Risk severity
function riskSeverity(text: string) {
  if (/高|重大|严重|重要|持续|加大|压力|下行|缩/.test(text))
    return { bg: '#fef2f2', border: '#fecaca', dot: '#dc2626', textColor: '#991b1b' }
  if (/中等|适中|一般|缓慢|不及/.test(text))
    return { bg: '#fffbeb', border: '#fcd34d', dot: '#d97706', textColor: '#92400e' }
  return { bg: '#f8fafc', border: '#e2e8f0', dot: '#94a3b8', textColor: '#475569' }
}

// Indicator color
function indicatorColor(key: string, value: unknown): string {
  if (typeof value !== 'number') return '#4b5563'
  const v = value as number
  if (key === 'RSI') return v >= 70 ? '#dc2626' : v <= 30 ? '#16a34a' : '#4b5563'
  if (key === 'MACD') return v > 0 ? '#16a34a' : '#dc2626'
  if (key === 'KDJ' || key === 'KDJ_K') return v >= 80 ? '#dc2626' : v <= 20 ? '#16a34a' : '#4b5563'
  return '#d1d5db'
}

function indicatorStatus(key: string, value: unknown): string {
  if (typeof value !== 'number') return ''
  const v = value as number
  if (key === 'RSI') return v >= 70 ? '超买' : v <= 30 ? '超卖' : '中性'
  if (key === 'MACD') return v > 0.5 ? '看多' : v < -0.5 ? '看空' : '中性'
  if (key === 'KDJ' || key === 'KDJ_K') return v >= 80 ? '超买' : v <= 20 ? '超卖' : '中性'
  return ''
}

// Ring animation
const ringSize = 110
const strokeW = 9
const r = (ringSize - strokeW * 2) / 2
const circ = 2 * Math.PI * r
const ringOffset = computed(() => circ * (1 - displayedConfidence.value / 100))
const ringColor = computed(() => confidence.value == null ? '#c7c7cc' : info.value.color)
const ringGrade = computed(() => {
  const v = confidence.value ?? 0
  return v >= 85 ? '极强' : v >= 70 ? '较强' : v >= 50 ? '中等' : v >= 30 ? '偏弱' : '信号弱'
})

// Panel transform
const panelTransform = computed(() => {
  if (dragOffset.value > 0) return `translateY(${dragOffset.value}px)`
  if (closing.value) return 'translateY(100%)'
  return 'translateY(0)'
})
const panelTransition = computed(() =>
  dragOffset.value > 0 ? 'none' : 'transform 0.42s cubic-bezier(0.32,0.72,0,1)'
)

// Blurred values for free tier
const blurTarget = computed(() => {
  if (!latest.value) return '——'
  return (latest.value * (action.value === 'sell' ? 0.92 : 1.08)).toFixed(2)
})
const blurStop = computed(() => {
  if (!latest.value) return '——'
  return (latest.value * (action.value === 'sell' ? 1.05 : 0.95)).toFixed(2)
})

function getHistoryActionConfig(a: string | undefined) {
  return ACTION_CONFIG[a || 'hold'] || ACTION_CONFIG.hold
}

function formatHistDate(isoString?: string) {
  if (!isoString) return ''
  return new Date(isoString).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

async function handleShare() {
  showSharePreview.value = true
}
</script>

<template>
  <div v-if="isOpen || closing" class="rs-root">
    <!-- Overlay -->
    <div
      class="rs-overlay"
      :class="{ 'rs-overlay-out': closing }"
      @click="dismiss"
    />

    <!-- Panel -->
    <div
      class="rs-panel"
      :style="{ transform: panelTransform, transition: panelTransition }"
    >
      <!-- Scroll body -->
      <div class="rs-scroll">

        <!-- ── HERO ── -->
        <div class="rs-hero" :style="{ background: info.heroBg }">
          <!-- Glow overlay -->
          <div :style="{ position: 'absolute', inset: 0, background: info.glow, pointerEvents: 'none' }"/>
          <!-- Shine streak -->
          <div :style="{ position: 'absolute', inset: 0, background: info.shine, pointerEvents: 'none' }"/>

          <!-- Close button (top-right corner) -->
          <button
            @click.stop="dismiss"
            aria-label="关闭"
            style="position: absolute; right: 16px; top: max(14px, env(safe-area-inset-top, 14px)); width: 30px; height: 30px; border-radius: 50%; background: rgba(255,255,255,0.18); border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; color: #fff; -webkit-tap-highlight-color: transparent; z-index: 20;"
          >
            <svg width="12" height="12" viewBox="0 0 10 10" fill="none">
              <path d="M1 1l8 8M9 1L1 9" stroke="white" stroke-width="1.8" stroke-linecap="round"/>
            </svg>
          </button>

          <!-- Drag handle -->
          <div
            class="rs-handle-zone"
            style="padding-top: max(10px, env(safe-area-inset-top, 10px));"
            @touchstart="onTouchStart"
            @touchmove="onTouchMove"
            @touchend="onTouchEnd"
          >
            <div class="rs-handle-pill" :style="{ background: info.handleColor }"/>
          </div>

          <!-- Stock identity -->
          <div class="rs-identity">
            <span class="rs-stock-name">{{ result?.data?.name || result?.data?.symbol }}</span>
            <span v-if="result?.data?.name" class="rs-stock-code">({{ result.data.symbol }})</span>
            <span class="rs-pill rs-pill-market">{{ result?.data?.market?.toUpperCase() }}</span>
            <span class="rs-pill rs-pill-period">{{ PERIOD_LABELS[period] || period }}</span>
          </div>

          <!-- Verdict row -->
          <div class="rs-verdict-row">
            <div :style="{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: isFree ? 'center' : 'flex-start' }">
              <div
                class="rs-action-text"
                :style="{
                  color: '#ffffff',
                  textShadow: '0 4px 32px rgba(255,255,255,0.18), 0 2px 8px rgba(0,0,0,0.4)'
                }"
              >
                {{ info.text }}
              </div>
              <!-- Free tier: OQ badge -->
              <div v-if="isFree && oq" class="rs-oq-badge" :style="{ background: OQ_B[oq] ?? '#f3f4f6', color: OQ_C[oq] ?? '#374151', border: `1.5px solid ${OQ_C[oq] ?? '#8e8e93'}66`, marginTop: '12px' }">
                {{ oq }} 级机会
              </div>
            </div>

            <!-- Confidence ring (premium) -->
            <div v-if="!isFree && confidence != null" style="flex-shrink: 0;">
              <div style="display: flex; flex-direction: column; align-items: center; gap: 4px;">
                <div :style="{ position: 'relative', width: `${ringSize}px`, height: `${ringSize}px`, flexShrink: 0 }">
                  <svg :width="ringSize" :height="ringSize" style="transform: rotate(-90deg); overflow: visible;">
                    <!-- Track -->
                    <circle :cx="ringSize/2" :cy="ringSize/2" :r="r" :stroke-width="strokeW" stroke="rgba(0,0,0,0.35)" fill="none"/>
                    <!-- Glow -->
                    <circle v-if="displayedConfidence > 0" :cx="ringSize/2" :cy="ringSize/2" :r="r" :stroke-width="strokeW + 10" :stroke="ringColor" fill="none" stroke-linecap="round" :opacity="0.38" :stroke-dasharray="circ" :stroke-dashoffset="ringOffset" style="filter: blur(6px);"/>
                    <!-- Fill arc -->
                    <circle :cx="ringSize/2" :cy="ringSize/2" :r="r" :stroke-width="strokeW" :stroke="ringColor" fill="none" stroke-linecap="round" :stroke-dasharray="circ" :stroke-dashoffset="ringOffset" style="transition: stroke-dashoffset 0.9s cubic-bezier(0.34,1.56,0.64,1);"/>
                  </svg>
                  <div style="position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center;">
                    <span :style="{ fontSize: '22px', fontWeight: 800, color: '#ffffff', lineHeight: 1, letterSpacing: '-0.5px' }">{{ confidence }}</span>
                    <span :style="{ fontSize: '9px', fontWeight: 600, color: '#ffffff', opacity: 0.7, marginTop: '1px' }">%</span>
                  </div>
                </div>
                <span :style="{ fontSize: '11px', fontWeight: 700, color: 'rgba(255,255,255,0.92)', background: 'rgba(255,255,255,0.15)', borderRadius: '9999px', padding: '2px 8px', letterSpacing: '0.2px' }">{{ ringGrade }}</span>
              </div>
            </div>

            <!-- OQ badge for premium when no confidence -->
            <div v-if="!isFree && oq && confidence == null" class="rs-oq-badge" :style="{ background: OQ_B[oq] ?? '#f3f4f6', color: OQ_C[oq] ?? '#374151', border: `1.5px solid ${OQ_C[oq] ?? '#8e8e93'}66`, fontSize: '28px', width: '60px', height: '60px' }">
              {{ oq }}
            </div>
          </div>
        </div>

        <!-- ── PRICE STRIP ── -->
        <div class="rs-price-strip" style="background: #fff; border-bottom: 0.5px solid rgba(0,0,0,0.08);">
          <div class="rs-price-col">
            <div style="font-size: 10px; font-weight: 600; color: rgba(0,0,0,0.4); text-transform: uppercase; letter-spacing: 0.6px; margin-bottom: 4px;">最新价</div>
            <div class="rs-price-value" style="color: #1c1c1e;">{{ latest != null ? latest.toFixed(2) : '—' }}</div>
          </div>
          <div class="rs-price-divider"/>

          <!-- Free: blurred values -->
          <template v-if="isFree">
            <div class="rs-price-col rs-price-locked" @click="emit('upgrade')">
              <div style="font-size: 10px; font-weight: 600; color: rgba(0,0,0,0.4); text-transform: uppercase; letter-spacing: 0.6px; margin-bottom: 4px;">目标价</div>
              <div class="rs-blur-value-wrap">
                <div class="rs-blur-value">{{ blurTarget }}</div>
                <div class="rs-lock-badge">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2.5"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
                </div>
              </div>
            </div>
            <div class="rs-price-divider"/>
            <div class="rs-price-col rs-price-locked" @click="emit('upgrade')">
              <div style="font-size: 10px; font-weight: 600; color: rgba(0,0,0,0.4); text-transform: uppercase; letter-spacing: 0.6px; margin-bottom: 4px;">止损价</div>
              <div class="rs-blur-value-wrap">
                <div class="rs-blur-value">{{ blurStop }}</div>
                <div class="rs-lock-badge">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2.5"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
                </div>
              </div>
            </div>
          </template>

          <!-- Premium: real values -->
          <template v-else>
            <div class="rs-price-col">
              <div style="font-size: 10px; font-weight: 600; color: rgba(0,0,0,0.4); text-transform: uppercase; letter-spacing: 0.6px; margin-bottom: 4px;">{{ action === 'sell' ? '目标价 ↓' : '目标价 ↑' }}</div>
              <div class="rs-price-value" :style="{ color: info.color }">{{ target != null ? target.toFixed(2) : '—' }}</div>
            </div>
            <div class="rs-price-divider"/>
            <div class="rs-price-col">
              <div style="font-size: 10px; font-weight: 600; color: rgba(0,0,0,0.4); text-transform: uppercase; letter-spacing: 0.6px; margin-bottom: 4px;">{{ action === 'sell' ? '止损价 ↑' : '止损价 ↓' }}</div>
              <div class="rs-price-value" style="color: #b45309;">{{ stopLoss != null ? stopLoss.toFixed(2) : '—' }}</div>
            </div>
          </template>
        </div>

        <!-- ── PROFIT ROW ── -->
        <div v-if="!isFree && profitData" class="rs-profit-row">
          <div class="rs-profit-item rs-profit-up">
            <span>{{ profitData.profitArrow }} {{ profitData.profitPct.toFixed(1) }}%</span>
            <span class="rs-profit-label">{{ profitData.profitLabel }}</span>
          </div>
          <div class="rs-profit-bar-wrap">
            <div class="rs-profit-bar-track">
              <div class="rs-profit-bar-stop"/>
              <div class="rs-profit-bar-fill" :style="{ width: `${Math.min(90, (profitData.profitPct / (profitData.profitPct + profitData.riskPct)) * 100)}%`, background: info.color }"/>
              <div class="rs-profit-bar-dot" :style="{ background: info.color }"/>
            </div>
            <div v-if="profitData.ratio != null" class="rs-profit-ratio">赔率 {{ profitData.ratio.toFixed(1) }}x</div>
          </div>
          <div class="rs-profit-item rs-profit-down">
            <span>{{ profitData.riskArrow }} {{ profitData.riskPct.toFixed(1) }}%</span>
            <span class="rs-profit-label">{{ profitData.riskLabel }}</span>
          </div>
        </div>

        <!-- ── REASON ── -->
        <div v-if="result?.result?.reason" class="rs-section">
          <div class="rs-reason-lead" :style="{ borderLeft: `3px solid ${info.color}` }">
            <template v-for="(part, i) in highlightText(reasonText.slice(0, reasonText.indexOf('。') !== -1 ? reasonText.indexOf('。') + 1 : 80), info.color)" :key="i">
              <strong v-if="part.isNumber" :style="{ color: info.color, fontSize: '1.05em', fontWeight: 800, background: `${info.color}14`, borderRadius: '5px', padding: '0 4px', letterSpacing: '-0.2px', display: 'inline-block' }">{{ part.text }}</strong>
              <strong v-else-if="part.isKeyword" :style="{ color: info.color, fontWeight: 700 }">{{ part.text }}</strong>
              <span v-else>{{ part.text }}</span>
            </template>
          </div>
          <div v-if="reasonText.indexOf('。') !== -1 && reasonText.slice(reasonText.indexOf('。') + 1).trim()" class="rs-reason-body">
            {{ reasonText.slice(reasonText.indexOf('。') + 1).trim() }}
          </div>
        </div>

        <!-- ── 趋势诊断 (trend-following methodology) ── -->
        <div v-if="trend" class="rs-section rs-t2">
          <div class="rs-section-label">趋势诊断</div>

          <!-- 分钟线：日线大周期背景条 -->
          <div v-if="trendHigher" class="rs-t2-higher">
            <span class="rs-t2-higher-dot"/>
            <span>日线大周期 · {{ cleanType(trendHigher.trend_type) }}<span v-if="trendHigher.alignment"> · {{ trendHigher.alignment }}</span></span>
          </div>

          <!-- 主结论：趋势 + 排列 + 副信息 -->
          <div class="rs-t2-hero">
            <div class="rs-t2-trend">
              <span class="rs-t2-trend-name">{{ cleanType(trend.trend_type) }}</span>
              <span v-if="trend.alignment" class="rs-t2-align" :style="{ color: alignColor(trend.alignment), background: alignColor(trend.alignment) + '14' }">{{ trend.alignment }}</span>
            </div>
            <div v-if="trend.slope_ann != null || trend.ma_spread_pct != null" class="rs-t2-sub">
              <span v-if="trend.slope_ann != null">年化 {{ (trend.slope_ann * 100).toFixed(0) }}%</span>
              <span v-if="trend.r2 != null"> · 拟合 {{ (trend.r2 * 100).toFixed(0) }}%</span>
              <span v-if="trend.ma_spread_pct != null"> · 密集度 {{ trend.ma_spread_pct.toFixed(1) }}%{{ trend.converged ? ' 密集' : '' }}</span>
            </div>
          </div>

          <!-- 均线方向（抵扣价预判）—— 有序信号列表 -->
          <div class="rs-t2-ma-head">均线方向 · 抵扣价预判</div>
          <div class="rs-t2-ma-list">
            <div v-for="it in dedItems" :key="it.n" class="rs-t2-ma-row">
              <span class="rs-t2-ma-bar" :style="{ background: dirColor(it.will_rise) }"/>
              <span class="rs-t2-ma-name">MA{{ it.n }}</span>
              <span class="rs-t2-ma-dir" :style="{ color: dirColor(it.will_rise) }">{{ dirLabel(it.will_rise) }}</span>
              <span class="rs-t2-ma-price" :class="{ 'rs-locked-inline': isFree }">{{ isFree ? '抵扣 ██' : ('抵扣 ' + fmtNum(it.price)) }}</span>
            </div>
          </div>

          <!-- 次级信息归组：密集区 / 回撤 / 转折 -->
          <div class="rs-t2-meta">
            <div v-if="trend.consolidation && trend.consolidation.in != null" class="rs-t2-meta-row">
              <span class="rs-t2-meta-k">密集成交区</span>
              <span class="rs-t2-meta-v">
                <template v-if="trend.consolidation.in">已持续 {{ trend.consolidation.days }} 根 · 箱体 <span :class="{ 'rs-locked-inline': isFree }">{{ isFree ? '██~██' : (fmtNum(trend.consolidation.box_lo) + '~' + fmtNum(trend.consolidation.box_hi)) }}</span></template>
                <template v-else>当前非密集</template>
              </span>
            </div>
            <div v-if="pbItems.length" class="rs-t2-meta-row">
              <span class="rs-t2-meta-k">回撤位</span>
              <span class="rs-t2-meta-v">
                <span v-for="it in pbItems" :key="'pb' + it.n" class="rs-t2-pb" :style="{ color: it.v >= 0 ? '#dc2626' : '#16a34a' }">MA{{ it.n }} {{ (it.v >= 0 ? '+' : '') + it.v.toFixed(1) }}%</span>
              </span>
            </div>
            <div v-if="revFlags.length" class="rs-t2-meta-row">
              <span class="rs-t2-meta-k">转折迹象</span>
              <span class="rs-t2-meta-v"><span v-for="f in revFlags" :key="f" class="rs-t2-rev">{{ f }}</span></span>
            </div>
          </div>
        </div>

        <!-- ── DEEP ANALYSIS (premium) ── -->
        <template v-if="!isFree && result?.result">
          <div style="padding: 22px 20px 4px; display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 13px; font-weight: 700; color: #8e8e93; letter-spacing: 0.4px;">深度研判</span>
            <div style="flex: 1; height: 0.5px; background: rgba(0,0,0,0.1);"/>
          </div>
          <div v-for="(ns, i) in NARRATIVE_SECTIONS" :key="ns.key">
            <div class="rs-narrative-section" :style="{ animationDelay: `${i * 90}ms`, background: `linear-gradient(135deg, ${ns.tint}09 0%, #fff 55%)` }">
              <div class="rs-narr-head-row">
                <span class="rs-narr-icon" :style="{ background: `${ns.tint}18`, color: ns.tint }">{{ ns.icon }}</span>
                <span class="rs-narr-title" :style="{ color: ns.tint }">{{ ns.title }}</span>
              </div>
              <!-- Skeleton if no text -->
              <template v-if="!result.result[ns.key]">
                <div class="rs-sk-lines">
                  <div class="rs-sk-line rs-sk-60"/>
                  <div class="rs-sk-line rs-sk-100"/>
                  <div class="rs-sk-line rs-sk-80"/>
                </div>
              </template>
              <template v-else>
                <div class="rs-narr-lead" :style="{ borderLeft: `3px solid ${ns.tint}` }">
                  {{ sec(ns.key).slice(0, sec(ns.key).indexOf('。') !== -1 ? sec(ns.key).indexOf('。') + 1 : 90) }}
                </div>
                <div v-if="sec(ns.key).indexOf('。') !== -1 && sec(ns.key).slice(sec(ns.key).indexOf('。') + 1).trim()" class="rs-narr-body">
                  {{ sec(ns.key).slice(sec(ns.key).indexOf('。') + 1).trim() }}
                </div>
              </template>
            </div>
          </div>
        </template>

        <!-- ── RISK FACTORS ── -->
        <div v-if="!isFree && result?.result?.risk_factors?.length > 0" class="rs-section">
          <div class="rs-section-label">风险因素</div>
          <div class="rs-risk-list">
            <div
              v-for="(f, i) in result.result.risk_factors"
              :key="i"
              class="rs-risk-list-item"
              :style="{ background: riskSeverity(f).bg, borderLeft: `3px solid ${riskSeverity(f).dot}` }"
            >
              <span class="rs-risk-dot" :style="{ background: riskSeverity(f).dot }"/>
              <span :style="{ color: riskSeverity(f).textColor, fontSize: '13.5px', lineHeight: 1.5 }">{{ stripClock(f) }}</span>
            </div>
          </div>
        </div>

        <!-- ── TECHNICAL INDICATORS ── -->
        <div v-if="!isFree && result?.result?.indicators" class="rs-section rs-section-notop">
          <div class="rs-section-label">技术指标</div>
          <div class="rs-indicator-grid">
            <div
              v-for="[k, v] in Object.entries(result.result.indicators)"
              :key="k"
              class="rs-indicator-card"
              :style="indicatorStatus(k, v) ? { borderTop: `3px solid ${indicatorColor(k, v)}` } : {}"
            >
              <div class="rs-indicator-name">{{ k }}</div>
              <div class="rs-indicator-value" :style="{ color: indicatorStatus(k, v) ? indicatorColor(k, v) : '#1c1c1e' }">
                {{ typeof v === 'number' ? (v as number).toFixed(2) : String(v) }}
              </div>
              <div v-if="indicatorStatus(k, v)" class="rs-indicator-status" :style="{ color: indicatorColor(k, v) }">{{ indicatorStatus(k, v) }}</div>
            </div>
          </div>
        </div>

        <!-- ── HISTORY MINI STRIP ── -->
        <div v-if="(historyItems?.length ?? 0) > 1" style="padding-bottom: 4px;">
          <div class="rs-hist-strip-header">
            <span class="rs-narrative-label" style="padding: 0;">历史分析</span>
            <button class="rs-hist-viewall-btn">查看全部 ›</button>
          </div>
          <div class="rs-history-strip">
            <button
              v-for="h in (historyItems || []).slice(0, 7)"
              :key="h.id"
              class="rs-hist-card"
              :class="{ 'rs-hist-card-active': h.id === selectedHistoryId }"
              :style="h.id === selectedHistoryId ? { borderColor: getHistoryActionConfig(h.action).color, boxShadow: `0 4px 16px ${getHistoryActionConfig(h.action).color}28` } : {}"
              @click="emit('historySelect', h.id)"
            >
              <div class="rs-hist-action-bar" :style="{ background: getHistoryActionConfig(h.action).color }"/>
              <div class="rs-hist-body">
                <div class="rs-hist-name">{{ h.name || h.symbol }}</div>
                <div class="rs-hist-meta">
                  <span class="rs-hist-action-text" :style="{ color: getHistoryActionConfig(h.action).color }">{{ getHistoryActionConfig(h.action).text }}</span>
                  <span v-if="h.analyzedAt" class="rs-hist-date">{{ formatHistDate(h.analyzedAt) }}</span>
                </div>
                <div v-if="h.confidence != null" class="rs-hist-bar-track">
                  <div class="rs-hist-bar-fill" :style="{ width: `${h.confidence}%`, background: getHistoryActionConfig(h.action).color }"/>
                </div>
              </div>
            </button>
            <button v-if="(historyItems?.length ?? 0) > 7" class="rs-hist-more-btn">
              <span>+{{ (historyItems?.length ?? 0) - 7 }}</span>
              <span style="font-size: 10px; opacity: 0.6;">更多</span>
            </button>
          </div>
        </div>

        <!-- ── UPGRADE CARD (free tier) ── -->
        <div v-if="isFree" class="rs-section">
          <button class="rs-upgrade-card" @click="emit('upgrade')">
            <div class="rs-upgrade-shimmer"/>
            <div class="rs-upgrade-content">
              <div class="rs-upgrade-icon">✦</div>
              <div>
                <div class="rs-upgrade-title">解锁完整分析</div>
                <div class="rs-upgrade-features">目标价 · 止损 · 深度研判 · 风险评估 · 多周期对比</div>
              </div>
              <div class="rs-upgrade-caret">›</div>
            </div>
          </button>
        </div>

        <div style="height: 6px;"/>
      </div>

      <!-- ── FOOTER ── -->
      <div class="rs-footer">
        <div class="rs-footer-actions">
          <!-- Bookmark button -->
          <button
            @click="emit('save')"
            :disabled="saveLongLoading"
            class="rs-btn-bookmark"
            :style="{
              background: isSaved ? `${info.color}1a` : 'rgba(60,60,67,0.08)',
              color: isSaved ? info.color : '#8e8e93',
              border: `1.5px solid ${isSaved ? info.color + '44' : 'rgba(60,60,67,0.12)'}`,
            }"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" :fill="isSaved ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
            </svg>
            <span class="rs-bookmark-label">{{ isSaved ? '查看' : '收藏' }}</span>
          </button>

          <!-- Share button -->
          <button
            @click="handleShare()"
            :disabled="shareLoading"
            class="rs-btn-share-cta"
            :class="{ 'rs-btn-share-cta-loading': shareLoading }"
          >
            <template v-if="shareLoading">
              <div class="rs-btn-spinner rs-btn-spinner-white"/>
              <span>分享中…</span>
            </template>
            <template v-else>
              <svg v-if="!shareCopied" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/>
                <polyline points="16 6 12 2 8 6"/>
                <line x1="12" y1="2" x2="12" y2="15"/>
              </svg>
              <svg v-else width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              <span>{{ shareCopied ? '已复制' : '分享预判' }}</span>
            </template>
          </button>
        </div>
      </div>
    </div>

    <!-- Share Preview Sheet -->
    <SharePreviewSheet
      v-model="showSharePreview"
      :result="result"
      :symbol="result?.data?.symbol"
      :market="result?.data?.market || 'a'"
      :period="period"
      :tier="tier"
      :appName="appName"
    />
  </div>
</template>
