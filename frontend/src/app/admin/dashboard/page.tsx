'use client';

import { useEffect, useState } from 'react';
import { adminGetStats, AdminStats } from '@/lib/api';

const TIER_LABELS: Record<string, string> = { free: '免费版', basic: '标准版', premium: '专业版' };
const TIER_BADGE: Record<string, string> = { free: 'badge-free', basic: 'badge-basic', premium: 'badge-premium' };

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="card" style={{ textAlign: 'center' }}>
      <div style={{ fontSize: '0.875rem', color: 'var(--muted)', marginBottom: '0.5rem' }}>{label}</div>
      <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--foreground)' }}>{value}</div>
      {sub && <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: '0.25rem' }}>{sub}</div>}
    </div>
  );
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      setStats(await adminGetStats());
      setError('');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '加载失败';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (loading) return <div style={{ textAlign: 'center', paddingTop: '4rem' }}><div className="spinner" style={{ margin: '0 auto' }} /></div>;
  if (error) return <div className="error">{error}</div>;
  if (!stats) return null;

  const totalDevices = Object.values(stats.tier_distribution).reduce((a, b) => a + b, 0);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>数据看板</h1>
          <p style={{ color: 'var(--muted)', fontSize: '0.875rem' }}>{stats.date}</p>
        </div>
        <button className="btn btn-secondary" onClick={load} style={{ padding: '0.5rem 1rem' }}>刷新</button>
      </div>

      {/* Stats row */}
      <div className="grid grid-3" style={{ marginBottom: '1.5rem' }}>
        <StatCard label="今日活跃设备" value={stats.active_devices_today} />
        <StatCard label="今日请求总量" value={stats.total_requests_today} />
        <StatCard label="24h 分析次数" value={stats.analysis_last_24h} />
      </div>

      {/* Tier distribution */}
      <div className="card">
        <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>
          设备等级分布 <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: '0.875rem' }}>共 {totalDevices} 台</span>
        </h2>
        <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
          {(['free', 'basic', 'premium'] as const).map((tier) => {
            const count = stats.tier_distribution[tier] || 0;
            const pct = totalDevices > 0 ? Math.round((count / totalDevices) * 100) : 0;
            return (
              <div key={tier} style={{ flex: '1', minWidth: '100px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span className={`badge ${TIER_BADGE[tier]}`}>{TIER_LABELS[tier]}</span>
                  <span style={{ fontWeight: 600 }}>{count}</span>
                </div>
                <div style={{ height: '8px', background: '#e2e8f0', borderRadius: '99px', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: '99px', transition: 'width 0.4s',
                    width: `${pct}%`,
                    background: tier === 'free' ? '#94a3b8' : tier === 'basic' ? '#3b82f6' : '#f59e0b',
                  }} />
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: '0.25rem' }}>{pct}%</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Quick links */}
      <div className="grid grid-2" style={{ marginTop: '1.5rem' }}>
        <a href="/admin/users" className="card" style={{ textDecoration: 'none', color: 'inherit', cursor: 'pointer' }}>
          <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>👤</div>
          <div style={{ fontWeight: 600 }}>用户管理</div>
          <div style={{ fontSize: '0.875rem', color: 'var(--muted)', marginTop: '0.25rem' }}>查看、修改用户等级与状态</div>
        </a>
        <a href="/admin/devices" className="card" style={{ textDecoration: 'none', color: 'inherit', cursor: 'pointer' }}>
          <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>📱</div>
          <div style={{ fontWeight: 600 }}>设备管理</div>
          <div style={{ fontSize: '0.875rem', color: 'var(--muted)', marginTop: '0.25rem' }}>管理设备订阅等级</div>
        </a>
      </div>
    </div>
  );
}
