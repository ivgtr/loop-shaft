import { deriveInitialLogisticsGuide } from './initialLogisticsGuide';
import { miningTarget, playerInteraction } from './playerControls';
import { currentFloor, mineBlockReason } from './simulation';
import type { GameState } from './types';

/** One readout source for paint, contextual help and assistive technology. */
export function sceneReadout(state: GameState) {
  const guide = deriveInitialLogisticsGuide(state);
  const selection = state.selection;
  const node = selection?.type === 'node'
    ? currentFloor(state).nodes.find((candidate) => candidate.id === selection.id) : miningTarget(state);
  const health = node ? node.hp > 0 ? `HP ${node.hp}/${node.maxHp}` : `DEPLETED · ${Math.ceil(node.respawnTimer)}s` : '';
  const action = playerInteraction(state);
  const reason = action.reason && action.type !== 'none' ? action.reason : mineBlockReason(state);
  return {
    title: node?.name ?? `${state.run.depth.current} · SHAFT`,
    short: [node?.name, health, reason ?? 'READY TO MINE'].filter(Boolean).join(' · '),
    detail: [guide?.context, node?.name, health, reason].filter(Boolean).join(' · '),
    goal: guide?.label ?? nextObjective(state),
  };
}

export function nextObjective(state: GameState): string {
  const { run } = state;
  if (run.depth.current === 'D-650') return 'D-650 · End of the known shaft';
  if (run.depth.current === 'D-400') return run.deepAutomation.bores.length ? 'Deliver Deep Components; research Deep Shaft Geometry' : 'Inspect Remote-only sites for Bore installation';
  if (run.depth.current === 'D-250') return run.logistics.lines.length ? 'Route bulk cargo through Rail and Freight' : 'Research Rail Logistics; restore the line';
  if (run.depth.current === 'D-180') return 'Recover the Lost Signal Sample and deliver it';
  if (run.depth.current === 'D-100') return run.pendingCore ? 'Reboot, or inspect the next shaft connection' : 'Break the Core Shell; deliver the fragments';
  if (run.depth.current === 'D-060') return 'Collect Data; research Core Resonance';
  if (run.depth.current === 'D-030') return run.anomaly.selected ? 'Deliver a collectible and unlock a passive' : 'Choose an Anomaly at the scanner';
  return 'Update your equipment at the Workshop';
}
