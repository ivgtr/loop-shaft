import {
  BORE_BUILD_PROGRESS,
  BORE_CYCLE_DURATION,
  BORE_DAMAGE,
  BORE_HIT_AT,
  BORE_INSTALL_COST,
  BORE_OUTPUT_CAPACITY,
  CARGO_HUB_X,
  D250_EXTENSION_COST,
  D400_EXTENSION_COST,
  D650_SHAFT_COST,
  DEEP_COMPONENTS_REQUIRED,
  ENGINEER_WORK_RATE,
  FREIGHT_BUILD_PROGRESS,
  FREIGHT_INSTALL_COST,
  FREIGHT_LOAD_DURATION,
  FREIGHT_TRAVEL_DURATION,
  FREIGHT_UNLOAD_DURATION,
  LOOT,
  RAIL_BUILD_PROGRESS,
  RAIL_CAPACITY,
  RAIL_HUB_BUFFER,
  RAIL_INSTALL_COST,
  RAIL_LOAD_DURATION,
  RAIL_PARTS_REQUIRED,
  RAIL_STOP_BUFFER,
  RAIL_STOP_X,
  RAIL_TRAVEL_DURATION,
  RAIL_UNLOAD_DURATION,
  WORLD,
} from './config';
import { deeperDepth } from './depth';
import { appraisePhysicalCargo } from './appraisal';
import { getModifiers } from './modifiers';
import { finishingDamage, maximumMiningDropWeight, rollMiningLoot } from './mining';
import { hashSeed, nextRandom } from './rng';
import { cargoWeight } from './simulation';
import type {
  CargoHub,
  DepthId,
  EngineerJob,
  FreightPriority,
  GameEvent,
  GameEventType,
  GameState,
  LootKind,
  LootStack,
  MiningNode,
  RailCart,
  RailPriority,
  RemoteBore,
  TransportLine,
} from './types';

const RARITY_RANK = { COMMON: 0, UNCOMMON: 1, RARE: 2, EPIC: 3, RELIC: 4, ANOMALY: 5 } as const;
const D250_LINE = 'rail-d250';
const D250_CART = 'cart-d250';
const D250_HUB = 'hub-d250';
const D400_LINE = 'line-d400';
const D400_CART = 'cart-d400';
const D400_HUB = 'hub-d400';

export function deepFloor(state: GameState, depth: DepthId) {
  return state.run.floors[depth];
}

export function isDepthUnlocked(state: GameState, depth: DepthId): boolean {
  return state.run.depth.unlocked.includes(depth);
}

export function isRailReady(state: GameState, depth: DepthId = 'D-250'): boolean {
  return state.run.logistics.lines.some((line) => line.depth === depth && line.state === 'READY');
}

export function localCargoDropX(state: GameState, depth: DepthId): number {
  if ((depth === 'D-250' || depth === 'D-400') && state.run.logistics.lines.some((line) => line.depth === depth)) return RAIL_STOP_X;
  return WORLD.elevatorX + 48;
}

export function canPlayerAccessNode(node: MiningNode): boolean {
  return node.access !== 'REMOTE_ONLY';
}

export function canUnlockD250(state: GameState): boolean {
  const run = state.run;
  if (run.deepProgress.d250Unlocked || !isDepthUnlocked(state, 'D-180')) return false;
  if (!run.deepProgress.lostSampleDelivered || !run.research.completed.includes('LOST_SURVEY')) return false;
  if (run.scrap < D250_EXTENSION_COST || run.elevator.state !== 'IDLE_BOTTOM' || run.elevator.cargo.length > 0) return false;
  return !run.elevator.travel && !run.phase5.cargo.route;
}

export function unlockD250(state: GameState): boolean {
  if (!canUnlockD250(state)) return false;
  state.run.scrap -= D250_EXTENSION_COST;
  unlockDepth(state, 'D-250', 'D250_UNLOCKED');
  state.run.deepProgress.d250Unlocked = true;
  state.run.deepProgress.railBlueprint = true;
  return true;
}

export function canStartRailConstruction(state: GameState): boolean {
  const run = state.run;
  if (!run.deepProgress.d250Unlocked || run.logistics.lines.some((line) => line.id === D250_LINE)) return false;
  if (!run.research.completed.includes('RAIL_LOGISTICS')) return false;
  if (!run.deepProgress.railBlueprint && run.deepProgress.railPartsDelivered < RAIL_PARTS_REQUIRED) return false;
  return run.scrap >= RAIL_INSTALL_COST && engineerAvailable(state);
}

export function startRailConstruction(state: GameState): boolean {
  if (!canStartRailConstruction(state)) return false;
  state.run.scrap -= RAIL_INSTALL_COST;
  ensureEngineerUnlocked(state);
  const line = makeRailLine(D250_LINE, 'D-250', 'Lost Depot Stop', 'Lost Cargo Hub', 'BULK');
  line.state = 'BUILDING';
  line.buildProgress = state.run.deepProgress.railBlueprint ? RAIL_BUILD_PROGRESS * 0.65 : 0;
  state.run.logistics.lines.push(line);
  state.run.logistics.railCarts.push(makeCart(D250_CART, D250_LINE));
  state.run.logistics.cargoHubs.push(makeHub(D250_HUB, 'D-250'));
  assignEngineerJob(state, {
    id: 'job-rail-d250', kind: 'RAIL_INSTALL', targetId: D250_LINE, depth: 'D-250',
    progress: line.buildProgress, requiredProgress: RAIL_BUILD_PROGRESS,
  });
  return true;
}

