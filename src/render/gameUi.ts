import { DEFAULT_PRESENTATION, type PresentationSetting, type PresentationSettings } from '../game/presentationSettings';
import { ELEVATOR_TABS, elevatorItems, selectedElevatorItem, shipmentStatus, type ElevatorItem, type ElevatorTab, type ElevatorUiState } from '../game/elevatorUi';
import { fieldResources, fieldInstruction, liftNeedsAttention } from '../game/fieldUi';
import { stationAvailable } from '../game/management';
import { surveyRequest } from '../game/management/survey';
import { drawMeter } from './meters';
import { sceneReadout } from '../game/hud';
import { playerControlAvailable, playerInteraction } from '../game/playerControls';
import { canDispatchElevator, canRequestMine, cargoWeight, carriedWeight } from '../game/simulation';
import type { GameState } from '../game/types';
import { C, drawButton, lines, text, icon, type UiButton, type UiViewport, type WorkshopUiAction } from './workshopUi';
import type { Rect } from './interactionTargets';
import { LOCALES, t, type Locale } from '../i18n';
import { displayText, localizeDisplayModel } from '../i18n/display';
const localeNames: Record<Locale, string> = { en: 'English', ja: '日本語' };

export type GameUiAction = import('./managementUi').ManagementUiAction | WorkshopUiAction | { type: 'lift-open'; tab?: ElevatorTab; id?: string }
  | { type: 'lift-close' | 'lift-activate' | 'help-open' | 'help-close' }
  | { type: 'presentation'; setting: PresentationSetting }
  | { type: 'locale'; locale: Locale }
  | { type: 'lift-tab'; tab: ElevatorTab } | { type: 'lift-select'; id: string } | { type: 'direction'; direction: -1 | 1 };
export interface GameUiLayout {
  buttons: UiButton<GameUiAction>[]; panel: Rect | null; compact: boolean; item: ElevatorItem | null;
}

