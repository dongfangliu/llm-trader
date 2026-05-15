<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useAuthStore } from '~/stores/auth'
import { navigateTo } from '#app'
import api from '~/lib/api'
import { DEFAULT_APP_NAME } from '~/constants/app'

const auth = useAuthStore()
const { trackGrowthEvent } = useGrowthEvents()

const appName = ref(DEFAULT_APP_NAME)
const email = ref('')
const password = ref('')
const confirmPassword = ref('')
const inviteCode = ref('')
const loading = ref(false)
const localError = ref('')
const showPwd = ref(false)
const showConfirmPwd = ref(false)
const success = ref(false)
const resendStatus = ref('')
const resendCooldown = ref(0)
const requireInviteCode = ref(false)

let cooldownTimer: ReturnType<typeof setInterval> | null = null

const BENEFITS = [
  { key: 'chart', title: '免费分析', desc: '每天 3 次免费深度研判' },
  { key: 'sync', title: '跨设备同步', desc: '任意设备登录，数据不丢失' },
  { key: 'gift', title: '邀请奖励', desc: '使用邀请码注册，双方各得 +10 次额度' },
  { key: 'upgrade', title: '解锁升级通道', desc: '订阅标准版或专业版，无限分析' },
]

onMounted(async () => {
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search)
    const inv = params.get('invite') || localStorage.getItem('pendingInviteCode')
    if (inv) inviteCode.value = inv.trim().toUpperCase()
  }
  try {
    const res = await api.get('/api/config')
    requireInviteCode.value = !!res.data.require_invite_code
    if (res.data.app_name) appName.value = res.data.app_name
  } catch {}
})

async function handleRegister() {
  localError.value = ''

  if (!email.value || !password.value) {
    localError.value = '请填写邮箱和密码'
    return
  }
  if (password.value !== confirmPassword.value) {
    localError.value = '两次密码输入不一致'
    return
  }
  if (password.value.length < 6) {
    localError.value = '密码至少 6 位'
    return
  }
  if (requireInviteCode.value && !inviteCode.value.trim()) {
    localError.value = '注册需要邀请码'
    return
  }

  loading.value = true
  try {
    await auth.register(email.value, password.value, inviteCode.value.trim() || undefined)
    void trackGrowthEvent('registered', { has_invite: !!inviteCode.value.trim() })
    if (inviteCode.value.trim() && typeof window !== 'undefined') {
      localStorage.removeItem('pendingInviteCode')
    }
    success.value = true
  } catch (e: any) {
    localError.value = e.response?.data?.detail || '注册失败'
  } finally {
    loading.value = false
  }
}

