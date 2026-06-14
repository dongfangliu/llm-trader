import { ref, reactive, computed, onUnmounted } from 'vue'
import api from '~/lib/api'
import { useDevice } from '~/composables/useDevice'
import { useAuthStore } from '~/stores/auth'
import { fetchOhlcv } from '~/composables/useMarketDataFetcher'
import { computeTrendFeatures, computeLegacyIndicators, type TrendFeatures } from '~/lib/indicators'

export type AnalysisStatus = 'idle' | 'pending' | 'running' | 'completed' | 'failed'

export interface AnalysisResult {
  task_id: string
  status: string
  result?: any
  error?: string
}

export interface SubmitOptions {
  historyDays?: number
  holdingQuantity?: number
  costPrice?: number
  maxPosition?: number
  holdingText?: string
  multiPeriodEnabled?: boolean
  auxiliaryPeriods?: string[]
}

// 一条后台分析任务（专业版连续查询：多条并存、各自返回）
export interface BgTask {
  localId: string
  id: string | null            // 后端 task_id（提交后回填）
  symbol: string
  market: string
  period: string
  status: 'running' | 'done' | 'failed'
  progress: number
  result: any | null
  error: string | null
  errorCode: string | null
  historyId: number | null
  isFirstTrial: boolean
  positionParams: { holdingQuantity?: number; costPrice?: number; maxPosition?: number } | null
}

export interface BgHandlers {
  onComplete?: (task: BgTask) => void
  onError?: (task: BgTask) => void
}

// 流水线上下文：把进度/状态/historyId 回写到调用方（单例 或 某条 BgTask），
// 使核心流程与具体存储解耦，从而支持单任务前台 + 多任务后台并存。
interface PipelineCtx {
  setProgress: (n: number) => void
  setStatus: (s: string) => void
  setHistoryId: (id: number) => void
  onSubmitted?: (info: { taskId: string; isFirstTrial: boolean }) => void
  signal: AbortSignal
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

  // ── 前台单任务状态（免费/标准版：全屏 loading 流程，保持不变） ──
  const isAnalyzing = ref(false)
  const taskId = ref<string | null>(null)
  const result = ref<any>(null)
  const historyId = ref<number | null>(null)  // DB id of the saved history record
  const error = ref<string | null>(null)
  const errorCode = ref<string | null>(null)  // 'trial_expired', 'quota_exceeded', etc.
  const progress = ref(0)
  const statusMessage = ref('')
  const isFirstTrial = ref(false)  // was this a trial analysis?
  const trendFeatures = ref<TrendFeatures | null>(null)  // 前端自算特征，供即时展示
  const methodologyMode = ref<string>('trend')

  // ── 后台多任务状态（专业版/体验版：连续查询、各自返回） ──
  const bgTasks = ref<BgTask[]>([])
  const runningCount = computed(() => bgTasks.value.filter(t => t.status === 'running').length)
  const bgAborts = new Map<string, AbortController>()
  let bgSeq = 0

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
    trendFeatures.value = null
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

  function mapError(e: any): { code: string; msg: string } {
    const detail = e?.response?.data?.detail
    if (typeof detail === 'object' && detail?.code) {
      return { code: detail.code, msg: detail.message || '分析失败' }
    } else if (typeof detail === 'string') {
      return { code: '', msg: detail }
    }
    return { code: '', msg: e?.message || '分析失败，请稍后重试' }
  }

  // ── 单条任务的 SSE / 轮询：各自持有独立连接，通过 ctx 回写进度 ──
  async function trySSE(tId: string, ctx: PipelineCtx): Promise<any> {
    const timeoutMs = await getAnalyzeTimeoutMs()

    return new Promise((resolve, reject) => {
      // SSE uses relative path — Nuxt proxy forwards to backend
      let url = `/api/task/${tId}/stream`
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
      if (token) {
        url += `?token=${encodeURIComponent(token)}`
      }

      const eventSource = new EventSource(url)
      let sseProgress = 20
      const cleanup = () => {
        clearTimeout(timeout)
        ctx.signal.removeEventListener('abort', onAbort)
        eventSource.close()
      }
      const timeout = setTimeout(() => {
        cleanup()
        reject(new Error('SSE timeout'))
      }, timeoutMs)
      const onAbort = () => {
        cleanup()
        reject(new Error('aborted'))
      }

      if (ctx.signal.aborted) { onAbort(); return }
      ctx.signal.addEventListener('abort', onAbort, { once: true })

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)

          if (data.status === 'done') {
            cleanup()
            if (data.history_id) ctx.setHistoryId(data.history_id)
            resolve(data.result)
          } else if (data.status === 'failed') {
            cleanup()
            reject(new Error(data.error || '分析失败'))
          } else if (data.status === 'timeout') {
            cleanup()
            reject(new Error('分析超时'))
          } else {
            // Progress update
            sseProgress = Math.min(85, sseProgress + 5)
            ctx.setProgress(sseProgress)
            ctx.setStatus(data.message || '正在分析中...')
          }
        } catch {
          // ignore parse errors
        }
      }

