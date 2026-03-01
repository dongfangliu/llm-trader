'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore, useAnalysisStore } from '@/lib/store';
import { analyze, getUsage, getMarketData, getAnalysisHistory, AnalyzeRequest, AnalysisHistoryItem } from '@/lib/api';

// Hot stocks for quick selection
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

export default function HomePage() {
  const router = useRouter();
  const { user, login, logout, checkAuth } = useAuthStore();
  const {
    symbol, setSymbol,
    market, setMarket,
    period, setPeriod,
    isAnalyzing, setIsAnalyzing,
    result, setResult,
    error, setError,
  } = useAnalysisStore();

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
  const [activePanel, setActivePanel] = useState<'analyze' | 'result'>('analyze');

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

  // Check auth on mount
  useEffect(() => {
    checkAuth().then(async () => {
      const id = getOrCreateDeviceId();
      setDeviceId(id);
      const token = localStorage.getItem('token');
      if (!token) {
        await login({ openid: `device_${id}`, username: 'Guest' });
      }
    }).catch(() => setError('初始化失败，请刷新页面重试'));
  }, [router]);

  // Load limits
  useEffect(() => {
    if (deviceId) {
      getUsage(deviceId).then((usage) => {
        setLimits({
          remaining: usage.remaining,
          daily_limit: usage.subscription === 'premium' ? 15 : usage.subscription === 'basic' ? 5 : 1,
        });
      }).catch(console.error);
    }
  }, [deviceId, user]);

  useEffect(() => {
    if (!deviceId) return;
    getAnalysisHistory(30, deviceId)
      .then((res) => {
        setHistory((res.items || []).map(toHistoryCardItem));
      })
      .catch(() => {});
  }, [deviceId, user?.id]);

  // Check if show upgrade banner
  useEffect(() => {
    if (limits && limits.remaining <= 0) {
      setShowUpgradeBanner(true);
    }
  }, [limits]);

  useEffect(() => {
    if (user?.subscription_tier === 'free' && market !== 'a') {
      setMarket('a');
    }
  }, [user?.subscription_tier, market, setMarket]);

  useEffect(() => {
    const next = getMarketRecommendations(market);
    setHotRecommendations(next);
    setLastHotRecommendationSignature(getRecommendationSignature(next));
    setShowHotRecommendations(false);
  }, [market]);

  // Load market data preview
  useEffect(() => {
    if (symbol && market) {
      getMarketData(market, symbol, period, 30)
        .then(setMarketData)
        .catch(() => setMarketData(null));
    }
  }, [symbol, market, period]);

  const handleAnalyze = async () => {
    if (!symbol.trim()) {
      setError('请输入股票代码');
      return;
    }
    const isPremium = user?.subscription_tier === 'premium';
    const holdingInputs = [holdingQuantity, costPrice, plannedInvestment, maxPosition].map((v) => v.trim());
    const filledCount = holdingInputs.filter(Boolean).length;
    if (isPremium && filledCount > 0 && filledCount < 4) {
      setError('高级版持仓可选输入需 4 项一起填写：持有数量、成本价、本股计划投入、最大持仓；不填则按空仓处理');
      return;
    }

    if (isPremium) {
      setPremiumPendingCount((n) => n + 1);
    } else {
      setIsAnalyzing(true);
    }
    setError(null);

    try {
      const request: AnalyzeRequest = {
        symbol: symbol.trim(),
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
      setResult(response);
      setLimits(response.usage);
      const item = {
        id: String(response.history?.id || `${Date.now()}_${response.data?.symbol || symbol.trim()}`),
        symbol: response.data?.symbol || symbol.trim(),
        action: response.result?.action,
        confidence: response.result?.confidence,
        analyzedAt: response.history?.analyzed_at || new Date().toISOString(),
        detail: response,
      };
      setHistory((prev) => {
        const nextHistory = [item, ...prev.filter((h) => h.id !== item.id)].slice(0, 30);
        return nextHistory;
      });
      setSelectedHistoryId(item.id);
    } catch (err: any) {
      setError(err.response?.data?.detail || '分析失败，请重试');
    } finally {
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
    setActivePanel('result');
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

  const handleOpenResultPanel = () => {
    if (result) setActivePanel('result');
  };

  const handleBackToAnalyze = () => {
    setActivePanel('analyze');
  };

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  if (!user) {
    return (
      <div className="app-shell" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      {/* Header */}
      <header className="app-header">
        <div className="container app-header-inner">
          <h1 style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>
            LLM 交易策略分析器
          </h1>
          <div className="app-header-actions">
            <span className={`badge badge-${user.subscription_tier}`}>
              {user.subscription_tier === 'free' ? '免费版' :
               user.subscription_tier === 'basic' ? '基础版' : '高级版'}
            </span>
            <span style={{ fontSize: '0.875rem' }}>
              剩余: {limits?.remaining ?? '-'} / {limits?.daily_limit ?? '-'} 次
            </span>
            {user.subscription_tier !== 'premium' && (
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
            maxWidth: activePanel === 'analyze' ? '820px' : '980px',
            margin: '0 auto',
          }}
        >
          {/* Left: Input Form */}
          {activePanel === 'analyze' && (
          <div>
            <div className="card mb-3">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '1.5rem', position: 'relative' }}>
                <h2 style={{ fontSize: '1.125rem', fontWeight: '600' }}>
                  分析
                </h2>
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
                <select
                  className="select"
                  value={market}
                  onChange={(e) => setMarket(e.target.value)}
                >
                  <option value="a">A股</option>
                  <option value="hk" disabled={user.subscription_tier === 'free'}>港股{user.subscription_tier === 'free' ? '（基础版起）' : ''}</option>
                  <option value="us" disabled={user.subscription_tier === 'free'}>美股{user.subscription_tier === 'free' ? '（基础版起）' : ''}</option>
                  <option value="futures" disabled={user.subscription_tier === 'free'}>期货{user.subscription_tier === 'free' ? '（基础版起）' : ''}</option>
                </select>
              </div>

              <div className="form-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                  <label className="label" style={{ marginBottom: 0 }}>
                    {market === 'a' ? '股票代码' :
                     market === 'hk' ? '港股代码' :
                     market === 'us' ? '美股代码' : '期货代码'}
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
                  placeholder={
                    market === 'a' ? '如: 600519' :
                    market === 'hk' ? '如: 00700' :
                    market === 'us' ? '如: AAPL' : '如: MA'
                  }
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value)}
                />
                {marketData && (
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
                <select
                  className="select"
                  value={period}
                  onChange={(e) => setPeriod(e.target.value)}
                >
                  <option value="daily">日线</option>
                  <option value="60">60分钟</option>
                  <option value="30">30分钟</option>
                  <option value="15">15分钟</option>
                  <option value="5">5分钟</option>
                  <option value="1">1分钟</option>
                </select>
              </div>

              <div style={{ border: '1px solid #f59e0b', background: '#fffbeb', borderRadius: '0.75rem', padding: '0.9rem', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#92400e', background: '#fde68a', padding: '0.2rem 0.5rem', borderRadius: '9999px' }}>
                      高级版特别功能
                    </span>
                    {user.subscription_tier === 'premium' && (
                      <span style={{ fontSize: '0.75rem', color: '#92400e' }}>
                        {([holdingQuantity, costPrice, plannedInvestment, maxPosition].filter((v) => v.trim()).length === 0) ? '当前：空仓模式' : '当前：已填写持仓参数'}
                      </span>
                    )}
                  </div>
                  {user.subscription_tier === 'premium' ? (
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
                  🚀 高级版支持连续多次单条查询；每次分析开始后可立即再次点击“开始分析”，并在右侧历史中回看详细结果。
                </p>
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.6rem' }}>
                  <span style={{ fontSize: '0.75rem', color: '#92400e', background: '#fef3c7', padding: '0.15rem 0.5rem', borderRadius: '9999px' }}>多次连续提交</span>
                  <span style={{ fontSize: '0.75rem', color: '#92400e', background: '#fef3c7', padding: '0.15rem 0.5rem', borderRadius: '9999px' }}>历史回看详情</span>
                  <span style={{ fontSize: '0.75rem', color: '#92400e', background: '#fef3c7', padding: '0.15rem 0.5rem', borderRadius: '9999px' }}>持仓参数可选</span>
                </div>
                {user.subscription_tier === 'premium' && premiumInputsOpen && (
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
                  disabled={(!symbol.trim()) || (user.subscription_tier !== 'premium' && isAnalyzing)}
                >
                  {user.subscription_tier !== 'premium' && isAnalyzing ? (
                    <>
                      <span className="spinner" style={{ width: '16px', height: '16px', marginRight: '0.5rem' }}></span>
                      分析中...
                    </>
                  ) : user.subscription_tier === 'premium' && premiumPendingCount > 0 ? (
                    `开始分析（进行中 ${premiumPendingCount}）`
                  ) : (
                    '开始分析'
                  )}
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

            {/* Upgrade Banner */}
            {showUpgradeBanner && (
              <div className="card mb-3" style={{ background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)', border: '1px solid #f59e0b' }}>
                <div style={{ textAlign: 'center' }}>
                  <p style={{ fontWeight: '600', marginBottom: '0.5rem' }}>
                    今日免费次数已用完
                  </p>
                  <p style={{ fontSize: '0.875rem', marginBottom: '1rem' }}>
                    升级基础版，每天 5 次分析，仅需 ¥9/月
                  </p>
                  <button
                    className="btn btn-primary"
                    onClick={() => router.push('/upgrade')}
                    style={{ background: '#f59e0b', borderColor: '#f59e0b' }}
                  >
                    立即升级
                  </button>
                </div>
              </div>
            )}

          </div>
          )}

          {/* Right: Results */}
          {activePanel === 'result' && (
          <div>
             {result ? (
              <div className="card">
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '1.5rem',
                }}>
                  <h2 style={{ fontSize: '1.125rem', fontWeight: '600' }}>
                    分析结果
                  </h2>
                  <span style={{ fontSize: '0.875rem', color: 'var(--muted)' }}>
                    {result.data?.symbol} - {result.data?.market?.toUpperCase()}
                  </span>
                </div>

                {/* Signal */}
                <div style={{
                  textAlign: 'center',
                  padding: '1.5rem',
                  background: result.result?.action === 'buy' ? '#dcfce7' :
                             result.result?.action === 'sell' ? '#fee2e2' : '#f3f4f6',
                  borderRadius: '0.75rem',
                  marginBottom: '1.5rem',
                }}>
                  <p className="action-label">建议操作</p>
                  <p style={{
                    color: result.result?.action === 'buy' ? '#16a34a' :
                           result.result?.action === 'sell' ? '#dc2626' : '#6b7280',
                  }} className="action-value">
                    {result.result?.action === 'buy' ? '买入' :
                     result.result?.action === 'sell' ? '卖出' : '持有'}
                  </p>
                  <p style={{ fontSize: '1.5rem', fontWeight: '600', marginTop: '0.5rem' }}>
                    置信度: {result.result?.confidence}%
                  </p>
                </div>

                {/* Price Targets */}
                <div className="grid grid-3" style={{ gap: '1rem', marginBottom: '1.5rem' }}>
                  <div style={{ textAlign: 'center' }}>
                    <p style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>最新价</p>
                    <p style={{ fontSize: '1.25rem', fontWeight: '600' }}>
                      {result.data?.latest_price?.toFixed(2)}
                    </p>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <p style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>目标价</p>
                    <p style={{ fontSize: '1.25rem', fontWeight: '600', color: 'var(--success)' }}>
                      {result.result?.target_price?.toFixed(2)}
                    </p>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <p style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>止损</p>
                    <p style={{ fontSize: '1.25rem', fontWeight: '600', color: 'var(--danger)' }}>
                      {result.result?.stop_loss?.toFixed(2)}
                    </p>
                  </div>
                </div>

                {/* Analysis */}
                <div style={{ marginBottom: '1rem' }}>
                  <h3 style={{ fontSize: '0.875rem', fontWeight: '600', marginBottom: '0.5rem' }}>
                    分析要点
                  </h3>
                  <p style={{ fontSize: '0.875rem', color: 'var(--foreground)', lineHeight: '1.6' }}>
                    {result.result?.reason}
                  </p>
                </div>

                {(result.result?.market_diagnosis || result.result?.opportunity_assessment || result.result?.risk_analysis || result.result?.execution_plan) && (
                  <div style={{ marginBottom: '1rem' }}>
                    <h3 style={{ fontSize: '0.875rem', fontWeight: '600', marginBottom: '0.5rem' }}>四步决策理解</h3>
                    {result.result?.market_diagnosis && (
                      <p style={{ fontSize: '0.875rem', color: 'var(--foreground)', lineHeight: '1.6', marginBottom: '0.35rem' }}>
                        ① 市场诊断：{result.result.market_diagnosis}
                      </p>
                    )}
                    {result.result?.opportunity_assessment && (
                      <p style={{ fontSize: '0.875rem', color: 'var(--foreground)', lineHeight: '1.6', marginBottom: '0.35rem' }}>
                        ② 机会评估：{result.result.opportunity_assessment}
                      </p>
                    )}
                    {result.result?.risk_analysis && (
                      <p style={{ fontSize: '0.875rem', color: 'var(--foreground)', lineHeight: '1.6', marginBottom: '0.35rem' }}>
                        ③ 风险收益：{result.result.risk_analysis}
                      </p>
                    )}
                    {result.result?.execution_plan && (
                      <p style={{ fontSize: '0.875rem', color: 'var(--foreground)', lineHeight: '1.6' }}>
                        ④ 执行方案：{result.result.execution_plan}
                      </p>
                    )}
                  </div>
                )}

                <div style={{ marginBottom: '1rem' }}>
                  <h3 style={{ fontSize: '0.875rem', fontWeight: '600', marginBottom: '0.5rem' }}>持仓建议</h3>
                  <p style={{ fontSize: '0.875rem', color: 'var(--muted)', lineHeight: '1.6' }}>
                    {result.result?.position_advice?.reason}
                    {typeof result.result?.position_advice?.suggested_quantity === 'number' ? `（建议数量: ${result.result?.position_advice?.suggested_quantity}）` : ''}
                  </p>
                </div>

                {/* Remaining */}
                <div style={{
                  marginTop: '1.5rem',
                  paddingTop: '1rem',
                  borderTop: '1px solid var(--border)',
                  textAlign: 'center',
                  fontSize: '0.875rem',
                  color: 'var(--muted)',
                }}>
                  今日剩余次数: {result.usage?.remaining}
                </div>
                <button
                  className="btn btn-primary"
                  style={{ width: '100%', marginTop: '1rem' }}
                  onClick={handleBackToAnalyze}
                >
                  继续分析
                </button>
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
                          {h.symbol} | {h.action === 'buy' ? '🟢 买入' : h.action === 'sell' ? '🔴 卖出' : '🟡 持有'} | {h.confidence ?? '-'}% | {new Date(h.analyzedAt || Date.now()).toLocaleString()}
                        </span>
                        <button
                          className="btn btn-secondary"
                          style={{
                            padding: '0.25rem 0.5rem',
                            fontSize: '0.75rem',
                            borderColor: selectedHistoryId === h.id ? 'var(--primary)' : undefined,
                          }}
                          onClick={() => handleOpenHistoryDetail(h)}
                        >
                          {selectedHistoryId === h.id ? '当前查看' : '查看详情'}
                        </button>
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
    </div>
  );
}