async function handleResend() {
  if (resendCooldown.value > 0) return
  resendStatus.value = '发送中...'
  try {
    await auth.resendVerification(email.value)
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

function handleInviteCodeInput(val: string) {
  inviteCode.value = val.toUpperCase()
}
</script>

<template>
  <div class="min-h-[100dvh] bg-ios-bg flex flex-col items-center justify-center px-4 py-10">

    <!-- Verification success screen -->
    <template v-if="success">
      <div class="w-full max-w-[420px] flex flex-col items-center text-center">
        <div class="w-20 h-20 rounded-ios-xl bg-ios-green flex items-center justify-center shadow-ios-lg mb-6">
          <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
            <rect x="2" y="4" width="20" height="16" rx="3" />
            <path d="M2 7l10 6 10-6" />
            <path d="M16 19l2 2 4-4" />
          </svg>
        </div>
        <h2 class="text-[26px] font-bold text-ios-label tracking-ios-tight">请验证您的邮箱</h2>
        <p class="mt-2.5 text-[15px] text-ios-secondary leading-relaxed max-w-[320px]">
          验证邮件已发送至<br />
          <strong class="text-ios-label">{{ email }}</strong><br />
          请点击邮件中的链接完成激活。
        </p>

        <div class="w-full mt-8 flex flex-col gap-2">
          <IosButton
            :variant="resendCooldown > 0 ? 'secondary' : 'secondary'"
            :disabled="resendCooldown > 0"
            :full-width="true"
            size="lg"
            @click="handleResend"
          >
            {{ resendCooldown > 0 ? `重新发送 (${resendCooldown}s)` : '重新发送验证邮件' }}
          </IosButton>
          <p v-if="resendStatus" class="text-[13px] text-ios-secondary">{{ resendStatus }}</p>
          <IosButton variant="ghost" :full-width="true" @click="success = false">返回注册页</IosButton>
        </div>

        <p class="mt-6 text-[13px] text-ios-tertiary leading-relaxed max-w-[280px]">
          没有收到邮件？请检查垃圾邮件文件夹，或点击上方重新发送。
        </p>
      </div>
    </template>

    <!-- Registration form -->
    <template v-else>
      <div class="w-full max-w-[420px]">
        <!-- Hero -->
        <div class="flex flex-col items-center text-center mb-7">
          <div class="w-16 h-16 rounded-ios-lg bg-ios-blue flex items-center justify-center shadow-ios-lg mb-3.5">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 19V5M4 19h16" />
              <path d="M8 15l3.5-4 3 2.5L20 7" />
            </svg>
          </div>
          <h1 class="text-2xl font-bold text-ios-label tracking-ios-tight">{{ appName }}</h1>
          <p class="mt-1 text-sm text-ios-secondary">注册即解锁完整分析功能</p>
        </div>

        <!-- Form -->
        <form class="flex flex-col gap-4" @submit.prevent="handleRegister">
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
            :type="showPwd ? 'text' : 'password'"
            placeholder="至少 6 位"
            autocomplete="new-password"
          >
            <template #suffix>
              <button
                type="button"
                class="w-9 h-9 flex items-center justify-center text-ios-secondary rounded-ios-sm active:scale-90 transition-transform"
                :aria-label="showPwd ? '隐藏密码' : '显示密码'"
                @click="showPwd = !showPwd"
              >
                <svg v-if="showPwd" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
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
          <IosInput
            v-model="confirmPassword"
            label="确认密码"
            :type="showConfirmPwd ? 'text' : 'password'"
            placeholder="再次输入"
            autocomplete="new-password"
            :error="confirmPassword && password !== confirmPassword ? '两次密码不一致' : ''"
            @keyup="(e) => e.key === 'Enter' && handleRegister()"
          >
            <template #suffix>
              <button
                type="button"
                class="w-9 h-9 flex items-center justify-center text-ios-secondary rounded-ios-sm active:scale-90 transition-transform"
                :aria-label="showConfirmPwd ? '隐藏密码' : '显示密码'"
                @click="showConfirmPwd = !showConfirmPwd"
              >
                <svg v-if="showConfirmPwd" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
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
          <IosInput
            :model-value="inviteCode"
            label="邀请码"
            :placeholder="requireInviteCode ? '邀请码（必填）' : '邀请码（可选）'"
            :required="requireInviteCode"
            :hint="requireInviteCode ? '' : '可选 — 填写后双方各得 +10 次额度'"
            autocomplete="off"
            @update:model-value="handleInviteCodeInput"
          />

          <div
            v-if="inviteCode"
            class="rounded-ios bg-ios-green/8 px-3.5 py-2.5 text-[13px] font-semibold text-ios-green"
          >
            已带入邀请码 {{ inviteCode }}，注册成功后双方各得 +10 次分析额度。
          </div>

          <!-- Inline error -->
          <div
            v-if="localError"
            class="flex items-center gap-2.5 rounded-ios bg-ios-red/8 px-4 py-3 text-sm text-ios-red"
          >
            <svg class="flex-shrink-0" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 8v5M12 16h.01" />
            </svg>
            {{ localError }}
          </div>

          <IosButton type="submit" size="lg" :loading="loading" :full-width="true">
            {{ loading ? '注册中…' : '立即注册' }}
          </IosButton>
        </form>

        <p class="text-center text-sm text-ios-secondary mt-5 mb-7">
          已有账号？
          <NuxtLink to="/login" class="text-ios-blue font-semibold">直接登录</NuxtLink>
        </p>

        <!-- Benefits -->
        <IosCard section-label="注册的好处" elevation="raised" padding="none">
          <div class="divide-y divide-ios-separator">
            <IosListRow
              v-for="b in BENEFITS"
              :key="b.key"
              :title="b.title"
              :subtitle="b.desc"
              :chevron="false"
              :interactive="false"
            >
              <template #icon>
                <span class="w-9 h-9 rounded-ios-sm bg-ios-blue/10 text-ios-blue flex items-center justify-center">
                  <svg v-if="b.key === 'chart'" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M4 19V5M4 19h16" /><path d="M8 15l3.5-4 3 2.5L20 7" />
                  </svg>
                  <svg v-else-if="b.key === 'sync'" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 12a9 9 0 0 1-9 9 9 9 0 0 1-7.5-4M3 12a9 9 0 0 1 9-9 9 9 0 0 1 7.5 4" />
                    <path d="M21 4v4h-4M3 20v-4h4" />
                  </svg>
                  <svg v-else-if="b.key === 'gift'" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="8" width="18" height="13" rx="2" /><path d="M3 12h18M12 8v13" />
                    <path d="M12 8S9 3 6.5 4.5 9 8 12 8zM12 8s3-5 5.5-3.5S15 8 12 8z" />
                  </svg>
                  <svg v-else width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 19V5M5 12l7-7 7 7" />
                  </svg>
                </span>
              </template>
            </IosListRow>
          </div>
        </IosCard>

        <p class="text-center text-xs text-ios-tertiary leading-relaxed mt-6 mb-10">
          注册即表示同意
          <NuxtLink to="/terms" class="text-ios-secondary">服务条款</NuxtLink>
          与
          <NuxtLink to="/privacy" class="text-ios-secondary">隐私政策</NuxtLink>
        </p>
      </div>
    </template>
  </div>
</template>
