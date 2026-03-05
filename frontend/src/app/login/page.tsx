'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/store';
import { resendVerification } from '@/lib/api';

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || '财财技术洞见';

export default function LoginPage() {
  const router = useRouter();
  const { login, isLoading, error, pendingVerificationEmail, clearPendingVerification } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [resendStatus, setResendStatus] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setResendStatus('');
    try {
      await login({ email, password });
      router.push('/');
    } catch (err) {
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
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)',
      padding: '1rem',
    }}>
      <div className="card" style={{ width: '100%', maxWidth: '400px' }}>
        <div className="text-center mb-3">
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📈</div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '0.25rem' }}>
            {APP_NAME}
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: '0.875rem' }}>
            AI 驱动的专业技术分析平台
          </p>
        </div>

        <form onSubmit={handleLogin}>
          <div className="form-group">
            <label className="label">邮箱</label>
            <input
              type="email"
              className="input"
              placeholder="请输入邮箱"
              value={email}
              onChange={(e) => { setEmail(e.target.value); clearPendingVerification(); }}
              required
            />
          </div>
          <div className="form-group" style={{ marginTop: '0.75rem' }}>
            <label className="label">密码</label>
            <input
              type="password"
              className="input"
              placeholder="请输入密码"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {error && (
            <div className="error" style={{ marginTop: '0.75rem' }}>
              ⚠️ {error}
            </div>
          )}

          {isUnverified && (
            <div style={{
              marginTop: '0.75rem',
              padding: '0.75rem',
              background: '#fffbeb',
              border: '1px solid #f59e0b',
              borderRadius: '6px',
              fontSize: '0.875rem',
            }}>
              <p style={{ color: '#92400e', marginBottom: '0.5rem' }}>
                邮箱 <strong>{pendingVerificationEmail}</strong> 尚未验证。
              </p>
              <button
                type="button"
                onClick={handleResend}
                style={{
                  background: 'none', border: 'none', padding: 0,
                  color: '#d97706', textDecoration: 'underline', cursor: 'pointer',
                  fontSize: '0.875rem',
                }}
              >
                重新发送验证邮件
              </button>
              {resendStatus && (
                <p style={{ color: '#6b7280', marginTop: '0.25rem' }}>{resendStatus}</p>
              )}
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary"
            disabled={isLoading}
            style={{ width: '100%', marginTop: '1rem' }}
          >
            {isLoading ? '登录中...' : '登录'}
          </button>
        </form>

        <div className="text-center mt-3" style={{ fontSize: '0.875rem', color: 'var(--muted)' }}>
          <p>
            还没有账号？{' '}
            <a href="/register" style={{ color: 'var(--primary)', textDecoration: 'none', fontWeight: '600' }}>
              立即注册
            </a>
          </p>
          <p style={{ marginTop: '0.5rem' }}>
            注册即表示同意我们的{' '}
            <a href="/terms" style={{ color: 'var(--primary)', textDecoration: 'none' }}>服务条款</a>
            {' '}与{' '}
            <a href="/privacy" style={{ color: 'var(--primary)', textDecoration: 'none' }}>隐私政策</a>
          </p>
        </div>

        <div className="text-center" style={{ margin: '1rem 0 0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--muted)', fontSize: '0.8rem' }}>
            <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
            <span>或</span>
            <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
          </div>
          <a
            href="/"
            style={{
              display: 'block',
              marginTop: '0.75rem',
              padding: '0.6rem',
              borderRadius: '6px',
              border: '1px solid var(--border)',
              color: 'var(--muted)',
              fontSize: '0.875rem',
              textDecoration: 'none',
              textAlign: 'center',
            }}
          >
            游客体验（免费 · 每天 1 次 · 仅 A股）
          </a>
        </div>

        {/* Subscription Tiers */}
        <div className="mt-4">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: '600' }}>订阅套餐</h3>
            <a
              href="/upgrade"
              style={{ fontSize: '0.875rem', color: 'var(--primary)', textDecoration: 'none', fontWeight: '500' }}
            >
              查看详情 →
            </a>
          </div>
          <div className="pricing-grid">
            <div className="card" style={{ padding: '1rem', textAlign: 'center', border: '1px solid var(--border)' }}>
              <span className="badge badge-free">免费版</span>
              <p style={{ fontSize: '0.8rem', marginTop: '0.5rem', color: 'var(--muted)' }}>¥0 · 每天 1 次</p>
              <p style={{ fontSize: '0.75rem', marginTop: '0.25rem', color: 'var(--muted)' }}>A股分析</p>
            </div>
            <div className="card" style={{ padding: '1rem', textAlign: 'center', border: '2px solid #f59e0b' }}>
              <span className="badge badge-basic">基础版</span>
              <p style={{ fontSize: '0.8rem', marginTop: '0.5rem', color: 'var(--muted)' }}>¥9/月 · 每天 5 次</p>
              <p style={{ fontSize: '0.75rem', marginTop: '0.25rem', color: '#92400e' }}>全市场 + 多周期</p>
            </div>
            <div className="card" style={{ padding: '1rem', textAlign: 'center', border: '1px solid #8b5cf6' }}>
              <span className="badge badge-premium">高级版</span>
              <p style={{ fontSize: '0.8rem', marginTop: '0.5rem', color: 'var(--muted)' }}>¥19/月 · 每天 15 次</p>
              <p style={{ fontSize: '0.75rem', marginTop: '0.25rem', color: '#5b21b6' }}>持仓分析 + 优先</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
