<script setup lang="ts">
// No props — shown via v-if="showTrialInProgressBanner" in parent
</script>

<template>
  <Transition name="trial-capsule">
    <div class="pro-trial-capsule">
      <span class="capsule-star">✦</span>
      <span class="capsule-text">专业版体验中</span>
      <span class="capsule-dot">·</span>
      <span class="capsule-sub">深度分析进行中</span>
    </div>
  </Transition>
</template>

<style scoped>
.pro-trial-capsule {
  position: fixed;
  top: 60px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 100;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 20px;
  background: rgba(175, 82, 222, 0.15);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border: 1px solid rgba(175, 82, 222, 0.35);
  border-radius: 24px;
  box-shadow: 0 4px 20px rgba(175, 82, 222, 0.25);
  white-space: nowrap;
  pointer-events: none;
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif;
}

.capsule-star {
  font-size: 11px;
  color: var(--ios-blue);
  opacity: 0.9;
}

.capsule-text {
  font-size: 14px;
  font-weight: 600;
  color: var(--ios-blue);
  letter-spacing: -0.1px;
}

.capsule-dot {
  font-size: 12px;
  color: rgba(175, 82, 222, 0.5);
}

.capsule-sub {
  font-size: 13px;
  color: rgba(175, 82, 222, 0.75);
  font-weight: 400;
}

/* Spring slide-down animation */
.trial-capsule-enter-active {
  transition: all 0.45s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.trial-capsule-leave-active {
  transition: all 0.25s cubic-bezier(0.4, 0, 1, 1);
}
.trial-capsule-enter-from,
.trial-capsule-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-12px) scale(0.92);
}
</style>
