import { WORLD } from '../game/config';
import type { InitialLogisticsGuide } from '../game/initialLogisticsGuide';
import type { GameState } from '../game/types';
import { sameInteractionTarget, type InteractionTarget, type Point } from './interactionTargets';

const BACKGROUND = '#0b0b0df0';
const BORDER = '#d0aa5f';
const TEXT = '#fff0cf';

export function initialGuideTargetKey(
  guide: InitialLogisticsGuide | null,
  targets: readonly InteractionTarget[],
): string | null {
  if (!guide || guide.target.kind !== 'interaction') return null;
  const ref = guide.target.ref;
  return targets.find((target) => sameInteractionTarget(target.ref, ref))?.key ?? null;
}

export function drawInitialLogisticsGuide(
  ctx: CanvasRenderingContext2D,
  guide: InitialLogisticsGuide,
  targets: readonly InteractionTarget[],
  state: GameState,
): void {
  let anchor: Point | undefined;
  if (guide.target.kind === 'character') {
    anchor = { x: state.run.character.x, y: state.run.character.y - 17 };
  } else {
    const ref = guide.target.ref;
    anchor = targets.find((target) => sameInteractionTarget(target.ref, ref))?.labelAnchor;
  }
  if (!anchor) return;
  drawGuideLabel(ctx, guide.label, anchor);
}

export function drawDeliveryNotice(ctx: CanvasRenderingContext2D, amount: number): void {
  drawGuideLabel(ctx, `SCRAP +${amount} · DELIVERED`, { x: WORLD.elevatorX, y: WORLD.topY + 25 });
}

function drawGuideLabel(ctx: CanvasRenderingContext2D, text: string, anchor: Point): void {
  ctx.save();
  ctx.font = 'bold 6px monospace';
  const width = Math.ceil(ctx.measureText(text).width) + 8;
  const height = 11;
  const x = Math.round(clamp(anchor.x - width / 2, 2, WORLD.width - width - 2));
  let y = Math.round(anchor.y - height);
  if (y < 39) y = 39;
  if (y + height > WORLD.height - 2) y = WORLD.height - height - 2;
  ctx.fillStyle = BACKGROUND;
  ctx.fillRect(x, y, width, height);
  ctx.strokeStyle = BORDER;
  ctx.strokeRect(x + 0.5, y + 0.5, width, height);
  ctx.fillStyle = TEXT;
  ctx.textAlign = 'left';
  ctx.fillText(text, x + 4, y + 8);
  ctx.restore();
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
