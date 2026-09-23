import type { ActiveRewardNotice, RewardEffect } from '../game/rewardFeedback';
import type { PresentationSettings } from '../game/presentationSettings';

const COLORS: Record<RewardEffect, string> = {
  fine: '#cab98b', pure: '#e8e6c7', metal: '#e5b45e', gem: '#91d3d3', fossil: '#c6b18b',
  relic: '#bda784', anomaly: '#a796b5', specimen: '#e1cfaa', equipment: '#b9c4a9', trace: '#b5a584', record: '#dcc79f', find: '#b6b1a2',
};
export const rewardAccent = (notice: ActiveRewardNotice): string => COLORS[notice.effect ?? 'find'];

/** Small, authored pixel gestures around the real find; never draws a second physical item. */
export function drawRewardEffect(ctx: CanvasRenderingContext2D, notice: ActiveRewardNotice,
  point: { x: number; y: number } | null, now: number, settings: PresentationSettings): void {
  const age = now - notice.startedAt;
  if (age < 0 || age >= 780) return;
  // A queued result is still readable/audible in its notice, but must not replay at an empty mining site.
  if (point && notice.startedAt - notice.queuedAt > 350) return;
  const effect = notice.effect ?? 'find';
  const x = Math.round(point?.x ?? 102); const y = Math.round(point?.y ?? 66);
  const t = Math.floor(age / 65);
  const travel = settings.motion ? Math.min(12, t * 2) : 0;
  ctx.save();
  if (point) { ctx.beginPath(); ctx.rect(0, 82, 480, 154); ctx.clip(); }
  ctx.fillStyle = rewardAccent(notice);
  const pixel = (dx: number, dy: number, w = 1, h = 1) => ctx.fillRect(x + dx, y + dy, w, h);
  const sparkle = (dx: number, dy: number, size: number) => {
    pixel(dx - size, dy, size * 2 + 1, 1); pixel(dx, dy - size, 1, size * 2 + 1);
  };
  if (!settings.highlights) {
    // A steady bracket preserves the location and silhouette cue, without flashes/dimming.
    pixel(-12, -8, 1, 8); pixel(-12, -8, 4); pixel(11, -8, 1, 8); pixel(8, -8, 4);
    ctx.restore(); return;
  }
  switch (effect) {
    case 'fine': sparkle(4, -10, 1); break;
    case 'pure':
    case 'gem': {
      const s = effect === 'pure' ? 2 : 3;
      sparkle(-9 - travel, -8, s); sparkle(8 + travel, -14, 2);
      if (t >= 2) sparkle(2, -18 - Math.floor(travel / 2), 1);
      // A single stepped facet, rather than a blurred radial glow.
      pixel(-5, -3, 3); pixel(-2, -4, 3); pixel(1, -5, 3);
      break;
    }
    case 'metal':
      // Low, heavy impact; chips spread sideways and settle instead of floating upward.
      for (const side of [-1, 1]) {
        pixel(side * (8 + travel), -3 + Math.floor(travel * travel / 28), 3, 2);
        pixel(side * (6 + Math.floor(travel / 2)), -7, 2, 2);
        pixel(side * (12 + travel), 4, 4, 1);
      }
      if (t >= 2 && t <= 7) sparkle(1, -13, 2);
      break;
    case 'anomaly':
      if (t < 2) break; // The same short gap as the low sound's delayed onset.
      ctx.fillStyle = '#17151c';
      pixel(-18, -22, 36, 3); pixel(-22, -18, 3, 30); pixel(19, -18, 3, 30); pixel(-18, 12, 36, 3);
      ctx.fillStyle = COLORS.anomaly;
      for (const side of [-1, 1]) { pixel(side * (14 - Math.min(5, Math.floor(travel / 2))), -12, 1, 13); pixel(side * 5, -18, 2, 2); }
      break;
    case 'relic':
    case 'equipment':
      for (let i = 0; i < 3; i++) if (!settings.motion || t >= i * 2) {
        pixel(-12 + i * 9, -17, 5, 2); pixel(-10 + i * 9, -15, 1, 3);
      }
      pixel(-13, -6, 3, 5); pixel(11, -6, 3, 5);
      break;
    case 'fossil':
      for (const side of [-1, 1]) {
        pixel(side * (9 + Math.floor(travel / 2)), -7, 3, 6);
        pixel(side * (12 + travel), 1, 4, 2);
      }
      break;
    case 'specimen':
    case 'record':
      // Corners frame the existing collection sprite; no new appraisal/re-roll animation.
      for (const side of [-1, 1]) {
        pixel(side < 0 ? -12 : 8, -10, 4); pixel(side < 0 ? -12 : 11, -10, 1, 4);
        pixel(side < 0 ? -12 : 8, 10, 4); pixel(side < 0 ? -12 : 11, 7, 1, 4);
      }
      break;
    default:
      pixel(-10 - travel, -5, 3); pixel(8 + travel, -5, 3); pixel(0, -15, 1, 3);
  }
  ctx.restore();
}
