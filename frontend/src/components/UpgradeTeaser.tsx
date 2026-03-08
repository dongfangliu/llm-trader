'use client';

interface PricingData {
  basic?: { price?: string; period?: string; daily_limit?: number };
  premium?: { price?: string; period?: string; daily_limit?: number };
  features?: { tiers: string[]; text: string }[];
}

interface UpgradeTeaserProps {
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

function UpgradeRow({ icon, gradient, title, subtitle, badge, badgeColor, badgeBg, onClick }: RowProps) {
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
      {/* Icon tile */}
      <div style={{
        width: 34, height: 34, borderRadius: '8px', flexShrink: 0,
        background: gradient,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '17px',
      }}>
        {icon}
      </div>

      {/* Text */}
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

      {/* Chevron */}
      <span style={{ fontSize: '18px', color: '#c7c7cc', lineHeight: 1, flexShrink: 0 }}>›</span>
    </button>
  );
}

export default function UpgradeTeaser({ tier, pricing, onUpgrade }: UpgradeTeaserProps) {
  if (tier === 'premium') return null;

  const basicPrice = pricing?.basic?.price ?? '19.9';
  const premiumPrice = pricing?.premium?.price ?? '49';
  const period = pricing?.basic?.period ?? '月';
  const basicLimit = pricing?.basic?.daily_limit ?? 5;
  const premiumLimit = pricing?.premium?.daily_limit ?? 15;

  // basic tier: only show premium upgrade
  if (tier === 'basic') {
    return (
      <UpgradeRow
        icon="👑"
        gradient="linear-gradient(135deg, #7c3aed, #a855f7)"
        title="升级专业版"
        subtitle={`每天${premiumLimit}次 · 持仓智能分析 · 历史结果随时回看 · ¥${premiumPrice}/${period}`}
        badge="最高权益"
        badgeBg="#f3e8ff"
        badgeColor="#7c3aed"
        onClick={onUpgrade}
      />
    );
  }

  // free tier: show BOTH standard and premium rows
  return (
    <>
      <UpgradeRow
        icon="📊"
        gradient="linear-gradient(135deg, #007aff, #5ac8fa)"
        title="解锁标准版"
        subtitle={`每天${basicLimit}次 · 全市场 · 完整目标价与研判 · ¥${basicPrice}/${period}`}
        badge="推荐"
        badgeBg="#dbeafe"
        badgeColor="#1d4ed8"
        onClick={onUpgrade}
      />
      {/* Separator between rows */}
      <div style={{ height: '0.5px', background: 'rgba(60,60,67,0.12)', margin: '0 0 0 62px' }} />
      <UpgradeRow
        icon="👑"
        gradient="linear-gradient(135deg, #7c3aed, #a855f7)"
        title="升级专业版"
        subtitle={`每天${premiumLimit}次 · 持仓智能分析 · 历史结果随时回看 · ¥${premiumPrice}/${period}`}
        badge="最高权益"
        badgeBg="#f3e8ff"
        badgeColor="#7c3aed"
        onClick={onUpgrade}
      />
    </>
  );
}
