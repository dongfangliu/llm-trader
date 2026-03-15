'use client';

import { type FC, type RefObject } from 'react';
import MarketSegmented from '@/components/MarketSegmented';
import HotStocksStrip from '@/components/HotStocksStrip';
import AdvancedSettingsPanel from '@/components/AdvancedSettingsPanel';
import UpgradeTeaser from '@/components/UpgradeTeaser';
import SignalHero from '@/components/SignalHero';
import ResultTabs from '@/components/ResultTabs';
import MultiPeriodCards from '@/components/MultiPeriodCards';
import UpgradeNudge from '@/components/UpgradeNudge';
import DesktopSidebar from './DesktopSidebar';
import DesktopShareModal from './DesktopShareModal';

const MARKET_LABELS: Record<string, string> = { a: 'A股', hk: '港股', us: '美股', futures: '期货' };

interface DesktopViewProps {
  // App/auth
  appName: string;
  user: any;
  tier: string;
  effectiveTier: string;
  isRegisteredProTrial: boolean;
  isGuestTrial: boolean;
  tierLabel: string;
  limits: { remaining: number; daily_limit: number } | null;
  pricing: any;
  appConfig: any;

  // Analysis state
  activePanel: 'analyze' | 'loading' | 'result';
  result: any;
  error: string | null;
  isAnalyzing: boolean;
  analyzeTimedOut: boolean;
  analyzingSymbol: string;
  analyzeStartedAt: string | null;
  premiumPendingCount: number;
  narrativeIdx: number;
  NARRATIVE_TEXTS: string[];
  selectedHistoryId: string | null;
  resultDisplayTier: string;

  // Form state
  symbol: string;
  market: string;
  period: string;
  holdingQuantity: string;
  costPrice: string;
  maxPosition: string;
  symbolWarning: string | null;
  multiPeriodEnabled: boolean;
  auxiliaryPeriods: string[];

  // UI state
  premiumInputsOpen: boolean;
  hotRecommendations: Array<{ code: string; name: string; market: string }>;
  shareLoading: boolean;
  sharePreviewOpen: boolean;
  sharePreviewBlob: Blob | null;
  sharePreviewFilename: string;
  sharePreviewArchiveBlob: Blob | null;
  sharePreviewArchiveFilename: string;
  sharePreviewActionColor: string;
  sharePreviewStockMeta?: { name: string; action: string; confidence: number | null };
  onSharePreviewClose: () => void;
  onRequestArchive: () => Promise<void>;
  dtUserMenuOpen: boolean;
  dtUserBtnRef: RefObject<HTMLButtonElement>;
  dtPopoverRef: RefObject<HTMLDivElement>;

  // History
  history: Array<{ id: string; symbol: string; name: string; market: string; action?: string; confidence?: number; analyzedAt?: string; detail?: any }>;
  analyzingItems: Array<{ tempId: string; symbol: string }>;

  // Tabs
  allTabs: Array<{ label: string; key: string }>;
  activeTab: number;
  multiPeriodResults: Array<{ period: string; result: any }>;
  hasMultiPeriod: boolean;

  // Saved records
  savedRecords: any[];

  // Callbacks - analysis
  onAnalyze: () => void;
  onBackToAnalyze: () => void;
  onOpenHistoryDetail: (item: any) => void;

  // Callbacks - form
  setSymbol: (v: string) => void;
  setMarket: (v: string) => void;
  setPeriod: (v: string) => void;
  setHoldingQuantity: (v: string) => void;
  setCostPrice: (v: string) => void;
  setMaxPosition: (v: string) => void;
  setMultiPeriodEnabled: (v: boolean) => void;
  toggleAuxPeriod: (p: string) => void;
  setPremiumInputsOpen: (v: boolean | ((prev: boolean) => boolean)) => void;
  setActivePanel: (v: 'analyze' | 'loading' | 'result') => void;
  setActiveTab: (v: number) => void;

  // Callbacks - share/bookmark
  onBookmark: () => void;
  onShare: () => void;

  // Callbacks - user menu
  setDtUserMenuOpen: (v: boolean | ((prev: boolean) => boolean)) => void;
  onLogout: () => void;
  setSavedRecordsOpen: (v: boolean) => void;

  // Navigation
  onNavigate: (path: string) => void;

  // Helpers
  sanitizeSymbol: (v: string) => string;
  isSavedRecord: (id: string) => boolean;
  showToast?: (msg: string, type?: string) => void;

