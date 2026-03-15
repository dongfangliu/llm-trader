'use client';

import { type FC } from 'react';
import type { PricingData, FeatureItem } from '@/lib/api';

interface UpgradeDesktopViewProps {
  tier: string | null;
  user: any;
  pricing: PricingData | null;
  onUpgrade: (t: string) => void;
  // Activation form
  orderNo: string;
  setOrderNo: (v: string) => void;
  activating: boolean;
  activateResult: { tier: string; expires_at?: string } | null;
  activateError: string;
  onActivate: (e: React.FormEvent) => void;
  onGoHome: () => void;
}

function PillBadge({ text, color, textColor = 'white' }: { text: string; color: string; textColor?: string }) {
  return (
    <div style={{
      position: 'absolute', top: -11, left: '50%', transform: 'translateX(-50%)',
      background: color, color: textColor, padding: '2px 12px', borderRadius: 9999,
      fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', letterSpacing: '0.2px', zIndex: 1,
    }}>{text}</div>
  );
}

function FeatureRow({ items, type }: { items: string[]; type: 'check' | 'cross' }) {
  if (items.length === 0) return null;
  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
      {items.map((item, i) => (
        <li key={i} style={{
          display: 'flex', alignItems: 'center', gap: 10,
          fontSize: 13, padding: '7px 0',
          color: type === 'check' ? '#3c3c43' : '#c7c7cc',
          borderBottom: i < items.length - 1 ? '0.5px solid rgba(60,60,67,0.07)' : 'none',
        }}>
          <span style={{
            width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 10, fontWeight: 700,
            background: type === 'check' ? '#34c759' : 'transparent',
            border: type === 'check' ? 'none' : '1.5px solid #d1d1d6',
            color: type === 'check' ? 'white' : '#d1d1d6',
          }}>{type === 'check' ? '✓' : '✗'}</span>
          {item.trim()}
        </li>
      ))}
    </ul>
  );
}

