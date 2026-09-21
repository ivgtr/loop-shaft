import { WORLD } from '../game/config';
import { playerInteraction } from '../game/playerControls';
import { canDispatchElevator, cargoWeight } from '../game/simulation';
import type { GameState } from '../game/types';
import { selectedWorkshopItem, workshopGuide, workshopItems, type WorkshopIcon, type WorkshopItem, type WorkshopState } from '../game/workshop';
import type { GameCommand } from '../runtime/commands';
import type { Rect } from './interactionTargets';
import { drawPixelText } from './pixelText';

export interface UiViewport { width: number; height: number; world: Rect; }
export type WorkshopUiAction = { type: 'open' | 'close' | 'buy' } | { type: 'select'; id: string } | { type: 'command'; command: GameCommand };
export interface UiButton extends Rect {
  id: string; label: string; text: string; action: WorkshopUiAction;
  disabled?: boolean; selected?: boolean; icon?: WorkshopIcon; owned?: boolean;
}
export interface WorkshopUiLayout {
  buttons: UiButton[];
  panel: Rect | null;
  compact: boolean;
  item: WorkshopItem | null;
  itemCount: string;
}
const C = { background: '#171519', surface: '#262127', line: '#74604b', light: '#d9c9ac',
  text: '#dbd3c6', muted: '#b0a397', gold: '#d5b373', installed: '#a7c3b3', disabled: '#77716c' };

