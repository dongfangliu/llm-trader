'use client';

interface Result {
  result?: {
    action?: string;
    confidence?: number;
    target_price?: number;
    stop_loss?: number;
    opportunity_quality?: string;
  };
  data?: {
    latest_price?: number;
    latest_date?: string;
  };
}

interface SignalHeroProps {
  result: Result;
  tier: string;
  period: string;
}

const PERIOD_LABELS: Record<string, string> = {
  daily: '日线', '60': '60分', '30': '30分', '15': '15分', '5': '5分', '1': '1分',
};

const ACTION_LABELS: Record<string, string> = {
  buy: '看涨', sell: '看跌', hold: '观望',
};

const OQ_COLORS: Record<string, string> = {
  A: '#16a34a', B: '#0369a1', C: '#d97706', D: '#dc2626',
};
const OQ_BG: Record<string, string> = {
  A: '#f0fdf4', B: '#e0f2fe', C: '#fffbeb', D: '#fef2f2',
};
const OQ_GLOW: Record<string, string> = {
  A: 'rgba(22,163,74,0.25)', B: 'rgba(3,105,161,0.25)', C: 'rgba(217,119,6,0.25)', D: 'rgba(220,38,38,0.25)',
};

// Circular progress component (SVG-based)
function CircularProgress({ value, color, size = 68 }: { value: number; color: string; size?: number }) {
  const r = (size - 10) / 2;
  const circ = 2 * Math.PI * r;
  const filled = circ * (1 - value / 100);

  return (
    <div className="circular-progress" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          className="circular-progress-track"
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={5}
        />
        <circle
          className="circular-progress-fill"
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={5}
          stroke={color}
          strokeDasharray={circ}
          strokeDashoffset={filled}
        />
      </svg>
      <div className="circular-progress-label">
        <span style={{ fontSize: '17px', fontWeight: 800, color, lineHeight: 1, letterSpacing: '-0.5px' }}>
          {value}
        </span>
        <span style={{ fontSize: '9px', fontWeight: 600, color, opacity: 0.75, letterSpacing: '0.2px', marginTop: '1px' }}>%</span>
      </div>
    </div>
  );
}

