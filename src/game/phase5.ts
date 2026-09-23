import { partitionCargo } from './cargoSelection';
import { CARGO_ROUTE_DURATION, COLLECT_DURATION, CREW_BOARD_COST, CREW_HIRE_COSTS, CREW_MINER_MOVE_SPEED, CREW_PORTER_CAPACITY, CREW_PORTER_MOVE_SPEED, CREW_SLOT_COSTS, CREW_TRAVEL_DURATION, D180_EXTENSION_COST, LOOT, OFFLINE_CAP_SECONDS, OFFLINE_STEP_SECONDS, PLAYER_PACK_CAPACITY, PORTER_COLLECT_DURATION, SWING, WORLD } from './config';
import { canPlayerAccessNode, localCargoDropX, processDeepEvents, updateDeepGame } from './deepGame';
import { depthDistance } from './depth';
import { rememberFind } from './appraisal';
import { activeProspect, prospectPriorityValue } from './prospecting';
import { getModifiers } from './modifiers';
import { finishingDamage, rollMiningLoot, nodeTripEstimate, treasureChance, treasureCategoryChance, visibleSeams, coreReserveRemaining } from './mining';
import { hashSeed, nextRandom } from './rng';
import { armReboot, canTravelToDepth, cargoWeight, drainEvents, requestFloorTravel, sendElevator, updateGame } from './simulation';
import type { CargoRoutingPriority, CrewMember, CrewRole, EquipmentAffix, EquipmentAffixId, EquipmentItem, EquipmentRarity, EquipmentSlot, FloorState, GameEvent, GameEventType, GameState, LootKind, LootStack, MinerPriority, MiningNode, OfflineReport, Phase5DepthId, PorterPriority, Rarity, WorkerBody } from './types';

const NODE_STOP_DISTANCE = 13;
const D180 = 'D-180' as const;
const EQUIPMENT_RARITY_RANK: Record<EquipmentRarity, number> = { COMMON: 0, RARE: 1, EPIC: 2, ANCIENT: 3 };
const LOOT_RARITY_RANK: Record<Rarity, number> = { COMMON: 0, UNCOMMON: 1, RARE: 2, EPIC: 3, RELIC: 4, ANOMALY: 5 };

export function phase5Floor(state: GameState, depth: Phase5DepthId): FloorState {
  return state.run.floors[depth];
}

export function unlockedPhase5Depths(state: GameState): Phase5DepthId[] {
  return [...state.run.depth.unlocked];
}

export function isD180Unlocked(state: GameState): boolean {
  return unlockedPhase5Depths(state).includes(D180);
}

export function canShowCrewBoard(state: GameState): boolean {
  return state.meta.runIndex > 1 && (state.run.depth.unlocked.includes('D-060') || state.meta.protocols.includes('CREW_MANIFEST'));
}

export function selectCrewBoard(state: GameState): boolean {
  if (!canShowCrewBoard(state)) return false;
  state.selection = { type: 'crew-board' };
  return true;
}

export function canUnlockCrewOperations(state: GameState): boolean {
  const run = state.run;
  if (run.phase5.crew.unlocked) return false;
  if (state.meta.runIndex < 2) return false;
  if (!run.research.completed.includes('CREW_ROUTING') || !run.research.completed.includes('CARGO_SCHEDULER')) return false;
  if (!run.porter.enabled || run.porter.carried.length > 0 || run.porter.state === 'LOADING') return false;
  return run.scrap >= CREW_BOARD_COST;
}

export function unlockCrewOperations(state: GameState): boolean {
  if (!canUnlockCrewOperations(state)) return false;
  const run = state.run;
  run.scrap -= CREW_BOARD_COST;
  const crew = run.phase5.crew;
  crew.unlocked = true;
  crew.slots = Math.max(2, crew.slots);
  if (!crew.members.some((member) => member.role === 'MINER')) crew.members.push(createCrewMember(state, 'MINER', run.depth.current));
  if (!crew.members.some((member) => member.role === 'PORTER')) {
    const porter = createCrewMember(state, 'PORTER', run.depth.current);
    porter.body.x = run.porter.x;
    porter.body.facing = run.porter.facing;
    crew.members.push(porter);
  }
  run.porter.enabled = false;
  run.porter.state = 'IDLE';
  run.porter.targetLootId = null;
  run.phase5.cargo.unlocked = true;
  emit(state, 'CREW_HIRED', { crew: crew.members.length, slots: crew.slots, convertedPorter: true });
  return true;
}

export function expandCrewSlots(state: GameState): boolean {
  const crew = state.run.phase5.crew;
  if (!crew.unlocked || crew.slots >= 4) return false;
  const cost = CREW_SLOT_COSTS[crew.slots] ?? 5200;
  if (state.run.scrap < cost) return false;
  state.run.scrap -= cost;
  crew.slots += 1;
  return true;
}

export function hireCrew(state: GameState, role: CrewRole): boolean {
  const crew = state.run.phase5.crew;
  if (!crew.unlocked || crew.members.length >= crew.slots) return false;
  const cost = CREW_HIRE_COSTS[role];
  if (state.run.scrap < cost) return false;
  state.run.scrap -= cost;
  const member = createCrewMember(state, role, state.run.depth.current);
  crew.members.push(member);
  emit(state, 'CREW_HIRED', { crewId: member.id, role, cost });
  return true;
}

function createCrewMember(state: GameState, role: CrewRole, depth: Phase5DepthId): CrewMember {
  const idNumber = state.run.phase5.crew.nextCrewId++;
  const roleIndex = state.run.phase5.crew.members.filter((member) => member.role === role).length + 1;
  return {
    id: `crew-${idNumber}`,
    name: `${role} ${String(roleIndex).padStart(2, '0')}`,
    role,
    assignedDepth: depth,
    pendingDepth: null,
    state: role === 'MINER' ? 'FIND_NODE' : 'FIND_LOOT',
    body: {
      x: role === 'MINER' ? WORLD.elevatorX - 34 : WORLD.elevatorX + 34,
      y: WORLD.floorY - 8,
      facing: role === 'MINER' ? -1 : 1,
      moveSpeed: role === 'MINER' ? CREW_MINER_MOVE_SPEED : CREW_PORTER_MOVE_SPEED,
      carried: [],
    },
    targetNodeId: null,
    targetLootId: null,
    swing: null,
    collectTimer: 0,
    loadingTimer: 0,
    capacity: role === 'PORTER' ? CREW_PORTER_CAPACITY : 0,
    minerPriority: 'ANY',
    porterPriority: 'NEAREST',
    travel: null,
    equipment: {},
  };
}

