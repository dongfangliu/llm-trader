'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import MultiPeriodCards from './MultiPeriodCards';

// ═══════════════════════════════════════════════════════════════
// V9: Animated ring — fills from 0 on mount (spring physics via CSS)
// ═══════════════════════════════════════════════════════════════
function Ring({ value, color, size = 88, dark = false }: { value: number; color: string; size?: number; dark?: boolean }) {
  const [displayed, setDisplayed] = useState(0);
  const strokeW = dark ? 9 : 6;
  const r = (size - strokeW * 2) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - displayed / 100);

  useEffect(() => {
    const t = setTimeout(() => setDisplayed(value), 80);
    return () => clearTimeout(t);
  }, [value]);

  const grade =
    value >= 85 ? '极强' : value >= 70 ? '较强' : value >= 50 ? '中等' : value >= 30 ? '偏弱' : '信号弱';

  // Activity-ring style on dark: nearly invisible dark track so fill blazes
  const textColor = dark ? '#ffffff' : color;
  const trackStroke = dark ? 'rgba(0,0,0,0.35)' : 'rgba(0,0,0,0.06)';
  const gradeColor = dark ? 'rgba(255,255,255,0.92)' : color;
  const gradeBg = dark ? 'rgba(255,255,255,0.15)' : `${color}18`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', overflow: 'visible' }}>
          {/* track */}
          <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={strokeW}
            stroke={trackStroke} fill="none" />
          {/* glow arc — blurred copy behind main arc for reliable glow in all renderers */}
          {dark && displayed > 0 && (
            <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={strokeW + 10}
              stroke={color} fill="none" strokeLinecap="round" opacity={0.38}
              strokeDasharray={circ} strokeDashoffset={offset}
              style={{ filter: 'blur(6px)' }} />
          )}
          {/* main fill arc */}
          <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={strokeW}
            stroke={color} fill="none" strokeLinecap="round"
            strokeDasharray={circ} strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 0.9s cubic-bezier(0.34,1.56,0.64,1)' }} />
        </svg>
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ fontSize: '22px', fontWeight: 800, color: textColor, lineHeight: 1, letterSpacing: '-0.5px' }}>{value}</span>
          <span style={{ fontSize: '9px', fontWeight: 600, color: textColor, opacity: 0.7, marginTop: '1px' }}>%</span>
        </div>
      </div>
      <span style={{
        fontSize: '11px', fontWeight: 700, color: gradeColor,
        background: gradeBg, borderRadius: '9999px',
        padding: '2px 8px', letterSpacing: '0.2px',
      }}>{grade}</span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// V3: Auto-bold technical keywords in reason text
// ═══════════════════════════════════════════════════════════════
const KEYWORDS = ['RSI', 'MACD', 'MA10', 'MA20', 'MA30', 'MA60', 'KDJ', 'EMA', 'ATR',
  '均线', '金叉', '死叉', '支撑', '阻力', '超买', '超卖', '成交量', '换手率', '布林',
  '趋势', '突破', '压力', '量能', '筑底', '顶部', '背离'];

