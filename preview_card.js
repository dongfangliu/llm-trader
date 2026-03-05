/**
 * Share Card — FINAL with adaptive typography + visual effects
 * Run: $env:NODE_PATH="D:\Freelancers\nodejs\node_modules"; node preview_card.js
 */
const { createCanvas } = require('canvas');
const fs = require('fs');

const W = 600, H = 800;

const DATA = {
  stockName:   '比亚迪',
  stockCode:   '002594',
  action:      'buy',
  confidence:  68,
  latestPrice: 94.23,
  targetPrice: 97.50,
  stopLoss:    91.40,
  latestDate:  '2025-03-04 15:00',
  analyzedAt:  '2025-03-05 09:20',
  mainReason:  'MACD零轴金叉，量能温和放大，短线整理格局延续。关注97.5压力区间突破，有效站稳后目标看100整数关口。',
  oppQuality:  'A',
  mktDiag:     'A股市场整体偏强，沪深300站稳3900点，外资持续净流入，风险偏好回升。比亚迪所在的新能源板块领涨，行业景气度持续改善，政策面亦有积极催化。',
  oppAssess:   '当前价位处于技术形态突破前夜，前期高点97.5元已多次承压但均价韧性较强。MACD金叉配合量能温和放大，短线胜率偏高。综合评级：A级高概率机会，风险收益比约1:3。',
  riskAnal:    '目标位97.5元，止损91.4元，理论收益3.48%，最大亏损2.97%。风险收益比约1:1.17，处于合理区间。主要风险来自指数系统性回调及行业政策变化，建议仓位不超过总资产15%。',
  execPlan:    '建议分批建仓：现价94.2元买入50%仓位，若回踩92.5支撑位补仓30%，破91.4元止损离场。持有期间关注成交量配合，目标97.5元分批止盈，强势可持有至100元整数关口。',
  appName:     'StockSage',
  tier:        'free',
};

const THEMES = {
  hold: { bgA:'#EFF6FF', bgB:'#DBEAFE', ac:'#2563EB', adk:'#1d4ed8', alt:'#1e40af', hi:'#60A5FA', acR:'37,99,235',  bgRgb:'239,246,255', label:'观望' },
  buy:  { bgA:'#FFF1F2', bgB:'#FFE4E6', ac:'#E8221C', adk:'#991B1B', alt:'#7f1d1d', hi:'#FF4444', glow:'#E8221C', acR:'232,34,28',   bgRgb:'255,241,242', label:'买入' },
  sell: { bgA:'#F0FDF4', bgB:'#DCFCE7', ac:'#16A34A', adk:'#15803d', alt:'#14532d', hi:'#4ADE80', acR:'22,163,74',  bgRgb:'240,253,244', label:'卖出' },
};

function wrapCN(ctx, text, font, maxW, maxLines) {
  ctx.font = font;
  const puncts = new Set(['，','。','、','！','？','；','：','…']);
  const out = [];
  let rem = text;
  for (let li = 0; li < maxLines && rem.length; li++) {
    if (ctx.measureText(rem).width <= maxW) { out.push(rem); break; }
    const isLast = li === maxLines - 1;
    let end = rem.length;
    while (end > 0 && ctx.measureText(rem.slice(0, end) + (isLast ? '…' : '')).width > maxW) end--;
    if (!isLast) for (let b = 0; b < 8 && end - b > 1; b++)
      if (puncts.has(rem[end - b])) { end = end - b + 1; break; }
    // Don't break mid-number: backtrack if splitting between digit and digit/%
    while (end > 1 && /\d/.test(rem[end - 1]) && /[\d%]/.test(rem[end])) end--;
    out.push(rem.slice(0, end) + (isLast && rem.length > end ? '…' : ''));
    rem = rem.slice(end);
  }
  return out;
}

function wordBlocks(ctx, x, lineY, totalW, blockH, widths, opacity, dark) {
  let cx = x;
  ctx.beginPath();
  for (const w of widths) {
    if (cx + w > x + totalW) break;
    ctx.roundRect(cx, lineY - Math.ceil(blockH / 2), w, blockH, blockH / 2);
    cx += w + 7;
  }
  ctx.fillStyle = dark ? `rgba(0,0,0,${opacity})` : `rgba(255,255,255,${opacity})`;
  ctx.fill();
}

