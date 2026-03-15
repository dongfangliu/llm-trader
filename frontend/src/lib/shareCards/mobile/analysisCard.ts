/**
 * Mobile analysis share card — 600×800 portrait.
 * Extracted from the original shareCard.ts.
 */

export interface ShareCardParams {
  result: any;          // AnalyzeResponse
  tier: string;         // 'free' | 'basic' | 'premium'
  analyzedAt?: string | null;
  appName: string;
  basicDailyLimit?: number;  // 标准版每日限额，动态读取自后端
  includePosition?: boolean;
  longImage?: boolean;
  positionParams?: {
    holdingQuantity?: string;
    costPrice?: string;
    plannedInvestment?: string;
    maxPosition?: string;
  } | null;
}

export async function generateShareCardBlob(p: ShareCardParams): Promise<{ blob: Blob; filename: string }> {
  const { result, tier, analyzedAt, appName, includePosition, positionParams } = p;
  const longImage = !!p.longImage;
  const basicDailyLimit = p.basicDailyLimit ?? 5;

  const action = result?.result?.action;
  const isBuy = action === 'buy', isSell = action === 'sell';
  const actionLabel = isBuy ? '\u4e70\u5165' : isSell ? '\u5356\u51fa' : '\u89c2\u671b';

  // Chinese convention: buy = red, sell = green
  const heroTop  = isBuy ? '#3b0a0a' : isSell ? '#052e16' : '#0c1929';
  const heroBot  = isBuy ? '#991b1b' : isSell ? '#166534' : '#1e3a5f';
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

  const mktDiag    : string = result?.result?.market_diagnosis      || '';
  const oppAssess  : string = result?.result?.opportunity_assessment || '';
  const riskAnal   : string = result?.result?.risk_analysis          || '';
  const execPlan   : string = result?.result?.execution_plan         || '';
  const oppQuality : string = result?.result?.opportunity_quality    || '';
  const mainReason : string = result?.result?.reason                 || '';

  const W = 600, H = 800;
  const HERO_H   = 310;
  const FOOTER_H = 44;
  const FOOTER_Y = H - FOOTER_H;
  const SEC_H    = 36;
  const ROWS_Y   = HERO_H + SEC_H;
  const ROWS_AREA = FOOTER_Y - ROWS_Y;

  // All tiers now fill rows equally — upgrade hook is organic within content
  const rowH = Math.floor(ROWS_AREA / 4); // = 102px

  const canvas = document.createElement('canvas');
  const dpr = 2;
  canvas.width = W * dpr; canvas.height = H * dpr;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);

  const getLines = (text: string, font: string, maxW: number, max: number): string[] => {
    ctx.font = font;
    const out: string[] = [];
    let rem = text;
    for (let i = 0; i < max; i++) {
      if (!rem) break;
      if (ctx.measureText(rem).width <= maxW) { out.push(rem); break; }
      let line = rem;
      const sfx = i < max - 1 ? '' : '\u2026';
      while (line.length > 0 && ctx.measureText(line + sfx).width > maxW) line = line.slice(0, -1);
      out.push(line + sfx);
      rem = rem.slice(line.length);
    }
    return out;
  };

  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);

  const hg = ctx.createLinearGradient(0, 0, W * 0.8, HERO_H);
  hg.addColorStop(0, heroTop); hg.addColorStop(1, heroBot);
  ctx.fillStyle = hg; ctx.fillRect(0, 0, W, HERO_H);

  const rg = ctx.createRadialGradient(W/2, 130, 0, W/2, 130, 220);
  rg.addColorStop(0, isBuy ? 'rgba(239,68,68,0.2)' : isSell ? 'rgba(34,197,94,0.2)' : 'rgba(96,165,250,0.18)');
  rg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = rg; ctx.fillRect(0, 40, W, 220);

  ctx.save();
  [0.32,0.52,0.38,0.68,0.45,0.78,0.58,0.42,0.72,0.9,0.55,0.7].forEach((h, i) => {
    const cw = 13, gap = 24, x = W - (12-i)*(cw+gap) + gap;
    const bh = h * 100, by = HERO_H - 12 - bh;
    ctx.fillStyle = `rgba(255,255,255,${0.04 + h*0.04})`;
    ctx.beginPath(); ctx.roundRect(x, by, cw, bh, 2); ctx.fill();
    ctx.strokeStyle = `rgba(255,255,255,0.06)`; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(x+cw/2, by-7-h*7); ctx.lineTo(x+cw/2, by); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x+cw/2, by+bh); ctx.lineTo(x+cw/2, by+bh+4); ctx.stroke();
  });
  ctx.restore();

  if (tier === 'premium') {
    ctx.save();
    for (let di=0; di<5; di++) for (let dj=0; dj<3; dj++) {
      ctx.fillStyle = `rgba(251,191,36,${0.2+(di+dj)*0.025})`;
      ctx.beginPath(); ctx.arc(W-68+dj*18, 22+di*14, 2.2, 0, Math.PI*2); ctx.fill();
    }
    ctx.restore();
  }

  const tb = ctx.createLinearGradient(0,0,W,0);
  if (tier === 'premium') {
    tb.addColorStop(0,'#92400e'); tb.addColorStop(0.5,'#f59e0b'); tb.addColorStop(1,'#fef3c7');
  } else { tb.addColorStop(0,accent); tb.addColorStop(1,accentLt); }
  ctx.fillStyle = tb; ctx.fillRect(0, 0, W, 4);

  let y = 20;

  const tierTxt = tier==='premium' ? '\ud83d\udc8e \u4e13\u4e1a\u7248' : tier==='basic' ? '\ud83d\udcdb \u6807\u51c6\u7248' : '\ud83d\udd12 \u514d\u8d39\u7248';

  // ── Stock name (focal, large) ──
  ctx.textAlign = 'center'; ctx.fillStyle = '#ffffff';
  ctx.font = `800 48px -apple-system,sans-serif`;
  ctx.fillText(stockName, W/2, y+42);
  y += 54;

  // ── Stock code pill ──
  if (stockCode && stockCode !== stockName) {
    ctx.font = '600 13px -apple-system,sans-serif';
    const cpw = ctx.measureText(stockCode).width + 24;
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.beginPath(); ctx.roundRect(W/2-cpw/2, y, cpw, 26, 13); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(W/2-cpw/2, y, cpw, 26, 13); ctx.stroke();
    ctx.fillStyle = accentLt; ctx.textAlign = 'center'; ctx.fillText(stockCode, W/2, y+17);
    y += 32;
  }

  // ── Action label (secondary, accent-colored) ──
  ctx.textAlign = 'center';
  ctx.shadowColor = accent; ctx.shadowBlur = 20; ctx.shadowOffsetY = 4;
  ctx.fillStyle = accentLt; ctx.font = `700 28px -apple-system,sans-serif`;
  ctx.fillText(actionLabel, W/2, y+22);
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  y += 32;

  // ── Confidence bar / grade badge ──
  const cbx=68, cby=y+4, cbw=W-136, cbh=8;
  if (confidence != null) {
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.beginPath(); ctx.roundRect(cbx, cby, cbw, cbh, 4); ctx.fill();
    const filled = Math.round(cbw * confidence / 100);
    const cf = ctx.createLinearGradient(cbx,0,cbx+cbw,0);
    cf.addColorStop(0,accentDk); cf.addColorStop(1,accentLt);
    ctx.fillStyle = cf; ctx.beginPath(); ctx.roundRect(cbx, cby, filled, cbh, 4); ctx.fill();
    ctx.fillStyle = accentLt; ctx.beginPath(); ctx.arc(cbx+filled, cby+cbh/2, cbh/2+1.5, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.font = '400 11px -apple-system,sans-serif';
    ctx.textAlign = 'right'; ctx.fillText('\u7f6e\u4fe1\u5ea6', cbx-8, cby+9);
    ctx.fillStyle = '#ffffff'; ctx.font = '700 14px -apple-system,sans-serif';
    ctx.textAlign = 'left'; ctx.fillText(`${confidence}%`, cbx+cbw+10, cby+9);
  } else if (oppQuality) {
    const gradeColors: Record<string,string> = { A:'#ef4444', B:'#f97316', C:'#eab308', D:'#94a3b8' };
    const gc = gradeColors[oppQuality] || '#94a3b8';
    const gradeLabel = `${oppQuality} \u7ea7\u673a\u4f1a`;
    ctx.font = '700 18px -apple-system,sans-serif';
    const glw = ctx.measureText(gradeLabel).width + 32;
    ctx.fillStyle = gc + '30';
    ctx.beginPath(); ctx.roundRect(W/2-glw/2, cby-4, glw, 22, 11); ctx.fill();
    ctx.strokeStyle = gc + '66'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(W/2-glw/2, cby-4, glw, 22, 11); ctx.stroke();
    ctx.fillStyle = gc; ctx.textAlign = 'center';
    ctx.fillText(gradeLabel, W/2, cby+13);
    ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.font = '400 10px -apple-system,sans-serif';
    ctx.fillText('AI \u673a\u4f1a\u8bc4\u7ea7', W/2, cby-8);
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.beginPath(); ctx.roundRect(cbx, cby, cbw, cbh, 4); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.font = '400 11px -apple-system,sans-serif';
    ctx.textAlign = 'center'; ctx.fillText('\u7814\u5224\u8fdb\u884c\u4e2d\u2026', W/2, cby+9);
  }
  y += 28;

  // ── Price strip (最新价 / 目标价 / 止损) ──
  {
    const priceItems = [
      { label: '\u6700\u65b0\u4ef7', val: latestPrice != null ? latestPrice.toFixed(2) : '\u2014', col: 'rgba(255,255,255,0.92)' },
      { label: '\u76ee\u6807\u4ef7', val: typeof targetPrice === 'number' ? targetPrice.toFixed(2) : '\u2014', col: isMasked ? 'rgba(255,255,255,0.3)' : '#86efac' },
      { label: '\u6b62\u635f', val: typeof stopLoss === 'number' ? stopLoss.toFixed(2) : '\u2014', col: isMasked ? 'rgba(255,255,255,0.3)' : '#fca5a5' },
    ];
    const colW = Math.floor(W / 3);
    priceItems.forEach((item, i) => {
      const cx = colW * i + colW / 2;
      ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.font = '400 10px -apple-system,sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(item.label, cx, y + 11);
      ctx.fillStyle = item.col; ctx.font = '700 17px -apple-system,sans-serif';
      ctx.fillText(item.val, cx, y + 29);
    });
    y += 38;
  }

  // ── Timestamps (two lines, both always visible) ──
  const latestDate = result?.data?.latest_date
    ? new Date(result.data.latest_date).toLocaleString('zh-CN', {year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})
    : '';
  const analyzedDate = analyzedAt
    ? new Date(analyzedAt).toLocaleString('zh-CN', {year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})
    : '';
  ctx.fillStyle = 'rgba(255,255,255,0.42)'; ctx.font = '400 10px -apple-system,sans-serif'; ctx.textAlign = 'center';
  if (latestDate)   { ctx.fillText(`K\u7ebf ${latestDate}`,    W/2, y+11); y += 15; }
  if (analyzedDate) { ctx.fillText(`\u5206\u6790 ${analyzedDate}`, W/2, y+11); }

  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, HERO_H, W, H-HERO_H);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(0, HERO_H-16); ctx.quadraticCurveTo(W/2, HERO_H+16, W, HERO_H-16);
  ctx.lineTo(W, HERO_H); ctx.lineTo(0, HERO_H); ctx.closePath(); ctx.fill();

  y = HERO_H + 8;
  if (tier !== 'free') {
    const slb = '\u6df1 \u5ea6 \u7814 \u5224';
    ctx.font = '600 11px -apple-system,sans-serif'; ctx.fillStyle = '#94a3b8'; ctx.textAlign = 'center';
    const slbW = ctx.measureText(slb).width;
    ctx.strokeStyle = '#e8edf2'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(24, y+7); ctx.lineTo(W/2-slbW/2-10, y+7); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(W/2+slbW/2+10, y+7); ctx.lineTo(W-24, y+7); ctx.stroke();
    ctx.fillText(slb, W/2, y+11);
  }
  y = ROWS_Y;

  const stepPalette = ['#6366f1','#0ea5e9','#f59e0b','#10b981'];
  const qColor = (q: string) => q==='A' ? '#16a34a' : q==='B' ? '#0369a1' : q==='C' ? '#d97706' : '#dc2626';

  const drawRow = (
    step: number, icon: string, label: string,
    text: string, masked: boolean,
    badge?: string, subLine?: string,
    blurred?: boolean
  ) => {
    const rowTop = y;
    const sc = masked ? '#cbd5e1' : stepPalette[step-1];

    if (step > 1) {
      ctx.strokeStyle = '#f1f5f9'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(6, rowTop); ctx.lineTo(W, rowTop); ctx.stroke();
    }

    const stripG = ctx.createLinearGradient(0, rowTop, 0, rowTop+rowH);
    stripG.addColorStop(0, masked ? '#e2e8f0' : sc+'cc');
    stripG.addColorStop(1, masked ? '#e2e8f0' : sc+'44');
    ctx.fillStyle = stripG; ctx.fillRect(0, rowTop, 5, rowH);

    if (step % 2 === 0) {
      ctx.fillStyle = 'rgba(248,250,252,0.6)';
      ctx.fillRect(5, rowTop, W-5, rowH);
    }

    const rx = 22;
    let ry = rowTop + 16;

    ctx.fillStyle = masked ? '#f1f5f9' : sc+'28';
    ctx.beginPath(); ctx.arc(rx+10, ry-3, 12, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = masked ? '#b0bec5' : sc;
    ctx.font = '700 11px -apple-system,sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(String(step), rx+10, ry+1);

    ctx.fillStyle = masked ? '#94a3b8' : '#1e293b';
    ctx.font = '700 14px -apple-system,sans-serif'; ctx.textAlign = 'left';
    ctx.fillText(`${icon}  ${label}`, rx+28, ry);

    if (badge) {
      const qc = qColor(badge);
      const bt = `${badge} \u7ea7`;
      ctx.font = '700 11px -apple-system,sans-serif';
      const bw2 = ctx.measureText(bt).width + 14;
      ctx.fillStyle = qc+'22'; ctx.beginPath(); ctx.roundRect(W-22-bw2, ry-13, bw2, 19, 9); ctx.fill();
      ctx.strokeStyle = qc+'55'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(W-22-bw2, ry-13, bw2, 19, 9); ctx.stroke();
      ctx.fillStyle = qc; ctx.textAlign = 'right'; ctx.fillText(bt, W-22-7, ry);
    }
    ry += 20;

    const maxLines = rowH >= 90 ? 2 : 1;
    if (masked) {
      ctx.fillStyle = '#d1d9e0'; ctx.font = '400 13px -apple-system,sans-serif'; ctx.textAlign = 'left';
      ctx.fillText('\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588  \u5347\u7ea7\u89e3\u9501\u5b8c\u6574\u7814\u5224', rx+2, ry);
      ry += 18;
    } else {
      const lines = getLines(text || '\u2014', '400 13px -apple-system,sans-serif', W-rx-28, maxLines);
      ctx.fillStyle = blurred ? '#94a3b8' : '#475569';
      ctx.font = '400 13px -apple-system,sans-serif'; ctx.textAlign = 'left';
      if (blurred) ctx.filter = 'blur(6px)';
      lines.forEach((ln, li) => { ctx.fillText(ln, rx+2, ry + li*19); });
      if (blurred) ctx.filter = 'none';
      ry += lines.length * 19;
    }

    if (subLine && !masked) {
      ry += 4;
      const chips = subLine.split('  \u00b7  ').filter(Boolean);
      let cx2 = rx+2;
      chips.forEach((chip) => {
        ctx.font = '500 11px -apple-system,sans-serif';
        const chipW = ctx.measureText(chip).width + 16;
        ctx.fillStyle = sc+'18'; ctx.beginPath(); ctx.roundRect(cx2, ry-12, chipW, 18, 9); ctx.fill();
        ctx.strokeStyle = sc+'44'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(cx2, ry-12, chipW, 18, 9); ctx.stroke();
        ctx.fillStyle = sc; ctx.textAlign = 'left'; ctx.fillText(chip, cx2+8, ry);
        cx2 += chipW + 8;
      });
    }

    y += rowH;
  };

  // suppress unused warning — drawRow is called via the free-tier branch below
  void drawRow;

  const cleanMask = (s: string) => s.replace(/\u2588\u2588/g, '\u00b7\u00b7\u00b7');
  void cleanMask;

  if (tier === 'free') {
    ctx.clearRect(0, 0, W, H);

    const accentRGB = isBuy ? '232,34,28'  : isSell ? '22,163,74'  : '37,99,235';
    const hiColor   = isBuy ? '#FF4444'    : isSell ? '#4ADE80'    : '#60A5FA';
    const bgA       = isBuy ? '#FFF1F2'    : isSell ? '#F0FDF4'    : '#EFF6FF';
    const bgB       = isBuy ? '#FFE4E6'    : isSell ? '#DCFCE7'    : '#DBEAFE';
    const fFY       = H - 50;
    const FONT      = '"PingFang SC","Microsoft YaHei",-apple-system,sans-serif';

    const kDateStr = result?.data?.latest_date
      ? new Date(result.data.latest_date).toLocaleString('zh-CN', {year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})
      : '';
    const aDateStr = analyzedAt
      ? new Date(analyzedAt).toLocaleString('zh-CN', {year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})
      : '';

    const wrapCN = (text: string, font: string, maxW: number, maxLines: number): string[] => {
      ctx.font = font;
      const puncts = new Set(['\uff0c','\u3002','\u3001','\uff01','\uff1f','\uff1b','\uff1a','\u2026']);
      const out: string[] = [];
      let rem = text;
      for (let li = 0; li < maxLines && rem.length; li++) {
        if (ctx.measureText(rem).width <= maxW) { out.push(rem); break; }
        const isLast = li === maxLines - 1;
        let end = rem.length;
        while (end > 0 && ctx.measureText(rem.slice(0, end) + (isLast ? '\u2026' : '')).width > maxW) end--;
        if (!isLast) for (let b = 0; b < 8 && end - b > 1; b++)
          if (puncts.has(rem[end - b])) { end = end - b + 1; break; }
        out.push(rem.slice(0, end) + (isLast && rem.length > end ? '\u2026' : ''));
        rem = rem.slice(end);
      }
      return out;
    };

    const drawWordBlocks = (x: number, lineY: number, totalW: number, blockH: number, widths: number[], opacity: number) => {
      let cx = x;
      ctx.beginPath();
      for (const bw of widths) {
        if (cx + bw > x + totalW) break;
        ctx.roundRect(cx, lineY - Math.ceil(blockH / 2), bw, blockH, blockH / 2);
        cx += bw + 7;
      }
      ctx.fillStyle = `rgba(0,0,0,${opacity})`; ctx.fill();
    };

    /* ── Background ─────────────────────────────────────────────────── */
    const fbg = ctx.createLinearGradient(0, 0, 0, H);
    fbg.addColorStop(0, bgA); fbg.addColorStop(1, bgB);
    ctx.fillStyle = fbg; ctx.fillRect(0, 0, W, H);

    const fBloom = ctx.createRadialGradient(W/2, 0, 0, W/2, 0, 360);
    fBloom.addColorStop(0, `rgba(${accentRGB},0.10)`); fBloom.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = fBloom; ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = `rgba(${accentRGB},0.06)`;
    for (let gi = 18; gi < W; gi += 22)
      for (let gj = 18; gj < H; gj += 22)
        { ctx.beginPath(); ctx.arc(gi, gj, 1, 0, Math.PI*2); ctx.fill(); }

    ctx.save();
    ctx.globalAlpha = 0.025;
    ctx.strokeStyle = accent; ctx.lineWidth = 1;
    for (let d = -H; d < W + H; d += 18) {
      ctx.beginPath(); ctx.moveTo(d, 0); ctx.lineTo(d + H, H); ctx.stroke();
    }
    ctx.restore();

    const fStripe = ctx.createLinearGradient(0, 0, W, 0);
    fStripe.addColorStop(0, 'rgba(0,0,0,0)'); fStripe.addColorStop(0.2, accentDk + 'cc');
    fStripe.addColorStop(0.5, accent); fStripe.addColorStop(0.8, accent + 'aa');
    fStripe.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = fStripe; ctx.fillRect(0, 0, W, 5);

    /* ── Brand bar ───────────────────────────────────────────────────── */
    ctx.font = `600 11px ${FONT}`; ctx.textAlign = 'left';
    ctx.fillStyle = accent;
    ctx.fillText(`K\u7ebf  ${kDateStr || '\u2014'}`, 20, 20);
    ctx.font = `400 10px ${FONT}`; ctx.fillStyle = `rgba(${accentRGB},0.55)`;
    ctx.fillText(`\u7814\u5224  ${aDateStr || '\u2014'}`, 20, 33);

    const fbsep = ctx.createLinearGradient(0, 0, W, 0);
    fbsep.addColorStop(0, 'rgba(0,0,0,0)'); fbsep.addColorStop(0.5, `rgba(${accentRGB},0.22)`); fbsep.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.strokeStyle = fbsep; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, 38); ctx.lineTo(W, 38); ctx.stroke();

    /* ── Stock name ──────────────────────────────────────────────────── */
    let fy = 46;
    ctx.textAlign = 'center'; ctx.font = `800 52px ${FONT}`;
    ctx.shadowColor = `rgba(${accentRGB},0.25)`; ctx.shadowBlur = 12;
    ctx.fillStyle = `rgba(${accentRGB},0.90)`;
    ctx.fillText(stockName, W/2, fy + 44);
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
    fy += 52;

    ctx.font = `600 12px ${FONT}`;
    const fcpw = ctx.measureText(stockCode).width + 22;
    ctx.fillStyle = `rgba(${accentRGB},0.12)`;
    ctx.beginPath(); ctx.roundRect(W/2 - fcpw/2, fy, fcpw, 22, 11); ctx.fill();
    ctx.strokeStyle = `rgba(${accentRGB},0.35)`; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(W/2 - fcpw/2, fy, fcpw, 22, 11); ctx.stroke();
    ctx.fillStyle = accent; ctx.textAlign = 'center'; ctx.fillText(stockCode, W/2, fy + 15);
    fy += 28;

    /* ── Signal — large filled circle ───────────────────────────────── */
    const fSigCY = fy + 82;
    const fSigR  = 76;

    for (let deg = 0; deg < 360; deg += 6) {
      const rad   = deg * Math.PI / 180;
      const major = deg % 30 === 0;
      const r1    = fSigR + (major ? 12 : 7);
      const r2    = fSigR + 20;
      ctx.strokeStyle = `rgba(${accentRGB},${major ? 0.55 : 0.18})`; ctx.lineWidth = major ? 2 : 0.8;
      ctx.beginPath();
      ctx.moveTo(W/2 + Math.cos(rad)*r1, fSigCY + Math.sin(rad)*r1);
      ctx.lineTo(W/2 + Math.cos(rad)*r2, fSigCY + Math.sin(rad)*r2);
      ctx.stroke();
    }
    ctx.strokeStyle = `rgba(${accentRGB},0.14)`; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(W/2, fSigCY, fSigR + 20, 0, Math.PI*2); ctx.stroke();

    ctx.shadowColor = `rgba(${accentRGB},0.32)`; ctx.shadowBlur = 40; ctx.shadowOffsetY = 8;
    ctx.fillStyle = accentDk;
    ctx.beginPath(); ctx.arc(W/2, fSigCY, fSigR, 0, Math.PI*2); ctx.fill();
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

    const fSigGrad = ctx.createRadialGradient(W/2 - 24, fSigCY - 24, 0, W/2, fSigCY, fSigR);
    fSigGrad.addColorStop(0, hiColor);
    fSigGrad.addColorStop(0.5, accent);
    fSigGrad.addColorStop(1, accentDk);
    ctx.fillStyle = fSigGrad;
    ctx.beginPath(); ctx.arc(W/2, fSigCY, fSigR, 0, Math.PI*2); ctx.fill();

    const fHlG = ctx.createRadialGradient(W/2 - 24, fSigCY - 24, 0, W/2 - 24, fSigCY - 24, 52);
    fHlG.addColorStop(0, 'rgba(255,255,255,0.32)'); fHlG.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = fHlG;
    ctx.beginPath(); ctx.arc(W/2, fSigCY, fSigR, 0, Math.PI*2); ctx.fill();

    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(W/2, fSigCY, fSigR - 1, 0, Math.PI*2); ctx.stroke();

    ctx.font = `900 46px ${FONT}`; ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0,0,0,0.28)'; ctx.shadowBlur = 10;
    ctx.fillText(actionLabel, W/2, fSigCY + 18);
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;

    ctx.fillStyle = `rgba(${accentRGB},0.45)`; ctx.font = `500 11px ${FONT}`;
    ctx.fillText('\u64cd  \u4f5c  \u5efa  \u8bae', W/2, fSigCY + fSigR + 30);
    fy = fSigCY + fSigR + 44;

    /* ── Confidence ──────────────────────────────────────────────────── */
    ctx.font = `400 11px ${FONT}`; ctx.fillStyle = `rgba(${accentRGB},0.50)`;
    ctx.textAlign = 'left'; ctx.fillText('AI \u7f6e\u4fe1\u5ea6', 64, fy + 10);
    ctx.font = `800 22px ${FONT}`; ctx.fillStyle = accent;
    ctx.textAlign = 'right';
    ctx.fillText(confidence != null ? `${confidence}%` : '\u2014', W - 64, fy + 10);
    fy += 15;

    const fcbx = 64, fcbw = W - 128, fcbh = 7;
    ctx.fillStyle = `rgba(${accentRGB},0.10)`;
    ctx.beginPath(); ctx.roundRect(fcbx, fy, fcbw, fcbh, 4); ctx.fill();
    if (confidence != null) {
      const ffilled = Math.round(fcbw * confidence / 100);
      const fcf = ctx.createLinearGradient(fcbx, 0, fcbx + fcbw, 0);
      fcf.addColorStop(0, accentDk); fcf.addColorStop(1, accent);
      ctx.fillStyle = fcf;
      ctx.beginPath(); ctx.roundRect(fcbx, fy, ffilled, fcbh, 4); ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.shadowColor = accent; ctx.shadowBlur = 6;
      ctx.beginPath(); ctx.arc(fcbx + ffilled, fy + fcbh/2, fcbh/2 + 2, 0, Math.PI*2); ctx.fill();
      ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
    }
    fy += fcbh + 16;

    /* ── Price strip — mini cards with directional arrows ────────────── */
    const fColW = Math.floor(W / 3);
    const fPCardH = 60;
    for (let i = 0; i < 3; i++) {
      const px = fColW * i + 6;
      ctx.fillStyle = 'rgba(255,255,255,0.62)';
      ctx.beginPath(); ctx.roundRect(px, fy, fColW - 12, fPCardH, 10); ctx.fill();
      ctx.strokeStyle = `rgba(${accentRGB},0.12)`; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.roundRect(px, fy, fColW - 12, fPCardH, 10); ctx.stroke();
    }
    const fPriceItems = [
      { label: '\u6700\u65b0\u4ef7', val: latestPrice != null ? (latestPrice as number).toFixed(2) : '\u2014', col: '#111111', arrow: '' },
      { label: '\u76ee\u6807\u4ef7', val: targetPrice != null ? (targetPrice as number).toFixed(2) : '\u2014',
        col: targetPrice != null ? '#DC2626' : `rgba(${accentRGB},0.30)`,
        arrow: targetPrice != null && latestPrice != null ? ((targetPrice as number) > (latestPrice as number) ? '\u25b2 ' : '\u25bc ') : '' },
      { label: '\u6b62  \u635f',     val: stopLoss   != null ? (stopLoss   as number).toFixed(2) : '\u2014',
        col: stopLoss != null ? '#16A34A' : `rgba(${accentRGB},0.30)`,
        arrow: stopLoss != null && latestPrice != null ? ((stopLoss as number) > (latestPrice as number) ? '\u25b2 ' : '\u25bc ') : '' },
    ];
    fPriceItems.forEach((item, i) => {
      const pcx = fColW * i + fColW / 2;
      ctx.fillStyle = `rgba(${accentRGB},0.50)`; ctx.font = `500 11px ${FONT}`; ctx.textAlign = 'center';
      ctx.fillText(item.label, pcx, fy + 17);
      ctx.font = `700 24px ${FONT}`; ctx.fillStyle = item.col;
      ctx.fillText(item.arrow + item.val, pcx, fy + 46);
    });
    fy += fPCardH + 4;

    /* ── Analysis card ───────────────────────────────────────────────── */
    const fCX = 18, fCW = W - 36;
    const fCardY = fy + 8;
    const fLockH = 56;
    const fCardH = fFY - 14 - fCardY;
    const fDivY  = fCardY + fCardH - fLockH - 2;
    const ftX    = fCX + 18;
    const ftW    = fCW - 36;

    ctx.fillStyle = 'rgba(255,255,255,0.60)';
    ctx.beginPath(); ctx.roundRect(fCX, fCardY, fCW, fCardH, 16); ctx.fill();
    ctx.strokeStyle = `rgba(${accentRGB},0.15)`; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(fCX, fCardY, fCW, fCardH, 16); ctx.stroke();

    ctx.fillStyle = accent;
    ctx.beginPath(); ctx.roundRect(fCX, fCardY + 14, 3, fCardH - 28, [0, 2, 2, 0]); ctx.fill();

    ctx.fillStyle = accent; ctx.font = `700 11px ${FONT}`; ctx.textAlign = 'left';
    ctx.fillText('\u5206  \u6790  \u8981  \u70b9', ftX, fCardY + 20);

    const fFont15 = `500 15px ${FONT}`;
    const faLines = wrapCN(mainReason || '\u2014', fFont15, ftW, 3);
    ctx.fillStyle = 'rgba(0,0,0,0.78)'; ctx.font = fFont15;
    const ftY0 = fCardY + 36;
    faLines.forEach((ln, li) => ctx.fillText(ln, ftX, ftY0 + li * 22));
    const ftEnd = ftY0 + faLines.length * 22;

    ctx.save();
    ctx.setLineDash([3, 5]);
    ctx.strokeStyle = `rgba(${accentRGB},0.22)`; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(ftX, ftEnd + 16); ctx.lineTo(ftX + ftW, ftEnd + 16); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    const frTop = ftEnd + 24;
    const frBot = fDivY - 14;
    if (frBot - frTop > 16) {
      const fRows: { dy: number; w: number[]; op: number }[] = [
        { dy:  4, w: [58,34,68,28,50,38,44],    op: 0.28 },
        { dy: 18, w: [42,62,28,46,38,54,24,36], op: 0.22 },
        { dy: 32, w: [68,32,52,44,28,46,30],    op: 0.16 },
        { dy: 46, w: [46,58,34,40,52,30,44],    op: 0.10 },
        { dy: 60, w: [38,50,66,28,44,30,52],    op: 0.06 },
        { dy: 74, w: [54,36,48,62,26,40,34],    op: 0.04 },
        { dy: 88, w: [44,58,30,46,36,52],        op: 0.02 },
      ];
      for (const r of fRows) {
        if (frTop + r.dy > frBot) break;
        drawWordBlocks(ftX, frTop + r.dy, ftW, 7, r.w, r.op);
      }
      const ffadeG = ctx.createLinearGradient(0, frTop, 0, frBot);
      ffadeG.addColorStop(0,    'rgba(255,255,255,0.00)');
      ffadeG.addColorStop(0.42, 'rgba(255,255,255,0.30)');
      ffadeG.addColorStop(0.70, 'rgba(255,255,255,0.78)');
      ffadeG.addColorStop(1,    'rgba(255,255,255,0.97)');
      ctx.fillStyle = ffadeG;
      ctx.beginPath(); ctx.roundRect(fCX + 1, frTop - 4, fCW - 2, frBot - frTop + 8, 4); ctx.fill();

      const fbY  = fDivY - 46;
      const flbT = '\uD83D\uDD12  \u5b8c\u6574\u7814\u5224\u5df2\u9501\u5b9a';
      ctx.font = `600 13px ${FONT}`;
      const flbW = ctx.measureText(flbT).width + 36;
      ctx.shadowColor = `rgba(${accentRGB},0.35)`; ctx.shadowBlur = 14;
      ctx.fillStyle = accent;
      ctx.beginPath(); ctx.roundRect(W/2 - flbW/2, fbY - 14, flbW, 28, 14); ctx.fill();
      ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
      ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.fillText(flbT, W/2, fbY + 5);
    }

    ctx.strokeStyle = `rgba(${accentRGB},0.18)`; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(fCX + 14, fDivY); ctx.lineTo(fCX + fCW - 14, fDivY); ctx.stroke();

    ctx.fillStyle = `rgba(${accentRGB},0.50)`; ctx.font = `400 11px ${FONT}`; ctx.textAlign = 'center';
    ctx.fillText('\uD83D\uDD12  \u5347\u7ea7\u89e3\u9501\uff1a\u5e02\u573a\u8bca\u65ad \u00b7 \u673a\u4f1a\u8bc4\u4f30 \u00b7 \u98ce\u9669\u6536\u76ca \u00b7 \u6267\u884c\u65b9\u6848', W/2, fDivY + 18);

    const fUpT = '\u7acb\u5373\u5347\u7ea7 \u2192';
    ctx.font = `600 12px ${FONT}`;
    const fUpW = ctx.measureText(fUpT).width + 34;
    const fUpBtnG = ctx.createLinearGradient(W/2 - fUpW/2, 0, W/2 + fUpW/2, 0);
    fUpBtnG.addColorStop(0, accentDk); fUpBtnG.addColorStop(1, accent);
    ctx.fillStyle = fUpBtnG;
    ctx.shadowColor = `rgba(${accentRGB},0.30)`; ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.roundRect(W/2 - fUpW/2, fDivY + 24, fUpW, 26, 13); ctx.fill();
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.fillText(fUpT, W/2, fDivY + 41);

    ctx.strokeStyle = `rgba(${accentRGB},0.18)`; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(20, fFY + 2); ctx.lineTo(W - 20, fFY + 2); ctx.stroke();
    ctx.textAlign = 'left'; ctx.fillStyle = `rgba(${accentRGB},0.38)`; ctx.font = `400 10px ${FONT}`;
    ctx.fillText('\u672c\u5361\u7247\u7531AI\u751f\u6210\uff0c\u4ec5\u4f9b\u53c2\u8003\uff0c\u4e0d\u6784\u6210\u6295\u8d44\u5efa\u8bae', 20, fFY + 26);
    ctx.textAlign = 'right';
    ctx.font = `700 13px ${FONT}`; ctx.fillStyle = accent;
    ctx.shadowColor = `rgba(${accentRGB},0.25)`; ctx.shadowBlur = 6;
    ctx.fillText(`\u300C ${appName} \u300D`, W - 20, fFY + 21);
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
    ctx.font = `400 9px ${FONT}`; ctx.fillStyle = `rgba(${accentRGB},0.45)`;
    ctx.fillText('AI \u667a\u80fd\u7814\u5224', W - 20, fFY + 34);

    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) { reject(new Error('canvas.toBlob failed')); return; }
        resolve({ blob, filename: `${stockCode || stockName}_\u7814\u5224\u5361.png` });
      }, 'image/png');
    });

  } else {
    // ── Basic & Premium V10 new design ───────────────────────────────
    const W2 = 675; // 3:4 ratio: 675×900
    let CARD_H = 900, FY = 848;
    const isPremium = tier === 'premium';
    const FONT = '"PingFang SC","Microsoft YaHei",-apple-system,sans-serif';
    const GOLD = '#d97706', GOLD_DK = '#92400e', GOLD_LT = '#fbbf24';

    const acR = isBuy ? '232,34,28' : isSell ? '22,163,74' : '37,99,235';
    const T = {
      bgA:  isBuy ? '#FFF1F2' : isSell ? '#F0FDF4' : '#EFF6FF',
      bgB:  isBuy ? '#FFE4E6' : isSell ? '#DCFCE7' : '#DBEAFE',
      ac:   isBuy ? '#E8221C' : isSell ? '#16A34A' : '#2563EB',
      adk:  isBuy ? '#991B1B' : isSell ? '#15803d' : '#1d4ed8',
      hi:   isBuy ? '#FF4444' : isSell ? '#4ADE80' : '#60A5FA',
      acR,
      label: actionLabel,
    };
    const heroGlow = T.ac;

    canvas.width  = W2 * dpr;
    canvas.height = (longImage ? 3000 : CARD_H) * dpr; // longImage: temp height, will resize
    ctx.scale(dpr, dpr);

    const wrapCN = (text: string, font: string, maxW: number, maxLines: number): string[] => {
      ctx.font = font;
      const puncts = new Set(['\uff0c','\u3002','\u3001','\uff01','\uff1f','\uff1b','\uff1a','\u2026']);
      const out: string[] = [];
      let rem = text;
      for (let li = 0; li < maxLines && rem.length; li++) {
        if (ctx.measureText(rem).width <= maxW) { out.push(rem); break; }
        const isLast = li === maxLines - 1;
        let end = rem.length;
        while (end > 0 && ctx.measureText(rem.slice(0, end) + (isLast ? '\u2026' : '')).width > maxW) end--;
        if (!isLast) for (let b = 0; b < 8 && end - b > 1; b++)
          if (puncts.has(rem[end - b])) { end = end - b + 1; break; }
        while (end > 1 && /\d/.test(rem[end - 1]) && /[\d%]/.test(rem[end])) end--;
        out.push(rem.slice(0, end) + (isLast && rem.length > end ? '\u2026' : ''));
        rem = rem.slice(end);
      }
      return out;
    };

    // Long image: pre-measure content to compute dynamic canvas height
    let _longRowLines: string[][] | null = null;
    let _longRowHeights: number[] | null = null;
    if (longImage) {
      const _TF = `400 14px ${FONT}`;
      const _textMaxW = (W2 - 28) - 18 - 14;
      const _HEADER_H = 34, _LINE_H = 24, _ROW_PAD_B = 12, _ROW_GAP = 8;
      const _texts = [mktDiag, oppAssess, riskAnal, execPlan];
      _longRowLines = _texts.map(t => wrapCN(t, _TF, _textMaxW, 20));
      const _idealH = _longRowLines.map(ls => _HEADER_H + ls.length * _LINE_H + _ROW_PAD_B);
      _longRowHeights = _idealH;
      // Estimate fy after fixed top section
      let _fy = 42 + 50 + 28;                           // date + name + pill
      _fy = (_fy + 78) + 64 + 58;                       // orb (sigCY=_fy+78, sigR=64)
      if (confidence != null) _fy += 28;                // confidence bar
      if (latestPrice != null) _fy += 72;               // price strip
      const _totalRows = _idealH.reduce((a, b) => a + b, 0) + _ROW_GAP * 3;
      CARD_H = _fy + _totalRows + 60;                   // 60 = footer area
      FY = CARD_H - 52;
      canvas.height = CARD_H * dpr;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
    }

    /* ── Background */
    const bg = ctx.createLinearGradient(0, 0, 0, CARD_H);
    bg.addColorStop(0, T.bgA); bg.addColorStop(1, T.bgB);
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W2, CARD_H);

    const bloom = ctx.createRadialGradient(W2/2, 0, 0, W2/2, 0, 360);
    bloom.addColorStop(0, `rgba(${T.acR},0.10)`); bloom.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = bloom; ctx.fillRect(0, 0, W2, CARD_H);

    ctx.fillStyle = `rgba(${T.acR},0.06)`;
    for (let gx = 18; gx < W2; gx += 22)
      for (let gy2 = 18; gy2 < CARD_H; gy2 += 22)
        { ctx.beginPath(); ctx.arc(gx, gy2, 1, 0, Math.PI*2); ctx.fill(); }

    ctx.save();
    ctx.globalAlpha = 0.032;
    ctx.strokeStyle = T.ac; ctx.lineWidth = 1;
    for (let d = -CARD_H; d < W2 + CARD_H; d += 18) {
      ctx.beginPath(); ctx.moveTo(d, 0); ctx.lineTo(d + CARD_H, CARD_H); ctx.stroke();
    }
    ctx.restore();

    /* ── Top stripe */
    const stripe = ctx.createLinearGradient(0, 0, W2, 0);
    if (isPremium) {
      stripe.addColorStop(0, 'rgba(0,0,0,0)'); stripe.addColorStop(0.2, GOLD_DK + 'ee');
      stripe.addColorStop(0.5, GOLD_LT); stripe.addColorStop(0.8, GOLD + 'aa');
      stripe.addColorStop(1, 'rgba(0,0,0,0)');
    } else {
      stripe.addColorStop(0, 'rgba(0,0,0,0)'); stripe.addColorStop(0.2, T.adk + 'ee');
      stripe.addColorStop(0.5, heroGlow); stripe.addColorStop(0.8, heroGlow + 'aa');
      stripe.addColorStop(1, 'rgba(0,0,0,0)');
    }
    ctx.fillStyle = stripe; ctx.fillRect(0, 0, W2, 6);

    /* ── Date bar */
    const latestDate2 = result?.data?.latest_date
      ? new Date(result.data.latest_date).toLocaleString('zh-CN', {year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})
      : '';
    const analyzedDate2 = analyzedAt
      ? new Date(analyzedAt).toLocaleString('zh-CN', {year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})
      : '';
    ctx.font = `600 11px ${FONT}`; ctx.textAlign = 'left';
    ctx.fillStyle = `rgba(${T.acR},0.55)`;
    ctx.fillText(`K\u7ebf  ${latestDate2}`, 20, 20);
    ctx.font = `400 10px ${FONT}`; ctx.fillStyle = `rgba(${T.acR},0.45)`;
    ctx.fillText(`\u7814\u5224  ${analyzedDate2}`, 20, 33);

    let fy = 42;

    /* ── Stock name */
    ctx.textAlign = 'center';
    ctx.font = `800 48px ${FONT}`;
    ctx.shadowColor = `rgba(${T.acR},0.30)`; ctx.shadowBlur = 18;
    ctx.fillStyle = `rgba(${T.acR},0.92)`;
    ctx.fillText(stockName, W2/2, fy + 44);
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
    fy += 50;

    /* ── Code pill */
    ctx.font = `600 12px ${FONT}`;
    const cpw = ctx.measureText(stockCode).width + 22;
    ctx.fillStyle = `rgba(${T.acR},0.12)`;
    ctx.beginPath(); ctx.roundRect(W2/2 - cpw/2, fy, cpw, 22, 11); ctx.fill();
    ctx.strokeStyle = `rgba(${T.acR},0.35)`; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(W2/2 - cpw/2, fy, cpw, 22, 11); ctx.stroke();
    ctx.fillStyle = T.ac; ctx.textAlign = 'center';
    ctx.fillText(stockCode, W2/2, fy + 15);
    fy += 28;

    /* ── Signal orb */
    const sigCY = fy + 78, sigR = 64;
    for (let deg = 0; deg < 360; deg += 6) {
      const rad = deg * Math.PI / 180;
      const major = deg % 30 === 0;
      const r1 = sigR + (major ? 12 : 7), r2 = sigR + 20;
      ctx.strokeStyle = `rgba(${T.acR},${major ? 0.55 : 0.18})`;
      ctx.lineWidth = major ? 2 : 0.8;
      ctx.beginPath();
      ctx.moveTo(W2/2 + Math.cos(rad)*r1, sigCY + Math.sin(rad)*r1);
      ctx.lineTo(W2/2 + Math.cos(rad)*r2, sigCY + Math.sin(rad)*r2);
      ctx.stroke();
    }
    ctx.strokeStyle = `rgba(${T.acR},0.14)`; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(W2/2, sigCY, sigR + 20, 0, Math.PI*2); ctx.stroke();

    if (isPremium) {
      ctx.strokeStyle = GOLD + '55'; ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 6]);
      ctx.beginPath(); ctx.arc(W2/2, sigCY, sigR + 25, 0, Math.PI*2); ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.shadowColor = `rgba(${T.acR},0.32)`; ctx.shadowBlur = 40; ctx.shadowOffsetY = 8;
    ctx.fillStyle = T.adk;
    ctx.beginPath(); ctx.arc(W2/2, sigCY, sigR, 0, Math.PI*2); ctx.fill();
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

    const sigGrad = ctx.createRadialGradient(W2/2-22, sigCY-22, 0, W2/2, sigCY, sigR);
    sigGrad.addColorStop(0, T.hi); sigGrad.addColorStop(0.5, T.ac); sigGrad.addColorStop(1, T.adk);
    ctx.fillStyle = sigGrad;
    ctx.beginPath(); ctx.arc(W2/2, sigCY, sigR, 0, Math.PI*2); ctx.fill();

    const hlGO = ctx.createRadialGradient(W2/2-22, sigCY-22, 0, W2/2-22, sigCY-22, 50);
    hlGO.addColorStop(0, 'rgba(255,255,255,0.32)'); hlGO.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = hlGO;
    ctx.beginPath(); ctx.arc(W2/2, sigCY, sigR, 0, Math.PI*2); ctx.fill();

    ctx.strokeStyle = isPremium ? GOLD_LT + '80' : 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(W2/2, sigCY, sigR - 1, 0, Math.PI*2); ctx.stroke();

    ctx.font = `900 42px ${FONT}`; ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0,0,0,0.28)'; ctx.shadowBlur = 10;
    ctx.fillText(T.label, W2/2, sigCY + 16);
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
    ctx.fillStyle = `rgba(${T.acR},0.45)`; ctx.font = `500 11px ${FONT}`;
    ctx.fillText('\u64cd  \u4f5c  \u5efa  \u8bae', W2/2, sigCY + sigR + 38);
    fy = sigCY + sigR + 58;

    /* ── Confidence bar */
    if (confidence != null) {
      const cbLabelTxt = 'AI \u7f6e\u4fe1\u5ea6';
      ctx.font = `400 11px ${FONT}`;
      const cbLabelW = ctx.measureText(cbLabelTxt).width + 10;
      ctx.font = `700 12px ${FONT}`;
      const pctTxt = `${confidence}%`;
      const pctW = ctx.measureText(pctTxt).width + 12;
      const cbx = 22 + cbLabelW, cbw = W2 - 22 - cbLabelW - pctW - 4, cbh = 7, cby = fy + 8;
      ctx.font = `400 11px ${FONT}`; ctx.fillStyle = `rgba(${T.acR},0.50)`; ctx.textAlign = 'left';
      ctx.fillText(cbLabelTxt, 22, fy + 13);
      ctx.fillStyle = `rgba(${T.acR},0.10)`;
      ctx.beginPath(); ctx.roundRect(cbx, cby, cbw, cbh, 4); ctx.fill();
      const filledCB = Math.round(cbw * confidence / 100);
      const cfG = ctx.createLinearGradient(cbx, 0, cbx + cbw, 0);
      cfG.addColorStop(0, T.adk); cfG.addColorStop(1, T.ac);
      ctx.fillStyle = cfG;
      ctx.beginPath(); ctx.roundRect(cbx, cby, filledCB, cbh, 4); ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.shadowColor = T.ac; ctx.shadowBlur = 6;
      ctx.beginPath(); ctx.arc(cbx + filledCB, cby + cbh/2, cbh/2 + 2, 0, Math.PI*2); ctx.fill();
      ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
      ctx.font = `700 12px ${FONT}`; ctx.fillStyle = T.ac; ctx.textAlign = 'left';
      ctx.fillText(pctTxt, cbx + cbw + 10, fy + 13);
    }
    fy += 28;

    /* ── Price strip */
    if (latestPrice != null) {
      const pColW = Math.floor(W2 / 3), pCardH = 62;
      const priceTints = ['rgba(80,80,80,0.07)', 'rgba(220,38,38,0.10)', 'rgba(22,163,74,0.10)'];
      for (let i = 0; i < 3; i++) {
        const px = pColW * i + 6;
        ctx.fillStyle = 'rgba(255,255,255,0.72)';
        ctx.beginPath(); ctx.roundRect(px, fy, pColW - 12, pCardH, 10); ctx.fill();
        ctx.strokeStyle = `rgba(${T.acR},0.12)`; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.roundRect(px, fy, pColW - 12, pCardH, 10); ctx.stroke();
        ctx.fillStyle = priceTints[i];
        ctx.beginPath(); ctx.roundRect(px, fy, pColW - 12, 22, [10, 10, 0, 0]); ctx.fill();
      }
      const prices = [
        { label: '\u6700\u65b0\u4ef7', val: latestPrice.toFixed(2), col: '#111111', arrow: '' },
        { label: '\u76ee\u6807\u4ef7', val: typeof targetPrice === 'number' ? targetPrice.toFixed(2) : '\u2014', col: '#DC2626', arrow: typeof targetPrice === 'number' ? (targetPrice > latestPrice ? '\u25b2 ' : '\u25bc ') : '' },
        { label: '\u6b62  \u635f',     val: typeof stopLoss    === 'number' ? stopLoss.toFixed(2)    : '\u2014', col: '#16A34A', arrow: typeof stopLoss    === 'number' ? (stopLoss    > latestPrice ? '\u25b2 ' : '\u25bc ') : '' },
      ];
      prices.forEach((item, i) => {
        const cx = pColW * i + pColW / 2;
        ctx.fillStyle = `rgba(${T.acR},0.50)`; ctx.font = `500 11px ${FONT}`; ctx.textAlign = 'center';
        ctx.fillText(item.label, cx, fy + 15);
        ctx.font = `700 24px ${FONT}`; ctx.fillStyle = item.col;
        ctx.fillText(item.arrow + item.val, cx, fy + 46);
      });
      fy += pCardH + 10;
    }

    /* ── 4 Analysis rows */
    const TF = `400 14px ${FONT}`;
    const rowXL = 14, rowW2 = W2 - 28;
    const textStartX = rowXL + 18;
    const textMaxW = rowW2 - 18 - 14;
    const HEADER_H = 34, LINE_H = 24, ROW_PAD_B = 12, ROW_GAP = 8;
    const STEP_PALETTE = isPremium
      ? [GOLD, GOLD, GOLD, GOLD]
      : ['#6366f1', '#0ea5e9', '#f59e0b', '#10b981'];
    const STEP_RGB = isPremium
      ? ['212,151,6','212,151,6','212,151,6','212,151,6']
      : ['99,102,241','14,165,233','245,158,11','16,185,129'];
    const ROW_TAGS = ['\u5e02\u573a\u9762', '\u7efc\u5408\u9762', '\u98ce\u9669\u9762', '\u64cd\u4f5c\u9762'];

    const rowData = [
      { step: 1, icon: '\ud83d\udd0d', label: '\u5e02\u573a\u8bca\u65ad', text: mktDiag },
      { step: 2, icon: '\ud83c\udfaf', label: '\u673a\u4f1a\u8bc4\u4f30', text: oppAssess },
      { step: 3, icon: '\u2696\ufe0f', label: '\u98ce\u9669\u6536\u76ca', text: riskAnal },
      { step: 4, icon: '\ud83d\udccb', label: '\u6267\u884c\u65b9\u6848', text: execPlan },
    ];

    const rowLines = _longRowLines || rowData.map(r => wrapCN(r.text, TF, textMaxW, 2));
    const idealH = rowLines.map(ls => HEADER_H + ls.length * LINE_H + ROW_PAD_B);
    const gapTotal = ROW_GAP * 3;
    const avail = FY - fy;
    const idealContentTotal = idealH.reduce((a: number, b: number) => a + b, 0);

    let rowHeights: number[];
    if (_longRowHeights) {
      rowHeights = _longRowHeights; // long image: full height, no scaling
    } else if (idealContentTotal + gapTotal > avail) {
      const scale = (avail - gapTotal) / idealContentTotal;
      rowHeights = idealH.map((h: number) => Math.max(Math.floor(h * scale), HEADER_H + LINE_H));
    } else {
      const extra = Math.floor((avail - idealContentTotal - gapTotal) / 4);
      rowHeights = idealH.map((h: number) => h + extra);
    }

    // Truncate to fitting line count (card mode only — long image shows everything)
    const fittedLines = longImage ? rowLines : rowLines.map((lines: string[], idx: number) => {
      const contentH = rowHeights[idx] - HEADER_H - ROW_PAD_B;
      const maxFit = Math.max(1, Math.floor(contentH / LINE_H));
      if (lines.length <= maxFit) return lines;
      return wrapCN(rowData[idx].text, TF, textMaxW, maxFit);
    });

    let ry = fy;
    rowData.forEach((row, idx) => {
      const rH = rowHeights[idx];
      const sc = STEP_PALETTE[idx];
      const sr = STEP_RGB[idx];
      const lines = fittedLines[idx];

      ctx.shadowColor = `rgba(${sr},0.22)`; ctx.shadowBlur = 14; ctx.shadowOffsetY = 4;
      ctx.fillStyle = 'rgba(255,255,255,0.93)';
      ctx.beginPath(); ctx.roundRect(rowXL, ry, rowW2, rH, 12); ctx.fill();
      ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
      ctx.strokeStyle = `rgba(${sr},0.20)`; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.roundRect(rowXL, ry, rowW2, rH, 12); ctx.stroke();

      if (isPremium) {
        const bSz = 9;
        ctx.strokeStyle = GOLD + '75'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(rowXL+5, ry+5+bSz); ctx.lineTo(rowXL+5, ry+5); ctx.lineTo(rowXL+5+bSz, ry+5); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(rowXL+rowW2-5-bSz, ry+rH-5); ctx.lineTo(rowXL+rowW2-5, ry+rH-5); ctx.lineTo(rowXL+rowW2-5, ry+rH-5-bSz); ctx.stroke();
      }

      const hbg = ctx.createLinearGradient(rowXL, 0, rowXL + rowW2, 0);
      if (isPremium) {
        hbg.addColorStop(0, GOLD_DK + '30'); hbg.addColorStop(0.55, GOLD_LT + '15'); hbg.addColorStop(1, 'rgba(0,0,0,0)');
      } else {
        hbg.addColorStop(0, `rgba(${sr},0.17)`); hbg.addColorStop(0.55, `rgba(${sr},0.07)`); hbg.addColorStop(1, 'rgba(255,255,255,0)');
      }
      ctx.fillStyle = hbg;
      ctx.beginPath(); ctx.roundRect(rowXL, ry, rowW2, HEADER_H, [12, 12, 0, 0]); ctx.fill();

      if (isPremium) {
        const ag = ctx.createLinearGradient(0, ry+8, 0, ry+rH-8);
        ag.addColorStop(0, GOLD_LT); ag.addColorStop(1, GOLD_DK);
        ctx.fillStyle = ag;
      } else { ctx.fillStyle = sc; }
      ctx.shadowColor = isPremium ? GOLD + '60' : sc + '50'; ctx.shadowBlur = 6;
      ctx.beginPath(); ctx.roundRect(rowXL, ry+8, 5, rH-16, [0, 3, 3, 0]); ctx.fill();
      ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;

      const scX = rowXL + 24, scY = ry + 16;
      ctx.strokeStyle = isPremium ? GOLD + '50' : sc + '45'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(scX, scY, 14, 0, Math.PI*2); ctx.stroke();
      if (isPremium) {
        const cg = ctx.createRadialGradient(scX-3, scY-3, 0, scX, scY, 11);
        cg.addColorStop(0, GOLD_LT); cg.addColorStop(1, GOLD_DK);
        ctx.fillStyle = cg;
      } else { ctx.fillStyle = sc; }
      ctx.beginPath(); ctx.arc(scX, scY, 11, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = `700 11px ${FONT}`; ctx.textAlign = 'center';
      ctx.fillText(`${row.step}`, scX, scY + 4);

      ctx.fillStyle = isPremium ? GOLD_DK : sc; ctx.font = `700 13px ${FONT}`; ctx.textAlign = 'left';
      ctx.fillText(`${row.icon}  ${row.label}`, rowXL + 46, ry + 21);

      const tagTxt = ROW_TAGS[idx];
      ctx.font = `500 10px ${FONT}`;
      const tagW = ctx.measureText(tagTxt).width + 14;
      const tagX = rowXL + rowW2 - 10 - tagW;
      ctx.fillStyle = isPremium ? GOLD + '20' : `rgba(${sr},0.12)`;
      ctx.beginPath(); ctx.roundRect(tagX, ry+8, tagW, 17, 8); ctx.fill();
      ctx.strokeStyle = isPremium ? GOLD + '55' : `rgba(${sr},0.28)`; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.roundRect(tagX, ry+8, tagW, 17, 8); ctx.stroke();
      ctx.fillStyle = isPremium ? GOLD_DK : `rgba(${sr},0.80)`; ctx.textAlign = 'center';
      ctx.fillText(tagTxt, tagX + tagW/2, ry + 20);

      if (isPremium && idx === 1 && oppQuality) {
        const gradeColors: Record<string,string> = { A:'#ef4444', B:'#f97316', C:'#eab308', D:'#94a3b8' };
        const gc = gradeColors[oppQuality] || '#94a3b8';
        const gradeT = `${oppQuality} \u7ea7\u673a\u4f1a`;
        ctx.font = `700 11px ${FONT}`;
        const gbW = ctx.measureText(gradeT).width + 16;
        const gbX = tagX - gbW - 6;
        ctx.fillStyle = gc + '22';
        ctx.beginPath(); ctx.roundRect(gbX, ry+8, gbW, 17, 8); ctx.fill();
        ctx.strokeStyle = gc + '60'; ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.roundRect(gbX, ry+8, gbW, 17, 8); ctx.stroke();
        ctx.fillStyle = gc; ctx.textAlign = 'center';
        ctx.fillText(gradeT, gbX + gbW/2, ry + 20);
      }

      ctx.strokeStyle = isPremium ? 'rgba(212,151,6,0.18)' : `rgba(${sr},0.12)`; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(rowXL+10, ry+HEADER_H); ctx.lineTo(rowXL+rowW2-10, ry+HEADER_H); ctx.stroke();

      const contentH = rH - HEADER_H;
      const textBlockH = lines.length * LINE_H;
      const textTopOff = Math.max(8, Math.floor((contentH - textBlockH) / 2));
      ctx.font = TF; ctx.fillStyle = 'rgba(0,0,0,0.80)'; ctx.textAlign = 'left';
      lines.forEach((ln: string, li: number) => ctx.fillText(ln, textStartX, ry + HEADER_H + textTopOff + 13 + li * LINE_H));

      ctx.save();
      ctx.globalAlpha = isPremium ? 0.06 : 0.04;
      ctx.font = `900 30px ${FONT}`; ctx.textAlign = 'right';
      ctx.fillStyle = isPremium ? GOLD_DK : `rgba(${sr},1)`;
      ctx.fillText('AI', rowXL + rowW2 - 12, ry + rH - 6);
      ctx.restore();

      if (idx < 3) {
        const dotY = ry + rH + ROW_GAP / 2;
        const dotCols = isPremium
          ? [GOLD+'55', GOLD+'aa', GOLD+'ee', GOLD+'aa', GOLD+'55']
          : [`rgba(${sr},0.18)`, `rgba(${sr},0.38)`, `rgba(${sr},0.58)`, `rgba(${sr},0.38)`, `rgba(${sr},0.18)`];
        dotCols.forEach((dc: string, di: number) => {
          ctx.fillStyle = dc;
          ctx.beginPath(); ctx.arc(W2/2 + (di-2)*8, dotY, 1.5, 0, Math.PI*2); ctx.fill();
        });
      }

      ry += rH + ROW_GAP;
    });

    /* ── Footer */
    const fpg = ctx.createLinearGradient(0, FY, 0, CARD_H);
    fpg.addColorStop(0, 'rgba(255,255,255,0)'); fpg.addColorStop(1, `rgba(${T.acR},0.05)`);
    ctx.fillStyle = fpg; ctx.fillRect(0, FY, W2, CARD_H - FY);

    ctx.strokeStyle = `rgba(${T.acR},0.18)`; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(20, FY+2); ctx.lineTo(W2-20, FY+2); ctx.stroke();

    ctx.textAlign = 'left'; ctx.fillStyle = `rgba(${T.acR},0.35)`;
    ctx.font = `400 10px ${FONT}`;
    ctx.fillText('\u672c\u5361\u7247\u7531AI\u751f\u6210\uff0c\u4ec5\u4f9b\u53c2\u8003\uff0c\u4e0d\u6784\u6210\u6295\u8d44\u5efa\u8bae', 20, FY + 26);

    const appNameTxt = `\u300c ${appName} \u300d`;
    ctx.font = `700 14px ${FONT}`;
    const appNameW = ctx.measureText(appNameTxt).width;
    const tierLabel = isPremium ? '\u25c8 \u4e13\u4e1a\u7248' : '\u25ce \u6807\u51c6\u7248';
    ctx.font = `600 9px ${FONT}`;
    const tlW = ctx.measureText(tierLabel).width + 14;
    const tbX = W2 - 20 - appNameW - 10 - tlW;
    const tbY = FY + 11;

    if (isPremium) {
      const tbg = ctx.createLinearGradient(tbX, 0, tbX+tlW, 0);
      tbg.addColorStop(0, GOLD_DK + 'cc'); tbg.addColorStop(1, GOLD_LT + 'aa');
      ctx.fillStyle = tbg; ctx.shadowColor = GOLD; ctx.shadowBlur = 6;
    } else {
      ctx.fillStyle = `rgba(${T.acR},0.13)`;
    }
    ctx.beginPath(); ctx.roundRect(tbX, tbY, tlW, 16, 8); ctx.fill();
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
    if (isPremium) {
      ctx.strokeStyle = GOLD_LT + '70'; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.roundRect(tbX, tbY, tlW, 16, 8); ctx.stroke();
    }
    ctx.fillStyle = isPremium ? '#fff8e7' : T.ac; ctx.textAlign = 'center';
    ctx.fillText(tierLabel, tbX + tlW/2, tbY + 11);

    ctx.textAlign = 'right';
    if (isPremium) {
      const ng = ctx.createLinearGradient(W2-20-appNameW, 0, W2-20, 0);
      ng.addColorStop(0, GOLD_DK); ng.addColorStop(1, GOLD_LT);
      ctx.fillStyle = ng; ctx.shadowColor = GOLD; ctx.shadowBlur = 10;
    } else {
      ctx.fillStyle = T.ac; ctx.shadowColor = `rgba(${T.acR},0.28)`; ctx.shadowBlur = 8;
    }
    ctx.font = `700 14px ${FONT}`;
    ctx.fillText(appNameTxt, W2-20, FY+22);
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
    ctx.font = `400 9px ${FONT}`; ctx.fillStyle = `rgba(${T.acR},0.42)`;
    ctx.fillText('AI \u667a\u80fd\u7814\u5224  \u00b7  \u4e13\u4e1a\u6295\u8d44\u5206\u6790', W2-20, FY+35);

    return new Promise<{ blob: Blob; filename: string }>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) { reject(new Error('canvas.toBlob failed')); return; }
        resolve({ blob, filename: `${stockCode || stockName}_\u7814\u5224\u5361.png` });
      }, 'image/png');
    });
  }

  const hasPos = includePosition && positionParams != null && Object.values(positionParams as Record<string, string | undefined>).some((v) => v?.trim());
  if (hasPos && y < FOOTER_Y - 20) {
    const parts: string[] = [];
    if (positionParams!.holdingQuantity) parts.push(`\u6301\u4ed3 ${positionParams!.holdingQuantity}\u80a1`);
    if (positionParams!.costPrice) parts.push(`\u6210\u672c ${positionParams!.costPrice}`);
    if (positionParams!.plannedInvestment) parts.push(`\u8ba1\u5212 ${positionParams!.plannedInvestment}`);
    if (positionParams!.maxPosition) parts.push(`\u4e0a\u9650 ${positionParams!.maxPosition}`);
    if (parts.length) {
      ctx.fillStyle = '#78350f'; ctx.font = '400 11px -apple-system,sans-serif'; ctx.textAlign = 'left';
      ctx.fillText(`[\u6301\u4ed3\u53c2\u6570]  ${parts.join('  \u00b7  ')}`, 24, y + 16);
    }
  }

  ctx.strokeStyle = '#e8edf2'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(20, FOOTER_Y+2); ctx.lineTo(W-20, FOOTER_Y+2); ctx.stroke();

  ctx.textAlign = 'left'; ctx.fillStyle = '#cbd5e1';
  ctx.font = '400 10px -apple-system,sans-serif';
  ctx.fillText('\u672c\u5361\u7247\u7531AI\u751f\u6210\uff0c\u4ec5\u4f9b\u53c2\u8003\uff0c\u4e0d\u6784\u6210\u6295\u8d44\u5efa\u8bae', 20, FOOTER_Y+28);

  ctx.textAlign = 'right';
  if (tier === 'premium') {
    const ng = ctx.createLinearGradient(W-140,0,W-16,0);
    ng.addColorStop(0,'#b45309'); ng.addColorStop(1,'#f59e0b');
    ctx.fillStyle = ng; ctx.font = '700 13px -apple-system,sans-serif';
  } else {
    ctx.fillStyle = '#94a3b8'; ctx.font = '600 12px -apple-system,sans-serif';
  }
  ctx.fillText(`${tierTxt}  ${appName}`, W-20, FOOTER_Y+28);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) { reject(new Error('canvas.toBlob failed')); return; }
      resolve({ blob, filename: `${stockCode || stockName}_\u7814\u5224\u5361.png` });
    }, 'image/png');
  });
}
