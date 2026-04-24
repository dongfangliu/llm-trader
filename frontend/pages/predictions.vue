<script setup lang="ts">
// Public prediction feed — no auth required
definePageMeta({ layout: false })

const API_BASE = '/api/public'

// ── Data ──────────────────────────────────────────────────────────────────
const predictions = ref<any[]>([])
const accuracy    = ref<any>(null)
const loading     = ref(true)
const market      = ref<'all' | 'a' | 'hk'>('all')

async function loadPredictions() {
  loading.value = true
  try {
    const params = market.value === 'all' ? '' : `?market=${market.value}`
    const res = await $fetch<any>(`${API_BASE}/predictions${params}`)
    predictions.value = res.predictions ?? []
    accuracy.value    = res.accuracy ?? null
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
  }
}

// ── Web Push ───────────────────────────────────────────────────────────────
const pushSupported  = ref(false)
const pushGranted    = ref(false)
const pushLoading    = ref(false)
const pushMsg        = ref('')

onMounted(async () => {
  await loadPredictions()
  if ('serviceWorker' in navigator && 'PushManager' in window) {
    pushSupported.value = true
    const reg = await navigator.serviceWorker.getRegistration('/sw.js')
    if (reg) {
      const sub = await reg.pushManager.getSubscription()
      pushGranted.value = !!sub
    }
  }
})

async function subscribePush() {
  if (!pushSupported.value) return
  pushLoading.value = true
  pushMsg.value = ''
  try {
    // Register service worker
    const reg = await navigator.serviceWorker.register('/sw.js')
    await navigator.serviceWorker.ready

    // Get VAPID public key from server
    const { public_key } = await $fetch<any>('/api/push/vapid-public')
    const appKey = urlBase64ToUint8Array(public_key)

    // Subscribe to push
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: appKey,
    })

    const subJson = sub.toJSON() as any
    await $fetch('/api/push/subscribe', {
      method: 'POST',
      body: {
        endpoint: subJson.endpoint,
        keys: { p256dh: subJson.keys.p256dh, auth: subJson.keys.auth },
      },
    })
    pushGranted.value = true
    pushMsg.value = '✅ 已订阅！有新预测时会收到推送。'
  } catch (e: any) {
    pushMsg.value = `❌ 订阅失败：${e.message}`
  } finally {
    pushLoading.value = false
  }
}

async function unsubscribePush() {
  pushLoading.value = true
  try {
    const reg = await navigator.serviceWorker.getRegistration('/sw.js')
    if (reg) {
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        await $fetch('/api/push/unsubscribe', { method: 'DELETE', body: { endpoint: sub.endpoint } })
        await sub.unsubscribe()
      }
    }
    pushGranted.value = false
    pushMsg.value = '已取消订阅'
  } catch (e: any) {
    pushMsg.value = `❌ 取消失败：${e.message}`
  } finally {
    pushLoading.value = false
  }
}

function urlBase64ToUint8Array(base64: string) {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + pad).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

// ── Formatters ─────────────────────────────────────────────────────────────
const dirLabel: Record<string, string> = { up: '看涨 ▲', down: '看跌 ▼', hold: '震荡 ▬' }
const dirColor: Record<string, string> = { up: '#C23535', down: '#1A7A4A', hold: '#B87020' }
const mktLabel: Record<string, string> = { a: 'A股', hk: '港股', us: '美股' }

