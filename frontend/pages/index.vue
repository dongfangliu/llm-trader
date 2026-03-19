<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useAnalysis } from '~/composables/useAnalysis'
import { useQuota } from '~/composables/useQuota'
import { useTrial } from '~/composables/useTrial'
import { useSavedRecords } from '~/composables/useSavedRecords'
import { useAuthStore } from '~/stores/auth'
import { useAnalysisStore } from '~/stores/analysis'

const auth = useAuthStore()
const analysisStore = useAnalysisStore()
const {
  isAnalyzing, taskId, result, error, errorCode, progress, statusMessage, isFirstTrial,
  submitAnalysis, clearState
} = useAnalysis()
const {
  remaining, dailyLimit, totalAvailable, tier, trialState, fetchQuota
} = useQuota()
const {
  showGuestTrialEndedScreen, showProTrialWelcomeModal,
  handleGuestTrialExpired, handleProTrialConsumed,
  dismissGuestTrialScreen, dismissProTrialModal
} = useTrial()
const { saveRecord, loadSaved } = useSavedRecords()

const showResult = ref(false)
const showHistory = ref(false)
const showShare = ref(false)

onMounted(async () => {
  await fetchQuota()
  loadSaved()
})

// Watch for analysis completion
watch(result, (newResult) => {
  if (newResult) {
    showResult.value = true
    fetchQuota()  // Refresh quota after analysis

    if (isFirstTrial.value) {
      handleProTrialConsumed()
    }
  }
})

// Watch for trial_expired error
watch(errorCode, (code) => {
  if (code === 'trial_expired') {
    handleGuestTrialExpired()
  }
})

async function handleAnalysisSubmit(symbol: string, market: string, period: string) {
  clearState()
  showResult.value = false
  await submitAnalysis(symbol, market, period)
}
</script>

<template>
  <div class="relative">
    <!-- Desktop layout wrapper -->
    <DesktopLayout>
      <!-- Mobile layout is handled by MobileLayout -->
      <MobileLayout>
        <div class="px-4 pt-6 pb-4 max-w-2xl mx-auto">
          <!-- Header -->
          <div class="flex items-center justify-between mb-6">
            <div>
              <h1 class="text-2xl font-bold text-ios-label">AI 股票分析</h1>
              <p class="text-ios-secondary text-sm mt-0.5">专业技术研判</p>
            </div>
            <div class="flex items-center gap-2">
              <NuxtLink v-if="!auth.isLoggedIn" to="/login">
                <IosButton variant="secondary" size="sm">登录</IosButton>
              </NuxtLink>
              <NuxtLink v-else to="/account">
                <div class="w-9 h-9 rounded-full bg-ios-blue/10 flex items-center justify-center text-ios-blue font-bold text-sm">
                  {{ (auth.user?.email || '?')[0].toUpperCase() }}
                </div>
              </NuxtLink>
            </div>
          </div>

          <!-- Analysis Form Card -->
          <IosCard class="mb-4">
            <AnalysisForm
              :isAnalyzing="isAnalyzing"
              :remaining="remaining"
              :dailyLimit="dailyLimit"
              :trialState="trialState"
              @submit="handleAnalysisSubmit"
            />
          </IosCard>

          <!-- Progress indicator -->
          <div v-if="isAnalyzing" class="mb-4">
            <IosCard>
              <div class="py-2 space-y-3">
                <div class="flex items-center gap-3">
                  <div class="w-5 h-5 border-2 border-ios-blue border-t-transparent rounded-full animate-spin flex-shrink-0" />
                  <p class="text-sm text-ios-secondary">{{ statusMessage || '正在分析中...' }}</p>
                </div>
                <div class="w-full bg-ios-bg2 rounded-full h-1.5">
                  <div
                    class="bg-ios-blue h-1.5 rounded-full transition-all duration-300"
                    :style="{ width: `${progress}%` }"
                  />
                </div>
              </div>
            </IosCard>
          </div>

          <!-- Error display -->
          <div v-if="error && !isAnalyzing && errorCode !== 'trial_expired'" class="mb-4">
            <IosCard>
              <div class="flex items-start gap-3">
                <span class="text-ios-red text-xl flex-shrink-0">⚠️</span>
                <div>
                  <p class="text-sm text-ios-red font-medium">分析失败</p>
                  <p class="text-sm text-ios-secondary mt-0.5">{{ error }}</p>
                  <NuxtLink v-if="errorCode === 'quota_exceeded'" to="/upgrade" class="text-ios-blue text-sm font-medium mt-1 block">
                    升级套餐 →
                  </NuxtLink>
                </div>
              </div>
            </IosCard>
          </div>

          <!-- Result preview (if has result) -->
          <div v-if="result && !isAnalyzing" class="mb-4">
            <IosCard class="cursor-pointer" @click="showResult = true">
              <div class="flex items-center justify-between">
                <div>
                  <p class="text-sm font-semibold text-ios-label">
                    {{ analysisStore.symbol }} 分析完成
                  </p>
                  <p class="text-xs text-ios-secondary mt-0.5">点击查看详细报告</p>
                </div>
                <div
                  class="px-3 py-1 rounded-full text-sm font-bold text-white"
                  :style="{
                    backgroundColor: result?.action === 'buy' ? '#34c759' : result?.action === 'sell' ? '#ff3b30' : '#ff9500'
                  }"
                >
                  {{ result?.action === 'buy' ? '买入' : result?.action === 'sell' ? '卖出' : '持有' }}
                </div>
              </div>
            </IosCard>
          </div>

          <!-- Quick actions -->
          <div v-if="!isAnalyzing && !result" class="flex gap-2">
            <IosButton variant="ghost" size="sm" @click="showHistory = true">
              📋 历史记录
            </IosButton>
            <NuxtLink v-if="tier === 'free'" to="/upgrade" class="flex-1">
              <IosButton variant="secondary" size="sm" :fullWidth="true">
                ✨ 升级套餐
              </IosButton>
            </NuxtLink>
          </div>
        </div>
      </MobileLayout>
    </DesktopLayout>

    <!-- Result Sheet -->
    <ResultSheet
      v-model="showResult"
      :result="result"
      :symbol="analysisStore.symbol"
      :market="analysisStore.market"
      :period="analysisStore.period"
      @share="showShare = true"
      @save="result && saveRecord({ symbol: analysisStore.symbol, market: analysisStore.market, period: analysisStore.period, result })"
    />

    <!-- History Sheet -->
    <HistorySheet
      v-model="showHistory"
      @select="(item) => { showHistory = false }"
    />

    <!-- Share Preview Sheet -->
    <SharePreviewSheet
      v-model="showShare"
      :result="result"
      :symbol="analysisStore.symbol"
      :market="analysisStore.market"
      :period="analysisStore.period"
    />

    <!-- Guest Trial Ended Screen -->
    <GuestTrialEndedScreen
      v-if="showGuestTrialEndedScreen"
      @dismiss="dismissGuestTrialScreen"
    />

    <!-- Pro Trial Welcome Modal -->
    <ProTrialWelcomeModal
      v-if="showProTrialWelcomeModal"
      @dismiss="dismissProTrialModal"
    />
  </div>
</template>
