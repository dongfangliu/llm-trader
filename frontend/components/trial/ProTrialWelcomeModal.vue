<script setup lang="ts">
const props = defineProps<{
  appName?: string
}>()

const emit = defineEmits<{
  (e: 'dismiss'): void
}>()

const DEFAULT_PERKS = [
  { icon: '🔍', text: '完整深度研判报告' },
  { icon: '📐', text: '多周期联合分析' },
  { icon: '💹', text: 'AI 买卖点精准定位' },
]
</script>

<template>
  <div style="position: fixed; inset: 0; z-index: 9999; background: #f2f2f7; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 0 0 40px; overflow-y: auto;">

    <!-- App hero -->
    <div style="width: 100%; max-width: 480px; display: flex; flex-direction: column; align-items: center; padding: 48px 16px 24px; text-align: center;">
      <div style="width: 80px; height: 80px; background: linear-gradient(145deg, #007aff, #5856d6); border-radius: 20px; display: flex; align-items: center; justify-content: center; font-size: 40px; box-shadow: 0 8px 24px rgba(0,122,255,0.3); margin-bottom: 16px;">📈</div>
      <h1 style="font-size: 28px; font-weight: 700; letter-spacing: -0.5px; color: #000; margin: 0 0 6px;">{{ props.appName || 'AI 选股' }}</h1>
      <p style="font-size: 15px; color: #8e8e93; margin: 0;">AI 驱动的专业技术分析平台</p>
    </div>

    <!-- Card -->
    <div style="width: 100%; max-width: 480px; padding: 0 16px; display: flex; flex-direction: column; align-items: center;">
      <div style="border-radius: 20px; width: 100%; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.1); margin-bottom: 16px;">

        <!-- Premium header band -->
        <div style="background: linear-gradient(135deg, #1e0a3c 0%, #3b1d8a 50%, #4f46e5 100%); padding: 24px 24px 20px; text-align: center; position: relative;">
          <div style="position: absolute; top: 10px; left: 18px; font-size: 9px; opacity: 0.5; color: white;">✦</div>
          <div style="position: absolute; top: 20px; right: 22px; font-size: 7px; opacity: 0.4; color: white;">✦</div>
          <div style="position: absolute; bottom: 12px; left: 35%; font-size: 6px; opacity: 0.3; color: white;">✦</div>

          <div style="width: 56px; height: 56px; background: rgba(255,255,255,0.15); border-radius: 16px; display: flex; align-items: center; justify-content: center; font-size: 28px; margin: 0 auto 14px; border: 1px solid rgba(255,255,255,0.25);">👑</div>
          <h2 style="font-size: 20px; font-weight: 700; color: #fff; margin: 0 0 6px; letter-spacing: -0.3px;">你获得一次专业版体验</h2>
          <p style="font-size: 13px; color: rgba(255,255,255,0.6); margin: 0;">仅限一次 · 用完即止</p>
        </div>

        <!-- Perks -->
        <div style="background: white; padding: 16px 20px 20px;">
          <p style="font-size: 12px; font-weight: 600; color: #8e8e93; text-transform: uppercase; letter-spacing: 0.06em; margin: 0 0 12px;">本次体验包含</p>
          <div style="display: flex; flex-direction: column; gap: 10px; margin-bottom: 20px;">
            <div v-for="(p, i) in DEFAULT_PERKS" :key="i" style="display: flex; align-items: center; gap: 10px;">
              <div style="width: 32px; height: 32px; border-radius: 8px; flex-shrink: 0; background: linear-gradient(135deg, #7c3aed, #4f46e5); display: flex; align-items: center; justify-content: center; font-size: 15px;">{{ p.icon }}</div>
              <p style="font-size: 14px; color: #1c1c1e; margin: 0; font-weight: 500;">{{ p.text }}</p>
            </div>
          </div>

          <button
            @click="emit('dismiss')"
            style="width: 100%; height: 50px; background: linear-gradient(135deg, #7c3aed, #4f46e5); color: white; border: none; border-radius: 12px; font-size: 17px; font-weight: 600; cursor: pointer; -webkit-tap-highlight-color: transparent; margin-bottom: 12px; box-shadow: 0 4px 16px rgba(124,58,237,0.35);"
          >
            立即开始体验
          </button>

          <p style="font-size: 12px; color: #aeaeb2; margin: 0; line-height: 1.6; text-align: center;">
            点击即同意
            <NuxtLink to="/terms" style="color: #8e8e93; text-decoration: none;">服务条款</NuxtLink>
            与
            <NuxtLink to="/privacy" style="color: #8e8e93; text-decoration: none;">隐私政策</NuxtLink>
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