      eventSource.onerror = () => {
        cleanup()
        reject(new Error('SSE connection failed'))
      }
    })
  }

  async function pollForResult(tId: string, ctx: PipelineCtx): Promise<any> {
    return new Promise((resolve, reject) => {
      let attempts = 0
      const maxAttempts = 60
      let timer: ReturnType<typeof setTimeout> | null = null

      const onAbort = () => {
        if (timer) clearTimeout(timer)
        reject(new Error('aborted'))
      }
      if (ctx.signal.aborted) { onAbort(); return }
      ctx.signal.addEventListener('abort', onAbort, { once: true })

      async function poll() {
        if (attempts >= maxAttempts) {
          ctx.signal.removeEventListener('abort', onAbort)
          reject(new Error('分析超时，请稍后查看结果'))
          return
        }

        try {
          const res = await api.get(`/api/task/${tId}`)
          const data = res.data

          if (data.status === 'done') {
            ctx.signal.removeEventListener('abort', onAbort)
            if (data.history_id) ctx.setHistoryId(data.history_id)
            resolve(data.result)
          } else if (data.status === 'failed') {
            ctx.signal.removeEventListener('abort', onAbort)
            reject(new Error(data.error || '分析失败'))
          } else {
            // Still pending/running
            ctx.setProgress(Math.min(90, attempts * 2))
            ctx.setStatus('正在分析中...')
            attempts++
            timer = setTimeout(poll, 3000)
          }
        } catch (e) {
          ctx.signal.removeEventListener('abort', onAbort)
          reject(e)
        }
      }

      poll()
    })
  }

  // ── 核心流水线：取行情 → 算特征 → POST → SSE/轮询。不读写任何单例。 ──
  async function runPipeline(
    symbol: string,
    market: string,
    period: string,
    options: SubmitOptions | undefined,
    ctx: PipelineCtx,
  ): Promise<{ result: any; isFirstTrial: boolean; trendFeatures: TrendFeatures | null; methodologyMode: string }> {
    const deviceId = getDeviceId()

    // 读方法论模式（决定前端算什么、是否展示趋势诊断）
    let mode = 'trend'
    try {
      const cfg = await api.get('/api/config')
      mode = cfg.data?.methodology_mode || 'trend'
    } catch { /* 默认 trend */ }

    // 取行情（日线需更长历史以满足 250 根斜率窗口）
    const historyDays = options?.historyDays ?? (period === 'daily' ? 400 : 90)
    const ohlcvBars = await fetchOhlcv(symbol, market, period, historyDays)

    // 前端计算特征/指标（按模式），既即时展示又随请求发送
    let trendPayload: any = null
    let trendHigherPayload: any = null
    let indicatorsPayload: any = null
    let localTrendFeatures: TrendFeatures | null = null
    const enoughBars = Array.isArray(ohlcvBars) && ohlcvBars.length >= 20
    if (enoughBars) {
      if (mode === 'legacy') {
        indicatorsPayload = computeLegacyIndicators(ohlcvBars)
      } else {
        const tf = computeTrendFeatures(ohlcvBars, { classifyTrend: period === 'daily' })
        localTrendFeatures = tf
        trendPayload = tf
        if (period !== 'daily') {
          // 周期扩散：分钟线叠加日线大周期方向
          try {
            const dailyBars = await fetchOhlcv(symbol, market, 'daily', 400)
            if (Array.isArray(dailyBars) && dailyBars.length >= 60) {
              trendHigherPayload = computeTrendFeatures(dailyBars, { classifyTrend: true })
            }
          } catch { /* 大周期可选，失败忽略 */ }
        }
      }
    }

    ctx.setStatus('正在提交分析任务...')
    ctx.setProgress(10)

    // Submit analysis（持仓三字段随请求发送——前台与后台一致）
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
      trend_features: trendPayload,
      trend_higher: trendHigherPayload,
      indicators: indicatorsPayload,
    })

    const submitData = submitRes.data
    const tId = submitData.task_id
    const firstTrial = !!submitData.is_first_trial
    ctx.onSubmitted?.({ taskId: tId, isFirstTrial: firstTrial })

    ctx.setProgress(20)
    ctx.setStatus('任务已排队，正在分析...')

    // Try SSE first, fall back to polling
    let analysisResult: any
    try {
      analysisResult = await trySSE(tId, ctx)
    } catch (sseErr: any) {
      if (ctx.signal.aborted) throw sseErr
      console.log('SSE failed, falling back to polling:', sseErr)
      ctx.setStatus('正在分析中...')
      analysisResult = await pollForResult(tId, ctx)
    }

    ctx.setProgress(100)
    return { result: analysisResult, isFirstTrial: firstTrial, trendFeatures: localTrendFeatures, methodologyMode: mode }
  }

  // ── 前台单任务提交（免费/标准版：写回单例、全屏 loading） ──
  async function submitAnalysis(
    symbol: string,
    market: string,
    period: string,
    options?: SubmitOptions,
  ) {
    if (isAnalyzing.value) return

    clearState()
    isAnalyzing.value = true
    progress.value = 5
    statusMessage.value = '正在获取行情数据...'

    abortController = new AbortController()
    const ctx: PipelineCtx = {
      setProgress: (n) => { progress.value = n },
      setStatus: (s) => { statusMessage.value = s },
      setHistoryId: (id) => { historyId.value = id },
      onSubmitted: ({ taskId: tId, isFirstTrial: ft }) => {
        taskId.value = tId
        isFirstTrial.value = ft
      },
      signal: abortController.signal,
    }

    try {
      const r = await runPipeline(symbol, market, period, options, ctx)
      methodologyMode.value = r.methodologyMode
      trendFeatures.value = r.trendFeatures
      result.value = r.result
      progress.value = 100
      statusMessage.value = '分析完成！'
    } catch (e: any) {
      if (abortController?.signal.aborted) return
      const { code, msg } = mapError(e)
      errorCode.value = code
      error.value = msg
    } finally {
      isAnalyzing.value = false
    }
  }

  // ── 后台多任务提交（专业版/体验版：不阻塞、各自返回结果/通知） ──
  function submitBackgroundAnalysis(
    symbol: string,
    market: string,
    period: string,
    options?: SubmitOptions,
    handlers?: BgHandlers,
  ): BgTask {
    const localId = `bg_${++bgSeq}`
    const ac = new AbortController()
    bgAborts.set(localId, ac)

    const task = reactive<BgTask>({
      localId,
      id: null,
      symbol: symbol.toUpperCase(),
      market,
      period,
      status: 'running',
      progress: 5,
      result: null,
      error: null,
      errorCode: null,
      historyId: null,
      isFirstTrial: false,
      positionParams: (options?.holdingQuantity || options?.costPrice || options?.maxPosition)
        ? {
            holdingQuantity: options?.holdingQuantity,
            costPrice: options?.costPrice,
            maxPosition: options?.maxPosition,
          }
        : null,
    }) as BgTask
    bgTasks.value.push(task)

    const ctx: PipelineCtx = {
      setProgress: (n) => { task.progress = n },
      setStatus: () => { /* 后台任务无需展示逐条文案 */ },
      setHistoryId: (id) => { task.historyId = id },
      onSubmitted: ({ taskId: tId, isFirstTrial: ft }) => {
        task.id = tId
        task.isFirstTrial = ft
      },
      signal: ac.signal,
    }

    runPipeline(symbol, market, period, options, ctx)
      .then((r) => {
        task.result = r.result
        task.isFirstTrial = r.isFirstTrial
        task.status = 'done'
        task.progress = 100
        handlers?.onComplete?.(task)
      })
      .catch((e: any) => {
        if (ac.signal.aborted) return  // 主动中止，不当作失败上报
        const { code, msg } = mapError(e)
        task.error = msg
        task.errorCode = code
        task.status = 'failed'
        handlers?.onError?.(task)
      })
      .finally(() => {
        bgAborts.delete(localId)
      })

    return task
  }

  function cancelBackground(localId: string) {
    const ac = bgAborts.get(localId)
    if (ac) {
      ac.abort()
      bgAborts.delete(localId)
    }
    const idx = bgTasks.value.findIndex(t => t.localId === localId)
    if (idx >= 0) bgTasks.value.splice(idx, 1)
  }

  function cancelAllBackground() {
    bgAborts.forEach(ac => ac.abort())
    bgAborts.clear()
  }

  // Clean up on component unmount
  onUnmounted(() => {
    cancelAnalysis()
    cancelAllBackground()
  })

  return {
    // 前台单任务
    isAnalyzing, taskId, result, historyId, error, errorCode, progress, statusMessage, isFirstTrial,
    trendFeatures, methodologyMode,
    submitAnalysis, cancelAnalysis, clearState,
    // 后台多任务
    bgTasks, runningCount,
    submitBackgroundAnalysis, cancelBackground, cancelAllBackground,
  }
}