export function setRailPriority(state: GameState, lineId: string, priority: RailPriority): boolean {
  const line = state.run.logistics.lines.find((candidate) => candidate.id === lineId);
  if (!line) return false;
  line.priority = priority;
  return true;
}

export function canStartFreightConstruction(state: GameState): boolean {
  const run = state.run;
  if (run.logistics.freightCage.state !== 'UNBUILT' || !isRailReady(state, 'D-250')) return false;
  if (!run.research.completed.includes('FREIGHT_ARCHITECTURE')) return false;
  return run.scrap >= FREIGHT_INSTALL_COST && engineerAvailable(state);
}

export function startFreightConstruction(state: GameState): boolean {
  if (!canStartFreightConstruction(state)) return false;
  state.run.scrap -= FREIGHT_INSTALL_COST;
  ensureEngineerUnlocked(state);
  const cage = state.run.logistics.freightCage;
  cage.buildProgress = state.run.deepProgress.freightBlueprint ? FREIGHT_BUILD_PROGRESS : 0;
  cage.requiredBuildProgress = FREIGHT_BUILD_PROGRESS;
  if (state.run.deepProgress.freightBlueprint) {
    cage.state = 'IDLE';
    state.run.deepProgress.instrumentation.freightUnlockedAt = state.elapsed;
    emit(state, 'ENGINEER_INSTALL_COMPLETED', { kind: 'FREIGHT_INSTALL', targetId: 'freight-cage', archivedBlueprint: true });
    return true;
  }
  assignEngineerJob(state, {
    id: 'job-freight', kind: 'FREIGHT_INSTALL', targetId: 'freight-cage', depth: 'D-250',
    progress: 0, requiredProgress: FREIGHT_BUILD_PROGRESS,
  });
  return true;
}

export function setFreightPriority(state: GameState, priority: FreightPriority): boolean {
  if (state.run.logistics.freightCage.state === 'UNBUILT') return false;
  state.run.logistics.freightCage.priority = priority;
  return true;
}

export function canUnlockD400(state: GameState): boolean {
  const run = state.run;
  if (run.deepProgress.d400Unlocked || !run.deepProgress.d250Unlocked) return false;
  if (!run.deepProgress.nullSampleDelivered || !run.research.completed.includes('NULL_GEOMETRY')) return false;
  if (run.logistics.freightCage.state === 'UNBUILT') return false;
  return run.scrap >= D400_EXTENSION_COST;
}

export function unlockD400(state: GameState): boolean {
  if (!canUnlockD400(state)) return false;
  state.run.scrap -= D400_EXTENSION_COST;
  state.run.deepProgress.d400Unlocked = true;
  state.run.deepProgress.boreBlueprint = true;
  unlockDepth(state, 'D-400', 'D400_UNLOCKED');
  return true;
}

export function canInstallBore(state: GameState, siteId: string): boolean {
  const run = state.run;
  if (!run.deepProgress.d400Unlocked || !run.research.completed.includes('REMOTE_BORE_CONTROL')) return false;
  const node = run.floors['D-400'].nodes.find((candidate) => candidate.id === siteId);
  if (!node || node.access !== 'REMOTE_ONLY') return false;
  if (run.deepAutomation.bores.some((bore) => bore.siteId === siteId)) return false;
  return run.scrap >= BORE_INSTALL_COST && engineerAvailable(state);
}

export function installBore(state: GameState, siteId: string): boolean {
  if (!canInstallBore(state, siteId)) return false;
  state.run.scrap -= BORE_INSTALL_COST;
  ensureEngineerUnlocked(state);
  ensureD400Line(state);
  const bore: RemoteBore = {
    id: `bore-${siteId}`,
    depth: 'D-400',
    siteId,
    targetNodeId: siteId,
    state: 'INSTALLING',
    cycleProgress: 0,
    cycleDuration: BORE_CYCLE_DURATION,
    hitAt: BORE_HIT_AT,
    damage: BORE_DAMAGE,
    outputBuffer: [],
    maxOutputWeight: BORE_OUTPUT_CAPACITY,
    connectedLineId: D400_LINE,
    installProgress: state.run.deepProgress.boreBlueprint ? BORE_BUILD_PROGRESS * 0.6 : 0,
    requiredInstallProgress: BORE_BUILD_PROGRESS,
  };
  state.run.deepAutomation.bores.push(bore);
  emit(state, 'BORE_INSTALL_STARTED', { boreId: bore.id, siteId, depth: 'D-400' });
  assignEngineerJob(state, {
    id: `job-${bore.id}`, kind: 'BORE_INSTALL', targetId: bore.id, depth: 'D-400',
    progress: bore.installProgress, requiredProgress: BORE_BUILD_PROGRESS,
  });
  return true;
}

export function canStartD650Construction(state: GameState): boolean {
  const run = state.run;
  if (run.deepProgress.d650Unlocked || run.deepProgress.shaftConstructionStarted || !run.deepProgress.d400Unlocked) return false;
  if (!run.research.completed.includes('DEEP_SHAFT_GEOMETRY')) return false;
  if (run.deepProgress.deepComponentsDelivered < DEEP_COMPONENTS_REQUIRED) return false;
  return run.scrap >= D650_SHAFT_COST && engineerAvailable(state);
}