export function layoutGameUi(state: GameState, elevator: ElevatorUiState | null, help: boolean, viewport: UiViewport, presentation: PresentationSettings = DEFAULT_PRESENTATION): GameUiLayout {
  const locale = presentation.locale;
  const { width: w, height: h, world } = viewport;
  const compact = w < 680;
  const buttons: UiButton<GameUiAction>[] = [];
  if (elevator || help) {
    const panel: Rect = { x: compact ? 8 : (w - Math.min(660, w - 32)) / 2, y: compact ? 8 : Math.max(12, (h - 386) / 2),
      width: compact ? w - 16 : Math.min(660, w - 32), height: compact ? h - 16 : 386 };
    buttons.push({ id: 'window-close', text: 'X', label: t(locale, help ? 'ui.closeHelp' : 'ui.closeLift'), action: { type: help ? 'help-close' : 'lift-close' },
      x: panel.x + panel.width - 52, y: panel.y + 6, width: 44, height: 44 });
    if (help) {
      const settings: Array<{ setting: PresentationSetting; text: string; label: string }> = [
        { setting: 'volume', text: `${t(locale, 'ui.volume')} ${Math.round(presentation.volume * 100)}%`, label: `${t(locale, 'ui.volume')} ${Math.round(presentation.volume * 100)}%` },
        { setting: 'motion', text: `${t(locale, 'ui.motion')} ${t(locale, presentation.motion ? 'ui.on' : 'ui.off')}`, label: `${t(locale, 'ui.motion')} ${t(locale, presentation.motion ? 'ui.on' : 'ui.off')}` },
        { setting: 'highlights', text: `${t(locale, 'ui.highlights')} ${t(locale, presentation.highlights ? 'ui.on' : 'ui.off')}`, label: `${t(locale, 'ui.highlights')} ${t(locale, presentation.highlights ? 'ui.on' : 'ui.off')}` },
      ];
      settings.forEach((setting, n) => buttons.push({ id: `presentation-${setting.setting}`, text: setting.text, label: setting.label,
        action: { type: 'presentation', setting: setting.setting }, x: panel.x + 8 + n * (panel.width - 16) / 3,
        y: panel.y + panel.height - 54, width: (panel.width - 16) / 3 - 4, height: 44 }));
      const localeOptions = [locale, ...LOCALES.filter((option) => option !== locale)];
      localeOptions.forEach((option, index) => buttons.push({ id: `locale-${option}`,
        text: `${t(locale, 'ui.language')}: ${localeNames[option]}${locale === option ? ' ✓' : ''}`,
        label: `${t(locale, 'ui.language')}: ${localeNames[option]}${locale === option ? `, ${t(locale, 'ui.selected')}` : ''}`,
        action: { type: 'locale', locale: option }, selected: locale === option,
        x: panel.x + 8 + index * ((panel.width - 20) / 2 + 4), y: panel.y + 54, width: (panel.width - 20) / 2, height: 44 }));
      return localizeDisplayModel(locale, { buttons, panel, compact, item: null });
    }
    const ui = elevator!;
    ELEVATOR_TABS.forEach((tab, n) => buttons.push({ id: `lift-tab-${tab}`, text: displayText(locale, tab === 'dispatch' ? 'SHIP' : tab.toUpperCase()), label: `Elevator ${tab}`,
      selected: tab === ui.tab, action: { type: 'lift-tab', tab }, x: panel.x + 8 + n * (panel.width - 16) / 3, y: panel.y + 56,
      width: (panel.width - 16) / 3 - 4, height: 44 }));
    const items = elevatorItems(state, ui.tab); const item = selectedElevatorItem(state, ui); const index = items.findIndex((candidate) => candidate.id === item.id);
    const select = (offset: number): GameUiAction => ({ type: 'lift-select', id: items[(index + offset + items.length) % items.length]!.id });
    if (compact) {
      buttons.push({ id: 'lift-previous', text: '<', label: t(locale, 'ui.previousLiftItem'), action: select(-1), x: panel.x + 8, y: panel.y + 108, width: 44, height: 44 });
      buttons.push({ id: 'lift-selected', text: item.name, label: item.name, selected: true, action: { type: 'lift-select', id: item.id },
        x: panel.x + 56, y: panel.y + 108, width: panel.width - 112, height: 44 });
      buttons.push({ id: 'lift-next', text: '>', label: t(locale, 'ui.nextLiftItem'), action: select(1), x: panel.x + panel.width - 52, y: panel.y + 108, width: 44, height: 44 });
    } else {
      const start = Math.floor(index / 4) * 4;
      items.slice(start, start + 4).forEach((candidate, n) => buttons.push({ id: `lift-item-${candidate.id}`, text: candidate.name, label: candidate.name,
        selected: item.id === candidate.id, action: { type: 'lift-select', id: candidate.id }, x: panel.x + 12, y: panel.y + 110 + n * 48, width: 180, height: 44 }));
      if (items.length > 4) {
        buttons.push({ id: 'lift-previous', text: '<', label: t(locale, 'ui.previousLiftItem'), action: select(-1), x: panel.x + 12, y: panel.y + 308, width: 44, height: 44 });
        buttons.push({ id: 'lift-next', text: '>', label: t(locale, 'ui.nextLiftItem'), action: select(1), x: panel.x + 148, y: panel.y + 308, width: 44, height: 44 });
      }
    }
    buttons.push({ id: 'lift-activate', text: item.actionLabel, label: item.actionLabel, action: { type: 'lift-activate' }, disabled: item.command === null,
      x: panel.x + (compact ? 8 : 212), y: panel.y + panel.height - 54, width: panel.width - (compact ? 16 : 228), height: 44 });
    return localizeDisplayModel(locale, { buttons, panel, compact, item });
  }
  const interaction = playerInteraction(state);
  const available = playerControlAvailable(state);
  // Fixed dock: no target-dependent movement, no duplicate contextual action by the miner.
    const controls: Omit<UiButton<GameUiAction>, keyof Rect>[] = [
    { id: 'left', label: t(locale, 'ui.walkLeft'), text: '<', action: { type: 'direction', direction: -1 }, tone: 'quiet', disabled: !available },
    { id: 'right', label: t(locale, 'ui.walkRight'), text: '>', action: { type: 'direction', direction: 1 }, tone: 'quiet', disabled: !available },
    { id: 'mine', label: t(locale, 'ui.mine'), text: t(locale, 'ui.mine'), action: { type: 'command', command: { type: 'mine' } }, disabled: !canRequestMine(state), tone: 'primary', busy: available && Boolean(state.run.character.swing) },
    { id: 'interact', label: t(locale, 'ui.interact'), text: t(locale, 'ui.interact'), action: { type: 'command', command: { type: 'interact' } }, disabled: interaction.reason !== null, tone: 'primary', busy: ['COLLECTING', 'LOADING'].includes(state.run.character.state) },
    { id: 'return', label: t(locale, 'ui.return'), text: t(locale, 'ui.return'), tone: 'quiet', action: { type: 'command', command: { type: 'return' } }, disabled: !available || carriedWeight(state) === 0 },
    { id: 'stop', label: t(locale, 'ui.cancel'), text: t(locale, 'ui.stop'), action: { type: 'command', command: { type: 'cancel' } }, disabled: state.run.character.state === 'IDLE' && state.selection === null, tone: 'quiet' },
    { id: 'lift-open', label: t(locale, 'ui.openLift'), text: 'LIFT', tone: 'quiet', action: { type: 'lift-open' }, disabled: Boolean(state.run.elevator.travel) },
    { id: 'help', label: t(locale, 'ui.openHelp'), text: '?', tone: 'quiet', action: { type: 'help-open' } },
  ];
  const gap = 4; const margin = 8;
  controls.forEach((control, n) => {
    const widths = compact ? [44, 44, 68, w - 16 - 12 - 156] : [44, 44, 86, 116, 84, 64, 84, 44];
    const row = compact && n >= 4 ? 1 : 0;
    const index = compact ? n % 4 : n;
    const rowWidths = compact && row ? [(w - 16 - 12 - 44) / 3, (w - 16 - 12 - 44) / 3, (w - 16 - 12 - 44) / 3, 44] : widths;
    const total = rowWidths.reduce((sum, width) => sum + width, 0) + gap * (rowWidths.length - 1);
    const start = compact ? margin : Math.round((w - total) / 2);
    buttons.push({ ...control, x: start + rowWidths.slice(0, index).reduce((sum, width) => sum + width + gap, 0),
      y: h - (compact ? 100 : 52) + row * 48, width: rowWidths[index]!, height: 44 });
  });
  buttons.push({ id: 'send', label: t(locale, 'ui.send'), text: t(locale, 'ui.send'), action: { type: 'command', command: { type: 'send' } },
    x: Math.min(w - 106, world.x + world.width * .55),
    // The fixed-size cabinet must stay below the scene's notification strip when the world is scaled down.
    y: Math.max(world.y + world.height * .43, world.y + world.height * .30 + 42),
    width: 96, height: 44, disabled: !canDispatchElevator(state), tone: 'primary' });
  const top = h - (compact ? 144 : 100);
  buttons.push({ id: 'pack-inspect', label: `Inspect backpack: ${Number(carriedWeight(state).toFixed(1))} of ${state.run.character.backpackCapacity} kilograms`, text: '',
    action: { type: 'station-open', request: { station: 'survey', tab: 'cargo', selectedId: 'backpack' } },
    x: 8, y: top, width: 156, height: 44, disabled: !stationAvailable(state, 'survey') || Boolean(state.run.elevator.travel) });
  buttons.push({ id: 'inspect', label: t(locale, 'ui.inspect'), text: t(locale, 'ui.inspect'), tone: 'quiet',
    action: { type: 'station-open', request: surveyRequest(state) }, x: w - 104, y: top, width: 96, height: 44,
    disabled: !stationAvailable(state, 'survey') || Boolean(state.run.elevator.travel) });
  buttons.push({ id: 'base', label: t(locale, 'ui.openBase'), text: 'BASE', tone: 'quiet', action: { type: 'station-open', request: { station: 'facilities' } },
    x: w - 82, y: compact ? 56 : 46, width: 72, height: 44, disabled: Boolean(state.run.elevator.travel) });
  return localizeDisplayModel(locale, { buttons, panel: null, compact, item: null });
}

