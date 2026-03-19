<script setup lang="ts">
import { ref } from 'vue'
import api from '~/lib/api'
import { useDevice } from '~/composables/useDevice'
import { useAuthStore } from '~/stores/auth'

const { getDeviceId } = useDevice()
const auth = useAuthStore()

const orderId = ref('')
const loading = ref(false)
const error = ref('')
const success = ref<{ tier: string; message: string } | null>(null)

async function activate() {
  if (!orderId.value.trim()) {
    error.value = '请输入订单号'
    return
  }

  loading.value = true
  error.value = ''
  success.value = null

  try {
    const body: any = { order_id: orderId.value.trim() }
    if (!auth.isLoggedIn) {
      body.device_id = getDeviceId()
    }

    const res = await api.post('/api/subscription/activate', body)
    success.value = { tier: res.data.tier, message: res.data.message }

    // Refresh user info if logged in
    if (auth.isLoggedIn) {
      await auth.fetchMe()
    }
  } catch (e: any) {
    const msg = e.response?.data?.detail || '激活失败'
    if (e.response?.status === 401) {
      error.value = '请先登录再激活订阅'
    } else if (e.response?.status === 409) {
      error.value = '该订单已被使用'
    } else {
      error.value = typeof msg === 'string' ? msg : '激活失败，请检查订单号'
    }
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="space-y-4">
    <div>
      <IosInput
        v-model="orderId"
        label="爱发电订单号"
        placeholder="粘贴您的订单号"
        :error="error"
      />
    </div>

    <div v-if="success" class="bg-ios-green/10 text-ios-green text-sm px-4 py-3 rounded-ios">
      <p class="font-semibold">✅ 激活成功！</p>
      <p class="mt-0.5">{{ success.message }}</p>
      <p class="mt-0.5 font-medium">已升级为 {{ success.tier === 'premium' ? '专业版' : '标准版' }}</p>
    </div>

    <IosButton
      variant="primary"
      size="lg"
      :fullWidth="true"
      :loading="loading"
      :disabled="loading || !!success"
      @click="activate"
    >
      {{ success ? '已激活' : '激活订阅' }}
    </IosButton>

    <p class="text-center text-xs text-ios-secondary">
      订单号在爱发电支付完成后的邮件中可以找到
    </p>
  </div>
</template>
