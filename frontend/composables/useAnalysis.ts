import { ref, onUnmounted } from 'vue'
import api from '~/lib/api'
import { useDevice } from '~/composables/useDevice'
import { useAuthStore } from '~/stores/auth'
import { fetchOhlcv } from '~/composables/useMarketDataFetcher'

export type AnalysisStatus = 'idle' | 'pending' | 'running' | 'completed' | 'failed'

export interface AnalysisResult {
  task_id: string
  status: string
  result?: any
  error?: string
}

const DEFAULT_ANALYZE_TIMEOUT_MS = 300000

async function getAnalyzeTimeoutMs(): Promise<number> {
  return api.get('/api/config')
    .then((res) => {
      const seconds = Number(res.data?.analyze_timeout_seconds)
      if (!Number.isFinite(seconds) || seconds <= 0) return DEFAULT_ANALYZE_TIMEOUT_MS
      return seconds * 1000
    })
    .catch(() => DEFAULT_ANALYZE_TIMEOUT_MS)
}

export function useAnalysis() {
  const { getDeviceId } = useDevice()
  const auth = useAuthStore()

  const isAnalyzing = ref(false)
  const taskId = ref<string | null>(null)
  const result = ref<any>(null)
  const historyId = ref<number | null>(null)  // DB id of the saved history record
  const error = ref<string | null>(null)
  const errorCode = ref<string | null>(null)  // 'trial_expired', 'quota_exceeded', etc.
  const progress = ref(0)
  const statusMessage = ref('')
  const isFirstTrial = ref(false)  // was this a trial analysis?

  let abortController: AbortController | null = null
  let pollTimer: ReturnType<typeof setTimeout> | null = null

  function clearState() {
    isAnalyzing.value = false
    taskId.value = null
    result.value = null
    historyId.value = null
    error.value = null
    errorCode.value = null
    progress.value = 0
    statusMessage.value = ''
    isFirstTrial.value = false
  }

  function cancelAnalysis() {
    if (abortController) {
      abortController.abort()
      abortController = null
    }
    if (pollTimer) {
      clearTimeout(pollTimer)
      pollTimer = null
    }
    isAnalyzing.value = false
  }

  async function pollForResult(tId: string): Promise<any> {
    return new Promise((resolve, reject) => {
      let attempts = 0
      const maxAttempts = 60

      async function poll() {
        if (attempts >= maxAttempts) {
          reject(new Error('分析超时，请稍后查看结果'))
          return
        }

        try {
          const res = await api.get(`/api/task/${tId}`)
          const data = res.data

          if (data.status === 'done') {
            if (data.history_id) historyId.value = data.history_id
            resolve(data.result)
          } else if (data.status === 'failed') {
            reject(new Error(data.error || '分析失败'))
          } else {
            // Still pending/running
            progress.value = Math.min(90, attempts * 2)
            statusMessage.value = '正在分析中...'
            attempts++
            pollTimer = setTimeout(poll, 3000)
          }
        } catch (e) {
          reject(e)
        }
      }

      poll()
    })
  }

  async function trySSE(tId: string): Promise<any> {
    const timeoutMs = await getAnalyzeTimeoutMs()

    return new Promise((resolve, reject) => {
      // SSE uses relative path — Nuxt proxy forwards to backend
      let url = `/api/task/${tId}/stream`
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
      if (token) {
        url += `?token=${encodeURIComponent(token)}`
      }

      const eventSource = new EventSource(url)
      const timeout = setTimeout(() => {
        eventSource.close()
        reject(new Error('SSE timeout'))
      }, timeoutMs)

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)

          if (data.status === 'done') {
            clearTimeout(timeout)
            eventSource.close()
            if (data.history_id) historyId.value = data.history_id
            resolve(data.result)
          } else if (data.status === 'failed') {
            clearTimeout(timeout)
            eventSource.close()
            reject(new Error(data.error || '分析失败'))
          } else if (data.status === 'timeout') {
            clearTimeout(timeout)
            eventSource.close()
            reject(new Error('分析超时'))
          } else {
            // Progress update
            progress.value = Math.min(85, progress.value + 5)
            statusMessage.value = data.message || '正在分析中...'
          }
        } catch {
          // ignore parse errors
        }
      }

      eventSource.onerror = () => {
        clearTimeout(timeout)
        eventSource.close()
        reject(new Error('SSE connection failed'))
      }
    })
  }

  async function submitAnalysis(
    symbol: string,
    market: string,
    period: string,
    options?: {
      historyDays?: number
      holdingQuantity?: number
      costPrice?: number
      maxPosition?: number
      holdingText?: string
      multiPeriodEnabled?: boolean
      auxiliaryPeriods?: string[]
    }
  ) {
    if (isAnalyzing.value) return

    clearState()
    isAnalyzing.value = true
    progress.value = 5
    statusMessage.value = '正在获取行情数据...'

    try {
      const deviceId = getDeviceId()

      // Fetch OHLCV data from browser (client-side, user IP)
      const historyDays = options?.historyDays ?? 90
      const ohlcvBars = await fetchOhlcv(symbol, market, period, historyDays)

      statusMessage.value = '正在提交分析任务...'
      progress.value = 10

      // Submit analysis
      const submitRes = await api.post('/api/analyze', {
        symbol: symbol.toUpperCase(),
        market,
        period,
        device_id: deviceId,
        history_days: historyDays,
        holding_quantity: options?.holdingQuantity ?? null,
        cost_price: options?.costPrice ?? null,
        max_position: options?.maxPosition ?? null,
        holding_text: options?.holdingText ?? null,
        ohlcv_bars: ohlcvBars,
      })

      const submitData = submitRes.data
      taskId.value = submitData.task_id
      isFirstTrial.value = !!submitData.is_first_trial

      progress.value = 20
      statusMessage.value = '任务已排队，正在分析...'

      // Try SSE first, fall back to polling
      let analysisResult: any
      try {
        analysisResult = await trySSE(submitData.task_id)
      } catch (sseErr) {
        console.log('SSE failed, falling back to polling:', sseErr)
        statusMessage.value = '正在分析中...'
        analysisResult = await pollForResult(submitData.task_id)
      }

      progress.value = 100
      result.value = analysisResult
      statusMessage.value = '分析完成！'

    } catch (e: any) {
      const detail = e.response?.data?.detail
      let code = ''
      let msg = ''

      if (typeof detail === 'object' && detail?.code) {
        code = detail.code
        msg = detail.message || '分析失败'
      } else if (typeof detail === 'string') {
        msg = detail
      } else {
        msg = e.message || '分析失败，请稍后重试'
      }

      errorCode.value = code
      error.value = msg
    } finally {
      isAnalyzing.value = false
    }
  }

  // Clean up on component unmount
  onUnmounted(() => {
    cancelAnalysis()
  })

  return {
    isAnalyzing, taskId, result, historyId, error, errorCode, progress, statusMessage, isFirstTrial,
    submitAnalysis, cancelAnalysis, clearState,
  }
}
