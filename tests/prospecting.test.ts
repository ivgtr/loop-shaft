import { describe, expect, it } from 'vitest';
import { createGameState, createNewRun } from '../src/game/createGame';
import { LOOT } from '../src/game/config';
import { rollMiningLoot, maximumMiningDropWeight, playerMiningDamage } from '../src/game/mining';
import { activeProspect, advanceProspecting, appraisedLoot, applyOreQuality, createProspectingState, floorProspects,
  nodeDiscoveryCue, qualityForRoll, QUALITY_PITY } from '../src/game/prospecting';
import { appraisePhysicalCargo, duplicateFossilsAvailable, rememberFind, restorationBlockReason, restoreFossil } from '../src/game/appraisal';
import { equipPlayerItem, generateEquipmentItem, applyOfflineProgress } from '../src/game/phase5';
import { getModifiers } from '../src/game/modifiers';
import { restoreGameState, serializeGameState } from '../src/game/save';
import { sendElevator } from '../src/game/simulation';
import { createManagementState, selectedStationItem } from '../src/game/management';
import { layoutManagementUi } from '../src/render/managementUi';
import { breakRock, loot, specimenGame, tick } from './fixtures/discovery';
import type { EquipmentAffixId, GameState, LootStack } from '../src/game/types';

const reload = (state: GameState) => restoreGameState(serializeGameState(state))!;
const appraise = (state: GameState, items: LootStack[]) => appraisePhysicalCargo(state, items, () => undefined);
function fieldTool(state: GameState, affix: EquipmentAffixId) {
  for (let seed = 1; seed < 500; seed++) {
    const item = generateEquipmentItem(state, seed, 'field-pick', 'TOOL');
    if (item.affixes[0]!.id === affix) { state.run.phase5.equipment.inventory.push(item); equipPlayerItem(state, item.id); return item; }
  }
  throw new Error(`Missing field affix ${affix}`);
}

describe('ordinary ore upside and bounded bad luck', () => {
  it.each([[0.029, 0, 'PURE'], [0.03, 0, 'FINE'], [0.149, 0, 'FINE'], [0.15, 0, 'NORMAL'], [0.999, 12, 'FINE']])('roll %s with %s misses gives %s', (roll, misses, expected) => {
    expect(qualityForRoll(roll as number, misses as number)).toBe(expected);
  });
  it('does not multiply weight, research, Core or valuable goods', () => {
    const ore = loot('COPPER'); applyOreQuality(ore, 'PURE');
    expect(ore.value).toBe(54); expect(ore.weight).toBe(LOOT.COPPER.weight);
    for (const kind of ['CORE_MATRIX', 'CRYSTAL_MEMORY', 'GOLD_NUGGET', 'ANCIENT_TOOL_CRATE'] as const) {
      const item = loot(kind); const before = structuredClone(item); applyOreQuality(item, 'PURE'); expect(item).toEqual(before);
    }
  });
  it('bounds normal-quality droughts over 256 seeds and preserves base ordinary production', () => {
    for (let seed = 1; seed <= 256; seed++) {
      const state = createGameState(seed); let misses = 0;
      for (let i = 0; i < 80; i++) {
        const items = breakRock(state); const ores = items.filter((item) => item.category === 'ORE');
        expect(ores).toHaveLength(3); expect(ores.every((item) => item.value >= 12 && item.weight === 2)).toBe(true);
        misses = ores[0]!.quality === 'NORMAL' ? misses + 1 : 0;
        expect(misses).toBeLessThanOrEqual(QUALITY_PITY);
      }
    }
  });
  it('isolates quality and field gear from unrelated floor work and preview reads', () => {
    const states = [createGameState(90), createGameState(90)];
    for (let i = 0; i < 60; i++) {
      states[1]!.run.rngState ^= 381;
      breakRock(states[1]!, 'D-060');
      const outcomes = states.map((state) => advanceProspecting(state.run.floors['D-030'], state.run.floors['D-030'].nodes[0]!));
      expect(outcomes[1]).toEqual(outcomes[0]);
    }
  });
  it('does not let Core Shell breaks farm quality or gear guarantees', () => {
    const state = createGameState(91);
    for (let i = 0; i < 30; i++) breakRock(state, 'D-100', 2);
    expect(state.run.floors['D-100'].prospecting).toBeUndefined();
    expect(state.run.floors['D-030'].prospecting).toBeUndefined();
  });
  it('caps fossil-rich site misses independently of shipping and reloading', () => {
    let state = createGameState(333); let misses = 0;
    for (let i = 0; i < 80; i++) {
      const items = breakRock(state, 'D-001', 2);
      misses = items.some((item) => item.category === 'FOSSIL') ? 0 : misses + 1;
      expect(misses).toBeLessThanOrEqual(7);
      if (i % 5 === 0) state = reload(state);
    }
  });
});

