import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PASSIVES } from '../src/game/config';
import { startRailConstruction, updateDeepGame, installBore } from '../src/game/deepGame';
import { createManagementState, selectedStationItem, stationView } from '../src/game/management';
import { equipmentPreview } from '../src/game/management/equipment';
import { managementFeedback } from '../src/game/management/feedback';
import type { ManagementState, StationRequest } from '../src/game/management/types';
import { equipCrewItem, equipPlayerItem, hireCrew, legacyEquipmentForReboot } from '../src/game/phase5';
import { serializeGameState } from '../src/game/save';
import type { PassiveId } from '../src/game/types';
import { layoutManagementUi } from '../src/render/managementUi';
import { GameRuntime } from '../src/runtime/GameRuntime';
import { managementGame } from './fixtures/management';

beforeEach(() => vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() }));
const viewport = (width: number, height = 568) => ({ width, height, world: { x: 0, y: 110, width, height: width * 9 / 16 } });
const normalize = (text: string) => text.replaceAll(/\s/g, '');

function rebootGame() {
  const state = managementGame(); state.run.depth.current = 'D-100'; state.run.pendingCore = 7; state.run.coreChamber.rebootAvailable = true;
  state.meta.protocols.push('LEGACY_LOCKER'); equipPlayerItem(state, state.run.phase5.equipment.inventory[0]!.id);
  return state;
}

describe('consequences remain beside the confirmation action', () => {
  for (const width of [320, 390, 680, 960]) it(`paints every reset fact on every detail page at ${width}px`, () => {
    const state = rebootGame(); const ui = createManagementState(state, { station: 'reboot' });
    const item = selectedStationItem(state, ui); const expectedGear = legacyEquipmentForReboot(state)!;
    expect(item.decision!.facts.find((fact) => fact.label === 'KEEP GEAR')!.value).toBe(expectedGear.name);
    expect(item.decision!.facts.find((fact) => fact.label === 'LOSE')!.value).toContain('16 other gear');
    const layouts = [false, true].flatMap((detailsOpen) => [0, 1, 9].map((detailPage) => layoutManagementUi(state,
      { ...ui, confirmation: item.confirmKey!, detailsOpen, detailPage }, viewport(width))));
    const footer = layouts[0]!.buttons.find((button) => button.id === 'station-activate')!;
    for (const layout of layouts) {
      const painted = layout.texts.filter((run) => run.essential);
      for (const fact of item.decision!.facts) expect(normalize(painted.map((run) => run.label).join(' '))).toContain(normalize(`${fact.label}: ${fact.value}`));
      expect(painted.every((run) => run.y < footer.y - 48)).toBe(true);
      expect(layout.buttons.find((button) => button.id === 'station-activate')).toEqual(footer);
      expect(layout.buttons.find((button) => button.id === 'station-cancel')).toMatchObject({ text: 'KEEP MINING', action: { type: 'station-close' } });
    }
  });
  it('pins the full source, target and displaced item for a transfer', () => {
    const state = managementGame(); const candidate = state.run.phase5.equipment.inventory[0]!; const current = state.run.phase5.equipment.inventory[1]!;
    const worker = state.run.phase5.crew.members[0]!; equipCrewItem(state, worker.id, candidate.id); equipPlayerItem(state, current.id);
    const before = structuredClone(state); const ui = createManagementState(state, { station: 'equipment', selectedId: candidate.id }); const item = selectedStationItem(state, ui);
    for (const detailsOpen of [false, true]) {
      const layout = layoutManagementUi(state, { ...ui, confirmation: item.confirmKey!, detailsOpen }, viewport(320));
      const painted = normalize(layout.texts.filter((run) => run.essential).map((run) => run.label).join(' '));
      expect(painted).toContain(normalize(`${worker.name} → Player`)); expect(painted).toContain(normalize(current.name));
      expect(layout.buttons.find((button) => button.id === 'station-activate')!.label).toBe('TRANSFER & EQUIP');
    }
    expect(state).toEqual(before);
  });
  it('never commits a stale confirmation when a new appraised item changes the loss list', () => {
    const state = rebootGame(); const runtime = new GameRuntime(state); runtime.openManagement({ station: 'reboot' }); runtime.activateManagementItem();
    state.run.phase5.equipment.inventory.push({ ...state.run.phase5.equipment.inventory[0]!, id: 'new-appraised' });
    runtime.activateManagementItem(); expect(state.meta.runIndex).toBe(2);
    runtime.dispatch({ type: 'cancel' }); expect(runtime.getSnapshot().management!.confirmation).toBeNull();
  });
});

