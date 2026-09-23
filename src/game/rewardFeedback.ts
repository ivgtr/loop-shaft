import type { ShipmentReceipt } from './shipmentFeedback';
import { FOSSIL_KINDS } from './config';
import type { GameEvent, LootKind, SpecimenGrade } from './types';
import type { PresentationSettings } from './presentationSettings';

export type RewardEffect = 'find' | 'fine' | 'pure' | 'metal' | 'gem' | 'fossil' | 'relic' | 'anomaly' | 'specimen' | 'equipment' | 'trace' | 'record' | 'work';
export interface RewardNotice {
  key: string;
  label: string;
  detail: string;
  priority: number;
  duration: number;
  effect?: RewardEffect;
  origin?: { depth: string; nodeId: string };
  shipment?: ShipmentReceipt;
  work?: { x: number; y: number; depth: string };
  benefit?: string;
  specimen?: { kind: LootKind; grade: SpecimenGrade };
}
export interface ActiveRewardNotice extends RewardNotice { startedAt: number; queuedAt: number; }
export interface FeedbackOutput {
  reward: (notice: RewardNotice | null) => void;
  settings: () => PresentationSettings;
}

/** Only disclosed event fields select the motif. Never inspect hidden cargo/gear seeds. */
export function rewardNotice(event: GameEvent): RewardNotice | null {
  const data = event.data ?? {};
  const name = String(data.name ?? 'Unusual find');
  const depth = String(data.depth ?? '');
  const nodeId = String(data.targetNodeId ?? data.nodeId ?? '');
  const make = (label: string, detail: string, priority: number, effect: RewardEffect = 'find'): RewardNotice => ({
    key: `${event.type}:${String(data.id ?? data.prospectId ?? event.id)}`, label, detail, effect,
    priority, duration: priority >= 4 ? 2300 : priority >= 2 ? 1600 : 850,
    ...(depth && nodeId ? { origin: { depth, nodeId } } : {}),
  });
  switch (event.type) {
    case 'ORE_QUALITY_FOUND': return make(`${data.quality === 'PURE' ? 'PURE' : 'FINE'} ORE · ${data.value} SCRAP`, `${depth} · DELIVER TO SURFACE`, data.quality === 'PURE' ? 3 : 1, data.quality === 'PURE' ? 'pure' : 'fine');
    case 'PROSPECT_REVEALED': return make(`${data.signal} TRACE FOUND`, `${depth} · INSPECT THE MARKED ROCK`, 3, 'trace');
    case 'SPECIMEN_APPRAISED': return { ...make(name, `${data.first ? 'NEW SPECIMEN' : data.grade === 'PRISTINE' ? 'PRISTINE SPECIMEN' : 'APPRAISED'} · +${data.value} SCRAP`, data.first || data.grade === 'PRISTINE' ? 5 : 1, 'specimen'),
      ...(FOSSIL_KINDS.includes(data.kind as LootKind) && (data.grade === 'INTACT' || data.grade === 'PRISTINE')
        ? { specimen: { kind: data.kind as LootKind, grade: data.grade } } : {}) };
    case 'EQUIPMENT_APPRAISED': return { ...make(name, data.first ? 'FIRST GEAR · EQUIP AT WORKSHOP' : data.newOption ? 'NEW BUILD OPTION · WORKSHOP' : 'GEAR APPRAISED · WORKSHOP', data.first || data.newOption ? 5 : 2, 'equipment'), benefit: String(data.benefit ?? '') };
    case 'COLLECTION_REGISTERED': return data.fromSpecimen ? null : make(name, 'NEW COLLECTION RECORD', 4, 'record');
    case 'COLLECTION_RESTORED': return make(name, 'RESTORED · COLLECTION RECORDED', 4, 'record');
    case 'DISCOVERY_FOUND': {
      const effect: RewardEffect = data.publicKind === 'SEALED' ? (data.category === 'FOSSIL' ? 'fossil' : 'find')
        : data.publicKind === 'GEM' ? 'gem' : data.category === 'VALUABLE' ? 'metal'
          : data.category === 'FOSSIL' ? 'fossil' : data.category === 'ANOMALY' ? 'anomaly'
            : data.category === 'RELIC' && data.publicKind ? 'relic' : 'find';
      const priority = effect === 'anomaly' || effect === 'relic' ? 4 : effect === 'gem' || effect === 'metal' ? 3 : 2;
      return make(name, `${depth} · DELIVER TO SURFACE`, priority, effect);
    }
    default: return null;
  }
}

/** One bounded queue owns both the visual onset and its sound, not two competing queues. */
export class RewardNoticeQueue {
  private current: ActiveRewardNotice | null = null;
  private pending: Array<RewardNotice & { queuedAt: number }> = [];
  private seen = new Set<string>();

  clear(): void { this.current = null; this.pending = []; this.seen.clear(); }

  push(notice: RewardNotice, now: number): void {
    this.at(now);
    if (this.seen.has(notice.key)) return;
    this.seen.add(notice.key);
    if (this.seen.size > 128) this.seen.delete(this.seen.values().next().value!);
    if (!this.current || notice.priority > this.current.priority) {
      // A first-use acknowledgement may share the frame with a more important find.
      if (this.current?.effect === 'work') {
        this.pending.push(this.current);
        this.pending.sort((a, b) => b.priority - a.priority || a.queuedAt - b.queuedAt);
        this.pending.splice(4);
      }
      this.current = { ...notice, startedAt: now, queuedAt: now };
      return;
    }
    if (notice.priority < 2) return;
    this.pending.push({ ...notice, queuedAt: now });
    this.pending.sort((a, b) => b.priority - a.priority || a.queuedAt - b.queuedAt);
    this.pending.splice(4);
  }

  at(now: number): ActiveRewardNotice | null {
    if (this.current && now - this.current.startedAt >= this.current.duration) this.current = null;
    this.pending = this.pending.filter((entry) => now - entry.queuedAt < 8000);
    if (!this.current && this.pending.length) this.current = { ...this.pending.shift()!, startedAt: now };
    return this.current;
  }
}
