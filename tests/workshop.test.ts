import { createManagementState, stationView } from '../src/game/management';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createGameState } from '../src/game/createGame';
import { PLAYER_PACK_CAPACITY, UPGRADE_COSTS } from '../src/game/config';
import { serializeGameState, restoreGameState } from '../src/game/save';
import { selectNode, updateGame, upgradeBoots, upgradePack, upgradeTool } from '../src/game/simulation';
import { selectedWorkshopItem, workshopGuide, workshopItems } from '../src/game/workshop';
import { layoutWorkshopUi } from '../src/render/workshopUi';
import { GameRuntime } from '../src/runtime/GameRuntime';

beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) });
});

function item(state: ReturnType<typeof createGameState>, id: string) {
  return selectedWorkshopItem(workshopItems(state), id);
}

describe('workshop presentation', () => {
  it('describes unaffordable and locked items without hiding or mutating them', () => {
    const state = createGameState(10); const before = serializeGameState(state);
    expect(item(state, 'upgrade-tool')).toMatchObject({ cost: UPGRADE_COSTS.tool, reason: 'NEED 90 MORE SCRAP', command: null });
    expect(item(state, 'upgrade-boots')).toMatchObject({ reason: 'NEED 160 MORE SCRAP', command: null });
    expect(item(state, 'upgrade-pack')).toMatchObject({ reason: 'NEED 240 MORE SCRAP', command: null });
    expect(serializeGameState(state)).toBe(before);
  });

  it('compares current and upgraded hit power with the real modifiers', () => {
    const state = createGameState(11); state.run.scrap = 1000; state.run.anomaly.selected = 'FRAGILE_REALITY';
    expect(item(state, 'upgrade-tool').comparison).toBe('Hit power  16 → 26');
    upgradeTool(state);
    expect(item(state, 'upgrade-tool')).toMatchObject({ owned: true, comparison: 'Hit power  26', actionLabel: 'Equipped' });
  });

  it('keeps movement modifiers in its before/after comparison', () => {
    const state = createGameState(12); state.run.scrap = 1000; upgradeTool(state);
    state.run.anomaly.selected = 'HEAVY_WORLD'; state.meta.passives.active.push('LONG_STRIDE');
    expect(item(state, 'upgrade-boots').comparison).toBe('Walk speed  55.4 → 87.1 px/s');
    upgradeBoots(state);
    expect(state.run.character.moveSpeed).toBeCloseTo(87.12);
    expect(item(state, 'upgrade-boots').comparison).toBe('Walk speed  87.1 px/s');
  });

  it('compares and installs the actual backpack capacity', () => {
    const state = createGameState(13); state.run.scrap = 1000; state.run.automation.autoSwing.unlocked = true;
    expect(item(state, 'upgrade-pack').comparison).toBe('Carry capacity  8 → 15 kg');
    upgradePack(state);
    expect(state.run.character.backpackCapacity).toBe(PLAYER_PACK_CAPACITY[2]);
    expect(item(state, 'upgrade-pack').comparison).toBe('Carry capacity  15 kg');
  });

  it('distinguishes installed equipment from an automation switch', () => {
    const state = createGameState(14); state.run.automation.autoSwing = { unlocked: true, enabled: false };
    expect(item(state, 'unlock-auto-swing')).toMatchObject({ owned: true, command: { type: 'toggle-auto-swing' }, actionLabel: 'Switch Auto Swing ON' });
  });

  it('keeps older recovered items accessible after more than eight finds', () => {
    const state = createGameState(15);
    for (let i = 0; i < 12; i++) state.run.phase5.equipment.inventory.push({ id: `gear-${i}`, baseId: 'ancient-pick', slot: 'TOOL',
      name: `Pick ${i}`, rarity: 'RARE', level: 1, affixes: [], originDepth: 'D-180' });
    expect(item(state, 'recovered-gear').comparison).toBe('12 stored instances');
    const recovered = stationView(state, createManagementState(state, { station: 'equipment' })).items;
    expect(recovered).toHaveLength(12);
    expect(recovered[0]!.action).toEqual({ type: 'command', command: { type: 'equip-item', itemId: 'gear-0' } });
  });

  it('guides the next purchase only after delivery, with a live shortfall and no forced opening', () => {
    const state = createGameState(16);
    expect(workshopGuide(state)).toBeNull();
    state.run.stats.elevatorTrips = 1; state.run.scrap = 40;
    expect(workshopGuide(state)).toEqual({ ready: false, label: 'Steel Pick · need 50 more scrap' });
    state.run.scrap = 90;
    expect(workshopGuide(state)).toEqual({ ready: true, label: 'Workshop: Steel Pick ready' });
    upgradeTool(state);
    expect(workshopGuide(state)?.label).toContain('Runner Boots');
    state.meta.runIndex = 2;
    expect(workshopGuide(state)).toBeNull();
  });
});

