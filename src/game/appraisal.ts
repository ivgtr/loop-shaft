import { FOSSIL_KINDS, LOOT } from './config';
import { appraisalMultiplier } from './modifiers';
import { appraisedLoot, specimenAppraisalEvent } from './prospecting';
import type { FindReceipt, GameEventType, GameState, LootKind, LootStack } from './types';

type Sink = (type: GameEventType, data: Record<string, string | number | boolean>) => void;
export const RESTORATION_COST = 5;
const FOSSIL_DEPTH: Partial<Record<LootKind, number>> = { TRILOBITE: 1, AMMONITE: 1, ANCIENT_FISH: 30, REPTILE_TOOTH: 60, STRANGE_VERTEBRA: 100 };
const family = (kind: LootKind) => kind === 'TRILOBITE' || kind === 'AMMONITE' ? 'SHELL' : 'VERTEBRATE';
export const fossilFamilyName = (kind: LootKind): string => family(kind) === 'SHELL' ? 'shell fossils' : 'vertebrate fossils';

export function rememberFind(state: GameState, receipt: Omit<FindReceipt, 'at'>): void {
  const entries = state.run.discovery.recentFinds ??= [];
  if (entries.some((entry) => entry.id === receipt.id)) return;
  entries.unshift({ ...receipt, at: state.elapsed });
  entries.splice(12);
}

/** Both the central lift and freight call this only after actual arrival / unloading. */
export function appraisePhysicalCargo(state: GameState, cargo: readonly LootStack[], sink: Sink, via = 'CENTRAL'): void {
  if (!cargo.length) return;
  const shipmentId = `${via}:${cargo[0]!.id}`;
  const publish = sink;
  sink = (type, data) => publish(type, { ...data, shipmentId });
  let scrapGain = 0; let dataGain = 0; let coreGain = 0; let pureValue = 0; let ordinaryScrap = 0;
  for (const physical of cargo) {
    const item = appraisedLoot(physical);
    const first = !state.meta.collection.entries.some((entry) => entry.kind === item.kind && entry.discovered);
    const value = Math.round(item.value * appraisalMultiplier(state, item.category));
    if (item.category === 'ORE' && item.quality === 'PURE') pureValue += value;
    if (physical.specimen) sink('SPECIMEN_APPRAISED', { ...specimenAppraisalEvent(state, physical, item), value });
    sink('LOOT_APPRAISE', { id: item.id, kind: item.kind, name: item.name, category: item.category, rarity: item.rarity,
      depth: item.originDepth ?? state.run.depth.current, value, via, quality: item.quality ?? 'NORMAL' });
    if (['FOSSIL', 'RELIC', 'ANOMALY'].includes(item.category)) {
      registerCollection(state, item, sink, Boolean(physical.specimen));
      const entry = state.meta.collection.entries.find((candidate) => candidate.kind === item.kind)!;
      if (physical.specimen && entry.bestSpecimenGrade !== 'PRISTINE') entry.bestSpecimenGrade = physical.specimen.grade;
      if (first || physical.specimen?.grade === 'PRISTINE') rememberFind(state, { id: item.id, name: item.name,
        depth: item.originDepth ?? state.run.depth.current, value, reason: first ? 'NEW' : 'PRISTINE' });
    }
    const passive = LOOT[item.kind].passive;
    if (passive && !state.meta.passives.unlocked.includes(passive)) {
      state.meta.passives.unlocked.push(passive);
      sink('PASSIVE_UNLOCKED', { passive, source: item.kind });
      if (state.meta.passives.active.length < 2) {
        state.meta.passives.active.push(passive);
        sink('PASSIVE_EQUIPPED', { passive, enabled: true, auto: true });
      }
    }
    if (item.category === 'RESEARCH') dataGain += item.dataValue;
    if (item.category === 'CORE') coreGain += item.coreValue;
    else {
      scrapGain += value;
      if (item.category === 'ORE' && (!item.quality || item.quality === 'NORMAL')) ordinaryScrap += value;
    }
  }
  const pure = cargo.find((item) => item.category === 'ORE' && item.quality === 'PURE');
  if (pure && pureValue > 0) rememberFind(state, { id: `pure-${pure.id}`, name: 'Pure ore shipment', depth: pure.originDepth ?? state.run.depth.current, value: pureValue, reason: 'PURE' });
  if (scrapGain > 0) {
    state.run.scrap += scrapGain;
    sink('RESOURCE_GAIN', { resource: 'Scrap', amount: scrapGain, total: state.run.scrap, via });
  }
  if (dataGain > 0) {
    state.run.data += dataGain;
    sink('DATA_GAIN', { amount: dataGain, total: state.run.data, via });
  }
  if (coreGain > 0) {
    state.run.pendingCore += coreGain;
    sink('CORE_CHARGE_GAINED', { amount: coreGain, pendingCore: state.run.pendingCore, via });
    if (!state.run.coreChamber.rebootAvailable) {
      state.run.coreChamber.rebootAvailable = true;
      sink('REBOOT_AVAILABLE', { pendingCore: state.run.pendingCore });
    }
  }
  sink('SHIPMENT_APPRAISED', { id: shipmentId, via, items: cargo.length, scrap: scrapGain, ordinaryScrap,
    specialScrap: scrapGain - ordinaryScrap, data: dataGain, core: coreGain });
}

