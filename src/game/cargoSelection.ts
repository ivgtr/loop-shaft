import type { LootStack } from './types';

/** The simulation and its hand-off drawing share the same ordered capacity decision. */
export function partitionCargo(items: readonly LootStack[], capacity: number): { deposited: LootStack[]; remaining: LootStack[] } {
  const deposited: LootStack[] = [];
  const remaining: LootStack[] = [];
  for (const item of items) {
    if (item.weight <= capacity + 0.001) {
      deposited.push(item);
      capacity -= item.weight;
    } else remaining.push(item);
  }
  return { deposited, remaining };
}
