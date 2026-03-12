'use client';

import { useState } from 'react';

const PERIOD_LABELS: Record<string, string> = {
  daily: '日线', '60': '60分', '30': '30分', '15': '15分', '5': '5分', '1': '1分',
};

interface AdvancedSettingsPanelProps {
  period: string;
  setPeriod: (p: string) => void;
  multiPeriodEnabled: boolean;
  setMultiPeriodEnabled: (v: boolean) => void;
  auxiliaryPeriods: string[];
  toggleAuxPeriod: (p: string) => void;
  tier: string;
  holdingQuantity: string;
  setHoldingQuantity: (v: string) => void;
  costPrice: string;
  setCostPrice: (v: string) => void;
  maxPosition: string;
  setMaxPosition: (v: string) => void;
  premiumInputsOpen: boolean;
  setPremiumInputsOpen: (v: boolean) => void;
  onUpgrade: () => void;
}

export default function AdvancedSettingsPanel({
  period, setPeriod,
  multiPeriodEnabled, setMultiPeriodEnabled, auxiliaryPeriods, toggleAuxPeriod,
  tier, holdingQuantity, setHoldingQuantity, costPrice, setCostPrice,
  maxPosition, setMaxPosition,
  premiumInputsOpen, setPremiumInputsOpen,
  onUpgrade,
}: AdvancedSettingsPanelProps) {
  const [open, setOpen] = useState(false);
  const isFree = tier === 'free';
  const isPremium = tier === 'premium';
  const hasPremiumInputs = tier === 'basic' || isPremium;
  const filledCount = [holdingQuantity, costPrice, maxPosition].filter(v => v.trim()).length;
  const periodSummary = PERIOD_LABELS[period] || period;

  // ── Premium users: always-expanded prestigious layout ──
  if (isPremium) {
    return (
      <div>
        {/* Period row — always visible */}
        <div style={{ padding: '12px 16px 10px' }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: '#8e8e93', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>K线周期</p>
          <div className="h-strip" style={{ gap: '0.4rem' }}>
            {Object.entries(PERIOD_LABELS).map(([k, label]) => (
              <button key={k} type="button"
                className={`period-chip h-strip-item${period === k ? ' active' : ''}`}
                onClick={() => setPeriod(k)}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ height: '0.5px', background: 'rgba(60,60,67,0.1)', margin: '0 16px' }} />

        {/* Multi-period — always visible for premium */}
        <div style={{ padding: '12px 16px 10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: multiPeriodEnabled ? 10 : 0 }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: '#8e8e93', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>多周期交叉分析</p>
            <label style={{ position: 'relative', display: 'inline-block', width: 44, height: 26, cursor: 'pointer' }}>
              <input type="checkbox" checked={multiPeriodEnabled}
                onChange={(e) => { setMultiPeriodEnabled(e.target.checked); if (!e.target.checked) toggleAuxPeriod('__clear__'); }}
                style={{ opacity: 0, width: 0, height: 0 }} />
              <span style={{
                position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                background: multiPeriodEnabled ? '#34c759' : '#e5e5ea',
                borderRadius: 13, transition: 'background 0.2s',
              }}>
                <span style={{
                  position: 'absolute', top: 2, left: multiPeriodEnabled ? 20 : 2,
                  width: 22, height: 22, background: 'white', borderRadius: '50%',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left 0.2s',
                }} />
              </span>
            </label>
          </div>
          {multiPeriodEnabled && (
            <div>
              <p style={{ fontSize: 12, color: '#8e8e93', marginBottom: 8 }}>选择辅助周期（最多3个）</p>
              <div className="h-strip" style={{ gap: '0.4rem' }}>
                {Object.entries(PERIOD_LABELS).filter(([k]) => k !== period).map(([k, label]) => {
                  const selected = auxiliaryPeriods.includes(k);
                  const disabled = !selected && auxiliaryPeriods.length >= 3;
                  return (
                    <button key={k} type="button"
                      className={`period-chip h-strip-item${selected ? ' active' : ''}`}
                      onClick={() => !disabled && toggleAuxPeriod(k)}
                      style={{ opacity: disabled ? 0.4 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}>
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div style={{ height: '0.5px', background: 'rgba(60,60,67,0.1)', margin: '0 16px' }} />

        {/* Holding params — always visible for premium */}
        <div style={{ padding: '12px 16px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: '#8e8e93', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>持仓参数</p>
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '2px 7px',
              borderRadius: 9999, background: '#ede9fe', color: '#7c3aed', letterSpacing: '0.2px',
            }}>专属功能</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="label" style={{ fontSize: '0.75rem' }}>持有数量(股)</label>
              <input className="input" value={holdingQuantity} onChange={e => setHoldingQuantity(e.target.value.replace(/\D/g, '').slice(0, 10))} inputMode="numeric" placeholder="如 1000" />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="label" style={{ fontSize: '0.75rem' }}>成本价</label>
              <input className="input" value={costPrice} onChange={e => { const v = e.target.value.replace(/[^\d.]/g, ''); const parts = v.split('.'); setCostPrice(parts.length > 2 ? parts[0] + '.' + parts.slice(1).join('') : v.slice(0, 15)); }} inputMode="decimal" placeholder="如 15.50" />
            </div>
            <div className="form-group" style={{ marginBottom: 0, gridColumn: '1/-1' }}>
              <label className="label" style={{ fontSize: '0.75rem' }}>最大持仓(股) — 不超过此仓位</label>
              <input className="input" value={maxPosition} onChange={e => setMaxPosition(e.target.value.replace(/\D/g, '').slice(0, 10))} inputMode="numeric" placeholder="如 5000" />
            </div>
            <p style={{ gridColumn: '1/-1', fontSize: '0.7rem', color: '#8e8e93', margin: 0 }}>
              不填=按空仓分析；若填写则 3 项需全部填写。
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Non-premium: collapsible disclosure row ──
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: '12px',
          width: '100%', padding: '14px 16px', background: 'none', border: 'none',
          cursor: 'pointer', textAlign: 'left', minHeight: '52px',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        <span style={{ fontSize: '20px', lineHeight: 1 }}>⚙️</span>
        <span style={{ flex: 1, fontSize: '17px', color: '#000' }}>高级设置</span>
        <span style={{ fontSize: '15px', color: '#8e8e93', marginRight: '4px' }}>
          {periodSummary}{hasPremiumInputs && filledCount > 0 ? ' · 已填持仓' : ''}
        </span>
        <span style={{ fontSize: '18px', color: '#c7c7cc', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s', lineHeight: 1 }}>›</span>
      </button>

      <div className={`adv-settings-body${open ? ' open' : ''}`}>
        <div style={{ padding: '4px 16px 16px', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

          {/* Period chips */}
          <div>
            <p style={{ fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.5rem' }}>K线周期</p>
            <div className="h-strip" style={{ gap: '0.4rem' }}>
              {Object.entries(PERIOD_LABELS).map(([k, label]) => (
                <button key={k} type="button"
                  className={`period-chip h-strip-item${period === k ? ' active' : ''}`}
                  onClick={() => setPeriod(k)}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Multi-period */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <input type="checkbox" id="multi-period-toggle" checked={multiPeriodEnabled} disabled={isFree}
                onChange={(e) => { setMultiPeriodEnabled(e.target.checked); if (!e.target.checked) toggleAuxPeriod('__clear__'); }}
                style={{ width: '1rem', height: '1rem', cursor: isFree ? 'not-allowed' : 'pointer' }}
              />
              <label htmlFor="multi-period-toggle"
                style={{ fontSize: '0.8125rem', fontWeight: 600, cursor: isFree ? 'not-allowed' : 'pointer', color: isFree ? 'var(--muted)' : undefined }}>
                多周期分析{isFree && <span style={{ marginLeft: '0.3rem', fontSize: '0.7rem', color: '#f59e0b' }}>(标准版起可用)</span>}
              </label>
            </div>
            {multiPeriodEnabled && !isFree && (
              <div style={{ paddingLeft: '0.5rem' }}>
                <p style={{ fontSize: '0.75rem', color: 'var(--muted)', marginBottom: '0.4rem' }}>选择辅助周期（最多3个）：</p>
                <div className="h-strip" style={{ gap: '0.4rem' }}>
                  {Object.entries(PERIOD_LABELS).filter(([k]) => k !== period).map(([k, label]) => {
                    const selected = auxiliaryPeriods.includes(k);
                    const disabled = !selected && auxiliaryPeriods.length >= 3;
                    return (
                      <button key={k} type="button"
                        className={`period-chip h-strip-item${selected ? ' active' : ''}`}
                        onClick={() => !disabled && toggleAuxPeriod(k)}
                        style={{ opacity: disabled ? 0.5 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}>
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Holding params */}
          <div style={{ border: '1px solid #f59e0b', background: '#fffbeb', borderRadius: '0.75rem', padding: '0.875rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
              <div>
                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#92400e', background: '#fde68a', padding: '0.15rem 0.45rem', borderRadius: '9999px' }}>
                  专业版功能
                </span>
                {hasPremiumInputs && (
                  <span style={{ marginLeft: '0.5rem', fontSize: '0.7rem', color: '#92400e' }}>
                    {filledCount === 0 ? '空仓模式' : '已填持仓参数'}
                  </span>
                )}
              </div>
              {hasPremiumInputs && (
                <button type="button" className="btn btn-secondary"
                  style={{ padding: '0.25rem 0.6rem', fontSize: '0.7rem', minHeight: 'auto' }}
                  onClick={() => setPremiumInputsOpen(!premiumInputsOpen)}>
                  {premiumInputsOpen ? '收起' : '展开'}
                </button>
              )}
              {!hasPremiumInputs && (
                <button type="button" className="btn btn-secondary"
                  style={{ padding: '0.25rem 0.6rem', fontSize: '0.7rem', minHeight: 'auto' }}
                  onClick={onUpgrade}>
                  升级解锁
                </button>
              )}
            </div>
            <p style={{ fontSize: '0.8125rem', color: '#92400e', lineHeight: 1.5, marginBottom: hasPremiumInputs && premiumInputsOpen ? '0.75rem' : 0 }}>
              🚀 专业版支持持仓参数个性化分析，历史结果随时回看。
            </p>
            {!hasPremiumInputs && (
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                {['每天15次', '历史回看', '持仓参数分析'].map(t => (
                  <span key={t} style={{ fontSize: '0.7rem', color: '#92400e', background: '#fef3c7', padding: '0.1rem 0.45rem', borderRadius: '9999px' }}>{t}</span>
                ))}
              </div>
            )}
            {hasPremiumInputs && premiumInputsOpen && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="label" style={{ fontSize: '0.75rem' }}>持有数量(股)</label>
                  <input className="input" value={holdingQuantity} onChange={e => setHoldingQuantity(e.target.value.replace(/\D/g, '').slice(0, 10))} inputMode="numeric" />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="label" style={{ fontSize: '0.75rem' }}>成本价</label>
                  <input className="input" value={costPrice} onChange={e => { const v = e.target.value.replace(/[^\d.]/g, ''); const parts = v.split('.'); setCostPrice(parts.length > 2 ? parts[0] + '.' + parts.slice(1).join('') : v.slice(0, 15)); }} inputMode="decimal" />
                </div>
                <div className="form-group" style={{ marginBottom: 0, gridColumn: '1/-1' }}>
                  <label className="label" style={{ fontSize: '0.75rem' }}>最大持仓(股)</label>
                  <input className="input" value={maxPosition} onChange={e => setMaxPosition(e.target.value.replace(/\D/g, '').slice(0, 10))} inputMode="numeric" />
                </div>
                <p style={{ gridColumn: '1/-1', fontSize: '0.7rem', color: 'var(--muted)', margin: 0 }}>
                  不填=按空仓分析；若填写则 3 项需全部填写。
                </p>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
