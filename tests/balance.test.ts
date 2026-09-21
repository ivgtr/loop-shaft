import { describe, expect, it } from 'vitest';
import { createGameState, createNewRun } from '../src/game/createGame';
import { LOOT, PLAYER_PACK_CAPACITY, UPGRADE_COSTS } from '../src/game/config';
import { CORE_RESERVES, coreReserveRemaining, finishingDamage, maximumMiningDropWeight, nodeSurvey, rollMiningLoot, visibleSeams } from '../src/game/mining';
import { DISPATCH_POLICIES, setDispatchPolicy, shipmentDecision, updateShipmentWait } from '../src/game/dispatch';
import { restoreGameState, serializeGameState } from '../src/game/save';
import { canExtendD030, currentFloor, requestMine, unlockAutoDispatch, unlockAutoSwing, unlockPorter, updateGame, upgradeBoots, upgradePack } from '../src/game/simulation';
import { updatePhase5, unlockCrewOperations } from '../src/game/phase5';
import { sceneReadout } from '../src/game/hud';
import { elevatorItems } from '../src/game/elevatorUi';
import type { DepthId, GameState, LootKind, LootStack } from '../src/game/types';

const sink = () => undefined;
function physical(kind: LootKind, id = kind): LootStack {
  const d = LOOT[kind];
  return { id, kind, name: d.name, category: d.category, rarity: d.rarity, weight: d.weight, value: d.value,
    dataValue: d.dataValue ?? 0, coreValue: d.coreValue ?? 0, x: 240, y: 210, originDepth: 'D-001' };
}
function roll(state: GameState, depth: DepthId, nodeIndex: number) {
  const floor = state.run.floors[depth];
  return rollMiningLoot(state, floor, floor.nodes[nodeIndex]!, sink);
}
function ticks(state: GameState, seconds: number) {
  for (let i = 0; i < Math.ceil(seconds * 60); i++) updateGame(state, 1 / 60);
}

describe('site identity and finite, visible discovery', () => {
  it('reveals a guaranteed first fossil without rolling RNG or creating currency in the preview', () => {
    const state = createGameState(883);
    const floor = currentFloor(state); const node = floor.nodes[2]!;
    const before = serializeGameState(state);
    expect(nodeSurvey(state, floor, node)).toContain('Trilobite');
    expect(visibleSeams(floor, node)[0]).toEqual({ at: 1, kind: 'TRILOBITE' });
    state.selection = { type: 'node', id: node.id };
    expect(sceneReadout(state).survey).toContain('Trilobite');
    state.selection = null;
    expect(serializeGameState(state)).toBe(before);
    expect(roll(state, 'D-001', 2).some((item) => item.kind === 'TRILOBITE')).toBe(true);
    expect(state.run.scrap).toBe(0); expect(state.run.data).toBe(0); expect(state.run.pendingCore).toBe(0);
    expect(visibleSeams(floor, node)).toEqual([{ at: 3, kind: 'AMMONITE' }]);
  });

  it('consumes bonus seams, not the ordinary yield or chance, and preserves consumption on reload', () => {
    const state = createGameState(884); const node = currentFloor(state).nodes[2]!;
    const base = { chance: node.treasureChance, min: node.yieldMin, max: node.yieldMax };
    for (let i = 0; i < 30; i++) expect(roll(state, 'D-001', 2).filter((item) => item.category === 'ORE').length).toBeGreaterThan(0);
    expect(visibleSeams(currentFloor(state), node)).toEqual([]);
    expect({ chance: node.treasureChance, min: node.yieldMin, max: node.yieldMax }).toEqual(base);
    const restored = restoreGameState(serializeGameState(state))!;
    expect(currentFloor(restored).nodes[2]!.minedCount).toBe(30);
    expect(roll(restored, 'D-001', 2)).toEqual(roll(state, 'D-001', 2));
    expect(restored.run.rngState).toBe(state.run.rngState);
  });

  it('uses the same seeded reward table and guarantees for every mining actor and floor', () => {
    for (const depth of ['D-001', 'D-030', 'D-060', 'D-100', 'D-180', 'D-250', 'D-400'] as const) {
      const states = [createGameState(991), createGameState(991), createGameState(991)];
      const sources = [{}, { crewId: 'miner' }, { boreId: 'bore' }];
      for (let i = 0; i < 24; i++) {
        const result = states.map((state, index) => {
          const floor = state.run.floors[depth];
          return rollMiningLoot(state, floor, floor.nodes[i % 3]!, sink, sources[index])
            .map(({ sourceCrewId: _source, ...item }) => item);
        });
        expect(result[1]).toEqual(result[0]); expect(result[2]).toEqual(result[0]);
      }
      expect(states[1]!.run.discovery).toEqual(states[0]!.run.discovery);
    }
  });

  it('guarantees offscreen research using the worker floor rather than the displayed floor', () => {
    const state = createGameState(998);
    expect(state.run.depth.current).toBe('D-001');
    expect(roll(state, 'D-060', 0).some((item) => item.category === 'RESEARCH')).toBe(true);
    expect(state.run.discovery.d060NodeBreaks).toBe(1);
    expect(state.run.discovery.d030NodeBreaks).toBe(0);
  });

  it('keeps ordinary Copper Pocket cargo small enough for the upgraded pack, but not always the starting pack', () => {
    let oversized = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const state = createGameState(seed);
      const ore = roll(state, 'D-001', 1).filter((item) => item.category === 'ORE');
      const weight = ore.reduce((sum, item) => sum + item.weight, 0);
      if (weight > PLAYER_PACK_CAPACITY[1]) oversized++;
      expect(weight).toBeLessThanOrEqual(PLAYER_PACK_CAPACITY[2]);
    }
    expect(oversized).toBeGreaterThan(10);
  });
});

