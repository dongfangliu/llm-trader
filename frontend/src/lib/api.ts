import axios from 'axios';

// 使用相对路径，由 Next.js rewrites 代理到 backend 容器
// 本地开发时需要手动启动 backend（或设置 NEXT_PUBLIC_API_URL 指向本地 backend）
const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// Handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// ===================== Auth API =====================

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  username?: string;
}

export interface User {
  id: number;
  username: string;
  email?: string;
  subscription_tier: 'free' | 'basic' | 'premium';
  daily_usage: number;
  last_usage_date: string;
  invite_code?: string;
  bonus_quota?: number;
  used_invite_code?: string;  // non-null = already redeemed once
  has_had_pro_trial?: boolean;
  subscription_expires_at?: string | null;
  last_device_id?: string | null;
}

export const register = async (data: RegisterRequest) => {
  const response = await api.post('/api/auth/register', data);
  return response.data as { pending_verification: true; email: string; message: string };
};

export const login = async (data: LoginRequest) => {
  const device_id = typeof window !== 'undefined' ? localStorage.getItem('device_id') : null;
  const response = await api.post('/api/auth/login', { ...data, device_id });
  return response.data;
};

export const getMe = async () => {
  const response = await api.get('/api/auth/me');
  return response.data;
};

export const verifyEmail = async (token: string) => {
  const response = await api.get('/api/auth/verify-email', { params: { token } });
  return response.data as { message: string; email?: string; already_verified?: boolean };
};

export const resendVerification = async (email: string) => {
  const response = await api.post('/api/auth/resend-verification', { email });
  return response.data as { message: string };
};

// ===================== Analysis API =====================

export interface AnalyzeRequest {
  symbol: string;
  market: 'a' | 'hk' | 'us' | 'futures';
  period: 'daily' | '1' | '5' | '15' | '30' | '60';
  history_days: number;
  device_id?: string;
  holding_quantity?: number;
  cost_price?: number;
  max_position?: number;
  holding_text?: string;
}

export interface AnalysisResult {
  action: 'buy' | 'sell' | 'hold';
  signal?: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  target_price: number;
  stop_loss: number;
  reason: string;
  reasons?: string[];
  market_diagnosis?: string;
  opportunity_assessment?: string;
  risk_analysis?: string;
  execution_plan?: string;
  opportunity_quality?: string;
  risk_factors?: string[];
  indicators?: Record<string, number>;
  position_advice?: {
    current_holding: number;
    suggested_action: 'buy' | 'sell' | 'hold';
    suggested_quantity: number;
    reason: string;
  };
}

export interface AnalyzeResponse {
  success?: boolean;
  remaining?: number;
  history?: {
    id: number;
    analysis_date: string;
    analyzed_at: string;
  };
  result: AnalysisResult;
  usage: {
    remaining: number;
    tier: string;
    daily_limit?: number;
    used?: number;
  };
  data: {
    symbol: string;
    name?: string;
    market: string;
    latest_price: number;
    latest_date: string;
  };
}

export interface AnalyzeQueuedResponse {
  task_id: string;
  status: 'queued';
  usage: {
    tier: string;
    display_tier?: string;
    remaining: number;
    used: number;
    daily_limit: number;
  };
}

export const analyze = async (data: AnalyzeRequest): Promise<AnalyzeQueuedResponse> => {
  const response = await api.post('/api/analyze', data);
  return response.data;
};

export interface BatchAnalyzeRequest {
  symbols: string[];
  market: 'a' | 'hk' | 'us' | 'futures';
  period: 'daily' | '1' | '5' | '15' | '30' | '60';
  device_id?: string;
}

export const analyzeBatch = async (data: BatchAnalyzeRequest) => {
  const response = await api.post('/api/analyze/batch', data);
  return response.data;
};

export const getLimits = async () => {
  const response = await api.get('/api/analyze/limits');
  return response.data;
};

export interface AnalysisHistoryItem {
  id: number;
  symbol: string;
  name?: string;
  market: string;
  period: string;
  analysis_date: string;
  analyzed_at: string;
  detail: AnalyzeResponse;
}

