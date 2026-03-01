'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/store';

export default function LoginPage() {
  const router = useRouter();
  const { login, isLoading, error } = useAuthStore();
  const [username, setUsername] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    // Keep a stable device id so login/会员等级 can persist on the same browser.
    let deviceId = localStorage.getItem('device_id');
    if (!deviceId) {
      deviceId = `${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
      localStorage.setItem('device_id', deviceId);
    }
    const openid = `device_${deviceId}`;

    try {
      await login({ openid, username: username || 'Anonymous' });
      router.push('/');
    } catch (err) {
      // Error is handled in store
    }
  };

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
            LLM 交易策略分析器
          </h1>
          <p style={{ color: 'var(--muted)' }}>
            登录后开始智能分析
          </p>
        </div>

        <form onSubmit={handleLogin}>
          <div className="form-group">
            <label className="label">用户名（可选）</label>
            <input
              type="text"
              className="input"
              placeholder="请输入用户名"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>

          {error && <div className="error">{error}</div>}

          <button
            type="submit"
            className="btn btn-primary"
            disabled={isLoading}
            style={{ width: '100%', marginTop: '1rem' }}
          >
            {isLoading ? '登录中...' : '微信一键登录'}
          </button>
        </form>

        <div className="text-center mt-3" style={{ fontSize: '0.875rem', color: 'var(--muted)' }}>
          <p>点击登录即表示同意我们的服务条款</p>
        </div>

        {/* Subscription Tiers */}
        <div className="mt-4">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: '600' }}>
              订阅套餐
            </h3>
            <a
              href="/upgrade"
              style={{ fontSize: '0.875rem', color: 'var(--primary)', textDecoration: 'none' }}
            >
              查看详情 →
            </a>
          </div>
          <div className="pricing-grid">
            <div className="card" style={{ padding: '1rem', textAlign: 'center' }}>
              <span className="badge badge-free">免费版</span>
              <p style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>每天 1 次</p>
            </div>
            <div className="card" style={{ padding: '1rem', textAlign: 'center' }}>
              <span className="badge badge-basic">基础版</span>
              <p style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>¥9/月<br />每天 5 次</p>
            </div>
            <div className="card" style={{ padding: '1rem', textAlign: 'center' }}>
              <span className="badge badge-premium">高级版</span>
              <p style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>¥19/月<br />每天 15 次</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
