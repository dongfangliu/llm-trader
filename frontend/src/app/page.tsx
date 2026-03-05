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

import { generateShareCardBlob, downloadBlob } from '@/lib/shareCard';

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
function getErrorMessage(err: any): string {
  const status = err?.response?.status;
  const detail = err?.response?.data?.detail as string | undefined;
  if (!status && !err?.response) return '⚠️ 网络连接失败，请检查网络后重试';
  if (status === 400) return `⚠️ ${detail || '请求参数有误，请检查输入'}`;
  if (status === 401) return '🔒 登录已过期，请重新登录';
  if (status === 403) return `🚫 ${detail || '当前版本不支持该功能，请升级套餐'}`;
  if (status === 404) return `🔍 ${detail || '未找到该股票/期货数据，请检查代码'}`;
  if (status === 429) return '⏱ 今日分析次数已用完，升级会员获取更多次数';
  if (status === 502) return `🤖 ${detail || 'AI 响应格式异常，请重试'}`;
  if (status === 503) return `🔧 ${detail || 'AI 分析服务暂时不可用，请稍后重试'}`;
  if (status === 504) return '⏰ AI 分析超时，服务器响应较慢，请稍后重试';
  if (status >= 500) return '🚨 服务器繁忙，请稍后重试';
  return `⚠️ ${detail || '分析失败，请重试'}`;
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
  const [plannedInvestment, setPlannedInvestment] = useState('');
  const [maxPosition, setMaxPosition] = useState('');
  const [history, setHistory] = useState<any[]>([]);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
  const [premiumPendingCount, setPremiumPendingCount] = useState(0);
  const [premiumInputsOpen, setPremiumInputsOpen] = useState(true);
  const [showQuickTips, setShowQuickTips] = useState(false);
  const [showHotRecommendations, setShowHotRecommendations] = useState(false);
  const [hotRecommendations, setHotRecommendations] = useState<typeof HOT_STOCKS>([]);
  const [lastHotRecommendationSignature, setLastHotRecommendationSignature] = useState('');
  const [activePanel, setActivePanel] = useState<'analyze' | 'loading' | 'result'>('analyze');
  const [analyzingSymbol, setAnalyzingSymbol] = useState('');

  // Multi-period
  const [multiPeriodEnabled, setMultiPeriodEnabled] = useState(false);
  const [auxiliaryPeriods, setAuxiliaryPeriods] = useState<string[]>([]);
  const [multiPeriodResults, setMultiPeriodResults] = useState<{ period: string; result: any }[]>([]);

  // Four-step tab
  const [activeTab, setActiveTab] = useState(0);

  // Share card
  const [shareLoading, setShareLoading] = useState(false);
  const [saveLongLoading, setSaveLongLoading] = useState(false);
  const [shareConfirmOpen, setShareConfirmOpen] = useState(false);
  const [sharePendingLongImage, setSharePendingLongImage] = useState(false);

  // Metadata for current result
  const [analyzeStartedAt, setAnalyzeStartedAt] = useState<string | null>(null);
  const [resultPositionParams, setResultPositionParams] = useState<{
    holdingQuantity?: string; costPrice?: string; plannedInvestment?: string; maxPosition?: string;
  } | null>(null);

  // Symbol format warning (client-side, not blocking)
  const [symbolWarning, setSymbolWarning] = useState<string | null>(null);

  // Analysis timeout tracking
  const [analyzeTimedOut, setAnalyzeTimedOut] = useState(false);

  // Pricing data from backend
  const [pricing, setPricing] = useState<PricingData | null>(null);

  const tier = user?.subscription_tier ?? 'free';

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
    checkAuth().then(async () => {
      const id = getOrCreateDeviceId();
      setDeviceId(id);
    }).catch(() => setError('初始化失败，请刷新页面重试'));

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
    if (limits && limits.remaining <= 0) setShowUpgradeBanner(true);
  }, [limits]);

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
      const piErr = validatePositiveFloat(plannedInvestment, '计划投入');
      if (piErr) { setError(piErr); return; }
      const mpErr = validatePositiveInt(maxPosition, '最大持仓');
      if (mpErr) { setError(mpErr); return; }
      const holdingInputs = [holdingQuantity, costPrice, plannedInvestment, maxPosition].map((v) => v.trim());
      const filledCount = holdingInputs.filter(Boolean).length;
      if (filledCount > 0 && filledCount < 4) {
        setError('持仓信息需 4 项一起填写：持有数量、成本价、本股计划投入、最大持仓；不填则按空仓处理');
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
        planned_investment: plannedInvestment ? Number(plannedInvestment) : undefined,
        max_position: maxPosition ? Number(maxPosition) : undefined,
      };

      const response = await analyze(request);
      clearTimeout(timeoutHandle);
      setResult(response);
      setLimits(response.usage);
      const nowIso = new Date().toISOString();
      setAnalyzeStartedAt(nowIso);
      const usedPosition = [holdingQuantity, costPrice, plannedInvestment, maxPosition].some((v) => v.trim())
        ? { holdingQuantity, costPrice, plannedInvestment, maxPosition }
        : null;
      setResultPositionParams(usedPosition);

      const item = {
        id: String(response.history?.id || `${Date.now()}_${response.data?.symbol || symbol.trim()}`),
        symbol: response.data?.symbol || symbol.trim().toUpperCase(),
        name: response.data?.name || '',
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
      setActiveTab(0);
    } catch (err: any) {
      clearTimeout(timeoutHandle);
      const msg = getErrorMessage(err);
      setError(msg);
      setActivePanel('analyze');
      if (err?.response?.status === 401) {
        setTimeout(() => router.push('/login'), 1500);
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

  const handleOpenResultPanel = () => { if (result) setActivePanel('result'); };
  const handleBackToAnalyze = () => { setActivePanel('analyze'); setAnalyzeTimedOut(false); };
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
  const hasMultiPeriod = tier === 'premium' && multiPeriodResults.length > 1;
  const allTabs = hasMultiPeriod
    ? [...fourStepTabs, { label: '📊 多周期对比', key: '__multiperiod__' }]
    : fourStepTabs;

  return (
    <div className="app-shell">
      {/* Header */}
      <header className="app-header">
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
                <button
                  onClick={() => router.push('/account')}
                  className="btn btn-secondary"
                  style={{ padding: '0.375rem 0.75rem', fontSize: '0.75rem' }}
                >
                  账号
                </button>
                {tier !== 'premium' && (
                  <button
                    onClick={() => router.push('/upgrade')}
                    style={{
                      padding: '0.375rem 0.75rem',
                      fontSize: '0.75rem',
                      background: '#f59e0b',
                      color: 'white',
                      border: 'none',
                      borderRadius: '0.375rem',
                      cursor: 'pointer',
                    }}
                  >
                    升级
                  </button>
                )}
                <button onClick={handleLogout} className="btn btn-secondary" style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}>
                  退出
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => router.push('/login')}
                  className="btn btn-secondary"
                  style={{ padding: '0.375rem 0.75rem', fontSize: '0.75rem' }}
                >
                  登录
                </button>
                <button
                  onClick={() => router.push('/register')}
                  className="btn btn-primary"
                  style={{ padding: '0.375rem 0.75rem', fontSize: '0.75rem' }}
                >
                  注册
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="container app-main">
        <div
          className="app-main-grid"
          style={{
            display: 'grid',
            gap: '1.5rem',
            gridTemplateColumns: '1fr',
            maxWidth: activePanel === 'analyze' || activePanel === 'loading' ? '820px' : '980px',
            margin: '0 auto',
          }}
        >
          {/* Analyze Panel */}
          {activePanel === 'analyze' && (
            <div>
              <div className="card mb-3">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '1.5rem', position: 'relative' }}>
                  <h2 style={{ fontSize: '1.125rem', fontWeight: '600' }}>分析</h2>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setShowQuickTips((v) => !v)}
                    style={{ padding: '0.15rem 0.55rem', fontSize: '0.75rem', minHeight: 'auto' }}
                  >
                    提示
                  </button>
                  {showQuickTips && (
                    <div style={{
                      position: 'absolute',
                      top: '2.3rem',
                      right: 0,
                      zIndex: 20,
                      width: 'min(92vw, 340px)',
                      border: '1px solid var(--border)',
                      borderRadius: '0.75rem',
                      background: 'white',
                      boxShadow: '0 10px 25px rgba(15, 23, 42, 0.12)',
                      padding: '0.75rem',
                    }}>
                      <p style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.45rem' }}>快速提示</p>
                      <ul style={{ fontSize: '0.8rem', color: 'var(--muted)', paddingLeft: '1rem', margin: 0 }}>
                        {QUICK_TIPS.map((tip) => (
                          <li key={tip} style={{ marginBottom: '0.25rem' }}>{tip}</li>
                        ))}
                      </ul>
                    </div>
                  )}
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
                    <div className="stack-on-mobile" style={{ gap: '0.35rem' }}>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem', minHeight: 'auto' }}
                        onClick={() => setShowHotRecommendations((v) => !v)}
                      >
                        热门推荐
                      </button>
                      {showHotRecommendations && (
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem', minHeight: 'auto' }}
                          onClick={handleRefreshHotRecommendations}
                        >
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
                  {/* Symbol format warning */}
                  {symbolWarning && symbol.trim() && (
                    <p style={{ fontSize: '0.8rem', color: '#b45309', marginTop: '0.4rem' }}>
                      ⚠️ {symbolWarning}
                    </p>
                  )}
                  {marketData && !symbolWarning && (
                    <p style={{ fontSize: '0.875rem', color: 'var(--success)', marginTop: '0.5rem' }}>
                      ✓ 找到 {marketData.count} 条数据
                    </p>
                  )}
                  {showHotRecommendations && (
                    <div style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '0.45rem',
                      marginTop: '0.6rem',
                      padding: '0.5rem',
                      border: '1px dashed var(--border)',
                      borderRadius: '0.5rem',
                      background: '#f8fafc',
                    }}>
                      {hotRecommendations.map((stock) => (
                        <button
                          key={`${stock.market}_${stock.code}`}
                          type="button"
                          onClick={() => handleHotStockClick(stock)}
                          style={{
                            padding: '0.35rem 0.65rem',
                            fontSize: '0.75rem',
                            border: '1px solid var(--border)',
                            borderRadius: '9999px',
                            background: 'white',
                            cursor: 'pointer',
                          }}
                        >
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

                {/* Multi-period toggle */}
                <div className="form-group" style={{ marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input
                      type="checkbox"
                      id="multi-period-toggle"
                      checked={multiPeriodEnabled}
                      disabled={tier === 'free'}
                      onChange={(e) => {
                        setMultiPeriodEnabled(e.target.checked);
                        if (!e.target.checked) setAuxiliaryPeriods([]);
                      }}
                      style={{ width: '1rem', height: '1rem', cursor: tier === 'free' ? 'not-allowed' : 'pointer' }}
                    />
                    <label
                      htmlFor="multi-period-toggle"
                      style={{
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        cursor: tier === 'free' ? 'not-allowed' : 'pointer',
                        color: tier === 'free' ? 'var(--muted)' : undefined,
                      }}
                      title={tier === 'free' ? '基础版起可用' : undefined}
                    >
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
                            <button
                              key={k}
                              type="button"
                              onClick={() => !disabled && toggleAuxPeriod(k)}
                              style={{
                                padding: '0.25rem 0.6rem',
                                fontSize: '0.75rem',
                                borderRadius: '9999px',
                                border: `1px solid ${selected ? 'var(--primary)' : 'var(--border)'}`,
                                background: selected ? 'var(--primary)' : 'white',
                                color: selected ? 'white' : undefined,
                                cursor: disabled ? 'not-allowed' : 'pointer',
                                opacity: disabled ? 0.5 : 1,
                              }}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Premium inputs */}
                <div style={{ border: '1px solid #f59e0b', background: '#fffbeb', borderRadius: '0.75rem', padding: '0.9rem', marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#92400e', background: '#fde68a', padding: '0.2rem 0.5rem', borderRadius: '9999px' }}>
                        高级版特别功能
                      </span>
                      {(tier === 'basic' || tier === 'premium') && (
                        <span style={{ fontSize: '0.75rem', color: '#92400e' }}>
                          {([holdingQuantity, costPrice, plannedInvestment, maxPosition].filter((v) => v.trim()).length === 0) ? '当前：空仓模式' : '当前：已填写持仓参数'}
                        </span>
                      )}
                    </div>
                    {tier === 'premium' ? (
                      <button
                        className="btn btn-secondary"
                        style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem', minWidth: '72px' }}
                        onClick={() => setPremiumInputsOpen((v) => !v)}
                      >
                        {premiumInputsOpen ? '收起模块' : '展开模块'}
                      </button>
                    ) : (
                      <button
                        className="btn btn-secondary"
                        style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem', minWidth: '72px' }}
                        onClick={() => router.push('/upgrade')}
                      >
                        升级解锁
                      </button>
                    )}
                  </div>
                  <p style={{ fontSize: '0.875rem', margin: 0, lineHeight: '1.6' }}>
                    🚀 高级版支持连续多次单条查询；每次分析开始后可立即再次点击"开始分析"，并在右侧历史中回看详细结果。
                  </p>
                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.6rem' }}>
                    <span style={{ fontSize: '0.75rem', color: '#92400e', background: '#fef3c7', padding: '0.15rem 0.5rem', borderRadius: '9999px' }}>多次连续提交</span>
                    <span style={{ fontSize: '0.75rem', color: '#92400e', background: '#fef3c7', padding: '0.15rem 0.5rem', borderRadius: '9999px' }}>历史回看详情</span>
                    <span style={{ fontSize: '0.75rem', color: '#92400e', background: '#fef3c7', padding: '0.15rem 0.5rem', borderRadius: '9999px' }}>持仓参数可选</span>
                  </div>
                  {(tier === 'basic' || tier === 'premium') && premiumInputsOpen && (
                    <div style={{ marginTop: '0.85rem' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
                        <div className="form-group">
                          <label className="label">持有数量(股)</label>
                          <input className="input" value={holdingQuantity} onChange={(e) => setHoldingQuantity(e.target.value)} />
                        </div>
                        <div className="form-group">
                          <label className="label">成本价</label>
                          <input className="input" value={costPrice} onChange={(e) => setCostPrice(e.target.value)} />
                        </div>
                        <div className="form-group">
                          <label className="label">本股计划投入</label>
                          <input className="input" value={plannedInvestment} onChange={(e) => setPlannedInvestment(e.target.value)} />
                        </div>
                        <div className="form-group">
                          <label className="label">最大持仓(股)</label>
                          <input className="input" value={maxPosition} onChange={(e) => setMaxPosition(e.target.value)} />
                        </div>
                      </div>
                      <p style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: '0.25rem' }}>
                        4项都不填=默认空仓；若填写则4项必须全部填写。
                      </p>
                    </div>
                  )}
                </div>

                {error && <div className="error">{error}</div>}

                <button
                  className="btn btn-primary"
                  style={{ width: '100%', marginTop: '1rem' }}
                  onClick={handleAnalyze}
                  disabled={!symbol.trim()}
                >
                  {tier === 'premium' && premiumPendingCount > 0
                    ? `开始分析（进行中 ${premiumPendingCount}）`
                    : '开始分析'}
                </button>
                {result && (
                  <button
                    className="btn btn-secondary"
                    style={{ width: '100%', marginTop: '0.65rem' }}
                    onClick={handleOpenResultPanel}
                  >
                    查看结果
                  </button>
                )}
              </div>

              {showUpgradeBanner && (
                <div className="card mb-3" style={{ background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)', border: '1px solid #f59e0b' }}>
                  <div style={{ textAlign: 'center' }}>
                    <p style={{ fontWeight: '600', marginBottom: '0.5rem' }}>今日免费次数已用完</p>
                    <p style={{ fontSize: '0.875rem', marginBottom: '1rem' }}>升级基础版，每天 {pricing?.basic?.daily_limit ?? 5} 次分析，仅需 ¥{pricing?.basic?.price ?? '9'}/月</p>
                    <button className="btn btn-primary" onClick={() => router.push('/upgrade')} style={{ background: '#f59e0b', borderColor: '#f59e0b' }}>
                      立即升级
                    </button>
                  </div>
                </div>
              )}

              {/* Upgrade cards shown in the analyze panel for lower tiers */}
              {tier !== 'premium' && (
                <div style={{ marginTop: '0.5rem' }}>
                  <p style={{ fontWeight: 700, fontSize: '0.88rem', marginBottom: '0.7rem', color: 'var(--muted)', textAlign: 'center' }}>
                    🔒 升级后解锁以下功能
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
                    {tier === 'free' && (
                      <div
                        style={{ border: '2px solid #3b82f6', borderRadius: '0.75rem', padding: '1rem', background: '#eff6ff', transition: 'transform 0.2s' }}
                        onMouseEnter={e => (e.currentTarget.style.transform = 'translateY(-2px)')}
                        onMouseLeave={e => (e.currentTarget.style.transform = 'translateY(0)')}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                          <div>
                            <p style={{ fontWeight: 700, color: '#1d4ed8', fontSize: '0.88rem' }}>📊 基础版</p>
                            <p style={{ fontSize: '1.2rem', fontWeight: 800, color: '#1e40af', lineHeight: 1.2 }}>
                              ¥{pricing?.basic?.price ?? '9'}<span style={{ fontSize: '0.75rem', fontWeight: 400 }}>/{pricing?.basic?.period ?? '月'}</span>
                            </p>
                          </div>
                          <span style={{ fontSize: '0.65rem', background: '#bfdbfe', color: '#1d4ed8', padding: '0.15rem 0.5rem', borderRadius: '9999px', fontWeight: 600, whiteSpace: 'nowrap' }}>推荐</span>
                        </div>
                        <ul style={{ fontSize: '0.76rem', color: '#1e40af', paddingLeft: '1rem', margin: '0 0 0.75rem', lineHeight: '1.8' }}>
                          {((pricing?.features ?? []).filter(f => f.tiers.includes('basic')).map(f => f.text).length
                            ? (pricing?.features ?? []).filter(f => f.tiers.includes('basic')).map(f => f.text)
                            : ['每日5次分析', '完整深度研判', '港股/美股/期货', '多周期叠加分析']
                          ).map((f, i) => (
                            <li key={i}>{f}</li>
                          ))}
                        </ul>
                        <button
                          style={{ width: '100%', padding: '0.5rem', fontWeight: 700, fontSize: '0.82rem', color: 'white', border: 'none', borderRadius: '0.5rem', cursor: 'pointer', background: 'linear-gradient(90deg,#2563eb 0%,#60a5fa 50%,#2563eb 100%)', backgroundSize: '200% auto', animation: 'shimmer 2.5s linear infinite' }}
                          onClick={() => router.push('/upgrade')}
                        >
                          立即解锁 <span style={{ display: 'inline-block', animation: 'bounce-arrow 1.2s ease-in-out infinite' }}>→</span>
                        </button>
                      </div>
                    )}
                    <div
                      style={{ border: '2px solid #7c3aed', borderRadius: '0.75rem', padding: '1rem', background: '#f5f3ff', position: 'relative', transition: 'transform 0.2s', animation: 'pulse-glow 2s ease-in-out infinite' }}
                      onMouseEnter={e => (e.currentTarget.style.transform = 'translateY(-2px)')}
                      onMouseLeave={e => (e.currentTarget.style.transform = 'translateY(0)')}
                    >
                      <div style={{ position: 'absolute', top: '-9px', left: '50%', transform: 'translateX(-50%)', background: '#7c3aed', color: 'white', fontSize: '0.62rem', fontWeight: 700, padding: '0.15rem 0.6rem', borderRadius: '9999px', whiteSpace: 'nowrap' }}>✨ 最高权益</div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem', marginTop: '0.3rem' }}>
                        <div>
                          <p style={{ fontWeight: 700, color: '#5b21b6', fontSize: '0.88rem' }}>🚀 高级版</p>
                          <p style={{ fontSize: '1.2rem', fontWeight: 800, color: '#6d28d9', lineHeight: 1.2 }}>
                            ¥{pricing?.premium?.price ?? '19'}<span style={{ fontSize: '0.75rem', fontWeight: 400 }}>/{pricing?.premium?.period ?? '月'}</span>
                          </p>
                        </div>
                      </div>
                      <ul style={{ fontSize: '0.76rem', color: '#5b21b6', paddingLeft: '1rem', margin: '0 0 0.75rem', lineHeight: '1.8' }}>
                        {((pricing?.features ?? []).filter(f => f.tiers.includes('premium')).map(f => f.text).length
                          ? (pricing?.features ?? []).filter(f => f.tiers.includes('premium')).map(f => f.text)
                          : ['每日15次分析', '连续多标的查询', '持仓参数智能分析', '优先处理通道']
                        ).map((f, i) => (
                          <li key={i}>{f}</li>
                        ))}
                      </ul>
                      <button
                        style={{ width: '100%', padding: '0.5rem', fontWeight: 700, fontSize: '0.82rem', color: 'white', border: 'none', borderRadius: '0.5rem', cursor: 'pointer', background: 'linear-gradient(90deg,#7c3aed 0%,#a78bfa 50%,#7c3aed 100%)', backgroundSize: '200% auto', animation: 'shimmer 2.5s linear infinite' }}
                        onClick={() => router.push('/upgrade')}
                      >
                        立即解锁 <span style={{ display: 'inline-block', animation: 'bounce-arrow 1.2s ease-in-out infinite' }}>→</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Loading Panel */}
          {activePanel === 'loading' && (
            <div>
              <div className="card" style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: '380px',
                textAlign: 'center',
                gap: '1.5rem',
              }}>
                {analyzeTimedOut ? (
                  <>
                    <div style={{ fontSize: '2.5rem' }}>⏰</div>
                    <div>
                      <p style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '0.4rem', color: '#b45309' }}>
                        分析时间较长
                      </p>
                      <p style={{ fontSize: '0.875rem', color: 'var(--muted)', marginBottom: '1rem' }}>
                        AI 服务响应超过 3 分钟，可能是服务繁忙。<br />
                        可以等待继续，或返回重试。
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                      <button className="btn btn-secondary" onClick={handleBackToAnalyze}>
                        返回重试
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{
                      width: '64px',
                      height: '64px',
                      border: '5px solid var(--border)',
                      borderTopColor: 'var(--primary)',
                      borderRadius: '50%',
                      animation: 'spin 0.9s linear infinite',
                    }} />
                    <div>
                      <p style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '0.4rem' }}>
                        正在分析 <span style={{ color: 'var(--primary)' }}>{analyzingSymbol}</span>
                      </p>
                      <p style={{ fontSize: '0.875rem', color: 'var(--muted)' }}>
                        AI 正在处理市场数据与指标，预计耗时 <strong>1–3 分钟</strong>
                      </p>
                      {premiumPendingCount > 1 && (
                        <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: '0.3rem' }}>
                          队列中还有 {premiumPendingCount - 1} 个分析任务
                        </p>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                      {['数据获取', '指标计算', 'AI 决策', '生成报告'].map((step, i) => (
                        <span key={step} style={{
                          fontSize: '0.7rem',
                          padding: '0.2rem 0.55rem',
                          borderRadius: '9999px',
                          background: '#f1f5f9',
                          color: 'var(--muted)',
                          animation: `pulse-step 2s ${i * 0.5}s infinite`,
                        }}>
                          {step}
                        </span>
                      ))}
                    </div>
                    {tier === 'premium' && (
                      <button className="btn btn-secondary" style={{ marginTop: '0.5rem' }} onClick={() => setActivePanel('analyze')}>
                        继续下一个分析 →
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Result Panel */}
          {activePanel === 'result' && (
            <div>
              {result ? (
                <div className="card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <h2 style={{ fontSize: '1.125rem', fontWeight: '600' }}>分析结果</h2>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '0.875rem', color: 'var(--muted)', fontWeight: 600 }}>
                          {result.data?.name
                            ? <>{result.data.name} <span style={{ opacity: 0.6 }}>({result.data.symbol})</span></>
                            : result.data?.symbol
                          } · {result.data?.market?.toUpperCase()}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: '0.15rem' }}>
                          {result.data?.latest_date && (
                            <span>K线 {new Date(result.data.latest_date).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                          )}
                          {result.data?.latest_date && analyzeStartedAt && <span style={{ margin: '0 0.3rem' }}>·</span>}
                          {analyzeStartedAt && (
                            <span>分析 {new Date(analyzeStartedAt).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                          )}
                        </div>
                      </div>
                      {tier === 'free' ? (
                        <button
                          onClick={() => generateShareCard()}
                          disabled={shareLoading}
                          style={{ fontSize: '0.82rem', padding: '0.35rem 0.85rem', background: shareLoading ? '#fca5a5' : 'linear-gradient(135deg,#dc2626,#ef4444)', border: 'none', borderRadius: '0.5rem', cursor: shareLoading ? 'default' : 'pointer', color: 'white', fontWeight: 700, whiteSpace: 'nowrap', boxShadow: shareLoading ? 'none' : '0 2px 8px rgba(220,38,38,0.4)' }}
                          title="生成研判分享卡片"
                        >
                          {shareLoading ? '生成中…' : '📤 分享研判'}
                        </button>
                      ) : (
                        <div style={{ display: 'flex', gap: '0.4rem' }}>
                          <button
                            onClick={() => generateShareCard(undefined, undefined, undefined, true)}
                            disabled={saveLongLoading}
                            style={{ fontSize: '0.82rem', padding: '0.35rem 0.85rem', background: saveLongLoading ? '#86efac' : 'linear-gradient(135deg,#15803d,#22c55e)', border: 'none', borderRadius: '0.5rem', cursor: saveLongLoading ? 'default' : 'pointer', color: 'white', fontWeight: 700, whiteSpace: 'nowrap', boxShadow: saveLongLoading ? 'none' : '0 2px 8px rgba(34,197,94,0.4)' }}
                            title="保存完整长图"
                          >
                            {saveLongLoading ? '生成中…' : '💾 保存'}
                          </button>
                          <button
                            onClick={() => generateShareCard()}
                            disabled={shareLoading}
                            style={{ fontSize: '0.82rem', padding: '0.35rem 0.85rem', background: shareLoading ? '#fca5a5' : 'linear-gradient(135deg,#dc2626,#ef4444)', border: 'none', borderRadius: '0.5rem', cursor: shareLoading ? 'default' : 'pointer', color: 'white', fontWeight: 700, whiteSpace: 'nowrap', boxShadow: shareLoading ? 'none' : '0 2px 8px rgba(220,38,38,0.4)' }}
                            title="生成3:4分享卡片"
                          >
                            {shareLoading ? '生成中…' : '📤 分享'}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Share confirmation dialog */}
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

                  {/* ── Signal ── */}
                  {tier === 'free' ? (
                    <div style={{ marginBottom: '1.25rem' }}>
                      <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '1rem 1.25rem',
                        background: result.result?.action === 'buy' ? '#fee2e2' : result.result?.action === 'sell' ? '#dcfce7' : '#f3f4f6',
                        borderRadius: (result.result as any)?.opportunity_quality ? '0.75rem 0.75rem 0 0' : '0.75rem',
                      }}>
                        <div>
                          <p style={{ fontSize: '0.75rem', color: 'var(--muted)', marginBottom: '0.2rem' }}>建议操作</p>
                          <p style={{ fontSize: '2rem', fontWeight: 800, color: result.result?.action === 'buy' ? '#dc2626' : result.result?.action === 'sell' ? '#16a34a' : '#6b7280' }}>
                            {result.result?.action === 'buy' ? '买入' : result.result?.action === 'sell' ? '卖出' : '观望'}
                          </p>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <p style={{ fontSize: '0.75rem', color: 'var(--muted)', marginBottom: '0.2rem' }}>最新价</p>
                          <p style={{ fontSize: '1.75rem', fontWeight: 700 }}>
                            {typeof result.data?.latest_price === 'number' ? result.data.latest_price.toFixed(2) : '—'}
                          </p>
                        </div>
                      </div>
                      {(result.result as any)?.opportunity_quality && (
                        <div style={{
                          padding: '0.5rem 1.25rem', background: 'var(--card)',
                          border: '1px solid var(--border)', borderTop: 'none',
                          borderRadius: '0 0 0.75rem 0.75rem',
                          display: 'flex', alignItems: 'center', gap: '0.5rem',
                        }}>
                          <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>机会评级</span>
                          <span style={{ fontWeight: 700, fontSize: '0.95rem', color: (result.result as any).opportunity_quality === 'A' ? '#16a34a' : (result.result as any).opportunity_quality === 'B' ? '#0369a1' : (result.result as any).opportunity_quality === 'C' ? '#d97706' : '#dc2626' }}>
                            {(result.result as any).opportunity_quality} 级
                          </span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      <div style={{
                        textAlign: 'center', padding: '1.25rem',
                        background: result.result?.action === 'buy' ? '#fee2e2' : result.result?.action === 'sell' ? '#dcfce7' : '#f3f4f6',
                        borderRadius: '0.75rem', marginBottom: '1rem',
                      }}>
                        <p className="action-label">建议操作</p>
                        <p style={{ color: result.result?.action === 'buy' ? '#dc2626' : result.result?.action === 'sell' ? '#16a34a' : '#6b7280' }} className="action-value">
                          {result.result?.action === 'buy' ? '买入' : result.result?.action === 'sell' ? '卖出' : '观望'}
                        </p>
                        <p style={{ fontSize: '1.25rem', fontWeight: '600', marginTop: '0.5rem' }}>
                          置信度 {result.result?.confidence ?? '—'}%
                        </p>
                      </div>
                      <div className="grid grid-3" style={{ gap: '1rem', marginBottom: '1.25rem' }}>
                        <div style={{ textAlign: 'center' }}>
                          <p style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>最新价</p>
                          <p style={{ fontSize: '1.25rem', fontWeight: '600' }}>
                            {typeof result.data?.latest_price === 'number' ? result.data.latest_price.toFixed(2) : '—'}
                          </p>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                          <p style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>目标价</p>
                          <p style={{ fontSize: '1.25rem', fontWeight: '600', color: 'var(--success)' }}>
                            {typeof result.result?.target_price === 'number' ? result.result.target_price.toFixed(2) : '—'}
                          </p>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                          <p style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>止损</p>
                          <p style={{ fontSize: '1.25rem', fontWeight: '600', color: 'var(--danger)' }}>
                            {typeof result.result?.stop_loss === 'number' ? result.result.stop_loss.toFixed(2) : '—'}
                          </p>
                        </div>
                      </div>
                    </>
                  )}

                  {/* ── Reason ── */}
                  <div style={{ marginBottom: '1.25rem' }}>
                    <h3 style={{ fontSize: '0.875rem', fontWeight: '600', marginBottom: '0.5rem' }}>分析要点</h3>
                    <p style={{ fontSize: '0.875rem', color: 'var(--foreground)', lineHeight: '1.6' }}>
                      {tier === 'free'
                        ? (result.result?.reason || '').slice(0, 120) + ((result.result?.reason || '').length > 120 ? '…' : '')
                        : result.result?.reason}
                    </p>
                  </div>

                  {/* ── Deep analysis tabs — basic & premium only ── */}
                  {tier !== 'free' && result.result && (
                    <div style={{ marginBottom: '1.25rem' }}>
                      <div style={{
                        display: 'flex', gap: '0.3rem', flexWrap: 'wrap', marginBottom: '0.75rem',
                        padding: '0.3rem', background: '#f1f5f9', borderRadius: '0.75rem',
                      }}>
                        {allTabs.map((tab, idx) => (
                          <button
                            key={tab.key}
                            type="button"
                            onClick={() => setActiveTab(idx)}
                            style={{
                              flex: '1 1 auto', minWidth: 'max-content', padding: '0.4rem 0.7rem',
                              fontSize: '0.78rem', fontWeight: activeTab === idx ? 600 : 400,
                              borderRadius: '0.5rem', border: 'none',
                              background: activeTab === idx ? 'var(--primary)' : 'transparent',
                              color: activeTab === idx ? 'white' : 'var(--muted)',
                              cursor: 'pointer', transition: 'background 0.15s, color 0.15s',
                            }}
                          >
                            {tab.label}
                          </button>
                        ))}
                      </div>
                      <div style={{
                        padding: '0.9rem', background: '#f8fafc',
                        borderRadius: '0.5rem', border: '1px solid var(--border)', minHeight: '80px',
                      }}>
                        {allTabs[activeTab]?.key === '__multiperiod__' ? (
                          <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                              <thead>
                                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                  {['周期', '操作', '置信度', '目标价', '止损', '摘要'].map((h) => (
                                    <th key={h} style={{ padding: '0.4rem 0.5rem', textAlign: 'left', color: 'var(--muted)', fontWeight: 600 }}>{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {multiPeriodResults.map(({ period: p, result: r }) => (
                                  <tr key={p} style={{ borderBottom: '1px solid var(--border)' }}>
                                    <td style={{ padding: '0.4rem 0.5rem', fontWeight: 500 }}>{PERIOD_LABELS[p] || p}</td>
                                    <td style={{ padding: '0.4rem 0.5rem', color: r.result?.action === 'buy' ? '#dc2626' : r.result?.action === 'sell' ? '#16a34a' : '#6b7280' }}>
                                      {r.result?.action === 'buy' ? '买入' : r.result?.action === 'sell' ? '卖出' : '观望'}
                                    </td>
                                    <td style={{ padding: '0.4rem 0.5rem' }}>{r.result?.confidence ?? '-'}%</td>
                                    <td style={{ padding: '0.4rem 0.5rem', color: 'var(--success)' }}>{typeof r.result?.target_price === 'number' ? r.result.target_price.toFixed(2) : '—'}</td>
                                    <td style={{ padding: '0.4rem 0.5rem', color: 'var(--danger)' }}>{typeof r.result?.stop_loss === 'number' ? r.result.stop_loss.toFixed(2) : '—'}</td>
                                    <td style={{ padding: '0.4rem 0.5rem', color: 'var(--muted)', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      {(r.result?.reason || '').slice(0, 60)}{(r.result?.reason || '').length > 60 ? '...' : ''}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <p style={{ fontSize: '0.875rem', color: 'var(--foreground)', lineHeight: '1.6', margin: 0 }}>
                            {(result.result as any)?.[allTabs[activeTab]?.key] || '暂无数据'}
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* ── Risk factors — basic & premium ── */}
                  {tier !== 'free' && result.result?.risk_factors && result.result.risk_factors.length > 0 && (
                    <div style={{ marginBottom: '1rem' }}>
                      <h3 style={{ fontSize: '0.875rem', fontWeight: '600', marginBottom: '0.5rem' }}>风险因素</h3>
                      <ul style={{ fontSize: '0.875rem', color: 'var(--muted)', paddingLeft: '1.2rem', margin: 0 }}>
                        {result.result.risk_factors.map((f: string, i: number) => (
                          <li key={i} style={{ marginBottom: '0.2rem' }}>{f}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* ── Technical indicators — basic & premium ── */}
                  {tier !== 'free' && result.result?.indicators && (
                    <div style={{ marginBottom: '1rem' }}>
                      <h3 style={{ fontSize: '0.875rem', fontWeight: '600', marginBottom: '0.5rem' }}>技术指标</h3>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                        {Object.entries(result.result.indicators).map(([k, v]) => (
                          <span key={k} style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem', background: '#f1f5f9', borderRadius: '0.375rem', color: 'var(--muted)' }}>
                            {k}: {typeof v === 'number' ? (v as number).toFixed(2) : String(v)}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ── Position advice — basic & premium ── */}
                  {tier !== 'free' && result.result?.position_advice && (
                    <div style={{ marginBottom: '1rem' }}>
                      <h3 style={{ fontSize: '0.875rem', fontWeight: '600', marginBottom: '0.5rem' }}>持仓建议</h3>
                      <p style={{ fontSize: '0.875rem', color: 'var(--muted)', lineHeight: '1.6' }}>
                        {result.result.position_advice.reason}
                        {typeof result.result.position_advice.suggested_quantity === 'number'
                          ? `（建议数量: ${result.result.position_advice.suggested_quantity}）`
                          : ''}
                      </p>
                    </div>
                  )}

                  {/* ── Position params used — basic & premium ── */}
                  {tier !== 'free' && resultPositionParams && Object.values(resultPositionParams).some((v) => v?.trim()) && (
                    <div style={{ marginBottom: '1rem', padding: '0.65rem 0.85rem', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '0.5rem' }}>
                      <h3 style={{ fontSize: '0.8rem', fontWeight: '600', marginBottom: '0.4rem', color: '#92400e' }}>本次分析持仓参数</h3>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                        {resultPositionParams.holdingQuantity && <span style={{ fontSize: '0.75rem', padding: '0.15rem 0.5rem', background: '#fef3c7', borderRadius: '9999px', color: '#78350f' }}>持有 {resultPositionParams.holdingQuantity} 股</span>}
                        {resultPositionParams.costPrice && <span style={{ fontSize: '0.75rem', padding: '0.15rem 0.5rem', background: '#fef3c7', borderRadius: '9999px', color: '#78350f' }}>成本价 {resultPositionParams.costPrice}</span>}
                        {resultPositionParams.plannedInvestment && <span style={{ fontSize: '0.75rem', padding: '0.15rem 0.5rem', background: '#fef3c7', borderRadius: '9999px', color: '#78350f' }}>计划投入 {resultPositionParams.plannedInvestment}</span>}
                        {resultPositionParams.maxPosition && <span style={{ fontSize: '0.75rem', padding: '0.15rem 0.5rem', background: '#fef3c7', borderRadius: '9999px', color: '#78350f' }}>最大持仓 {resultPositionParams.maxPosition} 股</span>}
                      </div>
                    </div>
                  )}

                  {/* ── Upgrade banners ── */}
                  {tier === 'free' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '1.25rem' }}>
                      <div style={{
                        padding: '0.8rem 1rem',
                        background: 'linear-gradient(135deg, #eff6ff, #dbeafe)',
                        border: '1px solid #93c5fd', borderRadius: '0.625rem',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap',
                      }}>
                        <div>
                          <p style={{ fontWeight: 700, fontSize: '0.85rem', color: '#1d4ed8', marginBottom: '0.15rem' }}>📊 标准版 ¥19.9/月</p>
                          <p style={{ fontSize: '0.78rem', color: '#1e40af' }}>解锁深度研判 · 目标价止损 · 港股美股期货</p>
                        </div>
                        <button
                          onClick={() => router.push('/upgrade')}
                          style={{ fontSize: '0.82rem', fontWeight: 700, color: 'white', background: '#2563eb', border: 'none', borderRadius: '0.4rem', padding: '0.4rem 1rem', cursor: 'pointer', whiteSpace: 'nowrap' }}
                        >立即升级 →</button>
                      </div>
                      <div style={{
                        padding: '0.8rem 1rem',
                        background: 'linear-gradient(135deg, #f5f3ff, #ede9fe)',
                        border: '1px solid #a78bfa', borderRadius: '0.625rem',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap',
                      }}>
                        <div>
                          <p style={{ fontWeight: 700, fontSize: '0.85rem', color: '#6d28d9', marginBottom: '0.15rem' }}>💎 专业版 ¥49/月</p>
                          <p style={{ fontSize: '0.78rem', color: '#5b21b6' }}>针对持仓的个性化建议 · 每日15次 · 优先通道</p>
                        </div>
                        <button
                          onClick={() => router.push('/upgrade')}
                          style={{ fontSize: '0.82rem', fontWeight: 700, color: 'white', background: '#7c3aed', border: 'none', borderRadius: '0.4rem', padding: '0.4rem 1rem', cursor: 'pointer', whiteSpace: 'nowrap' }}
                        >了解详情 →</button>
                      </div>
                    </div>
                  )}
                  {tier === 'basic' && (
                    <div style={{
                      marginBottom: '1.25rem', padding: '0.8rem 1rem',
                      background: 'linear-gradient(135deg, #f5f3ff, #ede9fe)',
                      border: '1px solid #a78bfa', borderRadius: '0.625rem',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap',
                    }}>
                      <div>
                        <p style={{ fontWeight: 700, fontSize: '0.85rem', color: '#6d28d9', marginBottom: '0.15rem' }}>💎 专业版 ¥49/月</p>
                        <p style={{ fontSize: '0.78rem', color: '#5b21b6' }}>持仓智能分析不限次 · 每日15次 · 优先通道</p>
                      </div>
                      <button
                        onClick={() => router.push('/upgrade')}
                        style={{ fontSize: '0.82rem', fontWeight: 700, color: 'white', background: '#7c3aed', border: 'none', borderRadius: '0.4rem', padding: '0.4rem 1rem', cursor: 'pointer', whiteSpace: 'nowrap' }}
                      >升级专业版 →</button>
                    </div>
                  )}

                  {/* ── Action row ── */}
                  <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <div style={{ textAlign: 'center', fontSize: '0.8rem', color: 'var(--muted)' }}>
                      今日剩余次数: {result.usage?.remaining}
                    </div>
                    {tier === 'free' ? (
                      <button
                        onClick={() => generateShareCard()}
                        disabled={shareLoading}
                        style={{ width: '100%', padding: '0.6rem', fontSize: '0.9rem', fontWeight: 700, background: shareLoading ? '#fca5a5' : 'linear-gradient(135deg,#dc2626,#ef4444)', border: 'none', borderRadius: '0.5rem', cursor: shareLoading ? 'default' : 'pointer', color: 'white', boxShadow: shareLoading ? 'none' : '0 3px 10px rgba(220,38,38,0.4)' }}
                      >
                        {shareLoading ? '生成中…' : '📤 分享研判卡片'}
                      </button>
                    ) : (
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                          onClick={() => generateShareCard(undefined, undefined, undefined, true)}
                          disabled={saveLongLoading}
                          style={{ flex: 1, padding: '0.6rem', fontSize: '0.9rem', fontWeight: 700, background: saveLongLoading ? '#86efac' : 'linear-gradient(135deg,#15803d,#22c55e)', border: 'none', borderRadius: '0.5rem', cursor: saveLongLoading ? 'default' : 'pointer', color: 'white', boxShadow: saveLongLoading ? 'none' : '0 3px 10px rgba(34,197,94,0.4)' }}
                        >
                          {saveLongLoading ? '生成中…' : '💾 保存长图'}
                        </button>
                        <button
                          onClick={() => generateShareCard()}
                          disabled={shareLoading}
                          style={{ flex: 1, padding: '0.6rem', fontSize: '0.9rem', fontWeight: 700, background: shareLoading ? '#fca5a5' : 'linear-gradient(135deg,#dc2626,#ef4444)', border: 'none', borderRadius: '0.5rem', cursor: shareLoading ? 'default' : 'pointer', color: 'white', boxShadow: shareLoading ? 'none' : '0 3px 10px rgba(220,38,38,0.4)' }}
                        >
                          {shareLoading ? '生成中…' : '📤 分享卡片'}
                        </button>
                      </div>
                    )}
                    <button className="btn btn-primary" style={{ width: '100%' }} onClick={handleBackToAnalyze}>
                      继续分析
                    </button>
                  </div>
                </div>
              ) : (
                <div className="card" style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minHeight: '400px',
                  color: 'var(--muted)',
                }}>
                  <p>请输入股票代码开始分析</p>
                  <button className="btn btn-secondary" style={{ marginTop: '1rem' }} onClick={handleBackToAnalyze}>
                    继续分析
                  </button>
                </div>
              )}

              {history.length > 0 && (
                <div className="card" style={{ marginTop: '1rem' }}>
                  <h3 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '0.75rem' }}>📋 历史查询（服务器已保存）</h3>
                  <div style={{ display: 'grid', gap: '0.5rem' }}>
                    {history.slice(0, 5).map((h) => (
                      <div key={h.id} style={{ border: '1px solid var(--border)', borderRadius: '0.5rem', padding: '0.5rem 0.75rem', fontSize: '0.875rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                          <span>
                            {h.name ? `${h.name} (${h.symbol})` : h.symbol} | {h.action === 'buy' ? '🔴 买入' : h.action === 'sell' ? '🟢 卖出' : '🟡 观望'} | {h.confidence ?? '-'}% | {new Date(h.analyzedAt || Date.now()).toLocaleString()}
                          </span>
                          <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
                            <button
                              className="btn btn-secondary"
                              style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', borderColor: selectedHistoryId === h.id ? 'var(--primary)' : undefined }}
                              onClick={() => handleOpenHistoryDetail(h)}
                            >
                              {selectedHistoryId === h.id ? '当前查看' : '查看详情'}
                            </button>
                            {h.detail && (
                              tier === 'free' ? (
                                <button
                                  style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem', background: 'linear-gradient(135deg,#dc2626,#ef4444)', color: 'white', border: 'none', borderRadius: '0.4rem', cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap' }}
                                  title="生成分享卡片"
                                  onClick={() => generateShareCard(undefined, h.detail as typeof result, h.analyzedAt)}
                                >
                                  📤 分享
                                </button>
                              ) : (
                                <>
                                  <button
                                    style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem', background: 'linear-gradient(135deg,#15803d,#22c55e)', color: 'white', border: 'none', borderRadius: '0.4rem', cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap' }}
                                    title="保存完整长图"
                                    onClick={() => generateShareCard(undefined, h.detail as typeof result, h.analyzedAt, true)}
                                  >
                                    💾 保存
                                  </button>
                                  <button
                                    style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem', background: 'linear-gradient(135deg,#dc2626,#ef4444)', color: 'white', border: 'none', borderRadius: '0.4rem', cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap' }}
                                    title="生成3:4分享卡片"
                                    onClick={() => generateShareCard(undefined, h.detail as typeof result, h.analyzedAt, false)}
                                  >
                                    📤 分享
                                  </button>
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
          )}
        </div>
      </main>

      <footer style={{
        textAlign: 'center',
        padding: '1.25rem 1rem',
        fontSize: '0.75rem',
        color: 'var(--muted)',
        borderTop: '1px solid var(--border)',
        marginTop: 'auto',
      }}>
        <span>© {new Date().getFullYear()} {appName}</span>
        <span style={{ margin: '0 0.75rem' }}>·</span>
        <a href="/privacy" style={{ color: 'var(--muted)', textDecoration: 'none' }}>隐私政策</a>
        <span style={{ margin: '0 0.75rem' }}>·</span>
        <a href="/terms" style={{ color: 'var(--muted)', textDecoration: 'none' }}>服务条款</a>
      </footer>
    </div>
  );
}