export const getAnalysisHistory = async (limit: number = 30, deviceId?: string) => {
  const response = await api.get('/api/analyze/history', {
    params: { limit, device_id: deviceId },
  });
  return response.data as { items: AnalysisHistoryItem[] };
};

export const getUsage = async (deviceId: string) => {
  const response = await api.get('/api/usage', { params: { device_id: deviceId } });
  return response.data;
};

// ===================== Market Data API =====================

export interface MarketData {
  symbol: string;
  market: string;
  period: string;
  count: number;
  data: Array<{
    datetime: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    ma10?: number;
    ma30?: number;
    ma60?: number;
    rsi?: number;
    atr?: number;
    macd?: number;
    macd_dea?: number;
    macd_bar?: number;
  }>;
}

export const getMarketData = async (
  market: string,
  symbol: string,
  period: string = 'daily',
  historyDays: number = 90
): Promise<MarketData> => {
  const response = await api.get(`/api/market/${market}/${symbol}`, {
    params: { period, history_days: historyDays },
  });
  return response.data;
};

// ===================== Subscription API =====================

export const upgradeSubscription = async (tier: string) => {
  const response = await api.post('/api/subscription/upgrade', { tier });
  return response.data;
};

export const getSubscriptionStatus = async () => {
  const response = await api.get('/api/subscription/status');
  return response.data;
};

// ===================== Admin API =====================

const adminApi = axios.create({ baseURL: API_URL, headers: { 'Content-Type': 'application/json' } });

adminApi.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('adminToken');
    if (token) config.headers['X-Admin-Token'] = token;
  }
  return config;
});

export interface AdminUser {
  id: number;
  email: string;
  username: string | null;
  subscription_tier: 'free' | 'basic' | 'premium';
  daily_usage: number;
  last_usage_date: string | null;
  is_active: boolean;
  created_at: string | null;
  invite_code: string | null;
  bonus_quota: number;
  email_verified?: boolean;
  has_had_pro_trial?: boolean;
  used_invite_code?: string | null;
  subscription_expires_at?: string | null;
  last_device_id?: string | null;
}

export interface AdminDevice {
  id: number;
  device_id: string;
  subscription_tier: 'free' | 'basic' | 'premium';
  is_banned: boolean;
  has_had_pro_trial: boolean;
  created_at: string | null;
  updated_at: string | null;
}

export interface AdminStats {
  date: string;
  active_devices_today: number;
  total_requests_today: number;
  analysis_last_24h: number;
  tier_distribution: Record<string, number>;
}

export const adminGetStats = async (): Promise<AdminStats> => {
  const r = await adminApi.get('/api/admin/stats');
  return r.data;
};

export const adminGetUsers = async (params?: {
  search?: string; tier?: string; page?: number; page_size?: number;
}): Promise<{ total: number; page: number; page_size: number; items: AdminUser[] }> => {
  const r = await adminApi.get('/api/admin/users', { params });
  return r.data;
};

export const adminUpdateUser = async (
  userId: number,
  data: { subscription_tier?: string; is_active?: boolean; reset_usage?: boolean; email_verified?: boolean }
): Promise<AdminUser> => {
  const r = await adminApi.put(`/api/admin/users/${userId}`, data);
  return r.data;
};

export const adminSetUserQuota = async (
  userId: number,
  data: { daily_usage?: number; bonus_quota?: number }
): Promise<AdminUser> => {
  const r = await adminApi.patch(`/api/admin/users/${userId}/quota`, data);
  return r.data;
};

export const adminDeleteUser = async (userId: number) => {
  const r = await adminApi.delete(`/api/admin/users/${userId}`);
  return r.data;
};

export const adminGetDevices = async (params?: {
  search?: string; tier?: string; page?: number; page_size?: number;
}): Promise<{ total: number; page: number; page_size: number; items: AdminDevice[] }> => {
  const r = await adminApi.get('/api/admin/devices', { params });
  return r.data;
};