function registerCollection(state: GameState, item: LootStack, sink: Sink, fromSpecimen: boolean): void {
  let entry = state.meta.collection.entries.find((candidate) => candidate.kind === item.kind);
  if (!entry) {
    const def = LOOT[item.kind];
    entry = { kind: item.kind, name: def.name, rarity: def.rarity, category: def.category, discovered: false, count: 0 };
    state.meta.collection.entries.push(entry);
  }
  const first = !entry.discovered;
  entry.discovered = true; entry.count += 1;
  sink(first ? 'COLLECTION_REGISTERED' : 'COLLECTION_DUPLICATE', { id: item.id, kind: item.kind,
    name: LOOT[item.kind].name, count: entry.count, rarity: item.rarity, category: item.category, fromSpecimen });
}

export function duplicateFossilsAvailable(state: GameState, kind: LootKind): number {
  if (!FOSSIL_KINDS.includes(kind)) return 0;
  return state.meta.collection.entries.filter((entry) => entry.category === 'FOSSIL' && family(entry.kind) === family(kind))
    .reduce((sum, entry) => sum + Math.max(0, entry.count - 1 - (entry.restorationSpent ?? 0)), 0);
}

export function restorationBlockReason(state: GameState, kind: LootKind): string | null {
  if (!FOSSIL_KINDS.includes(kind)) return 'Only fossil specimens can be restored.';
  if (state.meta.collection.entries.some((entry) => entry.kind === kind && entry.discovered)) return 'Already in the collection.';
  const depth = FOSSIL_DEPTH[kind] ?? 100;
  if (Number(state.meta.bestDepth.slice(2)) < depth) return `Explore D-${String(depth).padStart(3, '0')} first.`;
  const available = duplicateFossilsAvailable(state, kind);
  return available < RESTORATION_COST ? `Need ${RESTORATION_COST} duplicate ${fossilFamilyName(kind)} (${available} available).` : null;
}

/** Spend delivered duplicates only. Counts remain an honest history of physical appraisals. */
export function restoreFossil(state: GameState, kind: LootKind): boolean {
  if (restorationBlockReason(state, kind)) return false;
  let needed = RESTORATION_COST;
  for (const entry of state.meta.collection.entries) {
    if (entry.category !== 'FOSSIL' || family(entry.kind) !== family(kind)) continue;
    const spend = Math.min(needed, Math.max(0, entry.count - 1 - (entry.restorationSpent ?? 0)));
    if (spend) entry.restorationSpent = (entry.restorationSpent ?? 0) + spend;
    needed -= spend;
    if (!needed) break;
  }
  let entry = state.meta.collection.entries.find((candidate) => candidate.kind === kind);
  if (!entry) {
    entry = { kind, name: LOOT[kind].name, rarity: LOOT[kind].rarity, category: 'FOSSIL', count: 0, discovered: false };
    state.meta.collection.entries.push(entry);
  }
  entry.discovered = true; entry.restored = true;
  rememberFind(state, { id: `restored-${kind}`, name: entry.name, depth: state.run.depth.current, value: 0, reason: 'RESTORED' });
  const event = { id: state.nextEventId++, type: 'COLLECTION_RESTORED' as const, at: state.elapsed, data: { kind, name: entry.name, spent: RESTORATION_COST } };
  state.events.push(event); state.eventHistory.push(event);
  if (state.eventHistory.length > 220) state.eventHistory.splice(0, state.eventHistory.length - 220);
  return true;
}
