'use client';

interface PricingData {
  basic?: { price?: string; period?: string; daily_limit?: number };
  premium?: { price?: string; period?: string; daily_limit?: number };
}

interface UpgradeNudgeProps {
  tier: string;
  pricing: PricingData | null;
  onUpgrade: () => void;
}

export default function UpgradeNudge({ tier, pricing, onUpgrade }: UpgradeNudgeProps) {
  const premiumPrice = pricing?.premium?.price ?? '49';
  const basicPrice = pricing?.basic?.price ?? '19.9';
  const period = pricing?.basic?.period ?? '月';
  const basicLimit = pricing?.basic?.daily_limit ?? 5;
  const premiumLimit = pricing?.premium?.daily_limit ?? 15;

  if (tier === 'free') {
    return (
      <div style={{ padding: '4px 0 8px' }}>
        {/* Section label */}
        <div style={{ fontSize: '11px', fontWeight: 600, color: '#8e8e93', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '8px 16px 8px' }}>
          解锁更多功能
        </div>

        {/* Basic row */}
        <button
          onClick={onUpgrade}
          style={{
            display: 'flex', alignItems: 'center', gap: '12px',
            width: '100%', padding: '11px 16px',
            background: 'white', border: 'none', borderBottom: '0.5px solid rgba(60,60,67,0.1)',
            cursor: 'pointer', textAlign: 'left',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          <div style={{
            width: 36, height: 36, borderRadius: '10px', flexShrink: 0,
            background: 'linear-gradient(135deg, #007aff, #5ac8fa)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '17px',
          }}>📊</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
              <span style={{ fontSize: '15px', fontWeight: 600, color: '#000' }}>解锁标准版</span>
              <span style={{ fontSize: '10px', fontWeight: 700, padding: '1px 6px', borderRadius: '9999px', background: '#dbeafe', color: '#1d4ed8', letterSpacing: '0.2px' }}>推荐</span>
            </div>
            <p style={{ fontSize: '12px', color: '#8e8e93', margin: 0 }}>每天 {basicLimit} 次完整研判 · 全市场 · ¥{basicPrice}/{period}</p>
          </div>
          <span style={{ fontSize: '18px', color: '#c7c7cc', lineHeight: 1, flexShrink: 0 }}>›</span>
        </button>

        {/* Premium row */}
        <button
          onClick={onUpgrade}
          style={{
            display: 'flex', alignItems: 'center', gap: '12px',
            width: '100%', padding: '11px 16px',
            background: 'linear-gradient(90deg, #faf5ff 0%, #f3e8ff 100%)',
            border: 'none',
            cursor: 'pointer', textAlign: 'left',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          <div style={{
            width: 36, height: 36, borderRadius: '10px', flexShrink: 0,
            background: 'linear-gradient(135deg, #7c3aed, #a855f7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '17px',
            boxShadow: '0 2px 8px rgba(124,58,237,0.25)',
          }}>👑</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
              <span style={{ fontSize: '15px', fontWeight: 600, color: '#5b21b6' }}>升级专业版</span>
              <span style={{ fontSize: '10px', fontWeight: 700, padding: '1px 6px', borderRadius: '9999px', background: '#f3e8ff', color: '#7c3aed', letterSpacing: '0.2px' }}>最高权益</span>
            </div>
            <p style={{ fontSize: '12px', color: '#7c3aed', margin: 0, opacity: 0.75 }}>每天 {premiumLimit} 次 · 持仓分析 · 多标的查询 · ¥{premiumPrice}/{period}</p>
          </div>
          <span style={{ fontSize: '18px', color: '#a78bfa', lineHeight: 1, flexShrink: 0 }}>›</span>
        </button>
      </div>
    );
  }

  if (tier === 'basic') {
    return (
      <div style={{ padding: '4px 16px 8px' }}>
        <div style={{ fontSize: '11px', fontWeight: 600, color: '#8e8e93', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '8px 0 8px' }}>
          解锁更多功能
        </div>
        <button
          onClick={onUpgrade}
          style={{
            display: 'flex', alignItems: 'center', gap: '12px',
            width: '100%', padding: '14px 16px',
            background: 'linear-gradient(135deg, #1e0a3c 0%, #2d1b69 50%, #3b1d8a 100%)',
            border: '1.5px solid rgba(124,58,237,0.4)',
            borderRadius: '14px',
            cursor: 'pointer', textAlign: 'left',
            WebkitTapHighlightColor: 'transparent',
            boxShadow: '0 4px 16px rgba(124,58,237,0.2)',
          }}
        >
          <div style={{
            width: 40, height: 40, borderRadius: '12px', flexShrink: 0,
            background: 'linear-gradient(135deg, #7c3aed, #a855f7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px',
            boxShadow: '0 2px 10px rgba(124,58,237,0.35)',
          }}>👑</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
              <span style={{ fontSize: '15px', fontWeight: 700, color: '#fff' }}>升级专业版</span>
              <span style={{ fontSize: '10px', fontWeight: 700, padding: '1px 7px', borderRadius: '9999px', background: 'rgba(255,255,255,0.15)', color: '#c4b5fd', letterSpacing: '0.2px' }}>最高权益</span>
            </div>
            <p style={{ fontSize: '12px', color: 'rgba(196,181,253,0.8)', margin: 0 }}>每天 {premiumLimit} 次 · 持仓智能分析 · ¥{premiumPrice}/{period}</p>
          </div>
          <span style={{ fontSize: '18px', color: '#a78bfa', lineHeight: 1, flexShrink: 0 }}>›</span>
        </button>
      </div>
    );
  }

  return null;
}