export function crewAssignmentBlockReason(state: GameState, crewId: string, depth: Phase5DepthId): string | null {
  const member = state.run.phase5.crew.members.find((candidate) => candidate.id === crewId);
  if (!member || !state.run.phase5.crew.unlocked) return 'Worker is not available.';
  if (!unlockedPhase5Depths(state).includes(depth)) return 'Connect this floor first.';
  if (member.assignedDepth === depth) return 'Already assigned here.';
  if (member.pendingDepth || member.state === 'TRAVELING') return 'Wait for the current transfer to finish.';
  if (member.body.carried.length || member.state === 'DEPOSITING') return 'Wait for this worker to unload carried cargo.';
  return null;
}

export function assignCrew(state: GameState, crewId: string, depth: Phase5DepthId): boolean {
  if (crewAssignmentBlockReason(state, crewId, depth)) return false;
  const member = state.run.phase5.crew.members.find((candidate) => candidate.id === crewId)!;
  member.pendingDepth = depth;
  member.targetNodeId = null;
  member.targetLootId = null;
  member.swing = null;
  member.state = 'MOVING_TO_ELEVATOR';
  member.body.facing = WORLD.elevatorX >= member.body.x ? 1 : -1;
  emit(state, 'CREW_ASSIGNED', { crewId, role: member.role, from: member.assignedDepth, to: depth });
  return true;
}

export function setMinerPriority(state: GameState, crewId: string, priority: MinerPriority): boolean {
  const member = state.run.phase5.crew.members.find((candidate) => candidate.id === crewId && candidate.role === 'MINER');
  if (!member) return false;
  member.minerPriority = priority;
  member.targetNodeId = null;
  if (!member.pendingDepth && member.state !== 'TRAVELING' && member.state !== 'MOVING_TO_ELEVATOR') member.state = 'FIND_NODE';
  emit(state, 'CREW_TASK_SELECTED', { crewId, role: member.role, priority });
  return true;
}

export function setPorterPriority(state: GameState, crewId: string, priority: PorterPriority): boolean {
  const member = state.run.phase5.crew.members.find((candidate) => candidate.id === crewId && candidate.role === 'PORTER');
  if (!member) return false;
  member.porterPriority = priority;
  member.targetLootId = null;
  if (!member.pendingDepth && member.body.carried.length === 0 && member.state !== 'TRAVELING' && member.state !== 'MOVING_TO_ELEVATOR') member.state = 'FIND_LOOT';
  emit(state, 'CREW_TASK_SELECTED', { crewId, role: member.role, priority });
  return true;
}

export function setCargoPriority(state: GameState, priority: CargoRoutingPriority): boolean {
  if (!state.run.phase5.cargo.unlocked) return false;
  state.run.phase5.cargo.priority = priority;
  return true;
}

export function updatePhase5(state: GameState, dt: number): void {
  const step = Math.max(0, Math.min(dt, 0.1));
  updateAncientSignal(state);
  updateCrew(state, step);
  updateDeepGame(state, step);
  updateCargoNetwork(state, step);
}

function updateAncientSignal(state: GameState): void {
  const ancient = state.run.phase5.ancient;
  if (ancient.signalFound || state.run.depth.current !== 'D-100') return;
  if (!state.run.coreChamber.rebootAvailable || !state.run.research.completed.includes('ANCIENT_SURVEY')) return;
  ancient.signalFound = true;
  emit(state, 'D180_SIGNAL_FOUND', { depth: 'D-180', pendingCore: state.run.pendingCore });
}

function updateCrew(state: GameState, dt: number): void {
  if (!state.run.phase5.crew.unlocked) return;
  for (const member of state.run.phase5.crew.members) {
    updateCrewMovementParameters(state, member);
    if (member.state === 'MOVING_TO_ELEVATOR' || member.state === 'TRAVELING') {
      updateCrewTravel(state, member, dt);
      continue;
    }
    if (member.role === 'MINER') updateCrewMiner(state, member, dt);
    else updateCrewPorter(state, member, dt);
  }
}

export function crewMoveSpeed(state: GameState, member: CrewMember): number {
  let speed = member.role === 'MINER' ? CREW_MINER_MOVE_SPEED : CREW_PORTER_MOVE_SPEED;
  if (state.run.anomaly.selected === 'HEAVY_WORLD') speed *= 0.8;
  const tool = member.equipment.TOOL ? state.run.phase5.equipment.inventory.find((item) => item.id === member.equipment.TOOL) : undefined;
  if (tool) {
    const light = tool.affixes.find((affix) => affix.id === 'LIGHT_FRAME' || affix.id === 'COURIER_BOOTS');
    if (light) speed *= 1 + light.value;
  }
  return speed;
}

function updateCrewMovementParameters(state: GameState, member: CrewMember): void {
  member.body.moveSpeed = crewMoveSpeed(state, member);
}

function updateCrewTravel(state: GameState, member: CrewMember, dt: number): void {
  if (member.state === 'MOVING_TO_ELEVATOR') {
    member.body.facing = WORLD.elevatorX >= member.body.x ? 1 : -1;
    if (!moveToward(member.body, WORLD.elevatorX + (member.role === 'MINER' ? -10 : 10), dt)) return;
    if (!canUseElevatorForCrew(state, member.id) || !member.pendingDepth) return;
    const duration = CREW_TRAVEL_DURATION + depthDistance(member.assignedDepth, member.pendingDepth) * 0.008;
    member.travel = { from: member.assignedDepth, to: member.pendingDepth, remaining: duration, duration };
    member.state = 'TRAVELING';
    state.run.elevator.state = 'TRAVELING';
    state.run.elevator.position = 0;
    emit(state, 'CREW_TRAVEL_STARTED', { crewId: member.id, from: member.assignedDepth, to: member.pendingDepth, duration });
    return;
  }
  const travel = member.travel;
  if (!travel) {
    member.state = member.role === 'MINER' ? 'FIND_NODE' : 'FIND_LOOT';
    return;
  }
  travel.remaining = Math.max(0, travel.remaining - dt);
  const progress = 1 - travel.remaining / travel.duration;
  state.run.elevator.position = Math.sin(progress * Math.PI) * 0.28;
  if (travel.remaining > 0) return;
  member.assignedDepth = travel.to;
  member.pendingDepth = null;
  member.travel = null;
  member.body.x = WORLD.elevatorX + (member.role === 'MINER' ? -32 : 32);
  member.body.facing = member.role === 'MINER' ? -1 : 1;
  member.state = member.role === 'MINER' ? 'FIND_NODE' : 'FIND_LOOT';
  state.run.elevator.state = 'IDLE_BOTTOM';
  state.run.elevator.position = 0;
  state.run.elevator.stateTimer = 0;
  emit(state, 'CREW_ARRIVED', { crewId: member.id, depth: member.assignedDepth, role: member.role });
}

function canUseElevatorForCrew(state: GameState, crewId: string): boolean {
  const run = state.run;
  if (run.elevator.state !== 'IDLE_BOTTOM' || run.elevator.travel || run.elevator.cargo.length > 0 || run.phase5.cargo.route) return false;
  if (run.character.state === 'LOADING' || run.porter.state === 'LOADING') return false;
  return !run.phase5.crew.members.some((member) => member.id !== crewId && member.state === 'TRAVELING');
}

