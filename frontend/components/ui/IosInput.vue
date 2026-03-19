<script setup lang="ts">
interface Props {
  modelValue?: string | number
  label?: string
  placeholder?: string
  type?: string
  error?: string
  hint?: string
  disabled?: boolean
  required?: boolean
  maxlength?: number
  autocomplete?: string
}

const props = withDefaults(defineProps<Props>(), {
  type: 'text',
  disabled: false,
  required: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  change: [value: string]
  blur: [event: FocusEvent]
}>()
</script>

<template>
  <div class="w-full">
    <label v-if="label" class="block text-sm font-medium text-ios-label mb-1.5">
      {{ label }}
      <span v-if="required" class="text-ios-red ml-0.5">*</span>
    </label>
    <input
      :value="modelValue"
      :type="type"
      :placeholder="placeholder"
      :disabled="disabled"
      :maxlength="maxlength"
      :autocomplete="autocomplete"
      :class="[
        'w-full px-4 py-3 rounded-ios bg-ios-card border transition-all duration-150',
        'text-ios-label text-base placeholder:text-ios-tertiary',
        'focus:outline-none focus:ring-2',
        'min-h-[44px]',
        error
          ? 'border-ios-red focus:border-ios-red focus:ring-ios-red/20'
          : 'border-ios-separator focus:border-ios-blue focus:ring-ios-blue/20',
        disabled ? 'opacity-50 cursor-not-allowed bg-ios-bg' : '',
      ]"
      @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      @change="emit('change', ($event.target as HTMLInputElement).value)"
      @blur="emit('blur', $event)"
    />
    <p v-if="error" class="mt-1 text-sm text-ios-red">{{ error }}</p>
    <p v-else-if="hint" class="mt-1 text-sm text-ios-secondary">{{ hint }}</p>
  </div>
</template>
