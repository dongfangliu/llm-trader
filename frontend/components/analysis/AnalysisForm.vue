<script setup lang="ts">
import { ref, computed } from 'vue'
import { useAnalysisStore } from '~/stores/analysis'

const props = defineProps<{
  isAnalyzing: boolean
  remaining: number
  dailyLimit: number
  trialState: string
}>()

const emit = defineEmits<{
  submit: [symbol: string, market: string, period: string]
}>()

const analysisStore = useAnalysisStore()

const symbol = ref('')
const localError = ref('')

const markets = [
  { value: 'a', label: 'A股', emoji: '🇨🇳' },
  { value: 'hk', label: '港股', emoji: '🇭🇰' },
  { value: 'us', label: '美股', emoji: '🇺🇸' },
  { value: 'futures', label: '期货', emoji: '📊' },
]

const periods = [
  { value: 'daily', label: '日线' },
  { value: '60', label: '60分' },
  { value: '30', label: '30分' },
  { value: '15', label: '15分' },
  { value: '5', label: '5分' },
  { value: '1', label: '1分' },
]

function handleSymbolInput(val: string) {
  symbol.value = val.toUpperCase().replace(/[^A-Z0-9]/g, '')
  localError.value = ''
}

function handleSubmit() {
  if (!symbol.value) {
    localError.value = '请输入股票代码'
    return
  }
  if (props.isAnalyzing) return
  localError.value = ''
  emit('submit', symbol.value, analysisStore.market, analysisStore.period)
}
</script>

<template>
  <div class="space-y-4">
    <!-- Market selector -->
    <div class="flex gap-2">
      <button
        v-for="m in markets"
        :key="m.value"
        :class="[
          'flex-1 py-2 px-1 rounded-ios text-sm font-medium transition-all duration-150',
          'border min-h-[44px] flex flex-col items-center justify-center gap-0.5',
          analysisStore.market === m.value
            ? 'bg-ios-blue text-white border-ios-blue'
            : 'bg-ios-card text-ios-secondary border-ios-separator hover:border-ios-blue',
        ]"
        @click="analysisStore.setMarket(m.value)"
      >
        <span class="text-base">{{ m.emoji }}</span>
        <span>{{ m.label }}</span>
      </button>
    </div>

    <!-- Symbol input -->
    <div>
      <input
        :value="symbol"
        type="text"
        placeholder="输入代码，如 600519"
        :class="[
          'w-full px-4 py-3 rounded-ios text-xl font-bold text-center tracking-wider',
          'border bg-ios-card transition-all duration-150',
          'focus:outline-none focus:ring-2',
          localError
            ? 'border-ios-red focus:border-ios-red focus:ring-ios-red/20'
            : 'border-ios-separator focus:border-ios-blue focus:ring-ios-blue/20',
          'min-h-[56px] placeholder:font-normal placeholder:text-base placeholder:tracking-normal placeholder:text-ios-tertiary',
        ]"
        maxlength="10"
        @input="handleSymbolInput(($event.target as HTMLInputElement).value)"
        @keydown.enter="handleSubmit"
      />
      <p v-if="localError" class="mt-1 text-sm text-ios-red text-center">{{ localError }}</p>
    </div>

    <!-- Period selector -->
    <div class="flex gap-1.5 overflow-x-auto no-scrollbar">
      <button
        v-for="p in periods"
        :key="p.value"
        :class="[
          'flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-150',
          'min-h-[32px] border',
          analysisStore.period === p.value
            ? 'bg-ios-blue text-white border-ios-blue'
            : 'bg-ios-card text-ios-secondary border-ios-separator',
        ]"
        @click="analysisStore.setPeriod(p.value)"
      >
        {{ p.label }}
      </button>
    </div>

    <!-- Quota badge -->
    <div class="flex items-center justify-between text-sm">
      <span class="text-ios-secondary">今日剩余</span>
      <span :class="remaining > 0 ? 'text-ios-blue font-semibold' : 'text-ios-red font-semibold'">
        {{ remaining }} / {{ dailyLimit }} 次
        <template v-if="trialState === 'available'">
          <span class="ml-1 text-xs bg-ios-orange/10 text-ios-orange px-1.5 py-0.5 rounded-full">试用</span>
        </template>
      </span>
    </div>

    <!-- Submit button -->
    <IosButton
      variant="primary"
      size="lg"
      :fullWidth="true"
      :loading="isAnalyzing"
      :disabled="isAnalyzing"
      @click="handleSubmit"
    >
      {{ isAnalyzing ? '分析中...' : '开始分析' }}
    </IosButton>
  </div>
</template>

<style scoped>
.no-scrollbar::-webkit-scrollbar { display: none; }
.no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
</style>
