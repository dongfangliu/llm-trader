/**
 * 市场态势API
 */

import axios from './client';

export interface MarketRegime {
  regime: 'trend' | 'ranging' | 'breakout' | 'abnormal';
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
}

export interface RegimeHistory {
  regime: string;
  confidence: number;
  timestamp: string;
  switch_reason: string;
}

export interface TrendAlignment {
  alignment: {
    [period: string]: {
      direction: string;
      adx: number;
      ma_deviation: number;
    };
  };
  consistency: number;
  is_aligned: boolean;
}

/**
 * 获取当前市场状态
 */
export const getCurrentRegime = async (): Promise<MarketRegime> => {
  const response = await axios.get('/market-regime/current');
  return response.data.data;
};

/**
 * 获取市场状态历史
 */
export const getRegimeHistory = async (hours: number = 24) => {
  const response = await axios.get('/market-regime/history', {
    params: { hours }
  });
  return response.data.data;
};

/**
 * 获取多周期趋势一致性
 */
export const getTrendAlignment = async (): Promise<TrendAlignment> => {
  const response = await axios.get('/market-regime/trend-alignment');
  return response.data.data;
};

// 别名供页面使用
export const getMultiTimeframeTrend = getTrendAlignment;
