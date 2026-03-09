import { create } from 'zustand';
import { User, LoginRequest, RegisterRequest, getMe, login as apiLogin, register as apiRegister } from '@/lib/api';

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  error: string | null;
  pendingVerificationEmail: string | null;  // set after registration until email verified

  // Actions
  login: (data: LoginRequest) => Promise<void>;
  register: (data: RegisterRequest) => Promise<void>;
  logout: () => void;
  checkAuth: () => Promise<void>;
  clearPendingVerification: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  isLoading: false,
  error: null,
  pendingVerificationEmail: null,

  login: async (data: LoginRequest) => {
    set({ isLoading: true, error: null });
    try {
      const response = await apiLogin(data);
      const { access_token, user } = response;
      localStorage.setItem('token', access_token);
      localStorage.setItem('user', JSON.stringify(user));
      set({ user, token: access_token, isLoading: false, pendingVerificationEmail: null });
    } catch (error: any) {
      const detail = error.response?.data?.detail || '邮箱或密码错误';
      const email = error.response?.headers?.['x-unverified-email'] || data.email;
      const isUnverified = error.response?.status === 403 && detail.includes('未验证');
      set({
        error: detail,
        isLoading: false,
        pendingVerificationEmail: isUnverified ? email : null,
      });
      throw error;
    }
  },

  register: async (data: RegisterRequest) => {
    set({ isLoading: true, error: null });
    try {
      const response = await apiRegister(data);
      // If email service is not configured, backend auto-verifies; no pending step
      const pendingEmail = response.pending_verification ? response.email : null;
      set({ isLoading: false, pendingVerificationEmail: pendingEmail });
    } catch (error: any) {
      set({
        error: error.response?.data?.detail || '注册失败，请重试',
        isLoading: false,
      });
      throw error;
    }
  },

  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    set({ user: null, token: null, pendingVerificationEmail: null });
  },

  clearPendingVerification: () => set({ pendingVerificationEmail: null }),

  checkAuth: async () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    const userStr = typeof window !== 'undefined' ? localStorage.getItem('user') : null;

    if (!token || !userStr) {
      set({ user: null, token: null });
      return;
    }

    try {
      const user = await getMe();
      set({ user, token, isLoading: false });
    } catch {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      set({ user: null, token: null });
    }
  },
}));

// Analysis State
interface AnalysisState {
  symbol: string;
  market: string;
  period: string;
  isAnalyzing: boolean;
  result: any | null;
  error: string | null;

  // Actions
  setSymbol: (symbol: string) => void;
  setMarket: (market: string) => void;
  setPeriod: (period: string) => void;
  setResult: (result: any) => void;
  setError: (error: string | null) => void;
  setIsAnalyzing: (isAnalyzing: boolean) => void;
  reset: () => void;
}

export const useAnalysisStore = create<AnalysisState>((set) => ({
  symbol: '',
  market: 'a',
  period: 'daily',
  isAnalyzing: false,
  result: null,
  error: null,

  setSymbol: (symbol) => set({ symbol }),
  setMarket: (market) => set({ market }),
  setPeriod: (period) => set({ period }),
  setResult: (result) => set({ result }),
  setError: (error) => set({ error }),
  setIsAnalyzing: (isAnalyzing) => set({ isAnalyzing }),
  reset: () => set({ symbol: '', result: null, error: null }),
}));
