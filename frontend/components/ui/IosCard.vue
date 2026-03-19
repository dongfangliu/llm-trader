<script setup lang="ts">
interface Props {
  padding?: 'none' | 'sm' | 'md' | 'lg'
  shadow?: boolean
  rounded?: 'ios-sm' | 'ios' | 'ios-lg'
  bordered?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  padding: 'md',
  shadow: true,
  rounded: 'ios',
  bordered: false,
})

const paddingClasses = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6',
}
</script>

<template>
  <div
    :class="[
      'bg-ios-card',
      `rounded-${rounded}`,
      shadow ? 'shadow-ios' : '',
      bordered ? 'border border-ios-separator' : '',
      paddingClasses[padding],
    ]"
  >
    <slot />
  </div>
</template>