export default function SignalHero({ result, tier, period }: SignalHeroProps) {
  const action = result.result?.action || 'hold';
  const isFree = tier === 'free';
  const confidence = result.result?.confidence ?? null;
  const oq = (result.result as any)?.opportunity_quality as string | undefined;

  // Richer gradient backgrounds with radial light source
  const bgGradient =
    action === 'buy'
      ? 'linear-gradient(160deg, #fff1f2 0%, #fde8e8 100%)'
      : action === 'sell'
      ? 'linear-gradient(160deg, #f0fdf4 0%, #d9f5e3 100%)'
      : 'linear-gradient(160deg, #f9fafb 0%, #f0f1f3 100%)';

  const radialOverlay =
    action === 'buy'
      ? 'radial-gradient(ellipse at 80% 20%, rgba(220,38,38,0.08) 0%, transparent 60%)'
      : action === 'sell'
      ? 'radial-gradient(ellipse at 80% 20%, rgba(22,163,74,0.08) 0%, transparent 60%)'
      : 'radial-gradient(ellipse at 80% 20%, rgba(100,116,139,0.06) 0%, transparent 60%)';

  const actionColor =
    action === 'buy' ? '#dc2626' : action === 'sell' ? '#16a34a' : '#374151';

  const barColor =
    confidence == null ? '#c7c7cc'
    : confidence >= 80 ? '#34c759'
    : confidence >= 60 ? '#ff9500'
    : '#ff3b30';

  const labelStyle: React.CSSProperties = {
    fontSize: '10.5px',
    fontWeight: 600,
    color: '#8e8e93',
    textTransform: 'uppercase',
    letterSpacing: '0.55px',
    marginBottom: '5px',
  };

  const dividerColor =
    action === 'buy' ? 'rgba(220,38,38,0.12)'
    : action === 'sell' ? 'rgba(22,163,74,0.12)'
    : 'rgba(0,0,0,0.08)';

  return (
    <div
      className="signal-hero-v2"
      style={{ background: bgGradient, position: 'relative' }}
    >
      {/* Radial light overlay */}
      <div style={{ position: 'absolute', inset: 0, background: radialOverlay, pointerEvents: 'none' }} />

      {/* ── Main hero area ── */}
      <div style={{ padding: '20px 20px 16px', position: 'relative' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          {/* Action column */}
          <div style={{ flex: 1 }}>
            <div style={labelStyle}>建议操作</div>
            <div style={{
              fontSize: '56px',
              fontWeight: 900,
              letterSpacing: '-2px',
              lineHeight: 1,
              color: actionColor,
              fontVariantNumeric: 'tabular-nums',
            }}>
              {ACTION_LABELS[action] || '观望'}
            </div>
            {/* Period pill */}
            <div style={{
              marginTop: '10px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '12px',
              fontWeight: 600,
              color: actionColor,
              background: action === 'buy' ? 'rgba(220,38,38,0.1)' : action === 'sell' ? 'rgba(22,163,74,0.1)' : 'rgba(55,65,81,0.1)',
              borderRadius: '9999px',
              padding: '3px 10px',
            }}>
              {PERIOD_LABELS[period] || period}
            </div>
          </div>

          {/* Right: circular confidence or OQ badge */}
          <div style={{ textAlign: 'right', flexShrink: 0, paddingTop: '2px' }}>
            {!isFree && confidence != null ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
                <div style={labelStyle}>AI 置信度</div>
                <CircularProgress value={confidence} color={barColor} size={68} />
              </div>
            ) : oq ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
                <div style={labelStyle}>机会评级</div>
                <div style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: '52px', height: '52px', borderRadius: '14px',
                  background: OQ_BG[oq] ?? '#f3f4f6',
                  border: `1.5px solid ${OQ_COLORS[oq] ?? '#8e8e93'}`,
                  color: OQ_COLORS[oq] ?? '#8e8e93',
                  fontSize: '24px', fontWeight: 900,
                  boxShadow: `0 4px 12px ${OQ_GLOW[oq] ?? 'rgba(0,0,0,0.12)'}`,
                }}>
                  {oq}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* ── Price metrics row ── */}
      <div style={{
        borderTop: `1px solid ${dividerColor}`,
        display: 'flex',
        justifyContent: 'space-around',
        textAlign: 'center',
        padding: '14px 8px',
        background: 'rgba(255,255,255,0.52)',
        position: 'relative',
      }}>
        <div>
          <div style={labelStyle}>最新价</div>
          <div style={{ fontSize: '21px', fontWeight: 700, color: '#1c1c1e', letterSpacing: '-0.5px', fontVariantNumeric: 'tabular-nums' }}>
            {typeof result.data?.latest_price === 'number' ? result.data.latest_price.toFixed(2) : '—'}
          </div>
        </div>

        <div style={{ width: '0.5px', background: dividerColor, alignSelf: 'stretch' }} />

        {isFree ? (
          <>
            <div style={{ textAlign: 'center', cursor: 'pointer' }} onClick={() => window.location.href = '/upgrade'}>
              <div style={labelStyle}>目标价</div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: '#8e8e93', display: 'flex', alignItems: 'center', gap: '3px', justifyContent: 'center' }}>
                🔒 <span style={{ fontSize: '12.5px', color: '#007aff', fontWeight: 600 }}>升级解锁</span>
              </div>
            </div>
            <div style={{ width: '0.5px', background: dividerColor, alignSelf: 'stretch' }} />
            <div style={{ textAlign: 'center', cursor: 'pointer' }} onClick={() => window.location.href = '/upgrade'}>
              <div style={labelStyle}>止损价</div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: '#8e8e93', display: 'flex', alignItems: 'center', gap: '3px', justifyContent: 'center' }}>
                🔒 <span style={{ fontSize: '12.5px', color: '#007aff', fontWeight: 600 }}>升级解锁</span>
              </div>
            </div>
          </>
        ) : (
          <>
            <div>
              <div style={labelStyle}>目标价 ↑</div>
              <div style={{ fontSize: '21px', fontWeight: 700, color: '#16a34a', letterSpacing: '-0.5px', fontVariantNumeric: 'tabular-nums' }}>
                {typeof result.result?.target_price === 'number' ? result.result.target_price.toFixed(2) : '—'}
              </div>
            </div>
            <div style={{ width: '0.5px', background: dividerColor, alignSelf: 'stretch' }} />
            <div>
              <div style={labelStyle}>止损价 ↓</div>
              <div style={{ fontSize: '21px', fontWeight: 700, color: '#dc2626', letterSpacing: '-0.5px', fontVariantNumeric: 'tabular-nums' }}>
                {typeof result.result?.stop_loss === 'number' ? result.result.stop_loss.toFixed(2) : '—'}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
