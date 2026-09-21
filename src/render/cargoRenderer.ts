import type { LootStack } from '../game/types';
import { cargoVisualClass } from './semanticRenderState';
import { drawDiscoveryArt, type CargoFrame } from './assets/discoveryArt';

type VisibleCargo = Pick<LootStack, 'kind' | 'category' | 'equipmentSeed' | 'quality' | 'specimen'>;

/** Only public information may affect a cargo sprite. A sealed specimen hides even its species. */
export function cargoFrame(item: VisibleCargo): CargoFrame {
  if (item.specimen) return 'specimen';
  const kind = cargoVisualClass(item);
  const quality = item.category === 'ORE' ? item.quality ?? 'NORMAL' : 'NORMAL';
  const grade = { NORMAL: 'normal', FINE: 'fine', PURE: 'pure' }[quality] as 'normal' | 'fine' | 'pure';
  if (kind === 'rock') return `stone-${grade}`;
  if (kind === 'metal') return `iron-${grade}`;
  if (kind === 'copper') return `copper-${grade}`;
  return kind;
}

/** 12x10 pixels, bottom-centre anchored, shared by every physical owner and depth. */
export function drawPhysicalCargo(ctx: CanvasRenderingContext2D, item: VisibleCargo, anchorX: number, anchorY: number): void {
  drawDiscoveryArt(ctx, 'cargo', cargoFrame(item), Math.round(anchorX) - 6, Math.round(anchorY) - 10);
}

export function drawCarriedCargo(
  ctx: CanvasRenderingContext2D,
  actor: { readonly carried: readonly VisibleCargo[]; readonly facing: -1 | 1; readonly worldAnchor: { readonly x: number; readonly y: number } },
): void {
  for (let index = Math.min(3, actor.carried.length) - 1; index >= 0; index--) {
    drawPhysicalCargo(ctx, actor.carried[index]!, actor.worldAnchor.x + actor.facing * (8 + index * 2),
      actor.worldAnchor.y - 7 - index * 3);
  }
}

export function drawLiftCargo(ctx: CanvasRenderingContext2D, items: readonly VisibleCargo[], centerX: number, deckY: number): void {
  for (let index = Math.min(9, items.length) - 1; index >= 0; index--) {
    drawPhysicalCargo(ctx, items[index]!, centerX - 8 + (index % 3) * 9, deckY - Math.floor(index / 3) * 6);
  }
}

export function drawCompactCargo(ctx: CanvasRenderingContext2D, items: readonly VisibleCargo[], centerX: number, deckY: number): void {
  // The small cart/cage has one 12px-wide stack. First owned cargo stays in front.
  for (let index = Math.min(3, items.length) - 1; index >= 0; index--) {
    drawPhysicalCargo(ctx, items[index]!, centerX, deckY - index * 4);
  }
}
