<script setup lang="ts">
import { ref, watch } from 'vue'
import { generateShareCard, downloadShareCard } from '~/lib/shareCard'

const props = defineProps<{
  modelValue: boolean
  result: any
  symbol?: string
  market?: string
  period?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const cardDataUrl = ref<string | null>(null)
const generating = ref(false)

watch(() => props.modelValue, async (open) => {
  if (open && props.result) {
    generating.value = true
    try {
      cardDataUrl.value = await generateShareCard({
        symbol: props.symbol || '',
        market: props.market || 'a',
        period: props.period || 'daily',
        result: props.result,
      })
    } finally {
      generating.value = false
    }
  }
})

async function handleDownload() {
  if (cardDataUrl.value) {
    await downloadShareCard(cardDataUrl.value, `${props.symbol}_analysis.png`)
  }
}

async function handleCopy() {
  if (!cardDataUrl.value) return
  try {
    const res = await fetch(cardDataUrl.value)
    const blob = await res.blob()
    await navigator.clipboard.write([
      new ClipboardItem({ 'image/png': blob })
    ])
  } catch {
    // fallback: open in new tab
    window.open(cardDataUrl.value, '_blank')
  }
}
</script>

<template>
  <IosSheet :modelValue="modelValue" @update:modelValue="emit('update:modelValue', $event)" title="分享">
    <div class="px-4 pb-6 space-y-4">
      <!-- Card preview -->
      <div class="flex justify-center">
        <div v-if="generating" class="w-full h-48 bg-ios-bg rounded-ios flex items-center justify-center">
          <div class="w-6 h-6 border-2 border-ios-blue border-t-transparent rounded-full animate-spin" />
        </div>
        <img v-else-if="cardDataUrl" :src="cardDataUrl" class="w-full max-w-xs rounded-ios shadow-ios" alt="分析卡片" />
      </div>

      <!-- Action buttons -->
      <div class="flex gap-3">
        <IosButton variant="primary" size="md" class="flex-1" :disabled="!cardDataUrl" @click="handleDownload">
          📥 下载
        </IosButton>
        <IosButton variant="secondary" size="md" class="flex-1" :disabled="!cardDataUrl" @click="handleCopy">
          📋 复制
        </IosButton>
      </div>
    </div>
  </IosSheet>
</template>
