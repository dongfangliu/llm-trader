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
  inputmode?: string
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
  keyup: [event: KeyboardEvent]
}>()

const slots = defineSlots<{ suffix?: () => any }>()
</script>

<template>
  <div class="w-full flex flex-col gap-1.5">
    <label v-if="label" class="text-sm font-medium text-ios-label">
      {{ label }}
      <span v-if="required" class="text-ios-red ml-0.5">*</span>
    </label>
    <div class="relative">
      <input
        :value="modelValue"
        :type="type"
        :placeholder="placeholder"
        :disabled="disabled"
        :maxlength="maxlength"
        :autocomplete="autocomplete"
        :inputmode="inputmode"
        :class="[
          'w-full px-4 py-3 rounded-ios bg-ios-card border transition-all duration-150',
          'text-ios-label text-base placeholder:text-ios-tertiary',
          'focus:outline-none focus:ring-2',
          'min-h-touch',
          slots.suffix ? 'pr-12' : '',
          error
            ? 'border-ios-red focus:border-ios-red focus:ring-ios-red/20'
            : 'border-ios-separator focus:border-ios-blue focus:ring-ios-blue/15',
          disabled ? 'opacity-50 cursor-not-allowed bg-ios-bg' : '',
        ]"
        @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
        @change="emit('change', ($event.target as HTMLInputElement).value)"
        @blur="emit('blur', $event)"
        @keyup="emit('keyup', $event)"
      />
      <div
        v-if="slots.suffix"
        class="absolute inset-y-0 right-0 flex items-center pr-3"
      >
        <slot name="suffix" />
      </div>
    </div>
    <p v-if="error" class="text-sm text-ios-red">{{ error }}</p>
    <p v-else-if="hint" class="text-sm text-ios-secondary">{{ hint }}</p>
  </div>
</template>
