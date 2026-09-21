import { LOOT, WORLD, SWING, COLLECT_DURATION, LOAD_DURATION, VALUABLE_KINDS, FOSSIL_KINDS, RELIC_KINDS, RESEARCH_KINDS } from './config';
import { getModifiers } from './modifiers';
import { hashSeed, nextRandom } from './rng';
import type { DepthId, FloorState, GameEventType, GameState, LootCategory, LootKind, LootStack, MiningNode } from './types';

export type MiningEventSink = (type: GameEventType, data: Record<string, string | number | boolean>) => void;
export interface MiningSource { crewId?: string; boreId?: string; }
export interface VisibleSeam { at: number; kind: LootKind; }

/** These are additional, visible deposits, not a penalty on ordinary production. */
const SEAMS: Partial<Record<string, readonly [number, readonly LootKind[]][]>> = {
  'copper-pocket': [[2, ['GOLD_NUGGET']]],
  'fossil-crack': [[1, ['TRILOBITE']], [3, ['AMMONITE']]],
  'dense-vein': [[3, ['GOLD_NUGGET', 'OLD_COIN']]],
  'fossil-seam': [[1, ['ANCIENT_FISH', 'AMMONITE']]],
  'black-glass-fault': [[2, ['PROSPECTOR_LENS', 'STRIDE_MODULE', 'FRACTURE_CORE']]],
  'crystal-bank': [[1, ['CRYSTAL_MEMORY']]],
  'fossil-bloom': [[2, ['REPTILE_TOOTH', 'ANCIENT_FISH']]],
  'machine-grave': [[3, ['UNKNOWN_INSTRUMENT']]],
  'conduit-vein': [[2, ['RESONANCE_SHARD']]],
  'hanging-vein': [[2, ['GEM', 'NATURAL_GOLD']]],
  'forgotten-terminal': [[2, ['UNKNOWN_INSTRUMENT']]],
  'echo-pocket': [[2, ['RESONANCE_SHARD']]],
  'fracture-well': [[2, ['BLACK_GLASS_HEART']]],
};

/** Maximum Core units that may leave each site during one Run, including unshipped cargo. */
export const CORE_RESERVES: Readonly<Partial<Record<string, number>>> = {
  'core-shell': 4,
  'ruined-workshop': 1, 'archive-vault': 1, 'sealed-chamber': 4,
  'hanging-vein': 2, 'forgotten-terminal': 3,
  'null-edge': 1, 'echo-pocket': 2, 'fracture-well': 4, 'boundary-wall': 2,
};

const ORDINARY_WEIGHTS: Readonly<Partial<Record<string, readonly number[]>>> = {
  'scrap-ledge': [1, 4], 'copper-pocket': [1, 4], 'fossil-crack': [2, 1],
};
const KIND_WEIGHTS: Partial<Record<LootKind, number>> = {
  GOLD_NUGGET: 6, OLD_COIN: 3, POCKET_WATCH: 2, NATURAL_GOLD: 2, GEM: 1,
  TRILOBITE: 6, AMMONITE: 4, ANCIENT_FISH: 2, REPTILE_TOOTH: 2, STRANGE_VERTEBRA: 1,
  CRYSTAL_MEMORY: 6, SURVEY_CARTRIDGE: 4, DAMAGED_RESEARCH_LOG: 2, RESONANCE_SHARD: 2, UNKNOWN_INSTRUMENT: 1,
};
const MIN_DEPTH: Partial<Record<LootKind, number>> = {
  OLD_COIN: 30, POCKET_WATCH: 30, NATURAL_GOLD: 60, GEM: 100,
  ANCIENT_FISH: 30, REPTILE_TOOTH: 60, STRANGE_VERTEBRA: 100,
  DAMAGED_RESEARCH_LOG: 60, RESONANCE_SHARD: 100, UNKNOWN_INSTRUMENT: 100,
};

