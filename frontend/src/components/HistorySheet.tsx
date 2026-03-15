'use client';
import { useState, useEffect, useRef } from 'react';

function timeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '刚刚';
  if (mins < 60) return `${mins}分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}小时前`;
  return `${Math.floor(hours / 24)}天前`;
}

interface HistoryItem {
  id: string;
  symbol: string;
  name?: string;
  action?: string;
  confidence?: number;
  analyzedAt?: string;
  detail?: any;
}

interface HistorySheetProps {
  isOpen: boolean;
  onClose: () => void;
  history: HistoryItem[];
  selectedHistoryId: string | null;
  tier: string;
  onOpenDetail: (item: HistoryItem) => void;
  onShare: (item: HistoryItem, longImage?: boolean) => void;
}

const HS_ACTION: Record<string, { label: string; color: string }> = {
  buy:  { label: '看涨', color: '#ef4444' },
  sell: { label: '看跌', color: '#22c55e' },
  hold: { label: '观望', color: '#f59e0b' },
};

export default function HistorySheet({
  isOpen, onClose, history, selectedHistoryId, tier, onOpenDetail, onShare,
}: HistorySheetProps) {
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) { setVisible(true); setClosing(false); }
    else if (visible) { dismiss(); }
  }, [isOpen]);

  function dismiss() {
    setClosing(true);
    setTimeout(() => { setVisible(false); setClosing(false); onClose(); }, 380);
  }

  if (!visible) return null;

  return (
    <div
      className={`rs-histsheet-overlay${closing ? ' rs-overlay-out' : ''}`}
      onClick={dismiss}
    >
      <div
        ref={panelRef}
        className={`rs-histsheet-panel${closing ? ' rs-histsheet-out' : ''}`}
        style={{ position: 'absolute' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="rs-histsheet-handle" />

        {/* Header */}
        <div className="rs-histsheet-header">
          <div className="rs-histsheet-title">历史分析</div>
          {history.length > 0 && (
            <div className="rs-histsheet-count">{history.length}</div>
          )}
          <button className="rs-histsheet-close" onClick={dismiss} aria-label="关闭">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* List */}
        <div className="rs-histsheet-scroll">
          {history.length === 0 ? (
            <div className="rs-histsheet-empty">暂无历史记录</div>
          ) : (
            <div className="rs-histsheet-list">
              {history.map((h, idx) => {
                const act = HS_ACTION[h.action || 'hold'] || HS_ACTION.hold;
                const isCurrent = selectedHistoryId === h.id;
                const conf = h.confidence ?? null;
                const timeStr = h.analyzedAt ? timeAgo(h.analyzedAt) : '';
                const dateStr = h.analyzedAt
                  ? new Date(h.analyzedAt).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
                  : '';
                return (
                  <button
                    key={h.id}
                    className={`rs-histsheet-item${isCurrent ? ' rs-histsheet-item-active' : ''}`}
                    style={isCurrent ? { background: `${act.color}0d` } : {}}
                    onClick={() => { onOpenDetail(h); dismiss(); }}
                  >
                    {/* Left: action color dot */}
                    <div className="rs-histsheet-dot" style={{ background: act.color }} />

                    {/* Body */}
                    <div className="rs-histsheet-body">
                      <div className="rs-histsheet-name">
                        {h.name || h.symbol}
                        {isCurrent && (
                          <span className="rs-histsheet-current-badge" style={{ background: `${act.color}22`, color: act.color }}>
                            查看中
                          </span>
                        )}
                      </div>
                      <div className="rs-histsheet-meta">
                        <span className="rs-histsheet-symbol">{h.symbol}</span>
                        <span className="rs-histsheet-action" style={{ color: act.color }}>{act.label}</span>
                        {dateStr && <span className="rs-histsheet-date">{dateStr}</span>}
                        {timeStr && <span className="rs-histsheet-ago">{timeStr}</span>}
                      </div>
                      {conf != null && (
                        <div className="rs-histsheet-conf-track">
                          <div className="rs-histsheet-conf-fill" style={{ width: `${conf}%`, background: act.color }} />
                          <span className="rs-histsheet-conf-label">{conf}%</span>
                        </div>
                      )}
                    </div>

                    {/* Right: chevron */}
                    <svg className="rs-histsheet-chevron" width="8" height="14" viewBox="0 0 8 14" fill="none">
                      <path d="M1 1l6 6-6 6" stroke="#c7c7cc" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
