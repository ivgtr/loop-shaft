import { LOOT } from '../game/config';
import type { ActiveRewardNotice } from '../game/rewardFeedback';
import { APPRAISAL_TIMING, shipmentPayoutStart } from '../game/shipmentFeedback';
import type { PresentationSettings } from '../game/presentationSettings';
import type { D001AssetStore } from './d001ImageRenderer';
import { collectionSpriteFrame } from './discoveryVisuals';
import { drawPixelText } from './pixelText';
import { rewardAccent } from './rewardEffects';

/** This desk is a receipt, never a second physical cargo owner or a new roll. */
export function drawShipmentNotice(ctx: CanvasRenderingContext2D, notice: ActiveRewardNotice,
  assets: D001AssetStore, now: number, settings: PresentationSettings): void {
  const receipt = notice.shipment!; const highlight = receipt.highlight;
  const age = Math.max(0, now - notice.startedAt); const payout = shipmentPayoutStart(receipt);
  const accent = rewardAccent(notice);
  ctx.fillStyle = '#151519'; ctx.fillRect(87, 49, 306, 38);
  ctx.strokeStyle = '#756650'; ctx.strokeRect(87.5, 49.5, 305, 37);
  const text = (value: string, y: number, color = '#e1d8c3', x = 254) => {
    ctx.fillStyle = color; drawPixelText(ctx, value.toUpperCase().slice(0, 43), x, y, { font: 'standard', align: 'center', baseline: 'bottom' });
  };
  if (highlight && age < payout) {
    const revealed = age >= APPRAISAL_TIMING.reveal;
    const graded = age >= APPRAISAL_TIMING.grade;
    ctx.fillStyle = '#71634d'; ctx.fillRect(91, 78, 27, 3); ctx.fillRect(94, 81, 3, 3); ctx.fillRect(112, 81, 3, 3);
    const image = highlight.specimen && assets.ready('discoveryCollection');
    if (image && highlight.specimen && revealed) {
      const frame = collectionSpriteFrame({ kind: highlight.specimen.kind, discovered: true, count: 1,
        bestSpecimenGrade: graded ? highlight.specimen.grade : 'INTACT' });
      ctx.drawImage(image, frame % 5 * 24, Math.floor(frame / 5) * 24, 24, 24, 92, 54, 24, 24);
    } else {
      ctx.fillStyle = revealed ? accent : '#655340'; ctx.fillRect(97, 61, 15, 13);
      ctx.fillStyle = '#252124'; ctx.fillRect(103, 61, 2, 13);
      if (revealed) { ctx.fillStyle = accent; ctx.fillRect(94, 57, 18, 2); }
    }
    if (!revealed) {
      // Authored, stepped dirt removal; reduced motion retains the covered silhouette.
      const step = settings.motion ? Math.floor(age / 90) : 0;
      ctx.fillStyle = '#a38b65';
      for (let i = step; i < 4; i++) ctx.fillRect(95 + i * 5, 57 + i % 2 * 5, 4, 6);
      if (settings.motion) { ctx.fillStyle = '#b8aa88'; ctx.fillRect(93 + step * 5, 54, 9, 2); }
    }
    const label = !revealed ? 'BRUSHING OFF THE SHIPMENT' : !graded && highlight.specimen
      ? LOOT[highlight.specimen.kind].name : highlight.label;
    text(`${receipt.via} · ${receipt.items} ITEMS DELIVERED`, 59, '#a39887');
    text(label, 71, revealed ? accent : '#b6a78e');
    text(graded ? (highlight.benefit || highlight.detail) : 'SURFACE APPRAISAL', 82, '#c8bfae');
    if (graded && settings.highlights) { ctx.fillStyle = accent; ctx.fillRect(91, 54, 1, 8); ctx.fillRect(116, 69, 1, 8); }
    return;
  }
  const elapsed = age - payout;
  const total = elapsed >= APPRAISAL_TIMING.total - APPRAISAL_TIMING.payout;
  const special = elapsed >= APPRAISAL_TIMING.special - APPRAISAL_TIMING.payout;
  const displayed = total ? receipt.scrap : receipt.ordinary + (special ? receipt.special : 0);
  text(`${receipt.via} · ${receipt.items} ITEMS · ${total ? 'SETTLED' : 'COUNTING'}`, 59, '#a39887');
  text(`+${displayed.toLocaleString('en-US')} SCRAP`, 72, accent);
  const extra = [receipt.data ? `+${receipt.data} DATA` : '', receipt.core ? `+${receipt.core} CORE` : ''].filter(Boolean).join(' · ');
  text(total ? extra || 'CREDITED ON ARRIVAL' : special ? `SPECIAL CARGO +${receipt.special}` : `ORDINARY CARGO +${receipt.ordinary}`, 83, '#c8bfae');
}
