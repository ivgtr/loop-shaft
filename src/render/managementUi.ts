import { selectedStationItem, stationView, type ManagementState, type StationItem, type StationRequest } from '../game/management';
import type { GameState } from '../game/types';
import type { Rect } from './interactionTargets';
import { C, drawButton, elide, text, type UiButton, type UiViewport } from './workshopUi';

export type ManagementUiAction = { type: 'station-open'; request: StationRequest }
  | { type: 'station-close' | 'station-back' | 'station-activate' | 'station-cancel-confirm' }
  | { type: 'station-tab'; tab: string } | { type: 'station-select'; id: string }
  | { type: 'station-page'; page: number };
export interface ManagementLayout {
  buttons: UiButton<ManagementUiAction>[]; panel: Rect; compact: boolean; item: StationItem;
  title: string; textBox: Rect; pages: string[][]; page: number; count: string; confirming: boolean;
}

/** Font is monospace at 12 CSS px. Conservative 8px cells leave room for fallback fonts.
 * Long tokens are split too. Every line is kept and paged, not silently ellipsized. */
export function wrapDetails(paragraphs: string[], width: number): string[] {
  const limit = Math.max(1, Math.floor(width / 8));
  return paragraphs.flatMap((paragraph) => {
    const output: string[] = []; let remaining = paragraph;
    while (remaining.length > limit) {
      const space = remaining.lastIndexOf(' ', limit);
      const cut = space > limit / 3 ? space : limit;
      output.push(remaining.slice(0, cut)); remaining = remaining.slice(cut).trimStart();
    }
    if (remaining) output.push(remaining);
    return output;
  });
}
export function layoutManagementUi(state: GameState, ui: ManagementState, viewport: UiViewport): ManagementLayout {
  const { width: w, height: h } = viewport; const compact = w < 640;
  const p = { x: compact ? 8 : (w - Math.min(720, w - 32)) / 2, y: compact ? 8 : Math.max(8, (h - 420) / 2),
    width: compact ? Math.max(0, w - 16) : Math.min(720, w - 32), height: compact ? Math.max(0, h - 16) : Math.min(420, h - 16) };
  const view = stationView(state, ui); const item = selectedStationItem(state, ui);
  const confirming = Boolean(ui.confirmation && ui.confirmation === item.confirmKey && item.action && !item.reason);
  const buttons: UiButton<ManagementUiAction>[] = [];
  const add = (id: string, label: string, action: ManagementUiAction, x: number, y: number, width: number, selected?: boolean, disabled?: boolean, short = label) =>
    buttons.push({ id, label, text: short, action, x, y, width, height: 44, selected, disabled });
  add('station-close', 'Close facility', { type: 'station-close' }, p.x + p.width - 52, p.y + 6, 44, undefined, false, 'X');
  if (confirming) add('station-cancel', 'Cancel confirmation', { type: 'station-cancel-confirm' }, p.x + 8, p.y + 6, 44, undefined, false, '<');
  else if (view.back) add('station-back', 'Back to previous facility', { type: 'station-back' }, p.x + 8, p.y + 6, 44, undefined, false, '<');
  const listY = compact && !view.tabs.length ? 56 : 106;
  if (!confirming) {
    view.tabs.forEach((tab, n) => add(`station-tab-${tab.id}`, tab.label, { type: 'station-tab', tab: tab.id },
      p.x + 8 + n * (p.width - 16) / view.tabs.length, p.y + 56, (p.width - 16) / view.tabs.length - 4, ui.tab === tab.id));
    const index = view.items.findIndex((candidate) => candidate.id === item.id);
    const choose = (offset: number): ManagementUiAction => ({ type: 'station-select', id: view.items[(index + offset + view.items.length) % view.items.length]!.id });
    if (compact) {
      add('station-previous', 'Previous item', choose(-1), p.x + 8, p.y + listY, 44, undefined, view.items.length < 2, '<');
      add('station-selected', item.name, { type: 'station-select', id: item.id }, p.x + 56, p.y + listY, p.width - 112, true);
      add('station-next', 'Next item', choose(1), p.x + p.width - 52, p.y + listY, 44, undefined, view.items.length < 2, '>');
    } else {
      const start = Math.floor(index / 4) * 4;
      view.items.slice(start, start + 4).forEach((candidate, n) => add(`station-item-${candidate.id}`, candidate.name,
        { type: 'station-select', id: candidate.id }, p.x + 12, p.y + 108 + n * 48, 200, item.id === candidate.id));
      add('station-previous', 'Previous item', choose(-1), p.x + 12, p.y + p.height - 64, 44, undefined, view.items.length < 2, '<');
      add('station-next', 'Next item', choose(1), p.x + 168, p.y + p.height - 64, 44, undefined, view.items.length < 2, '>');
    }
  }
  const textBox = { x: p.x + (compact || confirming ? 14 : 236), y: p.y + (confirming ? 68 : compact ? listY + 63 : 124),
    width: p.width - (compact || confirming ? 28 : 252), height: p.height - (confirming ? 68 : compact ? listY + 63 : 124) - 114 };
  const paragraphs = [confirming ? `CONFIRM: ${item.name}` : item.name, item.summary,
    ...(item.reason ? [item.reason] : []), ...(ui.notice ? [ui.notice] : []), ...item.lines];
  const wrapped = wrapDetails(paragraphs, textBox.width); const perPage = Math.max(1, Math.floor(textBox.height / 16));
  const pages: string[][] = [];
  for (let i = 0; i < wrapped.length; i += perPage) pages.push(wrapped.slice(i, i + perPage));
  if (!pages.length) pages.push([]);
  const page = Math.min(ui.detailPage, pages.length - 1);
  const actionX = p.x + (compact || confirming ? 8 : 236); const actionWidth = p.width - (compact || confirming ? 16 : 252);
  add('station-page-prev', 'Previous detail page', { type: 'station-page', page: Math.max(0, page - 1) }, actionX, p.y + p.height - 104, 44, undefined, page === 0, '<');
  add('station-page-next', 'Next detail page', { type: 'station-page', page: Math.min(pages.length - 1, page + 1) }, actionX + actionWidth - 44, p.y + p.height - 104, 44, undefined, page === pages.length - 1, '>');
  add('station-activate', confirming ? ui.station === 'reboot' ? 'CONFIRM REBOOT' : 'CONFIRM CHOICE' : item.actionLabel,
    { type: 'station-activate' }, actionX, p.y + p.height - 54, actionWidth, undefined, !item.action || Boolean(item.reason));
  return { buttons, panel: p, compact, item, title: confirming ? 'CONFIRM' : view.title, textBox, pages, page, confirming,
    count: `${view.items.findIndex((candidate) => candidate.id === item.id) + 1}/${view.items.length}` };
}

