import { ANOMALY_POOL, COLLECT_DURATION, CORE_PROTOCOLS, D030_EXTENSION_COST, D060_EXTENSION_COST, D100_EXTENSION_COST, FLOOR_TRAVEL_DURATION, FLOOR_TRAVEL_VIA_SURFACE_DURATION, LOAD_DURATION, PLAYER_PACK_CAPACITY, PLAYER_TOOL_DAMAGE, PORTER_COLLECT_DURATION, PORTER_LOAD_DURATION, RESEARCH, SWING, UNLOAD_DURATION, UPGRADE_COSTS, WORLD } from './config';
import { createNewRun } from './createGame';
import { playerMiningDamage, rollMiningLoot, treasureChance } from './mining';
import { appraisePhysicalCargo } from './appraisal';
import { shipmentDecision, updateShipmentWait } from './dispatch';
import { getModifiers } from './modifiers';
import { cancelPlayerAction, canMoveToNode, MINE_INPUT_BUFFER, miningTarget, nearbyPlayerLoot, PLAYER_LOAD_X, PLAYER_MINE_REACH, playerControlAvailable, playerInteraction, upgradeBlockReason } from './playerControls';
import { hashSeed } from './rng';
import type {
  AnomalyId,
  CoreProtocolId,
  DepthId,
  FloorState,
  GameEvent,
  GameEventType,
  GameState,
  LootCategory,
  LootStack,
  MiningNode,
  PassiveId,
  Rarity,
  ResearchId,
  WorkerBody,
} from './types';

const NODE_STOP_DISTANCE = 13;
const PORTER_LOAD_X = WORLD.elevatorX + 28;
const RARITY_RANK: Record<Rarity, number> = { COMMON: 0, UNCOMMON: 1, RARE: 2, EPIC: 3, RELIC: 4, ANOMALY: 5 };
const DEPTH_RANK: Record<DepthId, number> = { 'D-001': 1, 'D-030': 30, 'D-060': 60, 'D-100': 100, 'D-180': 180, 'D-250': 250, 'D-400': 400, 'D-650': 650 };

export function currentFloor(state: GameState): FloorState {
  return state.run.floors[state.run.depth.current];
}

export function updateGame(state: GameState, dt: number): void {
  const step = Math.max(0, Math.min(dt, 0.1));
  state.elapsed += step;
  applyEffectiveParameters(state);
  updateResearch(state, step);
  updateNodes(state, step);
  if (updateFloorTravel(state, step)) return;
  updateElevator(state, step);
  updateCharacter(state, step);
  updatePorter(state, step);
  updateAutomation(state);
}

export function selectNode(state: GameState, nodeId: string): boolean {
  if (state.run.depth.current === 'D-030' && !state.run.anomaly.selected) {
    state.selection = { type: 'scanner' };
    return false;
  }
  const node = currentFloor(state).nodes.find((candidate) => candidate.id === nodeId);
  if (!node) return false;
  state.selection = { type: 'node', id: nodeId };
  if (!canMoveToNode(state, node)) return false;
  const character = state.run.character;
  // Re-selecting the same job must not restart movement or cancel its swing.
  if (character.targetNodeId === nodeId && ['MINING', 'MOVING_TO_NODE'].includes(character.state)) return true;
  cancelPlayerAction(state);
  character.targetNodeId = nodeId;
  character.facing = node.x >= character.x ? 1 : -1;
  character.state = 'MOVING_TO_NODE';
  emit(state, 'PLAYER_INPUT_MOVE', { nodeId });
  emit(state, 'MINER_MOVE_START', { nodeId, distance: node.distanceMeters });
  return true;
}

export function moveToSelectedNode(state: GameState): boolean {
  return state.selection?.type === 'node' ? selectNode(state, state.selection.id) : false;
}
export function selectElevator(state: GameState): void { state.selection = { type: 'elevator' }; }
export function selectWorkbench(state: GameState): void { state.selection = { type: 'workbench' }; }
export function selectScanner(state: GameState): void { if (state.run.depth.current === 'D-030') state.selection = { type: 'scanner' }; }
export function selectArchive(state: GameState): void { state.selection = { type: 'archive' }; }
export function selectResearchTerminal(state: GameState): void { if (state.run.depth.unlocked.includes('D-060')) state.selection = { type: 'research' }; }
export function selectCoreConsole(state: GameState): void { if (state.meta.runIndex > 1 || state.meta.core > 0 || state.meta.protocols.length > 0) state.selection = { type: 'core-console' }; }
export function selectCoreChamber(state: GameState): void { if (state.run.depth.current === 'D-100') state.selection = { type: 'core-chamber' }; }

export function requestMine(state: GameState, nodeId?: string): boolean {
  const node = miningTarget(state, nodeId);
  if (!node || !canMine(state, node.id)) return false;
  const character = state.run.character;
  character.moveTargetX = null;
  character.targetNodeId = node.id;
  character.state = 'MINING';
  state.selection = { type: 'node', id: node.id };
  emit(state, 'PLAYER_INPUT_MINE', { nodeId: node.id });
  state.run.stats.manualSwings += 1;
  return beginSwing(state, node);
}

export function requestPlayerReturn(state: GameState): boolean {
  if (!playerControlAvailable(state) || state.run.character.carried.length === 0) return false;
  cancelPlayerAction(state);
  const character = state.run.character;
  character.state = 'RETURNING';
  character.facing = PLAYER_LOAD_X >= character.x ? 1 : -1;
  emit(state, 'MINER_RETURN', { weight: cargoWeight(character.carried) });
  return true;
}

