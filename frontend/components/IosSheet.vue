<script setup lang="ts">
import { computed, watch, nextTick } from 'vue'

interface Props {
  modelValue?: boolean
  title?: string
  showHandle?: boolean
  fullHeight?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: false,
  showHandle: true,
  fullHeight: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  close: []
}>()

function close() {
  emit('update:modelValue', false)
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <Transition name="sheet">
      <div
        v-if="modelValue"
        class="fixed inset-0 z-50 flex flex-col justify-end"
        @click.self="close"
      >
        <!-- Backdrop -->
        <div class="absolute inset-0 bg-black/40" @click="close" />

        <!-- Sheet content -->
        <div
          :class="[
            'relative bg-ios-card rounded-t-ios-lg',
            'safe-area-bottom',
            fullHeight ? 'h-[90vh]' : 'max-h-[85vh]',
            'flex flex-col',
            'shadow-ios-lg',
          ]"
          @click.stop
        >
          <!-- Handle -->
          <div v-if="showHandle" class="flex justify-center pt-3 pb-1 flex-shrink-0">
            <div class="w-10 h-1 rounded-full bg-ios-tertiary" />
          </div>

          <!-- Header -->
          <div v-if="title" class="flex items-center justify-between px-4 py-3 border-b border-ios-separator flex-shrink-0">
            <h2 class="text-lg font-semibold text-ios-label">{{ title }}</h2>
            <button
              class="w-8 h-8 flex items-center justify-center rounded-full bg-ios-fill text-ios-secondary hover:bg-ios-bg2 transition-colors"
              @click="close"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <!-- Scrollable content -->
          <div class="flex-1 overflow-y-auto overscroll-contain">
            <slot />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.sheet-enter-active,
.sheet-leave-active {
  transition: opacity 0.25s ease;
}

.sheet-enter-active .relative,
.sheet-leave-active .relative {
  transition: transform 0.25s ease;
}

.sheet-enter-from,
.sheet-leave-to {
  opacity: 0;
}

.sheet-enter-from .relative,
.sheet-leave-to .relative {
  transform: translateY(100%);
}
</style>