/** One geometry model for the Canvas paint and its semantic input targets. All units are CSS pixels. */
export function layoutWorkshopUi(state: GameState, workshop: WorkshopState | null, viewport: UiViewport): WorkshopUiLayout {
  const { width: w, height: h, world } = viewport;
  const compact = w < 640;
  const buttons: UiButton[] = [];
  if (!workshop) {
    const send = canDispatchElevator(state);
    const reason = send ? 'F · SEND' : state.run.elevator.cargo.length === 0 ? 'LIFT EMPTY' : state.run.elevator.state.replaceAll('_', ' ');
    buttons.push({ id: 'send', label: 'SEND', text: reason, action: { type: 'command', command: { type: 'send' } },
      x: world.x + world.width / 2 - 51, y: world.y + world.height * .43, width: 102, height: 44, disabled: !send });
    const interaction = playerInteraction(state);
    if (interaction.type === 'collect' || interaction.type === 'load' || interaction.type === 'workbench') {
      const width = compact ? 144 : 168;
      buttons.push({ id: 'interact', label: interaction.type === 'collect' ? 'Pick up nearby ore' : interaction.type === 'load' ? 'Load carried ore' : 'Open Workshop',
        text: `E · ${interaction.label}`, action: interaction.type === 'workbench' ? { type: 'open' } : { type: 'command', command: { type: 'interact' } },
        disabled: interaction.reason !== null, x: clamp(world.x + state.run.character.x / WORLD.width * world.width - width / 2, 8, w - width - 8),
        y: Math.min(h - 48, world.y + world.height * .87), width, height: 44 });
    }
    const guide = workshopGuide(state);
    if (guide) buttons.push({ id: 'goal', label: 'Inspect next workshop upgrade', text: guide.label, action: { type: 'open' },
      x: 10, y: 54, width: Math.min(w - 20, 420), height: compact ? 44 : 36, selected: guide.ready });
    return { buttons, panel: null, compact, item: null, itemCount: '' };
  }
  const items = workshopItems(state);
  const item = selectedWorkshopItem(items, workshop.selectedId);
  const panel = { x: compact ? 8 : Math.round((w - Math.min(660, w - 32)) / 2),
    y: compact ? 8 : Math.max(52, Math.round((h - 328) * .35)),
    width: compact ? w - 16 : Math.min(660, w - 32), height: compact ? h - 16 : 328 };
  const add = (button: UiButton) => buttons.push(button);
  add({ id: 'close', label: 'Close workshop', text: 'X', action: { type: 'close' },
    x: panel.x + panel.width - 52, y: panel.y + 6, width: 44, height: 44 });
  const group = compact ? items : items.filter((candidate) => candidate.tab === item.tab);
  const index = group.findIndex((candidate) => candidate.id === item.id);
  const select = (offset: number): WorkshopUiAction => ({ type: 'select', id: group[(index + offset + group.length) % group.length]!.id });
  if (compact) {
    add({ id: 'previous', label: 'Previous workshop item', text: '<', action: select(-1), x: panel.x + 8, y: panel.y + 54, width: 44, height: 44 });
    add({ id: 'selected', label: item.name, text: item.name, icon: item.icon, owned: item.owned, selected: true,
      action: { type: 'select', id: item.id }, x: panel.x + 56, y: panel.y + 54, width: panel.width - 112, height: 44 });
    add({ id: 'next', label: 'Next workshop item', text: '>', action: select(1), x: panel.x + panel.width - 52, y: panel.y + 54, width: 44, height: 44 });
  } else {
    const tabs = ['equipment', 'automation', ...(items.some((i) => i.tab === 'recovered') ? ['recovered'] : [])];
    const tabWidth = 184 / tabs.length;
    tabs.forEach((tab, n) => add({ id: `tab-${tab}`, label: `${tab} workshop items`, text: tab === 'equipment' ? 'GEAR' : tab === 'automation' ? 'AUTO' : 'FINDS',
      selected: item.tab === tab, action: { type: 'select', id: items.find((i) => i.tab === tab)!.id },
      x: panel.x + 12 + n * tabWidth, y: panel.y + 56, width: tabWidth - 4, height: 44 }));
    const start = Math.floor(index / 3) * 3;
    group.slice(start, start + 3).forEach((candidate, n) => add({ id: `item-${candidate.id}`, label: candidate.name, text: candidate.name,
      selected: item.id === candidate.id, icon: candidate.icon, owned: candidate.owned, action: { type: 'select', id: candidate.id },
      x: panel.x + 12, y: panel.y + 106 + n * 48, width: 180, height: 44 }));
    if (group.length > 3) {
      add({ id: 'previous', label: 'Previous workshop item', text: '<', action: select(-1), x: panel.x + 12, y: panel.y + 270, width: 44, height: 44 });
      add({ id: 'next', label: 'Next workshop item', text: '>', action: select(1), x: panel.x + 148, y: panel.y + 270, width: 44, height: 44 });
    }
  }
  add({ id: 'buy', label: item.actionLabel, text: item.owned ? item.actionLabel : item.cost === null ? 'EQUIP' : `BUY · ${item.cost} SCRAP`,
    action: { type: 'buy' }, disabled: item.command === null, x: panel.x + (compact ? 8 : 212), y: panel.y + panel.height - 54,
    width: panel.width - (compact ? 16 : 228), height: 44 });
  return { buttons, panel, compact, item, itemCount: `${index + 1} / ${group.length}` };
}

