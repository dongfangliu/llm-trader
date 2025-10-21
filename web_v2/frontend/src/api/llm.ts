/**
 * LLM专家系统API
 */

import axios from './client';

export interface LLMTrigger {
  trigger_id: string;
  timestamp: string;
  trigger_type: 'expert_review' | 'abnormal_analysis' | 'signal_conflict' | 'daily_review';
  quant_signal: any;
  llm_decision: any;
  tokens_used: number;
  cost: number;
  response_time: number;
  final_action: string;
}

export interface CostTrend {
  daily_cost: Array<{
    date: string;
    trigger_count: number;
    total_tokens: number;
    total_cost: number;
  }>;
  trend_analysis: {
    avg_daily_cost: number;
    max_daily_cost: number;
    min_daily_cost: number;
    trend: 'increasing' | 'decreasing' | 'stable';
  };
  budget_status: {
    monthly_projection: number;
    budget_target: number;
    within_budget: boolean;
    utilization_percent: number;
  };
}

/**
 * 获取最近LLM触发记录
 */
export const getRecentTriggers = async (limit: number = 20) => {
  const response = await axios.get('/llm/triggers/recent', {
    params: { limit }
  });
  return response.data.data;
};

/**
 * 获取LLM触发统计
 */
export const getTriggerStatistics = async (days: number = 30) => {
  const response = await axios.get('/llm/triggers/statistics', {
    params: { days }
  });
  return response.data.data;
};

/**
 * 获取触发详情
 */
export const getTriggerDetail = async (triggerId: string) => {
  const response = await axios.get(`/llm/triggers/${triggerId}`);
  return response.data.data;
};

/**
 * 获取LLM成本趋势
 */
export const getCostTrend = async (days: number = 30): Promise<CostTrend> => {
  const response = await axios.get('/llm/cost/trend', {
    params: { days }
  });
  return response.data.data;
};

/**
 * 获取最新每日复盘
 */
export const getLatestDailyReview = async () => {
  const response = await axios.get('/llm/daily-review/latest');
  return response.data.data;
};

// 别名函数供页面使用
export const getTriggerHistory = getRecentTriggers;
export const getCostStats = getCostTrend;
export const getTriggerAnalysis = getTriggerStatistics;
