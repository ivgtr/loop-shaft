import { toolSpriteRow } from './workEquipment';
import type { D001AssetStore } from './d001ImageRenderer';
import { collectionSpriteFrame, DISCOVERY_ATLAS } from './discoveryVisuals';
import { stationView, type ManagementState, type StationItem, type StationRequest } from '../game/management';
import { number, type RouteStop, type StationView } from '../game/management/types';
import type { GameState } from '../game/types';
import type { Rect } from './interactionTargets';
import { C, drawButton, elide, icon, text, type UiButton, type UiViewport } from './workshopUi';

export type ManagementUiAction = { type: 'station-open'; request: StationRequest }
  | { type: 'station-close' | 'station-back' | 'station-activate' | 'station-cancel-confirm' | 'station-details' }
  | { type: 'station-tab'; tab: string } | { type: 'station-select'; id: string }
  | { type: 'station-option'; id: string } | { type: 'station-page'; page: number };
interface TextRun { label: string; x: number; y: number; width: number; size: number; color: string; essential?: boolean; }
interface ProgressBar { box: Rect; value: number; total: number; label: string; }
export interface ManagementLayout {
  buttons: UiButton<ManagementUiAction>[]; panel: Rect; compact: boolean; item: StationItem;
  title: string; textBox: Rect; pages: string[][]; page: number; count: string; confirming: boolean;
  texts: TextRun[]; bars: ProgressBar[]; route: { box: Rect; stop: RouteStop }[];
  gear: { box: Rect; current: boolean }[]; gallery: Map<string, StationItem>;
  essentialBox: Rect | null; reading: boolean; detailsAvailable: boolean;
}

/** Conservative cells are deliberately wider than the 12px monospace glyphs.
 * Every paragraph is available in details, including words longer than a line. */
export function wrapDetails(paragraphs: string[], width: number): string[] {
  const limit = Math.max(1, Math.floor(width / 8));
  return paragraphs.flatMap((paragraph) => {
    const output: string[] = []; let remaining = paragraph;
    while (remaining.length > limit) {
      const space = remaining.lastIndexOf(' ', limit); const cut = space > limit / 3 ? space : limit;
      output.push(remaining.slice(0, cut)); remaining = remaining.slice(cut).trimStart();
    }
    if (remaining) output.push(remaining);
    return output;
  });
}