export function drawManagementUi(ctx: CanvasRenderingContext2D, viewport: UiViewport, layout: ManagementLayout, focused: string | null, hovered: string | null): void {
  const { panel: p, textBox: box } = layout;
  ctx.clearRect(0, 0, viewport.width, viewport.height);
  ctx.fillStyle = '#08080b88'; ctx.fillRect(0, 0, viewport.width, viewport.height);
  ctx.fillStyle = C.background; ctx.fillRect(p.x, p.y, p.width, p.height);
  ctx.strokeStyle = C.line; ctx.lineWidth = 2; ctx.strokeRect(p.x + 1, p.y + 1, p.width - 2, p.height - 2);
  ctx.fillStyle = C.surface; ctx.fillRect(p.x + 3, p.y + 3, p.width - 6, 46);
  text(ctx, elide(ctx, layout.title, p.width - 124, 14), p.x + 60, p.y + 32, 14, C.gold);
  layout.pages[layout.page]!.forEach((line, n) => text(ctx, line, box.x, box.y + n * 16, 12, n === 0 && layout.page === 0 ? C.gold : C.text));
  const prev = layout.buttons.find((button) => button.id === 'station-page-prev')!;
  const next = layout.buttons.find((button) => button.id === 'station-page-next')!;
  text(ctx, `DETAIL ${layout.page + 1}/${layout.pages.length}`, (prev.x + next.x + 44) / 2, prev.y + 27, 12, C.muted, 'center');
  if (!layout.compact && !layout.confirming) text(ctx, layout.count, p.x + 111, p.y + p.height - 38, 12, C.muted, 'center');
  for (const button of layout.buttons) drawButton(ctx, button, focused === button.id || hovered === button.id, layout.compact);
}