function updateCrewMiner(state: GameState, member: CrewMember, dt: number): void {
  const floor = phase5Floor(state, member.assignedDepth);
  if (!floor || (member.assignedDepth === 'D-030' && !state.run.anomaly.selected)) return;
  switch (member.state) {
    case 'IDLE':
    case 'FIND_NODE': {
      const node = chooseMinerNode(state, member, floor);
      if (!node) { member.state = 'IDLE'; return; }
      member.targetNodeId = node.id;
      member.body.facing = node.x >= member.body.x ? 1 : -1;
      member.state = 'MOVING_TO_NODE';
      emit(state, 'CREW_TASK_SELECTED', { crewId: member.id, role: 'MINER', depth: member.assignedDepth, nodeId: node.id, priority: member.minerPriority });
      return;
    }
    case 'MOVING_TO_NODE': {
      const node = findCrewNode(member, floor);
      if (!node || node.hp <= 0 || !canPlayerAccessNode(node)) { member.targetNodeId = null; member.state = 'FIND_NODE'; return; }
      member.body.facing = node.x >= member.body.x ? 1 : -1;
      if (moveToward(member.body, nodeDestination(node), dt)) member.state = 'MINING';
      return;
    }
    case 'MINING': {
      const node = findCrewNode(member, floor);
      if (!node || node.hp <= 0 || !canPlayerAccessNode(node)) { member.swing = null; member.targetNodeId = null; member.state = 'FIND_NODE'; return; }
      if (!member.swing) {
        member.swing = { elapsed: 0, hitApplied: false };
        emit(state, 'MINER_SWING_START', { crewId: member.id, nodeId: node.id, depth: member.assignedDepth });
      }
      member.swing.elapsed += dt;
      if (!member.swing.hitApplied && member.swing.elapsed >= SWING.hitAt) {
        member.swing.hitApplied = true;
        applyCrewMiningHit(state, member, floor, node);
      }
      if (member.swing.elapsed >= SWING.total) {
        member.swing = null;
        if (node.hp <= 0) { member.targetNodeId = null; member.state = 'FIND_NODE'; }
      }
      return;
    }
    default:
      return;
  }
}

function chooseMinerNode(state: GameState, member: CrewMember, floor: FloorState): MiningNode | undefined {
  const nodes = floor.nodes.filter((node) => node.hp > 0 && canPlayerAccessNode(node));
  const score = (node: MiningNode): number => {
    if (member.minerPriority === 'NEAREST') return -Math.abs(node.x - member.body.x);
    const travel = Math.abs(nodeDestination(node) - member.body.x) / Math.max(1, member.body.moveSpeed);
    const work = Math.ceil(node.hp / crewMiningDamage(state, member, node)) * SWING.total;
    const estimate = nodeTripEstimate(state, node);
    const haul = 2 * Math.abs(node.x - localCargoDropX(state, member.assignedDepth)) / CREW_PORTER_MOVE_SPEED;
    const seam = visibleSeams(floor, node)[0];
    const bonus = seam ? LOOT[seam.kind] : null;
    const bonusRate = seam ? 1 / Math.max(1, seam.at - (node.minedCount ?? 0)) : 0;
    const prospect = activeProspect(floor, node);
    const prospectRate = prospect ? 1 / (prospect.required - prospect.work) : 0;
    if (member.minerPriority === 'RESEARCH') return (treasureCategoryChance(state, node, 'RESEARCH') * 5
      + (bonus?.dataValue ?? 0) * bonusRate + (prospect?.signal === 'RESEARCH' ? 3 * prospectRate : 0)) / Math.max(1, travel + work + haul);
    if (member.minerPriority === 'RARE') return (treasureChance(state, node) + bonusRate + prospectRate + (coreReserveRemaining(node) > 0 ? node.coreWeight : 0))
      / Math.max(1, travel + work + haul * 0.5);
    return (estimate.averageScrap + (bonus?.value ?? 0) * bonusRate + prospectPriorityValue(floor, node)) / Math.max(1, travel + work + haul * estimate.averageWeight / CREW_PORTER_CAPACITY);
  };
  return nodes.sort((a, b) => score(b) - score(a) || a.id.localeCompare(b.id))[0];
}

function findCrewNode(member: CrewMember, floor: FloorState): MiningNode | undefined {
  return member.targetNodeId ? floor.nodes.find((node) => node.id === member.targetNodeId) : undefined;
}

function applyCrewMiningHit(state: GameState, member: CrewMember, floor: FloorState, node: MiningNode): void {
  const damage = crewMiningDamage(state, member, node);
  emit(state, 'MINER_SWING_HIT', { crewId: member.id, nodeId: node.id, depth: member.assignedDepth, damage });
  node.hp = Math.max(0, node.hp - damage);
  emit(state, 'NODE_DAMAGE', { crewId: member.id, nodeId: node.id, depth: member.assignedDepth, hp: node.hp, maxHp: node.maxHp });
  if (node.hp > 0) return;
  node.respawnTimer = node.respawnDelay;
  emit(state, 'NODE_BREAK', { crewId: member.id, nodeId: node.id, depth: member.assignedDepth });
  spawnCrewLoot(state, member, floor, node);
}

export function crewMiningDamage(state: GameState, member: CrewMember, node: MiningNode): number {
  return finishingDamage(state, node, 11 * getModifiers(state).miningDamageMultiplier * crewToolMultiplier(state, member, node));
}

function crewToolMultiplier(state: GameState, member: CrewMember, node: MiningNode): number {
  const itemId = member.equipment.TOOL;
  if (!itemId) return 1;
  const item = state.run.phase5.equipment.inventory.find((candidate) => candidate.id === itemId);
  if (!item) return 1;
  let multiplier = 1;
  for (const affix of item.affixes) {
    if (affix.id === 'POWERED_EDGE') multiplier *= 1 + affix.value;
    if (affix.id === 'FOSSIL_BREAKER' && node.fossilWeight >= 0.45) multiplier *= 1 + affix.value;
    if (affix.id === 'VOID_CUTTER' && node.access === 'REMOTE_ONLY') multiplier *= 1 + affix.value;
  }
  return multiplier;
}

function spawnCrewLoot(state: GameState, member: CrewMember, floor: FloorState, node: MiningNode): void {
  floor.loot.push(...rollMiningLoot(state, floor, node, (type, data) => emit(state, type, data), { crewId: member.id }));
  if (member.assignedDepth === D180) spawnAncientSiteDrop(state, floor, node, member.id);
}