export function startD650Construction(state: GameState): boolean {
  if (!canStartD650Construction(state)) return false;
  state.run.scrap -= D650_SHAFT_COST;
  state.run.deepProgress.shaftConstructionStarted = true;
  ensureEngineerUnlocked(state);
  assignEngineerJob(state, {
    id: 'job-shaft-d650', kind: 'SHAFT_EXTENSION', targetId: 'shaft-d650', depth: 'D-400',
    progress: 0, requiredProgress: 16,
  });
  return true;
}

export function updateDeepGame(state: GameState, dt: number): void {
  const step = Math.max(0, Math.min(dt, 0.1));
  updateEngineer(state, step);
  updateRailInputs(state);
  for (const line of state.run.logistics.lines) updateTransportLine(state, line, step);
  updateHubRouting(state);
  updateFreight(state, step);
  updateBores(state, step);
}

export function processDeepEvents(state: GameState, events: readonly GameEvent[]): void {
  for (const event of events) {
    if (event.type === 'NODE_BREAK') handleDeepNodeBreak(state, event);
    if (event.type === 'LOOT_APPRAISE') handleDeepAppraisal(state, String(event.data?.id ?? ''));
    if (event.type === 'RESEARCH_COMPLETED') {
      const id = String(event.data?.research ?? '');
      if (id in state.run.deepProgress.instrumentation.researchUnlockedAt === false) {
        state.run.deepProgress.instrumentation.researchUnlockedAt[id as keyof typeof state.run.deepProgress.instrumentation.researchUnlockedAt] = state.elapsed;
      }
    }
  }
}

function handleDeepNodeBreak(state: GameState, event: GameEvent): void {
  const depth = resolveEventDepth(state, event);
  const nodeId = String(event.data?.nodeId ?? '');
  if (depth === 'D-180' && !state.run.deepProgress.lostSignalFound && state.meta.runIndex >= 3 && state.run.research.completed.includes('SALVAGE_ANALYSIS')) {
    const floor = state.run.floors['D-180'];
    const node = floor.nodes.find((candidate) => candidate.id === nodeId) ?? floor.nodes[1];
    if (node) {
      const sample = createDeepLoot(state, 'LOST_SIGNAL_SAMPLE', node.x + 6, 'D-180');
      floor.loot.push(sample);
      state.run.deepProgress.lostSignalFound = true;
      emit(state, 'D250_SIGNAL_FOUND', { id: sample.id, depth: 'D-180', nodeId: node.id });
      emitLootSpawn(state, sample, node.id);
    }
    return;
  }
  if (depth === 'D-250') {
    const floor = state.run.floors['D-250'];
    if (nodeId === 'lost-depot' && state.run.deepProgress.railPartsDelivered < RAIL_PARTS_REQUIRED && !cargoExists(state, 'RAIL_PARTS')) {
      const item = createDeepLoot(state, 'RAIL_PARTS', floor.nodes[0]?.x ?? 108, 'D-250');
      floor.loot.push(item);
      emitLootSpawn(state, item, nodeId);
    }
    if (nodeId === 'forgotten-terminal' && !state.run.deepProgress.nullSampleDelivered && !cargoExists(state, 'NULL_SAMPLE') && isRailReady(state, 'D-250')) {
      const item = createDeepLoot(state, 'NULL_SAMPLE', floor.nodes[2]?.x ?? 446, 'D-250');
      floor.loot.push(item);
      emitLootSpawn(state, item, nodeId);
    }
    if (nodeId === 'hanging-vein' && ((floor.nodes[1]?.minedCount ?? 0) === 1 || nextRandom(state) < 0.12)) spawnDeepEquipmentCrate(state, floor.nodes[1]!, 'D-250');
    return;
  }
  if (depth === 'D-400' && nodeId === 'fracture-well' && state.run.deepProgress.deepComponentsDelivered < DEEP_COMPONENTS_REQUIRED && !cargoExists(state, 'DEEP_COMPONENT')) {
    const floor = state.run.floors['D-400'];
    const item = createDeepLoot(state, 'DEEP_COMPONENT', floor.nodes[2]?.x ?? 444, 'D-400');
    const bore = state.run.deepAutomation.bores.find((candidate) => candidate.siteId === nodeId);
    if (bore && cargoWeight(bore.outputBuffer) + item.weight <= bore.maxOutputWeight) bore.outputBuffer.push(item);
    else floor.loot.push(item);
    emitLootSpawn(state, item, nodeId);
  }
}

function handleDeepAppraisal(state: GameState, id: string): void {
  const event = [...state.eventHistory].reverse().find((candidate) => candidate.type === 'LOOT_APPRAISE' && candidate.data?.id === id);
  const kind = event?.data?.kind as LootKind | undefined;
  if (kind === 'LOST_SIGNAL_SAMPLE') state.run.deepProgress.lostSampleDelivered = true;
  if (kind === 'RAIL_PARTS') state.run.deepProgress.railPartsDelivered += 1;
  if (kind === 'NULL_SAMPLE') state.run.deepProgress.nullSampleDelivered = true;
  if (kind === 'DEEP_COMPONENT') state.run.deepProgress.deepComponentsDelivered += 1;
}

