import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CORE_PROTOCOLS, PASSIVES, RESEARCH } from '../src/game/config';
import { createGameState, createNewRun } from '../src/game/createGame';
import { createManagementState, selectedStationItem, stationAvailable, stationView, type Station } from '../src/game/management';
import { equipmentComparison } from '../src/game/management/equipment';
import { equipCrewItem, equipPlayerItem, legacyEquipmentForReboot, updatePhase5 } from '../src/game/phase5';
import { restoreGameState, serializeGameState } from '../src/game/save';
import { researchBlockReason, updateGame } from '../src/game/simulation';
import type { CoreProtocolId, PassiveId, ResearchId } from '../src/game/types';
import { layoutManagementUi, wrapDetails } from '../src/render/managementUi';
import { GameRuntime } from '../src/runtime/GameRuntime';
import { managementGame } from './fixtures/management';

beforeEach(() => vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() }));
const stations: Station[] = ['facilities', 'equipment', 'research', 'crew', 'archive', 'scanner', 'core', 'reboot', 'logistics'];

describe('management presentation uses actual game state', () => {
  it('keeps all instances, separates slots and compares without changing ownership, RNG or events', () => {
    const state = managementGame(); const before = structuredClone(state);
    const ui = createManagementState(state, { station: 'equipment' }); const view = stationView(state, ui);
    expect(view.items).toHaveLength(14); expect(view.items[0]!.lines.join(' ')).toContain('Base hit:');
    expect(view.items.at(-1)!.name).toBe('Recovered pick 13');
    expect(stationView(state, { ...ui, tab: 'PACK' }).items).toHaveLength(1);
    expect(state).toEqual(before);
  });
  it('compares the real equipped pack capacity and retains replaced affix details', () => {
    const state = managementGame(); const item = state.run.phase5.equipment.inventory.find((item) => item.slot === 'PACK')!;
    const result = equipmentComparison(state, item); const next = structuredClone(state); equipPlayerItem(next, item.id);
    expect(result.join(' ')).toContain(`Pack: ${state.run.character.backpackCapacity} → ${next.run.character.backpackCapacity} kg`);
  });
  it('presents current-role crew effects instead of treating rarity as damage', () => {
    const state = managementGame(); const miner = state.run.phase5.crew.members.find((m) => m.role === 'MINER')!;
    const lines = equipmentComparison(state, state.run.phase5.equipment.inventory[0]!, miner.id).join(' ');
    expect(lines).toContain('Walk speed:'); expect(lines).toContain('Hit on Scrap Ledge:');
  });
  it('explains a transfer from another owner before clearing any ownership', () => {
    const state = managementGame(); const worker = state.run.phase5.crew.members[0]!; const item = state.run.phase5.equipment.inventory[0]!;
    equipCrewItem(state, worker.id, item.id);
    const selected = selectedStationItem(state, createManagementState(state, { station: 'equipment' }));
    expect(selected.confirmKey).toBeTruthy(); expect(selected.lines.join(' ')).toContain(worker.name);
    expect(worker.equipment.TOOL).toBe(item.id);
  });
  it('keeps unavailable research inspectable and shares its start gate', () => {
    const state = managementGame(); state.run.data = 0;
    const ui = createManagementState(state, { station: 'research', tab: 'plans' });
    for (const item of stationView(state, ui).items) {
      expect(item.reason).toBe(researchBlockReason(state, item.id as ResearchId)); expect(item.action).toBeNull();
    }
    expect(stationView(state, ui).items.some((item) => item.reason?.includes('more Data'))).toBe(true);
    expect(stationView(state, ui).items.some((item) => item.reason?.includes('Requires'))).toBe(true);
  });
  it('separates running, plans and completed research while retaining the selected project', () => {
    const state = managementGame(); state.run.research.active = { id: 'PRIORITY_CARGO_TAG', remaining: 7, duration: 28 };
    const ui = createManagementState(state, { station: 'research' });
    expect(selectedStationItem(state, ui).summary).toContain('RUNNING');
    for (let i = 0; i < 80; i++) updateGame(state, .1);
    expect(selectedStationItem(state, ui).summary).toBe('COMPLETE');
    expect(stationView(state, { ...ui, tab: 'done' }).items.some((i) => i.id === 'PRIORITY_CARGO_TAG')).toBe(true);
  });
  it('keeps an inspected plan selected when an appraisal supplies its missing Data', () => {
    const state = managementGame(); state.run.data = 0;
    const ui = createManagementState(state, { station: 'research', tab: 'plans', selectedId: 'PRIORITY_CARGO_TAG' });
    expect(selectedStationItem(state, ui).reason).toContain('more Data');
    state.run.data = 40;
    expect(selectedStationItem(state, ui).id).toBe('PRIORITY_CARGO_TAG');
    expect(selectedStationItem(state, ui).action).toMatchObject({ command: { type: 'research', research: 'PRIORITY_CARGO_TAG' } });
  });
  it('does not leak undiscovered collection names or passive effects', () => {
    const state = managementGame(); const ui = createManagementState(state, { station: 'archive' });
    expect(stationView(state, ui).items.filter((i) => i.name === '????').length).toBeGreaterThan(0);
    expect(stationView(state, { ...ui, tab: 'passives' }).items.every((i) => i.name === 'Undiscovered passive' && i.action === null)).toBe(true);
  });
  it('explains the active passive limit without disabling inspection', () => {
    const state = managementGame(); state.meta.passives.unlocked = Object.keys(PASSIVES) as PassiveId[];
    state.meta.passives.active = state.meta.passives.unlocked.slice(0, 2);
    const ui = createManagementState(state, { station: 'archive', tab: 'passives' });
    expect(stationView(state, ui).items[2]!.reason).toContain('Two passives');
    expect(stationView(state, ui).items[0]!.actionLabel).toBe('STORE PASSIVE');
  });
  it('shows explicit priorities and cargo-blocked assignments for both worker roles', () => {
    const state = managementGame();
    for (const worker of state.run.phase5.crew.members) {
      const ui = createManagementState(state, { station: 'crew', subjectId: worker.id, tab: 'priority' });
      expect(stationView(state, ui).items.find((i) => i.id === 'RESEARCH')!.action).toMatchObject({ command: { priority: 'RESEARCH' } });
      worker.state = 'DEPOSITING';
      const assign = createManagementState(state, { station: 'crew', subjectId: worker.id, selectedId: 'D-060' });
      expect(selectedStationItem(state, assign).reason).toContain('unload');
    }
  });
  it('shows live build prerequisites and inspects already installed logistics', () => {
    const state = managementGame(); const ui = createManagementState(state, { station: 'logistics' });
    expect(selectedStationItem(state, ui).reason).toBe('Requires Rail Logistics.');
    state.run.research.completed.push('RAIL_LOGISTICS');
    const runtime = new GameRuntime(state); runtime.openManagement({ station: 'logistics' }); runtime.activateManagementItem();
    expect(state.run.logistics.lines).toHaveLength(1);
    expect(stationView(state, runtime.getSnapshot().management!).items).toHaveLength(4);
    expect(state.run.engineer.job?.kind).toBe('RAIL_INSTALL');
  });
  it('previews the same Legacy Locker choice and reset values without mutating meta', () => {
    const state = managementGame(); state.meta.protocols.push('LEGACY_LOCKER'); const item = state.run.phase5.equipment.inventory[3]!;
    equipPlayerItem(state, item.id); const before = structuredClone(state);
    const ui = createManagementState(state, { station: 'reboot' }); const details = selectedStationItem(state, ui).lines.join(' ');
    expect(details).toContain(item.id); expect(details).toContain('NOT included in the Core reward');
    expect(legacyEquipmentForReboot(state)?.id).toBe(item.id); expect(state).toEqual(before);
  });
  it('only exposes facilities at their existing progression gates', () => {
    const state = createGameState(); const view = stationView(state, createManagementState(state, { station: 'facilities' }));
    expect(view.items.map((i) => i.id)).toEqual(['workshop', 'equipment']);
    expect(stationAvailable(state, 'reboot')).toBe(false); expect(stationAvailable(state, 'research')).toBe(false);
  });
});