function updateCrewPorter(state: GameState, member: CrewMember, dt: number): void {
  const floor = phase5Floor(state, member.assignedDepth);
  if (!floor) return;
  switch (member.state) {
    case 'IDLE':
    case 'FIND_LOOT': {
      if (member.body.carried.length > 0) { member.state = 'RETURNING_TO_CARGO'; return; }
      const target = choosePorterLoot(state, member, floor);
      if (!target) { member.state = 'IDLE'; return; }
      member.targetLootId = target.id;
      member.body.facing = target.x >= member.body.x ? 1 : -1;
      member.state = 'MOVING_TO_LOOT';
      emit(state, 'CREW_TASK_SELECTED', { crewId: member.id, role: 'PORTER', depth: member.assignedDepth, lootId: target.id, priority: member.porterPriority });
      return;
    }
    case 'MOVING_TO_LOOT': {
      const target = findCrewLoot(member, floor);
      if (!target) { member.targetLootId = null; member.state = 'FIND_LOOT'; return; }
      member.body.facing = target.x >= member.body.x ? 1 : -1;
      if (moveToward(member.body, target.x, dt)) { member.collectTimer = 0; member.state = 'COLLECTING'; }
      return;
    }
    case 'COLLECTING': {
      const target = findCrewLoot(member, floor);
      if (!target) { member.targetLootId = null; member.state = 'FIND_LOOT'; return; }
      member.collectTimer += dt;
      if (member.collectTimer < PORTER_COLLECT_DURATION) return;
      pickUpCrewLoot(state, member, floor, target);
      member.collectTimer = 0;
      member.targetLootId = null;
      member.state = member.body.carried.length > 0 ? 'RETURNING_TO_CARGO' : 'FIND_LOOT';
      return;
    }
    case 'RETURNING_TO_CARGO': {
      const destination = localCargoDropX(state, member.assignedDepth);
      member.body.facing = destination >= member.body.x ? 1 : -1;
      if (moveToward(member.body, destination, dt)) { member.loadingTimer = 0; member.state = 'DEPOSITING'; }
      return;
    }
    case 'DEPOSITING':
      member.loadingTimer += dt;
      if (member.loadingTimer < COLLECT_DURATION) return;
      depositCrewCargo(state, member, floor);
      member.loadingTimer = 0;
      member.state = 'FIND_LOOT';
      return;
    default:
      return;
  }
}

function choosePorterLoot(state: GameState, member: CrewMember, floor: FloorState): LootStack | undefined {
  const cargoHook = equippedCrewHasAffix(state, member, 'CARGO_HOOK') || equippedCrewHasAffix(state, member, 'LOAD_HOOK');
  return [...floor.loot].sort((a, b) => {
    const priority = porterPriorityScore(b, member.porterPriority, cargoHook) - porterPriorityScore(a, member.porterPriority, cargoHook);
    if (priority) return priority;
    const distance = Math.abs(a.x - member.body.x) - Math.abs(b.x - member.body.x);
    return distance || a.id.localeCompare(b.id);
  })[0];
}

function porterPriorityScore(item: LootStack, priority: PorterPriority, cargoHook: boolean): number {
  let score = 0;
  if (priority === 'CORE' && item.category === 'CORE') score += 100;
  if (priority === 'RESEARCH' && item.category === 'RESEARCH') score += 100;
  if (priority === 'RELIC' && item.category === 'RELIC') score += 100;
  if (priority === 'RARE') score += LOOT_RARITY_RANK[item.rarity] * 20;
  if (priority === 'VALUE') score += item.value / 5;
  if (priority === 'NEAREST') score += 0;
  if (cargoHook && LOOT_RARITY_RANK[item.rarity] >= 2) score += 45;
  score += LOOT_RARITY_RANK[item.rarity] * 2;
  return score;
}

function findCrewLoot(member: CrewMember, floor: FloorState): LootStack | undefined {
  return member.targetLootId ? floor.loot.find((item) => item.id === member.targetLootId) : undefined;
}

export function crewPickupItems(member: CrewMember, floor: FloorState, target: LootStack): LootStack[] {
  const candidates = [target, ...floor.loot.filter((item) => item.id !== target.id && Math.abs(item.x - target.x) <= 14)
    .sort((a, b) => LOOT_RARITY_RANK[b.rarity] - LOOT_RARITY_RANK[a.rarity] || a.id.localeCompare(b.id))];
  return partitionCargo(candidates, member.capacity - cargoWeight(member.body.carried)).deposited;
}

function pickUpCrewLoot(state: GameState, member: CrewMember, floor: FloorState, target: LootStack): void {
  for (const item of crewPickupItems(member, floor, target)) {
    member.body.carried.push(item);
    const index = floor.loot.findIndex((candidate) => candidate.id === item.id);
    if (index >= 0) floor.loot.splice(index, 1);
    emit(state, 'PORTER_PICKUP', { crewId: member.id, id: item.id, depth: member.assignedDepth, name: item.name, rarity: item.rarity });
  }
}

function depositCrewCargo(state: GameState, member: CrewMember, floor: FloorState): void {
  if (member.body.carried.length === 0) return;
  const deposited = member.body.carried.splice(0);
  const destination = localCargoDropX(state, member.assignedDepth);
  for (const item of deposited) { item.x = destination; item.y = WORLD.floorY - 5; }
  floor.cargo.push(...deposited);
  emit(state, 'FLOOR_CARGO_DEPOSITED', {
    crewId: member.id,
    depth: member.assignedDepth,
    items: deposited.length,
    weight: Number(cargoWeight(deposited).toFixed(2)),
  });
}

function updateCargoNetwork(state: GameState, dt: number): void {
  const cargo = state.run.phase5.cargo;
  if (!cargo.unlocked) return;
  if (cargo.route) {
    cargo.route.remaining = Math.max(0, cargo.route.remaining - dt);
    const progress = 1 - cargo.route.remaining / cargo.route.duration;
    state.run.elevator.position = Math.sin(progress * Math.PI) * 0.22;
    if (cargo.route.remaining > 0) return;
    const depth = cargo.route.targetDepth;
    const floor = phase5Floor(state, depth);
    state.run.elevator.state = 'IDLE_BOTTOM';
    state.run.elevator.position = 0;
    state.run.elevator.stateTimer = 0;
    cargo.route = null;
    cargo.lastServedDepth = depth;
    emit(state, 'ELEVATOR_ARRIVED_DEPTH', { depth });
    const loaded = loadFloorCargo(state, floor, depth);
    if (loaded > 0) {
      cargo.deliveredLoads += 1;
      if (!sendElevator(state)) emit(state, 'FLOOR_CARGO_LOADED', { depth, items: loaded, waiting: true });
    }
    return;
  }
  if (!canStartCargoRoute(state)) return;
  const target = selectCargoFloor(state);
  if (!target) return;
  cargo.route = { targetDepth: target, remaining: CARGO_ROUTE_DURATION, duration: CARGO_ROUTE_DURATION };
  state.run.elevator.state = 'TRAVELING';
  state.run.elevator.position = 0;
  emit(state, 'CARGO_ROUTE_REQUESTED', { depth: target, priority: cargo.priority });
  emit(state, 'ELEVATOR_STOP_SELECTED', { depth: target, priority: cargo.priority });
}