describe('workshop input boundary', () => {
  it('releases held walking and blocks world commands without losing cargo or selection', () => {
    const state = createGameState(20); selectNode(state, 'scrap-ledge');
    state.run.character.carried.push({ id: 'ore', kind: 'IRON', name: 'Iron', rarity: 'COMMON', category: 'ORE', weight: 2, value: 12, dataValue: 0, coreValue: 0, x: 118, y: 210 });
    const runtime = new GameRuntime(state); runtime.setPointerMovement(1); runtime.openWorkshop();
    const before = serializeGameState(state);
    runtime.dispatch({ type: 'walk', x: 440 }); runtime.dispatch({ type: 'mine' }); runtime.dispatch({ type: 'interact' });
    runtime.dispatch({ type: 'return' }); runtime.dispatch({ type: 'send' }); runtime.setPointerMovement(-1);
    expect(serializeGameState(state)).toBe(before);
    expect(state.run.character.state).toBe('IDLE');
    expect(state.selection).toEqual({ type: 'node', id: 'scrap-ledge' });
    runtime.closeWorkshop();
    expect(state.run.character.carried).toHaveLength(1);
    runtime.dispatch({ type: 'walk', x: 440 });
    expect(state.run.character.state).toBe('MOVING_TO_POINT');
  });

  it('buys once, preserves the selected slot, and does not grant other upgrades', () => {
    const state = createGameState(21); state.run.scrap = 1000;
    const runtime = new GameRuntime(state); runtime.openWorkshop();
    runtime.dispatch({ type: 'upgrade-boots' });
    expect(state.run.boots.level).toBe(1);
    runtime.activateWorkshopItem(); runtime.activateWorkshopItem();
    expect(state.run.tool.level).toBe(2); expect(state.run.scrap).toBe(910);
    expect(runtime.getSnapshot().workshop).toMatchObject({ selectedId: 'upgrade-tool' });
    expect(runtime.getSnapshot().workshop?.notice).toContain('Steel Pick equipped');
  });

  it('never pauses autonomous transport while inspecting a purchase', () => {
    const state = createGameState(22); state.run.elevator.state = 'ASCENDING'; state.run.elevator.position = .2;
    const runtime = new GameRuntime(state); runtime.openWorkshop();
    for (let i = 0; i < 30; i++) updateGame(state, 1 / 60);
    expect(state.run.elevator.position).toBeGreaterThan(.2);
    expect(runtime.getSnapshot().workshop).not.toBeNull();
  });

  it('does not serialize menu state, or reopen a legacy saved workshop selection', () => {
    const state = createGameState(23); state.run.scrap = 90;
    const runtime = new GameRuntime(state); runtime.openWorkshop(); runtime.activateWorkshopItem();
    const save = serializeGameState(state);
    expect(save).not.toContain('selectedId');
    const restored = restoreGameState(save)!; restored.selection = { type: 'workbench' };
    const resumed = new GameRuntime(restored);
    expect(resumed.getSnapshot().workshop).toBeNull();
    expect(resumed.getSnapshot().state.run.tool.level).toBe(2);
    expect(restored.selection).toBeNull();
  });
});

describe('responsive Canvas geometry', () => {
  it.each([320, 390, 960, 1440])('keeps %ipx UI targets inside the fixed viewport with usable hit areas', (width) => {
    const state = createGameState(30); const height = Math.max(320, width * 9 / 16);
    const ui = layoutWorkshopUi(state, { selectedId: 'upgrade-tool', notice: null, runIndex: 1, depth: 'D-001' },
      { width, height, world: { x: 0, y: 0, width, height: width * 9 / 16 } });
    for (const b of ui.buttons) {
      expect(b.x).toBeGreaterThanOrEqual(0); expect(b.y).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width).toBeLessThanOrEqual(width); expect(b.y + b.height).toBeLessThanOrEqual(height);
      expect(b.width).toBeGreaterThanOrEqual(44); expect(b.height).toBeGreaterThanOrEqual(44);
    }
  });
});
