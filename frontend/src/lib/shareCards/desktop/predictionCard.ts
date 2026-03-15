/**
 * Desktop prediction certificate card — 1200×720 landscape.
 * Design: Left 380px hero panel + Right 820px white analysis zone.
 */

import { PredictionCardParams } from '../mobile/predictionCard';
import { drawQR, fmtPrice } from '../utils';

export type { PredictionCardParams };

export async function generateDesktopPredictionCardBlob(p: PredictionCardParams): Promise<{ blob: Blob; filename: string }> {
  const { stockName, stockCode, market, action, confidence, latestPrice, targetPrice, stopLoss,
    opportunityGrade, reasonExcerpt, analyzedAt, tier, appName, appBaseUrl,
    marketDiagnosis, opportunityAssessment, riskAnalysis, executionPlan } = p;

  const isBuy  = action === 'buy';
  const isSell = action === 'sell';
  const isHold = action === 'hold';
  const isFree = tier === 'free';

  // ── Metrics ───────────────────────────────────────────────────
  const impliedReturn: number | null = (targetPrice != null && latestPrice != null && latestPrice > 0)
    ? ((targetPrice - latestPrice) / latestPrice) * 100 : null;
  const maxLoss: number | null = (stopLoss != null && latestPrice != null && latestPrice > 0)
    ? ((stopLoss - latestPrice) / latestPrice) * 100 : null;
  const rr: number | null = (impliedReturn != null && maxLoss != null && maxLoss < 0 && Math.abs(impliedReturn) > 0.1)
    ? Math.abs(impliedReturn / maxLoss) : null;

  // Hero metric
  const heroIsRisk = isHold && (impliedReturn == null || Math.abs(impliedReturn) < 0.5);
  const heroValue  = heroIsRisk ? maxLoss : impliedReturn;
  const heroLabel  = heroIsRisk ? '止损参考距离' : '预期潜在空间';
  const heroSign   = heroValue != null && heroValue > 0 ? '+' : '';
  const heroStr    = (heroValue != null && Math.abs(heroValue) >= 0.05) ? `${heroSign}${heroValue.toFixed(1)}%` : actionCN();

  function actionCN() { return isBuy ? '看好' : isSell ? '看空' : '观望'; }
  const ACTION_CN = actionCN();

  // Price formatter
  const fmtP = (price: number | null) => fmtPrice(price, market);

  // ── Color palette ─────────────────────────────────────────────
  const heroColor = isBuy ? '#FF3B30' : isSell ? '#34C759' : '#6B7280';
  const heroDark  = isBuy ? '#8B0000' : isSell ? '#0A4520' : '#374151';

  // ── Canvas setup ──────────────────────────────────────────────
  const W = 1200, H = 720;
  const LEFT_W = 380;
  const RIGHT_X = LEFT_W;
  const RIGHT_W = W - LEFT_W;
  const dpr = 2;

  const canvas = document.createElement('canvas');
  canvas.width  = W * dpr;
  canvas.height = H * dpr;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);

  const F = '"PingFang SC","Microsoft YaHei","Helvetica Neue",sans-serif';
  const M = '"SF Mono","Menlo","Courier New",monospace';

  // Helper: draw shadow for cards
  function setShadow(blur = 12, alpha = 0.07) {
    ctx.shadowColor = `rgba(0,0,0,${alpha})`;
    ctx.shadowBlur  = blur;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 2;
  }
  function clearShadow() {
    ctx.shadowColor   = 'transparent';
    ctx.shadowBlur    = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  }

  // ══════════════════════════════════════════════════════════════
  // LEFT PANEL
  // ══════════════════════════════════════════════════════════════

  // 1. Background gradient
  const lg = ctx.createLinearGradient(0, 0, LEFT_W * 0.7, H);
  lg.addColorStop(0, heroDark);
  lg.addColorStop(1, heroColor + 'dd');
  ctx.fillStyle = lg;
  ctx.fillRect(0, 0, LEFT_W, H);

  // 2. Radial glow
  const lpGlow = ctx.createRadialGradient(LEFT_W * 0.6, H * 0.35, 0, LEFT_W * 0.6, H * 0.35, 240);
  lpGlow.addColorStop(0, heroColor + '33');
  lpGlow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = lpGlow;
  ctx.fillRect(0, 0, LEFT_W, H);

  // 3. Top 4px strip
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(0, 0, LEFT_W, 4);

  // 4. App name
  ctx.font = `600 14px ${F}`;
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.textAlign = 'left';
  ctx.fillText(`◆ ${appName}`, 28, 38);

  // 5. Stock name
  ctx.font = `900 48px ${F}`;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.shadowColor = 'rgba(0,0,0,0.3)';
  ctx.shadowBlur  = 12;
  const displayName = stockName.length > 6 ? stockName.slice(0, 6) + '…' : stockName;
  ctx.fillText(displayName, 28, 130);
  clearShadow();

  // 6. Stock code + market badges
  const mktLabel = market === 'hk' ? '港股' : market === 'us' ? '美股' : market === 'futures' ? '期货' : 'A股';
  const badges = [stockCode, mktLabel].filter(Boolean);
  let bx = 28;
  ctx.font = `600 13px ${F}`;
  badges.forEach(b => {
    const bw = ctx.measureText(b).width + 18;
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath(); ctx.roundRect(bx, 148, bw, 24, 6); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(bx, 148, bw, 24, 6); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.textAlign = 'left';
    ctx.fillText(b, bx + 9, 164);
    bx += bw + 8;
  });

  // 7. Action label pill
  ctx.font = `700 15px ${F}`;
  const apW = ctx.measureText(ACTION_CN).width + 24;
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.beginPath(); ctx.roundRect(28, 188, apW, 32, 8); ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.fillText(ACTION_CN, 28 + apW / 2, 208);

  // 8. Hero number
  ctx.shadowColor = 'rgba(0,0,0,0.28)';
  ctx.shadowBlur  = 24;
  ctx.shadowOffsetY = 6;
  const heroFontSize = heroStr.length > 7 ? 56 : heroStr.length > 5 ? 64 : 72;
  ctx.font = `800 ${heroFontSize}px ${F}`;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.fillText(heroStr, LEFT_W / 2, 320);
  clearShadow();

  // 9. Sub-label
  ctx.font = `400 14px ${F}`;
  ctx.fillStyle = 'rgba(255,255,255,0.58)';
  ctx.textAlign = 'center';
  ctx.fillText(heroLabel, LEFT_W / 2, 342);

  // 10. R:R note
  if (rr != null) {
    ctx.font = `500 13px ${F}`;
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.textAlign = 'center';
    ctx.fillText(`风险收益比  ${rr.toFixed(1)} : 1`, LEFT_W / 2, 362);
  }

  // 11. Three price pill cards
  const priceItems = [
    { label: '研判时价', val: fmtP(latestPrice), col: 'rgba(255,255,255,0.9)' },
    { label: '目标估价', val: fmtP(targetPrice),  col: isFree ? 'rgba(255,255,255,0.28)' : '#86efac' },
    { label: '止损参考', val: fmtP(stopLoss),     col: isFree ? 'rgba(255,255,255,0.28)' : '#fca5a5' },
  ];
  priceItems.forEach((item, i) => {
    const py = 392 + i * (72 + 4);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath(); ctx.roundRect(16, py, LEFT_W - 32, 68, 8); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(16, py, LEFT_W - 32, 68, 8); ctx.stroke();
    ctx.font = `400 11px ${F}`;
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.textAlign = 'left';
    ctx.fillText(item.label, 28, py + 20);
    ctx.font = `700 20px ${M}`;
    ctx.fillStyle = item.col;
    ctx.textAlign = 'right';
    ctx.fillText(item.val, LEFT_W - 24, py + 46);
  });

  // 12. Bottom 4px strip
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.fillRect(0, H - 4, LEFT_W, 4);

  // ══════════════════════════════════════════════════════════════
  // RIGHT PANEL
  // ══════════════════════════════════════════════════════════════

  // 1. Background
  ctx.fillStyle = '#FAFAFA';
  ctx.fillRect(RIGHT_X, 0, RIGHT_W, H);

  // 2. Top bar
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(RIGHT_X, 0, RIGHT_W, 48);
  ctx.strokeStyle = '#e8ecf0';
  ctx.lineWidth = 0.5;
  ctx.beginPath(); ctx.moveTo(RIGHT_X, 48); ctx.lineTo(W, 48); ctx.stroke();

  // Tier badge (left of top bar)
  const tierLabel   = tier === 'premium' ? '◈ 专业版' : tier === 'basic' ? '◉ 标准版' : '◎ 免费版';
  const tierFg      = tier === 'premium' ? '#d97706' : tier === 'basic' ? '#2563eb' : '#94a3b8';
  const tierBg      = tier === 'premium' ? 'rgba(217,119,6,0.12)' : tier === 'basic' ? 'rgba(37,99,235,0.10)' : 'rgba(148,163,184,0.10)';
  ctx.font = `600 12px ${F}`;
  const tbW = ctx.measureText(tierLabel).width + 20;
  ctx.fillStyle = tierBg;
  ctx.beginPath(); ctx.roundRect(RIGHT_X + 16, 11, tbW, 26, 8); ctx.fill();
  ctx.fillStyle = tierFg;
  ctx.textAlign = 'left';
  ctx.fillText(tierLabel, RIGHT_X + 16 + 10, 29);

  // Timestamp (right of top bar)
  const dt = new Date(analyzedAt || Date.now());
  const dateStamp = dt.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  ctx.font = `400 12px ${M}`;
  ctx.fillStyle = '#94a3b8';
  ctx.textAlign = 'right';
  ctx.fillText(dateStamp, W - 20, 29);

  // ── METRICS ROW ───────────────────────────────────────────────
  const MET_Y  = 56;
  const MET_H  = 64;
  const MET_PAD = 12;
  const metColW = Math.floor(RIGHT_W / 3);

  // Card helper
  function drawMetCard(mx: number, last = false) {
    const cardX = mx + MET_PAD;
    const cardW = metColW - MET_PAD - (last ? MET_PAD : MET_PAD / 2);
    ctx.fillStyle = '#ffffff';
    setShadow(12, 0.07);
    ctx.beginPath(); ctx.roundRect(cardX, MET_Y, cardW, MET_H, 12); ctx.fill();
    clearShadow();
    return { cardX, cardW };
  }

  // Card 1: AI置信度
  {
    const { cardX, cardW } = drawMetCard(RIGHT_X + 0);
    ctx.font = `400 11px ${F}`; ctx.fillStyle = '#6b7280'; ctx.textAlign = 'left';
    ctx.fillText('AI 置信度', cardX + 12, MET_Y + 18);
    if (confidence != null) {
      const cbx = cardX + 12, cbw = cardW - 56, cbh = 6, cby = MET_Y + 30;
      ctx.fillStyle = '#e5e7eb';
      ctx.beginPath(); ctx.roundRect(cbx, cby, cbw, cbh, 3); ctx.fill();
      const filled = Math.max(4, Math.round(cbw * confidence / 100));
      ctx.fillStyle = heroColor;
      ctx.beginPath(); ctx.roundRect(cbx, cby, filled, cbh, 3); ctx.fill();
      ctx.font = `700 18px ${F}`; ctx.fillStyle = '#1f2937'; ctx.textAlign = 'right';
      ctx.fillText(`${confidence}%`, cardX + cardW - 12, MET_Y + 54);
    }
  }

  // Card 2: 机会评级
  {
    const { cardX, cardW } = drawMetCard(RIGHT_X + metColW);
    ctx.font = `400 11px ${F}`; ctx.fillStyle = '#6b7280'; ctx.textAlign = 'left';
    ctx.fillText('机会评级', cardX + 12, MET_Y + 18);
    if (opportunityGrade) {
      const gradeColors: Record<string, string> = { A: '#ef4444', B: '#f59e0b', C: '#6b7280', D: '#9ca3af' };
      const gc = gradeColors[opportunityGrade] || '#6b7280';
      ctx.font = `800 26px ${F}`; ctx.fillStyle = gc; ctx.textAlign = 'left';
      ctx.fillText(opportunityGrade, cardX + 12, MET_Y + 54);
      ctx.font = `500 14px ${F}`; ctx.fillStyle = gc + 'aa';
      ctx.fillText('级', cardX + 12 + ctx.measureText(opportunityGrade).width + 2, MET_Y + 54);
    }
    void cardW;
  }

  // Card 3: 风险收益比
  {
    const { cardX } = drawMetCard(RIGHT_X + metColW * 2, true);
    ctx.font = `400 11px ${F}`; ctx.fillStyle = '#6b7280'; ctx.textAlign = 'left';
    ctx.fillText('风险收益比', cardX + 12, MET_Y + 18);
    ctx.font = `800 20px ${M}`;
    ctx.fillStyle = rr != null ? '#1f2937' : '#d1d5db';
    ctx.textAlign = 'left';
    ctx.fillText(rr != null ? `${rr.toFixed(1)} : 1` : '—', cardX + 12, MET_Y + 54);
  }

  // ── ANALYSIS GRID 2×2 ────────────────────────────────────────
  const GRID_Y    = 132;
  const GRID_X    = RIGHT_X + 12;
  const GRID_W    = RIGHT_W - 24;
  const COL_W     = Math.floor((GRID_W - 12) / 2);   // 12px gap between cols
  const BOT_BAR_H = 44;
  const SEAL_H    = 52;
  const SEAL_Y    = H - BOT_BAR_H - 8 - SEAL_H;
  const ROW_H     = Math.floor((SEAL_Y - GRID_Y - 8) / 2) - 4; // 8px gap between rows

  const sectionData: { label: string; icon: string; tint: string; content: string }[] = [
    { label: '市场诊断', icon: '诊', tint: '#0071e3', content: marketDiagnosis || reasonExcerpt || '' },
    { label: '机会评估', icon: '机', tint: '#f59e0b', content: opportunityAssessment || '' },
    { label: '风险收益', icon: '险', tint: '#ef4444', content: riskAnalysis || '' },
    { label: '执行方案', icon: '行', tint: '#10b981', content: executionPlan || '' },
  ];

  sectionData.forEach((sec, idx) => {
    const col = idx % 2;
    const row = Math.floor(idx / 2);
    const sx  = GRID_X + col * (COL_W + 12);
    const sy  = GRID_Y + row * (ROW_H + 8);
    const sw  = COL_W;
    const sh  = ROW_H;

    // Card background
    ctx.fillStyle = '#ffffff';
    setShadow(12, 0.07);
    ctx.beginPath(); ctx.roundRect(sx, sy, sw, sh, 12); ctx.fill();
    clearShadow();

    // Top 3px accent strip
    ctx.fillStyle = sec.tint;
    ctx.beginPath(); ctx.roundRect(sx, sy, sw, 3, [12, 12, 0, 0]); ctx.fill();

    // Left 4px accent bar
    ctx.fillStyle = sec.tint;
    ctx.beginPath(); ctx.roundRect(sx, sy + 3, 4, sh - 3, [0, 0, 2, 2]); ctx.fill();

    const innerX  = sx + 16;
    const innerW  = sw - 28;
    const iconY   = sy + 16;
    const iconR   = 18; // radius

    // Icon circle
    ctx.fillStyle = sec.tint + '18';
    ctx.beginPath(); ctx.arc(innerX + iconR, iconY + iconR, iconR, 0, Math.PI * 2); ctx.fill();
    ctx.font = `700 14px ${F}`; ctx.textAlign = 'center'; ctx.fillStyle = sec.tint;
    ctx.fillText(sec.icon, innerX + iconR, iconY + iconR + 5);

    // Section label
    ctx.font = `600 11px ${F}`; ctx.textAlign = 'left'; ctx.fillStyle = sec.tint;
    ctx.fillText(sec.label, innerX + iconR * 2 + 8, iconY + 14);

    // Content text or locked state
    ctx.font = `400 12px ${F}`; ctx.textAlign = 'left';
    const textStartY = iconY + iconR * 2 + 10;
    const lineH = 17;

    if (isFree && !sec.content) {
      ctx.fillStyle = '#c7c7cc';
      ctx.fillText('升级解锁完整分析', innerX + iconR * 2 + 8, textStartY);
    } else {
      ctx.fillStyle = '#374151';
      // Wrap content to 2 lines, constrained to card width
      const maxW = innerW - (iconR * 2 + 8);
      let rem = sec.content || '—';
      let lineY = textStartY;
      for (let li = 0; li < 2; li++) {
        if (!rem) break;
        if (ctx.measureText(rem).width <= maxW) {
          ctx.fillText(rem, innerX + iconR * 2 + 8, lineY);
          break;
        }
        let line = rem;
        const sfx = li < 1 ? '' : '…';
        while (line.length > 0 && ctx.measureText(line + sfx).width > maxW) line = line.slice(0, -1);
        ctx.fillText(line + sfx, innerX + iconR * 2 + 8, lineY);
        rem = rem.slice(line.length);
        lineY += lineH;
      }
    }
  });

  // ── TIMESTAMP SEAL ────────────────────────────────────────────
  ctx.fillStyle = '#ffffff';
  setShadow(12, 0.07);
  ctx.beginPath(); ctx.roundRect(RIGHT_X + 12, SEAL_Y, RIGHT_W - 24, SEAL_H, 12); ctx.fill();
  clearShadow();

  // Left heroColor accent bar
  ctx.fillStyle = heroColor;
  ctx.beginPath(); ctx.roundRect(RIGHT_X + 12, SEAL_Y, 4, SEAL_H, [2, 0, 0, 2]); ctx.fill();

  ctx.font = `600 13px ${F}`; ctx.fillStyle = heroColor; ctx.textAlign = 'left';
  ctx.fillText('🔒 研判时间戳已封存', RIGHT_X + 24, SEAL_Y + 20);
  ctx.font = `400 11px ${F}`; ctx.fillStyle = '#8e8e93';
  ctx.fillText('此研判截面已锁定 · 可于未来核验分析准确性', RIGHT_X + 24, SEAL_Y + 38);
  ctx.font = `500 12px ${M}`; ctx.fillStyle = '#1c1c1e'; ctx.textAlign = 'right';
  ctx.fillText(dateStamp, W - 20, SEAL_Y + 20);

  // ── BOTTOM BAR ────────────────────────────────────────────────
  const BOT_Y = H - BOT_BAR_H;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(RIGHT_X, BOT_Y, RIGHT_W, BOT_BAR_H);
  ctx.strokeStyle = '#e8ecf0';
  ctx.lineWidth = 0.5;
  ctx.beginPath(); ctx.moveTo(RIGHT_X, BOT_Y); ctx.lineTo(W, BOT_Y); ctx.stroke();

  // Left: branding
  ctx.font = `600 12px ${F}`; ctx.fillStyle = '#3c3c43'; ctx.textAlign = 'left';
  ctx.fillText(`由 ${appName} AI生成`, RIGHT_X + 16, BOT_Y + 18);
  ctx.font = `400 11px ${F}`; ctx.fillStyle = '#8e8e93';
  ctx.fillText('不构成投资建议', RIGHT_X + 16, BOT_Y + 34);

  // Right: QR code + CTA
  const qrSize = 36;
  const qrX    = W - 16 - qrSize;
  const qrY    = BOT_Y + 4;
  const qrUrl  = appBaseUrl || 'https://aiklines.app';
  drawQR(ctx, qrX, qrY, qrSize, '#1c1c1e', '#ffffff');

  ctx.font = `700 12px ${F}`; ctx.fillStyle = '#1c1c1e'; ctx.textAlign = 'right';
  ctx.fillText('我已布局，你呢？', qrX - 10, BOT_Y + 26);

  void qrUrl; // consumed by drawQR call above

  return new Promise<{ blob: Blob; filename: string }>((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob) { reject(new Error('canvas.toBlob failed')); return; }
      resolve({ blob, filename: `${stockCode || stockName}_桌面凭证.png` });
    }, 'image/png');
  });
}
