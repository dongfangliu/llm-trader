'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/store';
import { activateAfdianOrder, getPricing, PricingData, FeatureItem } from '@/lib/api';

const AFDIAN_BASIC_LINK = process.env.NEXT_PUBLIC_AFDIAN_BASIC_LINK || 'https://afdian.net';
const AFDIAN_PREMIUM_LINK = process.env.NEXT_PUBLIC_AFDIAN_PREMIUM_LINK || 'https://afdian.net';

export default function UpgradePage() {
  const router = useRouter();
  const { user, checkAuth } = useAuthStore();
  const [deviceId, setDeviceId] = useState('');
  const [pricing, setPricing] = useState<PricingData | null>(null);

  // Activation form state
  const [orderNo, setOrderNo] = useState('');
  const [activating, setActivating] = useState(false);
  const [activateResult, setActivateResult] = useState<{ tier: string } | null>(null);
  const [activateError, setActivateError] = useState('');

  useEffect(() => {
    checkAuth();
    const id = localStorage.getItem('device_id') || '';
    setDeviceId(id);
    getPricing().then(setPricing).catch(() => {});
  }, []);

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderNo.trim() || !deviceId) return;
    setActivating(true);
    setActivateError('');
    setActivateResult(null);
    try {
      const result = await activateAfdianOrder({ out_trade_no: orderNo.trim(), device_id: deviceId });
      setActivateResult(result);
      await checkAuth();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || '激活失败，请检查订单号';
      setActivateError(msg);
    } finally {
      setActivating(false);
    }
  };

  const handleUpgrade = (tier: string) => {
    const link = tier === 'basic' ? AFDIAN_BASIC_LINK : AFDIAN_PREMIUM_LINK;
    window.open(link, '_blank', 'noopener,noreferrer');
  };

  const tier = user?.subscription_tier ?? null;

  const allFeatures: FeatureItem[] = pricing?.features ?? [];
  const featuresFor = (t: string) => allFeatures.filter(f => f.tiers.includes(t)).map(f => f.text);
  const missingFor = (t: string) => allFeatures.filter(f => !f.tiers.includes(t)).map(f => f.text);

  const basicPrice = pricing?.basic.price ?? '19.9';
  const basicLimit = pricing?.basic.daily_limit ?? 5;
  const premiumPrice = pricing?.premium.price ?? '49';
  const premiumLimit = pricing?.premium.daily_limit ?? 15;
  const period = pricing?.basic.period ?? '月';

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(160deg, #f0f4ff 0%, #fafafa 60%)' }}>
      {/* Hero Header */}
      <div style={{
        background: 'linear-gradient(135deg, #1e40af 0%, #4f46e5 50%, #7c3aed 100%)',
        padding: '3rem 1rem 5rem',
        textAlign: 'center',
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'radial-gradient(circle at 20% 50%, rgba(255,255,255,0.06) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(255,255,255,0.08) 0%, transparent 40%)',
        }} />
        <div style={{ position: 'relative', maxWidth: '600px', margin: '0 auto' }}>
          <a href="/" style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.375rem',
            fontSize: '0.875rem', color: 'rgba(255,255,255,0.75)', textDecoration: 'none',
            marginBottom: '1.5rem',
          }}>
            ← 返回首页
          </a>
          <h1 style={{ fontSize: '2rem', fontWeight: 800, color: 'white', marginBottom: '0.75rem', letterSpacing: '-0.025em' }}>
            📈 升级会员，解锁专业分析
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: '1.05rem', lineHeight: 1.6 }}>
            AI 驱动的全市场技术分析，每天更多次数、更深洞见
          </p>
          {tier && (
            <div style={{ marginTop: '1.25rem' }}>
              <span className={`badge badge-${tier}`} style={{ fontSize: '0.8rem', padding: '0.3rem 0.9rem' }}>
                当前：{tier === 'free' ? '免费版' : tier === 'basic' ? '标准版' : '专业版'}
              </span>
              {tier === 'premium' && (
                <span style={{ marginLeft: '0.75rem', fontSize: '0.875rem', color: '#86efac', fontWeight: 600 }}>
                  ✓ 您已是最高等级会员
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Pricing Cards — overlapping the hero */}
      <div style={{ maxWidth: '980px', margin: '-3rem auto 0', padding: '0 1rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem', alignItems: 'start' }}>

          {/* Free */}
          <div className="card" style={{
            border: tier === 'free' ? '2px solid var(--primary)' : '1px solid var(--border)',
            position: 'relative',
          }}>
            {tier === 'free' && <PillLabel text="当前版本" color="#2563eb" />}
            <TierHeader name="免费版" emoji="🆓" price="0" period={period} limit={1} color="#64748b" />
            <FeatureList items={featuresFor('free')} type="check" />
            <FeatureList items={missingFor('free')} type="cross" />
            <div style={{ marginTop: '1.5rem' }}>
              {user ? (
                <button className="btn btn-secondary" style={{ width: '100%' }} disabled>
                  {tier === 'free' ? '当前版本' : '已升级'}
                </button>
              ) : (
                <a href="/register" className="btn btn-secondary"
                  style={{ width: '100%', display: 'block', textAlign: 'center', textDecoration: 'none' }}>
                  免费注册
                </a>
              )}
            </div>
          </div>

          {/* Basic — recommended */}
          <div className="card" style={{
            border: '2px solid #f59e0b',
            position: 'relative',
            transform: 'translateY(-0.5rem)',
            boxShadow: '0 8px 30px rgba(245,158,11,0.2)',
          }}>
            <PillLabel text={tier === 'basic' ? '当前版本' : '🔥 推荐'} color={tier === 'basic' ? '#2563eb' : '#f59e0b'} />
            <TierHeader name="标准版" emoji="⭐" price={basicPrice} period={period} limit={basicLimit} color="#d97706" />
            <FeatureList items={featuresFor('basic')} type="check" />
            <FeatureList items={missingFor('basic')} type="cross" />
            <div style={{ marginTop: '1.5rem' }}>
              {user ? (
                <button
                  className={tier === 'basic' ? 'btn btn-secondary' : 'btn btn-primary'}
                  style={{ width: '100%', background: tier === 'basic' ? undefined : '#f59e0b', borderColor: tier === 'basic' ? undefined : '#f59e0b' }}
                  onClick={() => handleUpgrade('basic')}
                  disabled={tier === 'basic' || tier === 'premium'}
                >
                  {tier === 'basic' ? '当前版本' : tier === 'premium' ? '已是更高等级' : '前往爱发电订阅 →'}
                </button>
              ) : (
                <a href="/register" className="btn btn-primary"
                  style={{ width: '100%', display: 'block', textAlign: 'center', textDecoration: 'none', background: '#f59e0b' }}>
                  注册后订阅
                </a>
              )}
            </div>
          </div>

          {/* Premium */}
          <div className="card" style={{
            border: tier === 'premium' ? '2px solid #7c3aed' : '1px solid #ddd6fe',
            position: 'relative',
            background: 'linear-gradient(160deg, #faf5ff 0%, #ffffff 100%)',
          }}>
            {tier === 'premium' && <PillLabel text="当前版本" color="#7c3aed" />}
            <TierHeader name="专业版" emoji="👑" price={premiumPrice} period={period} limit={premiumLimit} color="#7c3aed" />
            <FeatureList items={featuresFor('premium')} type="check" />
            <FeatureList items={missingFor('premium')} type="cross" />
            <div style={{ marginTop: '1.5rem' }}>
              {user ? (
                <button
                  className="btn"
                  style={{ width: '100%', background: tier === 'premium' ? '#f3f4f6' : 'linear-gradient(135deg, #7c3aed, #4f46e5)', color: tier === 'premium' ? 'var(--muted)' : 'white', border: 'none' }}
                  onClick={() => handleUpgrade('premium')}
                  disabled={tier === 'premium'}
                >
                  {tier === 'premium' ? '当前版本' : '前往爱发电订阅 →'}
                </button>
              ) : (
                <a href="/register" className="btn"
                  style={{ width: '100%', display: 'block', textAlign: 'center', textDecoration: 'none', background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', color: 'white' }}>
                  注册后订阅
                </a>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* Not logged in prompt */}
      {!user && (
        <div style={{ maxWidth: '560px', margin: '2rem auto 0', padding: '0 1rem' }}>
          <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '0.75rem', padding: '1rem', textAlign: 'center' }}>
            <p style={{ fontSize: '0.9rem', color: '#1e40af' }}>
              💡 <a href="/login" style={{ color: '#1d4ed8', fontWeight: 600 }}>登录</a> 或 <a href="/register" style={{ color: '#1d4ed8', fontWeight: 600 }}>注册</a> 后即可订阅升级
            </p>
          </div>
        </div>
      )}

      {/* How to subscribe */}
      <div style={{ maxWidth: '640px', margin: '3rem auto 0', padding: '0 1rem', textAlign: 'center' }}>
        <h2 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '1rem' }}>如何订阅？</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem', textAlign: 'center' }}>
          {[
            { step: '1', title: '选择套餐', desc: '点击「前往爱发电订阅」' },
            { step: '2', title: '填写订单号', desc: '付款后复制爱发电订单号' },
            { step: '3', title: '激活订阅', desc: '在下方表单输入订单号激活' },
          ].map(({ step, title, desc }) => (
            <div key={step} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
              <div style={{
                width: '2.25rem', height: '2.25rem', borderRadius: '50%',
                background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', color: 'white',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 700, fontSize: '0.9rem',
              }}>{step}</div>
              <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{title}</div>
              <div style={{ fontSize: '0.775rem', color: 'var(--muted)' }}>{desc}</div>
            </div>
          ))}
        </div>
        <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: '1rem' }}>
          支持 支付宝 / 微信支付 · 订阅即时生效
        </p>
      </div>

      {/* Activation Form */}
      {user && (
        <div style={{ maxWidth: '520px', margin: '2.5rem auto 0', padding: '0 1rem' }}>
          <div className="card" style={{ border: '1px solid #e0e7ff', background: '#fafbff' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.375rem' }}>
              🎉 已付款？输入订单号激活
            </h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: '1.25rem' }}>
              在爱发电完成付款后，复制订单号填入下方，系统自动验证并即时激活。
            </p>

            {activateResult ? (
              <div style={{ background: '#dcfce7', border: '1px solid #86efac', borderRadius: '0.75rem', padding: '1.5rem', textAlign: 'center' }}>
                <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>✅</div>
                <div style={{ fontWeight: 700, color: '#166534', fontSize: '1rem' }}>订阅激活成功！</div>
                <div style={{ fontSize: '0.875rem', color: '#15803d', marginTop: '0.375rem' }}>
                  当前等级：{activateResult.tier === 'premium' ? '👑 专业版' : '⭐ 标准版'}
                </div>
                <button className="btn btn-primary" style={{ marginTop: '1rem' }} onClick={() => router.push('/')}>
                  返回主页
                </button>
              </div>
            ) : (
              <form onSubmit={handleActivate}>
                <div className="form-group">
                  <label className="label">爱发电订单号</label>
                  <input
                    className="input"
                    placeholder="例：202506231234567890123456789"
                    value={orderNo}
                    onChange={(e) => setOrderNo(e.target.value)}
                    required
                  />
                  <p style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: '0.375rem' }}>
                    在爱发电「我的订单」页面可以找到订单号
                  </p>
                </div>
                <div className="form-group" style={{ marginTop: '0.5rem' }}>
                  <label className="label">Device ID <span style={{ fontWeight: 400, color: 'var(--muted)' }}>（自动填入）</span></label>
                  <input className="input" value={deviceId || '加载中...'} readOnly
                    style={{ background: '#f1f5f9', color: 'var(--muted)', fontSize: '0.8rem' }} />
                </div>
                {activateError && (
                  <div className="error" style={{ marginTop: '0.5rem' }}>⚠️ {activateError}</div>
                )}
                <button type="submit" className="btn btn-primary" disabled={activating || !deviceId}
                  style={{ width: '100%', marginTop: '0.75rem' }}>
                  {activating ? '验证中...' : '验证并激活订阅'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      <div style={{ height: '3rem' }} />
    </div>
  );
}

// ── Helper sub-components ─────────────────────────────────────────────────────

function PillLabel({ text, color, top = '-12px' }: { text: string; color: string; top?: string }) {
  return (
    <div style={{
      position: 'absolute',
      top,
      left: '50%',
      transform: 'translateX(-50%)',
      background: color,
      color: 'white',
      padding: '0.2rem 0.9rem',
      borderRadius: '9999px',
      fontSize: '0.7rem',
      fontWeight: 700,
      whiteSpace: 'nowrap',
    }}>
      {text}
    </div>
  );
}

function TierHeader({ name, emoji, price, period, limit, color }: {
  name: string; emoji: string; price: string; period: string; limit: number; color: string;
}) {
  return (
    <div style={{ textAlign: 'center', marginBottom: '1.5rem', paddingTop: '0.5rem' }}>
      <div style={{ fontSize: '1.75rem', marginBottom: '0.375rem' }}>{emoji}</div>
      <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color, marginBottom: '0.5rem' }}>{name}</h3>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: '0.2rem' }}>
        <span style={{ fontSize: '0.875rem', color: 'var(--muted)' }}>¥</span>
        <span style={{ fontSize: '2.25rem', fontWeight: 800, color: 'var(--foreground)' }}>{price}</span>
        <span style={{ fontSize: '0.875rem', color: 'var(--muted)' }}>/{period}</span>
      </div>
      <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: '0.25rem' }}>
        每天 <strong style={{ color: 'var(--foreground)' }}>{limit}</strong> 次分析
      </p>
    </div>
  );
}

function FeatureList({ items, type }: { items: string[]; type: 'check' | 'cross' }) {
  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
      {items.map((item, i) => (
        <li key={i} style={{
          display: 'flex', alignItems: 'flex-start', gap: '0.5rem',
          fontSize: '0.85rem', padding: '0.3rem 0',
          color: type === 'check' ? 'var(--foreground)' : 'var(--muted)',
          borderBottom: i < items.length - 1 ? '1px solid #f1f5f9' : 'none',
        }}>
          <span style={{ color: type === 'check' ? '#22c55e' : '#cbd5e1', fontWeight: 700, flexShrink: 0, marginTop: '0.05rem' }}>
            {type === 'check' ? '✓' : '✗'}
          </span>
          {item.trim()}
        </li>
      ))}
    </ul>
  );
}
