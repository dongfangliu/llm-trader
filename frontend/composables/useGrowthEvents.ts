import api from '~/lib/api'
import { useDevice } from '~/composables/useDevice'

type GrowthMetadata = Record<string, any>

const SESSION_KEY = 'growth_session_id'
const LANDING_KEY = 'growth_landing_path'
const REFERRER_KEY = 'growth_referrer'

function uuid() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}

function ensureSessionId() {
  if (typeof window === 'undefined') return ''
  let id = sessionStorage.getItem(SESSION_KEY)
  if (!id) {
    id = uuid()
    sessionStorage.setItem(SESSION_KEY, id)
  }
  return id
}

function ensureLandingPath(path: string) {
  if (typeof window === 'undefined') return path
  let landing = sessionStorage.getItem(LANDING_KEY)
  if (!landing) {
    landing = path
    sessionStorage.setItem(LANDING_KEY, landing)
  }
  return landing
}

function ensureReferrer() {
  if (typeof window === 'undefined') return ''
  let referrer = sessionStorage.getItem(REFERRER_KEY)
  if (referrer == null) {
    referrer = document.referrer || ''
    sessionStorage.setItem(REFERRER_KEY, referrer)
  }
  return referrer
}

function sourceFromRoute(route: ReturnType<typeof useRoute>) {
  const q = route.query
  return String(q.src || q.utm_source || q.source || '').slice(0, 80)
}

export function useGrowthEvents() {
  const route = useRoute()
  const { getDeviceId } = useDevice()

  async function trackGrowthEvent(eventName: string, metadata: GrowthMetadata = {}) {
    if (typeof window === 'undefined') return

    const path = route.fullPath || window.location.pathname
    const queryMarket = typeof route.query.market === 'string' ? route.query.market : undefined
    const querySymbol = typeof route.query.symbol === 'string' ? route.query.symbol : undefined

    const payload = {
      event_name: eventName,
      session_id: ensureSessionId(),
      device_id: getDeviceId(),
      path,
      landing_path: ensureLandingPath(path),
      referrer: ensureReferrer(),
      source: sourceFromRoute(route),
      market: metadata.market ?? queryMarket,
      symbol: metadata.symbol ?? querySymbol,
      metadata,
    }

    try {
      await api.post('/api/growth/events', payload)
    } catch {}
  }

  return { trackGrowthEvent }
}