export const adminSetDeviceSubscription = async (device_id: string, tier: string) => {
  const r = await adminApi.post('/api/admin/subscription', { device_id, tier });
  return r.data;
};

export const adminDeleteDevice = async (device_id: string) => {
  const r = await adminApi.delete(`/api/admin/devices/${device_id}`);
  return r.data;
};

export const adminBanDevice = async (device_id: string) => {
  const r = await adminApi.post(`/api/admin/devices/${device_id}/ban`);
  return r.data;
};

export const adminUnbanDevice = async (device_id: string) => {
  const r = await adminApi.post(`/api/admin/devices/${device_id}/unban`);
  return r.data;
};

export const adminResetDeviceTrial = async (device_id: string) => {
  const r = await adminApi.post(`/api/admin/devices/${device_id}/reset-trial`);
  return r.data;
};

export const adminGetDeviceHistory = async (device_id: string) => {
  const r = await adminApi.get(`/api/admin/devices/${device_id}/history`);
  return r.data as { device_id: string; items: Array<{ id: number; symbol: string; market: string; period: string; analysis_date: string | null; analyzed_at: string | null }> };
};

export const adminBatchDevices = async (action: string, device_ids: string[]) => {
  const r = await adminApi.post('/api/admin/devices/batch', { action, device_ids });
  return r.data as { status: string; action: string; affected: number };
};

export interface FeatureItem {
  text: string;
  tiers: string[];
}

export interface SystemSettings {
  llm: {
    provider: string;
    api_key: string;
    base_url: string;
    model: string;
    max_tokens: number;
    temperature: number;
  };
  pricing: {
    period: string;
    guest_daily: number;
    free_daily: number;
    basic: { price: string; daily: number };
    premium: { price: string; daily: number };
    features: FeatureItem[];
  };
  afdian: {
    webhook_token: string;
    basic_plan_id: string;
    premium_plan_id: string;
    basic_link: string;
    premium_link: string;
    user_id: string;
    api_token: string;
  };
  email: {
    resend_api_key: string;
    app_base_url: string;
  };
  app: {
    name: string;
    trial_modal_title: string;
    trial_modal_subtitle: string;
    trial_modal_perks_label: string;
    trial_modal_perks: TrialPerk[];
    trial_modal_button: string;
    trial_ended_title: string;
    trial_ended_subtitle: string;
    trial_ended_perks_label: string;
    trial_ended_perks: TrialPerk[];
    trial_ended_register_button: string;
    trial_ended_upgrade_hint: string;
  };
}

export const adminGetSettings = async (): Promise<SystemSettings> => {
  const r = await adminApi.get('/api/admin/settings');
  return r.data;
};

export const adminUpdateSettings = async (section: string, data: Record<string, unknown>) => {
  const r = await adminApi.put('/api/admin/settings', { [section]: data });
  return r.data;
};

export const adminExportSettings = async (): Promise<SystemSettings> => {
  const r = await adminApi.get('/api/admin/settings/export');
  return r.data;
};

export const adminImportSettings = async (data: SystemSettings): Promise<{ success: boolean; imported: string[] }> => {
  const r = await adminApi.post('/api/admin/settings/import', data);
  return r.data;
};

export const adminRefreshNames = async (market?: 'a' | 'hk' | 'us') => {
  const params = market ? { market } : {};
  const r = await adminApi.post('/api/admin/refresh-names', null, { params });
  return r.data as { success: boolean; counts: Record<string, number>; errors?: Record<string, string>; message?: string };
};

export interface SymbolNameItem {
  symbol: string;
  market: string;
  name: string;
  updated_at: string | null;
}

export interface SymbolNamesResponse {
  total: number;
  market_totals: Record<string, number>;
  items: SymbolNameItem[];
}

export const adminGetSymbolNames = async (params?: {
  market?: string;
  search?: string;
  limit?: number;
}): Promise<SymbolNamesResponse> => {
  const r = await adminApi.get('/api/admin/symbol-names', { params });
  return r.data;
};

// ===================== Afdian Activation =====================

