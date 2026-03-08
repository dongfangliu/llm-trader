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

interface RowProps {
  icon: string;
  gradient: string;
  title: string;
  subtitle: string;
  badge?: string;
  badgeColor?: string;
  badgeBg?: string;
  onClick: () => void;
}

function NudgeRow({ icon, gradient, title, subtitle, badge, badgeColor, badgeBg, onClick }: RowProps) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: '12px',
        width: '100%', padding: '13px 16px', background: 'none', border: 'none',
        cursor: 'pointer', textAlign: 'left', minHeight: '56px',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <div style={{
        width: 36, height: 36, borderRadius: '8px', flexShrink: 0,
        background: gradient,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '17px',
      }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
          <span style={{ fontSize: '15px', fontWeight: 600, color: '#000' }}>{title}</span>
          {badge && (
            <span style={{
              fontSize: '10px', fontWeight: 700, padding: '1px 6px',
              borderRadius: '9999px', background: badgeBg, color: badgeColor,
              letterSpacing: '0.2px',
            }}>
              {badge}
            </span>
          )}
        </div>
        <p style={{ fontSize: '12px', color: '#8e8e93', margin: 0 }}>{subtitle}</p>
      </div>
      <span style={{ fontSize: '18px', color: '#c7c7cc', lineHeight: 1, flexShrink: 0 }}>›</span>
    </button>
  );
}

export default function UpgradeNudge({ tier, pricing, onUpgrade }: UpgradeNudgeProps) {
  const premiumPrice = pricing?.premium?.price ?? '49';
  const basicPrice = pricing?.basic?.price ?? '19.9';
  const period = pricing?.basic?.period ?? '月';

  if (tier === 'free') {
    return (
      <div style={{ marginBottom: '16px' }}>
        <div style={{ fontSize: '12px', fontWeight: 600, color: '#8e8e93', textTransform: 'uppercase', letterSpacing: '0.04em', padding: '12px 16px 6px' }}>
          解锁更多功能
        </div>
        <div style={{ background: 'white', borderRadius: '12px', overflow: 'hidden' }}>
          <NudgeRow
            icon="📊"
            gradient="linear-gradient(135deg, #007aff, #5ac8fa)"
            title="解锁标准版"
            subtitle={`目标价 · 完整研判 · 多市场 · ¥${basicPrice}/${period}`}
            badge="推荐"
            badgeBg="#dbeafe"
            badgeColor="#1d4ed8"
            onClick={onUpgrade}
          />
          <div style={{ height: '0.5px', background: 'rgba(60,60,67,0.12)', margin: '0 0 0 62px' }} />
          <NudgeRow
            icon="👑"
            gradient="linear-gradient(135deg, #7c3aed, #a855f7)"
            title="升级专业版"
            subtitle={`持仓分析 · 多标的查询 · ¥${premiumPrice}/${period}`}
            badge="最高权益"
            badgeBg="#f3e8ff"
            badgeColor="#7c3aed"
            onClick={onUpgrade}
          />
        </div>
      </div>
    );
  }

  if (tier === 'basic') {
    return (
      <div style={{ marginBottom: '16px' }}>
        <div style={{ fontSize: '12px', fontWeight: 600, color: '#8e8e93', textTransform: 'uppercase', letterSpacing: '0.04em', padding: '12px 16px 6px' }}>
          解锁更多功能
        </div>
        <div style={{ background: 'white', borderRadius: '12px', overflow: 'hidden' }}>
          <NudgeRow
            icon="👑"
            gradient="linear-gradient(135deg, #7c3aed, #a855f7)"
            title="升级专业版"
            subtitle={`持仓分析 · 多标的查询 · ¥${premiumPrice}/${period}`}
            badge="最高权益"
            badgeBg="#f3e8ff"
            badgeColor="#7c3aed"
            onClick={onUpgrade}
          />
        </div>
      </div>
    );
  }

  return null;
}
