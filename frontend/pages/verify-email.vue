<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useAuthStore } from '~/stores/auth'
import { useRoute, navigateTo } from '#app'

const auth = useAuthStore()
const route = useRoute()

const status = ref<'loading' | 'success' | 'error'>('loading')
const errorMsg = ref('')

onMounted(async () => {
  const token = route.query.token as string
  if (!token) {
    status.value = 'error'
    errorMsg.value = '无效的验证链接'
    return
  }
  try {
    await auth.verifyEmail(token)
    status.value = 'success'
  } catch (e: any) {
    status.value = 'error'
    errorMsg.value = e.response?.data?.detail || '验证失败'
  }
})
</script>

<template>
  <div class="fixed inset-0 bg-ios-bg flex items-center justify-center px-6">
    <div class="w-full max-w-sm text-center">
      <!-- Loading -->
      <div v-if="status === 'loading'" class="space-y-4">
        <div class="text-5xl">⏳</div>
        <p class="text-ios-secondary">正在验证邮箱...</p>
      </div>

      <!-- Success -->
      <div v-else-if="status === 'success'" class="space-y-4">
        <div class="text-ios-green">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/></svg>
        </div>
        <h2 class="text-2xl font-bold text-ios-label">邮箱验证成功！</h2>
        <p class="text-ios-secondary">您的账户已激活，现在可以登录使用</p>
        <IosButton variant="primary" size="lg" :fullWidth="true" @click="navigateTo('/login')">
          去登录
        </IosButton>
      </div>

      <!-- Error -->
      <div v-else class="space-y-4">
        <div class="text-ios-red">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>
        </div>
        <h2 class="text-xl font-semibold text-ios-label">验证失败</h2>
        <p class="text-ios-secondary">{{ errorMsg }}</p>
        <IosButton variant="secondary" size="md" :fullWidth="true" @click="navigateTo('/login')">
          返回登录
        </IosButton>
      </div>
    </div>
  </div>
</template>
