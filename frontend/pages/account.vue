<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from '#app'
import { useAuthStore } from '~/stores/auth'
import api from '~/lib/api'
import { DEFAULT_APP_NAME } from '~/constants/app'

const router = useRouter()
const auth = useAuthStore()

const limits = ref<{ remaining: number; daily_limit: number } | null>(null)
const afdianBasicLink = ref('https://afdian.net')
const afdianPremiumLink = ref('https://afdian.net')
const inviteInput = ref('')
const inviteMsg = ref<{ type: 'ok' | 'err'; text: string } | null>(null)
const inviteLoading = ref(false)
const copiedInvite = ref(false)
const copiedInviteLink = ref(false)
const appName = ref(DEFAULT_APP_NAME)

const TIER_LABELS: Record<string, string> = { free: '免费版', basic: '标准版', premium: '专业版' }

onMounted(async () => {
  await auth.fetchMe()
  if (!auth.isLoggedIn) {
    router.push('/login')
    return
  }

  try {
    const res = await api.get('/api/analyze/limits')
    limits.value = { remaining: res.data.remaining, daily_limit: res.data.daily_limit }
  } catch {}

  try {
    const res = await api.get('/api/config')
    if (res.data.afdian_basic_link) afdianBasicLink.value = res.data.afdian_basic_link
    if (res.data.afdian_premium_link) afdianPremiumLink.value = res.data.afdian_premium_link
    if (res.data.app_name) appName.value = res.data.app_name
  } catch {}
})

async function handleUseInvite() {
  if (!inviteInput.value.trim()) return
  inviteLoading.value = true
  inviteMsg.value = null
  try {
    const res = await api.post('/api/auth/invite/use', { invite_code: inviteInput.value.trim() })
    inviteMsg.value = { type: 'ok', text: res.data.message || '成功！双方各获得 +10 次分析额度' }
    inviteInput.value = ''
    await auth.fetchMe()
  } catch (e: any) {
    inviteMsg.value = { type: 'err', text: e.response?.data?.detail || '邀请码无效' }
  } finally {
    inviteLoading.value = false
  }
}

function copyInviteCode() {
  if (!auth.user?.invite_code) return
  navigator.clipboard?.writeText(auth.user.invite_code).then(() => {
    copiedInvite.value = true
    setTimeout(() => { copiedInvite.value = false }, 2000)
  })
}

function handleLogout() {
  auth.logout()
  router.push('/login')
}

const tier = computed(() => auth.user?.tier ?? 'free')
const tierLabel = computed(() => TIER_LABELS[tier.value] ?? tier.value)
const tierBadgeVariant = computed<'orange' | 'blue' | 'gray'>(() =>
  tier.value === 'premium' ? 'orange' : tier.value === 'basic' ? 'blue' : 'gray',
)
const inviteLink = computed(() => {
  if (typeof window === 'undefined' || !auth.user?.invite_code) return ''
  const url = new URL('/', window.location.origin)
  url.searchParams.set('market', 'a')
  url.searchParams.set('symbol', '600519')
  url.searchParams.set('invite', auth.user.invite_code)
  return url.toString()
})

function copyInviteLink() {
  if (!inviteLink.value) return
  navigator.clipboard?.writeText(inviteLink.value).then(() => {
    copiedInviteLink.value = true
    setTimeout(() => { copiedInviteLink.value = false }, 2000)
  })
}
</script>