export function requestPlayerInteraction(state: GameState): boolean {
  const interaction = playerInteraction(state);
  if (interaction.reason) return false;
  if (interaction.type === 'collect') {
    cancelPlayerAction(state);
    state.run.character.state = 'COLLECTING';
  } else if (interaction.type === 'load') {
    cancelPlayerAction(state);
    beginCharacterLoading(state);
  } else if (interaction.type === 'workbench') selectWorkbench(state);
  else if (interaction.type === 'elevator') selectElevator(state);
  else if (interaction.type === 'scanner') selectScanner(state);
  else return false;
  return true;
}

export function sendElevator(state: GameState): boolean {
  return canDispatchElevator(state) ? dispatchElevator(state) : false;
}

export function upgradeTool(state: GameState): boolean {
  const run = state.run;
  if (upgradeBlockReason(state, 'upgrade-tool') || !spendScrap(state, UPGRADE_COSTS.tool)) return false;
  run.tool = { id: 'player-tool', slot: 'TOOL', level: 2, name: 'Steel Pickaxe', damage: PLAYER_TOOL_DAMAGE[2] };
  emit(state, 'EQUIPMENT_CHANGED', { slot: 'TOOL', name: run.tool.name, level: 2, damage: run.tool.damage });
  return true;
}

export function upgradeBoots(state: GameState): boolean {
  const run = state.run;
  if (upgradeBlockReason(state, 'upgrade-boots') || !spendScrap(state, UPGRADE_COSTS.boots)) return false;
  run.boots = { id: 'player-boots', slot: 'BOOTS', level: 2, name: 'Runner Boots' };
  applyEffectiveParameters(state);
  emit(state, 'EQUIPMENT_CHANGED', { slot: 'BOOTS', name: run.boots.name, level: 2, moveSpeed: run.character.moveSpeed });
  return true;
}

export function unlockAutoSwing(state: GameState): boolean {
  const run = state.run;
  if (upgradeBlockReason(state, 'unlock-auto-swing') || !spendScrap(state, UPGRADE_COSTS.autoSwing)) return false;
  run.automation.autoSwing = { unlocked: true, enabled: true };
  emit(state, 'AUTOMATION_UNLOCKED', { automation: 'AUTO_SWING', enabled: true });
  return true;
}

export function toggleAutoSwing(state: GameState): boolean {
  if (!state.run.automation.autoSwing.unlocked) return false;
  state.run.automation.autoSwing.enabled = !state.run.automation.autoSwing.enabled;
  emit(state, 'AUTOMATION_TOGGLED', { automation: 'AUTO_SWING', enabled: state.run.automation.autoSwing.enabled });
  return true;
}

export function upgradePack(state: GameState): boolean {
  const run = state.run;
  if (upgradeBlockReason(state, 'upgrade-pack') || !spendScrap(state, UPGRADE_COSTS.pack)) return false;
  run.pack = { id: 'player-pack', slot: 'PACK', level: 2, name: 'Frame Pack' };
  run.character.backpackCapacity = PLAYER_PACK_CAPACITY[2];
  emit(state, 'EQUIPMENT_CHANGED', { slot: 'PACK', name: run.pack.name, level: 2, capacity: run.character.backpackCapacity });
  return true;
}

export function unlockPorter(state: GameState): boolean {
  const run = state.run;
  if (upgradeBlockReason(state, 'unlock-porter') || !spendScrap(state, UPGRADE_COSTS.porter)) return false;
  run.porter.enabled = true;
  run.porter.state = 'FIND_LOOT';
  emit(state, 'PORTER_UNLOCKED', { capacity: run.porter.capacity, moveSpeed: run.porter.moveSpeed });
  return true;
}

export function togglePorterHold(state: GameState): boolean {
  const porter = state.run.porter;
  if (!porter.enabled) return false;
  porter.holdForTravel = !porter.holdForTravel;
  if (!porter.carried.length && porter.state !== 'LOADING') {
    porter.state = 'IDLE'; porter.targetLootId = null; porter.collectTimer = 0;
  }
  return true;
}

export function unlockAutoDispatch(state: GameState): boolean {
  const run = state.run;
  if (upgradeBlockReason(state, 'unlock-auto-dispatch') || !spendScrap(state, UPGRADE_COSTS.autoDispatch)) return false;
  run.automation.autoDispatch = { unlocked: true, enabled: false };
  emit(state, 'AUTOMATION_UNLOCKED', { automation: 'AUTO_DISPATCH', enabled: false });
  return true;
}

export function toggleAutoDispatch(state: GameState): boolean {
  if (!state.run.automation.autoDispatch.unlocked) return false;
  state.run.automation.autoDispatch.enabled = !state.run.automation.autoDispatch.enabled;
  emit(state, 'AUTOMATION_TOGGLED', { automation: 'AUTO_DISPATCH', enabled: state.run.automation.autoDispatch.enabled });
  return true;
}

export function d030ExtensionCost(state: GameState): number {
  return state.meta.protocols.includes('SHAFT_BLUEPRINT') ? Math.round(D030_EXTENSION_COST * 0.3) : D030_EXTENSION_COST;
}

export function canExtendD030(state: GameState): boolean {
  const run = state.run;
  const prerequisiteReady = run.stats.elevatorTrips > 0;
  return run.depth.current === 'D-001'
    && !run.depth.unlocked.includes('D-030')
    && prerequisiteReady
    && run.scrap >= d030ExtensionCost(state)
    && liftClearForTravel(state);
}

