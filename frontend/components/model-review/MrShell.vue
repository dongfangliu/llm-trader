<script setup lang="ts">
defineProps<{
  title: string
  backTo?: string
  backLabel?: string
}>()
</script>

<template>
  <div class="mr-page">
    <header class="mr-topbar">
      <div class="mr-topbar-inner">
        <div>
          <NuxtLink v-if="backTo" :to="backTo" class="mr-btn mr-btn-ghost mr-btn-small">
            <slot name="backIcon" />
            {{ backLabel || '返回' }}
          </NuxtLink>
          <slot v-else name="left" />
        </div>
        <div class="mr-topbar-center">
          <slot name="titleIcon" />
          <span>{{ title }}</span>
        </div>
        <div class="mr-topbar-actions">
          <slot name="actions" />
        </div>
      </div>
    </header>
    <main class="mr-shell">
      <slot />
    </main>
  </div>
</template>
