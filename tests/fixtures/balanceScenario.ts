import { togglePorterHold } from '../../src/game/simulation';
import { activeProspect } from '../../src/game/prospecting';
import { equipPlayerItem, processPhase5Events, updatePhase5 } from '../../src/game/phase5';
import { createGameState } from '../../src/game/createGame';
import { D030_EXTENSION_COST, D060_EXTENSION_COST, D100_EXTENSION_COST, PLAYER_PACK_CAPACITY, PLAYER_TOOL_DAMAGE } from '../../src/game/config';
import { nodeTripEstimate, visibleSeams } from '../../src/game/mining';
import { atPlayerLoadingPoint, cancelPlayerAction, movePlayerTo, nearbyPlayerLoot, playerInteraction } from '../../src/game/playerControls';
import {
  canDispatchElevator, canMine, canExtendD030, canExtendD060, canExtendD100, canTravelToDepth,
  cargoWeight, chooseAnomaly, currentFloor, drainEvents, requestFloorTravel, requestMine,
  requestPlayerInteraction, requestPlayerReturn, selectNode, sendElevator, startResearch,
  unlockAutoDispatch, unlockAutoSwing, unlockD030, unlockD060, unlockD100, unlockPorter,
  updateGame, upgradeBoots, upgradePack, upgradeTool,
} from '../../src/game/simulation';
import type { AnomalyId, GameState, MiningNode } from '../../src/game/types';

export interface ScenarioMetrics {
  scrap: number; data: number; core: number; fossils: number; delivered: number;
  swings: number; commands: number; walkingSeconds: number; idleSeconds: number; floorWeight: number;
}

/** A small, explicit player policy; does not grant money, move cargo, or bypass any action timers. */
function work(state: GameState, node: MiningNode, haul: boolean): number {
  const character = state.run.character;
  if (['MOVING_TO_NODE', 'MOVING_TO_POINT', 'RETURNING', 'LOADING', 'COLLECTING'].includes(character.state) || character.swing) return 0;
  if (haul && character.carried.length) {
    if (atPlayerLoadingPoint(state)) return playerInteraction(state).reason === null ? Number(requestPlayerInteraction(state)) : 0;
    return Number(requestPlayerReturn(state));
  }
  if (haul && nearbyPlayerLoot(state).length && playerInteraction(state).type === 'collect' && !playerInteraction(state).reason) {
    return Number(requestPlayerInteraction(state));
  }
  const stand = node.x < 240 ? node.x + 13 : node.x - 13;
  if (Math.abs(character.x - node.x) > 26) return Number(node.hp > 0 ? selectNode(state, node.id) : movePlayerTo(state, stand));
  if (node.hp <= 0) return 0;
  if (state.run.automation.autoSwing.enabled) {
    return character.state !== 'MINING' || character.targetNodeId !== node.id ? Number(selectNode(state, node.id)) : 0;
  }
  return canMine(state, node.id) ? Number(requestMine(state, node.id)) : 0;
}

function selectedNode(state: GameState, strategy: string): MiningNode {
  const floor = currentFloor(state);
  if (strategy !== 'discover' && strategy !== 'prospect') return floor.nodes.find((node) => node.id === strategy)!;
  if (strategy === 'prospect') {
    const active = floor.nodes.filter((node) => activeProspect(floor, node));
    if (active.length) return active.sort((a, b) => Math.abs(a.x - state.run.character.x) - Math.abs(b.x - state.run.character.x))[0]!;
  }
  const remaining = floor.nodes.filter((node) => visibleSeams(floor, node).length > 0);
  if (remaining.length) return remaining.sort((a, b) => Math.abs(a.x - state.run.character.x) - Math.abs(b.x - state.run.character.x))[0]!;
  return [...floor.nodes].sort((a, b) => {
    const x = nodeTripEstimate(state, a); const y = nodeTripEstimate(state, b);
    return y.averageScrap / y.seconds - x.averageScrap / x.seconds;
  })[0]!;
}

