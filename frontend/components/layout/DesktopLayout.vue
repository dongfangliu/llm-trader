<script setup lang="ts">
import { useRoute, navigateTo } from '#app'
import { useAuthStore } from '~/stores/auth'

const route = useRoute()
const auth = useAuthStore()

const navItems = [
  { path: '/', label: '📊 分析' },
  { path: '/account', label: '👤 账户' },
]
</script>

<template>
  <div class="flex min-h-screen">
    <!-- Sidebar -->
    <aside class="hidden lg:flex flex-col w-60 bg-ios-card border-r border-ios-separator flex-shrink-0">
      <!-- Logo -->
      <div class="px-6 py-6 border-b border-ios-separator">
        <h1 class="text-lg font-bold text-ios-label">📈 AI 分析</h1>
        <p class="text-xs text-ios-secondary mt-0.5">股票智能研判</p>
      </div>

      <!-- Nav -->
      <nav class="flex-1 px-3 py-4 space-y-1">
        <NuxtLink
          v-for="item in navItems"
          :key="item.path"
          :to="item.path"
          :class="[
            'flex items-center px-3 py-2.5 rounded-ios text-sm font-medium transition-colors',
            route.path === item.path
              ? 'bg-ios-blue/10 text-ios-blue'
              : 'text-ios-secondary hover:bg-ios-fill hover:text-ios-label',
          ]"
        >
          {{ item.label }}
        </NuxtLink>
        <NuxtLink
          v-if="auth.isAdmin"
          to="/admin"
          :class="[
            'flex items-center px-3 py-2.5 rounded-ios text-sm font-medium transition-colors',
            route.path.startsWith('/admin')
              ? 'bg-ios-blue/10 text-ios-blue'
              : 'text-ios-secondary hover:bg-ios-fill hover:text-ios-label',
          ]"
        >
          ⚙️ 管理
        </NuxtLink>
      </nav>

      <!-- User info -->
      <div v-if="auth.isLoggedIn" class="px-4 py-4 border-t border-ios-separator">
        <div class="flex items-center gap-3">
          <div class="w-8 h-8 rounded-full bg-ios-blue/10 flex items-center justify-center text-ios-blue font-bold text-sm">
            {{ (auth.user?.email || '?')[0].toUpperCase() }}
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-sm text-ios-label truncate">{{ auth.user?.email }}</p>
            <p class="text-xs text-ios-secondary capitalize">{{ auth.user?.tier }}</p>
          </div>
        </div>
      </div>
      <div v-else class="px-4 py-4 border-t border-ios-separator">
        <NuxtLink to="/login" class="text-ios-blue text-sm font-medium">登录 / 注册</NuxtLink>
      </div>
    </aside>

    <!-- Main content -->
    <main class="flex-1 overflow-y-auto">
      <slot />
    </main>
  </div>
</template>
