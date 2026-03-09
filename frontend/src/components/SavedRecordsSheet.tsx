'use client';
import { useEffect, useMemo } from 'react';

export interface SavedRecord {
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
  detail: any;
}

interface Props {
  isOpen: boolean;
  records: SavedRecord[];
  onClose: () => void;
  onOpenRecord: (record: SavedRecord) => void;
  onDeleteRecord: (id: string) => void;
}

const ACTION_MAP = {
  buy:  { label: '看好', color: '#EF4444', bg: '#EF444418', stripe: '#EF4444' },
  sell: { label: '看空', color: '#22C55E', bg: '#22C55E18', stripe: '#22C55E' },
  hold: { label: '观望', color: '#F59E0B', bg: '#F59E0B18', stripe: '#C7C7CC' },
};

const GRADE_COLORS: Record<string, { text: string; bg: string; border: string }> = {
  A: { text: '#7C3AED', bg: '#7C3AED18', border: '#7C3AED55' },
  B: { text: '#0369A1', bg: '#0369A118', border: '#0369A155' },
  C: { text: '#92400E', bg: '#92400E18', border: '#92400E55' },
  D: { text: '#6B7280', bg: '#6B728018', border: '#6B728055' },
};

const GRADE_BAR_COLORS = ['#7C3AED', '#0369A1', '#92400E', '#9CA3AF'];

function TrophyCard({
  rec,
  onOpen,
  onDelete,
}: {
  rec: SavedRecord;
  onOpen: () => void;
  onDelete: (e: React.MouseEvent) => void;
}) {
  const act = ACTION_MAP[rec.action] ?? ACTION_MAP.hold;
  const gradeKey = (rec.opportunityGrade || '').toUpperCase();
  const gc = GRADE_COLORS[gradeKey];

  const dt = new Date(rec.analyzedAt);
  const dateStr = dt.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  const timeStr = dt.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

  const positive = rec.impliedReturn != null && rec.impliedReturn > 0;
  const returnColor = positive ? '#EF4444' : '#22C55E';
  const returnStr = rec.impliedReturn != null
    ? `${rec.impliedReturn > 0 ? '+' : ''}${rec.impliedReturn.toFixed(1)}%`
    : null;

  return (
    <div className="tj-card" onClick={onOpen}>
      {/* Left color stripe by action */}
      <div className="tj-card-stripe" style={{ background: act.stripe }} />

      <div className="tj-card-body">
        {/* Row 1: name + grade badge + action pill + return */}
        <div className="tj-card-row1">
          <span className="tj-card-name">{rec.name}</span>
          {gc && (
            <span
              className="tj-card-grade"
              style={{ color: gc.text, background: gc.bg, border: `1.5px solid ${gc.border}` }}
            >
              {gradeKey}
            </span>
          )}
          <span
            className="tj-card-action-pill"
            style={{ color: act.color, background: act.bg, borderColor: act.color + '44' }}
          >
            {act.label}
          </span>
          {returnStr && (
            <span className="tj-card-return" style={{ color: returnColor }}>{returnStr}</span>
          )}
        </div>

        {/* Confidence mini bar */}
        {rec.confidence != null && (
          <div className="tj-card-conf-row">
            <div className="tj-card-conf-bar-bg">
              <div
                className="tj-card-conf-bar"
                style={{
                  width: `${rec.confidence}%`,
                  background: act.color,
                }}
              />
            </div>
            <span className="tj-card-conf-label">置信 {rec.confidence}%</span>
          </div>
        )}

        {/* Footer: date + delete */}
        <div className="tj-card-footer">
          <div className="tj-card-date">
            <span>🔒</span>
            <span>{dateStr} {timeStr}</span>
            {rec.latestPrice != null && (
              <span style={{ color: '#C7C7CC', marginLeft: 4 }}>
                · ¥{rec.latestPrice.toFixed(2)}
              </span>
            )}
          </div>
          <button className="tj-card-delete" onClick={onDelete}>删除</button>
        </div>
      </div>
    </div>
  );
}