function canStartCargoRoute(state: GameState): boolean {
  const run = state.run;
  if (run.elevator.state !== 'IDLE_BOTTOM' || run.elevator.travel || run.elevator.cargo.length > 0) return false;
  if (run.character.state === 'LOADING' || run.character.state === 'WAITING_FOR_ELEVATOR') return false;
  if (run.porter.state === 'LOADING' || run.porter.state === 'WAITING_FOR_ELEVATOR') return false;
  return !run.phase5.crew.members.some((member) => member.state === 'TRAVELING' || member.state === 'MOVING_TO_ELEVATOR');
}

function selectCargoFloor(state: GameState): Phase5DepthId | null {
  const waiting = unlockedPhase5Depths(state).filter((depth) => phase5Floor(state, depth).cargo.length > 0);
  if (waiting.length === 0) return null;
  const priority = state.run.phase5.cargo.priority;
  const last = state.run.phase5.cargo.lastServedDepth;
  return [...waiting].sort((a, b) => {
    const score = cargoFloorScore(state, b, priority) - cargoFloorScore(state, a, priority);
    if (score) return score;
    if (a === last) return 1;
    if (b === last) return -1;
    return depthDistance(a, 'D-001') - depthDistance(b, 'D-001');
  })[0] ?? null;
}

function cargoFloorScore(state: GameState, depth: Phase5DepthId, priority: CargoRoutingPriority): number {
  const items = phase5Floor(state, depth).cargo;
  let score = Math.min(30, cargoWeight(items));
  if (priority === 'CORE') score += items.some((item) => item.category === 'CORE') ? 100 : 0;
  if (priority === 'RESEARCH') score += items.some((item) => item.category === 'RESEARCH') ? 100 : 0;
  if (priority === 'ANCIENT') score += depth === D180 ? 110 : 0;
  if (priority === 'BALANCED') {
    score += items.some((item) => item.category === 'CORE') ? 32 : 0;
    score += items.some((item) => item.category === 'RESEARCH') ? 22 : 0;
    score += depth === D180 ? 18 : 0;
  }
  return score;
}

function loadFloorCargo(state: GameState, floor: FloorState, depth: Phase5DepthId): number {
  let remaining = Math.max(0, state.run.elevator.maxLoad - cargoWeight(state.run.elevator.cargo));
  const ordered = [...floor.cargo].sort((a, b) => cargoItemPriority(state, b, depth) - cargoItemPriority(state, a, depth) || a.id.localeCompare(b.id));
  const loaded: LootStack[] = [];
  for (const item of ordered) {
    if (item.weight > remaining + 0.001) continue;
    loaded.push(item);
    remaining -= item.weight;
  }
  const ids = new Set(loaded.map((item) => item.id));
  floor.cargo = floor.cargo.filter((item) => !ids.has(item.id));
  state.run.elevator.cargo.push(...loaded);
  emit(state, 'FLOOR_CARGO_LOADED', { depth, items: loaded.length, weight: Number(cargoWeight(loaded).toFixed(2)) });
  return loaded.length;
}

function cargoItemPriority(state: GameState, item: LootStack, depth: Phase5DepthId): number {
  const priority = state.run.phase5.cargo.priority;
  let score = LOOT_RARITY_RANK[item.rarity] * 4 + item.value / 40;
  if (item.category === 'CORE') score += priority === 'CORE' ? 120 : 35;
  if (item.category === 'RESEARCH') score += priority === 'RESEARCH' ? 120 : 28;
  if (priority === 'ANCIENT' && depth === D180) score += 100;
  if (item.equipmentSeed !== undefined) score += 80;
  return score;
}

export function canPushD180(state: GameState): boolean {
  const run = state.run;
  if (state.meta.runIndex < 2 || run.depth.current !== 'D-100' || isD180Unlocked(state)) return false;
  if (!run.phase5.ancient.signalFound || !run.phase5.crew.unlocked || !run.phase5.cargo.unlocked) return false;
  if (!run.research.completed.includes('ANCIENT_SURVEY') || !run.research.completed.includes('CARGO_SCHEDULER')) return false;
  if (run.pendingCore < 1 || run.scrap < D180_EXTENSION_COST) return false;
  if (run.elevator.state !== 'IDLE_BOTTOM' || run.elevator.travel || run.elevator.cargo.length > 0 || run.phase5.cargo.route) return false;
  return !run.phase5.crew.members.some((member) => member.state === 'TRAVELING' || member.state === 'MOVING_TO_ELEVATOR');
}

export function pushD180(state: GameState): boolean {
  if (!canPushD180(state)) return false;
  state.run.scrap -= D180_EXTENSION_COST;
  if (!state.run.depth.unlocked.includes(D180)) state.run.depth.unlocked.push(D180);
  state.run.phase5.ancient.pushCommitted = true;
  state.run.phase5.ancient.unlocked = true;
  emit(state, 'DEPTH_UNLOCKED', { depth: D180, cost: D180_EXTENSION_COST });
  emit(state, 'D180_UNLOCKED', { depth: D180, cost: D180_EXTENSION_COST, run: state.meta.runIndex });
  return true;
}

export function canTravelPhase5(state: GameState, depth: Phase5DepthId): boolean {
  return canTravelToDepth(state, depth);
}

export function requestPhase5Travel(state: GameState, depth: Phase5DepthId): boolean {
  return requestFloorTravel(state, depth);
}

export function processPhase5Events(state: GameState, events: readonly GameEvent[]): void {
  for (const event of events) {
    if (event.type === 'NODE_BREAK' && state.run.depth.current === D180 && !event.data?.crewId && !event.data?.boreId) {
      const nodeId = String(event.data?.nodeId ?? '');
      const floor = phase5Floor(state, D180);
      const node = floor.nodes.find((candidate) => candidate.id === nodeId);
      if (node) spawnAncientSiteDrop(state, floor, node, 'PLAYER');
    }
    if (event.type === 'LOOT_APPRAISE') appraiseEquipmentDrop(state, String(event.data?.id ?? ''));
  }
  processDeepEvents(state, events);
}

