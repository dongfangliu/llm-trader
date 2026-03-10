'use client';

interface GuestTrialEndedScreenProps {
  open: boolean;
  banned: boolean;
  appName?: string;
  onRegister: () => void;
  onClose: () => void;
}

export default function GuestTrialEndedScreen({ open, banned, appName, onClose, onRegister }: GuestTrialEndedScreenProps) {
  if (!open && !banned) return null;

  const heroBlock = (
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
  );

  const termsLine = (
    <p style={{ fontSize: 12, color: '#aeaeb2', margin: '12px 0 0', lineHeight: 1.6, textAlign: 'center' }}>
      点击即同意{' '}
      <a href="/terms" style={{ color: '#8e8e93', textDecoration: 'none' }}>服务条款</a>
      {' '}与{' '}
      <a href="/privacy" style={{ color: '#8e8e93', textDecoration: 'none' }}>隐私政策</a>
    </p>
  );

  if (banned) {
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
          display: 'flex', flexDirection: 'column', alignItems: 'center',
        }}>
          <div style={{
            background: 'white', borderRadius: 20,
            padding: '28px 24px 24px',
            width: '100%',
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
            {termsLine}
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
        display: 'flex', flexDirection: 'column', alignItems: 'center',
      }}>
        <div style={{
          background: 'white', borderRadius: 20,
          padding: '28px 24px 24px',
          width: '100%',
          boxShadow: '0 2px 16px rgba(0,0,0,0.08)',
          textAlign: 'center',
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
            专业版体验<br />已结束
          </h2>
          <p style={{ fontSize: 15, color: '#8e8e93', margin: '0 0 24px' }}>这是你唯一一次免费体验</p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <a
              href="/upgrade"
              style={{
                display: 'block', width: '100%', height: 50,
                background: '#007aff',
                color: 'white', borderRadius: 12,
                fontSize: 17, fontWeight: 600,
                textDecoration: 'none',
                lineHeight: '50px',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              订阅专业版&nbsp;&nbsp;¥49/月
            </a>

            <button
              onClick={onRegister}
              style={{
                width: '100%', height: 44,
                background: 'none', border: 'none',
                color: '#007aff', fontSize: 15, fontWeight: 500,
                cursor: 'pointer',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              注册账号，免费继续使用 →
            </button>
          </div>

          {termsLine}
        </div>
      </div>
    </div>
  );
}

