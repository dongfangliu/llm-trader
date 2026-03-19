<script setup lang="ts">
import { ref, onMounted } from 'vue'
import api from '~/lib/api'

const users = ref<any[]>([])
const loading = ref(true)
const search = ref('')
const page = ref(1)
const total = ref(0)
const adminToken = typeof window !== 'undefined' ? localStorage.getItem('admin_token') || '' : ''

function getHeaders() {
  const headers: Record<string, string> = {}
  if (adminToken) headers['X-Admin-Token'] = adminToken
  return headers
}

onMounted(() => fetchUsers())

async function fetchUsers() {
  loading.value = true
  try {
    const res = await api.get('/api/admin/users', {
      headers: getHeaders(),
      params: { page: page.value, per_page: 20, search: search.value || undefined }
    })
    users.value = res.data.users || res.data.items || []
    total.value = res.data.total || 0
  } catch (e) {
    console.error('Failed to fetch users:', e)
  } finally {
    loading.value = false
  }
}

const tierLabels: Record<string, string> = { free: '免费', basic: '标准', premium: '专业' }
</script>

<template>
  <div class="fixed inset-0 bg-ios-bg flex flex-col overflow-y-auto">
    <div class="flex items-center px-4 pt-12 pb-4">
      <NuxtLink to="/admin" class="text-ios-blue">← 返回</NuxtLink>
      <h1 class="flex-1 text-center font-semibold text-ios-label mr-8">用户管理</h1>
    </div>

    <div class="px-4 pb-8 max-w-2xl mx-auto w-full">
      <!-- Search -->
      <div class="mb-4">
        <IosInput v-model="search" placeholder="搜索邮箱" @change="fetchUsers" />
      </div>

      <!-- Loading -->
      <div v-if="loading" class="flex justify-center py-8">
        <div class="w-6 h-6 border-2 border-ios-blue border-t-transparent rounded-full animate-spin" />
      </div>

      <!-- User list -->
      <div v-else class="space-y-2">
        <IosCard v-for="user in users" :key="user.id" padding="sm">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-full bg-ios-blue/10 flex items-center justify-center text-ios-blue font-bold text-sm flex-shrink-0">
              {{ (user.email || '?')[0].toUpperCase() }}
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-ios-label truncate">{{ user.email }}</p>
              <div class="flex items-center gap-2 mt-0.5">
                <span class="text-xs text-ios-secondary">{{ tierLabels[user.subscription_tier] || user.subscription_tier }}</span>
                <span class="text-xs text-ios-tertiary">剩余: {{ user.daily_remaining }}/{{ user.daily_limit }}</span>
                <span v-if="user.is_banned" class="text-xs text-ios-red">已封禁</span>
              </div>
            </div>
          </div>
        </IosCard>

        <p class="text-center text-ios-secondary text-sm py-4">
          共 {{ total }} 名用户
        </p>
      </div>
    </div>
  </div>
</template>
