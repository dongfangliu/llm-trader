'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore, useAnalysisStore } from '@/lib/store';
import {
  analyze,
  connectTaskSSE,
  pollTask,
  getUsage,
  getLimits,
  getMarketData,
  getAnalysisHistory,
  getAppConfig,
  AppConfig,
  getPricing,
  PricingData,
  AnalyzeRequest,
  AnalysisHistoryItem,
  AnalyzeQueuedResponse,
  TaskStatusResponse,
  favoriteHistory,
  unfavoriteHistory,
} from '@/lib/api';

import {
  generateShareCardBlob, generatePredictionCardBlob, generateStatementCardBlob,
  generateDesktopAnalysisCardBlob, generateDesktopPredictionCardBlob, generateDesktopStatementCardBlob,
  downloadBlob,
} from '@/lib/shareCard';
import { Toast, useToast } from '@/components/Toast';

/** Saved analysis record — persisted to localStorage as 'saved_records_v2' */
interface SavedRecord {
  id: string;
  symbol: string;
  name: string;
  market: string;
  action: 'buy' | 'sell' | 'hold';
  confidence: number | null;
  targetPrice: number | null;
  stopLoss: number | null;
  latestPrice: number | null;
  impliedReturn: number | null;
  opportunityGrade: string | null;
  analyzedAt: string;
  detail: any; // full result object for re-opening
}
import { ErrorReportDialog, isSystemError } from '@/components/ErrorReportDialog';
import SharePreviewSheet from '@/components/SharePreviewSheet';
import SavedRecordsSheet from '@/components/SavedRecordsSheet';
import ProTrialWelcomeModal from '@/components/ProTrialWelcomeModal';
import GuestTrialEndedScreen from '@/components/GuestTrialEndedScreen';
import DesktopView from '@/components/desktop/DesktopView';
import MobileView from '@/components/mobile/MobileView';


const HOT_STOCKS = [
  { code: '600519', name: '贵州茅台', market: 'a' },
  { code: '300750', name: '宁德时代', market: 'a' },
  { code: '002594', name: '比亚迪', market: 'a' },
  { code: '00700', name: '腾讯', market: 'hk' },
  { code: 'AAPL', name: '苹果', market: 'us' },
  { code: '600036', name: '招商银行', market: 'a' },
  { code: '03690', name: '美团', market: 'hk' },
  { code: 'BABA', name: '阿里巴巴', market: 'us' },
  { code: '01810', name: '小米', market: 'hk' },
  { code: 'NVDA', name: '英伟达', market: 'us' },
  { code: 'MA', name: '甲醇', market: 'futures' },
  { code: 'SA', name: '纯碱', market: 'futures' },
  { code: 'RB', name: '螺纹钢', market: 'futures' },
  { code: 'CU', name: '沪铜', market: 'futures' },
];

const QUICK_TIPS = [
  'A股输入纯数字代码，如 600519（茅台）',
  '港股输入数字代码，如 00700（腾讯）',
  '美股输入字母代码，如 AAPL（苹果）',
  '期货输入品种代码，如 MA（甲醇）',
];

const PERIOD_LABELS: Record<string, string> = {
  daily: '日线',
  '60': '60分钟',
  '30': '30分钟',
  '15': '15分钟',
  '5': '5分钟',
  '1': '1分钟',
};

// ── Symbol format validation ──────────────────────────────────────
const SYMBOL_PATTERNS: Record<string, { re: RegExp; hint: string }> = {
  a:       { re: /^\d{6}$/,     hint: 'A股代码应为6位数字，如 600519' },
  hk:      { re: /^\d{4,5}$/,   hint: '港股代码应为4-5位数字，如 00700' },
  us:      { re: /^[A-Z]{1,5}$/, hint: '美股代码应为1-5个大写字母，如 AAPL' },
  futures: { re: /^[A-Z]{1,3}$/, hint: '期货代码应为1-3个字母，如 MA' },
};

function validateSymbol(sym: string, mkt: string): string | null {
  const s = sym.trim().toUpperCase();
  if (!s) return '请输入股票/期货代码';
  if (s.length > 20) return '代码过长，请检查输入';
  const rule = SYMBOL_PATTERNS[mkt];
  if (rule && !rule.re.test(s)) return rule.hint;
  return null;
}

/** Strip characters that have no place in a stock/futures symbol code. */
function sanitizeSymbol(raw: string): string {
  // Allow: letters, digits, dots (US ETFs like BRK.B), hyphens (some HK codes)
  // Discard: everything else (HTML tags, scripts, etc.)
  return raw.replace(/[^A-Za-z0-9.\-]/g, '').slice(0, 20);
}

function validatePositiveInt(val: string, label: string): string | null {
  if (!val.trim()) return null; // optional
  const n = Number(val);
  if (!Number.isInteger(n) || n <= 0) return `${label}必须为正整数`;
  return null;
}

function validatePositiveFloat(val: string, label: string): string | null {
  if (!val.trim()) return null;
  const n = Number(val);
  if (isNaN(n) || n <= 0) return `${label}必须为大于0的数字`;
  return null;
}

// ── Error message mapping ─────────────────────────────────────────
function getErrorMessage(err: any, currentTier?: string): string {
  const status = err?.response?.status;
  const detail = err?.response?.data?.detail as string | undefined;
  if (!status && !err?.response) return '⚠️ 网络连接失败，请检查网络后重试';
  if (status === 400) return `⚠️ ${detail || '请求参数有误，请检查输入'}`;
  if (status === 401) return '🔒 登录已过期，请重新登录';
  if (status === 403) return `🚫 ${detail || '当前版本不支持该功能，请升级套餐'}`;
  if (status === 404) return `🔍 ${detail || '未找到该股票/期货数据，请检查代码'}`;
  if (status === 429) {
    if (currentTier === 'premium') return '⏱ 今日 15 次分析已全部用完，额度将于次日 0 点重置';
    if (currentTier === 'basic') return `⏱ ${detail || '今日分析次数已用完，升级专业版每天可分析 15 次'}`;
    return '⏱ 今日分析次数已用完，升级会员获取更多次数';
  }
  if (status === 502) return `🤖 ${detail || 'AI 响应格式异常，请重试'}`;
  if (status === 503) return `🔧 ${detail || 'AI 分析服务暂时不可用，请稍后重试'}`;
  if (status === 504) return '⏰ AI 分析超时，服务器响应较慢，请稍后重试';
  if (status >= 500) return '🚨 服务器繁忙，请稍后重试';
  return `⚠️ ${detail || '分析失败，请重试'}`;
}

function getActionDisplay(action: string | undefined) {
  if (!action) return { text: '观望', color: '#f59e0b' };
  const a = action.toLowerCase();
  if (a === 'buy' || a === '看涨') return { text: '看涨', color: '#ef4444' };
  if (a === 'sell' || a === '看跌') return { text: '看跌', color: '#22c55e' };
  return { text: '观望', color: '#f59e0b' };
}

function timeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '刚刚';
  if (mins < 60) return `${mins}分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}小时前`;
  return `${Math.floor(hours / 24)}天前`;
}

