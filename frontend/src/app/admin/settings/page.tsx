'use client';

import { useEffect, useRef, useState } from 'react';
import { adminGetSettings, adminUpdateSettings, adminExportSettings, adminImportSettings, SystemSettings, FeatureItem } from '@/lib/api';
import { Toast, useToast } from '@/components/Toast';

type Section = 'llm' | 'pricing' | 'afdian' | 'email' | 'app';

const TABS: { id: Section; label: string; desc: string }[] = [
  { id: 'llm',     label: '🤖 AI 模型',   desc: '配置 AI 分析使用的模型和 API 密钥' },
  { id: 'pricing', label: '💰 定价展示',  desc: '用户看到的套餐价格、每日次数及功能介绍' },
  { id: 'afdian',  label: '💳 爱发电',    desc: '配置爱发电支付套餐 ID、收款链接及 API 凭证' },
  { id: 'email',   label: '📧 邮件服务',  desc: '注册验证邮件的发送配置（Resend.com）' },
  { id: 'app',     label: '⚙️ 应用信息',  desc: '站点名称等基础配置' },
];

function Field({
  label, hint, children,
}: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '1.25rem' }}>
      <label style={{ display: 'block', fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.35rem' }}>
        {label}
      </label>
      {children}
      {hint && <p style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: '0.3rem' }}>{hint}</p>}
    </div>
  );
}

function Input({ value, onChange, type = 'text', placeholder }: {
  value: string | number; onChange: (v: string) => void;
  type?: string; placeholder?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: '100%', padding: '0.5rem 0.75rem', border: '1px solid var(--border)',
        borderRadius: '0.375rem', background: 'var(--background)', color: 'var(--foreground)',
        fontSize: '0.875rem', boxSizing: 'border-box',
      }}
    />
  );
}

function NumInput({ value, onChange, min = 0 }: { value: number; onChange: (v: number) => void; min?: number }) {
  return (
    <input
      type="number"
      value={value}
      min={min}
      onChange={e => onChange(Number(e.target.value))}
      style={{
        width: '100%', padding: '0.5rem 0.75rem', border: '1px solid var(--border)',
        borderRadius: '0.375rem', background: 'var(--background)', color: 'var(--foreground)',
        fontSize: '0.875rem', boxSizing: 'border-box',
      }}
    />
  );
}

function SaveButton({ loading, onClick }: { loading: boolean; onClick: () => void }) {
  return (
    <button
      className="btn btn-primary"
      onClick={onClick}
      disabled={loading}
      style={{ marginTop: '1rem', minWidth: '100px' }}
    >
      {loading ? '保存中…' : '💾 保存'}
    </button>
  );
}

