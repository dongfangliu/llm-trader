<script setup lang="ts">
import { useRoute } from '#app'
import { useAuthStore } from '~/stores/auth'
import { PhChartLineUp, PhUser } from '@phosphor-icons/vue'

const route = useRoute()
const auth = useAuthStore()

const navItems = [
  { path: '/', label: '分析', icon: PhChartLineUp },
  { path: '/account', label: '账户', icon: PhUser },
]
</script>

<template>
  <div class="flex flex-col min-h-screen">
    <!-- Main content -->
    <main class="flex-1 pb-20">
      <slot />
    </main>

    <!-- Bottom nav - only on mobile -->
    <nav class="fixed bottom-0 inset-x-0 bg-ios-card border-t border-ios-separator z-40 lg:hidden ios-safe-bottom">
      <div class="flex">
        <NuxtLink
          v-for="item in navItems"
          :key="item.path"
          :to="item.path"
          :class="[
            'flex-1 flex flex-col items-center justify-center py-2 min-h-[49px] transition-colors',
            route.path === item.path ? 'text-ios-blue' : 'text-ios-secondary',
          ]"
        >
          <component :is="item.icon" :size="20" weight="bold" />
          <span class="text-xs mt-1 font-medium">{{ item.label }}</span>
        </NuxtLink>
      </div>
    </nav>
  </div>
</template>
