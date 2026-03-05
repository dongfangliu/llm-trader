'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { verifyEmail } from '@/lib/api';

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token') || '';

  const [status, setStatus] = useState<'loading' | 'success' | 'already' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('缺少验证 token，请检查邮件中的链接是否完整。');
      return;
    }

    verifyEmail(token)
      .then((res) => {
        if (res.already_verified) {
          setStatus('already');
        } else {
          setStatus('success');
        }
        setMessage(res.message);
      })
      .catch((err) => {
        setStatus('error');
        setMessage(err.response?.data?.detail || '验证失败，链接可能已过期，请重新发送验证邮件。');
      });
  }, [token]);

  const icon = status === 'loading' ? '⏳' : status === 'success' ? '✅' : status === 'already' ? '✅' : '❌';
  const title =
    status === 'loading' ? '验证中...' :
    status === 'success' ? '邮箱验证成功！' :
    status === 'already' ? '邮箱已验证' :
    '验证失败';

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
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>{icon}</div>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 'bold', marginBottom: '0.75rem' }}>{title}</h2>
        {message && (
          <p style={{ color: 'var(--muted)', lineHeight: '1.7', marginBottom: '1.5rem' }}>{message}</p>
        )}
        {status === 'loading' && (
          <p style={{ color: 'var(--muted)' }}>请稍候…</p>
        )}
        {(status === 'success' || status === 'already') && (
          <button
            className="btn btn-primary"
            style={{ width: '100%' }}
            onClick={() => router.push('/login')}
          >
            前往登录
          </button>
        )}
        {status === 'error' && (
          <div>
            <button
              className="btn"
              style={{ width: '100%', marginBottom: '0.75rem' }}
              onClick={() => router.push('/register')}
            >
              返回注册页重新发送
            </button>
            <button
              className="btn"
              style={{ width: '100%' }}
              onClick={() => router.push('/login')}
            >
              前往登录
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyEmailContent />
    </Suspense>
  );
}
