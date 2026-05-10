<script setup lang="ts">
defineProps<{
  label: string
  value: string | number
  sub?: string
}>()
</script>

<template>
  <div class="mr-metric">
    <div>
      <span class="mr-metric-label">{{ label }}</span>
      <strong class="mr-metric-value">{{ value }}</strong>
      <span v-if="sub" class="mr-metric-sub">{{ sub }}</span>
    </div>
    <div v-if="$slots.icon" class="mr-metric-icon">
      <slot name="icon" />
    </div>
  </div>
</template>
