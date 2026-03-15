/**
 * Desktop statement card — 1200×680 landscape.
 * Redesigned: full-bleed gradient, centered hero number, frosted glass panel.
 * Matches mobile statementCard visual language, laid out horizontally.
 */

import { PredictionCardParams } from '../mobile/predictionCard';
import { fmtPrice } from '../utils';

export type { PredictionCardParams };

export async function generateDesktopStatementCardBlob(p: PredictionCardParams): Promise<{ blob: Blob; filename: string }> {
  const { stockName, stockCode, market, action, confidence, latestPrice, targetPrice, stopLoss,
    opportunityGrade, reasonExcerpt, analyzedAt, tier, appName } = p;

  const isBuy  = action === 'buy';
  const isSell = action === 'sell';
  const isMasked = tier === 'free';

  const grade = (opportunityGrade || 'C').toUpperCase().slice(0, 1);

  const bgTop    = isBuy ? '#EF4444' : isSell ? '#16A34A' : '#64748B';
  const bgBot    = isBuy ? '#991B1B' : isSell ? '#14532D' : '#334155';
  const accent   = bgTop;
  const actionCN = isBuy ? '看涨' : isSell ? '看跌' : '观望';

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

  const W = 1200, H = 680;
  const dpr = 2;

  const canvas = document.createElement('canvas');
  canvas.width = W * dpr; canvas.height = H * dpr;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);

  const F = '"PingFang SC","Microsoft YaHei","Helvetica Neue",sans-serif';

  // ── FULL-BLEED GRADIENT BACKGROUND ───────────────────────────
  const bgG = ctx.createLinearGradient(0, 0, W * 0.55, H);
  bgG.addColorStop(0, bgTop); bgG.addColorStop(1, bgBot);
  ctx.fillStyle = bgG; ctx.fillRect(0, 0, W, H);

  // Radial bloom top-right
  const bloom = ctx.createRadialGradient(W * 0.78, H * 0.2, 0, W * 0.78, H * 0.2, 380);
  bloom.addColorStop(0, 'rgba(255,255,255,0.18)'); bloom.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = bloom; ctx.fillRect(0, 0, W, H);

  // Bottom shade
  const shade = ctx.createLinearGradient(0, H * 0.55, 0, H);
  shade.addColorStop(0, 'rgba(0,0,0,0)'); shade.addColorStop(1, 'rgba(0,0,0,0.28)');
  ctx.fillStyle = shade; ctx.fillRect(0, 0, W, H);

  // ── TOP STRIP ─────────────────────────────────────────────────
  ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fillRect(0, 0, W, 5);

  // ── BOTTOM STRIP ──────────────────────────────────────────────
  ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.fillRect(0, H - 4, W, 4);

  // ── LARGE GRADE WATERMARK (decorative, centered) ──────────────
  ctx.font = `900 220px ${F}`; ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  ctx.fillText(grade, W / 2, H * 0.65);

  // ── TOP-LEFT HEADER ───────────────────────────────────────────
  ctx.font = `600 13px ${F}`; ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.textAlign = 'left';
  ctx.fillText(`◆ ${appName}`, 32, 38);

  // ── STOCK CODE PILL ───────────────────────────────────────────
  ctx.font = `700 12px ${F}`; ctx.textAlign = 'left';
  const cpW = ctx.measureText(stockCode).width + 20;
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.beginPath(); ctx.roundRect(32, 50, cpW, 24, 8); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.roundRect(32, 50, cpW, 24, 8); ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.fillText(stockCode, 42, 66);

  // ── STOCK NAME ────────────────────────────────────────────────
  const displayName = stockName.length > 8 ? stockName.slice(0, 8) + '…' : stockName;
  ctx.font = `900 54px ${F}`; ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(0,0,0,0.2)'; ctx.shadowBlur = 12;
  ctx.fillText(displayName, 32, 140);
  ctx.shadowBlur = 0;

  // ── HERO NUMBER (centered horizontally at W/2) ────────────────
  if (isMasked) {
    // Free tier: action text is the hero
    ctx.font = `900 108px ${F}`; ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0,0,0,0.28)'; ctx.shadowBlur = 24;
    ctx.fillText(actionCN, W / 2, 258);
    ctx.shadowBlur = 0;
  } else if (isBuy) {
    if (impliedReturn != null) {
      const sign = impliedReturn > 0 ? '+' : '';
      ctx.font = `900 92px ${F}`; ctx.textAlign = 'center';
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = 'rgba(0,0,0,0.25)'; ctx.shadowBlur = 20;
      ctx.fillText(`${sign}${impliedReturn.toFixed(1)}%`, W / 2, 250);
      ctx.shadowBlur = 0;
      ctx.font = `500 14px ${F}`; ctx.fillStyle = 'rgba(255,255,255,0.62)';
      ctx.fillText('上涨空间估算', W / 2, 282);
    } else if (confidence != null) {
      ctx.font = `900 92px ${F}`; ctx.textAlign = 'center';
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = 'rgba(0,0,0,0.25)'; ctx.shadowBlur = 20;
      ctx.fillText(`${confidence}%`, W / 2, 250);
      ctx.shadowBlur = 0;
      ctx.font = `500 14px ${F}`; ctx.fillStyle = 'rgba(255,255,255,0.62)';
      ctx.fillText('AI 置信度', W / 2, 282);
    }
  } else if (isSell) {
    if (protectPct != null) {
      ctx.font = `900 92px ${F}`; ctx.textAlign = 'center';
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = 'rgba(0,0,0,0.25)'; ctx.shadowBlur = 20;
      ctx.fillText(`\u2212${Math.abs(protectPct).toFixed(1)}%`, W / 2, 250);
      ctx.shadowBlur = 0;
      ctx.font = `500 14px ${F}`; ctx.fillStyle = 'rgba(255,255,255,0.62)';
      ctx.fillText('止损保护距离', W / 2, 282);
    } else if (confidence != null) {
      ctx.font = `900 92px ${F}`; ctx.textAlign = 'center';
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = 'rgba(0,0,0,0.25)'; ctx.shadowBlur = 20;
      ctx.fillText(`${confidence}%`, W / 2, 250);
      ctx.shadowBlur = 0;
      ctx.font = `500 14px ${F}`; ctx.fillStyle = 'rgba(255,255,255,0.62)';
      ctx.fillText('AI 置信度', W / 2, 282);
    }
  } else {
    // HOLD: confidence or "观望"
    if (confidence != null) {
      ctx.font = `900 92px ${F}`; ctx.textAlign = 'center';
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = 'rgba(0,0,0,0.25)'; ctx.shadowBlur = 20;
      ctx.fillText(`${confidence}%`, W / 2, 250);
      ctx.shadowBlur = 0;
      ctx.font = `500 14px ${F}`; ctx.fillStyle = 'rgba(255,255,255,0.62)';
      ctx.fillText('AI 置信度', W / 2, 282);
    } else {
      ctx.font = `900 92px ${F}`; ctx.textAlign = 'center';
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = 'rgba(0,0,0,0.25)'; ctx.shadowBlur = 20;
      ctx.fillText('观望', W / 2, 258);
      ctx.shadowBlur = 0;
    }
  }

  // ── ACTION PILL (paid only) ───────────────────────────────────
  if (!isMasked) {
    const pillY = 310;
    ctx.font = `800 30px ${F}`; ctx.textAlign = 'center';
    const apW = ctx.measureText(actionCN).width + 64;
    const apX = W / 2 - apW / 2;
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0,0,0,0.2)'; ctx.shadowBlur = 16;
    ctx.beginPath(); ctx.roundRect(apX, pillY, apW, 52, 28); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = accent;
    ctx.fillText(actionCN, W / 2, pillY + 36);
  }

  // ── FROSTED GLASS DATA PANEL ──────────────────────────────────
  const panelY = 380, panelH = 196;
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath(); ctx.roundRect(24, panelY, W - 48, panelH, 22); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.16)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.roundRect(24, panelY, W - 48, panelH, 22); ctx.stroke();

  // Confidence bar
  const barY = panelY + 22;
  if (confidence != null) {
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.beginPath(); ctx.roundRect(48, barY, W - 96, 6, 3); ctx.fill();
    const filled = Math.round((W - 96) * confidence / 100);
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath(); ctx.roundRect(48, barY, filled, 6, 3); ctx.fill();
    // Dot at end of bar
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(48 + filled, barY + 3, 5, 0, Math.PI * 2); ctx.fill();
    // Labels below bar
    ctx.font = `500 12px ${F}`; ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText('AI 置信度', 48, barY + 22);
    ctx.font = `700 13px ${F}`; ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillText(`${confidence}%`, W - 48, barY + 22);
  }

  // Price row — 3 columns: 最新价 / 目标价 / 止损价
  const priceY = panelY + 64;
  if (isMasked) {
    // Free tier: only latest price centered
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
        ctx.beginPath();
        ctx.moveTo(48 + colW * (i + 1), priceY + 4);
        ctx.lineTo(48 + colW * (i + 1), priceY + 42);
        ctx.stroke();
      }
    });
  }

  // Reason excerpt — max 2 lines, center-aligned
  if (reasonExcerpt) {
    const maxW = W - 96;
    const reasonStartY = priceY + 60;
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
    ctx.textAlign = 'center';
    lines.forEach((l, i) => ctx.fillText(l, W / 2, reasonStartY + i * 20));
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
  ctx.fillText(hookLine1, W / 2, 610);
  ctx.font = `900 32px ${F}`; ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(0,0,0,0.2)'; ctx.shadowBlur = 10;
  ctx.fillText(hookLine2, W / 2, 652);
  ctx.shadowBlur = 0;

  // ── BRANDING ─────────────────────────────────────────────────
  // Gradient divider line
  const divG = ctx.createLinearGradient(0, 0, W, 0);
  divG.addColorStop(0, 'rgba(255,255,255,0)');
  divG.addColorStop(0.2, 'rgba(255,255,255,0.2)');
  divG.addColorStop(0.8, 'rgba(255,255,255,0.2)');
  divG.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.strokeStyle = divG; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, 660); ctx.lineTo(W, 660); ctx.stroke();

  // Disclaimer (above app name)
  ctx.font = `400 10px ${F}`; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.fillText('AI 生成 · 仅供参考 · 不构成投资建议', W / 2, 665);

  // App name centered
  ctx.font = `700 14px ${F}`; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fillText(appName, W / 2, 672);

  // Timestamp right-aligned
  let dateStamp = '';
  try {
    dateStamp = new Date(analyzedAt).toLocaleString('zh-CN', {
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    });
  } catch { dateStamp = ''; }
  ctx.font = `400 11px ${F}`; ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.fillText(dateStamp, W - 32, 672);

  // Suppress unused warning
  void fmtPrice;

  return new Promise<{ blob: Blob; filename: string }>((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob) { reject(new Error('canvas.toBlob failed')); return; }
      resolve({ blob, filename: `${stockCode || stockName}_桌面研判.png` });
    }, 'image/png');
  });
}
