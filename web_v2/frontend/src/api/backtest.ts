/**
 * 回测API
 */

import axios from './client';

export interface BacktestRequest {
  name: string;
  strategy: string;
  start_date: string;
  end_date: string;
  initial_capital?: number;
  parameters?: Record<string, any>;
}

export interface OptimizationRequest {
  name: string;
  strategy: string;
  start_date: string;
  end_date: string;
  optimization_mode?: string;
  parameter_ranges: Record<string, any[]>;
  target_metric?: string;
}

export interface BacktestTask {
  task_id: string;
  name: string;
  strategy: string;
  start_date: string;
  end_date: string;
  optimization_mode: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  created_at: string;
  completed_at?: string;
}

/**
 * 运行回测
 */
export const runBacktest = async (request: BacktestRequest) => {
  const response = await axios.post('/backtest/run', request);
  return response.data;
};

/**
 * 运行参数优化
 */
export const runOptimization = async (request: OptimizationRequest) => {
  const response = await axios.post('/backtest/optimize', request);
  return response.data;
};

/**
 * 获取回测任务列表
 */
export const getBacktestTasks = async (status?: string, limit: number = 50) => {
  const response = await axios.get('/backtest/tasks', {
    params: { status, limit }
  });
  return response.data;
};

/**
 * 获取任务详情
 */
export const getTaskDetail = async (taskId: string) => {
  const response = await axios.get(`/backtest/tasks/${taskId}`);
  return response.data;
};

/**
 * 删除任务
 */
export const deleteTask = async (taskId: string) => {
  const response = await axios.delete(`/backtest/tasks/${taskId}`);
  return response.data;
};

/**
 * 获取策略模板
 */
export const getStrategyTemplates = async () => {
  const response = await axios.get('/backtest/templates');
  return response.data;
};

/**
 * 对比回测结果
 */
export const compareBacktests = async (taskIds: string[]) => {
  const response = await axios.get('/backtest/compare', {
    params: { task_ids: taskIds.join(',') }
  });
  return response.data;
};

// 别名供页面使用
export const getBacktestResult = getTaskDetail;
