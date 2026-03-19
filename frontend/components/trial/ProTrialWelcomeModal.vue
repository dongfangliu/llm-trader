<script setup lang="ts">
const emit = defineEmits<{
  dismiss: []
}>()

const perks = [
  { icon: '🔍', text: '完整深度研判报告' },
  { icon: '📐', text: '多周期联合分析' },
  { icon: '💹', text: 'AI 买卖点精准定位' },
]
</script>

<template>
  <IosSheet :modelValue="true" @update:modelValue="emit('dismiss')" :showHandle="true">
    <div class="px-6 pt-2 pb-8">
      <!-- Header -->
      <div class="text-center mb-6">
        <div class="text-5xl mb-3">🎉</div>
        <h2 class="text-xl font-bold text-ios-label">你获得一次专业版体验</h2>
        <p class="text-ios-secondary text-sm mt-1">仅限一次 · 用完即止</p>
      </div>

      <!-- Perks -->
      <div class="mb-6">
        <p class="text-sm font-semibold text-ios-secondary mb-3">本次体验包含</p>
        <div class="space-y-2">
          <div
            v-for="perk in perks"
            :key="perk.text"
            class="flex items-center gap-3 py-2.5"
          >
            <span class="text-xl w-8 text-center flex-shrink-0">{{ perk.icon }}</span>
            <span class="text-sm text-ios-label">{{ perk.text }}</span>
          </div>
        </div>
      </div>

      <IosButton variant="primary" size="lg" :fullWidth="true" @click="emit('dismiss')">
        立即开始体验
      </IosButton>
    </div>
  </IosSheet>
</template>
