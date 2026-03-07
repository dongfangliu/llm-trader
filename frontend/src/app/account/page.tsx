'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/store';
import { getSubscriptionStatus, getAnalysisHistory, getPricing, getAppConfig, PricingData, AnalysisHistoryItem } from '@/lib/api';
import { generateShareCardBlob, downloadBlob } from '@/lib/shareCard';


function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return '刚刚';
  if (m < 60) return `${m}分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}小时前`;
  return `${Math.floor(h / 24)}天前`;
}

const TIER_LABELS: Record<string, string> = { free: '免费版', basic: '标准版', premium: '专业版' };

const FOUR_STEP_KEYS = [
  { label: '🔍 市场诊断', key: 'market_diagnosis' },
  { label: '🎯 机会评估', key: 'opportunity_assessment' },
  { label: '⚖️ 风险收益', key: 'risk_analysis' },
  { label: '📋 执行方案', key: 'execution_plan' },
] as const;

function HistoryDetailModal({
  item, tier, pricing, onClose, onUpgrade,
}: {
  item: AnalysisHistoryItem;
  tier: string;
  pricing: PricingData | null;
  onClose: () => void;
  onUpgrade: () => void;
}) {
  const [activeTab, setActiveTab] = useState(0);
  const [shareLoading, setShareLoading] = useState(false);
  const [saveLongLoading, setSaveLongLoading] = useState(false);
  const appName = process.env.NEXT_PUBLIC_APP_NAME || '财财技术洞见';

  const handleShare = async (longImage?: boolean) => {
    if (!item.detail) return;
    const setLoading = longImage ? setSaveLongLoading : setShareLoading;
    setLoading(true);
    try {
      const { blob, filename } = await generateShareCardBlob({
        result: item.detail,
        tier,
        analyzedAt: item.analyzed_at,
        appName,
        longImage,
      });
      downloadBlob(blob, filename);
    } finally {
      setLoading(false);
    }
  };
  const r = item.detail?.result;
  const d = item.detail?.data;
  const action = r?.action;

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: '0' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: 'white', borderRadius: '1rem 1rem 0 0', width: '100%', maxWidth: '680px', maxHeight: '90vh', overflowY: 'auto', padding: '1.25rem' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700 }}>
              {item.detail?.data?.name
                ? <>{item.detail.data.name} <span style={{ fontWeight: 400, opacity: 0.65 }}>({item.symbol})</span></>
                : item.symbol
              } 分析报告
            </h2>
            <p style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
              {new Date(item.analyzed_at).toLocaleString('zh-CN')} · {item.period === 'daily' ? '日线' : item.period + '分钟'}
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--muted)', lineHeight: 1 }}>×</button>
        </div>

        {/* Action + confidence — always visible */}
        <div style={{ textAlign: 'center', padding: '1rem', background: action === 'buy' ? '#fee2e2' : action === 'sell' ? '#dcfce7' : '#f3f4f6', borderRadius: '0.75rem', marginBottom: '1rem' }}>
          <p style={{ fontSize: '0.75rem', color: 'var(--muted)', marginBottom: '0.25rem' }}>建议操作</p>
          <p style={{ fontSize: '1.5rem', fontWeight: 800, color: action === 'buy' ? '#dc2626' : action === 'sell' ? '#16a34a' : '#6b7280' }}>
            {action === 'buy' ? '买入' : action === 'sell' ? '卖出' : '观望'}
          </p>
          <p style={{ fontSize: '0.9rem', fontWeight: 600, marginTop: '0.25rem' }}>置信度: {r?.confidence ?? '-'}%</p>
        </div>

        {/* Price grid — always visible */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', marginBottom: '1rem' }}>
          {[
            { label: '最新价', value: typeof d?.latest_price === 'number' ? d.latest_price.toFixed(2) : '—', color: undefined },
            { label: '目标价', value: typeof r?.target_price === 'number' ? r.target_price.toFixed(2) : '—', color: '#16a34a' },
            { label: '止损', value: typeof r?.stop_loss === 'number' ? r.stop_loss.toFixed(2) : '—', color: '#dc2626' },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ textAlign: 'center', padding: '0.6rem', background: '#f8fafc', borderRadius: '0.5rem' }}>
              <p style={{ fontSize: '0.7rem', color: 'var(--muted)', marginBottom: '0.15rem' }}>{label}</p>
              <p style={{ fontSize: '1.1rem', fontWeight: 700, color }}>{value}</p>
            </div>
          ))}
        </div>

        {/* Reason — free: truncated; basic/premium: full */}
        {r?.reason && (
          <div style={{ marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.4rem' }}>分析要点</h3>
            {tier === 'free' ? (
              <div style={{ position: 'relative' }}>
                <p style={{ fontSize: '0.85rem', color: 'var(--foreground)', lineHeight: '1.7', background: '#f8fafc', padding: '0.75rem', borderRadius: '0.5rem' }}>
                  {r.reason.slice(0, 120)}{r.reason.length > 120 ? '…' : ''}
                </p>
                <div style={{ marginTop: '0.4rem', fontSize: '0.78rem', color: '#6d28d9', textAlign: 'center' }}>
                  🔒 升级基础版查看完整分析要点
                </div>
              </div>
            ) : (
              <p style={{ fontSize: '0.85rem', color: 'var(--foreground)', lineHeight: '1.7', background: '#f8fafc', padding: '0.75rem', borderRadius: '0.5rem' }}>{r.reason}</p>
            )}
          </div>
        )}

        {/* Deep analysis tabs — basic & premium only */}
        {tier === 'free' ? (
          <div style={{ marginBottom: '1rem', padding: '0.75rem', background: '#f5f3ff', border: '1px dashed #a78bfa', borderRadius: '0.75rem', textAlign: 'center' }}>
            <p style={{ fontSize: '0.82rem', fontWeight: 600, color: '#5b21b6', marginBottom: '0.25rem' }}>🔒 深度研判</p>
            <p style={{ fontSize: '0.75rem', color: '#6d28d9' }}>市场诊断 · 机会评估 · 风险收益 · 执行方案</p>
            <p style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: '0.2rem' }}>升级标准版即可解锁</p>
          </div>
        ) : FOUR_STEP_KEYS.some(({ key }) => r?.[key]) ? (
          <div style={{ marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>深度研判</h3>
            <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
              {FOUR_STEP_KEYS.map(({ label }, i) => (
                <button
                  key={i}
                  onClick={() => setActiveTab(i)}
                  style={{ padding: '0.25rem 0.6rem', fontSize: '0.72rem', borderRadius: '9999px', border: `1px solid ${activeTab === i ? '#2563eb' : 'var(--border)'}`, background: activeTab === i ? '#2563eb' : 'white', color: activeTab === i ? 'white' : undefined, cursor: 'pointer', fontWeight: activeTab === i ? 600 : 400 }}
                >
                  {label}
                </button>
              ))}
            </div>
            <p style={{ fontSize: '0.85rem', lineHeight: '1.7', color: 'var(--foreground)', background: '#f8fafc', padding: '0.75rem', borderRadius: '0.5rem' }}>
              {(r?.[FOUR_STEP_KEYS[activeTab].key] as string) || '暂无数据'}
            </p>
          </div>
        ) : null}

        {/* Risk factors — basic & premium only */}
        {tier === 'free' ? (
          <div style={{ marginBottom: '1rem', padding: '0.6rem 0.75rem', background: '#eff6ff', border: '1px dashed #93c5fd', borderRadius: '0.5rem', fontSize: '0.78rem', color: '#1e40af', textAlign: 'center' }}>
            🔒 风险因素详情（标准版起可见）
          </div>
        ) : r?.risk_factors && r.risk_factors.length > 0 ? (
          <div style={{ marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.4rem' }}>风险因素</h3>
            <ul style={{ fontSize: '0.83rem', color: 'var(--muted)', paddingLeft: '1.2rem', margin: 0, lineHeight: '1.8' }}>
              {r.risk_factors.map((f: string, i: number) => <li key={i}>{f}</li>)}
            </ul>
          </div>
        ) : null}

        {/* Position advice — premium only */}
        {tier === 'basic' && r?.position_advice && (
          <div style={{ marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.4rem' }}>持仓建议</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--muted)', lineHeight: '1.6' }}>
              {r.position_advice.reason}
              {typeof r.position_advice.suggested_quantity === 'number' ? `（建议数量: ${r.position_advice.suggested_quantity}）` : ''}
            </p>
          </div>
        )}
        {tier === 'free' && (
          <div style={{ marginBottom: '1rem', padding: '0.6rem 0.75rem', background: '#f5f3ff', border: '1px dashed #a78bfa', borderRadius: '0.5rem', fontSize: '0.78rem', color: '#5b21b6', textAlign: 'center' }}>
            🔒 持仓参数智能分析（标准版每日1次，专业版无限）
          </div>
        )}

        {/* Upgrade CTA */}
        {tier !== 'premium' && (
          <div style={{ marginBottom: '1rem' }}>
            {tier === 'free' ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.65rem' }}>
                {/* Basic */}
                <button
                  style={{ padding: '0.6rem', fontWeight: 700, fontSize: '0.82rem', color: 'white', border: 'none', borderRadius: '0.5rem', cursor: 'pointer', background: 'linear-gradient(90deg,#2563eb 0%,#60a5fa 50%,#2563eb 100%)', backgroundSize: '200% auto', animation: 'shimmer 2.5s linear infinite' }}
                  onClick={onUpgrade}
                >
                  📊 解锁标准版 ¥{pricing?.basic?.price ?? '19.9'}/月 <span style={{ display: 'inline-block', animation: 'bounce-arrow 1.2s ease-in-out infinite' }}>→</span>
                </button>
                {/* Premium */}
                <button
                  style={{ padding: '0.6rem', fontWeight: 700, fontSize: '0.82rem', color: 'white', border: 'none', borderRadius: '0.5rem', cursor: 'pointer', background: 'linear-gradient(90deg,#7c3aed 0%,#a78bfa 50%,#7c3aed 100%)', backgroundSize: '200% auto', animation: 'shimmer 2.5s linear infinite', animationDelay: '0.5s' }}
                  onClick={onUpgrade}
                >
                  🚀 解锁专业版 ¥{pricing?.premium?.price ?? '49'}/月 <span style={{ display: 'inline-block', animation: 'bounce-arrow 1.2s ease-in-out infinite' }}>→</span>
                </button>
              </div>
            ) : (
              <button
                style={{ width: '100%', padding: '0.6rem', fontWeight: 700, fontSize: '0.85rem', color: 'white', border: 'none', borderRadius: '0.5rem', cursor: 'pointer', background: 'linear-gradient(90deg,#7c3aed 0%,#a78bfa 50%,#7c3aed 100%)', backgroundSize: '200% auto', animation: 'shimmer 2.5s linear infinite' }}
                onClick={onUpgrade}
              >
                🚀 升级专业版，解锁持仓分析 ¥{pricing?.premium?.price ?? '49'}/月 <span style={{ display: 'inline-block', animation: 'bounce-arrow 1.2s ease-in-out infinite' }}>→</span>
              </button>
            )}
          </div>
        )}

        {tier === 'free' ? (
          <button
            onClick={() => handleShare()}
            disabled={shareLoading}
            style={{ width: '100%', marginBottom: '0.6rem', padding: '0.6rem', fontSize: '0.95rem', fontWeight: 700, background: shareLoading ? '#fca5a5' : 'linear-gradient(135deg,#dc2626,#ef4444)', border: 'none', borderRadius: '0.5rem', cursor: shareLoading ? 'default' : 'pointer', color: 'white', boxShadow: shareLoading ? 'none' : '0 3px 10px rgba(220,38,38,0.4)' }}
          >
            {shareLoading ? '生成中…' : '📤 分享研判卡片'}
          </button>
        ) : (
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.6rem' }}>
            <button
              onClick={() => handleShare(true)}
              disabled={saveLongLoading}
              style={{ flex: 1, padding: '0.6rem', fontSize: '0.95rem', fontWeight: 700, background: saveLongLoading ? '#86efac' : 'linear-gradient(135deg,#15803d,#22c55e)', border: 'none', borderRadius: '0.5rem', cursor: saveLongLoading ? 'default' : 'pointer', color: 'white', boxShadow: saveLongLoading ? 'none' : '0 3px 10px rgba(34,197,94,0.4)' }}
            >
              {saveLongLoading ? '生成中…' : '💾 保存长图'}
            </button>
            <button
              onClick={() => handleShare(false)}
              disabled={shareLoading}
              style={{ flex: 1, padding: '0.6rem', fontSize: '0.95rem', fontWeight: 700, background: shareLoading ? '#fca5a5' : 'linear-gradient(135deg,#dc2626,#ef4444)', border: 'none', borderRadius: '0.5rem', cursor: shareLoading ? 'default' : 'pointer', color: 'white', boxShadow: shareLoading ? 'none' : '0 3px 10px rgba(220,38,38,0.4)' }}
            >
              {shareLoading ? '生成中…' : '📤 分享卡片'}
            </button>
          </div>
        )}
        <button className="btn btn-secondary" style={{ width: '100%' }} onClick={onClose}>关闭</button>
      </div>
    </div>
  );
}

export default function AccountPage() {
  const router = useRouter();
  const { user, logout, checkAuth } = useAuthStore();
  const [limits, setLimits] = useState<{ remaining: number; daily_limit: number } | null>(null);
  const [history, setHistory] = useState<AnalysisHistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [deviceId, setDeviceId] = useState('');
  const [selectedItem, setSelectedItem] = useState<AnalysisHistoryItem | null>(null);
  const [pricing, setPricing] = useState<PricingData | null>(null);
  const [afdianBasicLink, setAfdianBasicLink] = useState('https://afdian.net');
  const [afdianPremiumLink, setAfdianPremiumLink] = useState('https://afdian.net');
  const [inviteInput, setInviteInput] = useState('');
  const [inviteMsg, setInviteMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [copiedInvite, setCopiedInvite] = useState(false);

  const handleUseInvite = async () => {
    if (!inviteInput.trim()) return;
    setInviteLoading(true);
    setInviteMsg(null);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/invite/use', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ invite_code: inviteInput.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setInviteMsg({ type: 'ok', text: data.message || '成功！双方各获得 +10 次分析额度 🎉' });
        setInviteInput('');
        checkAuth().then(() => {});
      } else {
        setInviteMsg({ type: 'err', text: data.detail || '邀请码无效' });
      }
    } catch {
      setInviteMsg({ type: 'err', text: '网络错误，请稍后重试' });
    } finally {
      setInviteLoading(false);
    }
  };

  useEffect(() => {
    const id = localStorage.getItem('device_id') || '';
    setDeviceId(id);
    checkAuth().then(() => {});
    getPricing().then(setPricing).catch(() => {});
    getAppConfig().then(c => {
      if (c.afdian_basic_link) setAfdianBasicLink(c.afdian_basic_link);
      if (c.afdian_premium_link) setAfdianPremiumLink(c.afdian_premium_link);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!user) return;
    getSubscriptionStatus().then(setLimits).catch(() => {});
    setLoadingHistory(true);
    getAnalysisHistory(30, deviceId)
      .then((data) => setHistory(data.items ?? []))
      .catch(() => {})
      .finally(() => setLoadingHistory(false));
  }, [user, deviceId]);

  const handleLogout = () => { logout(); router.push('/login'); };

  if (!user) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--background)' }}>
        <div className="card" style={{ textAlign: 'center', padding: '2rem', maxWidth: '360px' }}>
          <p style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>🔐</p>
          <p style={{ fontWeight: 600, marginBottom: '0.5rem' }}>请先登录</p>
          <p style={{ fontSize: '0.875rem', color: 'var(--muted)', marginBottom: '1.25rem' }}>登录后查看账号信息和历史分析</p>
          <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => router.push('/login')}>前往登录</button>
          <button className="btn btn-secondary" style={{ width: '100%', marginTop: '0.5rem' }} onClick={() => router.push('/')}>返回首页</button>
        </div>
      </div>
    );
  }

  const tier = user.subscription_tier ?? 'free';
  const tierLabel = TIER_LABELS[tier] ?? tier;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--background)', padding: '1.5rem 1rem' }}>
      <style>{`
        @keyframes shimmer {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        @keyframes pulse-glow {
          0%, 100% { box-shadow: 0 0 0 0 rgba(124,58,237,0.4); }
          50% { box-shadow: 0 0 0 8px rgba(124,58,237,0); }
        }
        @keyframes bounce-arrow {
          0%, 100% { transform: translateX(0); }
          50% { transform: translateX(4px); }
        }
        .shimmer-btn {
          background: linear-gradient(90deg, #f59e0b 0%, #fbbf24 40%, #f59e0b 100%);
          background-size: 200% auto;
          animation: shimmer 2.5s linear infinite;
        }
        .shimmer-btn-purple {
          background: linear-gradient(90deg, #7c3aed 0%, #a78bfa 40%, #7c3aed 100%);
          background-size: 200% auto;
          animation: shimmer 2.5s linear infinite;
        }
        .pulse-btn { animation: pulse-glow 2s ease-in-out infinite; }
        .bounce-arrow { display: inline-block; animation: bounce-arrow 1.2s ease-in-out infinite; }
        .upgrade-tier-card { transition: transform 0.2s, box-shadow 0.2s; }
        .upgrade-tier-card:hover { transform: translateY(-3px); box-shadow: 0 8px 24px rgba(15,23,42,0.12); }
      `}</style>

      <div style={{ maxWidth: '680px', margin: '0 auto' }}>
        {/* Back nav */}
        <div style={{ marginBottom: '1.25rem' }}>
          <button className="btn btn-secondary" style={{ fontSize: '0.85rem' }} onClick={() => router.push('/')}>
            ← 返回分析
          </button>
        </div>

        {/* Profile card */}
        <div className="card" style={{ marginBottom: '1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: '1.25rem', flexShrink: 0 }}>
              {(user.username || user.email || 'U')[0].toUpperCase()}
            </div>
            <div>
              <p style={{ fontWeight: 600, fontSize: '1rem' }}>{user.username || user.email}</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.2rem' }}>
                <span className={`badge badge-${tier}`}>{tierLabel}</span>
                {limits && (
                  <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                    今日剩余 {limits.remaining}/{limits.daily_limit} 次
                  </span>
                )}
              </div>
            </div>
          </div>
          <button className="btn btn-secondary" style={{ fontSize: '0.8rem' }} onClick={handleLogout}>
            退出登录
          </button>
        </div>

        {/* Invite code card — registered users only */}
        {user?.invite_code && (
          <div className="card" style={{ marginBottom: '1.25rem' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.75rem' }}>🎁 邀请好友·共享额度</h2>
            <p style={{ fontSize: '0.82rem', color: 'var(--muted)', marginBottom: '0.85rem' }}>
              每成功邀请一位新用户注册，双方各获得 <strong>+10 次</strong>分析额度（永久累加）
              {(user.bonus_quota ?? 0) > 0 && <span style={{ marginLeft: '0.5rem', color: '#7c3aed', fontWeight: 600 }}>当前奖励余额：{user.bonus_quota} 次</span>}
            </p>
            {/* My invite code */}
            <div style={{ marginBottom: '0.85rem' }}>
              <p style={{ fontSize: '0.78rem', color: 'var(--muted)', marginBottom: '0.3rem' }}>我的邀请码</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <code style={{ background: '#f1f5f9', padding: '0.4rem 0.75rem', borderRadius: '0.4rem', fontWeight: 700, fontSize: '1rem', letterSpacing: '0.15em', color: '#1e293b', border: '1px solid #e2e8f0' }}>
                  {user.invite_code}
                </code>
                <button
                  className="btn btn-secondary"
                  style={{ fontSize: '0.78rem', padding: '0.35rem 0.6rem', minHeight: 'auto' }}
                  onClick={() => {
                    navigator.clipboard.writeText(user.invite_code!).then(() => {
                      setCopiedInvite(true);
                      setTimeout(() => setCopiedInvite(false), 2000);
                    });
                  }}
                >
                  {copiedInvite ? '已复制 ✓' : '复制'}
                </button>
              </div>
            </div>
            {/* Use someone else's invite code */}
            <div>
              <p style={{ fontSize: '0.78rem', color: 'var(--muted)', marginBottom: '0.3rem' }}>输入好友邀请码</p>
              {user.used_invite_code ? (
                <p style={{ fontSize: '0.82rem', color: '#16a34a', fontWeight: 600 }}>
                  ✓ 已兑换邀请码 <code style={{ background: '#f0fdf4', padding: '0.1rem 0.4rem', borderRadius: '0.25rem', letterSpacing: '0.1em' }}>{user.used_invite_code}</code>（每账号限兑换一次）
                </p>
              ) : (
                <>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <input
                      value={inviteInput}
                      onChange={e => setInviteInput(e.target.value.toUpperCase())}
                      placeholder="8位邀请码"
                      maxLength={8}
                      style={{ flex: 1, padding: '0.4rem 0.6rem', border: '1px solid var(--border)', borderRadius: '0.4rem', fontSize: '0.9rem', fontFamily: 'monospace', letterSpacing: '0.1em', textTransform: 'uppercase' }}
                      onKeyDown={e => { if (e.key === 'Enter') handleUseInvite(); }}
                    />
                    <button
                      className="btn btn-primary"
                      style={{ fontSize: '0.82rem', padding: '0.4rem 0.8rem', minHeight: 'auto' }}
                      onClick={handleUseInvite}
                      disabled={inviteLoading || !inviteInput.trim()}
                    >
                      {inviteLoading ? '...' : '兑换'}
                    </button>
                  </div>
                  {inviteMsg && (
                    <p style={{ fontSize: '0.78rem', marginTop: '0.4rem', color: inviteMsg.type === 'ok' ? '#16a34a' : '#dc2626' }}>
                      {inviteMsg.text}
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* Upgrade section — free / basic only */}
        {tier !== 'premium' && (
          <div style={{ marginBottom: '1.25rem' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.85rem' }}>🚀 升级解锁更多功能</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>

              {/* Basic tier card — show for free users only */}
              {tier === 'free' && (
                <div className="upgrade-tier-card" style={{ border: '2px solid #3b82f6', borderRadius: '0.75rem', padding: '1.25rem', background: '#eff6ff' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                    <div>
                      <p style={{ fontWeight: 700, fontSize: '1rem', color: '#1d4ed8' }}>📊 标准版</p>
                      <p style={{ fontSize: '1.5rem', fontWeight: 800, color: '#1e40af', lineHeight: 1.2 }}>
                        ¥{pricing?.basic?.price ?? '19.9'}<span style={{ fontSize: '0.85rem', fontWeight: 400 }}>/{pricing?.basic?.period ?? '月'}</span>
                      </p>
                    </div>
                    <span style={{ fontSize: '0.7rem', background: '#bfdbfe', color: '#1d4ed8', padding: '0.2rem 0.55rem', borderRadius: '9999px', fontWeight: 600 }}>推荐</span>
                  </div>
                  <ul style={{ fontSize: '0.82rem', color: '#1e40af', paddingLeft: '1.1rem', margin: '0 0 1rem 0', lineHeight: '1.9' }}>
                    {((pricing?.features ?? []).filter(f => f.tiers.includes('basic')).map(f => f.text).length
                      ? (pricing?.features ?? []).filter(f => f.tiers.includes('basic')).map(f => f.text)
                      : ['每日5次分析（免费版仅1次）', '完整深度研判 + 风险指标', '港股 / 美股 / 期货全市场', '多周期叠加分析']
                    ).map((f, i) => (
                      <li key={i}>{f}</li>
                    ))}
                  </ul>
                  <button
                    className="shimmer-btn"
                    style={{ width: '100%', padding: '0.65rem', fontWeight: 700, fontSize: '0.9rem', color: 'white', border: 'none', borderRadius: '0.5rem', cursor: 'pointer' }}
                    onClick={() => window.open(afdianBasicLink, '_blank', 'noopener,noreferrer')}
                  >
                    立即订阅标准版 <span className="bounce-arrow">→</span>
                  </button>
                </div>
              )}

              {/* Premium tier card */}
              <div className="upgrade-tier-card pulse-btn" style={{ border: '2px solid #7c3aed', borderRadius: '0.75rem', padding: '1.25rem', background: '#f5f3ff', position: 'relative' }}>
                <div style={{ position: 'absolute', top: '-10px', left: '50%', transform: 'translateX(-50%)', background: '#7c3aed', color: 'white', fontSize: '0.7rem', fontWeight: 700, padding: '0.2rem 0.75rem', borderRadius: '9999px', whiteSpace: 'nowrap' }}>
                  ✨ 最高权益
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem', marginTop: '0.5rem' }}>
                  <div>
                    <p style={{ fontWeight: 700, fontSize: '1rem', color: '#5b21b6' }}>🚀 专业版</p>
                    <p style={{ fontSize: '1.5rem', fontWeight: 800, color: '#6d28d9', lineHeight: 1.2 }}>
                      ¥{pricing?.premium?.price ?? '49'}<span style={{ fontSize: '0.85rem', fontWeight: 400 }}>/{pricing?.premium?.period ?? '月'}</span>
                    </p>
                  </div>
                </div>
                <ul style={{ fontSize: '0.82rem', color: '#5b21b6', paddingLeft: '1.1rem', margin: '0 0 1rem 0', lineHeight: '1.9' }}>
                  {((pricing?.features ?? []).filter(f => f.tiers.includes('premium')).map(f => f.text).length
                    ? (pricing?.features ?? []).filter(f => f.tiers.includes('premium')).map(f => f.text)
                    : ['每日15次分析', '连续多标的查询，回看历史结果', '持仓参数智能分析', '优先处理通道', '全部基础版功能']
                  ).map((f, i) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
                <button
                  className="shimmer-btn-purple pulse-btn"
                  style={{ width: '100%', padding: '0.65rem', fontWeight: 700, fontSize: '0.9rem', color: 'white', border: 'none', borderRadius: '0.5rem', cursor: 'pointer' }}
                  onClick={() => window.open(afdianPremiumLink, '_blank', 'noopener,noreferrer')}
                >
                  立即订阅专业版 <span className="bounce-arrow">→</span>
                </button>
              </div>
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: '0.6rem', textAlign: 'center' }}>
              已订阅？<button className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.1rem 0.5rem', minHeight: 'auto', marginLeft: '0.25rem' }} onClick={() => router.push('/upgrade')}>前往激活</button>
            </p>
          </div>
        )}

        {/* Premium user message */}
        {tier === 'premium' && (
          <div className="card" style={{ marginBottom: '1.25rem', textAlign: 'center', background: 'linear-gradient(135deg, #f5f3ff, #ede9fe)', border: '2px solid #a78bfa' }}>
            <p style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>🏆</p>
            <p style={{ fontWeight: 700, color: '#5b21b6', fontSize: '1rem' }}>您已是专业会员，享有最高权益！</p>
            <p style={{ fontSize: '0.85rem', color: '#6d28d9', marginTop: '0.3rem' }}>每日 15 次分析 · 全市场 · 优先通道</p>
          </div>
        )}

        {/* Analysis history */}
        <div className="card">
          <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1rem' }}>📋 历史分析记录</h2>
          {loadingHistory ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
              <div className="spinner" />
            </div>
          ) : history.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--muted)' }}>
              <p style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>📭</p>
              <p>暂无历史记录</p>
              <button className="btn btn-primary" style={{ marginTop: '0.75rem' }} onClick={() => router.push('/')}>开始第一次分析</button>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '0.5rem' }}>
              {history.map((h) => {
                const action = h.detail?.result?.action;
                const confidence = h.detail?.result?.confidence;
                return (
                <div
                  key={h.id}
                  onClick={() => setSelectedItem(h)}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '0.6rem 0.75rem',
                    border: '1px solid var(--border)',
                    borderRadius: '0.5rem',
                    fontSize: '0.85rem',
                    gap: '0.5rem',
                    background: 'white',
                    cursor: 'pointer',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'white')}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontWeight: 600 }}>
                      {h.detail?.data?.name
                        ? <>{h.detail.data.name} <span style={{ fontWeight: 400, color: 'var(--muted)' }}>({h.symbol})</span></>
                        : h.symbol
                      }
                    </span>
                    <span style={{
                      marginLeft: '0.4rem',
                      color: action === 'buy' ? '#16a34a' : action === 'sell' ? '#dc2626' : '#6b7280',
                      fontWeight: 600,
                    }}>
                      {action === 'buy' ? '买入' : action === 'sell' ? '卖出' : '观望'}
                    </span>
                    <span style={{ color: 'var(--muted)', marginLeft: '0.4rem' }}>{confidence ?? '-'}%</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--muted)', whiteSpace: 'nowrap' }}>{timeAgo(h.analyzed_at)}</span>
                    <span style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>›</span>
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* History detail modal */}
      {selectedItem && (
        <HistoryDetailModal
          item={selectedItem}
          tier={tier}
          pricing={pricing}
          onClose={() => setSelectedItem(null)}
          onUpgrade={() => { setSelectedItem(null); router.push('/upgrade'); }}
        />
      )}
    </div>
  );
}