export const activateAfdianOrder = async (data: { out_trade_no: string; device_id?: string }) => {
  const response = await api.post('/api/subscription/activate', data);
  return response.data as { status: string; tier: string; expires_at?: string };
};

// ===================== App Config =====================

export interface TrialPerk { icon: string; text: string; }

export interface AppConfig {
  app_name: string;
  version: string;
  afdian_basic_link: string;
  afdian_premium_link: string;
  trial_modal_title: string;
  trial_modal_subtitle: string;
  trial_modal_perks_label: string;
  trial_modal_perks: TrialPerk[];
  trial_modal_button: string;
  trial_ended_title: string;
  trial_ended_subtitle: string;
  trial_ended_perks_label: string;
  trial_ended_perks: TrialPerk[];
  trial_ended_register_button: string;
  trial_ended_upgrade_hint: string;
}

export const getAppConfig = async (): Promise<AppConfig> => {
  const response = await api.get('/api/config');
  return response.data;
};

export interface PricingTier {
  price: string;
  period: string;
  daily_limit: number;
}
export interface PricingData {
  features: FeatureItem[];
  guest: { daily_limit: number };
  free: { daily_limit: number };
  basic: PricingTier;
  premium: PricingTier;
}
export const getPricing = async (): Promise<PricingData> => {
  const response = await api.get('/api/pricing');
  return response.data;
};


// ===================== Market Data Pipeline (Admin) =====================

export interface MarketDataSymbolStatus {
  symbol: string;
  market: string;
  period: string;
  name: string;
  bar_count: number;
  last_bar_date: string | null;
  is_empty: boolean;
  in_watchlist: boolean;
}

export interface MarketDataStatus {
  collecting: boolean;
  symbols: MarketDataSymbolStatus[];
}

export interface WatchlistEntry {
  symbol: string;
  market: string;
  periods: string[];
  adjust?: string;
}

export const adminGetMarketDataStatus = async (): Promise<MarketDataStatus> => {
  const response = await adminApi.get('/api/admin/market-data/status');
  return response.data;
};

export const adminTriggerRefresh = async (symbols?: WatchlistEntry[]): Promise<{ triggered: boolean; reason?: string }> => {
  const response = await adminApi.post('/api/admin/market-data/refresh', { symbols: symbols ?? null });
  return response.data;
};

export const adminGetWatchlist = async (): Promise<{ watchlist: WatchlistEntry[] }> => {
  const response = await adminApi.get('/api/admin/watchlist');
  return response.data;
};

export const adminUpdateWatchlist = async (watchlist: WatchlistEntry[]): Promise<{ success: boolean; count: number }> => {
  const response = await adminApi.put('/api/admin/watchlist', { watchlist });
  return response.data;
};

// ── Async Task ────────────────────────────────────────────────────────────────

export interface TaskStatusResponse {
  task_id: string;
  status: 'queued' | 'processing' | 'done' | 'failed' | 'timeout';
  result?: any;
  latest_price?: number;
  analyzed_at?: string;
  cached?: boolean;
  error?: string;
  usage?: {
    tier: string;
    remaining: number;
    used: number;
    daily_limit: number;
  };
}

export const pollTask = async (taskId: string): Promise<TaskStatusResponse> => {
  const response = await api.get(`/api/task/${taskId}`);
  return response.data;
};

/**
 * Connect to WebSocket for task result.
 * Calls onMessage when status is done/failed/timeout.
 * Returns a cleanup function to close the socket.
 */
export const connectTaskWebSocket = (
  taskId: string,
  onMessage: (data: TaskStatusResponse) => void,
  onError?: (err: Event) => void,
): (() => void) => {
  // Derive WebSocket base URL from the current page origin
  const wsProto = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsHost = typeof window !== 'undefined' ? window.location.host : 'localhost:3000';
  const ws = new WebSocket(`${wsProto}//${wsHost}/ws/task/${taskId}`);

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data) as TaskStatusResponse;
      onMessage(data);
    } catch {
      // ignore parse errors
    }
  };

  if (onError) {
    ws.onerror = onError;
  }

  return () => {
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      ws.close();
    }
  };
};

export default api;
