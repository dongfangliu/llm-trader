'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore, useAnalysisStore } from '@/lib/store';
import { analyze, getLimits, getMarketData, AnalyzeRequest } from '@/lib/api';

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

  const [limits, setLimits] = useState<any>(null);
  const [apiKey, setApiKey] = useState('');
  const [marketData, setMarketData] = useState<any>(null);

  // Check auth on mount
  useEffect(() => {
    checkAuth().then(() => {
      const token = localStorage.getItem('token');
      if (!token) {
        router.push('/login');
      }
    });
  }, [router]);

  // Load limits
  useEffect(() => {
    if (user) {
      getLimits().then(setLimits).catch(console.error);
    }
  }, [user]);

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

    if (!apiKey.trim()) {
      setError('请输入 API Key');
      return;
    }

    setIsAnalyzing(true);
    setError(null);
    setResult(null);

    try {
      const request: AnalyzeRequest = {
        symbol: symbol.trim(),
        market: market as any,
        period: period as any,
        history_days: 90,
        llm_provider: 'openai',
        api_key: apiKey,
        base_url: 'https://api.deepseek.com/v1',
        model: 'deepseek-chat',
        max_tokens: 1500,
        temperature: 0.7,
      };

      const response = await analyze(request);
      setResult(response);
      setLimits(response.usage);
    } catch (err: any) {
      setError(err.response?.data?.detail || '分析失败，请重试');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  if (!user) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--background)' }}>
      {/* Header */}
      <header style={{
        background: 'white',
        borderBottom: '1px solid var(--border)',
        padding: '1rem',
      }}>
        <div className="container" style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>
            LLM 交易策略分析器
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span className={`badge badge-${user.subscription_tier}`}>
              {user.subscription_tier === 'free' ? '免费版' :
               user.subscription_tier === 'basic' ? '基础版' : '高级版'}
            </span>
            <span style={{ fontSize: '0.875rem' }}>
              剩余: {limits?.remaining ?? '-'} 次/天
            </span>
            <button onClick={handleLogout} className="btn btn-secondary" style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}>
              退出
            </button>
          </div>
        </div>
      </header>

      <main className="container" style={{ padding: '2rem 1rem' }}>
        <div className="grid grid-2" style={{ gap: '2rem' }}>
          {/* Left: Input Form */}
          <div>
            <div className="card mb-3">
              <h2 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '1.5rem' }}>
                股票/期货分析
              </h2>

              <div className="form-group">
                <label className="label">市场</label>
                <select
                  className="select"
                  value={market}
                  onChange={(e) => setMarket(e.target.value)}
                >
                  <option value="a">A股</option>
                  <option value="hk">港股</option>
                  <option value="us">美股</option>
                  <option value="futures">期货</option>
                </select>
              </div>

              <div className="form-group">
                <label className="label">
                  {market === 'a' ? '股票代码' :
                   market === 'hk' ? '港股代码' :
                   market === 'us' ? '美股代码' : '期货代码'}
                </label>
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

              <div className="form-group">
                <label className="label">API Key</label>
                <input
                  type="password"
                  className="input"
                  placeholder="请输入 DeepSeek API Key"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                />
                <p style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: '0.25rem' }}>
                  支持 OpenAI 兼容 API，推荐使用 DeepSeek（便宜）
                </p>
              </div>

              {error && <div className="error">{error}</div>}

              <button
                className="btn btn-primary"
                style={{ width: '100%', marginTop: '1rem' }}
                onClick={handleAnalyze}
                disabled={isAnalyzing || !symbol.trim() || !apiKey.trim()}
              >
                {isAnalyzing ? (
                  <>
                    <span className="spinner" style={{ width: '16px', height: '16px', marginRight: '0.5rem' }}></span>
                    分析中...
                  </>
                ) : (
                  '开始分析'
                )}
              </button>
            </div>

            {/* Quick Tips */}
            <div className="card">
              <h3 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '0.75rem' }}>
                快速提示
              </h3>
              <ul style={{ fontSize: '0.875rem', color: 'var(--muted)', paddingLeft: '1.25rem' }}>
                <li>A股输入纯数字代码，如 600519（茅台）</li>
                <li>港股输入数字代码，如 00700（腾讯）</li>
                <li>美股输入字母代码，如 AAPL（苹果）</li>
                <li>期货输入品种代码，如 MA（甲醇）</li>
              </ul>
            </div>
          </div>

          {/* Right: Results */}
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
                  background: result.result?.signal === 'bullish' ? '#dcfce7' :
                             result.result?.signal === 'bearish' ? '#fee2e2' : '#f3f4f6',
                  borderRadius: '0.75rem',
                  marginBottom: '1.5rem',
                }}>
                  <p style={{ fontSize: '0.875rem', color: 'var(--muted)' }}>信号</p>
                  <p style={{
                    fontSize: '2rem',
                    fontWeight: 'bold',
                    color: result.result?.signal === 'bullish' ? '#16a34a' :
                           result.result?.signal === 'bearish' ? '#dc2626' : '#6b7280',
                  }}>
                    {result.result?.signal === 'bullish' ? '看涨' :
                     result.result?.signal === 'bearish' ? '看跌' : '中性'}
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
                    <p style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>建议入场</p>
                    <p style={{ fontSize: '1.25rem', fontWeight: '600', color: 'var(--success)' }}>
                      {result.result?.entry_price?.toFixed(2)}
                    </p>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <p style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>止损</p>
                    <p style={{ fontSize: '1.25rem', fontWeight: '600', color: 'var(--danger)' }}>
                      {result.result?.stop_loss?.toFixed(2)}
                    </p>
                  </div>
                </div>

                {/* Risk Level */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  marginBottom: '1.5rem',
                }}>
                  <span style={{ fontSize: '0.875rem' }}>风险等级:</span>
                  <span className={`badge ${
                    result.result?.risk_level === 'low' ? 'badge-free' :
                    result.result?.risk_level === 'medium' ? 'badge-basic' : 'badge-premium'
                  }`}>
                    {result.result?.risk_level === 'low' ? '低' :
                     result.result?.risk_level === 'medium' ? '中' : '高'}
                  </span>
                </div>

                {/* Analysis */}
                <div style={{ marginBottom: '1rem' }}>
                  <h3 style={{ fontSize: '0.875rem', fontWeight: '600', marginBottom: '0.5rem' }}>
                    分析要点
                  </h3>
                  <p style={{ fontSize: '0.875rem', color: 'var(--foreground)', lineHeight: '1.6' }}>
                    {result.result?.analysis}
                  </p>
                </div>

                {/* Reasoning */}
                <div>
                  <h3 style={{ fontSize: '0.875rem', fontWeight: '600', marginBottom: '0.5rem' }}>
                    详细理由
                  </h3>
                  <p style={{ fontSize: '0.875rem', color: 'var(--muted)', lineHeight: '1.6' }}>
                    {result.result?.reasoning}
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
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
