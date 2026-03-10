'use client';
import { useEffect, useState } from 'react';
import { generateStatementCardBlob, generatePredictionCardBlob } from '@/lib/shareCard';
import { getAppConfig } from '@/lib/api';

const MOCK_BASE_STATIC = {
  stockName: '贵州茅台',
  stockCode: '600519',
  market: 'a' as const,
  confidence: 78,
  latestPrice: 1680.00,
  targetPrice: 1900.00,
  stopLoss: 1580.00,
  opportunityGrade: 'A',
  reasonExcerpt: '技术形态突破关键压力位，MACD金叉共振，量能持续放大',
  analyzedAt: new Date().toISOString(),
  appName: process.env.NEXT_PUBLIC_APP_NAME || 'AI股票分析',
  marketDiagnosis: '日线级别MACD金叉共振，量能持续放大突破关键压力位，布林带开口向上，短期强势格局确立',
  opportunityAssessment: '技术面形态良好，A级机会评级，目标上行空间约13%，风险收益比达3.7:1',
  riskAnalysis: '止损位设于1580，下行风险约5.9%，若破位需及时离场控制损失',
  executionPlan: '建议分批建仓，首批30%仓位于当前价区间介入，目标1900，止损1580',
};

type Tier = 'free' | 'basic' | 'premium';
type Action = 'buy' | 'sell' | 'hold';

const CASES: { action: Action; tier: Tier; label: string }[] = [
  { action: 'buy',  tier: 'free',    label: 'BUY · 免费' },
  { action: 'buy',  tier: 'premium', label: 'BUY · 专业' },
  { action: 'sell', tier: 'premium', label: 'SELL · 专业' },
  { action: 'hold', tier: 'premium', label: 'HOLD · 专业' },
];

export default function TestCards() {
  const [urls, setUrls] = useState<{ label: string; url: string; type: 'statement' | 'prediction' }[]>([]);

  useEffect(() => {
    const run = async () => {
      const cfg = await getAppConfig().catch(() => null);
      const MOCK_BASE = { ...MOCK_BASE_STATIC, appName: cfg?.app_name || MOCK_BASE_STATIC.appName };
      const results: { label: string; url: string; type: 'statement' | 'prediction' }[] = [];
      for (const c of CASES) {
        const params = { ...MOCK_BASE, action: c.action, tier: c.tier };
        const { blob: sb } = await generateStatementCardBlob(params);
        results.push({ label: c.label + ' Statement', url: URL.createObjectURL(sb), type: 'statement' });
        const { blob: pb } = await generatePredictionCardBlob(params);
        results.push({ label: c.label + ' Prediction', url: URL.createObjectURL(pb), type: 'prediction' });
      }
      // Edge cases
      const { blob: pb0 } = await generatePredictionCardBlob({ ...MOCK_BASE, action: 'buy', tier: 'premium', confidence: 0, targetPrice: 1680 });
      results.push({ label: 'BUY conf=0 ret≈0', url: URL.createObjectURL(pb0), type: 'prediction' });
      setUrls(results);
    };
    run();
  }, []);

  return (
    <div style={{ background: '#111', minHeight: '100vh', padding: 24 }}>
      <h1 style={{ color: '#fff', fontSize: 18, marginBottom: 24 }}>Card Preview</h1>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20 }}>
        {urls.map(({ label, url }) => (
          <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>{label}</span>
            <img src={url} alt={label} style={{ width: 200, borderRadius: 8 }} />
          </div>
        ))}
      </div>
    </div>
  );
}
