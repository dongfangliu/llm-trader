<script setup lang="ts">
import { PhCircleNotch, PhInfo, PhWarningCircle } from '@phosphor-icons/vue'

const props = withDefaults(defineProps<{
  title: string
  text?: string
  variant?: 'empty' | 'loading' | 'error'
}>(), {
  variant: 'empty',
})
</script>

<template>
  <div class="mr-state">
    <div>
      <div class="mr-state-icon">
        <PhCircleNotch v-if="props.variant === 'loading'" :size="20" weight="bold" class="mr-spin" />
        <PhWarningCircle v-else-if="props.variant === 'error'" :size="20" weight="bold" />
        <PhInfo v-else :size="20" weight="bold" />
      </div>
      <div class="mr-state-title">{{ title }}</div>
      <p v-if="text" class="mr-state-text">{{ text }}</p>
      <slot />
    </div>
  </div>
</template>