describe('finite Core and shared mining integration', () => {
  it('extracts exactly four Core units from the Shell, including unshipped fragments, with no reload refill', () => {
    let state = createGameState(10); let units = 0;
    for (let i = 0; i < 30; i++) {
      const items = roll(state, 'D-100', 2);
      units += items.reduce((sum, item) => sum + item.coreValue, 0);
      if (i === 0) expect(units).toBe(2);
      if (i > 2) expect(items.every((item) => item.category === 'ORE')).toBe(true);
      state = restoreGameState(serializeGameState(state))!;
    }
    expect(units).toBe(4); expect(state.run.pendingCore).toBe(0);
    expect(coreReserveRemaining(state.run.floors['D-100'].nodes[2]!)).toBe(0);
    state.run = createNewRun(state.meta);
    expect(coreReserveRemaining(state.run.floors['D-100'].nodes[2]!)).toBe(4);
  });

  it('makes deep reserves finite and attainable even without a lucky Core roll', () => {
    const state = createGameState(500);
    for (const floor of Object.values(state.run.floors)) for (const node of floor.nodes) {
      const reserve = CORE_RESERVES[node.id]; if (!reserve || node.id === 'core-shell') continue;
      let units = 0;
      node.treasureChance = 0;
      for (let i = 0; i < reserve * 6 + 12; i++) units += rollMiningLoot(state, floor, node, sink).reduce((sum, item) => sum + item.coreValue, 0);
      expect(units, node.id).toBe(reserve);
      expect(coreReserveRemaining(node)).toBe(0);
    }
  });

  it.each(['PLAYER', 'CREW'] as const)('the real %s swing path consumes the same Shell reserve', (actor) => {
    const state = createGameState(70); state.run.depth.current = 'D-100';
    state.run.depth.unlocked.push('D-100');
    const node = currentFloor(state).nodes[2]!; node.hp = 10;
    if (actor === 'PLAYER') {
      state.run.character.x = node.x - 13;
      expect(requestMine(state, node.id)).toBe(true);
      ticks(state, 0.3);
    } else {
      state.meta.runIndex = 2; state.run.porter.enabled = true; state.run.scrap = 1800;
      state.run.research.completed.push('CREW_ROUTING', 'CARGO_SCHEDULER');
      expect(unlockCrewOperations(state)).toBe(true);
      const worker = state.run.phase5.crew.members.find((member) => member.role === 'MINER')!;
      worker.targetNodeId = node.id; worker.state = 'MINING'; worker.body.x = node.x - 13;
      updatePhase5(state, 0.1); updatePhase5(state, 0.1);
    }
    expect(node.coreExtracted).toBe(2);
    expect(currentFloor(state).loot.reduce((sum, item) => sum + item.coreValue, 0)).toBe(2);
    expect(state.run.pendingCore).toBe(0);
  });

  it('bounds every generated Bore batch, including finite discoveries and anomaly yield changes', () => {
    for (const anomaly of [null, 'LIVING_ROCK', 'FRAGILE_REALITY', 'GOLD_RUSH'] as const) {
      const state = createGameState(23); state.run.anomaly.selected = anomaly;
      const floor = state.run.floors['D-400'];
      for (let n = 0; n < 20; n++) for (const node of floor.nodes) {
        const maximum = maximumMiningDropWeight(state, floor, node);
        const weight = rollMiningLoot(state, floor, node, sink).reduce((sum, item) => sum + item.weight, 0);
        expect(weight).toBeLessThanOrEqual(maximum + 0.001);
      }
    }
  });
});

