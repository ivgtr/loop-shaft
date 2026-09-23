import type { RewardEffect } from './rewardFeedback';
import type { DepthId, LootStack } from './types';

/** Only public appearance selects a handling sound, including inside a mixed load. */
export function cargoEffect(items: readonly LootStack[]): RewardEffect {
  const rank: Partial<Record<RewardEffect, number>> = { gravity: 10, chorus: 9, anomaly: 8, relic: 7, gem: 6, metal: 5, fossil: 4, pure: 3, fine: 2, find: 1 };
  let effect: RewardEffect = 'find';
  for (const item of items) {
    // Test sealed status before kind, rarity, grade, value or equipment seed contents.
    const next: RewardEffect = item.specimen ? 'fossil' : item.equipmentSeed !== undefined ? 'find'
      : item.kind === 'CHORUS_GEODE' ? 'chorus' : item.kind === 'GRAVITY_KNOT' ? 'gravity'
      : item.kind === 'GEM' ? 'gem' : item.category === 'VALUABLE' ? 'metal'
        : item.category === 'ANOMALY' ? 'anomaly' : item.category === 'RELIC' ? 'relic'
          : item.category === 'FOSSIL' ? 'fossil' : item.quality === 'PURE' ? 'pure' : item.quality === 'FINE' ? 'fine' : 'find';
    if ((rank[next] ?? 0) > (rank[effect] ?? 0)) effect = next;
  }
  return effect;
}

export function cargoTransfer(stage: 'PICKUP' | 'DEPOSIT', actor: string, depth: DepthId,
  items: readonly LootStack[], x: number): Record<string, string | number | boolean> {
  return { stage, actor, depth, items: items.length, effect: cargoEffect(items), x,
    weight: Number(items.reduce((sum, item) => sum + item.weight, 0).toFixed(2)) };
}
