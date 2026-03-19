'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  adminGetMarketDataStatus,
  adminTriggerRefresh,
  adminRefreshOneSymbol,
  adminGetSymbolNames,
  adminRefreshNames,
  MarketDataStatus,
  MarketDataSymbolStatus,
  SymbolNameItem,
  SymbolNamesResponse,
} from '@/lib/api';

// ── helpers ──────────────────────────────────────────────────────────────────

const MARKET_LABEL: Record<string, string> = { a: 'A股', hk: '港股', us: '美股', futures: '期货' };
const PERIOD_LABEL: Record<string, string> = {
  daily: '日线', '60': '60分', '30': '30分', '15': '15分', '5': '5分', '1': '1分',
};

function staleness(lastDate: string | null, period: string): 'empty' | 'stale' | 'ok' {
  if (!lastDate) return 'empty';
  const diff = Date.now() - new Date(lastDate).getTime();
  if (period === 'daily') {
    return diff > 86400 * 1000 ? 'stale' : 'ok';
  }
  const periodMs = parseInt(period) * 60 * 1000;
  return diff > periodMs ? 'stale' : 'ok';
}

function StatusBadge({ s }: { s: MarketDataSymbolStatus }) {
  const st = staleness(s.last_bar_date, s.period);
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

// ── Status table ──────────────────────────────────────────────────────────────

function DataStatusTable({
  symbols,
  onRefreshOne,
  refreshingKey,
}: {
  symbols: MarketDataSymbolStatus[];
  onRefreshOne: (sym: MarketDataSymbolStatus) => void;
  refreshingKey: string | null;
}) {
  const cellStyle: React.CSSProperties = {
    padding: '0.55rem 0.75rem', fontSize: '0.85rem', verticalAlign: 'middle',
  };

  if (symbols.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--muted)', fontSize: '0.9rem' }}>
        DB 中尚无数据，用户发起分析后会自动按需缓存。
      </div>
    );
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)', background: 'var(--muted-bg, #f8fafc)' }}>
            {['代码 / 名称', '市场', '周期', 'K线数', '最新数据日期', '状态', '操作'].map(h => (
              <th key={h} style={{ ...cellStyle, fontWeight: 600, textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {symbols.map((s, i) => {
            const key = `${s.symbol}|${s.market}|${s.period}`;
            const isRefreshing = refreshingKey === key;
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
                  <button
                    className="btn btn-secondary"
                    onClick={() => onRefreshOne(s)}
                    disabled={isRefreshing}
                    style={{ fontSize: '0.78rem', padding: '0.25rem 0.6rem', minWidth: 70 }}
                  >
                    {isRefreshing ? '刷新中…' : '🔄 刷新'}
                  </button>
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
      if (!res.success && res.errors) {
        const errorDetails = Object.entries(res.errors).map(([m, err]) => {
          const shortErr = err.length > 80 ? err.substring(0, 80) + '...' : err;
          return `${MARKET_NAME_LABEL[m] ?? m}: ${shortErr}`;
        }).join('; ');
        setMsg(`⚠️ 部分刷新失败 — ${parts} | 错误: ${errorDetails}`);
      } else if (res.success) {
        setMsg(`✅ 已刷新 — ${parts}`);
      } else {
        setMsg(`❌ 刷新失败 — ${parts}`);
      }
      await load(search, marketFilter);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string; message?: string } } };
      setMsg('❌ ' + (err?.response?.data?.message || err?.response?.data?.detail || '刷新失败'));
    } finally {
      setRefreshing(false);
    }
  };

  const cellStyle: React.CSSProperties = { padding: '0.45rem 0.65rem', fontSize: '0.82rem', verticalAlign: 'middle' };

  return (
    <div className="card" style={{ padding: '1.25rem', marginBottom: '2rem' }}>
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
          <button className="btn btn-secondary" onClick={() => setExpanded(v => !v)} style={{ fontSize: '0.78rem', padding: '0.25rem 0.6rem' }}>
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
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshMsg, setRefreshMsg] = useState('');
  const [refreshingKey, setRefreshingKey] = useState<string | null>(null);
  const [triggeringAll, setTriggeringAll] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadData = async () => {
    try {
      const s = await adminGetMarketDataStatus();
      setStatus(s);
      setLoadError('');
    } catch (e: unknown) {
      setLoadError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

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
      await adminRefreshOneSymbol(sym.symbol, sym.market, sym.period);
      setRefreshMsg(`✅ ${sym.symbol}（${sym.period}）刷新已触发`);
      setTimeout(loadData, 3000);
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
  const staleCount = status?.symbols.filter(s => !s.is_empty && staleness(s.last_bar_date, s.period) === 'stale').length ?? 0;
  const okCount = totalSymbols - emptyCount - staleCount;

  return (
    <div style={{ maxWidth: 1100 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.25rem' }}>📈 数据采集</h1>
          <p style={{ color: 'var(--muted)', fontSize: '0.875rem' }}>
            DB 中所有标的均由用户请求按需缓存 · 手动触发全量或单标的刷新
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

      {/* Status banner */}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
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
        {[
          { label: '总标的', value: totalSymbols, color: 'var(--foreground)' },
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
        <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 0.75rem' }}>📊 DB 数据覆盖情况</h2>
        <DataStatusTable
          symbols={status?.symbols ?? []}
          onRefreshOne={triggerOne}
          refreshingKey={refreshingKey}
        />
      </div>

      {/* Symbol names mapping */}
      <SymbolNamesSection />
    </div>
  );
}
