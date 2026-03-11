'use client';

import { TrialPerk } from '@/lib/api';

const DEFAULT_PERKS: TrialPerk[] = [
  { icon: '🔍', text: '完整深度研判报告' },
  { icon: '📐', text: '多周期联合分析' },
  { icon: '💹', text: 'AI 买卖点精准定位' },
];

interface ProTrialWelcomeModalProps {
  open: boolean;
  appName: string;
  onConfirm: () => void;
  title?: string;
  subtitle?: string;
  perksLabel?: string;
  perks?: TrialPerk[];
  buttonText?: string;
}

export default function ProTrialWelcomeModal({
  open, appName, onConfirm,
  title = '你获得一次专业版体验',
  subtitle = '仅限一次 · 用完即止',
  perksLabel = '本次体验包含',
  perks = DEFAULT_PERKS,
  buttonText = '立即开始体验',
}: ProTrialWelcomeModalProps) {
  if (!open) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: '#f2f2f7',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center',
      padding: '0 0 40px',
      overflowY: 'auto',
    }}>
      {/* App hero block */}
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

      {/* Card */}
      <div style={{
        width: '100%', maxWidth: 480,
        padding: '0 16px',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
      }}>
        <div style={{
          borderRadius: 20,
          width: '100%',
          overflow: 'hidden',
          boxShadow: '0 4px 24px rgba(0,0,0,0.1)',
          marginBottom: 16,
        }}>
          {/* Premium header band */}
          <div style={{
            background: 'linear-gradient(135deg, #1e0a3c 0%, #3b1d8a 50%, #4f46e5 100%)',
            padding: '24px 24px 20px',
            textAlign: 'center',
            position: 'relative',
          }}>
            {/* Star decorations */}
            <div style={{ position: 'absolute', top: 10, left: 18, fontSize: 9, opacity: 0.5, color: 'white' }}>✦</div>
            <div style={{ position: 'absolute', top: 20, right: 22, fontSize: 7, opacity: 0.4, color: 'white' }}>✦</div>
            <div style={{ position: 'absolute', bottom: 12, left: '35%', fontSize: 6, opacity: 0.3, color: 'white' }}>✦</div>

            <div style={{
              width: 56, height: 56,
              background: 'rgba(255,255,255,0.15)',
              borderRadius: 16,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 28,
              margin: '0 auto 14px',
              border: '1px solid rgba(255,255,255,0.25)',
            }}>👑</div>

            <h2 style={{ fontSize: 20, fontWeight: 700, color: '#fff', margin: '0 0 6px', letterSpacing: '-0.3px' }}>
              {title}
            </h2>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', margin: 0 }}>
              {subtitle}
            </p>
          </div>

          {/* Perks list */}
          <div style={{ background: 'white', padding: '16px 20px 20px' }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: '#8e8e93', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 12px' }}>
              {perksLabel}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
              {perks.map((p, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                    background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 15,
                  }}>{p.icon}</div>
                  <p style={{ fontSize: 14, color: '#1c1c1e', margin: 0, fontWeight: 500 }}>{p.text}</p>
                </div>
              ))}
            </div>

            <button
              onClick={onConfirm}
              style={{
                width: '100%', height: 50,
                background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
                color: 'white', border: 'none', borderRadius: 12,
                fontSize: 17, fontWeight: 600,
                cursor: 'pointer',
                WebkitTapHighlightColor: 'transparent',
                marginBottom: 12,
                boxShadow: '0 4px 16px rgba(124,58,237,0.35)',
              }}
            >
              {buttonText}
            </button>

            <p style={{ fontSize: 12, color: '#aeaeb2', margin: 0, lineHeight: 1.6, textAlign: 'center' }}>
              点击即同意{' '}
              <a href="/terms" style={{ color: '#8e8e93', textDecoration: 'none' }}>服务条款</a>
              {' '}与{' '}
              <a href="/privacy" style={{ color: '#8e8e93', textDecoration: 'none' }}>隐私政策</a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