describe('shipment policies deliver physical small cargo', () => {
  it.each(DISPATCH_POLICIES)('%s has a finite wait for a lone light item', (policy) => {
    const state = createGameState(12);
    state.run.automation.autoDispatch = { unlocked: true, enabled: true };
    expect(setDispatchPolicy(state, policy)).toBe(true);
    state.run.elevator.cargo.push(physical('OLD_COIN'));
    expect(shipmentDecision(state).send).toBe(false);
    ticks(state, 30);
    expect(state.run.scrap).toBe(LOOT.OLD_COIN.value);
    expect(state.run.elevator.cargo).toEqual([]);
  });

  it('does not reset the oldest cargo clock on new loads, switching policy, toggles or reload', () => {
    const state = createGameState(13);
    state.run.automation.autoDispatch.unlocked = true;
    state.run.elevator.cargo.push(physical('IRON'));
    updateShipmentWait(state, 7);
    state.run.elevator.cargo.push(physical('IRON', 'new-iron'));
    setDispatchPolicy(state, 'BULK'); setDispatchPolicy(state, 'PRIORITY');
    state.run.automation.autoDispatch.enabled = false;
    const restored = restoreGameState(serializeGameState(state))!;
    expect(restored.run.elevator.cargoWaitSeconds).toBe(7);
    expect(shipmentDecision(restored).remaining).toBe(1);
    updateShipmentWait(restored, 1);
    expect(shipmentDecision(restored).send).toBe(true);
  });

  it('lets balanced/bulk batches reach the real 85% Rhythm threshold', () => {
    const state = createGameState(14); state.meta.passives.active.push('ELEVATOR_RHYTHM');
    state.run.automation.autoDispatch = { unlocked: true, enabled: true };
    state.run.elevator.cargo = Array.from({ length: 8 }, (_, i) => physical('IRON', `iron-${i}`));
    expect(shipmentDecision(state).threshold).toBe(17);
    expect(shipmentDecision(state).send).toBe(false);
    state.run.elevator.cargo.push(physical('IRON', 'ninth'));
    ticks(state, 0.1);
    expect(state.run.elevator.state).toBe('ASCENDING'); expect(state.run.elevator.rhythmBoostTrips).toBe(1);
  });

  it('sends important cargo earlier but grants Data only after Surface unloading', () => {
    const state = createGameState(15);
    state.run.automation.autoDispatch = { unlocked: true, enabled: true };
    setDispatchPolicy(state, 'PRIORITY'); state.run.elevator.cargo.push(physical('CRYSTAL_MEMORY'));
    ticks(state, 1.6); expect(state.run.elevator.state).toBe('ASCENDING'); expect(state.run.data).toBe(0);
    ticks(state, 5); expect(state.run.data).toBe(3);
    expect(elevatorItems(state, 'dispatch').find((item) => item.id === 'dispatch-PRIORITY')?.complete).toBe(true);
  });
});

