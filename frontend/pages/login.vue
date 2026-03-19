<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useAuthStore } from '~/stores/auth'
import { navigateTo } from '#app'

const auth = useAuthStore()

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

onMounted(() => {
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
  <div :style="{
    minHeight: '100dvh',
    background: '#f2f2f7',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px 0',
  }">
    <!-- Hero block -->
    <div :style="{
      width: '100%',
      maxWidth: '480px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '32px 16px 28px',
      textAlign: 'center',
    }">
      <div :style="{
        width: '80px',
        height: '80px',
        background: 'linear-gradient(145deg, #007aff, #5856d6)',
        borderRadius: '20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '40px',
        boxShadow: '0 8px 24px rgba(0,122,255,0.3)',
        marginBottom: '16px',
      }">📈</div>
      <h1 :style="{ fontSize: '28px', fontWeight: 700, letterSpacing: '-0.5px', color: '#000', margin: '0 0 6px' }">
        AI 股票分析
      </h1>
      <p :style="{ fontSize: '15px', color: '#8e8e93', margin: 0 }">
        AI 驱动的专业技术分析平台
      </p>
    </div>

    <!-- Form card -->
    <div :style="{ width: '100%', maxWidth: '480px', padding: '0 16px' }">
      <div :style="{ background: 'white', borderRadius: '12px', overflow: 'hidden', marginBottom: '20px' }">
        <!-- Email row -->
        <div :style="{
          display: 'flex',
          alignItems: 'center',
          minHeight: '44px',
          padding: '0 16px',
          borderBottom: '0.5px solid rgba(60,60,67,0.12)',
        }">
          <label :style="{ fontSize: '15px', color: '#000', fontWeight: 400, width: '72px', flexShrink: 0 }">邮箱</label>
          <input
            v-model="email"
            type="email"
            placeholder="your@email.com"
            autocomplete="email"
            :style="{
              flex: 1,
              border: 'none',
              outline: 'none',
              background: 'transparent',
              fontSize: '15px',
              color: '#000',
              padding: '10px 0',
            }"
          />
        </div>
        <!-- Password row -->
        <div :style="{
          display: 'flex',
          alignItems: 'center',
          minHeight: '44px',
          padding: '0 16px',
        }">
          <label :style="{ fontSize: '15px', color: '#000', fontWeight: 400, width: '72px', flexShrink: 0 }">密码</label>
          <input
            v-model="password"
            :type="showPassword ? 'text' : 'password'"
            placeholder="请输入密码"
            autocomplete="current-password"
            @keyup.enter="handleLogin"
            :style="{
              flex: 1,
              border: 'none',
              outline: 'none',
              background: 'transparent',
              fontSize: '15px',
              color: '#000',
              padding: '10px 0',
            }"
          />
          <button
            type="button"
            @click="showPassword = !showPassword"
            :style="{
              background: 'none',
              border: 'none',
              padding: '0 4px 0 12px',
              margin: '0 -4px 0 0',
              minWidth: '44px',
              minHeight: '44px',
              cursor: 'pointer',
              color: '#8e8e93',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              WebkitTapHighlightColor: 'transparent',
            }"
          >
            <svg v-if="showPassword" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
            <svg v-else width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
              <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
              <line x1="1" y1="1" x2="23" y2="23"/>
            </svg>
          </button>
        </div>
      </div>

      <!-- Error state -->
      <div v-if="error && !showVerifyError" :style="{
        background: 'white',
        borderRadius: '12px',
        padding: '12px 16px',
        marginBottom: '16px',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
      }">
        <span :style="{ fontSize: '20px' }">⚠️</span>
        <p :style="{ fontSize: '14px', color: '#ff3b30', margin: 0 }">{{ error }}</p>
      </div>

      <!-- Unverified email -->
      <div v-if="showVerifyError" :style="{
        background: 'white',
        borderRadius: '12px',
        padding: '16px',
        marginBottom: '16px',
        borderLeft: '3px solid #ff9500',
      }">
        <div :style="{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '10px' }">
          <span :style="{ fontSize: '22px', lineHeight: 1 }">📧</span>
          <div>
            <p :style="{ fontSize: '14px', fontWeight: 600, color: '#000', margin: '0 0 4px' }">邮箱尚未验证</p>
            <p :style="{ fontSize: '13px', color: '#8e8e93', margin: 0, lineHeight: 1.5 }">
              验证邮件已发送至 <strong :style="{ color: '#000' }">{{ verifyEmail }}</strong>，请检查收件箱并点击链接完成验证。
            </p>
          </div>
        </div>
        <button
          type="button"
          @click="handleResend"
          :disabled="resendCooldown > 0"
          :style="{
            background: resendCooldown > 0 ? '#f2f2f7' : '#007aff',
            border: 'none',
            borderRadius: '8px',
            padding: '8px 14px',
            color: resendCooldown > 0 ? '#8e8e93' : 'white',
            fontSize: '14px',
            fontWeight: 500,
            cursor: resendCooldown > 0 ? 'default' : 'pointer',
            WebkitTapHighlightColor: 'transparent',
            transition: 'background 0.15s',
          }"
        >{{ resendCooldown > 0 ? `重新发送 (${resendCooldown}s)` : '重新发送验证邮件' }}</button>
        <p v-if="resendStatus" :style="{ fontSize: '13px', color: '#8e8e93', marginTop: '8px', marginBottom: 0 }">{{ resendStatus }}</p>
      </div>

      <!-- Remember credentials toggle -->
      <div :style="{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '0 4px',
        marginBottom: '16px',
      }">
        <div
          @click="toggleRemember"
          :style="{
            width: '44px',
            height: '26px',
            borderRadius: '13px',
            background: rememberCredentials ? '#34c759' : '#d1d1d6',
            position: 'relative',
            cursor: 'pointer',
            transition: 'background 0.2s',
            flexShrink: 0,
          }"
        >
          <div :style="{
            position: 'absolute',
            top: '2px',
            left: rememberCredentials ? '20px' : '2px',
            width: '22px',
            height: '22px',
            borderRadius: '50%',
            background: 'white',
            boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
            transition: 'left 0.2s',
          }" />
        </div>
        <label
          @click="toggleRemember"
          :style="{ fontSize: '14px', color: '#3c3c43', cursor: 'pointer', userSelect: 'none' }"
        >记住账号和密码</label>
      </div>

      <!-- Login button -->
      <button
        type="button"
        @click="handleLogin"
        :disabled="loading"
        :style="{
          width: '100%',
          height: '50px',
          background: loading ? '#c7c7cc' : '#007aff',
          color: 'white',
          border: 'none',
          borderRadius: '12px',
          fontSize: '17px',
          fontWeight: 600,
          cursor: loading ? 'default' : 'pointer',
          transition: 'background 0.15s',
          WebkitTapHighlightColor: 'transparent',
          marginBottom: '12px',
        }"
      >{{ loading ? '登录中…' : '登录' }}</button>

      <!-- Register link -->
      <p :style="{ textAlign: 'center', fontSize: '14px', color: '#8e8e93', margin: '0 0 24px' }">
        还没有账号？
        <NuxtLink to="/register" :style="{ color: '#007aff', textDecoration: 'none', fontWeight: 600 }">立即注册</NuxtLink>
      </p>

      <!-- Terms -->
      <p :style="{ textAlign: 'center', fontSize: '12px', color: '#aeaeb2', marginTop: '24px', lineHeight: 1.6 }">
        登录即表示同意
        <NuxtLink to="/terms" :style="{ color: '#8e8e93', textDecoration: 'none' }">服务条款</NuxtLink>
        与
        <NuxtLink to="/privacy" :style="{ color: '#8e8e93', textDecoration: 'none' }">隐私政策</NuxtLink>
      </p>
    </div>
  </div>
</template>