function updateEngineer(state: GameState, dt: number): void {
  const engineer = state.run.engineer;
  if (!engineer.unlocked || !engineer.job) return;
  const job = engineer.job;
  if (engineer.state === 'MOVING_TO_MACHINE') {
    const targetX = jobTargetX(state, job);
    const delta = targetX - engineer.x;
    const step = engineer.moveSpeed * dt;
    if (Math.abs(delta) <= step + 0.5) {
      engineer.x = targetX;
      engineer.state = job.kind === 'JAM_RECOVERY' ? 'REPAIRING' : 'INSTALLING';
      emit(state, 'ENGINEER_INSTALL_STARTED', { jobId: job.id, kind: job.kind, targetId: job.targetId, depth: job.depth });
    } else engineer.x += Math.sign(delta) * step;
    return;
  }
  if (engineer.state !== 'INSTALLING' && engineer.state !== 'REPAIRING') return;
  job.progress = Math.min(job.requiredProgress, job.progress + dt * ENGINEER_WORK_RATE);
  mirrorEngineerProgress(state, job);
  if (job.progress < job.requiredProgress) return;
  completeEngineerJob(state, job);
  emit(state, 'ENGINEER_INSTALL_COMPLETED', { jobId: job.id, kind: job.kind, targetId: job.targetId, depth: job.depth });
  engineer.job = null;
  engineer.state = 'IDLE';
}

function assignEngineerJob(state: GameState, job: EngineerJob): void {
  const engineer = state.run.engineer;
  engineer.job = job;
  engineer.assignedDepth = job.depth;
  engineer.x = WORLD.elevatorX + 14;
  engineer.state = 'MOVING_TO_MACHINE';
  emit(state, 'ENGINEER_JOB_ASSIGNED', { jobId: job.id, kind: job.kind, targetId: job.targetId, depth: job.depth });
}

function mirrorEngineerProgress(state: GameState, job: EngineerJob): void {
  if (job.kind === 'RAIL_INSTALL') {
    const line = state.run.logistics.lines.find((candidate) => candidate.id === job.targetId);
    if (line) line.buildProgress = job.progress;
  } else if (job.kind === 'FREIGHT_INSTALL') state.run.logistics.freightCage.buildProgress = job.progress;
  else if (job.kind === 'BORE_INSTALL') {
    const bore = state.run.deepAutomation.bores.find((candidate) => candidate.id === job.targetId);
    if (bore) bore.installProgress = job.progress;
  }
}

function completeEngineerJob(state: GameState, job: EngineerJob): void {
  if (job.kind === 'RAIL_INSTALL') {
    const line = state.run.logistics.lines.find((candidate) => candidate.id === job.targetId);
    if (line) {
      line.state = 'READY';
      line.buildProgress = line.requiredBuildProgress;
      state.run.deepProgress.instrumentation.railUnlockedAt ??= state.elapsed;
      emit(state, 'TRANSPORT_LINE_READY', { lineId: line.id, depth: line.depth, type: line.type });
    }
    return;
  }
  if (job.kind === 'FREIGHT_INSTALL') {
    const cage = state.run.logistics.freightCage;
    cage.state = 'IDLE';
    cage.buildProgress = cage.requiredBuildProgress;
    state.run.deepProgress.instrumentation.freightUnlockedAt ??= state.elapsed;
    return;
  }
  if (job.kind === 'BORE_INSTALL') {
    const bore = state.run.deepAutomation.bores.find((candidate) => candidate.id === job.targetId);
    const line = state.run.logistics.lines.find((candidate) => candidate.id === D400_LINE);
    if (bore) {
      bore.installProgress = bore.requiredInstallProgress;
      bore.state = 'IDLE';
      emit(state, 'BORE_INSTALL_COMPLETED', { boreId: bore.id, siteId: bore.siteId, depth: bore.depth });
    }
    if (line) {
      line.state = 'READY';
      line.buildProgress = line.requiredBuildProgress;
      emit(state, 'TRANSPORT_LINE_READY', { lineId: line.id, depth: line.depth, type: line.type });
    }
    state.run.deepProgress.instrumentation.boreUnlockedAt ??= state.elapsed;
    return;
  }
  if (job.kind === 'JAM_RECOVERY') {
    const line = state.run.logistics.lines.find((candidate) => candidate.id === job.targetId);
    const cart = line ? cartForLine(state, line.id) : undefined;
    if (line && cart) {
      line.state = 'READY';
      line.jamReason = null;
      cart.state = cart.cargo.length > 0 ? 'UNLOADING' : 'IDLE_AT_STOP';
      emit(state, 'CARGO_JAM_RECOVERED', { lineId: line.id, depth: line.depth });
    }
    return;
  }
  if (job.kind === 'SHAFT_EXTENSION') {
    state.run.deepProgress.d650Unlocked = true;
    unlockDepth(state, 'D-650', 'D650_UNLOCKED');
    state.run.deepProgress.instrumentation.d650ReachedAt = state.elapsed;
  }
}

function updateRailInputs(state: GameState): void {
  for (const line of state.run.logistics.lines) {
    if (line.state !== 'READY') continue;
    if (line.depth === 'D-400') {
      for (const bore of state.run.deepAutomation.bores.filter((candidate) => candidate.connectedLineId === line.id)) {
        moveCargoIntoBuffer(bore.outputBuffer, line.inputBuffer, line.maxInputWeight, () => true, state, line);
      }
    }
    const floor = state.run.floors[line.depth];
    moveCargoIntoBuffer(floor.cargo, line.inputBuffer, line.maxInputWeight, (item) => railAccepts(item, line.priority), state, line);
  }
}

