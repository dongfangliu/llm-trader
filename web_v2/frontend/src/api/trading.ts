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

// 系统API
export const getSystemStatus = () => {
  return api.get('/system/status')
}