describe('finite persistent clues and future art contract', () => {
  it('reveals separate distant sites without claiming or exposing their hidden rewards', () => {
    const state = createGameState(771); const floor = state.run.floors['D-001']; const node = floor.nodes[0]!;
    const plans = floorProspects(floor); expect(plans[0]!.nodeId).not.toBe(node.id);
    expect(new Set(plans.map((p) => p.nodeId)).size).toBe(2);
    for (let i = 0; i < 6; i++) advanceProspecting(floor, node);
    const target = floor.nodes.find((n) => n.id === plans[0]!.nodeId)!;
    expect(activeProspect(floor, target)?.work).toBe(0);
    expect(nodeDiscoveryCue(floor, target)).toMatchObject({ stage: 'SEALED', remaining: 2 });
    const saved = serializeGameState(state);
    for (let i = 0; i < 200; i++) { floorProspects(floor); nodeDiscoveryCue(floor, target); }
    expect(serializeGameState(state)).toBe(saved);
    advanceProspecting(floor, target);
    expect(nodeDiscoveryCue(floor, target)).toMatchObject({ stage: 'EXPOSED', remaining: 1 });
    expect(advanceProspecting(floor, target).prospects).toHaveLength(1);
    expect(nodeDiscoveryCue(floor, target)).toMatchObject({ stage: 'SPENT', remaining: 0 });
    for (let i = 0; i < 60; i++) expect(advanceProspecting(floor, target).prospects).toHaveLength(0);
  });
  it('persists exposed and consumed finds through offline time, restore and revisiting', () => {
    let state = createGameState(93); let floor = state.run.floors['D-001'];
    for (let i = 0; i < 6; i++) advanceProspecting(floor, floor.nodes[0]!);
    const plan = floorProspects(floor)[0]!;
    const target = floor.nodes.find((n) => n.id === plan.nodeId)!;
    advanceProspecting(floor, target); const expected = nodeDiscoveryCue(floor, target);
    state.run.depth.unlocked.push('D-030'); state.run.depth.current = 'D-030';
    state.run.phase5.offline.savedAt = 1000; state.run.phase5.offline.processedAt = 0;
    expect(applyOfflineProgress(state, 601000)?.seconds).toBe(600); state = reload(state); floor = state.run.floors['D-001'];
    expect(nodeDiscoveryCue(floor, floor.nodes.find((n) => n.id === plan.nodeId)!)).toEqual(expected);
    state.run.depth.current = 'D-001';
    const target2 = floor.nodes.find((n) => n.id === plan.nodeId)!;
    advanceProspecting(floor, target2); state = reload(state);
    expect(nodeDiscoveryCue(state.run.floors['D-001'], target2)?.stage).toBe('SPENT');
    state.meta.runIndex++; state.run = createNewRun(state.meta);
    expect(state.run.floors['D-001'].prospecting).toBeUndefined();
  });
  it('reserves every possible bonus so Bore capacity never discards a newly rolled find', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const state = createGameState(seed);
      for (const depth of ['D-030', 'D-060', 'D-180', 'D-250', 'D-400'] as const) {
        const floor = state.run.floors[depth];
        for (let i = 0; i < 36; i++) {
          const node = floor.nodes[i % 3]!; const max = maximumMiningDropWeight(state, floor, node);
          const items = rollMiningLoot(state, floor, node, () => undefined, { boreId: 'probe' });
          expect(items.reduce((sum, item) => sum + item.weight, 0)).toBeLessThanOrEqual(max + 0.001);
        }
      }
    }
  });
});

