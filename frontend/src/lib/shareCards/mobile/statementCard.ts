/**
 * Mobile statement card — 600×900, vibrant gradient background.
 * Extracted from the original shareCard.ts.
 */

import { PredictionCardParams } from './predictionCard';

export type { PredictionCardParams };

// ─────────────────────────────────────────────────────────────────────────────
// Iteration 4: Statement Card — vibrant gradient, white typography, frosted panel
// 600×900, bold action-color gradient bg, white text, inverted action pill
// ─────────────────────────────────────────────────────────────────────────────
export async function generateStatementCardBlob(p: PredictionCardParams): Promise<{ blob: Blob; filename: string }> {
  const { stockName, stockCode, market, action, confidence, latestPrice, targetPrice, stopLoss,
    opportunityGrade, reasonExcerpt, analyzedAt, tier, appName } = p;
  const basicDailyLimit = p.basicDailyLimit ?? 5; void basicDailyLimit;

  const isBuy  = action === 'buy';
  const isSell = action === 'sell';
  const isMasked = tier === 'free';

  // Vibrant backgrounds per action — hold always neutral gray
  const grade = (opportunityGrade || 'C').toUpperCase().slice(0, 1);

  const bgTop  = isBuy ? '#EF4444' : isSell ? '#16A34A' : '#64748B';
  const bgBot  = isBuy ? '#991B1B' : isSell ? '#14532D' : '#334155';
  const accent     = bgTop;
  const accentDark = bgBot;
  const actionCN   = isBuy ? '买入' : isSell ? '卖出' : '观望';

  const impliedReturn: number | null =
    targetPrice != null && latestPrice != null && latestPrice > 0
      ? ((targetPrice - latestPrice) / latestPrice) * 100 : null;

  const protectPct: number | null =
    stopLoss != null && latestPrice != null && latestPrice > 0
      ? ((latestPrice - stopLoss) / latestPrice) * 100 : null;

  const fmtP = (price: number | null) => {
    if (price == null) return '—';
    const isCN = market === 'a' || market === 'futures';
    return isCN ? `¥${price.toFixed(2)}` : `$${price.toFixed(2)}`;
  };

  const W = 600, H = 900;
  const canvas = document.createElement('canvas');
  const dpr = 2;
  canvas.width = W * dpr; canvas.height = H * dpr;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);

  const F = '"PingFang SC","Microsoft YaHei","Helvetica Neue",sans-serif';

  // ── VIBRANT GRADIENT BACKGROUND ──────────────────────────────
  const bgGrad = ctx.createLinearGradient(0, 0, W * 0.4, H);
  bgGrad.addColorStop(0, bgTop); bgGrad.addColorStop(1, bgBot);
  ctx.fillStyle = bgGrad; ctx.fillRect(0, 0, W, H);

  // Radial light bloom top-right for depth
  const bloom = ctx.createRadialGradient(W * 0.78, 160, 0, W * 0.78, 160, 340);
  bloom.addColorStop(0, 'rgba(255,255,255,0.18)'); bloom.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = bloom; ctx.fillRect(0, 0, W, H);

  // Subtle bottom shade for depth/grounding
  const shade = ctx.createLinearGradient(0, H * 0.55, 0, H);
  shade.addColorStop(0, 'rgba(0,0,0,0)'); shade.addColorStop(1, 'rgba(0,0,0,0.28)');
  ctx.fillStyle = shade; ctx.fillRect(0, 0, W, H);

  // ── LARGE GRADE WATERMARK (decorative) ───────────────────────
  ctx.font = `900 280px ${F}`; ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  ctx.fillText(grade, W / 2, 360);

  // ── TOP STRIP ─────────────────────────────────────────────────
  ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fillRect(0, 0, W, 5);

  // ── STOCK PILL (top-left) + TIER PILL (top-right) ─────────────
  const pillY = 26;
  ctx.font = `700 12px ${F}`; ctx.textAlign = 'left';
  const codeW = ctx.measureText(stockCode).width + 24;
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.beginPath(); ctx.roundRect(28, pillY, codeW, 26, 13); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.roundRect(28, pillY, codeW, 26, 13); ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.fillText(stockCode, 40, pillY + 17);

  if (tier === 'premium') {
    const tLabel = '✦ 专业版';
    ctx.font = `700 11px ${F}`; ctx.textAlign = 'right';
    const tpW = ctx.measureText(tLabel).width + 20;
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.beginPath(); ctx.roundRect(W - 28 - tpW, pillY, tpW, 26, 13); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(W - 28 - tpW, pillY, tpW, 26, 13); ctx.stroke();
    ctx.fillStyle = '#ffffff'; ctx.fillText(tLabel, W - 28 - 10, pillY + 17);
  } else if (tier === 'basic') {
    ctx.font = `500 11px ${F}`; ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fillText('标准版', W - 28, pillY + 17);
  }

  // ── STOCK NAME ────────────────────────────────────────────────
  ctx.font = `900 54px ${F}`; ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(0,0,0,0.2)'; ctx.shadowBlur = 12;
  ctx.fillText(stockName.length > 8 ? stockName.slice(0, 8) + '…' : stockName, 28, 132);
  ctx.shadowBlur = 0;

  // ── HERO NUMBER (y=160~284) ───────────────────────────────────
  const heroBaseY = 252, heroLabelY = 284;

  const drawHero = (txt: string, masked: boolean) => {
    ctx.font = `900 92px ${F}`; ctx.textAlign = 'center';
    if (masked) {
      ctx.save();
      ctx.filter = 'blur(22px)';
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.shadowColor = 'rgba(0,0,0,0.25)'; ctx.shadowBlur = 20;
      ctx.fillText(txt, W / 2, heroBaseY);
      ctx.filter = 'none'; ctx.shadowBlur = 0;
      ctx.restore();
    } else {
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = 'rgba(0,0,0,0.25)'; ctx.shadowBlur = 20;
      ctx.fillText(txt, W / 2, heroBaseY);
      ctx.shadowBlur = 0;
    }
  };
  const heroSubLabel = (txt: string) => {
    ctx.font = `500 14px ${F}`; ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.62)';
    ctx.fillText(txt, W / 2, heroLabelY);
  };

  if (isMasked) {
    // Free tier: action text is the hero — clean, direct, no sub-label
    ctx.font = `900 108px ${F}`; ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0,0,0,0.28)'; ctx.shadowBlur = 24;
    ctx.fillText(actionCN, W / 2, heroBaseY + 8);
    ctx.shadowBlur = 0;
  } else if (isBuy) {
    if (impliedReturn != null) {
      const sign = impliedReturn > 0 ? '+' : '';
      drawHero(`${sign}${impliedReturn.toFixed(1)}%`, false);
      heroSubLabel('上涨空间估算');
    } else if (confidence != null) {
      drawHero(`${confidence}%`, false); heroSubLabel('AI 置信度');
    }
  } else if (isSell) {
    if (protectPct != null) {
      drawHero(`\u2212${Math.abs(protectPct).toFixed(1)}%`, false);
      heroSubLabel('止损保护距离');
    } else if (confidence != null) {
      drawHero(`${confidence}%`, false); heroSubLabel('AI 置信度');
    }
  } else {
    // HOLD: grade in hexagon
    const hexCX = W / 2, hexCY = 238, hexR = 74;
    ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let j = 0; j < 6; j++) {
      const ang = (Math.PI / 3) * j - Math.PI / 6;
      ctx.lineTo(hexCX + (hexR + 16) * Math.cos(ang), hexCY + (hexR + 16) * Math.sin(ang));
    }
    ctx.closePath(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2;
    ctx.beginPath();
    for (let j = 0; j < 6; j++) {
      const ang = (Math.PI / 3) * j - Math.PI / 6;
      ctx.lineTo(hexCX + hexR * Math.cos(ang), hexCY + hexR * Math.sin(ang));
    }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.font = `900 96px ${F}`; ctx.textAlign = 'center'; ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0,0,0,0.3)'; ctx.shadowBlur = 16;
    ctx.fillText(grade, hexCX, hexCY + 36); ctx.shadowBlur = 0;
  }

  // ── ACTION PILL — white bg, action-colored text (paid only) ──
  if (!isMasked) {
    const pillActionY = 318;
    ctx.font = `800 30px ${F}`; ctx.textAlign = 'center';
    const apW = ctx.measureText(actionCN).width + 64;
    const apX = W / 2 - apW / 2;
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0,0,0,0.2)'; ctx.shadowBlur = 16;
    ctx.beginPath(); ctx.roundRect(apX, pillActionY, apW, 56, 28); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = accent;
    ctx.fillText(actionCN, W / 2, pillActionY + 38);
  }

  // ── FROSTED GLASS DATA PANEL ──────────────────────────────────
  const panelY = 400, panelH = 200;
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath(); ctx.roundRect(24, panelY, W - 48, panelH, 22); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.16)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.roundRect(24, panelY, W - 48, panelH, 22); ctx.stroke();

  // Confidence bar
  const barY = 422;
  if (confidence != null) {
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.beginPath(); ctx.roundRect(48, barY, W - 96, 6, 3); ctx.fill();
    const filled = Math.round((W - 96) * confidence / 100);
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath(); ctx.roundRect(48, barY, filled, 6, 3); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(48 + filled, barY + 3, 5, 0, Math.PI * 2); ctx.fill();
    ctx.font = `500 12px ${F}`; ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText('AI 置信度', 48, barY + 22);
    ctx.font = `700 13px ${F}`; ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillText(`${confidence}%`, W - 48, barY + 22);
  }

  // Price row — free tier: 2 cols (最新价 + AI置信度), paid: 3 cols (最新价 + 目标价 + 止损价)
  const priceY = 464;
  if (isMasked) {
    // Free tier: only show 最新价, single centered column
    ctx.font = `400 11px ${F}`; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillText('最新价', W / 2, priceY + 13);
    ctx.font = `700 18px ${F}`; ctx.fillStyle = '#ffffff';
    ctx.fillText(fmtP(latestPrice), W / 2, priceY + 34);
  } else {
    const colW = Math.floor((W - 96) / 3);
    const priceItems = [
      { label: '最新价', val: fmtP(latestPrice) },
      { label: '目标价', val: fmtP(targetPrice) },
      { label: '止损价', val: fmtP(stopLoss) },
    ];
    priceItems.forEach((item, i) => {
      const cx = 48 + colW * i + colW / 2;
      ctx.font = `400 11px ${F}`; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.fillText(item.label, cx, priceY + 13);
      ctx.font = `700 18px ${F}`; ctx.fillStyle = '#ffffff';
      ctx.fillText(item.val, cx, priceY + 34);
      if (i < 2) {
        ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(48 + colW * (i + 1), priceY + 4); ctx.lineTo(48 + colW * (i + 1), priceY + 42); ctx.stroke();
      }
    });
  }

  // Reason excerpt — centered (both axes) in remaining panel space, all tiers
  if (reasonExcerpt) {
    const maxW = W - 96;
    const zoneTop = priceY + 50;
    const zoneBot = isMasked ? panelY + panelH - 34 : panelY + panelH - 14;
    const lineH = 20;
    ctx.font = `400 13px ${F}`; ctx.fillStyle = 'rgba(255,255,255,0.52)';
    const lines: string[] = [];
    let line = '';
    for (const ch of reasonExcerpt) {
      const test = line + ch;
      if (ctx.measureText(test).width > maxW) {
        lines.push(line); line = ch;
        if (lines.length >= 2) {
          while (line.length > 0 && ctx.measureText(line + '…').width > maxW) line = line.slice(0, -1);
          line += '…'; break;
        }
      } else { line = test; }
    }
    if (line) lines.push(line);
    const totalH = lines.length * lineH;
    const startY = Math.round(zoneTop + (zoneBot - zoneTop - totalH) / 2 + lineH);
    ctx.textAlign = 'center';
    lines.forEach((l, i) => ctx.fillText(l, W / 2, startY + i * lineH));
  }

  // Free upgrade nudge
  if (isMasked) {
    ctx.font = `600 12px ${F}`; ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillText('升级解锁完整研判 →', W / 2, panelY + panelH - 16);
  }

  // ── VIRAL HOOK ────────────────────────────────────────────────
  const hookLine1 = isBuy ? '我看好它了' : isSell ? '我已锁定收益' : '我选择等待';
  const hookLine2 = isBuy ? '你的判断呢？' : isSell ? '你的策略呢？' : '这个机会值得等';
  ctx.font = `500 17px ${F}`; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,0.68)';
  ctx.fillText(hookLine1, W / 2, 645);
  ctx.font = `900 32px ${F}`; ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(0,0,0,0.2)'; ctx.shadowBlur = 10;
  ctx.fillText(hookLine2, W / 2, 690);
  ctx.shadowBlur = 0;

  // ── BRANDING ─────────────────────────────────────────────────
  const divG = ctx.createLinearGradient(0, 0, W, 0);
  divG.addColorStop(0, 'rgba(255,255,255,0)');
  divG.addColorStop(0.2, 'rgba(255,255,255,0.2)');
  divG.addColorStop(0.8, 'rgba(255,255,255,0.2)');
  divG.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.strokeStyle = divG; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, 722); ctx.lineTo(W, 722); ctx.stroke();

  ctx.font = `700 14px ${F}`; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fillText(appName, W / 2, 750);
  let dateStamp = '';
  try {
    dateStamp = new Date(analyzedAt).toLocaleString('zh-CN', {
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    });
  } catch { dateStamp = ''; }
  ctx.font = `400 12px ${F}`; ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.fillText(dateStamp, W / 2, 770);

  // ── DISCLAIMER ───────────────────────────────────────────────
  ctx.font = `400 10px ${F}`; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.fillText('AI 生成 · 仅供技术分析参考 · 不构成投资建议 · 投资有风险，入市须谨慎', W / 2, 852);

  // Suppress unused warning
  void accentDark;

  // ── BOTTOM STRIP ─────────────────────────────────────────────
  ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.fillRect(0, 896, W, 4);

  return new Promise<{ blob: Blob; filename: string }>((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob) { reject(new Error('canvas.toBlob failed')); return; }
      resolve({ blob, filename: `${stockCode || stockName}_研判.png` });
    }, 'image/png');
  });
}