describe('progression, finishing hits and save migration', () => {
  it('allows different purchase orders while preserving first-hand automation prerequisites', () => {
    const state = createGameState(30); state.run.scrap = 5000;
    expect(upgradePack(state)).toBe(true); expect(upgradeBoots(state)).toBe(true);
    expect(state.run.tool.level).toBe(1); expect(state.run.automation.autoSwing.unlocked).toBe(false);
    expect(unlockAutoSwing(state)).toBe(false); state.run.stats.manualSwings = 6;
    expect(unlockAutoSwing(state)).toBe(true);
    expect(unlockPorter(state)).toBe(false); state.run.stats.playerDeposits = 1;
    expect(unlockPorter(state)).toBe(true);
    expect(unlockAutoDispatch(state)).toBe(false); state.run.stats.elevatorTrips = 1;
    expect(unlockAutoDispatch(state)).toBe(true);
    expect(UPGRADE_COSTS.pack).toBeLessThan(UPGRADE_COSTS.porter);
  });

  it('opens D-030 after delivery without forcing any automation', () => {
    const state = createGameState(31); state.run.scrap = 1200;
    expect(canExtendD030(state)).toBe(false); state.run.stats.elevatorTrips = 1;
    expect(canExtendD030(state)).toBe(true);
    expect(state.run.porter.enabled).toBe(false); expect(state.run.automation.autoDispatch.unlocked).toBe(false);
  });

  it('Last Swing removes a real finishing swing without becoming unlimited one-shot damage', () => {
    const state = createGameState(32); const node = currentFloor(state).nodes[1]!;
    node.maxHp = 96; node.hp = 16;
    expect(finishingDamage(state, node, 10)).toBe(10);
    state.meta.passives.active.push('LAST_SWING');
    expect(finishingDamage(state, node, 10)).toBe(16);
    node.hp = 30; expect(finishingDamage(state, node, 10)).toBe(10);
  });

  it('does not add HP on repeated round trips and carries finite progress with the RNG', () => {
    let state = createGameState(33);
    const node = state.run.floors['D-180'].nodes[0]!; node.hp = 7; node.minedCount = 3; node.coreExtracted = 1;
    for (let i = 0; i < 20; i++) state = restoreGameState(serializeGameState(state))!;
    expect(state.run.floors['D-180'].nodes[0]).toMatchObject({ hp: 7, minedCount: 3, coreExtracted: 1 });
  });

  it('rebases old static tuning without replaying old welcome finds or losing existing cargo', () => {
    const state = createGameState(34); state.run.stats.manualSwings = 10; state.run.stats.elevatorTrips = 1;
    state.run.character.carried.push(physical('TRILOBITE', 'keep-me'));
    const node = currentFloor(state).nodes[1]!;
    node.maxHp = 54; node.hp = 27; node.respawnDelay = 9;
    for (const floor of Object.values(state.run.floors)) for (const old of floor.nodes) {
      delete old.minedCount; delete old.coreExtracted;
    }
    const restored = restoreGameState(serializeGameState(state))!;
    expect(currentFloor(restored).nodes[1]!.hp).toBe(currentFloor(restored).nodes[1]!.maxHp / 2);
    expect(visibleSeams(currentFloor(restored), currentFloor(restored).nodes[2]!)).toEqual([]);
    expect(restored.run.character.carried[0]!.id).toBe('keep-me');
    expect(visibleSeams(restored.run.floors['D-060'], restored.run.floors['D-060'].nodes[0]!).length).toBeGreaterThan(0);
  });
});
