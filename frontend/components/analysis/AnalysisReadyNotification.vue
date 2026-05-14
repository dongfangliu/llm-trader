<template>
  <Teleport to="body">
    <Transition name="notify-overlay">
      <div
        v-if="modelValue"
        class="notify-backdrop"
        @click.self="handleDismiss"
      >
        <Transition name="notify-card">
          <div
            v-if="modelValue"
            class="notify-card"
            :class="{ 'notify-card--desktop': isDesktop }"
            @mouseenter="handlePause"
            @mouseleave="handleResume"
            @touchstart.passive="handlePause"
            @touchend.passive="handleResume"
          >
            <!-- Header row -->
            <div class="notify-header">
              <div class="notify-icon">
                <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                  <circle cx="11" cy="11" r="11" fill="var(--ios-green)" />
                  <path d="M6.5 11.5L9.5 14.5L15.5 8" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </div>
              <div class="notify-text">
                <div class="notify-title">分析完成</div>
                <div class="notify-subtitle">{{ symbol }}</div>
              </div>
              <div class="notify-ring" :aria-label="`${countdown}秒后自动关闭`">
                <svg width="32" height="32" viewBox="0 0 32 32">
                  <!-- Track -->
                  <circle cx="16" cy="16" r="13" fill="none" stroke="rgba(0,122,255,0.15)" stroke-width="3" />
                  <!-- Progress -->
                  <circle
                    cx="16" cy="16" r="13"
                    fill="none"
                    stroke="var(--ios-blue)"
                    stroke-width="3"
                    stroke-linecap="round"
                    :stroke-dasharray="circumference"
                    :stroke-dashoffset="circumference * (1 - countdown / 3)"
                    transform="rotate(-90 16 16)"
                    style="transition: stroke-dashoffset 0.95s linear;"
                  />
                </svg>
                <span class="notify-countdown">{{ countdown }}</span>
              </div>
            </div>

            <!-- Buttons -->
            <div class="notify-actions">
              <button class="notify-btn notify-btn--primary" @click="handleView">
                查看结果
              </button>
              <button class="notify-btn notify-btn--secondary" @click="handleDismiss">
                待会再看（{{ countdown }}s）
              </button>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'

const props = defineProps<{
  modelValue: boolean
  symbol: string
  isDesktop?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [boolean]
  'view': []
  'dismiss': []
}>()

const countdown = ref(3)
const isPaused = ref(false)
const circumference = 2 * Math.PI * 13 // ≈ 81.68

let timer: ReturnType<typeof setInterval> | null = null

watch(() => props.modelValue, (val) => {
  if (val) {
    countdown.value = 3
    isPaused.value = false
    startTimer()
  } else {
    stopTimer()
  }
})

onUnmounted(() => stopTimer())

function startTimer() {
  stopTimer()
  timer = setInterval(() => {
    if (isPaused.value) return
    countdown.value--
    if (countdown.value <= 0) {
      stopTimer()
      handleDismiss()
    }
  }, 1000)
}

function stopTimer() {
  if (timer !== null) {
    clearInterval(timer)
    timer = null
  }
}

function handlePause() {
  isPaused.value = true
  countdown.value = 3
}

function handleResume() {
  isPaused.value = false
}

function handleView() {
  stopTimer()
  emit('view')
  emit('update:modelValue', false)
}

function handleDismiss() {
  stopTimer()
  emit('dismiss')
  emit('update:modelValue', false)
}
</script>

<style scoped>
.notify-backdrop {
  position: fixed;
  inset: 0;
  z-index: 500;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 0 16px calc(env(safe-area-inset-bottom, 0px) + 16px);
}

.notify-card {
  width: 100%;
  max-width: 480px;
  background: #fff;
  border-radius: 20px;
  padding: 20px;
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.18);
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif;
}

.notify-card--desktop {
  max-width: 380px;
}

.notify-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.notify-icon {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.notify-text {
  flex: 1;
  min-width: 0;
}

.notify-title {
  font-size: 15px;
  font-weight: 600;
  color: #1c1c1e;
  line-height: 1.3;
}

.notify-subtitle {
  font-size: 13px;
  color: #8e8e93;
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.notify-ring {
  flex-shrink: 0;
  position: relative;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.notify-countdown {
  position: absolute;
  font-size: 10px;
  font-weight: 700;
  color: var(--ios-blue);
  line-height: 1;
}

.notify-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.notify-btn {
  width: 100%;
  height: 50px;
  border: none;
  border-radius: 14px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
  transition: opacity 0.15s;
}

.notify-btn:active {
  opacity: 0.75;
}

.notify-btn--primary {
  background: var(--ios-blue);
  color: #fff;
}

.notify-btn--secondary {
  background: #f2f2f7;
  color: #3c3c43;
  font-weight: 500;
}

/* Transitions */
.notify-overlay-enter-active,
.notify-overlay-leave-active {
  transition: opacity 0.25s ease;
}
.notify-overlay-enter-from,
.notify-overlay-leave-to {
  opacity: 0;
}

.notify-card-enter-active {
  animation: card-in 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}
.notify-card-leave-active {
  animation: card-out 0.2s cubic-bezier(0.4, 0, 1, 1) forwards;
}

@keyframes card-in {
  from { opacity: 0; transform: translateY(60px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes card-out {
  from { opacity: 1; transform: translateY(0); }
  to   { opacity: 0; transform: translateY(30px); }
}
</style>