export function runIncomeScenario(seed: number, strategy: string, upgraded: boolean, seconds = 360, autonomous = false): ScenarioMetrics {
  const state = createGameState(seed);
  // Controlled comparison: identical equipment endowment, no purchase-cost deduction.
  if (upgraded) {
    state.run.tool.level = 2; state.run.tool.damage = PLAYER_TOOL_DAMAGE[2];
    state.run.boots.level = 2; state.run.pack.level = 2; state.run.character.backpackCapacity = PLAYER_PACK_CAPACITY[2];
  }
  if (autonomous) {
    state.run.automation.autoSwing = { unlocked: true, enabled: true };
    state.run.automation.autoDispatch = { unlocked: true, enabled: true };
    state.run.porter.enabled = true; state.run.porter.state = 'FIND_LOOT';
  }
  let commands = 0; let walkingSeconds = 0; let idleSeconds = 0; let delivered = 0; let fossils = 0;
  for (let tick = 0; tick < seconds * 10; tick++) {
    updateGame(state, 0.1);
    for (const event of drainEvents(state)) if (event.type === 'LOOT_APPRAISE') {
      delivered++; if (event.data?.category === 'FOSSIL') fossils++;
    }
    if (['MOVING_TO_NODE', 'MOVING_TO_POINT', 'RETURNING'].includes(state.run.character.state)) walkingSeconds += 0.1;
    if ((state.run.character.state === 'MINING' && !state.run.character.swing) || state.run.character.state === 'IDLE') idleSeconds += 0.1;
    if (!autonomous && canDispatchElevator(state)) commands += Number(sendElevator(state));
    commands += work(state, selectedNode(state, strategy), !autonomous);
  }
  return { scrap: state.run.scrap, data: state.run.data, core: state.run.pendingCore, fossils, delivered,
    swings: state.run.stats.manualSwings, commands, walkingSeconds, idleSeconds, floorWeight: cargoWeight(currentFloor(state).loot) };
}

export interface ProgressionResult {
  seed: number; firstDelivery: number | null; firstFossil: number | null; autoSwing: number | null;
  porter: number | null; d030: number | null; d060: number | null; coreDelivered: number | null;
  anomaly: AnomalyId | null; elapsed: number; manualSwings: number;
  firstQuality: number | null; maxQualityDroughtSeconds: number; firstGear: number | null; gearAppraisals: number;
}

