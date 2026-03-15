'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/store';
import { resendVerification, getAppConfig, AppConfig } from '@/lib/api';

/* ─── Eye toggle icon ─── */
function EyeIcon({ visible }: { visible: boolean }) {
  return visible ? (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  ) : (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  );
}

/* ─── Reusable iOS form-group row ─── */
function FormRow({
  label, type, placeholder, value, onChange, isLast, autoComplete,
}: {
  label: string; type: string; placeholder: string;
  value: string; onChange: (v: string) => void;
  isLast?: boolean; autoComplete?: string;
}) {
  const [showPwd, setShowPwd] = useState(false);
  const isPassword = type === 'password';
  const inputType = isPassword ? (showPwd ? 'text' : 'password') : type;

  /* sanitize: strip control characters and limit length */
  const handleChange = (raw: string) => {
    // eslint-disable-next-line no-control-regex
    const clean = raw.replace(/[\x00-\x1F\x7F]/g, '').slice(0, 128);
    onChange(clean);
  };

  return (
    <div style={{
      display: 'flex', alignItems: 'center', minHeight: 44,
      padding: '0 16px',
      borderBottom: isLast ? 'none' : '0.5px solid rgba(60,60,67,0.12)',
    }}>
      <label style={{
        fontSize: 15, color: '#000', fontWeight: 400,
        width: 80, flexShrink: 0,
      }}>{label}</label>
      <input
        type={inputType}
        placeholder={placeholder}
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        autoComplete={autoComplete}
        style={{
          flex: 1, border: 'none', outline: 'none', background: 'transparent',
          fontSize: 15, color: '#000', padding: '10px 0',
        }}
      />
      {isPassword && (
        <button
          type="button"
          onClick={() => setShowPwd((v) => !v)}
          tabIndex={-1}
          style={{
            background: 'none', border: 'none',
            padding: '0 4px 0 12px', margin: '0 -4px 0 0',
            minWidth: 44, minHeight: 44,
            cursor: 'pointer', color: '#8e8e93', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            WebkitTapHighlightColor: 'transparent',
          }}
          aria-label={showPwd ? '隐藏密码' : '显示密码'}
        >
          <EyeIcon visible={showPwd} />
        </button>
      )}
    </div>
  );
}

const BENEFITS = [
  { icon: '📊', bg: 'linear-gradient(135deg, #007aff, #3b9eff)', title: '免费分析', desc: '每天 1 次免费深度研判' },
  { icon: '☁', bg: 'linear-gradient(135deg, #34c759, #30d158)', title: '跨设备同步', desc: '任意设备登录，数据不丢失' },
  { icon: '★', bg: 'linear-gradient(135deg, #ff9500, #ffcc02)', title: '邀请奖励', desc: '邀请好友，获得免费永久额度' },
  { icon: '↑', bg: 'linear-gradient(135deg, #5856d6, #7c3aed)', title: '解锁升级通道', desc: '订阅标准版或专业版，无限分析' },
];