function gen() {
  const canvas = createCanvas(W * 2, H * 2);
  const ctx = canvas.getContext('2d');
  ctx.scale(2, 2);

  const { stockName, stockCode, action, confidence, latestPrice, targetPrice,
          stopLoss, latestDate, analyzedAt, mainReason, appName, tier } = DATA;
  const T = THEMES[action] || THEMES.hold;
  const heroGlow = T.glow || T.ac;
  const FY = H - 50;

  /* ── Background — light tinted gradient ──────────────────────────── */
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, T.bgA); bg.addColorStop(1, T.bgB);
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

  // Subtle radial bloom center-top
  const bloom = ctx.createRadialGradient(W / 2, 0, 0, W / 2, 0, 360);
  bloom.addColorStop(0, `rgba(${T.acR},0.10)`);
  bloom.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = bloom; ctx.fillRect(0, 0, W, H);

  // Dot grid — very subtle dark dots
  ctx.fillStyle = `rgba(${T.acR},0.06)`;
  for (let gx = 18; gx < W; gx += 22)
    for (let gy = 18; gy < H; gy += 22)
      { ctx.beginPath(); ctx.arc(gx, gy, 1, 0, Math.PI * 2); ctx.fill(); }

  // Subtle diagonal lines for premium paper texture
  ctx.save();
  ctx.globalAlpha = 0.025;
  ctx.strokeStyle = T.ac; ctx.lineWidth = 1;
  for (let d = -H; d < W + H; d += 18) {
    ctx.beginPath(); ctx.moveTo(d, 0); ctx.lineTo(d + H, H); ctx.stroke();
  }
  ctx.restore();

  const stripe = ctx.createLinearGradient(0, 0, W, 0);
  stripe.addColorStop(0, 'rgba(0,0,0,0)');
  stripe.addColorStop(0.2, T.adk + 'ee');
  stripe.addColorStop(0.5, heroGlow);
  stripe.addColorStop(0.8, heroGlow + 'aa');
  stripe.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = stripe; ctx.fillRect(0, 0, W, 5);

  /* ── BRAND BAR ───────────────────────────────────────────────────── */
  ctx.font = '600 11px "Microsoft YaHei",sans-serif'; ctx.textAlign = 'left';
  ctx.fillStyle = T.ac;
  ctx.fillText(`K线  ${latestDate}`, 20, 20);
  ctx.font = '400 10px "Microsoft YaHei",sans-serif';
  ctx.fillStyle = `rgba(${T.acR},0.55)`;
  ctx.fillText(`研判  ${analyzedAt}`, 20, 33);

  const bsep = ctx.createLinearGradient(0, 0, W, 0);
  bsep.addColorStop(0, 'rgba(0,0,0,0)');
  bsep.addColorStop(0.5, `rgba(${T.acR},0.22)`);
  bsep.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.strokeStyle = bsep; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, 38); ctx.lineTo(W, 38); ctx.stroke();

  /* ── STOCK NAME ──────────────────────────────────────────────────── */
  let y = 46;
  ctx.textAlign = 'center';
  ctx.font = '800 52px "Microsoft YaHei",sans-serif';
  ctx.shadowColor = `rgba(${T.acR},0.25)`; ctx.shadowBlur = 12;
  ctx.fillStyle = `rgba(${T.acR},0.90)`;
  ctx.fillText(stockName, W / 2, y + 44);
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
  y += 52;

  ctx.font = '600 12px "Microsoft YaHei",sans-serif';
  const cpw = ctx.measureText(stockCode).width + 22;
  ctx.fillStyle = `rgba(${T.acR},0.12)`;
  ctx.beginPath(); ctx.roundRect(W / 2 - cpw / 2, y, cpw, 22, 11); ctx.fill();
  ctx.strokeStyle = `rgba(${T.acR},0.35)`; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.roundRect(W / 2 - cpw / 2, y, cpw, 22, 11); ctx.stroke();
  ctx.fillStyle = T.ac; ctx.textAlign = 'center';
  ctx.fillText(stockCode, W / 2, y + 15);
  y += 28;

  /* ── SIGNAL — Large Filled Circle ───────────────────────────────── */
  const sigCY = y + 82;
  const sigR  = 76;

  // Outer decorative tick ring
  for (let deg = 0; deg < 360; deg += 6) {
    const rad   = deg * Math.PI / 180;
    const major = deg % 30 === 0;
    const r1    = sigR + (major ? 12 : 7);
    const r2    = sigR + 20;
    ctx.strokeStyle = `rgba(${T.acR},${major ? 0.55 : 0.18})`;
    ctx.lineWidth   = major ? 2 : 0.8;
    ctx.beginPath();
    ctx.moveTo(W/2 + Math.cos(rad)*r1, sigCY + Math.sin(rad)*r1);
    ctx.lineTo(W/2 + Math.cos(rad)*r2, sigCY + Math.sin(rad)*r2);
    ctx.stroke();
  }
  ctx.strokeStyle = `rgba(${T.acR},0.14)`; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(W/2, sigCY, sigR + 20, 0, Math.PI*2); ctx.stroke();

  // Drop shadow beneath circle
  ctx.shadowColor = `rgba(${T.acR},0.32)`; ctx.shadowBlur = 40; ctx.shadowOffsetY = 8;
  ctx.fillStyle = T.adk;
  ctx.beginPath(); ctx.arc(W/2, sigCY, sigR, 0, Math.PI*2); ctx.fill();
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

  // Radial gradient fill — bright center → dark edge (gem-like)
  const sigGrad = ctx.createRadialGradient(W/2 - 24, sigCY - 24, 0, W/2, sigCY, sigR);
  sigGrad.addColorStop(0,   T.hi);
  sigGrad.addColorStop(0.5, T.ac);
  sigGrad.addColorStop(1,   T.adk);
  ctx.fillStyle = sigGrad;
  ctx.beginPath(); ctx.arc(W/2, sigCY, sigR, 0, Math.PI*2); ctx.fill();

  // Specular highlight
  const hlG = ctx.createRadialGradient(W/2 - 24, sigCY - 24, 0, W/2 - 24, sigCY - 24, 52);
  hlG.addColorStop(0, 'rgba(255,255,255,0.32)');
  hlG.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = hlG;
  ctx.beginPath(); ctx.arc(W/2, sigCY, sigR, 0, Math.PI*2); ctx.fill();

  // Inner border
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(W/2, sigCY, sigR - 1, 0, Math.PI*2); ctx.stroke();

  // Action text — white, bold
  ctx.font = '900 46px "Microsoft YaHei",sans-serif';
  ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center';
  ctx.shadowColor = 'rgba(0,0,0,0.28)'; ctx.shadowBlur = 10;
  ctx.fillText(T.label, W/2, sigCY + 18);
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;

  ctx.fillStyle = `rgba(${T.acR},0.45)`;
  ctx.font = '500 11px "Microsoft YaHei",sans-serif';
  ctx.fillText('操  作  建  议', W/2, sigCY + sigR + 30);
  y = sigCY + sigR + 44;

  /* ── CONFIDENCE — label + % inline, clean bar ────────────────────── */
  ctx.font = '400 11px "Microsoft YaHei",sans-serif';
  ctx.fillStyle = `rgba(${T.acR},0.50)`;
  ctx.textAlign = 'left'; ctx.fillText('AI 置信度', 64, y + 10);
  ctx.font = '800 22px "Microsoft YaHei",sans-serif';
  ctx.fillStyle = T.ac;
  ctx.textAlign = 'right'; ctx.fillText(`${confidence}%`, W - 64, y + 10);
  y += 15;

  const cbx = 64, cbw = W - 128, cbh = 7;
  ctx.fillStyle = `rgba(${T.acR},0.10)`;
  ctx.beginPath(); ctx.roundRect(cbx, y, cbw, cbh, 4); ctx.fill();
  const filled = Math.round(cbw * confidence / 100);
  const cf = ctx.createLinearGradient(cbx, 0, cbx + cbw, 0);
  cf.addColorStop(0, T.adk); cf.addColorStop(1, T.ac);
  ctx.fillStyle = cf;
  ctx.beginPath(); ctx.roundRect(cbx, y, filled, cbh, 4); ctx.fill();
  ctx.fillStyle = '#ffffff'; ctx.shadowColor = T.ac; ctx.shadowBlur = 8;
  ctx.beginPath(); ctx.arc(cbx + filled, y + cbh/2, cbh/2 + 2, 0, Math.PI*2); ctx.fill();
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
  y += cbh + 16;

  /* ── PRICE STRIP — mini cards with directional arrows ───────────── */
  const colW = Math.floor(W / 3);
  const pCardH = 60;
  // Mini card backgrounds
  for (let i = 0; i < 3; i++) {
    const px = colW * i + 6;
    ctx.fillStyle = 'rgba(255,255,255,0.62)';
    ctx.beginPath(); ctx.roundRect(px, y, colW - 12, pCardH, 10); ctx.fill();
    ctx.strokeStyle = `rgba(${T.acR},0.12)`; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(px, y, colW - 12, pCardH, 10); ctx.stroke();
  }
  const prices = [
    { label: '最新价', val: latestPrice.toFixed(2), col: '#111111', arrow: '' },
    { label: '目标价', val: targetPrice.toFixed(2), col: '#DC2626', arrow: targetPrice > latestPrice ? '▲ ' : '▼ ' },
    { label: '止  损', val: stopLoss.toFixed(2),    col: '#16A34A', arrow: stopLoss   > latestPrice ? '▲ ' : '▼ ' },
  ];
  prices.forEach((item, i) => {
    const cx = colW * i + colW / 2;
    ctx.fillStyle = `rgba(${T.acR},0.50)`;
    ctx.font = '500 11px "Microsoft YaHei",sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(item.label, cx, y + 17);
    ctx.font = `700 24px "Microsoft YaHei",sans-serif`;
    ctx.fillStyle = item.col;
    ctx.fillText(item.arrow + item.val, cx, y + 46);
  });
  y += pCardH + 4;

  /* ── ANALYSIS GLASS CARD ─────────────────────────────────────────── */
  const CX = 18, CW = W - 36;
  const cardY = y + 8;
  const LOCK_H = 56;
  const cardH = FY - 14 - cardY;
  const divY  = cardY + cardH - LOCK_H - 2;
  const tX    = CX + 18;
  const tW    = CW - 36;

  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath(); ctx.roundRect(CX, cardY, CW, cardH, 16); ctx.fill();
  ctx.strokeStyle = `rgba(${T.acR},0.18)`; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.roundRect(CX, cardY, CW, cardH, 16); ctx.stroke();

  ctx.fillStyle = T.ac;
  ctx.beginPath(); ctx.roundRect(CX, cardY + 14, 3, cardH - 28, [0, 2, 2, 0]); ctx.fill();

  ctx.fillStyle = T.ac;
  ctx.font = '700 11px "Microsoft YaHei",sans-serif'; ctx.textAlign = 'left';
  ctx.fillText('分  析  要  点', tX, cardY + 20);

  const font15 = '500 15px "Microsoft YaHei",sans-serif';
  const aLines = wrapCN(ctx, mainReason, font15, tW, 3);
  ctx.fillStyle = 'rgba(0,0,0,0.78)'; ctx.font = font15;
  const tY0 = cardY + 36;
  aLines.forEach((ln, li) => ctx.fillText(ln, tX, tY0 + li * 22));
  const tEnd = tY0 + aLines.length * 22;

  // Dashed separator — signals content continues beneath
  ctx.save();
  ctx.setLineDash([3, 5]);
  ctx.strokeStyle = `rgba(${T.acR},0.22)`; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(tX, tEnd + 16); ctx.lineTo(tX + tW, tEnd + 16); ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  /* ── REDACTED BLOCKS ─────────────────────────────────────────────── */
  const rTop = tEnd + 24;
  const rBot = divY - 14;
  const rH   = rBot - rTop;

  if (rH > 16) {
    const rows = [
      { dy:  4, w:[58,34,68,28,50,38,44],    op: 0.28 },
      { dy: 18, w:[42,62,28,46,38,54,24,36], op: 0.22 },
      { dy: 32, w:[68,32,52,44,28,46,30],    op: 0.16 },
      { dy: 46, w:[46,58,34,40,52,30,44],    op: 0.10 },
      { dy: 60, w:[38,50,66,28,44,30,52],    op: 0.06 },
      { dy: 74, w:[54,36,48,62,26,40,34],    op: 0.04 },
      { dy: 88, w:[44,58,30,46,36,52],        op: 0.02 },
    ];
    for (const r of rows) {
      if (rTop + r.dy > rBot) break;
      wordBlocks(ctx, tX, rTop + r.dy, tW, 7, r.w, r.op, true);
    }
    const fadeG = ctx.createLinearGradient(0, rTop, 0, rBot);
    fadeG.addColorStop(0,    'rgba(255,255,255,0.00)');
    fadeG.addColorStop(0.42, 'rgba(255,255,255,0.30)');
    fadeG.addColorStop(0.70, 'rgba(255,255,255,0.78)');
    fadeG.addColorStop(1,    'rgba(255,255,255,0.97)');
    ctx.fillStyle = fadeG;
    ctx.beginPath(); ctx.roundRect(CX + 1, rTop - 4, CW - 2, rBot - rTop + 8, 4); ctx.fill();

    // Lock badge — solid fill, white text, more prominent
    const badgeY  = divY - 46;
    const lockText = '🔒  完整研判已锁定';
    ctx.font = '600 13px "Microsoft YaHei",sans-serif';
    const lbW = ctx.measureText(lockText).width + 36;
    // Shadow
    ctx.shadowColor = `rgba(${T.acR},0.35)`; ctx.shadowBlur = 14;
    ctx.fillStyle = T.ac;
    ctx.beginPath(); ctx.roundRect(W/2 - lbW/2, badgeY - 14, lbW, 28, 14); ctx.fill();
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center';
    ctx.fillText(lockText, W/2, badgeY + 5);
  }

  /* ── DIVIDER + UPGRADE ───────────────────────────────────────────── */
  ctx.strokeStyle = `rgba(${T.acR},0.18)`; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(CX + 14, divY); ctx.lineTo(CX + CW - 14, divY); ctx.stroke();

  ctx.fillStyle = `rgba(${T.acR},0.50)`;
  ctx.font = '400 11px "Microsoft YaHei",sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('🔒  升级解锁：市场诊断 · 机会评估 · 风险收益 · 执行方案', W / 2, divY + 18);
  // Upgrade button — gradient fill
  const upT = '立即升级 →';
  ctx.font = '600 12px "Microsoft YaHei",sans-serif';
  const upW = ctx.measureText(upT).width + 34;
  const upBtnG = ctx.createLinearGradient(W/2 - upW/2, 0, W/2 + upW/2, 0);
  upBtnG.addColorStop(0, T.adk); upBtnG.addColorStop(1, T.ac);
  ctx.fillStyle = upBtnG;
  ctx.shadowColor = `rgba(${T.acR},0.30)`; ctx.shadowBlur = 10;
  ctx.beginPath(); ctx.roundRect(W/2 - upW/2, divY + 24, upW, 26, 13); ctx.fill();
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
  ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center';
  ctx.fillText(upT, W/2, divY + 41);

  /* ── FOOTER ──────────────────────────────────────────────────────── */
  ctx.strokeStyle = `rgba(${T.acR},0.18)`; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(20, FY + 2); ctx.lineTo(W - 20, FY + 2); ctx.stroke();

  ctx.textAlign = 'left'; ctx.fillStyle = `rgba(${T.acR},0.38)`;
  ctx.font = '400 10px "Microsoft YaHei",sans-serif';
  ctx.fillText('本卡片由AI生成，仅供参考，不构成投资建议', 20, FY + 26);

  ctx.textAlign = 'right';
  ctx.font = '700 13px "Microsoft YaHei",sans-serif'; ctx.fillStyle = T.ac;
  ctx.shadowColor = `rgba(${T.acR},0.25)`; ctx.shadowBlur = 6;
  ctx.fillText(`「 ${appName} 」`, W - 20, FY + 21);
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
  ctx.font = '400 9px "Microsoft YaHei",sans-serif';
  ctx.fillStyle = `rgba(${T.acR},0.45)`;
  ctx.fillText('AI 智能研判', W - 20, FY + 34);

  /* ── Output ──────────────────────────────────────────────────────── */
  const buf = canvas.toBuffer('image/png');
  fs.writeFileSync('card_preview.png', buf);
  console.log(`✓ card_preview.png  cardY=${cardY} cardH=${cardH} divY=${divY} rH=${rH}`);
}

