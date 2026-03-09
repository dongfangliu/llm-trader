/**
 * Shared share-card canvas generator.
 * Works in any browser context (page.tsx, account/page.tsx, etc.)
 */

export interface ShareCardParams {
  result: any;          // AnalyzeResponse
  tier: string;         // 'free' | 'basic' | 'premium'
  analyzedAt?: string | null;
  appName: string;
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

  const cleanMask = (s: string) => s.replace(/\u2588\u2588/g, '\u00b7\u00b7\u00b7');

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
    const W = 675; // 3:4 ratio: 675×900
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

    canvas.width  = W * dpr;
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
      const _textMaxW = (W - 28) - 18 - 14;
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
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, CARD_H);

    const bloom = ctx.createRadialGradient(W/2, 0, 0, W/2, 0, 360);
    bloom.addColorStop(0, `rgba(${T.acR},0.10)`); bloom.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = bloom; ctx.fillRect(0, 0, W, CARD_H);

    ctx.fillStyle = `rgba(${T.acR},0.06)`;
    for (let gx = 18; gx < W; gx += 22)
      for (let gy = 18; gy < CARD_H; gy += 22)
        { ctx.beginPath(); ctx.arc(gx, gy, 1, 0, Math.PI*2); ctx.fill(); }

    ctx.save();
    ctx.globalAlpha = 0.032;
    ctx.strokeStyle = T.ac; ctx.lineWidth = 1;
    for (let d = -CARD_H; d < W + CARD_H; d += 18) {
      ctx.beginPath(); ctx.moveTo(d, 0); ctx.lineTo(d + CARD_H, CARD_H); ctx.stroke();
    }
    ctx.restore();

    /* ── Top stripe */
    const stripe = ctx.createLinearGradient(0, 0, W, 0);
    if (isPremium) {
      stripe.addColorStop(0, 'rgba(0,0,0,0)'); stripe.addColorStop(0.2, GOLD_DK + 'ee');
      stripe.addColorStop(0.5, GOLD_LT); stripe.addColorStop(0.8, GOLD + 'aa');
      stripe.addColorStop(1, 'rgba(0,0,0,0)');
    } else {
      stripe.addColorStop(0, 'rgba(0,0,0,0)'); stripe.addColorStop(0.2, T.adk + 'ee');
      stripe.addColorStop(0.5, heroGlow); stripe.addColorStop(0.8, heroGlow + 'aa');
      stripe.addColorStop(1, 'rgba(0,0,0,0)');
    }
    ctx.fillStyle = stripe; ctx.fillRect(0, 0, W, 6);

    /* ── Date bar */
    ctx.font = `600 11px ${FONT}`; ctx.textAlign = 'left';
    ctx.fillStyle = `rgba(${T.acR},0.55)`;
    ctx.fillText(`K\u7ebf  ${latestDate}`, 20, 20);
    ctx.font = `400 10px ${FONT}`; ctx.fillStyle = `rgba(${T.acR},0.45)`;
    ctx.fillText(`\u7814\u5224  ${analyzedDate}`, 20, 33);

    let fy = 42;

    /* ── Stock name */
    ctx.textAlign = 'center';
    ctx.font = `800 48px ${FONT}`;
    ctx.shadowColor = `rgba(${T.acR},0.30)`; ctx.shadowBlur = 18;
    ctx.fillStyle = `rgba(${T.acR},0.92)`;
    ctx.fillText(stockName, W/2, fy + 44);
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
    fy += 50;

    /* ── Code pill */
    ctx.font = `600 12px ${FONT}`;
    const cpw = ctx.measureText(stockCode).width + 22;
    ctx.fillStyle = `rgba(${T.acR},0.12)`;
    ctx.beginPath(); ctx.roundRect(W/2 - cpw/2, fy, cpw, 22, 11); ctx.fill();
    ctx.strokeStyle = `rgba(${T.acR},0.35)`; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(W/2 - cpw/2, fy, cpw, 22, 11); ctx.stroke();
    ctx.fillStyle = T.ac; ctx.textAlign = 'center';
    ctx.fillText(stockCode, W/2, fy + 15);
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
      ctx.moveTo(W/2 + Math.cos(rad)*r1, sigCY + Math.sin(rad)*r1);
      ctx.lineTo(W/2 + Math.cos(rad)*r2, sigCY + Math.sin(rad)*r2);
      ctx.stroke();
    }
    ctx.strokeStyle = `rgba(${T.acR},0.14)`; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(W/2, sigCY, sigR + 20, 0, Math.PI*2); ctx.stroke();

    if (isPremium) {
      ctx.strokeStyle = GOLD + '55'; ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 6]);
      ctx.beginPath(); ctx.arc(W/2, sigCY, sigR + 25, 0, Math.PI*2); ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.shadowColor = `rgba(${T.acR},0.32)`; ctx.shadowBlur = 40; ctx.shadowOffsetY = 8;
    ctx.fillStyle = T.adk;
    ctx.beginPath(); ctx.arc(W/2, sigCY, sigR, 0, Math.PI*2); ctx.fill();
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

    const sigGrad = ctx.createRadialGradient(W/2-22, sigCY-22, 0, W/2, sigCY, sigR);
    sigGrad.addColorStop(0, T.hi); sigGrad.addColorStop(0.5, T.ac); sigGrad.addColorStop(1, T.adk);
    ctx.fillStyle = sigGrad;
    ctx.beginPath(); ctx.arc(W/2, sigCY, sigR, 0, Math.PI*2); ctx.fill();

    const hlGO = ctx.createRadialGradient(W/2-22, sigCY-22, 0, W/2-22, sigCY-22, 50);
    hlGO.addColorStop(0, 'rgba(255,255,255,0.32)'); hlGO.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = hlGO;
    ctx.beginPath(); ctx.arc(W/2, sigCY, sigR, 0, Math.PI*2); ctx.fill();

    ctx.strokeStyle = isPremium ? GOLD_LT + '80' : 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(W/2, sigCY, sigR - 1, 0, Math.PI*2); ctx.stroke();

    ctx.font = `900 42px ${FONT}`; ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0,0,0,0.28)'; ctx.shadowBlur = 10;
    ctx.fillText(T.label, W/2, sigCY + 16);
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
    ctx.fillStyle = `rgba(${T.acR},0.45)`; ctx.font = `500 11px ${FONT}`;
    ctx.fillText('\u64cd  \u4f5c  \u5efa  \u8bae', W/2, sigCY + sigR + 38);
    fy = sigCY + sigR + 58;

    /* ── Confidence bar */
    if (confidence != null) {
      const cbLabelTxt = 'AI \u7f6e\u4fe1\u5ea6';
      ctx.font = `400 11px ${FONT}`;
      const cbLabelW = ctx.measureText(cbLabelTxt).width + 10;
      ctx.font = `700 12px ${FONT}`;
      const pctTxt = `${confidence}%`;
      const pctW = ctx.measureText(pctTxt).width + 12;
      const cbx = 22 + cbLabelW, cbw = W - 22 - cbLabelW - pctW - 4, cbh = 7, cby = fy + 8;
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
      const pColW = Math.floor(W / 3), pCardH = 62;
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
    const rowXL = 14, rowW = W - 28;
    const textStartX = rowXL + 18;
    const textMaxW = rowW - 18 - 14;
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
      ctx.beginPath(); ctx.roundRect(rowXL, ry, rowW, rH, 12); ctx.fill();
      ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
      ctx.strokeStyle = `rgba(${sr},0.20)`; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.roundRect(rowXL, ry, rowW, rH, 12); ctx.stroke();

      if (isPremium) {
        const bSz = 9;
        ctx.strokeStyle = GOLD + '75'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(rowXL+5, ry+5+bSz); ctx.lineTo(rowXL+5, ry+5); ctx.lineTo(rowXL+5+bSz, ry+5); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(rowXL+rowW-5-bSz, ry+rH-5); ctx.lineTo(rowXL+rowW-5, ry+rH-5); ctx.lineTo(rowXL+rowW-5, ry+rH-5-bSz); ctx.stroke();
      }

      const hbg = ctx.createLinearGradient(rowXL, 0, rowXL + rowW, 0);
      if (isPremium) {
        hbg.addColorStop(0, GOLD_DK + '30'); hbg.addColorStop(0.55, GOLD_LT + '15'); hbg.addColorStop(1, 'rgba(0,0,0,0)');
      } else {
        hbg.addColorStop(0, `rgba(${sr},0.17)`); hbg.addColorStop(0.55, `rgba(${sr},0.07)`); hbg.addColorStop(1, 'rgba(255,255,255,0)');
      }
      ctx.fillStyle = hbg;
      ctx.beginPath(); ctx.roundRect(rowXL, ry, rowW, HEADER_H, [12, 12, 0, 0]); ctx.fill();

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
      const tagX = rowXL + rowW - 10 - tagW;
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
      ctx.beginPath(); ctx.moveTo(rowXL+10, ry+HEADER_H); ctx.lineTo(rowXL+rowW-10, ry+HEADER_H); ctx.stroke();

      const contentH = rH - HEADER_H;
      const textBlockH = lines.length * LINE_H;
      const textTopOff = Math.max(8, Math.floor((contentH - textBlockH) / 2));
      ctx.font = TF; ctx.fillStyle = 'rgba(0,0,0,0.80)'; ctx.textAlign = 'left';
      lines.forEach((ln: string, li: number) => ctx.fillText(ln, textStartX, ry + HEADER_H + textTopOff + 13 + li * LINE_H));

      ctx.save();
      ctx.globalAlpha = isPremium ? 0.06 : 0.04;
      ctx.font = `900 30px ${FONT}`; ctx.textAlign = 'right';
      ctx.fillStyle = isPremium ? GOLD_DK : `rgba(${sr},1)`;
      ctx.fillText('AI', rowXL + rowW - 12, ry + rH - 6);
      ctx.restore();

      if (idx < 3) {
        const dotY = ry + rH + ROW_GAP / 2;
        const dotCols = isPremium
          ? [GOLD+'55', GOLD+'aa', GOLD+'ee', GOLD+'aa', GOLD+'55']
          : [`rgba(${sr},0.18)`, `rgba(${sr},0.38)`, `rgba(${sr},0.58)`, `rgba(${sr},0.38)`, `rgba(${sr},0.18)`];
        dotCols.forEach((dc: string, di: number) => {
          ctx.fillStyle = dc;
          ctx.beginPath(); ctx.arc(W/2 + (di-2)*8, dotY, 1.5, 0, Math.PI*2); ctx.fill();
        });
      }

      ry += rH + ROW_GAP;
    });

    /* ── Footer */
    const fpg = ctx.createLinearGradient(0, FY, 0, CARD_H);
    fpg.addColorStop(0, 'rgba(255,255,255,0)'); fpg.addColorStop(1, `rgba(${T.acR},0.05)`);
    ctx.fillStyle = fpg; ctx.fillRect(0, FY, W, CARD_H - FY);

    ctx.strokeStyle = `rgba(${T.acR},0.18)`; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(20, FY+2); ctx.lineTo(W-20, FY+2); ctx.stroke();

    ctx.textAlign = 'left'; ctx.fillStyle = `rgba(${T.acR},0.35)`;
    ctx.font = `400 10px ${FONT}`;
    ctx.fillText('\u672c\u5361\u7247\u7531AI\u751f\u6210\uff0c\u4ec5\u4f9b\u53c2\u8003\uff0c\u4e0d\u6784\u6210\u6295\u8d44\u5efa\u8bae', 20, FY + 26);

    const appNameTxt = `\u300c ${appName} \u300d`;
    ctx.font = `700 14px ${FONT}`;
    const appNameW = ctx.measureText(appNameTxt).width;
    const tierLabel = isPremium ? '\u25c8 \u4e13\u4e1a\u7248' : '\u25ce \u6807\u51c6\u7248';
    ctx.font = `600 9px ${FONT}`;
    const tlW = ctx.measureText(tierLabel).width + 14;
    const tbX = W - 20 - appNameW - 10 - tlW;
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
      const ng = ctx.createLinearGradient(W-20-appNameW, 0, W-20, 0);
      ng.addColorStop(0, GOLD_DK); ng.addColorStop(1, GOLD_LT);
      ctx.fillStyle = ng; ctx.shadowColor = GOLD; ctx.shadowBlur = 10;
    } else {
      ctx.fillStyle = T.ac; ctx.shadowColor = `rgba(${T.acR},0.28)`; ctx.shadowBlur = 8;
    }
    ctx.font = `700 14px ${FONT}`;
    ctx.fillText(appNameTxt, W-20, FY+22);
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
    ctx.font = `400 9px ${FONT}`; ctx.fillStyle = `rgba(${T.acR},0.42)`;
    ctx.fillText('AI \u667a\u80fd\u7814\u5224  \u00b7  \u4e13\u4e1a\u6295\u8d44\u5206\u6790', W-20, FY+35);

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

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ═══════════════════════════════════════════════════════════════
// Viral Social Share Card — Compliance-safe, emotion-first,
// brand-prominent. No price targets, no specific signals.
// Designed for 小红书 / 微信 virality + 拉新.
// ═══════════════════════════════════════════════════════════════
export interface ViralShareCardParams {
  result: any;
  tier: string;
  analyzedAt?: string | null;
  appName: string;
}