function pctStr(v: number | null) {
  if (v == null) return '—'
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`
}
function pctColor(v: number | null) {
  if (v == null) return '#888'
  return v > 0 ? '#C23535' : v < 0 ? '#1A7A4A' : '#888'
}
</script>

<template>
  <div class="page">

    <!-- ── Hero header ── -->
    <div class="hero">
      <div class="hero-inner">
        <div class="hero-brand">⬢ 财财技术洞见</div>
        <h1 class="hero-title">AI 预测追踪</h1>
        <p class="hero-sub">每日 AI 选股分析，公开兑现记录，不藏不蒙</p>

        <!-- Accuracy badge -->
        <div v-if="accuracy && accuracy.total > 0" class="acc-badge">
          <span class="acc-num">{{ accuracy.pct }}%</span>
          <span class="acc-label">累计胜率 · {{ accuracy.correct }}胜{{ accuracy.total }}场</span>
        </div>

        <!-- Push subscribe -->
        <div class="push-wrap">
          <button
            v-if="pushSupported && !pushGranted"
            @click="subscribePush"
            :disabled="pushLoading"
            class="btn-push"
          >
            {{ pushLoading ? '订阅中...' : '🔔 订阅每日预测推送' }}
          </button>
          <button
            v-else-if="pushSupported && pushGranted"
            @click="unsubscribePush"
            :disabled="pushLoading"
            class="btn-unsub"
          >
            {{ pushLoading ? '处理中...' : '🔕 取消订阅' }}
          </button>
          <p v-if="!pushSupported" class="push-hint">此浏览器不支持推送通知</p>
          <p v-if="pushMsg" class="push-msg">{{ pushMsg }}</p>
        </div>
      </div>
    </div>

    <!-- ── Market filter ── -->
    <div class="filter-bar">
      <button
        v-for="opt in [{ key: 'all', label: '全部' }, { key: 'a', label: 'A股' }, { key: 'hk', label: '港股' }]"
        :key="opt.key"
        class="filter-btn"
        :class="{ active: market === opt.key }"
        @click="market = opt.key as any; loadPredictions()"
      >{{ opt.label }}</button>
    </div>

    <!-- ── Prediction cards ── -->
    <div class="feed">
      <div v-if="loading" class="empty">加载中...</div>
      <div v-else-if="!predictions.length" class="empty">暂无预测数据</div>

      <div v-for="p in predictions" :key="p.id" class="card">

        <!-- Card header: symbol + market + date -->
        <div class="card-top">
          <div class="card-left">
            <div class="c-name">{{ p.symbol_name }}</div>
            <div class="c-meta">
              <span class="c-code">{{ p.symbol }}</span>
              <span class="c-dot">·</span>
              <span class="c-mkt">{{ mktLabel[p.market] || p.market }}</span>
              <span v-if="p.hot_rank" class="c-hot">热度 #{{ p.hot_rank }}</span>
            </div>
          </div>
          <div class="card-right">
            <div class="c-dir" :style="{ color: dirColor[p.predicted_direction] }">
              {{ dirLabel[p.predicted_direction] || p.predicted_direction }}
            </div>
            <div v-if="p.confidence" class="c-conf">置信度 {{ Math.round(p.confidence) }}%</div>
          </div>
        </div>

        <!-- Prices -->
        <div v-if="p.target_price || p.stop_loss" class="c-prices">
          <div v-if="p.target_price" class="c-price-item">
            <span class="c-price-lbl">目标价</span>
            <span class="c-price-val" :style="{ color: dirColor[p.predicted_direction] }">
              {{ p.target_price?.toFixed(2) }}
            </span>
          </div>
          <div v-if="p.stop_loss" class="c-price-item">
            <span class="c-price-lbl">止损价</span>
            <span class="c-price-val" style="color:#1A7A4A">{{ p.stop_loss?.toFixed(2) }}</span>
          </div>
        </div>

        <!-- Summary -->
        <div v-if="p.analysis_summary" class="c-summary">「{{ p.analysis_summary.slice(0, 60) }}{{ p.analysis_summary.length > 60 ? '…' : '' }}」</div>

        <!-- Result (if settled) -->
        <div v-if="p.status === 'settled'" class="c-result" :class="p.is_correct ? 'result-hit' : 'result-miss'">
          <span class="c-result-stamp">{{ p.is_correct ? '命中 ✓' : '未中 ✗' }}</span>
          <span class="c-result-pct" :style="{ color: pctColor(p.actual_change_pct) }">
            实际 {{ pctStr(p.actual_change_pct) }}
          </span>
        </div>

        <!-- Footer: date + tweet link -->
        <div class="c-footer">
          <span class="c-date">{{ p.prediction_date }}</span>
          <a
            v-if="p.prediction_tweet_id"
            :href="`https://x.com/i/web/status/${p.prediction_tweet_id}`"
            target="_blank"
            class="c-tweet-link"
          >查看推文 →</a>
        </div>

      </div>
    </div>

    <!-- ── Disclaimer ── -->
    <div class="disclaimer">⚠️ 仅供研究参考，不构成投资建议</div>
  </div>
</template>

<style>
* { box-sizing: border-box; margin: 0; padding: 0 }
body { background: #0A0E17; color: #F0F4FF; font-family: "PingFang SC","Helvetica Neue","Microsoft YaHei",sans-serif }
</style>

<style scoped>
.page { min-height: 100vh; background: #0A0E17 }

/* ── Hero ── */
.hero {
  background: linear-gradient(180deg, rgba(107,127,212,0.12) 0%, transparent 100%);
  border-bottom: 1px solid rgba(240,244,255,0.06);
  padding: 60px 20px 48px;
}
.hero-inner { max-width: 680px; margin: 0 auto; text-align: center }
.hero-brand { font-size: 15px; letter-spacing: 4px; color: #6B7FD4; margin-bottom: 16px }
.hero-title { font-size: 40px; font-weight: 900; letter-spacing: -1px; margin-bottom: 10px }
.hero-sub   { font-size: 16px; color: rgba(240,244,255,0.45); letter-spacing: 1px; margin-bottom: 28px }

.acc-badge {
  display: inline-flex; align-items: baseline; gap: 10px;
  background: rgba(184,144,42,0.12); border: 1px solid rgba(184,144,42,0.25);
  border-radius: 999px; padding: 8px 24px; margin-bottom: 28px;
}
.acc-num   { font-size: 32px; font-weight: 900; color: #B8922A; letter-spacing: -1px }
.acc-label { font-size: 14px; color: rgba(184,144,42,0.8); letter-spacing: 1px }

.push-wrap { display: flex; flex-direction: column; align-items: center; gap: 10px }
.btn-push {
  height: 44px; padding: 0 24px; border-radius: 12px;
  background: #6B7FD4; color: #fff; border: none;
  font-size: 15px; font-weight: 600; cursor: pointer; letter-spacing: 0.5px;
  transition: opacity .2s;
}
.btn-push:hover { opacity: 0.85 }
.btn-push:disabled { opacity: 0.5; cursor: not-allowed }
.btn-unsub {
  height: 36px; padding: 0 18px; border-radius: 10px;
  background: transparent; color: rgba(240,244,255,0.4);
  border: 1px solid rgba(240,244,255,0.15); font-size: 13px; cursor: pointer;
}
.push-hint { font-size: 13px; color: rgba(240,244,255,0.3) }
.push-msg  { font-size: 13px; color: rgba(240,244,255,0.6) }

/* ── Filter bar ── */
.filter-bar {
  display: flex; gap: 8px; padding: 20px 20px 0;
  max-width: 680px; margin: 0 auto;
}
.filter-btn {
  height: 34px; padding: 0 16px; border-radius: 8px;
  background: rgba(240,244,255,0.06); color: rgba(240,244,255,0.5);
  border: 1px solid rgba(240,244,255,0.08); font-size: 13px; cursor: pointer;
  transition: all .15s;
}
.filter-btn.active {
  background: rgba(107,127,212,0.2); color: #818cf8;
  border-color: rgba(107,127,212,0.35);
}

/* ── Feed ── */
.feed { max-width: 680px; margin: 0 auto; padding: 20px 20px 40px; display: flex; flex-direction: column; gap: 14px }
.empty { text-align: center; padding: 60px 0; color: rgba(240,244,255,0.3) }

.card {
  background: #141929; border: 1px solid rgba(240,244,255,0.06);
  border-radius: 16px; padding: 20px; display: flex; flex-direction: column; gap: 12px;
}

.card-top { display: flex; justify-content: space-between; align-items: flex-start }
.c-name { font-size: 22px; font-weight: 700; margin-bottom: 4px }
.c-meta { display: flex; align-items: center; gap: 6px; font-size: 13px; color: rgba(240,244,255,0.4) }
.c-dot  { opacity: 0.4 }
.c-hot  { background: rgba(184,144,42,0.15); color: #B8922A; padding: 2px 8px; border-radius: 6px; font-size: 11px }
.c-dir  { font-size: 20px; font-weight: 700; text-align: right; margin-bottom: 4px }
.c-conf { font-size: 13px; color: rgba(240,244,255,0.4); text-align: right }

.c-prices { display: flex; gap: 24px }
.c-price-item { display: flex; flex-direction: column; gap: 2px }
.c-price-lbl { font-size: 12px; color: rgba(240,244,255,0.4); letter-spacing: 2px }
.c-price-val { font-size: 24px; font-weight: 700; letter-spacing: -0.5px }

.c-summary {
  font-size: 14px; color: rgba(240,244,255,0.45);
  font-style: italic; line-height: 1.5; letter-spacing: 0.3px;
}

.c-result {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 16px; border-radius: 10px;
}
.result-hit { background: rgba(194,53,53,0.08); border: 1px solid rgba(194,53,53,0.2) }
.result-miss { background: rgba(26,122,74,0.08); border: 1px solid rgba(26,122,74,0.2) }
.c-result-stamp {
  font-size: 16px; font-weight: 800; letter-spacing: 4px;
}
.result-hit .c-result-stamp  { color: #C23535 }
.result-miss .c-result-stamp { color: #1A7A4A }
.c-result-pct { font-size: 18px; font-weight: 700 }

.c-footer { display: flex; justify-content: space-between; align-items: center; padding-top: 4px }
.c-date { font-size: 13px; color: rgba(240,244,255,0.3) }
.c-tweet-link {
  font-size: 13px; color: #6B7FD4; text-decoration: none; letter-spacing: 0.5px;
}
.c-tweet-link:hover { text-decoration: underline }

/* ── Disclaimer ── */
.disclaimer {
  text-align: center; padding: 20px; font-size: 12px;
  color: rgba(240,244,255,0.2); letter-spacing: 2px;
}
</style>
