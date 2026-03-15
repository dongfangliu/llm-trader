'use client';

import { type FC } from 'react';
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

const MARKET_LABELS: Record<string, string> = { a: 'A股', hk: '港股', us: '美股', futures: '期货' };

function getActionDisplay(action: string | undefined) {
  if (!action) return { text: '观望', color: '#f59e0b' };
  const a = action.toLowerCase();
  if (a === 'buy' || a === '买入') return { text: '买入', color: '#ef4444' };
  if (a === 'sell' || a === '卖出') return { text: '卖出', color: '#22c55e' };
  return { text: '观望', color: '#f59e0b' };
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

export interface MobileViewProps {
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
  resultPositionParams: { holdingQuantity?: string; costPrice?: string; maxPosition?: string } | null;

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
  saveLongLoading: boolean;
  shareConfirmOpen: boolean;
  sharePendingLongImage: boolean;
  showUpgradeBanner: boolean;
  userMenuOpen: boolean;
  historySheetOpen: boolean;
  resultSheetOpen: boolean;
  guestTrialUsed: boolean;
  deviceBanned: boolean;

  // History
  history: Array<{ id: string; symbol: string; name: string; market: string; action?: string; confidence?: number; analyzedAt?: string; detail?: any; positionParams?: any }>;

  // Tabs
  allTabs: Array<{ label: string; key: string }>;
  activeTab: number;
  multiPeriodResults: Array<{ period: string; result: any }>;

  // Unread
  unreadResults: number;

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
  setResult: (v: any) => void;
  setResultPositionParams: (v: any) => void;

  // Callbacks - UI
  setUserMenuOpen: (v: boolean) => void;
  setHistorySheetOpen: (v: boolean) => void;
  setResultSheetOpen: (v: boolean) => void;
  setSelectedHistoryId: (v: string | null) => void;
  setUnreadResults: (v: number | ((prev: number) => number)) => void;

  // Callbacks - share/bookmark
  onShare: () => void;
  onSave: () => void;
  generateShareCard: (includePosition?: boolean, resultOverride?: any, analyzedAtOverride?: string | null, longImage?: boolean) => void;
  setShareConfirmOpen: (v: boolean) => void;

  // Callbacks - user menu
  onLogout: () => void;
  setSavedRecordsOpen: (v: boolean) => void;

  // Navigation
  onNavigate: (path: string) => void;

  // Helpers
  sanitizeSymbol: (v: string) => string;
  isSavedRecord: (id: string) => boolean;

  // Hot stocks refresh
  onRefreshHotStocks: () => void;
}

const MobileView: FC<MobileViewProps> = (props) => {
  const {
    appName, user, tier, effectiveTier, isRegisteredProTrial, isGuestTrial,
    tierLabel, limits, pricing, appConfig,
    activePanel, result, error, isAnalyzing, analyzeTimedOut, analyzingSymbol,
    analyzeStartedAt, premiumPendingCount, narrativeIdx, NARRATIVE_TEXTS,
    selectedHistoryId, resultDisplayTier, resultPositionParams,
    symbol, market, period, holdingQuantity, costPrice, maxPosition,
    symbolWarning, multiPeriodEnabled, auxiliaryPeriods,
    premiumInputsOpen, hotRecommendations, shareLoading, saveLongLoading,
    shareConfirmOpen, sharePendingLongImage, showUpgradeBanner,
    userMenuOpen, historySheetOpen, resultSheetOpen,
    guestTrialUsed, deviceBanned,
    history, allTabs, activeTab, multiPeriodResults, unreadResults,
    onAnalyze, onBackToAnalyze, onOpenHistoryDetail,
    setSymbol, setMarket, setPeriod, setHoldingQuantity, setCostPrice, setMaxPosition,
    setMultiPeriodEnabled, toggleAuxPeriod, setPremiumInputsOpen, setActivePanel, setActiveTab,
    setResult, setResultPositionParams,
    setUserMenuOpen, setHistorySheetOpen, setResultSheetOpen,
    setSelectedHistoryId, setUnreadResults,
    onShare, onSave, generateShareCard, setShareConfirmOpen,
    onLogout, setSavedRecordsOpen, onNavigate,
    sanitizeSymbol, isSavedRecord,
  } = props;

  return (
    <>
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
                    onClick={() => onNavigate('/login')}
                    style={{ fontSize: '15px', fontWeight: 400, color: '#007aff', background: 'none', border: 'none', cursor: 'pointer', padding: '6px 4px', WebkitTapHighlightColor: 'transparent' }}
                  >登录</button>
                  <button
                    onClick={() => onNavigate('/register')}
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

      {/* ═══ User Menu Sheet (mobile only) ═══ */}
      <UserMenuSheet
        isOpen={userMenuOpen}
        onClose={() => setUserMenuOpen(false)}
        user={user}
        tier={tier}
        onAccount={() => onNavigate('/account')}
        onUpgrade={() => onNavigate('/upgrade')}
        onLogout={onLogout}
        onLogin={() => onNavigate('/login')}
        onSavedRecords={() => { setUserMenuOpen(false); setSavedRecordsOpen(true); }}
        onRegister={() => onNavigate('/register')}
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
                    <button onClick={() => onNavigate('/register')} style={{ width: '100%', height: 50, background: '#007aff', color: 'white', border: 'none', borderRadius: 12, fontSize: 17, fontWeight: 600, cursor: 'pointer', WebkitTapHighlightColor: 'transparent', marginBottom: 10, boxShadow: '0 4px 16px rgba(0,122,255,0.3)' }}>
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
                            onClick={() => onNavigate('/upgrade')}
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
                            onClick={() => onNavigate('/upgrade')}
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
                            onClick={() => onNavigate('/upgrade')}
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
                        <MarketSegmented value={market} onChange={setMarket} tier={effectiveTier} onLockedClick={() => onNavigate('/upgrade')} />
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
                      </div>

                      {/* ── Hot stocks ── */}
                      <div style={{ background: 'white', padding: '12px 16px 16px' }}>
                        <HotStocksStrip stocks={hotRecommendations} onSelect={(stock) => { setMarket(stock.market); setSymbol(stock.code); }} onRefresh={props.onRefreshHotStocks} />
                      </div>

                      {/* ── Hairline divider ── */}
                      <div style={{ height: '0.5px', background: 'rgba(60,60,67,0.1)' }} />

                      {/* ── Advanced settings ── */}
                      <div style={{ background: 'white' }}>
                        <AdvancedSettingsPanel
                          period={period} setPeriod={setPeriod}
                          multiPeriodEnabled={multiPeriodEnabled}
                          setMultiPeriodEnabled={setMultiPeriodEnabled}
                          auxiliaryPeriods={auxiliaryPeriods} toggleAuxPeriod={toggleAuxPeriod}
                          holdingQuantity={holdingQuantity} setHoldingQuantity={setHoldingQuantity}
                          costPrice={costPrice} setCostPrice={setCostPrice}
                          maxPosition={maxPosition} setMaxPosition={setMaxPosition}
                          premiumInputsOpen={premiumInputsOpen} setPremiumInputsOpen={setPremiumInputsOpen}
                          tier={effectiveTier} onUpgrade={() => onNavigate('/upgrade')}
                        />
                      </div>

                      {/* ── Upgrade teaser ── */}
                      {effectiveTier !== 'premium' && (
                        <>
                          <div style={{ height: '0.5px', background: 'rgba(60,60,67,0.1)' }} />
                          <div style={{ background: 'white' }}>
                            <UpgradeTeaser tier={tier} pricing={pricing} onUpgrade={() => onNavigate('/upgrade')} />
                          </div>
                        </>
                      )}

                      {/* Bottom clearance for FAB + bottom nav */}
                      <div style={{ height: 'calc(var(--btn-h, 52px) + var(--bottom-nav-h, 56px) + 20px)', background: 'white', flexShrink: 0 }} />
                    </>
                  )}
                </div>
              </div>

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
                      onClick={() => onNavigate('/upgrade')}
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
                    onClick={onAnalyze}
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
                        onClick={onBackToAnalyze}
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
                    onShare={() => onShare()}
                    onSave={onSave}
                    onSavedListOpen={() => setSavedRecordsOpen(true)}
                    shareLoading={shareLoading}
                    saveLongLoading={saveLongLoading}
                    onUpgrade={() => onNavigate('/upgrade')}
                    historyItems={history}
                    onHistorySelect={(id) => {
                      const item = history.find(h => h.id === id);
                      if (item) onOpenHistoryDetail(item);
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

                  {/* ── Share confirmation (mobile bottom sheet) ── */}
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

                  {/* ── Signal block (mobile only) ── */}
                  <div className="result-section result-section-animated mobile-only">
                    <SignalHero result={result} tier={resultDisplayTier} period={period} />
                  </div>

                  {/* ── Deep analysis tabs (mobile only) ── */}
                  {effectiveTier !== 'free' && result.result && (
                    <div className="result-section result-section-animated mobile-only" style={{ padding: 0 }}>
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
                  )}

                  {/* ── Risk factors (mobile only) ── */}
                  {effectiveTier !== 'free' && result.result?.risk_factors?.length > 0 && (
                    <div className="result-section result-section-animated mobile-only">
                      <div className="result-section-title">风险因素</div>
                      <div className="risk-chips-wrap">
                        {result.result.risk_factors.map((f: string, i: number) => (
                          <span key={i} className="risk-chip">
                            <span className="risk-chip-dot" />
                            {f}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ── Technical indicators (mobile only) ── */}
                  {effectiveTier !== 'free' && result.result?.indicators && (
                    <div className="result-section result-section-animated mobile-only">
                      <div className="result-section-title">技术指标</div>
                      <div className="indicator-scroll">
                        {Object.entries(result.result.indicators).map(([k, v]) => (
                          <div key={k} className="indicator-card">
                            <div className="indicator-card-name">{k}</div>
                            <div className="indicator-card-value">
                              {typeof v === 'number' ? (v as number).toFixed(2) : String(v)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ── Position advice (mobile only) ── */}
                  {effectiveTier !== 'free' && (result.result?.position_advice || (resultPositionParams && Object.values(resultPositionParams).some((v) => v?.trim()))) && (
                    <div className="result-section result-section-animated mobile-only">
                      {result.result?.position_advice && (
                        <div style={{ marginBottom: resultPositionParams && Object.values(resultPositionParams).some((v) => v?.trim()) ? '1rem' : 0 }}>
                          <div className="result-section-title">持仓建议</div>
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
                  )}

                  {/* ── Upgrade nudge (mobile only) ── */}
                  {resultDisplayTier !== 'premium' && (
                    <div className="result-section mobile-only result-section-animated" style={{ padding: 0 }}>
                      <UpgradeNudge tier={resultDisplayTier} pricing={pricing} onUpgrade={() => onNavigate('/upgrade')} />
                    </div>
                  )}

                  {/* ── Action row (mobile only) ── */}
                  <div className="result-section result-action-section result-section-animated mobile-only">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
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
                        onClick={onBackToAnalyze}
                        className="result-action-btn ghost-continue"
                        style={{ width: '100%' }}
                      >
                        继续分析
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </main>

      {/* ═══ BOTTOM NAV (mobile only) ═══ */}
      <BottomNav
        activePanel={activePanel}
        setActivePanel={(p) => {
          if (p === 'result') setUnreadResults(0);
          setActivePanel(p);
        }}
        hasResult={!!result}
        hasHistory={history.length > 0}
        historyCount={history.length}
        tier={tier}
        onUpgrade={() => onNavigate('/upgrade')}
        onAccount={() => setUserMenuOpen(true)}
        newResultsCount={unreadResults}
        analyzingCount={premiumPendingCount}
      />

      {/* ═══ HISTORY SHEET (mobile only) ═══ */}
      <HistorySheet
        isOpen={historySheetOpen}
        onClose={() => setHistorySheetOpen(false)}
        history={history}
        selectedHistoryId={selectedHistoryId}
        tier={tier}
        onOpenDetail={(h) => { onOpenHistoryDetail(h); }}
        onShare={(h, longImage) => generateShareCard(undefined, h.detail, h.analyzedAt, longImage)}
      />
    </>
  );
};

export default MobileView;
