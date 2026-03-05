'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { adminGetStats } from '@/lib/api';

export default function AdminLoginPage() {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token.trim()) return;
    setLoading(true);
    setError('');
    try {
      localStorage.setItem('adminToken', token.trim());
      // Verify the token by calling a protected endpoint
      await adminGetStats();
      router.replace('/admin/dashboard');
    } catch {
      localStorage.removeItem('adminToken');
      setError('Token 无效，请检查 ADMIN_TOKEN 配置');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
    }}>
      <div className="card" style={{ width: '100%', maxWidth: '380px' }}>
        <div className="text-center mb-3">
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>⚙️</div>
          <h1 style={{ fontSize: '1.375rem', fontWeight: 700 }}>Admin 后台</h1>
          <p style={{ color: 'var(--muted)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
            输入管理员 Token 登录
          </p>
        </div>
        <form onSubmit={handleLogin}>
          <div className="form-group">
            <label className="label">Admin Token</label>
            <input
              type="password"
              className="input"
              placeholder="输入 ADMIN_TOKEN"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              autoComplete="off"
              required
            />
          </div>
          {error && <div className="error" style={{ marginTop: '0.5rem' }}>{error}</div>}
          <button type="submit" className="btn btn-primary" disabled={loading}
            style={{ width: '100%', marginTop: '1rem' }}>
            {loading ? '验证中...' : '登录'}
          </button>
        </form>
      </div>
    </div>
  );
}