function updateTransportLine(state: GameState, line: TransportLine, dt: number): void {
  if (line.state === 'BUILDING') return;
  const cart = cartForLine(state, line.id);
  const hub = hubForDepth(state, line.depth);
  if (!cart || !hub) return;
  if (line.state === 'JAMMED' || cart.state === 'JAMMED') {
    maybeAssignJamRecovery(state, line);
    return;
  }
  switch (cart.state) {
    case 'IDLE_AT_STOP':
      cart.position = 0;
      if (line.inputBuffer.length > 0) {
        cart.state = 'LOADING';
        cart.stateTimer = 0;
        emit(state, 'RAIL_CART_LOADING', { cartId: cart.id, lineId: line.id, depth: line.depth });
      }
      return;
    case 'LOADING':
      cart.stateTimer += dt;
      if (cart.stateTimer < RAIL_LOAD_DURATION) return;
      loadCart(line, cart);
      if (cart.cargo.length === 0) { cart.state = 'IDLE_AT_STOP'; return; }
      cart.state = 'TRAVELING_TO_HUB';
      cart.stateTimer = 0;
      emit(state, 'RAIL_CART_DEPARTED', { cartId: cart.id, lineId: line.id, depth: line.depth, items: cart.cargo.length });
      return;
    case 'TRAVELING_TO_HUB':
      cart.stateTimer += dt;
      cart.position = Math.min(1, cart.stateTimer / RAIL_TRAVEL_DURATION);
      if (cart.stateTimer < RAIL_TRAVEL_DURATION) return;
      cart.position = 1;
      cart.state = 'UNLOADING';
      cart.stateTimer = 0;
      emit(state, 'RAIL_CART_ARRIVED', { cartId: cart.id, lineId: line.id, depth: line.depth, hubId: hub.id });
      return;
    case 'UNLOADING':
      if (cargoWeight(hub.buffer) + cargoWeight(cart.cargo) > hub.maxWeight + 0.001) {
        jamLine(state, line, cart, 'CARGO_HUB_FULL');
        return;
      }
      cart.stateTimer += dt;
      if (cart.stateTimer < RAIL_UNLOAD_DURATION) return;
      hub.buffer.push(...cart.cargo.splice(0));
      emit(state, 'RAIL_CARGO_UNLOADED', { cartId: cart.id, lineId: line.id, depth: line.depth, hubId: hub.id, items: hub.buffer.length });
      cart.state = 'TRAVELING_TO_STOP';
      cart.stateTimer = 0;
      return;
    case 'TRAVELING_TO_STOP':
      cart.stateTimer += dt;
      cart.position = Math.max(0, 1 - cart.stateTimer / RAIL_TRAVEL_DURATION);
      if (cart.stateTimer < RAIL_TRAVEL_DURATION) return;
      cart.position = 0;
      cart.state = 'IDLE_AT_STOP';
      cart.stateTimer = 0;
      return;
  }
}

function updateHubRouting(state: GameState): void {
  for (const hub of state.run.logistics.cargoHubs) {
    const floor = state.run.floors[hub.depth];
    const priorityCargo = hub.buffer.filter((item) => shouldUseCentralElevator(item));
    if (priorityCargo.length === 0) continue;
    const ids = new Set(priorityCargo.map((item) => item.id));
    hub.buffer = hub.buffer.filter((item) => !ids.has(item.id));
    for (const item of priorityCargo) { item.x = CARGO_HUB_X; item.y = WORLD.floorY - 5; }
    floor.cargo.push(...priorityCargo);
  }
}

function updateFreight(state: GameState, dt: number): void {
  const cage = state.run.logistics.freightCage;
  if (cage.state === 'UNBUILT' || cage.state === 'JAMMED') return;
  switch (cage.state) {
    case 'IDLE': {
      cage.position = 0;
      const hub = selectFreightHub(state);
      if (!hub) return;
      cage.targetDepth = hub.depth;
      cage.state = 'REQUESTED';
      cage.stateTimer = 0;
      emit(state, 'FREIGHT_REQUESTED', { depth: hub.depth, hubId: hub.id });
      return;
    }
    case 'REQUESTED':
      cage.state = 'MOVING_TO_FLOOR';
      cage.stateTimer = 0;
      return;
    case 'MOVING_TO_FLOOR':
      cage.stateTimer += dt;
      cage.position = Math.min(1, cage.stateTimer / FREIGHT_TRAVEL_DURATION);
      if (cage.stateTimer < FREIGHT_TRAVEL_DURATION) return;
      cage.state = 'LOADING';
      cage.stateTimer = 0;
      return;
    case 'LOADING': {
      cage.stateTimer += dt;
      if (cage.stateTimer < FREIGHT_LOAD_DURATION) return;
      const hub = cage.targetDepth ? hubForDepth(state, cage.targetDepth) : undefined;
      if (!hub) { cage.state = 'DESCENDING'; cage.stateTimer = 0; return; }
      loadFreight(cage, hub);
      if (cage.cargo.length === 0) { cage.state = 'DESCENDING'; cage.stateTimer = 0; return; }
      emit(state, 'FREIGHT_LOADING', { depth: hub.depth, items: cage.cargo.length, weight: Number(cargoWeight(cage.cargo).toFixed(2)) });
      cage.state = 'ASCENDING';
      cage.stateTimer = 0;
      emit(state, 'FREIGHT_DEPARTED', { depth: hub.depth, items: cage.cargo.length });
      return;
    }
    case 'ASCENDING':
      cage.stateTimer += dt;
      cage.position = Math.max(0, 1 - cage.stateTimer / FREIGHT_TRAVEL_DURATION);
      if (cage.stateTimer < FREIGHT_TRAVEL_DURATION) return;
      cage.position = 0;
      cage.state = 'UNLOADING';
      cage.stateTimer = 0;
      return;
    case 'UNLOADING':
      cage.stateTimer += dt;
      if (cage.stateTimer < FREIGHT_UNLOAD_DURATION) return;
      appraiseDeepCargo(state, cage.cargo.splice(0), 'FREIGHT');
      emit(state, 'FREIGHT_APPRAISED', { depth: cage.targetDepth ?? 'D-001' });
      cage.state = 'DESCENDING';
      cage.stateTimer = 0;
      return;
    case 'DESCENDING':
      cage.stateTimer += dt;
      cage.position = Math.min(1, cage.stateTimer / FREIGHT_TRAVEL_DURATION);
      if (cage.stateTimer < FREIGHT_TRAVEL_DURATION) return;
      cage.position = 0;
      cage.targetDepth = null;
      cage.state = 'IDLE';
      cage.stateTimer = 0;
      return;
  }
}