export function layoutManagementUi(state: GameState, ui: ManagementState, viewport: UiViewport): ManagementLayout {
  const { width: w, height: h } = viewport; const compact = w < 680;
  const p = { x: compact ? 8 : (w - Math.min(840, w - 32)) / 2, y: compact ? 8 : Math.max(8, (h - 520) / 2),
    width: compact ? Math.max(0, w - 16) : Math.min(840, w - 32), height: compact ? Math.max(0, h - 16) : Math.min(520, h - 16) };
  const view = stationView(state, ui); const item = view.items.find((candidate) => candidate.id === ui.selectedId) ?? view.items[0]!;
  const index = view.items.indexOf(item);
  const confirming = Boolean(ui.confirmation && ui.confirmation === item.confirmKey && item.action && !item.reason);
  const decision = item.decision && (confirming || ui.station === 'reboot') ? item.decision : undefined;
  const solo = Boolean(decision) || view.items.length === 1;
  const buttons: UiButton<ManagementUiAction>[] = []; const texts: TextRun[] = []; const bars: ProgressBar[] = [];
  const route: ManagementLayout['route'] = []; const gear: ManagementLayout['gear'] = []; const gallery = new Map<string, StationItem>();
  const add = (id: string, label: string, action: ManagementUiAction, box: Rect, selected?: boolean, disabled?: boolean, short = label, badge?: string, detail?: string) => {
    buttons.push({ id, label, text: short, action, ...box, selected, disabled, badge, detail });
  };
  const box = (x: number, y: number, width: number, height = 44): Rect => ({ x, y, width, height });
  const put = (label: string, x: number, y: number, width: number, color: string = C.text, size = 12, essential = false) => {
    texts.push({ label, x, y, width, size, color, essential });
  };
  const paragraph = (label: string, area: Rect, y: number, color: string = C.text, essential = false): number => {
    for (const line of wrapDetails([label], area.width)) { put(line, area.x, y, area.width, color, 12, essential); y += 17; }
    return y;
  };
  add('station-close', 'Close facility', { type: 'station-close' }, box(p.x + p.width - 52, p.y + 6, 44), undefined, false, 'X');
  if (!confirming && view.back) add('station-back', 'Back to previous facility', { type: 'station-back' }, box(p.x + 8, p.y + 6, 44), undefined, false, '<');

  const leftWidth = 220;
  const hasSidebar = !compact && (!solo || Boolean(view.roster));
  const main = { x: p.x + (hasSidebar ? leftWidth + 28 : 14), y: p.y + 66,
    width: p.width - (hasSidebar ? leftWidth + 44 : 28), height: 0 };
  let top = p.y + 56;
  if (!confirming && view.roster) {
    const workerIndex = Math.max(0, view.roster.findIndex((worker) => worker.id === ui.subjectId));
    if (compact) {
      const rows = h >= 740 ? 4 : 2;
      const start = Math.floor(workerIndex / rows) * rows;
      const visible = view.roster.slice(start, start + rows);
      visible.forEach((worker, n) => add(`station-worker-${worker.id}`, `${worker.name}, ${worker.location}, ${worker.task}, ${worker.priority}`,
        { type: 'station-open', request: { station: 'crew', subjectId: worker.id, tab: ui.tab } },
        box(p.x + 8, top + n * 62, p.width - 16, 58), worker.id === ui.subjectId, false, worker.name, worker.priority, `${worker.location} · ${worker.task}`));
      top += visible.length * 62;
      if (view.roster.length > rows) {
        const next = view.roster[(start + rows) % view.roster.length]!;
        add('station-worker-next', 'Next workers page', { type: 'station-open', request: { station: 'crew', subjectId: next.id, tab: ui.tab } },
          box(p.x + 8, top, 88), undefined, false, `${start + 1}-${start + visible.length}/${view.roster.length} >`);
      } else put(`CREW ${view.roster.length}/${state.run.phase5.crew.slots}`, p.x + 12, top + 26, 96, C.muted);
    } else {
      view.roster.forEach((worker, n) => add(`station-worker-${worker.id}`, `${worker.name}, ${worker.location}, ${worker.task}, ${worker.priority}`,
        { type: 'station-open', request: { station: 'crew', subjectId: worker.id, tab: ui.tab } }, box(p.x + 12, top + 52 + n * 68, leftWidth, 64), worker.id === ui.subjectId, false,
        worker.name, worker.priority, `${worker.location} · ${worker.task}`));
      put('SHIFT ROSTER', p.x + 12, top + 26, leftWidth, C.gold);
    }
    const toolbarY = compact ? top : p.y + p.height - 62;
    const toolbarX = compact ? p.x + 106 : p.x + 12;
    const toolbarW = compact ? (p.width - 122) / 2 : (leftWidth - 4) / 2;
    add('station-hire', 'Hire workers', { type: 'station-open', request: { station: 'crew', tab: 'hire' } }, box(toolbarX, toolbarY, toolbarW), undefined, false, 'HIRE');
    add('station-routes', 'Cargo routes', { type: 'station-open', request: { station: 'crew', tab: 'routes' } }, box(toolbarX + toolbarW + 4, toolbarY, toolbarW), undefined, false, 'ROUTES');
    if (compact) top += 50;
  }
  if (!confirming && view.tabs.length) {
    const tabsX = view.roster && !compact ? main.x : p.x + 8;
    const tabsW = view.roster && !compact ? main.width : p.width - 16;
    view.tabs.forEach((tab, n) => add(`station-tab-${tab.id}`, tab.label, { type: 'station-tab', tab: tab.id },
      box(tabsX + n * tabsW / view.tabs.length, top, tabsW / view.tabs.length - 4), ui.tab === tab.id));
    top += 52;
  }

  // Text uses an alphabetic baseline; keep its glyphs below the tabs, not on their edge.
  let contentTop = decision ? p.y + 66 : solo || (!compact && !view.roster) ? top + 14 : top;
  if (!confirming && (!solo || view.roster)) {
    const groupName = itemGroup(ui, view);
    if (compact || view.roster) {
      if (view.gallery) {
        const columns = compact ? 3 : 2; const perPage = compact ? 6 : 8;
        const start = Math.floor(index / perPage) * perPage; const cellWidth = (p.width - 24) / columns;
        view.items.slice(start, start + perPage).forEach((candidate, n) => {
          const id = `station-item-${candidate.id}`;
          add(id, candidate.name, { type: 'station-select', id: candidate.id }, box(p.x + 10 + n % columns * cellWidth, top + Math.floor(n / columns) * 68, cellWidth - 4, 64), candidate.id === item.id);
          gallery.set(id, candidate);
        });
        contentTop = top + 140;
        add('station-previous', 'Previous discoveries page', selectPage(view, index, -1, perPage), box(p.x + 8, contentTop, 44), undefined, view.items.length <= perPage, '<');
        add('station-next', 'Next discoveries page', selectPage(view, index, 1, perPage), box(p.x + p.width - 52, contentTop, 44), undefined, view.items.length <= perPage, '>');
        put(`${groupName} ${start + 1}-${Math.min(start + perPage, view.items.length)}/${view.items.length}`, p.x + 62, contentTop + 27, p.width - 124, C.muted);
        contentTop += 54;
      } else {
        const x = compact ? p.x + 8 : main.x; const width = compact ? p.width - 16 : main.width;
        const choose = (offset: number): ManagementUiAction => ({ type: 'station-select', id: view.items[(index + offset + view.items.length) % view.items.length]!.id });
        add('station-previous', `Previous ${groupName.toLowerCase()}`, choose(-1), box(x, top, 44, 58), undefined, view.items.length < 2, '<');
        add('station-selected', item.name, { type: 'station-select', id: item.id }, box(x + 48, top, width - 96, 58), true, false, item.name, item.badge ?? (item.active ? 'ACTIVE' : undefined));
        add('station-next', `Next ${groupName.toLowerCase()}`, choose(1), box(x + width - 44, top, 44, 58), undefined, view.items.length < 2, '>');
        put(`${groupName} ${index + 1}/${view.items.length}`, x, top + 75, width, C.muted);
        contentTop = top + 93;
      }
    } else {
      const perPage = view.gallery ? 8 : 4; const start = Math.floor(index / perPage) * perPage;
      view.items.slice(start, start + perPage).forEach((candidate, n) => {
        const id = `station-item-${candidate.id}`;
        const r = view.gallery ? box(p.x + 12 + n % 2 * (leftWidth / 2), top + Math.floor(n / 2) * 68, leftWidth / 2 - 4, 64)
          : box(p.x + 12, top + n * 68, leftWidth, 64);
        add(id, candidate.name, { type: 'station-select', id: candidate.id }, r, item.id === candidate.id, false, candidate.name,
          candidate.badge ?? (candidate.active ? 'ACTIVE' : undefined), candidate.listDetail);
        if (view.gallery) gallery.set(id, candidate);
      });
      const navY = p.y + p.height - 64;
      if (view.items.length > perPage) {
        add('station-previous', `Previous ${groupName.toLowerCase()} page`, selectPage(view, index, -1, perPage), box(p.x + 12, navY, 44), undefined, false, '<');
        add('station-next', `Next ${groupName.toLowerCase()} page`, selectPage(view, index, 1, perPage), box(p.x + 12 + leftWidth - 44, navY, 44), undefined, false, '>');
      }
      put(`${groupName} ${start + 1}-${Math.min(start + perPage, view.items.length)}/${view.items.length}`, p.x + 60, navY + 27, leftWidth - 92, C.muted, 11);
    }
  }
  // Footer positions never depend on the description length or enabled state.
  const footerTop = p.y + p.height - 110;
  const contentEnd = footerTop - (ui.notice ? 38 : 12);
  main.y = contentTop;
  let y = main.y;
  let essentialBox: Rect | null = null;
  if (decision) {
    const start = y;
    y = paragraph(item.name, main, y, C.gold, true) + 8;
    for (const fact of decision.facts) y = paragraph(`${fact.label}: ${fact.value}`, main, y, fact.warning ? C.warning : C.text, true) + 6;
    essentialBox = { x: main.x, y: start - 13, width: main.width, height: y - start + 10 };
  }
  if (!decision && view.running) {
    bars.push({ box: box(main.x, y + 22, main.width, 6), value: view.running.value, total: view.running.total, label: `${view.running.name} · ${view.running.remaining}s` });
    y += 48;
  }
  const overviewStart = y;
  let overview: string[];
  if (item.equipment && !decision) {
    const width = (main.width - 28) / 2;
    gear.push({ box: box(main.x, y, width, 88), current: true }, { box: box(main.x + width + 28, y, width, 88), current: false });
    y += 97;
    const changed = item.equipment.metrics.filter((metric) => metric.before !== metric.after);
    overview = [...(changed.length ? changed.slice(0, compact ? 3 : 5).map((metric) => `${metric.label}: ${number(metric.before)} → ${number(metric.after)}${metric.unit ? ` ${metric.unit}` : ''} (${metric.after > metric.before ? '+' : ''}${number(metric.after - metric.before)})`)
      : ['No change to core stats.']),
      ...(changed.length > (compact ? 3 : 5) ? [`${changed.length - 3} more changes in full stats.`] : []),
      ...(item.equipment.gained.length ? [`GAIN: ${effectNames(item.equipment.gained)}`] : []),
      ...(item.equipment.lost.length ? [`LOSE: ${effectNames(item.equipment.lost)}`] : []),
      ...(item.reason ? [item.reason] : [])];
  } else if (!decision) {
    overview = [item.name, item.summary, ...(item.reason ? [item.reason] : []), ...item.lines];
  } else overview = [];

  if (!decision && item.route && !ui.detailsOpen) {
    put(item.name, main.x, y, main.width, C.gold, 14); y += 22;
    const routeHeight = 33;
    for (const stop of item.route) { route.push({ box: box(main.x, y, main.width, routeHeight), stop }); y += routeHeight; }
    overview = [...(item.reason && !item.options ? [item.reason] : []), ...item.lines];
    y += 7;
  }
  if (!decision && item.progress && !view.running && !ui.detailsOpen) {
    bars.push({ box: box(main.x, y + 23, main.width, 6), value: item.progress.value, total: item.progress.total, label: item.progress.label });
    y += 44;
  }
  if (!decision && item.options && !ui.detailsOpen) {
    const cols = Math.min(4, item.options.length);
    put('LOADING PRIORITY', main.x, y + 12, main.width, C.muted, 11); y += 22;
    item.options.forEach((option, n) => add(`station-option-${option.id}`, `${option.label}${option.active ? ', current priority' : ''}`,
      { type: 'station-option', id: option.id }, box(main.x + n % cols * main.width / cols, y + Math.floor(n / cols) * 58, main.width / cols - 4, 54), option.selected, false, compact && option.label === 'RESEARCH' ? 'DATA' : option.label, option.active ? 'ACTIVE' : undefined));
    y += Math.ceil(item.options.length / cols) * 58 + 8;
  }

  const reading = ui.detailsOpen;
  // In details mode, illustrations give their space back; irreversible consequences do not.
  if (reading && !decision) { y = overviewStart; gear.length = 0; route.length = 0; }
  const textBox = { x: main.x, y, width: main.width, height: Math.max(17, contentEnd - y) };
  const detailLines = wrapDetails([item.name, item.summary, ...(item.reason ? [item.reason] : []), ...item.lines], textBox.width);
  const perPage = Math.max(1, Math.floor(textBox.height / 17));
  const pages: string[][] = [];
  for (let i = 0; i < detailLines.length; i += perPage) pages.push(detailLines.slice(i, i + perPage));
  if (!pages.length) pages.push([]);
  const page = Math.min(ui.detailPage, pages.length - 1);
  const overviewLines = wrapDetails(overview, main.width);
  const availableLines = Math.max(0, Math.floor((contentEnd - y) / 17));
  const detailsAvailable = Boolean(item.lines.length && (item.equipment || decision || item.route || overviewLines.length > availableLines));
  if (reading) pages[page]!.forEach((line, n) => put(line, main.x, y + n * 17, main.width));
  else overviewLines.slice(0, availableLines).forEach((line, n) => put(line, main.x, y + n * 17, main.width,
    line.startsWith('LOSE:') ? C.warning : line.includes(' → ') || n === 0 ? C.gold : C.text));

  const detailTitle = item.equipment ? 'EFFECTS & STATS' : decision ? ui.station === 'reboot' ? 'RESET & KEEP' : 'FULL EFFECTS' : item.route ? 'ROUTE DETAILS' : 'READ MORE';
  if (detailsAvailable || reading) {
    const multiple = reading && pages.length > 1;
    if (multiple) {
      add('station-page-prev', 'Previous explanation page', { type: 'station-page', page: Math.max(0, page - 1) }, box(main.x, footerTop, 44), undefined, page === 0, '<');
      add('station-page-next', 'Next explanation page', { type: 'station-page', page: Math.min(pages.length - 1, page + 1) }, box(main.x + main.width - 44, footerTop, 44), undefined, page === pages.length - 1, '>');
    }
    add('station-details', reading ? 'Back to overview' : detailTitle, { type: 'station-details' },
      box(main.x + (multiple ? 48 : 0), footerTop, main.width - (multiple ? 96 : 0)), undefined, false,
      reading ? multiple ? `BACK · ${page + 1}/${pages.length}` : 'BACK TO OVERVIEW' : detailTitle);
  }
  if (ui.notice) wrapDetails([ui.notice], main.width).slice(0, 2).forEach((line, n) => put(line, main.x, footerTop - 24 + n * 15, main.width, C.installed, 11));
  const actionY = p.y + p.height - 54;
  const actionWidth = confirming ? (main.width - 6) / 2 : main.width;
  if (confirming) add('station-cancel', decision?.cancelLabel ?? 'Cancel confirmation',
    { type: decision?.closeOnCancel ? 'station-close' : 'station-cancel-confirm' }, box(main.x, actionY, actionWidth), undefined, false, decision?.cancelLabel ?? 'GO BACK');
  add('station-activate', confirming ? decision?.confirmLabel ?? 'CONFIRM CHOICE' : item.actionLabel,
    { type: 'station-activate' }, box(main.x + (confirming ? actionWidth + 6 : 0), actionY, actionWidth), undefined, !item.action || Boolean(item.reason));
  return { buttons, panel: p, compact, item, title: confirming ? ui.station === 'reboot' ? 'NEXT RUN' : 'CONFIRM' : view.title,
    textBox, pages, page, confirming, count: `${index + 1}/${view.items.length}`, texts, bars, route, gear, gallery, essentialBox, reading, detailsAvailable };
}

