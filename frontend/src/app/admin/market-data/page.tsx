'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  adminGetMarketDataStatus,
  adminTriggerRefresh,
  adminGetWatchlist,
  adminUpdateWatchlist,
  adminGetSymbolNames,
  adminRefreshNames,
  MarketDataStatus,
  MarketDataSymbolStatus,
  WatchlistEntry,
  SymbolNameItem,
  SymbolNamesResponse,
} from '@/lib/api';

// ── helpers ──────────────────────────────────────────────────────────────────

const MARKET_LABEL: Record<string, string> = { a: 'A股', hk: '港股', us: '美股', futures: '期货' };
const PERIOD_LABEL: Record<string, string> = {
  daily: '日线', '60': '60分', '30': '30分', '15': '15分', '5': '5分', '1': '1分',
};

function staleness(lastDate: string | null): 'empty' | 'stale' | 'ok' {
  if (!lastDate) return 'empty';
  const diff = Date.now() - new Date(lastDate).getTime();
  // > 3 days → stale for daily; anything > 2h could be stale for minute
  if (diff > 3 * 86400 * 1000) return 'stale';
  return 'ok';
}

function StatusBadge({ s }: { s: MarketDataSymbolStatus }) {
  const st = staleness(s.last_bar_date);
  const cfg: Record<string, { bg: string; color: string; label: string }> = {
    empty:  { bg: '#fee2e2', color: '#991b1b', label: '无数据' },
    stale:  { bg: '#fef3c7', color: '#92400e', label: '数据陈旧' },
    ok:     { bg: '#dcfce7', color: '#166534', label: '正常' },
  };
  const { bg, color, label } = cfg[st];
  return (
    <span style={{
      display: 'inline-block', padding: '0.15rem 0.55rem', borderRadius: '9999px',
      fontSize: '0.72rem', fontWeight: 600, background: bg, color,
    }}>{label}</span>
  );
}

// ── Watchlist editor ──────────────────────────────────────────────────────────

const BLANK_ENTRY: WatchlistEntry = { symbol: '', market: 'a', periods: ['daily'], adjust: 'qfq' };