export function visibleSeams(floor: FloorState, node: MiningNode): VisibleSeam[] {
  let idHash = 0;
  for (const char of node.id) idHash = Math.imul(idHash, 31) + char.charCodeAt(0);
  return (SEAMS[node.id] ?? []).map(([at, kinds]) => ({ at,
    kind: kinds[hashSeed(floor.seed ^ idHash ^ at) % kinds.length]!,
  })).filter((seam) => seam.at > (node.minedCount ?? 0));
}

export function coreReserveRemaining(node: MiningNode): number {
  return Math.max(0, (CORE_RESERVES[node.id] ?? 0) - (node.coreExtracted ?? 0));
}

export function treasureChance(state: GameState, node: MiningNode): number {
  return Math.min(0.95, node.treasureChance * getModifiers(state).treasureChanceMultiplier);
}

function categoryWeights(state: GameState, node: MiningNode): Array<[LootCategory, number]> {
  const m = getModifiers(state);
  return [
    ['VALUABLE', node.valuableWeight * m.valuableWeightMultiplier],
    ['FOSSIL', node.fossilWeight * m.fossilWeightMultiplier],
    ['RELIC', node.relicWeight * m.relicWeightMultiplier],
    ['ANOMALY', node.anomalyWeight * m.anomalyWeightMultiplier],
    ['RESEARCH', node.researchWeight * m.researchWeightMultiplier],
    ['CORE', coreReserveRemaining(node) > 0 ? node.coreWeight : 0],
  ];
}

export function treasureCategoryChance(state: GameState, node: MiningNode, category: LootCategory): number {
  const weights = categoryWeights(state, node);
  const total = weights.reduce((sum, [, weight]) => sum + weight, 0);
  return total > 0 ? treasureChance(state, node) * (weights.find(([id]) => id === category)?.[1] ?? 0) / total : 0;
}

function weighted<T>(state: GameState, entries: readonly (readonly [T, number])[]): T {
  const positive = entries.filter(([, weight]) => weight > 0);
  if (!positive.length) throw new Error('Mining table must have a positive weight');
  let roll = nextRandom(state) * positive.reduce((sum, [, weight]) => sum + weight, 0);
  for (const [value, weight] of positive) { roll -= weight; if (roll < 0) return value; }
  return positive[positive.length - 1]![0];
}

function ordinaryTable(node: MiningNode): Array<[LootKind, number]> {
  return node.commonKinds.map((kind, i) => [kind, ORDINARY_WEIGHTS[node.id]?.[i] ?? 1]);
}

function treasureKind(state: GameState, category: LootCategory, depth: DepthId): LootKind {
  const kinds: readonly LootKind[] = category === 'VALUABLE' ? VALUABLE_KINDS
    : category === 'FOSSIL' ? FOSSIL_KINDS : category === 'RELIC' ? RELIC_KINDS
      : category === 'RESEARCH' ? RESEARCH_KINDS : category === 'CORE' ? ['CORE_FRAGMENT', 'CORE_MATRIX'] : ['BLACK_GLASS_HEART'];
  const depthNumber = Number(depth.slice(2));
  return weighted(state, kinds.filter((kind) => (MIN_DEPTH[kind] ?? 1) <= depthNumber)
    .map((kind) => [kind, KIND_WEIGHTS[kind] ?? 1] as const));
}

