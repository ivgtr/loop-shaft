import type { Rect } from './interactionTargets';

/** Integer pixels, actual proportions, no labels or animated/fabricated progress. */
export function drawMeter(ctx: CanvasRenderingContext2D, box: Rect, value: number, total: number, warning = false): void {
  const x = Math.round(box.x); const y = Math.round(box.y);
  const width = Math.max(3, Math.round(box.width)); const height = Math.max(3, Math.round(box.height));
  const ratio = total > 0 && Number.isFinite(value / total) ? Math.max(0, Math.min(1, value / total)) : 0;
  ctx.fillStyle = '#b0a397'; ctx.fillRect(x, y, width, height);
  ctx.fillStyle = '#171519'; ctx.fillRect(x + 1, y + 1, width - 2, height - 2);
  ctx.fillStyle = warning ? '#e3aa89' : '#caaa68';
  const fill = Math.round((width - 2) * ratio);
  if (fill) ctx.fillRect(x + 1, y + 1, fill, height - 2);
  if (warning) {
    // Hatching identifies a full/blocked capacity without relying on color.
    ctx.fillStyle = '#171519';
    for (let offset = 4; offset < fill; offset += 6) ctx.fillRect(x + offset, y + 1, 1, height - 2);
  }
}
