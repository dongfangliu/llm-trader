<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useMotion, useReducedMotion } from '@vueuse/motion'

const props = withDefaults(defineProps<{
  delay?: number
  y?: number
  tag?: string
}>(), {
  delay: 0,
  y: 12,
  tag: 'div',
})

const el = ref<HTMLElement | null>(null)
const prefersReducedMotion = useReducedMotion()

onMounted(() => {
  if (prefersReducedMotion.value || !el.value) return
  const motion = useMotion(el, {
    initial: { opacity: 0, y: props.y },
    enter: {
      opacity: 1,
      y: 0,
      transition: {
        delay: props.delay / 1000,
        type: 'spring',
        stiffness: 260,
        damping: 28,
      },
    },
  })
  motion.variant.value = 'enter'
})
</script>

<template>
  <component
    :is="props.tag"
    ref="el"
    class="mr-motion"
    :style="{ '--mr-motion-delay': `${props.delay}ms`, '--mr-motion-y': `${props.y}px` }"
  >
    <slot />
  </component>
</template>
