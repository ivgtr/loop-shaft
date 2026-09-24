import { WORLD } from '../game/config';
import type { GameState } from '../game/types';
import { selectedWorkshopItem, workshopItems, type WorkshopIcon, type WorkshopItem, type WorkshopState } from '../game/workshop';
import type { GameCommand } from '../runtime/commands';
import type { Rect } from './interactionTargets';
import { UI_LINE_HEIGHT, uiFont, wrapUiText } from './uiTypography';
import type { Locale } from '../i18n';
import { displayText, localizeDisplayModel } from '../i18n/display';

export interface UiViewport { width: number; height: number; world: Rect; }
export type WorkshopUiAction = { type: 'station-open'; request: import('../game/management').StationRequest } | { type: 'open' | 'close' | 'buy' } | { type: 'select'; id: string } | { type: 'command'; command: GameCommand };
export interface UiButton<Action = WorkshopUiAction> extends Rect {
  id: string; label: string; text: string; action: Action;
  disabled?: boolean; selected?: boolean; tone?: 'primary' | 'quiet'; busy?: boolean; icon?: WorkshopIcon; owned?: boolean; badge?: string; detail?: string;
}
export interface WorkshopUiLayout {
  buttons: UiButton[];
  panel: Rect | null;
  compact: boolean;
  item: WorkshopItem | null;
  itemCount: string;
}
export const C = { background: '#171519', surface: '#262127', line: '#74604b', light: '#d9c9ac',
  text: '#dbd3c6', muted: '#b0a397', gold: '#d5b373', installed: '#a7c3b3', disabled: '#77716c', warning: '#e3aa89' };

/** One geometry model for the Canvas paint and its semantic input targets. All units are CSS pixels. */
export function layoutWorkshopUi(state: GameState, workshop: WorkshopState | null, viewport: UiViewport, locale: Locale = 'en'): WorkshopUiLayout {
  const { width: w, height: h } = viewport;
  const compact = w < 680;
  const buttons: UiButton[] = [];
  if (!workshop) return { buttons, panel: null, compact, item: null, itemCount: '' };
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
  add({ id: 'buy', label: item.actionLabel, text: item.id === 'recovered-gear' ? 'INSPECT GEAR' : item.owned ? item.actionLabel : item.cost === null ? 'EQUIP' : `BUY · ${item.cost} SCRAP`,
    action: item.id === 'recovered-gear' ? { type: 'station-open', request: { station: 'equipment' } } : { type: 'buy' }, disabled: item.id !== 'recovered-gear' && item.command === null, x: panel.x + (compact ? 8 : 212), y: panel.y + panel.height - 54,
    width: panel.width - (compact ? 16 : 228), height: 44 });
  return localizeDisplayModel(locale, { buttons, panel, compact, item, itemCount: `${index + 1} / ${group.length}` });
}

export function drawWorkshopUi(ctx: CanvasRenderingContext2D, state: GameState, workshop: WorkshopState | null,
  viewport: UiViewport, layout: WorkshopUiLayout, focused: string | null, hovered: string | null, locale: Locale = 'en'): void {
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
    text(ctx, displayText(locale, 'WORKSHOP'), p.x + 12, p.y + 29, 16, C.gold);
    text(ctx, `${displayText(locale, 'SCRAP')} ${state.run.scrap}`, p.x + p.width - 64, p.y + 26, 12, C.light, 'right');
    if (!compact) {
      ctx.strokeStyle = '#40373a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(p.x + 202.5, p.y + 56); ctx.lineTo(p.x + 202.5, p.y + p.height - 12); ctx.stroke();
      icon(ctx, item.icon, p.x + 214, p.y + 57, 3, item.owned);
      text(ctx, item.name, p.x + 270, p.y + 80, 17, C.light);

    }
    const x = p.x + (compact ? 14 : 212);
    const width = p.width - (compact ? 28 : 228);
    const top = p.y + (compact ? 121 : 131);
    text(ctx, item.comparison, x, top, compact ? 12 : 14, C.gold);
    lines(ctx, item.description, x, top + 24, width, 13, compact ? 3 : 3);
    const statusY = p.y + p.height - (compact ? 95 : 111);
    if (!item.owned && item.reason) lines(ctx, item.reason, x, statusY, width, 12, 2, C.warning);
    // Owned marker and action already express fitted/active state. Only announce a purchase once.
    if (workshop.notice) lines(ctx, displayText(locale, workshop.notice), x, p.y + p.height - 78, width, 11, 1, C.installed);
    if (!compact && layout.buttons.some((b) => b.id === 'previous')) text(ctx, layout.itemCount, p.x + 104, p.y + 297, 11, C.muted, 'center');
  }
  for (const button of layout.buttons) drawButton(ctx, button, focused === button.id, compact, hovered === button.id);
}