export function unlockD030(state: GameState): boolean {
  if (!canExtendD030(state)) return false;
  const cost = d030ExtensionCost(state);
  state.run.scrap -= cost;
  unlockDepth(state, 'D-030', cost);
  return true;
}

export function canExtendD060(state: GameState): boolean {
  const run = state.run;
  const discovered = state.meta.collection.entries.some((entry) => entry.discovered);
  return run.depth.current === 'D-030'
    && run.anomaly.selected !== null
    && !run.depth.unlocked.includes('D-060')
    && run.automation.autoDispatch.unlocked
    && run.porter.enabled
    && discovered
    && state.meta.passives.unlocked.length > 0
    && run.scrap >= D060_EXTENSION_COST
    && liftClearForTravel(state);
}

export function unlockD060(state: GameState): boolean {
  if (!canExtendD060(state)) return false;
  state.run.scrap -= D060_EXTENSION_COST;
  unlockDepth(state, 'D-060', D060_EXTENSION_COST);
  return true;
}

export function canExtendD100(state: GameState): boolean {
  const run = state.run;
  return run.depth.current === 'D-060'
    && !run.depth.unlocked.includes('D-100')
    && run.research.completed.includes('CORE_RESONANCE')
    && run.scrap >= D100_EXTENSION_COST
    && liftClearForTravel(state);
}

export function unlockD100(state: GameState): boolean {
  if (!canExtendD100(state)) return false;
  state.run.scrap -= D100_EXTENSION_COST;
  unlockDepth(state, 'D-100', D100_EXTENSION_COST);
  return true;
}

function unlockDepth(state: GameState, depth: DepthId, cost: number): void {
  if (!state.run.depth.unlocked.includes(depth)) state.run.depth.unlocked.push(depth);
  emit(state, 'DEPTH_UNLOCKED', { depth, cost });
}

export function canTravelToDepth(state: GameState, depth: DepthId): boolean {
  return depth !== state.run.depth.current && state.run.depth.unlocked.includes(depth) && liftClearForTravel(state);
}

export function requestFloorTravel(state: GameState, depth: DepthId): boolean {
  if (!canTravelToDepth(state, depth)) return false;
  const run = state.run;
  const from = run.depth.current;
  const bothUnderground = from !== 'D-001' && depth !== 'D-001';
  const directRelay = run.research.completed.includes('MULTI_STOP_RELAY');
  const viaSurface = bothUnderground && !directRelay;
  const duration = viaSurface ? FLOOR_TRAVEL_VIA_SURFACE_DURATION : FLOOR_TRAVEL_DURATION;
  cancelPlayerAction(state);
  run.elevator.travel = { from, to: depth, remaining: duration, duration, viaSurface };
  run.elevator.state = 'TRAVELING';
  run.elevator.stateTimer = 0;
  run.character.state = 'IDLE';
  run.character.targetNodeId = null;
  run.character.swing = null;
  run.porter.targetLootId = null;
  run.porter.state = run.porter.enabled ? 'FIND_LOOT' : 'IDLE';
  state.selection = null;
  emit(state, 'FLOOR_TRAVEL_REQUESTED', { from, to: depth, viaSurface });
  emit(state, 'ELEVATOR_TRAVEL_STARTED', { from, to: depth, duration, viaSurface });
  return true;
}

export function chooseAnomaly(state: GameState, anomaly: AnomalyId): boolean {
  if (state.run.depth.current !== 'D-030' || state.run.anomaly.selected || !state.run.anomaly.options.includes(anomaly)) return false;
  state.run.anomaly.selected = anomaly;
  applyEffectiveParameters(state);
  state.selection = null;
  emit(state, 'ANOMALY_SELECTED', { anomaly });
  return true;
}

export function togglePassive(state: GameState, passive: PassiveId): boolean {
  if (state.selection?.type !== 'archive' || !state.meta.passives.unlocked.includes(passive)) return false;
  const active = state.meta.passives.active;
  const index = active.indexOf(passive);
  if (index >= 0) {
    active.splice(index, 1);
    applyEffectiveParameters(state);
    emit(state, 'PASSIVE_EQUIPPED', { passive, enabled: false });
    return true;
  }
  if (active.length >= 2) return false;
  active.push(passive);
  applyEffectiveParameters(state);
  emit(state, 'PASSIVE_EQUIPPED', { passive, enabled: true });
  return true;
}

export function researchBlockReason(state: GameState, id: ResearchId): string | null {
  const run = state.run;
  const definition = RESEARCH[id];
  if (run.research.completed.includes(id)) return 'Research complete.';
  if (!run.depth.unlocked.includes('D-060')) return 'Connect D-060 to use the Surface Analyzer.';
  if (run.research.active?.id === id) return `Research running: ${Math.ceil(run.research.active.remaining)}s remaining.`;
  if (run.research.active) return `Finish ${RESEARCH[run.research.active.id].name} first.`;
  if (definition.prerequisite && !run.research.completed.includes(definition.prerequisite)) return `Requires ${RESEARCH[definition.prerequisite].name}.`;
  if (run.data < definition.dataCost) return `Need ${definition.dataCost - run.data} more Data.`;
  return null;
}

export function canStartResearch(state: GameState, id: ResearchId): boolean {
  return researchBlockReason(state, id) === null;
}

export function startResearch(state: GameState, id: ResearchId): boolean {
  if (!canStartResearch(state, id)) return false;
  const definition = RESEARCH[id];
  state.run.data -= definition.dataCost;
  state.run.research.active = { id, remaining: definition.duration, duration: definition.duration };
  emit(state, 'RESEARCH_STARTED', { research: id, dataCost: definition.dataCost, duration: definition.duration });
  return true;
}

