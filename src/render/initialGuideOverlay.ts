import { WORLD } from '../game/config';
import type { InitialLogisticsGuide } from '../game/initialLogisticsGuide';
import type { GameState } from '../game/types';
import { sameInteractionTarget, type InteractionTarget, type Point } from './interactionTargets';
import { drawPixelText, fitPixelFont, measurePixelText } from './pixelText';
import { formatDisplay } from '../i18n/display';

const BACKGROUND = '#0b0b0df0';
const BORDER = '#916a4e';
const TEXT = '#d8d2c8';

export function initialGuideTargetKey(
  guide: InitialLogisticsGuide | null,
  targets: readonly InteractionTarget[],
): string | null {
  if (!guide || guide.target.kind !== 'interaction') return null;
  const ref = guide.target.ref;
  return targets.find((target) => sameInteractionTarget(target.ref, ref))?.key ?? null;
}

/** The context panel keeps every instruction; world labels ask for an action or
 * explain a blockage instead of narrating work that is already visible. */
export function initialGuideLabel(guide: InitialLogisticsGuide): string | null {
  switch (guide.step) {
    case 'moving-to-vein':
    case 'mining':
    case 'collecting':
    case 'returning':
    case 'loading-lift':
    case 'to-surface':
    case 'appraising':
      return null;
    case 'choose-vein':
      return 'SELECT VEIN';
    default:
      return guide.label;
  }
}

export function drawInitialLogisticsGuide(
  ctx: CanvasRenderingContext2D,
  guide: InitialLogisticsGuide,
  targets: readonly InteractionTarget[],
  state: GameState,
): void {
  const label = initialGuideLabel(guide);
  if (!label) return;
  let anchor: Point | undefined;
  if (guide.target.kind === 'character') {
    anchor = { x: Math.round(state.run.character.x), y: Math.round(state.run.character.y) + 8 - 32 };
  } else {
    const ref = guide.target.ref;
    anchor = targets.find((target) => sameInteractionTarget(target.ref, ref))?.labelAnchor;
  }
  if (!anchor) return;
  drawGuideLabel(ctx, label, anchor);
}

export function drawDeliveryNotice(ctx: CanvasRenderingContext2D, amount: number, locale: 'en' | 'ja' = 'en'): void {
  drawGuideLabel(ctx, formatDisplay(locale, 'shipment.delivered', { amount }), { x: WORLD.elevatorX, y: WORLD.topY + 25 });
}

function drawGuideLabel(ctx: CanvasRenderingContext2D, text: string, anchor: Point): void {
  ctx.save();
  const font = fitPixelFont(text, WORLD.width - 12);
  const width = measurePixelText(text, font) + 8;
  const height = 11;
  const x = Math.round(clamp(anchor.x - width / 2, 2, WORLD.width - width - 2));
  let y = Math.round(anchor.y - height);
  if (y < 39) y = 39;
  if (y + height > WORLD.height - 2) y = WORLD.height - height - 2;
  ctx.fillStyle = BACKGROUND;
  ctx.fillRect(x, y, width, height);
  ctx.fillStyle = BORDER;
  ctx.fillRect(x, y + height - 1, width, 1);
  ctx.fillStyle = TEXT;
  drawPixelText(ctx, text, x + 4, y + 8, { font, baseline: 'bottom' });
  ctx.restore();
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
