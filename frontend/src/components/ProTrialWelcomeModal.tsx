'use client';

interface ProTrialWelcomeModalProps {
  open: boolean;
  appName: string;
  onConfirm: () => void;
}

export default function ProTrialWelcomeModal({ open, appName, onConfirm }: ProTrialWelcomeModalProps) {
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
        padding: '48px 16px 28px',
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
          background: 'white', borderRadius: 20,
          padding: '28px 24px 24px',
          width: '100%',
          boxShadow: '0 2px 16px rgba(0,0,0,0.08)',
          textAlign: 'center',
          marginBottom: 16,
        }}>
          {/* Badge */}
          <div style={{
            width: 56, height: 56,
            background: 'linear-gradient(145deg, #007aff, #5856d6)',
            borderRadius: 16,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 26,
            margin: '0 auto 16px',
            boxShadow: '0 4px 12px rgba(0,122,255,0.3)',
          }}>✦</div>

          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#000', margin: '0 0 8px', letterSpacing: '-0.3px' }}>
            你获得一次专业版体验机会
          </h2>
          <p style={{ fontSize: 15, color: '#8e8e93', margin: '0 0 24px', lineHeight: 1.5 }}>
            请开始分析，体验 AI 深度研判报告
          </p>

          <button
            onClick={onConfirm}
            style={{
              width: '100%', height: 50,
              background: '#007aff',
              color: 'white', border: 'none', borderRadius: 12,
              fontSize: 17, fontWeight: 600,
              cursor: 'pointer',
              WebkitTapHighlightColor: 'transparent',
              marginBottom: 12,
            }}
          >
            开始分析
          </button>

          <p style={{ fontSize: 12, color: '#aeaeb2', margin: 0, lineHeight: 1.6 }}>
            点击即同意{' '}
            <a href="/terms" style={{ color: '#8e8e93', textDecoration: 'none' }}>服务条款</a>
            {' '}与{' '}
            <a href="/privacy" style={{ color: '#8e8e93', textDecoration: 'none' }}>隐私政策</a>
          </p>
        </div>
      </div>
    </div>
  );
}
