<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useAuthStore } from '~/stores/auth'
import { navigateTo } from '#app'
import api from '~/lib/api'
import { DEFAULT_APP_NAME } from '~/constants/app'

const auth = useAuthStore()

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
  { icon: '📊', bg: 'linear-gradient(135deg, #007aff, #3b9eff)', title: '免费分析', desc: '每天 3 次免费深度研判' },
  { icon: '☁', bg: 'linear-gradient(135deg, #34c759, #30d158)', title: '跨设备同步', desc: '任意设备登录，数据不丢失' },
  { icon: '★', bg: 'linear-gradient(135deg, #ff9500, #ffcc02)', title: '邀请奖励', desc: '使用邀请码注册，双方各得 +10 次额度' },
  { icon: '↑', bg: 'linear-gradient(135deg, #5856d6, #7c3aed)', title: '解锁升级通道', desc: '订阅标准版或专业版，无限分析' },
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

function handleInviteCodeInput(e: Event) {
  inviteCode.value = (e.target as HTMLInputElement).value.toUpperCase()
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

    <!-- Verification success screen -->
    <template v-if="success">
      <div :style="{
        width: '88px', height: '88px',
        background: 'linear-gradient(145deg, #34c759, #30d158)',
        borderRadius: '22px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '44px',
        boxShadow: '0 8px 24px rgba(52,199,89,0.35)',
        marginBottom: '24px',
      }">📧</div>
      <h2 :style="{ fontSize: '26px', fontWeight: 700, letterSpacing: '-0.4px', color: '#000', margin: '0 0 10px', textAlign: 'center' }">
        请验证您的邮箱
      </h2>
      <p :style="{ fontSize: '15px', color: '#8e8e93', textAlign: 'center', lineHeight: 1.7, margin: '0 0 32px', maxWidth: '320px', padding: '0 16px' }">
        验证邮件已发送至<br />
        <strong :style="{ color: '#000' }">{{ email }}</strong><br />
        请点击邮件中的链接完成激活。
      </p>

      <div :style="{ width: '100%', maxWidth: '480px', padding: '0 16px' }">
        <button
          type="button"
          @click="handleResend"
          :disabled="resendCooldown > 0"
          :style="{
            width: '100%', height: '50px',
            background: 'white', border: 'none',
            borderRadius: '12px', fontSize: '17px', fontWeight: 500,
            color: resendCooldown > 0 ? '#c7c7cc' : '#007aff',
            cursor: resendCooldown > 0 ? 'default' : 'pointer',
            marginBottom: '12px',
            WebkitTapHighlightColor: 'transparent',
          }"
        >{{ resendCooldown > 0 ? `重新发送 (${resendCooldown}s)` : '重新发送验证邮件' }}</button>
        <p v-if="resendStatus" :style="{ textAlign: 'center', fontSize: '13px', color: '#8e8e93', marginBottom: '12px' }">{{ resendStatus }}</p>
        <button
          type="button"
          @click="success = false"
          :style="{
            width: '100%', height: '50px',
            background: 'none', border: 'none',
            fontSize: '15px', color: '#8e8e93',
            cursor: 'pointer',
            WebkitTapHighlightColor: 'transparent',
          }"
        >返回注册页</button>
      </div>

      <p :style="{ fontSize: '13px', color: '#aeaeb2', marginTop: '24px', textAlign: 'center', maxWidth: '280px', lineHeight: 1.6, padding: '0 16px' }">
        没有收到邮件？请检查垃圾邮件文件夹，或点击上方重新发送。
      </p>
    </template>

    <!-- Registration form -->
    <template v-else>
      <!-- Hero -->
      <div :style="{
        width: '100%', maxWidth: '480px',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: '24px 16px 24px', textAlign: 'center',
      }">
        <div :style="{
          width: '72px', height: '72px',
          background: 'linear-gradient(145deg, #007aff, #5856d6)',
          borderRadius: '18px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '36px',
          boxShadow: '0 6px 20px rgba(0,122,255,0.28)',
          marginBottom: '14px',
        }">📈</div>
        <h1 :style="{ fontSize: '26px', fontWeight: 700, letterSpacing: '-0.4px', color: '#000', margin: '0 0 5px' }">
          {{ appName }}
        </h1>
        <p :style="{ fontSize: '14px', color: '#8e8e93', margin: 0 }">
          注册即解锁完整分析功能
        </p>
      </div>

      <div :style="{ width: '100%', maxWidth: '480px', padding: '0 16px' }">
        <!-- Form card -->
        <div :style="{ background: 'white', borderRadius: '12px', overflow: 'hidden', marginBottom: '20px' }">
          <!-- Email row -->
          <div :style="{
            display: 'flex', alignItems: 'center', minHeight: '44px',
            padding: '0 16px',
            borderBottom: '0.5px solid rgba(60,60,67,0.12)',
          }">
            <label :style="{ fontSize: '15px', color: '#000', fontWeight: 400, width: '80px', flexShrink: 0 }">邮箱</label>
            <input
              v-model="email"
              type="email"
              placeholder="your@email.com"
              autocomplete="email"
              :style="{
                flex: 1, border: 'none', outline: 'none', background: 'transparent',
                fontSize: '15px', color: '#000', padding: '10px 0',
              }"
            />
          </div>

          <!-- Password row -->
          <div :style="{
            display: 'flex', alignItems: 'center', minHeight: '44px',
            padding: '0 16px',
            borderBottom: '0.5px solid rgba(60,60,67,0.12)',
          }">
            <label :style="{ fontSize: '15px', color: '#000', fontWeight: 400, width: '80px', flexShrink: 0 }">密码</label>
            <input
              v-model="password"
              :type="showPwd ? 'text' : 'password'"
              placeholder="至少 6 位"
              autocomplete="new-password"
              :style="{
                flex: 1, border: 'none', outline: 'none', background: 'transparent',
                fontSize: '15px', color: '#000', padding: '10px 0',
              }"
            />
            <button
              type="button"
              @click="showPwd = !showPwd"
              :style="{
                background: 'none', border: 'none',
                padding: '0 4px 0 12px', margin: '0 -4px 0 0',
                minWidth: '44px', minHeight: '44px',
                cursor: 'pointer', color: '#8e8e93', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                WebkitTapHighlightColor: 'transparent',
              }"
            >
              <svg v-if="showPwd" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
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

          <!-- Confirm password row -->
          <div :style="{
            display: 'flex', alignItems: 'center', minHeight: '44px',
            padding: '0 16px',
            borderBottom: '0.5px solid rgba(60,60,67,0.12)',
          }">
            <label :style="{ fontSize: '15px', color: '#000', fontWeight: 400, width: '80px', flexShrink: 0 }">确认密码</label>
            <input
              v-model="confirmPassword"
              :type="showConfirmPwd ? 'text' : 'password'"
              placeholder="再次输入"
              autocomplete="new-password"
              @keyup.enter="handleRegister"
              :style="{
                flex: 1, border: 'none', outline: 'none', background: 'transparent',
                fontSize: '15px', color: '#000', padding: '10px 0',
              }"
            />
            <button
              type="button"
              @click="showConfirmPwd = !showConfirmPwd"
              :style="{
                background: 'none', border: 'none',
                padding: '0 4px 0 12px', margin: '0 -4px 0 0',
                minWidth: '44px', minHeight: '44px',
                cursor: 'pointer', color: '#8e8e93', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                WebkitTapHighlightColor: 'transparent',
              }"
            >
              <svg v-if="showConfirmPwd" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
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

          <!-- Invite code row -->
          <div :style="{
            display: 'flex', alignItems: 'center', minHeight: '44px',
            padding: '0 16px',
          }">
            <label :style="{ fontSize: '15px', color: '#000', fontWeight: 400, minWidth: '80px', flexShrink: 0 }">
              邀请码<span v-if="requireInviteCode" :style="{ fontSize: '11px', color: '#ff3b30', marginLeft: '2px' }">*</span>
              <span v-else :style="{ fontSize: '11px', color: '#aeaeb2', marginLeft: '2px' }">（可选）</span>
            </label>
            <input
              :value="inviteCode"
              @input="handleInviteCodeInput"
              type="text"
              :placeholder="requireInviteCode ? '邀请码（必填）' : '邀请码（可选）'"
              autocomplete="off"
              :style="{
                flex: 1, border: 'none', outline: 'none', background: 'transparent',
                fontSize: '15px', color: '#000', padding: '10px 0',
                letterSpacing: '0.5px',
              }"
            />
          </div>
        </div>

        <div v-if="inviteCode" :style="{
          background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '12px',
          padding: '10px 14px', margin: '-8px 0 16px',
          fontSize: '13px', color: '#15803d', fontWeight: 600,
        }">
          已带入邀请码 {{ inviteCode }}，注册成功后双方各得 +10 次分析额度。
        </div>

        <!-- Error -->
        <div v-if="localError" :style="{
          background: 'white', borderRadius: '12px', padding: '12px 16px',
          marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px',
        }">
          <span :style="{ fontSize: '20px' }">⚠️</span>
          <p :style="{ fontSize: '14px', color: '#ff3b30', margin: 0 }">{{ localError }}</p>
        </div>

        <!-- Register button -->
        <button
          type="button"
          @click="handleRegister"
          :disabled="loading"
          :style="{
            width: '100%', height: '50px',
            background: loading ? '#c7c7cc' : '#007aff',
            color: 'white', border: 'none', borderRadius: '12px',
            fontSize: '17px', fontWeight: 600,
            cursor: loading ? 'default' : 'pointer',
            marginBottom: '12px',
            WebkitTapHighlightColor: 'transparent',
          }"
        >{{ loading ? '注册中…' : '立即注册' }}</button>

        <!-- Login link -->
        <p :style="{ textAlign: 'center', fontSize: '14px', color: '#8e8e93', margin: '0 0 28px' }">
          已有账号？
          <NuxtLink to="/login" :style="{ color: '#007aff', textDecoration: 'none', fontWeight: 600 }">直接登录</NuxtLink>
        </p>

        <!-- Benefits section -->
        <p :style="{ fontSize: '12px', fontWeight: 600, color: '#8e8e93', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '0 4px', marginBottom: '8px' }">
          注册的好处
        </p>
        <div :style="{ background: 'white', borderRadius: '12px', overflow: 'hidden', marginBottom: '24px' }">
          <div
            v-for="(b, i) in BENEFITS"
            :key="i"
            :style="{
              display: 'flex', alignItems: 'center', gap: '12px',
              padding: '10px 16px',
              borderBottom: i < BENEFITS.length - 1 ? '0.5px solid rgba(60,60,67,0.1)' : 'none',
            }"
          >
            <div :style="{
              width: '36px', height: '36px', borderRadius: '10px', flexShrink: 0,
              background: b.bg,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '17px', color: 'white', fontWeight: 700,
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            }">{{ b.icon }}</div>
            <div>
              <p :style="{ fontSize: '14px', fontWeight: 500, color: '#000', margin: '0 0 1px' }">{{ b.title }}</p>
              <p :style="{ fontSize: '12px', color: '#8e8e93', margin: 0 }">{{ b.desc }}</p>
            </div>
          </div>
        </div>

        <!-- Terms -->
        <p :style="{ textAlign: 'center', fontSize: '12px', color: '#aeaeb2', lineHeight: 1.6, marginBottom: '40px' }">
          注册即表示同意
          <NuxtLink to="/terms" :style="{ color: '#8e8e93', textDecoration: 'none' }">服务条款</NuxtLink>
          与
          <NuxtLink to="/privacy" :style="{ color: '#8e8e93', textDecoration: 'none' }">隐私政策</NuxtLink>
        </p>
      </div>
    </template>
  </div>
</template>