function FeatureMatrixEditor({ features, onChange }: {
  features: FeatureItem[];
  onChange: (f: FeatureItem[]) => void;
}) {
  const TIERS = ['free', 'basic', 'premium'] as const;
  const TIER_LABELS = { free: '免费版', basic: '标准版', premium: '专业版' };

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= features.length) return;
    const next = [...features];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  const remove = (i: number) => onChange(features.filter((_, idx) => idx !== i));

  const updateText = (i: number, text: string) => {
    const next = [...features];
    next[i] = { ...next[i], text };
    onChange(next);
  };

  const toggleTier = (i: number, tier: string) => {
    const next = [...features];
    const tiers = next[i].tiers.includes(tier)
      ? next[i].tiers.filter(t => t !== tier)
      : [...next[i].tiers, tier];
    next[i] = { ...next[i], tiers };
    onChange(next);
  };

  const cellStyle: React.CSSProperties = {
    padding: '0.4rem 0.5rem', borderBottom: '1px solid var(--border)', textAlign: 'center' as const,
  };
  const thStyle: React.CSSProperties = {
    padding: '0.5rem', fontWeight: 600, fontSize: '0.8rem',
    background: 'var(--background)', borderBottom: '2px solid var(--border)', textAlign: 'center' as const,
  };

  return (
    <div style={{ marginBottom: '1.25rem' }}>
      <label style={{ display: 'block', fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.5rem' }}>
        功能矩阵
      </label>
      <p style={{ fontSize: '0.75rem', color: 'var(--muted)', marginBottom: '0.75rem' }}>
        定义所有功能及各版本支持情况，升级页会自动展示每个版本的 ✓ 和 ✗ 列表
      </p>
      <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: '0.5rem' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '480px' }}>
          <thead>
            <tr>
              <th style={{ ...thStyle, textAlign: 'left', paddingLeft: '0.75rem', width: '40%' }}>功能名称</th>
              {TIERS.map(t => <th key={t} style={thStyle}>{TIER_LABELS[t]}</th>)}
              <th style={thStyle}>排序 / 删除</th>
            </tr>
          </thead>
          <tbody>
            {features.map((f, i) => (
              <tr key={i} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.02)' }}>
                <td style={{ ...cellStyle, textAlign: 'left', paddingLeft: '0.75rem' }}>
                  <input
                    value={f.text}
                    onChange={e => updateText(i, e.target.value)}
                    style={{
                      width: '100%', background: 'transparent', border: 'none', outline: 'none',
                      fontSize: '0.875rem', color: 'var(--foreground)',
                    }}
                    placeholder="功能描述"
                  />
                </td>
                {TIERS.map(tier => (
                  <td key={tier} style={cellStyle}>
                    <input
                      type="checkbox"
                      checked={f.tiers.includes(tier)}
                      onChange={() => toggleTier(i, tier)}
                      style={{ cursor: 'pointer', width: '1rem', height: '1rem' }}
                    />
                  </td>
                ))}
                <td style={cellStyle}>
                  <div style={{ display: 'flex', gap: '0.25rem', justifyContent: 'center' }}>
                    <button onClick={() => move(i, -1)} disabled={i === 0}
                      style={{ background: 'none', border: 'none', cursor: i === 0 ? 'default' : 'pointer',
                        color: i === 0 ? 'var(--muted)' : 'var(--foreground)', padding: '0 0.25rem', fontSize: '0.875rem' }}>↑</button>
                    <button onClick={() => move(i, 1)} disabled={i === features.length - 1}
                      style={{ background: 'none', border: 'none', cursor: i === features.length - 1 ? 'default' : 'pointer',
                        color: i === features.length - 1 ? 'var(--muted)' : 'var(--foreground)', padding: '0 0.25rem', fontSize: '0.875rem' }}>↓</button>
                    <button onClick={() => remove(i)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer',
                        color: '#ef4444', padding: '0 0.25rem', fontSize: '0.875rem' }}>✕</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        onClick={() => onChange([...features, { text: '', tiers: [] }])}
        style={{ marginTop: '0.5rem', background: 'none', border: '1px dashed var(--border)',
          borderRadius: '0.375rem', padding: '0.4rem 1rem', cursor: 'pointer',
          color: 'var(--muted)', fontSize: '0.875rem', width: '100%' }}>
        + 添加功能
      </button>
    </div>
  );
}


