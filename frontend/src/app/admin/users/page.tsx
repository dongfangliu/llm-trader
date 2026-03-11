'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  adminGetUsers, adminUpdateUser, adminSetUserQuota, adminDeleteUser, AdminUser,
  adminGetDevices, adminBanDevice, adminUnbanDevice, adminResetDeviceTrial, adminDeleteDevice,
  adminGetDeviceHistory, adminBatchDevices, AdminDevice, adminResetAll,
} from '@/lib/api';

type RowType = 'user' | 'device';

interface UnifiedRow {
  rowType: RowType;
  key: string;
  // user fields
  userId?: number;
  email?: string;
  username?: string;
  emailVerified?: boolean;
  hasHadProTrial: boolean;
  usedInviteCode?: string | null;
  subscriptionExpiresAt?: string | null;
  lastDeviceId?: string | null;
  // device fields
  deviceId?: string;
  // common
  subscriptionTier: string;
  isBanned: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  isActive?: boolean;
  dailyUsage?: number;
  dailyLimit?: number;
  dailyRemaining?: number;
  totalAvailable?: number;
  bonusQuota?: number;
  inviteCode?: string;
}

interface HistoryItem {
  id: number;
  symbol: string;
  market: string;
  period: string;
  analysis_date: string | null;
  analyzed_at: string | null;
}

const TIER_LABEL: Record<string, string> = { free: '免费版', basic: '标准版', premium: '专业版' };
const PAGE_SIZE = 20;