export function drawButton<Action>(ctx: CanvasRenderingContext2D, b: UiButton<Action>, focused: boolean, compact: boolean, hovered = false): void {
  const dimmed = b.disabled && !b.busy;
  ctx.fillStyle = dimmed ? '#19171b' : b.selected || b.tone === 'primary' ? '#3b3025' : hovered ? '#302a2e' : b.tone === 'quiet' ? C.background : '#282228'; ctx.fillRect(b.x, b.y, b.width, b.height);
  ctx.strokeStyle = focused ? C.light : b.selected || (b.tone === 'primary' && !dimmed) ? C.gold : b.tone === 'quiet' && !hovered ? C.background : '#594a42'; ctx.lineWidth = focused ? 2 : 1;
  ctx.strokeRect(Math.round(b.x) + .5, Math.round(b.y) + .5, Math.round(b.width) - 1, Math.round(b.height) - 1);
  if (b.badge || b.detail) {
    text(ctx, elide(ctx, b.text, b.width - 16, 12), b.x + 8, b.y + 18, 12, C.light);
    if (b.detail) text(ctx, elide(ctx, b.detail, b.width - 16, 11), b.x + 8, b.y + 36, 11, C.muted);
    if (b.badge) {
      const statusColor = ['LOCKED', 'STORED', 'INACTIVE', 'CANDIDATE'].includes(b.badge) ? C.muted
        : b.badge.includes('JAM') || b.badge.includes('BLOCK') ? C.warning : C.installed;
      ctx.fillStyle = statusColor; ctx.fillRect(b.x + 8, b.y + b.height - 15, 4, 4);
      text(ctx, elide(ctx, b.width < 85 && b.badge === 'ACTIVE' ? 'ON' : b.badge, b.width - 26, 11), b.x + 18, b.y + b.height - 9, 11, statusColor);
    }
  } else if (b.icon) {
    icon(ctx, b.icon, b.x + 7, b.y + 8, 2, Boolean(b.owned));
    const available = b.width - 42;
    lines(ctx, b.text, b.x + 38, b.y + 17, available, 16, 2, C.text);
    if (b.owned) { ctx.fillStyle = C.installed; ctx.fillRect(b.x + b.width - 7, b.y + 4, 3, 3); }
  } else if (b.id === 'goal') {
    lines(ctx, b.text, b.x + 10, b.y + (compact ? 17 : 23), b.width - 20, 12, compact ? 2 : 1, C.gold);
  } else {
    const label = elide(ctx, b.text, b.width - 14, 12);
    const color = dimmed ? C.disabled : b.tone === 'quiet' ? C.muted : C.light;
    const rows = label === b.text ? [label] : wrapUiText(b.text, b.width - 14);
    rows.slice(0, 2).forEach((row, index) => text(ctx,
      index === 1 && rows.length > 2 ? elide(ctx, `${row}…`, b.width - 14, 16) : row,
      b.x + b.width / 2, b.y + b.height / 2 + 4 + (rows.length > 1 ? index * UI_LINE_HEIGHT - 10 : 0), 16, color, 'center'));
  }
}

export function text(ctx: CanvasRenderingContext2D, label: string, x: number, y: number, size: number, color: string = C.text, align: CanvasTextAlign = 'left'): void {
  ctx.font = uiFont(size); ctx.textAlign = align; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = color;
  ctx.fillText(label, Math.round(x), Math.round(y));
}
export function lines(ctx: CanvasRenderingContext2D, label: string, x: number, y: number, width: number, size: number, max: number, color: string = C.text): void {
  ctx.font = uiFont(size);
  const output = wrapUiText(label, width);
  output.slice(0, max).forEach((value, i) => text(ctx, i === max - 1 && output.length > max ? elide(ctx, `${value} …`, width, size) : value, x, y + i * UI_LINE_HEIGHT, size, color));
}
export function elide(ctx: CanvasRenderingContext2D, label: string, width: number, size: number): string {
  ctx.font = uiFont(size);
  if (ctx.measureText(label).width <= width) return label;
  const result = Array.from(label);
  while (result.length && ctx.measureText(`${result.join('')}…`).width > width) result.pop();
  return `${result.join('')}…`;
}
export function icon(ctx: CanvasRenderingContext2D, kind: WorkshopIcon, x: number, y: number, scale: number, owned: boolean): void {
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