export function coreProtocolBlockReason(state: GameState, id: CoreProtocolId): string | null {
  const definition = CORE_PROTOCOLS[id];
  if (state.meta.protocols.includes(id)) return 'Protocol installed permanently.';
  if (definition.requiredDepth && DEPTH_RANK[state.meta.bestDepth] < DEPTH_RANK[definition.requiredDepth]) {
    return `Reach ${definition.requiredDepth} before installing this deep Protocol.`;
  }
  return state.meta.core < definition.cost ? `Need ${definition.cost - state.meta.core} more Core.` : null;
}

export function purchaseCoreProtocol(state: GameState, id: CoreProtocolId): boolean {
  const definition = CORE_PROTOCOLS[id];
  if (state.selection?.type !== 'core-console' || coreProtocolBlockReason(state, id)) return false;
  state.meta.core -= definition.cost;
  state.meta.protocols.push(id);
  applyProtocolToCurrentRun(state, id);
  emit(state, 'CORE_PROTOCOL_PURCHASED', { protocol: id, cost: definition.cost, core: state.meta.core });
  return true;
}

export function armReboot(state: GameState): boolean {
  const chamber = state.run.coreChamber;
  if (state.selection?.type !== 'core-chamber' || !chamber.rebootAvailable || state.run.pendingCore <= 0) return false;
  if (!chamber.rebootArmed) {
    chamber.rebootArmed = true;
    emit(state, 'REBOOT_ARMED', { pendingCore: state.run.pendingCore });
    return true;
  }
  return commitReboot(state);
}

export function commitReboot(state: GameState): boolean {
  const run = state.run;
  if (!run.coreChamber.rebootArmed || !run.coreChamber.rebootAvailable || run.pendingCore <= 0) return false;
  const reward = run.pendingCore;
  emit(state, 'REBOOT_COMMITTED', { run: state.meta.runIndex, reward });
  state.meta.core += reward;
  emit(state, 'CORE_GAINED', { amount: reward, total: state.meta.core });
  state.meta.runIndex += 1;
  state.run = createNewRun(state.meta);
  state.selection = { type: 'core-console' };
  emit(state, 'RUN_STARTED', { run: state.meta.runIndex, seed: state.run.seed });
  return true;
}

export function canMine(state: GameState, nodeId?: string): boolean {
  const character = state.run.character;
  const node = miningTarget(state, nodeId);
  return playerControlAvailable(state) && ['IDLE', 'MINING'].includes(character.state)
    && !character.swing && Boolean(node && Math.abs(node.x - character.x) <= PLAYER_MINE_REACH);
}

export function canRequestMine(state: GameState, nodeId?: string): boolean {
  if (!playerControlAvailable(state)) return false;
  const node = miningTarget(state, nodeId);
  if (!node) return false;
  if (canMine(state, node.id)) return true;
  const character = state.run.character;
  if (character.targetNodeId !== node.id) return false;
  if (character.state === 'MINING' && character.swing) return SWING.total - character.swing.elapsed <= MINE_INPUT_BUFFER + 0.000001;
  return character.state === 'MOVING_TO_NODE'
    && Math.abs(character.x - nodeDestination(node)) / Math.max(1, character.moveSpeed) <= MINE_INPUT_BUFFER;
}

export function mineBlockReason(state: GameState, nodeId?: string): string | null {
  if (canRequestMine(state, nodeId)) return null;
  if (state.run.elevator.travel) return 'TRAVELING';
  if (!playerControlAvailable(state)) return 'CHOOSE ANOMALY';
  const character = state.run.character;
  if (character.state === 'COLLECTING') return 'COLLECTING · MOVE TO CANCEL';
  if (character.state === 'LOADING') return 'LOADING · MOVE TO CANCEL';
  if (character.swing) return 'SWINGING';
  if (['MOVING_TO_NODE', 'MOVING_TO_POINT', 'RETURNING'].includes(character.state)) return 'MOVING';
  const node = nodeId ? currentFloor(state).nodes.find((candidate) => candidate.id === nodeId) : undefined;
  if (node?.access === 'REMOTE_ONLY') return 'NO WALKWAY';
  if (node && node.hp <= 0) return `DEPLETED · ${Math.ceil(node.respawnTimer)}s`;
  return 'MOVE CLOSER TO A VEIN';
}

export function cargoWeight(cargo: readonly LootStack[]): number { return cargo.reduce((sum, item) => sum + item.weight, 0); }
export function cargoValue(cargo: readonly LootStack[]): number { return cargo.reduce((sum, item) => sum + item.value, 0); }
export function carriedWeight(state: GameState): number { return cargoWeight(state.run.character.carried); }
export function porterWeight(state: GameState): number { return cargoWeight(state.run.porter.carried); }
export function drainEvents(state: GameState): GameEvent[] { return state.events.splice(0, state.events.length); }

export function effectiveTreasureChance(state: GameState, node: MiningNode): number {
  return treasureChance(state, node);
}

function updateResearch(state: GameState, dt: number): void {
  const active = state.run.research.active;
  if (!active) return;
  active.remaining = Math.max(0, active.remaining - dt);
  if (active.remaining > 0) return;
  if (!state.run.research.completed.includes(active.id)) state.run.research.completed.push(active.id);
  const completed = active.id;
  state.run.research.active = null;
  emit(state, 'RESEARCH_COMPLETED', { research: completed });
}