describe('inspection is not ownership or a setting change', () => {
  it('keeps the equipped badge when another row has the selection frame', () => {
    const state = managementGame(); const [equipped, inspected] = state.run.phase5.equipment.inventory;
    equipPlayerItem(state, equipped!.id);
    const ui = createManagementState(state, { station: 'equipment', selectedId: inspected!.id });
    const layout = layoutManagementUi(state, ui, viewport(960));
    expect(layout.buttons.find((button) => button.id === `station-item-${equipped!.id}`)).toMatchObject({ badge: 'EQUIPPED', selected: false });
    expect(layout.buttons.find((button) => button.id === `station-item-${inspected!.id}`)).toMatchObject({ badge: 'STORED', selected: true });
  });
  it('retains both active passive badges while inspecting an inactive third', () => {
    const state = managementGame(); state.meta.passives.unlocked = Object.keys(PASSIVES) as PassiveId[];
    state.meta.passives.active = state.meta.passives.unlocked.slice(0, 2);
    const ui = createManagementState(state, { station: 'archive', tab: 'passives', selectedId: state.meta.passives.unlocked[2] });
    const layout = layoutManagementUi(state, ui, viewport(960));
    expect(layout.buttons.filter((button) => button.badge === 'ACTIVE')).toHaveLength(2);
    expect(layout.buttons.find((button) => button.id === 'station-activate')!.disabled).toBe(true);
  });
  it('uses one row per rail and applies an explicitly selected option only on execution', () => {
    const state = managementGame(); state.run.research.completed.push('RAIL_LOGISTICS');
    const runtime = new GameRuntime(state); runtime.openManagement({ station: 'logistics' }); runtime.activateManagementItem();
    expect(stationView(state, runtime.getSnapshot().management!).items).toHaveLength(1);
    // Also verifies the build row was reconciled to the new route's stable ID.
    runtime.selectManagementOption('RESEARCH'); expect(state.run.logistics.lines[0]!.priority).toBe('BULK');
    const item = selectedStationItem(state, runtime.getSnapshot().management!);
    expect(item.options!.find((option) => option.id === 'BULK')).toMatchObject({ active: true, selected: false });
    expect(item.options!.find((option) => option.id === 'RESEARCH')).toMatchObject({ active: false, selected: true });
    runtime.activateManagementItem(); expect(state.run.logistics.lines[0]!.priority).toBe('RESEARCH');
    expect(runtime.getSnapshot().management!.notice).toBe('D-250 loading priority: research.');
    runtime.selectManagementOption('NOT_A_PRIORITY'); expect(state.run.logistics.lines[0]!.priority).toBe('RESEARCH');
  });
  it('leaves selection, option and details out of the save and clears them on close', () => {
    const state = managementGame(); const runtime = new GameRuntime(state); runtime.openManagement({ station: 'equipment' });
    runtime.toggleManagementDetails(); runtime.setManagementPage(2);
    const saved = JSON.parse(serializeGameState(state)); expect(saved).not.toHaveProperty('management');
    runtime.closeManagement(); runtime.openManagement({ station: 'equipment' });
    expect(runtime.getSnapshot().management).toMatchObject({ detailsOpen: false, detailPage: 0, optionId: null, confirmation: null });
  });
});

describe('facility-specific information', () => {
  it('keeps all real metrics for full comparison but only paints changed metrics in the overview', () => {
    const state = managementGame(); const item = state.run.phase5.equipment.inventory[0]!; const before = structuredClone(state);
    const preview = equipmentPreview(state, item); const ui = createManagementState(state, { station: 'equipment' });
    const layout = layoutManagementUi(state, ui, viewport(960));
    expect(preview.metrics).toHaveLength(5); expect(layout.gear).toHaveLength(2);
    expect(layout.texts.some((run) => run.label.includes('Base hit:'))).toBe(true);
    expect(layout.texts.some((run) => run.label.includes('42 → 42'))).toBe(false);
    expect(state).toEqual(before);
  });
  it('keeps lost effects and target-dependent effects in the full comparison', () => {
    const state = managementGame(); const current = state.run.phase5.equipment.inventory[0]!; const candidate = state.run.phase5.equipment.inventory[1]!;
    current.affixes = [{ id: 'POWERED_EDGE', name: 'Powered Edge', value: .1, description: 'Mining damage +10%' }];
    candidate.affixes = [{ id: 'FOSSIL_BREAKER', name: 'Fossil Breaker', value: .2, description: 'Fossil-rich sites +20%' }];
    equipPlayerItem(state, current.id); const preview = equipmentPreview(state, candidate);
    expect(preview.gained[0]).toContain('Fossil-rich sites'); expect(preview.lost[0]).toContain('Mining damage');
    const ui = createManagementState(state, { station: 'equipment', selectedId: candidate.id });
    expect(selectedStationItem(state, ui).lines.join(' ')).toContain('REPLACED EFFECTS');
  });
  it('opens crew controls beside the roster without an inspect-worker intermediate screen', () => {
    const state = managementGame(); state.run.phase5.crew.slots = 4; hireCrew(state, 'MINER'); hireCrew(state, 'PORTER');
    const ui = createManagementState(state, { station: 'crew' }); const view = stationView(state, ui);
    expect(ui.subjectId).toBe(state.run.phase5.crew.members[0]!.id); expect(view.roster).toHaveLength(4);
    expect(layoutManagementUi(state, ui, viewport(390, 844)).buttons.filter((button) => button.id.startsWith('station-worker-'))).toHaveLength(4);
    expect(view.items[0]!.actionLabel).toContain('ASSIGN');
  });
  it('keeps research progress visible when a different project is inspected', () => {
    const state = managementGame(); state.run.research.active = { id: 'PRIORITY_CARGO_TAG', duration: 28, remaining: 14 };
    const ui = createManagementState(state, { station: 'research', tab: 'plans' }); const layout = layoutManagementUi(state, ui, viewport(390));
    expect(layout.bars[0]).toMatchObject({ value: 14, total: 28 });
    expect(layout.bars[0]!.label).toContain('14s');
  });
  it('uses silhouettes without leaking undiscovered names or effects', () => {
    const state = managementGame(); const ui = createManagementState(state, { station: 'archive' }); const layout = layoutManagementUi(state, ui, viewport(960));
    expect(layout.gallery.size).toBeGreaterThan(0);
    for (const entry of layout.gallery.values()) expect(entry).toMatchObject({ name: '????', discovery: { discovered: false } });
  });
  it('locates a real cargo-hub blockage and keeps unrelated steps distinguishable', () => {
    const state = managementGame(); state.run.research.completed.push('RAIL_LOGISTICS'); startRailConstruction(state);
    const line = state.run.logistics.lines[0]!; line.state = 'JAMMED'; line.jamReason = 'CARGO_HUB_FULL';
    const item = selectedStationItem(state, createManagementState(state, { station: 'logistics' }));
    expect(item.route!.find((stop) => stop.label === 'Cargo hub')!.blocked).toBe(true);
    expect(item.route!.find((stop) => stop.label === 'Rail stop')!.blocked).toBe(false);
  });
  it('reports the actual operation rather than an applied-row message', () => {
    const state = managementGame(); const worker = state.run.phase5.crew.members[0]!;
    expect(managementFeedback(state, { type: 'assign-crew', crewId: worker.id, depth: 'D-060' })).toBe(`${worker.name} is heading to D-060.`);
    expect(managementFeedback(state, { type: 'research', research: 'DEEP_SURVEY' })).toBe('Deep Survey started.');
  });
});

