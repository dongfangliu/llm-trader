<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  modelValue: boolean
  result: any
  symbol?: string
  market?: string
  period?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  share: []
  save: []
}>()

// Get action color
const actionColor = computed(() => {
  const action = props.result?.action || props.result?.signal
  if (action === 'buy' || action === 'open_long') return '#34c759'
  if (action === 'sell' || action === 'close_long') return '#ff3b30'
  return '#ff9500'
})

const actionText = computed(() => {
  const action = props.result?.action
  const map: Record<string, string> = {
    buy: '买入', sell: '卖出', hold: '持有',
    open_long: '做多', close_long: '平多', open_short: '做空'
  }
  return map[action] || '持有'
})

const signal = computed(() => {
  const s = props.result?.signal || 'neutral'
  const map: Record<string, { label: string, color: string }> = {
    strong_buy: { label: '强烈买入', color: '#34c759' },
    buy: { label: '买入', color: '#34c759' },
    neutral: { label: '中性', color: '#8e8e93' },
    sell: { label: '卖出', color: '#ff3b30' },
    strong_sell: { label: '强烈卖出', color: '#ff3b30' },
  }
  return map[s] || { label: '中性', color: '#8e8e93' }
})
</script>

<template>
  <IosSheet v-model="modelValue" :title="symbol ? `${symbol} 分析结果` : '分析结果'" :fullHeight="true">
    <div v-if="result" class="px-4 pb-8 pt-2 space-y-4">
      <!-- Action headline -->
      <div class="text-center py-4">
        <div
          class="inline-flex items-center gap-2 px-6 py-3 rounded-ios-lg text-white font-bold text-xl"
          :style="{ backgroundColor: actionColor }"
        >
          {{ actionText }}
        </div>
        <p class="mt-2 text-ios-secondary text-sm">
          信号强度：<span :style="{ color: signal.color }" class="font-medium">{{ signal.label }}</span>
        </p>
      </div>

      <!-- Key metrics -->
      <IosCard v-if="result.current_price || result.target_price || result.stop_loss">
        <div class="grid grid-cols-3 gap-3 text-center">
          <div v-if="result.current_price">
            <p class="text-xs text-ios-secondary mb-1">当前价</p>
            <p class="font-bold text-ios-label">{{ result.current_price?.toFixed(2) }}</p>
          </div>
          <div v-if="result.target_price">
            <p class="text-xs text-ios-secondary mb-1">目标价</p>
            <p class="font-bold text-ios-green">{{ result.target_price?.toFixed(2) }}</p>
          </div>
          <div v-if="result.stop_loss">
            <p class="text-xs text-ios-secondary mb-1">止损价</p>
            <p class="font-bold text-ios-red">{{ result.stop_loss?.toFixed(2) }}</p>
          </div>
        </div>
      </IosCard>

      <!-- Summary / Analysis text -->
      <IosCard v-if="result.summary || result.analysis || result.reason">
        <h3 class="text-sm font-semibold text-ios-label mb-2">分析摘要</h3>
        <p class="text-sm text-ios-secondary leading-relaxed whitespace-pre-line">
          {{ result.summary || result.analysis || result.reason }}
        </p>
      </IosCard>

      <!-- Technical indicators -->
      <IosCard v-if="result.indicators && Object.keys(result.indicators).length">
        <h3 class="text-sm font-semibold text-ios-label mb-3">技术指标</h3>
        <div class="space-y-2">
          <div
            v-for="(val, key) in result.indicators"
            :key="key"
            class="flex justify-between items-center"
          >
            <span class="text-sm text-ios-secondary">{{ key }}</span>
            <span class="text-sm font-medium text-ios-label">{{ typeof val === 'number' ? val.toFixed(2) : val }}</span>
          </div>
        </div>
      </IosCard>

      <!-- Full result (collapsible raw JSON) -->
      <details class="rounded-ios overflow-hidden">
        <summary class="px-4 py-3 bg-ios-fill text-ios-secondary text-sm cursor-pointer select-none">
          查看完整数据
        </summary>
        <pre class="px-4 py-3 text-xs text-ios-secondary bg-ios-bg overflow-x-auto">{{ JSON.stringify(result, null, 2) }}</pre>
      </details>

      <!-- Action buttons -->
      <div class="flex gap-3 pt-2">
        <IosButton variant="secondary" size="md" class="flex-1" @click="emit('share')">
          📤 分享
        </IosButton>
        <IosButton variant="secondary" size="md" class="flex-1" @click="emit('save')">
          ⭐ 收藏
        </IosButton>
      </div>
    </div>
  </IosSheet>
</template>
