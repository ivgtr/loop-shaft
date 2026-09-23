import { LOOT } from './config';
import { hashSeed } from './rng';
import type { FloorState, GameState, LootKind, LootStack, MiningNode, OreQuality, ProspectingState, ProspectSignal, SpecimenContents } from './types';

export const ORE_QUALITY = {
  NORMAL: { label: '', multiplier: 1 },
  FINE: { label: 'Fine', multiplier: 1.5 },
  PURE: { label: 'Pure', multiplier: 3 },
} as const;
export const QUALITY_PITY = 12;
export const FIELD_GEAR_FIRST = 6;
export const FIELD_GEAR_PITY = 16;
export const PROSPECT_THRESHOLDS = [6, 18] as const;

export interface Prospect {
  id: number;
  nodeId: string;
  signal: ProspectSignal;
  required: number;
  revealAt: number;
  work: number;
}
export interface BreakRewards {
  quality: OreQuality;
  prospects: Prospect[];
  revealed: Prospect[];
  fieldGearSeed: number | null;
}

export function createProspectingState(): ProspectingState {
  return { breaks: 0, qualityMisses: 0, gearMisses: 0, gearFound: 0, prospectWork: [-1, -1] };
}

/** Independent keyed randomness. UI, cargo position and other floors cannot reroll a find. */
function random(floor: FloorState, index: number, salt: number): number {
  return hashSeed(floor.seed ^ Math.imul(index + 1, 0x9e3779b1) ^ salt) / 0x100000000;
}

/** Pure public survey: exposes the category and work, never hidden specimen contents. */
export function floorProspects(floor: FloorState): Prospect[] {
  if (floor.id === 'D-650') return [];
  const candidates = floor.nodes.filter((node) => node.id !== 'core-shell');
  if (!candidates.length) return [];
  // Each floor has at most two finite finds, at distinct sites. At least one is away from the entry.
  const start = candidates.length > 1 ? 1 + Math.floor(random(floor, 0, 0x917e) * (candidates.length - 1)) : 0;
  const work = floor.prospecting?.prospectWork ?? [-1, -1];
  return PROSPECT_THRESHOLDS.slice(0, candidates.length).map((revealAt, id) => {
    const node = candidates[(start + id) % candidates.length]!;
    const signals: ProspectSignal[] = floor.id === 'D-001' || floor.id === 'D-030'
      ? ['METAL', 'FOSSIL'] : ['METAL', 'FOSSIL', 'RESEARCH'];
    const signal = signals[Math.floor(random(floor, id, 0x514e) * signals.length)]!;
    return { id, nodeId: node.id, signal, revealAt, required: 2 + (id % 2), work: work[id] ?? -1 };
  });
}

export function activeProspect(floor: FloorState, node: MiningNode): Prospect | undefined {
  return floorProspects(floor).find((p) => p.nodeId === node.id && p.work >= 0 && p.work < p.required);
}

export function qualityForRoll(roll: number, misses: number): OreQuality {
  if (roll < 0.03) return 'PURE';
  if (roll < 0.15 || misses >= QUALITY_PITY) return 'FINE';
  return 'NORMAL';
}

/** Called exactly once per physical break, by the common Player / Miner / Bore path. */
export function advanceProspecting(floor: FloorState, node: MiningNode): BreakRewards {
  if (node.id === 'core-shell') return { quality: 'NORMAL', prospects: [], revealed: [], fieldGearSeed: null };
  const progress = floor.prospecting ??= createProspectingState();
  const prospects = floorProspects(floor);
  const extracted: Prospect[] = [];
  // A newly exposed cue cannot be silently consumed by the same break that reveals it.
  for (const prospect of prospects) {
    if (prospect.nodeId !== node.id || prospect.work < 0 || prospect.work >= prospect.required) continue;
    progress.prospectWork[prospect.id] = prospect.work + 1;
    if (prospect.work + 1 === prospect.required) extracted.push(prospect);
  }
  const quality = qualityForRoll(random(floor, progress.breaks, 0x0ae51), progress.qualityMisses);
  progress.qualityMisses = quality === 'NORMAL' ? progress.qualityMisses + 1 : 0;
  progress.breaks += 1;
  const revealed: Prospect[] = [];
  for (const prospect of prospects) {
    if (prospect.work < 0 && progress.breaks >= prospect.revealAt) {
      progress.prospectWork[prospect.id] = 0;
      revealed.push({ ...prospect, work: 0 });
    }
  }
  let fieldGearSeed: number | null = null;
  if (floor.id === 'D-030') {
    progress.gearMisses += 1;
    if (random(floor, progress.breaks, 0x6ea2) < 0.05
      || (!progress.gearFound && progress.breaks >= FIELD_GEAR_FIRST) || progress.gearMisses >= FIELD_GEAR_PITY) {
      fieldGearSeed = hashSeed(floor.seed ^ Math.imul(progress.breaks, 0x45d9f3b) ^ 0xf1e1d);
      progress.gearFound += 1;
      progress.gearMisses = 0;
    }
  }
  return { quality, prospects: extracted, revealed, fieldGearSeed };
}

