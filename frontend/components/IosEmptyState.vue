<script setup lang="ts">
interface Props {
  title: string
  description?: string
  /** vertical padding scale */
  size?: 'sm' | 'md' | 'lg'
}

withDefaults(defineProps<Props>(), {
  size: 'md',
})

const padMap = {
  sm: 'py-8',
  md: 'py-14',
  lg: 'py-20',
}
</script>

<template>
  <div :class="['flex flex-col items-center text-center px-6', padMap[size]]">
    <div
      class="mb-4 flex items-center justify-center w-14 h-14 rounded-ios-lg bg-ios-fill text-ios-blue ring-1 ring-ios-blue/10"
    >
      <slot name="icon">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="4" width="18" height="16" rx="3" />
          <path d="M3 9h18M8 14h8" />
        </svg>
      </slot>
    </div>
    <p class="text-base font-semibold text-ios-label">{{ title }}</p>
    <p v-if="description" class="mt-1.5 text-sm text-ios-secondary leading-relaxed max-w-[34ch]">
      {{ description }}
    </p>
    <div v-if="$slots.action" class="mt-5">
      <slot name="action" />
    </div>
  </div>
</template>
