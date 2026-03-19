<script setup lang="ts">
const emit = defineEmits<{
  dismiss: []
}>()
</script>

<template>
  <div class="fixed inset-0 bg-ios-bg z-50 flex flex-col">
    <!-- Safe area top -->
    <div class="flex-1 flex flex-col items-center justify-center px-6 py-8">
      <!-- Icon -->
      <div class="text-6xl mb-6">🔓</div>

      <!-- Title -->
      <h2 class="text-2xl font-bold text-ios-label text-center mb-2">
        专业版体验已结束
      </h2>
      <p class="text-ios-secondary text-center mb-2">
        游客仅限一次免费体验
      </p>

      <!-- Benefits -->
      <div class="w-full max-w-sm my-6">
        <p class="text-sm font-semibold text-ios-secondary mb-3">注册账号，每天继续使用</p>
        <div class="space-y-3">
          <div class="flex items-center gap-3 bg-ios-card rounded-ios px-4 py-3 shadow-ios">
            <span class="text-xl">📊</span>
            <p class="text-sm text-ios-label">每天 3 次免费深度研判</p>
          </div>
          <div class="flex items-center gap-3 bg-ios-card rounded-ios px-4 py-3 shadow-ios">
            <span class="text-xl">☁️</span>
            <p class="text-sm text-ios-label">跨设备同步，数据不丢失</p>
          </div>
          <div class="flex items-center gap-3 bg-ios-card rounded-ios px-4 py-3 shadow-ios">
            <span class="text-xl">⭐</span>
            <p class="text-sm text-ios-label">邀请好友获得额外永久额度</p>
          </div>
        </div>
      </div>

      <!-- CTA buttons -->
      <div class="w-full max-w-sm space-y-3">
        <NuxtLink to="/register" @click="emit('dismiss')">
          <IosButton variant="primary" size="lg" :fullWidth="true">
            免费注册，继续使用
          </IosButton>
        </NuxtLink>

        <div class="text-center">
          <p class="text-xs text-ios-secondary mb-2">标准版 ¥19.9/月 · 专业版 ¥49/月</p>
          <NuxtLink to="/upgrade" @click="emit('dismiss')" class="text-ios-blue text-sm font-medium">
            查看付费套餐 →
          </NuxtLink>
        </div>

        <button
          class="w-full text-center text-ios-secondary text-sm py-2 min-h-[44px]"
          @click="emit('dismiss')"
        >
          稍后再说
        </button>
      </div>
    </div>
  </div>
</template>