<template>
  <div class="min-h-[100dvh] bg-ios-bg">
    <IosNavBar title="账户" back="/" />

    <!-- Not logged in -->
    <div v-if="!auth.isLoggedIn" class="flex items-center justify-center px-6" style="min-height: calc(100dvh - 48px)">
      <IosCard elevation="raised" padding="lg" class="w-full max-w-[340px]">
        <IosEmptyState title="请先登录" description="登录后查看账号信息和历史分析" size="sm">
          <template #icon>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
              <rect x="4" y="11" width="16" height="10" rx="2.5" />
              <path d="M8 11V7a4 4 0 0 1 8 0v4" />
            </svg>
          </template>
          <template #action>
            <div class="flex flex-col gap-2.5 w-full">
              <NuxtLink to="/login"><IosButton size="lg" :full-width="true">前往登录</IosButton></NuxtLink>
              <NuxtLink to="/"><IosButton variant="secondary" size="lg" :full-width="true">返回首页</IosButton></NuxtLink>
            </div>
          </template>
        </IosEmptyState>
      </IosCard>
    </div>

    <!-- Logged in -->
    <div v-else class="max-w-[680px] mx-auto px-4 py-5 flex flex-col gap-4">

      <!-- Profile -->
      <IosCard elevation="raised" padding="lg">
        <div class="flex items-center gap-4">
          <div class="w-14 h-14 rounded-full bg-ios-blue flex items-center justify-center text-white font-bold text-[22px] flex-shrink-0">
            {{ (auth.user?.email || 'U')[0].toUpperCase() }}
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-base font-semibold text-ios-label truncate">{{ auth.user?.email }}</p>
            <div class="flex items-center gap-2 flex-wrap mt-1.5">
              <IosBadge :variant="tierBadgeVariant">{{ tierLabel }}</IosBadge>
              <IosBadge v-if="!auth.user?.is_verified" variant="orange">未验证</IosBadge>
              <span v-if="limits" class="text-xs text-ios-secondary">
                今日剩余 {{ limits.remaining }}/{{ limits.daily_limit }} 次
              </span>
            </div>
          </div>
        </div>
      </IosCard>

      <!-- Subscription -->
      <IosCard section-label="订阅状态" elevation="raised" padding="lg">
        <div class="flex items-center justify-between py-2 border-b border-ios-separator">
          <span class="text-[15px] text-ios-label">当前套餐</span>
          <span class="text-[15px] font-semibold text-ios-label">{{ tierLabel }}</span>
        </div>

        <div v-if="tier === 'premium'" class="mt-4 rounded-ios bg-ios-blue/6 px-4 py-4 text-center">
          <div class="flex justify-center mb-2 text-ios-blue">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 7l4 4 5-7 5 7 4-4-2 13H5L3 7z" />
            </svg>
          </div>
          <p class="text-[15px] font-bold text-ios-label">您已是专业会员</p>
          <p class="mt-1 text-[13px] text-ios-secondary">每日 15 次分析 · 全市场 · 优先通道</p>
        </div>

        <div v-else class="mt-4 flex flex-col gap-2.5">
          <NuxtLink v-if="tier === 'free'" to="/upgrade?tier=basic">
            <IosButton variant="secondary" size="lg" :full-width="true">升级标准版</IosButton>
          </NuxtLink>
          <NuxtLink to="/upgrade?tier=premium">
            <IosButton size="lg" :full-width="true">升级专业版</IosButton>
          </NuxtLink>
        </div>
      </IosCard>

      <!-- Invite -->
      <IosCard v-if="auth.user?.invite_code" elevation="raised" padding="lg">
        <div class="flex items-center gap-2 mb-1.5">
          <span class="text-ios-blue">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="8" width="18" height="13" rx="2" /><path d="M3 12h18M12 8v13" />
              <path d="M12 8S9 3 6.5 4.5 9 8 12 8zM12 8s3-5 5.5-3.5S15 8 12 8z" />
            </svg>
          </span>
          <h2 class="text-base font-bold text-ios-label">邀请好友 · 共享额度</h2>
        </div>
        <p class="text-[13px] text-ios-secondary leading-relaxed mb-4">
          每成功邀请一位新用户注册，双方各获得 <strong class="text-ios-label">+10 次</strong> 分析额度（永久累加）
          <span v-if="(auth.user?.bonus_quota ?? 0) > 0" class="ml-1.5 text-ios-blue font-semibold">当前奖励余额：{{ auth.user?.bonus_quota }} 次</span>
        </p>

        <!-- My invite code -->
        <div class="mb-4">
          <p class="text-xs text-ios-secondary mb-1.5">我的邀请码</p>
          <div class="flex items-center gap-2.5">
            <code class="flex-1 text-center bg-ios-bg border border-ios-separator rounded-ios-sm py-2 font-bold text-lg tracking-[0.15em] text-ios-label font-mono">{{ auth.user?.invite_code }}</code>
            <IosButton variant="secondary" size="sm" @click="copyInviteCode">{{ copiedInvite ? '已复制' : '复制' }}</IosButton>
          </div>
        </div>

        <!-- Invite link -->
        <div class="mb-4">
          <p class="text-xs text-ios-secondary mb-1.5">默认邀请链接</p>
          <div class="flex items-center gap-2.5">
            <div class="flex-1 min-w-0 bg-ios-bg border border-ios-separator rounded-ios-sm px-2.5 py-2 text-xs text-ios-secondary truncate">{{ inviteLink }}</div>
            <IosButton size="sm" @click="copyInviteLink">{{ copiedInviteLink ? '已复制' : '复制链接' }}</IosButton>
          </div>
          <p class="text-xs text-ios-secondary mt-1.5">分享分析结果时会自动换成对应股票链接，并携带你的邀请码。</p>
        </div>

        <!-- Use friend's code -->
        <div>
          <p class="text-xs text-ios-secondary mb-1.5">输入好友邀请码</p>
          <div
            v-if="auth.user?.used_invite_code"
            class="text-[13px] text-ios-green font-semibold px-3.5 py-2.5 bg-ios-green/8 rounded-ios-sm"
          >
            已兑换邀请码 <code class="bg-ios-card px-2 py-0.5 rounded tracking-[0.1em]">{{ auth.user?.used_invite_code }}</code>（每账号限兑换一次）
          </div>
          <template v-else>
            <div class="flex gap-2.5">
              <input
                v-model="inviteInput"
                maxlength="8"
                placeholder="8位邀请码"
                class="flex-1 h-11 px-3.5 rounded-ios-sm border border-ios-separator bg-ios-bg text-ios-label text-base font-mono tracking-[0.1em] uppercase outline-none focus:border-ios-blue focus:ring-2 focus:ring-ios-blue/15 transition-all"
                @input="inviteInput = (inviteInput as string).toUpperCase()"
                @keydown.enter="handleUseInvite"
              />
              <IosButton
                size="md"
                :loading="inviteLoading"
                :disabled="inviteLoading || !inviteInput.trim()"
                @click="handleUseInvite"
              >兑换</IosButton>
            </div>
            <p
              v-if="inviteMsg"
              class="text-[13px] mt-2"
              :class="inviteMsg.type === 'ok' ? 'text-ios-green' : 'text-ios-red'"
            >{{ inviteMsg.text }}</p>
          </template>
        </div>
      </IosCard>

      <!-- Standalone bonus quota -->
      <IosCard
        v-if="!auth.user?.invite_code && (auth.user?.bonus_quota ?? 0) > 0"
        elevation="raised"
        padding="md"
      >
        <div class="flex items-center justify-between">
          <span class="text-[15px] text-ios-label">永久额度</span>
          <span class="text-xl font-bold text-ios-green">+{{ auth.user?.bonus_quota }}</span>
        </div>
      </IosCard>

      <!-- Quick links -->
      <IosCard elevation="raised" padding="none">
        <div class="divide-y divide-ios-separator">
          <IosListRow v-if="auth.isAdmin" to="/admin" title="管理后台">
            <template #icon>
              <span class="w-8 h-8 rounded-ios-sm bg-ios-orange/12 text-ios-orange flex items-center justify-center">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </span>
            </template>
          </IosListRow>
          <IosListRow to="/upgrade" title="订阅管理 / 激活">
            <template #icon>
              <span class="w-8 h-8 rounded-ios-sm bg-ios-blue/10 text-ios-blue flex items-center justify-center">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M3 7l4 4 5-7 5 7 4-4-2 13H5L3 7z" />
                </svg>
              </span>
            </template>
          </IosListRow>
          <PwaInstallButton :appName="appName" variant="row" />
        </div>
      </IosCard>

      <!-- Logout -->
      <button
        type="button"
        class="w-full min-h-[52px] rounded-ios bg-ios-red/8 text-ios-red text-[17px] font-semibold transition-all duration-150 active:scale-[0.98] active:bg-ios-red/12"
        @click="handleLogout"
      >
        退出登录
      </button>

      <div class="h-6" />
    </div>
  </div>
</template>