/** Fresh-save reference route. An efficient scripted policy, not a prediction of human play time. */
export function runFirstCoreScenario(seed: number, exploreEarly: boolean, capSeconds = 5400): ProgressionResult {
  const state = createGameState(seed);
  const result: ProgressionResult = { seed, firstDelivery: null, firstFossil: null, autoSwing: null, porter: null,
    d030: null, d060: null, coreDelivered: null, anomaly: null, elapsed: 0, manualSwings: 0, firstQuality: null, maxQualityDroughtSeconds: 0, firstGear: null, gearAppraisals: 0 };
  let lastQualityAt = 0;
  let fossilVisitDone = false;
  for (let tick = 0; tick < capSeconds * 10; tick++) {
    updateGame(state, 0.1); updatePhase5(state, 0.1);
    const events = drainEvents(state); processPhase5Events(state, events);
    for (const event of [...events, ...drainEvents(state)]) {
      if (event.type === 'ORE_QUALITY_FOUND') {
        result.firstQuality ??= state.elapsed;
        result.maxQualityDroughtSeconds = Math.max(result.maxQualityDroughtSeconds, state.elapsed - lastQualityAt);
        lastQualityAt = state.elapsed;
      }
      if (event.type === 'EQUIPMENT_APPRAISED') {
        result.firstGear ??= state.elapsed; result.gearAppraisals++;
        // Deliberately simple policy: equip the first delivered tool, no clairvoyant rerolls.
        if (!state.run.phase5.equipment.equippedPlayer.TOOL) equipPlayerItem(state, String(event.data?.id));
      }
    }
    const run = state.run;
    if (run.stats.elevatorTrips > 0) result.firstDelivery ??= state.elapsed;
    if (state.meta.collection.entries.some((entry) => entry.category === 'FOSSIL' && entry.discovered)) result.firstFossil ??= state.elapsed;
    if (run.automation.autoSwing.unlocked) result.autoSwing ??= state.elapsed;
    if (run.porter.enabled) result.porter ??= state.elapsed;
    if (run.depth.current === 'D-030') result.d030 ??= state.elapsed;
    if (run.depth.current === 'D-060') result.d060 ??= state.elapsed;
    if (run.pendingCore >= 2) { result.coreDelivered = state.elapsed; break; }
    if (canDispatchElevator(state) && !run.automation.autoDispatch.enabled) sendElevator(state);

    if (run.depth.current === 'D-030' && !run.anomaly.selected) {
      const preference: AnomalyId[] = ['LIVING_ROCK', 'FRAGILE_REALITY', 'GOLD_RUSH', 'EMPTY_SHAFT', 'HEAVY_WORLD', 'FOSSIL_AGE'];
      const option = preference.find((id) => run.anomaly.options.includes(id));
      if (option) { chooseAnomaly(state, option); result.anomaly = option; }
    }
    const savingForExploration = exploreEarly && !run.depth.unlocked.includes('D-030') && run.tool.level === 2 && run.boots.level === 2;
    if (!savingForExploration) {
      if (run.tool.level === 1) upgradeTool(state);
      else if (run.boots.level === 1) upgradeBoots(state);
      else if (!run.automation.autoSwing.unlocked) unlockAutoSwing(state);
      else if (run.pack.level === 1) upgradePack(state);
      else if (!run.porter.enabled) unlockPorter(state);
      else if (!run.automation.autoDispatch.unlocked) {
        if (unlockAutoDispatch(state)) run.automation.autoDispatch.enabled = true;
      }
    }
    if (run.depth.current === 'D-060') {
      if (!run.research.completed.includes('DEEP_SURVEY')) startResearch(state, 'DEEP_SURVEY');
      else startResearch(state, 'CORE_RESONANCE');
    }
    let transition = false;
    let destination: 'D-030' | 'D-060' | 'D-100' | null = null;
    if (run.depth.current === 'D-001' && (exploreEarly || run.automation.autoDispatch.unlocked) && run.scrap >= D030_EXTENSION_COST) {
      transition = true; destination = 'D-030';
      if (canExtendD030(state)) unlockD030(state);
    } else if (run.depth.current === 'D-030' && run.scrap >= D060_EXTENSION_COST && run.porter.enabled && run.automation.autoDispatch.unlocked
      && state.meta.passives.unlocked.length > 0 && state.meta.collection.entries.some((entry) => entry.discovered)) {
      transition = true; destination = 'D-060';
      if (canExtendD060(state)) unlockD060(state);
    } else if (run.depth.current === 'D-060' && run.scrap >= D100_EXTENSION_COST && run.research.completed.includes('CORE_RESONANCE')) {
      transition = true; destination = 'D-100';
      if (canExtendD100(state)) unlockD100(state);
    }
    // Once a connection opens its fee is gone, but its travel job remains the next objective.
    if (run.depth.current === 'D-001' && run.depth.unlocked.includes('D-030')) { transition = true; destination = 'D-030'; }
    if (run.depth.current === 'D-030' && run.depth.unlocked.includes('D-060')) { transition = true; destination = 'D-060'; }
    if (run.depth.current === 'D-060' && run.depth.unlocked.includes('D-100')) { transition = true; destination = 'D-100'; }
    if (transition && destination) {
      if (run.porter.enabled && !run.porter.holdForTravel) togglePorterHold(state);
      if (canTravelToDepth(state, destination)) requestFloorTravel(state, destination);
      else if (!run.elevator.travel) {
        if (run.character.carried.length && !['RETURNING', 'LOADING'].includes(run.character.state)) requestPlayerReturn(state);
        else if (run.character.state === 'MINING' || run.character.state === 'MOVING_TO_NODE') cancelPlayerAction(state);
        if (canDispatchElevator(state)) sendElevator(state);
      }
      continue;
    }
    if (run.elevator.travel) continue;
    const floor = currentFloor(state);
    let target = floor.nodes[0]!;
    if (run.depth.current === 'D-001') {
      if (!fossilVisitDone && run.tool.level === 2) {
        target = floor.nodes[2]!;
        if ((target.minedCount ?? 0) >= 1 && !run.character.carried.length && result.firstFossil !== null) fossilVisitDone = true;
      } else target = floor.nodes[run.pack.level === 2 ? 1 : 0]!;
    } else if (run.depth.current === 'D-030') target = floor.nodes[state.meta.passives.unlocked.length ? 0 : 2]!;
    else if (run.depth.current === 'D-100') target = floor.nodes[2]!;
    work(state, target, !run.porter.enabled);
  }
  result.elapsed = state.elapsed; result.manualSwings = state.run.stats.manualSwings;
  result.maxQualityDroughtSeconds = Math.max(result.maxQualityDroughtSeconds, state.elapsed - lastQualityAt);
  return result;
}

export function percentile(values: number[], fraction: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * fraction))]!;
}
export const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