describe('management runtime safety and continuation', () => {
  it('opens no locked station, releases movement and blocks world commands', () => {
    const state = createGameState(); const runtime = new GameRuntime(state);
    runtime.openManagement({ station: 'research' }); expect(runtime.getSnapshot().management).toBeNull();
    runtime.setPointerMovement(1); runtime.openManagement({ station: 'equipment' });
    expect(state.run.character.state).toBe('IDLE'); runtime.dispatch({ type: 'walk', x: 200 }); runtime.dispatch({ type: 'send' });
    expect(state.run.character.state).toBe('IDLE');
  });
  it('restores null or selected vein correctly across nested facility navigation', () => {
    for (const selection of [null, { type: 'node' as const, id: 'scrap-ledge' }]) {
      const state = managementGame(); state.selection = selection; const runtime = new GameRuntime(state);
      runtime.openManagement({ station: 'facilities' }); runtime.openManagement({ station: 'archive' }); runtime.openManagement({ station: 'research' });
      runtime.closeManagement(); expect(state.selection).toEqual(selection);
    }
  });
  it('applies a selected research once, leaves the window open and lets time advance', () => {
    const state = managementGame(); const runtime = new GameRuntime(state);
    runtime.openManagement({ station: 'research', selectedId: 'PRIORITY_CARGO_TAG' }); runtime.activateManagementItem(); runtime.activateManagementItem();
    expect(state.run.data).toBe(40 - RESEARCH.PRIORITY_CARGO_TAG.dataCost);
    expect(runtime.getSnapshot().management?.selectedId).toBe('PRIORITY_CARGO_TAG');
    for (let i = 0; i < 300; i++) updateGame(state, .1); expect(state.run.research.completed).toContain('PRIORITY_CARGO_TAG');
  });
  it('does not execute a different research or hidden command from the current window', () => {
    const state = managementGame(); const runtime = new GameRuntime(state); runtime.openManagement({ station: 'archive' });
    runtime.dispatch({ type: 'research', research: 'PRIORITY_CARGO_TAG' }); runtime.dispatch({ type: 'upgrade-tool' });
    expect(state.run.research.active).toBeNull(); expect(state.run.tool.level).toBe(1);
  });
  it('requires confirmation for equipment transfers and preserves the previous owner on cancel', () => {
    const state = managementGame(); const worker = state.run.phase5.crew.members[0]!; const item = state.run.phase5.equipment.inventory[0]!;
    equipCrewItem(state, worker.id, item.id); const runtime = new GameRuntime(state); runtime.openManagement({ station: 'equipment' });
    runtime.activateManagementItem(); expect(worker.equipment.TOOL).toBe(item.id);
    runtime.dispatch({ type: 'cancel' }); expect(runtime.getSnapshot().management?.confirmation).toBeNull(); expect(worker.equipment.TOOL).toBe(item.id);
    runtime.activateManagementItem(); runtime.activateManagementItem();
    expect(state.run.phase5.equipment.equippedPlayer.TOOL).toBe(item.id); expect(worker.equipment.TOOL).toBeUndefined();
  });
  it('makes worker priority and destination choices explicit without teleporting', () => {
    const state = managementGame(); const worker = state.run.phase5.crew.members[0]!; const runtime = new GameRuntime(state);
    runtime.openManagement({ station: 'crew', subjectId: worker.id, tab: 'priority', selectedId: 'RESEARCH' }); runtime.activateManagementItem();
    expect(worker.minerPriority).toBe('RESEARCH');
    runtime.selectManagementTab('assign'); runtime.selectManagementItem('D-060'); runtime.activateManagementItem();
    expect(worker.assignedDepth).toBe('D-001'); expect(worker.pendingDepth).toBe('D-060');
    for (let i = 0; i < 900; i++) { updateGame(state, 1 / 60); updatePhase5(state, 1 / 60); }
    expect(worker.assignedDepth).toBe('D-060');
  });
  it('purchases a protocol once and keeps the selected installed protocol visible', () => {
    const state = managementGame(); const id = Object.keys(CORE_PROTOCOLS)[0] as CoreProtocolId;
    const runtime = new GameRuntime(state); runtime.openManagement({ station: 'core', selectedId: id }); runtime.activateManagementItem(); runtime.activateManagementItem();
    expect(state.meta.core).toBe(30 - CORE_PROTOCOLS[id].cost); expect(selectedStationItem(state, runtime.getSnapshot().management!).active).toBe(true);
  });
  it('requires two UI activations, cancels without arming the save and resets to the previewed run', () => {
    const state = managementGame(); state.run.depth.current = 'D-100'; state.run.pendingCore = 7; state.run.coreChamber.rebootAvailable = true;
    state.meta.protocols.push('LEGACY_LOCKER'); equipPlayerItem(state, state.run.phase5.equipment.inventory[0]!.id);
    const next = createNewRun({ ...state.meta, core: 37, runIndex: 3, legacyEquipment: legacyEquipmentForReboot(state) });
    const runtime = new GameRuntime(state); runtime.openManagement({ station: 'reboot' }); runtime.activateManagementItem();
    expect(state.meta.runIndex).toBe(2); expect(state.run.coreChamber.rebootArmed).toBe(false);
    expect(runtime.getSnapshot().management?.confirmation).toBeTruthy();
    runtime.dispatch({ type: 'cancel' }); expect(runtime.getSnapshot().management?.confirmation).toBeNull();
    runtime.activateManagementItem(); runtime.activateManagementItem();
    expect(state.meta.runIndex).toBe(3); expect(state.meta.core).toBe(37); expect(state.run.scrap).toBe(next.scrap);
    expect(state.run.phase5.equipment.inventory).toEqual(next.phase5.equipment.inventory); expect(runtime.getSnapshot().management).toBeNull();
  });
  it('forces another review when Core reward changes after confirmation was opened', () => {
    const state = managementGame(); state.run.depth.current = 'D-100'; state.run.pendingCore = 7; state.run.coreChamber.rebootAvailable = true;
    const runtime = new GameRuntime(state); runtime.openManagement({ station: 'reboot' }); runtime.activateManagementItem();
    state.run.pendingCore = 9; runtime.activateManagementItem(); expect(state.meta.runIndex).toBe(2);
    runtime.activateManagementItem(); expect(state.meta.core).toBe(39);
  });
  it('routes the D-030 interaction into the scanner without confirming an Anomaly', () => {
    const state = managementGame(); state.run.depth.current = 'D-030';
    state.run.anomaly.options = ['GOLD_RUSH', 'HEAVY_WORLD', 'FOSSIL_AGE']; state.run.anomaly.selected = null;
    const runtime = new GameRuntime(state); runtime.dispatch({ type: 'interact' });
    expect(runtime.getSnapshot().management?.station).toBe('scanner');
    expect(state.run.anomaly.selected).toBeNull();
    runtime.closeManagement(); runtime.dispatch({ type: 'interact' });
    expect(runtime.getSnapshot().management?.station).toBe('scanner');
  });
  it('never restores confirmation from v6 saves or accepts direct Reboot commands', () => {
    const state = managementGame(); state.run.depth.current = 'D-100'; state.run.pendingCore = 7; state.run.coreChamber.rebootAvailable = true;
    state.run.coreChamber.rebootArmed = true; state.selection = { type: 'core-chamber' };
    const restored = restoreGameState(serializeGameState(state))!; const runtime = new GameRuntime(restored);
    expect(runtime.getSnapshot().management).toBeNull(); expect(restored.run.coreChamber.rebootArmed).toBe(false);
    runtime.dispatch({ type: 'reboot' }); expect(restored.meta.runIndex).toBe(2);
    runtime.openManagement({ station: 'reboot' }); runtime.activateManagementItem();
    expect(JSON.parse(serializeGameState(restored))).not.toHaveProperty('management');
  });
});

