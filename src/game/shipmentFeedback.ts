import { rewardNotice, type RewardNotice } from './rewardFeedback';
import type { GameEvent } from './types';

export const APPRAISAL_TIMING = { reveal: 350, grade: 800, payout: 1550, special: 1860, total: 2180 } as const;
export interface ShipmentReceipt {
  via: string; items: number; ordinary: number; special: number; scrap: number; data: number; core: number;
  highlight: RewardNotice | null;
}

/** All appraisals in this event batch are already committed; choose one disclosed highlight per physical shipment. */
export function shipmentNotice(event: GameEvent, batch: readonly GameEvent[]): RewardNotice | null {
  if (event.type !== 'SHIPMENT_APPRAISED') return null;
  const data = event.data ?? {};
  const id = String(data.shipmentId ?? data.id ?? event.id);
  let highlight: RewardNotice | null = null;
  for (const candidate of batch) {
    if (candidate.data?.shipmentId !== id) continue;
    let notice = rewardNotice(candidate);
    if (!notice && candidate.type === 'LOOT_APPRAISE' && candidate.data?.category === 'VALUABLE') {
      notice = rewardNotice({ ...candidate, type: 'DISCOVERY_FOUND', data: { ...candidate.data, publicKind: candidate.data.kind! } });
      if (notice) {
        notice.detail = `APPRAISED · +${candidate.data.value} SCRAP`;
        notice.detailMessage = { key: 'shipment.appraisedValuable', values: { value: Number(candidate.data.value) || 0 } };
      }
    }
    if (notice && (!highlight || notice.priority > highlight.priority)) highlight = notice;
  }
  const number = (key: string) => Math.max(0, Number(data[key]) || 0);
  const shipment: ShipmentReceipt = { via: String(data.via ?? 'CENTRAL'), items: number('items'), ordinary: number('ordinaryScrap'),
    special: number('specialScrap'), scrap: number('scrap'), data: number('data'), core: number('core'), highlight };
  return { key: `SHIPMENT:${id}`, label: 'SURFACE APPRAISAL', detail: `${shipment.items} ITEMS DELIVERED`,
    labelMessage: { key: 'shipment.title' }, detailMessage: { key: 'shipment.itemsDelivered', values: { items: shipment.items } },
    priority: Math.max(3, highlight?.priority ?? 0), duration: highlight ? 3100 : 1800,
    effect: highlight?.effect ?? 'find', shipment };
}

export function shipmentPayoutStart(receipt: ShipmentReceipt): number { return receipt.highlight ? APPRAISAL_TIMING.payout : 0; }