function getTimeGroupLabel(isoString: string): string {
  const d = new Date(isoString);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const weekAgo = new Date(today.getTime() - 6 * 86400000);
  const itemDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (itemDay.getTime() === today.getTime()) return '今日';
  if (itemDay.getTime() === yesterday.getTime()) return '昨日';
  if (itemDay >= weekAgo) return '本周';
  return `${d.getMonth() + 1}月`;
}

function formatCardTime(isoString: string): string {
  const d = new Date(isoString);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) {
    const h = d.getHours().toString().padStart(2, '0');
    const m = d.getMinutes().toString().padStart(2, '0');
    return `今天 ${h}:${m}`;
  }
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

const MARKET_LABELS: Record<string, string> = { a: 'A股', hk: '港股', us: '美股', futures: '期货' };

export default function HomePage() {
  const router = useRouter();
  const { user, logout, checkAuth } = useAuthStore();
  const {
    symbol, setSymbol,
    market, setMarket,
    period, setPeriod,
    isAnalyzing, setIsAnalyzing,
    result, setResult,
    error, setError,
  } = useAnalysisStore();

  const [authChecked, setAuthChecked] = useState(false);
  const [appName, setAppName] = useState('');
  const [appConfig, setAppConfig] = useState<AppConfig | null>(null);
  const [limits, setLimits] = useState<any>(null);
  const [marketData, setMarketData] = useState<any>(null);
  const [marketDataLoading, setMarketDataLoading] = useState(false);
  const [showUpgradeBanner, setShowUpgradeBanner] = useState(false);
  const [deviceId, setDeviceId] = useState('');
  const [holdingQuantity, setHoldingQuantity] = useState('');
  const [costPrice, setCostPrice] = useState('');
  const [maxPosition, setMaxPosition] = useState('');
  const [history, setHistory] = useState<any[]>([]);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
  const [premiumPendingCount, setPremiumPendingCount] = useState(0);
  const [premiumInputsOpen, setPremiumInputsOpen] = useState(true);
  const [showHotRecommendations, setShowHotRecommendations]= useState(false);
  const [hotRecommendations, setHotRecommendations] = useState<typeof HOT_STOCKS>([]);
  const [lastHotRecommendationSignature, setLastHotRecommendationSignature] = useState('');
  const [activePanel, setActivePanel] = useState<'analyze' | 'loading' | 'result'>('analyze');
  const [analyzingSymbol, setAnalyzingSymbol] = useState('');

  // Multi-period
  const [multiPeriodEnabled, setMultiPeriodEnabled] = useState(false);
  const [auxiliaryPeriods, setAuxiliaryPeriods] = useState<string[]>([]);
  const [multiPeriodResults, setMultiPeriodResults] = useState<{ period: string; result: any }[]>([]);

  // Result sheet (mobile bottom card)
  const [resultSheetOpen, setResultSheetOpen] = useState(false);

  // Four-step tab
  const [activeTab, setActiveTab] = useState(0);

  // Share card
  const [shareLoading, setShareLoading] = useState(false);
  const [saveLongLoading, setSaveLongLoading] = useState(false);
  const [shareConfirmOpen, setShareConfirmOpen] = useState(false);
  const [sharePendingLongImage, setSharePendingLongImage] = useState(false);
  // Bookmark / save state
  // Share preview sheet
  const [sharePreviewOpen, setSharePreviewOpen] = useState(false);
  const [sharePreviewBlob, setSharePreviewBlob] = useState<Blob | null>(null);
  const [sharePreviewFilename, setSharePreviewFilename] = useState('');
  const [sharePreviewArchiveBlob, setSharePreviewArchiveBlob] = useState<Blob | null>(null);
  const [sharePreviewArchiveFilename, setSharePreviewArchiveFilename] = useState('');
  const [sharePreviewStockMeta, setSharePreviewStockMeta] = useState<{ name: string; action: string; confidence: number | null } | null>(null);
  const [sharePreviewActionColor, setSharePreviewActionColor] = useState('#60a5fa');
  const [sharePreviewAnalyzedAt, setSharePreviewAnalyzedAt] = useState<string | null>(null);
  const [shareCardParams, setShareCardParams] = useState<any>(null);

  // Metadata for current result
  const [analyzeStartedAt, setAnalyzeStartedAt] = useState<string | null>(null);
  const [resultPositionParams, setResultPositionParams] = useState<{
    holdingQuantity?: string; costPrice?: string; maxPosition?: string;
  } | null>(null);

  // Symbol format warning (client-side, not blocking)
  const [symbolWarning, setSymbolWarning] = useState<string | null>(null);

  // Error reporting (system errors → dialog; user errors → inline)
  const [errorReport, setErrorReport] = useState<string | null>(null);
  const { toast, show: showToast } = useToast();

  // Analysis timeout tracking
  const [analyzeTimedOut, setAnalyzeTimedOut] = useState(false);

  // Pricing data from backend
  const [pricing, setPricing] = useState<PricingData | null>(null);

  // Mobile UI state
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [historySheetOpen, setHistorySheetOpen] = useState(false);

  // Desktop UI state
  const [isDesktop, setIsDesktop] = useState(false);
  const [dtUserMenuOpen, setDtUserMenuOpen] = useState(false);
  const [analyzingItems, setAnalyzingItems] = useState<{tempId: string; symbol: string}[]>([]);
  const [unreadResults, setUnreadResults] = useState(0);
  const dtUserBtnRef = useRef<HTMLButtonElement>(null);
  const dtPopoverRef = useRef<HTMLDivElement>(null);

  // Narrative loading text
  const NARRATIVE_TEXTS = [
    '正在读取市场数据...',
    '计算技术指标...',
    'AI 正在判断市场结构...',
    '评估买卖机会...',
    '生成深度研判报告...',
  ];
  const [narrativeIdx, setNarrativeIdx] = useState(0);

  const tier = user?.subscription_tier ?? 'free';
  // Tracks whether the trial was consumed this session (avoids an extra getMe() call).
  const [proTrialConsumed, setProTrialConsumed] = useState(false);
  const [pendingProTrialConsumed, setPendingProTrialConsumed] = useState(false);
  // Free/basic registered users who haven't used their one-time pro trial yet
  // are treated as premium in the UI so they can access all premium features.
  const isRegisteredProTrial = user !== null && (tier === 'free' || tier === 'basic') && !user.has_had_pro_trial && !proTrialConsumed;
  const [resultDisplayTier, setResultDisplayTier] = useState<string>(tier);
  const [guestTrialUsed, setGuestTrialUsed] = useState(false);
  const [pendingGuestTrialUsed, setPendingGuestTrialUsed] = useState(false);
  const [deviceBanned, setDeviceBanned] = useState(false);
  const [showTrialWelcome, setShowTrialWelcome] = useState(false);
  const [guestChecked, setGuestChecked] = useState(false);
  // True after guest confirms the welcome modal — prevents redirect after dismiss
  const [guestTrialConfirmed, setGuestTrialConfirmed] = useState(false);
  // Guests who confirmed the welcome modal and haven't used their one-time trial get full premium features
  const isGuestTrial = user === null && !guestTrialUsed && !deviceBanned && guestChecked && guestTrialConfirmed;
  const effectiveTier = (isRegisteredProTrial || isGuestTrial) ? 'premium' : tier;
  // Registered user quota exhausted (daily + bonus both = 0)
  const [userQuotaExhausted, setUserQuotaExhausted] = useState(false);

  // Saved records — rich objects stored in localStorage
  const [savedRecords, setSavedRecords] = useState<SavedRecord[]>(() => {
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem('saved_records_v2') : null;
      return raw ? (JSON.parse(raw) as SavedRecord[]) : [];
    } catch { return []; }
  });
  const [savedRecordsOpen, setSavedRecordsOpen] = useState(false);

  const isSavedRecord = (id: string) => {
    if (user) {
      return history.some(h => h.id === id && (h as any).is_favorited);
    }
    return savedRecords.some(r => r.id === id);
  };

  const handleBookmark = async () => {
    if (!result) return;
    const r = result.result ?? {};
    const d = result.data ?? {};
    const id = selectedHistoryId ?? `${d.symbol ?? ''}_${analyzeStartedAt ?? Date.now()}`;

    if (user) {
      // Server-side favorite for logged-in users
      const item = history.find(h => h.id === id);
      const wasFavorited = item ? !!(item as any).is_favorited : false;
      try {
        if (wasFavorited) {
          await unfavoriteHistory(id);
          showToast('已取消收藏');
        } else {
          await favoriteHistory(id);
          showToast(`已收藏  ${d.name || d.symbol}`);
        }
        // Update local history state
        setHistory(prev => prev.map(h =>
          h.id === id ? { ...h, is_favorited: !wasFavorited } : h
        ));
      } catch {
        showToast('操作失败', 'error');
      }
      return;
    }

    // Guest: use localStorage
    setSavedRecords(prev => {
      const exists = prev.some(rec => rec.id === id);
      let next: SavedRecord[];
      if (exists) {
        next = prev.filter(rec => rec.id !== id);
        showToast('已取消收藏');
      } else {
        const impliedReturn = (r.target_price != null && d.latest_price != null && d.latest_price > 0)
          ? ((r.target_price - d.latest_price) / d.latest_price) * 100 : null;
        const record: SavedRecord = {
          id,
          symbol:           d.symbol || '',
          name:             d.name || d.symbol || '',
          market:           d.market || 'a',
          action:           r.action || 'hold',
          confidence:       r.confidence ?? null,
          targetPrice:      r.target_price ?? null,
          stopLoss:         r.stop_loss ?? null,
          latestPrice:      d.latest_price ?? null,
          impliedReturn,
          opportunityGrade: r.opportunity_quality ?? null,
          analyzedAt:       analyzeStartedAt || new Date().toISOString(),
          detail:           result,
        };
        next = [record, ...prev].slice(0, 50); // keep latest 50
        showToast(`已收藏  ${d.name || d.symbol}`);
      }
      try { localStorage.setItem('saved_records_v2', JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  // Share card — generates social statement card + archive prediction card, shows dual-mode preview
  const handleShareViralCard = async (resultOverride?: typeof result, analyzedAtOverride?: string | null) => {
    const activeResult = resultOverride ?? result;
    if (!activeResult) return;
    setShareLoading(true);
    try {
      const activeAnalyzedAt = (analyzedAtOverride !== undefined ? analyzedAtOverride : analyzeStartedAt) || new Date().toISOString();
      const r = activeResult.result ?? {};
      const d = activeResult.data ?? {};

      const rawReason: string = r.reason || r.market_diagnosis || '';
      const reasonExcerpt = rawReason.replace(/[*#`_>\[\]]/g, '').slice(0, 60).trim();

      const cardParams = {
        stockName:              d.name || d.symbol || '',
        stockCode:              d.symbol || '',
        market:                 d.market || 'a',
        action:                 (r.action || 'hold') as 'buy' | 'sell' | 'hold',
        confidence:             r.confidence ?? null,
        latestPrice:            d.latest_price ?? null,
        targetPrice:            r.target_price ?? null,
        stopLoss:               r.stop_loss ?? null,
        opportunityGrade:       r.opportunity_quality ?? null,
        reasonExcerpt,
        analyzedAt:             activeAnalyzedAt,
        tier: resultDisplayTier,
        basicDailyLimit:        pricing?.basic?.daily_limit ?? 5,
        appName:                appName,
        appBaseUrl:             typeof window !== 'undefined' ? window.location.origin : undefined,
        marketDiagnosis:        r.market_diagnosis || '',
        opportunityAssessment:  r.opportunity_assessment || '',
        riskAnalysis:           r.risk_analysis || '',
        executionPlan:          r.execution_plan || '',
      };

      // Generate social card immediately; archive card is generated lazily when user switches mode
      const socialResult = isDesktop
        ? await generateDesktopStatementCardBlob(cardParams)
        : await generateStatementCardBlob(cardParams);

      const action: 'buy' | 'sell' | 'hold' = cardParams.action;
      const actionColor = action === 'buy' ? '#EF4444' : action === 'sell' ? '#22C55E' : '#60A5FA';

      setSharePreviewBlob(socialResult.blob);
      setSharePreviewFilename(socialResult.filename);
      setSharePreviewArchiveBlob(null);    // lazy: generated on demand
      setSharePreviewArchiveFilename('');
      setShareCardParams(cardParams);      // save for lazy archive generation
      setSharePreviewStockMeta({ name: cardParams.stockName, action, confidence: cardParams.confidence });
      setSharePreviewActionColor(actionColor);
      setSharePreviewAnalyzedAt(activeAnalyzedAt);
      setSharePreviewOpen(true);
    } finally {
      setShareLoading(false);
    }
  };

  const generateShareCard = async (includePosition?: boolean, resultOverride?: typeof result, analyzedAtOverride?: string | null, longImage?: boolean) => {
    const activeResult = resultOverride ?? result;
    if (!activeResult) return;
    const hasPosition = !resultOverride && !!(resultPositionParams && Object.values(resultPositionParams).some((v) => v?.trim()));
    // Skip position confirmation when sharing from history
    if (!resultOverride) {
      if (hasPosition && includePosition === undefined) {
        setSharePendingLongImage(!!longImage);
        setShareConfirmOpen(true);
        return;
      }
    }
    setShareConfirmOpen(false);
    const setLoading = longImage ? setSaveLongLoading : setShareLoading;
    setLoading(true);
    try {
      const activeAnalyzedAt = analyzedAtOverride !== undefined ? analyzedAtOverride : analyzeStartedAt;

      const shareParams = {
        result: activeResult,
        tier,
        basicDailyLimit: pricing?.basic?.daily_limit ?? 5,
        analyzedAt: activeAnalyzedAt,
        appName: appName,
        includePosition,
        longImage,
        positionParams: resultPositionParams,
      };
      const { blob, filename } = isDesktop
        ? await generateDesktopAnalysisCardBlob(shareParams)
        : await generateShareCardBlob(shareParams);
      downloadBlob(blob, filename);
    } finally {
      setLoading(false);
    }
  };
  const getOrCreateDeviceId = () => {
    const existing = localStorage.getItem('device_id');
    if (existing) return existing;
    const newId = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem('device_id', newId);
    return newId;
  };

  const getRecommendationSignature = (items: typeof HOT_STOCKS) =>
    items.map((item) => `${item.market}:${item.code}`).join('|');

  const toHistoryCardItem = (h: AnalysisHistoryItem) => ({
    id: String(h.id),
    symbol: h.symbol,
    name: h.detail?.data?.name || h.name || '',
    market: h.market,
    action: h.detail?.result?.action,
    confidence: h.detail?.result?.confidence,
    analyzedAt: h.analyzed_at,
    detail: h.detail,
    is_favorited: h.is_favorited ?? false,
  });

  const getMarketRecommendations = (targetMarket: string, prevSignature = '') => {
    const pool = HOT_STOCKS.filter((item) => item.market === targetMarket);
    const limit = Math.min(4, pool.length);
    if (limit === 0) return [];
    let picked = [...pool].sort(() => Math.random() - 0.5).slice(0, limit);
    let signature = getRecommendationSignature(picked);
    let attempts = 0;
    while (prevSignature && signature === prevSignature && attempts < 8) {
      picked = [...pool].sort(() => Math.random() - 0.5).slice(0, limit);
      signature = getRecommendationSignature(picked);
      attempts += 1;
    }
    if (prevSignature && signature === prevSignature && picked.length > 1) {
      picked = [...picked].reverse();
    }
    return picked;
  };

  // Desktop media query
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    setIsDesktop(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Close desktop user popover on outside click
  useEffect(() => {
    if (!dtUserMenuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (dtPopoverRef.current && !dtPopoverRef.current.contains(e.target as Node)) {
        setDtUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [dtUserMenuOpen]);

  // Check auth on mount + fetch app name
  useEffect(() => {
    // Set deviceId immediately (sync localStorage) so the page renders right away
    const id = getOrCreateDeviceId();
    setDeviceId(id);
    // Auth check — redirect to login if not authenticated
    checkAuth()
      .catch(() => setError('初始化失败，请刷新页面重试'))
      .finally(() => setAuthChecked(true));

    getAppConfig()
      .then((cfg) => { if (cfg?.app_name) setAppName(cfg.app_name); setAppConfig(cfg); })
      .catch(() => {});

    getPricing()
      .then(setPricing)
      .catch(() => {});
  }, [router]);

  // Load limits
  useEffect(() => {
    let cancelled = false;
    if (user) {
      // Logged-in: use account-based limits (USER_LIMITS, free=3/day)
      getLimits().then((data) => {
        if (!cancelled) setLimits({ remaining: data.remaining, daily_limit: data.daily_limit });
      }).catch(console.error);
    } else if (deviceId) {
      // Guest: use device-based limits (LIMITS, free=1/day)
      getUsage(deviceId).then((usage) => {
        if (cancelled) return; // user logged in while request was in flight
        setLimits({
          remaining: usage.remaining,
          daily_limit: usage.daily_limit ?? (usage.subscription === 'premium' ? 15 : usage.subscription === 'basic' ? 5 : 1),
        });
        if ((usage as any).is_banned) {
          setDeviceBanned(true);
          setShowTrialWelcome(false);
        } else if ((usage as any).trial_used) {
          setGuestTrialUsed(true);
          setShowTrialWelcome(false);
        } else {
          // Guest hasn't used trial yet — show welcome modal every page open
          setShowTrialWelcome(true);
        }
        setGuestChecked(true);
      }).catch(() => {
        if (cancelled) return;
        // API unreachable — treat as fresh device (no trial used yet)
        setShowTrialWelcome(true);
        setGuestChecked(true);
      });
    }
    return () => { cancelled = true; };
  }, [deviceId, user]);

  // When user logs in/registers, clear guest trial state and evaluate welcome modal
  useEffect(() => {
    if (user) {
      setGuestTrialUsed(false);
      setDeviceBanned(false);
      // Show welcome modal for free/basic users who haven't had a trial yet
      const needsTrial = (user.subscription_tier === 'free' || user.subscription_tier === 'basic')
        && !user.has_had_pro_trial;
      setShowTrialWelcome(needsTrial);
    }
  }, [user?.id]);

  useEffect(() => {
    if (!deviceId) return;
    getAnalysisHistory(30, deviceId)
      .then((res) => { setHistory((res.items || []).map(toHistoryCardItem)); })
      .catch(() => {});
  }, [deviceId, user?.id]);

  useEffect(() => {
    // Upgrade banner only for logged-in users who hit their daily quota
    if (user && limits && limits.remaining <= 0) setShowUpgradeBanner(true);
    else if (limits && limits.remaining > 0) setShowUpgradeBanner(false);
    // Show quota exhausted screen for logged-in users with no remaining quota
    if (user && limits && limits.remaining <= 0 && !(user.bonus_quota && user.bonus_quota > 0)) {
      setUserQuotaExhausted(true);
    } else {
      setUserQuotaExhausted(false);
    }
  }, [limits, tier, user]);

  useEffect(() => {
    if (effectiveTier === 'free' && market !== 'a') setMarket('a');
  }, [effectiveTier, market, setMarket]);

  // Re-fetch limits whenever user navigates to the analyze panel (covers bottom nav tap)
  useEffect(() => {
    if (activePanel !== 'analyze') return;
    if (user) {
      getLimits().then((data) => setLimits({ remaining: data.remaining, daily_limit: data.daily_limit })).catch(() => {});
    } else if (deviceId) {
      getUsage(deviceId).then((usage) => setLimits({
        remaining: usage.remaining,
        daily_limit: usage.daily_limit ?? (usage.subscription === 'premium' ? 15 : usage.subscription === 'basic' ? 5 : 1),
      })).catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePanel]);

  useEffect(() => {
    const next = getMarketRecommendations(market);
    setHotRecommendations(next);
    setLastHotRecommendationSignature(getRecommendationSignature(next));
    setShowHotRecommendations(false);
  }, [market]);

  // Real-time symbol format warning
  useEffect(() => {
    if (!symbol.trim()) { setSymbolWarning(null); return; }
    const warn = validateSymbol(symbol, market);
    setSymbolWarning(warn);
  }, [symbol, market]);

  // Narrative loading text cycling
  useEffect(() => {
    if (activePanel !== 'loading') { setNarrativeIdx(0); return; }
    const timer = setInterval(() => {
      setNarrativeIdx((i) => (i + 1) % NARRATIVE_TEXTS.length);
    }, 1800);
    return () => clearInterval(timer);
  }, [activePanel]);

  // Pre-highlight the most recent card when switching to result panel (no auto-open)
  useEffect(() => {
    if (activePanel === 'result' && history.length > 0 && !selectedHistoryId) {
      setSelectedHistoryId(history[0].id);
    }
  }, [activePanel]);

  // Flush pending trial-consumed state — called when user is done viewing results
  const flushPendingTrialConsumed = useCallback(() => {
    if (pendingGuestTrialUsed) {
      setGuestTrialUsed(true);
      setPendingGuestTrialUsed(false);
    }
    if (pendingProTrialConsumed) {
      setProTrialConsumed(true);
      setPendingProTrialConsumed(false);
    }
  }, [pendingGuestTrialUsed, pendingProTrialConsumed]);

  // Mobile path: flush when ResultSheet closes
  const prevResultSheetOpenRef = useRef(false);
  useEffect(() => {
    const wasOpen = prevResultSheetOpenRef.current;
    prevResultSheetOpenRef.current = resultSheetOpen;
    if (wasOpen && !resultSheetOpen && (pendingGuestTrialUsed || pendingProTrialConsumed)) {
      flushPendingTrialConsumed();
    }
  }, [resultSheetOpen, pendingGuestTrialUsed, pendingProTrialConsumed, flushPendingTrialConsumed]);

  const handleAnalyze = async () => {
    // Desktop fallback: if user tries to analyze again while trial result is pending, flush now
    if (pendingGuestTrialUsed || pendingProTrialConsumed) {
      flushPendingTrialConsumed();
      return; // Trial-ended screen will render on next cycle
    }
    // ── Guest trial/ban — GuestTrialEndedScreen shows automatically via open prop ──
    if (!user && (guestTrialUsed || deviceBanned)) return;

    // ── Client-side validation ──────────────────────────────────────
    const symErr = validateSymbol(symbol, market);
    if (symErr) { setError(symErr); return; }

    // Verify stock exists before proceeding
    setMarketDataLoading(true);
    setMarketData(null);
    let fetchedMarketData = null;
    try {
      fetchedMarketData = await getMarketData(market, symbol.trim().toUpperCase(), period, 30);
      setMarketData(fetchedMarketData);
    } catch {
      setMarketDataLoading(false);
      setError('🔍 未找到该代码的行情数据，请确认代码正确');
      return;
    }
    setMarketDataLoading(false);
    if (!fetchedMarketData || !fetchedMarketData.count) {
      setError('🔍 未找到该代码的行情数据，请确认代码正确');
      return;
    }

    const isPremium = effectiveTier === 'premium';
    if (isPremium || effectiveTier === 'basic') {
      const hqErr = validatePositiveInt(holdingQuantity, '持有数量');
      if (hqErr) { setError(hqErr); return; }
      const cpErr = validatePositiveFloat(costPrice, '成本价');
      if (cpErr) { setError(cpErr); return; }
      const mpErr = validatePositiveInt(maxPosition, '最大持仓');
      if (mpErr) { setError(mpErr); return; }
      const holdingInputs = [holdingQuantity, costPrice, maxPosition].map((v) => v.trim());
      const filledCount = holdingInputs.filter(Boolean).length;
      if (filledCount > 0 && filledCount < 3) {
        setError('持仓信息需 3 项一起填写：持有数量、成本价、最大持仓；不填则按空仓处理');
        return;
      }
    }

    const analyzingSymbolVal = symbol.trim().toUpperCase();
    setAnalyzingSymbol(analyzingSymbolVal);
    if (isDesktop && isPremium) {
      // Premium desktop: stay on current panel; result arrives via notification
    } else {
      setActivePanel('loading');
    }
    setError(null);
    setAnalyzeTimedOut(false);
    setMultiPeriodResults([]);
    setResultDisplayTier(tier);

    // For desktop premium: add placeholder entry to sidebar
    const tempId = `pending_${Date.now()}_${analyzingSymbolVal}`;
    if (isDesktop && isPremium) {
      setAnalyzingItems((prev) => [...prev, { tempId, symbol: analyzingSymbolVal }]);
    }

    // ── Frontend 3-minute soft timeout ──────────────────────────────
    const timeoutHandle = setTimeout(() => {
      setAnalyzeTimedOut(true);
    }, 3 * 60 * 1000);

    if (isPremium) {
      setPremiumPendingCount((n) => n + 1);
      if (!isDesktop) {
        showToast(`${analyzingSymbolVal} 已加入分析队列`, 'info');
      }
    } else {
      setIsAnalyzing(true);
    }

    try {
      const request: AnalyzeRequest = {
        symbol: symbol.trim().toUpperCase(),
        market: market as any,
        period: period as any,
        history_days: 90,
        device_id: deviceId,
        holding_quantity: holdingQuantity ? Number(holdingQuantity) : undefined,
        cost_price: costPrice ? Number(costPrice) : undefined,
        max_position: maxPosition ? Number(maxPosition) : undefined,
      };

      const handleAnalysisResult = (taskData: TaskStatusResponse, queuedUsage: AnalyzeQueuedResponse['usage']) => {
        const usedPosition = [holdingQuantity, costPrice, maxPosition].some((v) => v?.trim())
          ? { holdingQuantity, costPrice, maxPosition }
          : null;
        setResult(taskData.result);
        const displayTier = (queuedUsage as any).display_tier ?? effectiveTier;
        setResultDisplayTier(displayTier);
        // Use queued usage immediately for responsive UI, then re-fetch from server to ensure accuracy
        setLimits(queuedUsage);
        if (user) {
          getLimits().then((data) => setLimits({ remaining: data.remaining, daily_limit: data.daily_limit })).catch(() => {});
          // If this was a trial analysis, mark it consumed locally so the UI
          // immediately returns to the user's actual tier without an extra server round-trip.
          if (isRegisteredProTrial) {
            setPendingProTrialConsumed(true);  // 延迟到用户看完结果再降级
          }
        } else if (deviceId) {
          getUsage(deviceId).then((usage) => {
            setLimits({
              remaining: usage.remaining,
              daily_limit: usage.daily_limit ?? (usage.subscription === 'premium' ? 15 : usage.subscription === 'basic' ? 5 : 1),
            });
            if ((usage as any).trial_used) {
              setPendingGuestTrialUsed(true);   // 不立即触发结束界面，等用户看完结果
              setShowTrialWelcome(false);
            }
          }).catch(() => {});
        }
        const nowIso = taskData.analyzed_at || new Date().toISOString();
        setAnalyzeStartedAt(nowIso);
        setResultPositionParams(usedPosition);
        const item = {
          id: String(taskData.result?.history?.id || `${Date.now()}_${symbol.trim()}`),
          symbol: taskData.result?.data?.symbol || symbol.trim().toUpperCase(),
          name: taskData.result?.data?.name || '',
          market: market,
          action: taskData.result?.result?.action,
          confidence: taskData.result?.result?.confidence,
          analyzedAt: nowIso,
          positionParams: usedPosition,
          detail: taskData.result,
        };
        setHistory((prev) => [item, ...prev.filter((h) => h.id !== item.id)].slice(0, 30));
        setSelectedHistoryId(item.id);
        // Remove from analyzing items (desktop sidebar placeholder)
        if (isDesktop && isPremium) {
          setAnalyzingItems((prev) => prev.filter((a) => a.tempId !== tempId));
          setUnreadResults((n) => n + 1);
          showToast(`${item.symbol} 分析完成`, 'ok');
        } else {
          setActivePanel('result');
          setResultSheetOpen(true);
          if (!isDesktop) {
            setUnreadResults((n) => n + 1);
          }
        }
        setActiveTab(0);
      };

      // Submit analysis — returns task_id immediately
      const queued = await analyze(request);
      setLimits(queued.usage);
      clearTimeout(timeoutHandle);

      // Wait for result via SSE (with polling fallback)
      const wsTimeoutHandle = setTimeout(() => setAnalyzeTimedOut(true), 3 * 60 * 1000);

      await new Promise<void>((resolve, reject) => {
        const cleanup = connectTaskSSE(
          queued.task_id,
          (data) => {
            clearTimeout(wsTimeoutHandle);
            cleanup();
            if (data.status === 'failed') {
              reject(new Error(data.error || '分析失败，请重试'));
              return;
            }
            if (data.status === 'done') {
              if (!data.result) {
                reject(new Error('分析结果为空，请重试'));
                return;
              }
              handleAnalysisResult(data, queued.usage);
              resolve();
            }
            if (data.status === 'timeout') {
              reject(new Error('分析超时，请重试'));
            }
          },
          (_err) => {
            // SSE error — fall back to polling
            cleanup();
            const poll = async () => {
              for (let i = 0; i < 60; i++) {
                await new Promise((r) => setTimeout(r, 3000));
                try {
                  const status = await pollTask(queued.task_id);
                  if (status.status === 'done') {
                    clearTimeout(wsTimeoutHandle);
                    handleAnalysisResult(status, queued.usage);
                    resolve();
                    return;
                  }
                  if (status.status === 'failed') {
                    clearTimeout(wsTimeoutHandle);
                    reject(new Error(status.error || '分析失败'));
                    return;
                  }
                } catch {
                  // continue polling
                }
              }
              clearTimeout(wsTimeoutHandle);
              reject(new Error('分析超时，请重试'));
            };
            poll();
          },
        );
      });

      // TODO: multi-period analysis is not yet compatible with the async task model
    } catch (err: any) {

      const status = err?.response?.status;
      const detail = err?.response?.data?.detail;
      const errorCode = typeof detail === 'object' ? detail?.code : null;
      if (errorCode === 'trial_expired') {
        setGuestTrialUsed(true);
        setActivePanel('analyze');
      } else if (errorCode === 'device_banned') {
        setDeviceBanned(true);
        setActivePanel('analyze');
      } else if (status === 401) {
        setError('🔒 登录已过期，请重新登录');
        setTimeout(() => router.push('/login'), 1500);
      } else if (isSystemError(status)) {
        setErrorReport(detail || err?.message || '未知服务器错误');
        setActivePanel('analyze');
      } else {
        const msg = getErrorMessage(err, tier);
        setError(msg);
        showToast(msg, 'error');
        setActivePanel('analyze');
      }
    } finally {
      clearTimeout(timeoutHandle);
      if (isPremium) {
        setPremiumPendingCount((n) => Math.max(0, n - 1));
        setAnalyzingItems((prev) => prev.filter((a) => a.tempId !== tempId));
      } else {
        setIsAnalyzing(false);
      }
    }
  };

  const handleOpenHistoryDetail = (item: any) => {
    if (!item?.detail) return;
    setResult(item.detail);
    setSelectedHistoryId(item.id);
    setError(null);
    setMultiPeriodResults([]);
    setAnalyzeStartedAt(item.analyzedAt || null);
    setResultPositionParams(item.positionParams || null);
    setActivePanel('result');
    setResultSheetOpen(true);
    setActiveTab(0);
  };

  const handleHotStockClick = (stock: typeof HOT_STOCKS[0]) => {
    setMarket(stock.market);
    setSymbol(stock.code);
    setShowHotRecommendations(false);
  };

  const handleRefreshHotRecommendations = () => {
    const next = getMarketRecommendations(market, lastHotRecommendationSignature);
    setHotRecommendations(next);
    setLastHotRecommendationSignature(getRecommendationSignature(next));
  };

  const handleOpenResultPanel = () => { if (result || history.length > 0) setActivePanel('result'); };
  const handleBackToAnalyze = () => {
    setResultSheetOpen(false);
    setActivePanel('analyze');
    setAnalyzeTimedOut(false);
    // Re-sync limits from server to ensure quota state is accurate
    if (user) {
      getLimits().then((data) => setLimits({ remaining: data.remaining, daily_limit: data.daily_limit })).catch(() => {});
    } else if (deviceId) {
      getUsage(deviceId).then((usage) => setLimits({
        remaining: usage.remaining,
        daily_limit: usage.daily_limit ?? (usage.subscription === 'premium' ? 15 : usage.subscription === 'basic' ? 5 : 1),
      })).catch(() => {});
    }
  };
  const handleLogout = () => { logout(); router.push('/login'); };

  const toggleAuxPeriod = (p: string) => {
    setAuxiliaryPeriods((prev) => {
      if (prev.includes(p)) return prev.filter((x) => x !== p);
      if (prev.length >= 3) return prev;
      return [...prev, p];
    });
  };

  // Show spinner while verifying auth + guest usage check
  if (!authChecked || (!user && !guestChecked)) {
    return (
      <div className="app-shell" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <div className="spinner"></div>
      </div>
    );
  }

  // Redirect to login only if guest has no trial and no device (shouldn't normally happen)
  if (!user && !deviceId) {
    router.replace('/login');
    return null;
  }

  const tierLabel = tier === 'free' ? '免费版' : tier === 'basic' ? '标准版' : '专业版';
  const tierDesc = user
    ? (tier === 'free' ? '每天 3 次分析' : tier === 'basic' ? '每天 5 次分析' : '每天 15 次分析，优先通道')
    : '每天 1 次分析（游客）';

  // Deep analysis tabs definition
  const fourStepTabs = [
    { label: '🔍 市场诊断', key: 'market_diagnosis' },
    { label: '🎯 机会评估', key: 'opportunity_assessment' },
    { label: '⚖️ 风险收益', key: 'risk_analysis' },
    { label: '📋 执行方案', key: 'execution_plan' },
  ];
  const hasMultiPeriod = (effectiveTier === 'premium' || effectiveTier === 'basic') && multiPeriodResults.length > 1;
  const allTabs = hasMultiPeriod
    ? [...fourStepTabs, { label: '📊 多周期对比', key: '__multiperiod__' }]
    : fourStepTabs;

  return (
    <div className={`app-shell${isDesktop ? ' desktop-layout' : ''}`}>
      <Toast toast={toast} />
      <ErrorReportDialog error={errorReport} onClose={() => setErrorReport(null)} />
      {/* Registered user daily quota exhausted */}
      {userQuotaExhausted && !guestTrialUsed && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: '#f2f2f7',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', padding: '0 0 40px', overflowY: 'auto',
        }}>
          <div style={{
            width: '100%', maxWidth: 480,
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            padding: '48px 16px 24px', textAlign: 'center',
          }}>
            <div style={{
              width: 80, height: 80,
              background: 'linear-gradient(145deg, #007aff, #5856d6)',
              borderRadius: 20, display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 40, boxShadow: '0 8px 24px rgba(0,122,255,0.3)', marginBottom: 16,
            }}>📈</div>
            <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.5px', color: '#000', margin: '0 0 6px' }}>{appName}</h1>
            <p style={{ fontSize: 15, color: '#8e8e93', margin: 0 }}>AI 驱动的专业技术分析平台</p>
          </div>
          <div style={{ width: '100%', maxWidth: 480, padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ background: 'white', borderRadius: 20, overflow: 'hidden', boxShadow: '0 2px 16px rgba(0,0,0,0.08)' }}>
              <div style={{ background: 'linear-gradient(135deg, #1c1c1e 0%, #2c2c2e 100%)', padding: '20px 24px', textAlign: 'center' }}>
                <div style={{ fontSize: 32, marginBottom: 10 }}>🌙</div>
                <h2 style={{ fontSize: 20, fontWeight: 700, color: '#fff', margin: '0 0 4px', letterSpacing: '-0.3px' }}>今日额度已用完</h2>
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', margin: 0 }}>明天 0 点自动重置，明天再来</p>
              </div>
              <div style={{ padding: '16px 20px 20px' }}>
                <p style={{ fontSize: 14, color: '#3c3c43', margin: '0 0 16px', lineHeight: 1.6 }}>
                  升级套餐可获得更多每日分析次数，专业版每天最多 15 次。
                </p>
                <a href="/upgrade?plan=basic" style={{
                  display: 'block', width: '100%', height: 50, lineHeight: '50px',
                  background: '#007aff', color: 'white', borderRadius: 12,
                  fontSize: 17, fontWeight: 600, textDecoration: 'none', textAlign: 'center',
                  boxShadow: '0 4px 16px rgba(0,122,255,0.3)', marginBottom: 10,
                }}>升级获取更多次数</a>
                <button
                  onClick={() => setUserQuotaExhausted(false)}
                  style={{
                    width: '100%', height: 44, background: 'none', border: 'none',
                    color: '#007aff', fontSize: 15, fontWeight: 500, cursor: 'pointer',
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >明天再来 →</button>
              </div>
            </div>
          </div>
        </div>
      )}
      <ProTrialWelcomeModal
        open={showTrialWelcome}
        appName={appName}
        onConfirm={() => { setShowTrialWelcome(false); setGuestTrialConfirmed(true); }}
        title={appConfig?.trial_modal_title}
        subtitle={appConfig?.trial_modal_subtitle}
        perksLabel={appConfig?.trial_modal_perks_label}
        perks={appConfig?.trial_modal_perks}
        buttonText={appConfig?.trial_modal_button}
      />
      {/* Guest trial ended - shows on both desktop and mobile */}
      <GuestTrialEndedScreen
        open={!user && guestTrialUsed && !deviceBanned}
        banned={deviceBanned}
        appName={appName}
        onRegister={() => router.push('/register')}
        onClose={() => router.push('/')}
      />

      {/* ═══ MOBILE VIEW (hidden on desktop) ═══ */}
      {!isDesktop && (
        <MobileView
          appName={appName}
          user={user}
          tier={tier}
          effectiveTier={effectiveTier}
          isRegisteredProTrial={isRegisteredProTrial}
          isGuestTrial={isGuestTrial}
          tierLabel={tierLabel}
          limits={limits}
          pricing={pricing}
          appConfig={appConfig}
          activePanel={activePanel}
          result={result}
          error={error}
          isAnalyzing={isAnalyzing}
          analyzeTimedOut={analyzeTimedOut}
          analyzingSymbol={analyzingSymbol}
          analyzeStartedAt={analyzeStartedAt}
          premiumPendingCount={premiumPendingCount}
          narrativeIdx={narrativeIdx}
          NARRATIVE_TEXTS={NARRATIVE_TEXTS}
          selectedHistoryId={selectedHistoryId}
          resultDisplayTier={resultDisplayTier}
          resultPositionParams={resultPositionParams}
          symbol={symbol}
          market={market}
          period={period}
          holdingQuantity={holdingQuantity}
          costPrice={costPrice}
          maxPosition={maxPosition}
          symbolWarning={symbolWarning}
          multiPeriodEnabled={multiPeriodEnabled}
          auxiliaryPeriods={auxiliaryPeriods}
          premiumInputsOpen={premiumInputsOpen}
          hotRecommendations={hotRecommendations}
          shareLoading={shareLoading}
          saveLongLoading={saveLongLoading}
          shareConfirmOpen={shareConfirmOpen}
          sharePendingLongImage={sharePendingLongImage}
          showUpgradeBanner={showUpgradeBanner}
          userMenuOpen={userMenuOpen}
          historySheetOpen={historySheetOpen}
          resultSheetOpen={resultSheetOpen}
          guestTrialUsed={guestTrialUsed}
          deviceBanned={deviceBanned}
          history={history}
          allTabs={allTabs}
          activeTab={activeTab}
          multiPeriodResults={multiPeriodResults}
          unreadResults={unreadResults}
          onAnalyze={handleAnalyze}
          onBackToAnalyze={handleBackToAnalyze}
          onOpenHistoryDetail={handleOpenHistoryDetail}
          setSymbol={setSymbol}
          setMarket={setMarket}
          setPeriod={setPeriod}
          setHoldingQuantity={setHoldingQuantity}
          setCostPrice={setCostPrice}
          setMaxPosition={setMaxPosition}
          setMultiPeriodEnabled={(v) => { setMultiPeriodEnabled(v); if (!v) setAuxiliaryPeriods([]); }}
          toggleAuxPeriod={toggleAuxPeriod}
          setPremiumInputsOpen={setPremiumInputsOpen}
          setActivePanel={setActivePanel}
          setActiveTab={setActiveTab}
          setResult={setResult}
          setResultPositionParams={setResultPositionParams}
          setUserMenuOpen={setUserMenuOpen}
          setHistorySheetOpen={setHistorySheetOpen}
          setResultSheetOpen={setResultSheetOpen}
          setSelectedHistoryId={setSelectedHistoryId}
          setUnreadResults={setUnreadResults}
          onShare={() => handleShareViralCard()}
          onSave={handleBookmark}
          generateShareCard={generateShareCard}
          setShareConfirmOpen={setShareConfirmOpen}
          onLogout={handleLogout}
          setSavedRecordsOpen={setSavedRecordsOpen}
          onNavigate={(path) => router.push(path)}
          sanitizeSymbol={sanitizeSymbol}
          isSavedRecord={isSavedRecord}
          onRefreshHotStocks={handleRefreshHotRecommendations}
        />
      )}

      {/* ═══ DESKTOP Header (hidden on mobile) ═══ */}
      <header className="app-header desktop-only">
        <div className="container app-header-inner">
          <h1 style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>
            📈 {appName}
          </h1>
          <div className="app-header-actions">
            <span className={`badge badge-${tier}`}>{tierLabel}</span>
            <span style={{ fontSize: '0.875rem' }}>
              剩余: {limits?.remaining ?? '-'} / {limits?.daily_limit ?? '-'} 次
            </span>
            {user ? (
              <>
                <button onClick={() => router.push('/account')} className="btn btn-secondary" style={{ padding: '0.375rem 0.75rem', fontSize: '0.75rem' }}>账号</button>
                {effectiveTier !== 'premium' && (
                  <button onClick={() => router.push('/upgrade')} style={{ padding: '0.375rem 0.75rem', fontSize: '0.75rem', background: '#f59e0b', color: 'white', border: 'none', borderRadius: '0.375rem', cursor: 'pointer' }}>升级</button>
                )}
                <button onClick={handleLogout} className="btn btn-secondary" style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}>退出</button>
              </>
            ) : (
              <>
                <button onClick={() => router.push('/login')} className="btn btn-secondary" style={{ padding: '0.375rem 0.75rem', fontSize: '0.75rem' }}>登录</button>
                <button onClick={() => router.push('/register')} className="btn btn-primary" style={{ padding: '0.375rem 0.75rem', fontSize: '0.75rem' }}>注册</button>
              </>
            )}
          </div>
        </div>
      </header>


      {/* ═══ SHARE PREVIEW SHEET (mobile only) ═══ */}
      {!isDesktop && (
        <SharePreviewSheet
          isOpen={sharePreviewOpen}
          blob={sharePreviewBlob}
          filename={sharePreviewFilename}
          onClose={() => setSharePreviewOpen(false)}
          actionColor={sharePreviewActionColor}
          isDesktop={isDesktop}
          stockMeta={sharePreviewStockMeta ?? undefined}
          archiveBlob={sharePreviewArchiveBlob}
          archiveFilename={sharePreviewArchiveFilename}
          analyzedAt={sharePreviewAnalyzedAt}
          onRequestArchive={async () => {
            if (shareCardParams && !sharePreviewArchiveBlob) {
              const archiveResult = await generatePredictionCardBlob(shareCardParams);
              setSharePreviewArchiveBlob(archiveResult.blob);
              setSharePreviewArchiveFilename(archiveResult.filename);
            }
          }}
        />
      )}

      <SavedRecordsSheet
        isOpen={savedRecordsOpen}
        records={savedRecords}
        onClose={() => setSavedRecordsOpen(false)}
        onOpenRecord={(rec) => {
          if (rec.detail) {
            setResult(rec.detail);
            setAnalyzeStartedAt(rec.analyzedAt);
            setSelectedHistoryId(rec.id);
            setResultSheetOpen(true);
            setActivePanel('result');
          }
        }}
        onDeleteRecord={(id) => {
          setSavedRecords(prev => {
            const next = prev.filter(r => r.id !== id);
            try { localStorage.setItem('saved_records_v2', JSON.stringify(next)); } catch { /* ignore */ }
            return next;
          });
        }}
      />

      {/* ═══ DESKTOP VIEW (≥1024px) ═══ */}
      {isDesktop && (
        <DesktopView
          appName={appName}
          user={user}
          tier={tier}
          effectiveTier={effectiveTier}
          isRegisteredProTrial={isRegisteredProTrial}
          isGuestTrial={isGuestTrial}
          tierLabel={tierLabel}
          limits={limits}
          pricing={pricing}
          appConfig={appConfig}
          activePanel={activePanel}
          result={result}
          error={error}
          isAnalyzing={isAnalyzing}
          analyzeTimedOut={analyzeTimedOut}
          analyzingSymbol={analyzingSymbol}
          analyzeStartedAt={analyzeStartedAt}
          premiumPendingCount={premiumPendingCount}
          narrativeIdx={narrativeIdx}
          NARRATIVE_TEXTS={NARRATIVE_TEXTS}
          selectedHistoryId={selectedHistoryId}
          resultDisplayTier={resultDisplayTier}
          symbol={symbol}
          market={market}
          period={period}
          holdingQuantity={holdingQuantity}
          costPrice={costPrice}
          maxPosition={maxPosition}
          symbolWarning={symbolWarning}
          multiPeriodEnabled={multiPeriodEnabled}
          auxiliaryPeriods={auxiliaryPeriods}
          premiumInputsOpen={premiumInputsOpen}
          hotRecommendations={hotRecommendations}
          shareLoading={shareLoading}
          sharePreviewOpen={sharePreviewOpen}
          sharePreviewBlob={sharePreviewBlob}
          sharePreviewFilename={sharePreviewFilename}
          sharePreviewArchiveBlob={sharePreviewArchiveBlob}
          sharePreviewArchiveFilename={sharePreviewArchiveFilename}
          sharePreviewActionColor={sharePreviewActionColor}
          sharePreviewStockMeta={sharePreviewStockMeta ?? undefined}
          onSharePreviewClose={() => setSharePreviewOpen(false)}
          onShare={() => handleShareViralCard()}
          onRequestArchive={async () => {
            if (shareCardParams && !sharePreviewArchiveBlob) {
              const r = await generateDesktopPredictionCardBlob(shareCardParams);
              setSharePreviewArchiveBlob(r.blob);
              setSharePreviewArchiveFilename(r.filename);
            }
          }}
          dtUserMenuOpen={dtUserMenuOpen}
          dtUserBtnRef={dtUserBtnRef}
          dtPopoverRef={dtPopoverRef}
          history={history}
          analyzingItems={analyzingItems}
          allTabs={allTabs}
          activeTab={activeTab}
          multiPeriodResults={multiPeriodResults}
          hasMultiPeriod={hasMultiPeriod}
          savedRecords={savedRecords}
          onAnalyze={handleAnalyze}
          onBackToAnalyze={handleBackToAnalyze}
          onOpenHistoryDetail={handleOpenHistoryDetail}
          setSymbol={setSymbol}
          setMarket={setMarket}
          setPeriod={setPeriod}
          setHoldingQuantity={setHoldingQuantity}
          setCostPrice={setCostPrice}
          setMaxPosition={setMaxPosition}
          setMultiPeriodEnabled={(v) => { setMultiPeriodEnabled(v); if (!v) setAuxiliaryPeriods([]); }}
          toggleAuxPeriod={toggleAuxPeriod}
          setPremiumInputsOpen={setPremiumInputsOpen}
          setActivePanel={setActivePanel}
          setActiveTab={setActiveTab}
          onBookmark={handleBookmark}
          setDtUserMenuOpen={setDtUserMenuOpen}
          onLogout={handleLogout}
          setSavedRecordsOpen={setSavedRecordsOpen}
          onNavigate={(path) => router.push(path)}
          sanitizeSymbol={sanitizeSymbol}
          isSavedRecord={isSavedRecord}
          onRefreshHotStocks={handleRefreshHotRecommendations}
        />
      )}


    </div>
  );
}
