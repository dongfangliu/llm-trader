/**
 * 策略表现API
 */

import axios from './client';

export interface StrategyInfo {
  status: 'active' | 'standby';
  today_signals: number;
  executed_signals: number;
  win_rate: number;
  profit_loss_ratio: number;
  avg_confidence: number;
  total_pnl: number;
}

export interface StrategySummary {
  strategies: {
    [key: string]: StrategyInfo;
  };
}

export interface SignalSourceDistribution {
  daily: Array<{
    date: string;
    quant: number;
    llm: number;
    quant_llm: number;
  }>;
  total: {
    quant: number;
    llm: number;
    quant_llm: number;
  };
  ratio: {
    quant_percent: number;
    llm_percent: number;
  };
  meets_80_20: boolean;
}

/**
 * 获取策略摘要
 */
export const getStrategySummary = async (): Promise<StrategySummary> => {
  const response = await axios.get('/strategy/summary');
  return response.data.data;
};

/**
 * 获取策略详细表现
 */
export const getStrategyPerformance = async (strategy: string, days: number = 7) => {
  const response = await axios.get(`/strategy/${strategy}/performance`, {
    params: { days }
  });
  return response.data.data;
};

/**
 * 获取信号来源分布
 */
export const getSignalSourceDistribution = async (days: number = 30): Promise<SignalSourceDistribution> => {
  const response = await axios.get('/strategy/signal-source-distribution', {
    params: { days }
  });
  return response.data.data;
};

// 别名供页面使用
export const getStrategyComparison = getStrategySummary;
export const getStrategySignals = async (strategy: string, limit: number = 50) => {
  const response = await axios.get(`/strategy/${strategy}/signals`, {
    params: { limit }
  });
  return response.data;
};
