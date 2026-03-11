'use client';

import { useEffect, useRef, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/lib/store';
import { activateAfdianOrder, getPricing, getAppConfig, PricingData, FeatureItem } from '@/lib/api';

function UpgradePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, checkAuth } = useAuthStore();
  const [deviceId, setDeviceId] = useState('');
  const [pricing, setPricing] = useState<PricingData | null>(null);
  const [afdianBasicLink, setAfdianBasicLink] = useState('https://afdian.net');
  const [afdianPremiumLink, setAfdianPremiumLink] = useState('https://afdian.net');

  const [orderNo, setOrderNo] = useState('');
  const [activating, setActivating] = useState(false);
  const [activateResult, setActivateResult] = useState<{ tier: string; expires_at?: string } | null>(null);
  const [activateError, setActivateError] = useState('');

  // Determine initial card index from URL param: ?tier=basic → 1, ?tier=premium → 2
  const tierParam = searchParams.get('tier') || searchParams.get('plan');
  const initialCardIdx = tierParam === 'premium' ? 2 : tierParam === 'basic' ? 1 : 1;
  const [pricingCardIdx, setPricingCardIdx] = useState(initialCardIdx);
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

  useEffect(() => {
    const el = swipeRef.current;
    if (!el) return;
    const targetIdx = tierParam === 'premium' ? 2 : tierParam === 'basic' ? 1 : 1;
    const child = el.children[targetIdx] as HTMLElement;
    if (child) {
      setTimeout(() => {
        el.scrollTo({ left: child.offsetLeft - (el.clientWidth - child.clientWidth) / 2, behavior: 'instant' as ScrollBehavior });
      }, 50);
    }
  }, [tierParam]);

  const handleSwipeScroll = () => {
    const el = swipeRef.current;
    if (!el) return;
    const cardW = (el.children[0] as HTMLElement)?.clientWidth ?? el.clientWidth * 0.85;
    const idx = Math.round(el.scrollLeft / (cardW + 12));
    setPricingCardIdx(Math.max(0, Math.min(2, idx)));
  };

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderNo.trim()) return;
    // Require either login (for account binding) or device_id (for guest)
    if (!user) {
      setActivateError('请先登录账号后再激活订阅');
      return;
    }
    setActivating(true);
    setActivateError('');
    setActivateResult(null);
    try {
      // If logged in: no need to pass device_id (server uses auth token to bind to account)
      // If guest: pass device_id
      const payload = user
        ? { out_trade_no: orderNo.trim() }
        : { out_trade_no: orderNo.trim(), device_id: deviceId };
      const result = await activateAfdianOrder(payload);
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
      {/* ── Nav Bar ── */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'rgba(249,249,249,0.94)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        borderBottom: '0.5px solid rgba(0,0,0,0.12)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 16px', height: '44px',
      }}>
        <a href="/" style={{ fontSize: '17px', color: '#007aff', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '2px' }}>
          ‹ 返回
        </a>
        <span style={{ fontSize: '17px', fontWeight: 600, color: '#000' }}>解锁权益</span>
        {tier ? (
          <span style={{ fontSize: '12px', fontWeight: 600, padding: '2px 8px', borderRadius: '9999px',
            background: tier === 'premium' ? '#f3e8ff' : tier === 'basic' ? '#dbeafe' : '#f2f2f7',
            color: tier === 'premium' ? '#7c3aed' : tier === 'basic' ? '#1d4ed8' : '#8e8e93',
          }}>
            {tier === 'free' ? '免费版' : tier === 'basic' ? '标准版' : '专业版'}
          </span>
        ) : <span style={{ width: 40 }} />}
      </div>

      {/* ── Hero ── */}
      <div style={{
        background: 'linear-gradient(160deg, #0f0c29 0%, #1a1040 45%, #24243e 100%)',
        padding: '36px 24px 32px', textAlign: 'center', position: 'relative', overflow: 'hidden',
      }}>
        {/* Ambient glows */}
        <div style={{ position: 'absolute', top: '-40px', left: '50%', transform: 'translateX(-50%)', width: '280px', height: '280px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(124,58,237,0.25) 0%, transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: '-20px', right: '-20px', width: '160px', height: '160px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(0,122,255,0.18) 0%, transparent 70%)', pointerEvents: 'none' }} />

        {tier === 'premium' ? (
          <>
            <div style={{ width: 60, height: 60, borderRadius: '18px', background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', margin: '0 auto 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '30px', boxShadow: '0 8px 32px rgba(124,58,237,0.4)' }}>👑</div>
            <h1 style={{ fontSize: '26px', fontWeight: 800, color: '#fff', letterSpacing: '-0.5px', marginBottom: '8px' }}>您已是专业版会员</h1>
            <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.5)', lineHeight: 1.6 }}>享有全部权益 · 每天 {premiumLimit} 次深度研判</p>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginBottom: '20px' }}>
              <div style={{ width: 48, height: 48, borderRadius: '14px', background: 'rgba(0,122,255,0.25)', border: '1px solid rgba(0,122,255,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px' }}>📊</div>
              <div style={{ display: 'flex', alignItems: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '18px' }}>›</div>
              <div style={{ width: 48, height: 48, borderRadius: '14px', background: 'linear-gradient(135deg, rgba(124,58,237,0.6), rgba(79,70,229,0.6))', border: '1px solid rgba(124,58,237,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', boxShadow: '0 4px 20px rgba(124,58,237,0.3)' }}>👑</div>
            </div>
            <h1 style={{ fontSize: '26px', fontWeight: 800, color: '#fff', letterSpacing: '-0.5px', marginBottom: '8px' }}>
              {tier === 'basic' ? '升级专业版' : '解锁专业研判'}
            </h1>
            <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.55)', lineHeight: 1.7, maxWidth: '300px', margin: '0 auto' }}>
              AI 驱动 · 全市场覆盖<br />每天最多 {premiumLimit} 次深度研判
            </p>
            {!user && (
              <div style={{ marginTop: '20px', display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.22)', padding: '8px 18px', borderRadius: '9999px' }}>
                <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.75)' }}>订阅需先登录</span>
                <a href="/register" style={{ fontSize: '13px', fontWeight: 700, color: '#93c5fd', textDecoration: 'none' }}>免费注册 →</a>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── DESKTOP: Pricing Cards grid ── */}
      <div className="desktop-only" style={{ maxWidth: '980px', margin: '0 auto', padding: '2rem 1rem 2rem' }}>
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
            <PillLabel text={tier === 'basic' ? '当前版本' : '推荐'} color="#007aff" />
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
            {(!tier || tier === 'free' || tier === 'basic') && <PillLabel text="✨ 最高权益" color="#7c3aed" />}
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
      <div className="mobile-only" style={{ flexDirection: 'column', paddingBottom: '4px', marginTop: '20px' }}>
        <div
          ref={swipeRef}
          className="pricing-swipe-container"
          onScroll={handleSwipeScroll}
          style={{ padding: '8px 16px 16px', gap: '12px' }}
        >
          {/* Free */}
          <div className="pricing-swipe-card" style={{
            background: 'white', borderRadius: '20px', padding: '24px 20px 20px',
            border: tier === 'free' ? '2px solid #007aff' : '1px solid rgba(0,0,0,0.08)',
            position: 'relative', boxShadow: '0 2px 12px rgba(0,0,0,0.05)',
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
          <div className="pricing-swipe-card" style={{ position: 'relative', paddingTop: '10px' }}>
            {/* Pill outside overflow:hidden so it's never clipped */}
            <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', background: 'white', color: '#007aff', padding: '2px 12px', borderRadius: '9999px', fontSize: '11px', fontWeight: 700, letterSpacing: '0.2px', boxShadow: '0 2px 8px rgba(0,0,0,0.2)', zIndex: 2, whiteSpace: 'nowrap' }}>
              {tier === 'basic' ? '当前版本' : '推荐'}
            </div>
            <div style={{ borderRadius: '20px', overflow: 'hidden', border: '2px solid #007aff', boxShadow: '0 6px 28px rgba(0,122,255,0.2)', background: 'white' }}>
            {/* Blue header band */}
            <div style={{ background: 'linear-gradient(135deg, #007aff 0%, #3b9eff 100%)', padding: '18px 20px 20px', textAlign: 'center', position: 'relative' }}>
              <div style={{ fontSize: '28px', marginBottom: '6px', marginTop: '0px', lineHeight: 1 }}>📊</div>
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'white', marginBottom: '4px' }}>标准版</h3>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: '2px' }}>
                <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)' }}>¥</span>
                <span style={{ fontSize: '34px', fontWeight: 800, color: 'white', letterSpacing: '-1px' }}>{basicPrice}</span>
                <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)' }}>/{period}</span>
              </div>
              <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)', marginTop: '4px' }}>每天 <strong style={{ color: 'white', fontWeight: 700 }}>{basicLimit}</strong> 次分析</p>
            </div>
            <div style={{ padding: '16px 20px 20px' }}>
              <FeatureList items={featuresFor('basic')} type="check" />
              <FeatureList items={missingFor('basic')} type="cross" />
              <div style={{ marginTop: '20px' }}>
                {user
                  ? <button
                      style={{ width: '100%', height: 50, borderRadius: '12px', border: 'none', background: tier === 'basic' || tier === 'premium' ? '#f2f2f7' : '#007aff', color: tier === 'basic' || tier === 'premium' ? '#8e8e93' : 'white', fontSize: '15px', fontWeight: 700, cursor: tier === 'basic' || tier === 'premium' ? 'default' : 'pointer', letterSpacing: '-0.2px' }}
                      onClick={() => handleUpgrade('basic')}
                      disabled={tier === 'basic' || tier === 'premium'}
                    >{tier === 'basic' ? '当前版本' : tier === 'premium' ? '已是更高等级' : '前往爱发电订阅 →'}</button>
                  : <a href="/register" style={{ width: '100%', height: 50, borderRadius: '12px', background: '#007aff', color: 'white', fontSize: '15px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>注册后订阅</a>
                }
              </div>
            </div>
            </div>{/* /inner card */}
          </div>

          {/* Premium */}
          <div className="pricing-swipe-card" style={{ position: 'relative', paddingTop: '10px' }}>
            {/* Pill outside overflow:hidden */}
            {(tier === 'premium')
              ? <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', background: '#7c3aed', color: 'white', padding: '2px 12px', borderRadius: '9999px', fontSize: '11px', fontWeight: 700, letterSpacing: '0.2px', boxShadow: '0 2px 8px rgba(0,0,0,0.25)', zIndex: 2, whiteSpace: 'nowrap' }}>当前版本</div>
              : <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', background: 'linear-gradient(90deg, #f59e0b, #fbbf24)', color: '#000', padding: '2px 12px', borderRadius: '9999px', fontSize: '11px', fontWeight: 800, letterSpacing: '0.2px', boxShadow: '0 2px 8px rgba(0,0,0,0.2)', zIndex: 2, whiteSpace: 'nowrap' }}>✨ 最高权益</div>
            }
            <div style={{ borderRadius: '20px', overflow: 'hidden', border: tier === 'premium' ? '2px solid #7c3aed' : '1.5px solid #c4b5fd', boxShadow: '0 6px 28px rgba(124,58,237,0.18)', background: 'white' }}>
            {/* Dark purple header band */}
            <div style={{ background: 'linear-gradient(135deg, #1e0a3c 0%, #3b1d8a 50%, #4f46e5 100%)', padding: '18px 20px 20px', textAlign: 'center', position: 'relative' }}>
              {/* Stars decoration */}
              <div style={{ position: 'absolute', top: 8, left: 16, fontSize: '10px', opacity: 0.5 }}>✦</div>
              <div style={{ position: 'absolute', top: 18, right: 20, fontSize: '8px', opacity: 0.4 }}>✦</div>
              <div style={{ position: 'absolute', bottom: 10, left: '30%', fontSize: '7px', opacity: 0.35 }}>✦</div>
              <div style={{ fontSize: '28px', marginBottom: '6px', marginTop: '0px', lineHeight: 1 }}>👑</div>
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'white', marginBottom: '4px' }}>专业版</h3>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: '2px' }}>
                <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)' }}>¥</span>
                <span style={{ fontSize: '34px', fontWeight: 800, color: 'white', letterSpacing: '-1px' }}>{premiumPrice}</span>
                <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)' }}>/{period}</span>
              </div>
              <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)', marginTop: '4px' }}>每天 <strong style={{ color: '#c4b5fd', fontWeight: 700 }}>{premiumLimit}</strong> 次分析</p>
            </div>
            <div style={{ padding: '16px 20px 20px' }}>
              <FeatureList items={featuresFor('premium')} type="check" />
              <FeatureList items={missingFor('premium')} type="cross" />
              <div style={{ marginTop: '20px' }}>
                {user
                  ? <button
                      style={{ width: '100%', height: 50, borderRadius: '12px', border: 'none', background: tier === 'premium' ? '#f2f2f7' : 'linear-gradient(135deg, #7c3aed, #4f46e5)', color: tier === 'premium' ? '#8e8e93' : 'white', fontSize: '15px', fontWeight: 700, cursor: tier === 'premium' ? 'default' : 'pointer' }}
                      onClick={() => handleUpgrade('premium')}
                      disabled={tier === 'premium'}
                    >{tier === 'premium' ? '当前版本' : '前往爱发电订阅 →'}</button>
                  : <a href="/register" style={{ width: '100%', height: 50, borderRadius: '12px', background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', color: 'white', fontSize: '15px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>注册后订阅</a>
                }
              </div>
            </div>
            </div>{/* /inner card */}
          </div>
        </div>

        {/* Pagination dots */}
        <div className="pricing-dots" style={{ display: 'flex', marginTop: '4px' }}>
          {[0, 1, 2].map(i => (
            <div key={i} className={`pricing-dot${pricingCardIdx === i ? ' active' : ''}`} />
          ))}
        </div>
      </div>

      {/* Payment note */}
      <div style={{ padding: '12px 16px 0', textAlign: 'center' }}>
        <p style={{ fontSize: '12px', color: '#aeaeb2' }}>支付宝 · 微信支付 · 订阅后填入订单号即时生效</p>
      </div>

      {/* ── How to subscribe ── */}
      <div style={{ padding: '28px 16px 0' }}>
        <p style={{ fontSize: '12px', fontWeight: 600, color: '#8e8e93', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px', paddingLeft: '4px' }}>
          如何订阅
        </p>
        <div style={{ background: 'white', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 1px 6px rgba(0,0,0,0.04)' }}>
          {[
            { num: '1', icon: '🛒', title: '选择套餐', desc: '点击「前往爱发电订阅」按钮' },
            { num: '2', icon: '💳', title: '完成支付', desc: '支持支付宝 · 微信支付' },
            { num: '3', icon: '📋', title: '复制订单号', desc: '在爱发电「我的订单」页面获取' },
            { num: '4', icon: '✅', title: '激活订阅', desc: '在下方输入订单号，即时生效' },
          ].map(({ num, icon, title, desc }, i, arr) => (
            <div key={num}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 16px' }}>
                <div style={{
                  width: 40, height: 40, borderRadius: '12px', flexShrink: 0,
                  background: 'linear-gradient(135deg, #007aff 0%, #34aadc 100%)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px',
                  boxShadow: '0 2px 8px rgba(0,122,255,0.2)',
                }}>
                  {icon}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '15px', fontWeight: 600, color: '#000', marginBottom: '2px' }}>{title}</div>
                  <div style={{ fontSize: '13px', color: '#8e8e93' }}>{desc}</div>
                </div>
                <div style={{
                  width: 22, height: 22, borderRadius: '50%',
                  background: '#f2f2f7', border: '1.5px solid #e5e5ea',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '11px', fontWeight: 700, color: '#8e8e93', flexShrink: 0,
                }}>{num}</div>
              </div>
              {i < arr.length - 1 && <div style={{ height: '0.5px', background: 'rgba(60,60,67,0.1)', margin: '0 0 0 70px' }} />}
            </div>
          ))}
        </div>
      </div>

      {/* ── Activation Form ── */}
      <div style={{ padding: '24px 16px 0' }}>
        <p style={{ fontSize: '12px', fontWeight: 600, color: '#8e8e93', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px', paddingLeft: '4px' }}>
          激活订阅
        </p>
        {!user ? (
          <div style={{
            background: 'white', borderRadius: 16, padding: '20px',
            textAlign: 'center',
            boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
          }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🔒</div>
            <p style={{ fontSize: 15, fontWeight: 600, color: '#000', margin: '0 0 6px' }}>请先登录账号</p>
            <p style={{ fontSize: 13, color: '#8e8e93', margin: '0 0 16px' }}>激活订阅需要绑定到您的账号</p>
            <a href="/login" style={{
              display: 'inline-block', padding: '10px 24px',
              background: '#007aff', color: 'white', borderRadius: 10,
              fontSize: 15, fontWeight: 600, textDecoration: 'none',
            }}>去登录</a>
          </div>
        ) : (
          <div style={{ background: 'white', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 1px 6px rgba(0,0,0,0.04)' }}>
            {activateResult ? (
              <div style={{ padding: '36px 20px', textAlign: 'center' }}>
                <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'linear-gradient(135deg, #34c759, #30d158)', margin: '0 auto 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px', boxShadow: '0 4px 20px rgba(52,199,89,0.3)' }}>✓</div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: '#000', marginBottom: '6px' }}>订阅激活成功！</div>
                <div style={{ fontSize: '14px', color: '#8e8e93', marginBottom: activateResult.expires_at ? '8px' : '28px' }}>
                  当前等级：{activateResult.tier === 'premium' ? '👑 专业版' : '📊 标准版'}
                </div>
                {activateResult.expires_at && (
                  <div style={{ fontSize: '13px', color: '#8e8e93', marginBottom: '28px' }}>
                    有效期至：{new Date(activateResult.expires_at).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })}
                  </div>
                )}
                <button
                  onClick={() => router.push('/')}
                  style={{ width: '100%', height: 50, borderRadius: '12px', border: 'none', background: '#007aff', color: 'white', fontSize: '17px', fontWeight: 600, cursor: 'pointer' }}
                >返回首页</button>
              </div>
            ) : (
              <form onSubmit={handleActivate} style={{ padding: '20px 16px 16px' }}>
                {/* Account binding notice */}
                <div style={{ background: '#f0f9ff', borderRadius: '10px', padding: '10px 14px', marginBottom: '16px', fontSize: '13px', color: '#0369a1', display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
                  <span style={{ flexShrink: 0 }}>🔗</span>
                  <span>订阅将绑定到您的账号 <strong>{user?.email}</strong>，换设备后仍可使用</span>
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <label style={{ fontSize: '13px', fontWeight: 600, color: '#3c3c43', display: 'block', marginBottom: '8px' }}>
                    爱发电订单号
                  </label>
                  <input
                    style={{ width: '100%', height: 48, borderRadius: '12px', border: '1px solid rgba(60,60,67,0.18)', background: '#f2f2f7', padding: '0 14px', fontSize: '15px', color: '#000', boxSizing: 'border-box', outline: 'none' }}
                    placeholder="例：202506231234567890123456789"
                    value={orderNo}
                    onChange={(e) => setOrderNo(e.target.value)}
                    required
                  />
                  <p style={{ fontSize: '12px', color: '#8e8e93', marginTop: '6px', paddingLeft: '2px' }}>在爱发电「我的订单」页面可以找到订单号</p>
                </div>

                {activateError && (
                  <div style={{ background: '#fff2f2', borderRadius: '10px', padding: '10px 14px', marginBottom: '14px', fontSize: '13px', color: '#dc2626', display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
                    <span style={{ flexShrink: 0 }}>⚠️</span>
                    <span>{activateError}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={activating}
                  style={{ width: '100%', height: 50, borderRadius: '12px', border: 'none', background: activating ? '#c7c7cc' : '#007aff', color: 'white', fontSize: '17px', fontWeight: 600, cursor: activating ? 'default' : 'pointer', transition: 'background 0.15s' }}
                >
                  {activating ? '验证中...' : '验证并激活'}
                </button>
              </form>
            )}
          </div>
        )}
      </div>

      {/* Not logged in prompt */}
      {!user && (
        <div style={{ padding: '20px 16px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <a href="/register" style={{
            display: 'block', width: '100%', height: 50, borderRadius: 12,
            background: '#007aff', color: 'white', fontSize: 17, fontWeight: 600,
            textDecoration: 'none', textAlign: 'center', lineHeight: '50px',
            boxSizing: 'border-box',
          }}>免费注册，开始使用</a>
          <p style={{ textAlign: 'center', fontSize: 14, color: '#8e8e93', margin: 0 }}>
            已有账号？{' '}
            <a href="/login" style={{ color: '#007aff', fontWeight: 600, textDecoration: 'none' }}>登录</a>
          </p>
        </div>
      )}

      <div style={{ height: '48px' }} />
    </div>
  );
}

export default function UpgradePage() {
  return (
    <Suspense fallback={null}>
      <UpgradePageInner />
    </Suspense>
  );
}

// ── Helper sub-components ─────────────────────────────────────────────────────

function PillLabel({ text, color, top = '-10px' }: { text: string; color: string; top?: string }) {
  return (
    <div style={{ position: 'absolute', top, left: '50%', transform: 'translateX(-50%)', background: color, color: 'white', padding: '3px 12px', borderRadius: '9999px', fontSize: '11px', fontWeight: 700, whiteSpace: 'nowrap', letterSpacing: '0.2px', zIndex: 1 }}>
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
          color: type === 'check' ? '#1c1c1e' : '#aeaeb2',
          borderBottom: i < items.length - 1 ? '0.5px solid rgba(60,60,67,0.08)' : 'none',
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