function updateBores(state: GameState, dt: number): void {
  for (const bore of state.run.deepAutomation.bores) {
    if (bore.state === 'INSTALLING' || bore.state === 'BLUEPRINT' || bore.state === 'JAMMED') continue;
    const line = bore.connectedLineId ? state.run.logistics.lines.find((candidate) => candidate.id === bore.connectedLineId) : undefined;
    const node = state.run.floors[bore.depth].nodes.find((candidate) => candidate.id === bore.targetNodeId);
    if (!line || line.state !== 'READY' || !node) { bore.state = 'BLOCKED'; continue; }
    const reserved = maximumMiningDropWeight(state, state.run.floors[bore.depth], node) + (node.id === 'fracture-well' ? LOOT.DEEP_COMPONENT.weight : 0);
    if (cargoWeight(bore.outputBuffer) + reserved > bore.maxOutputWeight + 0.001 || cargoWeight(line.inputBuffer) >= line.maxInputWeight - 0.001) {
      bore.state = 'BLOCKED';
      continue;
    }
    if (node.hp <= 0) { bore.state = 'IDLE'; continue; }
    if (bore.state !== 'DRILLING') {
      bore.state = 'DRILLING';
      bore.cycleProgress = 0;
      emit(state, 'BORE_CYCLE_STARTED', { boreId: bore.id, siteId: bore.siteId, depth: bore.depth, nodeId: node.id });
    }
    const before = bore.cycleProgress;
    bore.cycleProgress += dt;
    if (before < bore.hitAt && bore.cycleProgress >= bore.hitAt) applyBoreHit(state, bore, node);
    if (bore.cycleProgress >= bore.cycleDuration) {
      bore.cycleProgress = 0;
      bore.state = node.hp > 0 ? 'DRILLING' : 'IDLE';
    }
  }
}

function applyBoreHit(state: GameState, bore: RemoteBore, node: MiningNode): void {
  let damage = bore.damage * getModifiers(state).miningDamageMultiplier;
  const coupler = boreCouplerValue(state);
  if (coupler > 0) damage *= 1 + coupler;
  damage = finishingDamage(state, node, damage);
  node.hp = Math.max(0, node.hp - damage);
  emit(state, 'BORE_HIT', { boreId: bore.id, nodeId: node.id, depth: bore.depth, damage, hp: node.hp });
  emit(state, 'NODE_DAMAGE', { boreId: bore.id, nodeId: node.id, depth: bore.depth, hp: node.hp, maxHp: node.maxHp });
  if (node.hp > 0) return;
  node.respawnTimer = node.respawnDelay;
  emit(state, 'NODE_BREAK', { boreId: bore.id, nodeId: node.id, depth: bore.depth });
  const items = rollMiningLoot(state, state.run.floors[bore.depth], node, (type, data) => emit(state, type, data), { boreId: bore.id });
  bore.outputBuffer.push(...items);
  for (const loot of items) emit(state, 'BORE_OUTPUT', { boreId: bore.id, id: loot.id, kind: loot.kind, depth: bore.depth });
}

function appraiseDeepCargo(state: GameState, cargo: LootStack[], via: string): void {
  appraisePhysicalCargo(state, cargo, (type, data) => emit(state, type, data), via);
}

function ensureD400Line(state: GameState): void {
  if (state.run.logistics.lines.some((line) => line.id === D400_LINE)) return;
  const line = makeRailLine(D400_LINE, 'D-400', 'Bore Output Stop', 'Null Cargo Hub', 'ANY');
  line.state = 'BUILDING';
  line.requiredBuildProgress = BORE_BUILD_PROGRESS;
  line.buildProgress = 0;
  state.run.logistics.lines.push(line);
  state.run.logistics.railCarts.push(makeCart(D400_CART, D400_LINE));
  state.run.logistics.cargoHubs.push(makeHub(D400_HUB, 'D-400'));
}

function makeRailLine(id: string, depth: DepthId, from: string, to: string, priority: RailPriority): TransportLine {
  return {
    id,
    type: 'RAIL',
    depth,
    from,
    to,
    state: 'BLUEPRINT',
    capacity: RAIL_CAPACITY,
    priority,
    buildProgress: 0,
    requiredBuildProgress: RAIL_BUILD_PROGRESS,
    inputBuffer: [],
    outputBuffer: [],
    maxInputWeight: RAIL_STOP_BUFFER,
    maxOutputWeight: RAIL_HUB_BUFFER,
    jamReason: null,
  };
}

