<script setup lang="ts">
import { watch } from 'vue'
import { useHistory } from '~/composables/useHistory'
import { useAuthStore } from '~/stores/auth'

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  select: [item: any]
}>()

const auth = useAuthStore()
const { history, loading, hasMore, fetchHistory, loadMore, deleteItem } = useHistory()

watch(() => props.modelValue, (open) => {
  if (open && auth.isLoggedIn) {
    fetchHistory(1)
  }
})

function formatDate(dateStr: string): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const marketLabels: Record<string, string> = {
  a: 'A股', hk: '港股', us: '美股', futures: '期货'
}
</script>

<template>
  <IosSheet :modelValue="modelValue" @update:modelValue="emit('update:modelValue', $event)" title="历史记录" :fullHeight="true">
    <!-- Not logged in -->
    <div v-if="!auth.isLoggedIn" class="flex flex-col items-center justify-center py-12 px-6 text-center">
      <div class="mb-3 text-ios-blue">
        <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2.5"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
      </div>
      <p class="text-ios-secondary mb-4">登录后可查看分析历史</p>
      <NuxtLink to="/login" @click="emit('update:modelValue', false)">
        <IosButton variant="primary" size="md">去登录</IosButton>
      </NuxtLink>
    </div>

    <!-- Loading -->
    <div v-else-if="loading && !history.length" class="flex justify-center py-8">
      <div class="w-6 h-6 border-2 border-ios-blue border-t-transparent rounded-full animate-spin" />
    </div>

    <!-- Empty -->
    <div v-else-if="!history.length" class="flex flex-col items-center justify-center py-12 px-6 text-center">
      <div class="mb-3 text-ios-blue">
        <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 9h8"/><path d="M8 13h5"/></svg>
      </div>
      <p class="text-ios-secondary">暂无分析记录</p>
    </div>

    <!-- History list -->
    <div v-else class="divide-y divide-ios-separator">
      <div
        v-for="item in history"
        :key="item.id"
        class="px-4 py-3 flex items-center gap-3 active:bg-ios-fill cursor-pointer"
        @click="emit('select', item)"
      >
        <!-- Action badge -->
        <div
          class="w-12 h-12 rounded-ios flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
          :style="{
            backgroundColor: item.result?.action === 'buy' ? '#34c759'
              : item.result?.action === 'sell' ? '#ff3b30'
              : '#ff9500'
          }"
        >
          {{ item.result?.action === 'buy' ? '买' : item.result?.action === 'sell' ? '卖' : '持' }}
        </div>

        <!-- Details -->
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <span class="font-semibold text-ios-label">{{ item.symbol }}</span>
            <span class="text-xs text-ios-secondary bg-ios-fill px-1.5 py-0.5 rounded-full">{{ marketLabels[item.market] || item.market }}</span>
            <span v-if="item.is_favorited" class="text-xs">⭐</span>
          </div>
          <p class="text-xs text-ios-tertiary mt-0.5">{{ formatDate(item.created_at) }}</p>
        </div>

        <!-- Delete button -->
        <button
          class="w-8 h-8 flex items-center justify-center text-ios-secondary hover:text-ios-red transition-colors flex-shrink-0"
          @click.stop="deleteItem(item.id)"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>

      <!-- Load more -->
      <div v-if="hasMore" class="px-4 py-3 text-center">
        <button
          class="text-ios-blue text-sm font-medium"
          :disabled="loading"
          @click="loadMore"
        >
          {{ loading ? '加载中...' : '加载更多' }}
        </button>
      </div>
    </div>
  </IosSheet>
</template>
