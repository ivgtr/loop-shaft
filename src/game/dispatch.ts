import { atPlayerLoadingPoint } from './playerControls';
import type { GameState, LootStack } from './types';

export type DispatchPolicy = 'BALANCED' | 'BULK' | 'PRIORITY';
export const DISPATCH_POLICIES: readonly DispatchPolicy[] = ['BALANCED', 'BULK', 'PRIORITY'];
export const DISPATCH_RULES: Record<DispatchPolicy, { ratio: number; maxWait: number; importantWait: number; description: string }> = {
  BALANCED: { ratio: 0.6, maxWait: 15, importantWait: 4, description: '60% load, important cargo after 4s, any cargo after 15s. Rhythm waits for 85% when possible.' },
  BULK: { ratio: 0.85, maxWait: 24, importantWait: 24, description: '85% load to favor full batches and Rhythm. Any cargo leaves within 24s of loading.' },
  PRIORITY: { ratio: 0.55, maxWait: 8, importantWait: 1.5, description: 'Research, Core and equipment leave after 1.5s. Other cargo leaves at 55% load or within 8s.' },
};

export function dispatchPolicy(state: GameState): DispatchPolicy {
  return state.run.automation.dispatchPolicy ?? 'BALANCED';
}

export function setDispatchPolicy(state: GameState, policy: DispatchPolicy): boolean {
  if (!state.run.automation.autoDispatch.unlocked || !DISPATCH_POLICIES.includes(policy)) return false;
  state.run.automation.dispatchPolicy = policy;
  return true;
}

const weight = (items: readonly LootStack[]) => items.reduce((sum, item) => sum + item.weight, 0);
const important = (item: LootStack) => item.category === 'CORE' || item.category === 'RESEARCH' || item.category === 'RELIC' || item.equipmentSeed !== undefined;

/** The oldest loaded cargo's clock survives additional deposits, toggles and policy changes. */
export function updateShipmentWait(state: GameState, dt: number): void {
  const elevator = state.run.elevator;
  if (!elevator.cargo.length || ['ASCENDING', 'UNLOADING', 'DESCENDING', 'TRAVELING'].includes(elevator.state)) {
    elevator.cargoWaitSeconds = 0;
  } else elevator.cargoWaitSeconds = Math.min(60, (elevator.cargoWaitSeconds ?? 0) + dt);
}

export function shipmentDecision(state: GameState): { send: boolean; reason: string; threshold: number; remaining: number } {
  const { elevator, character, porter } = state.run;
  const policy = dispatchPolicy(state);
  const rule = DISPATCH_RULES[policy];
  const rhythm = state.meta.passives.active.includes('ELEVATOR_RHYTHM') && policy !== 'PRIORITY';
  const threshold = elevator.maxLoad * (rhythm ? 0.85 : rule.ratio);
  const cargoWeight = weight(elevator.cargo);
  const free = elevator.maxLoad - cargoWeight;
  const playerBlocked = atPlayerLoadingPoint(state) && character.carried.length > 0 && !character.carried.some((item) => item.weight <= free + 0.001);
  const porterBlocked = porter.state === 'WAITING_FOR_ELEVATOR' && porter.carried.length > 0 && !porter.carried.some((item) => item.weight <= free + 0.001);
  const limit = elevator.cargo.some(important) ? Math.min(rule.importantWait, rule.maxWait) : rule.maxWait;
  const remaining = Math.max(0, limit - (elevator.cargoWaitSeconds ?? 0));
  const reason = playerBlocked || porterBlocked ? 'UNBLOCK CARGO'
    : cargoWeight >= threshold - 0.001 ? 'BATCH READY' : remaining === 0 ? 'WAIT LIMIT' : `SHIP IN ${Math.ceil(remaining)}s`;
  return { send: elevator.cargo.length > 0 && (playerBlocked || porterBlocked || cargoWeight >= threshold - 0.001 || remaining === 0), reason, threshold, remaining };
}
