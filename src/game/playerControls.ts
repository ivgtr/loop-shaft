import { AUTO_SWING_MANUAL_SWINGS_REQUIRED, UPGRADE_COSTS, WORLD } from './config';
import type { GameState, LootStack, MiningNode } from './types';

export const MINE_INPUT_BUFFER = 0.15;
export const PLAYER_MINE_REACH = 26;
export const PLAYER_PICKUP_REACH = 28;
export const PLAYER_LOAD_X = WORLD.elevatorX - 19;

export function playerControlAvailable(state: GameState): boolean {
  return !state.run.elevator.travel && !(state.run.depth.current === 'D-030' && !state.run.anomaly.selected);
}

export function playerWalkBounds(state: GameState): readonly [number, number] {
  const nodes = state.run.floors[state.run.depth.current].nodes;
  if (!nodes.some((node) => node.access === 'REMOTE_ONLY')) return [16, WORLD.width - 16];
  const walkable = nodes.filter((node) => node.access !== 'REMOTE_ONLY');
  return [
    Math.max(16, Math.min(WORLD.elevatorX - 42, ...walkable.map((node) => node.x - PLAYER_MINE_REACH))),
    Math.min(WORLD.width - 16, Math.max(WORLD.elevatorX + 42, ...walkable.map((node) => node.x + PLAYER_MINE_REACH))),
  ];
}

export function canMoveToNode(state: GameState, node: MiningNode): boolean {
  return playerControlAvailable(state) && node.hp > 0 && node.access !== 'REMOTE_ONLY';
}

export function cancelPlayerAction(state: GameState): void {
  const { character, elevator } = state.run;
  // A cancelled load retains all carried cargo and releases only the player's lock.
  if (character.state === 'LOADING' && elevator.state === 'LOADING') {
    elevator.state = 'IDLE_BOTTOM';
    elevator.stateTimer = 0;
  }
  character.state = 'IDLE';
  character.targetNodeId = null;
  character.moveTargetX = null;
  character.swing = null;
  character.collectTimer = 0;
  character.loadingTimer = 0;
}

export function movePlayerTo(state: GameState, x: number): boolean {
  if (!playerControlAvailable(state) || !Number.isFinite(x)) return false;
  const [left, right] = playerWalkBounds(state);
  cancelPlayerAction(state);
  const character = state.run.character;
  character.moveTargetX = Math.max(left, Math.min(right, x));
  character.facing = character.moveTargetX >= character.x ? 1 : -1;
  character.state = 'MOVING_TO_POINT';
  return true;
}

export function miningTarget(state: GameState, nodeId?: string): MiningNode | undefined {
  const nodes = state.run.floors[state.run.depth.current].nodes;
  const usable = (node: MiningNode) => node.hp > 0 && node.access !== 'REMOTE_ONLY';
  if (nodeId !== undefined) return nodes.find((node) => node.id === nodeId && usable(node));
  const character = state.run.character;
  const target = nodes.find((node) => node.id === character.targetNodeId && usable(node));
  if (target && (character.state === 'MOVING_TO_NODE' || Math.abs(target.x - character.x) <= PLAYER_MINE_REACH)) return target;
  return nodes.filter((node) => usable(node) && Math.abs(node.x - character.x) <= PLAYER_MINE_REACH)
    .sort((a, b) => Math.abs(a.x - character.x) - Math.abs(b.x - character.x) || a.id.localeCompare(b.id))[0];
}

export function nearbyPlayerLoot(state: GameState): LootStack[] {
  const [left, right] = playerWalkBounds(state);
  return state.run.floors[state.run.depth.current].loot.filter((item) => item.x >= left && item.x <= right
    && Math.abs(item.x - state.run.character.x) <= PLAYER_PICKUP_REACH);
}

export function atPlayerLoadingPoint(state: GameState): boolean {
  return Math.abs(state.run.character.x - PLAYER_LOAD_X) <= 24;
}

export interface PlayerInteraction {
  readonly type: 'collect' | 'load' | 'workbench' | 'elevator' | 'scanner' | 'none';
  readonly label: string;
  readonly reason: string | null;
}

