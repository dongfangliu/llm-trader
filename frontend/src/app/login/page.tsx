'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/store';
import { resendVerification, getAppConfig } from '@/lib/api';

/* ─── Reusable iOS form-group row ─── */
function FormRow({
  label, type, placeholder, value, onChange, autoFocus, isLast,
}: {
  label: string; type: string; placeholder: string;
  value: string; onChange: (v: string) => void;
  autoFocus?: boolean; isLast?: boolean;
}) {
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
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoFocus={autoFocus}
        autoComplete={type === 'email' ? 'email' : type === 'password' ? 'current-password' : 'off'}
        style={{
          flex: 1, border: 'none', outline: 'none', background: 'transparent',
          fontSize: 15, color: '#000', padding: '10px 0',
        }}
      />
    </div>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const { login, isLoading, error, pendingVerificationEmail, clearPendingVerification } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [resendStatus, setResendStatus] = useState('');
  const [appName, setAppName] = useState('');

  useEffect(() => {
    getAppConfig().then((cfg) => { if (cfg?.app_name) setAppName(cfg.app_name); }).catch(() => {});
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setResendStatus('');
    try {
      await login({ email, password });
      router.push('/');
    } catch {
      // Error handled in store
    }
  };

  const handleResend = async () => {
    setResendStatus('发送中...');
    try {
      await resendVerification(pendingVerificationEmail || email);
      setResendStatus('验证邮件已重新发送，请查收');
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
      padding: '0 0 40px',
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
        {/* Section label */}
        <p style={{ fontSize: 12, fontWeight: 600, color: '#8e8e93', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '0 4px', marginBottom: 8 }}>
          账号登录
        </p>
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
            background: 'white', borderRadius: 12, padding: '14px 16px',
            marginBottom: 16, borderLeft: '3px solid #ff9500',
          }}>
            <p style={{ fontSize: 14, color: '#000', marginBottom: 8 }}>
              <strong>{pendingVerificationEmail}</strong> 尚未验证邮箱
            </p>
            <button
              type="button" onClick={handleResend}
              style={{
                background: 'none', border: 'none', padding: 0,
                color: '#007aff', fontSize: 14, cursor: 'pointer',
                WebkitTapHighlightColor: 'transparent',
              }}
            >重新发送验证邮件</button>
            {resendStatus && (
              <p style={{ fontSize: 13, color: '#8e8e93', marginTop: 6 }}>{resendStatus}</p>
            )}
          </div>
        )}

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
