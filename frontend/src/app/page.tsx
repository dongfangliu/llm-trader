'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore, useAnalysisStore } from '@/lib/store';
import {
  analyze,
  getUsage,
  getLimits,
  getMarketData,
  getAnalysisHistory,
  getAppConfig,
  getPricing,
  PricingData,
  AnalyzeRequest,
  AnalysisHistoryItem,
} from '@/lib/api';

import { generateShareCardBlob, generateViralShareCardBlob, generatePredictionCardBlob, downloadBlob } from '@/lib/shareCard';
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

const ENV_APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || '财财技术洞见';

const HOT_STOCKS = [
  { code: '600519', name: '贵州茅台', market: 'a' },
  { code: '300750', name: '宁德时代', market: 'a' },
  { code: '002594', name: '比亚迪', market: 'a' },
  { code: '00700', name: '腾讯', market: 'hk' },
  { code: 'AAPL', name: '苹果', market: 'us' },
  { code: '600036', name: '招商银行', market: 'a' },
  { code: '3690', name: '美团', market: 'hk' },
  { code: 'BABA', name: '阿里巴巴', market: 'us' },
  { code: '1810', name: '小米', market: 'hk' },
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

  const [appName, setAppName] = useState(ENV_APP_NAME);
  const [limits, setLimits] = useState<any>(null);
  const [marketData, setMarketData] = useState<any>(null);
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

  // Share card — generates viral card, shows preview sheet
  const handleShareViralCard = async (resultOverride?: typeof result, analyzedAtOverride?: string | null) => {
    const activeResult = resultOverride ?? result;
    if (!activeResult) return;
    setShareLoading(true);
    try {
      const activeAnalyzedAt = (analyzedAtOverride !== undefined ? analyzedAtOverride : analyzeStartedAt) || new Date().toISOString();
      const r = activeResult.result ?? {};
      const d = activeResult.data ?? {};

      // Extract reason excerpt (≤60 chars, strip markdown)
      const rawReason: string = r.reason || r.market_diagnosis || '';
      const reasonExcerpt = rawReason.replace(/[*#`_>\[\]]/g, '').slice(0, 60).trim();

      const { blob, filename } = await generatePredictionCardBlob({
        stockName:        d.name || d.symbol || '',
        stockCode:        d.symbol || '',
        market:           d.market || 'a',
        action:           r.action || 'hold',
        confidence:       r.confidence ?? null,
        latestPrice:      d.latest_price ?? null,
        targetPrice:      r.target_price ?? null,
        stopLoss:         r.stop_loss ?? null,
        opportunityGrade: r.opportunity_quality ?? null,
        reasonExcerpt,
        analyzedAt:       activeAnalyzedAt,
        tier,
        appName:          ENV_APP_NAME,
        appBaseUrl:       typeof window !== 'undefined' ? window.location.origin : undefined,
      });
      setSharePreviewBlob(blob);
      setSharePreviewFilename(filename);
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
        analyzedAt: activeAnalyzedAt,
        appName: ENV_APP_NAME,
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
    // Auth check runs in parallel without blocking render
    checkAuth().catch(() => setError('初始化失败，请刷新页面重试'));

    getAppConfig()
      .then((cfg) => { if (cfg?.app_name) setAppName(cfg.app_name); })
      .catch(() => {});

    getPricing()
      .then(setPricing)
      .catch(() => {});
  }, [router]);

  // Load limits
  useEffect(() => {
    if (user) {
      // Logged-in: use account-based limits (USER_LIMITS, free=3/day)
      getLimits().then((data) => {
        setLimits({ remaining: data.remaining, daily_limit: data.daily_limit });
      }).catch(console.error);
    } else if (deviceId) {
      // Guest: use device-based limits (LIMITS, free=1/day)
      getUsage(deviceId).then((usage) => {
        setLimits({
          remaining: usage.remaining,
          daily_limit: usage.daily_limit ?? (usage.subscription === 'premium' ? 15 : usage.subscription === 'basic' ? 5 : 1),
        });
      }).catch(console.error);
    }
  }, [deviceId, user]);

  useEffect(() => {
    if (!deviceId) return;
    getAnalysisHistory(30, deviceId)
      .then((res) => { setHistory((res.items || []).map(toHistoryCardItem)); })
      .catch(() => {});
  }, [deviceId, user?.id]);

  useEffect(() => {
    if (limits && limits.remaining <= 0 && tier !== 'premium') setShowUpgradeBanner(true);
  }, [limits, tier]);

  useEffect(() => {
    if (tier === 'free' && market !== 'a') setMarket('a');
  }, [tier, market, setMarket]);

  useEffect(() => {
    const next = getMarketRecommendations(market);
    setHotRecommendations(next);
    setLastHotRecommendationSignature(getRecommendationSignature(next));
    setShowHotRecommendations(false);
  }, [market]);

  useEffect(() => {
    if (symbol && market) {
      getMarketData(market, symbol, period, 30)
        .then(setMarketData)
        .catch(() => setMarketData(null));
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
    // ── Client-side validation ──────────────────────────────────────
    const symErr = validateSymbol(symbol, market);
    if (symErr) { setError(symErr); return; }

    const isPremium = tier === 'premium';
    if (isPremium || tier === 'basic') {
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

      const response = await analyze(request);
      clearTimeout(timeoutHandle);
      setResult(response);
      setLimits(response.usage);
      const nowIso = new Date().toISOString();
      setAnalyzeStartedAt(nowIso);
      const usedPosition = [holdingQuantity, costPrice, maxPosition].some((v) => v.trim())
        ? { holdingQuantity, costPrice, maxPosition }
        : null;
      setResultPositionParams(usedPosition);

      const item = {
        id: String(response.history?.id || `${Date.now()}_${response.data?.symbol || symbol.trim()}`),
        symbol: response.data?.symbol || symbol.trim().toUpperCase(),
        name: response.data?.name || '',
        market: market,
        action: response.result?.action,
        confidence: response.result?.confidence,
        analyzedAt: (response.history as any)?.analyzed_at || nowIso,
        positionParams: usedPosition,
        detail: response,
      };
      setHistory((prev) => [item, ...prev.filter((h) => h.id !== item.id)].slice(0, 30));
      setSelectedHistoryId(item.id);

      // Multi-period: only for basic/premium
      if (multiPeriodEnabled && (tier === 'basic' || tier === 'premium') && auxiliaryPeriods.length > 0) {
        const mpResults: { period: string; result: any }[] = [
          { period, result: response },
        ];
        for (const auxPeriod of auxiliaryPeriods) {
          try {
            const auxResp = await analyze({ ...request, period: auxPeriod as any });
            mpResults.push({ period: auxPeriod, result: auxResp });
          } catch (auxErr) {
            // skip failed auxiliary periods silently
          }
        }
        setMultiPeriodResults(mpResults);
      }

      setActivePanel('result');
      setResultSheetOpen(true);
      setActiveTab(0);
    } catch (err: any) {
      clearTimeout(timeoutHandle);
      const status = err?.response?.status;
      const detail = err?.response?.data?.detail;
      if (status === 401) {
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
  const handleBackToAnalyze = () => { setResultSheetOpen(false); setActivePanel('analyze'); setAnalyzeTimedOut(false); };
  const handleLogout = () => { logout(); router.push('/login'); };

  const toggleAuxPeriod = (p: string) => {
    setAuxiliaryPeriods((prev) => {
      if (prev.includes(p)) return prev.filter((x) => x !== p);
      if (prev.length >= 3) return prev;
      return [...prev, p];
    });
  };

  if (!user && !deviceId) {
    return (
      <div className="app-shell" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <div className="spinner"></div>
      </div>
    );
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
  const hasMultiPeriod = (tier === 'premium' || tier === 'basic') && multiPeriodResults.length > 1;
  const allTabs = hasMultiPeriod
    ? [...fourStepTabs, { label: '📊 多周期对比', key: '__multiperiod__' }]
    : fourStepTabs;

  return (
    <div className="app-shell">
      <Toast toast={toast} />
      <ErrorReportDialog error={errorReport} onClose={() => setErrorReport(null)} />

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
                color: tier === 'premium' ? '#7c3aed' : tier === 'basic' ? '#007aff' : '#8e8e93',
              }}>
                {tierLabel} · {limits?.remaining ?? '-'}次
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
                {tier !== 'premium' && (
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
          {activePanel === 'analyze' && (
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
                      <option value="hk" disabled={tier === 'free'}>港股{tier === 'free' ? '（基础版起）' : ''}</option>
                      <option value="us" disabled={tier === 'free'}>美股{tier === 'free' ? '（基础版起）' : ''}</option>
                      <option value="futures" disabled={tier === 'free'}>期货{tier === 'free' ? '（基础版起）' : ''}</option>
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
                      onChange={(e) => setSymbol(e.target.value)}
                    />
                    {symbolWarning && symbol.trim() && (
                      <p style={{ fontSize: '0.8rem', color: '#b45309', marginTop: '0.4rem' }}>⚠️ {symbolWarning}</p>
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
                      <input type="checkbox" id="multi-period-toggle-d" checked={multiPeriodEnabled} disabled={tier === 'free'} onChange={(e) => { setMultiPeriodEnabled(e.target.checked); if (!e.target.checked) setAuxiliaryPeriods([]); }} style={{ width: '1rem', height: '1rem', cursor: tier === 'free' ? 'not-allowed' : 'pointer' }} />
                      <label htmlFor="multi-period-toggle-d" style={{ fontSize: '0.875rem', fontWeight: 500, cursor: tier === 'free' ? 'not-allowed' : 'pointer', color: tier === 'free' ? 'var(--muted)' : undefined }} title={tier === 'free' ? '基础版起可用' : undefined}>
                        多周期分析{tier === 'free' && <span style={{ marginLeft: '0.35rem', fontSize: '0.75rem' }}>(基础版起可用)</span>}
                      </label>
                    </div>
                    {multiPeriodEnabled && tier !== 'free' && (
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
                        {(tier === 'basic' || tier === 'premium') && (
                          <span style={{ fontSize: '0.75rem', color: '#92400e' }}>
                            {([holdingQuantity, costPrice, maxPosition].filter((v) => v.trim()).length === 0) ? '当前：空仓模式' : '当前：已填写持仓参数'}
                          </span>
                        )}
                      </div>
                      {tier === 'premium' ? (
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
                    {(tier === 'basic' || tier === 'premium') && premiumInputsOpen && (
                      <div style={{ marginTop: '0.85rem' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
                          <div className="form-group"><label className="label">持有数量(股)</label><input className="input" value={holdingQuantity} onChange={(e) => setHoldingQuantity(e.target.value)} /></div>
                          <div className="form-group"><label className="label">成本价</label><input className="input" value={costPrice} onChange={(e) => setCostPrice(e.target.value)} /></div>
                          <div className="form-group"><label className="label">最大持仓(股)</label><input className="input" value={maxPosition} onChange={(e) => setMaxPosition(e.target.value)} /></div>
                        </div>
                        <p style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: '0.25rem' }}>3项都不填=默认空仓；若填写则3项必须全部填写。</p>
                      </div>
                    )}
                  </div>
                  {error && <div className="error">{error}</div>}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <button className="btn btn-primary" style={{ width: '100%', marginTop: '1rem' }} onClick={handleAnalyze} disabled={!symbol.trim()}>
                      {tier === 'premium' && premiumPendingCount > 0 ? `开始分析（进行中 ${premiumPendingCount}）` : '开始分析'}
                    </button>
                    {result && (
                      <button className="btn btn-secondary" style={{ width: '100%' }} onClick={handleOpenResultPanel}>
                        查看结果
                      </button>
                    )}
                  </div>
                </div>

                {/* ── Mobile iOS grouped sections layout ── */}
                <div className="mobile-only" style={{ flexDirection: 'column', width: '100%' }}>
                  {/* ── Section 1: Title + Market selector ── */}
                  <div style={{ background: 'white', borderBottom: '0.5px solid rgba(60,60,67,0.12)' }}>
                    <div style={{ padding: '16px 16px 10px' }}>
                      <h2 style={{ fontSize: '24px', fontWeight: 700, letterSpacing: '-0.3px', color: '#000', margin: 0 }}>今天分析哪只？</h2>
                    </div>
                    <div style={{ padding: '4px 16px 14px' }}>
                      <MarketSegmented value={market} onChange={setMarket} tier={tier} onLockedClick={() => router.push('/upgrade')} />
                    </div>
                  </div>
                  {/* ── Section gap ── */}
                  <div style={{ height: '28px', background: '#f2f2f7' }} />
                  {/* ── Section 2: Symbol input + hot stocks ── */}
                  <div style={{ background: 'white', borderTop: '0.5px solid rgba(60,60,67,0.12)', borderBottom: '0.5px solid rgba(60,60,67,0.12)' }}>
                    <div style={{ padding: '12px 16px 8px' }}>
                      <input
                        type="text"
                        className="input"
                        placeholder={market === 'a' ? '股票代码，如 600519' : market === 'hk' ? '港股代码，如 00700' : market === 'us' ? '美股代码，如 AAPL' : '期货代码，如 MA'}
                        value={symbol}
                        onChange={(e) => setSymbol(e.target.value)}
                      />
                      {symbolWarning && symbol.trim() && (
                        <p style={{ fontSize: '13px', color: '#ff9500', marginTop: '6px' }}>⚠️ {symbolWarning}</p>
                      )}
                      {marketData && !symbolWarning && (
                        <p style={{ fontSize: '13px', color: '#34c759', marginTop: '6px' }}>✓ 找到 {marketData.count} 条数据</p>
                      )}
                    </div>
                    <div style={{ height: '0.5px', background: 'rgba(60,60,67,0.1)', margin: '0 16px' }} />
                    <div style={{ padding: '10px 16px 14px' }}>
                      <HotStocksStrip stocks={hotRecommendations} onSelect={handleHotStockClick} onRefresh={handleRefreshHotRecommendations} />
                    </div>
                  </div>
                  {/* ── Section gap ── */}
                  <div style={{ height: '28px', background: '#f2f2f7' }} />
                  {/* ── Section 3: Advanced settings ── */}
                  <div style={{ background: 'white', borderTop: '0.5px solid rgba(60,60,67,0.12)', borderBottom: '0.5px solid rgba(60,60,67,0.12)' }}>
                    <AdvancedSettingsPanel
                      period={period} setPeriod={setPeriod}
                      multiPeriodEnabled={multiPeriodEnabled}
                      setMultiPeriodEnabled={(v) => { setMultiPeriodEnabled(v); if (!v) setAuxiliaryPeriods([]); }}
                      auxiliaryPeriods={auxiliaryPeriods} toggleAuxPeriod={toggleAuxPeriod}
                      holdingQuantity={holdingQuantity} setHoldingQuantity={setHoldingQuantity}
                      costPrice={costPrice} setCostPrice={setCostPrice}
                      maxPosition={maxPosition} setMaxPosition={setMaxPosition}
                      premiumInputsOpen={premiumInputsOpen} setPremiumInputsOpen={setPremiumInputsOpen}
                      tier={tier} onUpgrade={() => router.push('/upgrade')}
                    />
                  </div>
                  {/* ── Section gap + Upgrade teaser ── */}
                  {tier !== 'premium' && (
                    <>
                      <div style={{ height: '28px', background: '#f2f2f7' }} />
                      <div style={{ background: 'white', borderTop: '0.5px solid rgba(60,60,67,0.12)', borderBottom: '0.5px solid rgba(60,60,67,0.12)' }}>
                        <UpgradeTeaser tier={tier} pricing={pricing} onUpgrade={() => router.push('/upgrade')} />
                      </div>
                    </>
                  )}
                   {/* Bottom safe area padding — must clear FAB height */}
                  <div style={{ height: '140px', background: '#f2f2f7' }} />
                  {showUpgradeBanner && (
                    <div style={{ padding: '12px 16px', borderTop: '0.5px solid rgba(60,60,67,0.18)', background: '#fff9f0' }}>
                      {tier === 'basic' ? (
                        <>
                          <p style={{ fontWeight: 600, marginBottom: '4px', fontSize: '15px' }}>今日次数已用完</p>
                          <p style={{ fontSize: '13px', color: '#8e8e93', marginBottom: '10px' }}>升级专业版，每天 {pricing?.premium?.daily_limit ?? 15} 次</p>
                          <button className="btn btn-primary" onClick={() => router.push('/upgrade')} style={{ width: '100%', background: '#7c3aed', border: 'none' }}>升级专业版</button>
                        </>
                      ) : (
                        <>
                          <p style={{ fontWeight: 600, marginBottom: '4px', fontSize: '15px' }}>今日次数已用完</p>
                          <p style={{ fontSize: '13px', color: '#8e8e93', marginBottom: '10px' }}>升级标准版 ¥{pricing?.basic?.price ?? '19.9'}/月</p>
                          <button className="btn btn-primary" onClick={() => router.push('/upgrade')} style={{ width: '100%', background: '#ff9500', border: 'none' }}>立即升级</button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Desktop: quota exceeded banner */}
              {showUpgradeBanner && (
                <div className="desktop-only card mb-3" style={{ background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)', border: '1px solid #f59e0b' }}>
                  <div style={{ textAlign: 'center' }}>
                    {tier === 'basic' ? (
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
              {tier !== 'premium' && (
                <div className="desktop-only" style={{ marginTop: '0.5rem' }}>
                  <p style={{ fontWeight: 700, fontSize: '0.88rem', marginBottom: '0.7rem', color: 'var(--muted)', textAlign: 'center' }}>🔒 升级后解锁以下功能</p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
                    {tier === 'free' && (
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

              {/* Mobile FAB: analyze button */}
              <div className="mobile-only fab-container">
                {error && <div className="error" style={{ marginBottom: '8px', fontSize: '13px', borderRadius: '8px' }}>{error}</div>}
                <button
                  className="fab-btn"
                  onClick={handleAnalyze}
                  disabled={!symbol.trim()}
                >
                  {tier === 'premium' && premiumPendingCount > 0 ? `分析中（${premiumPendingCount}）` : '开始分析'}
                </button>
              </div>
            </div>
          )}

          {/* ═══ LOADING PANEL ═══ */}
          {activePanel === 'loading' && (
            <div>
              {/* Mobile narrative loading — V7 cinema-grade */}
              <div className="mobile-only">
                <div style={{ minHeight: '100dvh', background: '#f2f2f7', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 0 2rem' }}>
                  {analyzeTimedOut ? (
                    /* ── Timeout state ── */
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '2.5rem 2rem', textAlign: 'center' }}>
                      <div style={{ fontSize: '3rem', marginBottom: '1rem', lineHeight: 1 }}>⏰</div>
                      <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#b45309', marginBottom: '0.5rem', margin: '0 0 8px' }}>分析时间较长</h2>
                      <p style={{ fontSize: '0.9rem', color: '#636366', lineHeight: 1.7, marginBottom: '1.75rem', margin: '0 0 28px' }}>
                        AI 服务响应超过 3 分钟，可能是服务繁忙。<br />可以等待继续，或返回重试。
                      </p>
                      <button
                        onClick={handleBackToAnalyze}
                        style={{ width: '100%', maxWidth: 280, padding: '13px 0', borderRadius: 12, background: '#f2f2f7', border: '1px solid #e5e5ea', fontSize: '15px', fontWeight: 600, color: '#1c1c1e', cursor: 'pointer' }}
                      >
                        返回重试
                      </button>
                    </div>
                  ) : (
                    /* ── Normal loading state ── */
                    <>
                      {/* Hero card: symbol + subtitle */}
                      <div style={{ background: '#ffffff', borderRadius: 16, padding: '24px 24px 20px', margin: '0 16px 20px', width: 'calc(100% - 32px)', boxSizing: 'border-box', boxShadow: '0 1px 3px rgba(0,0,0,0.07)' }}>
                        <div style={{ fontSize: '40px', fontWeight: 800, letterSpacing: '-0.5px', color: '#1c1c1e', lineHeight: 1.1 }}>
                          {analyzingSymbol}
                        </div>
                        <div style={{ fontSize: '13px', color: '#8e8e93', marginTop: '4px' }}>正在深度研判</div>
                      </div>

                      {/* Step pipeline */}
                      {(() => {
                        const steps = [
                          { icon: '📥', label: '数据获取' },
                          { icon: '📊', label: '指标计算' },
                          { icon: '🧠', label: 'AI建模' },
                          { icon: '📝', label: '生成报告' },
                        ];
                        const completedSteps = Math.min(Math.floor(narrativeIdx / 2), 3);
                        const activeStep = completedSteps < 4 ? completedSteps : 3;
                        return (
                          <div style={{ width: 'calc(100% - 32px)', margin: '0 16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            {steps.map((step, i) => {
                              const isCompleted = i < completedSteps;
                              const isActive = i === activeStep && completedSteps < 4;
                              const isPending = !isCompleted && !isActive;
                              const lineColor = i < completedSteps ? '#34c759' : '#e5e5ea';
                              return (
                                <div key={step.label} style={{ display: 'flex', alignItems: 'center', flex: i < steps.length - 1 ? '1 1 auto' : '0 0 auto' }}>
                                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                                    {/* Circle indicator */}
                                    <div style={{
                                      width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                      background: isCompleted ? '#34c759' : isActive ? '#007aff' : '#e5e5ea',
                                      fontSize: isCompleted ? '15px' : '16px',
                                      transition: 'background 0.4s ease',
                                    }}>
                                      {isCompleted ? '✓' : step.icon}
                                    </div>
                                    {/* Label */}
                                    <div style={{
                                      fontSize: '10px', fontWeight: 500,
                                      color: isCompleted ? '#34c759' : isActive ? '#007aff' : '#c7c7cc',
                                      transition: 'color 0.4s ease', whiteSpace: 'nowrap',
                                    }}>
                                      {step.label}
                                    </div>
                                  </div>
                                  {/* Connector line */}
                                  {i < steps.length - 1 && (
                                    <div style={{ flex: 1, height: 2, margin: '0 4px', marginBottom: '18px', background: lineColor, transition: 'background 0.4s ease', borderRadius: 1 }} />
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}

                      {/* Narrative message */}
                      <div style={{ width: 'calc(100% - 48px)', margin: '0 24px 0', textAlign: 'center' }}>
                        <p
                          key={narrativeIdx}
                          style={{ fontSize: '17px', fontWeight: 500, color: '#1c1c1e', lineHeight: 1.5, margin: 0, animation: 'narrative-fade 0.4s ease-out', minHeight: '1.6em' }}
                        >
                          {NARRATIVE_TEXTS[narrativeIdx]}
                        </p>
                      </div>

                      {/* Progress bar */}
                      <div style={{ width: 'calc(100% - 48px)', height: 3, background: '#e5e5ea', borderRadius: 9999, overflow: 'hidden', margin: '20px 24px 0' }}>
                        <div style={{ height: '100%', background: '#007aff', borderRadius: 9999, animation: 'narrative-progress 3.6s ease-in-out infinite' }} />
                      </div>

                      {/* Footer */}
                      <div style={{ marginTop: '16px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                        <p style={{ fontSize: '12px', color: '#aeaeb2', margin: 0 }}>预计耗时 1–3 分钟</p>
                        {premiumPendingCount > 1 && (
                          <p style={{ fontSize: '12px', color: '#aeaeb2', margin: 0 }}>队列中还有 {premiumPendingCount - 1} 个分析任务</p>
                        )}
                        {tier === 'premium' && (
                          <button
                            onClick={() => setActivePanel('analyze')}
                            style={{ background: 'none', border: 'none', fontSize: '15px', fontWeight: 500, color: '#007aff', cursor: 'pointer', marginTop: '4px', padding: '4px 0' }}
                          >
                            继续下一个分析 →
                          </button>
                        )}
                      </div>
                    </>
                  )}
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
                      {tier === 'premium' && (<button className="btn btn-secondary" style={{ marginTop: '0.5rem' }} onClick={() => setActivePanel('analyze')}>继续下一个分析 →</button>)}
                    </>
                  )}
                </div>
              </div>
            </div>
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
                    tier={tier}
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
                        {tier === 'free' ? (
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
                        <SignalHero result={result} tier={tier} period={period} />
                      </div>
                      {/* Desktop: original signal block */}
                      <div className="desktop-only">
                        {tier === 'free' ? (
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
                      {tier === 'free' ? (
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
                    {tier !== 'free' && result.result && (
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
                    {tier !== 'free' && (result.result?.risk_factors?.length > 0 || result.result?.indicators) && (
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
                    {tier !== 'free' && (result.result?.position_advice || (resultPositionParams && Object.values(resultPositionParams).some((v) => v?.trim()))) && (
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
                    {tier !== 'premium' && (
                      <>
                        <div className="result-section mobile-only result-section-animated" style={{ padding: 0 }}>
                          <UpgradeNudge tier={tier} pricing={pricing} onUpgrade={() => router.push('/upgrade')} />
                        </div>
                        <div className="result-section-gap mobile-only" />
                      </>
                    )}
                    {/* Desktop: original banners */}
                    <div className="desktop-only">
                      {tier === 'free' && (
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
                      {tier === 'basic' && (
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
                        {tier === 'free' ? (
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
                        {tier === 'free' ? (
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
                                  tier === 'free' ? (
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
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', padding: '2rem 1.5rem' }}>
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