export default function AdminSettingsPage() {
  const [activeTab, setActiveTab] = useState<Section>('llm');
  const [cfg, setCfg] = useState<SystemSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Section | null>(null);
  const [ioWorking, setIoWorking] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const { toast, show: showToast } = useToast();

  useEffect(() => {
    adminGetSettings()
      .then(d => { setCfg(d); setLoading(false); })
      .catch(e => { showToast(e?.response?.data?.detail || '加载失败', 'error'); setLoading(false); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (section: Section, data: Record<string, unknown>) => {
    setSaving(section);
    try {
      await adminUpdateSettings(section, data);
      const updated = await adminGetSettings();
      setCfg(updated);
      showToast('保存成功', 'ok');
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } };
      showToast(err?.response?.data?.detail || '保存失败', 'error');
    } finally {
      setSaving(null);
    }
  };

  const handleExport = async () => {
    setIoWorking(true);
    try {
      const data = await adminExportSettings();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `settings-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('已导出配置', 'ok');
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } };
      showToast(err?.response?.data?.detail || '导出失败', 'error');
    } finally {
      setIoWorking(false);
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setIoWorking(true);
    try {
      const text = await file.text();
      const data = JSON.parse(text) as SystemSettings;
      await adminImportSettings(data);
      const updated = await adminGetSettings();
      setCfg(updated);
      showToast('配置已导入并生效', 'ok');
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } };
      showToast(err?.response?.data?.detail || '导入失败，请检查 JSON 格式', 'error');
    } finally {
      setIoWorking(false);
    }
  };

  if (loading) return <div style={{ textAlign: 'center', paddingTop: '4rem' }}><div className="spinner" style={{ margin: '0 auto' }} /></div>;
  if (!cfg) return <div className="error">加载设置失败</div>;

  return (
    <div>
      <Toast toast={toast} />

      <div style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>系统设置</h1>
          <p style={{ color: 'var(--muted)', fontSize: '0.875rem' }}>所有修改实时生效，无需重启服务器</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <input ref={importRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleImportFile} />
          <button
            className="btn"
            onClick={() => importRef.current?.click()}
            disabled={ioWorking}
            style={{ fontSize: '0.8rem', padding: '0.4rem 0.85rem' }}
          >
            📥 导入配置
          </button>
          <button
            className="btn btn-primary"
            onClick={handleExport}
            disabled={ioWorking}
            style={{ fontSize: '0.8rem', padding: '0.4rem 0.85rem' }}
          >
            📤 导出配置
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            style={{
              padding: '0.5rem 1rem', borderRadius: '0.375rem', border: 'none', cursor: 'pointer',
              fontSize: '0.875rem', fontWeight: activeTab === t.id ? 700 : 400,
              background: activeTab === t.id ? 'var(--primary)' : 'var(--card)',
              color: activeTab === t.id ? '#fff' : 'var(--foreground)',
              boxShadow: activeTab === t.id ? '0 2px 6px rgba(0,0,0,0.15)' : 'none',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab description */}
      <p style={{ fontSize: '0.875rem', color: 'var(--muted)', marginBottom: '1.25rem' }}>
        {TABS.find(t => t.id === activeTab)?.desc}
      </p>

      {/* ── LLM ── */}
      {activeTab === 'llm' && (() => {
        const l = cfg.llm;
        return (
          <div className="card">
            <h2 style={{ fontWeight: 600, marginBottom: '1.25rem' }}>AI 模型配置</h2>
            <Field label="提供商 (provider)" hint="支持 openai / deepseek / claude / custom">
              <Input value={l.provider} onChange={v => setCfg({ ...cfg, llm: { ...l, provider: v } })} placeholder="openai" />
            </Field>
            <Field label="API Key" hint="AI 服务商的 API 密钥，留空则使用服务器环境变量">
              <Input value={l.api_key} type="password"
                onChange={v => setCfg({ ...cfg, llm: { ...l, api_key: v } })}
                placeholder="sk-xxxxxxxx" />
            </Field>
            <Field label="Base URL" hint="API 请求地址，使用 OpenAI 兼容接口时填写">
              <Input value={l.base_url} onChange={v => setCfg({ ...cfg, llm: { ...l, base_url: v } })}
                placeholder="https://api.deepseek.com/v1" />
            </Field>
            <Field label="模型名称 (model)">
              <Input value={l.model} onChange={v => setCfg({ ...cfg, llm: { ...l, model: v } })}
                placeholder="deepseek-chat" />
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <Field label="最大 Token (max_tokens)" hint="每次请求最多生成的 token 数">
                <NumInput value={l.max_tokens} min={100}
                  onChange={v => setCfg({ ...cfg, llm: { ...l, max_tokens: v } })} />
              </Field>
              <Field label="随机性 (temperature)" hint="0=最稳定，1=最发散，推荐 0.7">
                <Input value={l.temperature} type="number"
                  onChange={v => setCfg({ ...cfg, llm: { ...l, temperature: parseFloat(v) || 0 } })}
                  placeholder="0.7" />
              </Field>
            </div>
            <SaveButton loading={saving === 'llm'} onClick={() => save('llm', cfg.llm as unknown as Record<string, unknown>)} />
          </div>
        );
      })()}

      {/* ── 定价 ── */}
      {activeTab === 'pricing' && (() => {
        const p = cfg.pricing;
        const features: FeatureItem[] = Array.isArray(p.features) ? p.features : [];
        const setFeatures = (f: FeatureItem[]) => setCfg({ ...cfg, pricing: { ...p, features: f } });
        return (
          <div className="card">
            <h2 style={{ fontWeight: 600, marginBottom: '1.25rem' }}>套餐定价展示</h2>
            <Field label="计费周期" hint='显示在价格后的单位，如"月"或"年"'>
              <Input value={p.period} onChange={v => setCfg({ ...cfg, pricing: { ...p, period: v } })} placeholder="月" />
            </Field>
            {/* Free-tier daily limits */}
            <div style={{ border: '1px solid var(--border)', borderRadius: '0.5rem', padding: '1rem', marginBottom: '1rem' }}>
              <p style={{ fontWeight: 600, marginBottom: '0.75rem' }}>免费档每日次数</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <Field label="游客（未登录）" hint="设备限额，不区分套餐">
                  <NumInput value={p.guest_daily ?? 1} min={0}
                    onChange={v => setCfg({ ...cfg, pricing: { ...p, guest_daily: v } })} />
                </Field>
                <Field label="免费版（已登录）" hint="注册用户免费档每日次数">
                  <NumInput value={p.free_daily ?? 3} min={0}
                    onChange={v => setCfg({ ...cfg, pricing: { ...p, free_daily: v } })} />
                </Field>
              </div>
            </div>
            {(['basic', 'premium'] as const).map(tier => (
              <div key={tier} style={{ border: '1px solid var(--border)', borderRadius: '0.5rem', padding: '1rem', marginBottom: '1rem' }}>
                <p style={{ fontWeight: 600, marginBottom: '0.75rem' }}>{tier === 'basic' ? '标准版' : '专业版'}</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <Field label="价格（元）" hint="展示在升级页面的数字">
                    <Input value={p[tier].price}
                      onChange={v => setCfg({ ...cfg, pricing: { ...p, [tier]: { ...p[tier], price: v } } })}
                      placeholder={tier === 'basic' ? '19.9' : '49'} />
                  </Field>
                  <Field label="每日次数" hint="实际配额，同步生效">
                    <NumInput value={p[tier].daily} min={1}
                      onChange={v => setCfg({ ...cfg, pricing: { ...p, [tier]: { ...p[tier], daily: v } } })} />
                  </Field>
                </div>
              </div>
            ))}
            <FeatureMatrixEditor features={features} onChange={setFeatures} />
            <SaveButton loading={saving === 'pricing'} onClick={() => save('pricing', cfg.pricing as unknown as Record<string, unknown>)} />
          </div>
        );
      })()}

      {/* ── 爱发电 ── */}
      {activeTab === 'afdian' && (() => {
        const a = cfg.afdian;
        return (
          <div className="card">
            <h2 style={{ fontWeight: 600, marginBottom: '1.25rem' }}>爱发电支付配置</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <Field label="标准版套餐 Plan ID" hint="爱发电后台套餐 ID">
                <Input value={a.basic_plan_id} onChange={v => setCfg({ ...cfg, afdian: { ...a, basic_plan_id: v } })} />
              </Field>
              <Field label="专业版套餐 Plan ID">
                <Input value={a.premium_plan_id} onChange={v => setCfg({ ...cfg, afdian: { ...a, premium_plan_id: v } })} />
              </Field>
              <Field label="标准版购买链接" hint="展示给用户的爱发电购买地址">
                <Input value={a.basic_link} onChange={v => setCfg({ ...cfg, afdian: { ...a, basic_link: v } })} placeholder="https://afdian.net/..." />
              </Field>
              <Field label="专业版购买链接">
                <Input value={a.premium_link} onChange={v => setCfg({ ...cfg, afdian: { ...a, premium_link: v } })} placeholder="https://afdian.net/..." />
              </Field>
            </div>
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem', marginTop: '0.5rem' }}>
              <p style={{ fontWeight: 600, marginBottom: '0.75rem', fontSize: '0.875rem', color: 'var(--muted)' }}>
                🔑 API 凭证（用于主动查询订单）
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <Field label="创作者 User ID" hint="爱发电开发者后台的用户 ID">
                  <Input value={a.user_id} onChange={v => setCfg({ ...cfg, afdian: { ...a, user_id: v } })} />
                </Field>
                <Field label="API Token" hint="爱发电开发者后台生成的 Token">
                  <Input value={a.api_token} type="password"
                    onChange={v => setCfg({ ...cfg, afdian: { ...a, api_token: v } })} />
                </Field>
              </div>
              <Field label="Webhook Token" hint="用于验证爱发电主动推送的请求是否合法">
                <Input value={a.webhook_token} type="password"
                  onChange={v => setCfg({ ...cfg, afdian: { ...a, webhook_token: v } })} />
              </Field>
            </div>
            <SaveButton loading={saving === 'afdian'} onClick={() => save('afdian', cfg.afdian as unknown as Record<string, unknown>)} />
          </div>
        );
      })()}

      {/* ── 邮件 ── */}
      {activeTab === 'email' && (() => {
        const e = cfg.email;
        return (
          <div className="card">
            <h2 style={{ fontWeight: 600, marginBottom: '1.25rem' }}>邮件服务配置</h2>
            <Field label="Resend API Key" hint="从 resend.com 申请，用于发送注册验证邮件">
              <Input value={e.resend_api_key} type="password"
                onChange={v => setCfg({ ...cfg, email: { ...e, resend_api_key: v } })} placeholder="re_xxxxxxxx" />
            </Field>
            <Field label="前端域名 (APP_BASE_URL)" hint="验证邮件中的链接会带上这个地址">
              <Input value={e.app_base_url} onChange={v => setCfg({ ...cfg, email: { ...e, app_base_url: v } })}
                placeholder="https://yourdomain.com" />
            </Field>
            <SaveButton loading={saving === 'email'} onClick={() => save('email', cfg.email as unknown as Record<string, unknown>)} />
          </div>
        );
      })()}

      {/* ── 应用 ── */}
      {activeTab === 'app' && (() => {
        const a = cfg.app;
        const setApp = (patch: Partial<typeof a>) => setCfg({ ...cfg, app: { ...a, ...patch } });
        const setModalPerk = (i: number, field: 'icon' | 'text', val: string) => {
          const perks = [...(a.trial_modal_perks ?? [])];
          perks[i] = { ...perks[i], [field]: val };
          setApp({ trial_modal_perks: perks });
        };
        const setEndedPerk = (i: number, field: 'icon' | 'text', val: string) => {
          const perks = [...(a.trial_ended_perks ?? [])];
          perks[i] = { ...perks[i], [field]: val };
          setApp({ trial_ended_perks: perks });
        };
        return (
          <div className="card">
            <h2 style={{ fontWeight: 600, marginBottom: '1.25rem' }}>应用基础设置</h2>
            <Field label="站点名称" hint="显示在页面标题、导航栏及邮件中的应用名称">
              <Input value={a.name} onChange={v => setApp({ name: v })} placeholder="我的AI分析" />
            </Field>

            <hr style={{ margin: '1.5rem 0', borderColor: 'var(--border)' }} />
            <h3 style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '1rem' }}>🎁 体验专业版弹窗文案</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <Field label="标题">
                <Input value={a.trial_modal_title ?? ''} onChange={v => setApp({ trial_modal_title: v })} placeholder="你获得一次专业版体验" />
              </Field>
              <Field label="副标题">
                <Input value={a.trial_modal_subtitle ?? ''} onChange={v => setApp({ trial_modal_subtitle: v })} placeholder="仅限一次 · 用完即止" />
              </Field>
            </div>
            <Field label="权益列表标题">
              <Input value={a.trial_modal_perks_label ?? ''} onChange={v => setApp({ trial_modal_perks_label: v })} placeholder="本次体验包含" />
            </Field>
            <Field label="权益条目（最多显示3条）" hint="每条包含 emoji 图标和描述文字">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {(a.trial_modal_perks ?? [{ icon: '', text: '' }, { icon: '', text: '' }, { icon: '', text: '' }]).map((p, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '60px 1fr', gap: '0.5rem' }}>
                    <Input value={p.icon} onChange={v => setModalPerk(i, 'icon', v)} placeholder="🔍" />
                    <Input value={p.text} onChange={v => setModalPerk(i, 'text', v)} placeholder={['完整深度研判报告', '多周期联合分析', 'AI 买卖点精准定位'][i] ?? ''} />
                  </div>
                ))}
              </div>
            </Field>
            <Field label="确认按钮文字">
              <Input value={a.trial_modal_button ?? ''} onChange={v => setApp({ trial_modal_button: v })} placeholder="立即开始体验" />
            </Field>

            <hr style={{ margin: '1.5rem 0', borderColor: 'var(--border)' }} />
            <h3 style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '1rem' }}>⏳ 体验结束页文案</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <Field label="标题">
                <Input value={a.trial_ended_title ?? ''} onChange={v => setApp({ trial_ended_title: v })} placeholder="专业版体验已结束" />
              </Field>
              <Field label="副标题">
                <Input value={a.trial_ended_subtitle ?? ''} onChange={v => setApp({ trial_ended_subtitle: v })} placeholder="游客仅限一次免费体验" />
              </Field>
            </div>
            <Field label="权益列表标题">
              <Input value={a.trial_ended_perks_label ?? ''} onChange={v => setApp({ trial_ended_perks_label: v })} placeholder="注册账号，每天继续使用" />
            </Field>
            <Field label="注册权益条目（最多显示3条）">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {(a.trial_ended_perks ?? [{ icon: '', text: '' }, { icon: '', text: '' }, { icon: '', text: '' }]).map((p, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '60px 1fr', gap: '0.5rem' }}>
                    <Input value={p.icon} onChange={v => setEndedPerk(i, 'icon', v)} placeholder={['📊', '☁', '★'][i] ?? ''} />
                    <Input value={p.text} onChange={v => setEndedPerk(i, 'text', v)} placeholder={['每天 1 次免费深度研判', '跨设备同步，数据不丢失', '邀请好友获得额外永久额度'][i] ?? ''} />
                  </div>
                ))}
              </div>
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <Field label="注册按钮文字">
                <Input value={a.trial_ended_register_button ?? ''} onChange={v => setApp({ trial_ended_register_button: v })} placeholder="免费注册，继续使用" />
              </Field>
              <Field label="套餐提示文字" hint="显示在升级横条中">
                <Input value={a.trial_ended_upgrade_hint ?? ''} onChange={v => setApp({ trial_ended_upgrade_hint: v })} placeholder="标准版 ¥19.9/月 · 专业版 ¥49/月" />
              </Field>
            </div>

            <SaveButton loading={saving === 'app'} onClick={() => save('app', cfg.app as unknown as Record<string, unknown>)} />
            <hr style={{ margin: '1.5rem 0', borderColor: 'var(--border)' }} />
            <p style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>
              🗂️ 股票名称映射已迁移至 <a href="/admin/market-data" style={{ color: 'var(--primary)' }}>市场数据管理</a> 页面。
            </p>
          </div>
        );
      })()}
    </div>
  );
}
