import {
  D060_EXTENSION_COST, D100_EXTENSION_COST, D180_EXTENSION_COST, D250_EXTENSION_COST,
  D400_EXTENSION_COST, D650_SHAFT_COST, DEEP_COMPONENTS_REQUIRED, UPGRADE_COSTS,
} from './config';
import { DEPTH_ORDER } from './depth';
import { DISPATCH_POLICIES, DISPATCH_RULES, dispatchPolicy, shipmentDecision } from './dispatch';
import { canStartD650Construction, canUnlockD250, canUnlockD400 } from './deepGame';
import { canPushD180, canTravelPhase5 } from './phase5';
import { upgradeBlockReason } from './playerControls';
import { canDispatchElevator, canExtendD030, canExtendD060, canExtendD100, cargoValue, cargoWeight, d030ExtensionCost } from './simulation';
import type { DepthId, GameState } from './types';
import type { GameCommand } from '../runtime/commands';

export type ElevatorTab = 'dispatch' | 'travel' | 'extend';
/** Presentation only: never serialized with a run. */
export interface ElevatorUiState {
  tab: ElevatorTab; selectedId: string; notice: string | null; runIndex: number; depth: DepthId;
}
export interface ElevatorItem {
  id: string; name: string; summary: string; description: string; reason: string | null;
  actionLabel: string; command: GameCommand | null; complete?: boolean;
}
export const ELEVATOR_TABS: readonly ElevatorTab[] = ['dispatch', 'travel', 'extend'];
const SHAFT_DEPTHS = DEPTH_ORDER;

export function shipmentStatus(state: GameState): string {
  const { elevator, character, porter } = state.run;
  if (elevator.travel) return `${elevator.travel.from} → ${elevator.travel.to} · ${elevator.travel.remaining.toFixed(1)}s`;
  if (elevator.state === 'ASCENDING') return 'TO SURFACE';
  if (elevator.state === 'UNLOADING') return 'APPRAISING AT SURFACE';
  if (elevator.state === 'DESCENDING') return 'RETURNING TO FLOOR';
  if (character.state === 'LOADING' || porter.state === 'LOADING' || elevator.state === 'LOADING') return 'LOADING CARGO';
  if (elevator.state !== 'IDLE_BOTTOM') return elevator.state.replaceAll('_', ' ');
  return elevator.cargo.length ? state.run.automation.autoDispatch.enabled ? shipmentDecision(state).reason : 'READY TO SEND' : 'LIFT EMPTY';
}

export function travelBlockReason(state: GameState, depth: DepthId): string | null {
  if (canTravelPhase5(state, depth)) return null;
  const { run } = state;
  if (run.depth.current === depth) return 'You are here.';
  if (!run.depth.unlocked.includes(depth)) return 'Open this floor from the EXTEND tab first.';
  return emptyLiftReason(state) ?? 'Wait for the lift to become available.';
}

/** Reasons explain the existing simulation predicates; they never grant permission. */
function emptyLiftReason(state: GameState): string | null {
  const { elevator, character, porter } = state.run;
  if (elevator.travel || elevator.state !== 'IDLE_BOTTOM') return `Lift busy: ${shipmentStatus(state).toLowerCase()}.`;
  if (character.state === 'LOADING' || porter.state === 'LOADING') return 'Wait until cargo loading finishes.';
  if (elevator.cargo.length) return 'Send the loaded cargo to Surface first.';
  if (character.carried.length) return 'Unload your backpack, then send the cargo.';
  if (porter.carried.length) return 'Wait for the Porter to unload, then send the cargo.';
  return null;
}

