import { describe, expect, it } from 'vitest';
import { AUTO_SWING_MANUAL_SWINGS_REQUIRED, LOOT, RESEARCH } from '../src/game/config';
import { createGameState } from '../src/game/createGame';
import { restoreGameState, serializeGameState } from '../src/game/save';
import {
  armReboot,
  canStartResearch,
  chooseAnomaly,
  commitReboot,
  currentFloor,
  purchaseCoreProtocol,
  requestFloorTravel,
  requestMine,
  selectArchive,
  selectCoreChamber,
  selectCoreConsole,
  sendElevator,
  startResearch,
  togglePassive,
  unlockAutoDispatch,
  unlockAutoSwing,
  unlockD030,
  unlockD060,
  unlockD100,
  unlockPorter,
  updateGame,
  upgradeBoots,
  upgradePack,
  upgradeTool,
} from '../src/game/simulation';
import type { DepthId, GameState, LootKind, LootStack, ResearchId } from '../src/game/types';

function ticks(state: GameState, count: number): void {
  for (let index = 0; index < count; index += 1) updateGame(state, 1 / 60);
}

function advanceUntil(state: GameState, predicate: () => boolean, maxTicks = 12000): void {
  for (let index = 0; index < maxTicks && !predicate(); index += 1) ticks(state, 1);
  expect(predicate()).toBe(true);
}

function makeLoot(kind: LootKind, id = `test-${kind}`): LootStack {
  const item = LOOT[kind];
  return {
    id,
    kind,
    name: item.name,
    rarity: item.rarity,
    category: item.category,
    weight: item.weight,
    value: item.value,
    dataValue: item.dataValue ?? 0,
    coreValue: item.coreValue ?? 0,
    x: 118,
    y: 206,
  };
}

function primeAutomation(state: GameState): void {
  state.run.stats.playerDeposits = 1; state.run.stats.elevatorTrips = 1;
  state.run.scrap = 30000;
  state.run.stats.manualSwings = AUTO_SWING_MANUAL_SWINGS_REQUIRED;
  if (state.run.tool.level === 1) expect(upgradeTool(state)).toBe(true);
  if (state.run.boots.level === 1) expect(upgradeBoots(state)).toBe(true);
  if (!state.run.automation.autoSwing.unlocked) expect(unlockAutoSwing(state)).toBe(true);
  if (state.run.pack.level === 1) expect(upgradePack(state)).toBe(true);
  if (!state.run.porter.enabled) expect(unlockPorter(state)).toBe(true);
  if (!state.run.automation.autoDispatch.unlocked) expect(unlockAutoDispatch(state)).toBe(true);
}

function travel(state: GameState, depth: DepthId): void {
  expect(requestFloorTravel(state, depth)).toBe(true);
  advanceUntil(state, () => state.run.depth.current === depth && state.run.elevator.travel === null);
}

function enterD030(state: GameState): void {
  primeAutomation(state);
  if (!state.run.depth.unlocked.includes('D-030')) expect(unlockD030(state)).toBe(true);
  travel(state, 'D-030');
  expect(state.run.anomaly.options).toHaveLength(3);
  if (!state.run.anomaly.selected) expect(chooseAnomaly(state, state.run.anomaly.options[0]!)).toBe(true);
}

function unlockAndEnterD060(state: GameState): void {
  enterD030(state);
  state.meta.collection.entries[0]!.discovered = true;
  state.meta.collection.entries[0]!.count = 1;
  state.meta.passives.unlocked = ['LONG_STRIDE'];
  state.meta.passives.active = ['LONG_STRIDE'];
  state.run.scrap = 30000;
  expect(unlockD060(state)).toBe(true);
  travel(state, 'D-060');
}

function unlockAndEnterD100(state: GameState): void {
  unlockAndEnterD060(state);
  state.run.research.completed = ['DEEP_SURVEY', 'CORE_RESONANCE'];
  state.run.scrap = 30000;
  expect(unlockD100(state)).toBe(true);
  travel(state, 'D-100');
}

function placeAtNode(state: GameState, nodeId: string): void {
  const node = currentFloor(state).nodes.find((candidate) => candidate.id === nodeId)!;
  state.run.character.x = node.x < 240 ? node.x + 13 : node.x - 13;
  state.run.character.targetNodeId = node.id;
  state.run.character.state = 'MINING';
}