  // Hot stocks refresh
  onRefreshHotStocks: () => void;
}

const DesktopView: FC<DesktopViewProps> = (props) => {
  const {
    appName, user, tier, effectiveTier, isRegisteredProTrial, isGuestTrial,
    tierLabel, limits, pricing, appConfig,
    activePanel, result, error, isAnalyzing, analyzeTimedOut, analyzingSymbol,
    analyzeStartedAt, premiumPendingCount, narrativeIdx, NARRATIVE_TEXTS,
    selectedHistoryId, resultDisplayTier,
    symbol, market, period, holdingQuantity, costPrice, maxPosition,
    symbolWarning, multiPeriodEnabled, auxiliaryPeriods,
    premiumInputsOpen, hotRecommendations, shareLoading,
    sharePreviewOpen, sharePreviewBlob, sharePreviewFilename, sharePreviewArchiveBlob,
    sharePreviewArchiveFilename, sharePreviewActionColor, sharePreviewStockMeta,
    onSharePreviewClose, onRequestArchive,
    dtUserMenuOpen, dtUserBtnRef, dtPopoverRef,
    history, analyzingItems, allTabs, activeTab, multiPeriodResults, hasMultiPeriod,
    savedRecords,
    onAnalyze, onBackToAnalyze, onOpenHistoryDetail,
    setSymbol, setMarket, setPeriod, setHoldingQuantity, setCostPrice, setMaxPosition,
    setMultiPeriodEnabled, toggleAuxPeriod, setPremiumInputsOpen, setActivePanel, setActiveTab,
    onBookmark, onShare,
    setDtUserMenuOpen, onLogout, setSavedRecordsOpen, onNavigate,
    sanitizeSymbol, isSavedRecord, onRefreshHotStocks,
  } = props;

  return (
    <>
      {/* ── User popover ── */}
      {dtUserMenuOpen && user && (
        <div className="dt-user-popover" ref={dtPopoverRef}>
          <div className="dt-popover-row" onClick={() => { onNavigate('/account'); setDtUserMenuOpen(false); }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            账号设置
          </div>
          {effectiveTier !== 'premium' && (
            <div className="dt-popover-row" onClick={() => { onNavigate('/upgrade'); setDtUserMenuOpen(false); }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
              升级套餐
            </div>
          )}
          <div className="dt-popover-row" onClick={() => { setSavedRecordsOpen(true); setDtUserMenuOpen(false); }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
            收藏记录
          </div>
          <div style={{ borderTop: '0.5px solid rgba(60,60,67,0.1)' }} />
          <div className="dt-popover-row" onClick={() => { onLogout(); setDtUserMenuOpen(false); }} style={{ color: '#ff3b30' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            退出登录
          </div>
        </div>
      )}

      {/* ── Two-column content zone ── */}
      <div className="dt-content">

        {/* ── Sidebar ── */}
        <DesktopSidebar
          activePanel={activePanel}
          history={history}
          analyzingItems={analyzingItems}
          selectedHistoryId={selectedHistoryId}
          limits={limits}
          effectiveTier={effectiveTier}
          user={user}
          onNewAnalysis={() => setActivePanel('analyze')}
          onOpenHistory={onOpenHistoryDetail}
          onUpgrade={() => onNavigate('/upgrade')}
          onUserMenuOpen={() => { user ? setDtUserMenuOpen(v => !v) : onNavigate('/login'); }}
          appName={appName}
          tierLabel={tierLabel}
          isRegisteredProTrial={isRegisteredProTrial}
          isGuestTrial={isGuestTrial}
        />

        {/* ── Workspace ── */}
        <div className="dt-workspace">

          {/* STATE: analyze — Spotlight-style centered form */}
          {activePanel === 'analyze' && (
            <div className="dt-workspace-analyze">
              <div className="dt-spotlight-form">
                {/* Title */}
                <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1c1c1e', margin: '0 0 24px', letterSpacing: '-0.3px', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                  分析一支股票
                  {(isRegisteredProTrial || isGuestTrial) && (
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed', background: '#ede9fe', borderRadius: 20, padding: '3px 10px', letterSpacing: '0.2px' }}>专业版体验中</span>
                  )}
                </h1>

                {/* Market segmented control */}
                <div style={{ marginBottom: 16 }}>
                  <MarketSegmented value={market} onChange={setMarket} tier={effectiveTier} onLockedClick={() => onNavigate('/upgrade')} />
                </div>

                {/* Symbol input */}
                <div style={{ position: 'relative', marginBottom: 12 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#aeaeb2" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
                    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                  </svg>
                  <input
                    type="text"
                    placeholder={market === 'a' ? '输入股票代码，如 600519' : market === 'hk' ? '输入港股代码，如 00700' : market === 'us' ? '输入美股代码，如 AAPL' : '输入期货代码，如 MA'}
                    value={symbol}
                    onChange={e => setSymbol(sanitizeSymbol(e.target.value))}
                    onKeyDown={e => e.key === 'Enter' && symbol.trim() && onAnalyze()}
                    style={{ width: '100%', height: 48, background: '#ffffff', border: '1px solid rgba(60,60,67,0.15)', outline: 'none', borderRadius: 12, padding: '0 16px 0 38px', fontSize: 15, color: '#1c1c1e', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', transition: 'border-color 0.15s' }}
                  />
                  {symbolWarning && symbol.trim() && (
                    <p style={{ fontSize: 12, color: '#ff9500', marginTop: 6, marginLeft: 2 }}>⚠️ {symbolWarning}</p>
                  )}
                </div>

                {/* Hot stocks */}
                <div style={{ marginBottom: 16 }}>
                  <HotStocksStrip stocks={hotRecommendations} onSelect={(stock) => { setMarket(stock.market); setSymbol(stock.code); }} onRefresh={onRefreshHotStocks} />
                </div>

                {/* Hairline */}
                <div style={{ height: '0.5px', background: 'rgba(60,60,67,0.1)', margin: '0 0 8px' }} />

                {/* Advanced settings */}
                <AdvancedSettingsPanel
                  period={period} setPeriod={setPeriod}
                  multiPeriodEnabled={multiPeriodEnabled}
                  setMultiPeriodEnabled={(v) => { setMultiPeriodEnabled(v); }}
                  auxiliaryPeriods={auxiliaryPeriods} toggleAuxPeriod={toggleAuxPeriod}
                  holdingQuantity={holdingQuantity} setHoldingQuantity={setHoldingQuantity}
                  costPrice={costPrice} setCostPrice={setCostPrice}
                  maxPosition={maxPosition} setMaxPosition={setMaxPosition}
                  premiumInputsOpen={premiumInputsOpen} setPremiumInputsOpen={setPremiumInputsOpen}
                  tier={effectiveTier} onUpgrade={() => onNavigate('/upgrade')}
                />

                {/* Upgrade teaser */}
                {effectiveTier !== 'premium' && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ height: '0.5px', background: 'rgba(60,60,67,0.1)', margin: '0 0 8px' }} />
                    <UpgradeTeaser tier={tier} pricing={pricing} onUpgrade={() => onNavigate('/upgrade')} />
                  </div>
                )}

                {/* Error message */}
                {error && (
                  <div style={{ color: '#ff3b30', fontSize: 13, marginTop: 12, lineHeight: 1.5 }}>{error}</div>
                )}

                {/* Analyze button */}
                <button
                  onClick={onAnalyze}
                  disabled={!symbol.trim() || isAnalyzing}
                  style={{
                    marginTop: 16, width: '100%', height: 50, borderRadius: 14,
                    background: !symbol.trim() || isAnalyzing ? 'rgba(0,122,255,0.07)' : '#007aff',
                    color: !symbol.trim() || isAnalyzing ? 'rgba(0,122,255,0.38)' : 'white',
                    border: !symbol.trim() || isAnalyzing ? '1px solid rgba(0,122,255,0.15)' : 'none',
                    fontSize: 17, fontWeight: 600,
                    cursor: !symbol.trim() || isAnalyzing ? 'not-allowed' : 'pointer',
                    transition: 'background 0.15s, color 0.15s',
                  }}
                >
                  {effectiveTier === 'premium' && premiumPendingCount > 0 ? `开始分析（进行中 ${premiumPendingCount}）` : '开始分析'}
                </button>
              </div>
            </div>
          )}

          {/* STATE: loading */}
          {activePanel === 'loading' && (
            <div className="dt-loading-zone">
              <div style={{ position: 'absolute', width: 360, height: 360, background: 'radial-gradient(circle at center, rgba(0,122,255,0.07) 0%, transparent 70%)', borderRadius: '50%', animation: 'loading-breathe 3.5s ease-in-out infinite', pointerEvents: 'none', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }} />
              {analyzeTimedOut ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, maxWidth: 300, position: 'relative', zIndex: 1 }}>
                  <div style={{ fontSize: 48 }}>⏰</div>
                  <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1c1c1e', margin: 0 }}>分析时间较长</h2>
                  <p style={{ fontSize: 15, color: '#8e8e93', lineHeight: 1.75, margin: 0, textAlign: 'center' }}>AI 服务响应超过 3 分钟<br/>可等待继续，或返回重试</p>
                  <button onClick={onBackToAnalyze} style={{ padding: '12px 40px', borderRadius: 14, background: '#f2f2f7', border: 'none', fontSize: 15, fontWeight: 600, color: '#1c1c1e', cursor: 'pointer' }}>返回重试</button>
                </div>
              ) : (
                <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                  <div style={{ fontSize: 60, fontWeight: 900, letterSpacing: '-3px', color: '#1c1c1e', lineHeight: 1, marginBottom: 10, animation: 'loading-symbol-in 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards' }}>
                    {analyzingSymbol}
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 500, color: '#aeaeb2', letterSpacing: '2.5px', textTransform: 'uppercase', marginBottom: 48, animation: 'loading-subtitle-in 0.6s 0.15s ease-out both' }}>
                    深度研判中
                  </div>
                  <p key={narrativeIdx} style={{ fontSize: 14, fontWeight: 500, color: '#3c3c43', margin: '0 0 28px', animation: 'narrative-fade 0.35s ease-out', minHeight: '1.7em' }}>
                    {NARRATIVE_TEXTS[narrativeIdx]}
                  </p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {[0, 1, 2].map(i => (
                      <div key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: '#007aff', opacity: 0.4, animation: `loading-dot 1.4s ${i * 0.22}s ease-in-out infinite` }} />
                    ))}
                  </div>
                  {effectiveTier === 'premium' && (
                    <button onClick={() => setActivePanel('analyze')} style={{ background: 'none', border: 'none', fontSize: 13, fontWeight: 500, color: '#aeaeb2', cursor: 'pointer', marginTop: 48, padding: '4px 0' }}>
                      继续下一个分析 →
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* STATE: result with data */}
          {activePanel === 'result' && result && (
            <div className="dt-result-scroll">
              <div className="dt-result-content dt-result-enter">
                {/* Back button + title row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
                  <div>
                    <h2 style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.4px', color: '#1c1c1e', margin: '0 0 3px' }}>
                      {result.data?.name
                        ? <>{result.data.name} <span style={{ fontSize: 14, fontWeight: 400, color: '#8e8e93' }}>({result.data.symbol})</span></>
                        : result.data?.symbol}
                    </h2>
                    <div style={{ fontSize: 12, color: '#8e8e93' }}>
                      {MARKET_LABELS[result.data?.market] || result.data?.market?.toUpperCase()}
                      {analyzeStartedAt && <span> · {new Date(analyzeStartedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    {/* 收藏按钮 */}
                    <button
                      onClick={onBookmark}
                      title={isSavedRecord(selectedHistoryId ?? '') ? '取消收藏' : '收藏'}
                      style={{
                        height: 34, padding: '0 12px', fontSize: 13,
                        background: isSavedRecord(selectedHistoryId ?? '') ? '#fef9c3' : '#f2f2f7',
                        border: 'none', borderRadius: 8, cursor: 'pointer',
                        color: '#1c1c1e', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4,
                      }}
                    >
                      {isSavedRecord(selectedHistoryId ?? '') ? '★' : '☆'}
                      {isSavedRecord(selectedHistoryId ?? '') ? ' 已收藏' : ' 收藏'}
                    </button>

                    {/* 分享预判 */}
                    <button
                      onClick={onShare}
                      disabled={shareLoading}
                      style={{
                        height: 34, padding: '0 16px', fontSize: 13,
                        background: shareLoading ? '#93c5fd' : '#007aff',
                        border: 'none', borderRadius: 8,
                        cursor: shareLoading ? 'default' : 'pointer',
                        color: 'white', fontWeight: 600, whiteSpace: 'nowrap',
                      }}
                    >
                      {shareLoading ? '生成中…' : '↗ 分享预判'}
                    </button>
                  </div>
                </div>

                {/* Signal hero */}
                <SignalHero result={result} tier={resultDisplayTier} period={period} />

                {/* Deep analysis tabs */}
                {resultDisplayTier !== 'free' && result.result && (
                  <div style={{ marginTop: 20 }}>
                    <ResultTabs tabs={allTabs} activeTab={activeTab} onTabChange={setActiveTab}>
                      {allTabs[activeTab]?.key === '__multiperiod__' ? (
                        <MultiPeriodCards results={multiPeriodResults} />
                      ) : (
                        <p className="result-tab-text">{(result.result as any)?.[allTabs[activeTab]?.key] || '暂无数据'}</p>
                      )}
                    </ResultTabs>
                  </div>
                )}

                {/* Risk factors */}
                {resultDisplayTier !== 'free' && result.result?.risk_factors?.length > 0 && (
                  <div style={{ marginTop: 20 }}>
                    <div className="result-section-title">风险因素</div>
                    <div className="risk-chips-wrap">
                      {result.result.risk_factors.map((f: string, i: number) => (
                        <span key={i} className="risk-chip"><span className="risk-chip-dot" />{f}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Technical indicators */}
                {resultDisplayTier !== 'free' && result.result?.indicators && (
                  <div style={{ marginTop: 20 }}>
                    <div className="result-section-title">技术指标</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {Object.entries(result.result.indicators).map(([k, v]) => (
                        <span key={k} style={{ fontSize: 12, padding: '4px 10px', background: 'white', borderRadius: 6, color: '#3c3c43', border: '1px solid rgba(60,60,67,0.1)' }}>{k}: {typeof v === 'number' ? (v as number).toFixed(2) : String(v)}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Position advice */}
                {resultDisplayTier !== 'free' && result.result?.position_advice && (
                  <div style={{ marginTop: 20 }}>
                    <div className="result-section-title">持仓建议</div>
                    <p style={{ fontSize: 14, color: '#3c3c43', lineHeight: 1.7, margin: 0 }}>
                      {result.result.position_advice.reason}
                      {typeof result.result.position_advice.suggested_quantity === 'number' ? `（建议数量: ${result.result.position_advice.suggested_quantity}）` : ''}
                    </p>
                  </div>
                )}

                {/* Upgrade nudge */}
                {resultDisplayTier !== 'premium' && (
                  <div style={{ marginTop: 20 }}>
                    <UpgradeNudge tier={resultDisplayTier} pricing={pricing} onUpgrade={() => onNavigate('/upgrade')} />
                  </div>
                )}

                <div style={{ height: 40 }} />
              </div>
            </div>
          )}

          {/* STATE: result but no data yet / empty */}
          {(activePanel === 'result' && !result) && (
            <div className="dt-empty-state">
              {(isAnalyzing || premiumPendingCount > 0) ? (
                <>
                  <div style={{ width: 40, height: 40, borderRadius: '50%', border: '3px solid rgba(0,122,255,0.15)', borderTopColor: '#007aff', animation: 'rs-spin 0.8s linear infinite', marginBottom: 16 }} />
                  <div style={{ fontSize: 16, fontWeight: 600, color: '#1c1c1e', marginBottom: 6 }}>分析进行中，请稍候…</div>
                  {premiumPendingCount > 1 && (
                    <div style={{ fontSize: 13, color: '#8e8e93' }}>队列中共 {premiumPendingCount} 个任务</div>
                  )}
                </>
              ) : (
                <>
                  <svg width="56" height="56" viewBox="0 0 56 56" fill="none" style={{ opacity: 0.18, marginBottom: 16 }}>
                    <path d="M7 40L18 24L26 32L36 16L49 21" stroke="#1c1c1e" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/>
                    <circle cx="49" cy="21" r="3.5" fill="#1c1c1e"/>
                  </svg>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#1c1c1e', marginBottom: 8 }}>尚无分析结果</div>
                  <div style={{ fontSize: 14, color: '#8e8e93', lineHeight: 1.6 }}>输入股票代码，AI 将生成买卖建议和深度研判</div>
                </>
              )}
            </div>
          )}

        </div>{/* end dt-workspace */}
      </div>{/* end dt-content */}

      <DesktopShareModal
        isOpen={sharePreviewOpen}
        archiveBlob={sharePreviewArchiveBlob}
        archiveFilename={sharePreviewArchiveFilename}
        actionColor={sharePreviewActionColor}
        stockMeta={sharePreviewStockMeta}
        onClose={onSharePreviewClose}
        onRequestArchive={onRequestArchive}
      />
    </>
  );
};

export default DesktopView;