/** Same break, same seed and same site => same physical rewards for player, Miner and Bore. */
export function rollMiningLoot(state: GameState, floor: FloorState, node: MiningNode, sink: MiningEventSink, source: MiningSource = {}): LootStack[] {
  const context: Record<string, string | number | boolean> = { nodeId: node.id, depth: floor.id };
  if (source.crewId) context.crewId = source.crewId;
  if (source.boreId) context.boreId = source.boreId;
  const emit: MiningEventSink = (type, data) => sink(type, { ...context, ...data });
  const seams = visibleSeams(floor, node);
  node.minedCount = (node.minedCount ?? 0) + 1;
  const spawned: LootStack[] = [];
  const add = (requested: LootKind): void => {
    let kind = requested;
    if (LOOT[kind].category === 'CORE') {
      const remaining = coreReserveRemaining(node);
      if (!remaining) return;
      if ((LOOT[kind].coreValue ?? 0) > remaining) kind = 'CORE_FRAGMENT';
      node.coreExtracted = (node.coreExtracted ?? 0) + (LOOT[kind].coreValue ?? 0);
    }
    const def = LOOT[kind];
    const item: LootStack = {
      id: `loot-${state.meta.runIndex}-${state.run.nextLootId++}`, kind, name: def.name,
      rarity: def.rarity, category: def.category, weight: def.weight, value: def.value,
      dataValue: def.dataValue ?? 0, coreValue: def.coreValue ?? 0,
      x: node.x + (nextRandom(state) - 0.5) * 14, y: node.y - 4, originDepth: floor.id,
      ...(source.crewId ? { sourceCrewId: source.crewId } : {}),
    };
    spawned.push(item);
    if (item.category !== 'ORE') {
      state.run.discovery.foundThisRun += 1;
      emit('DISCOVERY_FOUND', { id: item.id, name: item.name, rarity: item.rarity, category: item.category });
    }
    emit('LOOT_SPAWN', { id: item.id, name: item.name, rarity: item.rarity, category: item.category,
      value: item.value, data: item.dataValue, core: item.coreValue, x: item.x, y: item.y });
  };

  if (node.id === 'core-shell') {
    state.run.discovery.d100CoreBreaks += 1;
    state.run.coreChamber.shellBroken = true;
    if (coreReserveRemaining(node) > 0) {
      const first = (node.coreExtracted ?? 0) === 0;
      add('CORE_FRAGMENT');
      if (first) add('CORE_FRAGMENT');
    } else { add('STONE'); add('IRON'); }
    return spawned;
  }

  const range = Math.max(1, node.yieldMax - node.yieldMin + 1);
  const baseCount = node.yieldMin + Math.floor(nextRandom(state) * range);
  const commonCount = Math.max(1, Math.round(baseCount * getModifiers(state).commonYieldMultiplier));
  for (let i = 0; i < commonCount; i += 1) add(weighted(state, ordinaryTable(node)));
  for (const seam of seams) if (seam.at === node.minedCount) add(seam.kind);

  const discovery = state.run.discovery;
  if (floor.id === 'D-030') discovery.d030NodeBreaks += 1;
  if (floor.id === 'D-060') discovery.d060NodeBreaks += 1;
  const hasFossil = state.meta.collection.entries.some((entry) => entry.category === 'FOSSIL' && entry.discovered);
  const firstFind = floor.id === 'D-030' && discovery.foundThisRun === 0 && discovery.d030NodeBreaks >= discovery.firstDiscoveryBreak;
  const fossil = floor.id === 'D-030' && !hasFossil && discovery.d030NodeBreaks >= discovery.firstFossilBreak;
  const relic = floor.id === 'D-030' && !state.meta.passives.unlocked.length && discovery.d030NodeBreaks >= discovery.firstRelicBreak;
  const research = floor.id === 'D-060' && state.run.data === 0 && discovery.d060NodeBreaks >= discovery.firstResearchBreak;
  // Every finite deep Core reserve makes progress even on an unlucky seed.
  const core = coreReserveRemaining(node) > 0 && node.minedCount % 6 === 0;
  const safeguard = firstFind || fossil || relic || research || core;
  const chance = treasureChance(state, node);
  const roll = nextRandom(state);
  const found = roll < chance || safeguard;
  emit('TREASURE_ROLL', { roll, chance, found, safeguard });
  emit('LOOT_ROLL', { roll, chance, rare: found });
  if (found) {
    const weights = categoryWeights(state, node);
    const category: LootCategory = core ? 'CORE' : research ? 'RESEARCH' : relic ? 'RELIC' : fossil ? 'FOSSIL'
      : weights.some(([, weight]) => weight > 0) ? weighted(state, weights) : 'VALUABLE';
    add(treasureKind(state, category, floor.id));
  }
  return spawned;
}