describe('navigation and occupied space', () => {
  it('pages a desktop inventory in groups and labels the range while mobile counts individual items', () => {
    const state = managementGame(); const ui = createManagementState(state, { station: 'equipment' });
    const desktop = layoutManagementUi(state, ui, viewport(960));
    expect(desktop.buttons.find((button) => button.id === 'station-next')!.action).toEqual({ type: 'station-select', id: state.run.phase5.equipment.inventory[4]!.id });
    expect(desktop.texts.some((run) => run.label === 'TOOL 1-4/14')).toBe(true);
    const mobile = layoutManagementUi(state, ui, viewport(320)); expect(mobile.texts.some((run) => run.label === 'TOOL 1/14')).toBe(true);
  });
  it('omits explanation arrows on a one-page description and keeps the action anchored', () => {
    const state = managementGame(); const ui = createManagementState(state, { station: 'core' });
    const overview = layoutManagementUi(state, ui, viewport(960)); const details = layoutManagementUi(state, { ...ui, detailsOpen: true }, viewport(960));
    expect(details.pages).toHaveLength(1); expect(details.buttons.some((button) => button.id.startsWith('station-page-'))).toBe(false);
    expect(details.buttons.find((button) => button.id === 'station-activate')!.y).toBe(overview.buttons.find((button) => button.id === 'station-activate')!.y);
  });
  for (const width of [320, 390, 679, 680, 960]) it(`fits installed logistics, all roster controls and pinned facts at ${width}px`, () => {
    const state = rebootGame(); state.run.phase5.crew.slots = 4; hireCrew(state, 'MINER'); hireCrew(state, 'PORTER');
    state.run.research.completed.push('RAIL_LOGISTICS', 'REMOTE_BORE_CONTROL'); startRailConstruction(state);
    for (let n = 0; n < 1500; n++) updateDeepGame(state, .1);
    installBore(state, state.run.floors['D-400'].nodes.find((node) => node.access === 'REMOTE_ONLY')!.id);
    for (const request of [{ station: 'crew' }, { station: 'logistics' }, { station: 'logistics', tab: 'bore' }, { station: 'reboot' }] as StationRequest[]) {
      const initial = createManagementState(state, request);
      for (const detailsOpen of [false, true]) {
        const ui: ManagementState = { ...initial, detailsOpen };
        const layout = layoutManagementUi(state, ui, viewport(width));
        for (const [i, a] of layout.buttons.entries()) {
          expect(a.width, a.id).toBeGreaterThanOrEqual(44); expect(a.height, a.id).toBeGreaterThanOrEqual(44);
          expect(a.x + a.width, a.id).toBeLessThanOrEqual(width); expect(a.y + a.height, a.id).toBeLessThanOrEqual(568);
          for (const b of layout.buttons.slice(i + 1)) expect(a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y, `${a.id} / ${b.id}`).toBe(false);
        }
        for (const { box } of layout.route) expect(box.y + box.height).toBeLessThan(layout.panel.y + layout.panel.height - 110);
        for (const run of layout.texts.filter((run) => run.essential)) expect(run.y).toBeLessThan(layout.panel.y + layout.panel.height - 110);
      }
    }
  });
});
