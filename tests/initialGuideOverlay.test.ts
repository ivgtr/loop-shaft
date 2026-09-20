import { describe, expect, test } from 'vitest';
import type { InitialLogisticsGuide, InitialLogisticsGuideStep } from '../src/game/initialLogisticsGuide';
import { initialGuideLabel } from '../src/render/initialGuideOverlay';

function guide(step: InitialLogisticsGuideStep, label: string): InitialLogisticsGuide {
  return { step, label, context: 'Detailed instruction remains available.', target: { kind: 'character' }, detailedMiningHelp: false };
}

describe('D-001 world guide labels', () => {
  test.each([
    'moving-to-vein', 'mining', 'collecting', 'returning', 'loading-lift', 'to-surface', 'appraising',
  ] as const)('does not cover visible automatic work during %s', (step) => {
    const original = Object.freeze(guide(step, 'STATUS'));
    expect(initialGuideLabel(original)).toBeNull();
    expect(original.context).toBe('Detailed instruction remains available.');
    expect(original.label).toBe('STATUS');
  });

  test('shortens the first prompt without changing the underlying guide', () => {
    const original = guide('choose-vein', 'CLICK/TAP TO MOVE');
    expect(initialGuideLabel(original)).toBe('SELECT VEIN');
    expect(original.label).toBe('CLICK/TAP TO MOVE');
  });

  test.each([
    ['mine-ready', 'MINE'], ['select-elevator', 'SELECT ELEVATOR'],
    ['send-to-surface', 'SEND TO SURFACE'], ['waiting-for-lift', 'WAITING FOR LIFT'],
    ['depleted', 'DEPLETED · 4s'],
  ] as const)('retains the actionable or blocked %s prompt', (step, label) => {
    expect(initialGuideLabel(guide(step, label))).toBe(label);
  });
});