/** Finish a small remainder instead of inflating an already-lethal damage number. */
export function finishingDamage(state: GameState, node: MiningNode, baseDamage: number): number {
  let damage = Math.max(1, Math.round(baseDamage));
  const remaining = node.hp - damage;
  if (state.meta.passives.active.includes('LAST_SWING') && remaining > 0
    && remaining <= Math.min(node.maxHp * 0.15, damage * 0.75)) damage += remaining;
  return damage;
}

/** Conservative reservation before a Bore breaks a rock; never discard a generated find. */
export function maximumMiningDropWeight(state: GameState, floor: FloorState, node: MiningNode): number {
  const count = Math.max(1, Math.round(node.yieldMax * getModifiers(state).commonYieldMultiplier));
  const ordinary = count * Math.max(...node.commonKinds.map((kind) => LOOT[kind].weight));
  const seam = visibleSeams(floor, node).filter((entry) => entry.at === (node.minedCount ?? 0) + 1)
    .reduce((sum, entry) => sum + LOOT[entry.kind].weight, 0);
  return ordinary + seam + 1.7;
}

export function nodeRole(node: MiningNode): string {
  if (node.id === 'scrap-ledge') return 'SMALL LOADS';
  if (node.id === 'copper-pocket' || node.id === 'dense-vein' || node.id === 'lost-depot') return 'BULK ORE';
  if (node.id === 'core-shell' || node.coreWeight >= 0.2) return 'FINITE CORE';
  if (node.id === 'ruined-workshop' || node.id === 'sealed-chamber') return 'EQUIPMENT';
  if (node.fossilWeight >= 0.45) return 'FOSSILS';
  if (node.researchWeight >= 0.4) return 'RESEARCH';
  return 'VALUABLE FINDS';
}

export function nodeSurvey(state: GameState, floor: FloorState, node: MiningNode): string {
  const seam = visibleSeams(floor, node)[0];
  const reserve = CORE_RESERVES[node.id];
  if (reserve) return `${nodeRole(node)} · ${coreReserveRemaining(node)}/${reserve} Core left this Run`;
  if (seam) return `${nodeRole(node)} · ${LOOT[seam.kind].name} in ${seam.at - (node.minedCount ?? 0)} breaks`;
  if (floor.id === 'D-180' && (node.minedCount ?? 0) === 0) return `${nodeRole(node)} · Sealed equipment on first break`;
  const exact = state.meta.passives.active.includes('PROSPECTORS_EYE') || state.run.research.completed.includes('STRATA_SCANNER');
  return `${nodeRole(node)} · STEADY ORE${exact ? ` · FIND ${(treasureChance(state, node) * 100).toFixed(0)}%` : ''}`;
}

/** Approximate round trip for manual hauling, calculated from the actual world coordinates. */
export function nodeTripEstimate(state: GameState, node: MiningNode): { walkSeconds: number; averageWeight: number; averageScrap: number; trips: number; seconds: number } {
  const table = ordinaryTable(node);
  const total = table.reduce((sum, [, weight]) => sum + weight, 0);
  const count = (node.yieldMin + node.yieldMax) / 2 * getModifiers(state).commonYieldMultiplier;
  const averageWeight = count * table.reduce((sum, [kind, weight]) => sum + LOOT[kind].weight * weight, 0) / total;
  const averageScrap = count * table.reduce((sum, [kind, weight]) => sum + LOOT[kind].value * weight, 0) / total;
  const stand = node.x < WORLD.elevatorX ? node.x + 13 : node.x - 13;
  const walkSeconds = 2 * Math.abs(stand - (WORLD.elevatorX - 19)) / getModifiers(state).playerMoveSpeed;
  const trips = Math.max(1, Math.ceil(averageWeight / state.run.character.backpackCapacity));
  const hits = Math.ceil(node.maxHp / (state.run.tool.damage * getModifiers(state).miningDamageMultiplier));
  return { walkSeconds, averageWeight, averageScrap, trips, seconds: trips * (walkSeconds + COLLECT_DURATION + LOAD_DURATION) + hits * SWING.total };
}
