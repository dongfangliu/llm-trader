<script setup lang="ts">
import { DEFAULT_APP_NAME } from '~/constants/app'

const props = defineProps<{
  appName?: string
}>()

const emit = defineEmits<{
  (e: 'dismiss'): void
}>()

const PERK_BG = [
  'linear-gradient(135deg, var(--ios-blue), #487f76)',
  'linear-gradient(135deg, var(--ios-green), #477f59)',
  'linear-gradient(135deg, var(--ios-orange), #b18a20)',
]

const DEFAULT_PERKS = [
  { text: '每天 1 次免费深度研判' },
  { text: '跨设备同步，数据不丢失' },
  { text: '邀请好友获得额外永久额度' },
]
</script>

<template>
  <div style="position: fixed; inset: 0; z-index: 9999; background: var(--ios-bg); display: flex; flex-direction: column; align-items: center; padding: 0 0 calc(40px + env(safe-area-inset-bottom, 0px)); overflow-y: auto;">

    <!-- App hero -->
    <div style="width: 100%; max-width: 480px; display: flex; flex-direction: column; align-items: center; padding: 48px 16px 24px; text-align: center;">
      <div style="width: 80px; height: 80px; background: linear-gradient(145deg, var(--ios-blue), #487f76); border-radius: 20px; display: flex; align-items: center; justify-content: center; color: white; box-shadow: 0 8px 24px rgba(47,111,104,0.25); margin-bottom: 16px;">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19V5"/><path d="M4 19h16"/><path d="m8 15 3.5-4 3 2.5L20 7"/></svg>
      </div>
      <h1 style="font-size: 28px; font-weight: 700; letter-spacing: 0; color: var(--ios-label); margin: 0 0 6px;">{{ props.appName || DEFAULT_APP_NAME }}</h1>
      <p style="font-size: 15px; color: var(--ios-secondary); margin: 0;">AI 驱动的专业技术分析平台</p>
    </div>

    <div style="width: 100%; max-width: 480px; padding: 0 16px; display: flex; flex-direction: column; gap: 12px;">
      <!-- Trial ended card -->
      <div style="background: white; border-radius: 20px; overflow: hidden; box-shadow: 0 2px 16px rgba(0,0,0,0.08);">
        <!-- Dark header -->
        <div style="background: linear-gradient(135deg, #1c1c1e 0%, #2c2c2e 100%); padding: 20px 24px; text-align: center;">
          <div style="width: 44px; height: 44px; border-radius: 14px; margin: 0 auto 10px; display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,0.10); color: white;">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2h4"/><path d="M12 14v-4"/><circle cx="12" cy="14" r="8"/></svg>
          </div>
          <h2 style="font-size: 20px; font-weight: 700; color: #fff; margin: 0 0 4px; letter-spacing: -0.3px;">专业版体验已结束</h2>
          <p style="font-size: 13px; color: rgba(255,255,255,0.5); margin: 0;">游客仅限一次免费体验</p>
        </div>

        <!-- Register perks -->
        <div style="padding: 16px 20px 20px;">
          <p style="font-size: 12px; font-weight: 600; color: var(--ios-secondary); text-transform: uppercase; letter-spacing: 0.06em; margin: 0 0 12px;">注册账号，每天继续使用</p>
          <div style="display: flex; flex-direction: column; gap: 10px; margin-bottom: 20px;">
            <div v-for="(p, i) in DEFAULT_PERKS" :key="i" style="display: flex; align-items: center; gap: 10px;">
              <div :style="{ width: '32px', height: '32px', borderRadius: '8px', flexShrink: 0, background: PERK_BG[i % PERK_BG.length], display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', boxShadow: '0 2px 6px rgba(0,0,0,0.12)' }">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
              </div>
              <p style="font-size: 14px; color: var(--ios-label); margin: 0; font-weight: 500;">{{ p.text }}</p>
            </div>
          </div>

          <NuxtLink
            to="/register"
            style="display: block; width: 100%; height: 50px; background: var(--ios-blue); color: white; border-radius: 12px; font-size: 17px; font-weight: 600; text-decoration: none; text-align: center; line-height: 50px; margin-bottom: 10px; box-shadow: 0 4px 16px rgba(0,122,255,0.3); -webkit-tap-highlight-color: transparent;"
          >
            免费注册，继续使用
          </NuxtLink>

          <NuxtLink
            to="/login"
            style="display: block; width: 100%; height: 44px; background: none; color: var(--ios-blue); font-size: 15px; font-weight: 500; text-decoration: none; line-height: 44px; text-align: center; -webkit-tap-highlight-color: transparent;"
          >
            已有账号？登录
          </NuxtLink>
        </div>
      </div>

      <!-- Upgrade teaser strip -->
      <div style="background: white; border-radius: 16px; padding: 14px 20px; display: flex; align-items: center; justify-content: space-between; box-shadow: 0 1px 8px rgba(0,0,0,0.06);">
        <div>
          <p style="font-size: 14px; font-weight: 600; color: var(--ios-label); margin: 0 0 2px;">想要更多分析次数？</p>
          <p style="font-size: 12px; color: var(--ios-secondary); margin: 0;">标准版 ¥19.9/月 · 专业版 ¥49/月</p>
        </div>
        <NuxtLink to="/upgrade" style="font-size: 13px; font-weight: 600; color: var(--ios-blue); text-decoration: none; white-space: nowrap;">了解套餐</NuxtLink>
      </div>

      <PwaInstallButton :appName="props.appName || DEFAULT_APP_NAME" variant="card" />

      <p style="font-size: 12px; color: var(--ios-tertiary); text-align: center; line-height: 1.6; margin: 4px 0 0;">
        注册即表示同意
        <NuxtLink to="/terms" style="color: var(--ios-secondary); text-decoration: none;">服务条款</NuxtLink>
        与
        <NuxtLink to="/privacy" style="color: var(--ios-secondary); text-decoration: none;">隐私政策</NuxtLink>
      </p>
    </div>
  </div>
</template>
