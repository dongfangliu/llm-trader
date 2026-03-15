/**
 * Mobile prediction certificate card — 1080×(dynamic) portrait.
 * Extracted from the original shareCard.ts.
 */

import { drawQR } from '../utils';

export interface PredictionCardParams {
  stockName: string;
  stockCode: string;
  market: string;
  action: 'buy' | 'sell' | 'hold';
  confidence: number | null;
  latestPrice: number | null;
  targetPrice: number | null;
  stopLoss: number | null;
  opportunityGrade: string | null;
  reasonExcerpt: string;
  analyzedAt: string;
  tier: string;
  appName: string;
  appBaseUrl?: string;
  basicDailyLimit?: number;  // 标准版每日限额，动态读取自后端
  marketDiagnosis?: string;
  opportunityAssessment?: string;
  riskAnalysis?: string;
  executionPlan?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// R11: 研判凭证 — "Signal Card" design
// Philosophy: Jobs-level clarity. Light bg (readable anywhere). Strategy color
// dominates the hero zone. One giant number = the hook. Real QR. Viral CTA.
// 1080×1440 (3:4) — native 小红书 / 微信 dimensions.
// ─────────────────────────────────────────────────────────────────────────────
export async function generatePredictionCardBlob(p: PredictionCardParams): Promise<{ blob: Blob; filename: string }> {
  const { stockName, stockCode, market, action, latestPrice, targetPrice, stopLoss,
    opportunityGrade, reasonExcerpt, analyzedAt, tier, appName, appBaseUrl,
    marketDiagnosis, opportunityAssessment, riskAnalysis, executionPlan } = p;
  const basicDailyLimit = p.basicDailyLimit ?? 5;

  const isBuy  = action === 'buy';
  const isSell = action === 'sell';
  const isHold = action === 'hold';

  // ── Metrics ───────────────────────────────────────────────────
  const impliedReturn: number | null = (targetPrice != null && latestPrice != null && latestPrice > 0)
    ? ((targetPrice - latestPrice) / latestPrice) * 100 : null;
  const maxLoss: number | null = (stopLoss != null && latestPrice != null && latestPrice > 0)
    ? ((stopLoss - latestPrice) / latestPrice) * 100 : null;
  const rr: number | null = (impliedReturn != null && maxLoss != null && maxLoss < 0 && Math.abs(impliedReturn) > 0.1)
    ? Math.abs(impliedReturn / maxLoss) : null;

  // For hold with trivial return, show stop-loss risk distance
  const heroIsRisk = isHold && (impliedReturn == null || Math.abs(impliedReturn) < 0.5);
  const heroValue  = heroIsRisk ? maxLoss : impliedReturn;
  const heroLabel  = heroIsRisk ? '止损参考距离' : '预期潜在空间';
  const heroSign   = heroValue != null && heroValue > 0 ? '+' : '';
  const heroStr    = (heroValue != null && Math.abs(heroValue) >= 0.05) ? `${heroSign}${heroValue.toFixed(1)}%` : '—';

  // ── Color palette: strategy-driven, Chinese convention ────────
  // Red = 看好(buy/up), Green = 看空(sell/down), Gray = 观望(hold)
  const heroColor  = isBuy ? '#FF3B30' : isSell ? '#34C759' : '#6B7280';
  const heroDark   = isBuy ? '#8B0000' : isSell ? '#0A4520' : '#374151'; void heroDark;
  const accentText = heroColor;
  const actionCN   = isBuy ? '看好' : isSell ? '看空' : '观望';
  const isFree     = tier === 'free';
  // Free tier: hero shows direction text, not a percentage
  const finalHeroStr   = isFree ? actionCN : heroStr;
  const finalHeroLabel = isFree ? 'AI研判' : heroLabel;

  // ── Canvas ────────────────────────────────────────────────────
  const W = 1080, H = 2400;
  const HERO_H = 580;
  const PAD = 64;
  const dpr = 2;
  const canvas = document.createElement('canvas');
  canvas.width = W * dpr; canvas.height = H * dpr;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);
  const F = '"PingFang SC","Helvetica Neue","Microsoft YaHei",sans-serif';
  const M = '"SF Mono","Menlo","Courier New",monospace';