function updateFloorTravel(state: GameState, dt: number): boolean {
  const travel = state.run.elevator.travel;
  if (!travel) return false;
  travel.remaining = Math.max(0, travel.remaining - dt);
  const progress = 1 - travel.remaining / travel.duration;
  state.run.elevator.position = travel.viaSurface
    ? (progress < 0.5 ? progress * 2 : (1 - progress) * 2)
    : Math.sin(progress * Math.PI) * 0.16;
  if (travel.remaining > 0) return true;
  enterDepth(state, travel.to);
  return true;
}

function enterDepth(state: GameState, depth: DepthId): void {
  const run = state.run;
  run.depth.current = depth;
  run.elevator.travel = null;
  run.elevator.state = 'IDLE_BOTTOM';
  run.elevator.position = 0;
  run.elevator.stateTimer = 0;
  run.character.x = WORLD.elevatorX - 20;
  run.character.state = 'IDLE';
  run.character.targetNodeId = null;
  run.character.moveTargetX = null;
  run.character.swing = null;
  run.porter.holdForTravel = false;
  run.porter.x = WORLD.elevatorX + 28;
  run.porter.state = run.porter.enabled ? 'FIND_LOOT' : 'IDLE';
  run.porter.targetLootId = null;
  run.stats.floorTrips += 1;
  if (DEPTH_RANK[depth] > DEPTH_RANK[state.meta.bestDepth]) state.meta.bestDepth = depth;
  if (depth === 'D-030' && run.anomaly.options.length === 0) {
    run.anomaly.options = generateAnomalyOptions(run.seed, run.floors['D-030'].seed);
    emit(state, 'ANOMALY_OPTIONS_GENERATED', {
      a: run.anomaly.options[0] ?? '', b: run.anomaly.options[1] ?? '', c: run.anomaly.options[2] ?? '',
    });
    state.selection = { type: 'scanner' };
  }
  if (depth === 'D-100' && !run.coreChamber.discovered) {
    run.coreChamber.discovered = true;
    emit(state, 'CORE_CHAMBER_DISCOVERED', { depth });
  }
  emit(state, 'DEPTH_ENTERED', { depth, floorSeed: run.floors[depth].seed });
}