export function elevatorItems(state: GameState, tab: ElevatorTab): ElevatorItem[] {
  const { run } = state;
  if (tab === 'travel') return SHAFT_DEPTHS.filter((depth) => run.depth.unlocked.includes(depth)).map((depth) => {
    const reason = travelBlockReason(state, depth);
    const viaSurface = run.depth.current !== 'D-001' && depth !== 'D-001' && !run.research.completed.includes('MULTI_STOP_RELAY');
    return { id: depth, name: depth, summary: depth === run.depth.current ? 'CURRENT FLOOR' : `DESTINATION ${depth}`,
      description: `Move the miner to this connected floor${viaSurface ? ' via Surface' : ''}. Cargo must be unloaded and the lift empty. No opening fee.`,
      reason, actionLabel: `TRAVEL TO ${depth}`, command: reason ? null : { type: 'travel', depth }, complete: depth === run.depth.current };
  });
  if (tab === 'extend') return extensionItems(state);
  const canSend = canDispatchElevator(state);
  const items: ElevatorItem[] = [{ id: 'shipment', name: 'Surface shipment',
    summary: `${weight(cargoWeight(run.elevator.cargo))}/${weight(run.elevator.maxLoad)} kg · EST ${cargoValue(run.elevator.cargo)} Scrap`,
    description: 'Send loaded cargo to Surface. Payment happens after physical delivery. This does not move the miner or change the selected vein.',
    reason: canSend ? null : shipmentStatus(state), actionLabel: 'SEND TO SURFACE', command: canSend ? { type: 'send' } : null }];
  const relay = run.automation.autoDispatch;
  const relayReason = relay.unlocked ? null : upgradeBlockReason(state, 'unlock-auto-dispatch');
  items.push({ id: 'relay', name: 'Auto Dispatch', summary: relay.unlocked ? `RELAY ${relay.enabled ? 'ON' : 'OFF'}` : `${UPGRADE_COSTS.autoDispatch} SCRAP`,
    description: 'Automatically dispatches eligible shipments. Turn it off when clearing the lift for a floor trip.',
    reason: relayReason, complete: relay.unlocked, actionLabel: relay.unlocked ? `AUTO DISPATCH ${relay.enabled ? 'OFF' : 'ON'}` : 'FIT AUTO RELAY',
    command: relayReason ? null : { type: relay.unlocked ? 'toggle-auto-dispatch' : 'unlock-auto-dispatch' } });
  if (relay.unlocked) for (const policy of DISPATCH_POLICIES) {
    const selected = dispatchPolicy(state) === policy;
    items.push({ id: `dispatch-${policy}`, name: `${policy} shipments`, summary: selected ? 'ACTIVE SHIPMENT POLICY' : 'SHIPMENT POLICY',
      description: DISPATCH_RULES[policy].description, reason: selected ? 'Already active.' : null,
      actionLabel: `USE ${policy}`, complete: selected, command: selected ? null : { type: 'dispatch-policy', policy } });
  }
  if (run.phase5.cargo.unlocked) for (const priority of ['BALANCED', 'CORE', 'RESEARCH', 'ANCIENT'] as const) {
    const selected = run.phase5.cargo.priority === priority;
    items.push({ id: `priority-${priority}`, name: `${priority} priority`, summary: selected ? 'ACTIVE ROUTING POLICY' : `ROUTE ${priority} FIRST`,
      description: 'Choose which waiting floor cargo gets the shared lift first. This changes routing, not the cargo already in transit.',
      reason: selected ? 'Already active.' : null, actionLabel: `USE ${priority}`, complete: selected,
      command: selected ? null : { type: 'cargo-priority', priority } });
  }
  return items;
}

export function selectedElevatorItem(state: GameState, ui: ElevatorUiState): ElevatorItem {
  const items = elevatorItems(state, ui.tab);
  return items.find((item) => item.id === ui.selectedId) ?? items.find((item) => !item.complete) ?? items[0]!;
}

