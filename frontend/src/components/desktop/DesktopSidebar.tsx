'use client';

import { type FC } from 'react';

interface DesktopSidebarProps {
  activePanel: 'analyze' | 'loading' | 'result';
  history: Array<{
    id: string;
    symbol: string;
    name: string;
    market: string;
    action?: string;
    confidence?: number;
    analyzedAt?: string;
    detail?: any;
  }>;
  analyzingItems: Array<{ tempId: string; symbol: string }>;
  selectedHistoryId: string | null;
  limits: { remaining: number; daily_limit: number } | null;
  effectiveTier: string;
  user: any;
  onNewAnalysis: () => void;
  onOpenHistory: (item: any) => void;
  onUpgrade: () => void;
  onUserMenuOpen: () => void;
  appName: string;
  tierLabel: string;
  isRegisteredProTrial: boolean;
  isGuestTrial: boolean;
}

function getActionDisplay(action: string | undefined) {
  if (!action) return { text: '观望', color: '#f59e0b' };
  const a = action.toLowerCase();
  if (a === 'buy' || a === '看涨') return { text: '看涨', color: '#ef4444' };
  if (a === 'sell' || a === '看跌') return { text: '看跌', color: '#22c55e' };
  return { text: '观望', color: '#f59e0b' };
}

const DesktopSidebar: FC<DesktopSidebarProps> = ({
  activePanel, history, analyzingItems, selectedHistoryId,
  limits, effectiveTier, user,
  onNewAnalysis, onOpenHistory, onUpgrade, onUserMenuOpen,
  appName, tierLabel, isRegisteredProTrial, isGuestTrial
}) => {
  return (
    <nav className="dt-sidebar">
      {/* ── Brand area ── */}
      <div className="dt-sidebar-brand">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg width="20" height="20" viewBox="0 0 22 22" fill="none">
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
          <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-0.2px', color: '#1c1c1e' }}>{appName}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
          <span style={{
            fontSize: 11, fontWeight: 500,
            color: effectiveTier === 'premium' ? '#7c3aed' : effectiveTier === 'basic' ? '#007aff' : '#8e8e93',
          }}>
            {(isRegisteredProTrial || isGuestTrial) ? '专业版体验' : tierLabel}
          </span>
          <span style={{ fontSize: 11, color: '#aeaeb2' }}>
            {limits?.remaining ?? '-'} / {limits?.daily_limit ?? '-'} 次
          </span>
        </div>
      </div>

      {/* Top nav */}
      <div style={{ flexShrink: 0, padding: '8px 0 4px' }}>
        {/* New analysis button */}
        <button
          className={`dt-nav-item${activePanel === 'analyze' || activePanel === 'loading' ? ' active' : ''}`}
          onClick={onNewAnalysis}
        >
          {/* Plus icon SVG */}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          新建分析
        </button>

        {/* Upgrade button (for non-premium) */}
        {effectiveTier !== 'premium' && (
          <button className="dt-nav-item" onClick={onUpgrade}>
            {/* Trending up icon */}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
              <polyline points="17 6 23 6 23 12"/>
            </svg>
            升级套餐
          </button>
        )}
      </div>

      {/* History list */}
      <div className="dt-hist-list">
        {/* Analyzing placeholders */}
        {analyzingItems.length > 0 && (
          <>
            {analyzingItems.map((a) => (
              <div key={a.tempId} className="dt-hist-item dt-hist-item-analyzing">
                <div className="dt-hist-item-name">{a.symbol}</div>
                <div className="dt-hist-item-row">
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#007aff' }}>研判中</span>
                  <div style={{
                    width: 14, height: 14, borderRadius: '50%',
                    border: '2px solid rgba(0,122,255,0.2)', borderTopColor: '#007aff',
                    animation: 'rs-spin 0.8s linear infinite'
                  }} />
                </div>
              </div>
            ))}
          </>
        )}

        {/* History items */}
        {history.length > 0 ? (
          <>
            <div className="dt-hist-list-label">历史记录</div>
            {history.slice(0, 50).map((h) => {
              const ad = getActionDisplay(h.action);
              const isSelected = h.id === selectedHistoryId;
              const timeStr = h.analyzedAt
                ? new Date(h.analyzedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
                : '';
              return (
                <button
                  key={h.id}
                  className={`dt-hist-item${isSelected ? ' active' : ''}`}
                  onClick={() => onOpenHistory(h)}
                >
                  <div className="dt-hist-item-name">{h.name || h.symbol}</div>
                  <div className="dt-hist-item-row">
                    <span className="dt-hist-item-signal" style={{ color: ad.color }}>{ad.text}</span>
                    <span className="dt-hist-item-time">{timeStr}</span>
                  </div>
                </button>
              );
            })}
          </>
        ) : (
          <div style={{ padding: '20px 10px', fontSize: 12, color: '#aeaeb2', textAlign: 'center', lineHeight: 1.6 }}>
            暂无历史记录<br/>分析后将在此显示
          </div>
        )}
      </div>

      {/* Bottom: quota + avatar */}
      <div className="dt-sidebar-bottom">
        <div>
          <div style={{ fontSize: 11, fontWeight: 500, color: '#8e8e93', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>
            今日剩余
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#1c1c1e', letterSpacing: '-1px', lineHeight: 1 }}>
            {limits?.remaining ?? '-'}
          </div>
          <div style={{ fontSize: 12, color: '#aeaeb2', marginTop: 2 }}>
            / {limits?.daily_limit ?? '-'} 次
          </div>
        </div>
        <button
          className="dt-my-btn"
          onClick={onUserMenuOpen}
          aria-label="我的"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3c3c43" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
          </svg>
        </button>
      </div>
    </nav>
  );
};

export default DesktopSidebar;
