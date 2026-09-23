import { describe, expect, it } from 'vitest';
import { createGameState, createNewRun } from '../src/game/createGame';
import { EXCEPTIONAL_KINDS, isExceptionalKind, LOOT } from '../src/game/config';
import { advanceProspecting, createProspectingState, exceptionalProspectReward, floorProspects, prospectReward } from '../src/game/prospecting';
import { maximumMiningDropWeight, rollMiningLoot } from '../src/game/mining';
import { appraisePhysicalCargo } from '../src/game/appraisal';
import { getModifiers } from '../src/game/modifiers';
import { restoreGameState, serializeGameState } from '../src/game/save';
import { cargoEffect } from '../src/game/cargoFeedback';
import { rewardNotice } from '../src/game/rewardFeedback';
import { rewardNotes, transportNotes } from '../src/game/rewardSounds';
import { shipmentNotice } from '../src/game/shipmentFeedback';
import { cargoSpriteFrame, collectionSpriteFrame, visibleCargo } from '../src/render/discoveryVisuals';
import { loot } from './fixtures/discovery';
import type { GameEvent, GameState, LootKind } from '../src/game/types';

function readyFind(kind: LootKind): GameState {
  for (let seed = 1; seed <= 512; seed++) {
    const state = createGameState(seed); const floor = state.run.floors['D-100'];
    const prospect = floorProspects(floor)[1]!;
    if (exceptionalProspectReward(floor, prospect) !== kind) continue;
    state.run.depth.unlocked.push('D-030', 'D-060', 'D-100'); state.meta.bestDepth = 'D-100';
    floor.prospecting = { ...createProspectingState(), breaks: 20, prospectWork: [2, prospect.required - 1] };
    return state;
  }
  throw new Error(`No deterministic fixture for ${kind}`);
}
const reload = (state: GameState) => restoreGameState(serializeGameState(state))!;
const sink = (events: GameEvent[]) => (type: GameEvent['type'], data: GameEvent['data']) => events.push({ id: events.length + 1, at: 0, type, data });

