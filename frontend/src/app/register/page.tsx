'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/store';
import { resendVerification } from '@/lib/api';

export default function RegisterPage() {
  const router = useRouter();
  const { register, isLoading, error, pendingVerificationEmail, clearPendingVerification } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [localError, setLocalError] = useState('');
  const [resendStatus, setResendStatus] = useState('');
  const [registered, setRegistered] = useState(false);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError('');

    if (password !== confirmPassword) {
      setLocalError('两次密码输入不一致');
      return;
    }
    if (password.length < 6) {
      setLocalError('密码至少 6 位');
      return;
    }

    try {
      await register({ email, password });
      setRegistered(true);
    } catch (err) {
      // Error handled in store
    }
  };

  // If no email verification needed, redirect to login
  useEffect(() => {
    if (registered && !pendingVerificationEmail) {
      router.push('/login');
    }
  }, [registered, pendingVerificationEmail, router]);

  const handleResend = async () => {
    setResendStatus('发送中...');
    try {
      await resendVerification(pendingVerificationEmail || email);
      setResendStatus('验证邮件已重新发送，请查收');
    } catch {
      setResendStatus('发送失败，请稍后重试');
    }
  };

  // Show "check your email" screen after successful registration
  if (pendingVerificationEmail) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)',
        padding: '1rem',
      }}>
        <div className="card" style={{ width: '100%', maxWidth: '400px', textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📧</div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
            请验证您的邮箱
          </h2>
          <p style={{ color: 'var(--muted)', lineHeight: '1.7', marginBottom: '1.5rem' }}>
            验证邮件已发送至<br />
            <strong style={{ color: 'var(--foreground)' }}>{pendingVerificationEmail}</strong><br />
            请点击邮件中的链接完成激活。
          </p>
          <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: '1rem' }}>
            没有收到邮件？请检查垃圾邮件文件夹，或点击下方重新发送。
          </p>
          <button
            onClick={handleResend}
            className="btn"
            style={{ width: '100%', marginBottom: '0.75rem' }}
          >
            重新发送验证邮件
          </button>
          {resendStatus && (
            <p style={{ fontSize: '0.875rem', color: 'var(--muted)', marginBottom: '0.75rem' }}>
              {resendStatus}
            </p>
          )}
          <button
            onClick={() => { clearPendingVerification(); }}
            style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: '0.875rem' }}
          >
            返回注册页
          </button>
        </div>
      </div>
    );
  }

  const displayError = localError || error;

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
          <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
            创建账号
          </h1>
          <p style={{ color: 'var(--muted)' }}>
            注册后可跨设备使用，免费每天 3 次分析
          </p>
        </div>

        <form onSubmit={handleRegister}>
          <div className="form-group">
            <label className="label">邮箱</label>
            <input
              type="email"
              className="input"
              placeholder="请输入邮箱地址"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="form-group" style={{ marginTop: '0.75rem' }}>
            <label className="label">密码</label>
            <input
              type="password"
              className="input"
              placeholder="至少 6 位"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <div className="form-group" style={{ marginTop: '0.75rem' }}>
            <label className="label">确认密码</label>
            <input
              type="password"
              className="input"
              placeholder="再次输入密码"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>

          {displayError && (
            <div className="error" style={{ marginTop: '0.75rem' }}>{displayError}</div>
          )}

          <button
            type="submit"
            className="btn btn-primary"
            disabled={isLoading}
            style={{ width: '100%', marginTop: '1rem' }}
          >
            {isLoading ? '注册中...' : '立即注册'}
          </button>
        </form>

        <div className="text-center mt-3" style={{ fontSize: '0.875rem', color: 'var(--muted)' }}>
          <p>
            已有账号？{' '}
            <a href="/login" style={{ color: 'var(--primary)', textDecoration: 'none', fontWeight: '600' }}>
              直接登录
            </a>
          </p>
          <p style={{ marginTop: '0.5rem' }}>
            注册即表示同意我们的
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

        {/* Benefits */}
        <div className="mt-4" style={{
          background: 'var(--bg-secondary)',
          borderRadius: '8px',
          padding: '1rem',
          fontSize: '0.875rem',
        }}>
          <p style={{ fontWeight: '600', marginBottom: '0.5rem' }}>注册账号的好处：</p>
          <ul style={{ paddingLeft: '1.2rem', color: 'var(--muted)', lineHeight: '1.8' }}>
            <li>免费版每天 3 次分析（未注册仅 1 次）</li>
            <li>任意设备登录，数据不丢失</li>
            <li>查看历史分析记录</li>
            <li>可升级到付费套餐，<a href="/upgrade" style={{ color: 'var(--primary)', textDecoration: 'none' }}>查看套餐详情 →</a></li>
          </ul>
        </div>
      </div>
    </div>
  );
}