describe('Milestone 4 — multiple floors, research and first reboot', () => {
  it('keeps D-030 floor state and loot while traveling away and back', () => {
    const state = createGameState(1001);
    unlockAndEnterD060(state);
    travel(state, 'D-030');
    const node = currentFloor(state).nodes[0]!;
    node.hp = 7;
    currentFloor(state).loot.push(makeLoot('TRILOBITE', 'left-behind'));
    travel(state, 'D-060');
    expect(state.run.floors['D-030'].nodes[0]!.hp).toBe(7);
    expect(state.run.floors['D-030'].loot.some((item) => item.id === 'left-behind')).toBe(true);
    travel(state, 'D-030');
    expect(currentFloor(state).loot.some((item) => item.id === 'left-behind')).toBe(true);
  });

  it('restores an in-progress physical floor travel', () => {
    let state = createGameState(1002);
    enterD030(state);
    travel(state, 'D-001');
    expect(requestFloorTravel(state, 'D-030')).toBe(true);
    ticks(state, 45);
    const remaining = state.run.elevator.travel!.remaining;
    state = restoreGameState(serializeGameState(state))!;
    expect(state.run.elevator.travel?.to).toBe('D-030');
    expect(state.run.elevator.travel!.remaining).toBeCloseTo(remaining, 5);
    advanceUntil(state, () => state.run.depth.current === 'D-030' && !state.run.elevator.travel);
  });

  it('keeps Research Sample physical until Porter -> elevator -> Surface appraisal', () => {
    const state = createGameState(1003);
    unlockAndEnterD060(state);
    const sample = makeLoot('SURVEY_CARTRIDGE', 'sample');
    currentFloor(state).loot.push(sample);
    expect(state.run.data).toBe(0);
    advanceUntil(state, () => state.run.porter.carried.some((item) => item.id === sample.id));
    expect(state.run.data).toBe(0);
    advanceUntil(state, () => state.run.elevator.cargo.some((item) => item.id === sample.id));
    expect(state.run.data).toBe(0);
    expect(sendElevator(state)).toBe(true);
    advanceUntil(state, () => state.run.data >= (LOOT.SURVEY_CARTRIDGE.dataValue ?? 0));
  });

  it('runs Research in simulation time and restores progress', () => {
    let state = createGameState(1004);
    unlockAndEnterD060(state);
    state.run.data = 20;
    expect(canStartResearch(state, 'DEEP_SURVEY')).toBe(true);
    expect(startResearch(state, 'DEEP_SURVEY')).toBe(true);
    ticks(state, 300);
    const remaining = state.run.research.active!.remaining;
    state = restoreGameState(serializeGameState(state))!;
    expect(state.run.research.active?.id).toBe('DEEP_SURVEY');
    expect(state.run.research.active!.remaining).toBeCloseTo(remaining, 4);
    advanceUntil(state, () => state.run.research.completed.includes('DEEP_SURVEY'));
    expect(state.run.research.active).toBeNull();
  });

  it('requires Core Resonance before D-100 extension', () => {
    const state = createGameState(1005);
    unlockAndEnterD060(state);
    state.run.scrap = 30000;
    expect(unlockD100(state)).toBe(false);
    state.run.research.completed.push('CORE_RESONANCE');
    expect(unlockD100(state)).toBe(true);
  });

  it('keeps Core loot pending until Surface and grants permanent Core only on Reboot', () => {
    const state = createGameState(1006);
    unlockAndEnterD100(state);
    const fragment = makeLoot('CORE_FRAGMENT', 'core-fragment');
    currentFloor(state).loot.push(fragment);
    expect(state.run.pendingCore).toBe(0);
    expect(state.meta.core).toBe(0);
    advanceUntil(state, () => state.run.elevator.cargo.some((item) => item.id === fragment.id));
    expect(state.run.pendingCore).toBe(0);
    expect(sendElevator(state)).toBe(true);
    advanceUntil(state, () => state.run.pendingCore === 1);
    expect(state.meta.core).toBe(0);
    expect(state.run.coreChamber.rebootAvailable).toBe(true);
    selectCoreChamber(state);
    expect(armReboot(state)).toBe(true);
    expect(state.run.coreChamber.rebootArmed).toBe(true);
    expect(commitReboot(state)).toBe(true);
    expect(state.meta.core).toBe(1);
    expect(state.meta.runIndex).toBe(2);
    expect(state.run.pendingCore).toBe(0);
  });

  it('makes Reboot reset Run state while preserving Collection and Passives', () => {
    const state = createGameState(1007);
    unlockAndEnterD100(state);
    state.meta.collection.entries[1]!.discovered = true;
    state.meta.collection.entries[1]!.count = 2;
    state.meta.passives.unlocked = ['LONG_STRIDE'];
    state.meta.passives.active = ['LONG_STRIDE'];
    state.run.scrap = 999;
    state.run.data = 12;
    state.run.pendingCore = 3;
    state.run.coreChamber.rebootAvailable = true;
    state.run.coreChamber.rebootArmed = true;
    const oldSeed = state.run.seed;
    expect(commitReboot(state)).toBe(true);
    expect(state.run.seed).not.toBe(oldSeed);
    expect(state.run.scrap).toBe(0);
    expect(state.run.data).toBe(0);
    expect(state.run.depth.unlocked).toEqual(['D-001']);
    expect(state.run.anomaly.selected).toBeNull();
    expect(state.run.research.completed).toEqual([]);
    expect(state.meta.collection.entries[1]!.count).toBe(2);
    expect(state.meta.passives.unlocked).toContain('LONG_STRIDE');
    expect(state.meta.core).toBe(3);
  });

  it('applies Core Protocol as visible/simulation-starting Run 2 state', () => {
    const state = createGameState(1008);
    state.meta.runIndex = 2;
    state.meta.core = 6;
    state.run = createGameState(1008).run;
    state.selection = { type: 'core-console' };
    expect(purchaseCoreProtocol(state, 'CARGO_MEMORY')).toBe(true);
    expect(state.run.porter.enabled).toBe(true);
    expect(purchaseCoreProtocol(state, 'EXPERIENCED_HANDS')).toBe(true);
    expect(state.run.tool.level).toBe(2);
    expect(state.run.automation.autoSwing.unlocked).toBe(true);
    expect(state.meta.core).toBe(2);
  });

  it('keeps the same Run deterministic across reload', () => {
    let state = createGameState(1009);
    enterD030(state);
    const options = [...state.run.anomaly.options];
    const runSeed = state.run.seed;
    state = restoreGameState(serializeGameState(state))!;
    expect(state.run.seed).toBe(runSeed);
    expect(state.run.anomaly.options).toEqual(options);
  });

  it('migrates a v3 save into v5 Run/Meta structure', () => {
    const legacy = createGameState(1010);
    const rawV3 = {
      version: 3,
      elapsed: 12,
      runSeed: 1010,
      rngState: 55,
      lootRoll: 3,
      scrap: 1234,
      character: legacy.run.character,
      porter: legacy.run.porter,
      elevator: legacy.run.elevator,
      tool: legacy.run.tool,
      boots: legacy.run.boots,
      pack: legacy.run.pack,
      automation: legacy.run.automation,
      stats: legacy.run.stats,
      floor: legacy.run.floors['D-001'],
      depth: { current: 'D-001', unlockedD030: false },
      anomaly: { options: [], selected: null },
      collection: legacy.meta.collection,
      passives: legacy.meta.passives,
      discovery: legacy.run.discovery,
      eventHistory: [],
      nextEventId: 1,
      nextLootId: 1,
    };
    const migrated = restoreGameState(JSON.stringify(rawV3))!;
    expect(migrated.version).toBe(6);
    expect(migrated.run.scrap).toBe(1234);
    expect(migrated.meta.runIndex).toBe(1);
    expect(migrated.run.depth.current).toBe('D-001');
  });

  it('keeps manual mining and two-slot Passive behavior intact', () => {
    const state = createGameState(1011);
    placeAtNode(state, 'scrap-ledge');
    const node = currentFloor(state).nodes[0]!;
    expect(requestMine(state)).toBe(true);
    ticks(state, 14);
    expect(node.hp).toBeLessThan(node.maxHp);

    state.meta.passives.unlocked = ['LONG_STRIDE', 'LAST_SWING', 'PROSPECTORS_EYE'];
    state.meta.passives.active = [];
    selectArchive(state);
    expect(togglePassive(state, 'LONG_STRIDE')).toBe(true);
    expect(togglePassive(state, 'LAST_SWING')).toBe(true);
    expect(togglePassive(state, 'PROSPECTORS_EYE')).toBe(false);
    expect(state.meta.passives.active).toHaveLength(2);
  });

  it.each<ResearchId>(['DEEP_SURVEY', 'PRIORITY_CARGO_TAG'])('does not let %s complete instantly', (id) => {
    const state = createGameState(1012);
    unlockAndEnterD060(state);
    state.run.data = 50;
    if (RESEARCH[id].prerequisite) state.run.research.completed.push(RESEARCH[id].prerequisite!);
    expect(startResearch(state, id)).toBe(true);
    expect(state.run.research.completed).not.toContain(id);
    ticks(state, 1);
    expect(state.run.research.active?.id).toBe(id);
  });
});
