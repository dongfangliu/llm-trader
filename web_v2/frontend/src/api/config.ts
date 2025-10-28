import api from './client'

// ==================== 配置数据类型 ====================

export interface TradingConfig {
  initial_capital?: number
  max_position?: number
  single_trade?: number
  symbol?: string
  tqsdk_symbol?: string
}

export interface RiskConfig {
  stop_loss?: number
  daily_max_loss?: number
  max_drawdown?: number
  max_hold_hours?: number
  volatility_threshold?: number
}

export interface DecisionConfig {
  confidence_threshold?: number
  max_daily_trades?: number
  min_trade_gap?: number
  tactical_interval?: number
  strategic_interval?: number
  llm_direct_enabled?: boolean
  llm_direct_interval?: number
  llm_allow_reverse?: boolean
}

export interface LLMConfig {
  model?: string
  temperature?: number
  max_tokens?: number
  timeout?: number
}

export interface DataConfig {
  fetch_interval?: number
  history_days?: number
  kline_period?: string
}

export interface SystemConfig {
  log_level?: string
  review_time?: string
  timezone?: string
}

export interface BacktestConfig {
  commission_rate?: number
  slippage_ticks?: number
}

export interface TradingParams {
  trading?: TradingConfig
  risk?: RiskConfig
  decision?: DecisionConfig
  llm?: LLMConfig
  data?: DataConfig
  system?: SystemConfig
  backtest?: BacktestConfig
}

export interface ProviderConfig {
  api_key?: string
  base_url?: string
}

export interface TqSDKConfig {
  username?: string
  password?: string
  use_sim?: boolean
}

export interface APIKeysConfig {
  provider?: string
  providers?: Record<string, ProviderConfig>
  tqsdk?: TqSDKConfig
}

export interface ConfigData {
  trading_params?: TradingParams
  api_keys?: APIKeysConfig
}

export interface ConfigUpdateRequest {
  trading_params?: TradingParams
  api_keys?: APIKeysConfig
}

export interface ConfigFieldSchema {
  type: string
  label: string
  min?: number
  max?: number
  step?: number
  unit?: string
  description: string
  options?: string[]
}

export interface ConfigSchema {
  [key: string]: {
    [field: string]: ConfigFieldSchema
  }
}

// ==================== 配置API ====================

/**
 * 获取所有配置（敏感信息自动掩码）
 */
export const getConfig = () => {
  return api.get<ConfigData>('/config')
}

/**
 * 更新配置
 */
export const updateConfig = (data: ConfigUpdateRequest) => {
  return api.put<ConfigData>('/config', data)
}

/**
 * 重新加载配置（热加载）
 */
export const reloadConfig = () => {
  return api.post('/config/reload')
}

/**
 * 获取配置项的元数据（字段说明、类型、范围等）
 */
export const getConfigSchema = () => {
  return api.get<ConfigSchema>('/config/schema')
}

// ==================== 数据源信息 ====================

export interface DataSourceInfo {
  use_sim: boolean       // 配置文件中的设置
  use_mock: boolean      // 当前运行模式
  source: string         // 实际数据源：mock/database/tqsdk_sim/tqsdk_real
  description: string    // 数据源描述
  timestamp: string
}

/**
 * 获取数据源状态
 */
export const getDataSource = () => {
  return api.get<DataSourceInfo>('/data-source')
}
