'use client';
import { useEffect, useRef } from 'react';

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

function ActionPill({ action }: { action: SavedRecord['action'] }) {
  const map = { buy: { label: '看好', color: '#ff453a', bg: '#ff453a18' }, sell: { label: '看空', color: '#30d158', bg: '#30d15818' }, hold: { label: '观望', color: '#ffd60a', bg: '#ffd60a18' } };
  const s = map[action] ?? map.hold;
  return (
    <span style={{ fontSize: 11, fontWeight: 700, color: s.color, background: s.bg, border: `1px solid ${s.color}44`, borderRadius: 20, padding: '2px 8px', letterSpacing: 0.5 }}>
      {s.label}
    </span>
  );
}

function ReturnBadge({ val }: { val: number | null }) {
  if (val == null) return null;
  const positive = val > 0;
  const color = positive ? '#ff453a' : '#30d158';
  const sign = positive ? '+' : '';
  return (
    <span style={{ fontSize: 13, fontWeight: 800, color, marginLeft: 6 }}>
      {sign}{val.toFixed(1)}%
    </span>
  );
}

function GradeBadge({ grade }: { grade: string | null }) {
  if (!grade) return null;
  const colors: Record<string, string> = { A: '#ff9f0a', B: '#30d158', C: '#64d2ff', D: '#8e8e93' };
  const c = colors[grade] ?? '#8e8e93';
  return (
    <span style={{ fontSize: 10, fontWeight: 800, color: c, border: `1.5px solid ${c}88`, borderRadius: '50%', width: 20, height: 20, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      {grade}
    </span>
  );
}

export default function SavedRecordsSheet({ isOpen, records, onClose, onOpenRecord, onDeleteRecord }: Props) {
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  if (!isOpen && !records.length) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 3100,
          background: 'rgba(0,0,0,0.5)',
          backdropFilter: 'blur(4px)',
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? 'auto' : 'none',
          transition: 'opacity 0.28s ease',
        }}
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        style={{
          position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 3200,
          background: 'rgba(28,28,30,0.97)',
          backdropFilter: 'blur(24px) saturate(180%)',
          WebkitBackdropFilter: 'blur(24px) saturate(180%)',
          borderRadius: '20px 20px 0 0',
          maxHeight: '82vh',
          display: 'flex',
          flexDirection: 'column',
          transform: isOpen ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.36s cubic-bezier(0.32,0.72,0,1)',
          paddingBottom: 'env(safe-area-inset-bottom, 16px)',
          boxShadow: '0 -2px 40px rgba(0,0,0,0.5)',
        }}
      >
        {/* Drag handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.18)' }} />
        </div>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 20px 14px' }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#ffffff', letterSpacing: -0.3 }}>
              我的研判记录
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
              {records.length} 条研判  ·  含时间戳可验证
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ width: 32, height: 32, borderRadius: 16, background: 'rgba(255,255,255,0.1)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.6)', fontSize: 16 }}
          >✕</button>
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 16px' }}>
          {records.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 0', color: 'rgba(255,255,255,0.3)', fontSize: 14 }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
              暂无收藏的研判<br />
              <span style={{ fontSize: 12 }}>分析结果后点击收藏按钮</span>
            </div>
          ) : (
            records.map((rec, idx) => {
              const dt = new Date(rec.analyzedAt);
              const dateStr = dt.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
              const timeStr = dt.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

              return (
                <div
                  key={rec.id}
                  onClick={() => { onOpenRecord(rec); onClose(); }}
                  style={{
                    background: 'rgba(255,255,255,0.06)',
                    border: '0.5px solid rgba(255,255,255,0.1)',
                    borderRadius: 14,
                    padding: '14px 14px 12px',
                    marginBottom: 10,
                    cursor: 'pointer',
                    position: 'relative',
                    transition: 'background 0.15s',
                  }}
                >
                  {/* Row 1: stock name + grade + return */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <GradeBadge grade={rec.opportunityGrade} />
                    <span style={{ fontSize: 15, fontWeight: 700, color: '#ffffff', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {rec.name}
                    </span>
                    <ActionPill action={rec.action} />
                    <ReturnBadge val={rec.impliedReturn} />
                  </div>

                  {/* Row 2: price data */}
                  {(rec.latestPrice != null || rec.targetPrice != null) && (
                    <div style={{ display: 'flex', gap: 16, marginBottom: 8, flexWrap: 'wrap' }}>
                      {rec.latestPrice != null && (
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
                          研判时价 <span style={{ color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>
                            ¥{rec.latestPrice.toFixed(2)}
                          </span>
                        </div>
                      )}
                      {rec.targetPrice != null && (
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
                          目标价 <span style={{ color: rec.action === 'buy' ? '#ff453a' : '#30d158', fontWeight: 600 }}>
                            ¥{rec.targetPrice.toFixed(2)}
                          </span>
                        </div>
                      )}
                      {rec.confidence != null && (
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
                          置信 <span style={{ color: rec.action === 'hold' ? '#ffd60a' : rec.action === 'buy' ? '#ff453a' : '#30d158', fontWeight: 600 }}>
                            {rec.confidence}%
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Row 3: timestamp + delete */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span>🔒</span>
                      <span>{dateStr} {timeStr}</span>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); onDeleteRecord(rec.id); }}
                      style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px' }}
                    >
                      删除
                    </button>
                  </div>

                  {/* Separator line at bottom (not last) */}
                  {idx < records.length - 1 && (
                    <div style={{ position: 'absolute', bottom: 0, left: 14, right: 14, height: '0.5px', background: 'rgba(255,255,255,0.06)' }} />
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}