function makeCart(id: string, lineId: string): RailCart {
  return { id, lineId, position: 0, state: 'IDLE_AT_STOP', stateTimer: 0, cargo: [] };
}

function makeHub(id: string, depth: DepthId): CargoHub {
  return { id, depth, buffer: [], maxWeight: RAIL_HUB_BUFFER };
}

function railAccepts(item: LootStack, priority: RailPriority): boolean {
  if (priority === 'ANY') return true;
  if (priority === 'BULK') return item.category === 'ORE' || item.weight >= 2.6;
  if (priority === 'RESEARCH') return item.category === 'RESEARCH';
  return item.equipmentSeed !== undefined || RARITY_RANK[item.rarity] >= RARITY_RANK.EPIC;
}

function shouldUseCentralElevator(item: LootStack): boolean {
  return item.equipmentSeed !== undefined || item.category === 'CORE' || item.category === 'RESEARCH' || RARITY_RANK[item.rarity] >= RARITY_RANK.EPIC;
}

function shouldUseFreight(item: LootStack, priority: FreightPriority): boolean {
  if (shouldUseCentralElevator(item)) return false;
  if (priority === 'BULK') return item.category === 'ORE' || item.weight >= 2.6;
  return item.category === 'ORE' || RARITY_RANK[item.rarity] <= RARITY_RANK.RARE;
}

function moveCargoIntoBuffer(
  source: LootStack[], target: LootStack[], maxWeight: number,
  accepts: (item: LootStack) => boolean, state: GameState, line: TransportLine,
): void {
  let remaining = Math.max(0, maxWeight - cargoWeight(target));
  const moved: LootStack[] = [];
  for (const item of source) {
    if (!accepts(item) || item.weight > remaining + 0.001) continue;
    moved.push(item);
    remaining -= item.weight;
  }
  if (moved.length === 0) return;
  const ids = new Set(moved.map((item) => item.id));
  source.splice(0, source.length, ...source.filter((item) => !ids.has(item.id)));
  target.push(...moved);
  for (const item of moved) emit(state, 'RAIL_CARGO_QUEUED', { lineId: line.id, id: item.id, kind: item.kind, depth: line.depth });
}

function loadCart(line: TransportLine, cart: RailCart): void {
  let remaining = Math.max(0, line.capacity - cargoWeight(cart.cargo));
  const loaded: LootStack[] = [];
  for (const item of line.inputBuffer) {
    if (item.weight > remaining + 0.001) continue;
    loaded.push(item);
    remaining -= item.weight;
  }
  const ids = new Set(loaded.map((item) => item.id));
  line.inputBuffer = line.inputBuffer.filter((item) => !ids.has(item.id));
  cart.cargo.push(...loaded);
}

function loadFreight(cage: GameState['run']['logistics']['freightCage'], hub: CargoHub): void {
  let remaining = Math.max(0, cage.maxLoad - cargoWeight(cage.cargo));
  const loaded: LootStack[] = [];
  for (const item of hub.buffer) {
    if (!shouldUseFreight(item, cage.priority) || item.weight > remaining + 0.001) continue;
    loaded.push(item);
    remaining -= item.weight;
  }
  const ids = new Set(loaded.map((item) => item.id));
  hub.buffer = hub.buffer.filter((item) => !ids.has(item.id));
  cage.cargo.push(...loaded);
}

function selectFreightHub(state: GameState): CargoHub | undefined {
  return state.run.logistics.cargoHubs
    .filter((hub) => hub.buffer.some((item) => shouldUseFreight(item, state.run.logistics.freightCage.priority)))
    .sort((a, b) => cargoWeight(b.buffer) - cargoWeight(a.buffer))[0];
}

function jamLine(state: GameState, line: TransportLine, cart: RailCart, reason: string): void {
  line.state = 'JAMMED';
  line.jamReason = reason;
  cart.state = 'JAMMED';
  emit(state, 'CARGO_JAMMED', { lineId: line.id, depth: line.depth, reason });
}

function maybeAssignJamRecovery(state: GameState, line: TransportLine): void {
  if (!engineerAvailable(state)) return;
  const hub = hubForDepth(state, line.depth);
  const cart = cartForLine(state, line.id);
  if (!hub || !cart || cargoWeight(hub.buffer) + cargoWeight(cart.cargo) > hub.maxWeight + 0.001) return;
  assignEngineerJob(state, {
    id: `job-jam-${line.id}`, kind: 'JAM_RECOVERY', targetId: line.id, depth: line.depth,
    progress: 0, requiredProgress: 3,
  });
}

function cartForLine(state: GameState, lineId: string): RailCart | undefined {
  return state.run.logistics.railCarts.find((cart) => cart.lineId === lineId);
}

function hubForDepth(state: GameState, depth: DepthId): CargoHub | undefined {
  return state.run.logistics.cargoHubs.find((hub) => hub.depth === depth);
}

function engineerAvailable(state: GameState): boolean {
  return !state.run.engineer.job;
}

function ensureEngineerUnlocked(state: GameState): void {
  if (state.run.engineer.unlocked) return;
  state.run.engineer.unlocked = true;
  state.run.engineer.state = 'IDLE';
}

