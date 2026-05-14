<script setup lang="ts">
import { computed, resolveComponent } from 'vue'

interface Props {
  title?: string
  subtitle?: string
  /** when set, the row becomes a NuxtLink */
  to?: string
  /** show the trailing chevron (only when interactive) */
  chevron?: boolean
  /** tighter vertical padding */
  dense?: boolean
  /** accent color for the title (used for destructive rows etc.) */
  tone?: 'default' | 'blue' | 'red'
  /** false = plain informational row (no tap feedback, no chevron) */
  interactive?: boolean
  disabled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  chevron: true,
  dense: false,
  tone: 'default',
  interactive: true,
  disabled: false,
})

const emit = defineEmits<{ click: [event: MouseEvent] }>()

const isInteractive = computed(() => props.interactive && !props.disabled)

const tag = computed(() => {
  if (!isInteractive.value) return 'div'
  if (props.to) return resolveComponent('NuxtLink')
  return 'button'
})

const toneClass = {
  default: 'text-ios-label',
  blue: 'text-ios-blue',
  red: 'text-ios-red',
}
</script>

<template>
  <component
    :is="tag"
    :to="isInteractive && to ? to : undefined"
    :type="tag === 'button' ? 'button' : undefined"
    :class="[
      'w-full flex items-center gap-3 text-left transition-colors duration-150',
      dense ? 'py-2.5 px-4' : 'py-3 px-4',
      'min-h-touch',
      isInteractive ? 'active:bg-ios-fill cursor-pointer' : 'cursor-default',
      disabled ? 'opacity-50' : '',
    ]"
    @click="isInteractive && emit('click', $event)"
  >
    <span v-if="$slots.icon" class="flex-shrink-0 flex items-center">
      <slot name="icon" />
    </span>

    <span class="flex-1 min-w-0">
      <slot>
        <span :class="['block text-base font-medium truncate', toneClass[tone]]">{{ title }}</span>
        <span v-if="subtitle" class="block text-sm text-ios-secondary truncate mt-0.5">{{ subtitle }}</span>
      </slot>
    </span>

    <span v-if="$slots.trailing" class="flex-shrink-0 flex items-center text-ios-secondary">
      <slot name="trailing" />
    </span>
    <svg
      v-else-if="chevron && isInteractive"
      class="flex-shrink-0 text-ios-tertiary"
      width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  </component>
</template>
