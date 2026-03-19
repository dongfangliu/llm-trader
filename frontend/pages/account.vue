<script setup lang="ts">
import { ref } from 'vue'
import { useAuthStore } from '~/stores/auth'
import { navigateTo } from '#app'

const auth = useAuthStore()

onMounted(() => {
  if (auth.initialized && !auth.isLoggedIn) {
    navigateTo('/login')
  }
})

const tierLabels: Record<string, string> = {
  free: '免费版',
  basic: '标准版',
  premium: '专业版',
}

const tierColors: Record<string, string> = {
  free: 'default',
  basic: 'basic',
  premium: 'premium',
}

function handleLogout() {
  auth.logout()
  navigateTo('/')
}
</script>

<template>
  <div class="fixed inset-0 bg-ios-bg flex flex-col overflow-y-auto">
    <!-- Header -->
    <div class="flex items-center px-4 pt-12 pb-4">
      <NuxtLink to="/" class="text-ios-blue">← 返回</NuxtLink>
      <h1 class="flex-1 text-center font-semibold text-ios-label mr-8">账户</h1>
    </div>

    <div class="px-4 pb-8 max-w-lg mx-auto w-full space-y-4">
      <!-- Not logged in -->
      <div v-if="!auth.isLoggedIn" class="text-center py-12">
        <div class="text-5xl mb-4">👤</div>
        <p class="text-ios-secondary mb-6">登录后可管理账户</p>
        <NuxtLink to="/login">
          <IosButton variant="primary" size="lg" :fullWidth="true">登录账户</IosButton>
        </NuxtLink>
      </div>

      <template v-else>
        <!-- User info card -->
        <IosCard>
          <div class="flex items-center gap-4">
            <div class="w-14 h-14 rounded-full bg-ios-blue/10 flex items-center justify-center text-ios-blue font-bold text-xl">
              {{ (auth.user?.email || '?')[0].toUpperCase() }}
            </div>
            <div>
              <p class="font-semibold text-ios-label">{{ auth.user?.email }}</p>
              <div class="flex items-center gap-2 mt-1">
                <IosBadge :variant="tierColors[auth.user?.tier || 'free'] as any">
                  {{ tierLabels[auth.user?.tier || 'free'] }}
                </IosBadge>
                <IosBadge v-if="!auth.user?.is_verified" variant="warning">未验证</IosBadge>
              </div>
            </div>
          </div>
        </IosCard>

        <!-- Subscription card -->
        <IosCard>
          <h3 class="text-sm font-semibold text-ios-secondary mb-3">订阅状态</h3>
          <div class="flex items-center justify-between">
            <span class="text-ios-label">当前套餐</span>
            <span class="font-semibold text-ios-label">{{ tierLabels[auth.user?.tier || 'free'] }}</span>
          </div>
          <div class="mt-3" v-if="auth.user?.tier === 'free'">
            <NuxtLink to="/upgrade">
              <IosButton variant="primary" size="md" :fullWidth="true">升级套餐</IosButton>
            </NuxtLink>
          </div>
        </IosCard>

        <!-- Invite code -->
        <IosCard v-if="auth.user?.invite_code">
          <h3 class="text-sm font-semibold text-ios-secondary mb-3">邀请码</h3>
          <div class="flex items-center justify-between">
            <code class="font-mono font-bold text-ios-blue text-lg tracking-wider">{{ auth.user?.invite_code }}</code>
            <button
              class="text-ios-blue text-sm"
              @click="navigator.clipboard?.writeText(auth.user?.invite_code || '')"
            >
              复制
            </button>
          </div>
          <p class="text-xs text-ios-secondary mt-2">分享给朋友，双方各获 +10 次永久额度</p>
        </IosCard>

        <!-- Bonus quota -->
        <IosCard v-if="(auth.user?.bonus_quota || 0) > 0">
          <div class="flex items-center justify-between">
            <span class="text-ios-label">永久额度</span>
            <span class="font-bold text-ios-green text-lg">+{{ auth.user?.bonus_quota }}</span>
          </div>
        </IosCard>

        <!-- Actions -->
        <IosCard>
          <div class="space-y-1 -m-1">
            <NuxtLink
              v-if="auth.isAdmin"
              to="/admin"
              class="flex items-center justify-between px-3 py-3 rounded-ios hover:bg-ios-fill min-h-[44px]"
            >
              <span class="text-ios-label">管理后台</span>
              <span class="text-ios-secondary">›</span>
            </NuxtLink>
          </div>
        </IosCard>

        <!-- Logout -->
        <IosButton variant="danger" size="lg" :fullWidth="true" @click="handleLogout">
          退出登录
        </IosButton>
      </template>
    </div>
  </div>
</template>
