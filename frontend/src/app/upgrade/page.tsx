'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/store';
import { upgradeSubscription } from '@/lib/api';

const TIERS = [
  {
    id: 'free',
    name: '免费版',
    price: '¥0',
    period: '/月',
    dailyLimit: '1 次',
    features: [
      '✓ A股分析',
      '✓ 买卖建议',
      '✓ 技术指标',
      '✓ 历史记录',
    ],
    notFeatures: [
      '✗ 港股/美股',
      '✗ 多周期分析',
      '✗ 详细风险分析',
    ],
    cta: '当前版本',
    recommended: false,
    disabled: true,
  },
  {
    id: 'basic',
    name: '基础版',
    price: '¥9',
    period: '/月',
    dailyLimit: '5 次',
    features: [
      '✓ A股+港股+美股',
      '✓ 买卖建议',
      '✓ 技术指标',
      '✓ 历史记录',
      '✓ 多周期分析',
      '✓ 详细风险分析',
    ],
    notFeatures: [],
    cta: '立即订阅',
    recommended: true,
    disabled: false,
  },
  {
    id: 'premium',
    name: '高级版',
    price: '¥19',
    period: '/月',
    dailyLimit: '15 次',
    features: [
      '✓ 全部市场',
      '✓ 买卖建议',
      '✓ 技术指标',
      '✓ 历史记录',
      '✓ 多周期分析',
      '✓ 详细风险分析',
      '✓ 连续多次单条查询',
      '✓ 优先通道',
    ],
    notFeatures: [],
    cta: '立即订阅',
    recommended: false,
    disabled: false,
  },
];

export default function UpgradePage() {
  const router = useRouter();
  const { user, checkAuth } = useAuthStore();
  const [isUpgrading, setIsUpgrading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    checkAuth().then(() => {
      const token = localStorage.getItem('token');
      if (!token) {
        router.push('/login');
      }
    });
  }, [router]);

  const handleUpgrade = async (tier: string) => {
    if (tier === 'free') return;

    setIsUpgrading(tier);
    setError(null);

    try {
      await upgradeSubscription(tier);
      alert('订阅成功！请刷新页面查看更新后的状态');
      router.push('/');
    } catch (err: any) {
      setError(err.response?.data?.detail || '升级失败，请稍后重试');
    } finally {
      setIsUpgrading(null);
    }
  };

  if (!user) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--background)', padding: '2rem 1rem' }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
          升级专业版
        </h1>
        <p style={{ color: 'var(--muted)', fontSize: '1rem' }}>
          每天5次分析，只要¥9/月
        </p>
      </div>

      {/* Current Plan */}
      <div style={{ maxWidth: '900px', margin: '0 auto 2rem' }}>
        <div className="card" style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.75rem',
          padding: '0.75rem 1.5rem',
          background: '#f3f4f6',
        }}>
          <span style={{ fontSize: '0.875rem' }}>当前版本:</span>
          <span className={`badge badge-${user.subscription_tier}`}>
            {user.subscription_tier === 'free' ? '免费版' :
             user.subscription_tier === 'basic' ? '基础版' : '高级版'}
          </span>
        </div>
      </div>

      {/* Pricing Cards */}
      <div className="upgrade-card-grid">
        {TIERS.map((tier) => (
          <div
            key={tier.id}
            className="card"
            style={{
              position: 'relative',
              border: tier.recommended ? '2px solid #f59e0b' : '1px solid var(--border)',
              transform: tier.recommended ? 'scale(1.02)' : 'none',
            }}
          >
            {tier.recommended && (
              <div style={{
                position: 'absolute',
                top: '-12px',
                left: '50%',
                transform: 'translateX(-50%)',
                background: '#f59e0b',
                color: 'white',
                padding: '0.25rem 1rem',
                borderRadius: '9999px',
                fontSize: '0.75rem',
                fontWeight: '600',
              }}>
                推荐
              </div>
            )}

            <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '0.5rem' }}>
                {tier.name}
              </h3>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: '0.25rem' }}>
                <span style={{ fontSize: '2rem', fontWeight: 'bold' }}>{tier.price}</span>
                <span style={{ color: 'var(--muted)' }}>{tier.period}</span>
              </div>
              <p style={{ fontSize: '0.875rem', color: 'var(--muted)', marginTop: '0.25rem' }}>
                每天 {tier.dailyLimit}
              </p>
            </div>

            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 1.5rem' }}>
              {tier.features.map((feature, idx) => (
                <li key={idx} style={{
                  fontSize: '0.875rem',
                  padding: '0.375rem 0',
                  color: 'var(--success)',
                }}>
                  {feature}
                </li>
              ))}
              {tier.notFeatures.map((feature, idx) => (
                <li key={idx} style={{
                  fontSize: '0.875rem',
                  padding: '0.375rem 0',
                  color: 'var(--muted)',
                }}>
                  {feature}
                </li>
              ))}
            </ul>

            <button
              className={`btn ${tier.id === user.subscription_tier ? 'btn-secondary' : tier.recommended ? 'btn-primary' : 'btn-secondary'}`}
              style={{ width: '100%' }}
              onClick={() => handleUpgrade(tier.id)}
              disabled={
                tier.id === user.subscription_tier ||
                tier.disabled ||
                isUpgrading !== null
              }
            >
              {isUpgrading === tier.id ? '处理中...' : tier.cta}
            </button>
          </div>
        ))}
      </div>

      {/* Payment Info */}
      <div style={{ maxWidth: '600px', margin: '3rem auto 0', textAlign: 'center' }}>
        <p style={{ fontSize: '0.875rem', color: 'var(--muted)', marginBottom: '0.5rem' }}>
          支付方式: 微信支付 | 支付宝
        </p>
        <p style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
          点击"立即订阅"即表示同意我们的服务条款
        </p>
      </div>

      {error && (
        <div style={{
          position: 'fixed',
          bottom: '2rem',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'var(--danger)',
          color: 'white',
          padding: '0.75rem 1.5rem',
          borderRadius: '0.5rem',
        }}>
          {error}
        </div>
      )}
    </div>
  );
}