describe('exceptional finite discoveries', () => {
  it('uses one seeded opportunity, excludes early floors, and leaves public surveys and RNG untouched', () => {
    const seen = new Set<LootKind | null>();
    for (let seed = 1; seed <= 96; seed++) {
      const state = createGameState(seed); const before = serializeGameState(state);
      for (const floor of Object.values(state.run.floors)) {
        for (const prospect of floorProspects(floor)) {
          const kind = exceptionalProspectReward(floor, prospect);
          if (prospect.id !== 1 || ['D-001', 'D-030', 'D-650'].includes(floor.id)) expect(kind).toBeNull();
          if (floor.id === 'D-060') expect(kind).not.toBe('GRAVITY_KNOT');
          expect(prospect).not.toHaveProperty('exceptional');
          expect(exceptionalProspectReward(floor, prospect)).toBe(kind);
          seen.add(kind);
        }
      }
      expect(serializeGameState(state)).toBe(before);
    }
    expect(seen).toEqual(new Set([null, ...EXCEPTIONAL_KINDS]));
  });

  it('adds the same physical bonus for Player, Miner and Bore, reserves capacity, and cannot repeat after reload', () => {
    for (const kind of EXCEPTIONAL_KINDS) {
      const initial = readyFind(kind); const results: unknown[] = [];
      for (const source of [{}, { crewId: 'miner-test' }, { boreId: 'bore-test' }]) {
        let state = reload(initial); const floor = state.run.floors['D-100'];
        const prospect = floorProspects(floor)[1]!; const node = floor.nodes.find(n => n.id === prospect.nodeId)!;
        const cap = maximumMiningDropWeight(state, floor, node); const events: GameEvent[] = [];
        const items = rollMiningLoot(state, floor, node, sink(events), source);
        expect(items.filter(item => item.kind === kind)).toHaveLength(1);
        expect(items.some(item => item.kind === prospectReward(floor, prospect))).toBe(true);
        expect(items.reduce((sum, item) => sum + item.weight, 0)).toBeLessThanOrEqual(cap + .001);
        expect(events.find(e => e.type === 'DISCOVERY_FOUND' && e.data?.publicKind === kind)).toBeTruthy();
        expect(state.meta.passives.unlocked).not.toContain(LOOT[kind].passive);
        floor.loot.push(...items);
        results.push(items.map(({ kind, weight, value, x }) => ({ kind, weight, value, x })));
        state = reload(state); const restored = state.run.floors['D-100'];
        expect(restored.loot.some(item => item.kind === kind)).toBe(true);
        for (let i = 0; i < 8; i++) expect(rollMiningLoot(state, restored, restored.nodes.find(n => n.id === node.id)!, () => undefined).some(item => isExceptionalKind(item.kind))).toBe(false);
      }
      expect(results[1]).toEqual(results[0]); expect(results[2]).toEqual(results[0]);
    }
  });

  it('credits Data only at arrival with a shipment-start passive snapshot; duplicates never stack', () => {
    for (const reversed of [false, true]) {
      const state = createGameState(90); const geode = loot('CHORUS_GEODE', 'geode');
      const research = loot('CRYSTAL_MEMORY', 'research'); const cargo = [geode, research];
      if (reversed) cargo.reverse();
      expect(state.run.data).toBe(0);
      appraisePhysicalCargo(state, cargo, () => undefined);
      expect(state.run.data).toBe(3); expect(state.meta.passives.active).toContain('RESEARCH_ECHO');
      const events: GameEvent[] = [];
      appraisePhysicalCargo(state, [loot('CHORUS_GEODE', 'duplicate'), loot('CRYSTAL_MEMORY', 'next')], sink(events), 'FREIGHT');
      expect(state.run.data).toBe(7); expect(state.meta.passives.unlocked.filter(id => id === 'RESEARCH_ECHO')).toHaveLength(1);
      expect(events.find(e => e.type === 'SHIPMENT_APPRAISED')?.data?.data).toBe(4);
      expect(state.meta.collection.entries.find(e => e.kind === 'CHORUS_GEODE')?.count).toBe(2);
    }
  });

  it('preserves the two passive slots, loaded-only movement and progression through save/Reboot', () => {
    let state = createGameState(91); state.meta.passives.unlocked = ['LONG_STRIDE', 'LAST_SWING'];
    state.meta.passives.active = ['LONG_STRIDE', 'LAST_SWING'];
    appraisePhysicalCargo(state, [loot('GRAVITY_KNOT'), loot('CHORUS_GEODE')], () => undefined);
    expect(state.meta.passives.active).toEqual(['LONG_STRIDE', 'LAST_SWING']);
    state.meta.passives.active = ['FLOATING_LOAD', 'RESEARCH_ECHO']; state = reload(state);
    expect(state.meta.passives.active).toEqual(['FLOATING_LOAD', 'RESEARCH_ECHO']);
    expect(getModifiers(state, false).playerMoveSpeed).toBe(42);
    expect(getModifiers(state, true).playerMoveSpeed).toBeCloseTo(42 * 1.35);
    state.meta.runIndex++; state.run = createNewRun(state.meta);
    expect(state.meta.collection.entries.find(e => e.kind === 'GRAVITY_KNOT')?.discovered).toBe(true);
    expect(state.meta.passives.active).toEqual(['FLOATING_LOAD', 'RESEARCH_ECHO']);
    expect(state.run.floors['D-100'].prospecting).toBeUndefined();
    expect(getModifiers(state, true).playerMoveSpeed).toBeCloseTo(42 * 1.35);
  });

  it('uses distinct public silhouettes and motifs without leaking sealed cargo', () => {
    const motifs: unknown[] = [];
    for (const [index, kind] of EXCEPTIONAL_KINDS.entries()) {
      const item = loot(kind); const event: GameEvent = { id: 1, at: 0, type: 'DISCOVERY_FOUND', data: { id: item.id, name: item.name, publicKind: kind, category: item.category } };
      const notice = rewardNotice(event)!;
      expect(notice.artifact).toBe(kind); expect(notice.priority).toBe(6);
      motifs.push(rewardNotes(notice));
      expect(cargoEffect([item])).toBe(notice.effect);
      expect(transportNotes(notice.effect!, true)).toHaveLength(2);
      expect(cargoSpriteFrame(item)).toBe(23 + index);
      expect(collectionSpriteFrame({ kind, discovered: true, count: 1 })).toBe(26 + index);
      expect(collectionSpriteFrame({ kind, discovered: false, count: 0 })).toBe(0);
      expect(visibleCargo([loot('IRON'), item], 1)[0]).toBe(item);
      item.specimen = { grade: 'PRISTINE', value: 999 };
      expect(cargoSpriteFrame(item)).toBe(9); expect(cargoEffect([item])).toBe('fossil');
      expect(rewardNotice({ ...event, data: { ...event.data, publicKind: 'SEALED' } })?.artifact).toBeUndefined();
    }
    expect(motifs[0]).not.toEqual(motifs[1]);
  });

  it('keeps new/duplicate receipts usable and shortens repeat audio without changing credited state', () => {
    const state = createGameState(92); const events: GameEvent[] = [];
    appraisePhysicalCargo(state, [loot('CHORUS_GEODE', 'first')], sink(events));
    const receipt = shipmentNotice(events.find(e => e.type === 'SHIPMENT_APPRAISED')!, events)!;
    expect(receipt.shipment?.highlight?.artifact).toBe('CHORUS_GEODE');
    expect(receipt.shipment?.highlight?.benefit).toContain('+1 Data');
    events.length = 0;
    appraisePhysicalCargo(state, [loot('CHORUS_GEODE', 'repeat')], sink(events));
    const duplicate = rewardNotice(events.find(e => e.type === 'COLLECTION_DUPLICATE')!)!;
    expect(duplicate.priority).toBe(3); expect(rewardNotes(duplicate)).toHaveLength(2);
    const before = serializeGameState(state);
    shipmentNotice(events.find(e => e.type === 'SHIPMENT_APPRAISED')!, events);
    expect(serializeGameState(state)).toBe(before);
  });
});
