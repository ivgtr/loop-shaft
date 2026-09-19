import { WORLD } from '../game/config';
import type { Selection } from '../game/types';
import type { InteractionTarget, Rect } from './interactionTargets';
import { sameInteractionTarget } from './interactionTargets';

const COLORS = {
  normal: '#716b63',
  hover: '#eee3ca',
  selected: '#caaa68',
  available: '#d0aa5f',
  unavailable: '#aaa39a',
  labelBackground: '#0b0b0de8',
  labelText: '#eee3ca',
} as const;

export function drawInteractionOverlay(
  ctx: CanvasRenderingContext2D,
  targets: readonly InteractionTarget[],
  selection: Selection,
  hoveredKey: string | null,
  guideTargetKey: string | null = null,
): void {
  ctx.save();
  ctx.lineWidth = 1;
  for (const target of targets) {
    const hovered = target.key === hoveredKey;
    const selected = sameInteractionTarget(target.ref, selection);
    const guided = target.key === guideTargetKey;
    for (const rect of target.emphasisRects) {
      if (selected) drawSelectionFrame(ctx, rect, hovered);
      else drawCornerFrame(ctx, rect, hovered || guided);
      drawAvailabilityMark(ctx, rect, target.primaryActionAvailable);
    }
  }
  const hovered = targets.find((target) => target.key === hoveredKey);
  if (hovered && hovered.key !== guideTargetKey) drawHoverLabel(ctx, hovered);
  ctx.restore();
}

function drawCornerFrame(ctx: CanvasRenderingContext2D, rect: Rect, hovered: boolean): void {
  ctx.strokeStyle = hovered ? COLORS.hover : COLORS.normal;
  const length = hovered ? 5 : 3;
  const left = crisp(rect.x); const right = crisp(rect.x + rect.width);
  const top = crisp(rect.y); const bottom = crisp(rect.y + rect.height);
  ctx.beginPath();
  ctx.moveTo(left, top + length); ctx.lineTo(left, top); ctx.lineTo(left + length, top);
  ctx.moveTo(right - length, top); ctx.lineTo(right, top); ctx.lineTo(right, top + length);
  ctx.moveTo(right, bottom - length); ctx.lineTo(right, bottom); ctx.lineTo(right - length, bottom);
  ctx.moveTo(left + length, bottom); ctx.lineTo(left, bottom); ctx.lineTo(left, bottom - length);
  ctx.stroke();
}

function drawSelectionFrame(ctx: CanvasRenderingContext2D, rect: Rect, hovered: boolean): void {
  ctx.strokeStyle = hovered ? COLORS.hover : COLORS.selected;
  ctx.setLineDash(hovered ? [] : [5, 2]);
  ctx.strokeRect(crisp(rect.x), crisp(rect.y), Math.round(rect.width), Math.round(rect.height));
  ctx.setLineDash([]);
}

function drawAvailabilityMark(ctx: CanvasRenderingContext2D, rect: Rect, available: boolean): void {
  const x = Math.round(rect.x + rect.width - 3);
  const y = Math.round(rect.y + 2);
  if (available) {
    ctx.fillStyle = COLORS.available;
    ctx.fillRect(x, y, 2, 2);
    return;
  }
  ctx.strokeStyle = COLORS.unavailable;
  ctx.strokeRect(crisp(x - 1), crisp(y - 1), 3, 3);
  ctx.beginPath();
  ctx.moveTo(x - 1, y + 2); ctx.lineTo(x + 2, y - 1); ctx.stroke();
}

function drawHoverLabel(ctx: CanvasRenderingContext2D, target: InteractionTarget): void {
  const text = target.shortStatus ? `${target.displayName} · ${target.shortStatus}` : target.displayName;
  ctx.font = '5px monospace';
  const width = Math.ceil(ctx.measureText(text).width) + 6;
  const height = 10;
  const x = Math.round(clamp(target.labelAnchor.x - width / 2, 2, WORLD.width - width - 2));
  let y = Math.round(target.labelAnchor.y - height);
  if (y < 39) y = Math.round(Math.max(39, target.emphasisRects[0]!.y + target.emphasisRects[0]!.height + 3));
  if (y + height > WORLD.height - 2) y = WORLD.height - height - 2;
  ctx.fillStyle = COLORS.labelBackground;
  ctx.fillRect(x, y, width, height);
  ctx.strokeStyle = target.primaryActionAvailable ? COLORS.available : COLORS.unavailable;
  ctx.strokeRect(crisp(x), crisp(y), width, height);
  ctx.fillStyle = COLORS.labelText;
  ctx.textAlign = 'left';
  ctx.fillText(text, x + 3, y + 7);
}

function crisp(value: number): number {
  return Math.round(value) + 0.5;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