function WatchlistEditor({
  initial,
  onSaved,
}: {
  initial: WatchlistEntry[];
  onSaved: (list: WatchlistEntry[]) => void;
}) {
  const [list, setList] = useState<WatchlistEntry[]>(initial);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  // new-row draft
  const [draft, setDraft] = useState<WatchlistEntry>({ ...BLANK_ENTRY });

  const update = (idx: number, patch: Partial<WatchlistEntry>) =>
    setList(l => l.map((e, i) => (i === idx ? { ...e, ...patch } : e)));

  const remove = (idx: number) => setList(l => l.filter((_, i) => i !== idx));

  const addRow = () => {
    if (!draft.symbol.trim()) { setMsg('请填写代码'); return; }
    setList(l => [...l, { ...draft, symbol: draft.symbol.trim().toUpperCase() }]);
    setDraft({ ...BLANK_ENTRY });
    setMsg('');
  };

  const save = async () => {
    setSaving(true);
    setMsg('');
    try {
      const res = await adminUpdateWatchlist(list);
      setMsg(`✅ 已保存 ${res.count} 条`);
      onSaved(list);
    } catch (e: unknown) {
      setMsg('❌ ' + (e instanceof Error ? e.message : '保存失败'));
    } finally {
      setSaving(false);
    }
  };

  const periodToggle = (entry: WatchlistEntry, p: string, idx: number) => {
    const next = entry.periods.includes(p)
      ? entry.periods.filter(x => x !== p)
      : [...entry.periods, p];
    update(idx, { periods: next.length ? next : ['daily'] });
  };

  const PERIODS = ['daily', '60', '30', '15', '5', '1'];

  const cellStyle: React.CSSProperties = {
    padding: '0.5rem 0.6rem', fontSize: '0.82rem', verticalAlign: 'middle',
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>📋 采集 Watchlist</h2>
        <button className="btn btn-primary" onClick={save} disabled={saving} style={{ minWidth: 90 }}>
          {saving ? '保存中…' : '💾 保存'}
        </button>
      </div>
      {msg && (
        <div style={{
          padding: '0.5rem 0.75rem', marginBottom: '0.75rem', borderRadius: '0.375rem',
          background: msg.startsWith('✅') ? '#dcfce7' : '#fee2e2',
          color: msg.startsWith('✅') ? '#166534' : '#991b1b', fontSize: '0.85rem',
        }}>{msg}</div>
      )}

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--border)', background: 'var(--muted-bg, #f8fafc)' }}>
              {['代码', '市场', '周期', '复权', ''].map(h => (
                <th key={h} style={{ ...cellStyle, fontWeight: 600, textAlign: 'left' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {list.map((entry, idx) => (
              <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={cellStyle}>
                  <input
                    value={entry.symbol}
                    onChange={e => update(idx, { symbol: e.target.value.toUpperCase() })}
                    style={{ width: 90, padding: '0.3rem 0.4rem', border: '1px solid var(--border)', borderRadius: 4, fontSize: '0.82rem', background: 'var(--background)', color: 'var(--foreground)' }}
                  />
                </td>
                <td style={cellStyle}>
                  <select
                    value={entry.market}
                    onChange={e => update(idx, { market: e.target.value })}
                    style={{ padding: '0.3rem 0.4rem', border: '1px solid var(--border)', borderRadius: 4, fontSize: '0.82rem', background: 'var(--background)', color: 'var(--foreground)' }}
                  >
                    {Object.entries(MARKET_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </td>
                <td style={cellStyle}>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {PERIODS.map(p => {
                      const active = entry.periods.includes(p);
                      return (
                        <button
                          key={p}
                          onClick={() => periodToggle(entry, p, idx)}
                          style={{
                            padding: '0.15rem 0.45rem', fontSize: '0.72rem', borderRadius: 4, cursor: 'pointer',
                            background: active ? '#3b82f6' : 'transparent',
                            color: active ? '#fff' : 'var(--muted)',
                            border: `1px solid ${active ? '#3b82f6' : 'var(--border)'}`,
                          }}
                        >{PERIOD_LABEL[p] ?? p}</button>
                      );
                    })}
                  </div>
                </td>
                <td style={cellStyle}>
                  {entry.market === 'a' || entry.market === 'hk' ? (
                    <select
                      value={entry.adjust ?? 'qfq'}
                      onChange={e => update(idx, { adjust: e.target.value })}
                      style={{ padding: '0.3rem 0.4rem', border: '1px solid var(--border)', borderRadius: 4, fontSize: '0.82rem', background: 'var(--background)', color: 'var(--foreground)' }}
                    >
                      <option value="qfq">前复权</option>
                      <option value="hfq">后复权</option>
                      <option value="">不复权</option>
                    </select>
                  ) : <span style={{ color: 'var(--muted)', fontSize: '0.75rem' }}>—</span>}
                </td>
                <td style={cellStyle}>
                  <button
                    onClick={() => remove(idx)}
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: '1rem' }}
                    title="删除"
                  >🗑</button>
                </td>
              </tr>
            ))}
            {/* Add row */}
            <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--muted-bg, #f8fafc)' }}>
              <td style={cellStyle}>
                <input
                  value={draft.symbol}
                  placeholder="代码"
                  onChange={e => setDraft(d => ({ ...d, symbol: e.target.value }))}
                  style={{ width: 90, padding: '0.3rem 0.4rem', border: '1px solid var(--border)', borderRadius: 4, fontSize: '0.82rem', background: 'var(--background)', color: 'var(--foreground)' }}
                />
              </td>
              <td style={cellStyle}>
                <select
                  value={draft.market}
                  onChange={e => setDraft(d => ({ ...d, market: e.target.value }))}
                  style={{ padding: '0.3rem 0.4rem', border: '1px solid var(--border)', borderRadius: 4, fontSize: '0.82rem', background: 'var(--background)', color: 'var(--foreground)' }}
                >
                  {Object.entries(MARKET_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </td>
              <td style={cellStyle}>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {PERIODS.map(p => {
                    const active = draft.periods.includes(p);
                    return (
                      <button
                        key={p}
                        onClick={() => setDraft(d => {
                          const next = d.periods.includes(p) ? d.periods.filter(x => x !== p) : [...d.periods, p];
                          return { ...d, periods: next.length ? next : ['daily'] };
                        })}
                        style={{
                          padding: '0.15rem 0.45rem', fontSize: '0.72rem', borderRadius: 4, cursor: 'pointer',
                          background: active ? '#3b82f6' : 'transparent',
                          color: active ? '#fff' : 'var(--muted)',
                          border: `1px solid ${active ? '#3b82f6' : 'var(--border)'}`,
                        }}
                      >{PERIOD_LABEL[p] ?? p}</button>
                    );
                  })}
                </div>
              </td>
              <td style={cellStyle}>
                {draft.market === 'a' || draft.market === 'hk' ? (
                  <select
                    value={draft.adjust ?? 'qfq'}
                    onChange={e => setDraft(d => ({ ...d, adjust: e.target.value }))}
                    style={{ padding: '0.3rem 0.4rem', border: '1px solid var(--border)', borderRadius: 4, fontSize: '0.82rem', background: 'var(--background)', color: 'var(--foreground)' }}
                  >
                    <option value="qfq">前复权</option>
                    <option value="hfq">后复权</option>
                    <option value="">不复权</option>
                  </select>
                ) : <span style={{ color: 'var(--muted)', fontSize: '0.75rem' }}>—</span>}
              </td>
              <td style={cellStyle}>
                <button className="btn btn-secondary" onClick={addRow} style={{ fontSize: '0.8rem', padding: '0.3rem 0.7rem' }}>
                  ＋ 添加
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Status table ──────────────────────────────────────────────────────────────

function DataStatusTable({
  symbols,
  onRefreshOne,
  refreshingKey,
  watchlist,
}: {
  symbols: MarketDataSymbolStatus[];
  onRefreshOne: (sym: MarketDataSymbolStatus) => void;
  refreshingKey: string | null;
  watchlist: WatchlistEntry[];
}) {
  const cellStyle: React.CSSProperties = {
    padding: '0.55rem 0.75rem', fontSize: '0.85rem', verticalAlign: 'middle',
  };

  if (symbols.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--muted)', fontSize: '0.9rem' }}>
        尚未采集任何数据，且 Watchlist 为空。
      </div>
    );
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)', background: 'var(--muted-bg, #f8fafc)' }}>
            {['代码 / 名称', '市场', '周期', 'K线数', '最新数据日期', '状态', '来源', '操作'].map(h => (
              <th key={h} style={{ ...cellStyle, fontWeight: 600, textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {symbols.map((s, i) => {
            const key = `${s.symbol}|${s.market}|${s.period}`;
            const isRefreshing = refreshingKey === key;
            const wlEntry = s.in_watchlist
              ? watchlist.find(e => e.symbol === s.symbol && e.market === s.market)
              : undefined;
            return (
              <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ ...cellStyle, fontWeight: 600, fontFamily: 'monospace' }}>
                  {s.symbol}
                  {s.name && (
                    <span style={{ display: 'block', fontFamily: 'sans-serif', fontWeight: 400, fontSize: '0.75rem', color: 'var(--muted)', marginTop: 1 }}>
                      {s.name}
                    </span>
                  )}
                </td>
                <td style={cellStyle}>{MARKET_LABEL[s.market] ?? s.market}</td>
                <td style={cellStyle}>{PERIOD_LABEL[s.period] ?? s.period}</td>
                <td style={{ ...cellStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {s.bar_count.toLocaleString()}
                </td>
                <td style={{ ...cellStyle, fontVariantNumeric: 'tabular-nums', color: s.last_bar_date ? 'var(--foreground)' : 'var(--muted)' }}>
                  {s.last_bar_date ? s.last_bar_date.replace('T', ' ').replace('.000', '') : '—'}
                </td>
                <td style={cellStyle}><StatusBadge s={s} /></td>
                <td style={cellStyle}>
                  {s.in_watchlist ? (
                    <span style={{ fontSize: '0.75rem', color: '#2563eb', fontWeight: 500 }}>📋 监控</span>
                  ) : (
                    <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>按需</span>
                  )}
                </td>
                <td style={cellStyle}>
                  {wlEntry ? (
                    <button
                      className="btn btn-secondary"
                      onClick={() => onRefreshOne(s)}
                      disabled={isRefreshing}
                      style={{ fontSize: '0.78rem', padding: '0.25rem 0.6rem', minWidth: 70 }}
                    >
                      {isRefreshing ? '刷新中…' : '🔄 刷新'}
                    </button>
                  ) : (
                    <span style={{ color: 'var(--muted)', fontSize: '0.78rem' }}>—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Symbol names section ──────────────────────────────────────────────────────

const MARKET_NAME_LABEL: Record<string, string> = { a: 'A股', hk: '港股', us: '美股', futures: '期货' };

function SymbolNamesSection() {
  const [data, setData] = useState<SymbolNamesResponse | null>(null);
  const [search, setSearch] = useState('');
  const [marketFilter, setMarketFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [msg, setMsg] = useState('');
  const [expanded, setExpanded] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (s = search, m = marketFilter) => {
    setLoading(true);
    try {
      const res = await adminGetSymbolNames({ search: s || undefined, market: m || undefined, limit: 300 });
      setData(res);
    } catch {
      setMsg('❌ 加载名称映射失败');
    } finally {
      setLoading(false);
    }
  }, [search, marketFilter]);

  useEffect(() => { if (expanded) load(); }, [expanded]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearch = (val: string) => {
    setSearch(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => load(val, marketFilter), 350);
  };

  const handleMarket = (val: string) => {
    setMarketFilter(val);
    load(search, val);
  };

  const handleRefresh = async (market?: 'a' | 'hk' | 'us') => {
    setRefreshing(true);
    setMsg('');
    try {
      const res = await adminRefreshNames(market);
      const parts = Object.entries(res.counts).map(([m, n]) => `${MARKET_NAME_LABEL[m] ?? m}: ${n} 条`).join(' / ');
      setMsg(`✅ 已刷新 — ${parts}`);
      await load(search, marketFilter);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } };
      setMsg('❌ ' + (err?.response?.data?.detail || '刷新失败'));
    } finally {
      setRefreshing(false);
    }
  };

  const cellStyle: React.CSSProperties = { padding: '0.45rem 0.65rem', fontSize: '0.82rem', verticalAlign: 'middle' };

  return (
    <div className="card" style={{ padding: '1.25rem', marginBottom: '2rem' }}>
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: expanded ? '1rem' : 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>🗂️ 股票名称映射</h2>
          {data && (
            <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
              共 {data.total.toLocaleString()} 条
              {Object.entries(data.market_totals).map(([m, n]) => (
                <span key={m} style={{ marginLeft: '0.5rem' }}>{MARKET_NAME_LABEL[m] ?? m} {n}</span>
              ))}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
          {expanded && (
            <>
              <button className="btn btn-secondary" disabled={refreshing} onClick={() => handleRefresh()} style={{ fontSize: '0.78rem', padding: '0.25rem 0.6rem' }}>
                {refreshing ? '刷新中…' : '🔄 全部'}
              </button>
              {(['a', 'hk', 'us'] as const).map(m => (
                <button key={m} className="btn btn-secondary" disabled={refreshing} onClick={() => handleRefresh(m)} style={{ fontSize: '0.78rem', padding: '0.25rem 0.5rem' }}>
                  {MARKET_NAME_LABEL[m]}
                </button>
              ))}
            </>
          )}
          <button className="btn btn-secondary" onClick={() => { setExpanded(v => !v); }} style={{ fontSize: '0.78rem', padding: '0.25rem 0.6rem' }}>
            {expanded ? '▲ 收起' : '▼ 展开'}
          </button>
        </div>
      </div>

      {!expanded && (
        <p style={{ fontSize: '0.78rem', color: 'var(--muted)', margin: 0 }}>
          名称在后台启动时自动加载，每 24 h 刷新，用户分析时按需写入 DB。展开查看详情或手动刷新。
        </p>
      )}

      {expanded && (
        <>
          {msg && (
            <div style={{
              padding: '0.5rem 0.85rem', borderRadius: '0.35rem', fontSize: '0.82rem', marginBottom: '0.75rem',
              background: msg.startsWith('✅') ? '#dcfce7' : '#fee2e2',
              color: msg.startsWith('✅') ? '#166534' : '#991b1b',
            }}>{msg}</div>
          )}

          {/* Filters */}
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
            <input
              placeholder="搜索代码或名称…"
              value={search}
              onChange={e => handleSearch(e.target.value)}
              style={{ flex: '1 1 160px', padding: '0.4rem 0.65rem', border: '1px solid var(--border)', borderRadius: '0.35rem', fontSize: '0.82rem', background: 'var(--background)', color: 'var(--foreground)', minWidth: 140 }}
            />
            <select
              value={marketFilter}
              onChange={e => handleMarket(e.target.value)}
              style={{ padding: '0.4rem 0.65rem', border: '1px solid var(--border)', borderRadius: '0.35rem', fontSize: '0.82rem', background: 'var(--background)', color: 'var(--foreground)' }}
            >
              <option value="">全部市场</option>
              {Object.entries(MARKET_NAME_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <span style={{ fontSize: '0.75rem', color: 'var(--muted)', alignSelf: 'center' }}>
              {loading ? '加载中…' : `显示 ${data?.items.length ?? 0} / ${data?.total ?? 0} 条（最多 300）`}
            </span>
          </div>

          {/* Table */}
          <div style={{ overflowX: 'auto', maxHeight: '24rem', overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ position: 'sticky', top: 0, background: 'var(--muted-bg, #f8fafc)', zIndex: 1 }}>
                <tr style={{ borderBottom: '2px solid var(--border)' }}>
                  {['代码', '市场', '名称', '更新时间'].map(h => (
                    <th key={h} style={{ ...cellStyle, fontWeight: 600, textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(data?.items ?? []).map((item: SymbolNameItem, i: number) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ ...cellStyle, fontFamily: 'monospace', fontWeight: 600 }}>{item.symbol}</td>
                    <td style={cellStyle}>{MARKET_NAME_LABEL[item.market] ?? item.market}</td>
                    <td style={cellStyle}>{item.name || <span style={{ color: 'var(--muted)' }}>—</span>}</td>
                    <td style={{ ...cellStyle, color: 'var(--muted)', fontSize: '0.75rem' }}>
                      {item.updated_at ? item.updated_at.replace('T', ' ').substring(0, 16) : '—'}
                    </td>
                  </tr>
                ))}
                {!loading && data?.items.length === 0 && (
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'center', padding: '2rem', color: 'var(--muted)', fontSize: '0.85rem' }}>
                      暂无数据，可点击「全部」刷新按钮从 AKShare 加载名称映射
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function MarketDataPage() {
  const [status, setStatus] = useState<MarketDataStatus | null>(null);
  const [watchlist, setWatchlist] = useState<WatchlistEntry[]>([]);
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshMsg, setRefreshMsg] = useState('');
  const [refreshingKey, setRefreshingKey] = useState<string | null>(null);
  const [triggeringAll, setTriggeringAll] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadData = async () => {
    try {
      const [s, w] = await Promise.all([adminGetMarketDataStatus(), adminGetWatchlist()]);
      setStatus(s);
      setWatchlist(w.watchlist);
      setLoadError('');
    } catch (e: unknown) {
      setLoadError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Poll every 8s while collecting
  useEffect(() => {
    if (status?.collecting) {
      pollRef.current = setInterval(loadData, 8000);
    } else {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [status?.collecting]);

  const triggerAll = async () => {
    setTriggeringAll(true);
    setRefreshMsg('');
    try {
      const res = await adminTriggerRefresh();
      if (res.triggered) {
        setRefreshMsg('✅ 已触发全量刷新，后台采集中…');
        setTimeout(loadData, 2000);
      } else {
        setRefreshMsg(`⚠️ ${res.reason ?? '触发失败'}`);
      }
    } catch (e: unknown) {
      setRefreshMsg('❌ ' + (e instanceof Error ? e.message : '请求失败'));
    } finally {
      setTriggeringAll(false);
    }
  };

  const triggerOne = async (sym: MarketDataSymbolStatus) => {
    const key = `${sym.symbol}|${sym.market}|${sym.period}`;
    setRefreshingKey(key);
    setRefreshMsg('');
    try {
      // Build minimal watchlist entry with just this symbol+period
      const wlEntry = watchlist.find(e => e.symbol === sym.symbol && e.market === sym.market);
      if (!wlEntry) return;
      const target = [{ ...wlEntry, periods: [sym.period] }];
      const res = await adminTriggerRefresh(target);
      if (res.triggered) {
        setRefreshMsg(`✅ ${sym.symbol}（${sym.period}）刷新已触发`);
        setTimeout(loadData, 3000);
      } else {
        setRefreshMsg(`⚠️ ${res.reason ?? '触发失败'}`);
      }
    } catch (e: unknown) {
      setRefreshMsg('❌ ' + (e instanceof Error ? e.message : '请求失败'));
    } finally {
      setRefreshingKey(null);
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', paddingTop: '4rem' }}>
        <div className="spinner" style={{ margin: '0 auto' }} />
      </div>
    );
  }

  if (loadError) {
    return <div className="error">{loadError}</div>;
  }

  const totalSymbols = status?.symbols.length ?? 0;
  const emptyCount = status?.symbols.filter(s => s.is_empty).length ?? 0;
  const staleCount = status?.symbols.filter(s => !s.is_empty && staleness(s.last_bar_date) === 'stale').length ?? 0;
  const okCount = totalSymbols - emptyCount - staleCount;

  return (
    <div style={{ maxWidth: 1100 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.25rem' }}>📈 数据采集</h1>
          <p style={{ color: 'var(--muted)', fontSize: '0.875rem' }}>
            管理自动采集任务 · Watchlist · 手动触发刷新
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button className="btn btn-secondary" onClick={loadData} style={{ fontSize: '0.85rem' }}>
            🔃 刷新页面
          </button>
          <button
            className="btn btn-primary"
            onClick={triggerAll}
            disabled={triggeringAll || status?.collecting}
            style={{ minWidth: 120 }}
          >
            {status?.collecting ? '⏳ 采集中…' : triggeringAll ? '触发中…' : '▶ 立即全量采集'}
          </button>
        </div>
      </div>

      {/* Collector status banner */}
      <div style={{
        display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.5rem',
      }}>
        {/* Collector running indicator */}
        <div className="card" style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1.25rem' }}>
          <span style={{
            display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
            background: status?.collecting ? '#22c55e' : '#94a3b8',
            boxShadow: status?.collecting ? '0 0 0 3px #bbf7d0' : 'none',
          }} />
          <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>
            {status?.collecting ? '采集中' : '空闲'}
          </span>
        </div>
        {/* Summary cards */}
        {[
          { label: '总跟踪', value: totalSymbols, color: 'var(--foreground)' },
          { label: '✅ 正常', value: okCount, color: '#166534' },
          { label: '⚠️ 陈旧', value: staleCount, color: '#92400e' },
          { label: '🚫 无数据', value: emptyCount, color: '#991b1b' },
        ].map(c => (
          <div key={c.label} className="card" style={{ flex: '0 0 auto', textAlign: 'center', padding: '0.75rem 1.25rem', minWidth: 80 }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: c.color }}>{c.value}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{c.label}</div>
          </div>
        ))}
      </div>

      {/* Action feedback */}
      {refreshMsg && (
        <div style={{
          padding: '0.6rem 1rem', marginBottom: '1rem', borderRadius: '0.375rem',
          background: refreshMsg.startsWith('✅') ? '#dcfce7' : refreshMsg.startsWith('⚠️') ? '#fef3c7' : '#fee2e2',
          color: refreshMsg.startsWith('✅') ? '#166534' : refreshMsg.startsWith('⚠️') ? '#92400e' : '#991b1b',
          fontSize: '0.875rem',
        }}>{refreshMsg}</div>
      )}

      {/* Data status table */}
      <div className="card" style={{ marginBottom: '2rem', padding: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>📊 DB 数据覆盖情况</h2>
          <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
            仅显示 Watchlist 中的标的 · 非 Watchlist 标的由用户请求触发后在 DB 中按需缓存
          </span>
        </div>
        <DataStatusTable
          symbols={status?.symbols ?? []}
          onRefreshOne={triggerOne}
          refreshingKey={refreshingKey}
          watchlist={watchlist}
        />
      </div>

      {/* Symbol names mapping */}
      <SymbolNamesSection />

      {/* Watchlist editor */}
      <div className="card" style={{ padding: '1.25rem' }}>
        <WatchlistEditor
          initial={watchlist}
          onSaved={newList => {
            setWatchlist(newList);
            loadData();
          }}
        />
      </div>
    </div>
  );
}
