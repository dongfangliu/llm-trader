<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from '#app'
import { useAuthStore } from '~/stores/auth'
import api from '~/lib/api'
import { DEFAULT_APP_NAME } from '~/constants/app'
import { SITE_NAME } from '~/constants/seo'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

interface FeatureItem { text: string; tiers: string[] }
interface PricingData {
  features: FeatureItem[]
  free_features: string[]
  basic_features: string[]
  premium_features: string[]
  guest: { daily_limit: number }
  free: { daily_limit: number }
  basic: { price: string; period: string; daily_limit: number }
  premium: { price: string; period: string; daily_limit: number }
}

const pricing = ref<PricingData | null>(null)
const appName = ref(DEFAULT_APP_NAME)
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
    if (res.data.app_name) appName.value = res.data.app_name
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
const tierLabel = computed(() =>
  tier.value === 'free' ? '免费版' : tier.value === 'basic' ? '标准版' : tier.value === 'premium' ? '专业版' : '',
)
const tierBadgeVariant = computed<'orange' | 'blue' | 'gray'>(() =>
  tier.value === 'premium' ? 'orange' : tier.value === 'basic' ? 'blue' : 'gray',
)

function featuresFor(t: string): string[] {
  if (!pricing.value) return []
  const key = `${t}_features` as 'free_features' | 'basic_features' | 'premium_features'
  if (pricing.value[key]?.length) return pricing.value[key]
  return pricing.value.features.filter(f => f.tiers.includes(t)).map(f => f.text)
}

const basicPrice = computed(() => pricing.value?.basic?.price ?? '19.9')
const basicLimit = computed(() => pricing.value?.basic?.daily_limit ?? 5)
const premiumPrice = computed(() => pricing.value?.premium?.price ?? '49')
const premiumLimit = computed(() => pricing.value?.premium?.daily_limit ?? 15)
const period = computed(() => pricing.value?.basic?.period ?? '月')
const freeLimit = computed(() => pricing.value?.free?.daily_limit ?? 3)
const guestLimit = computed(() => pricing.value?.guest?.daily_limit ?? 1)

const SUBSCRIBE_STEPS = [
  { num: '1', key: 'cart', title: '选择套餐', desc: '点击「前往爱发电订阅」按钮' },
  { num: '2', key: 'pay', title: '完成支付', desc: '支持支付宝 · 微信支付' },
  { num: '3', key: 'copy', title: '复制订单号', desc: '在爱发电「我的订单」页面获取' },
  { num: '4', key: 'check', title: '激活订阅', desc: '在下方输入订单号，即时生效' },
]

const PREMIUM_COPY = [
  '每天更多AI分析次数，适合连续跟踪多个标的',
  '深度研判覆盖趋势、动能、波动、支撑压力和风险计划',
  '持仓智能分析可结合持仓数量、成本价和最大仓位生成参考',
  '高级周期和多结果保存帮助复盘同一标的的历史判断',
]

const requestUrl = useRequestURL()
const seoTitle = 'K线AI分析助手专业版 - 深度分析与高级功能'
const seoDescription = '了解K线AI分析助手标准版和专业版权益，包含更多每日分析次数、深度研判、持仓智能分析、高级周期、多结果保存和后台分析能力。'
usePublicSeo({ title: seoTitle, description: seoDescription, path: '/upgrade' })
useJsonLd('upgrade-offer-jsonld', () => [
  {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: `${SITE_NAME}订阅`,
    description: seoDescription,
    brand: { '@type': 'Organization', name: SITE_NAME },
    offers: [
      {
        '@type': 'Offer',
        name: '标准版',
        price: basicPrice.value,
        priceCurrency: 'CNY',
        availability: 'https://schema.org/InStock',
        url: `${requestUrl.origin}/upgrade?tier=basic`,
      },
      {
        '@type': 'Offer',
        name: '专业版',
        price: premiumPrice.value,
        priceCurrency: 'CNY',
        availability: 'https://schema.org/InStock',
        url: `${requestUrl.origin}/upgrade?tier=premium`,
      },
    ],
  },
  {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: '专业版适合哪些用户？',
        acceptedAnswer: { '@type': 'Answer', text: '适合需要更高每日分析次数、持仓智能分析、高级周期、多结果保存和后台分析能力的用户。' },
      },
      {
        '@type': 'Question',
        name: '订阅后如何生效？',
        acceptedAnswer: { '@type': 'Answer', text: '完成订阅后，在页面中填写订单号并绑定账号，验证通过后即时生效。' },
      },
      {
        '@type': 'Question',
        name: 'AI分析结果是否构成投资建议？',
        acceptedAnswer: { '@type': 'Answer', text: '不构成投资建议。页面输出只用于研究参考，用户需要结合自身风险承受能力独立判断。' },
      },
    ],
  },
])
</script>

