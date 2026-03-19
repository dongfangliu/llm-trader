<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import api from '~/lib/api'
import { useRoute } from '#app'
import { useAuthStore } from '~/stores/auth'

const route = useRoute()
const auth = useAuthStore()

const plans = ref<any[]>([])
const period = ref('月')
const selectedPlan = ref<any>(null)
const loading = ref(true)

onMounted(async () => {
  try {
    const res = await api.get('/api/pricing')
    plans.value = res.data.plans || []
    period.value = res.data.period || '月'

    // Pre-select plan based on URL params
    const planParam = route.query.plan || route.query.tier
    if (planParam) {
      selectedPlan.value = plans.value.find(p => p.id === planParam || p.tier === planParam) || null
    }

    // Default to premium recommendation
    if (!selectedPlan.value) {
      selectedPlan.value = plans.value.find(p => p.is_recommended) || plans.value[0] || null
    }
  } catch (e) {
    console.error('Failed to load pricing:', e)
  } finally {
    loading.value = false
  }
})

const needsLogin = computed(() => !auth.isLoggedIn)
</script>

<template>
  <div class="fixed inset-0 bg-ios-bg flex flex-col overflow-y-auto">
    <!-- Header -->
    <div class="flex items-center px-4 pt-12 pb-4 flex-shrink-0">
      <NuxtLink to="/" class="text-ios-blue text-base">← 返回</NuxtLink>
      <h1 class="flex-1 text-center text-lg font-semibold text-ios-label mr-8">升级套餐</h1>
    </div>

    <div class="px-4 pb-safe max-w-lg mx-auto w-full">
      <!-- Loading -->
      <div v-if="loading" class="flex justify-center py-12">
        <div class="w-8 h-8 border-2 border-ios-blue border-t-transparent rounded-full animate-spin" />
      </div>

      <template v-else>
        <!-- Pricing cards -->
        <div class="space-y-3 mb-6">
          <PricingCard
            v-for="plan in plans"
            :key="plan.id"
            :plan="plan"
            :selected="selectedPlan?.id === plan.id"
            @select="selectedPlan = plan"
          />
        </div>

        <!-- Afdian link for selected plan -->
        <div v-if="selectedPlan" class="mb-6">
          <IosCard>
            <div class="text-center space-y-3">
              <p class="text-sm text-ios-secondary">通过爱发电支付</p>
              <a
                v-if="selectedPlan.afdian_link"
                :href="selectedPlan.afdian_link"
                target="_blank"
                rel="noopener"
                class="block"
              >
                <IosButton variant="primary" size="lg" :fullWidth="true">
                  去爱发电支付 ¥{{ selectedPlan.price }}
                </IosButton>
              </a>
              <p class="text-xs text-ios-secondary">支付完成后，复制订单号在下方激活</p>
            </div>
          </IosCard>
        </div>

        <!-- Login required notice -->
        <div v-if="needsLogin" class="mb-4">
          <IosCard>
            <div class="text-center space-y-3">
              <p class="text-sm font-semibold text-ios-label">激活需要登录</p>
              <p class="text-sm text-ios-secondary">请先登录再激活订阅，确保套餐绑定到您的账户</p>
              <NuxtLink to="/login">
                <IosButton variant="primary" size="md" :fullWidth="true">
                  登录账户
                </IosButton>
              </NuxtLink>
            </div>
          </IosCard>
        </div>

        <!-- Activation form -->
        <div v-else>
          <IosCard>
            <h3 class="text-base font-semibold text-ios-label mb-4">激活订阅</h3>
            <ActivationForm />
          </IosCard>
        </div>
      </template>
    </div>
  </div>
</template>