export function playerInteraction(state: GameState): PlayerInteraction {
  const { character, elevator } = state.run;
  if (elevator.travel) return { type: 'none', label: 'INTERACT', reason: 'TRAVELING' };
  if (state.run.depth.current === 'D-030' && !state.run.anomaly.selected) return { type: 'scanner', label: 'SCAN', reason: null };
  if (character.state === 'COLLECTING') return { type: 'collect', label: 'PICK UP', reason: 'COLLECTING · MOVE TO CANCEL' };
  if (character.state === 'LOADING') return { type: 'load', label: 'LOAD', reason: 'LOADING · MOVE TO CANCEL' };
  if (atPlayerLoadingPoint(state) && character.carried.length > 0) {
    const free = elevator.maxLoad - weight(elevator.cargo);
    const reason = elevator.state !== 'IDLE_BOTTOM' ? 'LIFT UNAVAILABLE · KEEP EXPLORING'
      : !character.carried.some((item) => item.weight <= free + 0.001) ? 'LIFT FULL · F TO SEND' : null;
    return { type: 'load', label: 'LOAD', reason };
  }
  const nearby = nearbyPlayerLoot(state);
  if (nearby.length) {
    const free = character.backpackCapacity - weight(character.carried);
    const fits = nearby.some((item) => item.weight <= free + 0.001);
    return { type: 'collect', label: 'PICK UP', reason: fits ? null : 'PACK FULL · ORE STAYS HERE' };
  }
  if (Math.abs(character.x - WORLD.workbenchX) <= 18) return { type: 'workbench', label: 'WORKSHOP', reason: null };
  if (Math.abs(character.x - WORLD.elevatorX) <= 26) return { type: 'elevator', label: 'ELEVATOR', reason: null };
  return { type: 'none', label: 'INTERACT', reason: 'NOTHING IN REACH' };
}

export type UpgradeAction = 'upgrade-tool' | 'upgrade-boots' | 'unlock-auto-swing' | 'upgrade-pack' | 'unlock-porter' | 'unlock-auto-dispatch';

export function upgradeBlockReason(state: GameState, action: UpgradeAction): string | null {
  const run = state.run;
  const cost = {
    'upgrade-tool': UPGRADE_COSTS.tool, 'upgrade-boots': UPGRADE_COSTS.boots,
    'unlock-auto-swing': UPGRADE_COSTS.autoSwing, 'upgrade-pack': UPGRADE_COSTS.pack,
    'unlock-porter': UPGRADE_COSTS.porter, 'unlock-auto-dispatch': UPGRADE_COSTS.autoDispatch,
  }[action];
  if ((action === 'upgrade-tool' && run.tool.level !== 1) || (action === 'upgrade-boots' && run.boots.level !== 1)
    || (action === 'unlock-auto-swing' && run.automation.autoSwing.unlocked) || (action === 'upgrade-pack' && run.pack.level !== 1)
    || (action === 'unlock-porter' && run.porter.enabled) || (action === 'unlock-auto-dispatch' && run.automation.autoDispatch.unlocked)) return 'ALREADY OWNED';
  if (action === 'upgrade-boots' && run.tool.level !== 2) return 'REQUIRES STEEL PICK';
  if (action === 'unlock-auto-swing' && run.boots.level !== 2) return 'REQUIRES RUNNER BOOTS';
  if (action === 'unlock-auto-swing' && run.stats.manualSwings < AUTO_SWING_MANUAL_SWINGS_REQUIRED) return `MINE ${AUTO_SWING_MANUAL_SWINGS_REQUIRED - run.stats.manualSwings} MORE TIMES`;
  if (action === 'upgrade-pack' && !run.automation.autoSwing.unlocked) return 'REQUIRES AUTO SWING';
  if (action === 'unlock-porter' && run.pack.level !== 2) return 'REQUIRES FRAME PACK';
  if (action === 'unlock-auto-dispatch' && !run.porter.enabled) return 'REQUIRES PORTER';
  return run.scrap < cost ? `NEED ${cost - run.scrap} MORE SCRAP` : null;
}

function weight(items: readonly LootStack[]): number {
  return items.reduce((sum, item) => sum + item.weight, 0);
}
