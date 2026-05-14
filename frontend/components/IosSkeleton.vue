<script setup lang="ts">
interface Props {
  width?: string
  height?: string
  rounded?: 'sm' | 'md' | 'lg' | 'full'
  /** render N stacked lines (last one shorter) */
  lines?: number
}

withDefaults(defineProps<Props>(), {
  width: '100%',
  height: '1rem',
  rounded: 'md',
  lines: 1,
})

const roundedMap = {
  sm: '6px',
  md: '10px',
  lg: '16px',
  full: '9999px',
}
</script>

<template>
  <div v-if="lines > 1" class="flex flex-col gap-2">
    <span
      v-for="n in lines"
      :key="n"
      class="ios-skeleton block"
      :style="{
        width: n === lines ? '60%' : '100%',
        height,
        borderRadius: roundedMap[rounded],
      }"
    />
  </div>
  <span
    v-else
    class="ios-skeleton block"
    :style="{ width, height, borderRadius: roundedMap[rounded] }"
  />
</template>

<style scoped>
.ios-skeleton {
  position: relative;
  overflow: hidden;
  background: var(--ios-fill);
}
.ios-skeleton::after {
  content: '';
  position: absolute;
  inset: 0;
  transform: translateX(-100%);
  background: linear-gradient(
    90deg,
    transparent,
    rgba(255, 255, 255, 0.55),
    transparent
  );
  animation: ios-skeleton-shimmer 1.4s ease-in-out infinite;
}
@keyframes ios-skeleton-shimmer {
  100% {
    transform: translateX(100%);
  }
}
@media (prefers-reduced-motion: reduce) {
  .ios-skeleton::after {
    animation: none;
  }
}
</style>
