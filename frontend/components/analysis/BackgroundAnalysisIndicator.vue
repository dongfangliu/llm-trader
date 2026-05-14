<template>
  <Teleport to="body">
    <Transition name="bg-pill">
      <div
        v-if="modelValue"
        class="bg-indicator-pill"
        :class="{ 'bg-indicator-pill--desktop': isDesktop }"
      >
        <svg class="bg-spinner" width="16" height="16" viewBox="0 0 16 16">
          <circle cx="8" cy="8" r="6" fill="none" stroke="rgba(0,122,255,0.2)" stroke-width="2" />
          <circle
            cx="8" cy="8" r="6"
            fill="none"
            stroke="var(--ios-blue)"
            stroke-width="2"
            stroke-linecap="round"
            stroke-dasharray="25 13"
          />
        </svg>
        <span>正在后台分析 {{ symbol }}…</span>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
defineProps<{
  modelValue: boolean
  symbol: string
  isDesktop?: boolean
}>()
</script>

<style scoped>
.bg-indicator-pill {
  position: fixed;
  bottom: calc(env(safe-area-inset-bottom, 0px) + 80px);
  left: 50%;
  transform: translateX(-50%);
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 18px;
  background: rgba(255, 255, 255, 0.88);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border: 0.5px solid rgba(0, 122, 255, 0.25);
  border-radius: 100px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.04);
  font-size: 13px;
  font-weight: 500;
  color: #1c1c1e;
  white-space: nowrap;
  z-index: 200;
  pointer-events: none;
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif;
}

.bg-indicator-pill--desktop {
  bottom: 24px;
  right: 24px;
  left: auto;
  transform: none;
}

.bg-spinner {
  animation: bg-spin 0.8s linear infinite;
  flex-shrink: 0;
}

@keyframes bg-spin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}

.bg-pill-enter-active {
  animation: bg-pill-in 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}
.bg-pill-leave-active {
  animation: bg-pill-out 0.25s cubic-bezier(0.4, 0, 1, 1) forwards;
}

@keyframes bg-pill-in {
  from { opacity: 0; transform: translateX(-50%) translateY(12px); }
  to   { opacity: 1; transform: translateX(-50%) translateY(0); }
}
@keyframes bg-pill-out {
  from { opacity: 1; transform: translateX(-50%) translateY(0); }
  to   { opacity: 0; transform: translateX(-50%) translateY(12px); }
}

/* Desktop overrides for enter/leave */
.bg-indicator-pill--desktop.bg-pill-enter-active {
  animation: bg-pill-in-desktop 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}
.bg-indicator-pill--desktop.bg-pill-leave-active {
  animation: bg-pill-out-desktop 0.25s cubic-bezier(0.4, 0, 1, 1) forwards;
}

@keyframes bg-pill-in-desktop {
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes bg-pill-out-desktop {
  from { opacity: 1; transform: translateY(0); }
  to   { opacity: 0; transform: translateY(12px); }
}
</style>
