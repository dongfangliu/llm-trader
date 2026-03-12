'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/store';
import { resendVerification, getAppConfig } from '@/lib/api';

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
  label, type, placeholder, value, onChange, autoFocus, isLast,
}: {
  label: string; type: string; placeholder: string;
  value: string; onChange: (v: string) => void;
  autoFocus?: boolean; isLast?: boolean;
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
        width: 72, flexShrink: 0,
      }}>{label}</label>
      <input
        type={inputType}
        placeholder={placeholder}
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        autoFocus={autoFocus}
        autoComplete={type === 'email' ? 'email' : type === 'password' ? 'current-password' : 'off'}
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

export default function LoginPage() {
  const router = useRouter();
  const { login, isLoading, error, pendingVerificationEmail, clearPendingVerification } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [resendStatus, setResendStatus] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [appName, setAppName] = useState('');
  const [rememberCredentials, setRememberCredentials] = useState(true);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  useEffect(() => {
    getAppConfig().then((cfg) => { if (cfg?.app_name) setAppName(cfg.app_name); }).catch(() => {});
    // Restore saved credentials
    const savedEmail = localStorage.getItem('savedEmail');
    const savedPassword = localStorage.getItem('savedPassword');
    if (savedEmail) setEmail(savedEmail);
    if (savedPassword) setPassword(savedPassword);
    // Restore remember credentials preference
    const saved = localStorage.getItem('rememberCredentials');
    if (saved === 'false') setRememberCredentials(false);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setResendStatus('');
    localStorage.setItem('rememberCredentials', rememberCredentials ? 'true' : 'false');
    if (rememberCredentials) {
      localStorage.setItem('savedEmail', email);
      localStorage.setItem('savedPassword', password);
    } else {
      localStorage.removeItem('savedEmail');
      localStorage.removeItem('savedPassword');
    }
    try {
      await login({ email, password });
      router.push('/');
    } catch {
      // Error handled in store
    }
  };

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

  const isUnverified = !!pendingVerificationEmail;

  return (
    <div style={{
      minHeight: '100dvh',
      background: '#f2f2f7',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px 0',
    }}>
      {/* ── Hero block ── */}
      <div style={{
        width: '100%', maxWidth: 480,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: '32px 16px 28px',
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

      {/* ── Form card ── */}
      <form onSubmit={handleLogin} style={{ width: '100%', maxWidth: 480, padding: '0 16px' }}>
        <div style={{ background: 'white', borderRadius: 12, overflow: 'hidden', marginBottom: 20 }}>
          <FormRow
            label="邮箱" type="email" placeholder="your@email.com"
            value={email} onChange={(v) => { setEmail(v); clearPendingVerification(); }}
            autoFocus
          />
          <FormRow
            label="密码" type="password" placeholder="请输入密码"
            value={password} onChange={setPassword}
            isLast
          />
        </div>

        {/* Error state */}
        {error && !isUnverified && (
          <div style={{
            background: 'white', borderRadius: 12, padding: '12px 16px',
            marginBottom: 16,
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <span style={{ fontSize: 20 }}>⚠️</span>
            <p style={{ fontSize: 14, color: '#ff3b30', margin: 0 }}>{error}</p>
          </div>
        )}

        {/* Unverified email */}
        {isUnverified && (
          <div style={{
            background: 'white', borderRadius: 12, padding: '16px',
            marginBottom: 16, borderLeft: '3px solid #ff9500',
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
              <span style={{ fontSize: 22, lineHeight: 1 }}>📧</span>
              <div>
                <p style={{ fontSize: 14, fontWeight: 600, color: '#000', margin: '0 0 4px' }}>
                  邮箱尚未验证
                </p>
                <p style={{ fontSize: 13, color: '#8e8e93', margin: 0, lineHeight: 1.5 }}>
                  验证邮件已发送至 <strong style={{ color: '#000' }}>{pendingVerificationEmail}</strong>，请检查收件箱（或垃圾邮件文件夹）并点击链接完成验证。
                </p>
              </div>
            </div>
            <button
              type="button" onClick={handleResend}
              disabled={resendCooldown > 0}
              style={{
                background: resendCooldown > 0 ? '#f2f2f7' : '#007aff',
                border: 'none', borderRadius: 8,
                padding: '8px 14px',
                color: resendCooldown > 0 ? '#8e8e93' : 'white',
                fontSize: 14, fontWeight: 500,
                cursor: resendCooldown > 0 ? 'default' : 'pointer',
                WebkitTapHighlightColor: 'transparent',
                transition: 'background 0.15s',
              }}
            >{resendCooldown > 0 ? `重新发送 (${resendCooldown}s)` : '重新发送验证邮件'}</button>
            {resendStatus && (
              <p style={{ fontSize: 13, color: '#8e8e93', marginTop: 8, marginBottom: 0 }}>{resendStatus}</p>
            )}
          </div>
        )}

        {/* Auto-login toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 4px', marginBottom: 16 }}>
          <div
            onClick={() => setRememberCredentials(!rememberCredentials)}
            style={{
              width: 44, height: 26,
              borderRadius: 13,
              background: rememberCredentials ? '#34c759' : '#d1d1d6',
              position: 'relative',
              cursor: 'pointer',
              transition: 'background 0.2s',
              flexShrink: 0,
            }}
          >
            <div style={{
              position: 'absolute',
              top: 2, left: rememberCredentials ? 20 : 2,
              width: 22, height: 22,
              borderRadius: '50%',
              background: 'white',
              boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
              transition: 'left 0.2s',
            }} />
          </div>
          <label
            onClick={() => setRememberCredentials(!rememberCredentials)}
            style={{ fontSize: 14, color: '#3c3c43', cursor: 'pointer', userSelect: 'none' }}
          >
            记住账号和密码
          </label>
        </div>

        {/* Login button */}
        <button
          type="submit"
          disabled={isLoading}
          style={{
            width: '100%', height: 50,
            background: isLoading ? '#c7c7cc' : '#007aff',
            color: 'white', border: 'none', borderRadius: 12,
            fontSize: 17, fontWeight: 600,
            cursor: isLoading ? 'default' : 'pointer',
            transition: 'background 0.15s, transform 0.1s',
            WebkitTapHighlightColor: 'transparent',
            marginBottom: 12,
          }}
        >
          {isLoading ? '登录中…' : '登录'}
        </button>

        {/* Register link */}
        <p style={{ textAlign: 'center', fontSize: 14, color: '#8e8e93', margin: '0 0 24px' }}>
          还没有账号？{' '}
          <a href="/register" style={{ color: '#007aff', textDecoration: 'none', fontWeight: 600 }}>
            立即注册
          </a>
        </p>

        {/* Terms */}
        <p style={{ textAlign: 'center', fontSize: 12, color: '#aeaeb2', marginTop: 24, lineHeight: 1.6 }}>
          登录即表示同意{' '}
          <a href="/terms" style={{ color: '#8e8e93', textDecoration: 'none' }}>服务条款</a>
          {' '}与{' '}
          <a href="/privacy" style={{ color: '#8e8e93', textDecoration: 'none' }}>隐私政策</a>
        </p>
      </form>
    </div>
  );
}