export function drawWorkshopUi(ctx: CanvasRenderingContext2D, state: GameState, workshop: WorkshopState | null,
  viewport: UiViewport, layout: WorkshopUiLayout, focused: string | null, hovered: string | null): void {
  ctx.clearRect(0, 0, viewport.width, viewport.height);
  const { panel: p, item, compact } = layout;
  if (p && item && workshop) {
    // Small workbench window, not a page replacement. The world keeps running behind it.
    ctx.fillStyle = '#08080b66'; ctx.fillRect(0, 0, viewport.width, viewport.height);
    const benchX = viewport.world.x + WORLD.workbenchX / WORLD.width * viewport.world.width;
    const benchY = viewport.world.y + .78 * viewport.world.height;
    if (!compact && benchY > p.y + p.height) {
      ctx.strokeStyle = C.line; ctx.lineWidth = 2; ctx.beginPath();
      ctx.moveTo(benchX, p.y + p.height); ctx.lineTo(benchX, benchY); ctx.stroke();
      ctx.fillStyle = C.gold; ctx.fillRect(benchX - 3, benchY, 6, 3);
    }
    ctx.fillStyle = '#08070a'; ctx.fillRect(p.x + 4, p.y + 5, p.width, p.height);
    ctx.fillStyle = C.background; ctx.fillRect(p.x, p.y, p.width, p.height);
    ctx.strokeStyle = C.line; ctx.lineWidth = 2; ctx.strokeRect(p.x + 1, p.y + 1, p.width - 2, p.height - 2);
    ctx.fillStyle = C.surface; ctx.fillRect(p.x + 3, p.y + 3, p.width - 6, 46);
    pixel(ctx, 'WORKSHOP', p.x + 12, p.y + 15, C.gold, 2);
    text(ctx, `SCRAP ${state.run.scrap}`, p.x + p.width - 64, p.y + 26, 12, C.light, 'right');
    if (!compact) {
      ctx.strokeStyle = '#40373a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(p.x + 202.5, p.y + 56); ctx.lineTo(p.x + 202.5, p.y + p.height - 12); ctx.stroke();
      icon(ctx, item.icon, p.x + 216, p.y + 59, 2, item.owned);
      text(ctx, item.name, p.x + 251, p.y + 76, 17, C.light);
      text(ctx, item.owned ? 'FITTED' : item.tab.toUpperCase(), p.x + 212, p.y + 105, 11, item.owned ? C.installed : C.muted);
    }
    const x = p.x + (compact ? 14 : 212);
    const width = p.width - (compact ? 28 : 228);
    const top = p.y + (compact ? 121 : 131);
    text(ctx, item.comparison, x, top, compact ? 12 : 14, C.gold);
    lines(ctx, item.description, x, top + 24, width, 13, compact ? 3 : 3);
    const statusY = p.y + p.height - (compact ? 95 : 111);
    const reason = compact && workshop.notice ? `${item.name} ${item.tab === 'automation' ? 'installed' : 'equipped'}` : item.reason ?? (item.cost === null ? 'Ready to equip' : item.owned ? 'Installed' : 'Ready to fit');
    lines(ctx, reason, x, statusY, width, 12, 2, item.owned ? C.installed : C.muted);
    if (workshop.notice && !compact) lines(ctx, workshop.notice, x, p.y + p.height - 78, width, 11, 1, C.installed);
    if (!compact && layout.buttons.some((b) => b.id === 'previous')) text(ctx, layout.itemCount, p.x + 104, p.y + 297, 11, C.muted, 'center');
  }
  for (const button of layout.buttons) drawButton(ctx, button, focused === button.id || hovered === button.id, compact);
  if (!p) {
    const send = layout.buttons.find((button) => button.id === 'send');
    if (send) text(ctx, `${Number(cargoWeight(state.run.elevator.cargo).toFixed(1))}/${state.run.elevator.maxLoad} kg`,
      send.x + send.width / 2, send.y + send.height + 13, 11, C.light, 'center');
  }
}

function drawButton(ctx: CanvasRenderingContext2D, b: UiButton, focused: boolean, compact: boolean): void {
  ctx.fillStyle = b.disabled ? '#19171b' : b.selected ? '#3b3025' : '#282228'; ctx.fillRect(b.x, b.y, b.width, b.height);
  ctx.strokeStyle = focused ? C.light : b.selected ? C.gold : '#594a42'; ctx.lineWidth = focused ? 2 : 1;
  ctx.strokeRect(Math.round(b.x) + .5, Math.round(b.y) + .5, Math.round(b.width) - 1, Math.round(b.height) - 1);
  if (b.icon) {
    icon(ctx, b.icon, b.x + 7, b.y + 8, 2, Boolean(b.owned));
    const available = b.width - 42;
    lines(ctx, b.text, b.x + 38, b.y + 18, available, 11, 2, C.text);
    if (b.owned) { ctx.fillStyle = C.installed; ctx.fillRect(b.x + b.width - 7, b.y + 4, 3, 3); }
  } else if (b.id === 'goal') {
    lines(ctx, b.text, b.x + 10, b.y + (compact ? 17 : 23), b.width - 20, 12, compact ? 2 : 1, C.gold);
  } else {
    const label = elide(ctx, b.text, b.width - 14, 12);
    text(ctx, label, b.x + b.width / 2, b.y + b.height / 2 + 4, 12, b.disabled ? C.disabled : C.light, 'center');
  }
}

