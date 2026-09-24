import { WORLD } from '../game/config';
import type { InitialLogisticsGuide } from '../game/initialLogisticsGuide';
import type { GameState } from '../game/types';
import { sameInteractionTarget, type InteractionTarget, type Point } from './interactionTargets';
import { WorldUi } from './worldUi';
import { formatDisplay } from '../i18n/display';


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
  ui = new WorldUi(),
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
  ui.label(ctx, label, anchor.x, anchor.y);
}

export function drawDeliveryNotice(ctx: CanvasRenderingContext2D, amount: number, locale: 'en' | 'ja' = 'en', ui = new WorldUi()): void {
  ui.label(ctx, formatDisplay(locale, 'shipment.delivered', { amount }), WORLD.elevatorX, WORLD.topY + 25);
}
