'use client';

import BottomSheet from './BottomSheet';

interface User {
  email?: string;
  subscription_tier?: string;
}

interface UserMenuSheetProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  tier: string;
  onAccount: () => void;
  onUpgrade: () => void;
  onLogout: () => void;
  onLogin: () => void;
  onRegister: () => void;
  onSavedRecords?: () => void;
}

const TIER_LABELS: Record<string, string> = { free: '免费版', basic: '标准版', premium: '专业版' };
const BADGE_STYLES: Record<string, { bg: string; color: string }> = {
  free: { bg: '#e2e8f0', color: '#475569' },
  basic: { bg: '#dbeafe', color: '#1d4ed8' },
  premium: { bg: '#fef3c7', color: '#b45309' },
};

export default function UserMenuSheet({
  isOpen, onClose, user, tier, onAccount, onUpgrade, onLogout, onLogin, onRegister, onSavedRecords,
}: UserMenuSheetProps) {
  const badge = BADGE_STYLES[tier] || BADGE_STYLES.free;

  const MenuItem = ({ icon, label, onClick, color }: { icon: string; label: string; onClick: () => void; color?: string }) => (
    <button
      onClick={() => { onClick(); onClose(); }}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: '0.875rem',
        padding: '0 1.25rem', height: '52px', border: 'none', background: 'none',
        cursor: 'pointer', fontSize: '0.9375rem', color: color || 'var(--foreground)',
        fontWeight: 500, textAlign: 'left',
        borderBottom: '1px solid #f8fafc',
      }}
    >
      <span style={{ fontSize: '1.125rem', width: '1.5rem', textAlign: 'center' }}>{icon}</span>
      {label}
    </button>
  );

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} maxHeight="60vh">
      {/* User info */}
      <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <div style={{
          width: '40px', height: '40px', borderRadius: '50%',
          background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'white', fontWeight: 700, fontSize: '1rem', flexShrink: 0,
        }}>
          {user ? (user.email?.[0]?.toUpperCase() || '?') : '👤'}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '0.875rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {user ? user.email : '游客模式'}
          </div>
          <span style={{ fontSize: '0.7rem', background: badge.bg, color: badge.color, padding: '0.15rem 0.5rem', borderRadius: '9999px', fontWeight: 600 }}>
            {TIER_LABELS[tier] || tier}
          </span>
        </div>
      </div>

      {/* Menu items */}
      <div style={{ paddingBottom: '1rem' }}>
        {user ? (
          <>
            <MenuItem icon="🔖" label="我的收藏" onClick={onSavedRecords ?? onAccount} />
            <MenuItem icon="👤" label="账号设置" onClick={onAccount} />
            <MenuItem icon="🚪" label="退出登录" onClick={onLogout} color="#ef4444" />
          </>
        ) : (
          <>
            <MenuItem icon="🔑" label="登录" onClick={onLogin} />
            <MenuItem icon="✨" label="免费注册" onClick={onRegister} />
          </>
        )}
      </div>
    </BottomSheet>
  );
}