function generateAnomalyOptions(runSeed: number, floorSeed: number): AnomalyId[] {
  const pool = [...ANOMALY_POOL];
  let seed = hashSeed(runSeed ^ floorSeed ^ 0xa30a1);
  for (let i = pool.length - 1; i > 0; i -= 1) {
    seed = hashSeed(seed ^ i);
    const j = seed % (i + 1);
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  return pool.slice(0, 3);
}

function applyProtocolToCurrentRun(state: GameState, id: CoreProtocolId): void {
  const run = state.run;
  if (id === 'EXPERIENCED_HANDS') {
    run.tool = { id: 'player-tool', slot: 'TOOL', level: 2, name: 'Steel Pickaxe', damage: PLAYER_TOOL_DAMAGE[2] };
    run.automation.autoSwing = { unlocked: true, enabled: true };
  } else if (id === 'CARGO_MEMORY') {
    run.porter.enabled = true;
    run.porter.state = 'FIND_LOOT';
  } else if (id === 'VETERAN_ELEVATOR') {
    run.automation.autoDispatch = { unlocked: true, enabled: true };
  } else if (id === 'SURVEY_ARCHIVE' && !run.research.completed.includes('DEEP_SURVEY')) {
    run.research.completed.push('DEEP_SURVEY');
  }
  applyEffectiveParameters(state);
}

function applyEffectiveParameters(state: GameState): void {
  const modifiers = getModifiers(state);
  state.run.character.moveSpeed = modifiers.playerMoveSpeed;
  state.run.porter.moveSpeed = modifiers.porterMoveSpeed;
  state.run.elevator.maxLoad = modifiers.elevatorCapacity;
  state.run.elevator.moveSpeed = modifiers.elevatorSpeed;
}

function updateNodes(state: GameState, dt: number): void {
  const speed = getModifiers(state).respawnSpeedMultiplier;
  for (const floor of Object.values(state.run.floors)) {
    for (const node of floor.nodes) {
      if (node.hp > 0 || node.respawnTimer <= 0) continue;
      node.respawnTimer = Math.max(0, node.respawnTimer - dt * speed);
      if (node.respawnTimer === 0) node.hp = node.maxHp;
    }
  }
}

function updateElevator(state: GameState, dt: number): void {
  updateShipmentWait(state, dt);
  const elevator = state.run.elevator;
  elevator.stateTimer += dt;
  if (elevator.state === 'ASCENDING') {
    elevator.position = Math.min(1, elevator.position + elevator.moveSpeed * dt);
    if (elevator.position >= 1) {
      elevator.position = 1;
      elevator.state = 'UNLOADING';
      elevator.stateTimer = 0;
      emit(state, 'ELEVATOR_ARRIVE_SURFACE', { weight: cargoWeight(elevator.cargo), value: cargoValue(elevator.cargo) });
    }
    return;
  }
  if (elevator.state === 'UNLOADING') {
    if (elevator.stateTimer < UNLOAD_DURATION) return;
    appraiseCargo(state, [...elevator.cargo]);
    elevator.cargo = [];
    state.run.stats.elevatorTrips += 1;
    elevator.state = 'DESCENDING';
    elevator.stateTimer = 0;
    return;
  }
  if (elevator.state === 'DESCENDING') {
    elevator.position = Math.max(0, elevator.position - elevator.moveSpeed * dt);
    if (elevator.position <= 0) {
      elevator.position = 0;
      elevator.state = 'IDLE_BOTTOM';
      elevator.stateTimer = 0;
      if (elevator.rhythmBoostTrips > 0) elevator.rhythmBoostTrips -= 1;
      emit(state, 'ELEVATOR_RETURN');
    }
  }
}

function appraiseCargo(state: GameState, cargo: LootStack[]): void {
  appraisePhysicalCargo(state, cargo, (type, data) => emit(state, type, data));
  applyEffectiveParameters(state);
}

function updateCharacter(state: GameState, dt: number): void {
  const character = state.run.character;
  switch (character.state) {
    case 'MOVING_TO_POINT':
      if (typeof character.moveTargetX !== 'number' || !Number.isFinite(character.moveTargetX)
        || moveToward(character, character.moveTargetX, dt)) {
        character.moveTargetX = null;
        character.state = 'IDLE';
      }
      return;
    case 'MOVING_TO_NODE': {
      const node = findTargetNode(state);
      if (!node || node.hp <= 0) { character.state = 'IDLE'; return; }
      character.facing = node.x >= character.x ? 1 : -1;
      if (moveToward(character, nodeDestination(node), dt)) {
        character.state = 'MINING';
        emit(state, 'MINER_ARRIVE', { nodeId: node.id });
      }
      return;
    }
    case 'MINING': {
      const node = findTargetNode(state);
      if (!node) { character.state = 'IDLE'; character.swing = null; return; }
      if (!character.swing) return;
      character.swing.elapsed += dt;
      if (!character.swing.hitApplied && character.swing.elapsed >= SWING.hitAt) {
        character.swing.hitApplied = true;
        applyMiningHit(state, node);
      }
      if (character.swing.elapsed >= SWING.total) {
        character.swing = null;
        // The player decides when to collect and return, even before hiring a Porter.
      }
      return;
    }
    case 'COLLECTING':
      character.collectTimer += dt;
      if (character.collectTimer < COLLECT_DURATION) return;
      pickUpNearbyLoot(state);
      character.collectTimer = 0;
      character.state = 'IDLE';
      return;
    case 'RETURNING':
      character.facing = PLAYER_LOAD_X >= character.x ? 1 : -1;
      if (moveToward(character, PLAYER_LOAD_X, dt)) beginCharacterLoadingOrWait(state);
      return;
    case 'WAITING_FOR_ELEVATOR':
      // Recover old saves without forcing them back into an uninterruptible wait.
      character.state = 'IDLE';
      return;
    case 'LOADING':
      character.loadingTimer += dt;
      if (character.loadingTimer >= LOAD_DURATION) finishCharacterLoading(state);
      return;
    case 'IDLE':
      return;
  }
}

function updatePorter(state: GameState, dt: number): void {
  const porter = state.run.porter;
  if (!porter.enabled) return;
  if (porter.holdForTravel && porter.carried.length === 0 && porter.state !== 'LOADING') {
    porter.state = 'IDLE'; porter.targetLootId = null; return;
  }
  switch (porter.state) {
    case 'IDLE':
      porter.state = 'FIND_LOOT';
      return;
    case 'FIND_LOOT': {
      if (porter.carried.length > 0) { porter.state = 'RETURNING_TO_ELEVATOR'; return; }
      const target = findPorterTarget(state);
      if (!target) return;
      porter.targetLootId = target.id;
      porter.facing = target.x >= porter.x ? 1 : -1;
      porter.state = 'MOVING_TO_LOOT';
      emit(state, 'PORTER_JOB_ASSIGNED', { lootId: target.id, x: target.x, value: target.value, rarity: target.rarity });
      return;
    }
    case 'MOVING_TO_LOOT': {
      const target = findPorterTargetById(state);
      if (!target) { porter.targetLootId = null; porter.state = 'FIND_LOOT'; return; }
      porter.facing = target.x >= porter.x ? 1 : -1;
      if (moveToward(porter, target.x, dt)) { porter.state = 'COLLECTING'; porter.collectTimer = 0; }
      return;
    }
    case 'COLLECTING': {
      const target = findPorterTargetById(state);
      if (!target) { porter.targetLootId = null; porter.state = 'FIND_LOOT'; return; }
      porter.collectTimer += dt;
      if (porter.collectTimer < PORTER_COLLECT_DURATION) return;
      pickUpPorterLoot(state, target);
      porter.collectTimer = 0;
      porter.targetLootId = null;
      porter.state = porter.carried.length > 0 ? 'RETURNING_TO_ELEVATOR' : 'FIND_LOOT';
      porter.facing = PORTER_LOAD_X >= porter.x ? 1 : -1;
      return;
    }
    case 'RETURNING_TO_ELEVATOR':
      porter.facing = PORTER_LOAD_X >= porter.x ? 1 : -1;
      if (moveToward(porter, PORTER_LOAD_X, dt)) beginPorterLoadingOrWait(state);
      return;
    case 'WAITING_FOR_ELEVATOR':
      if (porter.carried.length === 0) { porter.state = 'FIND_LOOT'; return; }
      if (state.run.elevator.state === 'IDLE_BOTTOM' && canAnyFit(porter.carried, availableElevatorCapacity(state))) beginPorterLoading(state);
      return;
    case 'LOADING':
      porter.loadingTimer += dt;
      if (porter.loadingTimer >= PORTER_LOAD_DURATION) finishPorterLoading(state);
      return;
  }
}

function updateAutomation(state: GameState): void {
  const run = state.run;
  if (run.depth.current === 'D-030' && !run.anomaly.selected) return;
  if (run.automation.autoSwing.unlocked && run.automation.autoSwing.enabled && canStartSwing(state)) {
    const node = findTargetNode(state)!;
    emit(state, 'AUTO_SWING_TRIGGER', { nodeId: node.id });
    beginSwing(state, node);
  }
  if (!run.automation.autoDispatch.unlocked || !run.automation.autoDispatch.enabled || !canDispatchElevator(state)) return;
  const decision = shipmentDecision(state);
  if (!decision.send) return;
  emit(state, 'AUTO_DISPATCH_TRIGGER', { weight: cargoWeight(run.elevator.cargo), threshold: decision.threshold, reason: decision.reason });
  dispatchElevator(state);
}

function canStartSwing(state: GameState): boolean {
  const character = state.run.character;
  return character.state === 'MINING' && Boolean(character.targetNodeId)
    && canMine(state, character.targetNodeId ?? undefined);
}

function beginSwing(state: GameState, node: MiningNode): boolean {
  if (!canStartSwing(state)) return false;
  state.run.character.swing = { elapsed: 0, hitApplied: false };
  state.run.character.facing = node.x >= state.run.character.x ? 1 : -1;
  emit(state, 'MINER_SWING_START', { nodeId: node.id });
  return true;
}

function applyMiningHit(state: GameState, node: MiningNode): void {
  const damage = playerMiningDamage(state, node);
  emit(state, 'MINER_SWING_HIT', { nodeId: node.id, damage });
  node.hp = Math.max(0, node.hp - damage);
  emit(state, 'NODE_DAMAGE', { nodeId: node.id, hp: node.hp, maxHp: node.maxHp });
  if (node.hp > 0) return;
  node.respawnTimer = node.respawnDelay;
  emit(state, 'NODE_BREAK', { nodeId: node.id, depth: state.run.depth.current });
  spawnLoot(state, node);
}

function spawnLoot(state: GameState, node: MiningNode): void {
  const floor = currentFloor(state);
  floor.loot.push(...rollMiningLoot(state, floor, node, (type, data) => emit(state, type, data)));
}

function pickUpNearbyLoot(state: GameState): void {
  const character = state.run.character;
  const nearby = nearbyPlayerLoot(state)
    .sort((a, b) => RARITY_RANK[b.rarity] - RARITY_RANK[a.rarity] || a.id.localeCompare(b.id));
  for (const item of nearby) {
    if (cargoWeight(character.carried) + item.weight > character.backpackCapacity + 0.001) continue;
    character.carried.push(item);
    removeFloorLoot(state, item.id);
    emit(state, 'LOOT_PICKUP', { id: item.id, name: item.name, weight: item.weight, value: item.value, rarity: item.rarity });
  }
}

function findPorterTarget(state: GameState): LootStack | undefined {
  const priority = state.run.research.completed.includes('PRIORITY_CARGO_TAG');
  return [...currentFloor(state).loot].sort((a, b) => {
    if (priority) {
      const category = cargoPriority(b.category) - cargoPriority(a.category);
      if (category) return category;
    }
    const rarity = RARITY_RANK[b.rarity] - RARITY_RANK[a.rarity];
    if (rarity) return rarity;
    const distance = Math.abs(a.x - state.run.porter.x) - Math.abs(b.x - state.run.porter.x);
    return distance || a.id.localeCompare(b.id);
  })[0];
}

function cargoPriority(category: LootCategory): number {
  if (category === 'CORE') return 5;
  if (category === 'RESEARCH') return 4;
  if (category === 'RELIC') return 3;
  if (category === 'FOSSIL' || category === 'ANOMALY') return 2;
  return 1;
}

function findPorterTargetById(state: GameState): LootStack | undefined {
  const id = state.run.porter.targetLootId;
  return id ? currentFloor(state).loot.find((item) => item.id === id) : undefined;
}

function pickUpPorterLoot(state: GameState, target: LootStack): void {
  const porter = state.run.porter;
  const candidates = [target, ...currentFloor(state).loot.filter((item) => item.id !== target.id && Math.abs(item.x - target.x) <= 16)
    .sort((a, b) => cargoPriority(b.category) - cargoPriority(a.category) || RARITY_RANK[b.rarity] - RARITY_RANK[a.rarity] || a.id.localeCompare(b.id))];
  for (const item of candidates) {
    if (!currentFloor(state).loot.some((candidate) => candidate.id === item.id)) continue;
    if (cargoWeight(porter.carried) + item.weight > porter.capacity + 0.001) continue;
    porter.carried.push(item);
    removeFloorLoot(state, item.id);
    emit(state, 'PORTER_PICKUP', { id: item.id, name: item.name, weight: item.weight, value: item.value, rarity: item.rarity });
  }
}

function removeFloorLoot(state: GameState, id: string): void {
  const floor = currentFloor(state);
  const index = floor.loot.findIndex((candidate) => candidate.id === id);
  if (index >= 0) floor.loot.splice(index, 1);
}

function beginCharacterLoadingOrWait(state: GameState): void {
  if (state.run.elevator.state === 'IDLE_BOTTOM' && canAnyFit(state.run.character.carried, availableElevatorCapacity(state))) beginCharacterLoading(state);
  else state.run.character.state = 'IDLE';
}
function beginCharacterLoading(state: GameState): void {
  state.run.character.state = 'LOADING';
  state.run.character.loadingTimer = 0;
  state.run.elevator.state = 'LOADING';
  state.run.elevator.stateTimer = 0;
}
function finishCharacterLoading(state: GameState): void {
  const { deposited, remaining } = depositIntoElevator(state, state.run.character.carried);
  state.run.character.carried = remaining;
  state.run.character.loadingTimer = 0;
  state.run.elevator.state = 'IDLE_BOTTOM';
  state.run.elevator.stateTimer = 0;
  if (deposited.length > 0) {
    state.run.stats.playerDeposits += 1;
    emit(state, 'LOOT_DEPOSIT', { carrier: 'PLAYER', items: deposited.length, weight: cargoWeight(deposited), estimatedValue: cargoValue(deposited) });
  }
  state.run.character.state = 'IDLE';
}
function beginPorterLoadingOrWait(state: GameState): void {
  if (state.run.elevator.state === 'IDLE_BOTTOM' && canAnyFit(state.run.porter.carried, availableElevatorCapacity(state))) beginPorterLoading(state);
  else state.run.porter.state = 'WAITING_FOR_ELEVATOR';
}
function beginPorterLoading(state: GameState): void {
  state.run.porter.state = 'LOADING';
  state.run.porter.loadingTimer = 0;
  state.run.elevator.state = 'LOADING';
  state.run.elevator.stateTimer = 0;
}
function finishPorterLoading(state: GameState): void {
  const { deposited, remaining } = depositIntoElevator(state, state.run.porter.carried);
  state.run.porter.carried = remaining;
  state.run.porter.loadingTimer = 0;
  state.run.elevator.state = 'IDLE_BOTTOM';
  state.run.elevator.stateTimer = 0;
  if (deposited.length > 0) {
    state.run.stats.porterDeposits += 1;
    const payload = { carrier: 'PORTER', items: deposited.length, weight: cargoWeight(deposited), estimatedValue: cargoValue(deposited) };
    emit(state, 'PORTER_DEPOSIT', payload);
    emit(state, 'LOOT_DEPOSIT', payload);
  }
  state.run.porter.state = remaining.length > 0 ? 'WAITING_FOR_ELEVATOR' : 'FIND_LOOT';
}

function depositIntoElevator(state: GameState, carried: readonly LootStack[]): { deposited: LootStack[]; remaining: LootStack[] } {
  let remainingCapacity = availableElevatorCapacity(state);
  const deposited: LootStack[] = [];
  const remaining: LootStack[] = [];
  for (const item of carried) {
    if (item.weight <= remainingCapacity + 0.001) {
      deposited.push(item);
      remainingCapacity -= item.weight;
    } else remaining.push(item);
  }
  state.run.elevator.cargo.push(...deposited);
  return { deposited, remaining };
}

export function canDispatchElevator(state: GameState): boolean {
  const run = state.run;
  return run.elevator.state === 'IDLE_BOTTOM' && !run.elevator.travel && run.elevator.cargo.length > 0
    && run.character.state !== 'LOADING' && run.porter.state !== 'LOADING';
}

function dispatchElevator(state: GameState): boolean {
  if (!canDispatchElevator(state)) return false;
  const run = state.run;
  const loadRatio = cargoWeight(run.elevator.cargo) / Math.max(0.01, run.elevator.maxLoad);
  if (state.meta.passives.active.includes('ELEVATOR_RHYTHM') && loadRatio >= 0.85) run.elevator.rhythmBoostTrips = 1;
  applyEffectiveParameters(state);
  run.elevator.state = 'ASCENDING';
  run.elevator.stateTimer = 0;
  emit(state, 'ELEVATOR_DEPART', { weight: cargoWeight(run.elevator.cargo), value: cargoValue(run.elevator.cargo), rhythm: run.elevator.rhythmBoostTrips > 0 });
  return true;
}

function liftClearForTravel(state: GameState): boolean {
  const run = state.run;
  return run.elevator.state === 'IDLE_BOTTOM'
    && !run.elevator.travel
    && run.elevator.cargo.length === 0
    && run.character.carried.length === 0
    && run.porter.carried.length === 0
    && run.character.state !== 'LOADING'
    && run.porter.state !== 'LOADING';
}

function availableElevatorCapacity(state: GameState): number {
  return Math.max(0, state.run.elevator.maxLoad - cargoWeight(state.run.elevator.cargo));
}
function canAnyFit(items: readonly LootStack[], capacity: number): boolean { return items.some((item) => item.weight <= capacity + 0.001); }
function moveToward(worker: WorkerBody, destination: number, dt: number): boolean {
  const delta = destination - worker.x;
  const distance = Math.abs(delta);
  if (distance <= 0.5) { worker.x = destination; return true; }
  const step = worker.moveSpeed * dt;
  if (step >= distance) { worker.x = destination; return true; }
  worker.x += Math.sign(delta) * step;
  return false;
}
function nodeDestination(node: MiningNode): number { return node.x < WORLD.elevatorX ? node.x + NODE_STOP_DISTANCE : node.x - NODE_STOP_DISTANCE; }
function findTargetNode(state: GameState): MiningNode | undefined {
  const id = state.run.character.targetNodeId;
  return id ? currentFloor(state).nodes.find((node) => node.id === id) : undefined;
}
function spendScrap(state: GameState, cost: number): boolean {
  if (state.run.scrap < cost) return false;
  state.run.scrap -= cost;
  return true;
}
function emit(state: GameState, type: GameEventType, data?: Record<string, string | number | boolean>): void {
  const event: GameEvent = { id: state.nextEventId++, type, at: state.elapsed, ...(data ? { data } : {}) };
  state.events.push(event);
  state.eventHistory.push(event);
  if (state.eventHistory.length > 220) state.eventHistory.splice(0, state.eventHistory.length - 220);
}
