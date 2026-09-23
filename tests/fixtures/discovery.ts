import { LOOT } from '../../src/game/config';
import { createGameState } from '../../src/game/createGame';
import { rollMiningLoot } from '../../src/game/mining';
import { drainEvents, updateGame } from '../../src/game/simulation';
import { processPhase5Events, updatePhase5 } from '../../src/game/phase5';
import type { DepthId, GameState, LootKind, LootStack } from '../../src/game/types';

export function loot(kind: LootKind, id = kind as string, depth: DepthId = 'D-001'): LootStack {
  const d = LOOT[kind];
  return { id, kind, name: d.name, rarity: d.rarity, category: d.category, weight: d.weight, value: d.value,
    dataValue: d.dataValue ?? 0, coreValue: d.coreValue ?? 0, x: 240, y: 206, originDepth: depth };
}
export function breakRock(state: GameState, depth: DepthId = 'D-001', index = 0) {
  const floor = state.run.floors[depth];
  return rollMiningLoot(state, floor, floor.nodes[index]!, () => undefined);
}
export function tick(state: GameState, seconds: number): void {
  for (let i = 0; i < seconds * 10; i++) {
    updateGame(state, 0.1); updatePhase5(state, 0.1);
    processPhase5Events(state, drainEvents(state)); drainEvents(state);
  }
}
/** Physical, seeded sealed cargo for transport tests, not an already credited collection entry. */
export function specimenGame(seed = 611): GameState {
  const state = createGameState(seed);
  for (let i = 0; i < 40; i++) {
    const item = breakRock(state, 'D-001', 2).find((entry) => entry.specimen);
    if (item) { state.run.elevator.cargo.push(item); return state; }
  }
  throw new Error('Fossil safeguard failed');
}
