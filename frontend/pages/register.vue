<script setup lang="ts">
import { ref } from 'vue'
import { useAuthStore } from '~/stores/auth'
import { navigateTo } from '#app'

const auth = useAuthStore()

const email = ref('')
const password = ref('')
const inviteCode = ref('')
const loading = ref(false)
const error = ref('')
const success = ref(false)

async function handleRegister() {
  error.value = ''

  if (!email.value || !password.value) {
    error.value = '请填写邮箱和密码'
    return
  }
  if (password.value.length < 6) {
    error.value = '密码至少6位'
    return
  }

  loading.value = true
  try {
    await auth.register(email.value, password.value, inviteCode.value || undefined)
    success.value = true
  } catch (e: any) {
    error.value = e.response?.data?.detail || '注册失败'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="fixed inset-0 bg-ios-bg flex flex-col">
    <!-- Header -->
    <div class="flex items-center px-4 pt-12 pb-4">
      <NuxtLink to="/login" class="text-ios-blue text-base">← 返回</NuxtLink>
    </div>

    <div class="flex-1 flex flex-col items-center px-6 pt-6">
      <!-- Success state -->
      <div v-if="success" class="w-full max-w-sm text-center pt-12">
        <div class="text-6xl mb-4">✉️</div>
        <h2 class="text-2xl font-bold text-ios-label mb-2">注册成功！</h2>
        <p class="text-ios-secondary mb-6">请查收验证邮件，点击链接激活账户</p>
        <IosButton variant="primary" size="lg" :fullWidth="true" @click="navigateTo('/login')">
          去登录
        </IosButton>
      </div>

      <!-- Form -->
      <template v-else>
        <div class="text-center mb-8">
          <div class="text-5xl mb-3">✨</div>
          <h1 class="text-2xl font-bold text-ios-label">创建账户</h1>
          <p class="text-ios-secondary text-sm mt-1">免费注册，每天3次分析</p>
        </div>

        <div class="w-full max-w-sm space-y-4">
          <IosInput v-model="email" label="邮箱" type="email" placeholder="your@email.com" autocomplete="email" />
          <IosInput v-model="password" label="密码" type="password" placeholder="至少6位" autocomplete="new-password" />
          <IosInput v-model="inviteCode" label="邀请码（可选）" placeholder="输入邀请码获得额外次数" />

          <div v-if="error" class="bg-ios-red/10 text-ios-red text-sm px-4 py-3 rounded-ios">
            {{ error }}
          </div>

          <IosButton variant="primary" size="lg" :fullWidth="true" :loading="loading" @click="handleRegister">
            免费注册
          </IosButton>

          <p class="text-center text-ios-secondary text-sm">
            已有账户？
            <NuxtLink to="/login" class="text-ios-blue font-medium">立即登录</NuxtLink>
          </p>
        </div>
      </template>
    </div>
  </div>
</template>