export default function SavedRecordsSheet({ isOpen, records, onClose, onOpenRecord, onDeleteRecord }: Props) {
  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  const stats = useMemo(() => {
    const gradeACount = records.filter(r => r.opportunityGrade === 'A').length;
    const buyCount = records.filter(r => r.action === 'buy').length;
    const avgConf = records.length
      ? Math.round(records.reduce((s, r) => s + (r.confidence ?? 0), 0) / records.length)
      : 0;
    const impliedRecords = records.filter(r => r.impliedReturn != null);
    const positiveCount = impliedRecords.filter(r => (r.impliedReturn ?? 0) > 0).length;
    const winRate = impliedRecords.length
      ? Math.round((positiveCount / impliedRecords.length) * 100)
      : null;

    const gradeCounts: Record<string, number> = { A: 0, B: 0, C: 0, D: 0 };
    records.forEach(r => {
      const g = (r.opportunityGrade || '').toUpperCase();
      if (g in gradeCounts) gradeCounts[g]++;
    });

    return { gradeACount, buyCount, avgConf, winRate, gradeCounts };
  }, [records]);

  if (!isOpen && !records.length) return null;

  const gradeOrder = ['A', 'B', 'C', 'D'] as const;
  const totalGraded = gradeOrder.reduce((s, g) => s + stats.gradeCounts[g], 0);

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 3100,
          background: 'rgba(0,0,0,0.4)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? 'auto' : 'none',
          transition: 'opacity 0.28s ease',
        }}
      />

      {/* Sheet */}
      <div className={`tj-root${isOpen ? ' tj-root-open' : ''}`}>
        {/* Drag handle */}
        <div className="tj-handle-zone">
          <div className="tj-handle" />
        </div>

        {/* Header */}
        <div className="tj-header">
          <h1 className="tj-title">我的研判日志</h1>
          {records.length > 0 && (
            <span className="tj-count-badge">{records.length}</span>
          )}
          <button className="tj-close-btn" onClick={onClose} aria-label="关闭">✕</button>
        </div>

        {records.length > 0 && (
          <>
            {/* Trophy shelf */}
            <div className="tj-trophy-shelf">
              {stats.gradeACount > 0 && (
                <div className="tj-trophy-item">
                  <span style={{ marginRight: 5 }}>🏆</span>
                  {stats.gradeACount} 个 A 级发现
                </div>
              )}
              <div className="tj-trophy-item">
                <span style={{ marginRight: 5, color: '#EF4444' }}>▲</span>
                {stats.buyCount} 次看好
              </div>
              {stats.avgConf > 0 && (
                <div className="tj-trophy-item">
                  <span style={{ marginRight: 5 }}>⚡</span>
                  {stats.avgConf}% 平均置信
                </div>
              )}
              {stats.winRate != null && (
                <div className="tj-trophy-item">
                  <span style={{ marginRight: 5 }}>📈</span>
                  {stats.winRate}% 正向率
                </div>
              )}
            </div>

            {/* Grade distribution bar */}
            {totalGraded > 0 && (
              <div className="tj-grade-bar">
                {gradeOrder.map((g, i) => {
                  const count = stats.gradeCounts[g];
                  if (count === 0) return null;
                  return (
                    <div
                      key={g}
                      className="tj-grade-seg"
                      style={{
                        flex: count,
                        background: GRADE_BAR_COLORS[i],
                      }}
                    />
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* Card list */}
        <div className="tj-list">
          {records.length === 0 ? (
            <div className="tj-empty">
              <div className="tj-empty-icon">📋</div>
              <div className="tj-empty-title">开始你的第一次研判</div>
              <div className="tj-empty-sub">分析股票后点击收藏，在这里查看历史记录</div>
            </div>
          ) : (
            records.map(rec => (
              <TrophyCard
                key={rec.id}
                rec={rec}
                onOpen={() => { onOpenRecord(rec); onClose(); }}
                onDelete={e => { e.stopPropagation(); onDeleteRecord(rec.id); }}
              />
            ))
          )}
        </div>
      </div>
    </>
  );
}
