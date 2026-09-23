import { describe, expect, it } from 'vitest';
import { createGameState } from '../src/game/createGame';
import { maximumMiningDropWeight, rollMiningLoot } from '../src/game/mining';
import { QUALITY_PITY } from '../src/game/prospecting';
import { generateEquipmentItem } from '../src/game/phase5';
import { breakRock } from './fixtures/discovery';

// Broad seed sweeps are tuning diagnostics, not a per-PR merge gate.
// The corresponding cheap boundary/representative cases stay in prospecting.test.ts.
describe('multi-seed physical reward probes', () => {
  it('bounds normal-quality droughts over 256 seeds and preserves base ordinary production', () => {
    for (let seed = 1; seed <= 256; seed++) {
      const state = createGameState(seed); let misses = 0;
      for (let i = 0; i < 80; i++) {
        const items = breakRock(state); const ores = items.filter(item => item.category === 'ORE');
        expect(ores).toHaveLength(3); expect(ores.every(item => item.value >= 12 && item.weight === 2)).toBe(true);
        misses = ores[0]!.quality === 'NORMAL' ? misses + 1 : 0;
        expect(misses).toBeLessThanOrEqual(QUALITY_PITY);
      }
    }
  });

  it('reserves rolled Bore bonuses across 30 seeds and five depths', () => {
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

  it('bounds first and subsequent field-tool gaps over 128 seeds', () => {
    for (let seed = 1; seed <= 128; seed++) {
      const state = createGameState(seed); let first = 0; let misses = 0;
      for (let i = 1; i <= 64; i++) {
        const items = breakRock(state, 'D-030', 0); misses++;
        if (items.some(item => item.equipmentSeed !== undefined)) { first ||= i; expect(misses).toBeLessThanOrEqual(16); misses = 0; }
        if (i === 6) expect(first).toBeGreaterThan(0);
        expect(misses).toBeLessThan(16);
      }
      expect(state.run.phase5.equipment.inventory).toHaveLength(0);
    }
  });

  it('covers the field-tool affix pool with deterministic one-affix/level-one results', () => {
    const state = createGameState(411); const pool = new Set();
    for (let seed = 1; seed <= 100; seed++) {
      const a = generateEquipmentItem(state, seed, 'field-pick', 'TOOL');
      const b = generateEquipmentItem(state, seed, 'field-pick', 'TOOL');
      expect(a.affixes).toEqual(b.affixes); expect(a.level).toBe(1); expect(a.affixes).toHaveLength(1);
      expect(['COMMON', 'RARE']).toContain(a.rarity); pool.add(a.affixes[0]!.id);
    }
    expect([...pool].sort()).toEqual(['FOSSIL_BREAKER', 'LIGHT_FRAME', 'RESEARCH_PRISM']);
  });
});
