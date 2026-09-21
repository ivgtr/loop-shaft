import type { GameEvent } from './types';

export interface RewardNotice {
  key: string;
  label: string;
  detail: string;
  priority: number;
  duration: number;
}

/** Feedback reflects delivered value / a new decision, not merely an item's rarity color. */
export function rewardNotice(event: GameEvent): RewardNotice | null {
  const data = event.data ?? {};
  const name = String(data.name ?? 'Unusual find');
  const depth = String(data.depth ?? '');
  const make = (label: string, detail: string, priority: number): RewardNotice => ({
    key: `${event.type}:${String(data.id ?? data.prospectId ?? event.id)}`, label, detail,
    priority, duration: priority >= 4 ? 2300 : priority >= 2 ? 1600 : 850,
  });
  switch (event.type) {
    case 'ORE_QUALITY_FOUND': return make(`${data.quality === 'PURE' ? 'PURE' : 'FINE'} ORE · ${data.value} SCRAP`, `${depth} · DELIVER TO SURFACE`, data.quality === 'PURE' ? 3 : 1);
    case 'PROSPECT_REVEALED': return make(`${data.signal} TRACE FOUND`, `${depth} · INSPECT THE MARKED ROCK`, 3);
    case 'SPECIMEN_APPRAISED': return make(name, `${data.first ? 'NEW SPECIMEN' : data.grade === 'PRISTINE' ? 'PRISTINE SPECIMEN' : 'APPRAISED'} · +${data.value} SCRAP`, data.first || data.grade === 'PRISTINE' ? 5 : 1);
    case 'EQUIPMENT_APPRAISED': return make(name, data.first ? 'FIRST TOOL · EQUIP AT WORKSHOP' : data.newOption ? 'NEW BUILD OPTION · WORKSHOP' : 'GEAR APPRAISED · WORKSHOP', data.first || data.newOption ? 5 : 2);
    case 'COLLECTION_REGISTERED': return data.fromSpecimen ? null : make(name, 'NEW COLLECTION RECORD', 4);
    case 'COLLECTION_RESTORED': return make(name, 'RESTORED · COLLECTION RECORDED', 4);
    case 'DISCOVERY_FOUND': return make(name, `${depth} · DELIVER TO SURFACE`, 2);
    default: return null;
  }
}

/** Bounded transient queue. Routine ore never overwrites an important appraisal. */
export class RewardNoticeQueue {
  private current: (RewardNotice & { startedAt: number }) | null = null;
  private pending: Array<RewardNotice & { queuedAt: number }> = [];

  clear(): void { this.current = null; this.pending = []; }

  push(notice: RewardNotice, now: number): void {
    this.at(now);
    if (this.current?.key === notice.key || this.pending.some((entry) => entry.key === notice.key)) return;
    if (!this.current || notice.priority > this.current.priority) {
      this.current = { ...notice, startedAt: now };
      return;
    }
    if (notice.priority < 2) return;
    this.pending.push({ ...notice, queuedAt: now });
    this.pending.sort((a, b) => b.priority - a.priority || a.queuedAt - b.queuedAt);
    this.pending.splice(4);
  }

  at(now: number): RewardNotice | null {
    if (this.current && now - this.current.startedAt >= this.current.duration) this.current = null;
    this.pending = this.pending.filter((entry) => now - entry.queuedAt < 8000);
    if (!this.current && this.pending.length) this.current = { ...this.pending.shift()!, startedAt: now };
    return this.current;
  }
}