/* ══════════════════════════════════════════════════════════════════
   BASIC / PREMIUM CARD GENERATOR  — V10: final polish + decorative details
   ══════════════════════════════════════════════════════════════════ */
function genBasicPremium(tier) {
  const W = 675; // 3:4 ratio: 675×900
  const FONT = '"Microsoft YaHei",sans-serif';
  const CARD_H = 900;
  const canvas = createCanvas(W * 2, CARD_H * 2);
  const ctx = canvas.getContext('2d');
  ctx.scale(2, 2);

  const { stockName, stockCode, action, confidence, latestPrice, targetPrice, stopLoss,
          latestDate, analyzedAt, appName, oppQuality, mktDiag, oppAssess, riskAnal, execPlan } = DATA;
  const isPremium = tier === 'premium';
  const GOLD = '#d97706', GOLD_DK = '#92400e', GOLD_LT = '#fbbf24';
  const T = THEMES[action] || THEMES.hold;
  const heroGlow = T.glow || T.ac;
  const FY = 848;

  /* ── Background ─────────────────────────────────────────────────── */
  const bg = ctx.createLinearGradient(0, 0, 0, CARD_H);
  bg.addColorStop(0, T.bgA); bg.addColorStop(1, T.bgB);
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, CARD_H);

  const bloom = ctx.createRadialGradient(W / 2, 0, 0, W / 2, 0, 360);
  bloom.addColorStop(0, `rgba(${T.acR},0.10)`);
  bloom.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = bloom; ctx.fillRect(0, 0, W, CARD_H);

  ctx.fillStyle = `rgba(${T.acR},0.06)`;
  for (let gx = 18; gx < W; gx += 22)
    for (let gy = 18; gy < CARD_H; gy += 22)
      { ctx.beginPath(); ctx.arc(gx, gy, 1, 0, Math.PI * 2); ctx.fill(); }

  ctx.save();
  ctx.globalAlpha = 0.032;
  ctx.strokeStyle = T.ac; ctx.lineWidth = 1;
  for (let d = -CARD_H; d < W + CARD_H; d += 18) {
    ctx.beginPath(); ctx.moveTo(d, 0); ctx.lineTo(d + CARD_H, CARD_H); ctx.stroke();
  }
  ctx.restore();

  /* ── Top stripe ─────────────────────────────────────────────────── */
  const stripe = ctx.createLinearGradient(0, 0, W, 0);
  if (isPremium) {
    stripe.addColorStop(0, 'rgba(0,0,0,0)');
    stripe.addColorStop(0.2, GOLD_DK + 'ee');
    stripe.addColorStop(0.5, GOLD_LT);
    stripe.addColorStop(0.8, GOLD + 'aa');
    stripe.addColorStop(1, 'rgba(0,0,0,0)');
  } else {
    stripe.addColorStop(0, 'rgba(0,0,0,0)');
    stripe.addColorStop(0.2, T.adk + 'ee');
    stripe.addColorStop(0.5, heroGlow);
    stripe.addColorStop(0.8, heroGlow + 'aa');
    stripe.addColorStop(1, 'rgba(0,0,0,0)');
  }
  ctx.fillStyle = stripe; ctx.fillRect(0, 0, W, 6);

  /* ── Date bar ───────────────────────────────────────────────────── */
  ctx.font = `600 11px ${FONT}`; ctx.textAlign = 'left';
  ctx.fillStyle = `rgba(${T.acR},0.55)`;
  ctx.fillText(`K线  ${latestDate}`, 20, 20);
  ctx.font = `400 10px ${FONT}`; ctx.fillStyle = `rgba(${T.acR},0.45)`;
  ctx.fillText(`研判  ${analyzedAt}`, 20, 33);

  let fy = 42;

  /* ── Stock name ─────────────────────────────────────────────────── */
  ctx.textAlign = 'center';
  ctx.font = `800 48px ${FONT}`;
  ctx.shadowColor = `rgba(${T.acR},0.30)`; ctx.shadowBlur = 18;
  ctx.fillStyle = `rgba(${T.acR},0.92)`;
  ctx.fillText(stockName, W / 2, fy + 44);
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;

  fy += 50;

  /* ── Code pill ──────────────────────────────────────────────────── */
  ctx.font = `600 12px ${FONT}`;
  const cpw = ctx.measureText(stockCode).width + 22;
  ctx.fillStyle = `rgba(${T.acR},0.12)`;
  ctx.beginPath(); ctx.roundRect(W / 2 - cpw / 2, fy, cpw, 22, 11); ctx.fill();
  ctx.strokeStyle = `rgba(${T.acR},0.35)`; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.roundRect(W / 2 - cpw / 2, fy, cpw, 22, 11); ctx.stroke();
  ctx.fillStyle = T.ac; ctx.textAlign = 'center';
  ctx.fillText(stockCode, W / 2, fy + 15);
  fy += 28;

  /* ── Signal orb (matches free card design) ─────────────────────── */
  const sigCY = fy + 78;
  const sigR  = 64;

  // Outer decorative tick ring
  for (let deg = 0; deg < 360; deg += 6) {
    const rad   = deg * Math.PI / 180;
    const major = deg % 30 === 0;
    const r1    = sigR + (major ? 12 : 7);
    const r2    = sigR + 20;
    ctx.strokeStyle = `rgba(${T.acR},${major ? 0.55 : 0.18})`;
    ctx.lineWidth   = major ? 2 : 0.8;
    ctx.beginPath();
    ctx.moveTo(W/2 + Math.cos(rad)*r1, sigCY + Math.sin(rad)*r1);
    ctx.lineTo(W/2 + Math.cos(rad)*r2, sigCY + Math.sin(rad)*r2);
    ctx.stroke();
  }
  ctx.strokeStyle = `rgba(${T.acR},0.14)`; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(W/2, sigCY, sigR + 20, 0, Math.PI*2); ctx.stroke();

  // Premium: extra gold dashed outer ring
  if (isPremium) {
    ctx.strokeStyle = GOLD + '55'; ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 6]);
    ctx.beginPath(); ctx.arc(W/2, sigCY, sigR + 25, 0, Math.PI*2); ctx.stroke();
    ctx.setLineDash([]);
  }

  // Drop shadow beneath circle
  ctx.shadowColor = `rgba(${T.acR},0.32)`; ctx.shadowBlur = 40; ctx.shadowOffsetY = 8;
  ctx.fillStyle = T.adk;
  ctx.beginPath(); ctx.arc(W/2, sigCY, sigR, 0, Math.PI*2); ctx.fill();
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

  // Radial gradient fill — bright center → dark edge
  const sigGrad = ctx.createRadialGradient(W/2 - 22, sigCY - 22, 0, W/2, sigCY, sigR);
  sigGrad.addColorStop(0, T.hi); sigGrad.addColorStop(0.5, T.ac); sigGrad.addColorStop(1, T.adk);
  ctx.fillStyle = sigGrad;
  ctx.beginPath(); ctx.arc(W/2, sigCY, sigR, 0, Math.PI*2); ctx.fill();

  // Specular highlight
  const hlGO = ctx.createRadialGradient(W/2 - 22, sigCY - 22, 0, W/2 - 22, sigCY - 22, 50);
  hlGO.addColorStop(0, 'rgba(255,255,255,0.32)'); hlGO.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = hlGO;
  ctx.beginPath(); ctx.arc(W/2, sigCY, sigR, 0, Math.PI*2); ctx.fill();

  // Inner border ring — gold for premium, white for basic
  ctx.strokeStyle = isPremium ? GOLD_LT + '80' : 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(W/2, sigCY, sigR - 1, 0, Math.PI*2); ctx.stroke();

  // Action text
  ctx.font = `900 42px ${FONT}`; ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center';
  ctx.shadowColor = 'rgba(0,0,0,0.28)'; ctx.shadowBlur = 10;
  ctx.fillText(T.label, W/2, sigCY + 16);
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
  ctx.fillStyle = `rgba(${T.acR},0.45)`; ctx.font = `500 11px ${FONT}`;
  ctx.fillText('操  作  建  议', W/2, sigCY + sigR + 38);
  fy = sigCY + sigR + 58;

  /* ── Confidence bar — label left + bar + % inline after bar ─────── */
  const cbLabelTxt = 'AI 置信度';
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
  fy += 28;

  /* ── Price strip — mini cards with color-tinted headers ───────── */
  const pColW = Math.floor(W / 3), pCardH = 62;
  const priceTints = ['rgba(80,80,80,0.07)', 'rgba(220,38,38,0.10)', 'rgba(22,163,74,0.10)'];
  for (let i = 0; i < 3; i++) {
    const px = pColW * i + 6;
    ctx.fillStyle = 'rgba(255,255,255,0.72)';
    ctx.beginPath(); ctx.roundRect(px, fy, pColW - 12, pCardH, 10); ctx.fill();
    ctx.strokeStyle = `rgba(${T.acR},0.12)`; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(px, fy, pColW - 12, pCardH, 10); ctx.stroke();
    // Subtle color header tint
    ctx.fillStyle = priceTints[i];
    ctx.beginPath(); ctx.roundRect(px, fy, pColW - 12, 22, [10, 10, 0, 0]); ctx.fill();
  }
  const prices = [
    { label: '最新价', val: latestPrice.toFixed(2), col: '#111111', arrow: '' },
    { label: '目标价', val: targetPrice.toFixed(2), col: '#DC2626', arrow: targetPrice > latestPrice ? '▲ ' : '▼ ' },
    { label: '止  损', val: stopLoss.toFixed(2),    col: '#16A34A', arrow: stopLoss   > latestPrice ? '▲ ' : '▼ ' },
  ];
  prices.forEach((item, i) => {
    const cx = pColW * i + pColW / 2;
    ctx.fillStyle = `rgba(${T.acR},0.50)`; ctx.font = `500 11px ${FONT}`; ctx.textAlign = 'center';
    ctx.fillText(item.label, cx, fy + 15);
    ctx.font = `700 24px ${FONT}`; ctx.fillStyle = item.col;
    ctx.fillText(item.arrow + item.val, cx, fy + 46);
  });
  fy += pCardH + 10;

  /* ── 4 Analysis rows ──────────────────────────────────────────────── */
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
  const ROW_TAGS = ['市场面', '综合面', '风险面', '操作面'];

  const rowData = [
    { step: 1, icon: '🔍', label: '市场诊断', text: mktDiag },
    { step: 2, icon: '🎯', label: '机会评估', text: oppAssess },
    { step: 3, icon: '⚖️', label: '风险收益', text: riskAnal },
    { step: 4, icon: '📋', label: '执行方案', text: execPlan },
  ];

  // Pre-measure text lines (max 3) — must happen BEFORE rendering
  const rowLines = rowData.map(r => wrapCN(ctx, r.text, TF, textMaxW, 2));

  // Ideal height = header + lines + bottom padding
  const idealH = rowLines.map(ls => HEADER_H + ls.length * LINE_H + ROW_PAD_B);
  const gapTotal = ROW_GAP * 3;
  const idealContentTotal = idealH.reduce((a, b) => a + b, 0);
  const avail = FY - fy;

  let rowHeights;
  if (idealContentTotal + gapTotal > avail) {
    const scale = (avail - gapTotal) / idealContentTotal;
    rowHeights = idealH.map(h => Math.max(Math.floor(h * scale), HEADER_H + LINE_H));
  } else {
    const extra = Math.floor((avail - idealContentTotal - gapTotal) / 4);
    rowHeights = idealH.map(h => h + extra);
  }

  // Truncate to fitting line count per row — adds ellipsis when row is too short
  const fittedLines = rowLines.map((lines, idx) => {
    const contentH = rowHeights[idx] - HEADER_H - ROW_PAD_B;
    const maxFit = Math.max(1, Math.floor(contentH / LINE_H));
    if (lines.length <= maxFit) return lines;
    return wrapCN(ctx, rowData[idx].text, TF, textMaxW, maxFit);
  });

  let ry = fy;
  rowData.forEach((row, idx) => {
    const rH = rowHeights[idx];
    const sc = STEP_PALETTE[idx];
    const sr = STEP_RGB[idx];
    const lines = fittedLines[idx];

    // Card bg — white with stronger drop shadow
    ctx.shadowColor = `rgba(${sr},0.22)`;
    ctx.shadowBlur = 14; ctx.shadowOffsetY = 4;
    ctx.fillStyle = 'rgba(255,255,255,0.93)';
    ctx.beginPath(); ctx.roundRect(rowXL, ry, rowW, rH, 12); ctx.fill();
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    ctx.strokeStyle = `rgba(${sr},0.20)`; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(rowXL, ry, rowW, rH, 12); ctx.stroke();

    // Premium: gold corner brackets
    if (isPremium) {
      const bSz = 9;
      ctx.strokeStyle = GOLD + '75'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(rowXL + 5, ry + 5 + bSz); ctx.lineTo(rowXL + 5, ry + 5); ctx.lineTo(rowXL + 5 + bSz, ry + 5); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(rowXL + rowW - 5 - bSz, ry + rH - 5); ctx.lineTo(rowXL + rowW - 5, ry + rH - 5); ctx.lineTo(rowXL + rowW - 5, ry + rH - 5 - bSz); ctx.stroke();
    }

    // Header band gradient (left-to-right fade)
    const hbg = ctx.createLinearGradient(rowXL, 0, rowXL + rowW, 0);
    if (isPremium) {
      hbg.addColorStop(0, GOLD_DK + '30'); hbg.addColorStop(0.55, GOLD_LT + '15'); hbg.addColorStop(1, 'rgba(0,0,0,0)');
    } else {
      hbg.addColorStop(0, `rgba(${sr},0.17)`); hbg.addColorStop(0.55, `rgba(${sr},0.07)`); hbg.addColorStop(1, 'rgba(255,255,255,0)');
    }
    ctx.fillStyle = hbg;
    ctx.beginPath(); ctx.roundRect(rowXL, ry, rowW, HEADER_H, [12, 12, 0, 0]); ctx.fill();

    // Left accent strip — premium gradient, basic solid
    if (isPremium) {
      const ag = ctx.createLinearGradient(0, ry + 8, 0, ry + rH - 8);
      ag.addColorStop(0, GOLD_LT); ag.addColorStop(1, GOLD_DK);
      ctx.fillStyle = ag;
    } else {
      ctx.fillStyle = sc;
    }
    ctx.shadowColor = isPremium ? GOLD + '60' : sc + '50'; ctx.shadowBlur = 6;
    ctx.beginPath(); ctx.roundRect(rowXL, ry + 8, 5, rH - 16, [0, 3, 3, 0]); ctx.fill();
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;

    // Step circle — with outer ring + solid fill
    const scX = rowXL + 24, scY = ry + 16;
    // Outer decorative ring
    ctx.strokeStyle = isPremium ? GOLD + '50' : sc + '45'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(scX, scY, 14, 0, Math.PI * 2); ctx.stroke();
    // Fill circle
    if (isPremium) {
      const cg = ctx.createRadialGradient(scX - 3, scY - 3, 0, scX, scY, 11);
      cg.addColorStop(0, GOLD_LT); cg.addColorStop(1, GOLD_DK);
      ctx.fillStyle = cg;
    } else {
      ctx.fillStyle = sc;
    }
    ctx.beginPath(); ctx.arc(scX, scY, 11, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = `700 11px ${FONT}`; ctx.textAlign = 'center';
    ctx.fillText(`${row.step}`, scX, scY + 4);

    // Row label
    ctx.fillStyle = isPremium ? GOLD_DK : sc; ctx.font = `700 13px ${FONT}`; ctx.textAlign = 'left';
    ctx.fillText(`${row.icon}  ${row.label}`, rowXL + 46, ry + 21);

    // Right-aligned category tag
    const tagTxt = ROW_TAGS[idx];
    ctx.font = `500 10px ${FONT}`;
    const tagW = ctx.measureText(tagTxt).width + 14;
    const tagX = rowXL + rowW - 10 - tagW;
    ctx.fillStyle = isPremium ? GOLD + '20' : `rgba(${sr},0.12)`;
    ctx.beginPath(); ctx.roundRect(tagX, ry + 8, tagW, 17, 8); ctx.fill();
    ctx.strokeStyle = isPremium ? GOLD + '55' : `rgba(${sr},0.28)`; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.roundRect(tagX, ry + 8, tagW, 17, 8); ctx.stroke();
    ctx.fillStyle = isPremium ? GOLD_DK : `rgba(${sr},0.80)`; ctx.textAlign = 'center';
    ctx.fillText(tagTxt, tagX + tagW / 2, ry + 20);

    // Premium row 2: opportunity quality badge (overrides tag space)
    if (isPremium && idx === 1 && oppQuality) {
      const gradeColors = { A: '#ef4444', B: '#f97316', C: '#eab308', D: '#94a3b8' };
      const gc = gradeColors[oppQuality] || '#94a3b8';
      const gradeT = `${oppQuality} 级机会`;
      ctx.font = `700 11px ${FONT}`;
      const gbW = ctx.measureText(gradeT).width + 16;
      const gbX = tagX - gbW - 6;
      ctx.fillStyle = gc + '22';
      ctx.beginPath(); ctx.roundRect(gbX, ry + 8, gbW, 17, 8); ctx.fill();
      ctx.strokeStyle = gc + '60'; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.roundRect(gbX, ry + 8, gbW, 17, 8); ctx.stroke();
      ctx.fillStyle = gc; ctx.textAlign = 'center';
      ctx.fillText(gradeT, gbX + gbW / 2, ry + 20);
    }

    // Thin divider between header and content
    ctx.strokeStyle = isPremium ? `rgba(212,151,6,0.18)` : `rgba(${sr},0.12)`; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(rowXL + 10, ry + HEADER_H); ctx.lineTo(rowXL + rowW - 10, ry + HEADER_H); ctx.stroke();

    // Content text — vertically centred in content area below header
    const contentH = rH - HEADER_H;
    const textBlockH = lines.length * LINE_H;
    const textTopOff = Math.max(8, Math.floor((contentH - textBlockH) / 2));
    ctx.font = TF; ctx.fillStyle = 'rgba(0,0,0,0.80)'; ctx.textAlign = 'left';
    lines.forEach((ln, li) => ctx.fillText(ln, textStartX, ry + HEADER_H + textTopOff + 13 + li * LINE_H));

    // Subtle "AI" watermark bottom-right of content area
    ctx.save();
    ctx.globalAlpha = isPremium ? 0.06 : 0.04;
    ctx.font = `900 30px ${FONT}`; ctx.textAlign = 'right';
    ctx.fillStyle = isPremium ? GOLD_DK : `rgba(${sr},1)`;
    ctx.fillText('AI', rowXL + rowW - 12, ry + rH - 6);
    ctx.restore();

    // Row connector dots in gap (except after last row)
    if (idx < 3) {
      const dotY = ry + rH + ROW_GAP / 2;
      const dotCols = isPremium
        ? [GOLD + '55', GOLD + 'aa', GOLD + 'ee', GOLD + 'aa', GOLD + '55']
        : [`rgba(${sr},0.18)`, `rgba(${sr},0.38)`, `rgba(${sr},0.58)`, `rgba(${sr},0.38)`, `rgba(${sr},0.18)`];
      dotCols.forEach((dc, di) => {
        ctx.fillStyle = dc;
        ctx.beginPath(); ctx.arc(W / 2 + (di - 2) * 8, dotY, 1.5, 0, Math.PI * 2); ctx.fill();
      });
    }

    ry += rH + ROW_GAP;
  });

  /* ── Footer ─────────────────────────────────────────────────────── */
  const fpg = ctx.createLinearGradient(0, FY, 0, CARD_H);
  fpg.addColorStop(0, 'rgba(255,255,255,0)');
  fpg.addColorStop(1, `rgba(${T.acR},0.05)`);
  ctx.fillStyle = fpg; ctx.fillRect(0, FY, W, CARD_H - FY);

  ctx.strokeStyle = `rgba(${T.acR},0.18)`; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(20, FY + 2); ctx.lineTo(W - 20, FY + 2); ctx.stroke();

  ctx.textAlign = 'left'; ctx.fillStyle = `rgba(${T.acR},0.35)`;
  ctx.font = `400 10px ${FONT}`;
  ctx.fillText('本卡片由AI生成，仅供参考，不构成投资建议', 20, FY + 26);

  // Version badge + app branding — right side, badge to the left of app name
  const appNameTxt = `「 ${appName} 」`;
  ctx.font = `700 14px ${FONT}`;
  const appNameW = ctx.measureText(appNameTxt).width;

  const tierLabel = isPremium ? '◈ 专业版' : '◎ 标准版';
  ctx.font = `600 9px ${FONT}`;
  const tlW = ctx.measureText(tierLabel).width + 14;
  const tbX = W - 20 - appNameW - 10 - tlW;
  const tbY = FY + 11;

  if (isPremium) {
    const tbg = ctx.createLinearGradient(tbX, 0, tbX + tlW, 0);
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
  ctx.fillText(tierLabel, tbX + tlW / 2, tbY + 11);

  // App name
  ctx.textAlign = 'right';
  if (isPremium) {
    const ng = ctx.createLinearGradient(W - 20 - appNameW, 0, W - 20, 0);
    ng.addColorStop(0, GOLD_DK); ng.addColorStop(1, GOLD_LT);
    ctx.fillStyle = ng;
    ctx.shadowColor = GOLD; ctx.shadowBlur = 10;
  } else {
    ctx.fillStyle = T.ac;
    ctx.shadowColor = `rgba(${T.acR},0.28)`; ctx.shadowBlur = 8;
  }
  ctx.font = `700 14px ${FONT}`;
  ctx.fillText(appNameTxt, W - 20, FY + 22);
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
  ctx.font = `400 9px ${FONT}`; ctx.fillStyle = `rgba(${T.acR},0.42)`;
  ctx.fillText('AI 智能研判  · 专业投资分析', W - 20, FY + 35);

  const filename = isPremium ? 'card_premium.png' : 'card_basic.png';
  const buf = canvas.toBuffer('image/png');
  fs.writeFileSync(filename, buf);
  console.log(`✓ ${filename}  rowHeights=${JSON.stringify(rowHeights)}  fy=${fy}`);
}

gen();
genBasicPremium('basic');
genBasicPremium('premium');
