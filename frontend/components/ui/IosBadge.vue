<script setup lang="ts">
interface Props {
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'premium' | 'basic'
  size?: 'sm' | 'md'
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'default',
  size: 'md',
})

const variantClasses = {
  default: 'bg-ios-fill text-ios-secondary',
  success: 'bg-ios-green/10 text-ios-green',
  warning: 'bg-ios-orange/10 text-ios-orange',
  danger: 'bg-ios-red/10 text-ios-red',
  info: 'bg-ios-blue/10 text-ios-blue',
  premium: 'bg-gradient-to-r from-ios-orange/20 to-ios-yellow/20 text-ios-orange',
  basic: 'bg-ios-blue/10 text-ios-blue',
}

const sizeClasses = {
  sm: 'text-xs px-2 py-0.5',
  md: 'text-sm px-2.5 py-1',
}
</script>

<template>
  <span
    :class="[
      'inline-flex items-center rounded-full font-medium',
      variantClasses[variant],
      sizeClasses[size],
    ]"
  >
    <slot />
  </span>
</template>
