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

/* V2: compact one-line upgrade nudge — not a full card, just a tasteful row */
export default function UpgradeTeaser({ tier, pricing, onUpgrade }: UpgradeTeaserProps) {
  if (tier === 'premium') return null;

  const basicPrice = pricing?.basic?.price ?? '19.9';
  const premiumPrice = pricing?.premium?.price ?? '49';
  const period = pricing?.basic?.period ?? '月';
  const basicLimit = pricing?.basic?.daily_limit ?? 5;
  const premiumLimit = pricing?.premium?.daily_limit ?? 15;

  const label = tier === 'basic'
    ? `每天${premiumLimit}次 · 持仓分析 · ¥${premiumPrice}/${period}`
    : `每天${basicLimit}次 · 完整研判 · ¥${basicPrice}/${period}起`;

  const accent = tier === 'basic' ? '#7c3aed' : '#007aff';

  return (
    <button
      onClick={onUpgrade}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        width: '100%', padding: '11px 16px', background: 'none', border: 'none',
        cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
      }}
    >
      <span style={{ fontSize: '13px', color: '#8e8e93' }}>{label}</span>
      <span style={{
        fontSize: '12px', fontWeight: 700, padding: '3px 10px',
        borderRadius: '9999px', background: accent, color: '#fff',
        flexShrink: 0, letterSpacing: '0.1px',
      }}>
        {tier === 'basic' ? '升级专业' : '立即升级'}
      </span>
    </button>
  );
}