  // ── HERO ZONE: solid strategy color ──────────────────────────
  ctx.fillStyle = heroColor;
  ctx.fillRect(0, 0, W, HERO_H);

  // Radial dark vignette at edges for depth
  const vgr = ctx.createRadialGradient(W / 2, HERO_H / 2, W * 0.15, W / 2, HERO_H / 2, W * 0.8);
  vgr.addColorStop(0, 'rgba(0,0,0,0)');
  vgr.addColorStop(1, 'rgba(0,0,0,0.28)');
  ctx.fillStyle = vgr;
  ctx.fillRect(0, 0, W, HERO_H);

  // Gradual fade into white zone — starts below all hero text, eases over 72px
  const heroFade = ctx.createLinearGradient(0, HERO_H - 72, 0, HERO_H);
  heroFade.addColorStop(0, 'rgba(250,250,250,0)');
  heroFade.addColorStop(0.4, 'rgba(250,250,250,0.05)');
  heroFade.addColorStop(0.75, 'rgba(250,250,250,0.45)');
  heroFade.addColorStop(1, '#FAFAFA');
  ctx.fillStyle = heroFade;
  ctx.fillRect(0, HERO_H - 72, W, 72);

  // ── WHITE ZONE ────────────────────────────────────────────────
  ctx.fillStyle = '#FAFAFA';
  ctx.fillRect(0, HERO_H, W, H - HERO_H);

  // ── HEADER: App name left, timestamp right ────────────────────
  ctx.font = `700 26px ${F}`; ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.fillText(`◆ ${appName}`, PAD, 70);