<template>
  <div class="min-h-[100dvh] bg-ios-bg">
    <IosNavBar :title="appName" back="/">
      <template #action>
        <IosBadge v-if="tier" :variant="tierBadgeVariant">{{ tierLabel }}</IosBadge>
      </template>
    </IosNavBar>

    <div class="max-w-[600px] mx-auto">

      <!-- Hero -->
      <div class="upgrade-hero px-6 pt-9 pb-8 text-center">
        <template v-if="tier === 'premium'">
          <div class="w-14 h-14 rounded-ios bg-white/10 ring-1 ring-white/15 mx-auto mb-4 flex items-center justify-center text-white">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 7l4 4 5-7 5 7 4-4-2 13H5L3 7z" />
            </svg>
          </div>
          <h1 class="text-[26px] font-extrabold text-white tracking-ios-tight">您已是专业版会员</h1>
          <p class="mt-2 text-sm text-white/55">享有全部权益 · 每天 {{ premiumLimit }} 次深度研判</p>
        </template>
        <template v-else>
          <div class="flex items-center justify-center gap-2.5 mb-5">
            <div class="w-12 h-12 rounded-ios bg-white/8 ring-1 ring-white/12 flex items-center justify-center text-white/70">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M4 19V5M4 19h16" /><path d="M8 15l3.5-4 3 2.5L20 7" />
              </svg>
            </div>
            <svg class="text-white/25" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6" /></svg>
            <div class="w-12 h-12 rounded-ios bg-ios-blue/25 ring-1 ring-ios-blue/40 flex items-center justify-center text-white">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 7l4 4 5-7 5 7 4-4-2 13H5L3 7z" />
              </svg>
            </div>
          </div>
          <h1 class="text-[26px] font-extrabold text-white tracking-ios-tight">
            {{ tier === 'basic' ? '升级专业版' : '解锁专业研判' }}
          </h1>
          <p class="mt-2 text-sm text-white/55 leading-relaxed max-w-[300px] mx-auto">
            AI 驱动 · 全市场覆盖<br />每天最多 {{ premiumLimit }} 次深度研判
          </p>
          <div
            v-if="!auth.isLoggedIn"
            class="mt-5 inline-flex items-center gap-2 bg-white/10 ring-1 ring-white/15 px-4 py-2 rounded-full"
          >
            <span class="text-[13px] text-white/70">订阅需先登录</span>
            <NuxtLink to="/register" class="text-[13px] font-bold text-ios-blue">免费注册</NuxtLink>
          </div>
        </template>
      </div>

      <!-- Pricing swipe cards -->
      <div class="mt-5">
        <div
          id="pricing-swipe"
          class="pricing-track flex overflow-x-auto px-4 pt-2 pb-4 gap-3"
          @scroll="handleSwipeScroll"
        >
          <!-- Free card -->
          <div
            class="pricing-card bg-ios-card rounded-ios-lg px-5 pt-6 pb-5 relative shadow-ios"
            :class="tier === 'free' ? 'ring-2 ring-ios-blue' : 'border border-ios-separator'"
          >
            <div
              v-if="tier === 'free'"
              class="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-ios-blue text-white px-3 py-0.5 rounded-full text-[11px] font-bold whitespace-nowrap"
            >当前版本</div>
            <div class="text-center mb-5 pt-1">
              <h3 class="text-base font-bold text-ios-secondary mb-1.5">免费版</h3>
              <div class="flex items-baseline justify-center gap-0.5">
                <span class="text-[15px] text-ios-secondary">¥</span>
                <span class="text-[36px] font-extrabold text-ios-label tracking-ios-tight leading-none">0</span>
                <span class="text-[13px] text-ios-secondary">/{{ period }}</span>
              </div>
              <p class="text-[13px] text-ios-secondary mt-1.5">
                每天 <strong class="text-ios-label font-semibold">{{ auth.isLoggedIn ? freeLimit : guestLimit }}</strong> 次分析
              </p>
            </div>
            <ul class="divide-y divide-ios-separator">
              <li v-for="(item, i) in featuresFor('free')" :key="'cf'+i" class="flex items-center gap-2.5 text-sm py-2.5 text-ios-label">
                <span class="w-5 h-5 rounded-full bg-ios-green text-white flex items-center justify-center flex-shrink-0">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7" /></svg>
                </span>
                {{ item.trim() }}
              </li>
            </ul>
            <div class="mt-5">
              <IosButton v-if="auth.isLoggedIn" variant="secondary" :full-width="true" size="md" disabled>
                {{ tier === 'free' ? '当前版本' : '已升级' }}
              </IosButton>
              <NuxtLink v-else to="/register">
                <IosButton variant="secondary" :full-width="true" size="md">免费注册</IosButton>
              </NuxtLink>
            </div>
          </div>

          <!-- Basic card -->
          <div class="pricing-card relative pt-2.5">
            <div class="absolute top-0 left-1/2 -translate-x-1/2 bg-ios-card text-ios-blue px-3 py-0.5 rounded-full text-[11px] font-bold shadow-ios-sm z-10 whitespace-nowrap">
              {{ tier === 'basic' ? '当前版本' : '推荐' }}
            </div>
            <div class="rounded-ios-lg overflow-hidden ring-2 ring-ios-blue shadow-ios-lg bg-ios-card">
              <div class="bg-ios-blue px-5 pt-[18px] pb-5 text-center">
                <div class="flex justify-center mb-1.5 text-white">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M4 19V5M4 19h16" /><path d="M8 15l3.5-4 3 2.5L20 7" />
                  </svg>
                </div>
                <h3 class="text-base font-bold text-white mb-1">标准版</h3>
                <div class="flex items-baseline justify-center gap-0.5">
                  <span class="text-[13px] text-white/70">¥</span>
                  <span class="text-[34px] font-extrabold text-white tracking-ios-tight leading-none">{{ basicPrice }}</span>
                  <span class="text-[13px] text-white/70">/{{ period }}</span>
                </div>
                <p class="text-xs text-white/70 mt-1">每天 <strong class="text-white font-bold">{{ basicLimit }}</strong> 次分析</p>
              </div>
              <div class="px-5 pt-4 pb-5">
                <ul class="divide-y divide-ios-separator">
                  <li v-for="(item, i) in featuresFor('basic')" :key="'cb'+i" class="flex items-center gap-2.5 text-sm py-2.5 text-ios-label">
                    <span class="w-5 h-5 rounded-full bg-ios-green text-white flex items-center justify-center flex-shrink-0">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7" /></svg>
                    </span>
                    {{ item.trim() }}
                  </li>
                </ul>
                <div class="mt-5">
                  <IosButton
                    v-if="auth.isLoggedIn"
                    :variant="tier === 'basic' || tier === 'premium' ? 'secondary' : 'primary'"
                    :disabled="tier === 'basic' || tier === 'premium'"
                    :full-width="true"
                    size="md"
                    @click="handleUpgrade('basic')"
                  >
                    {{ tier === 'basic' ? '当前版本' : tier === 'premium' ? '已是更高等级' : '前往爱发电订阅' }}
                  </IosButton>
                  <NuxtLink v-else to="/register">
                    <IosButton :full-width="true" size="md">注册后订阅</IosButton>
                  </NuxtLink>
                </div>
              </div>
            </div>
          </div>

          <!-- Premium card -->
          <div class="pricing-card relative pt-2.5">
            <div
              v-if="tier === 'premium'"
              class="absolute top-0 left-1/2 -translate-x-1/2 bg-ios-blue text-white px-3 py-0.5 rounded-full text-[11px] font-bold shadow-ios-sm z-10 whitespace-nowrap"
            >当前版本</div>
            <div
              v-else
              class="absolute top-0 left-1/2 -translate-x-1/2 bg-ios-label text-white px-3 py-0.5 rounded-full text-[11px] font-bold shadow-ios-sm z-10 whitespace-nowrap"
            >最高权益</div>
            <div
              class="rounded-ios-lg overflow-hidden bg-ios-card shadow-ios-lg"
              :class="tier === 'premium' ? 'ring-2 ring-ios-blue' : 'border border-ios-separator'"
            >
              <div class="upgrade-premium-head px-5 pt-[18px] pb-5 text-center">
                <div class="flex justify-center mb-1.5 text-white">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M3 7l4 4 5-7 5 7 4-4-2 13H5L3 7z" />
                  </svg>
                </div>
                <h3 class="text-base font-bold text-white mb-1">专业版</h3>
                <div class="flex items-baseline justify-center gap-0.5">
                  <span class="text-[13px] text-white/55">¥</span>
                  <span class="text-[34px] font-extrabold text-white tracking-ios-tight leading-none">{{ premiumPrice }}</span>
                  <span class="text-[13px] text-white/55">/{{ period }}</span>
                </div>
                <p class="text-xs text-white/55 mt-1">每天 <strong class="text-ios-blue font-bold">{{ premiumLimit }}</strong> 次分析</p>
              </div>
              <div class="px-5 pt-4 pb-5">
                <ul class="divide-y divide-ios-separator">
                  <li v-for="(item, i) in featuresFor('premium')" :key="'cp'+i" class="flex items-center gap-2.5 text-sm py-2.5 text-ios-label">
                    <span class="w-5 h-5 rounded-full bg-ios-green text-white flex items-center justify-center flex-shrink-0">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7" /></svg>
                    </span>
                    {{ item.trim() }}
                  </li>
                </ul>
                <div class="mt-5">
                  <IosButton
                    v-if="auth.isLoggedIn"
                    :variant="tier === 'premium' ? 'secondary' : 'primary'"
                    :disabled="tier === 'premium'"
                    :full-width="true"
                    size="md"
                    @click="handleUpgrade('premium')"
                  >
                    {{ tier === 'premium' ? '当前版本' : '前往爱发电订阅' }}
                  </IosButton>
                  <NuxtLink v-else to="/register">
                    <IosButton :full-width="true" size="md">注册后订阅</IosButton>
                  </NuxtLink>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Pagination dots -->
        <div class="flex justify-center gap-1.5 mt-1">
          <div
            v-for="i in [0, 1, 2]"
            :key="i"
            class="h-1.5 rounded-full transition-all duration-200"
            :class="pricingCardIdx === i ? 'w-[18px] bg-ios-blue' : 'w-1.5 bg-ios-tertiary'"
          />
        </div>
      </div>

      <!-- Payment note -->
      <p class="text-center text-xs text-ios-tertiary pt-3 px-4">
        支付宝 · 微信支付 · 订阅后填入订单号即时生效
      </p>

      <!-- Premium benefits copy -->
      <section class="px-4 pt-6">
        <IosCard elevation="raised" padding="lg">
          <h2 class="text-xl font-extrabold text-ios-label tracking-ios-tight">专业版权益</h2>
          <p class="text-sm text-ios-label2 leading-relaxed mt-2.5 mb-3.5">
            专业版面向需要高频研究和更完整交易计划的用户，适合在免费额度耗尽、需要深度分析、持仓智能分析、高级周期、多结果保存或后台分析能力时升级。
          </p>
          <div class="flex flex-col gap-2.5">
            <div v-for="item in PREMIUM_COPY" :key="item" class="flex gap-2.5 items-start text-sm text-ios-label leading-relaxed">
              <span class="w-5 h-5 rounded-full bg-ios-green text-white flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7" /></svg>
              </span>
              <span>{{ item }}</span>
            </div>
          </div>
        </IosCard>
      </section>

      <!-- How to subscribe -->
      <div class="px-4 pt-7">
        <IosCard section-label="如何订阅" elevation="raised" padding="none">
          <div class="divide-y divide-ios-separator">
            <div v-for="step in SUBSCRIBE_STEPS" :key="step.num" class="flex items-center gap-3.5 px-4 py-3.5">
              <div class="w-10 h-10 rounded-ios-sm bg-ios-blue/10 text-ios-blue flex items-center justify-center flex-shrink-0">
                <svg v-if="step.key === 'cart'" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.6 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6" />
                </svg>
                <svg v-else-if="step.key === 'pay'" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="2" y="5" width="20" height="14" rx="2.5" /><path d="M2 10h20" />
                </svg>
                <svg v-else-if="step.key === 'copy'" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
                <svg v-else width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="9" /><path d="M8 12l3 3 5-6" />
                </svg>
              </div>
              <div class="flex-1 min-w-0">
                <div class="text-[15px] font-semibold text-ios-label">{{ step.title }}</div>
                <div class="text-[13px] text-ios-secondary mt-0.5">{{ step.desc }}</div>
              </div>
              <div class="w-[22px] h-[22px] rounded-full bg-ios-bg border border-ios-separator flex items-center justify-center text-[11px] font-bold text-ios-secondary flex-shrink-0">
                {{ step.num }}
              </div>
            </div>
          </div>
        </IosCard>
      </div>

      <!-- FAQ -->
      <section class="px-4 pt-6">
        <IosCard elevation="raised" padding="lg">
          <h2 class="text-xl font-extrabold text-ios-label tracking-ios-tight mb-3.5">常见问题</h2>
          <div class="flex flex-col gap-4">
            <div>
              <h3 class="text-[15px] font-bold text-ios-label mb-1.5">专业版和标准版有什么区别？</h3>
              <p class="text-sm text-ios-label2 leading-relaxed">专业版拥有更高的每日分析次数，并开放深度研判、持仓智能分析、高级周期、多结果保存和后台分析等高级能力。</p>
            </div>
            <div>
              <h3 class="text-[15px] font-bold text-ios-label mb-1.5">订阅后如何激活？</h3>
              <p class="text-sm text-ios-label2 leading-relaxed">在爱发电完成支付后复制订单号，回到本页登录账号并填写订单号，验证通过后订阅即时生效。</p>
            </div>
            <div>
              <h3 class="text-[15px] font-bold text-ios-label mb-1.5">AI分析结果是否构成投资建议？</h3>
              <p class="text-sm text-ios-label2 leading-relaxed">不构成投资建议。页面输出只用于研究参考，用户需要结合自身风险承受能力独立判断。</p>
            </div>
          </div>
        </IosCard>
      </section>

      <!-- Activation -->
      <div class="px-4 pt-6">
        <p class="text-xs font-semibold uppercase tracking-wide text-ios-secondary mb-2 px-1">激活订阅</p>

        <!-- Not logged in -->
        <IosCard v-if="!auth.isLoggedIn" elevation="raised" padding="lg">
          <IosEmptyState title="请先登录账号" description="激活订阅需要绑定到您的账号" size="sm">
            <template #icon>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
                <rect x="4" y="11" width="16" height="10" rx="2.5" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
              </svg>
            </template>
            <template #action>
              <NuxtLink to="/login"><IosButton size="md">去登录</IosButton></NuxtLink>
            </template>
          </IosEmptyState>
        </IosCard>

        <!-- Logged in -->
        <IosCard v-else elevation="raised" :padding="activateResult ? 'lg' : 'lg'">
          <!-- Success -->
          <div v-if="activateResult" class="text-center py-4">
            <div class="w-16 h-16 rounded-full bg-ios-green mx-auto mb-4 flex items-center justify-center text-white">
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7" /></svg>
            </div>
            <div class="text-lg font-bold text-ios-label mb-1.5">订阅激活成功！</div>
            <div class="text-sm text-ios-secondary">
              当前等级：{{ activateResult.tier === 'premium' ? '专业版' : '标准版' }}
            </div>
            <div v-if="activateResult.expires_at" class="text-[13px] text-ios-secondary mt-1">
              有效期至：{{ new Date(activateResult.expires_at).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }) }}
            </div>
            <div class="mt-6">
              <IosButton size="lg" :full-width="true" @click="router.push('/')">返回首页</IosButton>
            </div>
          </div>

          <!-- Form -->
          <form v-else class="flex flex-col gap-4" @submit.prevent="handleActivate">
            <div class="flex gap-2 items-start rounded-ios bg-ios-blue/8 px-3.5 py-2.5 text-[13px] text-ios-blue">
              <svg class="flex-shrink-0 mt-0.5" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.5 1.5" />
                <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.5-1.5" />
              </svg>
              <span>订阅将绑定到您的账号 <strong>{{ auth.user?.email }}</strong>，换设备后仍可使用</span>
            </div>

            <IosInput
              v-model="orderNo"
              label="爱发电订单号"
              placeholder="例：202506231234567890123456789"
              hint="在爱发电「我的订单」页面可以找到订单号"
            />

            <div v-if="activateError" class="flex gap-2 items-center rounded-ios bg-ios-red/8 px-4 py-3 text-sm text-ios-red">
              <svg class="flex-shrink-0" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" />
              </svg>
              {{ activateError }}
            </div>

            <IosButton type="submit" size="lg" :loading="activating" :full-width="true">
              {{ activating ? '验证中...' : '验证并激活' }}
            </IosButton>
          </form>
        </IosCard>
      </div>

      <!-- Not logged in CTA -->
      <div v-if="!auth.isLoggedIn" class="px-4 pt-5 flex flex-col gap-2.5">
        <NuxtLink to="/register">
          <IosButton size="lg" :full-width="true">免费注册，开始使用</IosButton>
        </NuxtLink>
        <p class="text-center text-sm text-ios-secondary">
          已有账号？ <NuxtLink to="/login" class="text-ios-blue font-semibold">登录</NuxtLink>
        </p>
      </div>

      <div class="h-12" />
    </div>
  </div>
</template>

<style scoped>
.pricing-track {
  scroll-snap-type: x mandatory;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
}
.pricing-track::-webkit-scrollbar {
  display: none;
}
.pricing-card {
  flex: 0 0 calc(85vw - 16px);
  max-width: 320px;
  scroll-snap-align: center;
}
/* Page-unique dark hero — neutral charcoal, single blue accent (no purple/neon) */
.upgrade-hero {
  background: linear-gradient(165deg, #1c1c1e 0%, #2a2a32 60%, #20202a 100%);
}
/* Premium card header — neutral dark to read as "pro" without a second accent hue */
.upgrade-premium-head {
  background: linear-gradient(150deg, #2a2a32 0%, #1c1c1e 100%);
}
</style>
