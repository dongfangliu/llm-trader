'use client';

import { useEffect, useState, useCallback } from 'react';
import { adminGetUsers, adminUpdateUser, adminDeleteUser, AdminUser } from '@/lib/api';

const TIER_BADGE: Record<string, string> = { free: 'badge-free', basic: 'badge-basic', premium: 'badge-premium' };
const TIER_LABEL: Record<string, string> = { free: '免费版', basic: '标准版', premium: '专业版' };

function TierSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select className="select" value={value} onChange={(e) => onChange(e.target.value)}
      style={{ padding: '0.375rem 0.5rem', fontSize: '0.875rem' }}>
      <option value="free">免费版</option>
      <option value="basic">标准版</option>
      <option value="premium">专业版</option>
    </select>
  );
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState<number | null>(null);
  const [editTier, setEditTier] = useState<Record<number, string>>({});
  const [msg, setMsg] = useState('');

  const PAGE_SIZE = 20;

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await adminGetUsers({ search: search || undefined, tier: tierFilter || undefined, page, page_size: PAGE_SIZE });
      setUsers(res.items);
      setTotal(res.total);
      // Init edit tier from current data
      const map: Record<number, string> = {};
      res.items.forEach((u) => { map[u.id] = u.subscription_tier; });
      setEditTier(map);
    } catch {
      setError('加载失败，请检查 Admin Token');
    } finally {
      setLoading(false);
    }
  }, [search, tierFilter, page]);

  useEffect(() => { load(); }, [load]);

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 2500); };

  const handleUpdate = async (userId: number, data: Parameters<typeof adminUpdateUser>[1]) => {
    setSaving(userId);
    try {
      const updated = await adminUpdateUser(userId, data);
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, ...updated } : u));
      flash('✓ 已保存');
    } catch {
      flash('❌ 保存失败');
    } finally {
      setSaving(null);
    }
  };

  const handleDelete = async (user: AdminUser) => {
    if (!confirm(`确定删除用户 ${user.email}？此操作不可撤销。`)) return;
    setSaving(user.id);
    try {
      await adminDeleteUser(user.id);
      setUsers((prev) => prev.filter((u) => u.id !== user.id));
      setTotal((t) => t - 1);
      flash('✓ 已删除');
    } catch {
      flash('❌ 删除失败');
    } finally {
      setSaving(null);
    }
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>用户管理</h1>
          <p style={{ color: 'var(--muted)', fontSize: '0.875rem' }}>共 {total} 位注册用户</p>
        </div>
        {msg && <span style={{ color: msg.startsWith('✓') ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>{msg}</span>}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <input className="input" placeholder="搜索邮箱 / 用户名"
          value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          style={{ maxWidth: '260px' }} />
        <select className="select" value={tierFilter} onChange={(e) => { setTierFilter(e.target.value); setPage(1); }}
          style={{ maxWidth: '140px' }}>
          <option value="">全部等级</option>
          <option value="free">免费版</option>
          <option value="basic">标准版</option>
          <option value="premium">专业版</option>
        </select>
        <button className="btn btn-secondary" onClick={load} style={{ padding: '0.5rem 1rem' }}>刷新</button>
      </div>

      {error && <div className="error" style={{ marginBottom: '1rem' }}>{error}</div>}

      {loading ? (
        <div style={{ textAlign: 'center', paddingTop: '3rem' }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid var(--border)' }}>
                  {['ID', '邮箱', '用户名', '等级', '今日用量', '奖励额度', '邀请码', '最后使用', '状态', '注册时间', '操作'].map((h) => (
                    <th key={h} style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600, whiteSpace: 'nowrap', color: 'var(--foreground)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.length === 0 && (
                  <tr><td colSpan={11} style={{ textAlign: 'center', padding: '2rem', color: 'var(--muted)' }}>暂无数据</td></tr>
                )}
                {users.map((user) => (
                  <tr key={user.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '0.75rem 1rem', color: 'var(--muted)' }}>{user.id}</td>
                    <td style={{ padding: '0.75rem 1rem', fontWeight: 500 }}>{user.email}</td>
                    <td style={{ padding: '0.75rem 1rem', color: 'var(--muted)' }}>{user.username || '—'}</td>
                    <td style={{ padding: '0.75rem 1rem', minWidth: '120px' }}>
                      <TierSelect
                        value={editTier[user.id] ?? user.subscription_tier}
                        onChange={(v) => setEditTier((prev) => ({ ...prev, [user.id]: v }))}
                      />
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>{user.daily_usage}</td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'center', color: user.bonus_quota > 0 ? '#7c3aed' : 'var(--muted)' }}>
                      {user.bonus_quota}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--muted)', letterSpacing: '0.05em' }}>
                      {user.invite_code || '—'}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                      {user.last_usage_date ? user.last_usage_date.slice(0, 10) : '—'}
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <span style={{
                        display: 'inline-block', padding: '0.2rem 0.6rem', borderRadius: '99px',
                        fontSize: '0.75rem', fontWeight: 500,
                        background: user.is_active ? '#dcfce7' : '#fee2e2',
                        color: user.is_active ? '#166534' : '#991b1b',
                      }}>
                        {user.is_active ? '正常' : '已禁用'}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                      {user.created_at ? user.created_at.slice(0, 10) : '—'}
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'nowrap' }}>
                        {/* Save tier */}
                        {(editTier[user.id] ?? user.subscription_tier) !== user.subscription_tier && (
                          <button className="btn btn-primary"
                            style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                            disabled={saving === user.id}
                            onClick={() => handleUpdate(user.id, { subscription_tier: editTier[user.id] })}>
                            保存
                          </button>
                        )}
                        {/* Toggle active */}
                        <button
                          className={`btn ${user.is_active ? 'btn-secondary' : 'btn-success'}`}
                          style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                          disabled={saving === user.id}
                          onClick={() => handleUpdate(user.id, { is_active: !user.is_active })}>
                          {user.is_active ? '禁用' : '启用'}
                        </button>
                        {/* Reset usage */}
                        <button className="btn"
                          style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', background: '#e2e8f0', color: '#475569' }}
                          disabled={saving === user.id}
                          onClick={() => handleUpdate(user.id, { reset_usage: true })}>
                          重置用量
                        </button>
                        {/* Delete */}
                        <button className="btn btn-danger"
                          style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                          disabled={saving === user.id}
                          onClick={() => handleDelete(user)}>
                          删除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginTop: '1rem' }}>
          <button className="btn btn-secondary" style={{ padding: '0.4rem 0.75rem', fontSize: '0.875rem' }}
            disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>上一页</button>
          <span style={{ lineHeight: '2.25rem', fontSize: '0.875rem', color: 'var(--muted)' }}>
            {page} / {totalPages}
          </span>
          <button className="btn btn-secondary" style={{ padding: '0.4rem 0.75rem', fontSize: '0.875rem' }}
            disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>下一页</button>
        </div>
      )}
    </div>
  );
}