function spawnAncientSiteDrop(state: GameState, floor: FloorState, node: MiningNode, sourceId: string): void {
  let chance = (node.minedCount ?? 0) === 1 ? 1 : node.id === 'sealed-chamber' ? 0.1 : node.id === 'ruined-workshop' ? 0.08 : 0.04;
  if (state.run.research.completed.includes('SALVAGE_ANALYSIS')) chance *= 1.18;
  if (nextRandom(state) >= chance) {
    if (node.id === 'archive-vault' && nextRandom(state) < 0.12) {
      const archive = createPhysicalLoot(state, 'ARCHIVE_DEVICE', node.x + 5, D180, sourceId);
      floor.loot.push(archive);
      emit(state, 'ANCIENT_DISCOVERY_FOUND', { id: archive.id, name: archive.name, nodeId: node.id, depth: D180 });
      emitLootSpawn(state, archive, node.id);
    }
    return;
  }
  const slot: EquipmentSlot = node.id === 'ruined-workshop'
    ? (nextRandom(state) < 0.72 ? 'TOOL' : 'PACK')
    : node.id === 'archive-vault'
      ? (nextRandom(state) < 0.68 ? 'LAMP' : 'PACK')
      : (nextRandom(state) < 0.68 ? 'TOOL' : nextRandom(state) < 0.5 ? 'LAMP' : 'PACK');
  const kind: LootKind = slot === 'TOOL' ? 'ANCIENT_TOOL_CRATE' : slot === 'PACK' ? 'ANCIENT_PACK_CRATE' : 'ANCIENT_LAMP_CRATE';
  const equipmentSeed = hashSeed(state.run.seed ^ floor.seed ^ Math.imul(state.run.nextLootId, 0x45d9f3b) ^ Math.floor(nextRandom(state) * 0xffffffff));
  const loot = createPhysicalLoot(state, kind, node.x + (nextRandom(state) - 0.5) * 10, D180, sourceId, equipmentSeed);
  floor.loot.push(loot);
  state.run.phase5.equipment.drops.push({ lootId: loot.id, seed: equipmentSeed, baseId: equipmentBaseId(slot, node.id), slot, sourceDepth: D180 });
  emit(state, 'EQUIPMENT_DROP', { id: loot.id, slot, nodeId: node.id, depth: D180, seed: equipmentSeed });
  emit(state, 'DISCOVERY_FOUND', { id: loot.id, name: loot.name, rarity: loot.rarity, category: loot.category, nodeId: node.id, depth: D180, publicKind: 'SEALED' });
  emitLootSpawn(state, loot, node.id);
}

function equipmentBaseId(slot: EquipmentSlot, site: string): string {
  if (slot === 'TOOL') return site === 'sealed-chamber' ? 'sealed-cutter' : 'workshop-pick';
  if (slot === 'PACK') return 'field-frame';
  if (slot === 'LAMP') return 'survey-lamp';
  return 'ancient-boots';
}

function appraiseEquipmentDrop(state: GameState, lootId: string): void {
  const drops = state.run.phase5.equipment.drops;
  const index = drops.findIndex((drop) => drop.lootId === lootId);
  if (index < 0) return;
  const drop = drops[index]!;
  const item = generateEquipmentItem(state, drop.seed, drop.baseId, drop.slot);
  const equipment = state.run.phase5.equipment;
  const current = equipment.inventory.find((candidate) => candidate.id === equipment.equippedPlayer[item.slot]);
  const first = !equipment.inventory.some((candidate) => candidate.slot === item.slot);
  const newOption = item.affixes.some((affix) => !current?.affixes.some((old) => old.id === affix.id && old.value >= affix.value));
  equipment.inventory.push(item);
  rememberFind(state, { id: item.id, name: item.name, depth: drop.sourceDepth, value: 0, reason: 'GEAR' });
  drops.splice(index, 1);
  if (!state.meta.equipmentDiscoveries.includes(item.baseId)) state.meta.equipmentDiscoveries.push(item.baseId);
  if (item.baseId.startsWith('deep-') && !state.meta.deepDiscoveries.includes(item.baseId)) state.meta.deepDiscoveries.push(item.baseId);
  if (drop.sourceDepth !== 'D-030' && !state.meta.ancientDiscoveries.includes(item.baseId)) state.meta.ancientDiscoveries.push(item.baseId);
  if (drop.sourceDepth !== 'D-030' && !state.run.phase5.ancient.discoveries.includes(item.baseId)) state.run.phase5.ancient.discoveries.push(item.baseId);
  emit(state, 'EQUIPMENT_APPRAISED', { id: item.id, name: item.name, baseId: item.baseId, slot: item.slot, rarity: item.rarity, seed: item.seed, first, newOption });
}

export function generateEquipmentItem(state: GameState, seed: number, baseId: string, slot: EquipmentSlot): EquipmentItem {
  let cursor = hashSeed(seed);
  const random = (): number => {
    cursor = hashSeed(cursor ^ 0x9e3779b9);
    return cursor / 0x100000000;
  };
  const rarityRoll = random();
  const field = baseId === 'field-pick';
  const rarity: EquipmentRarity = field ? (rarityRoll < 0.25 ? 'RARE' : 'COMMON') : rarityRoll < 0.04 ? 'ANCIENT' : rarityRoll < 0.2 ? 'EPIC' : rarityRoll < 0.55 ? 'RARE' : 'COMMON';
  const affixCount = field ? 1 : rarity === 'ANCIENT' ? 3 : rarity === 'EPIC' ? 2 : rarity === 'RARE' ? (random() < 0.5 ? 1 : 2) : 1;
  const pool: EquipmentAffixId[] = field ? ['FOSSIL_BREAKER', 'LIGHT_FRAME', 'RESEARCH_PRISM'] : affixPool(slot, baseId.startsWith('deep-'));
  const chosen: EquipmentAffix[] = [];
  while (chosen.length < Math.min(affixCount, pool.length)) {
    const id = pool[Math.floor(random() * pool.length)]!;
    if (chosen.some((affix) => affix.id === id)) continue;
    chosen.push(makeAffix(id, rarity, random()));
  }
  const id = `equip-${state.meta.runIndex}-${state.run.phase5.equipment.nextItemId++}`;
  return {
    id,
    baseId,
    name: field ? (chosen[0]?.id === 'FOSSIL_BREAKER' ? 'Fossil Pick' : chosen[0]?.id === 'LIGHT_FRAME' ? 'Lightweight Pick' : 'Survey Pick') : equipmentName(baseId, rarity),
    slot,
    rarity,
    level: field ? 1 : 1 + EQUIPMENT_RARITY_RANK[rarity],
    affixes: chosen,
    seed,
  };
}

function affixPool(slot: EquipmentSlot, deep: boolean): EquipmentAffixId[] {
  if (slot === 'TOOL') return deep
    ? ['POWERED_EDGE', 'VOID_CUTTER', 'BORE_COUPLER', 'CORE_TUNER']
    : ['POWERED_EDGE', 'RESEARCH_PRISM', 'FOSSIL_BREAKER', 'CORE_TUNER'];
  if (slot === 'PACK') return deep
    ? ['LIGHT_FRAME', 'LOAD_HOOK', 'RAIL_SPIKES', 'RESEARCH_PRISM']
    : ['LIGHT_FRAME', 'CARGO_HOOK', 'RESEARCH_PRISM'];
  if (slot === 'LAMP') return deep
    ? ['SURVEY_LAMP_MK2', 'RESEARCH_PRISM', 'CORE_TUNER', 'LOAD_HOOK']
    : ['SURVEY_LAMP', 'RESEARCH_PRISM', 'CORE_TUNER'];
  return ['LIGHT_FRAME', 'COURIER_BOOTS', 'SURVEY_LAMP_MK2'];
}

