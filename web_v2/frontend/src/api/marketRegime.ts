/**
 * 市场态势API
 */

import axios from './client';

export interface MarketRegime {
  regime: 'trend' | 'ranging' | 'breakout' | 'abnormal' | 'unknown';
  confidence: number;
  features: {
    adx: number;
    atr: number;
    volatility: number;
    bollinger_width: number;
    trend_alignment: number;
  };
  active_strategy: string;
  duration_minutes: number;
  timestamp: string;
  trigger_reason?: string;
}

export interface RegimeConfig {
  periodic_interval: number;
  triggers: {
    price_change_threshold: number;
    volume_spike_threshold: number;
    adx_change_threshold: number;
  };
  lookback_periods: {
    adx_period: number;
    atr_period: number;
    ma_periods: number[];
  };
  regime_switch_cooldown: number;
}

export interface RegimeHistoryItem {
  regime: string;
  confidence: number;
  timestamp: string;
  switch_reason: string;
  duration_minutes: number;
}

export interface RegimeHistory {
  history: RegimeHistoryItem[];
  statistics: Record<string, number>;
  total_switches: number;
}

export interface MultiTimeframeTrend {
  period: string;
  trend: 'up' | 'down' | 'sideways';
  adx: number;
  ma_deviation: number;
}

export interface TrendAlignment {
  timeframes: MultiTimeframeTrend[];
  consistency: number;
  is_aligned: boolean;
}

/**
 * 获取当前市场状态
 */
export const getCurrentRegime = async (): Promise<MarketRegime> => {
  const response = await axios.get('/market-regime/current');
  return response.data;
};

/**
 * 强制重新计算市场状态
 */
export const recalculateRegime = async (force: boolean = false): Promise<MarketRegime> => {
  const response = await axios.post('/market-regime/recalculate', null, {
    params: { force }
  });
  return response.data;
};

/**
 * 获取市场态势配置
 */
export const getRegimeConfig = async (): Promise<RegimeConfig> => {
  const response = await axios.get('/market-regime/config');
  return response.data;
};

/**
 * 更新市场态势配置
 */
export const updateRegimeConfig = async (config: Partial<RegimeConfig>): Promise<RegimeConfig> => {
  const response = await axios.post('/market-regime/config', config);
  return response.data;
};

/**
 * 获取市场状态切换历史
 */
export const getRegimeHistory = async (hours: number = 24): Promise<RegimeHistory> => {
  const response = await axios.get('/market-regime/history', {
    params: { hours }
  });
  return response.data;
};

/**
 * 获取多周期趋势一致性
 */
export const getTrendAlignment = async (): Promise<TrendAlignment> => {
  const response = await axios.get('/market-regime/trend-alignment');
  return response.data;
};