describe('early equipment must reach surface and change real work', () => {
  it('guarantees the first field tool in six local breaks and later gaps within sixteen', () => {
    for (let seed = 1; seed <= 128; seed++) {
      const state = createGameState(seed); let first = 0; let misses = 0;
      for (let i = 1; i <= 64; i++) {
        const items = breakRock(state, 'D-030', 0); misses++;
        if (items.some((item) => item.equipmentSeed !== undefined)) { first ||= i; expect(misses).toBeLessThanOrEqual(16); misses = 0; }
        if (i === 6) expect(first).toBeGreaterThan(0);
        expect(misses).toBeLessThan(16);
      }
      expect(state.run.phase5.equipment.inventory).toHaveLength(0);
    }
  });
  it('keeps field tools one-affix/level-one and deterministic without leaking into ancient records', () => {
    const state = createGameState(411); const pool = new Set();
    for (let seed = 1; seed <= 100; seed++) {
      const a = generateEquipmentItem(state, seed, 'field-pick', 'TOOL');
      const b = generateEquipmentItem(state, seed, 'field-pick', 'TOOL');
      expect(a.affixes).toEqual(b.affixes); expect(a.level).toBe(1); expect(a.affixes).toHaveLength(1);
      expect(['COMMON', 'RARE']).toContain(a.rarity); pool.add(a.affixes[0]!.id);
    }
    expect([...pool].sort()).toEqual(['FOSSIL_BREAKER', 'LIGHT_FRAME', 'RESEARCH_PRISM']);
  });
  it('appraises once after actual lift travel, can equip during Run 1, and does not consume passive guarantee', () => {
    let state = createGameState(515); state.run.depth.unlocked.push('D-030'); state.run.depth.current = 'D-030';
    const floor = state.run.floors['D-030']; floor.prospecting = { ...createProspectingState(), breaks: 5 };
    floor.nodes[0]!.treasureChance = 0;
    state.run.elevator.cargo = breakRock(state, 'D-030').filter((item) => item.equipmentSeed !== undefined);
    expect(state.run.elevator.cargo).toHaveLength(1);
    expect(state.run.discovery.categoriesFound ?? []).not.toContain('RELIC');
    state = reload(state); const lockedSeed = state.run.elevator.cargo[0]!.equipmentSeed;
    expect(state.run.phase5.equipment.inventory).toHaveLength(0);
    expect(sendElevator(state)).toBe(true); tick(state, 2); expect(state.run.phase5.equipment.inventory).toHaveLength(0);
    tick(state, 10); const item = state.run.phase5.equipment.inventory[0]!;
    expect(item.seed).toBe(lockedSeed); expect(equipPlayerItem(state, item.id)).toBe(true);
    state = reload(state); tick(state, 15); expect(state.run.phase5.equipment.inventory).toHaveLength(1);
    expect(state.meta.ancientDiscoveries).not.toContain('field-pick');
    expect(state.run.discovery.recentFinds?.some((receipt) => receipt.reason === 'GEAR')).toBe(true);
  });
  it('makes fossil damage, loaded speed and research weight match the actual equipped field tool', () => {
    const a = createGameState(901); const fossil = a.run.floors['D-030'].nodes[1]!;
    const base = playerMiningDamage(a, fossil); fieldTool(a, 'FOSSIL_BREAKER');
    expect(playerMiningDamage(a, fossil)).toBeGreaterThan(base);
    expect(playerMiningDamage(a, a.run.floors['D-030'].nodes[0]!)).toBe(base);
    const b = createGameState(902); const speed = getModifiers(b).playerMoveSpeed; fieldTool(b, 'LIGHT_FRAME');
    expect(getModifiers(b).playerMoveSpeed).toBe(speed);
    b.run.character.carried.push(loot('IRON')); expect(getModifiers(b).playerMoveSpeed).toBeGreaterThan(speed);
    const c = createGameState(903); fieldTool(c, 'RESEARCH_PRISM'); expect(getModifiers(c).researchWeightMultiplier).toBeGreaterThan(1);
  });
});