function makeAffix(id: EquipmentAffixId, rarity: EquipmentRarity, roll: number): EquipmentAffix {
  const scale = rarity === 'ANCIENT' ? 1.5 : rarity === 'EPIC' ? 1.25 : rarity === 'RARE' ? 1 : 0.72;
  const variable = 0.85 + roll * 0.3;
  switch (id) {
    case 'POWERED_EDGE': {
      const value = Number((0.2 * scale * variable).toFixed(3));
      return { id, name: 'Powered Edge', value, description: `Mining damage +${Math.round(value * 100)}%` };
    }
    case 'RESEARCH_PRISM': {
      const value = Number((0.18 * scale * variable).toFixed(3));
      return { id, name: 'Research Prism', value, description: `Research signal weight +${Math.round(value * 100)}%` };
    }
    case 'FOSSIL_BREAKER': {
      const value = Number((0.36 * scale * variable).toFixed(3));
      return { id, name: 'Fossil Breaker', value, description: `Fossil-rich node damage +${Math.round(value * 100)}%` };
    }
    case 'LIGHT_FRAME': {
      const value = Number((0.16 * scale * variable).toFixed(3));
      return { id, name: 'Light Frame', value, description: `Movement while hauling +${Math.round(value * 100)}%` };
    }
    case 'SURVEY_LAMP': {
      const value = Number((0.28 * scale * variable).toFixed(3));
      return { id, name: 'Survey Lamp', value, description: 'Shows hidden Research signals before mining.' };
    }
    case 'CARGO_HOOK': {
      const value = Number((0.25 * scale * variable).toFixed(3));
      return { id, name: 'Cargo Hook', value, description: 'Assigned Porters bias toward rare physical cargo.' };
    }
    case 'CORE_TUNER': {
      const value = Number((0.15 * scale * variable).toFixed(3));
      return { id, name: 'Core Tuner', value, description: `Core-rich site effectiveness +${Math.round(value * 100)}%` };
    }
    case 'RAIL_SPIKES': {
      const value = Number((0.2 * scale * variable).toFixed(3));
      return { id, name: 'Rail Spikes', value, description: 'Rail loading favors bulky cargo before small low-value pieces.' };
    }
    case 'COURIER_BOOTS': {
      const value = Number((0.18 * scale * variable).toFixed(3));
      return { id, name: 'Courier Boots', value, description: 'Reduces the movement penalty of hauling physical cargo.' };
    }
    case 'VOID_CUTTER': {
      const value = Number((0.3 * scale * variable).toFixed(3));
      return { id, name: 'Void Cutter', value, description: 'Changes mining behavior around Null-type sites instead of being a global damage upgrade.' };
    }
    case 'SURVEY_LAMP_MK2': {
      const value = Number((0.3 * scale * variable).toFixed(3));
      return { id, name: 'Survey Lamp Mk.II', value, description: 'Reveals remote-site and Bore target information.' };
    }
    case 'LOAD_HOOK': {
      const value = Number((0.24 * scale * variable).toFixed(3));
      return { id, name: 'Load Hook', value, description: 'Makes cargo priority changes favor important physical objects.' };
    }
    case 'BORE_COUPLER': {
      const value = Number((0.22 * scale * variable).toFixed(3));
      return { id, name: 'Bore Coupler', value, description: 'Changes connected Remote Bore hit behavior.' };
    }
  }
}

function equipmentName(baseId: string, rarity: EquipmentRarity): string {
  const base = baseId === 'field-pick' ? 'Field Pick' : baseId === 'sealed-cutter' ? 'Ancient Cutter'
    : baseId === 'workshop-pick' ? 'Workshop Pick'
      : baseId === 'field-frame' ? 'Field Frame Pack'
        : baseId === 'survey-lamp' ? 'Survey Lamp'
          : baseId === 'deep-tool' ? 'Void Cutter'
            : baseId === 'deep-pack' ? 'Load Rig'
              : baseId === 'deep-lamp' ? 'Survey Lamp Mk.II'
                : 'Ancient Gear';
  return rarity === 'ANCIENT' ? `Prime ${base}` : rarity === 'EPIC' ? `${base} Mk.III` : rarity === 'RARE' ? `${base} Mk.II` : base;
}

export function equipPlayerItem(state: GameState, itemId: string): boolean {
  const equipment = state.run.phase5.equipment;
  const item = equipment.inventory.find((candidate) => candidate.id === itemId);
  if (!item) return false;
  clearEquipmentOwner(state, itemId);
  equipment.equippedPlayer[item.slot] = itemId;
  if (item.slot === 'PACK') state.run.character.backpackCapacity = PLAYER_PACK_CAPACITY[state.run.pack.level] + 2 + item.level * 2;
  emit(state, 'EQUIPMENT_EQUIPPED', { id: item.id, slot: item.slot, rarity: item.rarity, target: 'PLAYER' });
  return true;
}

export function equipCrewItem(state: GameState, crewId: string, itemId: string): boolean {
  const member = state.run.phase5.crew.members.find((candidate) => candidate.id === crewId);
  const item = state.run.phase5.equipment.inventory.find((candidate) => candidate.id === itemId);
  if (!member || !item || (item.slot !== 'TOOL' && item.slot !== 'LAMP')) return false;
  clearEquipmentOwner(state, itemId);
  member.equipment[item.slot] = itemId;
  emit(state, 'EQUIPMENT_EQUIPPED', { id: item.id, slot: item.slot, rarity: item.rarity, target: crewId });
  return true;
}

function clearEquipmentOwner(state: GameState, itemId: string): void {
  const equipped = state.run.phase5.equipment.equippedPlayer;
  for (const slot of Object.keys(equipped) as EquipmentSlot[]) if (equipped[slot] === itemId) delete equipped[slot];
  for (const member of state.run.phase5.crew.members) {
    for (const slot of ['TOOL', 'LAMP'] as const) if (member.equipment[slot] === itemId) delete member.equipment[slot];
  }
}

function equippedCrewHasAffix(state: GameState, member: CrewMember, id: EquipmentAffixId): boolean {
  return Object.values(member.equipment).some((itemId) => state.run.phase5.equipment.inventory.find((item) => item.id === itemId)?.affixes.some((affix) => affix.id === id));
}

export function playerHasEquipmentAffix(state: GameState, id: EquipmentAffixId): boolean {
  return Object.values(state.run.phase5.equipment.equippedPlayer).some((itemId) => state.run.phase5.equipment.inventory.find((item) => item.id === itemId)?.affixes.some((affix) => affix.id === id));
}

/** Shared by the actual reset and its UI preview, without altering the live meta. */
export function legacyEquipmentForReboot(state: GameState): EquipmentItem | null {
  if (!state.meta.protocols.includes('LEGACY_LOCKER')) return null;
  const inventory = state.run.phase5.equipment.inventory;
  const equippedTool = state.run.phase5.equipment.equippedPlayer.TOOL;
  const chosen = inventory.find((item) => item.id === equippedTool)
    ?? [...inventory].sort((a, b) => EQUIPMENT_RARITY_RANK[b.rarity] - EQUIPMENT_RARITY_RANK[a.rarity] || b.level - a.level || a.id.localeCompare(b.id))[0];
  return chosen ? { ...chosen, affixes: chosen.affixes.map((affix) => ({ ...affix })) } : null;
}

