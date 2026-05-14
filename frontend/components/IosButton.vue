<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'success' | 'link'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  disabled?: boolean
  fullWidth?: boolean
  type?: 'button' | 'submit' | 'reset'
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'primary',
  size: 'md',
  loading: false,
  disabled: false,
  fullWidth: false,
  type: 'button',
})

const emit = defineEmits<{
  click: [event: MouseEvent]
}>()

const variantClasses = {
  primary: 'bg-ios-blue text-white hover:opacity-90 shadow-ios-sm',
  secondary: 'bg-ios-card text-ios-blue border border-ios-separator hover:bg-ios-bg',
  danger: 'bg-ios-red text-white hover:opacity-90 shadow-ios-sm',
  ghost: 'bg-transparent text-ios-blue hover:bg-ios-fill',
  success: 'bg-ios-green text-white hover:opacity-90 shadow-ios-sm',
  link: 'bg-transparent text-ios-blue hover:opacity-70 font-medium',
}

const sizeClasses = {
  sm: 'px-4 py-2 text-sm min-h-[36px] rounded-ios-sm',
  md: 'px-6 py-3 text-base min-h-touch rounded-ios',
  lg: 'px-8 py-4 text-lg min-h-[52px] rounded-ios',
}

const isLink = computed(() => props.variant === 'link')
</script>

<template>
  <button
    :type="type"
    :disabled="disabled || loading"
    :class="[
      'font-semibold transition-all duration-150 select-none',
      'inline-flex items-center justify-center gap-2',
      'active:scale-[0.97] active:opacity-80',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ios-blue/40',
      variantClasses[variant],
      isLink ? 'px-0 py-0 min-h-0 text-base' : sizeClasses[size],
      fullWidth ? 'w-full' : '',
      (disabled || loading) ? 'opacity-50 cursor-not-allowed active:scale-100' : 'cursor-pointer',
    ]"
    @click="!disabled && !loading && emit('click', $event)"
  >
    <svg v-if="loading" class="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
    <slot />
  </button>
</template>