describe('sealed specimens, appraisal and save ownership', () => {
  it('retains generic public information and a locked outcome across repeated saves and lift delivery', () => {
    let state = specimenGame(); const cargo = state.run.elevator.cargo[0]!; const outcome = appraisedLoot(cargo);
    expect(cargo.name).toBe('Unidentified fossil'); expect(cargo.value).toBe(42);
    for (let i = 0; i < 8; i++) { state = reload(state); expect(state.run.elevator.cargo[0]).toMatchObject(cargo); }
    expect(state.run.scrap).toBe(0); expect(state.meta.collection.entries.every((entry) => !entry.discovered)).toBe(true);
    sendElevator(state); tick(state, 2); expect(state.run.scrap).toBe(0); tick(state, 10);
    expect(state.run.scrap).toBe(outcome.value); expect(state.meta.collection.entries.find((entry) => entry.kind === cargo.kind)?.count).toBe(1);
    expect(state.run.discovery.recentFinds?.[0]?.name).toBe(outcome.name);
    state = reload(state); tick(state, 10); expect(state.run.scrap).toBe(outcome.value);
  });
  it('uses the same appraisal for a freight cage after physical ascent and unloading', () => {
    const state = specimenGame(888); const item = state.run.elevator.cargo.pop()!;
    const cage = state.run.logistics.freightCage;
    cage.state = 'ASCENDING'; cage.position = 0; cage.stateTimer = 0; cage.cargo.push(item);
    tick(state, 1); expect(state.run.scrap).toBe(0);
    tick(state, 20); expect(state.run.scrap).toBe(appraisedLoot(item).value);
    expect(state.run.logistics.freightCage.cargo).toHaveLength(0);
    expect(state.meta.collection.entries.find((entry) => entry.kind === item.kind)?.count).toBe(1);
  });
  it('roundtrips quality and sealed metadata through every cargo ownership pool', () => {
    const state = specimenGame(992); const specimen = state.run.elevator.cargo.pop()!;
    const fine = loot('COPPER'); applyOreQuality(fine, 'PURE');
    const payload = [specimen, fine];
    state.run.character.carried = structuredClone(payload); state.run.porter.carried = structuredClone(payload);
    state.run.floors['D-001'].loot = structuredClone(payload); state.run.floors['D-001'].cargo = structuredClone(payload);
    state.run.elevator.cargo = structuredClone(payload); state.run.logistics.freightCage.cargo = structuredClone(payload);
    state.run.logistics.cargoHubs.push({ id: 'test-hub', depth: 'D-250', buffer: structuredClone(payload), maxWeight: 64 });
    const next = reload(state);
    for (const pool of [next.run.character.carried, next.run.porter.carried, next.run.floors['D-001'].loot,
      next.run.floors['D-001'].cargo, next.run.elevator.cargo, next.run.logistics.freightCage.cargo, next.run.logistics.cargoHubs[0]!.buffer]) {
      expect(pool[0]?.specimen).toEqual(specimen.specimen); expect(pool[0]?.name).toBe('Unidentified fossil');
      expect(pool[1]).toMatchObject({ quality: 'PURE', name: 'Pure Copper', value: 54, weight: 1.7 });
    }
  });
  it('normalizes malformed quality/progress and never trusts a stored arbitrary specimen payout', () => {
    const state = specimenGame(990); const item = state.run.elevator.cargo[0]!;
    item.specimen!.value = 999999; const expected = Math.round(LOOT[item.kind].value * (item.specimen!.grade === 'PRISTINE' ? 3 : 1.5));
    state.run.floors['D-001'].prospecting = { breaks: -99, gearFound: -1, gearMisses: 999, qualityMisses: 999, prospectWork: [999, -50] };
    const next = reload(state);
    expect(next.run.elevator.cargo[0]!.specimen!.value).toBe(expected);
    expect(next.run.floors['D-001'].prospecting).toEqual({ breaks: 0, gearFound: 0, gearMisses: 16, qualityMisses: 12, prospectWork: [2, -1] });
  });
});

