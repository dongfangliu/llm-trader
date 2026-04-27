<script setup lang="ts">
import { DEFAULT_APP_NAME } from '~/constants/app'

const props = withDefaults(defineProps<{
  appName?: string
  variant?: 'row' | 'card' | 'button'
}>(), {
  appName: DEFAULT_APP_NAME,
  variant: 'row',
})

const { canShowInstall, showIosGuide, install, dismiss } = usePwaInstall()
</script>

<template>
  <template v-if="canShowInstall">
    <button
      v-if="variant === 'button'"
      type="button"
      style="width: 100%; height: 50px; border-radius: 12px; border: none; background: #007aff; color: white; font-size: 16px; font-weight: 700; cursor: pointer;"
      @click="install"
    >
      添加到桌面
    </button>
    <div
      v-else-if="variant === 'card'"
      style="background: white; border-radius: 16px; padding: 14px 20px; display: flex; align-items: center; justify-content: space-between; gap: 12px; box-shadow: 0 1px 8px rgba(0,0,0,0.06);"
    >
      <button type="button" style="display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0; background: none; border: none; padding: 0; text-align: left; cursor: pointer;" @click="install">
        <div style="width: 36px; height: 36px; border-radius: 10px; background: #eef6ff; display: flex; align-items: center; justify-content: center; font-size: 18px; flex-shrink: 0;">＋</div>
        <div style="min-width: 0;">
          <p style="font-size: 14px; font-weight: 700; color: #000; margin: 0 0 2px;">添加到桌面</p>
          <p style="font-size: 12px; color: #8e8e93; margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">快速打开 {{ appName || DEFAULT_APP_NAME }}</p>
        </div>
      </button>
      <button type="button" aria-label="关闭" style="width: 32px; height: 32px; border-radius: 16px; border: none; background: #f2f2f7; color: #8e8e93; font-size: 20px; line-height: 1; cursor: pointer;" @click="dismiss">×</button>
    </div>
    <button
      v-else
      type="button"
      style="display: flex; align-items: center; justify-content: space-between; width: 100%; padding: 16px 20px; background: none; border: none; border-bottom: 0.5px solid rgba(0,0,0,0.06); cursor: pointer; text-align: left; -webkit-tap-highlight-color: transparent;"
      @click="install"
    >
      <div style="display: flex; align-items: center; gap: 14px;">
        <div style="width: 32px; height: 32px; border-radius: 9px; background: #eef6ff; display: flex; align-items: center; justify-content: center; font-size: 16px;">＋</div>
        <span style="font-size: 16px; color: #1c1c1e; font-weight: 500;">添加到桌面</span>
      </div>
      <svg width="7" height="12" viewBox="0 0 7 12" fill="none"><path d="M1 1l5 5-5 5" stroke="#c7c7cc" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </button>
  </template>

  <Teleport to="body">
    <div v-if="showIosGuide" @click.self="showIosGuide = false" style="position: fixed; inset: 0; z-index: 10000; background: rgba(0,0,0,0.42);">
      <div style="position: absolute; left: 0; right: 0; bottom: 0; background: white; border-radius: 20px 20px 0 0; padding: 10px 20px calc(24px + env(safe-area-inset-bottom, 0px));">
        <div style="width: 36px; height: 4px; background: #e5e5ea; border-radius: 2px; margin: 0 auto 18px;" />
        <h2 style="font-size: 18px; font-weight: 800; color: #000; margin: 0 0 12px;">添加到主屏幕</h2>
        <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 18px;">
          <p style="font-size: 15px; color: #1c1c1e; margin: 0;">1. 点击 Safari 底部的分享按钮</p>
          <p style="font-size: 15px; color: #1c1c1e; margin: 0;">2. 选择“添加到主屏幕”</p>
          <p style="font-size: 15px; color: #1c1c1e; margin: 0;">3. 确认名称后点击“添加”</p>
        </div>
        <button type="button" style="width: 100%; height: 50px; border: none; border-radius: 12px; background: #007aff; color: white; font-size: 17px; font-weight: 700;" @click="showIosGuide = false">知道了</button>
      </div>
    </div>
  </Teleport>
</template>