function selectPage(view: StationView, index: number, offset: number, perPage: number): ManagementUiAction {
  const total = Math.ceil(view.items.length / perPage);
  const page = (Math.floor(index / perPage) + offset + total) % total;
  return { type: 'station-select', id: view.items[page * perPage]!.id };
}
function itemGroup(ui: ManagementState, view: StationView): string {
  if (view.gallery) return 'FINDS';
  if (ui.station === 'equipment') return ui.tab;
  if (ui.station === 'crew' && view.roster) return ui.tab === 'assign' ? 'FLOOR' : ui.tab === 'priority' ? 'TASK' : 'SLOT';
  return ui.station === 'research' ? 'PROJECT' : ui.station === 'logistics' ? 'ROUTE' : 'ITEM';
}
function effectNames(values: string[]): string {
  return values.slice(0, 2).map((value) => value.split(':')[0]).join(', ') + (values.length > 2 ? ` +${values.length - 2} more` : '');
}

export function drawManagementUi(ctx: CanvasRenderingContext2D, viewport: UiViewport, layout: ManagementLayout, focused: string | null, hovered: string | null, assets?: D001AssetStore): void {
  const { panel: p } = layout;
  ctx.clearRect(0, 0, viewport.width, viewport.height);
  ctx.fillStyle = '#08080b88'; ctx.fillRect(0, 0, viewport.width, viewport.height);
  ctx.fillStyle = C.background; ctx.fillRect(p.x, p.y, p.width, p.height);
  ctx.strokeStyle = C.line; ctx.lineWidth = 2; ctx.strokeRect(p.x + 1, p.y + 1, p.width - 2, p.height - 2);
  ctx.fillStyle = C.surface; ctx.fillRect(p.x + 3, p.y + 3, p.width - 6, 46);
  // Corner fasteners, not gradients or ambient glows.
  ctx.fillStyle = C.line;
  for (const x of [p.x + 5, p.x + p.width - 8]) for (const y of [p.y + 5, p.y + p.height - 8]) ctx.fillRect(x, y, 3, 3);
  text(ctx, elide(ctx, layout.title, p.width - 124, 14), p.x + 60, p.y + 32, 14, C.gold);
  if (layout.essentialBox) {
    const b = layout.essentialBox;
    ctx.fillStyle = '#221d20'; ctx.fillRect(b.x - 5, b.y - 3, b.width + 10, b.height);
    ctx.fillStyle = C.warning; ctx.fillRect(b.x - 5, b.y - 3, 2, b.height);
  }
  for (const run of layout.texts) text(ctx, run.essential ? run.label : elide(ctx, run.label, run.width, run.size), run.x, run.y, run.size, run.color);
  for (const bar of layout.bars) {
    const b = bar.box;
    text(ctx, elide(ctx, bar.label, b.width - 42, 12), b.x, b.y - 8, 12, C.gold);
    text(ctx, `${Math.round(Math.max(0, Math.min(1, bar.value / Math.max(.001, bar.total))) * 100)}%`, b.x + b.width, b.y - 8, 12, C.muted, 'right');
    ctx.fillStyle = C.surface; ctx.fillRect(b.x, b.y, b.width, b.height);
    ctx.fillStyle = C.installed; ctx.fillRect(b.x, b.y, b.width * Math.max(0, Math.min(1, bar.value / Math.max(.001, bar.total))), b.height);
  }
  layout.route.forEach(({ box: b, stop }, n) => {
    ctx.strokeStyle = C.line; ctx.lineWidth = 2;
    if (n < layout.route.length - 1) { ctx.beginPath(); ctx.moveTo(b.x + 7, b.y + 10); ctx.lineTo(b.x + 7, b.y + b.height + 9); ctx.stroke(); }
    ctx.fillStyle = stop.blocked ? C.warning : C.installed; ctx.fillRect(b.x + 2, b.y + 3, 11, 11);
    text(ctx, `${stop.blocked ? '! ' : ''}${stop.label}`, b.x + 23, b.y + 13, 12, stop.blocked ? C.warning : C.light);
    text(ctx, elide(ctx, stop.detail, b.width - 24, 11), b.x + 23, b.y + 28, 11, C.muted);
  });
  if (layout.item.equipment) for (const { box: b, current } of layout.gear) {
    const equipment = layout.item.equipment;
    text(ctx, current ? 'CURRENT' : 'CANDIDATE', b.x, b.y + 11, 11, current ? C.muted : C.gold);
    const tools = equipment.slot === 'TOOL' && assets?.ready('workTools');
    if (tools) {
      const row = toolSpriteRow(current ? equipment.currentTool : equipment.candidateTool, current ? equipment.currentToolLevel : 1);
      // The tool-only part of the existing ready pose, at the same integer scale as other gear icons.
      ctx.drawImage(tools, 64, row * 40 + 14, 16, 18, b.x + 2, b.y + 18, 48, 54);
    } else icon(ctx, equipment.slot === 'TOOL' ? 'pick' : equipment.slot === 'BOOTS' ? 'boots' : equipment.slot === 'PACK' ? 'pack' : 'lamp', b.x + 2, b.y + 18, 3, current);
    text(ctx, elide(ctx, current ? equipment.current : equipment.candidate, b.width, 12), b.x, b.y + 82, 12);
    if (current) text(ctx, '→', b.x + b.width + 8, b.y + 44, 16, C.gold);
  }
  for (const button of layout.buttons) {
    const entry = layout.gallery.get(button.id);
    if (entry?.discovery) drawDiscovery(ctx, button, entry, focused === button.id || hovered === button.id, assets);
    else drawButton(ctx, button, focused === button.id, layout.compact, hovered === button.id);
  }
}
function drawDiscovery(ctx: CanvasRenderingContext2D, button: UiButton<ManagementUiAction>, item: StationItem, focused: boolean, assets?: D001AssetStore): void {
  const { x, y, width, height } = button; const found = item.discovery!.discovered;
  ctx.fillStyle = button.selected ? '#3b3025' : C.surface; ctx.fillRect(x, y, width, height);
  ctx.strokeStyle = focused ? C.light : button.selected ? C.gold : C.line; ctx.lineWidth = focused ? 2 : 1; ctx.strokeRect(x + .5, y + .5, width - 1, height - 1);
  const cx = Math.round(x + width / 2); ctx.fillStyle = found ? C.gold : '#51494b';
  const image = assets?.ready('discoveryCollection');
  if (image) {
    const frame = collectionSpriteFrame(item.discovery!); const a = DISCOVERY_ATLAS.collection;
    // Fixed integer 24px artwork, not scaled according to value or rarity.
    ctx.drawImage(image, frame % a.columns * a.width, Math.floor(frame / a.columns) * a.height,
      a.width, a.height, cx - a.anchorX, Math.round(y) + 11, a.width, a.height);
  } else if (item.discovery!.category === 'FOSSIL') {
    ctx.fillRect(cx - 10, y + 19, 20, 5); ctx.fillRect(cx - 12, y + 15, 5, 13); ctx.fillRect(cx + 7, y + 15, 5, 13);
  } else if (['RESEARCH', 'RELIC'].includes(item.discovery!.category)) {
    ctx.fillRect(cx - 8, y + 10, 16, 24); ctx.fillStyle = found ? C.background : '#342f33'; ctx.fillRect(cx - 4, y + 16, 8, 3); ctx.fillRect(cx - 4, y + 24, 8, 3);
  } else { ctx.fillRect(cx - 6, y + 9, 12, 25); ctx.fillRect(cx - 11, y + 15, 22, 13); }
  if (!found && !image) text(ctx, '?', cx, y + 28, 17, C.muted, 'center');
  text(ctx, elide(ctx, item.name, width - 10, 11), cx, y + height - 8, 11, C.text, 'center');
  if (found) text(ctx, item.badge ?? '', x + width - 5, y + 13, 11, C.installed, 'right');
}
