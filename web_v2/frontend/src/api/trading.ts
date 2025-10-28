import api from './client'

export interface KlineData {
  timestamp: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface AccountInfo {
  balance: number
  equity: number
  pnl: number
  pnl_percent: number
  drawdown: number
  positions_count: number
  timestamp: string
}

export interface PositionInfo {
  symbol: string
  direction: string
  volume: number
  entry_price: number
  current_price: number
  pnl: number
  pnl_percent: number
}

export interface MarketRegime {
  regime: string
  confidence: number
  adx: number
  atr: number
  volatility: number
}

// K线数据API
export const getKline = (period: string = '1m', limit: number = 500) => {
  return api.get('/kline', { params: { period, limit } })
}

// 账户信息API
export const getAccount = () => {
  return api.get('/account')
}

export const getPositions = () => {
  return api.get('/account/positions')
}

// 信号API
export const getSignals = (limit: number = 10, strategy?: string) => {
  return api.get('/signal', { params: { limit, strategy } })
}

export const getMarketRegime = () => {
  return api.get('/signal/market_regime')
}

export const getOrderFlow = () => {
  return api.get('/signal/order_flow')
}

// 控制API
export const emergencyClose = () => {
  return api.post('/control/emergency_close')
}

export const toggleStrategy = (strategy: string, enabled: boolean) => {
  return api.post('/control/strategy/toggle', { strategy, enabled })
}

export const pauseTrading = (paused: boolean, reason?: string) => {
  return api.post('/control/trading/pause', { paused, reason })
}

// 手动交易API
export interface ManualTradeParams {
  action: 'open' | 'close'
  direction: 'long' | 'short'
  volume: number
}

export const manualTrade = (params: ManualTradeParams) => {
  return api.post('/control/manual_trade', params)
}

// 系统API
export const getSystemStatus = () => {
  return api.get('/system/status')
}

// ==================== 新增API（TqSDK实时数据改造） ====================

// Tick数据API
export const getLatestTick = () => {
  return api.get('/tick/latest')
}

export const getTickHistory = (limit: number = 100) => {
  return api.get('/tick', { params: { limit } })
}

// 分时图API
export const getTimeshare = () => {
  return api.get('/timeshare')
}

// K线增量更新API（可选，当前未使用）
export const getKlineIncremental = (period: string, since?: string) => {
  return api.get('/kline/incremental', {
    params: { period, since }
  })
}
