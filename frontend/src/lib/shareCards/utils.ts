/**
 * Shared helpers for share-card canvas generators.
 */

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

/**
 * Returns a getLines function bound to the given canvas context.
 * getLines wraps text to fit within maxW, returning at most max lines.
 */
export function makeGetLines(ctx: CanvasRenderingContext2D) {
  return function getLines(text: string, font: string, maxW: number, max: number): string[] {
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
}

/**
 * Draws a placeholder QR code on the canvas.
 */
export function drawQR(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, size: number,
  fgColor: string, bgFill: string,
): void {
  const grid = [
    [1,1,1,0,1,1,1],[1,0,1,0,1,0,1],[1,1,1,0,1,1,1],
    [0,0,0,1,0,0,0],[1,1,1,0,1,1,1],[1,0,1,0,1,0,1],[1,1,1,0,1,1,1],
  ];
  const cell = (size - 12) / 7;
  ctx.fillStyle = bgFill; ctx.beginPath(); ctx.roundRect(x, y, size, size, 5); ctx.fill();
  ctx.fillStyle = fgColor;
  grid.forEach((row, ri) => row.forEach((c, ci) => {
    if (c) {
      ctx.beginPath();
      ctx.roundRect(x + 6 + ci * cell, y + 6 + ri * cell, cell - 0.8, cell - 0.8, 1);
      ctx.fill();
    }
  }));
}

/**
 * Formats a price with currency prefix based on market.
 */
export function fmtPrice(price: number | null, market: string): string {
  if (price == null) return '—';
  const isCN = market === 'a' || market === 'futures';
  return isCN ? `¥${price.toFixed(2)}` : `$${price.toFixed(2)}`;
}