function HighlightReason({ text, accentColor }: { text: string; accentColor: string }) {
  const pattern = new RegExp(`(${KEYWORDS.join('|')})`, 'g');
  const parts = text.split(pattern);
  return (
    <>
      {parts.map((p, i) =>
        KEYWORDS.includes(p)
          ? <strong key={i} style={{ color: accentColor, fontWeight: 700 }}>{p}</strong>
          : p
      )}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════
// V12: Narrative highlight — keywords + numbers/percentages
// V13: numbers get inline pill background for scanability
// ═══════════════════════════════════════════════════════════════
function HighlightNarrative({ text, accentColor }: { text: string; accentColor: string }) {
  const pattern = new RegExp(`(\\d+\\.?\\d*%|\\d+\\.?\\d*x|${KEYWORDS.join('|')})`, 'g');
  const parts = text.split(pattern);
  return (
    <>
      {parts.map((p, i) => {
        if (/^\d+\.?\d*[%x]$/.test(p))
          return (
            <strong key={i} style={{
              color: accentColor, fontSize: '1.05em', fontWeight: 800,
              background: `${accentColor}14`, borderRadius: '5px',
              padding: '0 4px', letterSpacing: '-0.2px', display: 'inline-block',
            }}>{p}</strong>
          );
        if (KEYWORDS.includes(p))
          return <strong key={i} style={{ color: accentColor, fontWeight: 700 }}>{p}</strong>;
        return p;
      })}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════
// V12: Narrative section card — icon + title + lead/body + skeleton
// V13: tint-based lead border, tinted card background
// ═══════════════════════════════════════════════════════════════
const NARRATIVE_SECTIONS = [
  { key: 'market_diagnosis',       icon: '诊', title: '市场诊断', tint: '#0071e3' },
  { key: 'opportunity_assessment', icon: '机', title: '机会评估', tint: '#f59e0b' },
  { key: 'risk_analysis',          icon: '险', title: '风险收益', tint: '#ef4444' },
  { key: 'execution_plan',         icon: '行', title: '执行方案', tint: '#10b981' },
];

function NarrativeSection({
  icon, title, tint, text, accentColor, index,
}: {
  icon: string; title: string; tint: string;
  text: string | undefined; accentColor: string; index: number;
}) {
  // V13: tinted card bg + stagger
  const cardStyle = {
    animationDelay: `${index * 90}ms`,
    background: `linear-gradient(135deg, ${tint}09 0%, #fff 55%)`,
  } as React.CSSProperties;

  if (!text) {
    return (
      <div className="rs-narrative-section rs-narr-skeleton" style={cardStyle}>
        <div className="rs-narr-head-row">
          <span className="rs-narr-icon" style={{ background: `${tint}18`, color: tint }}>{icon}</span>
          <span className="rs-narr-title" style={{ color: tint }}>{title}</span>
        </div>
        <div className="rs-sk-lines">
          <div className="rs-sk-line rs-sk-60" />
          <div className="rs-sk-line rs-sk-100" />
          <div className="rs-sk-line rs-sk-80" />
        </div>
      </div>
    );
  }

  const cutIdx = text.indexOf('。');
  const lead = cutIdx !== -1 ? text.slice(0, cutIdx + 1) : text.slice(0, 90);
  const body = cutIdx !== -1 ? text.slice(cutIdx + 1).trim() : text.slice(90).trim();

  return (
    <div className="rs-narrative-section" style={cardStyle}>
      <div className="rs-narr-head-row">
        <span className="rs-narr-icon" style={{ background: `${tint}18`, color: tint }}>{icon}</span>
        <span className="rs-narr-title" style={{ color: tint }}>{title}</span>
      </div>
      {/* V13: lead border = section tint (not global action color) */}
      <div className="rs-narr-lead" style={{ borderLeft: `3px solid ${tint}` }}>
        <HighlightNarrative text={lead} accentColor={tint} />
      </div>
      {body.length > 0 && (
        <div className="rs-narr-body">
          <HighlightNarrative text={body} accentColor={accentColor} />
        </div>
      )}
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════
// Indicator status color — context-aware signal coloring
// ═══════════════════════════════════════════════════════════════
function indicatorColor(key: string, value: unknown): string {
  if (typeof value !== 'number') return '#4b5563';
  const v = value as number;
  if (key === 'RSI')  return v >= 70 ? '#dc2626' : v <= 30 ? '#16a34a' : '#4b5563';
  if (key === 'MACD') return v > 0   ? '#16a34a' : '#dc2626';
  if (key === 'KDJ' || key === 'KDJ_K') return v >= 80 ? '#dc2626' : v <= 20 ? '#16a34a' : '#4b5563';
  // V11: neutral gray for MA/EMA/ATR — not alarming, just structural
  return '#d1d5db';
}

// V11: indicator status word
function indicatorStatus(key: string, value: unknown): string {
  if (typeof value !== 'number') return '';
  const v = value as number;
  if (key === 'RSI') return v >= 70 ? '超买' : v <= 30 ? '超卖' : '中性';
  if (key === 'MACD') return v > 0.5 ? '看多' : v < -0.5 ? '看空' : '中性';
  if (key === 'KDJ' || key === 'KDJ_K') return v >= 80 ? '超买' : v <= 20 ? '超卖' : '中性';
  return '';
}

// V11: risk chip severity — broader keyword matching
function riskSeverity(text: string): { bg: string; border: string; dot: string; textColor: string } {
  if (/高|重大|严重|重要|持续|加大|压力|下行|缩/.test(text)) return { bg: '#fef2f2', border: '#fecaca', dot: '#dc2626', textColor: '#991b1b' };
  if (/中等|适中|一般|缓慢|不及/.test(text)) return { bg: '#fffbeb', border: '#fcd34d', dot: '#d97706', textColor: '#92400e' };
  return { bg: '#f8fafc', border: '#e2e8f0', dot: '#94a3b8', textColor: '#475569' };
}
const PERIOD_LABELS: Record<string, string> = {
  daily: '日线', '60': '60分', '30': '30分', '15': '15分', '5': '5分', '1': '1分',
};
const ACTION: Record<string, {
  text: string; color: string; dimColor: string;
  bg: string; heroBg: string; glow: string; tint: string; shine: string;
  dark?: boolean;
}> = {
  buy: {
    text: '买入', color: '#dc2626', dimColor: 'rgba(220,38,38,0.55)',
    bg: 'linear-gradient(155deg,#fff1f2,#fde8e8)',
    // R6: deep cinematic red — dark hero
    heroBg: 'linear-gradient(160deg, #5a0a0a 0%, #991b1b 52%, #ef4444 100%)',
    glow: 'radial-gradient(ellipse at 75% 20%, rgba(239,68,68,0.75) 0%, transparent 60%)',
    tint: 'rgba(220,38,38,0.04)',
    shine: 'linear-gradient(125deg, rgba(255,255,255,0.11) 0%, rgba(255,255,255,0) 52%)',
    dark: true,
  },
  sell: {
    text: '卖出', color: '#16a34a', dimColor: 'rgba(22,163,74,0.55)',
    bg: 'linear-gradient(155deg,#f0fdf4,#d9f5e3)',
    // R6: deep forest green — dark hero
    heroBg: 'linear-gradient(160deg, #052e16 0%, #065f46 52%, #059669 100%)',
    glow: 'radial-gradient(ellipse at 75% 20%, rgba(16,185,129,0.65) 0%, transparent 60%)',
    tint: 'rgba(22,163,74,0.04)',
    shine: 'linear-gradient(125deg, rgba(255,255,255,0.09) 0%, rgba(255,255,255,0) 52%)',
    dark: true,
  },
  hold: {
    text: '观望', color: '#64748b', dimColor: 'rgba(100,116,139,0.55)',
    bg: 'linear-gradient(155deg,#f8fafc,#f1f5f9)',
    // R6: deep navy slate — dark hero
    heroBg: 'linear-gradient(160deg, #0f172a 0%, #1e293b 52%, #334155 100%)',
    glow: 'radial-gradient(ellipse at 75% 20%, rgba(148,163,184,0.28) 0%, transparent 60%)',
    tint: 'rgba(100,116,139,0.04)',
    shine: 'linear-gradient(125deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0) 52%)',
    dark: true,
  },
};
const OQ_C: Record<string, string> = { A: '#16a34a', B: '#0369a1', C: '#d97706', D: '#dc2626' };
const OQ_B: Record<string, string> = { A: '#f0fdf4', B: '#e0f2fe', C: '#fffbeb', D: '#fef2f2' };

// ═══════════════════════════════════════════════════════════════
// Props
// ═══════════════════════════════════════════════════════════════
interface Tab { label: string; key: string; }
interface HistoryItem { id: string; symbol: string; name?: string; action?: string; analyzedAt?: string; confidence?: number; }
interface ResultSheetProps {
  isOpen: boolean;
  onClose: () => void;
  result: any;
  tier: string;
  period: string;
  activeTab: number;
  onTabChange: (i: number) => void;
  allTabs: Tab[];
  multiPeriodResults: { period: string; result: any }[];
  onShare: () => void;
  onSave: () => void;
  onSavedListOpen?: () => void;
  shareLoading: boolean;
  saveLongLoading: boolean;
  onUpgrade: () => void;
  historyItems?: HistoryItem[];
  onHistorySelect?: (id: string) => void;
  selectedHistoryId?: string;
  onOpenHistorySheet?: () => void;
  isSaved?: boolean;
}

// ═══════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════
export default function ResultSheet({
  isOpen, onClose, result, tier, period,
  activeTab, onTabChange, allTabs, multiPeriodResults,
  onShare, onSave, onSavedListOpen, shareLoading, saveLongLoading, onUpgrade,
  historyItems = [], onHistorySelect, selectedHistoryId, onOpenHistorySheet,
  isSaved = false,
}: ResultSheetProps) {
  const [closing, setClosing] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const dragStart = useRef(0);
  const dragging = useRef(false);
  // V8: track which tabs have been visited
  const [visitedTabs, setVisitedTabs] = useState<Set<number>>(new Set([0]));

  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  // Reset visited tabs on new result
  useEffect(() => { setVisitedTabs(new Set([0])); }, [result]);

  const dismiss = useCallback(() => {
    setClosing(true);
    setTimeout(() => { setClosing(false); onClose(); }, 380);
  }, [onClose]);

  const handleTabChange = (i: number) => {
    onTabChange(i);
    setVisitedTabs(prev => { const s = new Set(prev); s.add(i); return s; });
  };

  const onTouchStart = (e: React.TouchEvent) => {
    dragStart.current = e.touches[0].clientY;
    dragging.current = true;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (!dragging.current) return;
    const dy = e.touches[0].clientY - dragStart.current;
    if (dy > 0) setDragOffset(dy);
  };
  const onTouchEnd = () => {
    dragging.current = false;
    if (dragOffset > 110) { setDragOffset(0); dismiss(); }
    else setDragOffset(0);
  };

  if (!isOpen && !closing) return null;

  // ── Data ──────────────────────────────────────────────────────────────────
  const action = result?.result?.action || 'hold';
  const info = ACTION[action] || ACTION.hold;
  const isFree = tier === 'free';
  const confidence: number | null = result?.result?.confidence ?? null;
  const oq: string | undefined = result?.result?.opportunity_quality;
  const latest: number | null = result?.data?.latest_price ?? null;
  const target: number | null = result?.result?.target_price ?? null;
  const stopLoss: number | null = result?.result?.stop_loss ?? null;

  // V4: plausible blurred values for free tier tease
  const blurTarget = latest ? (latest * (action === 'sell' ? 0.92 : 1.08)).toFixed(2) : '——';
  const blurStop   = latest ? (latest * (action === 'sell' ? 1.05 : 0.95)).toFixed(2) : '——';

  // V5: profit potential — direction-aware (sell target is BELOW current)
  let profitPct: number | null = null;
  let riskPct: number | null = null;
  let profitLabel = '上行空间';
  let riskLabel   = '下行风险';
  let profitArrow = '↑';
  let riskArrow   = '↓';
  if (action === 'buy' && target && stopLoss && latest) {
    profitPct = (target - latest) / latest * 100;    // positive: target > current
    riskPct   = (latest - stopLoss) / latest * 100;  // positive: stop < current
  } else if (action === 'sell' && target && stopLoss && latest) {
    profitPct = (latest - target) / latest * 100;    // positive: target < current
    riskPct   = (stopLoss - latest) / latest * 100;  // positive: stop > current
    profitLabel = '下行空间'; riskLabel = '上方止损';
    profitArrow = '↓'; riskArrow = '↑';
  } else if (action === 'hold' && target && stopLoss && latest) {
    profitPct = Math.abs((target - latest) / latest * 100);
    riskPct   = Math.abs((latest - stopLoss) / latest * 100);
    profitLabel = '目标空间'; riskLabel = '止损距离';
    profitArrow = target > latest ? '↑' : '↓';
  }
  const ratio = (profitPct != null && riskPct != null && riskPct > 0)
    ? (profitPct / riskPct) : null;
  const showProfitRow = profitPct != null && riskPct != null
    && profitPct > 0 && riskPct > 0;

  // Ring color matches action color — visually cohesive, not alarm-coded
  const ringColor = confidence == null ? '#c7c7cc' : info.color;

  // V2: handle pill color
  const isDark = !!info.dark;

  const handleColor = isDark
    ? 'rgba(255,255,255,0.28)'
    : (action === 'buy' ? 'rgba(220,38,38,0.35)'
      : action === 'sell' ? 'rgba(22,163,74,0.35)'
      : 'rgba(60,60,67,0.20)');

  const divColor = isDark
    ? 'rgba(255,255,255,0.14)'
    : (action === 'buy' ? 'rgba(220,38,38,0.12)'
      : action === 'sell' ? 'rgba(22,163,74,0.12)'
      : 'rgba(0,0,0,0.08)');

  const panelTransform = dragOffset > 0
    ? `translateY(${dragOffset}px)`
    : closing ? 'translateY(100%)' : 'translateY(0)';
  const panelTransition = dragOffset > 0 ? 'none'
    : 'transform 0.42s cubic-bezier(0.32,0.72,0,1)';

  const LABEL: React.CSSProperties = {
    fontSize: '10px', fontWeight: 600,
    color: isDark ? 'rgba(255,255,255,0.52)' : 'rgba(0,0,0,0.38)',
    textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '4px',
  };

  return (
    <div className="rs-root">
      {/* V2: tinted backdrop */}
      <div className={`rs-overlay${closing ? ' rs-overlay-out' : ''}`} onClick={dismiss} />

      <div className="rs-panel" style={{ transform: panelTransform, transition: panelTransition }}>

        {/* ── V1: Full-bleed HERO area ── */}
        <div className="rs-hero" style={{ background: info.heroBg }}>
          {/* Radial glow overlay */}
          <div style={{ position: 'absolute', inset: 0, background: info.glow, pointerEvents: 'none' }} />
          {/* V11: diagonal shine streak */}
          <div style={{ position: 'absolute', inset: 0, background: info.shine, pointerEvents: 'none' }} />

          {/* Drag handle (V2: tinted) */}
          <div className="rs-handle-zone"
            onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
            <div className="rs-handle-pill" style={{ background: handleColor }} />
          </div>

          {/* Close button — top right of hero */}
          <button onClick={dismiss} aria-label="关闭" style={{
            position: 'absolute', top: 10, right: 14,
            width: 30, height: 30, borderRadius: '50%',
            background: isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.12)',
            border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: isDark ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.5)',
            WebkitTapHighlightColor: 'transparent',
            transition: 'background 0.12s',
          }}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </button>

          {/* Stock identity */}
          <div className="rs-identity">
            <span className="rs-stock-name" style={isDark ? { color: 'rgba(255,255,255,0.92)' } : undefined}>{result?.data?.name || result?.data?.symbol}</span>
            {result?.data?.name && (
              <span className="rs-stock-code" style={isDark ? { color: 'rgba(255,255,255,0.55)' } : undefined}>({result.data.symbol})</span>
            )}
            <span className="rs-pill rs-pill-market" style={isDark ? { background: 'rgba(255,255,255,0.16)', color: 'rgba(255,255,255,0.88)' } : undefined}>{result?.data?.market?.toUpperCase()}</span>
            <span className="rs-pill rs-pill-period" style={isDark ? { background: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.78)' } : undefined}>{PERIOD_LABELS[period] || period}</span>
          </div>

          {/* V1: Verdict row — action word + ring/OQ */}
          <div className="rs-verdict-row">
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: isFree ? 'center' : 'flex-start' }}>
              {/* V10: no "建议操作" label — the word speaks for itself */}
              <div className="rs-action-text" style={{
                color: isDark ? '#ffffff' : info.color,
                // R6: white glow on dark hero, action glow on light
                textShadow: isDark
                  ? '0 4px 32px rgba(255,255,255,0.18), 0 2px 8px rgba(0,0,0,0.4)'
                  : `0 4px 28px ${info.color}38, 0 1px 0 ${info.color}18`,
              }}>
                {info.text}
              </div>
              {/* Confidence descriptor below action if free + OQ — centered */}
              {isFree && oq && (
                <div className="rs-oq-badge" style={{
                  background: OQ_B[oq] ?? '#f3f4f6',
                  color: OQ_C[oq] ?? '#374151',
                  border: `1.5px solid ${OQ_C[oq] ?? '#8e8e93'}66`,
                  marginTop: 12,
                }}>
                  {oq} 级机会
                </div>
              )}
            </div>

            {/* Ring (premium) */}
            {!isFree && confidence != null && (
              <div style={{ flexShrink: 0 }}>
                <Ring value={confidence} color={ringColor} size={110} dark={isDark} />
              </div>
            )}
            {/* OQ for premium too */}
            {!isFree && oq && confidence == null && (
              <div className="rs-oq-badge" style={{
                background: OQ_B[oq] ?? '#f3f4f6',
                color: OQ_C[oq] ?? '#374151',
                border: `1.5px solid ${OQ_C[oq] ?? '#8e8e93'}66`,
                fontSize: '28px', width: '60px', height: '60px',
              }}>
                {oq}
              </div>
            )}
          </div>
        </div>
        {/* END hero — V3: price data lives outside the colored stage */}

        {/* ── V3: Price strip — clean white section outside hero ── */}
        {/* STRIP_LABEL: always dark since bg is white regardless of hero isDark */}
        <div className="rs-price-strip" style={{
          background: '#fff',
          borderBottom: '0.5px solid rgba(0,0,0,0.08)',
        }}>
            <div className="rs-price-col">
              <div style={{ fontSize: '10px', fontWeight: 600, color: 'rgba(0,0,0,0.4)', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '4px' }}>最新价</div>
              <div className="rs-price-value" style={{ color: '#1c1c1e' }}>
                {latest != null ? latest.toFixed(2) : '—'}
              </div>
            </div>

            <div className="rs-price-divider" style={{ background: 'rgba(0,0,0,0.09)' }} />
            {isFree ? (
              <>
                <div className="rs-price-col rs-price-locked" onClick={onUpgrade}>
                  <div style={{ fontSize: '10px', fontWeight: 600, color: 'rgba(0,0,0,0.4)', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '4px' }}>目标价</div>
                  <div className="rs-blur-value-wrap">
                    <div className="rs-blur-value">{blurTarget}</div>
                    <div className="rs-lock-badge">🔒</div>
                  </div>
                </div>
                <div className="rs-price-divider" style={{ background: 'rgba(0,0,0,0.09)' }} />
                <div className="rs-price-col rs-price-locked" onClick={onUpgrade}>
                  <div style={{ fontSize: '10px', fontWeight: 600, color: 'rgba(0,0,0,0.4)', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '4px' }}>止损价</div>
                  <div className="rs-blur-value-wrap">
                    <div className="rs-blur-value">{blurStop}</div>
                    <div className="rs-lock-badge">🔒</div>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="rs-price-col">
                  <div style={{ fontSize: '10px', fontWeight: 600, color: 'rgba(0,0,0,0.4)', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '4px' }}>{action === 'sell' ? '目标价 ↓' : '目标价 ↑'}</div>
                  <div className="rs-price-value" style={{ color: info.color }}>
                    {target != null ? target.toFixed(2) : '—'}
                  </div>
                </div>
                <div className="rs-price-divider" style={{ background: 'rgba(0,0,0,0.09)' }} />
                <div className="rs-price-col">
                  <div style={{ fontSize: '10px', fontWeight: 600, color: 'rgba(0,0,0,0.4)', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '4px' }}>{action === 'sell' ? '止损价 ↑' : '止损价 ↓'}</div>
                  <div className="rs-price-value" style={{ color: '#b45309' }}>
                    {stopLoss != null ? stopLoss.toFixed(2) : '—'}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* V5: Profit potential row (premium only, when prices make sense) */}
          {!isFree && showProfitRow && (
            <div className="rs-profit-row" style={{ background: isDark ? 'rgba(0,0,0,0.18)' : undefined }}>
              <div className="rs-profit-item rs-profit-up">
                <span>{profitArrow} {profitPct!.toFixed(1)}%</span>
                <span className="rs-profit-label" style={{ color: isDark ? 'rgba(255,255,255,0.45)' : undefined }}>{profitLabel}</span>
              </div>
              <div className="rs-profit-bar-wrap">
                <div className="rs-profit-bar-track" style={{ background: isDark ? 'rgba(255,255,255,0.12)' : undefined }}>
                  <div className="rs-profit-bar-stop" />
                  <div className="rs-profit-bar-fill"
                    style={{
                      width: `${Math.min(90, (profitPct! / (profitPct! + riskPct!)) * 100)}%`,
                      background: info.color,
                    }}
                  />
                  <div className="rs-profit-bar-dot" style={{ background: info.color }} />
                </div>
                {ratio != null && (
                  <div className="rs-profit-ratio" style={{ color: isDark ? 'rgba(255,255,255,0.5)' : undefined }}>赔率 {ratio.toFixed(1)}x</div>
                )}
              </div>
              <div className="rs-profit-item rs-profit-down">
                <span>{riskArrow} {riskPct!.toFixed(1)}%</span>
                <span className="rs-profit-label" style={{ color: isDark ? 'rgba(255,255,255,0.45)' : undefined }}>{riskLabel}</span>
              </div>
            </div>
          )}

        {/* ── V2: Tinted scroll body ── */}
        <div className="rs-scroll" style={{ background: `linear-gradient(to bottom, ${info.tint} 0%, transparent 120px)` }}>

          {/* Analysis reason — V11: lead sentence + body */}
          {result?.result?.reason && (() => {
            const fullReason: string = result.result.reason;
            const cutIdx = fullReason.indexOf('。');
            const lead = cutIdx !== -1 ? fullReason.slice(0, cutIdx + 1) : fullReason.slice(0, 80);
            const body = cutIdx !== -1 ? fullReason.slice(cutIdx + 1).trim() : fullReason.slice(80).trim();
            return (
              <div className="rs-section">
                <div className="rs-reason-lead" style={{ borderLeft: `3px solid ${info.color}` }}>
                  <HighlightReason text={lead} accentColor={info.color} />
                </div>
                {body.length > 0 && (
                  <div className="rs-reason-body">
                    <HighlightReason text={body} accentColor={info.color} />
                  </div>
                )}
              </div>
            );
          })()}

          {/* V12/V13: Deep analysis — narrative scroll layout */}
          {!isFree && result?.result && (
            <>
              {/* R6: clean iOS-style section header replacing flanked divider */}
              <div style={{
                padding: '22px 20px 4px',
                display: 'flex', alignItems: 'center', gap: '8px',
              }}>
                <span style={{
                  fontSize: '13px', fontWeight: 700, color: '#8e8e93',
                  letterSpacing: '0.4px',
                }}>深度研判</span>
                <div style={{ flex: 1, height: '0.5px', background: 'rgba(0,0,0,0.1)' }} />
              </div>
              {NARRATIVE_SECTIONS.map((ns, i) => (
                <NarrativeSection
                  key={ns.key}
                  icon={ns.icon}
                  title={ns.title}
                  tint={ns.tint}
                  text={(result.result as any)[ns.key]}
                  accentColor={info.color}
                  index={i}
                />
              ))}
              {multiPeriodResults.length > 1 && (
                <div className="rs-narrative-section" style={{ animationDelay: '300ms' } as React.CSSProperties}>
                  <div className="rs-narr-head-row">
                    <span className="rs-narr-icon" style={{ background: '#6366f114', color: '#6366f1' }}>比</span>
                    <span className="rs-narr-title" style={{ color: '#6366f1' }}>多周期对比</span>
                  </div>
                  <MultiPeriodCards results={multiPeriodResults} />
                </div>
              )}
            </>
          )}

          {/* Risk factors — V13: vertical list (cleaner than chips) */}
          {!isFree && result?.result?.risk_factors?.length > 0 && (
            <div className="rs-section">
              <div className="rs-section-label">风险因素</div>
              <div className="rs-risk-list">
                {result.result.risk_factors.map((f: string, i: number) => {
                  const sev = riskSeverity(f);
                  return (
                    <div key={i} className="rs-risk-list-item" style={{
                      background: sev.bg, borderLeft: `3px solid ${sev.dot}`,
                    }}>
                      <span className="rs-risk-dot" style={{ background: sev.dot }} />
                      <span style={{ color: sev.textColor, fontSize: '13.5px', lineHeight: 1.5 }}>{f}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Technical indicators — V13: 3-col wrap grid (no horizontal scroll) */}
          {!isFree && result?.result?.indicators && (
            <div className="rs-section rs-section-notop">
              <div className="rs-section-label">技术指标</div>
              <div className="rs-indicator-grid">
                {Object.entries(result.result.indicators).map(([k, v]) => {
                    const iColor = indicatorColor(k, v);
                  const iStatus = indicatorStatus(k, v);
                  const hasBorder = iStatus.length > 0;
                  const valueColor = hasBorder ? iColor : '#1c1c1e';
                  return (
                    <div key={k} className="rs-indicator-card"
                      style={hasBorder ? { borderTop: `3px solid ${iColor}` } : {}}>
                      <div className="rs-indicator-name">{k}</div>
                      <div className="rs-indicator-value" style={{ color: valueColor }}>
                        {typeof v === 'number' ? (v as number).toFixed(2) : String(v)}
                      </div>
                      {iStatus && (
                        <div className="rs-indicator-status" style={{ color: iColor }}>{iStatus}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* V14: History mini cards — bottom of scroll, after deep analysis */}
          {historyItems.length > 1 && (
            <div style={{ paddingBottom: '4px' }}>
              <div className="rs-hist-strip-header">
                <span className="rs-narrative-label" style={{ padding: 0 }}>历史分析</span>
                {onOpenHistorySheet && (
                  <button className="rs-hist-viewall-btn" onClick={onOpenHistorySheet}>查看全部 ›</button>
                )}
              </div>
              <div className="rs-history-strip">
                {historyItems.slice(0, 7).map(h => {
                  const hInfo = ACTION[h.action || 'hold'] || ACTION.hold;
                  const isSelected = h.id === selectedHistoryId;
                  const hDate = h.analyzedAt
                    ? new Date(h.analyzedAt).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
                    : '';
                  const hConf: number | null = h.confidence ?? null;
                  return (
                    <button
                      key={h.id}
                      className={`rs-hist-card${isSelected ? ' rs-hist-card-active' : ''}`}
                      style={isSelected ? { borderColor: hInfo.color, boxShadow: `0 4px 16px ${hInfo.color}28` } : {}}
                      onClick={() => onHistorySelect?.(h.id)}
                    >
                      <div className="rs-hist-action-bar" style={{ background: hInfo.color }} />
                      <div className="rs-hist-body">
                        <div className="rs-hist-name">{h.name || h.symbol}</div>
                        <div className="rs-hist-meta">
                          <span className="rs-hist-action-text" style={{ color: hInfo.color }}>{hInfo.text}</span>
                          {hDate && <span className="rs-hist-date">{hDate}</span>}
                        </div>
                        {hConf != null && (
                          <div className="rs-hist-bar-track">
                            <div className="rs-hist-bar-fill" style={{ width: `${hConf}%`, background: hInfo.color }} />
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
                {historyItems.length > 7 && (
                  <button className="rs-hist-more-btn" onClick={onOpenHistorySheet}>
                    <span>+{historyItems.length - 7}</span>
                    <span style={{ fontSize: '10px', opacity: 0.6 }}>更多</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* V4: Premium upgrade card (free tier) */}
          {isFree && (
            <div className="rs-section">
              <button className="rs-upgrade-card" onClick={onUpgrade}>
                <div className="rs-upgrade-shimmer" />
                <div className="rs-upgrade-content">
                  <div className="rs-upgrade-icon">✦</div>
                  <div>
                    <div className="rs-upgrade-title">解锁完整分析</div>
                    <div className="rs-upgrade-features">
                      目标价 · 止损 · 深度研判 · 风险评估 · 多周期对比
                    </div>
                  </div>
                  <div className="rs-upgrade-caret">›</div>
                </div>
              </button>
            </div>
          )}

          <div style={{ height: '6px' }} />
        </div>

        {/* ── Share & Bookmark footer ── */}
        <div className="rs-footer">
          <div className="rs-footer-actions">
            {/* Bookmark — tap to save; tap again to open saved list */}
            <button
              onClick={isSaved ? (onSavedListOpen ?? onSave) : onSave}
              disabled={saveLongLoading}
              className={`rs-btn-bookmark${isSaved ? ' rs-btn-bookmark-saved' : ''}`}
              aria-label={isSaved ? '查看收藏' : '收藏'}
              style={{
                background: isSaved ? `${info.color}1a` : 'rgba(60,60,67,0.08)',
                color: isSaved ? info.color : '#8e8e93',
                border: `1.5px solid ${isSaved ? info.color + '44' : 'rgba(60,60,67,0.12)'}`,
              }}
            >
              {saveLongLoading ? (
                <div className="rs-btn-spinner rs-btn-spinner-dark" />
              ) : (
                <>
                  <svg
                    width="18" height="18" viewBox="0 0 24 24"
                    fill={isSaved ? 'currentColor' : 'none'}
                    stroke="currentColor" strokeWidth="2.2"
                    strokeLinecap="round" strokeLinejoin="round"
                    className="rs-bookmark-icon"
                  >
                    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
                  </svg>
                  <span className="rs-bookmark-label">{isSaved ? '查看' : '收藏'}</span>
                </>
              )}
            </button>

            {/* Primary share CTA */}
            <button
              onClick={onShare}
              disabled={shareLoading}
              className={`rs-btn-share-cta${shareLoading ? ' rs-btn-share-cta-loading' : ''}`}
            >
              {shareLoading ? (
                <>
                  <div className="rs-btn-spinner rs-btn-spinner-white" />
                  <span>生成中…</span>
                </>
              ) : (
                <>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/>
                    <polyline points="16 6 12 2 8 6"/>
                    <line x1="12" y1="2" x2="12" y2="15"/>
                  </svg>
                  <span>分享预判</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
