import { D001_VISUAL_GROUND_OFFSET } from './semanticRenderState';
import { drawMeter } from './meters';
import type { FieldHint } from '../game/fieldUi';
import type { GameState, Selection } from '../game/types';
import type { InteractionTarget, Rect } from './interactionTargets';
import { sameInteractionTarget } from './interactionTargets';
import { WorldUi } from './worldUi';
import type { Locale } from '../i18n';
import { displayText } from '../i18n/display';

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
  state?: GameState,
  hint: FieldHint | null = null,
  locale: Locale = 'en',
  ui = new WorldUi(),
): void {
  ctx.save();
  ctx.lineWidth = 1;
  for (const target of targets) {
    const hovered = target.key === hoveredKey;
    const selected = sameInteractionTarget(target.ref, selection);
    const guided = target.key === guideTargetKey;
    for (const rect of target.emphasisRects) {
      if (selected || hovered) drawCornerFrame(ctx, rect, hovered, selected);
    }
    if (guided && !selected && !hovered) {
      const x = Math.round(target.labelAnchor.x); const y = Math.round(target.labelAnchor.y - 4);
      ctx.fillStyle = COLORS.selected;
      ctx.fillRect(x - 3, y - 3, 7, 1); ctx.fillRect(x - 2, y - 2, 5, 1); ctx.fillRect(x - 1, y - 1, 3, 1);
    }
    if (state && target.ref.type === 'node') {
      const id = target.ref.id;
      const node = state.run.floors[state.run.depth.current].nodes.find(node => node.id === id);
      const working = state.run.character.targetNodeId === id && state.run.character.state === 'MINING';
      if (node && node.hp > 0 && (selected || hovered || working)) {
        const rect = target.emphasisRects[0]!;
        drawMeter(ctx, { x: rect.x + 4, y: rect.y - 6, width: rect.width - 8, height: 4 }, node.hp, node.maxHp);
      }
    }
  }
  const hovered = targets.find((target) => target.key === hoveredKey);
  if (hovered && hovered.key !== guideTargetKey) drawHoverLabel(ctx, hovered, locale, ui);
  if (hint) drawFieldHint(ctx, { ...hint, y: hint.y + (state?.run.depth.current === 'D-001' ? D001_VISUAL_GROUND_OFFSET : 0) }, ui);
  ctx.restore();
}

function drawCornerFrame(ctx: CanvasRenderingContext2D, rect: Rect, hovered: boolean, selected = false): void {
  ctx.strokeStyle = hovered ? COLORS.hover : selected ? COLORS.selected : COLORS.normal;
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

function drawHoverLabel(ctx: CanvasRenderingContext2D, target: InteractionTarget, locale: Locale, ui: WorldUi): void {
  const warning = target.shortStatus && !/^(DEPLETED|TRAVELING|ASCENDING|DESCENDING|UNLOADING|LOADING|MOVING|SWINGING|COLLECTING)/.test(target.shortStatus) ? displayText(locale, target.shortStatus) : null;
  const name = displayText(locale, target.displayName);
  const text = warning ? `${name} · ${warning}` : name;
  ui.label(ctx, text, target.labelAnchor.x, target.labelAnchor.y - 8, target.primaryActionAvailable ? COLORS.available : COLORS.unavailable);
}

function crisp(value: number): number {
  return Math.round(value) + 0.5;
}

export function drawFieldHint(ctx: CanvasRenderingContext2D, hint: FieldHint, ui = new WorldUi()): void {
  ui.label(ctx, hint.text, hint.x, hint.y, COLORS.selected);
}
