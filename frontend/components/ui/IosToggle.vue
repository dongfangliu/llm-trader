<script setup lang="ts">
interface Props {
  modelValue?: boolean
  label?: string
  disabled?: boolean
  description?: string
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: false,
  disabled: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

function toggle() {
  if (!props.disabled) {
    emit('update:modelValue', !props.modelValue)
  }
}
</script>

<template>
  <div class="flex items-center justify-between gap-3" :class="disabled ? 'opacity-50' : ''">
    <div v-if="label" class="flex-1">
      <p class="text-base text-ios-label">{{ label }}</p>
      <p v-if="description" class="text-sm text-ios-secondary mt-0.5">{{ description }}</p>
    </div>
    <button
      :disabled="disabled"
      :class="[
        'relative inline-flex items-center rounded-full transition-colors duration-200',
        'w-[51px] h-[31px] flex-shrink-0',
        modelValue ? 'bg-ios-green' : 'bg-ios-bg2',
        disabled ? 'cursor-not-allowed' : 'cursor-pointer',
      ]"
      @click="toggle"
    >
      <span
        :class="[
          'inline-block w-[27px] h-[27px] rounded-full bg-white shadow-md',
          'transform transition-transform duration-200',
          modelValue ? 'translate-x-[22px]' : 'translate-x-[2px]',
        ]"
      />
    </button>
  </div>
</template>
