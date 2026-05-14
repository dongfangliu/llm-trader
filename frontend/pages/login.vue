<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useAuthStore } from '~/stores/auth'
import { navigateTo, useHead } from '#app'
import api from '~/lib/api'
import { DEFAULT_APP_NAME } from '~/constants/app'

const auth = useAuthStore()

const appName = ref(DEFAULT_APP_NAME)
useHead({ title: appName })

const email = ref('')
const password = ref('')
const rememberCredentials = ref(true)
const loading = ref(false)
const error = ref('')
const showVerifyError = ref(false)
const verifyEmail = ref('')
const showPassword = ref(false)
const resendStatus = ref('')
const resendCooldown = ref(0)

let cooldownTimer: ReturnType<typeof setInterval> | null = null

onMounted(async () => {
  if (typeof window !== 'undefined') {
    const savedEmail = localStorage.getItem('savedEmail')
    const savedPassword = localStorage.getItem('savedPassword')
    if (savedEmail) email.value = savedEmail
    if (savedPassword) password.value = savedPassword
    const savedPref = localStorage.getItem('rememberCredentials')
    if (savedPref === 'false') rememberCredentials.value = false
  }
  if (auth.isLoggedIn) {
    navigateTo('/')
  }
  try {
    const res = await api.get('/api/config')
    if (res.data?.app_name) appName.value = res.data.app_name
  } catch {}
})

async function handleLogin() {
  error.value = ''
  showVerifyError.value = false

  if (!email.value || !password.value) {
    error.value = '请填写邮箱和密码'
    return
  }

  // Save credentials preference
  if (typeof window !== 'undefined') {
    localStorage.setItem('rememberCredentials', rememberCredentials.value ? 'true' : 'false')
    if (rememberCredentials.value) {
      localStorage.setItem('savedEmail', email.value)
      localStorage.setItem('savedPassword', password.value)
    } else {
      localStorage.removeItem('savedEmail')
      localStorage.removeItem('savedPassword')
    }
  }

  loading.value = true
  try {
    await auth.login(email.value, password.value)
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

async function handleResend() {
  if (resendCooldown.value > 0) return
  resendStatus.value = '发送中...'
  try {
    await auth.resendVerification(verifyEmail.value || email.value)
    resendStatus.value = '验证邮件已重新发送，请查收'
    resendCooldown.value = 60
    cooldownTimer = setInterval(() => {
      resendCooldown.value--
      if (resendCooldown.value <= 0 && cooldownTimer) {
        clearInterval(cooldownTimer)
        cooldownTimer = null
      }
    }, 1000)
  } catch {
    resendStatus.value = '发送失败，请稍后重试'
  }
}

function toggleRemember() {
  rememberCredentials.value = !rememberCredentials.value
}
</script>

<template>
  <div class="min-h-[100dvh] bg-ios-bg flex flex-col items-center justify-center px-4 py-10">
    <div class="w-full max-w-[420px]">
      <!-- Hero -->
      <div class="flex flex-col items-center text-center mb-8">
        <div class="w-16 h-16 rounded-ios-lg bg-ios-blue flex items-center justify-center shadow-ios-lg mb-4">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 19V5M4 19h16" />
            <path d="M8 15l3.5-4 3 2.5L20 7" />
          </svg>
        </div>
        <h1 class="text-2xl font-bold text-ios-label tracking-ios-tight">{{ appName }}</h1>
        <p class="mt-1.5 text-[15px] text-ios-secondary">AI 驱动的专业技术分析平台</p>
      </div>

      <!-- Form -->
      <form class="flex flex-col gap-4" @submit.prevent="handleLogin">
        <IosInput
          v-model="email"
          label="邮箱"
          type="email"
          placeholder="your@email.com"
          autocomplete="email"
        />
        <IosInput
          v-model="password"
          label="密码"
          :type="showPassword ? 'text' : 'password'"
          placeholder="请输入密码"
          autocomplete="current-password"
          @keyup="(e) => e.key === 'Enter' && handleLogin()"
        >
          <template #suffix>
            <button
              type="button"
              class="w-9 h-9 flex items-center justify-center text-ios-secondary rounded-ios-sm active:scale-90 transition-transform"
              :aria-label="showPassword ? '隐藏密码' : '显示密码'"
              @click="showPassword = !showPassword"
            >
              <svg v-if="showPassword" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              <svg v-else width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            </button>
          </template>
        </IosInput>

        <!-- Inline error -->
        <div
          v-if="error && !showVerifyError"
          class="flex items-center gap-2.5 rounded-ios bg-ios-red/8 px-4 py-3 text-sm text-ios-red"
        >
          <svg class="flex-shrink-0" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v5M12 16h.01" />
          </svg>
          {{ error }}
        </div>

        <!-- Unverified email -->
        <IosCard v-if="showVerifyError" elevation="flat" padding="md" class="border-l-[3px] !border-l-ios-orange">
          <div class="flex items-start gap-2.5">
            <svg class="flex-shrink-0 mt-0.5 text-ios-orange" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <rect x="2" y="4" width="20" height="16" rx="3" />
              <path d="M2 7l10 6 10-6" />
            </svg>
            <div class="min-w-0">
              <p class="text-sm font-semibold text-ios-label">邮箱尚未验证</p>
              <p class="mt-1 text-[13px] text-ios-secondary leading-relaxed">
                验证邮件已发送至 <strong class="text-ios-label">{{ verifyEmail }}</strong>，请检查收件箱并点击链接完成验证。
              </p>
            </div>
          </div>
          <div class="mt-3">
            <IosButton
              size="sm"
              :disabled="resendCooldown > 0"
              :variant="resendCooldown > 0 ? 'secondary' : 'primary'"
              @click="handleResend"
            >
              {{ resendCooldown > 0 ? `重新发送 (${resendCooldown}s)` : '重新发送验证邮件' }}
            </IosButton>
            <p v-if="resendStatus" class="mt-2 text-[13px] text-ios-secondary">{{ resendStatus }}</p>
          </div>
        </IosCard>

        <!-- Remember credentials -->
        <div class="flex items-center gap-2.5 px-1">
          <button
            type="button"
            role="switch"
            :aria-checked="rememberCredentials"
            class="relative w-[44px] h-[26px] rounded-full transition-colors duration-200 flex-shrink-0"
            :class="rememberCredentials ? 'bg-ios-green' : 'bg-ios-bg2'"
            @click="toggleRemember"
          >
            <span
              class="absolute left-0 top-0.5 w-[22px] h-[22px] rounded-full bg-white shadow-ios-sm transition-transform duration-200"
              :class="rememberCredentials ? 'translate-x-[20px]' : 'translate-x-0.5'"
            />
          </button>
          <span class="text-sm text-ios-label2 select-none cursor-pointer" @click="toggleRemember">记住账号和密码</span>
        </div>

        <IosButton type="submit" size="lg" :loading="loading" :full-width="true">
          {{ loading ? '登录中…' : '登录' }}
        </IosButton>
      </form>

      <p class="text-center text-sm text-ios-secondary mt-5">
        还没有账号？
        <NuxtLink to="/register" class="text-ios-blue font-semibold">立即注册</NuxtLink>
      </p>

      <p class="text-center text-xs text-ios-tertiary mt-6 leading-relaxed">
        登录即表示同意
        <NuxtLink to="/terms" class="text-ios-secondary">服务条款</NuxtLink>
        与
        <NuxtLink to="/privacy" class="text-ios-secondary">隐私政策</NuxtLink>
      </p>
    </div>
  </div>
</template>
