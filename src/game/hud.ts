import { DEPTH_ORDER } from './depth';
import { nodeSurvey, nodeTripEstimate } from './mining';
import { elevatorItems } from './elevatorUi';
import { workshopGuide } from './workshop';
import { deriveInitialLogisticsGuide } from './initialLogisticsGuide';
import { miningTarget, playerInteraction } from './playerControls';
import { currentFloor, mineBlockReason } from './simulation';
import type { GameState } from './types';

/** One readout source for paint, contextual help and assistive technology. */
export function sceneReadout(state: GameState) {
  const guide = deriveInitialLogisticsGuide(state);
  const goal = guide?.label ?? nextObjective(state);
  const selection = state.selection;
  const node = selection?.type === 'node'
    ? currentFloor(state).nodes.find((candidate) => candidate.id === selection.id) : miningTarget(state);
  const health = node ? node.hp > 0 ? `HP ${node.hp}/${node.maxHp}` : `DEPLETED · ${Math.ceil(node.respawnTimer)}s` : '';
  const action = playerInteraction(state);
  const reason = action.reason && action.type !== 'none' ? action.reason : mineBlockReason(state);
  const survey = node ? nodeSurvey(state, currentFloor(state), node) : '';
  const trip = node ? nodeTripEstimate(state, node) : null;
  return {
    survey,
    title: node?.name ?? `${state.run.depth.current} · SHAFT`,
    short: [node?.name, health, reason ?? 'READY TO MINE'].filter(Boolean).join(' · '),
    detail: [survey, trip ? `Haul about ${trip.walkSeconds.toFixed(1)}s round trip; average ore ${trip.averageWeight.toFixed(1)}kg` : '', guide?.context ?? goal, node?.name, health, reason].filter(Boolean).join(' · '),
    goal,
  };
}

/** Use the same live prerequisites as the lift, so completed objectives do not linger. */
export function nextObjective(state: GameState): string {
  const { run, meta } = state;
  const upgrade = workshopGuide(state);
  if (upgrade) return upgrade.label;
  if (run.depth.current === 'D-650') return 'D-650 · End of the known shaft';
  if (run.depth.current === 'D-100') {
    if (!run.pendingCore) return 'Break the Core Shell; deliver the fragments';
    if (meta.runIndex === 1) return 'Reboot at the Core Chamber; keep the appraised Core';
  }
  const nextDepth = DEPTH_ORDER[DEPTH_ORDER.indexOf(run.depth.current) + 1];
  if (nextDepth && run.depth.unlocked.includes(nextDepth)) return `LIFT · TRAVEL TO ${nextDepth}`;
  const connection = elevatorItems(state, 'extend').find((item) => item.id === nextDepth);
  if (connection) return connection.command ? `LIFT · ${connection.actionLabel}` : `${connection.name} · ${connection.reason}`;
  return 'Inspect the next connection at the Lift';
}
