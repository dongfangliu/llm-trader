<script setup lang="ts">
interface Props {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'success'
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
  primary: 'bg-ios-blue text-white hover:opacity-90',
  secondary: 'bg-white text-ios-blue border border-ios-separator hover:bg-gray-50',
  danger: 'bg-ios-red text-white hover:opacity-90',
  ghost: 'bg-transparent text-ios-blue hover:bg-ios-fill',
  success: 'bg-ios-green text-white hover:opacity-90',
}

const sizeClasses = {
  sm: 'px-4 py-2 text-sm min-h-[36px]',
  md: 'px-6 py-3 text-base min-h-[44px]',
  lg: 'px-8 py-4 text-lg min-h-[50px]',
}
</script>

<template>
  <button
    :type="type"
    :disabled="disabled || loading"
    :class="[
      'rounded-ios font-semibold transition-all duration-150 select-none',
      'flex items-center justify-center gap-2',
      'active:opacity-80 active:scale-95',
      variantClasses[variant],
      sizeClasses[size],
      fullWidth ? 'w-full' : '',
      (disabled || loading) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
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