/** Richer params for the prediction certificate card */
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
}

export async function generateViralShareCardBlob(p: ViralShareCardParams): Promise<{ blob: Blob; filename: string }> {
  const { result, tier, appName } = p;

  const action = result?.result?.action;
  const isBuy  = action === 'buy';
  const isSell = action === 'sell';

  const stockName = result?.data?.name || result?.data?.symbol || '';
  const stockCode = result?.data?.symbol || '';
  const confidence: number | null = result?.result?.confidence ?? null;

  // Compliance-safe wording
  const actionWord   = isBuy ? '看好' : isSell ? '看空' : '观望';
  const actionSub    = isBuy ? '技术面呈现上行信号' : isSell ? '技术面呈现下行压力' : '等待更明确的方向';
  const actionEn     = isBuy ? 'BULLISH' : isSell ? 'BEARISH' : 'NEUTRAL';

  // Color palette — R6: deep dark with vivid accent
  const bgColor  = isBuy ? '#0a0007' : isSell ? '#00080a' : '#06050a';
  const accent   = isBuy ? '#ff453a' : isSell ? '#30d158' : '#ffd60a';
  const accentDim = isBuy ? '#ff453a33' : isSell ? '#30d15833' : '#ffd60a33';

  const W = 600, H = 900;
  const canvas = document.createElement('canvas');
  const dpr = 2;
  canvas.width = W * dpr; canvas.height = H * dpr;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);

  const FONT  = '"PingFang SC","Microsoft YaHei","Helvetica Neue",sans-serif';
  const MONO  = '"SF Mono","Courier New",monospace';

  // ── R6: MEGA TYPOGRAPHY ──────────────────────────────────────
  // Concept: the verdict word IS the design. 140px. Left-aligned editorial.

  // Background
  ctx.fillStyle = bgColor; ctx.fillRect(0, 0, W, H);

  // Subtle vertical noise lines (depth texture)
  ctx.globalAlpha = 0.03;
  for (let x = 0; x < W; x += 4) {
    ctx.fillStyle = x % 8 === 0 ? '#ffffff' : accent;
    ctx.fillRect(x, 0, 1, H);
  }
  ctx.globalAlpha = 1;

  // Left-side accent bar
  const barGrad = ctx.createLinearGradient(0, 0, 0, H);
  barGrad.addColorStop(0, accent);
  barGrad.addColorStop(0.5, accent + 'cc');
  barGrad.addColorStop(1, accent + '22');
  ctx.fillStyle = barGrad; ctx.fillRect(0, 0, 5, H);

  // Top confidence bar (thin, full-width, shows confidence level)
  const confWidth = confidence != null ? W * (Math.max(confidence, 20) / 100) : W * 0.5;
  const confGrad = ctx.createLinearGradient(0, 0, confWidth, 0);
  confGrad.addColorStop(0, accent);
  confGrad.addColorStop(1, accent + '44');
  ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(0, 0, W, 3);
  ctx.fillStyle = confGrad; ctx.fillRect(0, 0, confWidth, 3);

  // Brand — top left (small, elegant)
  ctx.font = `500 11px ${FONT}`; ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.fillText(`${appName}  ✦  AI研判`, 24, 36);

  // Date — top right
  const dateStr = p.analyzedAt
    ? new Date(p.analyzedAt).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })
    : new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
  ctx.font = `400 11px ${MONO}`; ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.fillText(dateStr, W - 24, 36);

  // ── HERO SECTION: Verdict word ────────────────────────────────
  // Big English label (decorative, editorial) — very faint
  ctx.font = `900 180px ${FONT}`; ctx.textAlign = 'left';
  ctx.fillStyle = accent + '08';
  ctx.fillText(actionEn, 14, 280);

  // THE verdict word in Chinese — huge, left-aligned
  ctx.font = `900 138px ${FONT}`; ctx.textAlign = 'left';
  ctx.shadowColor = accent; ctx.shadowBlur = 40; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
  ctx.fillStyle = accent;
  ctx.fillText(actionWord, 24, 270);
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;

  // ── Stock name row ────────────────────────────────────────────
  let y = 320;

  // Thin separator line
  ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.moveTo(24, y); ctx.lineTo(W - 24, y); ctx.stroke();
  y += 28;

  ctx.font = `700 38px ${FONT}`; ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(stockName, 24, y);

  if (stockCode && stockCode !== stockName) {
    ctx.font = `500 14px ${MONO}`; ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillText(stockCode, W - 24, y);
  }
  y += 48;

  // Sub-verdict text
  ctx.font = `300 18px ${FONT}`; ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fillText(actionSub, 24, y);
  y += 52;

  // ── Stats row (left-aligned, clean) ───────────────────────────
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 0.5;
  ctx.beginPath(); ctx.moveTo(24, y); ctx.lineTo(W - 24, y); ctx.stroke();
  y += 28;

  const stats = [
    { label: '置信强度', value: confidence != null ? (confidence >= 80 ? '极强' : confidence >= 65 ? '较强' : confidence >= 45 ? '中等' : '偏弱') : '—' },
    { label: '研判类型', value: 'AI深度' },
    { label: '研判时间', value: p.analyzedAt ? new Date(p.analyzedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) },
  ];

  const statW = (W - 48) / stats.length;
  stats.forEach((s, i) => {
    const sx = 24 + i * statW;
    if (i > 0) {
      ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(sx, y - 6); ctx.lineTo(sx, y + 50); ctx.stroke();
    }
    ctx.font = `400 10px ${FONT}`; ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fillText(s.label, sx + (i === 0 ? 0 : 14), y + 12);
    ctx.font = `700 18px ${FONT}`;
    ctx.fillStyle = i === 0 ? accent : '#ffffff';
    ctx.fillText(s.value, sx + (i === 0 ? 0 : 14), y + 38);
  });
  y += 66;

  // ── CTA section ───────────────────────────────────────────────
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 0.5;
  ctx.beginPath(); ctx.moveTo(24, y); ctx.lineTo(W - 24, y); ctx.stroke();
  y += 32;

  // CTA text left
  ctx.font = `700 15px ${FONT}`; ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  ctx.fillText('AI 投资研判 — 免费体验', 24, y);
  y += 20;
  ctx.font = `400 12px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillText('扫码获取每日研判 · 专业 · 深度 · 实时', 24, y);

  // QR code right
  const qrS = 80, qrX2 = W - 24 - qrS, qrY2 = y - 42;
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.beginPath(); ctx.roundRect(qrX2, qrY2, qrS, qrS, 6); ctx.fill();
  ctx.fillStyle = bgColor + 'ee';
  ctx.beginPath(); ctx.roundRect(qrX2 + 4, qrY2 + 4, qrS - 8, qrS - 8, 4); ctx.fill();
  ctx.fillStyle = accent;
  const qrGrid = [[1,1,1,0,1,1,1],[1,0,1,0,1,0,1],[1,1,1,0,1,1,1],[0,0,0,1,0,0,0],[1,1,1,0,1,1,1],[1,0,1,0,1,0,1],[1,1,1,0,1,1,1]];
  const qrCell = (qrS - 16) / 7;
  qrGrid.forEach((row, ri) => row.forEach((cell, ci) => {
    if (cell) { ctx.beginPath(); ctx.roundRect(qrX2 + 8 + ci * qrCell, qrY2 + 8 + ri * qrCell, qrCell - 1, qrCell - 1, 1); ctx.fill(); }
  }));

  y += 56;

  // ── Disclaimer ────────────────────────────────────────────────
  ctx.font = `400 10px ${FONT}`; ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.fillText('本内容仅为技术分析参考，不构成投资建议  ·  市场有风险，投资需谨慎', 24, y);

  const tierBadge = tier === 'premium' ? '◈ 专业版' : tier === 'basic' ? '◉ 标准版' : '◎ 体验版';
  ctx.font = `500 10px ${FONT}`; ctx.textAlign = 'right';
  ctx.fillStyle = accent + '88';
  ctx.fillText(tierBadge, W - 24, y);

  return new Promise<{ blob: Blob; filename: string }>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) { reject(new Error('canvas.toBlob failed')); return; }
      resolve({ blob, filename: `${stockCode || stockName}_洞见卡片.png` });
    }, 'image/png');
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 研判凭证卡 — "Prediction Certificate"
// Design philosophy: timestamp-sealed prediction record.
// Hero number = implied return %.  Secondary: confidence, R:R, grade.
// Shareable BEFORE price moves → verified AFTER. That's the brag-worthy moment.
// ─────────────────────────────────────────────────────────────────────────────

function drawQR(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, fgColor: string, bgFill: string) {
  const grid = [[1,1,1,0,1,1,1],[1,0,1,0,1,0,1],[1,1,1,0,1,1,1],[0,0,0,1,0,0,0],[1,1,1,0,1,1,1],[1,0,1,0,1,0,1],[1,1,1,0,1,1,1]];
  const cell = (size - 12) / 7;
  ctx.fillStyle = bgFill; ctx.beginPath(); ctx.roundRect(x, y, size, size, 5); ctx.fill();
  ctx.fillStyle = fgColor;
  grid.forEach((row, ri) => row.forEach((c, ci) => {
    if (c) { ctx.beginPath(); ctx.roundRect(x + 6 + ci * cell, y + 6 + ri * cell, cell - 0.8, cell - 0.8, 1); ctx.fill(); }
  }));
}

function fmtPrice(price: number | null, market: string): string {
  if (price == null) return '—';
  const isCN = market === 'a' || market === 'futures';
  return isCN ? `¥${price.toFixed(2)}` : `$${price.toFixed(2)}`;
}


// ─────────────────────────────────────────────────────────────────────────────
// R11: 研判凭证 — "Signal Card" design
// Philosophy: Jobs-level clarity. Light bg (readable anywhere). Strategy color
// dominates the hero zone. One giant number = the hook. Real QR. Viral CTA.
// 1080×1440 (3:4) — native 小红书 / 微信 dimensions.
// ─────────────────────────────────────────────────────────────────────────────
export async function generatePredictionCardBlob(p: PredictionCardParams): Promise<{ blob: Blob; filename: string }> {
  const { stockName, stockCode, market, action, latestPrice, targetPrice, stopLoss,
    opportunityGrade, reasonExcerpt, analyzedAt, tier, appName, appBaseUrl } = p;

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
  const heroStr    = heroValue != null ? `${heroSign}${heroValue.toFixed(1)}%` : '—';

  // ── Color palette: strategy-driven, Chinese convention ────────
  // Red = 看好(buy/up), Green = 看空(sell/down), Amber = 观望(hold)
  const heroColor  = isBuy ? '#FF3B30' : isSell ? '#34C759' : '#FF9F0A';
  const heroDark   = isBuy ? '#8B0000' : isSell ? '#0A4520' : '#7A4A00'; void heroDark;
  const accentText = heroColor;
  const actionCN   = isBuy ? '看好' : isSell ? '看空' : '观望';

  // ── Canvas ────────────────────────────────────────────────────
  const W = 1080, H = 1440;
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

  // Smooth fade into white zone at bottom of hero
  const heroFade = ctx.createLinearGradient(0, HERO_H - 90, 0, HERO_H);
  heroFade.addColorStop(0, 'rgba(250,250,250,0)');
  heroFade.addColorStop(1, '#FAFAFA');
  ctx.fillStyle = heroFade;
  ctx.fillRect(0, HERO_H - 90, W, 90);

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
  const heroFontSize = heroStr.length > 7 ? 118 : heroStr.length > 5 ? 136 : 152;
  ctx.font = `800 ${heroFontSize}px ${F}`; ctx.textAlign = 'center'; ctx.fillStyle = '#FFFFFF';
  ctx.fillText(heroStr, W / 2, 440);
  ctx.shadowBlur = 0; ctx.shadowColor = 'transparent'; ctx.shadowOffsetY = 0;

  // Hero label
  ctx.font = `500 24px ${F}`; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,0.72)';
  ctx.fillText(heroLabel, W / 2, 490);

  // Sub-note: R:R or action context
  const rrNote = rr != null
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

  // ── STATS: 3 white cards ──────────────────────────────────────
  const statColW = Math.floor((W - PAD * 2 - 24) / 3);
  const statH = 100;
  const priceLabel = (m: string) => (m === 'us' ? '$' : '¥');
  const fmt = (v: number | null) => v != null ? `${priceLabel(market)}${v.toFixed(2)}` : '—';
  const statItems: { label: string; value: string; sub?: string; color: string }[] = [
    { label: '研判时价', value: fmt(latestPrice),  color: '#1C1C1E' },
    { label: '目标估价', value: fmt(targetPrice),  color: accentText },
    { label: '止损参考', value: fmt(stopLoss), sub: maxLoss != null ? `${maxLoss.toFixed(1)}%` : undefined, color: '#FF9F0A' },
  ];

  statItems.forEach((item, i) => {
    const sx = PAD + i * (statColW + 12);
    ctx.fillStyle = '#FFFFFF';
    ctx.shadowColor = 'rgba(0,0,0,0.07)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 5;
    ctx.beginPath(); ctx.roundRect(sx, y, statColW, statH, 14); ctx.fill();
    ctx.shadowBlur = 0; ctx.shadowColor = 'transparent'; ctx.shadowOffsetY = 0;

    ctx.font = `400 17px ${F}`; ctx.textAlign = 'left'; ctx.fillStyle = '#8E8E93';
    ctx.fillText(item.label, sx + 20, y + 30);

    ctx.font = `700 27px ${M}`; ctx.fillStyle = item.color;
    ctx.fillText(item.value, sx + 20, y + 66);

    if (item.sub) {
      ctx.font = `400 15px ${F}`; ctx.fillStyle = '#FF9F0Acc';
      const vw = ctx.measureText(item.value).width;
      ctx.fillText(item.sub, sx + 20, y + 86);
      void vw; // suppress unused warning
    }
  });
  y += statH + 28;

  // ── DIVIDER ───────────────────────────────────────────────────
  ctx.strokeStyle = '#E5E5EA'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(PAD, y); ctx.lineTo(W - PAD, y); ctx.stroke();
  y += 30;

  // ── INSIGHT EXCERPT ───────────────────────────────────────────
  if (reasonExcerpt && reasonExcerpt.length > 0) {
    ctx.font = `400 22px ${F}`; ctx.fillStyle = '#3A3A3C'; ctx.textAlign = 'left';
    const maxLineW = W - PAD * 2;
    let line = '';
    let linesDrawn = 0;
    for (const ch of reasonExcerpt) {
      const test = line + ch;
      if (ctx.measureText(test).width > maxLineW && linesDrawn < 1) {
        ctx.fillText(line, PAD, y + 24); y += 32; line = ch; linesDrawn++;
      } else { line = test; }
    }
    if (line) { ctx.fillText(line, PAD, y + 24); y += 32; }
    y += 24;
  } else { y += 10; }

  // ── DIVIDER ───────────────────────────────────────────────────
  ctx.strokeStyle = '#E5E5EA'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(PAD, y); ctx.lineTo(W - PAD, y); ctx.stroke();
  y += 30;

  // ── TIMESTAMP SEAL ────────────────────────────────────────────
  const sealH = 90;
  ctx.fillStyle = '#FFFFFF';
  ctx.shadowColor = 'rgba(0,0,0,0.07)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 5;
  ctx.beginPath(); ctx.roundRect(PAD, y, W - PAD * 2, sealH, 14); ctx.fill();
  ctx.shadowBlur = 0; ctx.shadowColor = 'transparent'; ctx.shadowOffsetY = 0;
  // Left accent stripe
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

  // ── QR CODE + CTA — anchored to bottom ────────────────────────
  // Fixed position in the lower third; content above creates natural breathing room
  const qrSize = 168;
  const qrStartY = H - 346;   // locks QR section to bottom regardless of content height
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
  ctx.font = `400 14px ${F}`; ctx.textAlign = 'center'; ctx.fillStyle = '#C7C7CC';
  ctx.fillText('本内容仅供技术分析参考，不构成投资建议 · 投资有风险，入市须谨慎', W / 2, H - 24);

  // Bottom accent bar
  ctx.fillStyle = heroColor;
  ctx.fillRect(0, H - 6, W, 6);

  return new Promise<{ blob: Blob; filename: string }>((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob) { reject(new Error('canvas.toBlob failed')); return; }
      resolve({ blob, filename: `${stockCode || stockName}_研判凭证.png` });
    }, 'image/png');
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Iteration 2: Statement Card — social-first minimalist
// 600×900, white bg, enormous action block, 80% whitespace
// ─────────────────────────────────────────────────────────────────────────────
export async function generateStatementCardBlob(p: PredictionCardParams): Promise<{ blob: Blob; filename: string }> {
  const { stockName, stockCode, market, action, confidence, latestPrice, targetPrice, stopLoss,
    opportunityGrade, reasonExcerpt, analyzedAt, tier, appName } = p;

  const isBuy  = action === 'buy';
  const isSell = action === 'sell';
  const isMasked = tier === 'free';

  const accent     = isBuy ? '#EF4444' : isSell ? '#22C55E' : '#60A5FA';
  const accentDark = isBuy ? '#B91C1C' : isSell ? '#15803D' : '#1D4ED8';
  const actionCN   = isBuy ? '买入' : isSell ? '卖出' : '观望';

  const ar = parseInt(accent.slice(1, 3), 16);
  const ag = parseInt(accent.slice(3, 5), 16);
  const ab = parseInt(accent.slice(5, 7), 16);

  const impliedReturn: number | null =
    targetPrice != null && latestPrice != null && latestPrice > 0
      ? ((targetPrice - latestPrice) / latestPrice) * 100 : null;

  const fmtP = (price: number | null) => {
    if (price == null) return '—';
    const isCN = market === 'a' || market === 'futures';
    return isCN ? `¥${price.toFixed(2)}` : `$${price.toFixed(2)}`;
  };

  const W = 600, H = 900;
  // Split point: white zone above, accent zone below
  const SPLIT = 530;

  const canvas = document.createElement('canvas');
  const dpr = 2;
  canvas.width = W * dpr; canvas.height = H * dpr;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);

  const F = '"PingFang SC","Microsoft YaHei","Helvetica Neue",sans-serif';

  // ── BACKGROUNDS ───────────────────────────────────────────────
  // White zone
  ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, W, SPLIT);
  // Accent zone (deep version)
  const bgGrad = ctx.createLinearGradient(0, SPLIT, 0, H);
  bgGrad.addColorStop(0, accentDark);
  bgGrad.addColorStop(1, `rgb(${Math.max(0, ar-40)},${Math.max(0, ag-40)},${Math.max(0, ab-40)})`);
  ctx.fillStyle = bgGrad; ctx.fillRect(0, SPLIT, W, H - SPLIT);

  // Dot grid on white zone only
  ctx.globalAlpha = 0.04;
  for (let gx = 20; gx < W; gx += 28) {
    for (let gy = 20; gy < SPLIT; gy += 28) {
      ctx.fillStyle = accent;
      ctx.beginPath(); ctx.arc(gx, gy, 1.3, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.globalAlpha = 1;

  // Subtle dot grid on accent zone (white dots)
  ctx.globalAlpha = 0.06;
  for (let gx = 20; gx < W; gx += 28) {
    for (let gy = SPLIT + 14; gy < H; gy += 28) {
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath(); ctx.arc(gx, gy, 1.3, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.globalAlpha = 1;

  // ── TOP GRADIENT STRIP ────────────────────────────────────────
  const topGrad = ctx.createLinearGradient(0, 0, W, 0);
  topGrad.addColorStop(0, accentDark);
  topGrad.addColorStop(0.6, accent);
  topGrad.addColorStop(1, `rgba(${ar},${ag},${ab},0.4)`);
  ctx.fillStyle = topGrad; ctx.fillRect(0, 0, W, 5);

  let y = 28;

  // ── STOCK CODE PILL (top left) ────────────────────────────────
  ctx.font = `600 13px ${F}`;
  const pillW = ctx.measureText(stockCode).width + 24;
  ctx.fillStyle = `rgba(${ar},${ag},${ab},0.1)`;
  ctx.beginPath(); ctx.roundRect(28, y, pillW, 26, 13); ctx.fill();
  ctx.strokeStyle = `rgba(${ar},${ag},${ab},0.3)`; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.roundRect(28, y, pillW, 26, 13); ctx.stroke();
  ctx.fillStyle = accent; ctx.textAlign = 'left';
  ctx.fillText(stockCode, 40, y + 17);

  // Tier label top right
  const tierLabel = tier === 'premium' ? '专业版' : tier === 'basic' ? '标准版' : '免费版';
  ctx.font = `500 11px ${F}`; ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillText(tierLabel, W - 28, y + 17);
  y += 48;

  // ── STOCK NAME ────────────────────────────────────────────────
  ctx.font = `800 44px ${F}`; ctx.textAlign = 'left'; ctx.fillStyle = accent;
  ctx.fillText(stockName.length > 8 ? stockName.slice(0, 8) + '…' : stockName, 28, y + 42);
  y += 56;

  // ── ACTION BLOCK ──────────────────────────────────────────────
  const blockH = 152;
  const blockGrad = ctx.createLinearGradient(28, y, W - 28, y + blockH);
  blockGrad.addColorStop(0, accent); blockGrad.addColorStop(1, accentDark);
  ctx.fillStyle = blockGrad;
  ctx.beginPath(); ctx.roundRect(28, y, W - 56, blockH, 18); ctx.fill();
  // Highlight
  const hi = ctx.createRadialGradient(120, y + 32, 0, 120, y + 32, 160);
  hi.addColorStop(0, 'rgba(255,255,255,0.22)'); hi.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = hi;
  ctx.beginPath(); ctx.roundRect(28, y, W - 56, blockH, 18); ctx.fill();
  ctx.font = `900 116px ${F}`; ctx.textAlign = 'center'; ctx.fillStyle = '#FFFFFF';
  ctx.shadowColor = 'rgba(0,0,0,0.2)'; ctx.shadowBlur = 16;
  ctx.fillText(actionCN, W / 2, y + blockH - 24);
  ctx.shadowBlur = 0;
  y += blockH + 24;

  // ── CONFIDENCE BAR ────────────────────────────────────────────
  if (confidence != null) {
    ctx.fillStyle = 'rgba(0,0,0,0.07)';
    ctx.beginPath(); ctx.roundRect(28, y, W - 56, 8, 4); ctx.fill();
    const filled = Math.round((W - 56) * confidence / 100);
    const barGrad = ctx.createLinearGradient(28, 0, W - 28, 0);
    barGrad.addColorStop(0, accentDark); barGrad.addColorStop(1, accent);
    ctx.fillStyle = barGrad;
    ctx.beginPath(); ctx.roundRect(28, y, filled, 8, 4); ctx.fill();
    ctx.fillStyle = accent;
    ctx.beginPath(); ctx.arc(28 + filled, y + 4, 5.5, 0, Math.PI * 2); ctx.fill();
    ctx.font = `500 11px ${F}`; ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillText('AI 置信度', 28, y + 22);
    ctx.font = `700 13px ${F}`; ctx.textAlign = 'right'; ctx.fillStyle = accent;
    ctx.fillText(`${confidence}%`, W - 28, y + 22);
    y += 40;
  }

  // ── DASHED DIVIDER ────────────────────────────────────────────
  ctx.save(); ctx.setLineDash([4, 6]);
  ctx.strokeStyle = 'rgba(0,0,0,0.08)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(28, y); ctx.lineTo(W - 28, y); ctx.stroke();
  ctx.restore(); y += 20;

  // ── PRICE ROW ────────────────────────────────────────────────
  const priceItems = [
    { label: '最新价', val: fmtP(latestPrice), color: '#1C1C1E', locked: false },
    { label: '目标价', val: isMasked ? '——' : fmtP(targetPrice), color: isMasked ? '#C7C7CC' : accent, locked: isMasked },
    { label: '止损价', val: isMasked ? '——' : fmtP(stopLoss), color: isMasked ? '#C7C7CC' : `rgba(${ar},${ag},${ab},0.65)`, locked: isMasked },
  ];
  const colW2 = Math.floor((W - 56) / 3);
  priceItems.forEach((item, i) => {
    const cx = 28 + colW2 * i + colW2 / 2;
    ctx.font = `400 11px ${F}`; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillText(item.label, cx, y + 14);
    ctx.font = item.locked ? `600 16px ${F}` : `700 19px ${F}`;
    ctx.fillStyle = item.color;
    ctx.fillText(item.val, cx, y + 36);
  });
  y += 54;

  // ── REASON (1 line, larger) ───────────────────────────────────
  if (reasonExcerpt) {
    const maxW3 = W - 56;
    ctx.font = `400 15px ${F}`; ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(0,0,0,0.5)';
    let txt = reasonExcerpt;
    if (ctx.measureText(txt).width > maxW3) {
      while (txt.length > 0 && ctx.measureText(txt + '…').width > maxW3) txt = txt.slice(0, -1);
      txt += '…';
    }
    ctx.fillText(txt, 28, y + 16);
    y += 36;
  }

  // ── OPPORTUNITY GRADE pill (if available) ─────────────────────
  if (opportunityGrade) {
    const gradeColors: Record<string, string> = { A: '#7C3AED', B: '#0369A1', C: '#92400E', D: '#6B7280' };
    const gc = gradeColors[opportunityGrade.toUpperCase()] || accent;
    const gradeLabel = `${opportunityGrade.toUpperCase()} 级机会`;
    ctx.font = `700 13px ${F}`;
    const gw = ctx.measureText(gradeLabel).width + 28;
    ctx.fillStyle = gc + '14';
    ctx.beginPath(); ctx.roundRect(28, y, gw, 28, 14); ctx.fill();
    ctx.strokeStyle = gc + '44'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(28, y, gw, 28, 14); ctx.stroke();
    ctx.fillStyle = gc; ctx.textAlign = 'left';
    ctx.fillText(gradeLabel, 28 + 14, y + 18);
    y += 42;
  }

  void y; // mark used

  // ═══ ACCENT ZONE (bottom half) ═══════════════════════════════
  // Wavy separator edge
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(0, SPLIT);
  for (let wx = 0; wx <= W; wx += 40) {
    ctx.quadraticCurveTo(wx + 20, SPLIT - 10, wx + 40, SPLIT);
  }
  ctx.lineTo(W, SPLIT + 20); ctx.lineTo(0, SPLIT + 20);
  ctx.closePath();
  ctx.fillStyle = accentDark; ctx.fill();
  ctx.restore();

  // ── MAIN STAT (implied return or confidence) ──────────────────
  const statY = SPLIT + 50;
  if (impliedReturn != null && !isMasked) {
    const sign = impliedReturn > 0 ? '+' : '';
    const statStr = `${sign}${impliedReturn.toFixed(1)}%`;
    ctx.font = `900 80px ${F}`; ctx.textAlign = 'center';
    ctx.fillStyle = '#FFFFFF';
    ctx.shadowColor = 'rgba(0,0,0,0.25)'; ctx.shadowBlur = 20;
    ctx.fillText(statStr, W / 2, statY + 72);
    ctx.shadowBlur = 0;
    ctx.font = `500 14px ${F}`; ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.textAlign = 'center';
    ctx.fillText('预期潜在收益空间', W / 2, statY + 100);
  } else if (confidence != null) {
    ctx.font = `900 80px ${F}`; ctx.textAlign = 'center';
    ctx.fillStyle = '#FFFFFF';
    ctx.shadowColor = 'rgba(0,0,0,0.25)'; ctx.shadowBlur = 20;
    ctx.fillText(`${confidence}%`, W / 2, statY + 72);
    ctx.shadowBlur = 0;
    ctx.font = `500 14px ${F}`; ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.textAlign = 'center';
    ctx.fillText('AI 研判置信度', W / 2, statY + 100);
  } else if (opportunityGrade) {
    const gradeColors: Record<string,string> = { A: '#F5D770', B: '#93C5FD', C: '#FCD34D', D: '#D1D5DB' };
    const gc = gradeColors[opportunityGrade] || '#F5D770';
    ctx.font = `900 80px ${F}`; ctx.textAlign = 'center'; ctx.fillStyle = gc;
    ctx.shadowColor = 'rgba(0,0,0,0.25)'; ctx.shadowBlur = 20;
    ctx.fillText(opportunityGrade + ' 级', W / 2, statY + 72);
    ctx.shadowBlur = 0;
    ctx.font = `500 14px ${F}`; ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillText('AI 机会评级', W / 2, statY + 100);
  }

  // ── VIRAL HOOK ────────────────────────────────────────────────
  const hookY = statY + 138;
  const hookLine1 = isBuy ? '我已看好这只股票' : isSell ? '我已判断这只股票承压' : '我正在观察这只股票';
  const hookLine2 = '你的判断呢？';
  ctx.font = `600 18px ${F}`; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,0.88)';
  ctx.fillText(hookLine1, W / 2, hookY);
  ctx.font = `800 22px ${F}`; ctx.fillStyle = '#FFFFFF';
  ctx.fillText(hookLine2, W / 2, hookY + 32);

  // ── APP BRANDING ──────────────────────────────────────────────
  const brandY = hookY + 72;
  // Divider
  const divG = ctx.createLinearGradient(0, 0, W, 0);
  divG.addColorStop(0, 'transparent'); divG.addColorStop(0.3, 'rgba(255,255,255,0.2)');
  divG.addColorStop(0.7, 'rgba(255,255,255,0.2)'); divG.addColorStop(1, 'transparent');
  ctx.strokeStyle = divG; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, brandY - 14); ctx.lineTo(W, brandY - 14); ctx.stroke();

  ctx.font = `700 15px ${F}`; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fillText(appName, W / 2, brandY + 2);

  const dateStamp = new Date(analyzedAt).toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });
  ctx.font = `400 11px ${F}`; ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.fillText(dateStamp, W / 2, brandY + 22);

  // ── DISCLAIMER ────────────────────────────────────────────────
  ctx.font = `400 10px ${F}`; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.fillText('AI 生成 · 仅供技术分析参考 · 不构成投资建议 · 投资有风险，入市须谨慎', W / 2, H - 18);

  // Bottom accent strip
  ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(0, H - 4, W, 4);

  return new Promise<{ blob: Blob; filename: string }>((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob) { reject(new Error('canvas.toBlob failed')); return; }
      resolve({ blob, filename: `${stockCode || stockName}_研判.png` });
    }, 'image/png');
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Iteration 3: Badge Card — grade achievement / honor badge
// 600×900, dark #0d0d14, hexagon grade badge, gamified
// ─────────────────────────────────────────────────────────────────────────────
export async function generateBadgeCardBlob(p: PredictionCardParams): Promise<{ blob: Blob; filename: string }> {
  const { stockName, stockCode, market, action, confidence, latestPrice, targetPrice, stopLoss,
    opportunityGrade, analyzedAt, tier, appName } = p;

  const isBuy  = action === 'buy';
  const isSell = action === 'sell';
  const isMasked = tier === 'free';
  const grade = (opportunityGrade || 'C').toUpperCase().slice(0, 1);

  const gradeStyles: Record<string, { bg1: string; bg2: string; glow: string; text: string }> = {
    A: { bg1: '#7C3AED', bg2: '#4F46E5', glow: '#8B5CF6', text: 'rgba(255,245,200,1)' },
    B: { bg1: '#0369A1', bg2: '#0C4A6E', glow: '#38BDF8', text: '#E0F2FE' },
    C: { bg1: '#92400E', bg2: '#78350F', glow: '#F59E0B', text: '#FEF3C7' },
    D: { bg1: '#374151', bg2: '#1F2937', glow: '#9CA3AF', text: '#F3F4F6' },
  };
  const gs = gradeStyles[grade] || gradeStyles['C'];

  const actionCN    = isBuy ? '买入' : isSell ? '卖出' : '观望';
  const actionColor = isBuy ? '#FF453A' : isSell ? '#30D158' : '#FFD60A';

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

  // ── DARK BACKGROUND ───────────────────────────────────────────
  ctx.fillStyle = '#0d0d14'; ctx.fillRect(0, 0, W, H);

  // Center radial glow
  const glowGrad = ctx.createRadialGradient(W / 2, 230, 0, W / 2, 230, 300);
  glowGrad.addColorStop(0, gs.glow + '28');
  glowGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glowGrad; ctx.fillRect(0, 0, W, 500);

  // ── HEADER: app name + date ───────────────────────────────────
  const dateStr = new Date(analyzedAt).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  ctx.font = `700 14px ${F}`; ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.fillText(appName, 28, 50);
  ctx.font = `400 13px ${F}`; ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.fillText(dateStr, W - 28, 50);

  // ── HEXAGON BADGE ─────────────────────────────────────────────
  const hexCX = W / 2, hexCY = 230, hexR = 110;

  // Outer decoration rings
  [0.07, 0.045, 0.025].forEach((opacity, i) => {
    const r = hexR + 26 + i * 22;
    ctx.strokeStyle = `rgba(255,255,255,${opacity})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let j = 0; j < 6; j++) {
      const angle = (Math.PI / 3) * j - Math.PI / 6;
      const hx = hexCX + r * Math.cos(angle);
      const hy = hexCY + r * Math.sin(angle);
      j === 0 ? ctx.moveTo(hx, hy) : ctx.lineTo(hx, hy);
    }
    ctx.closePath(); ctx.stroke();
  });

  // Main hexagon
  const hexGrad = ctx.createLinearGradient(hexCX - hexR, hexCY - hexR, hexCX + hexR, hexCY + hexR);
  hexGrad.addColorStop(0, gs.bg1); hexGrad.addColorStop(1, gs.bg2);
  ctx.fillStyle = hexGrad;
  ctx.beginPath();
  for (let j = 0; j < 6; j++) {
    const angle = (Math.PI / 3) * j - Math.PI / 6;
    const hx = hexCX + hexR * Math.cos(angle);
    const hy = hexCY + hexR * Math.sin(angle);
    j === 0 ? ctx.moveTo(hx, hy) : ctx.lineTo(hx, hy);
  }
  ctx.closePath(); ctx.fill();

  // Inner highlight
  const hiGrad = ctx.createRadialGradient(hexCX - 30, hexCY - 40, 0, hexCX, hexCY, hexR);
  hiGrad.addColorStop(0, 'rgba(255,255,255,0.22)');
  hiGrad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = hiGrad;
  ctx.beginPath();
  for (let j = 0; j < 6; j++) {
    const angle = (Math.PI / 3) * j - Math.PI / 6;
    const hx = hexCX + hexR * Math.cos(angle);
    const hy = hexCY + hexR * Math.sin(angle);
    j === 0 ? ctx.moveTo(hx, hy) : ctx.lineTo(hx, hy);
  }
  ctx.closePath(); ctx.fill();

  // Grade letter (or lock)
  if (isMasked) {
    ctx.font = `400 64px ${F}`; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillText('🔒', hexCX, hexCY + 24);
  } else {
    ctx.font = `900 160px ${F}`; ctx.textAlign = 'center';
    ctx.fillStyle = gs.text;
    ctx.shadowColor = 'rgba(0,0,0,0.3)'; ctx.shadowBlur = 14;
    ctx.fillText(grade, hexCX, hexCY + 58);
    ctx.shadowBlur = 0;
  }

  // ── METALLIC DIVIDER ──────────────────────────────────────────
  const divY = 382;
  const divGrad = ctx.createLinearGradient(0, 0, W, 0);
  divGrad.addColorStop(0, 'transparent');
  divGrad.addColorStop(0.25, 'rgba(255,255,255,0.14)');
  divGrad.addColorStop(0.75, 'rgba(255,255,255,0.14)');
  divGrad.addColorStop(1, 'transparent');
  ctx.strokeStyle = divGrad; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, divY); ctx.lineTo(W, divY); ctx.stroke();

  // ── STOCK INFO ────────────────────────────────────────────────
  let y = divY + 28;

  ctx.font = `700 30px ${F}`; ctx.textAlign = 'center'; ctx.fillStyle = gs.text;
  ctx.fillText(stockName.length > 10 ? stockName.slice(0, 10) + '…' : stockName, W / 2, y + 28);
  y += 40;

  ctx.font = `400 13px ${F}`; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,0.32)';
  ctx.fillText(`${stockCode} · ${market.toUpperCase()}`, W / 2, y + 16);
  y += 36;

  // ── ACTION + CONFIDENCE PILLS ─────────────────────────────────
  const pillItems: Array<{ text: string; color: string; bg: string }> = [
    { text: actionCN, color: actionColor, bg: actionColor + '22' },
    ...(confidence != null ? [{ text: `${confidence}% 置信`, color: gs.glow, bg: gs.glow + '22' }] : []),
  ];
  ctx.font = `700 13px ${F}`;
  const totalPW = pillItems.reduce((s, it) => s + ctx.measureText(it.text).width + 30 + 10, -10);
  let px = W / 2 - totalPW / 2;
  pillItems.forEach(item => {
    ctx.font = `700 13px ${F}`;
    const pw = ctx.measureText(item.text).width + 30;
    ctx.fillStyle = item.bg;
    ctx.beginPath(); ctx.roundRect(px, y, pw, 28, 14); ctx.fill();
    ctx.strokeStyle = item.color + '44'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(px, y, pw, 28, 14); ctx.stroke();
    ctx.fillStyle = item.color; ctx.textAlign = 'left';
    ctx.fillText(item.text, px + 15, y + 18);
    px += pw + 10;
  });
  y += 48;

  // ── PRICE ROW ─────────────────────────────────────────────────
  if (!isMasked && (targetPrice != null || stopLoss != null)) {
    const priceRow = [
      { label: '目标价', val: fmtP(targetPrice) },
      { label: '止损价', val: fmtP(stopLoss) },
    ];
    priceRow.forEach((item, i) => {
      const cx = W / 2 + (i === 0 ? -110 : 110);
      ctx.font = `400 11px ${F}`; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,0.28)';
      ctx.fillText(item.label, cx, y + 14);
      ctx.font = `700 20px ${F}`; ctx.fillStyle = 'rgba(255,255,255,0.82)';
      ctx.fillText(item.val, cx, y + 36);
    });
    y += 56;
  } else {
    y += 12;
  }

  // ── ACHIEVEMENT TEXT ──────────────────────────────────────────
  const achieveTxt = isMasked
    ? `解锁专业版，查看完整 ${grade} 级机会详情`
    : `AI 评定 ${grade} 级稀缺机会 · 主动发现于 ${dateStr}`;
  ctx.font = `500 13px ${F}`; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,0.32)';
  ctx.fillText(achieveTxt, W / 2, y + 16);

  // ── FOOTER ───────────────────────────────────────────────────
  ctx.font = `400 11px ${F}`; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,0.13)';
  ctx.fillText('本内容仅供技术分析参考 · 不构成投资建议 · 投资有风险，入市须谨慎', W / 2, H - 24);

  // Bottom gradient bar
  const bottomBar = ctx.createLinearGradient(0, 0, W, 0);
  bottomBar.addColorStop(0, gs.bg2);
  bottomBar.addColorStop(0.5, gs.glow);
  bottomBar.addColorStop(1, gs.bg2);
  ctx.fillStyle = bottomBar; ctx.fillRect(0, H - 4, W, 4);

  // Suppress unused var warnings
  void latestPrice; void appName;

  return new Promise<{ blob: Blob; filename: string }>((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob) { reject(new Error('canvas.toBlob failed')); return; }
      resolve({ blob, filename: `${stockCode || stockName}_研判徽章.png` });
    }, 'image/png');
  });
}
