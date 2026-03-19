import { ref, computed } from 'vue'
import api from '~/lib/api'
import { useDevice } from '~/composables/useDevice'

export function useQuota() {
  const { getDeviceId } = useDevice()

  const remaining = ref(0)
  const dailyLimit = ref(1)
  const totalAvailable = ref(0)
  const tier = ref('free')
  const trialState = ref('available')  // 'available', 'expired', 'not_eligible'
  const trialUsed = ref(false)
  const resetAt = ref('')
  const loading = ref(false)

  async function fetchQuota() {
    loading.value = true
    try {
      const deviceId = getDeviceId()
      const res = await api.get('/api/analyze/limits', {
        params: { device_id: deviceId }
      })
      const data = res.data
      remaining.value = data.remaining ?? 0
      dailyLimit.value = data.daily_limit ?? 1
      totalAvailable.value = data.total_available ?? 0
      tier.value = data.tier ?? 'free'
      trialState.value = data.trial_state ?? 'available'
      trialUsed.value = data.trial_used ?? false
      resetAt.value = data.reset_at ?? ''
    } catch (e) {
      console.error('Failed to fetch quota:', e)
    } finally {
      loading.value = false
    }
  }

  const hasQuota = computed(() => totalAvailable.value > 0 || trialState.value === 'available')

  return {
    remaining, dailyLimit, totalAvailable, tier, trialState, trialUsed, resetAt,
    loading, hasQuota, fetchQuota
  }
}
