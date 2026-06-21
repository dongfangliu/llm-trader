<script setup lang="ts">
import { ref } from 'vue'

interface HistoryItem {
  id: string
  symbol: string
  name: string
  market: string
  action?: string
  confidence?: number
  analyzedAt?: string
  detail?: any
}

interface Props {
  appName: string
  tier: string
  tierLabel: string
  remaining: number | null
  dailyLimit: number | null
  deepRemaining?: number | null
  deepDailyLimit?: number | null
  user: any
  history: HistoryItem[]
  activePanel: string
  selectedHistoryId: string | null
  isRegisteredProTrial?: boolean
  isGuestTrial?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  isRegisteredProTrial: false,
  isGuestTrial: false,
  deepRemaining: null,
  deepDailyLimit: null,
})

const emit = defineEmits<{
  'new-analysis': []
  'open-history': [item: HistoryItem]
  'upgrade': []
  'user-menu-open': []
}>()

const allOpen = ref(true)
const favOpen = ref(false)

function getActionDisplay(action?: string) {
  if (!action) return { text: '观望', color: '#f59e0b' }
  const a = action.toLowerCase()
  if (a === 'buy' || a === '买入') return { text: '买入', color: '#ef4444' }
  if (a === 'sell' || a === '卖出') return { text: '卖出', color: '#22c55e' }
  return { text: '观望', color: '#f59e0b' }
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const isAnalyzeActive = computed(() =>
  props.activePanel === 'analyze' || props.activePanel === 'loading'
)
</script>

<template>
  <nav style="width: 240px; min-width: 240px; height: 100dvh; background: rgba(249,249,249,0.94); border-right: 0.5px solid rgba(0,0,0,0.12); display: flex; flex-direction: column; flex-shrink: 0; overflow: hidden;">

    <!-- Brand area -->
    <div style="padding: 20px 16px 14px; border-bottom: 0.5px solid rgba(0,0,0,0.08);">
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
        <svg width="18" height="18" viewBox="0 0 22 22" fill="none">
          <rect x="2" y="9" width="5" height="7" rx="1.5" fill="#dc2626"/>
          <line x1="4.5" y1="6" x2="4.5" y2="9" stroke="#dc2626" stroke-width="1.5" stroke-linecap="round"/>
          <line x1="4.5" y1="16" x2="4.5" y2="19" stroke="#dc2626" stroke-width="1.5" stroke-linecap="round"/>
          <rect x="8.5" y="4" width="5" height="11" rx="1.5" fill="var(--ios-green)"/>
          <line x1="11" y1="1.5" x2="11" y2="4" stroke="var(--ios-green)" stroke-width="1.5" stroke-linecap="round"/>
          <line x1="11" y1="15" x2="11" y2="17.5" stroke="var(--ios-green)" stroke-width="1.5" stroke-linecap="round"/>
          <rect x="15" y="7" width="5" height="8" rx="1.5" fill="#dc2626"/>
          <line x1="17.5" y1="4" x2="17.5" y2="7" stroke="#dc2626" stroke-width="1.5" stroke-linecap="round"/>
          <line x1="17.5" y1="15" x2="17.5" y2="18" stroke="#dc2626" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
        <span style="font-size: 15px; font-weight: 700; color: var(--ios-label); letter-spacing: -0.3px;">{{ appName }}</span>
      </div>
      <div style="display: flex; align-items: center; gap: 6px;">
        <span
          v-if="isRegisteredProTrial || isGuestTrial"
          style="font-size: 11px; color: var(--ios-secondary);"
        >专业版体验中</span>
        <template v-else>
          <span
            style="font-size: 11px; font-weight: 600; padding: 1px 6px; border-radius: 4px; background: rgba(0,122,255,0.1); color: var(--ios-blue);"
          >{{ tierLabel }}</span>
          <span
            v-if="remaining !== null && dailyLimit !== null"
            style="font-size: 11px; color: var(--ios-secondary);"
          >{{ remaining }} / {{ dailyLimit }} 次</span>
          <span
            v-if="tier === 'basic' && deepRemaining !== null && deepDailyLimit !== null"
            style="font-size: 11px; color: #7c3aed;"
          >深度 {{ deepRemaining }}/{{ deepDailyLimit }}</span>
        </template>
      </div>
    </div>

    <!-- Nav buttons -->
    <div style="padding: 8px 8px 4px; flex-shrink: 0;">
      <button
        class="dt-nav-btn"
        :class="{ active: isAnalyzeActive }"
        @click="emit('new-analysis')"
      >
        <svg width="15" height="15" viewBox="0 0 20 20" fill="none">
          <circle cx="10" cy="10" r="8.5" stroke="currentColor" stroke-width="1.5"/>
          <line x1="10" y1="6.5" x2="10" y2="13.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          <line x1="6.5" y1="10" x2="13.5" y2="10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
        新建分析
      </button>
      <button
        v-if="tier !== 'premium'"
        class="dt-nav-btn"
        style="color: #f59e0b;"
        @click="emit('upgrade')"
      >
        <svg width="15" height="15" viewBox="0 0 20 20" fill="none">
          <polygon points="10,2 12.5,7.5 18.5,8.3 14,12.5 15.3,18.5 10,15.5 4.7,18.5 6,12.5 1.5,8.3 7.5,7.5" fill="#f59e0b"/>
        </svg>
        升级套餐
      </button>
    </div>

    <!-- History accordion (scrollable) -->
    <div style="flex: 1; overflow-y: auto; padding: 0 8px;">

      <!-- 所有分析 accordion -->
      <button class="dt-accordion-header" @click="allOpen = !allOpen">
        <span>所有分析</span>
        <svg
          class="dt-accordion-chevron"
          :class="{ open: allOpen }"
          width="12" height="12" viewBox="0 0 12 12" fill="none"
        >
          <path d="M2 4.5L6 8L10 4.5" stroke="var(--ios-secondary)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>

      <template v-if="allOpen">
        <button
          v-for="item in history.slice(0, 50)"
          :key="item.id"
          class="dt-hist-btn"
          :class="{ active: selectedHistoryId === item.id }"
          @click="emit('open-history', item)"
        >
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px;">
            <span style="font-size: 13px; font-weight: 600; color: var(--ios-label); flex-shrink: 0;">{{ item.symbol }}</span>
            <span
              style="font-size: 10px; font-weight: 700; padding: 1px 5px; border-radius: 4px; flex-shrink: 0;"
              :style="{ color: getActionDisplay(item.action).color, background: getActionDisplay(item.action).color + '1a' }"
            >{{ getActionDisplay(item.action).text }}</span>
          </div>
          <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 2px;">
            <span style="font-size: 11px; color: var(--ios-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 120px;">{{ item.name }}</span>
            <span v-if="item.analyzedAt" style="font-size: 10px; color: var(--ios-tertiary); flex-shrink: 0;">{{ formatTime(item.analyzedAt) }}</span>
          </div>
        </button>
        <div
          v-if="history.length === 0"
          style="padding: 16px 10px; font-size: 12px; color: var(--ios-tertiary); text-align: center;"
        >
          暂无分析记录
        </div>
      </template>

      <!-- 收藏 accordion (only for logged-in users) -->
      <template v-if="user">
        <button class="dt-accordion-header" style="margin-top: 4px;" @click="favOpen = !favOpen">
          <span>收藏</span>
          <svg
            class="dt-accordion-chevron"
            :class="{ open: favOpen }"
            width="12" height="12" viewBox="0 0 12 12" fill="none"
          >
            <path d="M2 4.5L6 8L10 4.5" stroke="var(--ios-secondary)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        <template v-if="favOpen">
          <div style="padding: 12px 10px; font-size: 12px; color: var(--ios-tertiary); text-align: center;">
            暂无收藏
          </div>
        </template>
      </template>

    </div>

    <!-- Bottom: quota + user button -->
    <div style="padding: 16px; border-top: 0.5px solid rgba(0,0,0,0.08); display: flex; align-items: flex-end; justify-content: space-between;">
      <div>
        <div style="font-size: 10px; color: var(--ios-secondary); margin-bottom: 2px; font-weight: 500;">今日剩余</div>
        <div style="display: flex; align-items: baseline; gap: 3px;">
          <span style="font-size: 24px; font-weight: 700; color: var(--ios-label); line-height: 1;">
            {{ remaining ?? '—' }}
          </span>
          <span v-if="dailyLimit !== null" style="font-size: 12px; color: var(--ios-secondary);">/ {{ dailyLimit }} 次</span>
        </div>
      </div>
      <button
        aria-label="打开账户菜单"
        style="width: 36px; height: 36px; border-radius: 50%; background: rgba(0,122,255,0.1); border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0; -webkit-tap-highlight-color: transparent; transition: background 0.15s;"
        @click="emit('user-menu-open')"
        @mouseenter="(e) => (e.currentTarget as HTMLElement).style.background = 'rgba(0,122,255,0.18)'"
        @mouseleave="(e) => (e.currentTarget as HTMLElement).style.background = 'rgba(0,122,255,0.1)'"
      >
        <span v-if="user" style="font-size: 14px; font-weight: 700; color: var(--ios-blue);">
          {{ (user.email || '?')[0].toUpperCase() }}
        </span>
        <svg v-else width="16" height="16" viewBox="0 0 20 20" fill="none">
          <circle cx="10" cy="7" r="3.5" stroke="var(--ios-blue)" stroke-width="1.5"/>
          <path d="M3 17c0-3.314 3.134-6 7-6s7 2.686 7 6" stroke="var(--ios-blue)" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      </button>
    </div>

  </nav>
</template>

<style scoped>
.dt-nav-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 10px 10px;
  border: none;
  border-radius: 10px;
  background: transparent;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  color: #3c3c43;
  text-align: left;
  -webkit-tap-highlight-color: transparent;
  transition: background 0.1s;
}
.dt-nav-btn:hover { background: rgba(0,0,0,0.05); }
.dt-nav-btn.active { background: rgba(0,122,255,0.1); color: var(--ios-blue); }

.dt-hist-btn {
  display: block;
  width: 100%;
  padding: 8px 10px;
  border: none;
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  text-align: left;
  -webkit-tap-highlight-color: transparent;
  transition: background 0.1s;
}
.dt-hist-btn:hover { background: rgba(0,0,0,0.04); }
.dt-hist-btn.active { background: rgba(0,122,255,0.08); }

.dt-accordion-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  padding: 8px 10px;
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 11px;
  font-weight: 700;
  color: var(--ios-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.dt-accordion-chevron { transition: transform 0.2s; }
.dt-accordion-chevron.open { transform: rotate(180deg); }
</style>
