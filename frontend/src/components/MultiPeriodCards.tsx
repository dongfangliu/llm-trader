'use client';

import { useState } from 'react';

const PERIOD_LABELS: Record<string, string> = {
  daily: '日线', '60': '60分钟', '30': '30分钟', '15': '15分钟', '5': '5分钟', '1': '1分钟',
};

interface PeriodResult {
  period: string;
  result: {
    result?: {
      action?: string;
      confidence?: number;
      target_price?: number;
      stop_loss?: number;
      reason?: string;
    };
  };
}

interface MultiPeriodCardsProps {
  results: PeriodResult[];
}

const ACTION_LABELS: Record<string, string> = { buy: '买入', sell: '卖出', hold: '观望' };
const ACTION_COLORS: Record<string, string> = { buy: '#ff3b30', sell: '#34c759', hold: '#8e8e93' };
const BAR_COLORS: Record<string, string> = {
  buy: '#ff3b30', sell: '#34c759', hold: '#c7c7cc',
};
const MINI_BAR_COLORS: Record<string, string> = {
  buy: '#ff3b30', sell: '#34c759', hold: '#8e8e93',
};

export default function MultiPeriodCards({ results }: MultiPeriodCardsProps) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  return (
    <div className="mpc-list">
      {results.map(({ period: p, result: r }, idx) => {
        const action = r.result?.action || 'hold';
        const color = ACTION_COLORS[action] || '#8e8e93';
        const barColor = BAR_COLORS[action] || '#c7c7cc';
        const miniColor = MINI_BAR_COLORS[action] || '#8e8e93';
        const expanded = expandedIdx === idx;
        const reason = r.result?.reason || '';
        const confidence = r.result?.confidence ?? null;

        const labelStyle: React.CSSProperties = {
          fontSize: '10px',
          fontWeight: 600,
          color: '#8e8e93',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          marginBottom: '3px',
        };

        return (
          <div
            key={p}
            className="mpc-card"
            onClick={() => reason && setExpandedIdx(expanded ? null : idx)}
          >
            {/* Left color bar */}
            <div className={`mpc-card-bar ${action}`} style={{ background: barColor }} />

            <div className="mpc-card-inner">
              {/* Header row */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <span style={{ fontWeight: 700, fontSize: '15px', color: '#1c1c1e' }}>
                  {PERIOD_LABELS[p] || p}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{
                    fontWeight: 700,
                    fontSize: '15px',
                    color,
                    letterSpacing: '-0.2px',
                  }}>
                    {ACTION_LABELS[action] || '观望'}
                  </span>
                  {reason && (
                    <span style={{
                      fontSize: '11px',
                      color: '#c7c7cc',
                      transform: expanded ? 'rotate(180deg)' : 'rotate(0)',
                      display: 'inline-block',
                      transition: 'transform 0.25s ease',
                      lineHeight: 1,
                    }}>▼</span>
                  )}
                </div>
              </div>

              {/* Metrics row */}
              <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                {/* Confidence mini bar */}
                {confidence != null && (
                  <div style={{ flex: '1', minWidth: '80px' }}>
                    <div style={{ ...labelStyle }}>置信度</div>
                    <div className="mpc-mini-bar-wrap">
                      <div className="mpc-mini-bar-track">
                        <div
                          className="mpc-mini-bar-fill"
                          style={{ width: `${confidence}%`, background: miniColor }}
                        />
                      </div>
                      <span style={{
                        fontSize: '12px',
                        fontWeight: 700,
                        color: miniColor,
                        flexShrink: 0,
                        fontVariantNumeric: 'tabular-nums',
                      }}>
                        {confidence}%
                      </span>
                    </div>
                  </div>
                )}

                {/* Target + Stop Loss */}
                <div style={{ display: 'flex', gap: '14px', flexShrink: 0 }}>
                  {typeof r.result?.target_price === 'number' && (
                    <div>
                      <div style={labelStyle}>目标价 ↑</div>
                      <span style={{ fontSize: '14px', fontWeight: 700, color: '#34c759', fontVariantNumeric: 'tabular-nums' }}>
                        {r.result.target_price.toFixed(2)}
                      </span>
                    </div>
                  )}
                  {typeof r.result?.stop_loss === 'number' && (
                    <div>
                      <div style={labelStyle}>止损价 ↓</div>
                      <span style={{ fontSize: '14px', fontWeight: 700, color: '#ff3b30', fontVariantNumeric: 'tabular-nums' }}>
                        {r.result.stop_loss.toFixed(2)}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Expandable reason */}
              {reason && (
                <div className={`mpc-reason-wrap${expanded ? ' expanded' : ''}`}>
                  <p style={{
                    fontSize: '13.5px',
                    color: '#3c3c43',
                    lineHeight: 1.75,
                    margin: '10px 0 2px',
                    fontVariantNumeric: 'tabular-nums',
                  }}>
                    {reason}
                  </p>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
