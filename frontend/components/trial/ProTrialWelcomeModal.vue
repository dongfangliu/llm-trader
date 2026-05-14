<script setup lang="ts">
import { DEFAULT_APP_NAME } from '~/constants/app'

const props = defineProps<{
  appName?: string
}>()

const emit = defineEmits<{
  (e: 'dismiss'): void
}>()

const DEFAULT_PERKS = [
  { text: '完整深度研判报告' },
  { text: '多周期联合分析' },
  { text: 'AI 买卖点精准定位' },
]
</script>

<template>
  <div style="position: fixed; inset: 0; z-index: 9999; background: var(--ios-bg); display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 0 0 40px; overflow-y: auto;">

    <!-- App hero -->
    <div style="width: 100%; max-width: 480px; display: flex; flex-direction: column; align-items: center; padding: 48px 16px 24px; text-align: center;">
      <div style="width: 80px; height: 80px; background: linear-gradient(145deg, var(--ios-blue), #487f76); border-radius: 20px; display: flex; align-items: center; justify-content: center; color: white; box-shadow: 0 8px 24px rgba(47,111,104,0.25); margin-bottom: 16px;">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19V5"/><path d="M4 19h16"/><path d="m8 15 3.5-4 3 2.5L20 7"/></svg>
      </div>
      <h1 style="font-size: 28px; font-weight: 700; letter-spacing: 0; color: var(--ios-label); margin: 0 0 6px;">{{ props.appName || DEFAULT_APP_NAME }}</h1>
      <p style="font-size: 15px; color: var(--ios-secondary); margin: 0;">AI 驱动的专业技术分析平台</p>
    </div>

    <!-- Card -->
    <div style="width: 100%; max-width: 480px; padding: 0 16px; display: flex; flex-direction: column; align-items: center;">
      <div style="border-radius: 20px; width: 100%; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.1); margin-bottom: 16px;">

        <!-- Premium header band -->
        <div style="background: linear-gradient(150deg, #2a2a32 0%, #1c1c1e 100%); padding: 24px 24px 20px; text-align: center; position: relative;">
          <div style="width: 56px; height: 56px; background: rgba(255,255,255,0.12); border-radius: 16px; display: flex; align-items: center; justify-content: center; margin: 0 auto 14px; border: 1px solid rgba(255,255,255,0.18); color: #fff;">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7l4 4 5-7 5 7 4-4-2 13H5L3 7z"/></svg>
          </div>
          <h2 style="font-size: 20px; font-weight: 700; color: #fff; margin: 0 0 6px; letter-spacing: -0.3px;">你获得一次专业版体验</h2>
          <p style="font-size: 13px; color: rgba(255,255,255,0.6); margin: 0;">仅限一次 · 用完即止</p>
        </div>

        <!-- Perks -->
        <div style="background: white; padding: 16px 20px 20px;">
          <p style="font-size: 12px; font-weight: 600; color: var(--ios-secondary); text-transform: uppercase; letter-spacing: 0.06em; margin: 0 0 12px;">本次体验包含</p>
          <div style="display: flex; flex-direction: column; gap: 10px; margin-bottom: 20px;">
            <div v-for="(p, i) in DEFAULT_PERKS" :key="i" style="display: flex; align-items: center; gap: 10px;">
              <div style="width: 32px; height: 32px; border-radius: 8px; flex-shrink: 0; background: rgba(47,111,104,0.12); color: var(--ios-blue); display: flex; align-items: center; justify-content: center;">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
              </div>
              <p style="font-size: 14px; color: var(--ios-label); margin: 0; font-weight: 500;">{{ p.text }}</p>
            </div>
          </div>

          <button
            @click="emit('dismiss')"
            style="width: 100%; height: 50px; background: linear-gradient(135deg, var(--ios-blue), var(--ios-blue)); color: white; border: none; border-radius: 12px; font-size: 17px; font-weight: 600; cursor: pointer; -webkit-tap-highlight-color: transparent; margin-bottom: 12px; box-shadow: 0 4px 16px rgba(0,122,255,0.35);"
          >
            立即开始体验
          </button>

          <p style="font-size: 12px; color: var(--ios-tertiary); margin: 0; line-height: 1.6; text-align: center;">
            点击即同意
            <NuxtLink to="/terms" style="color: var(--ios-secondary); text-decoration: none;">服务条款</NuxtLink>
            与
            <NuxtLink to="/privacy" style="color: var(--ios-secondary); text-decoration: none;">隐私政策</NuxtLink>
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
