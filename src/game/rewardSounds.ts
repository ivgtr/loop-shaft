import { APPRAISAL_TIMING, shipmentPayoutStart } from './shipmentFeedback';
import type { RewardEffect, RewardNotice } from './rewardFeedback';

export interface RewardNote { at: number; frequency: number; duration: number; type: OscillatorType; gain: number; end?: number; }
const note = (at: number, frequency: number, duration: number, type: OscillatorType = 'sine', gain = 0.035, end?: number): RewardNote => ({ at, frequency, duration, type, gain, end });

/** Authored envelopes/intervals, not one ascending square-wave tune with a different color. */
const MOTIFS: Record<RewardEffect, readonly RewardNote[]> = {
  fine: [note(0, 1320, .10, 'sine', .026)],
  pure: [note(0, 1175, .22), note(.075, 1762, .24, 'sine', .024), note(.15, 2350, .18, 'sine', .016)],
  metal: [note(0, 196, .16, 'triangle', .07, 98), note(.015, 509, .30, 'sine', .035), note(.025, 1007, .22, 'sine', .024), note(.16, 1568, .19, 'sine', .026)],
  gem: [note(0, 1568, .25, 'sine', .04), note(.055, 2349, .20, 'sine', .021), note(.13, 2093, .28, 'sine', .032)],
  fossil: [note(0, 143, .065, 'triangle', .065, 70), note(.07, 262, .13, 'triangle'), note(.19, 294, .18, 'triangle', .03)],
  relic: [note(0, 110, .035, 'square', .025), note(.09, 196, .28, 'triangle', .055, 392), note(.20, 587, .25, 'sine'), note(.32, 784, .32, 'sine', .028)],
  anomaly: [note(.14, 49, .42, 'triangle', .08, 41), note(.20, 831, .30, 'sine', .035), note(.38, 1247, .26, 'sine', .023)],
  specimen: [note(0, 262, .10, 'triangle', .03), note(.12, 392, .22, 'sine'), note(.25, 523, .32, 'sine', .035)],
  equipment: [note(0, 147, .05, 'square', .02), note(.09, 440, .16, 'triangle'), note(.22, 659, .22, 'triangle')],
  trace: [note(0, 880, .07, 'sine', .026), note(.12, 880, .15, 'sine', .021)],
  record: [note(0, 392, .16, 'triangle'), note(.10, 523, .20, 'triangle'), note(.22, 784, .28, 'sine')],
  work: [note(0, 147, .06, 'triangle', .04), note(.10, 392, .14, 'sine', .025)],
  find: [note(0, 523, .10, 'triangle', .03), note(.10, 659, .16, 'triangle', .027)],
};

export function rewardNotes(notice: RewardNotice): readonly RewardNote[] {
  if (notice.shipment) {
    const receipt = notice.shipment; const highlight = receipt.highlight;
    const payout = shipmentPayoutStart(receipt) / 1000;
    const opening = highlight ? [note(0, 143, .08, 'triangle', .025),
      ...MOTIFS[highlight.effect ?? 'find'].map(n => ({ ...n, at: n.at + APPRAISAL_TIMING.reveal / 1000 }))] : [];
    // The grade/first-record chord follows the reveal rather than announcing it under the dust.
    if (highlight && highlight.priority >= 4) opening.push(
      note(APPRAISAL_TIMING.grade / 1000, 784, .28, 'sine', .026),
      note(APPRAISAL_TIMING.grade / 1000, 1047, .22, 'sine', .017));
    return [...opening, ...(receipt.ordinary > 0 ? [note(payout, 659, .08, 'triangle', .02)] : []),
      ...(receipt.special > 0 ? [note(payout + .31, 988, .12, 'sine', .026)] : []),
      note(payout + .63, 784, .15, 'sine', .028), note(payout + .69, 1175, .18, 'sine', .018)];
  }
  const notes = MOTIFS[notice.effect ?? 'find'];
  // Common repeat appraisals stay short. A first/pristine specimen gets its own resolving chord.
  if (notice.effect === 'specimen') return notice.priority >= 4
    ? [...notes, note(.38, 784, .38, 'sine', .026), note(.38, 1047, .30, 'sine', .017)] : notes.slice(0, 1);
  return notes;
}

/** Short fragments of the find motif, not another discovery fanfare. */
export function transportNotes(effect: string, deposit: boolean): readonly RewardNote[] {
  const motif = MOTIFS[effect as RewardEffect] ?? MOTIFS.find;
  if (effect === 'find') return [note(0, deposit ? 180 : 250, .055, 'triangle', .025, 100)];
  return motif.slice(0, 2).map((n, index) => ({ ...n, at: index * .025, duration: Math.min(.13, n.duration),
    frequency: n.frequency * (deposit ? .85 : 1), gain: n.gain * .45 }));
}
