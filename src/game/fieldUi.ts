import { DEPTH_ORDER } from './depth';
import { WORLD } from './config';
import { deriveInitialLogisticsGuide } from './initialLogisticsGuide';
import { miningTarget, playerInteraction } from './playerControls';
import { canDispatchElevator, carriedWeight, currentFloor, mineBlockReason } from './simulation';
import { workshopGuide } from './workshop';
import type { GameState, Selection } from './types';
import type { GameCommand } from '../runtime/commands';

/** Presentation only. Detailed state and prerequisites remain in sceneReadout. */
export function inspectedNode(state: GameState) {
  const selection = state.selection;
  return selection?.type === 'node'
    ? currentFloor(state).nodes.find(node => node.id === selection.id) : miningTarget(state);
}

export function fieldResources(state: GameState) {
  const { run, meta } = state;
  return {
    data: run.data > 0 || run.depth.unlocked.includes('D-060') || Boolean(run.research.active) || run.research.completed.length > 0,
    core: meta.core > 0 || run.pendingCore > 0 || meta.runIndex > 1 || run.depth.unlocked.includes('D-100'),
    run: meta.runIndex > 1,
  };
}

export function fieldInstruction(state: GameState): string | null {
  const guide = deriveInitialLogisticsGuide(state);
  if (!guide) return null;
  switch (guide.step) {
    case 'choose-vein': return 'SELECT A VEIN';
    case 'mine-ready': return state.run.stats.manualSwings === 0 ? 'SPACE / MINE' : null;
    case 'pickup-ready': return 'E / PICK UP ORE';
    case 'carrying': return 'RETURN TO UNLOAD';
    case 'load-ready': return playerInteraction(state).reason ? null : 'E / LOAD CARGO';
    case 'select-elevator': case 'send-to-surface': return 'SEND CARGO TO SURFACE';
    default: return null; // Walking, swinging, loading and delivery are visible work.
  }
}

/** One quiet marker points to the relevant facility, rather than a permanent quest banner. */
export function fieldGuideTarget(state: GameState): Selection {
  const guide = deriveInitialLogisticsGuide(state);
  if (guide) return fieldInstruction(state) && guide.target.kind === 'interaction' ? guide.target.ref : null;
  const { run, meta } = state;
  if (run.elevator.travel || run.depth.current === 'D-650') return null;
  const next = DEPTH_ORDER[DEPTH_ORDER.indexOf(run.depth.current) + 1];
  if (next && run.depth.unlocked.includes(next)) return { type: 'elevator' };
  if (workshopGuide(state)) return { type: 'workbench' };
  if (run.depth.current === 'D-030') {
    if (!run.anomaly.selected) return { type: 'scanner' };
    if (!run.porter.enabled || !run.automation.autoDispatch.unlocked) return { type: 'workbench' };
    if (meta.collection.entries.some(entry => entry.discovered) && !meta.passives.unlocked.length) return { type: 'archive' };
  }
  if (run.depth.current === 'D-060' && !run.research.completed.includes('CORE_RESONANCE')) return { type: 'research' };
  if (run.depth.current === 'D-100' && meta.runIndex === 1) {
    return run.pendingCore > 0 ? { type: 'core-chamber' } : { type: 'node', id: 'core-shell' };
  }
  return { type: 'elevator' };
}

export interface FieldHint { text: string; x: number; y: number; }
/** Only explicit unsuccessful attempts get a short local hint. Never narrate normal work. */
export function fieldActionHint(state: GameState, command: GameCommand): FieldHint | null {
  const player = { x: state.run.character.x, y: state.run.character.y - 35 };
  const lift = { x: WORLD.elevatorX, y: WORLD.floorY - 55 };
  if (command.type === 'mine') {
    const reason = mineBlockReason(state, command.nodeId);
    if (!reason || /^(TRAVELING|SWINGING|MOVING|COLLECTING|LOADING)/.test(reason)) return null;
    const node = command.nodeId ? currentFloor(state).nodes.find(node => node.id === command.nodeId) : inspectedNode(state);
    const text = node?.access === 'REMOTE_ONLY' ? 'NO WALKWAY'
      : node?.hp === 0 ? 'CHOOSE ANOTHER VEIN'
      : reason === 'CHOOSE ANOMALY' ? 'USE THE SCANNER' : 'MOVE CLOSER TO A VEIN';
    return { text, ...(node ? { x: node.x, y: node.y - 44 } : player) };
  }
  if (command.type === 'interact') {
    const reason = playerInteraction(state).reason;
    if (!reason || /^(TRAVELING|COLLECTING|LOADING)/.test(reason)) return null;
    if (reason.startsWith('PACK FULL')) return { text: 'BAG FULL - ORE STAYS HERE', ...player };
    if (reason.startsWith('LIFT FULL')) return { text: 'SEND CARGO FIRST', ...lift };
    if (reason.startsWith('LIFT UNAVAILABLE')) return { text: 'LIFT AWAY', ...lift };
    return { text: 'NOTHING IN REACH', ...player };
  }
  if (command.type === 'send' && !canDispatchElevator(state)) {
    if (state.run.elevator.state === 'IDLE_BOTTOM' && !state.run.elevator.travel) return { text: 'LOAD CARGO FIRST', ...lift };
  }
  if (command.type === 'return' && carriedWeight(state) === 0) return { text: 'BAG EMPTY', ...player };
  return null;
}

/** Waiting policies matter; normal ascending/loading/unloading does not need a caption. */
export function liftNeedsAttention(state: GameState): boolean {
  const { elevator, porter, automation } = state.run;
  return !elevator.travel && elevator.state === 'IDLE_BOTTOM'
    && (Boolean(porter.holdForTravel) || (elevator.cargo.length > 0 && automation.autoDispatch.unlocked));
}
