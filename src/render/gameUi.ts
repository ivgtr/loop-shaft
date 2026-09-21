import { ELEVATOR_TABS, elevatorItems, selectedElevatorItem, shipmentStatus, type ElevatorItem, type ElevatorTab, type ElevatorUiState } from '../game/elevatorUi';
import { sceneReadout } from '../game/hud';
import { playerControlAvailable, playerInteraction } from '../game/playerControls';
import { canDispatchElevator, canRequestMine, cargoWeight, carriedWeight } from '../game/simulation';
import type { GameState } from '../game/types';
import { workshopGuide } from '../game/workshop';
import { C, drawButton, elide, lines, text, type UiButton, type UiViewport, type WorkshopUiAction } from './workshopUi';
import type { Rect } from './interactionTargets';

export type GameUiAction = import('./managementUi').ManagementUiAction | WorkshopUiAction | { type: 'lift-open'; tab?: ElevatorTab; id?: string }
  | { type: 'lift-close' | 'lift-activate' | 'help-open' | 'help-close' }
  | { type: 'lift-tab'; tab: ElevatorTab } | { type: 'lift-select'; id: string } | { type: 'direction'; direction: -1 | 1 };
export interface GameUiLayout {
  buttons: UiButton<GameUiAction>[]; panel: Rect | null; compact: boolean; item: ElevatorItem | null;
}

