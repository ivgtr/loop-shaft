import type { CollectionEntry, LootStack, ProspectSignal } from '../game/types';
import { cargoVisualClass } from './semanticRenderState';

/** Pixel contracts for art/d001/discovery-sprites.json. Anchors are bottom-center.
 * Selection is a projection of public state, never another roll or saved clock.
 */
export const DISCOVERY_ATLAS = {
  host: { width: 48, height: 40, columns: 4, anchorX: 24, anchorY: 40 },
  cargo: { width: 12, height: 10, columns: 10, anchorX: 6, anchorY: 10 },
  collection: { width: 24, height: 24, columns: 5, anchorX: 12, anchorY: 24 },
} as const;
export interface DiscoveryCue { signal: ProspectSignal; stage: 'SEALED' | 'EXPOSED' | 'SPENT'; remaining: number; }
export function discoveryHostFrame(cue: DiscoveryCue): number {
  const row = { METAL: 0, FOSSIL: 1, RESEARCH: 2 }[cue.signal];
  const frame = cue.stage === 'SPENT' ? 3 : cue.stage === 'SEALED' ? 0 : cue.remaining > 1 ? 1 : 2;
  return row * 4 + frame;
}
const FOSSIL_FRAME = { TRILOBITE: 0, AMMONITE: 1, ANCIENT_FISH: 2, REPTILE_TOOTH: 3, STRANGE_VERTEBRA: 4 } as const;
type Cargo = Pick<LootStack, 'kind' | 'category' | 'equipmentSeed' | 'quality' | 'specimen'>;
export function cargoSpriteFrame(item: Cargo): number {
  // Do this BEFORE reading kind, rarity, seed or grade: all sealed outcomes share one cell.
  if (item.specimen) return 9;
  if (item.equipmentSeed !== undefined) return 21;
  if (item.category === 'ORE' && ['STONE', 'IRON', 'COPPER'].includes(item.kind)) {
    const material = item.kind === 'STONE' ? 0 : item.kind === 'IRON' ? 1 : 2;
    return material * 3 + (item.quality === 'PURE' ? 2 : item.quality === 'FINE' ? 1 : 0);
  }
  if (item.kind in FOSSIL_FRAME) return 10 + FOSSIL_FRAME[item.kind as keyof typeof FOSSIL_FRAME];
  return { rock: 0, metal: 3, copper: 6, gold: 15, gem: 16, fossil: 9, relic: 17, research: 18,
    anomaly: 19, core: 20, 'equipment-crate': 21, 'industrial-crate': 22 }[cargoVisualClass(item)];
}
export function collectionSpriteFrame(entry: Pick<CollectionEntry, 'kind' | 'discovered' | 'restored' | 'count' | 'bestSpecimenGrade'>): number {
  if (!entry.discovered) return 0; // No species silhouettes leak an undiscovered entry.
  if (entry.kind in FOSSIL_FRAME) {
    const condition = entry.count === 0 && entry.restored ? 3 : entry.bestSpecimenGrade === 'PRISTINE' ? 2 : 1;
    return condition * 5 + FOSSIL_FRAME[entry.kind as keyof typeof FOSSIL_FRAME];
  }
  return ({ PROSPECTOR_LENS: 20, RHYTHM_RELAY: 21, HUNTER_COMPASS: 22, STRIDE_MODULE: 23, FRACTURE_CORE: 24 } as Partial<Record<CollectionEntry['kind'], number>>)[entry.kind] ?? 25;
}
/** Choose a bounded *view* of a container. Preserve salient physical cargo, never
 * read a sealed outcome, sort/mutate the source, or change a loading priority. */
export function visibleCargo<T extends Cargo>(items: readonly T[], limit: number): T[] {
  return items.map((item, index) => ({ item, index, priority: item.specimen ? 5 : item.equipmentSeed !== undefined ? 6
    : item.category === 'CORE' ? 7 : item.quality === 'PURE' ? 4 : item.category !== 'ORE' ? 3 : item.quality === 'FINE' ? 2 : 0 }))
    .sort((a, b) => b.priority - a.priority || a.index - b.index).slice(0, Math.max(0, limit)).map(({ item }) => item);
}
