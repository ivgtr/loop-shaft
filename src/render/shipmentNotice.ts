import { LOOT } from '../game/config';
import type { ActiveRewardNotice } from '../game/rewardFeedback';
import { APPRAISAL_TIMING, shipmentPayoutStart } from '../game/shipmentFeedback';
import type { PresentationSettings } from '../game/presentationSettings';
import type { D001AssetStore } from './d001ImageRenderer';
import { collectionSpriteFrame } from './discoveryVisuals';
import { drawPixelText, truncatePixelText } from './pixelText';
import { rewardAccent } from './rewardEffects';
import { displayText, formatDisplay } from '../i18n/display';

/** This desk is a receipt, never a second physical cargo owner or a new roll. */
export function drawShipmentNotice(ctx: CanvasRenderingContext2D, notice: ActiveRewardNotice,
  assets: D001AssetStore, now: number, settings: PresentationSettings): void {
  const receipt = notice.shipment!; const highlight = receipt.highlight;
  const age = Math.max(0, now - notice.startedAt); const payout = shipmentPayoutStart(receipt);
  const accent = rewardAccent(notice);
  const locale = settings.locale;
  const via = receipt.via === 'CENTRAL' ? formatDisplay(locale, 'shipment.central') : displayText(locale, receipt.via);
  const phrase = (key: Parameters<typeof formatDisplay>[1], values: Record<string, string | number> = {}) => formatDisplay(locale, key, values);
  const valueText = (value: string, key: typeof notice.labelMessage | typeof notice.detailMessage): string => key
    ? formatDisplay(locale, key.key, Object.fromEntries(Object.entries(key.values ?? {}).map(([name, entry]) => [name,
      typeof entry === 'string' ? displayText(locale, entry) : entry])))
    : displayText(locale, value);
  ctx.fillStyle = '#151519'; ctx.fillRect(87, 49, 306, 38);
  ctx.strokeStyle = '#756650'; ctx.strokeRect(87.5, 49.5, 305, 37);
  const text = (value: string, y: number, color = '#e1d8c3', x = 254) => {
    ctx.fillStyle = color; drawPixelText(ctx, truncatePixelText(value.toUpperCase(), 270), x, y, { font: 'standard', align: 'center', baseline: 'bottom' });
  };
  if (highlight && age < payout) {
    const revealed = age >= APPRAISAL_TIMING.reveal;
    const graded = age >= APPRAISAL_TIMING.grade;
    ctx.fillStyle = '#71634d'; ctx.fillRect(91, 78, 27, 3); ctx.fillRect(94, 81, 3, 3); ctx.fillRect(112, 81, 3, 3);
    const image = (highlight.specimen || highlight.artifact) && assets.ready('discoveryCollection');
    if (image && (highlight.specimen || highlight.artifact) && revealed) {
      const frame = collectionSpriteFrame({ kind: highlight.artifact ?? highlight.specimen!.kind, discovered: true, count: 1,
        bestSpecimenGrade: graded ? highlight.specimen?.grade : 'INTACT' });
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
    const label = !revealed ? phrase('shipment.brushing') : !graded && highlight.specimen
      ? displayText(locale, LOOT[highlight.specimen.kind].name) : valueText(highlight.label, highlight.labelMessage);
    text(phrase('shipment.viaItems', { via, items: receipt.items }), 59, '#a39887');
    text(label, 71, revealed ? accent : '#b6a78e');
    text(graded ? (highlight.benefit ? displayText(locale, highlight.benefit) : valueText(highlight.detail, highlight.detailMessage))
      : phrase('shipment.surfaceAppraisal'), 82, '#c8bfae');
    if (graded && settings.highlights) { ctx.fillStyle = accent; ctx.fillRect(91, 54, 1, 8); ctx.fillRect(116, 69, 1, 8); }
    return;
  }
  const elapsed = age - payout;
  const total = elapsed >= APPRAISAL_TIMING.total - APPRAISAL_TIMING.payout;
  const special = elapsed >= APPRAISAL_TIMING.special - APPRAISAL_TIMING.payout;
  const displayed = total ? receipt.scrap : receipt.ordinary + (special ? receipt.special : 0);
  text(phrase('shipment.viaStatus', { via, items: receipt.items, status: phrase(total ? 'shipment.settled' : 'shipment.counting') }), 59, '#a39887');
  text(phrase('shipment.scrapGain', { amount: displayed.toLocaleString('en-US') }), 72, accent);
  const extra = [receipt.data ? phrase('shipment.dataGain', { amount: receipt.data }) : '', receipt.core ? phrase('shipment.coreGain', { amount: receipt.core }) : ''].filter(Boolean).join(' · ');
  text(total ? extra || phrase('shipment.credited') : special ? phrase('shipment.specialCargo', { amount: receipt.special })
    : phrase('shipment.ordinaryCargo', { amount: receipt.ordinary }), 83, '#c8bfae');
}
