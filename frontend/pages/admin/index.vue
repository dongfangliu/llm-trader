<script setup lang="ts">
import { ref, onMounted } from 'vue'
import api from '~/lib/api'
import { useAuthStore } from '~/stores/auth'
import { navigateTo } from '#app'

const auth = useAuthStore()
const stats = ref<any>(null)
const adminToken = ref('')
const loading = ref(true)

onMounted(async () => {
  // Try to get admin token from localStorage
  if (typeof window !== 'undefined') {
    adminToken.value = localStorage.getItem('admin_token') || ''
  }
  await fetchStats()
})

async function fetchStats() {
  loading.value = true
  try {
    const headers: Record<string, string> = {}
    if (adminToken.value) headers['X-Admin-Token'] = adminToken.value
    const res = await api.get('/api/admin/stats', { headers })
    stats.value = res.data
  } catch (e: any) {
    if (e.response?.status === 403) {
      // Not admin
    }
  } finally {
    loading.value = false
  }
}

function saveAdminToken() {
  if (typeof window !== 'undefined') {
    localStorage.setItem('admin_token', adminToken.value)
  }
  fetchStats()
}
</script>

<template>
  <div class="fixed inset-0 bg-ios-bg flex flex-col overflow-y-auto">
    <div class="flex items-center px-4 pt-12 pb-4">
      <NuxtLink to="/" class="text-ios-blue">← 返回</NuxtLink>
      <h1 class="flex-1 text-center font-semibold text-ios-label mr-8">管理后台</h1>
    </div>

    <div class="px-4 pb-8 max-w-lg mx-auto w-full space-y-4">
      <!-- Admin token input -->
      <IosCard>
        <IosInput v-model="adminToken" label="管理员令牌" type="password" placeholder="输入 ADMIN_TOKEN" />
        <div class="mt-3">
          <IosButton variant="primary" size="md" :fullWidth="true" @click="saveAdminToken">
            确认
          </IosButton>
        </div>
      </IosCard>

      <!-- Stats -->
      <template v-if="stats">
        <IosCard>
          <h3 class="font-semibold text-ios-label mb-3">系统概览</h3>
          <div class="grid grid-cols-2 gap-4">
            <div class="text-center">
              <p class="text-2xl font-bold text-ios-blue">{{ stats.total_users || 0 }}</p>
              <p class="text-xs text-ios-secondary mt-1">总用户数</p>
            </div>
            <div class="text-center">
              <p class="text-2xl font-bold text-ios-green">{{ stats.today_analyses || 0 }}</p>
              <p class="text-xs text-ios-secondary mt-1">今日分析</p>
            </div>
          </div>
        </IosCard>

        <NuxtLink to="/admin/users">
          <IosCard class="cursor-pointer active:opacity-80">
            <div class="flex items-center justify-between">
              <span class="font-medium text-ios-label">用户管理</span>
              <span class="text-ios-secondary">›</span>
            </div>
          </IosCard>
        </NuxtLink>
      </template>
    </div>
  </div>
</template>
