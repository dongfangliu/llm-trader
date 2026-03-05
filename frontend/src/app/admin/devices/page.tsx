'use client';

import { useEffect, useState, useCallback } from 'react';
import { adminGetDevices, adminSetDeviceSubscription, adminDeleteDevice, AdminDevice } from '@/lib/api';

const TIER_BADGE: Record<string, string> = { free: 'badge-free', basic: 'badge-basic', premium: 'badge-premium' };
const TIER_LABEL: Record<string, string> = { free: '免费版', basic: '标准版', premium: '专业版' };

export default function AdminDevicesPage() {
  const [devices, setDevices] = useState<AdminDevice[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState<string | null>(null);
  const [editTier, setEditTier] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState('');

  // Add device manually
  const [showAdd, setShowAdd] = useState(false);
  const [newDeviceId, setNewDeviceId] = useState('');
  const [newTier, setNewTier] = useState('basic');

  const PAGE_SIZE = 20;

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await adminGetDevices({ search: search || undefined, tier: tierFilter || undefined, page, page_size: PAGE_SIZE });
      setDevices(res.items);
      setTotal(res.total);
      const map: Record<string, string> = {};
      res.items.forEach((d) => { map[d.device_id] = d.subscription_tier; });
      setEditTier(map);
    } catch {
      setError('加载失败，请检查 Admin Token');
    } finally {
      setLoading(false);
    }
  }, [search, tierFilter, page]);

  useEffect(() => { load(); }, [load]);

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 2500); };

  const handleSaveTier = async (device_id: string, tier: string) => {
    setSaving(device_id);
    try {
      await adminSetDeviceSubscription(device_id, tier);
      setDevices((prev) => prev.map((d) => d.device_id === device_id ? { ...d, subscription_tier: tier as AdminDevice['subscription_tier'] } : d));
      flash('✓ 已保存');
    } catch {
      flash('❌ 保存失败');
    } finally {
      setSaving(null);
    }
  };

  const handleDelete = async (device_id: string) => {
    if (!confirm(`确定删除设备 ${device_id}？`)) return;
    setSaving(device_id);
    try {
      await adminDeleteDevice(device_id);
      setDevices((prev) => prev.filter((d) => d.device_id !== device_id));
      setTotal((t) => t - 1);
      flash('✓ 已删除');
    } catch {
      flash('❌ 删除失败');
    } finally {
      setSaving(null);
    }
  };

  const handleAddDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDeviceId.trim()) return;
    setSaving(newDeviceId);
    try {
      await adminSetDeviceSubscription(newDeviceId.trim(), newTier);
      flash('✓ 已添加');
      setNewDeviceId('');
      setShowAdd(false);
      await load();
    } catch {
      flash('❌ 添加失败');
    } finally {
      setSaving(null);
    }
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>设备管理</h1>
          <p style={{ color: 'var(--muted)', fontSize: '0.875rem' }}>共 {total} 台设备</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {msg && <span style={{ color: msg.startsWith('✓') ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>{msg}</span>}
          <button className="btn btn-primary" onClick={() => setShowAdd(!showAdd)}
            style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}>
            {showAdd ? '取消' : '+ 添加设备'}
          </button>
        </div>
      </div>

      {/* Add device form */}
      {showAdd && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <h3 style={{ fontSize: '0.9375rem', fontWeight: 600, marginBottom: '0.75rem' }}>手动添加 / 设置设备订阅</h3>
          <form onSubmit={handleAddDevice} style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ flex: '1', minWidth: '200px' }}>
              <label className="label">设备 ID</label>
              <input className="input" placeholder="device_id（UUID 或自定义）"
                value={newDeviceId} onChange={(e) => setNewDeviceId(e.target.value)} required />
            </div>
            <div style={{ minWidth: '140px' }}>
              <label className="label">等级</label>
              <select className="select" value={newTier} onChange={(e) => setNewTier(e.target.value)}>
                <option value="free">免费版</option>
                <option value="basic">标准版</option>
                <option value="premium">专业版</option>
              </select>
            </div>
            <button type="submit" className="btn btn-primary" style={{ padding: '0.75rem 1.25rem' }}>确认</button>
          </form>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <input className="input" placeholder="搜索设备 ID"
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
                  {['设备 ID', '当前等级', '创建时间', '更新时间', '操作'].map((h) => (
                    <th key={h} style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {devices.length === 0 && (
                  <tr><td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: 'var(--muted)' }}>暂无数据</td></tr>
                )}
                {devices.map((device) => (
                  <tr key={device.device_id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace', fontSize: '0.8125rem' }}>{device.device_id}</td>
                    <td style={{ padding: '0.75rem 1rem', minWidth: '130px' }}>
                      <select className="select"
                        value={editTier[device.device_id] ?? device.subscription_tier}
                        onChange={(e) => setEditTier((prev) => ({ ...prev, [device.device_id]: e.target.value }))}
                        style={{ padding: '0.375rem 0.5rem', fontSize: '0.875rem' }}>
                        <option value="free">免费版</option>
                        <option value="basic">标准版</option>
                        <option value="premium">专业版</option>
                      </select>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                      {device.created_at ? device.created_at.slice(0, 10) : '—'}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                      {device.updated_at ? device.updated_at.slice(0, 10) : '—'}
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <div style={{ display: 'flex', gap: '0.375rem' }}>
                        {(editTier[device.device_id] ?? device.subscription_tier) !== device.subscription_tier && (
                          <button className="btn btn-primary"
                            style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                            disabled={saving === device.device_id}
                            onClick={() => handleSaveTier(device.device_id, editTier[device.device_id])}>
                            保存
                          </button>
                        )}
                        <button className="btn btn-danger"
                          style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                          disabled={saving === device.device_id}
                          onClick={() => handleDelete(device.device_id)}>
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
