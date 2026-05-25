<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { DEFAULT_APP_NAME } from '~/constants/app'
import { usePwaInstall } from '~/composables/usePwaInstall'

const props = defineProps<{
  appName?: string
}>()

const emit = defineEmits<{
  (e: 'dismiss'): void
  (e: 'upgrade'): void
}>()

const { trackGrowthEvent } = useGrowthEvents()
const { canShowInstall } = usePwaInstall()

// "如果还没保存到桌面" — only surface the save step when the app isn't already
// installed (and the user hasn't recently dismissed the install prompt).
const showInstallStep = computed(() => canShowInstall.value)

onMounted(() => {
  void trackGrowthEvent('pro_trial_next_steps_shown', { install_step: showInstallStep.value })
})

function onUpgrade() {
  // Parent (goUpgrade) tracks the upgrade_clicked event + navigates.
  emit('upgrade')
}
</script>

<template>
  <div class="pns-root">

    <!-- App hero -->
    <div class="pns-col" style="padding: 48px 16px 20px; text-align: center; align-items: center;">
      <div class="pns-hero-icon">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7l4 4 5-7 5 7 4-4-2 13H5L3 7z"/></svg>
      </div>
      <h1 style="font-size: 24px; font-weight: 700; color: var(--ios-label); margin: 0 0 6px; letter-spacing: -0.3px;">专业版体验结束</h1>
      <p style="font-size: 15px; color: var(--ios-secondary); margin: 0; line-height: 1.5;">
        {{ showInstallStep ? '再完成两步，把高效研判留在身边' : '升级专业版，保留完整深度研判' }}
      </p>
    </div>

    <div class="pns-col" style="padding: 0 16px; gap: 12px;">

      <!-- Step 1 — Save to home (only when not yet installed) -->
      <div v-if="showInstallStep" class="pns-card pns-card-light" style="animation-delay: 0.05s;">
        <div class="pns-step-head">
          <span class="pns-step-num pns-step-num-blue">1</span>
          <h2 class="pns-step-title">保存到桌面</h2>
        </div>
        <p class="pns-step-desc">一键直达，像 App 一样随时打开，不必再找网址</p>
        <PwaInstallButton :appName="props.appName || DEFAULT_APP_NAME" variant="card" />
      </div>

      <!-- Step 2 — Upgrade -->
      <div class="pns-card pns-card-dark" style="animation-delay: 0.12s;">
        <div class="pns-glow"/>
        <div style="position: relative;">
          <div class="pns-step-head">
            <span class="pns-step-num pns-step-num-glass">{{ showInstallStep ? '2' : '✦' }}</span>
            <h2 class="pns-step-title" style="color: #fff;">升级专业版</h2>
          </div>
          <p class="pns-step-desc" style="color: rgba(255,255,255,0.62);">每天 15 次完整深度研判 · 持仓智能分析 · 多周期对比</p>
          <button class="pns-cta" @click="onUpgrade">
            查看专业版套餐
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
          </button>
        </div>
      </div>

      <button class="pns-later" @click="emit('dismiss')">稍后再说</button>
    </div>
  </div>
</template>

<style scoped>
.pns-root {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: var(--ios-bg);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0 0 calc(40px + env(safe-area-inset-bottom, 0px));
  overflow-y: auto;
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif;
}

.pns-col {
  width: 100%;
  max-width: 480px;
  display: flex;
  flex-direction: column;
}

.pns-hero-icon {
  width: 72px;
  height: 72px;
  background: linear-gradient(145deg, var(--ios-blue), #487f76);
  border-radius: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  box-shadow: 0 8px 24px rgba(47, 111, 104, 0.25);
  margin-bottom: 14px;
}

.pns-card {
  position: relative;
  border-radius: 20px;
  overflow: hidden;
  animation: pns-rise 0.5s cubic-bezier(0.16, 1, 0.3, 1) both;
}
.pns-card-light {
  background: #fff;
  padding: 18px 20px 20px;
  box-shadow: 0 2px 16px rgba(0, 0, 0, 0.06);
}
.pns-card-dark {
  background: linear-gradient(155deg, #1c1c1e 0%, #2a2a32 60%, #20202a 100%);
  padding: 20px;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.2);
}

.pns-glow {
  position: absolute;
  top: -50px;
  right: -40px;
  width: 200px;
  height: 200px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(0, 122, 255, 0.3) 0%, transparent 70%);
  pointer-events: none;
}

.pns-step-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 4px;
}
.pns-step-num {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  font-size: 13px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.pns-step-num-blue {
  background: var(--ios-blue);
  color: #fff;
}
.pns-step-num-glass {
  background: rgba(255, 255, 255, 0.16);
  color: #fff;
}
.pns-step-title {
  font-size: 17px;
  font-weight: 700;
  color: var(--ios-label);
  margin: 0;
  letter-spacing: -0.2px;
}
.pns-step-desc {
  font-size: 13px;
  color: var(--ios-secondary);
  margin: 0 0 14px;
  padding-left: 34px;
  line-height: 1.6;
}

.pns-cta {
  width: 100%;
  height: 48px;
  background: var(--ios-blue);
  color: #fff;
  border: none;
  border-radius: 12px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  box-shadow: 0 4px 16px rgba(0, 122, 255, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition: transform 0.12s ease;
}
.pns-cta:active {
  transform: scale(0.98);
}

.pns-later {
  margin-top: 4px;
  width: 100%;
  height: 44px;
  background: none;
  border: none;
  color: var(--ios-secondary);
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

@keyframes pns-rise {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
</style>