const UpgradeDesktopView: FC<UpgradeDesktopViewProps> = ({
  tier, user, pricing, onUpgrade,
  orderNo, setOrderNo, activating, activateResult, activateError, onActivate, onGoHome,
}) => {
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
    <div style={{ maxWidth: 1080, margin: '0 auto', padding: '40px 24px' }}>

      {/* Pricing cards — three columns */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20, alignItems: 'start', marginBottom: 48 }}>

        {/* Free card */}
        <div style={{
          background: '#ffffff', borderRadius: 16, padding: '32px 24px 28px',
          border: tier === 'free' ? '2px solid #007aff' : '1px solid rgba(60,60,67,0.12)',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.03)',
          position: 'relative',
        }}>
          {tier === 'free' && <PillBadge text="当前版本" color="#007aff" />}
          <div style={{ textAlign: 'center', marginBottom: 24, paddingTop: tier === 'free' ? 8 : 0 }}>
            <div style={{ fontSize: 28, marginBottom: 8, lineHeight: 1 }}>🆓</div>
            <h3 style={{ fontSize: 17, fontWeight: 700, color: '#8e8e93', margin: '0 0 8px' }}>免费版</h3>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 2 }}>
              <span style={{ fontSize: 13, color: '#8e8e93' }}>¥</span>
              <span style={{ fontSize: 36, fontWeight: 800, color: '#1c1c1e', letterSpacing: -1 }}>0</span>
            </div>
            <p style={{ fontSize: 13, color: '#8e8e93', margin: '4px 0 0' }}>
              每天 <strong style={{ color: '#1c1c1e', fontWeight: 600 }}>{user ? freeLimit : guestLimit}</strong> 次分析
            </p>
          </div>
          <FeatureRow items={featuresFor('free')} type="check" />
          <FeatureRow items={missingFor('free')} type="cross" />
          <div style={{ marginTop: 24 }}>
            {user
              ? <button style={{ width: '100%', height: 44, borderRadius: 10, border: '1px solid #e5e5ea', background: '#f2f2f7', color: '#8e8e93', fontSize: 15, fontWeight: 600, cursor: 'default' }} disabled>{tier === 'free' ? '当前版本' : '已升级'}</button>
              : <a href="/register" style={{ width: '100%', height: 44, borderRadius: 10, background: '#f2f2f7', color: '#007aff', fontSize: 15, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>免费注册</a>
            }
          </div>
        </div>

        {/* Basic card — recommended */}
        <div style={{
          background: '#ffffff', borderRadius: 16, padding: '32px 24px 28px',
          border: '2px solid #007aff',
          boxShadow: '0 8px 32px rgba(0,122,255,0.14)',
          position: 'relative', transform: 'translateY(-8px)',
        }}>
          <PillBadge text={tier === 'basic' ? '当前版本' : '推荐'} color="#007aff" />
          <div style={{ textAlign: 'center', marginBottom: 24, paddingTop: 8 }}>
            <div style={{ fontSize: 28, marginBottom: 8, lineHeight: 1 }}>📊</div>
            <h3 style={{ fontSize: 17, fontWeight: 700, color: '#007aff', margin: '0 0 8px' }}>标准版</h3>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 2 }}>
              <span style={{ fontSize: 13, color: '#8e8e93' }}>¥</span>
              <span style={{ fontSize: 36, fontWeight: 800, color: '#1c1c1e', letterSpacing: -1 }}>{basicPrice}</span>
              <span style={{ fontSize: 13, color: '#8e8e93' }}>/{period}</span>
            </div>
            <p style={{ fontSize: 13, color: '#8e8e93', margin: '4px 0 0' }}>
              每天 <strong style={{ color: '#1c1c1e', fontWeight: 600 }}>{basicLimit}</strong> 次分析
            </p>
          </div>
          <FeatureRow items={featuresFor('basic')} type="check" />
          <FeatureRow items={missingFor('basic')} type="cross" />
          <div style={{ marginTop: 24 }}>
            {user
              ? <button
                  style={{ width: '100%', height: 44, borderRadius: 10, border: 'none', background: tier === 'basic' || tier === 'premium' ? '#f2f2f7' : '#007aff', color: tier === 'basic' || tier === 'premium' ? '#8e8e93' : 'white', fontSize: 15, fontWeight: 700, cursor: tier === 'basic' || tier === 'premium' ? 'default' : 'pointer' }}
                  onClick={() => onUpgrade('basic')}
                  disabled={tier === 'basic' || tier === 'premium'}
                >{tier === 'basic' ? '当前版本' : tier === 'premium' ? '已是更高等级' : '前往爱发电订阅 →'}</button>
              : <a href="/register" style={{ width: '100%', height: 44, borderRadius: 10, background: '#007aff', color: 'white', fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>注册后订阅</a>
            }
          </div>
        </div>

        {/* Premium card */}
        <div style={{
          background: 'linear-gradient(160deg, #faf5ff 0%, #ffffff 100%)',
          borderRadius: 16, padding: '32px 24px 28px',
          border: tier === 'premium' ? '2px solid #7c3aed' : '1.5px solid #ddd6fe',
          boxShadow: '0 4px 24px rgba(124,58,237,0.1)',
          position: 'relative',
        }}>
          {tier === 'premium' && <PillBadge text="当前版本" color="#7c3aed" />}
          {(!tier || tier === 'free' || tier === 'basic') && <PillBadge text="✨ 最高权益" color="linear-gradient(90deg,#f59e0b,#fbbf24)" textColor="#000" />}
          <div style={{ textAlign: 'center', marginBottom: 24, paddingTop: 8 }}>
            <div style={{ fontSize: 28, marginBottom: 8, lineHeight: 1 }}>👑</div>
            <h3 style={{ fontSize: 17, fontWeight: 700, color: '#7c3aed', margin: '0 0 8px' }}>专业版</h3>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 2 }}>
              <span style={{ fontSize: 13, color: '#8e8e93' }}>¥</span>
              <span style={{ fontSize: 36, fontWeight: 800, color: '#1c1c1e', letterSpacing: -1 }}>{premiumPrice}</span>
              <span style={{ fontSize: 13, color: '#8e8e93' }}>/{period}</span>
            </div>
            <p style={{ fontSize: 13, color: '#8e8e93', margin: '4px 0 0' }}>
              每天 <strong style={{ color: '#1c1c1e', fontWeight: 600 }}>{premiumLimit}</strong> 次分析
            </p>
          </div>
          <FeatureRow items={featuresFor('premium')} type="check" />
          <FeatureRow items={missingFor('premium')} type="cross" />
          <div style={{ marginTop: 24 }}>
            {user
              ? <button
                  style={{ width: '100%', height: 44, borderRadius: 10, border: 'none', background: tier === 'premium' ? '#f2f2f7' : 'linear-gradient(135deg, #7c3aed, #4f46e5)', color: tier === 'premium' ? '#8e8e93' : 'white', fontSize: 15, fontWeight: 700, cursor: tier === 'premium' ? 'default' : 'pointer' }}
                  onClick={() => onUpgrade('premium')}
                  disabled={tier === 'premium'}
                >{tier === 'premium' ? '当前版本' : '前往爱发电订阅 →'}</button>
              : <a href="/register" style={{ width: '100%', height: 44, borderRadius: 10, background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', color: 'white', fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>注册后订阅</a>
            }
          </div>
        </div>
      </div>

      {/* Bottom section: How to subscribe + Activation form side by side */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>

        {/* How to subscribe */}
        <div>
          <p style={{ fontSize: 11, fontWeight: 600, color: '#aeaeb2', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 12px' }}>如何订阅</p>
          <div style={{ background: '#ffffff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            {[
              { num: '1', icon: '🛒', title: '选择套餐', desc: '点击「前往爱发电订阅」按钮' },
              { num: '2', icon: '💳', title: '完成支付', desc: '支持支付宝 · 微信支付' },
              { num: '3', icon: '📋', title: '复制订单号', desc: '在爱发电「我的订单」页面获取' },
              { num: '4', icon: '✅', title: '激活订阅', desc: '在右侧输入订单号，即时生效' },
            ].map(({ num, icon, title, desc }, i, arr) => (
              <div key={num}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px' }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                    background: 'linear-gradient(135deg, #007aff, #34aadc)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
                    boxShadow: '0 2px 8px rgba(0,122,255,0.2)',
                  }}>{icon}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#1c1c1e', marginBottom: 2 }}>{title}</div>
                    <div style={{ fontSize: 12, color: '#8e8e93' }}>{desc}</div>
                  </div>
                  <div style={{
                    width: 20, height: 20, borderRadius: '50%', background: '#f2f2f7',
                    border: '1.5px solid #e5e5ea', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#8e8e93', flexShrink: 0,
                  }}>{num}</div>
                </div>
                {i < arr.length - 1 && <div style={{ height: '0.5px', background: 'rgba(60,60,67,0.08)', margin: '0 0 0 66px' }} />}
              </div>
            ))}
          </div>
          <p style={{ fontSize: 12, color: '#aeaeb2', textAlign: 'center', marginTop: 12 }}>支付宝 · 微信支付 · 订阅后填入订单号即时生效</p>
        </div>

        {/* Activation form */}
        <div>
          <p style={{ fontSize: 11, fontWeight: 600, color: '#aeaeb2', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 12px' }}>激活订阅</p>
          <div style={{ background: '#ffffff', borderRadius: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            {!user ? (
              <div style={{ padding: '40px 24px', textAlign: 'center' }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>🔒</div>
                <p style={{ fontSize: 15, fontWeight: 600, color: '#1c1c1e', margin: '0 0 6px' }}>请先登录账号</p>
                <p style={{ fontSize: 13, color: '#8e8e93', margin: '0 0 20px' }}>激活订阅需要绑定到您的账号</p>
                <a href="/login" style={{
                  display: 'inline-block', padding: '10px 32px',
                  background: '#007aff', color: 'white', borderRadius: 10,
                  fontSize: 15, fontWeight: 600, textDecoration: 'none',
                }}>去登录</a>
              </div>
            ) : activateResult ? (
              <div style={{ padding: '40px 24px', textAlign: 'center' }}>
                <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'linear-gradient(135deg, #34c759, #30d158)', margin: '0 auto 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, boxShadow: '0 4px 20px rgba(52,199,89,0.3)' }}>✓</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#1c1c1e', marginBottom: 6 }}>订阅激活成功！</div>
                <div style={{ fontSize: 14, color: '#8e8e93', marginBottom: activateResult.expires_at ? 8 : 24 }}>
                  当前等级：{activateResult.tier === 'premium' ? '👑 专业版' : '📊 标准版'}
                </div>
                {activateResult.expires_at && (
                  <div style={{ fontSize: 13, color: '#8e8e93', marginBottom: 24 }}>
                    有效期至：{new Date(activateResult.expires_at).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })}
                  </div>
                )}
                <button
                  onClick={onGoHome}
                  style={{ width: '100%', height: 50, borderRadius: 12, border: 'none', background: '#007aff', color: 'white', fontSize: 17, fontWeight: 600, cursor: 'pointer' }}
                >返回首页</button>
              </div>
            ) : (
              <form onSubmit={onActivate} style={{ padding: '24px' }}>
                <div style={{ background: '#f0f9ff', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#0369a1', display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                  <span style={{ flexShrink: 0 }}>🔗</span>
                  <span>订阅将绑定到您的账号 <strong>{user?.email}</strong>，换设备后仍可使用</span>
                </div>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontSize: 13, fontWeight: 600, color: '#3c3c43', display: 'block', marginBottom: 8 }}>爱发电订单号</label>
                  <input
                    style={{ width: '100%', height: 48, borderRadius: 12, border: '1px solid rgba(60,60,67,0.18)', background: '#f2f2f7', padding: '0 14px', fontSize: 15, color: '#1c1c1e', boxSizing: 'border-box', outline: 'none' }}
                    placeholder="例：202506231234567890123456789"
                    value={orderNo}
                    onChange={(e) => setOrderNo(e.target.value)}
                    required
                  />
                  <p style={{ fontSize: 12, color: '#8e8e93', marginTop: 6 }}>在爱发电「我的订单」页面可以找到订单号</p>
                </div>
                {activateError && (
                  <div style={{ background: '#fff2f2', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#dc2626', display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                    <span style={{ flexShrink: 0 }}>⚠️</span>
                    <span>{activateError}</span>
                  </div>
                )}
                <button
                  type="submit"
                  disabled={activating}
                  style={{ width: '100%', height: 50, borderRadius: 12, border: 'none', background: activating ? '#c7c7cc' : '#007aff', color: 'white', fontSize: 17, fontWeight: 600, cursor: activating ? 'default' : 'pointer', transition: 'background 0.15s' }}
                >{activating ? '验证中...' : '验证并激活'}</button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default UpgradeDesktopView;
