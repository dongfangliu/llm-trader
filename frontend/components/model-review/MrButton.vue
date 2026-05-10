<script setup lang="ts">
const props = withDefaults(defineProps<{
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  size?: 'md' | 'sm'
  type?: 'button' | 'submit' | 'reset'
  disabled?: boolean
}>(), {
  variant: 'secondary',
  size: 'md',
  type: 'button',
  disabled: false,
})
</script>

<template>
  <button
    :type="props.type"
    :disabled="props.disabled"
    :class="[
      'mr-btn',
      `mr-btn-${props.variant}`,
      props.size === 'sm' ? 'mr-btn-small' : '',
    ]"
  >
    <slot name="icon" />
    <slot />
  </button>
</template>
