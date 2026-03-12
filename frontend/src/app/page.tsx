'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore, useAnalysisStore } from '@/lib/store';
import {
  analyze,
  connectTaskWebSocket,
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
} from '@/lib/api';

import { generateShareCardBlob, generatePredictionCardBlob, generateStatementCardBlob, downloadBlob } from '@/lib/shareCard';
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
import BottomNav from '@/components/BottomNav';
import UserMenuSheet from '@/components/UserMenuSheet';
import MarketSegmented from '@/components/MarketSegmented';
import HotStocksStrip from '@/components/HotStocksStrip';
import AdvancedSettingsPanel from '@/components/AdvancedSettingsPanel';
import UpgradeTeaser from '@/components/UpgradeTeaser';
import SignalHero from '@/components/SignalHero';
import ResultTabs from '@/components/ResultTabs';
import MultiPeriodCards from '@/components/MultiPeriodCards';
import UpgradeNudge from '@/components/UpgradeNudge';
import HistorySheet from '@/components/HistorySheet';
import BottomSheet from '@/components/BottomSheet';
import ResultSheet from '@/components/ResultSheet';
import SharePreviewSheet from '@/components/SharePreviewSheet';
import SavedRecordsSheet from '@/components/SavedRecordsSheet';
import GuestTrialEndedScreen from '@/components/GuestTrialEndedScreen';
import ProTrialWelcomeModal from '@/components/ProTrialWelcomeModal';


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
  if (a === 'buy' || a === '买入') return { text: '买入', color: '#ef4444' };
  if (a === 'sell' || a === '卖出') return { text: '卖出', color: '#22c55e' };
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
  // Free/basic registered users who haven't used their one-time pro trial yet
  // are treated as premium in the UI so they can access all premium features.
  const isRegisteredProTrial = user !== null && (tier === 'free' || tier === 'basic') && !user.has_had_pro_trial && !proTrialConsumed;
  const [resultDisplayTier, setResultDisplayTier] = useState<string>(tier);
  const [guestTrialUsed, setGuestTrialUsed] = useState(false);
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

  const isSavedRecord = (id: string) => savedRecords.some(r => r.id === id);

  const handleBookmark = () => {
    if (!result) return;
    const r = result.result ?? {};
    const d = result.data ?? {};
    const id = selectedHistoryId ?? `${d.symbol ?? ''}_${analyzeStartedAt ?? Date.now()}`;

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
      const socialResult = await generateStatementCardBlob(cardParams);

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

      const { blob, filename } = await generateShareCardBlob({
        result: activeResult,
        tier,
        basicDailyLimit: pricing?.basic?.daily_limit ?? 5,
        analyzedAt: activeAnalyzedAt,
        appName: appName,
        includePosition,
        longImage,
        positionParams: resultPositionParams,
      });
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

  useEffect(() => {
    if (symbol && market) {
      setMarketData(null);
      setMarketDataLoading(true);
      getMarketData(market, symbol, period, 30)
        .then((data) => { setMarketData(data); setMarketDataLoading(false); })
        .catch(() => { setMarketData(null); setMarketDataLoading(false); });
    } else {
      setMarketData(null);
      setMarketDataLoading(false);
    }
  }, [symbol, market, period]);

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

  const handleAnalyze = async () => {
    // ── Guest trial/ban — GuestTrialEndedScreen shows automatically via open prop ──
    if (!user && (guestTrialUsed || deviceBanned)) return;

    // ── Client-side validation ──────────────────────────────────────
    const symErr = validateSymbol(symbol, market);
    if (symErr) { setError(symErr); return; }
    if (!marketDataLoading && !marketData) {
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

    setAnalyzingSymbol(symbol.trim().toUpperCase());
    setActivePanel('loading');
    setError(null);
    setAnalyzeTimedOut(false);
    setMultiPeriodResults([]);
    setResultDisplayTier(tier);

    // ── Frontend 3-minute soft timeout ──────────────────────────────
    const timeoutHandle = setTimeout(() => {
      setAnalyzeTimedOut(true);
    }, 3 * 60 * 1000);

    if (isPremium) {
      setPremiumPendingCount((n) => n + 1);
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
        const displayTier = (queuedUsage as any).display_tier ?? tier;
        setResultDisplayTier(displayTier);
        // Use queued usage immediately for responsive UI, then re-fetch from server to ensure accuracy
        setLimits(queuedUsage);
        if (user) {
          getLimits().then((data) => setLimits({ remaining: data.remaining, daily_limit: data.daily_limit })).catch(() => {});
          // If this was a trial analysis, mark it consumed locally so the UI
          // immediately returns to the user's actual tier without an extra server round-trip.
          if (isRegisteredProTrial) {
            setProTrialConsumed(true);
          }
        } else if (deviceId) {
          getUsage(deviceId).then((usage) => {
            setLimits({
              remaining: usage.remaining,
              daily_limit: usage.daily_limit ?? (usage.subscription === 'premium' ? 15 : usage.subscription === 'basic' ? 5 : 1),
            });
            if ((usage as any).trial_used) {
              setGuestTrialUsed(true);
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
        setActivePanel('result');
        setResultSheetOpen(true);
        setActiveTab(0);
      };

      // Submit analysis — returns task_id immediately
      const queued = await analyze(request);
      setLimits(queued.usage);
      clearTimeout(timeoutHandle);

      // Wait for result via WebSocket (with polling fallback)
      const wsTimeoutHandle = setTimeout(() => setAnalyzeTimedOut(true), 3 * 60 * 1000);

      await new Promise<void>((resolve, reject) => {
        const cleanup = connectTaskWebSocket(
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
            // WebSocket error — fall back to polling
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
    <div className="app-shell">
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

      {/* ═══ MOBILE Header (hidden on desktop) ═══ */}
      <header className="app-header mobile-only" style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 16px', height: 'var(--header-h-mobile)', position: 'sticky', top: 0,
        zIndex: 100, background: 'rgba(249,249,249,0.94)',
        backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '0.5px solid rgba(0,0,0,0.12)',
      }}>
        {activePanel === 'result' ? (
          /* ── Results panel: title-mode header ── */
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '20px', fontWeight: 700, letterSpacing: '-0.5px', color: '#1c1c1e' }}>
                研判记录
              </span>
              {history.length > 0 && (
                <span style={{
                  fontSize: '11px', fontWeight: 700, color: '#fff',
                  background: '#aeaeb2', borderRadius: '9999px',
                  padding: '1px 7px', lineHeight: 1.6,
                }}>
                  {history.length}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setActivePanel('analyze')}
              style={{
                display: 'flex', alignItems: 'center', gap: '3px',
                padding: '7px 15px 7px 11px', background: '#007aff', color: 'white',
                border: 'none', borderRadius: '20px', fontSize: '15px', fontWeight: 600,
                cursor: 'pointer', letterSpacing: '-0.2px', WebkitTapHighlightColor: 'transparent',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M7 1v12M1 7h12" stroke="white" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              新分析
            </button>
          </>
        ) : (
          /* ── Default: app identity ── */
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {/* R6: SVG candlestick icon — replacing emoji */}
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                <rect x="2" y="9" width="5" height="7" rx="1.5" fill="#dc2626" />
                <line x1="4.5" y1="6" x2="4.5" y2="9" stroke="#dc2626" strokeWidth="1.5" strokeLinecap="round"/>
                <line x1="4.5" y1="16" x2="4.5" y2="19" stroke="#dc2626" strokeWidth="1.5" strokeLinecap="round"/>
                <rect x="8.5" y="4" width="5" height="11" rx="1.5" fill="#34c759" />
                <line x1="11" y1="1.5" x2="11" y2="4" stroke="#34c759" strokeWidth="1.5" strokeLinecap="round"/>
                <line x1="11" y1="15" x2="11" y2="17.5" stroke="#34c759" strokeWidth="1.5" strokeLinecap="round"/>
                <rect x="15" y="7" width="5" height="8" rx="1.5" fill="#dc2626" />
                <line x1="17.5" y1="4" x2="17.5" y2="7" stroke="#dc2626" strokeWidth="1.5" strokeLinecap="round"/>
                <line x1="17.5" y1="15" x2="17.5" y2="18" stroke="#dc2626" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              <span style={{ fontSize: '15px', fontWeight: 700, letterSpacing: '-0.2px', color: '#000' }}>{appName}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{
                fontSize: '12px', fontWeight: 500,
                color: effectiveTier === 'premium' ? '#7c3aed' : effectiveTier === 'basic' ? '#007aff' : '#8e8e93',
              }}>
                {(isRegisteredProTrial || isGuestTrial) ? '专业版体验' : tierLabel} · {limits?.remaining ?? '-'}次
              </span>
              {user ? (
                <button
                  onClick={() => setUserMenuOpen(true)}
                  aria-label="用户菜单"
                  style={{
                    width: 32, height: 32, borderRadius: '50%',
                    background: '#e9e9eb', border: 'none',
                    cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    WebkitTapHighlightColor: 'transparent', flexShrink: 0, color: '#3c3c43',
                  }}
                >
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                  </svg>
                </button>
              ) : (
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <button
                    onClick={() => router.push('/login')}
                    style={{ fontSize: '15px', fontWeight: 400, color: '#007aff', background: 'none', border: 'none', cursor: 'pointer', padding: '6px 4px', WebkitTapHighlightColor: 'transparent' }}
                  >登录</button>
                  <button
                    onClick={() => router.push('/register')}
                    style={{
                      fontSize: '13px', fontWeight: 600, color: 'white',
                      background: '#007aff', border: 'none', borderRadius: '8px',
                      padding: '6px 12px', cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
                    }}
                  >注册</button>
                </div>
              )}
            </div>
          </>
        )}
      </header>

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

      {/* ═══ User Menu Sheet (mobile) ═══ */}
      <UserMenuSheet
        isOpen={userMenuOpen}
        onClose={() => setUserMenuOpen(false)}
        user={user}
        tier={tier}
        onAccount={() => router.push('/account')}
        onUpgrade={() => router.push('/upgrade')}
        onLogout={handleLogout}
        onLogin={() => router.push('/login')}
        onSavedRecords={() => { setUserMenuOpen(false); setSavedRecordsOpen(true); }}
        onRegister={() => router.push('/register')}
      />

      <main className="container app-main">
        <div
          className="app-main-grid"
          style={{
            display: 'grid',
            gap: '1.5rem',
            gridTemplateColumns: 'minmax(0, 1fr)',
            maxWidth: activePanel === 'analyze' || activePanel === 'loading' ? '820px' : '980px',
            margin: '0 auto',
          }}
        >
          {/* ═══ ANALYZE PANEL ═══ */}
          {activePanel === 'analyze' && !user && (guestTrialUsed || deviceBanned) && (
            <div style={{ minWidth: 0, width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '32px 16px 16px', gap: 12 }}>
              <div style={{ width: '100%', maxWidth: 480, background: 'white', borderRadius: 20, overflow: 'hidden', boxShadow: '0 2px 16px rgba(0,0,0,0.08)' }}>
                <div style={{ background: 'linear-gradient(135deg, #1c1c1e 0%, #2c2c2e 100%)', padding: '20px 24px', textAlign: 'center' }}>
                  <div style={{ fontSize: 32, marginBottom: 10 }}>{deviceBanned ? '🚫' : '⏳'}</div>
                  <h2 style={{ fontSize: 20, fontWeight: 700, color: '#fff', margin: '0 0 4px', letterSpacing: '-0.3px' }}>
                    {deviceBanned ? '此设备已被限制' : (appConfig?.trial_ended_title || '专业版体验已结束')}
                  </h2>
                  <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', margin: 0 }}>
                    {deviceBanned ? '如有疑问，请联系管理员' : (appConfig?.trial_ended_subtitle || '游客仅限一次免费体验')}
                  </p>
                </div>
                {!deviceBanned && (
                  <div style={{ padding: '16px 20px 20px' }}>
                    <p style={{ fontSize: 12, fontWeight: 600, color: '#8e8e93', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 12px' }}>
                      {appConfig?.trial_ended_perks_label || '注册账号，每天继续使用'}
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
                      {(appConfig?.trial_ended_perks || [
                        { icon: '📊', text: '每天 1 次免费深度研判' },
                        { icon: '☁', text: '跨设备同步，数据不丢失' },
                        { icon: '★', text: '邀请好友获得额外永久额度' },
                      ]).map((p: any, i: number) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0, background: ['linear-gradient(135deg,#007aff,#3b9eff)','linear-gradient(135deg,#34c759,#30d158)','linear-gradient(135deg,#ff9500,#ffcc02)'][i%3], display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, color: 'white', fontWeight: 700 }}>{p.icon}</div>
                          <p style={{ fontSize: 14, color: '#1c1c1e', margin: 0, fontWeight: 500 }}>{p.text}</p>
                        </div>
                      ))}
                    </div>
                    <button onClick={() => router.push('/register')} style={{ width: '100%', height: 50, background: '#007aff', color: 'white', border: 'none', borderRadius: 12, fontSize: 17, fontWeight: 600, cursor: 'pointer', WebkitTapHighlightColor: 'transparent', marginBottom: 10, boxShadow: '0 4px 16px rgba(0,122,255,0.3)' }}>
                      {appConfig?.trial_ended_register_button || '免费注册，继续使用'}
                    </button>
                    <a href="/login" style={{ display: 'block', width: '100%', height: 44, color: '#007aff', fontSize: 15, fontWeight: 500, textDecoration: 'none', lineHeight: '44px', textAlign: 'center' }}>已有账号？登录</a>
                  </div>
                )}
              </div>
              {result && (
                <button onClick={() => setActivePanel('result')} style={{ fontSize: 15, color: '#007aff', fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer', padding: '8px 0' }}>
                  查看上次分析结果 →
                </button>
              )}
            </div>
          )}
          {activePanel === 'analyze' && (user || (!guestTrialUsed && !deviceBanned)) && (
            <div style={{ minWidth: 0, width: '100%', overflow: 'hidden' }}>
              <div className="card mobile-card-padless mb-3" style={{ marginTop: '0' }}>
                {/* ── Desktop content — all original form layout ── */}
                <div className="desktop-only" style={{ padding: '1.25rem 1.125rem', flexDirection: 'column', width: '100%' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '1.5rem', position: 'relative' }}>
                    <h2 style={{ fontSize: '1.125rem', fontWeight: '600' }}>分析</h2>
                  </div>
                  <div className="form-group">
                    <label className="label">市场</label>
                    <select className="select" value={market} onChange={(e) => setMarket(e.target.value)}>
                      <option value="a">A股</option>
                      <option value="hk" disabled={effectiveTier === 'free'}>港股{effectiveTier === 'free' ? '（基础版起）' : ''}</option>
                      <option value="us" disabled={effectiveTier === 'free'}>美股{effectiveTier === 'free' ? '（基础版起）' : ''}</option>
                      <option value="futures" disabled={effectiveTier === 'free'}>期货{effectiveTier === 'free' ? '（基础版起）' : ''}</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                      <label className="label" style={{ marginBottom: 0 }}>
                        {market === 'a' ? '股票代码' : market === 'hk' ? '港股代码' : market === 'us' ? '美股代码' : '期货代码'}
                      </label>
                      <div style={{ gap: '0.35rem', display: 'flex' }}>
                        <button type="button" className="btn btn-secondary" style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem', minHeight: 'auto' }} onClick={() => setShowHotRecommendations((v) => !v)}>
                          热门推荐
                        </button>
                        {showHotRecommendations && (
                          <button type="button" className="btn btn-secondary" style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem', minHeight: 'auto' }} onClick={handleRefreshHotRecommendations}>
                            刷新
                          </button>
                        )}
                      </div>
                    </div>
                    <input
                      type="text"
                      className="input"
                      placeholder={market === 'a' ? '如: 600519' : market === 'hk' ? '如: 00700' : market === 'us' ? '如: AAPL' : '如: MA'}
                      value={symbol}
                      onChange={(e) => setSymbol(sanitizeSymbol(e.target.value))}
                    />
                    {symbolWarning && symbol.trim() && (
                      <p style={{ fontSize: '0.8rem', color: '#b45309', marginTop: '0.4rem' }}>⚠️ {symbolWarning}</p>
                    )}
                    {marketDataLoading && symbol.trim() && !symbolWarning && (
                      <p style={{ fontSize: '0.8rem', color: '#8e8e93', marginTop: '0.4rem' }}>正在查询行情数据…</p>
                    )}
                    {!marketDataLoading && !marketData && symbol.trim() && !symbolWarning && (
                      <p style={{ fontSize: '0.8rem', color: '#ff3b30', marginTop: '0.4rem' }}>⚠️ 未找到该代码的行情数据，请确认代码正确</p>
                    )}
                    {marketData && !symbolWarning && (
                      <p style={{ fontSize: '0.875rem', color: 'var(--success)', marginTop: '0.5rem' }}>✓ 找到 {marketData.count} 条数据</p>
                    )}
                    {showHotRecommendations && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem', marginTop: '0.6rem', padding: '0.5rem', border: '1px dashed var(--border)', borderRadius: '0.5rem', background: '#f8fafc' }}>
                        {hotRecommendations.map((stock) => (
                          <button key={`${stock.market}_${stock.code}`} type="button" onClick={() => handleHotStockClick(stock)} style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem', border: '1px solid var(--border)', borderRadius: '9999px', background: 'white', cursor: 'pointer' }}>
                            {stock.name}({stock.code})
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="form-group">
                    <label className="label">周期</label>
                    <select className="select" value={period} onChange={(e) => setPeriod(e.target.value)}>
                      <option value="daily">日线</option>
                      <option value="60">60分钟</option>
                      <option value="30">30分钟</option>
                      <option value="15">15分钟</option>
                      <option value="5">5分钟</option>
                      <option value="1">1分钟</option>
                    </select>
                  </div>
                  <div className="form-group" style={{ marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <input type="checkbox" id="multi-period-toggle-d" checked={multiPeriodEnabled} disabled={effectiveTier === 'free'} onChange={(e) => { setMultiPeriodEnabled(e.target.checked); if (!e.target.checked) setAuxiliaryPeriods([]); }} style={{ width: '1rem', height: '1rem', cursor: effectiveTier === 'free' ? 'not-allowed' : 'pointer' }} />
                      <label htmlFor="multi-period-toggle-d" style={{ fontSize: '0.875rem', fontWeight: 500, cursor: effectiveTier === 'free' ? 'not-allowed' : 'pointer', color: effectiveTier === 'free' ? 'var(--muted)' : undefined }} title={effectiveTier === 'free' ? '基础版起可用' : undefined}>
                        多周期分析{effectiveTier === 'free' && <span style={{ marginLeft: '0.35rem', fontSize: '0.75rem' }}>(基础版起可用)</span>}
                      </label>
                    </div>
                    {multiPeriodEnabled && effectiveTier !== 'free' && (
                      <div style={{ marginTop: '0.6rem', padding: '0.6rem', background: '#f8fafc', borderRadius: '0.5rem', border: '1px solid var(--border)' }}>
                        <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginBottom: '0.4rem' }}>选择辅助周期（最多3个）：</p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                          {Object.entries(PERIOD_LABELS).filter(([k]) => k !== period).map(([k, label]) => {
                            const selected = auxiliaryPeriods.includes(k);
                            const disabled = !selected && auxiliaryPeriods.length >= 3;
                            return (
                              <button key={k} type="button" onClick={() => !disabled && toggleAuxPeriod(k)} style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem', borderRadius: '9999px', border: `1px solid ${selected ? 'var(--primary)' : 'var(--border)'}`, background: selected ? 'var(--primary)' : 'white', color: selected ? 'white' : undefined, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1 }}>
                                {label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                  <div style={{ border: '1px solid #f59e0b', background: '#fffbeb', borderRadius: '0.75rem', padding: '0.9rem', marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#92400e', background: '#fde68a', padding: '0.2rem 0.5rem', borderRadius: '9999px' }}>专业版特别功能</span>
                        {(effectiveTier === 'basic' || effectiveTier === 'premium') && (
                          <span style={{ fontSize: '0.75rem', color: '#92400e' }}>
                            {([holdingQuantity, costPrice, maxPosition].filter((v) => v.trim()).length === 0) ? '当前：空仓模式' : '当前：已填写持仓参数'}
                          </span>
                        )}
                      </div>
                      {effectiveTier === 'premium' ? (
                        <button className="btn btn-secondary" style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem', minWidth: '72px' }} onClick={() => setPremiumInputsOpen((v) => !v)}>
                          {premiumInputsOpen ? '收起模块' : '展开模块'}
                        </button>
                      ) : (
                        <button className="btn btn-secondary" style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem', minWidth: '72px' }} onClick={() => router.push('/upgrade')}>升级解锁</button>
                      )}
                    </div>
                    <p style={{ fontSize: '0.875rem', margin: 0, lineHeight: '1.6' }}>
                      🚀 专业版支持连续多次单条查询；每次分析开始后可立即再次点击"开始分析"，并在右侧历史中回看详细结果。
                    </p>
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.6rem' }}>
                      <span style={{ fontSize: '0.75rem', color: '#92400e', background: '#fef3c7', padding: '0.15rem 0.5rem', borderRadius: '9999px' }}>多次连续提交</span>
                      <span style={{ fontSize: '0.75rem', color: '#92400e', background: '#fef3c7', padding: '0.15rem 0.5rem', borderRadius: '9999px' }}>历史回看详情</span>
                      <span style={{ fontSize: '0.75rem', color: '#92400e', background: '#fef3c7', padding: '0.15rem 0.5rem', borderRadius: '9999px' }}>持仓参数可选</span>
                    </div>
                    {(effectiveTier === 'basic' || effectiveTier === 'premium') && premiumInputsOpen && (
                      <div style={{ marginTop: '0.85rem' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
                          <div className="form-group"><label className="label">持有数量(股)</label><input className="input" inputMode="numeric" value={holdingQuantity} onChange={(e) => setHoldingQuantity(e.target.value.replace(/\D/g, '').slice(0, 10))} /></div>
                          <div className="form-group"><label className="label">成本价</label><input className="input" inputMode="decimal" value={costPrice} onChange={(e) => { const v = e.target.value.replace(/[^\d.]/g, ''); const parts = v.split('.'); setCostPrice(parts.length > 2 ? parts[0] + '.' + parts.slice(1).join('') : v.slice(0, 15)); }} /></div>
                          <div className="form-group"><label className="label">最大持仓(股)</label><input className="input" inputMode="numeric" value={maxPosition} onChange={(e) => setMaxPosition(e.target.value.replace(/\D/g, '').slice(0, 10))} /></div>
                        </div>
                        <p style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: '0.25rem' }}>3项都不填=默认空仓；若填写则3项必须全部填写。</p>
                      </div>
                    )}
                  </div>
                  {error && <div className="error">{error}</div>}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <button className="btn btn-primary" style={{ width: '100%', marginTop: '1rem' }} onClick={handleAnalyze} disabled={!symbol.trim()}>
                      {effectiveTier === 'premium' && premiumPendingCount > 0 ? `开始分析（进行中 ${premiumPendingCount}）` : '开始分析'}
                    </button>
                    {result && (
                      <button className="btn btn-secondary" style={{ width: '100%' }} onClick={handleOpenResultPanel}>
                        查看结果
                      </button>
                    )}
                  </div>
                </div>

                {/* ── Mobile layout: context-switches on quota state ── */}
                <div className="mobile-only" style={{ flexDirection: 'column', width: '100%' }}>
                  {showUpgradeBanner ? (
                    /* ══════════════════════════════════════════════════════
                       QUOTA EXHAUSTED: focused upgrade gate — Jobs principle:
                       one screen, one job, zero distractions.
                       Fixed inset fills exactly header→bottom-nav, bypasses
                       body padding-bottom so no gray void appears.
                       ══════════════════════════════════════════════════════ */
                    <div style={{
                      position: 'fixed',
                      top: 'var(--header-h-mobile, 52px)',
                      left: 0,
                      right: 0,
                      bottom: 'var(--bottom-nav-h, 56px)',
                      overflowY: 'auto',
                      background: 'transparent',
                      display: 'flex',
                      flexDirection: 'column',
                      zIndex: 10,
                    }}>
                    {effectiveTier === 'premium' ? (
                      /* ══════════════════════════════════════════
                         PREMIUM TIER: daily limit reached, reset tomorrow
                         No upsell — affirming, calm, informative
                         ══════════════════════════════════════════ */
                      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#0d0d1a', alignItems: 'center', justifyContent: 'center', padding: '40px 24px', textAlign: 'center' }}>
                        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -60%)', width: '320px', height: '320px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(124,58,237,0.15) 0%, transparent 70%)', pointerEvents: 'none' }} />
                        {/* Crown badge */}
                        <div style={{ width: 72, height: 72, borderRadius: '22px', background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '36px', boxShadow: '0 8px 32px rgba(124,58,237,0.4)', marginBottom: '24px', position: 'relative' }}>
                          👑
                        </div>
                        <div style={{ fontSize: '11px', fontWeight: 700, color: '#7c3aed', letterSpacing: '1.2px', textTransform: 'uppercase', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ display: 'inline-block', width: 5, height: 5, borderRadius: '50%', background: '#7c3aed' }} />
                          专业版会员
                        </div>
                        <h2 style={{ fontSize: '28px', fontWeight: 800, color: '#fff', margin: '0 0 10px', letterSpacing: '-0.5px', lineHeight: 1.2 }}>
                          今日研判已完成
                        </h2>
                        <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.45)', lineHeight: 1.7, maxWidth: '260px', margin: '0 0 36px' }}>
                          今天的 {pricing?.premium?.daily_limit ?? 15} 次研判额度已用完<br/>明天凌晨将自动重置
                        </p>
                        {/* Reset time indicator */}
                        <div style={{ background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(124,58,237,0.3)', borderRadius: '14px', padding: '14px 24px', marginBottom: '80px' }}>
                          <div style={{ fontSize: '12px', color: 'rgba(196,181,253,0.7)', marginBottom: '4px' }}>下次重置时间</div>
                          <div style={{ fontSize: '18px', fontWeight: 700, color: '#c4b5fd' }}>明天 00:00</div>
                        </div>
                      </div>
                    ) : effectiveTier === 'basic' ? (
                      /* ══════════════════════════════════════════
                         BASIC TIER: single-focus premium upsell
                         Dark immersive screen, premium feel
                         ══════════════════════════════════════════ */
                      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#0d0d1a' }}>
                        {/* Dark hero */}
                        <div style={{ padding: '32px 20px 24px', position: 'relative', overflow: 'hidden', flexShrink: 0 }}>
                          <div style={{ position: 'absolute', top: '-60px', left: '50%', transform: 'translateX(-50%)', width: '300px', height: '300px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(124,58,237,0.22) 0%, transparent 70%)', pointerEvents: 'none' }} />
                          <div style={{ position: 'absolute', top: 12, right: 20, fontSize: '11px', opacity: 0.25, color: '#c4b5fd' }}>✦</div>
                          <div style={{ position: 'absolute', top: 36, right: 44, fontSize: '7px', opacity: 0.2, color: '#c4b5fd' }}>✦</div>
                          <div style={{ fontSize: '11px', fontWeight: 700, color: '#7c3aed', letterSpacing: '1.2px', textTransform: 'uppercase', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#7c3aed' }} />
                            今日 {pricing?.basic?.daily_limit ?? 5} 次已用完
                          </div>
                          <h2 style={{ fontSize: '32px', fontWeight: 800, color: '#fff', margin: '0 0 8px', letterSpacing: '-0.5px', lineHeight: 1.15 }}>
                            只差一步<br/><span style={{ color: '#c4b5fd' }}>解锁专业版</span>
                          </h2>
                          <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', margin: 0, lineHeight: 1.6 }}>
                            明天自动重置 · 或每天 {pricing?.premium?.daily_limit ?? 15} 次无限制研判
                          </p>
                        </div>

                        {/* Premium showcase card */}
                        <div style={{ flex: 1, padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto' }}>
                          <button
                            onClick={() => router.push('/upgrade')}
                            style={{
                              width: '100%', borderRadius: '20px',
                              border: '1.5px solid rgba(124,58,237,0.5)',
                              background: 'linear-gradient(160deg, #1a0a3e 0%, #2d1b69 60%, #1e1b4b 100%)',
                              cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
                              padding: 0, overflow: 'hidden', textAlign: 'left',
                              boxShadow: '0 8px 40px rgba(124,58,237,0.3)',
                            }}
                          >
                            {/* Card top: big price + quota */}
                            <div style={{ padding: '20px 20px 16px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                              <div>
                                <div style={{ fontSize: '12px', fontWeight: 700, color: '#a78bfa', marginBottom: '6px', letterSpacing: '0.3px' }}>👑 专业版</div>
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: '1px' }}>
                                  <span style={{ fontSize: '14px', color: 'rgba(255,255,255,0.4)', fontWeight: 400 }}>¥</span>
                                  <span style={{ fontSize: '46px', fontWeight: 900, color: '#fff', letterSpacing: '-2px', lineHeight: 1 }}>{pricing?.premium?.price ?? '49'}</span>
                                  <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', marginLeft: '2px' }}>/{pricing?.premium?.period ?? '月'}</span>
                                </div>
                              </div>
                              <div style={{ textAlign: 'right', paddingBottom: '4px' }}>
                                <div style={{ fontSize: '56px', fontWeight: 900, color: '#c4b5fd', letterSpacing: '-3px', lineHeight: 1 }}>{pricing?.premium?.daily_limit ?? 15}</div>
                                <div style={{ fontSize: '12px', color: 'rgba(196,181,253,0.6)', marginTop: '-2px' }}>次/天</div>
                              </div>
                            </div>
                            {/* Divider */}
                            <div style={{ height: '0.5px', background: 'rgba(124,58,237,0.3)', margin: '0 20px' }} />
                            {/* Exclusive features */}
                            <div style={{ padding: '14px 20px 18px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                              <div style={{ fontSize: '10px', fontWeight: 700, color: 'rgba(167,139,250,0.6)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '2px' }}>专业版独享</div>
                              {[
                                { icon: '⚡', text: '每天 15 次完整深度研判' },
                                { icon: '📍', text: '持仓参数个性化智能分析' },
                                { icon: '🔄', text: '连续多标的无缝查询' },
                                { icon: '🚀', text: '优先处理通道' },
                              ].map(({ icon, text }, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                  <span style={{ width: 28, height: 28, borderRadius: '8px', background: 'rgba(124,58,237,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', flexShrink: 0 }}>{icon}</span>
                                  <span style={{ fontSize: '14px', color: 'rgba(255,255,255,0.8)', fontWeight: 500 }}>{text}</span>
                                </div>
                              ))}
                            </div>
                          </button>

                          <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.2)', textAlign: 'center', margin: '4px 0 72px' }}>支付宝 · 微信支付 · 订阅后即时生效</p>
                        </div>
                      </div>
                    ) : (
                      /* ══════════════════════════════════════════
                         FREE / GUEST TIER: value comparison
                         Show what they're missing, drive upgrade
                         ══════════════════════════════════════════ */
                      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#f2f2f7' }}>
                        {/* Top header - white */}
                        <div style={{ background: 'white', padding: '28px 20px 20px', flexShrink: 0 }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', background: '#fff2f2', borderRadius: '9999px', padding: '3px 10px', marginBottom: '10px' }}>
                            <span style={{ fontSize: '10px', fontWeight: 700, color: '#ff3b30', letterSpacing: '0.5px', textTransform: 'uppercase' }}>今日限额</span>
                          </div>
                          <h2 style={{ fontSize: '30px', fontWeight: 800, color: '#1c1c1e', margin: '0 0 6px', letterSpacing: '-0.8px', lineHeight: 1.1 }}>
                            免费次数用完了
                          </h2>
                          <p style={{ fontSize: '14px', color: '#8e8e93', margin: 0, lineHeight: 1.5 }}>
                            明天自动重置 · 或升级继续分析
                          </p>
                        </div>

                        <div style={{ height: '12px', flexShrink: 0 }} />

                        {/* Two tier cards - full colored backgrounds */}
                        <div style={{ padding: '0 14px', display: 'flex', gap: '10px', flexShrink: 0 }}>
                          {/* Basic — blue gradient card */}
                          <button
                            onClick={() => router.push('/upgrade')}
                            style={{
                              flex: 1, borderRadius: '20px', overflow: 'hidden', padding: 0,
                              border: 'none', cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
                              background: 'none', boxShadow: '0 4px 20px rgba(0,122,255,0.2)',
                              display: 'flex', flexDirection: 'column', textAlign: 'left',
                            }}
                          >
                            <div style={{ background: 'linear-gradient(160deg, #007aff 0%, #0a84ff 40%, #34aadc 100%)', padding: '18px 16px 14px' }}>
                              <div style={{ fontSize: '10px', fontWeight: 700, color: 'rgba(255,255,255,0.7)', letterSpacing: '0.5px', marginBottom: '6px' }}>📊 标准版</div>
                              <div style={{ display: 'flex', alignItems: 'baseline', gap: '1px', marginBottom: '2px' }}>
                                <span style={{ fontSize: '38px', fontWeight: 900, color: '#fff', letterSpacing: '-2px', lineHeight: 1 }}>{pricing?.basic?.daily_limit ?? 5}</span>
                                <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)', marginLeft: '3px' }}>次/天</span>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'baseline', gap: '1px' }}>
                                <span style={{ fontSize: '18px', fontWeight: 800, color: '#fff' }}>¥{pricing?.basic?.price ?? '19.9'}</span>
                                <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)', marginLeft: '2px' }}>/{pricing?.basic?.period ?? '月'}</span>
                              </div>
                            </div>
                            <div style={{ background: 'white', padding: '12px 14px', flex: 1 }}>
                              {['完整深度研判', '目标价·止损', '全市场覆盖'].map((f, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '5px 0', borderBottom: i < 2 ? '0.5px solid rgba(0,0,0,0.06)' : 'none' }}>
                                  <span style={{ width: 14, height: 14, borderRadius: '50%', background: '#34c759', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', color: 'white', fontWeight: 700, flexShrink: 0 }}>✓</span>
                                  <span style={{ fontSize: '12px', color: '#1c1c1e' }}>{f}</span>
                                </div>
                              ))}
                            </div>
                          </button>

                          {/* Premium — dark purple card */}
                          <button
                            onClick={() => router.push('/upgrade')}
                            style={{
                              flex: 1, borderRadius: '20px', overflow: 'hidden', padding: 0,
                              border: 'none', cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
                              background: 'none', boxShadow: '0 6px 24px rgba(124,58,237,0.28)',
                              display: 'flex', flexDirection: 'column', textAlign: 'left',
                              position: 'relative',
                            }}
                          >
                            {/* "最高权益" badge */}
                            <div style={{ position: 'absolute', top: '-1px', left: '50%', transform: 'translateX(-50%)', background: 'linear-gradient(90deg, #f59e0b, #fbbf24)', color: '#000', fontSize: '9px', fontWeight: 800, padding: '3px 10px', borderRadius: '0 0 9px 9px', whiteSpace: 'nowrap', letterSpacing: '0.3px', zIndex: 2 }}>
                              最高权益
                            </div>
                            <div style={{ background: 'linear-gradient(160deg, #1e0a3c 0%, #3b1d8a 50%, #4f46e5 100%)', padding: '22px 16px 14px', position: 'relative', overflow: 'hidden' }}>
                              <div style={{ position: 'absolute', top: 8, right: 12, fontSize: '9px', color: '#c4b5fd', opacity: 0.4 }}>✦</div>
                              <div style={{ fontSize: '10px', fontWeight: 700, color: '#a78bfa', letterSpacing: '0.5px', marginBottom: '6px' }}>👑 专业版</div>
                              <div style={{ display: 'flex', alignItems: 'baseline', gap: '1px', marginBottom: '2px' }}>
                                <span style={{ fontSize: '38px', fontWeight: 900, color: '#fff', letterSpacing: '-2px', lineHeight: 1 }}>{pricing?.premium?.daily_limit ?? 15}</span>
                                <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)', marginLeft: '3px' }}>次/天</span>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'baseline', gap: '1px' }}>
                                <span style={{ fontSize: '18px', fontWeight: 800, color: '#c4b5fd' }}>¥{pricing?.premium?.price ?? '49'}</span>
                                <span style={{ fontSize: '11px', color: 'rgba(196,181,253,0.5)', marginLeft: '2px' }}>/{pricing?.premium?.period ?? '月'}</span>
                              </div>
                            </div>
                            <div style={{ background: '#1a1040', padding: '12px 14px', flex: 1 }}>
                              {['完整深度研判', '持仓智能分析', '多标的查询'].map((f, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '5px 0', borderBottom: i < 2 ? '0.5px solid rgba(124,58,237,0.15)' : 'none' }}>
                                  <span style={{ width: 14, height: 14, borderRadius: '50%', background: '#7c3aed', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', color: 'white', fontWeight: 700, flexShrink: 0 }}>✓</span>
                                  <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.75)' }}>{f}</span>
                                </div>
                              ))}
                            </div>
                          </button>
                        </div>

                        {/* Free tier comparison strip */}
                        <div style={{ padding: '14px 14px 0', flexShrink: 0 }}>
                          <div style={{ background: 'white', borderRadius: '14px', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{ width: 32, height: 32, borderRadius: '9px', background: '#f2f2f7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', flexShrink: 0 }}>🆓</div>
                            <div style={{ flex: 1 }}>
                              <span style={{ fontSize: '13px', color: '#8e8e93' }}>免费版：每天 </span>
                              <span style={{ fontSize: '13px', fontWeight: 700, color: '#1c1c1e' }}>{pricing?.free?.daily_limit ?? 1} 次</span>
                              <span style={{ fontSize: '13px', color: '#8e8e93' }}>，仅基础分析</span>
                            </div>
                            <span style={{ fontSize: '11px', color: '#aeaeb2' }}>当前</span>
                          </div>
                        </div>

                        <div style={{ flex: 1, minHeight: 0 }} />
                        <div style={{ padding: '0 14px 80px', textAlign: 'center' }}>
                          <p style={{ fontSize: '12px', color: '#aeaeb2', margin: 0 }}>支付宝 · 微信支付 · 即时生效</p>
                        </div>
                      </div>
                    )}
                    </div>
                  ) : (
                    /* ══════════════════════════════════════════════════════
                       NORMAL STATE: unified single-surface design
                       No gray gaps — one white canvas, hairline dividers.
                       ══════════════════════════════════════════════════════ */
                    <>
                      {/* ── Hero: Title + Market ── */}
                      <div style={{ background: 'white', padding: '22px 16px 16px' }}>
                        <h2 style={{ fontSize: '28px', fontWeight: 800, letterSpacing: '-0.8px', color: '#1c1c1e', margin: '0 0 16px', lineHeight: 1.1, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                          今天分析哪只？
                          {(isRegisteredProTrial || isGuestTrial) && (
                            <span style={{ fontSize: '12px', fontWeight: 700, color: '#7c3aed', background: '#ede9fe', borderRadius: '20px', padding: '3px 10px', letterSpacing: '0.2px', lineHeight: 1.4 }}>专业版体验中</span>
                          )}
                        </h2>
                        <MarketSegmented value={market} onChange={setMarket} tier={effectiveTier} onLockedClick={() => router.push('/upgrade')} />
                      </div>

                      {/* ── Hairline divider ── */}
                      <div style={{ height: '0.5px', background: 'rgba(60,60,67,0.1)' }} />

                      {/* ── Input area ── */}
                      <div style={{ background: 'white', padding: '14px 16px 0' }}>
                        {/* iOS search-style input */}
                        <div style={{ position: 'relative' }}>
                          <svg
                            width="18" height="18" viewBox="0 0 24 24" fill="none"
                            stroke="#aeaeb2" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
                            style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
                          >
                            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                          </svg>
                          <input
                            type="text"
                            placeholder={market === 'a' ? '输入股票代码，如 600519' : market === 'hk' ? '输入港股代码，如 00700' : market === 'us' ? '输入美股代码，如 AAPL' : '输入期货代码，如 MA'}
                            value={symbol}
                            onChange={(e) => setSymbol(sanitizeSymbol(e.target.value))}
                            style={{
                              width: '100%', height: '50px',
                              background: '#f2f2f7', border: 'none', outline: 'none',
                              borderRadius: '13px', padding: '0 16px 0 42px',
                              fontSize: '16px', color: '#1c1c1e',
                              WebkitAppearance: 'none',
                            }}
                          />
                        </div>
                        {symbolWarning && symbol.trim() && (
                          <p style={{ fontSize: '13px', color: '#ff9500', marginTop: '8px', marginLeft: '4px' }}>⚠️ {symbolWarning}</p>
                        )}
                        {marketDataLoading && symbol.trim() && !symbolWarning && (
                          <p style={{ fontSize: '13px', color: '#8e8e93', marginTop: '8px', marginLeft: '4px' }}>正在查询行情数据…</p>
                        )}
                        {!marketDataLoading && !marketData && symbol.trim() && !symbolWarning && (
                          <p style={{ fontSize: '13px', color: '#ff3b30', marginTop: '8px', marginLeft: '4px' }}>⚠️ 未找到该代码的行情数据，请确认代码正确</p>
                        )}
                        {marketData && !symbolWarning && symbol.trim() && (
                          <p style={{ fontSize: '13px', color: '#34c759', marginTop: '8px', marginLeft: '4px' }}>✓ 找到 {marketData.count} 条数据</p>
                        )}
                      </div>

                      {/* ── Hot stocks ── */}
                      <div style={{ background: 'white', padding: '12px 16px 16px' }}>
                        <HotStocksStrip stocks={hotRecommendations} onSelect={handleHotStockClick} onRefresh={handleRefreshHotRecommendations} />
                      </div>

                      {/* ── Hairline divider ── */}
                      <div style={{ height: '0.5px', background: 'rgba(60,60,67,0.1)' }} />

                      {/* ── Advanced settings ── */}
                      <div style={{ background: 'white' }}>
                        <AdvancedSettingsPanel
                          period={period} setPeriod={setPeriod}
                          multiPeriodEnabled={multiPeriodEnabled}
                          setMultiPeriodEnabled={(v) => { setMultiPeriodEnabled(v); if (!v) setAuxiliaryPeriods([]); }}
                          auxiliaryPeriods={auxiliaryPeriods} toggleAuxPeriod={toggleAuxPeriod}
                          holdingQuantity={holdingQuantity} setHoldingQuantity={setHoldingQuantity}
                          costPrice={costPrice} setCostPrice={setCostPrice}
                          maxPosition={maxPosition} setMaxPosition={setMaxPosition}
                          premiumInputsOpen={premiumInputsOpen} setPremiumInputsOpen={setPremiumInputsOpen}
                          tier={effectiveTier} onUpgrade={() => router.push('/upgrade')}
                        />
                      </div>

                      {/* ── Upgrade teaser ── */}
                      {effectiveTier !== 'premium' && (
                        <>
                          <div style={{ height: '0.5px', background: 'rgba(60,60,67,0.1)' }} />
                          <div style={{ background: 'white' }}>
                            <UpgradeTeaser tier={tier} pricing={pricing} onUpgrade={() => router.push('/upgrade')} />
                          </div>
                        </>
                      )}

                      {/* Bottom clearance for FAB + bottom nav */}
                      <div style={{ height: 'calc(var(--btn-h, 52px) + var(--bottom-nav-h, 56px) + 20px)', background: 'white', flexShrink: 0 }} />
                    </>
                  )}
                </div>
              </div>

              {/* Desktop: quota exceeded banner */}
              {showUpgradeBanner && (
                <div className="desktop-only card mb-3" style={{ background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)', border: '1px solid #f59e0b' }}>
                  <div style={{ textAlign: 'center' }}>
                    {effectiveTier === 'basic' ? (
                      <>
                        <p style={{ fontWeight: '600', marginBottom: '0.5rem' }}>今日标准版次数已用完</p>
                        <p style={{ fontSize: '0.875rem', marginBottom: '1rem' }}>升级专业版，每天 {pricing?.premium?.daily_limit ?? 15} 次分析，仅需 ¥{pricing?.premium?.price ?? '49'}/月</p>
                        <button className="btn btn-primary" onClick={() => router.push('/upgrade')} style={{ background: '#7c3aed', borderColor: '#7c3aed' }}>升级专业版</button>
                      </>
                    ) : (
                      <>
                        <p style={{ fontWeight: '600', marginBottom: '0.5rem' }}>今日免费次数已用完</p>
                        <p style={{ fontSize: '0.875rem', marginBottom: '1rem' }}>升级标准版，每天 {pricing?.basic?.daily_limit ?? 5} 次分析，仅需 ¥{pricing?.basic?.price ?? '19.9'}/月</p>
                        <button className="btn btn-primary" onClick={() => router.push('/upgrade')} style={{ background: '#f59e0b', borderColor: '#f59e0b' }}>立即升级</button>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Desktop: upgrade cards */}
              {effectiveTier !== 'premium' && (
                <div className="desktop-only" style={{ marginTop: '0.5rem' }}>
                  <p style={{ fontWeight: 700, fontSize: '0.88rem', marginBottom: '0.7rem', color: 'var(--muted)', textAlign: 'center' }}>🔒 升级后解锁以下功能</p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
                    {effectiveTier === 'free' && (
                      <div style={{ border: '2px solid #3b82f6', borderRadius: '0.75rem', padding: '1rem', background: '#eff6ff', transition: 'transform 0.2s' }} onMouseEnter={e => (e.currentTarget.style.transform = 'translateY(-2px)')} onMouseLeave={e => (e.currentTarget.style.transform = 'translateY(0)')}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                          <div>
                            <p style={{ fontWeight: 700, color: '#1d4ed8', fontSize: '0.88rem' }}>📊 标准版</p>
                            <p style={{ fontSize: '1.2rem', fontWeight: 800, color: '#1e40af', lineHeight: 1.2 }}>¥{pricing?.basic?.price ?? '19.9'}<span style={{ fontSize: '0.75rem', fontWeight: 400 }}>/{pricing?.basic?.period ?? '月'}</span></p>
                          </div>
                          <span style={{ fontSize: '0.65rem', background: '#bfdbfe', color: '#1d4ed8', padding: '0.15rem 0.5rem', borderRadius: '9999px', fontWeight: 600, whiteSpace: 'nowrap' }}>推荐</span>
                        </div>
                        <ul style={{ fontSize: '0.76rem', color: '#1e40af', paddingLeft: '1rem', margin: '0 0 0.75rem', lineHeight: '1.8' }}>
                          {((pricing?.features ?? []).filter(f => f.tiers.includes('basic')).map(f => f.text).length ? (pricing?.features ?? []).filter(f => f.tiers.includes('basic')).map(f => f.text) : ['每日5次分析', '完整深度研判', '港股/美股/期货', '多周期叠加分析']).map((f, i) => (<li key={i}>{f}</li>))}
                        </ul>
                        <button style={{ width: '100%', padding: '0.5rem', fontWeight: 700, fontSize: '0.82rem', color: 'white', border: 'none', borderRadius: '0.5rem', cursor: 'pointer', background: 'linear-gradient(90deg,#2563eb 0%,#60a5fa 50%,#2563eb 100%)', backgroundSize: '200% auto', animation: 'shimmer 2.5s linear infinite' }} onClick={() => router.push('/upgrade')}>立即解锁 →</button>
                      </div>
                    )}
                    <div style={{ border: '2px solid #7c3aed', borderRadius: '0.75rem', padding: '1rem', background: '#f5f3ff', position: 'relative', transition: 'transform 0.2s', animation: 'pulse-glow 2s ease-in-out infinite' }} onMouseEnter={e => (e.currentTarget.style.transform = 'translateY(-2px)')} onMouseLeave={e => (e.currentTarget.style.transform = 'translateY(0)')}>
                      <div style={{ position: 'absolute', top: '-9px', left: '50%', transform: 'translateX(-50%)', background: '#7c3aed', color: 'white', fontSize: '0.62rem', fontWeight: 700, padding: '0.15rem 0.6rem', borderRadius: '9999px', whiteSpace: 'nowrap' }}>✨ 最高权益</div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem', marginTop: '0.3rem' }}>
                        <div>
                          <p style={{ fontWeight: 700, color: '#5b21b6', fontSize: '0.88rem' }}>🚀 专业版</p>
                          <p style={{ fontSize: '1.2rem', fontWeight: 800, color: '#6d28d9', lineHeight: 1.2 }}>¥{pricing?.premium?.price ?? '49'}<span style={{ fontSize: '0.75rem', fontWeight: 400 }}>/{pricing?.premium?.period ?? '月'}</span></p>
                        </div>
                      </div>
                      <ul style={{ fontSize: '0.76rem', color: '#5b21b6', paddingLeft: '1rem', margin: '0 0 0.75rem', lineHeight: '1.8' }}>
                        {((pricing?.features ?? []).filter(f => f.tiers.includes('premium')).map(f => f.text).length ? (pricing?.features ?? []).filter(f => f.tiers.includes('premium')).map(f => f.text) : ['每日15次分析', '连续多标的查询', '持仓参数智能分析', '优先处理通道']).map((f, i) => (<li key={i}>{f}</li>))}
                      </ul>
                      <button style={{ width: '100%', padding: '0.5rem', fontWeight: 700, fontSize: '0.82rem', color: 'white', border: 'none', borderRadius: '0.5rem', cursor: 'pointer', background: 'linear-gradient(90deg,#7c3aed 0%,#a78bfa 50%,#7c3aed 100%)', backgroundSize: '200% auto', animation: 'shimmer 2.5s linear infinite' }} onClick={() => router.push('/upgrade')}>立即解锁 →</button>
                    </div>
                  </div>
                </div>
              )}

              {/* Mobile FAB: analyze button — upgrades to CTA when quota exhausted */}
              <div className="mobile-only fab-container">
                {error && <div className="error" style={{ marginBottom: '8px', fontSize: '13px', borderRadius: '8px' }}>{error}</div>}
                {showUpgradeBanner ? (
                  effectiveTier === 'premium' ? (
                    <button
                      className="fab-btn"
                      disabled
                      style={{ background: 'rgba(124,58,237,0.25)', color: 'rgba(196,181,253,0.6)', cursor: 'default', opacity: 1 }}
                    >
                      明天重置 · 敬请期待
                    </button>
                  ) : (
                    <button
                      className="fab-btn"
                      onClick={() => router.push('/upgrade')}
                      style={{
                        background: effectiveTier === 'basic'
                          ? 'linear-gradient(135deg, #7c3aed, #a855f7)'
                          : 'linear-gradient(135deg, #ff9500, #ff6b00)',
                        opacity: 1,
                      }}
                    >
                      {effectiveTier === 'basic' ? '升级专业版 →' : '立即升级 →'}
                    </button>
                  )
                ) : (
                  <button
                    className="fab-btn"
                    onClick={handleAnalyze}
                    disabled={!symbol.trim()}
                  >
                    {effectiveTier === 'premium' && premiumPendingCount > 0 ? `分析中（${premiumPendingCount}）` : '开始分析'}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ═══ LOADING PANEL ═══ */}
          {activePanel === 'loading' && (
            <>
              {/* Mobile narrative loading — full-screen immersive takeover */}
              <div className="mobile-only">
                <div style={{
                  position: 'fixed',
                  top: 0, left: 0, right: 0, bottom: 0,
                  zIndex: 300,
                  background: '#ffffff',
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center',
                  overflow: 'hidden',
                  textAlign: 'center',
                }}>
                  {/* Breathing ambient glow */}
                  <div style={{
                    position: 'absolute',
                    width: '360px', height: '360px',
                    background: 'radial-gradient(circle at center, rgba(0,122,255,0.07) 0%, transparent 70%)',
                    borderRadius: '50%',
                    top: '50%', left: '50%',
                    transform: 'translate(-50%, -55%)',
                    animation: 'loading-breathe 3.5s ease-in-out infinite',
                    pointerEvents: 'none',
                  }} />

                  {analyzeTimedOut ? (
                    /* ── Timeout state ── */
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', maxWidth: 300, padding: '0 40px', position: 'relative', zIndex: 1 }}>
                      <div style={{ fontSize: '48px', lineHeight: 1 }}>⏰</div>
                      <h2 style={{ fontSize: '22px', fontWeight: 700, color: '#1c1c1e', margin: 0 }}>分析时间较长</h2>
                      <p style={{ fontSize: '15px', color: '#8e8e93', lineHeight: 1.75, margin: 0 }}>
                        AI 服务响应超过 3 分钟<br />可等待继续，或返回重试
                      </p>
                      <button
                        onClick={handleBackToAnalyze}
                        style={{ marginTop: '8px', padding: '14px 40px', borderRadius: 16, background: '#f2f2f7', border: 'none', fontSize: '16px', fontWeight: 600, color: '#1c1c1e', cursor: 'pointer' }}
                      >
                        返回重试
                      </button>
                    </div>
                  ) : (
                    /* ── Normal loading state ── */
                    <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0 32px', width: '100%' }}>
                      {/* Stock symbol — the hero */}
                      <div style={{
                        fontSize: '72px', fontWeight: 900, letterSpacing: '-3px',
                        color: '#1c1c1e',
                        lineHeight: 1, marginBottom: '10px',
                        animation: 'loading-symbol-in 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards',
                      }}>
                        {analyzingSymbol}
                      </div>

                      {/* Status label */}
                      <div style={{
                        fontSize: '13px', fontWeight: 500,
                        color: '#aeaeb2',
                        letterSpacing: '2.5px', textTransform: 'uppercase',
                        marginBottom: '64px',
                        animation: 'loading-subtitle-in 0.6s 0.15s ease-out both',
                      }}>
                        深度研判中
                      </div>

                      {/* Narrative */}
                      <p
                        key={narrativeIdx}
                        style={{
                          fontSize: '15px', fontWeight: 500,
                          color: '#3c3c43',
                          lineHeight: 1.7, margin: '0 0 28px',
                          animation: 'narrative-fade 0.35s ease-out',
                          minHeight: '1.7em',
                        }}
                      >
                        {NARRATIVE_TEXTS[narrativeIdx]}
                      </p>

                      {/* Minimal blue dots */}
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        {[0, 1, 2].map(i => (
                          <div key={i} style={{
                            width: '7px', height: '7px', borderRadius: '50%',
                            background: '#007aff',
                            opacity: 0.4,
                            animation: `loading-dot 1.4s ${i * 0.22}s ease-in-out infinite`,
                          }} />
                        ))}
                      </div>

                      {effectiveTier === 'premium' && (
                        <button
                          onClick={() => setActivePanel('analyze')}
                          style={{ background: 'none', border: 'none', fontSize: '14px', fontWeight: 500, color: '#aeaeb2', cursor: 'pointer', marginTop: '48px', padding: '4px 0' }}
                        >
                          继续下一个分析 →
                        </button>
                      )}

                    </div>
                  )}

                  {/* Footer — direct child of fixed container so bottom:40px is correct */}
                  <div style={{
                    position: 'absolute', bottom: '40px', left: 0, right: 0,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
                    pointerEvents: 'none',
                  }}>
                    <p style={{ fontSize: '12px', color: '#c7c7cc', margin: 0 }}>预计耗时 1–3 分钟</p>
                    {premiumPendingCount > 1 && (
                      <p style={{ fontSize: '12px', color: '#c7c7cc', margin: 0 }}>队列中还有 {premiumPendingCount - 1} 个任务</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Desktop: original loading panel */}
              <div className="desktop-only">
                <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '380px', textAlign: 'center', gap: '1.5rem' }}>
                  {analyzeTimedOut ? (
                    <>
                      <div style={{ fontSize: '2.5rem' }}>⏰</div>
                      <div>
                        <p style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '0.4rem', color: '#b45309' }}>分析时间较长</p>
                        <p style={{ fontSize: '0.875rem', color: 'var(--muted)', marginBottom: '1rem' }}>AI 服务响应超过 3 分钟，可能是服务繁忙。<br />可以等待继续，或返回重试。</p>
                      </div>
                      <button className="btn btn-secondary" onClick={handleBackToAnalyze}>返回重试</button>
                    </>
                  ) : (
                    <>
                      <div style={{ width: '64px', height: '64px', border: '5px solid var(--border)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 0.9s linear infinite' }} />
                      <div>
                        <p style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '0.4rem' }}>正在分析 <span style={{ color: 'var(--primary)' }}>{analyzingSymbol}</span></p>
                        <p style={{ fontSize: '0.875rem', color: 'var(--muted)' }}>AI 正在处理市场数据与指标，预计耗时 <strong>1–3 分钟</strong></p>
                        {premiumPendingCount > 1 && (<p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: '0.3rem' }}>队列中还有 {premiumPendingCount - 1} 个分析任务</p>)}
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                        {['数据获取', '指标计算', 'AI 决策', '生成报告'].map((step, i) => (
                          <span key={step} style={{ fontSize: '0.7rem', padding: '0.2rem 0.55rem', borderRadius: '9999px', background: '#f1f5f9', color: 'var(--muted)', animation: `pulse-step 2s ${i * 0.5}s infinite` }}>{step}</span>
                        ))}
                      </div>
                      {effectiveTier === 'premium' && (<button className="btn btn-secondary" style={{ marginTop: '0.5rem' }} onClick={() => setActivePanel('analyze')}>继续下一个分析 →</button>)}
                    </>
                  )}
                </div>
              </div>
            </>
          )}

          {/* ═══ RESULT PANEL ═══ */}
          {activePanel === 'result' && (
            <div>
              {/* ── Mobile: Result Gallery ── */}
              <div className="mobile-only rg-screen">

                {history.length === 0 ? (
                  <div className="rg-empty">
                    <div className="rg-empty-icon-wrap">
                      <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
                        <path d="M6 32 L14 20 L20 26 L28 13 L38 16" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                        <circle cx="38" cy="16" r="3" fill="white"/>
                      </svg>
                    </div>
                    <p className="rg-empty-title">开始你的第一次研判</p>
                    <p className="rg-empty-sub">
                      输入股票或期货代码，AI 将生成<br />专业的买卖建议和深度分析报告
                    </p>
                    <button type="button" className="rg-empty-cta" onClick={() => setActivePanel('analyze')}>
                      开始分析
                    </button>
                    <p className="rg-empty-hint">支持 A股 · 港股 · 美股 · 期货</p>
                  </div>
                ) : (
                  <div className="rg-list">
                    {(() => {
                      const groups: { label: string; items: typeof history }[] = [];
                      let currentLabel = '';
                      history.forEach((item) => {
                        const label = item.analyzedAt ? getTimeGroupLabel(item.analyzedAt) : '更早';
                        if (label !== currentLabel) {
                          groups.push({ label, items: [] });
                          currentLabel = label;
                        }
                        groups[groups.length - 1].items.push(item);
                      });
                      let cardIdx = 0;
                      return groups.map((group) => (
                        <div key={group.label}>
                          <div className="rg-group-label">{group.label}</div>
                          {group.items.map((item) => {
                            const ad = getActionDisplay(item.action);
                            const conf = item.confidence ?? item.detail?.result?.confidence;
                            const isSelected = item.id === selectedHistoryId;
                            const reason = item.detail?.result?.reason;
                            const timeStr = item.analyzedAt ? formatCardTime(item.analyzedAt) : '';
                            const delay = `${Math.min(cardIdx++, 8) * 55}ms`;
                            return (
                              <button
                                key={item.id}
                                type="button"
                                className={`rg-card${isSelected ? ' rg-card-active' : ''}`}
                                style={{
                                  '--card-accent': ad.color,
                                  animationDelay: delay,
                                  ...(isSelected ? { background: `color-mix(in srgb, ${ad.color} 9%, #fff)` } : {}),
                                } as React.CSSProperties}
                                onClick={() => {
                                  setResult(item.detail);
                                  setResultPositionParams(item.positionParams || null);
                                  setSelectedHistoryId(item.id);
                                  setResultSheetOpen(true);
                                }}
                              >
                                <div className="rg-card-header">
                                  <div className="rg-card-info">
                                    <span className="rg-card-name">{item.name || item.symbol}</span>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '1px' }}>
                                      <span className="rg-card-symbol">{item.symbol}</span>
                                      {item.market && (
                                        <span className="rg-card-market-chip">{MARKET_LABELS[item.market] || item.market}</span>
                                      )}
                                    </div>
                                  </div>
                                  <span className="rg-card-badge" style={{ background: ad.color }}>{ad.text}</span>
                                </div>
                                {conf != null && (
                                  <div className="rg-card-bar-row">
                                    <div className="rg-card-bar">
                                      <div className="rg-card-bar-fill" style={{ width: `${conf}%`, background: ad.color }} />
                                    </div>
                                    <span className="rg-card-conf" style={{ color: ad.color }}>{conf}%</span>
                                  </div>
                                )}
                                {reason && <p className="rg-card-reason">{reason.slice(0, 68)}…</p>}
                                <div className="rg-card-footer">
                                  <span className="rg-card-date">{timeStr}</span>
                                  <svg className="rg-card-chevron" width="7" height="12" viewBox="0 0 7 12" fill="none">
                                    <path d="M1 1l5 5-5 5" stroke="#c7c7cc" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
                                  </svg>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      ));
                    })()}
                  </div>
                )}
              </div>

              {result ? (
                <div>
                  {/* Mobile: ResultSheet overlay — onClose dismisses sheet, gallery stays visible */}
                  <ResultSheet
                    isOpen={resultSheetOpen}
                    onClose={() => setResultSheetOpen(false)}
                    result={result}
                    tier={resultDisplayTier}
                    period={period}
                    activeTab={activeTab}
                    onTabChange={setActiveTab}
                    allTabs={allTabs}
                    multiPeriodResults={multiPeriodResults}
                    onShare={() => handleShareViralCard()}
                    onSave={handleBookmark}
                    onSavedListOpen={() => setSavedRecordsOpen(true)}
                    shareLoading={shareLoading}
                    saveLongLoading={saveLongLoading}
                    onUpgrade={() => router.push('/upgrade')}
                    historyItems={history}
                    onHistorySelect={(id) => {
                      const item = history.find(h => h.id === id);
                      if (item) handleOpenHistoryDetail(item);
                    }}
                    selectedHistoryId={selectedHistoryId ?? undefined}
                    onOpenHistorySheet={() => setHistorySheetOpen(true)}
                    isSaved={isSavedRecord(selectedHistoryId ?? `${result?.data?.symbol ?? ''}_${analyzeStartedAt ?? ''}`)}
                  />
                  {/* Mobile: re-open button when sheet is dismissed */}
                  {!resultSheetOpen && (
                    <div className="mobile-only" style={{ position: 'fixed', bottom: 'calc(env(safe-area-inset-bottom, 0px) + 72px)', left: 16, right: 16, zIndex: 50 }}>
                      <button
                        onClick={() => setResultSheetOpen(true)}
                        style={{
                          width: '100%', height: 52, borderRadius: 14,
                          background: 'linear-gradient(135deg, #2563eb, #4f46e5)',
                          color: 'white', border: 'none', fontSize: '16px',
                          fontWeight: 700, cursor: 'pointer',
                          boxShadow: '0 4px 20px rgba(37,99,235,0.45)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                        }}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="6 9 12 15 18 9"/>
                        </svg>
                        查看 {result?.data?.name || result?.data?.symbol} 的分析结果
                      </button>
                    </div>
                  )}

                  <div className="card result-panel-card desktop-only">
                    {/* Desktop: original result header */}
                    <div className="desktop-only" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <h2 style={{ fontSize: '1.125rem', fontWeight: '600' }}>分析结果</h2>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '0.875rem', color: 'var(--muted)', fontWeight: 600 }}>
                            {result.data?.name ? <>{result.data.name} <span style={{ opacity: 0.6 }}>({result.data.symbol})</span></> : result.data?.symbol} · {result.data?.market?.toUpperCase()}
                          </div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: '0.15rem' }}>
                            {result.data?.latest_date && <span>K线 {new Date(result.data.latest_date).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>}
                            {result.data?.latest_date && analyzeStartedAt && <span style={{ margin: '0 0.3rem' }}>·</span>}
                            {analyzeStartedAt && <span>分析 {new Date(analyzeStartedAt).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>}
                          </div>
                        </div>
                        {effectiveTier === 'free' ? (
                          <button onClick={() => generateShareCard()} disabled={shareLoading} style={{ fontSize: '0.82rem', padding: '0.35rem 0.85rem', background: shareLoading ? '#fca5a5' : 'linear-gradient(135deg,#dc2626,#ef4444)', border: 'none', borderRadius: '0.5rem', cursor: shareLoading ? 'default' : 'pointer', color: 'white', fontWeight: 700, whiteSpace: 'nowrap', boxShadow: shareLoading ? 'none' : '0 2px 8px rgba(220,38,38,0.4)' }}>{shareLoading ? '生成中…' : '📤 分享研判'}</button>
                        ) : (
                          <div style={{ display: 'flex', gap: '0.4rem' }}>
                            <button onClick={() => generateShareCard(undefined, undefined, undefined, true)} disabled={saveLongLoading} style={{ fontSize: '0.82rem', padding: '0.35rem 0.85rem', background: saveLongLoading ? '#86efac' : 'linear-gradient(135deg,#15803d,#22c55e)', border: 'none', borderRadius: '0.5rem', cursor: saveLongLoading ? 'default' : 'pointer', color: 'white', fontWeight: 700, whiteSpace: 'nowrap', boxShadow: saveLongLoading ? 'none' : '0 2px 8px rgba(34,197,94,0.4)' }}>{saveLongLoading ? '生成中…' : '💾 保存'}</button>
                            <button onClick={() => generateShareCard()} disabled={shareLoading} style={{ fontSize: '0.82rem', padding: '0.35rem 0.85rem', background: shareLoading ? '#fca5a5' : 'linear-gradient(135deg,#dc2626,#ef4444)', border: 'none', borderRadius: '0.5rem', cursor: shareLoading ? 'default' : 'pointer', color: 'white', fontWeight: 700, whiteSpace: 'nowrap', boxShadow: shareLoading ? 'none' : '0 2px 8px rgba(220,38,38,0.4)' }}>{shareLoading ? '生成中…' : '📤 分享'}</button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Share confirmation: mobile = bottom sheet, desktop = inline */}
                    <div className="desktop-only">
                      {shareConfirmOpen && (
                        <div style={{ marginBottom: '1rem', padding: '0.85rem 1rem', background: '#fffbeb', border: '1px solid #f59e0b', borderRadius: '0.65rem', fontSize: '0.85rem', color: '#92400e' }}>
                          <p style={{ fontWeight: 600, marginBottom: '0.5rem' }}>分享卡片包含持仓参数？</p>
                          <p style={{ marginBottom: '0.75rem', color: '#78350f' }}>您已填写了持仓参数，是否在分享卡片中包含这些信息？</p>
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button onClick={() => generateShareCard(true, undefined, undefined, sharePendingLongImage)} style={{ padding: '0.35rem 0.8rem', fontSize: '0.8rem', background: '#f59e0b', color: 'white', border: 'none', borderRadius: '0.4rem', cursor: 'pointer' }}>包含持仓参数</button>
                            <button onClick={() => generateShareCard(false, undefined, undefined, sharePendingLongImage)} style={{ padding: '0.35rem 0.8rem', fontSize: '0.8rem', background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0', borderRadius: '0.4rem', cursor: 'pointer' }}>不包含</button>
                            <button onClick={() => setShareConfirmOpen(false)} style={{ padding: '0.35rem 0.8rem', fontSize: '0.8rem', background: 'transparent', color: '#94a3b8', border: '1px solid #e2e8f0', borderRadius: '0.4rem', cursor: 'pointer' }}>取消</button>
                          </div>
                        </div>
                      )}
                    </div>
                    <BottomSheet isOpen={shareConfirmOpen} onClose={() => setShareConfirmOpen(false)} title="分享选项">
                      <div style={{ padding: '0 0 1rem' }}>
                        <p style={{ fontSize: '0.9rem', color: 'var(--muted)', marginBottom: '1.25rem' }}>您已填写了持仓参数，是否在分享卡片中包含这些信息？</p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                          <button onClick={() => generateShareCard(true, undefined, undefined, sharePendingLongImage)} style={{ width: '100%', padding: '0.75rem', fontSize: '0.9rem', background: '#f59e0b', color: 'white', border: 'none', borderRadius: '0.625rem', cursor: 'pointer', fontWeight: 600 }}>包含持仓参数</button>
                          <button onClick={() => generateShareCard(false, undefined, undefined, sharePendingLongImage)} style={{ width: '100%', padding: '0.75rem', fontSize: '0.9rem', background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0', borderRadius: '0.625rem', cursor: 'pointer' }}>不包含</button>
                          <button onClick={() => setShareConfirmOpen(false)} style={{ width: '100%', padding: '0.75rem', fontSize: '0.875rem', background: 'transparent', color: '#94a3b8', border: '1px solid #e2e8f0', borderRadius: '0.625rem', cursor: 'pointer' }}>取消</button>
                        </div>
                      </div>
                    </BottomSheet>

                    {/* ── Signal block ── */}
                    <div className="result-section result-section-animated">
                      {/* Mobile: SignalHero component */}
                      <div className="mobile-only">
                        <SignalHero result={result} tier={resultDisplayTier} period={period} />
                      </div>
                      {/* Desktop: original signal block */}
                      <div className="desktop-only">
                        {effectiveTier === 'free' ? (
                          <div style={{ marginBottom: '1.25rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.25rem', background: result.result?.action === 'buy' ? '#fee2e2' : result.result?.action === 'sell' ? '#dcfce7' : '#f3f4f6', borderRadius: (result.result as any)?.opportunity_quality ? '0.75rem 0.75rem 0 0' : '0.75rem' }}>
                              <div>
                                <p style={{ fontSize: '0.75rem', color: 'var(--muted)', marginBottom: '0.2rem' }}>建议操作</p>
                                <p style={{ fontSize: '2rem', fontWeight: 800, color: result.result?.action === 'buy' ? '#dc2626' : result.result?.action === 'sell' ? '#16a34a' : '#6b7280' }}>
                                  {result.result?.action === 'buy' ? '买入' : result.result?.action === 'sell' ? '卖出' : '观望'}
                                </p>
                              </div>
                              <div style={{ textAlign: 'right' }}>
                                <p style={{ fontSize: '0.75rem', color: 'var(--muted)', marginBottom: '0.2rem' }}>最新价</p>
                                <p style={{ fontSize: '1.75rem', fontWeight: 700 }}>{typeof result.data?.latest_price === 'number' ? result.data.latest_price.toFixed(2) : '—'}</p>
                              </div>
                            </div>
                            {(result.result as any)?.opportunity_quality && (
                              <div style={{ padding: '0.5rem 1.25rem', background: 'var(--card)', border: '1px solid var(--border)', borderTop: 'none', borderRadius: '0 0 0.75rem 0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>机会评级</span>
                                <span style={{ fontWeight: 700, fontSize: '0.95rem', color: (result.result as any).opportunity_quality === 'A' ? '#16a34a' : (result.result as any).opportunity_quality === 'B' ? '#0369a1' : (result.result as any).opportunity_quality === 'C' ? '#d97706' : '#dc2626' }}>{(result.result as any).opportunity_quality} 级</span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <>
                            <div style={{ textAlign: 'center', padding: '1.25rem', background: result.result?.action === 'buy' ? '#fee2e2' : result.result?.action === 'sell' ? '#dcfce7' : '#f3f4f6', borderRadius: '0.75rem', marginBottom: '1rem' }}>
                              <p className="action-label">建议操作</p>
                              <p style={{ color: result.result?.action === 'buy' ? '#dc2626' : result.result?.action === 'sell' ? '#16a34a' : '#6b7280' }} className="action-value">
                                {result.result?.action === 'buy' ? '买入' : result.result?.action === 'sell' ? '卖出' : '观望'}
                              </p>
                              <p style={{ fontSize: '1.25rem', fontWeight: '600', marginTop: '0.5rem' }}>置信度 {result.result?.confidence ?? '—'}%</p>
                            </div>
                            <div className="grid grid-3" style={{ gap: '1rem', marginBottom: '1.25rem' }}>
                              <div style={{ textAlign: 'center' }}><p style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>最新价</p><p style={{ fontSize: '1.25rem', fontWeight: '600' }}>{typeof result.data?.latest_price === 'number' ? result.data.latest_price.toFixed(2) : '—'}</p></div>
                              <div style={{ textAlign: 'center' }}><p style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>目标价</p><p style={{ fontSize: '1.25rem', fontWeight: '600', color: 'var(--success)' }}>{typeof result.result?.target_price === 'number' ? result.result.target_price.toFixed(2) : '—'}</p></div>
                              <div style={{ textAlign: 'center' }}><p style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>止损</p><p style={{ fontSize: '1.25rem', fontWeight: '600', color: 'var(--danger)' }}>{typeof result.result?.stop_loss === 'number' ? result.result.stop_loss.toFixed(2) : '—'}</p></div>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="result-section-gap" />

                    {/* ── Analysis reason ── */}
                    <div className="result-section result-section-animated">
                      <div className="result-section-title">分析要点</div>
                      <h3 className="desktop-only" style={{ fontSize: '0.875rem', fontWeight: '600', marginBottom: '0.5rem' }}>分析要点</h3>
                      {effectiveTier === 'free' ? (
                        <div style={{ position: 'relative' }}>
                          <div className="result-reason-block">
                            <p className="result-reason-text" style={{ maxHeight: '7.5em', overflow: 'hidden' }}>
                              {result.result?.reason}
                            </p>
                          </div>
                          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '72px', background: 'linear-gradient(to bottom, transparent, white 80%)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: '4px' }}>
                            <button onClick={() => router.push('/upgrade')} style={{ fontSize: '13px', fontWeight: 700, color: '#007aff', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px' }}>
                              🔒 解锁完整分析 →
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="result-reason-block">
                          <p className="result-reason-text">
                            {result.result?.reason}
                          </p>
                        </div>
                      )}
                    </div>
                    <div className="result-section-gap" />

                    {/* ── Deep analysis tabs ── */}
                    {effectiveTier !== 'free' && result.result && (
                      <>
                        <div className="result-section result-section-animated" style={{ padding: 0 }}>
                          {/* Mobile: ResultTabs component */}
                          <div className="mobile-only">
                            <ResultTabs
                              tabs={allTabs}
                              activeTab={activeTab}
                              onTabChange={setActiveTab}
                            >
                              {allTabs[activeTab]?.key === '__multiperiod__' ? (
                                <MultiPeriodCards results={multiPeriodResults} />
                              ) : (
                                <p className="result-tab-text">
                                  {(result.result as any)?.[allTabs[activeTab]?.key] || '暂无数据'}
                                </p>
                              )}
                            </ResultTabs>
                          </div>
                          {/* Desktop: original tabs */}
                          <div className="desktop-only" style={{ padding: '1.25rem' }}>
                            <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', marginBottom: '0.75rem', padding: '0.3rem', background: '#f1f5f9', borderRadius: '0.75rem' }}>
                              {allTabs.map((tab, idx) => (
                                <button key={tab.key} type="button" onClick={() => setActiveTab(idx)} style={{ flex: '1 1 auto', minWidth: 'max-content', padding: '0.4rem 0.7rem', fontSize: '0.78rem', fontWeight: activeTab === idx ? 600 : 400, borderRadius: '0.5rem', border: 'none', background: activeTab === idx ? 'var(--primary)' : 'transparent', color: activeTab === idx ? 'white' : 'var(--muted)', cursor: 'pointer', transition: 'background 0.15s, color 0.15s' }}>
                                  {tab.label}
                                </button>
                              ))}
                            </div>
                            <div style={{ padding: '0.9rem', background: '#f8fafc', borderRadius: '0.5rem', border: '1px solid var(--border)', minHeight: '80px' }}>
                              {allTabs[activeTab]?.key === '__multiperiod__' ? (
                                <div style={{ overflowX: 'auto' }}>
                                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                    <thead>
                                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                        {['周期', '操作', '置信度', '目标价', '止损', '摘要'].map((h) => (<th key={h} style={{ padding: '0.4rem 0.5rem', textAlign: 'left', color: 'var(--muted)', fontWeight: 600 }}>{h}</th>))}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {multiPeriodResults.map(({ period: p, result: r }) => (
                                        <tr key={p} style={{ borderBottom: '1px solid var(--border)' }}>
                                          <td style={{ padding: '0.4rem 0.5rem', fontWeight: 500 }}>{PERIOD_LABELS[p] || p}</td>
                                          <td style={{ padding: '0.4rem 0.5rem', color: r.result?.action === 'buy' ? '#dc2626' : r.result?.action === 'sell' ? '#16a34a' : '#6b7280' }}>{r.result?.action === 'buy' ? '买入' : r.result?.action === 'sell' ? '卖出' : '观望'}</td>
                                          <td style={{ padding: '0.4rem 0.5rem' }}>{r.result?.confidence ?? '-'}%</td>
                                          <td style={{ padding: '0.4rem 0.5rem', color: 'var(--success)' }}>{typeof r.result?.target_price === 'number' ? r.result.target_price.toFixed(2) : '—'}</td>
                                          <td style={{ padding: '0.4rem 0.5rem', color: 'var(--danger)' }}>{typeof r.result?.stop_loss === 'number' ? r.result.stop_loss.toFixed(2) : '—'}</td>
                                          <td style={{ padding: '0.4rem 0.5rem', color: 'var(--muted)', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{(r.result?.reason || '').slice(0, 60)}{(r.result?.reason || '').length > 60 ? '...' : ''}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              ) : (
                                <p style={{ fontSize: '0.875rem', color: 'var(--foreground)', lineHeight: '1.6', margin: 0 }}>{(result.result as any)?.[allTabs[activeTab]?.key] || '暂无数据'}</p>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="result-section-gap" />
                      </>
                    )}

                    {/* ── Risk factors + Technical indicators (combined section) ── */}
                    {effectiveTier !== 'free' && (result.result?.risk_factors?.length > 0 || result.result?.indicators) && (
                      <>
                        <div className="result-section result-section-animated">
                          {result.result?.risk_factors && result.result.risk_factors.length > 0 && (
                            <div style={{ marginBottom: result.result?.indicators ? '1rem' : 0 }}>
                              <div className="result-section-title">风险因素</div>
                              <h3 className="desktop-only" style={{ fontSize: '0.875rem', fontWeight: '600', marginBottom: '0.5rem' }}>风险因素</h3>
                              {/* Mobile: chip style */}
                              <div className="risk-chips-wrap mobile-only">
                                {result.result.risk_factors.map((f: string, i: number) => (
                                  <span key={i} className="risk-chip">
                                    <span className="risk-chip-dot" />
                                    {f}
                                  </span>
                                ))}
                              </div>
                              {/* Desktop: list style */}
                              <ul className="desktop-only" style={{ fontSize: '0.9rem', color: 'var(--muted)', paddingLeft: '1.2rem', margin: 0, lineHeight: 1.8, flexDirection: 'column' }}>
                                {result.result.risk_factors.map((f: string, i: number) => (<li key={i}>{f}</li>))}
                              </ul>
                            </div>
                          )}
                          {result.result?.indicators && (
                            <div>
                              <div className="result-section-title">技术指标</div>
                              <h3 className="desktop-only" style={{ fontSize: '0.875rem', fontWeight: '600', marginBottom: '0.5rem' }}>技术指标</h3>
                              {/* Mobile: horizontal scroll cards */}
                              <div className="indicator-scroll mobile-only">
                                {Object.entries(result.result.indicators).map(([k, v]) => (
                                  <div key={k} className="indicator-card">
                                    <div className="indicator-card-name">{k}</div>
                                    <div className="indicator-card-value">
                                      {typeof v === 'number' ? (v as number).toFixed(2) : String(v)}
                                    </div>
                                  </div>
                                ))}
                              </div>
                              {/* Desktop: tag style */}
                              <div className="desktop-only" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                                {Object.entries(result.result.indicators).map(([k, v]) => (<span key={k} style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem', background: '#f1f5f9', borderRadius: '0.375rem', color: 'var(--muted)' }}>{k}: {typeof v === 'number' ? (v as number).toFixed(2) : String(v)}</span>))}
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="result-section-gap" />
                      </>
                    )}

                    {/* ── Position advice + params (combined section) ── */}
                    {effectiveTier !== 'free' && (result.result?.position_advice || (resultPositionParams && Object.values(resultPositionParams).some((v) => v?.trim()))) && (
                      <>
                        <div className="result-section result-section-animated">
                          {result.result?.position_advice && (
                            <div style={{ marginBottom: resultPositionParams && Object.values(resultPositionParams).some((v) => v?.trim()) ? '1rem' : 0 }}>
                              <div className="result-section-title">持仓建议</div>
                              <h3 className="desktop-only" style={{ fontSize: '0.875rem', fontWeight: '600', marginBottom: '0.5rem' }}>持仓建议</h3>
                              <p style={{ fontSize: '0.9rem', color: 'var(--muted)', lineHeight: '1.7', margin: 0 }}>
                                {result.result.position_advice.reason}
                                {typeof result.result.position_advice.suggested_quantity === 'number' ? `（建议数量: ${result.result.position_advice.suggested_quantity}）` : ''}
                              </p>
                            </div>
                          )}
                          {resultPositionParams && Object.values(resultPositionParams).some((v) => v?.trim()) && (
                            <div style={{ padding: '0.65rem 0.85rem', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '0.5rem' }}>
                              <div style={{ fontSize: '0.8rem', fontWeight: '600', marginBottom: '0.4rem', color: '#92400e' }}>本次分析持仓参数</div>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                                {resultPositionParams.holdingQuantity && <span style={{ fontSize: '0.75rem', padding: '0.15rem 0.5rem', background: '#fef3c7', borderRadius: '9999px', color: '#78350f' }}>持有 {resultPositionParams.holdingQuantity} 股</span>}
                                {resultPositionParams.costPrice && <span style={{ fontSize: '0.75rem', padding: '0.15rem 0.5rem', background: '#fef3c7', borderRadius: '9999px', color: '#78350f' }}>成本价 {resultPositionParams.costPrice}</span>}
                                {resultPositionParams.maxPosition && <span style={{ fontSize: '0.75rem', padding: '0.15rem 0.5rem', background: '#fef3c7', borderRadius: '9999px', color: '#78350f' }}>最大持仓 {resultPositionParams.maxPosition} 股</span>}
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="result-section-gap" />
                      </>
                    )}

                    {/* ── Upgrade banners / nudge ── */}
                    {/* Mobile: UpgradeNudge */}
                    {effectiveTier !== 'premium' && (
                      <>
                        <div className="result-section mobile-only result-section-animated" style={{ padding: 0 }}>
                          <UpgradeNudge tier={effectiveTier} pricing={pricing} onUpgrade={() => router.push('/upgrade')} />
                        </div>
                        <div className="result-section-gap mobile-only" />
                      </>
                    )}
                    {/* Desktop: original banners */}
                    <div className="desktop-only">
                      {effectiveTier === 'free' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '1.25rem' }}>
                          <div style={{ padding: '0.8rem 1rem', background: 'linear-gradient(135deg, #eff6ff, #dbeafe)', border: '1px solid #93c5fd', borderRadius: '0.625rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
                            <div><p style={{ fontWeight: 700, fontSize: '0.85rem', color: '#1d4ed8', marginBottom: '0.15rem' }}>📊 标准版 ¥19.9/月</p><p style={{ fontSize: '0.78rem', color: '#1e40af' }}>解锁深度研判 · 目标价止损 · 港股美股期货</p></div>
                            <button onClick={() => router.push('/upgrade')} style={{ fontSize: '0.82rem', fontWeight: 700, color: 'white', background: '#2563eb', border: 'none', borderRadius: '0.4rem', padding: '0.4rem 1rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>立即升级 →</button>
                          </div>
                          <div style={{ padding: '0.8rem 1rem', background: 'linear-gradient(135deg, #f5f3ff, #ede9fe)', border: '1px solid #a78bfa', borderRadius: '0.625rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
                            <div><p style={{ fontWeight: 700, fontSize: '0.85rem', color: '#6d28d9', marginBottom: '0.15rem' }}>💎 专业版 ¥49/月</p><p style={{ fontSize: '0.78rem', color: '#5b21b6' }}>针对持仓的个性化建议 · 每日15次 · 优先通道</p></div>
                            <button onClick={() => router.push('/upgrade')} style={{ fontSize: '0.82rem', fontWeight: 700, color: 'white', background: '#7c3aed', border: 'none', borderRadius: '0.4rem', padding: '0.4rem 1rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>了解详情 →</button>
                          </div>
                        </div>
                      )}
                      {effectiveTier === 'basic' && (
                        <div style={{ marginBottom: '1.25rem', padding: '0.8rem 1rem', background: 'linear-gradient(135deg, #f5f3ff, #ede9fe)', border: '1px solid #a78bfa', borderRadius: '0.625rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
                          <div><p style={{ fontWeight: 700, fontSize: '0.85rem', color: '#6d28d9', marginBottom: '0.15rem' }}>💎 专业版 ¥49/月</p><p style={{ fontSize: '0.78rem', color: '#5b21b6' }}>持仓智能分析不限次 · 每日15次 · 优先通道</p></div>
                          <button onClick={() => router.push('/upgrade')} style={{ fontSize: '0.82rem', fontWeight: 700, color: 'white', background: '#7c3aed', border: 'none', borderRadius: '0.4rem', padding: '0.4rem 1rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>升级专业版 →</button>
                        </div>
                      )}
                    </div>

                    {/* ── Action row ── */}
                    <div className="result-section result-action-section result-section-animated">
                      {/* Mobile action row: upgraded buttons */}
                      <div className="mobile-only" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {/* Remaining count badge */}
                        {result.usage?.remaining != null && (
                          <div style={{ textAlign: 'center' }}>
                            <span className="result-remaining-badge">
                              今日剩余<strong>{result.usage.remaining}</strong>次
                            </span>
                          </div>
                        )}
                        {/* Share row */}
                        {effectiveTier === 'free' ? (
                          <button
                            onClick={() => generateShareCard()}
                            disabled={shareLoading}
                            className="result-action-btn primary-share"
                            style={{ width: '100%' }}
                          >
                            {shareLoading ? '生成中…' : '📤 分享研判卡片'}
                          </button>
                        ) : (
                          <div style={{ display: 'flex', gap: '10px' }}>
                            <button
                              onClick={() => generateShareCard(undefined, undefined, undefined, true)}
                              disabled={saveLongLoading}
                              className="result-action-btn primary-save"
                              style={{ flex: 1 }}
                            >
                              {saveLongLoading ? '生成中…' : '💾 保存'}
                            </button>
                            <button
                              onClick={() => generateShareCard()}
                              disabled={shareLoading}
                              className="result-action-btn primary-share"
                              style={{ flex: 1 }}
                            >
                              {shareLoading ? '生成中…' : '📤 分享'}
                            </button>
                          </div>
                        )}
                        {/* Continue */}
                        <button
                          onClick={handleBackToAnalyze}
                          className="result-action-btn ghost-continue"
                          style={{ width: '100%' }}
                        >
                          继续分析
                        </button>
                      </div>
                      {/* Desktop action row */}
                      <div className="desktop-only" style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <div style={{ textAlign: 'center', fontSize: '0.8rem', color: 'var(--muted)' }}>
                          今日剩余次数: {result.usage?.remaining}
                        </div>
                        {effectiveTier === 'free' ? (
                          <button onClick={() => generateShareCard()} disabled={shareLoading} style={{ width: '100%', padding: '0.6rem', fontSize: '0.9rem', fontWeight: 700, background: shareLoading ? '#fca5a5' : 'linear-gradient(135deg,#dc2626,#ef4444)', border: 'none', borderRadius: '0.5rem', cursor: shareLoading ? 'default' : 'pointer', color: 'white', boxShadow: shareLoading ? 'none' : '0 3px 10px rgba(220,38,38,0.4)' }}>
                            {shareLoading ? '生成中…' : '📤 分享研判卡片'}
                          </button>
                        ) : (
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button onClick={() => generateShareCard(undefined, undefined, undefined, true)} disabled={saveLongLoading} style={{ flex: 1, padding: '0.6rem', fontSize: '0.9rem', fontWeight: 700, background: saveLongLoading ? '#86efac' : 'linear-gradient(135deg,#15803d,#22c55e)', border: 'none', borderRadius: '0.5rem', cursor: saveLongLoading ? 'default' : 'pointer', color: 'white', boxShadow: saveLongLoading ? 'none' : '0 3px 10px rgba(34,197,94,0.4)' }}>{saveLongLoading ? '生成中…' : '💾 保存长图'}</button>
                            <button onClick={() => generateShareCard()} disabled={shareLoading} style={{ flex: 1, padding: '0.6rem', fontSize: '0.9rem', fontWeight: 700, background: shareLoading ? '#fca5a5' : 'linear-gradient(135deg,#dc2626,#ef4444)', border: 'none', borderRadius: '0.5rem', cursor: shareLoading ? 'default' : 'pointer', color: 'white', boxShadow: shareLoading ? 'none' : '0 3px 10px rgba(220,38,38,0.4)' }}>{shareLoading ? '生成中…' : '📤 分享卡片'}</button>
                          </div>
                        )}
                        <button className="btn btn-primary" style={{ width: '100%' }} onClick={handleBackToAnalyze}>
                          继续分析
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Desktop history */}
                  {history.length > 0 && (
                    <div className="card desktop-only" style={{ marginTop: '1rem' }}>
                      <h3 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '0.75rem' }}>📋 历史查询（服务器已保存）</h3>
                      <div style={{ display: 'grid', gap: '0.5rem' }}>
                        {history.slice(0, 5).map((h) => (
                          <div key={h.id} style={{ border: '1px solid var(--border)', borderRadius: '0.5rem', padding: '0.5rem 0.75rem', fontSize: '0.875rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                              <span>{h.name ? `${h.name} (${h.symbol})` : h.symbol} | {h.action === 'buy' ? '🔴 买入' : h.action === 'sell' ? '🟢 卖出' : '🟡 观望'} | {h.confidence ?? '-'}% | {new Date(h.analyzedAt || Date.now()).toLocaleString()}</span>
                              <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
                                <button className="btn btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', borderColor: selectedHistoryId === h.id ? 'var(--primary)' : undefined }} onClick={() => handleOpenHistoryDetail(h)}>
                                  {selectedHistoryId === h.id ? '当前查看' : '查看详情'}
                                </button>
                                {h.detail && (
                                  effectiveTier === 'free' ? (
                                    <button style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem', background: 'linear-gradient(135deg,#dc2626,#ef4444)', color: 'white', border: 'none', borderRadius: '0.4rem', cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap' }} onClick={() => generateShareCard(undefined, h.detail as typeof result, h.analyzedAt)}>📤 分享</button>
                                  ) : (
                                    <>
                                      <button style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem', background: 'linear-gradient(135deg,#15803d,#22c55e)', color: 'white', border: 'none', borderRadius: '0.4rem', cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap' }} onClick={() => generateShareCard(undefined, h.detail as typeof result, h.analyzedAt, true)}>💾 保存</button>
                                      <button style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem', background: 'linear-gradient(135deg,#dc2626,#ef4444)', color: 'white', border: 'none', borderRadius: '0.4rem', cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap' }} onClick={() => generateShareCard(undefined, h.detail as typeof result, h.analyzedAt, false)}>📤 分享</button>
                                    </>
                                  )
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* Desktop only — mobile empty state is handled by .rg-screen above */
                <div className="desktop-only" style={{ flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', padding: '2rem 1.5rem' }}>
                  <div style={{ fontSize: '4rem', marginBottom: '1rem', lineHeight: 1 }}>📊</div>
                  <div style={{ fontSize: '20px', fontWeight: 700, color: '#1c1c1e', marginBottom: '8px', textAlign: 'center' }}>尚无分析结果</div>
                  <div style={{ fontSize: '15px', color: '#8e8e93', marginBottom: '2rem', textAlign: 'center', lineHeight: 1.5 }}>输入股票代码，让 AI 判断<br/>现在是买入、卖出还是等待</div>
                  <button onClick={handleBackToAnalyze} style={{ height: '50px', padding: '0 2rem', fontSize: '17px', fontWeight: 600, background: '#007aff', color: 'white', border: 'none', borderRadius: '14px', cursor: 'pointer', boxShadow: '0 4px 14px rgba(0,122,255,0.35)' }}>
                    开始分析
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      <footer className="desktop-only" style={{ textAlign: 'center', padding: '1.25rem 1rem', fontSize: '0.75rem', color: 'var(--muted)', borderTop: '1px solid var(--border)', marginTop: 'auto' }}>
        <span>© {new Date().getFullYear()} {appName}</span>
        <span style={{ margin: '0 0.75rem' }}>·</span>
        <a href="/privacy" style={{ color: 'var(--muted)', textDecoration: 'none' }}>隐私政策</a>
        <span style={{ margin: '0 0.75rem' }}>·</span>
        <a href="/terms" style={{ color: 'var(--muted)', textDecoration: 'none' }}>服务条款</a>
      </footer>

      {/* ═══ BOTTOM NAV (mobile only) ═══ */}
      <BottomNav
        activePanel={activePanel}
        setActivePanel={setActivePanel}
        hasResult={!!result}
        hasHistory={history.length > 0}
        historyCount={history.length}
        tier={tier}
        onUpgrade={() => router.push('/upgrade')}
        onAccount={() => setUserMenuOpen(true)}
      />

      {/* ═══ HISTORY SHEET (mobile) ═══ */}
      <HistorySheet
        isOpen={historySheetOpen}
        onClose={() => setHistorySheetOpen(false)}
        history={history}
        selectedHistoryId={selectedHistoryId}
        tier={tier}
        onOpenDetail={(h) => { handleOpenHistoryDetail(h); }}
        onShare={(h, longImage) => generateShareCard(undefined, h.detail as typeof result, h.analyzedAt, longImage)}
      />

      {/* ═══ SHARE PREVIEW SHEET ═══ */}
      <SharePreviewSheet
        isOpen={sharePreviewOpen}
        blob={sharePreviewBlob}
        filename={sharePreviewFilename}
        onClose={() => setSharePreviewOpen(false)}
        actionColor={sharePreviewActionColor}
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
    </div>
  );
}