describe('management layout', () => {
  it('wraps long tokens without losing any information', () => {
    const input = ['SuperLongSingleTokenWhichMustNotEscapeThePanel'.repeat(8), 'All the reset information is retained.'];
    const wrapped = wrapDetails(input, 280);
    expect(wrapped.join('').replaceAll(' ', '')).toBe(input.join('').replaceAll(' ', ''));
    expect(wrapped.every((line) => line.length <= 35)).toBe(true);
  });
  for (const width of [320, 390, 640, 960, 1440]) it(`keeps all station controls contained and nonoverlapping at ${width}px`, () => {
    const state = managementGame(); state.run.depth.current = 'D-100'; state.run.coreChamber.rebootAvailable = true; state.run.pendingCore = 7;
    const height = width < 640 ? width * 9 / 16 + 242 : width * 9 / 16 + 88;
    const viewport = { width, height, world: { x: 0, y: 0, width, height: width * 9 / 16 } };
    for (const station of stations) {
      let ui = createManagementState(state, { station });
      for (const tab of [...stationView(state, ui).tabs.map((tab) => tab.id), '']) {
        ui = createManagementState(state, { station, tab });
        for (const confirmation of [null, selectedStationItem(state, ui).confirmKey ?? null]) {
          const layout = layoutManagementUi(state, { ...ui, confirmation }, viewport);
          for (const [i, button] of layout.buttons.entries()) {
            expect(button.width, `${station} ${button.id}`).toBeGreaterThanOrEqual(44); expect(button.height).toBeGreaterThanOrEqual(44);
            expect(button.x).toBeGreaterThanOrEqual(0); expect(button.y).toBeGreaterThanOrEqual(0);
            expect(button.x + button.width).toBeLessThanOrEqual(width); expect(button.y + button.height).toBeLessThanOrEqual(height);
            for (const other of layout.buttons.slice(i + 1)) expect(button.x < other.x + other.width && button.x + button.width > other.x && button.y < other.y + other.height && button.y + button.height > other.y, `${station}: ${button.id} overlaps ${other.id}`).toBe(false);
          }
          expect(layout.textBox.height).toBeGreaterThanOrEqual(32);
          const last = layoutManagementUi(state, { ...ui, detailPage: 999 }, viewport); expect(last.page).toBe(last.pages.length - 1);
        }
      }
    }
  });
});
