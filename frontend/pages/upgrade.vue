<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from '#app'
import { useAuthStore } from '~/stores/auth'
import api from '~/lib/api'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

interface FeatureItem { text: string; tiers: string[] }
interface PricingData {
  features: FeatureItem[]
  guest: { daily_limit: number }
  free: { daily_limit: number }
  basic: { price: string; period: string; daily_limit: number }
  premium: { price: string; period: string; daily_limit: number }
}

const pricing = ref<PricingData | null>(null)
const afdianBasicLink = ref('https://afdian.net')
const afdianPremiumLink = ref('https://afdian.net')
const orderNo = ref('')
const activating = ref(false)
const activateResult = ref<{ tier: string; expires_at?: string } | null>(null)
const activateError = ref('')
const pricingCardIdx = ref(1)

const tierParam = computed(() => (route.query.tier || route.query.plan) as string | undefined)

onMounted(async () => {
  await auth.fetchMe()

  try {
    const res = await api.get('/api/pricing')
    pricing.value = res.data
  } catch {}

  try {
    const res = await api.get('/api/config')
    if (res.data.afdian_basic_link) afdianBasicLink.value = res.data.afdian_basic_link
    if (res.data.afdian_premium_link) afdianPremiumLink.value = res.data.afdian_premium_link
  } catch {}

  // Set initial card index
  if (tierParam.value === 'premium') pricingCardIdx.value = 2
  else if (tierParam.value === 'basic') pricingCardIdx.value = 1
  else pricingCardIdx.value = 1

  // Scroll swipe container to correct card
  setTimeout(() => {
    const el = document.getElementById('pricing-swipe')
    if (!el) return
    const targetIdx = tierParam.value === 'premium' ? 2 : 1
    const child = el.children[targetIdx] as HTMLElement
    if (child) {
      el.scrollTo({ left: child.offsetLeft - (el.clientWidth - child.clientWidth) / 2, behavior: 'instant' as ScrollBehavior })
    }
  }, 80)
})

function handleSwipeScroll(e: Event) {
  const el = e.target as HTMLElement
  const cardW = (el.children[0] as HTMLElement)?.clientWidth ?? el.clientWidth * 0.85
  const idx = Math.round(el.scrollLeft / (cardW + 12))
  pricingCardIdx.value = Math.max(0, Math.min(2, idx))
}

function handleUpgrade(t: string) {
  const link = t === 'basic' ? afdianBasicLink.value : afdianPremiumLink.value
  window.open(link, '_blank', 'noopener,noreferrer')
}

async function handleActivate() {
  if (!orderNo.value.trim()) return
  if (!auth.isLoggedIn) {
    activateError.value = '请先登录账号后再激活订阅'
    return
  }
  activating.value = true
  activateError.value = ''
  activateResult.value = null
  try {
    const res = await api.post('/api/subscription/activate', { order_id: orderNo.value.trim() })
    activateResult.value = res.data
    await auth.fetchMe()
  } catch (e: any) {
    activateError.value = e.response?.data?.detail || '激活失败，请检查订单号'
  } finally {
    activating.value = false
  }
}

const tier = computed(() => auth.user?.tier ?? null)

function featuresFor(t: string) {
  return (pricing.value?.features ?? []).filter(f => f.tiers.includes(t)).map(f => f.text)
}
function missingFor(t: string) {
  return (pricing.value?.features ?? []).filter(f => !f.tiers.includes(t)).map(f => f.text)
}

const basicPrice = computed(() => pricing.value?.basic?.price ?? '19.9')
const basicLimit = computed(() => pricing.value?.basic?.daily_limit ?? 5)
const premiumPrice = computed(() => pricing.value?.premium?.price ?? '49')
const premiumLimit = computed(() => pricing.value?.premium?.daily_limit ?? 15)
const period = computed(() => pricing.value?.basic?.period ?? '月')
const freeLimit = computed(() => pricing.value?.free?.daily_limit ?? 3)
const guestLimit = computed(() => pricing.value?.guest?.daily_limit ?? 1)
</script>