function extensionItems(state: GameState): ElevatorItem[] {
  const { run, meta } = state;
  type Check = readonly [boolean, string];
  const definitions: { depth: DepthId; cost: number; command: GameCommand; ready: boolean; checks: Check[] }[] = [
    { depth: 'D-030', cost: d030ExtensionCost(state), command: { type: 'extend-d030' }, ready: canExtendD030(state), checks: [
      [run.depth.current === 'D-001', 'Return to D-001 to open this connection.'],
      [run.stats.elevatorTrips > 0, 'Deliver one shipment to Surface. Automation is optional for D-030.'],
      [!emptyLiftReason(state), emptyLiftReason(state) ?? '']] },
    { depth: 'D-060', cost: D060_EXTENSION_COST, command: { type: 'extend-d060' }, ready: canExtendD060(state), checks: [
      [run.depth.current === 'D-030', 'Travel to D-030 to open this connection.'],
      [run.anomaly.selected !== null, 'Choose an Anomaly at the D-030 scanner.'],
      [run.automation.autoDispatch.unlocked && run.porter.enabled, 'Requires Porter and Auto Dispatch.'],
      [meta.collection.entries.some((entry) => entry.discovered), 'Deliver a collectible to Surface.'],
      [meta.passives.unlocked.length > 0, 'Unlock a passive from an appraised find.'],
      [!emptyLiftReason(state), emptyLiftReason(state) ?? '']] },
    { depth: 'D-100', cost: D100_EXTENSION_COST, command: { type: 'extend-d100' }, ready: canExtendD100(state), checks: [
      [run.depth.current === 'D-060', 'Travel to D-060 to open this connection.'],
      [run.research.completed.includes('CORE_RESONANCE'), 'Complete Core Resonance research.'],
      [!emptyLiftReason(state), emptyLiftReason(state) ?? '']] },
    { depth: 'D-180', cost: D180_EXTENSION_COST, command: { type: 'push-d180' }, ready: canPushD180(state), checks: [
      [meta.runIndex >= 2, 'Available from Run 2.'], [run.depth.current === 'D-100', 'Travel to D-100 to open this connection.'],
      [run.phase5.ancient.signalFound, 'Discover the Ancient Signal.'],
      [run.phase5.crew.unlocked && run.phase5.cargo.unlocked, 'Unlock Crew Operations and Cargo Scheduler.'],
      [run.research.completed.includes('ANCIENT_SURVEY') && run.research.completed.includes('CARGO_SCHEDULER'), 'Complete Ancient Survey and Cargo Scheduler research.'],
      [run.pendingCore >= 1, 'Deliver Core cargo to Surface.'],
      [run.elevator.state === 'IDLE_BOTTOM' && !run.elevator.travel && !run.elevator.cargo.length && !run.phase5.cargo.route, 'Wait for an empty, idle lift and no cargo route.'],
      [!run.phase5.crew.members.some((member) => ['TRAVELING', 'MOVING_TO_ELEVATOR'].includes(member.state)), 'Wait for Crew transfers to finish.']] },
    { depth: 'D-250', cost: D250_EXTENSION_COST, command: { type: 'extend-d250' }, ready: canUnlockD250(state), checks: [
      [run.deepProgress.lostSampleDelivered, 'Deliver the Lost Signal Sample to Surface.'],
      [run.research.completed.includes('LOST_SURVEY'), 'Complete Lost Survey research.'],
      [run.elevator.state === 'IDLE_BOTTOM' && !run.elevator.cargo.length && !run.elevator.travel && !run.phase5.cargo.route, 'Wait for an empty, idle lift and no cargo route.']] },
    { depth: 'D-400', cost: D400_EXTENSION_COST, command: { type: 'extend-d400' }, ready: canUnlockD400(state), checks: [
      [run.deepProgress.d250Unlocked, 'Open D-250 first.'], [run.deepProgress.nullSampleDelivered, 'Deliver the Null Sample to Surface.'],
      [run.research.completed.includes('NULL_GEOMETRY'), 'Complete Null Geometry research.'],
      [run.logistics.freightCage.state !== 'UNBUILT', 'Build the Freight Cage.']] },
    { depth: 'D-650', cost: D650_SHAFT_COST, command: { type: 'build-d650' }, ready: canStartD650Construction(state), checks: [
      [!run.deepProgress.shaftConstructionStarted, 'Shaft construction is in progress.'],
      [run.deepProgress.d400Unlocked, 'Open D-400 first.'],
      [run.research.completed.includes('DEEP_SHAFT_GEOMETRY'), 'Complete Deep Shaft Geometry research.'],
      [run.deepProgress.deepComponentsDelivered >= DEEP_COMPONENTS_REQUIRED, `Deliver ${Math.max(0, DEEP_COMPONENTS_REQUIRED - run.deepProgress.deepComponentsDelivered)} more Deep Components.`],
      [!run.engineer.job, 'Wait for the Engineer to finish the current job.']] },
  ];
  return definitions.filter(({ depth }, index) => run.depth.unlocked.includes(depth) || run.depth.unlocked.includes(SHAFT_DEPTHS[index]!))
    .map(({ depth, cost, command, ready, checks }) => {
      const complete = run.depth.unlocked.includes(depth);
      const reason = complete ? 'Connection open. Select TRAVEL to visit this floor.' : ready ? null
        : checks.find(([ok]) => !ok)?.[1] ?? (run.scrap < cost ? `Need ${cost - run.scrap} more Scrap.` : 'Connection prerequisites are not complete.');
      return { id: depth, name: depth, summary: complete ? 'CONNECTED' : `${cost} SCRAP · NEW CONNECTION`,
        description: depth === 'D-650' ? 'Build a new shaft segment with the Engineer. Construction takes time; it does not move the miner.'
          : 'Open a new connection without moving the miner. Then choose the destination from TRAVEL.',
        reason, actionLabel: complete ? `${depth} CONNECTED` : depth === 'D-650' ? `BUILD ${depth}` : `OPEN ${depth}`,
        command: ready && !complete ? command : null, complete };
    });
}
function weight(value: number): string { return Number(value.toFixed(1)).toString(); }
