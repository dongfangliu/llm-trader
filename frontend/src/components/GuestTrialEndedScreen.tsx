'use client';

import { TrialPerk } from '@/lib/api';

const PERK_BG = [
  'linear-gradient(135deg, #007aff, #3b9eff)',
  'linear-gradient(135deg, #34c759, #30d158)',
  'linear-gradient(135deg, #ff9500, #ffcc02)',
];

const DEFAULT_PERKS: TrialPerk[] = [
  { icon: '📊', text: '每天 1 次免费深度研判' },
  { icon: '☁', text: '跨设备同步，数据不丢失' },
  { icon: '★', text: '邀请好友获得额外永久额度' },
];

interface GuestTrialEndedScreenProps {
  open: boolean;
  banned: boolean;
  appName?: string;
  onRegister: () => void;
  onClose: () => void;
  trialEndedTitle?: string;
  trialEndedSubtitle?: string;
  trialEndedPerksLabel?: string;
  trialEndedPerks?: TrialPerk[];
  registerButtonText?: string;
  upgradeHint?: string;
}

export default function GuestTrialEndedScreen({
  open, banned, appName, onClose, onRegister,
  trialEndedTitle = '专业版体验已结束',
  trialEndedSubtitle = '游客仅限一次免费体验',
  trialEndedPerksLabel = '注册账号，每天继续使用',
  trialEndedPerks = DEFAULT_PERKS,
  registerButtonText = '免费注册，继续使用',
  upgradeHint = '标准版 ¥19.9/月 · 专业版 ¥49/月',
}: GuestTrialEndedScreenProps) {
  if (!open && !banned) return null;

  const heroBlock = (
    <div style={{
      width: '100%', maxWidth: 480,
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '48px 16px 24px',
      textAlign: 'center',
    }}>
      <div style={{
        width: 80, height: 80,
        background: 'linear-gradient(145deg, #007aff, #5856d6)',
        borderRadius: 20,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 40,
        boxShadow: '0 8px 24px rgba(0,122,255,0.3)',
        marginBottom: 16,
      }}>📈</div>
      <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.5px', color: '#000', margin: '0 0 6px' }}>
        {appName}
      </h1>
      <p style={{ fontSize: 15, color: '#8e8e93', margin: 0 }}>
        AI 驱动的专业技术分析平台
      </p>
    </div>
  );

  if (banned) {
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: '#f2f2f7',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '0 0 40px',
        overflowY: 'auto',
      }}>
        {heroBlock}
        <div style={{ width: '100%', maxWidth: 480, padding: '0 16px' }}>
          <div style={{
            background: 'white', borderRadius: 20,
            padding: '28px 24px 24px',
            boxShadow: '0 2px 16px rgba(0,0,0,0.08)',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>🚫</div>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: '#000', margin: '0 0 8px' }}>此设备已被限制</h2>
            <p style={{ fontSize: 15, color: '#8e8e93', margin: '0 0 24px' }}>如有疑问，请联系管理员</p>
            <button
              onClick={onClose}
              style={{
                width: '100%', height: 50,
                background: '#f2f2f7', border: 'none', borderRadius: 12,
                fontSize: 17, fontWeight: 600, color: '#3c3c43',
                cursor: 'pointer',
                WebkitTapHighlightColor: 'transparent',
              }}
            >关闭</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: '#f2f2f7',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center',
      padding: '0 0 40px',
      overflowY: 'auto',
    }}>
      {heroBlock}
      <div style={{
        width: '100%', maxWidth: 480,
        padding: '0 16px',
        display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        {/* Trial ended notice card */}
        <div style={{
          background: 'white', borderRadius: 20,
          overflow: 'hidden',
          boxShadow: '0 2px 16px rgba(0,0,0,0.08)',
        }}>
          {/* Dark header */}
          <div style={{
            background: 'linear-gradient(135deg, #1c1c1e 0%, #2c2c2e 100%)',
            padding: '20px 24px',
            textAlign: 'center',
            position: 'relative',
          }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>⏳</div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: '#fff', margin: '0 0 4px', letterSpacing: '-0.3px' }}>
              {trialEndedTitle}
            </h2>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', margin: 0 }}>
              {trialEndedSubtitle}
            </p>
          </div>

          {/* Register perks */}
          <div style={{ padding: '16px 20px 20px' }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: '#8e8e93', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 12px' }}>
              {trialEndedPerksLabel}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
              {trialEndedPerks.map((p, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                    background: PERK_BG[i % PERK_BG.length],
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 15, color: 'white', fontWeight: 700,
                    boxShadow: '0 2px 6px rgba(0,0,0,0.12)',
                  }}>{p.icon}</div>
                  <p style={{ fontSize: 14, color: '#1c1c1e', margin: 0, fontWeight: 500 }}>{p.text}</p>
                </div>
              ))}
            </div>

            <button
              onClick={onRegister}
              style={{
                width: '100%', height: 50,
                background: '#007aff',
                color: 'white', border: 'none', borderRadius: 12,
                fontSize: 17, fontWeight: 600,
                cursor: 'pointer',
                WebkitTapHighlightColor: 'transparent',
                marginBottom: 10,
                boxShadow: '0 4px 16px rgba(0,122,255,0.3)',
              }}
            >
              {registerButtonText}
            </button>

            <a
              href="/login"
              style={{
                display: 'block', width: '100%', height: 44,
                background: 'none',
                color: '#007aff', fontSize: 15, fontWeight: 500,
                textDecoration: 'none',
                lineHeight: '44px',
                textAlign: 'center',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              已有账号？登录
            </a>
          </div>
        </div>

        {/* Upgrade teaser */}
        <div style={{
          background: 'white', borderRadius: 16,
          padding: '14px 20px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          boxShadow: '0 1px 8px rgba(0,0,0,0.06)',
        }}>
          <div>
            <p style={{ fontSize: 14, fontWeight: 600, color: '#000', margin: '0 0 2px' }}>想要更多分析次数？</p>
            <p style={{ fontSize: 12, color: '#8e8e93', margin: 0 }}>{upgradeHint}</p>
          </div>
          <a href="/upgrade?plan=basic" style={{
            fontSize: 13, fontWeight: 600, color: '#007aff',
            textDecoration: 'none', whiteSpace: 'nowrap',
          }}>了解套餐 →</a>
        </div>

        <p style={{ fontSize: 12, color: '#aeaeb2', textAlign: 'center', lineHeight: 1.6, margin: '4px 0 0' }}>
          注册即表示同意{' '}
          <a href="/terms" style={{ color: '#8e8e93', textDecoration: 'none' }}>服务条款</a>
          {' '}与{' '}
          <a href="/privacy" style={{ color: '#8e8e93', textDecoration: 'none' }}>隐私政策</a>
        </p>
      </div>
    </div>
  );
}
