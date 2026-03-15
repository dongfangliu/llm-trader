/**
 * Desktop analysis share card — 1200×700 landscape.
 * NEW design: left dark panel (300px) + right content area (900px).
 */

import { ShareCardParams } from '../mobile/analysisCard';

export type { ShareCardParams };

export async function generateDesktopAnalysisCardBlob(p: ShareCardParams): Promise<{ blob: Blob; filename: string }> {
  const { result, tier, analyzedAt, appName } = p;

  const action = result?.result?.action;
  const isBuy = action === 'buy', isSell = action === 'sell';
  const actionLabel = isBuy ? '买入' : isSell ? '卖出' : '观望';

  // Chinese convention: buy = red, sell = green, hold = blue
  const panelTop = isBuy ? '#3b0a0a' : isSell ? '#052e16' : '#0c1929';
  const panelBot = isBuy ? '#991b1b' : isSell ? '#166534' : '#1e3a5f';
  const accent   = isBuy ? '#ef4444' : isSell ? '#22c55e' : '#60a5fa';
  const accentLt = isBuy ? '#fca5a5' : isSell ? '#86efac' : '#bfdbfe';
  const accentDk = isBuy ? '#b91c1c' : isSell ? '#15803d' : '#1d4ed8';

  const stockName   = result?.data?.name || result?.data?.symbol || '';
  const stockCode   = result?.data?.symbol || '';
  const isMasked    = result?.result?._masked;
  const confidence  = isMasked ? null : result?.result?.confidence;
  const targetPrice = isMasked ? null : result?.result?.target_price;
  const stopLoss    = isMasked ? null : result?.result?.stop_loss;
  const latestPrice: number | null = typeof result?.data?.latest_price === 'number' ? result.data.latest_price : null;

  const mktDiag   : string = result?.result?.market_diagnosis      || '';
  const oppAssess : string = result?.result?.opportunity_assessment || '';
  const riskAnal  : string = result?.result?.risk_analysis          || '';
  const execPlan  : string = result?.result?.execution_plan         || '';

  const W = 1200, H = 700;
  const LEFT_W = 300;
  const RIGHT_W = W - LEFT_W;
  const TOP_H = 48;
  const BOT_H = 44;
  const dpr = 2;

  const canvas = document.createElement('canvas');
  canvas.width = W * dpr; canvas.height = H * dpr;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);

  const F = '"PingFang SC","Microsoft YaHei","Helvetica Neue",sans-serif';

  // Helper: wrap text
  const wrapText = (text: string, maxW: number, maxLines: number): string[] => {
    const out: string[] = [];
    let rem = text;
    for (let i = 0; i < maxLines; i++) {
      if (!rem) break;
      if (ctx.measureText(rem).width <= maxW) { out.push(rem); break; }
      let line = rem;
      const sfx = i < maxLines - 1 ? '' : '…';
      while (line.length > 0 && ctx.measureText(line + sfx).width > maxW) line = line.slice(0, -1);
      out.push(line + sfx);
      rem = rem.slice(line.length);
    }
    return out;
  };

  // ── WHITE BODY ────────────────────────────────────────────────
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  // ── LEFT PANEL: action gradient ───────────────────────────────
  const lg = ctx.createLinearGradient(0, 0, LEFT_W * 0.6, H);
  lg.addColorStop(0, panelTop); lg.addColorStop(1, panelBot);
  ctx.fillStyle = lg;
  ctx.fillRect(0, 0, LEFT_W, H);

  // Left panel radial glow
  const lpGlow = ctx.createRadialGradient(LEFT_W / 2, H / 3, 0, LEFT_W / 2, H / 3, 180);
  lpGlow.addColorStop(0, isBuy ? 'rgba(239,68,68,0.22)' : isSell ? 'rgba(34,197,94,0.22)' : 'rgba(96,165,250,0.22)');
  lpGlow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = lpGlow;
  ctx.fillRect(0, 0, LEFT_W, H);

  // Top accent stripe on left panel
  const ls = ctx.createLinearGradient(0, 0, LEFT_W, 0);
  ls.addColorStop(0, accentDk); ls.addColorStop(1, accentLt);
  ctx.fillStyle = ls; ctx.fillRect(0, 0, LEFT_W, 4);

  // Stock name in left panel
  const maxNameLen = 6;
  const displayName = stockName.length > maxNameLen ? stockName.slice(0, maxNameLen) + '…' : stockName;
  ctx.font = `800 32px ${F}`; ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center';
  ctx.shadowColor = 'rgba(0,0,0,0.3)'; ctx.shadowBlur = 10;
  ctx.fillText(displayName, LEFT_W / 2, 120);
  ctx.shadowBlur = 0;

  // Stock code pill
  if (stockCode) {
    ctx.font = `600 13px ${F}`;
    const cpW = ctx.measureText(stockCode).width + 20;
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.beginPath(); ctx.roundRect(LEFT_W / 2 - cpW / 2, 132, cpW, 24, 12); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(LEFT_W / 2 - cpW / 2, 132, cpW, 24, 12); ctx.stroke();
    ctx.fillStyle = accentLt; ctx.textAlign = 'center';
    ctx.fillText(stockCode, LEFT_W / 2, 149);
  }

  // Action badge
  ctx.font = `900 48px ${F}`; ctx.fillStyle = accentLt; ctx.textAlign = 'center';
  ctx.shadowColor = accent; ctx.shadowBlur = 24; ctx.shadowOffsetY = 4;
  ctx.fillText(actionLabel, LEFT_W / 2, 234);
  ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

  // Confidence pill
  if (confidence != null) {
    const confTxt = `${confidence}%`;
    ctx.font = `700 14px ${F}`;
    const cPW = ctx.measureText(confTxt).width + 24;
    ctx.fillStyle = accent + '30';
    ctx.beginPath(); ctx.roundRect(LEFT_W / 2 - cPW / 2, 252, cPW, 26, 13); ctx.fill();
    ctx.strokeStyle = accent + '60'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(LEFT_W / 2 - cPW / 2, 252, cPW, 26, 13); ctx.stroke();
    ctx.fillStyle = accentLt; ctx.textAlign = 'center';
    ctx.fillText(confTxt, LEFT_W / 2, 270);
    ctx.font = `400 11px ${F}`; ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText('AI 置信度', LEFT_W / 2, 290);
  }

  // Price pills in left panel
  const priceData = [
    { label: '最新价', val: latestPrice != null ? latestPrice.toFixed(2) : '—', col: 'rgba(255,255,255,0.92)' },
    { label: '目标价', val: typeof targetPrice === 'number' ? targetPrice.toFixed(2) : '—', col: isMasked ? 'rgba(255,255,255,0.3)' : '#86efac' },
    { label: '止损位', val: typeof stopLoss === 'number' ? stopLoss.toFixed(2) : '—', col: isMasked ? 'rgba(255,255,255,0.3)' : '#fca5a5' },
  ];
  const priceStartY = 320;
  priceData.forEach((item, i) => {
    const py = priceStartY + i * 60;
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath(); ctx.roundRect(20, py, LEFT_W - 40, 48, 8); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(20, py, LEFT_W - 40, 48, 8); ctx.stroke();
    ctx.font = `400 10px ${F}`; ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.textAlign = 'left';
    ctx.fillText(item.label, 32, py + 16);
    ctx.font = `700 18px ${F}`; ctx.fillStyle = item.col; ctx.textAlign = 'right';
    ctx.fillText(item.val, LEFT_W - 32, py + 34);
  });

  // ── TOP BAR (right area) ──────────────────────────────────────
  ctx.fillStyle = '#f8f9fb';
  ctx.fillRect(LEFT_W, 0, RIGHT_W, TOP_H);
  ctx.strokeStyle = '#e8ecf0'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(LEFT_W, TOP_H); ctx.lineTo(W, TOP_H); ctx.stroke();

  ctx.font = `700 15px ${F}`; ctx.fillStyle = '#1e293b'; ctx.textAlign = 'left';
  ctx.fillText(appName, LEFT_W + 24, 30);

  const marketInfo = `${stockCode}  ·  ${result?.data?.market?.toUpperCase() || 'A股'}`;
  ctx.font = `400 13px ${F}`; ctx.fillStyle = '#64748b'; ctx.textAlign = 'right';
  ctx.fillText(marketInfo, W - 24, 30);

  // ── CONTENT GRID: 2×2 sections ───────────────────────────────
  const GRID_X = LEFT_W + 16;
  const GRID_Y = TOP_H + 12;
  const GRID_W = RIGHT_W - 32;
  const GRID_H = H - TOP_H - BOT_H - 24;
  const COL_W = Math.floor(GRID_W / 2);
  const ROW_H = Math.floor(GRID_H / 2);

  const sections = [
    { label: '市场诊断', text: mktDiag,   color: '#6366f1', rgb: '99,102,241' },
    { label: '机会评估', text: oppAssess,  color: '#0ea5e9', rgb: '14,165,233' },
    { label: '风险分析', text: riskAnal,   color: '#f59e0b', rgb: '245,158,11' },
    { label: '执行方案', text: execPlan,   color: '#10b981', rgb: '16,185,129' },
  ];

  sections.forEach((sec, idx) => {
    const col = idx % 2;
    const row = Math.floor(idx / 2);
    const cx = GRID_X + col * COL_W;
    const cy = GRID_Y + row * ROW_H;
    const cw = COL_W - 8;
    const ch = ROW_H - 8;

    // Card background
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = `rgba(${sec.rgb},0.10)`; ctx.shadowBlur = 8; ctx.shadowOffsetY = 2;
    ctx.beginPath(); ctx.roundRect(cx, cy, cw, ch, 10); ctx.fill();
    ctx.shadowBlur = 0; ctx.shadowColor = 'transparent'; ctx.shadowOffsetY = 0;
    ctx.strokeStyle = `rgba(${sec.rgb},0.15)`; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(cx, cy, cw, ch, 10); ctx.stroke();

    // Left accent bar
    const abG = ctx.createLinearGradient(0, cy, 0, cy + ch);
    abG.addColorStop(0, sec.color); abG.addColorStop(1, sec.color + '80');
    ctx.fillStyle = abG;
    ctx.beginPath(); ctx.roundRect(cx, cy + 10, 4, ch - 20, [0, 2, 2, 0]); ctx.fill();

    // Label
    ctx.font = `600 11px ${F}`; ctx.fillStyle = sec.color; ctx.textAlign = 'left';
    ctx.fillText(sec.label.toUpperCase(), cx + 16, cy + 22);

    // Separator line
    ctx.strokeStyle = `rgba(${sec.rgb},0.12)`; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx + 16, cy + 30); ctx.lineTo(cx + cw - 16, cy + 30); ctx.stroke();

    // Content text — 3 lines max
    ctx.font = `400 13px ${F}`; ctx.fillStyle = '#374151';
    const textMaxW = cw - 32;
    const lines = wrapText(sec.text || '—', textMaxW, 3);
    lines.forEach((ln, li) => ctx.fillText(ln, cx + 16, cy + 48 + li * 18));
  });

  // ── BOTTOM BAR ────────────────────────────────────────────────
  const botY = H - BOT_H;
  const botG = ctx.createLinearGradient(LEFT_W, botY, W, H);
  botG.addColorStop(0, '#f8f9fb'); botG.addColorStop(1, '#f1f5f9');
  ctx.fillStyle = botG;
  ctx.fillRect(LEFT_W, botY, RIGHT_W, BOT_H);
  ctx.strokeStyle = '#e8ecf0'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(LEFT_W, botY); ctx.lineTo(W, botY); ctx.stroke();

  const analysisDate = analyzedAt
    ? new Date(analyzedAt).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    : '';
  ctx.font = `400 11px ${F}`; ctx.fillStyle = '#94a3b8'; ctx.textAlign = 'left';
  ctx.fillText(analysisDate, LEFT_W + 24, botY + 26);

  ctx.font = `500 11px ${F}`; ctx.fillStyle = '#64748b'; ctx.textAlign = 'right';
  ctx.fillText(`由 ${appName} AI 生成`, W - 24, botY + 26);

  // Bottom left panel gradient continuation
  const lbG = ctx.createLinearGradient(0, botY, 0, H);
  lbG.addColorStop(0, panelBot); lbG.addColorStop(1, panelBot + 'cc');
  ctx.fillStyle = lbG;
  ctx.fillRect(0, botY, LEFT_W, BOT_H);

  ctx.font = `400 10px ${F}`; ctx.fillStyle = 'rgba(255,255,255,0.38)'; ctx.textAlign = 'center';
  ctx.fillText('AI 研判 · 仅供参考', LEFT_W / 2, botY + 26);

  // Vertical separator between left panel and right area
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(LEFT_W, 0); ctx.lineTo(LEFT_W, H); ctx.stroke();

  return new Promise<{ blob: Blob; filename: string }>((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob) { reject(new Error('canvas.toBlob failed')); return; }
      resolve({ blob, filename: `${stockCode || stockName}_桌面研判.png` });
    }, 'image/png');
  });
}