function text(ctx: CanvasRenderingContext2D, label: string, x: number, y: number, size: number, color: string = C.text, align: CanvasTextAlign = 'left'): void {
  ctx.font = `${size}px "Cascadia Mono", Consolas, monospace`; ctx.textAlign = align; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = color;
  ctx.fillText(label, Math.round(x), Math.round(y));
}
function pixel(ctx: CanvasRenderingContext2D, label: string, x: number, y: number, color: string, scale: number): void {
  ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.scale(scale, scale); ctx.fillStyle = color;
  drawPixelText(ctx, label, 0, 0, { baseline: 'top' }); ctx.restore();
}
function lines(ctx: CanvasRenderingContext2D, label: string, x: number, y: number, width: number, size: number, max: number, color: string = C.text): void {
  ctx.font = `${size}px "Cascadia Mono", Consolas, monospace`;
  const words = label.split(' '); const output: string[] = []; let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > width && line) { output.push(line); line = word; } else line = next;
  }
  if (line) output.push(line);
  output.slice(0, max).forEach((value, i) => text(ctx, i === max - 1 && output.length > max ? elide(ctx, `${value} …`, width, size) : value, x, y + i * (size + 3), size, color));
}
function elide(ctx: CanvasRenderingContext2D, label: string, width: number, size: number): string {
  ctx.font = `${size}px "Cascadia Mono", Consolas, monospace`;
  if (ctx.measureText(label).width <= width) return label;
  let result = label;
  while (result.length && ctx.measureText(`${result}…`).width > width) result = result.slice(0, -1);
  return `${result}…`;
}
function icon(ctx: CanvasRenderingContext2D, kind: WorkshopIcon, x: number, y: number, scale: number, owned: boolean): void {
  ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.scale(scale, scale);
  ctx.fillStyle = owned ? '#bac4bc' : '#b39369';
  if (kind === 'pick' || kind === 'swing') {
    ctx.fillRect(2, 2, 10, 2); ctx.fillRect(1, 4, 3, 2); ctx.fillRect(11, 4, 2, 2);
    ctx.fillStyle = '#806247'; ctx.fillRect(6, 4, 2, 10);
    if (kind === 'swing') { ctx.fillStyle = C.gold; ctx.fillRect(10, 9, 4, 2); ctx.fillRect(12, 7, 2, 2); }
  } else if (kind === 'boots') {
    ctx.fillRect(1, 3, 4, 8); ctx.fillRect(1, 10, 6, 3); ctx.fillRect(8, 1, 4, 8); ctx.fillRect(8, 8, 6, 3);
  } else if (kind === 'pack') {
    ctx.fillRect(2, 3, 10, 11); ctx.fillRect(4, 1, 6, 2); ctx.fillStyle = '#4d4238'; ctx.fillRect(4, 8, 6, 4);
  } else if (kind === 'porter') {
    ctx.fillRect(4, 1, 6, 5); ctx.fillRect(3, 7, 8, 5); ctx.fillRect(3, 12, 3, 3); ctx.fillRect(8, 12, 3, 3);
    ctx.fillStyle = '#8b724f'; ctx.fillRect(0, 7, 3, 6);
  } else { ctx.fillRect(4, 1, 6, 3); ctx.fillRect(2, 4, 10, 9); ctx.fillStyle = C.gold; ctx.fillRect(5, 6, 4, 5); }
  ctx.restore();
}
function clamp(value: number, min: number, max: number): number { return Math.max(min, Math.min(max, value)); }
