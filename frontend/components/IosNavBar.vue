<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'

interface Props {
  title?: string
  /** true = router.back(); string = navigate to that path */
  back?: boolean | string
  backLabel?: string
  border?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  back: false,
  backLabel: '返回',
  border: true,
})

const router = useRouter()
const showBack = computed(() => props.back !== false)

function onBack() {
  if (typeof props.back === 'string') router.push(props.back)
  else router.back()
}
</script>

<template>
  <header
    :class="[
      'sticky top-0 z-30 ios-safe-top',
      'bg-ios-card/82 backdrop-blur-xl shadow-[inset_0_-1px_0_var(--ios-separator)]',
      border ? 'border-b border-ios-separator' : '',
    ]"
  >
    <div class="grid grid-cols-[1fr_auto_1fr] items-center gap-2 h-12 px-2">
      <div class="flex items-center justify-start min-w-0">
        <button
          v-if="showBack"
          type="button"
          class="flex items-center gap-0.5 pl-1 pr-2 h-9 rounded-ios-sm text-ios-blue font-medium transition-all duration-150 active:scale-[0.96] active:opacity-70"
          @click="onBack"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
            <path d="M15 6l-6 6 6 6" />
          </svg>
          <span class="text-base">{{ backLabel }}</span>
        </button>
        <slot name="leading" />
      </div>

      <div class="flex items-center justify-center min-w-0">
        <slot name="title">
          <h1 class="text-base font-semibold text-ios-label truncate">{{ title }}</h1>
        </slot>
      </div>

      <div class="flex items-center justify-end min-w-0">
        <slot name="action" />
      </div>
    </div>
  </header>
</template>
