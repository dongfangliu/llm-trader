<script setup lang="ts">
import { ref } from 'vue'
import { useAuthStore } from '~/stores/auth'
import { navigateTo } from '#app'

const auth = useAuthStore()
const router = useRouter()

const email = ref('')
const password = ref('')
const rememberEmail = ref(false)
const loading = ref(false)
const error = ref('')
const showVerifyError = ref(false)
const verifyEmail = ref('')

// Load remembered email
onMounted(() => {
  if (typeof window !== 'undefined') {
    const remembered = localStorage.getItem('remembered_email')
    if (remembered) {
      email.value = remembered
      rememberEmail.value = true
    }
  }
  // If already logged in, redirect
  if (auth.isLoggedIn) {
    navigateTo('/')
  }
})

async function handleLogin() {
  error.value = ''
  showVerifyError.value = false

  if (!email.value || !password.value) {
    error.value = '请填写邮箱和密码'
    return
  }

  loading.value = true
  try {
    await auth.login(email.value, password.value)

    if (rememberEmail.value) {
      localStorage.setItem('remembered_email', email.value)
    } else {
      localStorage.removeItem('remembered_email')
    }

    await navigateTo('/')
  } catch (e: any) {
    const msg = e.response?.data?.detail || '登录失败'
    if (msg.includes('验证') || msg.includes('verify') || e.response?.status === 403) {
      showVerifyError.value = true
      verifyEmail.value = email.value
    } else {
      error.value = msg
    }
  } finally {
    loading.value = false
  }
}

async function handleResendVerification() {
  try {
    await auth.resendVerification(verifyEmail.value)
    error.value = ''
    showVerifyError.value = false
    // Show success
    alert('验证邮件已重新发送，请查收')
  } catch (e) {
    // ignore
  }
}
</script>

<template>
  <div class="fixed inset-0 bg-ios-bg flex flex-col">
    <!-- Header -->
    <div class="flex items-center px-4 pt-12 pb-4">
      <NuxtLink to="/" class="text-ios-blue text-base">
        ← 返回
      </NuxtLink>
    </div>

    <!-- Content -->
    <div class="flex-1 flex flex-col items-center px-6 pt-8">
      <!-- Logo/Title -->
      <div class="text-center mb-10">
        <div class="text-5xl mb-3">📊</div>
        <h1 class="text-2xl font-bold text-ios-label">登录账户</h1>
        <p class="text-ios-secondary text-sm mt-1">AI 股票分析助手</p>
      </div>

      <!-- Form -->
      <div class="w-full max-w-sm space-y-4">
        <IosInput
          v-model="email"
          label="邮箱"
          type="email"
          placeholder="your@email.com"
          autocomplete="email"
          :error="!email && error ? '' : undefined"
        />

        <IosInput
          v-model="password"
          label="密码"
          type="password"
          placeholder="至少6位"
          autocomplete="current-password"
        />

        <!-- Remember email toggle -->
        <IosToggle
          v-model="rememberEmail"
          label="记住邮箱"
          description="下次自动填入邮箱地址"
        />

        <!-- Error -->
        <div v-if="error" class="bg-ios-red/10 text-ios-red text-sm px-4 py-3 rounded-ios">
          {{ error }}
        </div>

        <!-- Email not verified error -->
        <div v-if="showVerifyError" class="bg-ios-orange/10 text-ios-orange text-sm px-4 py-3 rounded-ios space-y-2">
          <p>邮箱尚未验证，请先验证邮箱</p>
          <button
            class="text-ios-blue font-medium underline text-sm"
            @click="handleResendVerification"
          >
            重新发送验证邮件
          </button>
        </div>

        <IosButton
          variant="primary"
          size="lg"
          :fullWidth="true"
          :loading="loading"
          @click="handleLogin"
        >
          登录
        </IosButton>

        <!-- Register link -->
        <p class="text-center text-ios-secondary text-sm">
          还没有账户？
          <NuxtLink to="/register" class="text-ios-blue font-medium">立即注册</NuxtLink>
        </p>
      </div>
    </div>
  </div>
</template>
