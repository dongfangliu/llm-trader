<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  padding?: 'none' | 'sm' | 'md' | 'lg'
  rounded?: 'ios-sm' | 'ios' | 'ios-lg' | 'ios-xl'
  /** flat = border only, raised = soft shadow, floating = prominent shadow */
  elevation?: 'flat' | 'raised' | 'floating'
  bordered?: boolean
  /** uppercase grouping label rendered above the card, iOS settings-list style */
  sectionLabel?: string
  /** adds tactile press feedback for tappable cards */
  interactive?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  padding: 'md',
  rounded: 'ios-lg',
  elevation: 'raised',
  bordered: false,
  interactive: false,
})

const paddingClasses = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-5',
}

const elevationClasses = {
  flat: 'shadow-none',
  raised: 'shadow-ios',
  floating: 'shadow-ios-lg',
}

const bordered = computed(() => props.bordered || props.elevation === 'flat')
</script>

<template>
  <div>
    <p
      v-if="sectionLabel"
      class="px-1 mb-2 text-xs font-semibold uppercase tracking-wide text-ios-secondary"
    >
      {{ sectionLabel }}
    </p>
    <div
      :class="[
        'bg-ios-card/95 backdrop-blur-xl',
        `rounded-${rounded}`,
        elevationClasses[elevation],
        bordered ? 'border border-ios-separator' : '',
        paddingClasses[padding],
        interactive ? 'fin-action hover:border-ios-blue/30 active:scale-[0.99] cursor-pointer' : '',
      ]"
    >
      <slot />
    </div>
  </div>
</template>
