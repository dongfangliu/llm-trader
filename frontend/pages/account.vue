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
    inviteMsg.value = { type: 'ok', text: res.data.message || '成功！双方各获得 +10 次分析额度 🎉' }
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
  <div style="min-height: 100vh; background: #f2f2f7;">
    <!-- Nav Bar -->
    <div style="position: sticky; top: 0; z-index: 100; background: rgba(249,249,249,0.94); backdrop-filter: blur(20px) saturate(180%); -webkit-backdrop-filter: blur(20px) saturate(180%); border-bottom: 0.5px solid rgba(0,0,0,0.12); display: flex; align-items: center; justify-content: space-between; padding: 0 16px; height: 44px;">
      <NuxtLink to="/" style="font-size: 17px; color: #007aff; text-decoration: none; display: flex; align-items: center; gap: 2px;">‹ 返回</NuxtLink>
      <span style="font-size: 17px; font-weight: 600; color: #000;">账户</span>
      <span style="width: 40px; display: inline-block;" />
    </div>

    <!-- Not logged in state -->
    <div v-if="!auth.isLoggedIn" style="display: flex; align-items: center; justify-content: center; min-height: calc(100vh - 44px);">
      <div style="background: white; border-radius: 20px; padding: 40px 32px; text-align: center; max-width: 320px; width: calc(100% - 48px); box-shadow: 0 2px 16px rgba(0,0,0,0.08);">
        <div style="font-size: 48px; margin-bottom: 12px;">🔐</div>
        <p style="font-size: 17px; font-weight: 600; color: #000; margin: 0 0 8px;">请先登录</p>
        <p style="font-size: 14px; color: #8e8e93; margin: 0 0 24px;">登录后查看账号信息和历史分析</p>
        <NuxtLink to="/login" style="display: block; width: 100%; height: 50px; background: #007aff; color: white; border-radius: 12px; font-size: 17px; font-weight: 600; text-decoration: none; text-align: center; line-height: 50px; margin-bottom: 12px; box-sizing: border-box;">前往登录</NuxtLink>
        <NuxtLink to="/" style="display: block; width: 100%; height: 50px; background: #f2f2f7; color: #007aff; border-radius: 12px; font-size: 17px; font-weight: 600; text-decoration: none; text-align: center; line-height: 50px; box-sizing: border-box;">返回首页</NuxtLink>
      </div>
    </div>

    <!-- Logged in state -->
    <template v-else>
      <div style="padding: 20px 16px; max-width: 680px; margin: 0 auto; display: flex; flex-direction: column; gap: 16px;">

        <!-- Profile card -->
        <div style="background: white; border-radius: 20px; padding: 20px; box-shadow: 0 2px 16px rgba(0,0,0,0.06);">
          <div style="display: flex; align-items: center; gap: 16px;">
            <!-- Avatar -->
            <div style="width: 56px; height: 56px; border-radius: 50%; background: linear-gradient(135deg, #6366f1, #8b5cf6); display: flex; align-items: center; justify-content: center; color: white; font-weight: 700; font-size: 22px; flex-shrink: 0;">
              {{ (auth.user?.email || 'U')[0].toUpperCase() }}
            </div>
            <div style="flex: 1; min-width: 0;">
              <p style="font-size: 16px; font-weight: 600; color: #000; margin: 0 0 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">{{ auth.user?.email }}</p>
              <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                <!-- Tier badge -->
                <span style="font-size: 12px; font-weight: 600; padding: 3px 10px; border-radius: 9999px;"
                  :style="tier === 'premium' ? { background: '#f3e8ff', color: '#7c3aed' } : tier === 'basic' ? { background: '#dbeafe', color: '#1d4ed8' } : { background: '#f2f2f7', color: '#8e8e93' }">
                  {{ tierLabel }}
                </span>
                <!-- Verification badge -->
                <span v-if="!auth.user?.is_verified" style="font-size: 12px; font-weight: 600; padding: 3px 10px; border-radius: 9999px; background: #fff7ed; color: #c2410c;">未验证</span>
                <!-- Quota -->
                <span v-if="limits" style="font-size: 12px; color: #8e8e93;">
                  今日剩余 {{ limits.remaining }}/{{ limits.daily_limit }} 次
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- Subscription card -->
        <div style="background: white; border-radius: 20px; overflow: hidden; box-shadow: 0 2px 16px rgba(0,0,0,0.06);">
          <div style="padding: 16px 20px 0; font-size: 12px; font-weight: 600; color: #8e8e93; text-transform: uppercase; letter-spacing: 0.06em;">订阅状态</div>
          <div style="padding: 12px 20px 20px;">
            <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px 0; border-bottom: 0.5px solid rgba(60,60,67,0.1);">
              <span style="font-size: 15px; color: #000;">当前套餐</span>
              <span style="font-size: 15px; font-weight: 600; color: #000;">{{ tierLabel }}</span>
            </div>
            <!-- Premium status -->
            <div v-if="tier === 'premium'" style="margin-top: 16px; background: linear-gradient(135deg, #f5f3ff, #ede9fe); border-radius: 12px; padding: 16px; text-align: center; border: 1px solid #c4b5fd;">
              <div style="font-size: 24px; margin-bottom: 6px;">🏆</div>
              <p style="font-size: 15px; font-weight: 700; color: #5b21b6; margin: 0 0 4px;">您已是专业会员</p>
              <p style="font-size: 13px; color: #6d28d9; margin: 0;">每日 {{ 15 }} 次分析 · 全市场 · 优先通道</p>
            </div>
            <!-- Upgrade button for non-premium -->
            <div v-else style="margin-top: 16px; display: flex; flex-direction: column; gap: 10px;">
              <NuxtLink v-if="tier === 'free'" :to="'/upgrade?tier=basic'" style="display: block; width: 100%; height: 50px; border-radius: 12px; background: #007aff; color: white; font-size: 17px; font-weight: 600; text-decoration: none; text-align: center; line-height: 50px; box-sizing: border-box;">升级标准版 →</NuxtLink>
              <NuxtLink :to="'/upgrade?tier=premium'" style="display: block; width: 100%; height: 50px; border-radius: 12px; background: linear-gradient(135deg, #7c3aed, #4f46e5); color: white; font-size: 17px; font-weight: 600; text-decoration: none; text-align: center; line-height: 50px; box-sizing: border-box;">升级专业版 →</NuxtLink>
            </div>
          </div>
        </div>

        <!-- Invite code card -->
        <div v-if="auth.user?.invite_code" style="background: white; border-radius: 20px; padding: 20px; box-shadow: 0 2px 16px rgba(0,0,0,0.06);">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
            <span style="font-size: 18px;">🎁</span>
            <h2 style="font-size: 16px; font-weight: 700; color: #000; margin: 0;">邀请好友·共享额度</h2>
          </div>
          <p style="font-size: 13px; color: #8e8e93; margin: 0 0 16px; line-height: 1.5;">
            每成功邀请一位新用户注册，双方各获得 <strong style="color: #000;">+10 次</strong>分析额度（永久累加）
            <span v-if="(auth.user?.bonus_quota ?? 0) > 0" style="margin-left: 8px; color: #7c3aed; font-weight: 600;">当前奖励余额：{{ auth.user?.bonus_quota }} 次</span>
          </p>

          <!-- My invite code -->
          <div style="margin-bottom: 16px;">
            <p style="font-size: 12px; color: #8e8e93; margin: 0 0 6px;">我的邀请码</p>
            <div style="display: flex; align-items: center; gap: 10px;">
              <code style="background: #f2f2f7; padding: 8px 14px; border-radius: 10px; font-weight: 700; font-size: 18px; letter-spacing: 0.15em; color: #000; border: 1px solid #e5e5ea; flex: 1; text-align: center; font-family: monospace;">{{ auth.user?.invite_code }}</code>
              <button @click="copyInviteCode" style="height: 40px; padding: 0 16px; background: #f2f2f7; color: #007aff; border: 1px solid #e5e5ea; border-radius: 10px; font-size: 14px; font-weight: 600; cursor: pointer; white-space: nowrap; flex-shrink: 0;">
                {{ copiedInvite ? '已复制 ✓' : '复制' }}
              </button>
            </div>
          </div>

          <div style="margin-bottom: 16px;">
            <p style="font-size: 12px; color: #8e8e93; margin: 0 0 6px;">默认邀请链接</p>
            <div style="display: flex; align-items: center; gap: 10px;">
              <div style="flex: 1; min-width: 0; background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 10px; padding: 8px 10px; font-size: 12px; color: #6b7280; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">{{ inviteLink }}</div>
              <button @click="copyInviteLink" style="height: 40px; padding: 0 16px; background: #007aff; color: white; border: none; border-radius: 10px; font-size: 14px; font-weight: 600; cursor: pointer; white-space: nowrap; flex-shrink: 0;">
                {{ copiedInviteLink ? '已复制 ✓' : '复制链接' }}
              </button>
            </div>
            <p style="font-size: 12px; color: #8e8e93; margin: 6px 0 0;">分享分析结果时会自动换成对应股票链接，并携带你的邀请码。</p>
          </div>

          <!-- Use friend's invite code -->
          <div>
            <p style="font-size: 12px; color: #8e8e93; margin: 0 0 6px;">输入好友邀请码</p>
            <div v-if="auth.user?.used_invite_code" style="font-size: 13px; color: #16a34a; font-weight: 600; padding: 10px 14px; background: #f0fdf4; border-radius: 10px;">
              ✓ 已兑换邀请码 <code style="background: white; padding: 2px 8px; border-radius: 4px; letter-spacing: 0.1em;">{{ auth.user?.used_invite_code }}</code>（每账号限兑换一次）
            </div>
            <template v-else>
              <div style="display: flex; gap: 10px;">
                <input
                  v-model="inviteInput"
                  @input="inviteInput = (inviteInput as string).toUpperCase()"
                  @keydown.enter="handleUseInvite"
                  placeholder="8位邀请码"
                  maxlength="8"
                  style="flex: 1; height: 44px; padding: 0 14px; border: 1px solid rgba(60,60,67,0.18); border-radius: 10px; font-size: 16px; font-family: monospace; letter-spacing: 0.1em; text-transform: uppercase; background: #f2f2f7; color: #000; outline: none; box-sizing: border-box;"
                />
                <button
                  @click="handleUseInvite"
                  :disabled="inviteLoading || !inviteInput.trim()"
                  style="height: 44px; padding: 0 20px; border: none; border-radius: 10px; font-size: 15px; font-weight: 600; cursor: pointer; white-space: nowrap;"
                  :style="inviteLoading || !inviteInput.trim() ? { background: '#c7c7cc', color: 'white', cursor: 'default' } : { background: '#007aff', color: 'white' }"
                >
                  {{ inviteLoading ? '...' : '兑换' }}
                </button>
              </div>
              <p v-if="inviteMsg" style="font-size: 13px; margin-top: 8px;" :style="inviteMsg.type === 'ok' ? { color: '#16a34a' } : { color: '#dc2626' }">
                {{ inviteMsg.text }}
              </p>
            </template>
          </div>
        </div>

        <!-- Bonus quota card (standalone if no invite_code section) -->
        <div v-if="!auth.user?.invite_code && (auth.user?.bonus_quota ?? 0) > 0" style="background: white; border-radius: 20px; padding: 16px 20px; box-shadow: 0 2px 16px rgba(0,0,0,0.06); display: flex; align-items: center; justify-content: space-between;">
          <span style="font-size: 15px; color: #000;">永久额度</span>
          <span style="font-size: 20px; font-weight: 700; color: #34c759;">+{{ auth.user?.bonus_quota }}</span>
        </div>

        <!-- Quick links card -->
        <div style="background: white; border-radius: 20px; overflow: hidden; box-shadow: 0 2px 16px rgba(0,0,0,0.06);">
          <NuxtLink v-if="auth.isAdmin" to="/admin" style="display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; text-decoration: none; border-bottom: 0.5px solid rgba(60,60,67,0.1);">
            <div style="display: flex; align-items: center; gap: 12px;">
              <div style="width: 32px; height: 32px; border-radius: 8px; background: linear-gradient(135deg, #ff9500, #ffcc02); display: flex; align-items: center; justify-content: center; font-size: 16px;">⚙️</div>
              <span style="font-size: 15px; color: #000;">管理后台</span>
            </div>
            <span style="font-size: 18px; color: #c7c7cc;">›</span>
          </NuxtLink>
          <NuxtLink to="/upgrade" style="display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; text-decoration: none;">
            <div style="display: flex; align-items: center; gap: 12px;">
              <div style="width: 32px; height: 32px; border-radius: 8px; background: linear-gradient(135deg, #7c3aed, #4f46e5); display: flex; align-items: center; justify-content: center; font-size: 16px;">👑</div>
              <span style="font-size: 15px; color: #000;">订阅管理 / 激活</span>
            </div>
            <span style="font-size: 18px; color: #c7c7cc;">›</span>
          </NuxtLink>
          <PwaInstallButton :appName="appName" variant="row" />
        </div>

        <!-- Logout button -->
        <button
          @click="handleLogout"
          style="width: 100%; height: 50px; border-radius: 12px; border: none; background: #fff2f2; color: #ff3b30; font-size: 17px; font-weight: 600; cursor: pointer; box-shadow: 0 1px 4px rgba(0,0,0,0.06);"
        >
          退出登录
        </button>

      </div>
    </template>

    <div style="height: 48px;" />
  </div>
</template>