export default function AdminMembersPage() {
  const [rows, setRows] = useState<UnifiedRow[]>([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [totalDevices, setTotalDevices] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'users' | 'guests'>('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState<string | null>(null);

  // Bulk selection
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // History modal
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyTarget, setHistoryTarget] = useState<{ label: string; deviceId?: string } | null>(null);
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 3000); };

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const fetchUsers = typeFilter !== 'guests'
        ? adminGetUsers({ search: search || undefined, page, page_size: PAGE_SIZE })
        : Promise.resolve({ total: 0, items: [] as AdminUser[] });

      const fetchDevices = typeFilter !== 'users'
        ? adminGetDevices({ search: search || undefined, page, page_size: PAGE_SIZE })
        : Promise.resolve({ total: 0, items: [] as AdminDevice[] });

      const [usersRes, devicesRes] = await Promise.all([fetchUsers, fetchDevices]);
      setTotalUsers(usersRes.total);
      setTotalDevices(devicesRes.total);

      const userRows: UnifiedRow[] = usersRes.items.map((u) => ({
        rowType: 'user',
        key: `user_${u.id}`,
        userId: u.id,
        email: u.email,
        username: u.username || undefined,
        emailVerified: u.email_verified,
        hasHadProTrial: u.has_had_pro_trial ?? false,
        usedInviteCode: u.used_invite_code,
        subscriptionExpiresAt: (u as any).subscription_expires_at,
        lastDeviceId: (u as any).last_device_id,
        subscriptionTier: u.subscription_tier,
        isBanned: !u.is_active,
        createdAt: u.created_at,
        updatedAt: null,
        isActive: u.is_active,
        dailyUsage: u.daily_usage,
        dailyLimit: (u as any).daily_limit,
        dailyRemaining: (u as any).daily_remaining,
        totalAvailable: (u as any).total_available,
        bonusQuota: u.bonus_quota,
        inviteCode: u.invite_code || undefined,
      }));

      const deviceRows: UnifiedRow[] = devicesRes.items.map((d) => ({
        rowType: 'device',
        key: `device_${d.device_id}`,
        deviceId: d.device_id,
        subscriptionTier: d.subscription_tier,
        isBanned: d.is_banned,
        hasHadProTrial: d.has_had_pro_trial,
        createdAt: d.created_at,
        updatedAt: d.updated_at,
      }));

      setRows(typeFilter === 'users' ? userRows : typeFilter === 'guests' ? deviceRows : [...userRows, ...deviceRows]);
      setSelected(new Set());
    } catch {
      setError('加载失败，请检查 Admin Token');
    } finally {
      setLoading(false);
    }
  }, [search, typeFilter, page]);

  useEffect(() => { load(); }, [load]);

  const total = typeFilter === 'users' ? totalUsers : typeFilter === 'guests' ? totalDevices : totalUsers + totalDevices;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const toggleSelect = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === rows.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(rows.map((r) => r.key)));
    }
  };

  const handleBanUser = async (row: UnifiedRow) => {
    if (row.rowType !== 'user' || !row.userId) return;
    setSaving(row.key);
    try {
      await adminUpdateUser(row.userId, { is_active: false });
      setRows((prev) => prev.map((r) => r.key === row.key ? { ...r, isBanned: true, isActive: false } : r));
      flash('✓ 已封禁用户');
    } catch { flash('❌ 操作失败'); } finally { setSaving(null); }
  };

  const handleUnbanUser = async (row: UnifiedRow) => {
    if (row.rowType !== 'user' || !row.userId) return;
    setSaving(row.key);
    try {
      await adminUpdateUser(row.userId, { is_active: true });
      setRows((prev) => prev.map((r) => r.key === row.key ? { ...r, isBanned: false, isActive: true } : r));
      flash('✓ 已解封用户');
    } catch { flash('❌ 操作失败'); } finally { setSaving(null); }
  };

  const handleBanDevice = async (row: UnifiedRow) => {
    if (!row.deviceId) return;
    setSaving(row.key);
    try {
      await adminBanDevice(row.deviceId);
      setRows((prev) => prev.map((r) => r.key === row.key ? { ...r, isBanned: true } : r));
      flash('✓ 已封禁设备');
    } catch { flash('❌ 操作失败'); } finally { setSaving(null); }
  };

  const handleUnbanDevice = async (row: UnifiedRow) => {
    if (!row.deviceId) return;
    setSaving(row.key);
    try {
      await adminUnbanDevice(row.deviceId);
      setRows((prev) => prev.map((r) => r.key === row.key ? { ...r, isBanned: false } : r));
      flash('✓ 已解封设备');
    } catch { flash('❌ 操作失败'); } finally { setSaving(null); }
  };

  const handleResetTrial = async (row: UnifiedRow) => {
    if (!row.deviceId) return;
    setSaving(row.key);
    try {
      await adminResetDeviceTrial(row.deviceId);
      setRows((prev) => prev.map((r) => r.key === row.key ? { ...r, hasHadProTrial: false } : r));
      flash('✓ 已重置体验次数');
    } catch { flash('❌ 操作失败'); } finally { setSaving(null); }
  };

  const handleChangeTier = async (row: UnifiedRow, newTier: string) => {
    if (row.rowType !== 'user' || !row.userId) return;
    setSaving(row.key);
    try {
      await adminUpdateUser(row.userId, { subscription_tier: newTier });
      setRows((prev) => prev.map((r) => r.key === row.key ? { ...r, subscriptionTier: newTier } : r));
      flash(`✓ 已将订阅改为 ${TIER_LABEL[newTier] || newTier}`);
    } catch { flash('❌ 操作失败'); } finally { setSaving(null); }
  };

  const handleSetBonusQuota = async (row: UnifiedRow, newQuota: number) => {
    if (row.rowType !== 'user' || !row.userId) return;
    setSaving(row.key);
    try {
      await adminSetUserQuota(row.userId, { bonus_quota: newQuota });
      setRows((prev) => prev.map((r) => r.key === row.key ? { ...r, bonusQuota: newQuota } : r));
      flash(`✓ 已设置永久额度为 ${newQuota}`);
    } catch { flash('❌ 操作失败'); } finally { setSaving(null); }
  };

  const handleSetVerified = async (row: UnifiedRow, verified: boolean) => {
    if (row.rowType !== 'user' || !row.userId) return;
    setSaving(row.key);
    try {
      await adminUpdateUser(row.userId, { email_verified: verified });
      setRows((prev) => prev.map((r) => r.key === row.key ? { ...r, emailVerified: verified } : r));
      flash(verified ? '✓ 已设为已验证' : '✓ 已取消邮箱验证');
    } catch { flash('❌ 操作失败'); } finally { setSaving(null); }
  };

  const handleResetDailyUsage = async (row: UnifiedRow) => {
    if (row.rowType !== 'user' || !row.userId) return;
    setSaving(row.key);
    try {
      await adminSetUserQuota(row.userId, { daily_usage: 0 });
      setRows((prev) => prev.map((r) => r.key === row.key ? { ...r, dailyUsage: 0 } : r));
      flash('✓ 已重置今日用量');
    } catch { flash('❌ 操作失败'); } finally { setSaving(null); }
  };

  const handleDelete = async (row: UnifiedRow) => {
    const label = row.email || row.deviceId || row.key;
    if (!confirm(`确定删除 ${label}？此操作不可撤销。`)) return;
    setSaving(row.key);
    try {
      if (row.rowType === 'user' && row.userId) {
        await adminDeleteUser(row.userId);
      } else if (row.deviceId) {
        await adminDeleteDevice(row.deviceId);
      }
      setRows((prev) => prev.filter((r) => r.key !== row.key));
      flash('✓ 已删除');
    } catch { flash('❌ 删除失败'); } finally { setSaving(null); }
  };

  const handleViewHistory = async (row: UnifiedRow) => {
    if (row.rowType !== 'device' || !row.deviceId) return;
    setHistoryTarget({ label: row.deviceId, deviceId: row.deviceId });
    setHistoryOpen(true);
    setHistoryLoading(true);
    setHistoryItems([]);
    try {
      const res = await adminGetDeviceHistory(row.deviceId);
      setHistoryItems(res.items);
    } catch { setHistoryItems([]); } finally { setHistoryLoading(false); }
  };

  const selectedDeviceIds = rows
    .filter((r) => selected.has(r.key) && r.rowType === 'device' && r.deviceId)
    .map((r) => r.deviceId!);

  const handleBulkAction = async (action: string) => {
    if (selectedDeviceIds.length === 0) return;
    setSaving('bulk');
    try {
      const res = await adminBatchDevices(action, selectedDeviceIds);
      flash(`✓ 批量 ${action} 完成 (${res.affected} 台设备)`);
      await load();
    } catch { flash('❌ 批量操作失败'); } finally { setSaving(null); }
  };

  const handleResetAll = async () => {
    if (!confirm('此操作将永久删除所有用户、设备和历史记录，无法恢复。确认继续？')) return;
    setSaving('reset-all');
    try {
      await adminResetAll();
      flash('✓ 已清空全部数据');
    } catch {
      flash('❌ 清空失败');
    } finally {
      setSaving(null);
      await load();
    }
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>用户 &amp; 设备管理</h1>
          <p style={{ color: 'var(--muted)', fontSize: '0.875rem' }}>
            {totalUsers} 位注册用户 · {totalDevices} 台游客设备
          </p>
        </div>
        {msg && <span style={{ fontWeight: 600, color: msg.startsWith('✓') ? 'var(--success)' : 'var(--danger)' }}>{msg}</span>}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <input className="input" placeholder="搜索邮箱 / 用户名 / 设备ID"
          value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          style={{ maxWidth: '260px' }} />
        <select className="select" value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value as any); setPage(1); }}
          style={{ maxWidth: '140px' }}>
          <option value="all">全部</option>
          <option value="users">注册用户</option>
          <option value="guests">游客设备</option>
        </select>
        <button className="btn btn-secondary" onClick={load} style={{ padding: '0.5rem 1rem' }}>刷新</button>
        <button
          className="btn"
          onClick={handleResetAll}
          disabled={saving === 'reset-all'}
          style={{
            padding: '0.5rem 1rem',
            background: '#ef4444',
            color: '#fff',
            border: 'none',
          }}
        >
          {saving === 'reset-all' ? '清空中…' : '清空全部数据'}
        </button>
      </div>

      {error && <div className="error" style={{ marginBottom: '1rem' }}>{error}</div>}

      {/* Bulk toolbar */}
      {selected.size > 0 && (
        <div style={{
          position: 'sticky', top: 0, zIndex: 10,
          background: '#1e293b', color: '#f1f5f9',
          borderRadius: '0.5rem', padding: '0.75rem 1rem',
          display: 'flex', gap: '0.75rem', alignItems: 'center',
          marginBottom: '0.75rem',
        }}>
          <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>已选 {selected.size} 台设备</span>
          <button className="btn" style={{ padding: '0.3rem 0.75rem', fontSize: '0.8125rem', background: '#ef4444', color: '#fff', border: 'none' }}
            disabled={saving === 'bulk'} onClick={() => handleBulkAction('ban')}>封禁 ({selected.size})</button>
          <button className="btn" style={{ padding: '0.3rem 0.75rem', fontSize: '0.8125rem', background: '#22c55e', color: '#fff', border: 'none' }}
            disabled={saving === 'bulk'} onClick={() => handleBulkAction('unban')}>解封 ({selected.size})</button>
          <button className="btn" style={{ padding: '0.3rem 0.75rem', fontSize: '0.8125rem', background: '#94a3b8', color: '#fff', border: 'none' }}
            disabled={saving === 'bulk'} onClick={() => handleBulkAction('reset-trial')}>重置体验 ({selected.size})</button>
          <button className="btn" style={{ padding: '0.3rem 0.75rem', fontSize: '0.8125rem', background: '#dc2626', color: '#fff', border: 'none' }}
            disabled={saving === 'bulk'} onClick={() => handleBulkAction('delete')}>删除 ({selected.size})</button>
          <button onClick={() => setSelected(new Set())}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '1rem' }}>✕</button>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', paddingTop: '3rem' }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '0.75rem 1rem', width: '40px' }}>
                    <input type="checkbox"
                      checked={rows.length > 0 && selected.size === rows.length}
                      onChange={toggleSelectAll} />
                  </th>
                  {['用户/设备', '类型', '订阅', '今日/永久额度', '体验', '邀请', '状态', '注册时间', '操作'].map((h) => (
                    <th key={h} style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr><td colSpan={10} style={{ textAlign: 'center', padding: '2rem', color: 'var(--muted)' }}>暂无数据</td></tr>
                )}
                {rows.map((row) => (
                  <tr key={row.key} style={{ borderBottom: '1px solid var(--border)', background: row.isBanned ? '#fff5f5' : undefined }}>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      {row.rowType === 'device' && (
                        <input type="checkbox" checked={selected.has(row.key)} onChange={() => toggleSelect(row.key)} />
                      )}
                    </td>
                    {/* User/Device identifier */}
                    <td style={{ padding: '0.75rem 1rem', maxWidth: '200px' }}>
                      {row.rowType === 'user' ? (
                        <div>
                          <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {row.email}
                            {row.emailVerified === false && (
                              <span style={{ marginLeft: 4, fontSize: '0.7rem', color: '#f59e0b', fontWeight: 600 }}>未验证</span>
                            )}
                          </div>
                          {row.username && <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{row.username}</div>}
                          {row.lastDeviceId && (
                            <div style={{ fontSize: '0.7rem', color: '#94a3b8', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>
                              设备: {row.lastDeviceId}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {row.deviceId}
                        </div>
                      )}
                    </td>
                    {/* Account type */}
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <span style={{
                        display: 'inline-block', padding: '0.15rem 0.5rem', borderRadius: '99px', fontSize: '0.75rem', fontWeight: 500,
                        background: row.rowType === 'user' ? '#dbeafe' : '#f0fdf4',
                        color: row.rowType === 'user' ? '#1d4ed8' : '#15803d',
                      }}>
                        {row.rowType === 'user' ? '注册用户' : '未注册'}
                      </span>
                    </td>
                    {/* Subscription — users get inline dropdown */}
                    <td style={{ padding: '0.75rem 1rem' }}>
                      {row.rowType === 'user' ? (
                        <div>
                          <select
                            value={row.subscriptionTier}
                            disabled={saving === row.key}
                            onChange={(e) => handleChangeTier(row, e.target.value)}
                            style={{
                              fontSize: '0.75rem', fontWeight: 600, padding: '0.15rem 0.4rem',
                              borderRadius: '6px', border: '1px solid var(--border)',
                              background: row.subscriptionTier === 'premium' ? '#f3e8ff' : row.subscriptionTier === 'basic' ? '#fef3c7' : '#f1f5f9',
                              color: row.subscriptionTier === 'premium' ? '#7c3aed' : row.subscriptionTier === 'basic' ? '#92400e' : '#475569',
                              cursor: 'pointer',
                            }}
                          >
                            <option value="free">免费版</option>
                            <option value="basic">标准版</option>
                            <option value="premium">专业版</option>
                          </select>
                          {row.subscriptionExpiresAt && (
                            <div style={{ fontSize: '0.7rem', color: new Date(row.subscriptionExpiresAt) < new Date() ? '#ef4444' : '#22c55e', marginTop: 2 }}>
                              {new Date(row.subscriptionExpiresAt) < new Date() ? '已过期' : `至 ${row.subscriptionExpiresAt.slice(0, 10)}`}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span style={{
                          display: 'inline-block', padding: '0.15rem 0.5rem', borderRadius: '99px', fontSize: '0.75rem', fontWeight: 500,
                          background: row.subscriptionTier === 'premium' ? '#f3e8ff' : row.subscriptionTier === 'basic' ? '#fef3c7' : '#f1f5f9',
                          color: row.subscriptionTier === 'premium' ? '#7c3aed' : row.subscriptionTier === 'basic' ? '#92400e' : '#475569',
                        }}>
                          {TIER_LABEL[row.subscriptionTier] || row.subscriptionTier}
                        </span>
                      )}
                    </td>
                    {/* Daily usage / bonus quota */}
                    <td style={{ padding: '0.75rem 1rem', fontSize: '0.8125rem' }}>
                      {row.rowType === 'user' ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <span style={{ color: (row.dailyRemaining ?? 0) === 0 ? '#dc2626' : '#22c55e', fontWeight: 600 }}>
                            日剩余 {row.dailyRemaining ?? 0}/{row.dailyLimit ?? '—'}
                          </span>
                          <span style={{ color: 'var(--muted)', fontSize: '0.75rem' }}>
                            当前可用 {row.totalAvailable ?? 0}
                          </span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ color: 'var(--muted)', fontSize: '0.75rem' }}>永久:</span>
                            <input
                              type="number"
                              defaultValue={row.bonusQuota ?? 0}
                              min={0}
                              style={{ width: 52, fontSize: '0.75rem', padding: '1px 4px', borderRadius: 4, border: '1px solid var(--border)' }}
                              onBlur={(e) => {
                                const val = parseInt(e.target.value, 10);
                                if (!isNaN(val) && val >= 0 && val !== (row.bonusQuota ?? 0)) {
                                  handleSetBonusQuota(row, val);
                                }
                              }}
                            />
                          </div>
                        </div>
                      ) : (
                        <span style={{ color: 'var(--muted)', fontSize: '0.75rem' }}>—</span>
                      )}
                    </td>
                    {/* Trial status */}
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                      {row.hasHadProTrial ? '✅ 已用' : '⬜ 未用'}
                    </td>
                    {/* Invite code */}
                    <td style={{ padding: '0.75rem 1rem', fontSize: '0.75rem', color: 'var(--muted)' }}>
                      {row.rowType === 'user' ? (
                        <div>
                          <div style={{ fontFamily: 'monospace' }}>{row.inviteCode || '—'}</div>
                          {row.usedInviteCode && (
                            <div style={{ color: '#22c55e', fontSize: '0.7rem' }}>已邀请</div>
                          )}
                        </div>
                      ) : '—'}
                    </td>
                    {/* Status */}
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <span style={{
                        display: 'inline-block', padding: '0.15rem 0.5rem', borderRadius: '99px', fontSize: '0.75rem', fontWeight: 500,
                        background: row.isBanned ? '#fee2e2' : '#dcfce7',
                        color: row.isBanned ? '#991b1b' : '#166534',
                      }}>
                        {row.isBanned ? '🚫 封禁' : '✓ 正常'}
                      </span>
                    </td>
                    {/* Created at */}
                    <td style={{ padding: '0.75rem 1rem', color: 'var(--muted)', whiteSpace: 'nowrap', fontSize: '0.8125rem' }}>
                      {row.createdAt ? row.createdAt.slice(0, 10) : '—'}
                    </td>
                    {/* Actions */}
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'nowrap' }}>
                        {/* Ban / Unban */}
                        {row.isBanned ? (
                          <button className="btn"
                            style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', background: '#22c55e', color: '#fff', border: 'none' }}
                            disabled={saving === row.key}
                            onClick={() => row.rowType === 'user' ? handleUnbanUser(row) : handleUnbanDevice(row)}>
                            解封
                          </button>
                        ) : (
                          <button className="btn"
                            style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', background: '#f97316', color: '#fff', border: 'none' }}
                            disabled={saving === row.key}
                            onClick={() => row.rowType === 'user' ? handleBanUser(row) : handleBanDevice(row)}>
                            封禁
                          </button>
                        )}
                        {/* Verify / Unverify email (users only) */}
                        {row.rowType === 'user' && (
                          row.emailVerified ? (
                            <button className="btn"
                              style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', background: '#f59e0b', color: '#fff', border: 'none' }}
                              disabled={saving === row.key}
                              onClick={() => handleSetVerified(row, false)}>
                              取消验证
                            </button>
                          ) : (
                            <button className="btn"
                              style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', background: '#0ea5e9', color: '#fff', border: 'none' }}
                              disabled={saving === row.key}
                              onClick={() => handleSetVerified(row, true)}>
                              设为已验证
                            </button>
                          )
                        )}
                        {/* Reset daily usage (users only) */}
                        {row.rowType === 'user' && (row.dailyUsage ?? 0) > 0 && (
                          <button className="btn"
                            style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', background: '#6366f1', color: '#fff', border: 'none' }}
                            disabled={saving === row.key}
                            onClick={() => handleResetDailyUsage(row)}>
                            重置用量
                          </button>
                        )}
                        {/* Reset trial (devices only) */}
                        {row.rowType === 'device' && row.hasHadProTrial && (
                          <button className="btn"
                            style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', background: '#7c3aed', color: '#fff', border: 'none' }}
                            disabled={saving === row.key}
                            onClick={() => handleResetTrial(row)}>
                            重置体验
                          </button>
                        )}
                        {/* View history (devices only) */}
                        {row.rowType === 'device' && (
                          <button className="btn"
                            style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', background: '#e2e8f0', color: '#475569', border: 'none' }}
                            disabled={saving === row.key}
                            onClick={() => handleViewHistory(row)}>
                            历史
                          </button>
                        )}
                        {/* Delete */}
                        <button className="btn btn-danger"
                          style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                          disabled={saving === row.key}
                          onClick={() => handleDelete(row)}>
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
          <span style={{ lineHeight: '2.25rem', fontSize: '0.875rem', color: 'var(--muted)' }}>{page} / {totalPages}</span>
          <button className="btn btn-secondary" style={{ padding: '0.4rem 0.75rem', fontSize: '0.875rem' }}
            disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>下一页</button>
        </div>
      )}

      {/* History modal */}
      {historyOpen && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        }} onClick={() => setHistoryOpen(false)}>
          <div style={{
            background: '#fff', borderRadius: '1rem 1rem 0 0', padding: '1.5rem',
            width: '100%', maxWidth: '600px', maxHeight: '70vh', overflow: 'auto',
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ fontWeight: 700, fontSize: '1rem' }}>分析历史 — {historyTarget?.label?.slice(0, 20)}</h3>
              <button onClick={() => setHistoryOpen(false)} style={{ background: 'none', border: 'none', fontSize: '1.25rem', cursor: 'pointer', color: '#94a3b8' }}>✕</button>
            </div>
            {historyLoading ? (
              <div style={{ textAlign: 'center', padding: '2rem' }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
            ) : historyItems.length === 0 ? (
              <p style={{ color: 'var(--muted)', textAlign: 'center', padding: '1rem' }}>暂无历史记录</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['代码', '市场', '周期', '分析时间'].map((h) => (
                      <th key={h} style={{ padding: '0.5rem 0.75rem', textAlign: 'left', fontWeight: 600, color: 'var(--muted)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {historyItems.map((item) => (
                    <tr key={item.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '0.5rem 0.75rem', fontWeight: 500 }}>{item.symbol}</td>
                      <td style={{ padding: '0.5rem 0.75rem', color: 'var(--muted)' }}>{item.market}</td>
                      <td style={{ padding: '0.5rem 0.75rem', color: 'var(--muted)' }}>{item.period}</td>
                      <td style={{ padding: '0.5rem 0.75rem', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                        {item.analyzed_at ? item.analyzed_at.slice(0, 16).replace('T', ' ') : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