export function drawGameUi(ctx: CanvasRenderingContext2D, state: GameState, elevator: ElevatorUiState | null, help: boolean,
  viewport: UiViewport, layout: GameUiLayout, focused: string | null, hovered: string | null, locale: Locale = 'en'): void {
  const { width: w, height: h } = viewport; const { compact, panel: p, item } = layout;
  ctx.clearRect(0, 0, w, h);
  if (p) {
    ctx.fillStyle = '#08080b66'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = C.background; ctx.fillRect(p.x, p.y, p.width, p.height);
    ctx.strokeStyle = C.line; ctx.lineWidth = 2; ctx.strokeRect(p.x + 1, p.y + 1, p.width - 2, p.height - 2);
    ctx.fillStyle = C.surface; ctx.fillRect(p.x + 3, p.y + 3, p.width - 6, 46);
    text(ctx, help ? t(locale, 'ui.controls') : t(locale, 'ui.centralLift'), p.x + 12, p.y + 31, 16, C.gold);
    if (!compact && !help) text(ctx, `SCRAP ${state.run.scrap} · ${state.run.depth.current}`, p.x + p.width - 64, p.y + 30, 12, C.light, 'right');
    if (item && elevator) {
      const x = p.x + (compact ? 14 : 212); const width = p.width - (compact ? 28 : 228);
      const top = p.y + (compact ? 174 : 136);
      if (!compact) text(ctx, item.name, x, top, 17, C.light);
      lines(ctx, item.summary, x, top + (compact ? 0 : 27), width, 12, 2, C.gold);
      lines(ctx, item.description, x, top + (compact ? 36 : 57), width, 12, 3);
      const reason = item.reason ?? (elevator.tab === 'dispatch' && item.id === 'shipment' ? shipmentStatus(state) : null);
      if (reason) lines(ctx, reason, x, p.y + p.height - 106, width, 12, 2, C.installed);
      if (elevator.notice) lines(ctx, elevator.notice, x, p.y + p.height - 70, width, 11, 1, C.gold);
    } else if (help) {
      const x = p.x + 14; const width = p.width - 28;
      const controls = ['ui.walkHelp', 'ui.mineHelp', 'ui.interactHelp', 'ui.sendHelp', 'ui.returnHelp', 'ui.closeHelpHint', 'ui.inspectHelp'] as const;
      controls.forEach((key, n) => text(ctx, t(locale, key), x, p.y + 124 + n * (p.height < 350 ? 20 : 24), 16));
      if (p.height >= 350) lines(ctx, sceneReadout(state, locale).goal, x, p.y + 286, width, 12, 2, C.gold);
    }
  } else {
    const run = state.run;
    const resources = fieldResources(state);
    ctx.fillStyle = '#0b0a0def'; ctx.fillRect(0, 0, w, compact ? 52 : 36);
    const wallet = [`${t(locale, 'ui.scrap')} ${amount(run.scrap)}`, resources.data ? `${t(locale, 'ui.data')} ${amount(run.data)}` : '', resources.core ? `${t(locale, 'ui.core')} ${amount(state.meta.core)}` : ''].filter(Boolean).join('  ');
    text(ctx, wallet, 10, 22, 12, C.gold);
    text(ctx, `${run.depth.current}${resources.run ? `  ${t(locale, 'ui.run')} ${String(state.meta.runIndex).padStart(2, '0')}` : ''}`,
      compact ? 10 : w - 10, compact ? 44 : 22, 12, C.light, compact ? 'left' : 'right');
    const instruction = fieldInstruction(state, locale);
    if (instruction) lines(ctx, instruction, 12, compact ? 77 : 62, Math.min(w - 104, 440), 12, 2, C.gold);
    const top = h - (compact ? 144 : 100);
    ctx.fillStyle = C.background; ctx.fillRect(0, top, w, h - top);
    const bag = layout.buttons.find(button => button.id === 'pack-inspect')!;
    const bagFocused = focused === bag.id || hovered === bag.id;
    if (bagFocused) { ctx.strokeStyle = C.light; ctx.lineWidth = 1; ctx.strokeRect(bag.x + 1, bag.y + 1, bag.width - 2, bag.height - 2); }
    icon(ctx, 'pack', bag.x + 3, bag.y + 7, 2, false);
    const weight = carriedWeight(state); const capacity = run.character.backpackCapacity;
    drawMeter(ctx, { x: bag.x + 40, y: bag.y + 18, width: 100, height: 8 }, weight, capacity, weight >= capacity);
    if (bagFocused) text(ctx, `${Number(weight.toFixed(1))}/${capacity} kg`, bag.x + 40, bag.y + 13, 10, C.light);

    const send = layout.buttons.find(button => button.id === 'send')!;
    const cabinet = { x: send.x - 4, y: send.y - 32, width: send.width + 8, height: 80 };
    ctx.fillStyle = C.surface; ctx.fillRect(cabinet.x, cabinet.y, cabinet.width, cabinet.height);
    ctx.strokeStyle = C.line; ctx.lineWidth = 2; ctx.strokeRect(cabinet.x, cabinet.y, cabinet.width, cabinet.height);
    ctx.beginPath(); ctx.moveTo(viewport.world.x + viewport.world.width / 2, cabinet.y + 17); ctx.lineTo(cabinet.x, cabinet.y + 17); ctx.stroke();
    const load = cargoWeight(run.elevator.cargo);
    drawMeter(ctx, { x: send.x + 4, y: send.y - 13, width: send.width - 8, height: 8 }, load, run.elevator.maxLoad, load >= run.elevator.maxLoad);
    if (focused === 'send' || hovered === 'send') text(ctx, `${Number(load.toFixed(1))}/${run.elevator.maxLoad} kg`, send.x + 4, send.y - 18, 10, C.light);
    else if (liftNeedsAttention(state)) text(ctx, run.porter.holdForTravel ? 'II' : run.automation.autoDispatch.enabled ? 'A' : 'II', send.x + 4, send.y - 18, 10, C.gold);
    else if (['ASCENDING', 'DESCENDING', 'UNLOADING'].includes(run.elevator.state)) {
      // A tiny directional indicator complements the actual moving cage, not another status caption.
      const x = send.x + 9; const y = send.y - 23; const down = run.elevator.state === 'DESCENDING';
      ctx.fillStyle = C.muted;
      for (let row = 0; row < 3; row++) ctx.fillRect(x - row, y + (down ? -row : row), row * 2 + 1, 1);
    }

  }
  for (const button of layout.buttons) if (button.id !== 'pack-inspect') drawButton(ctx, button, focused === button.id, compact, hovered === button.id);
}

function amount(value: number): string {
  if (value < 10000) return String(Math.floor(value));
  if (value < 1e6) return `${(value / 1000).toFixed(1)}k`;
  return `${(value / 1e6).toFixed(1)}m`;
}
