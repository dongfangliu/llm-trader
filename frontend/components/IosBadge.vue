<script setup lang="ts">
interface Props {
  variant?: 'neutral' | 'blue' | 'green' | 'red' | 'orange' | 'gray'
  size?: 'sm' | 'md'
  dot?: boolean
}

withDefaults(defineProps<Props>(), {
  variant: 'neutral',
  size: 'sm',
  dot: false,
})

const variantClasses = {
  neutral: 'bg-ios-fill text-ios-blue ring-1 ring-ios-blue/10',
  blue: 'bg-ios-blue/10 text-ios-blue ring-1 ring-ios-blue/15',
  green: 'bg-ios-green/12 text-ios-green ring-1 ring-ios-green/15',
  red: 'bg-ios-red/10 text-ios-red ring-1 ring-ios-red/15',
  orange: 'bg-ios-orange/12 text-ios-orange ring-1 ring-ios-orange/15',
  gray: 'bg-ios-fill text-ios-secondary ring-1 ring-ios-separator',
}

const dotClasses = {
  neutral: 'bg-ios-blue',
  blue: 'bg-ios-blue',
  green: 'bg-ios-green',
  red: 'bg-ios-red',
  orange: 'bg-ios-orange',
  gray: 'bg-ios-secondary',
}
</script>

<template>
  <span
    :class="[
      'inline-flex items-center gap-1.5 font-semibold rounded-ios-sm whitespace-nowrap',
      size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm',
      variantClasses[variant],
    ]"
  >
    <span v-if="dot" :class="['w-1.5 h-1.5 rounded-full', dotClasses[variant]]" />
    <slot />
  </span>
</template>
