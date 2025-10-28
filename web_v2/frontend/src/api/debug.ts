/**
 * 数据调试API客户端
 */
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

export interface RawKlineItem {
  datetime: string;
  weekday: string;
  hour: number;
  minute: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  open_interest: number;
  period: number;
  is_trading_time: boolean;
  abnormal: boolean;
  abnormal_flags: string[];
}

export interface RawKlineResponse {
  items: RawKlineItem[];
  total: number;
  limit: number;
  offset: number;
  abnormal_count: number;
}

export interface DailyKlineItem {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  open_interest: number;
  abnormal: boolean;
  abnormal_flags: string[];
}

export interface DailyKlineResponse {
  items: DailyKlineItem[];
  total: number;
  limit: number;
  offset: number;
  abnormal_count: number;
}

export interface TimeDistributionItem {
  hour: number;
  count: number;
  is_trading_hour: boolean;
  abnormal: boolean;
}

export interface DataStats {
  minute_1: PeriodStats;
  minute_5: PeriodStats;
  minute_15: PeriodStats;
  minute_60: PeriodStats;
  minute_240: PeriodStats;
  daily: PeriodStats;
  database: DatabaseStats;
}

export interface PeriodStats {
  total: number;
  earliest: string;
  latest: string;
  null_count: number;
  zero_volume_count: number;
}

export interface DatabaseStats {
  path: string;
  size_mb: number;
  exists: boolean;
}

/**
 * 获取原始K线数据
 */
export const getRawKlineData = async (params: {
  period: number;
  limit?: number;
  offset?: number;
  start_date?: string;
  end_date?: string;
  only_abnormal?: boolean;
}): Promise<RawKlineResponse> => {
  const response = await axios.get(`${API_BASE}/api/debug/kline/raw`, { params });
  return response.data.data;
};

/**
 * 获取原始日线数据
 */
export const getRawDailyData = async (params: {
  limit?: number;
  offset?: number;
}): Promise<DailyKlineResponse> => {
  const response = await axios.get(`${API_BASE}/api/debug/kline/daily-raw`, { params });
  return response.data.data;
};

/**
 * 获取数据统计
 */
export const getDataStats = async (): Promise<DataStats> => {
  const response = await axios.get(`${API_BASE}/api/debug/stats`);
  return response.data.data;
};

/**
 * 获取时间分布
 */
export const getTimeDistribution = async (period: number): Promise<TimeDistributionItem[]> => {
  const response = await axios.get(`${API_BASE}/api/debug/time-distribution`, {
    params: { period }
  });
  return response.data.data;
};

// ========== 实时数据接口 ==========

/**
 * 实时行情数据
 */
export interface RealtimeQuote {
  symbol: string;
  price: number;
  open: number;
  high: number;
  low: number;
  volume: number;
  timestamp: string;
  // 五档买盘
  bid_price1: number;
  bid_volume1: number;
  bid_price2: number;
  bid_volume2: number;
  bid_price3: number;
  bid_volume3: number;
  bid_price4: number;
  bid_volume4: number;
  bid_price5: number;
  bid_volume5: number;
  // 五档卖盘
  ask_price1: number;
  ask_volume1: number;
  ask_price2: number;
  ask_volume2: number;
  ask_price3: number;
  ask_volume3: number;
  ask_price4: number;
  ask_volume4: number;
  ask_price5: number;
  ask_volume5: number;
}

/**
 * 实时K线数据项
 */
export interface RealtimeKlineItem {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * 实时K线响应
 */
export interface RealtimeKlineResponse {
  period: string;
  items: RealtimeKlineItem[];
  count: number;
}

/**
 * 实时服务状态
 */
export interface RealtimeStatus {
  running: boolean;
  cache_status: {
    quote_cached: boolean;
    kline_periods: string[];
    last_update: string | null;
  };
  message: string;
}

/**
 * 获取实时行情（从TqSDK缓存读取）
 */
export const getRealtimeQuote = async (): Promise<RealtimeQuote> => {
  const response = await axios.get(`${API_BASE}/api/debug/realtime/quote`);
  return response.data.data;
};

/**
 * 获取实时K线（从TqSDK缓存读取）
 */
export const getRealtimeKline = async (params: {
  period: string;
  limit?: number;
}): Promise<RealtimeKlineResponse> => {
  const response = await axios.get(`${API_BASE}/api/debug/realtime/kline`, { params });
  return response.data.data;
};

/**
 * 获取实时服务状态
 */
export const getRealtimeStatus = async (): Promise<RealtimeStatus> => {
  const response = await axios.get(`${API_BASE}/api/debug/realtime/status`);
  return response.data.data;
};

// ======== System logs ========
export interface SystemLogs {
  path: string;
  tail: number;
  lines: string[];
}
export const getSystemLogs = async (tail = 200): Promise<SystemLogs> => {
  const response = await axios.get(`${API_BASE}/api/v1/system/logs`, { params: { tail } });
  return response.data.data;
};