export function layoutGameUi(state: GameState, elevator: ElevatorUiState | null, help: boolean, viewport: UiViewport): GameUiLayout {
  const { width: w, height: h, world } = viewport;
  const compact = w < 640;
  const buttons: UiButton<GameUiAction>[] = [];
  if (elevator || help) {
    const panel: Rect = { x: compact ? 8 : (w - Math.min(660, w - 32)) / 2, y: compact ? 8 : Math.max(12, (h - 386) / 2),
      width: compact ? w - 16 : Math.min(660, w - 32), height: compact ? h - 16 : 386 };
    buttons.push({ id: 'window-close', text: 'X', label: help ? 'Close controls help' : 'Close elevator controls', action: { type: help ? 'help-close' : 'lift-close' },
      x: panel.x + panel.width - 52, y: panel.y + 6, width: 44, height: 44 });
    if (help) return { buttons, panel, compact, item: null };
    const ui = elevator!;
    ELEVATOR_TABS.forEach((tab, n) => buttons.push({ id: `lift-tab-${tab}`, text: tab === 'dispatch' ? 'SHIP' : tab.toUpperCase(), label: `Elevator ${tab}`,
      selected: tab === ui.tab, action: { type: 'lift-tab', tab }, x: panel.x + 8 + n * (panel.width - 16) / 3, y: panel.y + 56,
      width: (panel.width - 16) / 3 - 4, height: 44 }));
    const items = elevatorItems(state, ui.tab); const item = selectedElevatorItem(state, ui); const index = items.findIndex((candidate) => candidate.id === item.id);
    const select = (offset: number): GameUiAction => ({ type: 'lift-select', id: items[(index + offset + items.length) % items.length]!.id });
    if (compact) {
      buttons.push({ id: 'lift-previous', text: '<', label: 'Previous elevator item', action: select(-1), x: panel.x + 8, y: panel.y + 108, width: 44, height: 44 });
      buttons.push({ id: 'lift-selected', text: item.name, label: item.name, selected: true, action: { type: 'lift-select', id: item.id },
        x: panel.x + 56, y: panel.y + 108, width: panel.width - 112, height: 44 });
      buttons.push({ id: 'lift-next', text: '>', label: 'Next elevator item', action: select(1), x: panel.x + panel.width - 52, y: panel.y + 108, width: 44, height: 44 });
    } else {
      const start = Math.floor(index / 4) * 4;
      items.slice(start, start + 4).forEach((candidate, n) => buttons.push({ id: `lift-item-${candidate.id}`, text: candidate.name, label: candidate.name,
        selected: item.id === candidate.id, action: { type: 'lift-select', id: candidate.id }, x: panel.x + 12, y: panel.y + 110 + n * 48, width: 180, height: 44 }));
      if (items.length > 4) {
        buttons.push({ id: 'lift-previous', text: '<', label: 'Previous elevator item', action: select(-1), x: panel.x + 12, y: panel.y + 308, width: 44, height: 44 });
        buttons.push({ id: 'lift-next', text: '>', label: 'Next elevator item', action: select(1), x: panel.x + 148, y: panel.y + 308, width: 44, height: 44 });
      }
    }
    buttons.push({ id: 'lift-activate', text: item.actionLabel, label: item.actionLabel, action: { type: 'lift-activate' }, disabled: item.command === null,
      x: panel.x + (compact ? 8 : 212), y: panel.y + panel.height - 54, width: panel.width - (compact ? 16 : 228), height: 44 });
    return { buttons, panel, compact, item };
  }
  const interaction = playerInteraction(state);
  const available = playerControlAvailable(state);
  // Fixed dock: no target-dependent movement, no duplicate contextual action by the miner.
  const controls: Omit<UiButton<GameUiAction>, keyof Rect>[] = [
    { id: 'left', label: 'Walk left', text: '<', action: { type: 'direction', direction: -1 }, disabled: !available },
    { id: 'right', label: 'Walk right', text: '>', action: { type: 'direction', direction: 1 }, disabled: !available },
    { id: 'mine', label: 'MINE', text: 'MINE', action: { type: 'command', command: { type: 'mine' } }, disabled: !canRequestMine(state) },
    { id: 'interact', label: interaction.label, text: interaction.label, action: { type: 'command', command: { type: 'interact' } }, disabled: interaction.reason !== null },
    { id: 'return', label: 'RETURN', text: 'RETURN', action: { type: 'command', command: { type: 'return' } }, disabled: !available || carriedWeight(state) === 0 },
    { id: 'stop', label: 'CANCEL', text: 'STOP', action: { type: 'command', command: { type: 'cancel' } } },
    { id: 'lift-open', label: 'Open elevator controls', text: 'LIFT', action: { type: 'lift-open' }, disabled: Boolean(state.run.elevator.travel) },
    { id: 'help', label: 'Controls and current objective', text: '?', action: { type: 'help-open' } },
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
  buttons.push({ id: 'send', label: 'SEND', text: 'F · SEND', action: { type: 'command', command: { type: 'send' } },
    x: world.x + world.width / 2 - 51, y: world.y + world.height * .43, width: 102, height: 44, disabled: !canDispatchElevator(state) });
  const guide = workshopGuide(state);
  if (guide) buttons.push({ id: 'goal', label: 'Inspect next workshop upgrade', text: guide.label, action: { type: 'open' },
    x: 10, y: compact ? 56 : 46, width: Math.min(w - 100, 420), height: 44, selected: guide.ready });
  else if (state.run.depth.current === 'D-001' && state.run.porter.enabled) {
    const relay = state.run.automation.autoDispatch.unlocked;
    const connected = state.run.depth.unlocked.includes('D-030');
    buttons.push({ id: 'shaft-goal', label: 'Inspect the next shaft connection',
      text: !relay ? 'LIFT · FIT AUTO RELAY' : connected ? 'LIFT · TRAVEL TO D-030' : 'LIFT · OPEN D-030 CONNECTION',
      action: { type: 'lift-open', tab: !relay ? 'dispatch' : connected ? 'travel' : 'extend', id: !relay ? 'relay' : 'D-030' },
      x: 10, y: compact ? 56 : 46, width: Math.min(w - 100, 360), height: 44 });
  }
  buttons.push({ id: 'base', label: 'Open base facilities', text: 'BASE', action: { type: 'station-open', request: { station: 'facilities' } },
    x: w - 82, y: compact ? 56 : 46, width: 72, height: 44, disabled: Boolean(state.run.elevator.travel) });
  return { buttons, panel: null, compact, item: null };
}

export function drawGameUi(ctx: CanvasRenderingContext2D, state: GameState, elevator: ElevatorUiState | null, help: boolean,
  viewport: UiViewport, layout: GameUiLayout, focused: string | null, hovered: string | null): void {
  const { width: w, height: h } = viewport; const { compact, panel: p, item } = layout;
  ctx.clearRect(0, 0, w, h);
  if (p) {
    ctx.fillStyle = '#08080b66'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = C.background; ctx.fillRect(p.x, p.y, p.width, p.height);
    ctx.strokeStyle = C.line; ctx.lineWidth = 2; ctx.strokeRect(p.x + 1, p.y + 1, p.width - 2, p.height - 2);
    ctx.fillStyle = C.surface; ctx.fillRect(p.x + 3, p.y + 3, p.width - 6, 46);
    text(ctx, help ? 'CONTROLS' : 'CENTRAL LIFT', p.x + 12, p.y + 31, 16, C.gold);
    if (!compact && !help) text(ctx, `SCRAP ${state.run.scrap} · ${state.run.depth.current}`, p.x + p.width - 64, p.y + 30, 12, C.light, 'right');
    if (item && elevator) {
      const x = p.x + (compact ? 14 : 212); const width = p.width - (compact ? 28 : 228);
      const top = p.y + (compact ? 174 : 136);
      if (!compact) text(ctx, item.name, x, top, 17, C.light);
      lines(ctx, item.summary, x, top + (compact ? 0 : 27), width, 12, 2, C.gold);
      lines(ctx, item.description, x, top + (compact ? 36 : 57), width, 12, 3);
      lines(ctx, item.reason ?? (elevator.tab === 'dispatch' ? shipmentStatus(state) : 'Ready'), x, p.y + p.height - 106, width, 12, 2, C.installed);
      if (elevator.notice) lines(ctx, elevator.notice, x, p.y + p.height - 70, width, 11, 1, C.gold);
    } else if (help) {
      const x = p.x + 14; const width = p.width - 28;
      const controls = ['A / D or arrows: walk', 'Space / MINE: one swing', 'E: pick up, load, or inspect', 'F / SEND: send loaded cargo', 'RETURN: walk back and unload', 'Esc: close a window / stop', 'Hold < / > to walk on touch'];
      controls.forEach((label, n) => text(ctx, label, x, p.y + 72 + n * 24, 12));
      lines(ctx, sceneReadout(state).detail || sceneReadout(state).goal, x, p.y + 264, width, 12, compact ? 4 : 3, C.gold);
    }
  } else {
    const run = state.run;
    ctx.fillStyle = '#0b0a0def'; ctx.fillRect(0, 0, w, compact ? 52 : 36);
    text(ctx, `SCRAP ${amount(run.scrap)}  DATA ${amount(run.data)}  CORE ${amount(state.meta.core)}`, 10, 22, 12, C.gold);
    text(ctx, `${run.depth.current}  RUN ${String(state.meta.runIndex).padStart(2, '0')}`, compact ? 10 : w - 10, compact ? 44 : 22, 12, C.light, compact ? 'left' : 'right');
    const readout = sceneReadout(state);
    if (!layout.buttons.some((button) => ['goal', 'shaft-goal'].includes(button.id))) lines(ctx, readout.goal, 12, compact ? 77 : 62, Math.min(w - 104, 440), 12, 2, C.gold);
    const top = h - (compact ? 132 : 88);
    ctx.fillStyle = C.background; ctx.fillRect(0, top, w, h - top);
    ctx.fillStyle = C.line; ctx.fillRect(0, top, w, 1);
    const pack = `PACK ${Number(carriedWeight(state).toFixed(1))}/${run.character.backpackCapacity}kg`;
    text(ctx, pack, 10, top + 19, 12, C.gold);
    if (!compact) text(ctx, elide(ctx, readout.short, w - 205, 12), 195, top + 19, 12, C.muted);
    else {
      // Target information has its own stable strip; never overlays the ore hit areas.
      text(ctx, elide(ctx, readout.short, w - 20, 11), 10, viewport.world.y + viewport.world.height - 7, 11, C.light);
      const action = playerInteraction(state);
      text(ctx, action.reason?.startsWith('PACK FULL') ? 'FULL · CAN STILL MINE' : state.run.character.state.replaceAll('_', ' '), w - 10, top + 19, 10, C.muted, 'right');
    }
    const send = layout.buttons.find((button) => button.id === 'send')!;
    const value = `${Number(cargoWeight(run.elevator.cargo).toFixed(1))}/${run.elevator.maxLoad} kg`;
    const status = shipmentStatus(state);
    ctx.fillStyle = '#0b0a0de8'; ctx.fillRect(send.x - 24, send.y - 32, send.width + 48, 32);
    text(ctx, elide(ctx, status, send.width + 40, 10), send.x + send.width / 2, send.y - 19, 10, C.muted, 'center');
    text(ctx, value, send.x + send.width / 2, send.y - 5, 11, C.light, 'center');
  }
  for (const button of layout.buttons) drawButton(ctx, button, focused === button.id || hovered === button.id, compact);
}

function amount(value: number): string {
  if (value < 10000) return String(Math.floor(value));
  if (value < 1e6) return `${(value / 1000).toFixed(1)}k`;
  return `${(value / 1e6).toFixed(1)}m`;
}