  const dt = new Date(analyzedAt || Date.now());
  const dateStamp = dt.toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });
  ctx.font = `400 21px ${M}`; ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(255,255,255,0.52)';
  ctx.fillText(dateStamp, W - PAD, 70);

  // Tier badge (top-right, below timestamp)
  const tierBadge = tier === 'premium' ? '◈ 专业版' : tier === 'basic' ? '◉ 标准版' : '免费版';
  const tierColor = tier === 'premium' ? '#F59E0B' : tier === 'basic' ? '#60A5FA' : 'rgba(255,255,255,0.55)';
  const tierBgColor = tier === 'premium' ? 'rgba(245,158,11,0.22)' : tier === 'basic' ? 'rgba(96,165,250,0.18)' : 'rgba(255,255,255,0.12)';
  ctx.font = `600 16px ${F}`;
  const tbW2 = ctx.measureText(tierBadge).width + 22;
  ctx.fillStyle = tierBgColor;
  ctx.beginPath(); ctx.roundRect(W - PAD - tbW2, 84, tbW2, 28, 8); ctx.fill();
  ctx.fillStyle = tierColor; ctx.textAlign = 'right';
  ctx.fillText(tierBadge, W - PAD - 11, 103);

  // ── STOCK NAME ────────────────────────────────────────────────
  ctx.font = `800 62px ${F}`; ctx.textAlign = 'left'; ctx.fillStyle = '#FFFFFF';
  ctx.fillText(stockName, PAD, 164);

  // Small badges: stock code · market (skip D-grade opportunities — they add noise)
  const badgeItems: { text: string; alpha: number }[] = [];
  if (stockCode) badgeItems.push({ text: stockCode, alpha: 0.22 });
  const mktLabel = market === 'hk' ? '港股' : market === 'us' ? '美股' : market === 'futures' ? '期货' : 'A股';
  badgeItems.push({ text: mktLabel, alpha: 0.15 });
  if (opportunityGrade && ['A', 'B', 'C'].includes(opportunityGrade))
    badgeItems.push({ text: `${opportunityGrade}级机会`, alpha: 0.22 });

  let bx = PAD;
  const bY = 192, bH = 34;
  ctx.font = `600 16px ${F}`;
  for (const b of badgeItems) {
    const tw = ctx.measureText(b.text).width;
    const bw = tw + 22;
    ctx.fillStyle = `rgba(255,255,255,${b.alpha})`;
    ctx.beginPath(); ctx.roundRect(bx, bY, bw, bH, 8); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    ctx.textAlign = 'left';
    ctx.fillText(b.text, bx + 11, bY + 22);
    bx += bw + 10;
  }

  // ── HERO NUMBER ───────────────────────────────────────────────
  ctx.shadowColor = 'rgba(0,0,0,0.25)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 8;
  const heroFontSize = finalHeroStr.length > 7 ? 118 : finalHeroStr.length > 5 ? 136 : 152;
  ctx.font = `800 ${heroFontSize}px ${F}`; ctx.textAlign = 'center'; ctx.fillStyle = '#FFFFFF';
  ctx.fillText(finalHeroStr, W / 2, 440);
  ctx.shadowBlur = 0; ctx.shadowColor = 'transparent'; ctx.shadowOffsetY = 0;

  // Hero label
  ctx.font = `500 24px ${F}`; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,0.72)';
  ctx.fillText(finalHeroLabel, W / 2, 490);

  // Sub-note: R:R or action context (free tier: generic, no ratio leakage)
  const rrNote = isFree
    ? (isBuy ? '技术面看好 · 升级解锁完整分析'
       : isSell ? '技术面看空 · 升级解锁完整分析'
       : '观望等待 · 升级解锁完整研判')
    : rr != null
    ? `风险收益比  ${rr.toFixed(1)} : 1`
    : isBuy ? '技术面看好 · 目标上行空间估算'
    : isSell ? '技术面看空 · 目标下行空间估算'
    : '止损保护为首要考量 · 等待更佳入场';
  ctx.font = `400 20px ${F}`; ctx.fillStyle = 'rgba(255,255,255,0.46)';
  ctx.fillText(rrNote, W / 2, 538);

  // ── WHITE ZONE: verdict + stats ───────────────────────────────
  let y = 620;

  // Action pill + stock name
  ctx.font = `700 30px ${F}`;
  const pillTw = ctx.measureText(actionCN).width;
  const pillW = pillTw + 28, pillH = 46;
  ctx.fillStyle = accentText;
  ctx.beginPath(); ctx.roundRect(PAD, y - 36, pillW, pillH, 10); ctx.fill();
  ctx.fillStyle = '#FFFFFF'; ctx.textAlign = 'left';
  ctx.fillText(actionCN, PAD + 14, y - 1);

  ctx.font = `700 34px ${F}`; ctx.fillStyle = '#1C1C1E';
  ctx.fillText(stockName, PAD + pillW + 18, y - 1);
  y += 42;

  // ── STATS ─────────────────────────────────────────────────────
  const statColW = Math.floor((W - PAD * 2 - 24) / 3);
  const statH = 100;
  const priceLabel = (m: string) => (m === 'us' ? '$' : '¥');
  const fmt = (v: number | null) => v != null ? `${priceLabel(market)}${v.toFixed(2)}` : '—';
  const showPrices = !isFree;

  // Current price card (always visible)
  const sx0 = PAD;
  ctx.fillStyle = '#FFFFFF';
  ctx.shadowColor = 'rgba(0,0,0,0.07)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 5;
  ctx.beginPath(); ctx.roundRect(sx0, y, statColW, statH, 14); ctx.fill();
  ctx.font = `400 17px ${F}`; ctx.textAlign = 'left'; ctx.fillStyle = '#8E8E93';
  ctx.fillText('研判时价', sx0 + 20, y + 30);
  ctx.font = `700 27px ${M}`; ctx.fillStyle = '#1C1C1E';
  ctx.fillText(fmt(latestPrice), sx0 + 20, y + 66);

  if (showPrices) {
    // Target price card
    const sx1 = PAD + statColW + 12;
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath(); ctx.roundRect(sx1, y, statColW, statH, 14); ctx.fill();
    ctx.font = `400 17px ${F}`; ctx.textAlign = 'left'; ctx.fillStyle = '#8E8E93';
    ctx.fillText('目标估价', sx1 + 20, y + 30);
    ctx.font = `700 27px ${M}`; ctx.fillStyle = accentText;
    ctx.fillText(fmt(targetPrice), sx1 + 20, y + 66);

    // Stop loss card
    const sx2 = PAD + (statColW + 12) * 2;
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath(); ctx.roundRect(sx2, y, statColW, statH, 14); ctx.fill();
    ctx.shadowBlur = 0; ctx.shadowColor = 'transparent'; ctx.shadowOffsetY = 0;
    ctx.font = `400 17px ${F}`; ctx.textAlign = 'left'; ctx.fillStyle = '#8E8E93';
    ctx.fillText('止损参考', sx2 + 20, y + 30);
    ctx.font = `700 27px ${M}`; ctx.fillStyle = '#FF9F0A';
    ctx.fillText(fmt(stopLoss), sx2 + 20, y + 66);
    if (maxLoss != null && Math.abs(maxLoss) >= 0.05) {
      ctx.font = `400 15px ${F}`; ctx.fillStyle = '#FF9F0Acc';
      ctx.fillText(`${maxLoss.toFixed(1)}%`, sx2 + 20, y + 86);
    }
  } else {
    // Elegant single locked block spanning the 2 right columns
    const lockX = PAD + statColW + 12;
    const lockW = (statColW + 12) * 2 - 12; // spans 2 columns
    const lockTint = '#60A5FA'; // blue — points toward upgrade

    // Frosted glass card
    ctx.fillStyle = '#FFFFFF';
    ctx.shadowColor = 'rgba(0,0,0,0.06)'; ctx.shadowBlur = 12; ctx.shadowOffsetY = 4;
    ctx.beginPath(); ctx.roundRect(lockX, y, lockW, statH, 14); ctx.fill();
    ctx.shadowBlur = 0; ctx.shadowColor = 'transparent'; ctx.shadowOffsetY = 0;

    // Subtle gradient wash inside the card
    const lockGrad = ctx.createLinearGradient(lockX, y, lockX + lockW, y + statH);
    lockGrad.addColorStop(0, lockTint + '10');
    lockGrad.addColorStop(1, lockTint + '05');
    ctx.fillStyle = lockGrad;
    ctx.beginPath(); ctx.roundRect(lockX, y, lockW, statH, 14); ctx.fill();

    // Left accent line
    ctx.fillStyle = lockTint + '55';
    ctx.beginPath(); ctx.roundRect(lockX, y + 14, 3, statH - 28, 2); ctx.fill();

    // Ghost label row — "目标估价" left, "止损参考" right
    ctx.font = `400 14px ${F}`; ctx.textAlign = 'left'; ctx.fillStyle = '#C7C7CC';
    ctx.fillText('目标估价', lockX + 20, y + 24);
    ctx.textAlign = 'right';
    ctx.fillText('止损参考', lockX + lockW - 20, y + 24);
    ctx.textAlign = 'left';

    // Main CTA — centered, no icon
    ctx.font = `600 19px ${F}`; ctx.fillStyle = lockTint;
    const ctaTxt = '升级解锁价格目标';
    const ctaW2 = ctx.measureText(ctaTxt).width;
    ctx.fillText(ctaTxt, lockX + (lockW - ctaW2) / 2, y + 58);

    // Sub hint
    ctx.font = `400 13px ${F}`; ctx.fillStyle = '#AEAEB2';
    const hint = '标准版起可见';
    const hintW = ctx.measureText(hint).width;
    ctx.fillText(hint, lockX + (lockW - hintW) / 2, y + 80);
  }
  y += statH + 28;

  // ── DIVIDER ───────────────────────────────────────────────────
  ctx.strokeStyle = '#E5E5EA'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(PAD, y); ctx.lineTo(W - PAD, y); ctx.stroke();
  y += 30;

  // ── DEEP ANALYSIS: tier-gated sections ───────────────────────
  const allSections: { label: string; icon: string; tint: string; content: string }[] = [
    { label: '市场诊断', icon: '诊', tint: '#0071e3', content: marketDiagnosis || reasonExcerpt || '' },
    { label: '机会评估', icon: '机', tint: '#f59e0b', content: opportunityAssessment || '' },
    { label: '风险收益', icon: '险', tint: '#ef4444', content: riskAnalysis || '' },
    { label: '执行方案', icon: '行', tint: '#10b981', content: executionPlan || '' },
  ];
  const isBasic   = tier === 'basic';
  const visibleCount = isFree ? 0 : 4;
  const sections = allSections.slice(0, visibleCount);
  const showUpgradeCTA = isFree || isBasic; // free→basic, basic→premium

  // Free tier: draw a brief summary card instead of full sections
  if (isFree) {
    const summary = reasonExcerpt || (marketDiagnosis || '').slice(0, 60).trim();
    const summaryH = 84;
    ctx.fillStyle = '#FFFFFF';
    ctx.shadowColor = 'rgba(0,0,0,0.06)'; ctx.shadowBlur = 12; ctx.shadowOffsetY = 4;
    ctx.beginPath(); ctx.roundRect(PAD, y, W - PAD * 2, summaryH, 14); ctx.fill();
    ctx.shadowBlur = 0; ctx.shadowColor = 'transparent'; ctx.shadowOffsetY = 0;

    // Tinted left bar matching action color
    ctx.fillStyle = accentText + 'AA';
    ctx.beginPath(); ctx.roundRect(PAD, y + 12, 3, summaryH - 24, 2); ctx.fill();

    ctx.font = `500 16px ${F}`; ctx.textAlign = 'left'; ctx.fillStyle = '#8E8E93';
    ctx.fillText('研判摘要', PAD + 20, y + 28);
    ctx.font = `400 19px ${F}`; ctx.fillStyle = '#3A3A3C';
    // wrap summary to 2 lines max
    let rem = summary, lineY = y + 52, linesLeft = 2;
    while (rem && linesLeft > 0) {
      let seg = rem;
      while (seg.length > 0 && ctx.measureText(seg + (linesLeft === 1 ? '…' : '')).width > W - PAD * 2 - 40) seg = seg.slice(0, -1);
      ctx.fillText(seg + (linesLeft === 1 && seg.length < rem.length ? '…' : ''), PAD + 20, lineY);
      rem = rem.slice(seg.length); lineY += 28; linesLeft--;
    }
    y += summaryH + 16;
  }

  const drawWrappedText = (text: string, x: number, startY: number, maxW: number, lineH: number, maxLines: number): number => {
    if (!text) return startY;
    ctx.textAlign = 'left';
    let line = '';
    let drawnLines = 0;
    let curY = startY;
    for (const ch of text) {
      const test = line + ch;
      if (ctx.measureText(test).width > maxW) {
        if (drawnLines >= maxLines - 1) {
          // last line with ellipsis
          while (line.length > 0 && ctx.measureText(line + '…').width > maxW) line = line.slice(0, -1);
          ctx.fillText(line + '…', x, curY);
          return curY + lineH;
        }
        ctx.fillText(line, x, curY);
        curY += lineH; drawnLines++;
        line = ch;
      } else { line = test; }
    }
    if (line) { ctx.fillText(line, x, curY); curY += lineH; }
    return curY;
  };

  for (const sec of sections) {
    const cardPad = 28;
    const iconSize = 44;
    const textX = PAD + cardPad + iconSize + 18;
    const textMaxW = W - PAD * 2 - cardPad * 2 - iconSize - 18;

    // Measure content to determine card height
    ctx.font = `400 20px ${F}`;
    const linesNeeded = Math.min(5, Math.ceil((ctx.measureText(sec.content).width || 1) / textMaxW) + 1);
    const contentH = Math.max(1, linesNeeded) * 30;
    const cardH = cardPad + 28 + 12 + contentH + cardPad;

    // Card background
    ctx.fillStyle = '#FFFFFF';
    ctx.shadowColor = 'rgba(0,0,0,0.07)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 4;
    ctx.beginPath(); ctx.roundRect(PAD, y, W - PAD * 2, cardH, 16); ctx.fill();
    ctx.shadowBlur = 0; ctx.shadowColor = 'transparent'; ctx.shadowOffsetY = 0;

    // Left accent bar
    ctx.fillStyle = sec.tint;
    ctx.fillRect(PAD, y + 14, 4, cardH - 28);

    // Icon circle
    ctx.fillStyle = sec.tint + '18';
    ctx.beginPath(); ctx.arc(PAD + cardPad + iconSize / 2, y + cardPad + iconSize / 2, iconSize / 2, 0, Math.PI * 2); ctx.fill();
    ctx.font = `700 20px ${F}`; ctx.textAlign = 'center'; ctx.fillStyle = sec.tint;
    ctx.fillText(sec.icon, PAD + cardPad + iconSize / 2, y + cardPad + iconSize / 2 + 7);

    // Section label
    ctx.font = `600 20px ${F}`; ctx.textAlign = 'left'; ctx.fillStyle = '#1C1C1E';
    ctx.fillText(sec.label, textX, y + cardPad + 22);

    // Content text
    ctx.font = `400 20px ${F}`; ctx.fillStyle = '#3A3A3C';
    drawWrappedText(sec.content, textX, y + cardPad + 22 + 14 + 20, textMaxW, 30, 5);

    y += cardH + 16;
  }

  // ── UPGRADE TEASER ─────────────────────────────────────────────
  if (showUpgradeCTA) {
    const upgradeTint = isFree ? '#60A5FA' : '#A855F7';

    if (isFree) {
      // Free: show 4 blurred locked section previews
      for (const sec of allSections) {
        const lockCardH = 58;
        ctx.fillStyle = '#F5F5F7';
        ctx.shadowColor = 'rgba(0,0,0,0.03)'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 2;
        ctx.beginPath(); ctx.roundRect(PAD, y, W - PAD * 2, lockCardH, 12); ctx.fill();
        ctx.shadowBlur = 0; ctx.shadowColor = 'transparent'; ctx.shadowOffsetY = 0;
        // Dimmed section label
        ctx.font = `500 16px ${F}`; ctx.textAlign = 'left'; ctx.fillStyle = '#C7C7CC';
        ctx.fillText(sec.label, PAD + 20, y + 22);
        // Placeholder content bars
        ctx.fillStyle = '#E5E5EA';
        ctx.beginPath(); ctx.roundRect(PAD + 20, y + 32, 380, 9, 4); ctx.fill();
        ctx.fillStyle = '#EBEBF0';
        ctx.beginPath(); ctx.roundRect(PAD + 20, y + 44, 240, 9, 4); ctx.fill();
        y += lockCardH + 8;
      }
    }

    // CTA strip — free→basic or basic→premium
    const ctaLine1 = isFree ? '升级标准版，解锁每日深度研判' : '升级专业版，解锁优先通道';
    const ctaLine2 = isFree ? `标准版起每天 ${basicDailyLimit} 次完整分析` : '深度研判 + 持仓针对性分析 · 更多分析次数';
    const ctaH = 80;
    const ctaGrad = ctx.createLinearGradient(PAD, y, W - PAD, y + ctaH);
    ctaGrad.addColorStop(0, upgradeTint + '1A');
    ctaGrad.addColorStop(1, upgradeTint + '0A');
    ctx.fillStyle = ctaGrad;
    ctx.beginPath(); ctx.roundRect(PAD, y, W - PAD * 2, ctaH, 14); ctx.fill();
    ctx.strokeStyle = upgradeTint + '35'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(PAD, y, W - PAD * 2, ctaH, 14); ctx.stroke();

    ctx.font = `600 20px ${F}`; ctx.textAlign = 'center'; ctx.fillStyle = upgradeTint;
    ctx.fillText(ctaLine1, W / 2, y + 32);
    ctx.font = `400 15px ${F}`; ctx.fillStyle = upgradeTint + 'AA';
    ctx.fillText(ctaLine2, W / 2, y + 57);
    y += ctaH + 16;
  }

  y += 10;

  // ── TIMESTAMP SEAL ────────────────────────────────────────────
  const sealH = 90;
  ctx.fillStyle = '#FFFFFF';
  ctx.shadowColor = 'rgba(0,0,0,0.07)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 5;
  ctx.beginPath(); ctx.roundRect(PAD, y, W - PAD * 2, sealH, 14); ctx.fill();
  ctx.shadowBlur = 0; ctx.shadowColor = 'transparent'; ctx.shadowOffsetY = 0;
  ctx.fillStyle = accentText;
  ctx.fillRect(PAD, y + 12, 4, sealH - 24);

  ctx.font = `600 19px ${F}`; ctx.textAlign = 'left'; ctx.fillStyle = accentText;
  ctx.fillText('🔒  研判时间戳已封存', PAD + 24, y + 34);
  ctx.font = `500 19px ${M}`; ctx.textAlign = 'right'; ctx.fillStyle = '#1C1C1E';
  ctx.fillText(dateStamp, W - PAD - 20, y + 34);
  ctx.font = `400 15px ${F}`; ctx.textAlign = 'left'; ctx.fillStyle = '#8E8E93';
  ctx.fillText('此研判截面已锁定 · 可于未来核验分析准确性', PAD + 24, y + 62);
  y += sealH + 36;

  // ── DIVIDER ───────────────────────────────────────────────────
  ctx.strokeStyle = '#E5E5EA'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(PAD, y); ctx.lineTo(W - PAD, y); ctx.stroke();

  // ── QR CODE + CTA — flows after content ───────────────────────
  const qrSize = 168;
  const qrStartY = y + 20;
  const qrX = PAD;
  const ctaX = qrX + qrSize + 48;

  // Light separator above QR section
  ctx.font = `400 15px ${F}`; ctx.textAlign = 'center'; ctx.fillStyle = '#DEDEDE';
  ctx.fillText('— 扫码体验 —', W / 2, qrStartY - 22);

  const qrUrl = appBaseUrl || 'https://aiklines.app';
  try {
    const QRCode = (await import('qrcode')) as typeof import('qrcode');
    const qrDataUrl = await QRCode.toDataURL(qrUrl, {
      width: qrSize * dpr,
      margin: 1,
      color: { dark: '#1C1C1E', light: '#FFFFFF' },
    });
    await new Promise<void>((resolve, reject) => {
      const img = new Image();
      img.onload = () => { ctx.drawImage(img, qrX, qrStartY, qrSize, qrSize); resolve(); };
      img.onerror = reject;
      img.src = qrDataUrl;
    });
  } catch {
    drawQR(ctx, qrX, qrStartY, qrSize, '#1C1C1E', '#FFFFFF');
  }

  // CTA copy — Jobs-level: bold hook + proof + invitation
  ctx.font = `800 40px ${F}`; ctx.textAlign = 'left'; ctx.fillStyle = '#1C1C1E';
  ctx.fillText('我已布局，你呢？', ctaX, qrStartY + 46);

  ctx.font = `400 22px ${F}`; ctx.fillStyle = '#636366';
  ctx.fillText('比分析师早 3 小时拿到信号', ctaX, qrStartY + 86);

  ctx.font = `600 22px ${F}`; ctx.fillStyle = accentText;
  ctx.fillText('→  免费解锁每日 AI 研判', ctaX, qrStartY + 128);

  ctx.font = `400 15px ${M}`; ctx.fillStyle = '#AEAEB2';
  ctx.fillText(qrUrl, ctaX, qrStartY + 156);

  // ── DISCLAIMER ────────────────────────────────────────────────
  const footerY = qrStartY + qrSize + 60;
  ctx.font = `400 14px ${F}`; ctx.textAlign = 'center'; ctx.fillStyle = '#C7C7CC';
  ctx.fillText('本内容仅供技术分析参考，不构成投资建议 · 投资有风险，入市须谨慎', W / 2, footerY);

  // Bottom accent bar
  ctx.fillStyle = heroColor;
  ctx.fillRect(0, footerY + 20, W, 6);

  // Crop canvas to exact content height (tight — no bottom whitespace)
  const actualH = footerY + 28; // bar ends at footerY+26, add 2px breathing room
  const croppedCanvas = document.createElement('canvas');
  croppedCanvas.width = W * dpr;
  croppedCanvas.height = actualH * dpr;
  const croppedCtx = croppedCanvas.getContext('2d')!;
  // Use source rect to guarantee pixel-perfect crop
  croppedCtx.drawImage(canvas, 0, 0, W * dpr, actualH * dpr, 0, 0, W * dpr, actualH * dpr);

  return new Promise<{ blob: Blob; filename: string }>((resolve, reject) => {
    croppedCanvas.toBlob(blob => {
      if (!blob) { reject(new Error('canvas.toBlob failed')); return; }
      resolve({ blob, filename: `${stockCode || stockName}_研判凭证.png` });
    }, 'image/png');
  });
}