<template>
  <div style="min-height: 100vh; background: #f2f2f7;">
    <!-- Nav Bar -->
    <div style="position: sticky; top: 0; z-index: 100; background: rgba(249,249,249,0.94); backdrop-filter: blur(20px) saturate(180%); -webkit-backdrop-filter: blur(20px) saturate(180%); border-bottom: 0.5px solid rgba(0,0,0,0.12); display: flex; align-items: center; justify-content: space-between; padding: 0 16px; height: 44px;">
      <NuxtLink to="/" style="font-size: 17px; color: #007aff; text-decoration: none; display: flex; align-items: center; gap: 2px;">‹ 返回</NuxtLink>
      <span style="font-size: 17px; font-weight: 600; color: #000;">解锁权益</span>
      <span v-if="tier" style="font-size: 12px; font-weight: 600; padding: 2px 8px; border-radius: 9999px;"
        :style="tier === 'premium' ? { background: '#f3e8ff', color: '#7c3aed' } : tier === 'basic' ? { background: '#dbeafe', color: '#1d4ed8' } : { background: '#f2f2f7', color: '#8e8e93' }">
        {{ tier === 'free' ? '免费版' : tier === 'basic' ? '标准版' : '专业版' }}
      </span>
      <span v-else style="width: 40px; display: inline-block;" />
    </div>

    <!-- Hero -->
    <div style="background: linear-gradient(160deg, #0f0c29 0%, #1a1040 45%, #24243e 100%); padding: 36px 24px 32px; text-align: center; position: relative; overflow: hidden;">
      <div style="position: absolute; top: -40px; left: 50%; transform: translateX(-50%); width: 280px; height: 280px; border-radius: 50%; background: radial-gradient(circle, rgba(124,58,237,0.25) 0%, transparent 70%); pointer-events: none;" />
      <div style="position: absolute; bottom: -20px; right: -20px; width: 160px; height: 160px; border-radius: 50%; background: radial-gradient(circle, rgba(0,122,255,0.18) 0%, transparent 70%); pointer-events: none;" />

      <template v-if="tier === 'premium'">
        <div style="width: 60px; height: 60px; border-radius: 18px; background: linear-gradient(135deg, #7c3aed, #4f46e5); margin: 0 auto 16px; display: flex; align-items: center; justify-content: center; font-size: 30px; box-shadow: 0 8px 32px rgba(124,58,237,0.4);">👑</div>
        <h1 style="font-size: 26px; font-weight: 800; color: #fff; letter-spacing: -0.5px; margin-bottom: 8px;">您已是专业版会员</h1>
        <p style="font-size: 14px; color: rgba(255,255,255,0.5); line-height: 1.6;">享有全部权益 · 每天 {{ premiumLimit }} 次深度研判</p>
      </template>
      <template v-else>
        <div style="display: flex; justify-content: center; gap: 10px; margin-bottom: 20px;">
          <div style="width: 48px; height: 48px; border-radius: 14px; background: rgba(0,122,255,0.25); border: 1px solid rgba(0,122,255,0.4); display: flex; align-items: center; justify-content: center; font-size: 22px;">📊</div>
          <div style="display: flex; align-items: center; color: rgba(255,255,255,0.3); font-size: 18px;">›</div>
          <div style="width: 48px; height: 48px; border-radius: 14px; background: linear-gradient(135deg, rgba(124,58,237,0.6), rgba(79,70,229,0.6)); border: 1px solid rgba(124,58,237,0.5); display: flex; align-items: center; justify-content: center; font-size: 22px; box-shadow: 0 4px 20px rgba(124,58,237,0.3);">👑</div>
        </div>
        <h1 style="font-size: 26px; font-weight: 800; color: #fff; letter-spacing: -0.5px; margin-bottom: 8px;">
          {{ tier === 'basic' ? '升级专业版' : '解锁专业研判' }}
        </h1>
        <p style="font-size: 14px; color: rgba(255,255,255,0.55); line-height: 1.7; max-width: 300px; margin: 0 auto;">
          AI 驱动 · 全市场覆盖<br>每天最多 {{ premiumLimit }} 次深度研判
        </p>
        <div v-if="!auth.isLoggedIn" style="margin-top: 20px; display: inline-flex; align-items: center; gap: 8px; background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.22); padding: 8px 18px; border-radius: 9999px;">
          <span style="font-size: 13px; color: rgba(255,255,255,0.75);">订阅需先登录</span>
          <NuxtLink to="/register" style="font-size: 13px; font-weight: 700; color: #93c5fd; text-decoration: none;">免费注册 →</NuxtLink>
        </div>
      </template>
    </div>

    <!-- Pricing swipe cards -->
    <div style="flex-direction: column; padding-bottom: 4px; margin-top: 20px;">
      <div
        id="pricing-swipe"
        @scroll="handleSwipeScroll"
        style="display: flex; overflow-x: auto; scroll-snap-type: x mandatory; -webkit-overflow-scrolling: touch; scrollbar-width: none; padding: 8px 16px 16px; gap: 12px;"
      >
        <!-- Free card -->
        <div style="flex: 0 0 calc(85vw - 16px); max-width: 320px; scroll-snap-align: center; background: white; border-radius: 20px; padding: 24px 20px 20px; position: relative; box-shadow: 0 2px 12px rgba(0,0,0,0.05);"
          :style="tier === 'free' ? { border: '2px solid #007aff' } : { border: '1px solid rgba(0,0,0,0.08)' }">
          <!-- Current label -->
          <div v-if="tier === 'free'" style="position: absolute; top: -10px; left: 50%; transform: translateX(-50%); background: #007aff; color: white; padding: 3px 12px; border-radius: 9999px; font-size: 11px; font-weight: 700; white-space: nowrap; letter-spacing: 0.2px; z-index: 1;">
            当前版本
          </div>
          <!-- Tier header -->
          <div style="text-align: center; margin-bottom: 20px; padding-top: 8px;">
            <div style="font-size: 32px; margin-bottom: 8px; line-height: 1;">🆓</div>
            <h3 style="font-size: 17px; font-weight: 700; color: #8e8e93; margin-bottom: 6px;">免费版</h3>
            <div style="display: flex; align-items: baseline; justify-content: center; gap: 2px;">
              <span style="font-size: 15px; color: #8e8e93;">¥</span>
              <span style="font-size: 36px; font-weight: 800; color: #000; letter-spacing: -1px;">0</span>
              <span style="font-size: 13px; color: #8e8e93;">/{{ period }}</span>
            </div>
            <p style="font-size: 13px; color: #8e8e93; margin-top: 4px;">每天 <strong style="color: #000; font-weight: 600;">{{ auth.isLoggedIn ? freeLimit : guestLimit }}</strong> 次分析</p>
          </div>
          <!-- Features -->
          <ul style="list-style: none; padding: 0; margin: 0;">
            <li v-for="(item, i) in featuresFor('free')" :key="'cf'+i" style="display: flex; align-items: center; gap: 10px; font-size: 14px; padding: 9px 0; color: #1c1c1e;" :style="i < featuresFor('free').length - 1 ? { borderBottom: '0.5px solid rgba(60,60,67,0.08)' } : {}">
              <span style="width: 20px; height: 20px; border-radius: 50%; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; background: #34c759; color: white;">✓</span>
              {{ item.trim() }}
            </li>
            <li v-for="(item, i) in missingFor('free')" :key="'mf'+i" style="display: flex; align-items: center; gap: 10px; font-size: 14px; padding: 9px 0; color: #aeaeb2;" :style="i < missingFor('free').length - 1 ? { borderBottom: '0.5px solid rgba(60,60,67,0.08)' } : {}">
              <span style="width: 20px; height: 20px; border-radius: 50%; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; border: 1.5px solid #d1d1d6; color: #d1d1d6;">✗</span>
              {{ item.trim() }}
            </li>
          </ul>
          <div style="margin-top: 20px;">
            <template v-if="auth.isLoggedIn">
              <button style="width: 100%; height: 48px; border-radius: 12px; border: 1px solid #e5e5ea; background: #f2f2f7; color: #8e8e93; font-size: 15px; font-weight: 600; cursor: default;" disabled>
                {{ tier === 'free' ? '当前版本' : '已升级' }}
              </button>
            </template>
            <NuxtLink v-else to="/register" style="width: 100%; height: 48px; border-radius: 12px; background: #f2f2f7; color: #007aff; font-size: 15px; font-weight: 600; display: flex; align-items: center; justify-content: center; text-decoration: none;">免费注册</NuxtLink>
          </div>
        </div>

        <!-- Basic card -->
        <div style="flex: 0 0 calc(85vw - 16px); max-width: 320px; scroll-snap-align: center; position: relative; padding-top: 10px;">
          <div style="position: absolute; top: 0; left: 50%; transform: translateX(-50%); background: white; color: #007aff; padding: 2px 12px; border-radius: 9999px; font-size: 11px; font-weight: 700; letter-spacing: 0.2px; box-shadow: 0 2px 8px rgba(0,0,0,0.2); z-index: 2; white-space: nowrap;">
            {{ tier === 'basic' ? '当前版本' : '推荐' }}
          </div>
          <div style="border-radius: 20px; overflow: hidden; border: 2px solid #007aff; box-shadow: 0 6px 28px rgba(0,122,255,0.2); background: white;">
            <div style="background: linear-gradient(135deg, #007aff 0%, #3b9eff 100%); padding: 18px 20px 20px; text-align: center;">
              <div style="font-size: 28px; margin-bottom: 6px; line-height: 1;">📊</div>
              <h3 style="font-size: 16px; font-weight: 700; color: white; margin-bottom: 4px;">标准版</h3>
              <div style="display: flex; align-items: baseline; justify-content: center; gap: 2px;">
                <span style="font-size: 13px; color: rgba(255,255,255,0.7);">¥</span>
                <span style="font-size: 34px; font-weight: 800; color: white; letter-spacing: -1px;">{{ basicPrice }}</span>
                <span style="font-size: 13px; color: rgba(255,255,255,0.7);">/{{ period }}</span>
              </div>
              <p style="font-size: 12px; color: rgba(255,255,255,0.7); margin-top: 4px;">每天 <strong style="color: white; font-weight: 700;">{{ basicLimit }}</strong> 次分析</p>
            </div>
            <div style="padding: 16px 20px 20px;">
              <ul style="list-style: none; padding: 0; margin: 0;">
                <li v-for="(item, i) in featuresFor('basic')" :key="'cb'+i" style="display: flex; align-items: center; gap: 10px; font-size: 14px; padding: 9px 0; color: #1c1c1e;" :style="i < featuresFor('basic').length - 1 ? { borderBottom: '0.5px solid rgba(60,60,67,0.08)' } : {}">
                  <span style="width: 20px; height: 20px; border-radius: 50%; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; background: #34c759; color: white;">✓</span>
                  {{ item.trim() }}
                </li>
                <li v-for="(item, i) in missingFor('basic')" :key="'mb'+i" style="display: flex; align-items: center; gap: 10px; font-size: 14px; padding: 9px 0; color: #aeaeb2;" :style="i < missingFor('basic').length - 1 ? { borderBottom: '0.5px solid rgba(60,60,67,0.08)' } : {}">
                  <span style="width: 20px; height: 20px; border-radius: 50%; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; border: 1.5px solid #d1d1d6; color: #d1d1d6;">✗</span>
                  {{ item.trim() }}
                </li>
              </ul>
              <div style="margin-top: 20px;">
                <template v-if="auth.isLoggedIn">
                  <button
                    style="width: 100%; height: 50px; border-radius: 12px; border: none; font-size: 15px; font-weight: 700; letter-spacing: -0.2px;"
                    :style="tier === 'basic' || tier === 'premium' ? { background: '#f2f2f7', color: '#8e8e93', cursor: 'default' } : { background: '#007aff', color: 'white', cursor: 'pointer' }"
                    :disabled="tier === 'basic' || tier === 'premium'"
                    @click="handleUpgrade('basic')"
                  >
                    {{ tier === 'basic' ? '当前版本' : tier === 'premium' ? '已是更高等级' : '前往爱发电订阅 →' }}
                  </button>
                </template>
                <NuxtLink v-else to="/register" style="width: 100%; height: 50px; border-radius: 12px; background: #007aff; color: white; font-size: 15px; font-weight: 700; display: flex; align-items: center; justify-content: center; text-decoration: none;">注册后订阅</NuxtLink>
              </div>
            </div>
          </div>
        </div>

        <!-- Premium card -->
        <div style="flex: 0 0 calc(85vw - 16px); max-width: 320px; scroll-snap-align: center; position: relative; padding-top: 10px;">
          <div v-if="tier === 'premium'" style="position: absolute; top: 0; left: 50%; transform: translateX(-50%); background: #7c3aed; color: white; padding: 2px 12px; border-radius: 9999px; font-size: 11px; font-weight: 700; letter-spacing: 0.2px; box-shadow: 0 2px 8px rgba(0,0,0,0.25); z-index: 2; white-space: nowrap;">当前版本</div>
          <div v-else style="position: absolute; top: 0; left: 50%; transform: translateX(-50%); background: linear-gradient(90deg, #f59e0b, #fbbf24); color: #000; padding: 2px 12px; border-radius: 9999px; font-size: 11px; font-weight: 800; letter-spacing: 0.2px; box-shadow: 0 2px 8px rgba(0,0,0,0.2); z-index: 2; white-space: nowrap;">✨ 最高权益</div>
          <div style="border-radius: 20px; overflow: hidden; background: white;"
            :style="tier === 'premium' ? { border: '2px solid #7c3aed', boxShadow: '0 6px 28px rgba(124,58,237,0.18)' } : { border: '1.5px solid #c4b5fd', boxShadow: '0 6px 28px rgba(124,58,237,0.18)' }">
            <div style="background: linear-gradient(135deg, #1e0a3c 0%, #3b1d8a 50%, #4f46e5 100%); padding: 18px 20px 20px; text-align: center; position: relative;">
              <div style="position: absolute; top: 8px; left: 16px; font-size: 10px; opacity: 0.5;">✦</div>
              <div style="position: absolute; top: 18px; right: 20px; font-size: 8px; opacity: 0.4;">✦</div>
              <div style="position: absolute; bottom: 10px; left: 30%; font-size: 7px; opacity: 0.35;">✦</div>
              <div style="font-size: 28px; margin-bottom: 6px; line-height: 1;">👑</div>
              <h3 style="font-size: 16px; font-weight: 700; color: white; margin-bottom: 4px;">专业版</h3>
              <div style="display: flex; align-items: baseline; justify-content: center; gap: 2px;">
                <span style="font-size: 13px; color: rgba(255,255,255,0.6);">¥</span>
                <span style="font-size: 34px; font-weight: 800; color: white; letter-spacing: -1px;">{{ premiumPrice }}</span>
                <span style="font-size: 13px; color: rgba(255,255,255,0.6);">/{{ period }}</span>
              </div>
              <p style="font-size: 12px; color: rgba(255,255,255,0.6); margin-top: 4px;">每天 <strong style="color: #c4b5fd; font-weight: 700;">{{ premiumLimit }}</strong> 次分析</p>
            </div>
            <div style="padding: 16px 20px 20px;">
              <ul style="list-style: none; padding: 0; margin: 0;">
                <li v-for="(item, i) in featuresFor('premium')" :key="'cp'+i" style="display: flex; align-items: center; gap: 10px; font-size: 14px; padding: 9px 0; color: #1c1c1e;" :style="i < featuresFor('premium').length - 1 ? { borderBottom: '0.5px solid rgba(60,60,67,0.08)' } : {}">
                  <span style="width: 20px; height: 20px; border-radius: 50%; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; background: #34c759; color: white;">✓</span>
                  {{ item.trim() }}
                </li>
                <li v-for="(item, i) in missingFor('premium')" :key="'mp'+i" style="display: flex; align-items: center; gap: 10px; font-size: 14px; padding: 9px 0; color: #aeaeb2;" :style="i < missingFor('premium').length - 1 ? { borderBottom: '0.5px solid rgba(60,60,67,0.08)' } : {}">
                  <span style="width: 20px; height: 20px; border-radius: 50%; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; border: 1.5px solid #d1d1d6; color: #d1d1d6;">✗</span>
                  {{ item.trim() }}
                </li>
              </ul>
              <div style="margin-top: 20px;">
                <template v-if="auth.isLoggedIn">
                  <button
                    style="width: 100%; height: 50px; border-radius: 12px; border: none; font-size: 15px; font-weight: 700;"
                    :style="tier === 'premium' ? { background: '#f2f2f7', color: '#8e8e93', cursor: 'default' } : { background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', color: 'white', cursor: 'pointer' }"
                    :disabled="tier === 'premium'"
                    @click="handleUpgrade('premium')"
                  >
                    {{ tier === 'premium' ? '当前版本' : '前往爱发电订阅 →' }}
                  </button>
                </template>
                <NuxtLink v-else to="/register" style="width: 100%; height: 50px; border-radius: 12px; background: linear-gradient(135deg, #7c3aed, #4f46e5); color: white; font-size: 15px; font-weight: 700; display: flex; align-items: center; justify-content: center; text-decoration: none;">注册后订阅</NuxtLink>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Pagination dots -->
      <div style="display: flex; justify-content: center; gap: 6px; margin-top: 4px;">
        <div v-for="i in [0, 1, 2]" :key="i" style="width: 6px; height: 6px; border-radius: 50%; transition: all 0.2s;"
          :style="pricingCardIdx === i ? { width: '18px', borderRadius: '3px', background: '#007aff' } : { background: '#c7c7cc' }" />
      </div>
    </div>

    <!-- Payment note -->
    <div style="padding: 12px 16px 0; text-align: center;">
      <p style="font-size: 12px; color: #aeaeb2;">支付宝 · 微信支付 · 订阅后填入订单号即时生效</p>
    </div>

    <!-- How to subscribe -->
    <div style="padding: 28px 16px 0;">
      <p style="font-size: 12px; font-weight: 600; color: #8e8e93; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 8px; padding-left: 4px;">
        如何订阅
      </p>
      <div style="background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 1px 6px rgba(0,0,0,0.04);">
        <div v-for="(step, i) in [
          { num: '1', icon: '🛒', title: '选择套餐', desc: '点击「前往爱发电订阅」按钮' },
          { num: '2', icon: '💳', title: '完成支付', desc: '支持支付宝 · 微信支付' },
          { num: '3', icon: '📋', title: '复制订单号', desc: '在爱发电「我的订单」页面获取' },
          { num: '4', icon: '✅', title: '激活订阅', desc: '在下方输入订单号，即时生效' },
        ]" :key="step.num">
          <div style="display: flex; align-items: center; gap: 14px; padding: 14px 16px;">
            <div style="width: 40px; height: 40px; border-radius: 12px; flex-shrink: 0; background: linear-gradient(135deg, #007aff 0%, #34aadc 100%); display: flex; align-items: center; justify-content: center; font-size: 18px; box-shadow: 0 2px 8px rgba(0,122,255,0.2);">{{ step.icon }}</div>
            <div style="flex: 1; min-width: 0;">
              <div style="font-size: 15px; font-weight: 600; color: #000; margin-bottom: 2px;">{{ step.title }}</div>
              <div style="font-size: 13px; color: #8e8e93;">{{ step.desc }}</div>
            </div>
            <div style="width: 22px; height: 22px; border-radius: 50%; background: #f2f2f7; border: 1.5px solid #e5e5ea; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; color: #8e8e93; flex-shrink: 0;">{{ step.num }}</div>
          </div>
          <div v-if="i < 3" style="height: 0.5px; background: rgba(60,60,67,0.1); margin: 0 0 0 70px;" />
        </div>
      </div>
    </div>

    <!-- Activation Form -->
    <div style="padding: 24px 16px 0;">
      <p style="font-size: 12px; font-weight: 600; color: #8e8e93; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 8px; padding-left: 4px;">
        激活订阅
      </p>

      <!-- Not logged in -->
      <div v-if="!auth.isLoggedIn" style="background: white; border-radius: 16px; padding: 20px; text-align: center; box-shadow: 0 2px 12px rgba(0,0,0,0.08);">
        <div style="font-size: 32px; margin-bottom: 12px;">🔒</div>
        <p style="font-size: 15px; font-weight: 600; color: #000; margin: 0 0 6px;">请先登录账号</p>
        <p style="font-size: 13px; color: #8e8e93; margin: 0 0 16px;">激活订阅需要绑定到您的账号</p>
        <NuxtLink to="/login" style="display: inline-block; padding: 10px 24px; background: #007aff; color: white; border-radius: 10px; font-size: 15px; font-weight: 600; text-decoration: none;">去登录</NuxtLink>
      </div>

      <!-- Logged in -->
      <div v-else style="background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 1px 6px rgba(0,0,0,0.04);">
        <!-- Success state -->
        <div v-if="activateResult" style="padding: 36px 20px; text-align: center;">
          <div style="width: 64px; height: 64px; border-radius: 50%; background: linear-gradient(135deg, #34c759, #30d158); margin: 0 auto 16px; display: flex; align-items: center; justify-content: center; font-size: 28px; box-shadow: 0 4px 20px rgba(52,199,89,0.3);">✓</div>
          <div style="font-size: 18px; font-weight: 700; color: #000; margin-bottom: 6px;">订阅激活成功！</div>
          <div style="font-size: 14px; color: #8e8e93;" :style="activateResult.expires_at ? { marginBottom: '8px' } : { marginBottom: '28px' }">
            当前等级：{{ activateResult.tier === 'premium' ? '👑 专业版' : '📊 标准版' }}
          </div>
          <div v-if="activateResult.expires_at" style="font-size: 13px; color: #8e8e93; margin-bottom: 28px;">
            有效期至：{{ new Date(activateResult.expires_at).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }) }}
          </div>
          <button @click="router.push('/')" style="width: 100%; height: 50px; border-radius: 12px; border: none; background: #007aff; color: white; font-size: 17px; font-weight: 600; cursor: pointer;">返回首页</button>
        </div>

        <!-- Form state -->
        <form v-else @submit.prevent="handleActivate" style="padding: 20px 16px 16px;">
          <!-- Account binding notice -->
          <div style="background: #f0f9ff; border-radius: 10px; padding: 10px 14px; margin-bottom: 16px; font-size: 13px; color: #0369a1; display: flex; gap: 6px; align-items: flex-start;">
            <span style="flex-shrink: 0;">🔗</span>
            <span>订阅将绑定到您的账号 <strong>{{ auth.user?.email }}</strong>，换设备后仍可使用</span>
          </div>

          <div style="margin-bottom: 16px;">
            <label style="font-size: 13px; font-weight: 600; color: #3c3c43; display: block; margin-bottom: 8px;">爱发电订单号</label>
            <input
              v-model="orderNo"
              style="width: 100%; height: 48px; border-radius: 12px; border: 1px solid rgba(60,60,67,0.18); background: #f2f2f7; padding: 0 14px; font-size: 15px; color: #000; box-sizing: border-box; outline: none;"
              placeholder="例：202506231234567890123456789"
              required
            />
            <p style="font-size: 12px; color: #8e8e93; margin-top: 6px; padding-left: 2px;">在爱发电「我的订单」页面可以找到订单号</p>
          </div>

          <div v-if="activateError" style="background: #fff2f2; border-radius: 10px; padding: 10px 14px; margin-bottom: 14px; font-size: 13px; color: #dc2626; display: flex; gap: 6px; align-items: flex-start;">
            <span style="flex-shrink: 0;">⚠️</span>
            <span>{{ activateError }}</span>
          </div>

          <button
            type="submit"
            :disabled="activating"
            style="width: 100%; height: 50px; border-radius: 12px; border: none; color: white; font-size: 17px; font-weight: 600; transition: background 0.15s;"
            :style="activating ? { background: '#c7c7cc', cursor: 'default' } : { background: '#007aff', cursor: 'pointer' }"
          >
            {{ activating ? '验证中...' : '验证并激活' }}
          </button>
        </form>
      </div>
    </div>

    <!-- Not logged in CTA -->
    <div v-if="!auth.isLoggedIn" style="padding: 20px 16px 0; display: flex; flex-direction: column; gap: 10px;">
      <NuxtLink to="/register" style="display: block; width: 100%; height: 50px; border-radius: 12px; background: #007aff; color: white; font-size: 17px; font-weight: 600; text-decoration: none; text-align: center; line-height: 50px; box-sizing: border-box;">免费注册，开始使用</NuxtLink>
      <p style="text-align: center; font-size: 14px; color: #8e8e93; margin: 0;">
        已有账号？ <NuxtLink to="/login" style="color: #007aff; font-weight: 600; text-decoration: none;">登录</NuxtLink>
      </p>
    </div>

    <div style="height: 48px;" />
  </div>
</template>