describe('delivered duplicate restoration and archive', () => {
  it('spends only surplus same-family fossils, gives no currency or fabricated appraised count', () => {
    let state = createGameState(24);
    appraise(state, Array.from({ length: 6 }, (_, i) => loot('TRILOBITE', `trilobite-${i}`)));
    expect(duplicateFossilsAvailable(state, 'AMMONITE')).toBe(5);
    const scrap = state.run.scrap;
    expect(restoreFossil(state, 'AMMONITE')).toBe(true);
    expect(state.meta.collection.entries.find((entry) => entry.kind === 'AMMONITE')).toMatchObject({ discovered: true, restored: true, count: 0 });
    expect(state.meta.collection.entries.find((entry) => entry.kind === 'TRILOBITE')).toMatchObject({ count: 6, restorationSpent: 5 });
    expect(state.run.scrap).toBe(scrap); expect(state.run.data).toBe(0); expect(state.run.pendingCore).toBe(0);
    state = reload(state); expect(restoreFossil(state, 'AMMONITE')).toBe(false); expect(duplicateFossilsAvailable(state, 'AMMONITE')).toBe(0);
    state.meta.runIndex++; state.run = createNewRun(state.meta); expect(duplicateFossilsAvailable(state, 'AMMONITE')).toBe(0);
  });
  it('does not convert unshipped cargo or shallow duplicates into deep discoveries', () => {
    const state = createGameState(25); state.run.elevator.cargo = Array.from({ length: 8 }, (_, i) => loot('TRILOBITE', `t${i}`));
    expect(restoreFossil(state, 'AMMONITE')).toBe(false);
    appraise(state, Array.from({ length: 8 }, (_, i) => loot('ANCIENT_FISH', `fish${i}`)));
    expect(restorationBlockReason(state, 'STRANGE_VERTEBRA')).toContain('D-100');
    state.meta.bestDepth = 'D-100'; expect(restoreFossil(state, 'STRANGE_VERTEBRA')).toBe(true);
    expect(restoreFossil(state, 'CORE_FRAGMENT')).toBe(false);
  });
  it.each([320, 390, 1280])('keeps restoration consequences visible and missing identity hidden at %spx', (width) => {
    const state = createGameState(27); state.run.depth.unlocked.push('D-030'); appraise(state, Array.from({ length: 6 }, (_, i) => loot('TRILOBITE', `t${i}`)));
    const ui = createManagementState(state, { station: 'archive', tab: 'finds', selectedId: 'AMMONITE' }); const item = selectedStationItem(state, ui);
    expect(item.name).toBe('????'); expect(item.action).not.toBeNull(); expect(item.confirmKey).toBeTruthy();
    const layout = layoutManagementUi(state, { ...ui, confirmation: item.confirmKey! }, { width, height: 844, world: { x: 0, y: 110, width, height: width * 9 / 16 } });
    const text = layout.texts.map((r) => r.label).join(' ').replace(/\s/g, '');
    expect(text).toContain('SPEND:5duplicateshellfossils.'); expect(text).toContain('KEEP:Firstspecimensandcollectionhistory.');
    expect(text).not.toContain('Ammonite');
  });
  it('keeps a bounded delivered-find history, independent of short-lived event buffers', () => {
    const state = createGameState(26);
    for (let i = 0; i < 30; i++) rememberFind(state, { id: `find-${i}`, name: 'Pristine fossil', value: 126, depth: 'D-001', reason: 'PRISTINE' });
    rememberFind(state, { id: 'find-29', name: 'duplicate', value: 0, depth: 'D-001', reason: 'NEW' });
    expect(state.run.discovery.recentFinds).toHaveLength(12); state.events = []; state.eventHistory = [];
    expect(reload(state).run.discovery.recentFinds).toEqual(state.run.discovery.recentFinds);
  });
});