export function prospectReward(floor: FloorState, prospect: Prospect): LootKind {
  const depth = Number(floor.id.slice(2));
  if (prospect.signal === 'RESEARCH') return depth >= 100 ? 'RESONANCE_SHARD' : 'CRYSTAL_MEMORY';
  if (prospect.signal === 'METAL') return depth >= 100 ? 'GEM' : depth >= 60 ? 'NATURAL_GOLD' : 'GOLD_NUGGET';
  const pool: LootKind[] = ['TRILOBITE', 'AMMONITE', ...(depth >= 30 ? ['ANCIENT_FISH' as const] : []),
    ...(depth >= 60 ? ['REPTILE_TOOTH' as const] : []), ...(depth >= 100 ? ['STRANGE_VERTEBRA' as const] : [])];
  return pool[Math.floor(random(floor, prospect.id, 0xf05511) * pool.length)]!;
}

export function prospectExtraWeight(floor: FloorState, node: MiningNode): number {
  const extra = floorProspects(floor).filter((p) => p.nodeId === node.id && p.work === p.required - 1)
    .reduce((sum, p) => sum + LOOT[prospectReward(floor, p)].weight, 0);
  return extra + (floor.id === 'D-030' ? LOOT.ANCIENT_TOOL_CRATE.weight : 0);
}

export function applyOreQuality(item: LootStack, quality: OreQuality): void {
  if (item.category !== 'ORE') return;
  item.quality = quality;
  item.value = Math.round(LOOT[item.kind].value * ORE_QUALITY[quality].multiplier);
  item.name = quality === 'NORMAL' ? LOOT[item.kind].name : `${ORE_QUALITY[quality].label} ${LOOT[item.kind].name}`;
}

/** Only random/bonus specimens are sealed; the visible welcome fossils stay known. */
export function sealSpecimen(item: LootStack, floor: FloorState, index: number): void {
  if (item.category !== 'FOSSIL') return;
  const grade = random(floor, index, 0x5ec1) < 0.18 ? 'PRISTINE' : 'INTACT';
  item.specimen = { grade, value: Math.round(LOOT[item.kind].value * (grade === 'PRISTINE' ? 3 : 1.5)) };
  item.name = 'Unidentified fossil';
  item.rarity = 'RARE';
  // The visible estimate is a guaranteed floor, not the hidden appraisal result.
  item.value = 42;
}

export function appraisedLoot(item: LootStack): LootStack {
  if (!item.specimen) return item;
  const { specimen, ...known } = item;
  return { ...known, name: `${specimen.grade === 'PRISTINE' ? 'Pristine' : 'Intact'} ${LOOT[item.kind].name}`,
    rarity: LOOT[item.kind].rarity, value: specimen.value };
}

export function specimenContents(value: unknown, kind: LootKind): SpecimenContents | undefined {
  if (LOOT[kind].category !== 'FOSSIL' || !value || typeof value !== 'object') return undefined;
  const raw = value as Record<string, unknown>;
  if (raw.grade !== 'INTACT' && raw.grade !== 'PRISTINE') return undefined;
  // The grade determines the locked value. Never trust an arbitrary multiplier from a save.
  return { grade: raw.grade, value: Math.round(LOOT[kind].value * (raw.grade === 'PRISTINE' ? 3 : 1.5)) };
}

export function prospectSurvey(floor: FloorState, node: MiningNode): string | null {
  const prospect = activeProspect(floor, node);
  if (!prospect) return null;
  const label = prospect.signal === 'METAL' ? 'Metal flecks' : prospect.signal === 'FOSSIL' ? 'Fossil outline' : 'Layered crystal';
  return `${label} · ${prospect.required - prospect.work} breaks to extract · stays until mined`;
}

export function prospectPriorityValue(floor: FloorState, node: MiningNode): number {
  const prospect = activeProspect(floor, node);
  // Use disclosed category floors, not the future hidden roll, for automated target selection.
  return prospect ? (prospect.signal === 'METAL' ? 82 : prospect.signal === 'FOSSIL' ? 63 : 12) / (prospect.required - prospect.work) : 0;
}

/** All readers use these stable keys; later atlas art can replace shapes without changing rules. */
export function nodeDiscoveryCue(floor: FloorState, node: MiningNode): { signal: ProspectSignal; stage: 'SEALED' | 'EXPOSED' | 'SPENT'; remaining: number } | null {
  const prospect = floorProspects(floor).find((p) => p.nodeId === node.id && p.work >= 0);
  if (!prospect) return null;
  return { signal: prospect.signal, stage: prospect.work >= prospect.required ? 'SPENT' : prospect.work > 0 ? 'EXPOSED' : 'SEALED',
    remaining: Math.max(0, prospect.required - prospect.work) };
}

export function specimenAppraisalEvent(state: GameState, item: LootStack, known: LootStack): Record<string, string | number | boolean> {
  return { id: item.id, kind: known.kind, name: known.name, grade: item.specimen!.grade, value: known.value,
    first: !state.meta.collection.entries.some((entry) => entry.kind === known.kind && entry.discovered), depth: item.originDepth ?? 'D-001' };
}
