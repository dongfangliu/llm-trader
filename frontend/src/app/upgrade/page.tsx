'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/store';
import { activateAfdianOrder, getPricing, getAppConfig, PricingData, FeatureItem } from '@/lib/api';

export default function UpgradePage() {
  const router = useRouter();
  const { user, checkAuth } = useAuthStore();
  const [deviceId, setDeviceId] = useState('');
  const [pricing, setPricing] = useState<PricingData | null>(null);
  const [afdianBasicLink, setAfdianBasicLink] = useState('https://afdian.net');
  const [afdianPremiumLink, setAfdianPremiumLink] = useState('https://afdian.net');

  // Activation form state
  const [orderNo, setOrderNo] = useState('');
  const [activating, setActivating] = useState(false);
  const [activateResult, setActivateResult] = useState<{ tier: string } | null>(null);
  const [activateError, setActivateError] = useState('');

  // Mobile swipe pagination state
  const [pricingCardIdx, setPricingCardIdx] = useState(1); // default to recommended (basic)
  const swipeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    checkAuth();
    const id = localStorage.getItem('device_id') || '';
    setDeviceId(id);
    getPricing().then(setPricing).catch(() => {});
    getAppConfig().then(c => {
      if (c.afdian_basic_link) setAfdianBasicLink(c.afdian_basic_link);
      if (c.afdian_premium_link) setAfdianPremiumLink(c.afdian_premium_link);
    }).catch(() => {});
  }, []);

  // Scroll to recommended card (index 1) on mount
  useEffect(() => {
    const el = swipeRef.current;
    if (!el) return;
    const child = el.children[1] as HTMLElement;
    if (child) {
      setTimeout(() => {
        el.scrollTo({ left: child.offsetLeft - (el.clientWidth - child.clientWidth) / 2, behavior: 'instant' as ScrollBehavior });
      }, 50);
    }
  }, []);

  const handleSwipeScroll = () => {
    const el = swipeRef.current;
    if (!el) return;
    const cardW = (el.children[0] as HTMLElement)?.clientWidth ?? el.clientWidth * 0.88;
    const idx = Math.round(el.scrollLeft / (cardW + 16));
    setPricingCardIdx(Math.max(0, Math.min(2, idx)));
  };

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

  const handleUpgrade = (t: string) => {
    const link = t === 'basic' ? afdianBasicLink : afdianPremiumLink;
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
  const freeLimit = pricing?.free?.daily_limit ?? 3;
  const guestLimit = pricing?.guest?.daily_limit ?? 1;

  return (
    <div style={{ minHeight: '100vh', background: '#f2f2f7' }}>
      {/* ── iOS-style Nav Bar ── */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'rgba(249,249,249,0.94)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        borderBottom: '0.5px solid rgba(0,0,0,0.12)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 16px', height: '44px',
      }}>
        <a href="/" style={{ fontSize: '17px', color: '#007aff', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}>
          ‹ 返回
        </a>
        <span style={{ fontSize: '17px', fontWeight: 600, color: '#000' }}>升级订阅</span>
        {tier && (
          <span style={{ fontSize: '13px', color: tier === 'premium' ? '#7c3aed' : tier === 'basic' ? '#007aff' : '#8e8e93' }}>
            {tier === 'free' ? '免费版' : tier === 'basic' ? '标准版' : '专业版'}
          </span>
        )}
        {!tier && <span style={{ width: 40 }} />}
      </div>

      {/* ── Hero ── */}
      <div style={{ padding: '32px 24px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: '48px', marginBottom: '12px', lineHeight: 1 }}>📈</div>
        <h1 style={{ fontSize: '28px', fontWeight: 800, color: '#000', letterSpacing: '-0.5px', marginBottom: '8px' }}>
          解锁专业分析
        </h1>
        <p style={{ fontSize: '15px', color: '#8e8e93', lineHeight: 1.6, maxWidth: '280px', margin: '0 auto' }}>
          AI 驱动 · 全市场覆盖 · 深度技术研判
        </p>
        {tier === 'premium' && (
          <div style={{ marginTop: '12px', display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#f3e8ff', padding: '6px 14px', borderRadius: '9999px' }}>
            <span style={{ fontSize: '14px' }}>👑</span>
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#7c3aed' }}>您已是最高等级会员</span>
          </div>
        )}
      </div>

      {/* ── DESKTOP: Pricing Cards grid ── */}
      <div className="desktop-only" style={{ maxWidth: '980px', margin: '0 auto', padding: '0 1rem 2rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem', alignItems: 'start' }}>
          {/* Free */}
          <div className="card" style={{ border: tier === 'free' ? '2px solid var(--primary)' : '1px solid var(--border)', position: 'relative' }}>
            {tier === 'free' && <PillLabel text="当前版本" color="#2563eb" />}
            <TierHeader name="免费版" emoji="🆓" price="0" period={period} limit={user ? freeLimit : guestLimit} color="#64748b" />
            <FeatureList items={featuresFor('free')} type="check" />
            <FeatureList items={missingFor('free')} type="cross" />
            <div style={{ marginTop: '1.5rem' }}>
              {user ? (<button className="btn btn-secondary" style={{ width: '100%' }} disabled>{tier === 'free' ? '当前版本' : '已升级'}</button>) : (<a href="/register" className="btn btn-secondary" style={{ width: '100%', display: 'block', textAlign: 'center', textDecoration: 'none' }}>免费注册</a>)}
            </div>
          </div>
          {/* Basic — recommended */}
          <div className="card" style={{ border: '2px solid #007aff', position: 'relative', transform: 'translateY(-0.5rem)', boxShadow: '0 8px 30px rgba(0,122,255,0.15)' }}>
            <PillLabel text={tier === 'basic' ? '当前版本' : '推荐'} color={tier === 'basic' ? '#007aff' : '#007aff'} />
            <TierHeader name="标准版" emoji="📊" price={basicPrice} period={period} limit={basicLimit} color="#007aff" />
            <FeatureList items={featuresFor('basic')} type="check" />
            <FeatureList items={missingFor('basic')} type="cross" />
            <div style={{ marginTop: '1.5rem' }}>
              {user ? (<button className={tier === 'basic' ? 'btn btn-secondary' : 'btn btn-primary'} style={{ width: '100%', background: tier === 'basic' ? undefined : '#007aff', borderColor: tier === 'basic' ? undefined : '#007aff' }} onClick={() => handleUpgrade('basic')} disabled={tier === 'basic' || tier === 'premium'}>{tier === 'basic' ? '当前版本' : tier === 'premium' ? '已是更高等级' : '前往爱发电订阅 →'}</button>) : (<a href="/register" className="btn btn-primary" style={{ width: '100%', display: 'block', textAlign: 'center', textDecoration: 'none', background: '#007aff' }}>注册后订阅</a>)}
            </div>
          </div>
          {/* Premium */}
          <div className="card" style={{ border: tier === 'premium' ? '2px solid #7c3aed' : '1px solid #ddd6fe', position: 'relative', background: 'linear-gradient(160deg, #faf5ff 0%, #ffffff 100%)' }}>
            {tier === 'premium' && <PillLabel text="当前版本" color="#7c3aed" />}
            <TierHeader name="专业版" emoji="👑" price={premiumPrice} period={period} limit={premiumLimit} color="#7c3aed" />
            <FeatureList items={featuresFor('premium')} type="check" />
            <FeatureList items={missingFor('premium')} type="cross" />
            <div style={{ marginTop: '1.5rem' }}>
              {user ? (<button className="btn" style={{ width: '100%', background: tier === 'premium' ? '#f3f4f6' : 'linear-gradient(135deg, #7c3aed, #4f46e5)', color: tier === 'premium' ? 'var(--muted)' : 'white', border: 'none' }} onClick={() => handleUpgrade('premium')} disabled={tier === 'premium'}>{tier === 'premium' ? '当前版本' : '前往爱发电订阅 →'}</button>) : (<a href="/register" className="btn" style={{ width: '100%', display: 'block', textAlign: 'center', textDecoration: 'none', background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', color: 'white' }}>注册后订阅</a>)}
            </div>
          </div>
        </div>
      </div>

      {/* ── MOBILE: Scroll-snap pricing cards ── */}
      <div className="mobile-only" style={{ flexDirection: 'column', paddingBottom: '8px' }}>
        <div
          ref={swipeRef}
          className="pricing-swipe-container"
          onScroll={handleSwipeScroll}
          style={{ padding: '0 16px', gap: '12px' }}
        >
          {/* Free */}
          <div className="pricing-swipe-card" style={{
            background: 'white', borderRadius: '20px', padding: '24px 20px 20px',
            border: tier === 'free' ? '2px solid #007aff' : '1px solid rgba(0,0,0,0.08)',
            position: 'relative', boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
          }}>
            {tier === 'free' && <PillLabel text="当前版本" color="#007aff" />}
            <TierHeader name="免费版" emoji="🆓" price="0" period={period} limit={user ? freeLimit : guestLimit} color="#8e8e93" />
            <FeatureList items={featuresFor('free')} type="check" />
            <FeatureList items={missingFor('free')} type="cross" />
            <div style={{ marginTop: '20px' }}>
              {user
                ? <button style={{ width: '100%', height: 48, borderRadius: '12px', border: '1px solid #e5e5ea', background: '#f2f2f7', color: '#8e8e93', fontSize: '15px', fontWeight: 600, cursor: 'default' }} disabled>{tier === 'free' ? '当前版本' : '已升级'}</button>
                : <a href="/register" style={{ width: '100%', height: 48, borderRadius: '12px', background: '#f2f2f7', color: '#007aff', fontSize: '15px', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>免费注册</a>
              }
            </div>
          </div>

          {/* Basic — recommended */}
          <div className="pricing-swipe-card" style={{
            background: 'white', borderRadius: '20px', padding: '24px 20px 20px',
            border: '2px solid #007aff', position: 'relative',
            boxShadow: '0 4px 24px rgba(0,122,255,0.18)',
          }}>
            <PillLabel text={tier === 'basic' ? '当前版本' : '推荐'} color="#007aff" />
            <TierHeader name="标准版" emoji="📊" price={basicPrice} period={period} limit={basicLimit} color="#007aff" />
            <FeatureList items={featuresFor('basic')} type="check" />
            <FeatureList items={missingFor('basic')} type="cross" />
            <div style={{ marginTop: '20px' }}>
              {user
                ? <button
                    style={{ width: '100%', height: 48, borderRadius: '12px', border: 'none', background: tier === 'basic' || tier === 'premium' ? '#f2f2f7' : '#007aff', color: tier === 'basic' || tier === 'premium' ? '#8e8e93' : 'white', fontSize: '15px', fontWeight: 600, cursor: tier === 'basic' || tier === 'premium' ? 'default' : 'pointer' }}
                    onClick={() => handleUpgrade('basic')}
                    disabled={tier === 'basic' || tier === 'premium'}
                  >{tier === 'basic' ? '当前版本' : tier === 'premium' ? '已是更高等级' : '前往爱发电订阅 →'}</button>
                : <a href="/register" style={{ width: '100%', height: 48, borderRadius: '12px', background: '#007aff', color: 'white', fontSize: '15px', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>注册后订阅</a>
              }
            </div>
          </div>

          {/* Premium */}
          <div className="pricing-swipe-card" style={{
            background: 'linear-gradient(160deg, #faf5ff 0%, #ffffff 100%)',
            borderRadius: '20px', padding: '24px 20px 20px',
            border: tier === 'premium' ? '2px solid #7c3aed' : '1.5px solid #ddd6fe',
            position: 'relative', boxShadow: '0 2px 12px rgba(124,58,237,0.08)',
          }}>
            {tier === 'premium' && <PillLabel text="当前版本" color="#7c3aed" />}
            {(!tier || tier === 'free' || tier === 'basic') && <PillLabel text="✨ 最高权益" color="#7c3aed" />}
            <TierHeader name="专业版" emoji="👑" price={premiumPrice} period={period} limit={premiumLimit} color="#7c3aed" />
            <FeatureList items={featuresFor('premium')} type="check" />
            <FeatureList items={missingFor('premium')} type="cross" />
            <div style={{ marginTop: '20px' }}>
              {user
                ? <button
                    style={{ width: '100%', height: 48, borderRadius: '12px', border: 'none', background: tier === 'premium' ? '#f2f2f7' : 'linear-gradient(135deg, #7c3aed, #4f46e5)', color: tier === 'premium' ? '#8e8e93' : 'white', fontSize: '15px', fontWeight: 600, cursor: tier === 'premium' ? 'default' : 'pointer' }}
                    onClick={() => handleUpgrade('premium')}
                    disabled={tier === 'premium'}
                  >{tier === 'premium' ? '当前版本' : '前往爱发电订阅 →'}</button>
                : <a href="/register" style={{ width: '100%', height: 48, borderRadius: '12px', background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', color: 'white', fontSize: '15px', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>注册后订阅</a>
              }
            </div>
          </div>
        </div>
        {/* Pagination dots */}
        <div className="pricing-dots" style={{ display: 'flex', marginTop: '16px' }}>
          {[0, 1, 2].map(i => (
            <div key={i} className={`pricing-dot${pricingCardIdx === i ? ' active' : ''}`} />
          ))}
        </div>
      </div>

      {/* Not logged in prompt */}
      {!user && (
        <div style={{ padding: '0 16px', marginTop: '8px' }}>
          <div style={{ background: 'rgba(0,122,255,0.06)', borderRadius: '12px', padding: '14px 16px', textAlign: 'center' }}>
            <p style={{ fontSize: '14px', color: '#007aff' }}>
              <a href="/login" style={{ color: '#007aff', fontWeight: 600, textDecoration: 'none' }}>登录</a>
              {' 或 '}
              <a href="/register" style={{ color: '#007aff', fontWeight: 600, textDecoration: 'none' }}>注册</a>
              {' 后即可订阅升级'}
            </p>
          </div>
        </div>
      )}

      {/* How to subscribe — iOS grouped list */}
      <div style={{ padding: '32px 16px 0' }}>
        <p style={{ fontSize: '12px', fontWeight: 600, color: '#8e8e93', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px', paddingLeft: '4px' }}>
          如何订阅
        </p>
        <div style={{ background: 'white', borderRadius: '12px', overflow: 'hidden' }}>
          {[
            { icon: '🛒', step: '1', title: '选择套餐', desc: '点击「前往爱发电订阅」' },
            { icon: '📋', step: '2', title: '复制订单号', desc: '付款后在爱发电订单页面复制' },
            { icon: '✅', step: '3', title: '激活订阅', desc: '在下方输入订单号，即时生效' },
          ].map(({ icon, step, title, desc }, i, arr) => (
            <div key={step}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 16px' }}>
                <div style={{ width: 36, height: 36, borderRadius: '9px', background: 'linear-gradient(135deg, #007aff, #5ac8fa)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '17px', flexShrink: 0 }}>
                  {icon}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '15px', fontWeight: 600, color: '#000' }}>{title}</div>
                  <div style={{ fontSize: '13px', color: '#8e8e93', marginTop: '1px' }}>{desc}</div>
                </div>
                <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#007aff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700, color: 'white', flexShrink: 0 }}>{step}</div>
              </div>
              {i < arr.length - 1 && <div style={{ height: '0.5px', background: 'rgba(60,60,67,0.12)', margin: '0 0 0 66px' }} />}
            </div>
          ))}
        </div>
        <p style={{ fontSize: '12px', color: '#aeaeb2', textAlign: 'center', marginTop: '10px' }}>支持 支付宝 / 微信支付 · 订阅即时生效</p>
      </div>

      {/* Activation Form */}
      {user && (
        <div style={{ padding: '24px 16px 0' }}>
          <p style={{ fontSize: '12px', fontWeight: 600, color: '#8e8e93', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px', paddingLeft: '4px' }}>
            激活订阅
          </p>
          <div style={{ background: 'white', borderRadius: '12px', overflow: 'hidden' }}>
            {activateResult ? (
              <div style={{ padding: '32px 20px', textAlign: 'center' }}>
                <div style={{ fontSize: '48px', marginBottom: '12px' }}>✅</div>
                <div style={{ fontSize: '17px', fontWeight: 700, color: '#000', marginBottom: '6px' }}>订阅激活成功！</div>
                <div style={{ fontSize: '14px', color: '#8e8e93', marginBottom: '24px' }}>当前等级：{activateResult.tier === 'premium' ? '👑 专业版' : '📊 标准版'}</div>
                <button
                  onClick={() => router.push('/')}
                  style={{ width: '100%', height: 50, borderRadius: '12px', border: 'none', background: '#007aff', color: 'white', fontSize: '17px', fontWeight: 600, cursor: 'pointer' }}
                >返回首页</button>
              </div>
            ) : (
              <form onSubmit={handleActivate} style={{ padding: '16px' }}>
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: '#8e8e93', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: '6px' }}>
                    爱发电订单号
                  </label>
                  <input
                    style={{ width: '100%', height: 44, borderRadius: '10px', border: '1px solid rgba(60,60,67,0.18)', background: '#f2f2f7', padding: '0 12px', fontSize: '15px', color: '#000', boxSizing: 'border-box' }}
                    placeholder="例：202506231234567890123456789"
                    value={orderNo}
                    onChange={(e) => setOrderNo(e.target.value)}
                    required
                  />
                  <p style={{ fontSize: '12px', color: '#8e8e93', marginTop: '4px' }}>在爱发电「我的订单」页面可以找到订单号</p>
                </div>
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: '#8e8e93', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: '6px' }}>
                    Device ID <span style={{ fontWeight: 400, textTransform: 'none' }}>（自动填入）</span>
                  </label>
                  <input
                    style={{ width: '100%', height: 44, borderRadius: '10px', border: '1px solid rgba(60,60,67,0.18)', background: '#f2f2f7', padding: '0 12px', fontSize: '13px', color: '#8e8e93', boxSizing: 'border-box' }}
                    value={deviceId || '加载中...'}
                    readOnly
                  />
                </div>
                {activateError && (
                  <div style={{ background: '#fff2f2', borderRadius: '10px', padding: '10px 12px', marginBottom: '12px', fontSize: '13px', color: '#dc2626' }}>
                    ⚠️ {activateError}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={activating || !deviceId}
                  style={{ width: '100%', height: 50, borderRadius: '12px', border: 'none', background: activating || !deviceId ? '#c7c7cc' : '#007aff', color: 'white', fontSize: '17px', fontWeight: 600, cursor: activating || !deviceId ? 'default' : 'pointer' }}
                >
                  {activating ? '验证中...' : '验证并激活订阅'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      <div style={{ height: '48px' }} />
    </div>
  );
}

// ── Helper sub-components ─────────────────────────────────────────────────────

function PillLabel({ text, color, top = '-12px' }: { text: string; color: string; top?: string }) {
  return (
    <div style={{ position: 'absolute', top, left: '50%', transform: 'translateX(-50%)', background: color, color: 'white', padding: '3px 12px', borderRadius: '9999px', fontSize: '11px', fontWeight: 700, whiteSpace: 'nowrap', letterSpacing: '0.2px' }}>
      {text}
    </div>
  );
}

function TierHeader({ name, emoji, price, period, limit, color }: {
  name: string; emoji: string; price: string; period: string; limit: number; color: string;
}) {
  return (
    <div style={{ textAlign: 'center', marginBottom: '20px', paddingTop: '8px' }}>
      <div style={{ fontSize: '32px', marginBottom: '8px', lineHeight: 1 }}>{emoji}</div>
      <h3 style={{ fontSize: '17px', fontWeight: 700, color, marginBottom: '6px' }}>{name}</h3>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: '2px' }}>
        <span style={{ fontSize: '15px', color: '#8e8e93' }}>¥</span>
        <span style={{ fontSize: '36px', fontWeight: 800, color: '#000', letterSpacing: '-1px' }}>{price}</span>
        <span style={{ fontSize: '13px', color: '#8e8e93' }}>/{period}</span>
      </div>
      <p style={{ fontSize: '13px', color: '#8e8e93', marginTop: '4px' }}>每天 <strong style={{ color: '#000', fontWeight: 600 }}>{limit}</strong> 次分析</p>
    </div>
  );
}

function FeatureList({ items, type }: { items: string[]; type: 'check' | 'cross' }) {
  if (items.length === 0) return null;
  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
      {items.map((item, i) => (
        <li key={i} style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          fontSize: '14px', padding: '9px 0',
          color: type === 'check' ? '#000' : '#aeaeb2',
          borderBottom: i < items.length - 1 ? '0.5px solid rgba(60,60,67,0.1)' : 'none',
        }}>
          <span style={{
            width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '11px', fontWeight: 700,
            background: type === 'check' ? '#34c759' : 'transparent',
            border: type === 'check' ? 'none' : '1.5px solid #d1d1d6',
            color: type === 'check' ? 'white' : '#d1d1d6',
          }}>
            {type === 'check' ? '✓' : '✗'}
          </span>
          {item.trim()}
        </li>
      ))}
    </ul>
  );
}
