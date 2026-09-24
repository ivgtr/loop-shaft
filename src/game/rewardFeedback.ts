import type { ShipmentReceipt } from './shipmentFeedback';
import { FOSSIL_KINDS, isExceptionalKind, LOOT, PASSIVES } from './config';
import type { GameEvent, LootKind, SpecimenGrade } from './types';
import type { PresentationSettings } from './presentationSettings';
import type { MessageKey } from '../i18n';

export type RewardEffect = 'find' | 'fine' | 'pure' | 'metal' | 'gem' | 'fossil' | 'relic' | 'anomaly' | 'specimen' | 'equipment' | 'trace' | 'record' | 'work' | 'chorus' | 'gravity';
export interface NoticeMessage { key: MessageKey; values?: Record<string, string | number>; }
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
  labelMessage?: NoticeMessage;
  detailMessage?: NoticeMessage;
  artifact?: LootKind;
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
  const make = (label: string, detail: string, priority: number, effect: RewardEffect = 'find',
    messages: Pick<RewardNotice, 'labelMessage' | 'detailMessage'> = {}): RewardNotice => ({
    key: `${event.type}:${String(data.id ?? data.prospectId ?? event.id)}`, label, detail, effect,
    ...messages,
    priority, duration: priority >= 4 ? 2300 : priority >= 2 ? 1600 : 850,
    ...(depth && nodeId ? { origin: { depth, nodeId } } : {}),
  });
  switch (event.type) {
    case 'ORE_QUALITY_FOUND': {
      const pure = data.quality === 'PURE';
      return make(`${pure ? 'PURE' : 'FINE'} ORE · ${data.value} SCRAP`, `${depth} · DELIVER TO SURFACE`, pure ? 3 : 1, pure ? 'pure' : 'fine', {
        labelMessage: { key: pure ? 'reward.orePure' : 'reward.oreFine', values: { value: Number(data.value) || 0 } },
        detailMessage: { key: 'reward.surfaceDelivery', values: { depth } },
      });
    }
    case 'PROSPECT_REVEALED': return make(`${data.signal} TRACE FOUND`, `${depth} · INSPECT THE MARKED ROCK`, 3, 'trace', {
      labelMessage: { key: 'reward.traceFound', values: { signal: String(data.signal ?? '') } },
      detailMessage: { key: 'reward.traceInspect', values: { depth } },
    });
    case 'SPECIMEN_APPRAISED': {
      const message: NoticeMessage = { key: data.first ? 'reward.specimenFirst' : data.grade === 'PRISTINE' ? 'reward.specimenPristine' : 'reward.specimenAppraised', values: { value: Number(data.value) || 0 } };
      return { ...make(name, `${data.first ? 'NEW SPECIMEN' : data.grade === 'PRISTINE' ? 'PRISTINE SPECIMEN' : 'APPRAISED'} · +${data.value} SCRAP`, data.first || data.grade === 'PRISTINE' ? 5 : 1, 'specimen', { detailMessage: message }),
      ...(FOSSIL_KINDS.includes(data.kind as LootKind) && (data.grade === 'INTACT' || data.grade === 'PRISTINE')
        ? { specimen: { kind: data.kind as LootKind, grade: data.grade } } : {}) };
    }
    case 'EQUIPMENT_APPRAISED': return { ...make(name, data.first ? 'FIRST GEAR · EQUIP AT WORKSHOP' : data.newOption ? 'NEW BUILD OPTION · WORKSHOP' : 'GEAR APPRAISED · WORKSHOP', data.first || data.newOption ? 5 : 2, 'equipment', {
      detailMessage: { key: data.first ? 'reward.equipmentFirst' : data.newOption ? 'reward.equipmentOption' : 'reward.equipmentAppraised' },
    }), benefit: String(data.benefit ?? '') };
    case 'COLLECTION_DUPLICATE':
    case 'COLLECTION_REGISTERED': {
      if (data.fromSpecimen) return null;
      if (isExceptionalKind(data.kind)) {
        const first = event.type === 'COLLECTION_REGISTERED';
        const value = Number(data.value ?? LOOT[data.kind].value) || LOOT[data.kind].value;
        return { ...make(name, first ? 'PASSIVE UNLOCKED · ARCHIVE / PASSIVES' : `DUPLICATE · +${value} SCRAP`,
          first ? 6 : 3, data.kind === 'CHORUS_GEODE' ? 'chorus' : 'gravity', {
            detailMessage: first ? { key: 'reward.passiveUnlocked' } : { key: 'reward.duplicateScrap', values: { value } },
          }), artifact: data.kind,
          benefit: first ? PASSIVES[LOOT[data.kind].passive!].description : 'COLLECTION KEPT · NO STACKING BONUS' };
      }
      return event.type === 'COLLECTION_REGISTERED' ? make(name, 'NEW COLLECTION RECORD', 4, 'record', { detailMessage: { key: 'reward.collectionRecord' } }) : null;
    }
    case 'COLLECTION_RESTORED': return make(name, 'RESTORED · COLLECTION RECORDED', 4, 'record', { detailMessage: { key: 'reward.collectionRestored' } });
    case 'DISCOVERY_FOUND': {
      if (isExceptionalKind(data.publicKind)) return {
        ...make(name, `${depth} · DELIVER TO UNLOCK PASSIVE`, 6, data.publicKind === 'CHORUS_GEODE' ? 'chorus' : 'gravity', {
          detailMessage: { key: 'reward.unlockPassive', values: { depth } },
        }),
        artifact: data.publicKind,
      };
      const effect: RewardEffect = data.publicKind === 'SEALED' ? (data.category === 'FOSSIL' ? 'fossil' : 'find')
        : data.publicKind === 'GEM' ? 'gem' : data.category === 'VALUABLE' ? 'metal'
          : data.category === 'FOSSIL' ? 'fossil' : data.category === 'ANOMALY' ? 'anomaly'
            : data.category === 'RELIC' && data.publicKind ? 'relic' : 'find';
      const priority = effect === 'anomaly' || effect === 'relic' ? 4 : effect === 'gem' || effect === 'metal' ? 3 : 2;
      return make(name, `${depth} · DELIVER TO SURFACE`, priority, effect, {
        detailMessage: { key: 'reward.deliverSurface', values: { depth } },
      });
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