export function prepareLegacyEquipmentForReboot(state: GameState): void {
  state.meta.legacyEquipment = legacyEquipmentForReboot(state);
}

/** Called only after an explicit, transient UI confirmation. */
export function confirmPhase5Reboot(state: GameState): boolean {
  if (state.selection?.type !== 'core-chamber' || !state.run.coreChamber.rebootAvailable || state.run.pendingCore <= 0) return false;
  state.run.coreChamber.rebootArmed = true;
  return armPhase5Reboot(state);
}

export function armPhase5Reboot(state: GameState): boolean {
  state.run.deepProgress.instrumentation.rebootAt = state.elapsed;
  prepareLegacyEquipmentForReboot(state);
  return armReboot(state);
}

export function applyOfflineProgress(state: GameState, now = Date.now()): OfflineReport | null {
  const offline = state.run.phase5.offline;
  const baseline = Math.max(offline.savedAt, offline.processedAt);
  if (baseline <= 0 || now <= baseline || state.run.elevator.travel) {
    offline.processedAt = Math.max(offline.processedAt, now);
    return null;
  }
  const seconds = Math.min(OFFLINE_CAP_SECONDS, Math.max(0, (now - baseline) / 1000));
  offline.processedAt = now;
  offline.savedAt = now;
  if (seconds < 2) return null;

  const character = { ...state.run.character, carried: [...state.run.character.carried], swing: state.run.character.swing ? { ...state.run.character.swing } : null };
  const porter = { ...state.run.porter, carried: [...state.run.porter.carried] };
  const autoSwing = state.run.automation.autoSwing.enabled;
  state.run.character.state = 'IDLE';
  state.run.character.targetNodeId = null;
  state.run.character.swing = null;
  state.run.automation.autoSwing.enabled = false;
  state.run.porter.enabled = false;

  let remaining = seconds;
  const observed: GameEvent[] = [];
  while (remaining > 0.0001) {
    const step = Math.min(OFFLINE_STEP_SECONDS, remaining);
    updateGame(state, step);
    updatePhase5(state, step);
    const events = drainEvents(state);
    processPhase5Events(state, events);
    observed.push(...events);
    const appraisalEvents = drainEvents(state);
    if (appraisalEvents.length > 0) {
      processPhase5Events(state, appraisalEvents);
      observed.push(...appraisalEvents);
    }
    remaining -= step;
  }

  state.run.character = character;
  state.run.porter = porter;
  state.run.automation.autoSwing.enabled = autoSwing;
  const report = buildOfflineReport(state, seconds, observed, now);
  offline.lastReport = report;
  emit(state, 'OFFLINE_PROGRESS_APPLIED', { seconds: Math.round(seconds), events: observed.length });
  return report;
}

function buildOfflineReport(state: GameState, seconds: number, events: readonly GameEvent[], now: number): OfflineReport {
  const activeDepths = [
    ...state.run.phase5.crew.members.map((member) => member.assignedDepth),
    ...state.run.logistics.lines.filter((line) => line.state === 'READY').map((line) => line.depth),
    ...state.run.deepAutomation.bores.filter((bore) => bore.connectedLineId !== null).map((bore) => bore.depth),
  ];
  const depths = [...new Set(activeDepths)];
  const entries = depths.map((depth) => ({ depth, loads: 0, data: 0, scrap: 0, core: 0, equipment: 0 }));
  const get = (depth: Phase5DepthId): (typeof entries)[number] => {
    let entry = entries.find((candidate) => candidate.depth === depth);
    if (!entry) { entry = { depth, loads: 0, data: 0, scrap: 0, core: 0, equipment: 0 }; entries.push(entry); }
    return entry;
  };
  let lastDepth: Phase5DepthId = depths[0] ?? state.run.depth.current;
  for (const event of events) {
    const eventDepth = typeof event.data?.depth === 'string' && event.data.depth in state.run.floors ? event.data.depth as Phase5DepthId : lastDepth;
    if (event.type === 'FLOOR_CARGO_LOADED' || event.type === 'RAIL_CARGO_UNLOADED' || event.type === 'FREIGHT_APPRAISED') {
      lastDepth = eventDepth;
      get(eventDepth).loads += 1;
    }
    if (event.type === 'DATA_GAIN') get(lastDepth).data += Number(event.data?.amount ?? 0);
    if (event.type === 'RESOURCE_GAIN') get(lastDepth).scrap += Number(event.data?.amount ?? 0);
    if (event.type === 'CORE_CHARGE_GAINED') get(lastDepth).core += Number(event.data?.amount ?? 0);
    if (event.type === 'EQUIPMENT_APPRAISED') get(eventDepth).equipment += 1;
  }
  return { seconds, entries, createdAt: now };
}

export function markOfflineSave(state: GameState, now = Date.now()): void {
  state.run.phase5.offline.savedAt = now;
}

function createPhysicalLoot(
  state: GameState,
  kind: LootKind,
  x: number,
  depth: Phase5DepthId,
  sourceCrewId?: string,
  equipmentSeed?: number,
): LootStack {
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
    ...(sourceCrewId ? { sourceCrewId } : {}),
    ...(equipmentSeed !== undefined ? { equipmentSeed } : {}),
  };
}

function emitLootSpawn(state: GameState, item: LootStack, nodeId: string): void {
  emit(state, 'LOOT_SPAWN', {
    id: item.id,
    kind: item.kind,
    name: item.name,
    rarity: item.rarity,
    category: item.category,
    value: item.value,
    data: item.dataValue,
    core: item.coreValue,
    x: item.x,
    y: item.y,
    nodeId,
    ...(item.originDepth ? { depth: item.originDepth } : {}),
  });
}

function moveToward(worker: WorkerBody, destination: number, dt: number): boolean {
  const delta = destination - worker.x;
  const distance = Math.abs(delta);
  if (distance <= 0.5) { worker.x = destination; return true; }
  const step = worker.moveSpeed * dt;
  if (step >= distance) { worker.x = destination; return true; }
  worker.x += Math.sign(delta) * step;
  return false;
}

function nodeDestination(node: MiningNode): number {
  return node.x < WORLD.elevatorX ? node.x + NODE_STOP_DISTANCE : node.x - NODE_STOP_DISTANCE;
}

function emit(state: GameState, type: GameEventType, data?: Record<string, string | number | boolean>): void {
  const event: GameEvent = { id: state.nextEventId++, type, at: state.elapsed, ...(data ? { data } : {}) };
  state.events.push(event);
  state.eventHistory.push(event);
  if (state.eventHistory.length > 360) state.eventHistory.splice(0, state.eventHistory.length - 360);
}
