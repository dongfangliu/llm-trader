<script setup lang="ts">
const emit = defineEmits<{ (e: 'dismiss'): void }>()
</script>

<template>
  <Transition name="trial-ended-banner">
    <div class="trial-ended-banner">
      <div class="banner-body">
        <span class="banner-icon">✦</span>
        <div class="banner-content">
          <p class="banner-title">专业版体验已结束</p>
          <p class="banner-desc">后续分析将以当前套餐权限进行</p>
        </div>
      </div>
      <button class="banner-dismiss" @click="emit('dismiss')" aria-label="关闭">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        </svg>
      </button>
    </div>
  </Transition>
</template>

<style scoped>
.trial-ended-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px 12px 16px;
  margin-bottom: 12px;
  background: rgba(175, 82, 222, 0.07);
  border: 1px solid rgba(175, 82, 222, 0.18);
  border-left: 3px solid #AF52DE;
  border-radius: 14px;
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif;
}

.banner-body {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.banner-icon {
  font-size: 13px;
  color: #AF52DE;
  margin-top: 1px;
  flex-shrink: 0;
}

.banner-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.banner-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #6c3faa;
  letter-spacing: -0.1px;
}

.banner-desc {
  margin: 0;
  font-size: 12px;
  color: rgba(108, 63, 170, 0.75);
}

.banner-dismiss {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  cursor: pointer;
  color: rgba(175, 82, 222, 0.55);
  border-radius: 50%;
  padding: 0;
  -webkit-tap-highlight-color: transparent;
  transition: opacity 0.15s;
}
.banner-dismiss:active {
  opacity: 0.6;
}

.trial-ended-banner-enter-active {
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.trial-ended-banner-leave-active {
  transition: all 0.2s ease-out;
}
.trial-ended-banner-enter-from,
.trial-ended-banner-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
</style>