export default function RegisterPage() {
  const router = useRouter();
  const { register, isLoading, error, pendingVerificationEmail, clearPendingVerification } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [localError, setLocalError] = useState('');
  const [resendStatus, setResendStatus] = useState('');
  const [registered, setRegistered] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [appConfig, setAppConfig] = useState<AppConfig | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const inv = params.get('invite');
    if (inv) setInviteCode(inv);
  }, []);

  useEffect(() => {
    getAppConfig().then(setAppConfig).catch(() => {});
  }, []);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError('');
    if (password !== confirmPassword) { setLocalError('两次密码输入不一致'); return; }
    if (password.length < 6) { setLocalError('密码至少 6 位'); return; }
    if (appConfig?.require_invite_code && !inviteCode.trim()) { setLocalError('请输入邀请码'); return; }
    try {
      await register({ email, password, invite_code: inviteCode.trim() || undefined });
      setRegistered(true);
    } catch {
      // Error handled in store
    }
  };

  useEffect(() => {
    if (registered && !pendingVerificationEmail) router.push('/login');
  }, [registered, pendingVerificationEmail, router]);

  const handleResend = async () => {
    if (resendCooldown > 0) return;
    setResendStatus('发送中...');
    try {
      await resendVerification(pendingVerificationEmail || email);
      setResendStatus('验证邮件已重新发送，请查收');
      setResendCooldown(60);
    } catch {
      setResendStatus('发送失败，请稍后重试');
    }
  };

  /* ── Email verification screen ── */
  if (pendingVerificationEmail) {
    return (
      <div style={{
        minHeight: '100dvh', background: '#f2f2f7',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 16px',
      }}>
        <div style={{
          width: 88, height: 88,
          background: 'linear-gradient(145deg, #34c759, #30d158)',
          borderRadius: 22, display: 'flex', alignItems: 'center',
          justifyContent: 'center', fontSize: 44,
          boxShadow: '0 8px 24px rgba(52,199,89,0.35)',
          marginBottom: 24,
        }}>📧</div>
        <h2 style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.4px', color: '#000', margin: '0 0 10px', textAlign: 'center' }}>
          请验证您的邮箱
        </h2>
        <p style={{ fontSize: 15, color: '#8e8e93', textAlign: 'center', lineHeight: 1.7, margin: '0 0 32px', maxWidth: 320 }}>
          验证邮件已发送至<br />
          <strong style={{ color: '#000' }}>{pendingVerificationEmail}</strong><br />
          请点击邮件中的链接完成激活。
        </p>

        <div style={{ width: '100%', maxWidth: 480 }}>
          <button
            onClick={handleResend}
            disabled={resendCooldown > 0}
            style={{
              width: '100%', height: 50, background: 'white', border: 'none',
              borderRadius: 12, fontSize: 17, fontWeight: 500,
              color: resendCooldown > 0 ? '#c7c7cc' : '#007aff',
              cursor: resendCooldown > 0 ? 'default' : 'pointer', marginBottom: 12,
              WebkitTapHighlightColor: 'transparent',
            }}
          >{resendCooldown > 0 ? `重新发送 (${resendCooldown}s)` : '重新发送验证邮件'}</button>
          {resendStatus && (
            <p style={{ textAlign: 'center', fontSize: 13, color: '#8e8e93', marginBottom: 12 }}>{resendStatus}</p>
          )}
          <button
            onClick={() => clearPendingVerification()}
            style={{
              width: '100%', height: 50, background: 'none', border: 'none',
              fontSize: 15, color: '#8e8e93', cursor: 'pointer',
              WebkitTapHighlightColor: 'transparent',
            }}
          >返回注册页</button>
        </div>

        <p style={{ fontSize: 13, color: '#aeaeb2', marginTop: 24, textAlign: 'center', maxWidth: 280, lineHeight: 1.6 }}>
          没有收到邮件？请检查垃圾邮件文件夹，或点击上方重新发送。
        </p>
      </div>
    );
  }

  const displayError = localError || error;

  return (
    <div style={{
      minHeight: '100dvh', background: '#f2f2f7',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center',
      padding: '40px 0',
    }}>
      {/* ── Hero ── */}
      <div style={{
        width: '100%', maxWidth: 480,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: '24px 16px 24px', textAlign: 'center',
      }}>
        <div style={{
          width: 72, height: 72,
          background: 'linear-gradient(145deg, #007aff, #5856d6)',
          borderRadius: 18, display: 'flex', alignItems: 'center',
          justifyContent: 'center', fontSize: 36,
          boxShadow: '0 6px 20px rgba(0,122,255,0.28)',
          marginBottom: 14,
        }}>📈</div>
        <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.4px', color: '#000', margin: '0 0 5px' }}>
          创建账号
        </h1>
        <p style={{ fontSize: 14, color: '#8e8e93', margin: 0 }}>
          注册即解锁完整分析功能
        </p>
      </div>

      <div style={{ width: '100%', maxWidth: 480, padding: '0 16px' }}>
        <form onSubmit={handleRegister}>
          <div style={{ background: 'white', borderRadius: 12, overflow: 'hidden', marginBottom: 20 }}>
            <FormRow label="邮箱" type="email" placeholder="your@email.com"
              value={email} onChange={setEmail} autoComplete="email" />
            <FormRow label="密码" type="password" placeholder="至少 6 位"
              value={password} onChange={setPassword} autoComplete="new-password" />
            <FormRow label="确认密码" type="password" placeholder="再次输入"
              value={confirmPassword} onChange={setConfirmPassword}
              autoComplete="new-password" />
            <div style={{
              display: 'flex', alignItems: 'center', minHeight: 44,
              padding: '0 16px',
            }}>
              <label style={{
                fontSize: 15, color: '#000', fontWeight: 400,
                width: 80, flexShrink: 0,
              }}>
                邀请码{appConfig?.require_invite_code
                  ? <span style={{ color: '#ff3b30' }}> *</span>
                  : <span style={{ fontSize: 11, color: '#aeaeb2' }}> （可选）</span>
                }
              </label>
              <input
                type="text"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                placeholder={appConfig?.require_invite_code ? '请输入邀请码' : '邀请码（可选）'}
                autoComplete="off"
                style={{
                  flex: 1, border: 'none', outline: 'none', background: 'transparent',
                  fontSize: 15, color: '#000', padding: '10px 0',
                  letterSpacing: '0.5px',
                }}
              />
            </div>
          </div>

          {displayError && (
            <div style={{
              background: 'white', borderRadius: 12, padding: '12px 16px',
              marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <span style={{ fontSize: 20 }}>⚠️</span>
              <p style={{ fontSize: 14, color: '#ff3b30', margin: 0 }}>{displayError}</p>
            </div>
          )}

          <button
            type="submit" disabled={isLoading}
            style={{
              width: '100%', height: 50,
              background: isLoading ? '#c7c7cc' : '#007aff',
              color: 'white', border: 'none', borderRadius: 12,
              fontSize: 17, fontWeight: 600,
              cursor: isLoading ? 'default' : 'pointer',
              marginBottom: 12,
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            {isLoading ? '注册中…' : '立即注册'}
          </button>
        </form>

        <p style={{ textAlign: 'center', fontSize: 14, color: '#8e8e93', margin: '0 0 28px' }}>
          已有账号？{' '}
          <a href="/login" style={{ color: '#007aff', textDecoration: 'none', fontWeight: 600 }}>直接登录</a>
        </p>

        {/* Benefits section */}
        <p style={{ fontSize: 12, fontWeight: 600, color: '#8e8e93', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '0 4px', marginBottom: 8 }}>
          注册的好处
        </p>
        <div style={{ background: 'white', borderRadius: 12, overflow: 'hidden', marginBottom: 24 }}>
          {BENEFITS.map((b, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '10px 16px',
              borderBottom: i < BENEFITS.length - 1 ? '0.5px solid rgba(60,60,67,0.1)' : 'none',
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                background: b.bg,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17,
                color: 'white', fontWeight: 700,
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              }}>{b.icon}</div>
              <div>
                <p style={{ fontSize: 14, fontWeight: 500, color: '#000', margin: '0 0 1px' }}>{b.title}</p>
                <p style={{ fontSize: 12, color: '#8e8e93', margin: 0 }}>{b.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Terms */}
        <p style={{ textAlign: 'center', fontSize: 12, color: '#aeaeb2', lineHeight: 1.6 }}>
          注册即表示同意{' '}
          <a href="/terms" style={{ color: '#8e8e93', textDecoration: 'none' }}>服务条款</a>
          {' '}与{' '}
          <a href="/privacy" style={{ color: '#8e8e93', textDecoration: 'none' }}>隐私政策</a>
        </p>
      </div>
    </div>
  );
}
