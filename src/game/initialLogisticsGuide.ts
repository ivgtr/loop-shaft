import { atPlayerLoadingPoint, nearbyPlayerLoot, playerInteraction } from './playerControls';
import { canDispatchElevator, canMine, currentFloor } from './simulation';
import type { GameEvent, GameState, MiningNode, Selection } from './types';

export type InitialLogisticsGuideStep =
  | 'choose-vein'
  | 'moving-to-vein'
  | 'walking'
  | 'mine-ready'
  | 'mining'
  | 'depleted'
  | 'pickup-ready'
  | 'collecting'
  | 'carrying'
  | 'returning'
  | 'waiting-for-lift'
  | 'load-ready'
  | 'loading-lift'
  | 'select-elevator'
  | 'send-to-surface'
  | 'to-surface'
  | 'appraising';

export type InitialLogisticsGuideTarget =
  | { readonly kind: 'interaction'; readonly ref: NonNullable<Selection> }
  | { readonly kind: 'character' };

export interface InitialLogisticsGuide {
  readonly step: InitialLogisticsGuideStep;
  readonly label: string;
  readonly context: string;
  readonly target: InitialLogisticsGuideTarget;
  readonly detailedMiningHelp: boolean;
}

export function deriveInitialLogisticsGuide(state: GameState): InitialLogisticsGuide | null {
  if (!isInitialLogisticsGuideEligible(state)) return null;
  const { run } = state;
  const elevatorRef = interaction({ type: 'elevator' });
  if (run.elevator.state === 'UNLOADING') {
    return guide('appraising', 'APPRAISING', 'Cargo is being appraised at Surface. You can keep mining.', elevatorRef);
  }
  if (run.elevator.state === 'ASCENDING') {
    return guide('to-surface', 'TO SURFACE', 'The loaded Elevator is carrying cargo to Surface. You can keep mining.', elevatorRef);
  }
  if (run.character.state === 'LOADING') {
    return guide('loading-lift', 'LOADING LIFT', 'Loading cargo. Move or press Esc to cancel without losing it.', character());
  }
  if (run.character.state === 'COLLECTING') {
    return guide('collecting', 'COLLECTING', 'Picking up nearby cargo. Move or press Esc to cancel.', character());
  }
  if (run.character.state === 'RETURNING') {
    return guide('returning', 'RETURNING WITH CARGO', 'Following your return order. Movement keys or Esc interrupt it.', character());
  }
  if (run.character.state === 'WAITING_FOR_ELEVATOR') {
    return guide('waiting-for-lift', 'LIFT UNAVAILABLE', 'You can leave the lift and keep mining with cargo.', character());
  }
  const target = targetNode(state);
  if (run.character.state === 'MOVING_TO_POINT') {
    return guide('walking', 'WALKING', 'Walk with A/D or arrow keys; click a vein to approach it.', character());
  }
  if (run.character.state === 'MOVING_TO_NODE' && target) {
    return guide('moving-to-vein', 'MOVING TO VEIN', `Moving to ${target.name}. Movement keys or Esc override this order.`, nodeTarget(target));
  }
  if (run.character.state === 'MINING' && run.character.swing && target) {
    return guide('mining', 'MINING', 'A late input queues one next swing. Repeated clicks never cancel the current swing.', character());
  }
  if (run.character.carried.length > 0) {
    if (atPlayerLoadingPoint(state)) {
      const action = playerInteraction(state);
      if (action.reason && canDispatchElevator(state)) return elevatorDispatchGuide();
      return guide('load-ready', action.reason ? 'LIFT UNAVAILABLE' : 'E · LOAD',
        action.reason ? `${action.reason}. Keep mining or return later.` : 'Press E or LOAD to transfer your cargo. Payment happens only at Surface.', character());
    }
    return guide('carrying', 'CARRYING CARGO', 'Keep mining with cargo, or choose RETURN / click the Elevator when you are ready to unload.', character());
  }
  if (nearbyPlayerLoot(state).length > 0) {
    return guide('pickup-ready', 'E · PICK UP', 'Ore stays on the floor. Press E / PICK UP nearby, or keep mining and collect it later.', character());
  }
  if (canMine(state) && target) {
    const detailed = run.stats.manualSwings === 0;
    return guide('mine-ready', 'MINE', detailed
      ? 'Mine by clicking / tapping the vein again, pressing Space, or using MINE.'
      : 'Ready for the next manual swing. You choose when to collect and return.', nodeTarget(target), detailed);
  }
  if (run.elevator.cargo.length > 0 && canDispatchElevator(state)) return elevatorDispatchGuide();
  if (target?.hp === 0) {
    return guide('depleted', `DEPLETED · ${Math.ceil(target.respawnTimer)}s`, `${target.name} is respawning. You can choose another vein.`, nodeTarget(target));
  }
  const recommended = target ?? currentFloor(state).nodes.find((node) => node.id === 'scrap-ledge');
  if (!recommended) return null;
  return guide('choose-vein', 'CLICK/TAP TO MOVE', `${recommended.name} · click or tap the vein to approach it, or walk with A/D and arrow keys.`, nodeTarget(recommended));
}

