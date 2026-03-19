<script setup lang="ts">
interface Plan {
  id: string
  name: string
  price: string
  period: string
  daily_limit: number
  tier: string
  features: string[]
  afdian_link?: string
  is_recommended?: boolean
}

const props = defineProps<{
  plan: Plan
  selected?: boolean
}>()

const emit = defineEmits<{
  select: [plan: Plan]
}>()
</script>

<template>
  <div
    :class="[
      'relative rounded-ios-lg border-2 transition-all duration-150 overflow-hidden cursor-pointer',
      'bg-ios-card shadow-ios',
      selected || plan.is_recommended
        ? 'border-ios-blue'
        : 'border-ios-separator',
    ]"
    @click="emit('select', plan)"
  >
    <!-- Recommended badge -->
    <div
      v-if="plan.is_recommended"
      class="absolute top-0 right-0 bg-ios-blue text-white text-xs font-bold px-3 py-1 rounded-bl-ios"
    >
      推荐
    </div>

    <div class="p-5">
      <!-- Plan name and price -->
      <div class="mb-4">
        <h3 class="text-lg font-bold text-ios-label">{{ plan.name }}</h3>
        <div class="flex items-baseline gap-1 mt-1">
          <span class="text-3xl font-bold text-ios-blue">¥{{ plan.price }}</span>
          <span class="text-ios-secondary text-sm">/{{ plan.period }}</span>
        </div>
        <p class="text-sm text-ios-secondary mt-1">每日 {{ plan.daily_limit }} 次分析</p>
      </div>

      <!-- Features list -->
      <div class="space-y-2 mb-5">
        <div
          v-for="feature in plan.features"
          :key="feature"
          class="flex items-center gap-2 text-sm text-ios-label"
        >
          <span class="text-ios-green text-base flex-shrink-0">✓</span>
          {{ feature }}
        </div>
      </div>

      <!-- Select indicator -->
      <div
        :class="[
          'w-full py-2 rounded-ios text-center text-sm font-semibold transition-all',
          selected
            ? 'bg-ios-blue text-white'
            : plan.is_recommended
              ? 'bg-ios-blue/10 text-ios-blue'
              : 'bg-ios-fill text-ios-secondary',
        ]"
      >
        {{ selected ? '已选择' : '选择此套餐' }}
      </div>
    </div>
  </div>
</template>