function jobTargetX(state: GameState, job: EngineerJob): number {
  if (job.kind === 'RAIL_INSTALL' || job.kind === 'JAM_RECOVERY') return RAIL_STOP_X - 12;
  if (job.kind === 'FREIGHT_INSTALL' || job.kind === 'SHAFT_EXTENSION') return WORLD.elevatorX + 54;
  if (job.kind === 'BORE_INSTALL') {
    const bore = state.run.deepAutomation.bores.find((candidate) => candidate.id === job.targetId);
    const node = bore ? state.run.floors[bore.depth].nodes.find((candidate) => candidate.id === bore.siteId) : undefined;
    return node?.x ?? RAIL_STOP_X;
  }
  return WORLD.elevatorX;
}

function resolveEventDepth(state: GameState, event: GameEvent): DepthId {
  const depth = event.data?.depth;
  return typeof depth === 'string' && depth in state.run.floors ? depth as DepthId : state.run.depth.current;
}

function cargoExists(state: GameState, kind: LootKind): boolean {
  const pools: LootStack[][] = [
    ...Object.values(state.run.floors).flatMap((floor) => [floor.loot, floor.cargo]),
    state.run.elevator.cargo,
    state.run.logistics.freightCage.cargo,
    ...state.run.logistics.lines.flatMap((line) => [line.inputBuffer, line.outputBuffer]),
    ...state.run.logistics.railCarts.map((cart) => cart.cargo),
    ...state.run.logistics.cargoHubs.map((hub) => hub.buffer),
    ...state.run.deepAutomation.bores.map((bore) => bore.outputBuffer),
  ];
  return pools.some((pool) => pool.some((item) => item.kind === kind));
}

function createDeepLoot(state: GameState, kind: LootKind, x: number, depth: DepthId, equipmentSeed?: number): LootStack {
  const definition = LOOT[kind];
  return {
    id: `loot-${state.meta.runIndex}-${state.run.nextLootId++}`,
    kind,
    name: definition.name,
    rarity: definition.rarity,
    category: definition.category,
    weight: definition.weight,
    value: definition.value,
    dataValue: definition.dataValue ?? 0,
    coreValue: definition.coreValue ?? 0,
    x,
    y: WORLD.floorY - 4,
    originDepth: depth,
    ...(equipmentSeed !== undefined ? { equipmentSeed } : {}),
  };
}

function spawnDeepEquipmentCrate(state: GameState, node: MiningNode, depth: DepthId): void {
  const equipmentSeed = hashSeed(state.run.seed ^ state.run.floors[depth].seed ^ Math.imul(state.run.nextLootId, 0x27d4eb2d));
  const kind: LootKind = nextRandom(state) < 0.62 ? 'ANCIENT_TOOL_CRATE' : nextRandom(state) < 0.5 ? 'ANCIENT_PACK_CRATE' : 'ANCIENT_LAMP_CRATE';
  const slot = kind === 'ANCIENT_TOOL_CRATE' ? 'TOOL' : kind === 'ANCIENT_PACK_CRATE' ? 'PACK' : 'LAMP';
  const loot = createDeepLoot(state, kind, node.x, depth, equipmentSeed);
  state.run.floors[depth].loot.push(loot);
  state.run.phase5.equipment.drops.push({ lootId: loot.id, seed: equipmentSeed, baseId: `deep-${slot.toLowerCase()}`, slot, sourceDepth: depth });
  emit(state, 'EQUIPMENT_DROP', { id: loot.id, slot, nodeId: node.id, depth, seed: equipmentSeed });
  emitLootSpawn(state, loot, node.id);
}

function emitLootSpawn(state: GameState, item: LootStack, nodeId: string): void {
  emit(state, 'LOOT_SPAWN', {
    id: item.id, kind: item.kind, name: item.name, rarity: item.rarity, category: item.category,
    value: item.value, data: item.dataValue, core: item.coreValue, x: item.x, y: item.y, nodeId,
    ...(item.originDepth ? { depth: item.originDepth } : {}),
  });
}

function boreCouplerValue(state: GameState): number {
  const inventory = state.run.phase5.equipment.inventory;
  return Object.values(state.run.phase5.equipment.equippedPlayer)
    .flatMap((id) => inventory.find((item) => item.id === id)?.affixes ?? [])
    .filter((affix) => affix.id === 'BORE_COUPLER')
    .reduce((max, affix) => Math.max(max, affix.value), 0);
}

function unlockDepth(state: GameState, depth: DepthId, eventType: Extract<GameEventType, 'D250_UNLOCKED' | 'D400_UNLOCKED' | 'D650_UNLOCKED'>): void {
  if (!state.run.depth.unlocked.includes(depth)) state.run.depth.unlocked.push(depth);
  state.meta.bestDepth = deeperDepth(state.meta.bestDepth, depth);
  if (!state.meta.deepDiscoveries.includes(depth)) state.meta.deepDiscoveries.push(depth);
  state.run.deepProgress.instrumentation.depthUnlockedAt[depth] = state.elapsed;
  emit(state, 'DEPTH_UNLOCKED', { depth });
  emit(state, eventType, { depth, run: state.meta.runIndex });
}

function emit(state: GameState, type: GameEventType, data?: Record<string, string | number | boolean>): void {
  const event: GameEvent = { id: state.nextEventId++, type, at: state.elapsed, ...(data ? { data } : {}) };
  state.events.push(event);
  state.eventHistory.push(event);
  if (state.eventHistory.length > 360) state.eventHistory.splice(0, state.eventHistory.length - 360);
}

export const DEEP_IDS = { D250_LINE, D250_CART, D250_HUB, D400_LINE, D400_CART, D400_HUB } as const;