export function isInitialLogisticsGuideEligible(state: GameState): boolean {
  const { meta, run } = state;
  if (meta.runIndex !== 1 || run.depth.current !== 'D-001') return false;
  if (run.depth.unlocked.some((depth) => depth !== 'D-001') || meta.bestDepth !== 'D-001') return false;
  if (run.scrap > 0 || run.stats.elevatorTrips > 0 || run.stats.floorTrips > 0) return false;
  if (hasScrapGain(state.eventHistory)) return false;
  if (run.automation.autoSwing.unlocked || run.automation.autoDispatch.unlocked) return false;
  if (run.porter.enabled || run.phase5.crew.unlocked || run.phase5.crew.members.length > 0) return false;
  if (meta.core > 0 || meta.protocols.length > 0) return false;
  if (run.tool.level !== 1 || run.boots.level !== 1 || run.pack.level !== 1) return false;
  if (run.data > 0 || run.pendingCore > 0 || run.research.active || run.research.completed.length > 0) return false;
  if (run.phase5.cargo.unlocked || run.logistics.lines.length > 0 || run.logistics.cargoHubs.length > 0) return false;
  if (run.deepAutomation.bores.length > 0 || run.deepProgress.d250Unlocked || run.deepProgress.d400Unlocked || run.deepProgress.d650Unlocked) return false;
  return true;
}

export function isFirstLiveScrapGain(state: GameState, event: GameEvent): boolean {
  if (event.type !== 'RESOURCE_GAIN' || event.data?.resource !== 'Scrap') return false;
  if (Number(event.data.amount ?? 0) <= 0 || state.meta.runIndex !== 1 || state.run.stats.elevatorTrips > 1) return false;
  return !state.eventHistory.some((candidate) => (
    candidate.id < event.id && candidate.type === 'RESOURCE_GAIN' && candidate.data?.resource === 'Scrap'
  ));
}

function elevatorDispatchGuide(): InitialLogisticsGuide {
  return guide('send-to-surface', 'F · SEND TO SURFACE', 'Press F or SEND beside the shaft to dispatch loaded cargo, without changing your selection.', interaction({ type: 'elevator' }));
}

function targetNode(state: GameState): MiningNode | undefined {
  const floor = currentFloor(state);
  const targetId = state.run.character.targetNodeId
    ?? (state.selection?.type === 'node' ? state.selection.id : null);
  return targetId ? floor.nodes.find((node) => node.id === targetId) : undefined;
}

function hasScrapGain(events: readonly GameEvent[]): boolean {
  return events.some((event) => event.type === 'RESOURCE_GAIN' && event.data?.resource === 'Scrap');
}

function guide(step: InitialLogisticsGuideStep, label: string, context: string, target: InitialLogisticsGuideTarget, detailedMiningHelp = false): InitialLogisticsGuide {
  return { step, label, context, target, detailedMiningHelp };
}
function nodeTarget(node: MiningNode): InitialLogisticsGuideTarget { return interaction({ type: 'node', id: node.id }); }
function interaction(ref: NonNullable<Selection>): InitialLogisticsGuideTarget { return { kind: 'interaction', ref }; }
function character(): InitialLogisticsGuideTarget { return { kind: 'character' }; }
