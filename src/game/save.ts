import { COLLECTIBLE_KINDS, LOOT, PLAYER_PACK_CAPACITY } from './config';
import { createGameState, createStateFromMeta } from './createGame';
import { DEPTH_ORDER } from './depth';
import { CORE_RESERVES } from './mining';
import { DISPATCH_POLICIES, type DispatchPolicy } from './dispatch';
import { getModifiers } from './modifiers';
import type {
  CollectionState,
  CoreProtocolId,
  CrewMember,
  CrewMemberState,
  CrewRole,
  DepthId,
  EngineerJobKind,
  EngineerState,
  EquipmentAffix,
  EquipmentAffixId,
  EquipmentItem,
  EquipmentRarity,
  EquipmentSlot,
  FloorState,
  FreightCageState,
  FreightPriority,
  GameState,
  LootKind,
  LootStack,
  MetaProgression,
  MinerPriority,
  MiningNode,
  OfflineReport,
  PorterPriority,
  RailCartState,
  RailPriority,
  RemoteBoreState,
  ResearchId,
  TransportLineState,
} from './types';

export const SAVE_KEY = 'loop-shaft:save:v6';
const V5_SAVE_KEY = 'loop-shaft:save:v5';
const V4_SAVE_KEY = 'loop-shaft:save:v4';
const V3_SAVE_KEY = 'loop-shaft:save:v3';
const V2_SAVE_KEY = 'loop-shaft:save:v2';
const LEGACY_SAVE_KEY = 'loop-shaft:m1:v1';

const DEPTHS: readonly DepthId[] = DEPTH_ORDER;
const PROTOCOLS: readonly CoreProtocolId[] = [
  'EXPERIENCED_HANDS', 'CARGO_MEMORY', 'SHAFT_BLUEPRINT', 'VETERAN_ELEVATOR', 'SURVEY_ARCHIVE',
  'CREW_MANIFEST', 'FREIGHT_MEMORY', 'LEGACY_LOCKER', 'RAIL_BLUEPRINT', 'FREIGHT_CHARTER',
  'ENGINEER_LICENSE', 'BORE_MEMORY', 'DEEP_SURVEY_ARCHIVE',
];
const PASSIVES = ['PROSPECTORS_EYE', 'ELEVATOR_RHYTHM', 'FOSSIL_HUNTER', 'LONG_STRIDE', 'LAST_SWING'] as const;
const RESEARCH_IDS: readonly ResearchId[] = [
  'DEEP_SURVEY', 'PRIORITY_CARGO_TAG', 'MULTI_STOP_RELAY', 'STRATA_SCANNER', 'CORE_RESONANCE',
  'CREW_ROUTING', 'CARGO_SCHEDULER', 'ANCIENT_SURVEY', 'SALVAGE_ANALYSIS', 'LOST_SURVEY',
  'RAIL_LOGISTICS', 'FREIGHT_ARCHITECTURE', 'NULL_GEOMETRY', 'REMOTE_BORE_CONTROL', 'DEEP_SHAFT_GEOMETRY',
];
const CREW_STATES: readonly CrewMemberState[] = [
  'IDLE', 'FIND_NODE', 'MOVING_TO_NODE', 'MINING', 'FIND_LOOT', 'MOVING_TO_LOOT', 'COLLECTING',
  'RETURNING_TO_CARGO', 'DEPOSITING', 'MOVING_TO_ELEVATOR', 'TRAVELING',
];
const MINER_PRIORITIES: readonly MinerPriority[] = ['RESEARCH', 'RARE', 'NEAREST', 'ANY'];
const PORTER_PRIORITIES: readonly PorterPriority[] = ['CORE', 'RESEARCH', 'RELIC', 'RARE', 'VALUE', 'NEAREST'];
const EQUIPMENT_SLOTS: readonly EquipmentSlot[] = ['TOOL', 'BOOTS', 'PACK', 'LAMP'];
const EQUIPMENT_RARITIES: readonly EquipmentRarity[] = ['COMMON', 'RARE', 'EPIC', 'ANCIENT'];
const AFFIX_IDS: readonly EquipmentAffixId[] = [
  'POWERED_EDGE', 'RESEARCH_PRISM', 'FOSSIL_BREAKER', 'LIGHT_FRAME', 'SURVEY_LAMP', 'CARGO_HOOK', 'CORE_TUNER',
  'RAIL_SPIKES', 'COURIER_BOOTS', 'VOID_CUTTER', 'SURVEY_LAMP_MK2', 'LOAD_HOOK', 'BORE_COUPLER',
];
const LINE_STATES: readonly TransportLineState[] = ['BLUEPRINT', 'BUILDING', 'READY', 'JAMMED'];
const RAIL_PRIORITIES: readonly RailPriority[] = ['BULK', 'RESEARCH', 'RARE', 'ANY'];
const CART_STATES: readonly RailCartState[] = ['IDLE_AT_STOP', 'LOADING', 'TRAVELING_TO_HUB', 'UNLOADING', 'TRAVELING_TO_STOP', 'JAMMED'];
const FREIGHT_STATES: readonly FreightCageState[] = ['UNBUILT', 'IDLE', 'REQUESTED', 'MOVING_TO_FLOOR', 'LOADING', 'ASCENDING', 'UNLOADING', 'DESCENDING', 'JAMMED'];
const FREIGHT_PRIORITIES: readonly FreightPriority[] = ['BULK', 'BALANCED'];
const ENGINEER_STATES: readonly EngineerState[] = ['LOCKED', 'IDLE', 'FIND_JOB', 'MOVING_TO_MACHINE', 'INSTALLING', 'REPAIRING', 'COMPLETE'];
const ENGINEER_JOBS: readonly EngineerJobKind[] = ['RAIL_INSTALL', 'FREIGHT_INSTALL', 'BORE_INSTALL', 'JAM_RECOVERY', 'SHAFT_EXTENSION'];
const BORE_STATES: readonly RemoteBoreState[] = ['BLUEPRINT', 'INSTALLING', 'IDLE', 'DRILLING', 'BLOCKED', 'JAMMED'];

export function serializeGameState(state: GameState): string {
  return JSON.stringify({ ...state, events: [] });
}

export function restoreGameState(serialized: string): GameState | null {
  try {
    const raw = JSON.parse(serialized) as Record<string, unknown>;
    if (raw.version === 6) return restoreStructured(raw, true, true);
    if (raw.version === 5) return restoreStructured(raw, true, false);
    if (raw.version === 4) return restoreStructured(raw, false, false);
    if (raw.version === 1 || raw.version === 2 || raw.version === 3) return migrateLegacy(raw);
    return null;
  } catch {
    return null;
  }
}

function restoreStructured(raw: Record<string, unknown>, hasPhase5: boolean, hasDeep: boolean): GameState | null {
  const rawMeta = asRecord(raw.meta);
  const rawRun = asRecord(raw.run);
  if (!rawMeta || !rawRun) return null;
  const metaSeed = numberOr(rawMeta.seed, 1) >>> 0 || 1;
  const fallback = createGameState(metaSeed);
  const meta: MetaProgression = {
    seed: metaSeed,
    runIndex: Math.max(1, Math.floor(numberOr(rawMeta.runIndex, 1))),
    core: Math.max(0, Math.floor(numberOr(rawMeta.core, 0))),
    protocols: normalizeStringArray(rawMeta.protocols, PROTOCOLS),
    collection: normalizeCollection(rawMeta.collection, fallback.meta.collection),
    passives: normalizePassives(rawMeta.passives),
    bestDepth: normalizeDepth(rawMeta.bestDepth, 'D-001'),
    equipmentDiscoveries: normalizeLooseStringArray(rawMeta.equipmentDiscoveries),
    ancientDiscoveries: normalizeLooseStringArray(rawMeta.ancientDiscoveries),
    deepDiscoveries: normalizeLooseStringArray(rawMeta.deepDiscoveries),
    legacyEquipment: normalizeEquipmentItem(rawMeta.legacyEquipment),
  };
  const base = createStateFromMeta(meta);
  const run = base.run;
  run.seed = numberOr(rawRun.seed, run.seed) >>> 0 || 1;
  run.rngState = numberOr(rawRun.rngState, run.rngState) >>> 0 || 1;
  run.lootRoll = Math.max(0, Math.floor(numberOr(rawRun.lootRoll, 0)));
  run.scrap = Math.max(0, Math.floor(numberOr(rawRun.scrap, 0)));
  run.data = Math.max(0, Math.floor(numberOr(rawRun.data, 0)));
  run.pendingCore = Math.max(0, Math.floor(numberOr(rawRun.pendingCore, 0)));
  run.nextLootId = Math.max(1, Math.floor(numberOr(rawRun.nextLootId, 1)));

  const character = asRecord(rawRun.character);
  if (character) run.character = { ...run.character, ...(character as Partial<typeof run.character>), carried: normalizeLootArray(character.carried) };
  const porter = asRecord(rawRun.porter);
  if (porter) run.porter = { ...run.porter, ...(porter as Partial<typeof run.porter>), carried: normalizeLootArray(porter.carried) };
  const elevator = asRecord(rawRun.elevator);
  if (elevator) {
    const travel = asRecord(elevator.travel);
    run.elevator = {
      ...run.elevator,
      ...(elevator as Partial<typeof run.elevator>),
      cargo: normalizeLootArray(elevator.cargo),
      travel: travel ? {
        from: normalizeDepth(travel.from, run.depth.current),
        to: normalizeDepth(travel.to, run.depth.current),
        remaining: Math.max(0, numberOr(travel.remaining, 0)),
        duration: Math.max(0.01, numberOr(travel.duration, 2.8)),
        viaSurface: Boolean(travel.viaSurface),
      } : null,
    };
  }

  const tool = asRecord(rawRun.tool); if (tool) run.tool = { ...run.tool, ...(tool as Partial<typeof run.tool>) };
  const boots = asRecord(rawRun.boots); if (boots) run.boots = { ...run.boots, ...(boots as Partial<typeof run.boots>) };
  const pack = asRecord(rawRun.pack); if (pack) run.pack = { ...run.pack, ...(pack as Partial<typeof run.pack>) };
  const automation = asRecord(rawRun.automation); if (automation) run.automation = { ...run.automation, ...(automation as Partial<typeof run.automation>) };
  const stats = asRecord(rawRun.stats); if (stats) run.stats = { ...run.stats, ...(stats as Partial<typeof run.stats>) };

  const rawFloors = asRecord(rawRun.floors);
  if (rawFloors) {
    for (const depth of DEPTHS) {
      const saved = asRecord(rawFloors[depth]);
      if (saved) run.floors[depth] = normalizeFloor(saved, run.floors[depth]);
    }
  }
  const rawDepth = asRecord(rawRun.depth);
  if (rawDepth) {
    run.depth.current = normalizeDepth(rawDepth.current, run.depth.current);
    run.depth.unlocked = uniqueDepths(rawDepth.unlocked, run.depth.current);
  }
  const anomaly = asRecord(rawRun.anomaly); if (anomaly) run.anomaly = { ...run.anomaly, ...(anomaly as Partial<typeof run.anomaly>) };
  const research = asRecord(rawRun.research);
  if (research) {
    run.research.completed = normalizeStringArray(research.completed, RESEARCH_IDS);
    const active = asRecord(research.active);
    if (active && RESEARCH_IDS.includes(active.id as ResearchId)) {
      run.research.active = {
        id: active.id as ResearchId,
        remaining: Math.max(0, numberOr(active.remaining, 0)),
        duration: Math.max(0.01, numberOr(active.duration, 1)),
      };
    } else run.research.active = null;
  }
  const chamber = asRecord(rawRun.coreChamber); if (chamber) run.coreChamber = { ...run.coreChamber, ...(chamber as Partial<typeof run.coreChamber>) };
  const discovery = asRecord(rawRun.discovery); if (discovery) run.discovery = { ...run.discovery, ...(discovery as Partial<typeof run.discovery>) };
  if (hasPhase5) normalizePhase5Run(run, rawRun.phase5);
  if (hasDeep) normalizeDeepRun(run, rawRun);
  run.automation.dispatchPolicy = DISPATCH_POLICIES.includes(automation?.dispatchPolicy as DispatchPolicy) ? automation!.dispatchPolicy as DispatchPolicy : 'BALANCED';
  run.elevator.cargoWaitSeconds = Math.min(60, Math.max(0, numberOr(elevator?.cargoWaitSeconds, 0)));
  migrateMineralProgress(base, rawFloors);

  base.elapsed = Math.max(0, numberOr(raw.elapsed, 0));
  base.selection = null;
  base.events = [];
  base.eventHistory = Array.isArray(raw.eventHistory) ? (raw.eventHistory as GameState['eventHistory']).slice(-360) : [];
  base.nextEventId = Math.max(1, Math.floor(numberOr(raw.nextEventId, base.eventHistory.at(-1)?.id ? base.eventHistory.at(-1)!.id + 1 : 1)));
  normalizeEffectiveState(base);
  return base;
}

function normalizePhase5Run(run: GameState['run'], value: unknown): void {
  const raw = asRecord(value);
  if (!raw) return;
  const rawCrew = asRecord(raw.crew);
  if (rawCrew) {
    run.phase5.crew.unlocked = Boolean(rawCrew.unlocked);
    run.phase5.crew.slots = Math.max(run.phase5.crew.unlocked ? 2 : 0, Math.min(4, Math.floor(numberOr(rawCrew.slots, run.phase5.crew.slots))));
    run.phase5.crew.nextCrewId = Math.max(1, Math.floor(numberOr(rawCrew.nextCrewId, run.phase5.crew.nextCrewId)));
    if (Array.isArray(rawCrew.members)) run.phase5.crew.members = rawCrew.members.flatMap((entry) => normalizeCrewMember(entry));
  }
  const rawCargo = asRecord(raw.cargo);
  if (rawCargo) {
    run.phase5.cargo.unlocked = Boolean(rawCargo.unlocked);
    const priority = rawCargo.priority;
    if (priority === 'BALANCED' || priority === 'CORE' || priority === 'RESEARCH' || priority === 'ANCIENT') run.phase5.cargo.priority = priority;
    const route = asRecord(rawCargo.route);
    run.phase5.cargo.route = route ? {
      targetDepth: normalizeDepth(route.targetDepth, 'D-001'),
      remaining: Math.max(0, numberOr(route.remaining, 0)),
      duration: Math.max(0.01, numberOr(route.duration, 2.4)),
    } : null;
    run.phase5.cargo.lastServedDepth = rawCargo.lastServedDepth ? normalizeDepth(rawCargo.lastServedDepth, 'D-001') : null;
    run.phase5.cargo.deliveredLoads = Math.max(0, Math.floor(numberOr(rawCargo.deliveredLoads, 0)));
  }
  const rawEquipment = asRecord(raw.equipment);
  if (rawEquipment) {
    run.phase5.equipment.inventory = Array.isArray(rawEquipment.inventory) ? rawEquipment.inventory.flatMap((entry) => {
      const item = normalizeEquipmentItem(entry);
      return item ? [item] : [];
    }) : [];
    run.phase5.equipment.nextItemId = Math.max(1, Math.floor(numberOr(rawEquipment.nextItemId, 1)));
    const equipped = asRecord(rawEquipment.equippedPlayer);
    run.phase5.equipment.equippedPlayer = {};
    if (equipped) {
      for (const slot of EQUIPMENT_SLOTS) {
        const id = equipped[slot];
        if (typeof id === 'string' && run.phase5.equipment.inventory.some((item) => item.id === id && item.slot === slot)) run.phase5.equipment.equippedPlayer[slot] = id;
      }
    }
    run.phase5.equipment.drops = Array.isArray(rawEquipment.drops) ? rawEquipment.drops.flatMap((entry) => {
      const drop = asRecord(entry);
      if (!drop || typeof drop.lootId !== 'string' || typeof drop.baseId !== 'string') return [];
      const slot = normalizeEquipmentSlot(drop.slot);
      if (!slot) return [];
      return [{
        lootId: drop.lootId,
        seed: numberOr(drop.seed, 1) >>> 0 || 1,
        baseId: drop.baseId,
        slot,
        sourceDepth: normalizeDepth(drop.sourceDepth, 'D-180'),
      }];
    }) : [];
  }
  const rawAncient = asRecord(raw.ancient);
  if (rawAncient) {
    run.phase5.ancient.signalFound = Boolean(rawAncient.signalFound);
    run.phase5.ancient.pushCommitted = Boolean(rawAncient.pushCommitted);
    run.phase5.ancient.unlocked = Boolean(rawAncient.unlocked);
    run.phase5.ancient.discoveries = normalizeLooseStringArray(rawAncient.discoveries);
  }
  const rawOffline = asRecord(raw.offline);
  if (rawOffline) {
    run.phase5.offline.savedAt = Math.max(0, numberOr(rawOffline.savedAt, 0));
    run.phase5.offline.processedAt = Math.max(0, numberOr(rawOffline.processedAt, 0));
    run.phase5.offline.lastReport = normalizeOfflineReport(rawOffline.lastReport);
  }
}

function normalizeDeepRun(run: GameState['run'], rawRunValue: unknown): void {
  const rawRun = asRecord(rawRunValue);
  if (!rawRun) return;
  const rawLogistics = asRecord(rawRun.logistics);
  if (rawLogistics) {
    if (Array.isArray(rawLogistics.lines)) run.logistics.lines = rawLogistics.lines.flatMap((entry) => normalizeTransportLine(entry));
    if (Array.isArray(rawLogistics.railCarts)) run.logistics.railCarts = rawLogistics.railCarts.flatMap((entry) => normalizeRailCart(entry));
    if (Array.isArray(rawLogistics.cargoHubs)) run.logistics.cargoHubs = rawLogistics.cargoHubs.flatMap((entry) => normalizeCargoHub(entry));
    const freight = asRecord(rawLogistics.freightCage);
    if (freight) {
      run.logistics.freightCage = {
        ...run.logistics.freightCage,
        state: normalizeAllowed(freight.state, FREIGHT_STATES, run.logistics.freightCage.state),
        targetDepth: freight.targetDepth ? normalizeDepth(freight.targetDepth, 'D-250') : null,
        position: clamp01(numberOr(freight.position, 0)),
        maxLoad: Math.max(1, numberOr(freight.maxLoad, run.logistics.freightCage.maxLoad)),
        moveSpeed: Math.max(0.01, numberOr(freight.moveSpeed, 1)),
        stateTimer: Math.max(0, numberOr(freight.stateTimer, 0)),
        cargo: normalizeLootArray(freight.cargo),
        priority: normalizeAllowed(freight.priority, FREIGHT_PRIORITIES, 'BULK'),
        buildProgress: Math.max(0, numberOr(freight.buildProgress, 0)),
        requiredBuildProgress: Math.max(0.01, numberOr(freight.requiredBuildProgress, run.logistics.freightCage.requiredBuildProgress)),
      };
    }
  }

  const rawEngineer = asRecord(rawRun.engineer);
  if (rawEngineer) {
    const job = asRecord(rawEngineer.job);
    run.engineer = {
      ...run.engineer,
      id: typeof rawEngineer.id === 'string' ? rawEngineer.id : run.engineer.id,
      name: typeof rawEngineer.name === 'string' ? rawEngineer.name : run.engineer.name,
      unlocked: Boolean(rawEngineer.unlocked),
      state: normalizeAllowed(rawEngineer.state, ENGINEER_STATES, run.engineer.state),
      assignedDepth: normalizeDepth(rawEngineer.assignedDepth, run.engineer.assignedDepth),
      x: numberOr(rawEngineer.x, run.engineer.x),
      moveSpeed: Math.max(1, numberOr(rawEngineer.moveSpeed, run.engineer.moveSpeed)),
      job: job && typeof job.id === 'string' && typeof job.targetId === 'string' ? {
        id: job.id,
        kind: normalizeAllowed(job.kind, ENGINEER_JOBS, 'RAIL_INSTALL'),
        targetId: job.targetId,
        depth: normalizeDepth(job.depth, 'D-250'),
        progress: Math.max(0, numberOr(job.progress, 0)),
        requiredProgress: Math.max(0.01, numberOr(job.requiredProgress, 1)),
      } : null,
    };
  }

  const rawAutomation = asRecord(rawRun.deepAutomation);
  if (rawAutomation && Array.isArray(rawAutomation.bores)) run.deepAutomation.bores = rawAutomation.bores.flatMap((entry) => normalizeBore(entry));

  const rawDeep = asRecord(rawRun.deepProgress);
  if (rawDeep) {
    const instrumentation = asRecord(rawDeep.instrumentation);
    run.deepProgress = {
      ...run.deepProgress,
      lostSignalFound: Boolean(rawDeep.lostSignalFound),
      lostSampleDelivered: Boolean(rawDeep.lostSampleDelivered),
      railPartsDelivered: Math.max(0, Math.floor(numberOr(rawDeep.railPartsDelivered, 0))),
      nullSampleDelivered: Boolean(rawDeep.nullSampleDelivered),
      deepComponentsDelivered: Math.max(0, Math.floor(numberOr(rawDeep.deepComponentsDelivered, 0))),
      d250Unlocked: Boolean(rawDeep.d250Unlocked),
      d400Unlocked: Boolean(rawDeep.d400Unlocked),
      d650Unlocked: Boolean(rawDeep.d650Unlocked),
      railBlueprint: Boolean(rawDeep.railBlueprint),
      freightBlueprint: Boolean(rawDeep.freightBlueprint),
      boreBlueprint: Boolean(rawDeep.boreBlueprint),
      shaftConstructionStarted: Boolean(rawDeep.shaftConstructionStarted),
      instrumentation: instrumentation ? {
        runStartedAt: Math.max(0, numberOr(instrumentation.runStartedAt, run.deepProgress.instrumentation.runStartedAt)),
        rebootAt: nullableNumber(instrumentation.rebootAt),
        depthUnlockedAt: normalizeNumberMap(instrumentation.depthUnlockedAt, DEPTHS),
        researchUnlockedAt: normalizeNumberMap(instrumentation.researchUnlockedAt, RESEARCH_IDS),
        railUnlockedAt: nullableNumber(instrumentation.railUnlockedAt),
        freightUnlockedAt: nullableNumber(instrumentation.freightUnlockedAt),
        boreUnlockedAt: nullableNumber(instrumentation.boreUnlockedAt),
        d650ReachedAt: nullableNumber(instrumentation.d650ReachedAt),
      } : run.deepProgress.instrumentation,
    };
  }
}

function normalizeTransportLine(value: unknown): GameState['run']['logistics']['lines'] {
  const raw = asRecord(value);
  if (!raw || typeof raw.id !== 'string') return [];
  return [{
    id: raw.id,
    type: 'RAIL',
    depth: normalizeDepth(raw.depth, 'D-250'),
    from: typeof raw.from === 'string' ? raw.from : 'Rail Stop',
    to: typeof raw.to === 'string' ? raw.to : 'Cargo Hub',
    state: normalizeAllowed(raw.state, LINE_STATES, 'BLUEPRINT'),
    capacity: Math.max(1, numberOr(raw.capacity, 20)),
    priority: normalizeAllowed(raw.priority, RAIL_PRIORITIES, 'ANY'),
    buildProgress: Math.max(0, numberOr(raw.buildProgress, 0)),
    requiredBuildProgress: Math.max(0.01, numberOr(raw.requiredBuildProgress, 1)),
    inputBuffer: normalizeLootArray(raw.inputBuffer),
    outputBuffer: normalizeLootArray(raw.outputBuffer),
    maxInputWeight: Math.max(1, numberOr(raw.maxInputWeight, 30)),
    maxOutputWeight: Math.max(1, numberOr(raw.maxOutputWeight, 60)),
    jamReason: typeof raw.jamReason === 'string' ? raw.jamReason : null,
  }];
}

function normalizeRailCart(value: unknown): GameState['run']['logistics']['railCarts'] {
  const raw = asRecord(value);
  if (!raw || typeof raw.id !== 'string' || typeof raw.lineId !== 'string') return [];
  return [{
    id: raw.id,
    lineId: raw.lineId,
    position: clamp01(numberOr(raw.position, 0)),
    state: normalizeAllowed(raw.state, CART_STATES, 'IDLE_AT_STOP'),
    stateTimer: Math.max(0, numberOr(raw.stateTimer, 0)),
    cargo: normalizeLootArray(raw.cargo),
  }];
}

function normalizeCargoHub(value: unknown): GameState['run']['logistics']['cargoHubs'] {
  const raw = asRecord(value);
  if (!raw || typeof raw.id !== 'string') return [];
  return [{
    id: raw.id,
    depth: normalizeDepth(raw.depth, 'D-250'),
    buffer: normalizeLootArray(raw.buffer),
    maxWeight: Math.max(1, numberOr(raw.maxWeight, 60)),
  }];
}

function normalizeBore(value: unknown): GameState['run']['deepAutomation']['bores'] {
  const raw = asRecord(value);
  if (!raw || typeof raw.id !== 'string' || typeof raw.siteId !== 'string') return [];
  return [{
    id: raw.id,
    depth: normalizeDepth(raw.depth, 'D-400'),
    siteId: raw.siteId,
    targetNodeId: typeof raw.targetNodeId === 'string' ? raw.targetNodeId : null,
    state: normalizeAllowed(raw.state, BORE_STATES, 'BLUEPRINT'),
    cycleProgress: Math.max(0, numberOr(raw.cycleProgress, 0)),
    cycleDuration: Math.max(0.01, numberOr(raw.cycleDuration, 1)),
    hitAt: Math.max(0, numberOr(raw.hitAt, 0.5)),
    damage: Math.max(1, numberOr(raw.damage, 1)),
    outputBuffer: normalizeLootArray(raw.outputBuffer),
    maxOutputWeight: Math.max(1, numberOr(raw.maxOutputWeight, 20)),
    connectedLineId: typeof raw.connectedLineId === 'string' ? raw.connectedLineId : null,
    installProgress: Math.max(0, numberOr(raw.installProgress, 0)),
    requiredInstallProgress: Math.max(0.01, numberOr(raw.requiredInstallProgress, 1)),
  }];
}

function normalizeCrewMember(value: unknown): CrewMember[] {
  const raw = asRecord(value);
  if (!raw || typeof raw.id !== 'string') return [];
  const role: CrewRole = raw.role === 'PORTER' ? 'PORTER' : 'MINER';
  const rawBody = asRecord(raw.body);
  const state = typeof raw.state === 'string' && CREW_STATES.includes(raw.state as CrewMemberState) ? raw.state as CrewMemberState : role === 'MINER' ? 'FIND_NODE' : 'FIND_LOOT';
  const travel = asRecord(raw.travel);
  const equipment = asRecord(raw.equipment);
  return [{
    id: raw.id,
    name: typeof raw.name === 'string' ? raw.name : raw.id,
    role,
    assignedDepth: normalizeDepth(raw.assignedDepth, 'D-001'),
    pendingDepth: raw.pendingDepth ? normalizeDepth(raw.pendingDepth, 'D-001') : null,
    state,
    body: {
      x: numberOr(rawBody?.x, 240),
      y: numberOr(rawBody?.y, 202),
      facing: numberOr(rawBody?.facing, 1) < 0 ? -1 : 1,
      moveSpeed: Math.max(1, numberOr(rawBody?.moveSpeed, role === 'MINER' ? 31 : 34)),
      carried: normalizeLootArray(rawBody?.carried),
    },
    targetNodeId: typeof raw.targetNodeId === 'string' ? raw.targetNodeId : null,
    targetLootId: typeof raw.targetLootId === 'string' ? raw.targetLootId : null,
    swing: normalizeSwing(raw.swing),
    collectTimer: Math.max(0, numberOr(raw.collectTimer, 0)),
    loadingTimer: Math.max(0, numberOr(raw.loadingTimer, 0)),
    capacity: Math.max(0, numberOr(raw.capacity, role === 'PORTER' ? 8 : 0)),
    minerPriority: typeof raw.minerPriority === 'string' && MINER_PRIORITIES.includes(raw.minerPriority as MinerPriority) ? raw.minerPriority as MinerPriority : 'ANY',
    porterPriority: typeof raw.porterPriority === 'string' && PORTER_PRIORITIES.includes(raw.porterPriority as PorterPriority) ? raw.porterPriority as PorterPriority : 'NEAREST',
    travel: travel ? {
      from: normalizeDepth(travel.from, 'D-001'),
      to: normalizeDepth(travel.to, 'D-001'),
      remaining: Math.max(0, numberOr(travel.remaining, 0)),
      duration: Math.max(0.01, numberOr(travel.duration, 3.4)),
    } : null,
    equipment: {
      ...(typeof equipment?.TOOL === 'string' ? { TOOL: equipment.TOOL } : {}),
      ...(typeof equipment?.LAMP === 'string' ? { LAMP: equipment.LAMP } : {}),
    },
  }];
}

function normalizeSwing(value: unknown): CrewMember['swing'] {
  const raw = asRecord(value);
  if (!raw) return null;
  return { elapsed: Math.max(0, numberOr(raw.elapsed, 0)), hitApplied: Boolean(raw.hitApplied) };
}

function normalizeEquipmentItem(value: unknown): EquipmentItem | null {
  const raw = asRecord(value);
  if (!raw || typeof raw.id !== 'string' || typeof raw.baseId !== 'string' || typeof raw.name !== 'string') return null;
  const slot = normalizeEquipmentSlot(raw.slot);
  const rarity = typeof raw.rarity === 'string' && EQUIPMENT_RARITIES.includes(raw.rarity as EquipmentRarity) ? raw.rarity as EquipmentRarity : null;
  if (!slot || !rarity) return null;
  return {
    id: raw.id,
    baseId: raw.baseId,
    name: raw.name,
    slot,
    rarity,
    level: Math.max(1, Math.floor(numberOr(raw.level, 1))),
    affixes: Array.isArray(raw.affixes) ? raw.affixes.flatMap((entry) => normalizeAffix(entry)) : [],
    seed: numberOr(raw.seed, 1) >>> 0 || 1,
  };
}

function normalizeAffix(value: unknown): EquipmentAffix[] {
  const raw = asRecord(value);
  if (!raw || typeof raw.id !== 'string' || !AFFIX_IDS.includes(raw.id as EquipmentAffixId)) return [];
  return [{
    id: raw.id as EquipmentAffixId,
    name: typeof raw.name === 'string' ? raw.name : raw.id,
    value: numberOr(raw.value, 0),
    description: typeof raw.description === 'string' ? raw.description : '',
  }];
}

function normalizeEquipmentSlot(value: unknown): EquipmentSlot | null {
  return typeof value === 'string' && EQUIPMENT_SLOTS.includes(value as EquipmentSlot) ? value as EquipmentSlot : null;
}

function normalizeOfflineReport(value: unknown): OfflineReport | null {
  const raw = asRecord(value);
  if (!raw || !Array.isArray(raw.entries)) return null;
  return {
    seconds: Math.max(0, numberOr(raw.seconds, 0)),
    createdAt: Math.max(0, numberOr(raw.createdAt, 0)),
    entries: raw.entries.flatMap((entry) => {
      const row = asRecord(entry);
      if (!row) return [];
      return [{
        depth: normalizeDepth(row.depth, 'D-001'),
        loads: Math.max(0, Math.floor(numberOr(row.loads, 0))),
        data: Math.max(0, Math.floor(numberOr(row.data, 0))),
        scrap: Math.max(0, Math.floor(numberOr(row.scrap, 0))),
        core: Math.max(0, Math.floor(numberOr(row.core, 0))),
        equipment: Math.max(0, Math.floor(numberOr(row.equipment, 0))),
      }];
    }),
  };
}

function migrateLegacy(raw: Record<string, unknown>): GameState | null {
  const rawFloor = asRecord(raw.floor);
  const rawCharacter = asRecord(raw.character);
  const rawElevator = asRecord(raw.elevator);
  if (!rawFloor || !rawCharacter || !rawElevator) return null;
  const seed = numberOr(raw.runSeed, 1) >>> 0 || 1;
  const state = createGameState(seed);
  const depthRecord = asRecord(raw.depth);
  const floorId = normalizeDepth(rawFloor.id ?? depthRecord?.current, 'D-001');
  const safeFloorId: DepthId = floorId === 'D-030' ? 'D-030' : 'D-001';

  state.run.scrap = Math.max(0, Math.floor(numberOr(raw.scrap, 0)));
  state.run.rngState = numberOr(raw.rngState, state.run.rngState) >>> 0 || 1;
  state.run.lootRoll = Math.max(0, Math.floor(numberOr(raw.lootRoll, 0)));
  state.run.character = { ...state.run.character, ...(rawCharacter as Partial<typeof state.run.character>), carried: normalizeLootArray(rawCharacter.carried) };
  const rawPorter = asRecord(raw.porter);
  if (rawPorter) state.run.porter = { ...state.run.porter, ...(rawPorter as Partial<typeof state.run.porter>), carried: normalizeLootArray(rawPorter.carried) };
  state.run.elevator = { ...state.run.elevator, ...(rawElevator as Partial<typeof state.run.elevator>), cargo: normalizeLootArray(rawElevator.cargo), travel: null };
  const rawTool = asRecord(raw.tool); if (rawTool) state.run.tool = { ...state.run.tool, ...(rawTool as Partial<typeof state.run.tool>) };
  const rawBoots = asRecord(raw.boots); if (rawBoots) state.run.boots = { ...state.run.boots, ...(rawBoots as Partial<typeof state.run.boots>) };
  const rawPack = asRecord(raw.pack); if (rawPack) state.run.pack = { ...state.run.pack, ...(rawPack as Partial<typeof state.run.pack>) };
  const rawAutomation = asRecord(raw.automation); if (rawAutomation) state.run.automation = { ...state.run.automation, ...(rawAutomation as Partial<typeof state.run.automation>) };
  const rawStats = asRecord(raw.stats); if (rawStats) state.run.stats = { ...state.run.stats, ...(rawStats as Partial<typeof state.run.stats>), floorTrips: 0 };
  state.run.floors[safeFloorId] = normalizeFloor(rawFloor, state.run.floors[safeFloorId]);
  state.run.depth.current = safeFloorId;
  state.run.depth.unlocked = safeFloorId === 'D-030' || Boolean(depthRecord?.unlockedD030) ? ['D-001', 'D-030'] : ['D-001'];
  const anomaly = asRecord(raw.anomaly); if (anomaly) state.run.anomaly = { ...state.run.anomaly, ...(anomaly as Partial<typeof state.run.anomaly>) };
  const discovery = asRecord(raw.discovery); if (discovery) state.run.discovery = { ...state.run.discovery, ...(discovery as Partial<typeof state.run.discovery>) };
  state.meta.collection = normalizeCollection(raw.collection, state.meta.collection);
  state.meta.passives = normalizePassives(raw.passives);
  state.meta.bestDepth = safeFloorId;
  state.elapsed = Math.max(0, numberOr(raw.elapsed, 0));
  state.eventHistory = Array.isArray(raw.eventHistory) ? (raw.eventHistory as GameState['eventHistory']).slice(-360) : [];
  state.nextEventId = Math.max(1, Math.floor(numberOr(raw.nextEventId, state.eventHistory.at(-1)?.id ? state.eventHistory.at(-1)!.id + 1 : 1)));
  state.run.nextLootId = Math.max(1, Math.floor(numberOr(raw.nextLootId, 1)));
  normalizeEffectiveState(state);
  return state;
}

function normalizeFloor(saved: Record<string, unknown>, fallback: FloorState): FloorState {
  const savedNodes = Array.isArray(saved.nodes) ? saved.nodes : [];
  return {
    id: fallback.id,
    seed: numberOr(saved.seed, fallback.seed),
    nodes: fallback.nodes.map((node) => normalizeNode(savedNodes.find((candidate) => asRecord(candidate)?.id === node.id), node)),
    loot: normalizeLootArray(saved.loot),
    cargo: normalizeLootArray(saved.cargo),
  };
}

function normalizeNode(value: unknown, fallback: MiningNode): MiningNode {
  const saved = asRecord(value);
  if (!saved) return fallback;
  const fraction = Math.max(0, Math.min(1, numberOr(saved.hp, fallback.maxHp) / Math.max(1, numberOr(saved.maxHp, fallback.maxHp))));
  return {
    ...fallback,
    hp: Math.ceil(fraction * fallback.maxHp),
    respawnTimer: Math.min(1, Math.max(0, numberOr(saved.respawnTimer, 0)) / Math.max(0.1, numberOr(saved.respawnDelay, fallback.respawnDelay))) * fallback.respawnDelay,
    minedCount: Math.min(1e9, Math.max(0, Math.floor(numberOr(saved.minedCount, 0)))),
    coreExtracted: Math.min(CORE_RESERVES[fallback.id] ?? 0, Math.max(0, Math.floor(numberOr(saved.coreExtracted, 0)))),
  };
}

function migrateMineralProgress(state: GameState, rawFloors: Record<string, unknown> | null): void {
  if (!rawFloors) return;
  const run = state.run;
  const started = run.lootRoll > 0 || run.stats.manualSwings > 0 || run.stats.elevatorTrips > 0;
  for (const floor of Object.values(run.floors)) {
    const saved = asRecord(rawFloors[floor.id]);
    const nodes = Array.isArray(saved?.nodes) ? saved.nodes : [];
    for (const node of floor.nodes) {
      const old = asRecord(nodes.find((entry) => asRecord(entry)?.id === node.id));
      if (!old) continue;
      const visited = started && run.depth.unlocked.includes(floor.id);
      if (old.minedCount === undefined) node.minedCount = visited ? 99 : 0;
      if (old.coreExtracted === undefined) {
        node.coreExtracted = visited ? CORE_RESERVES[node.id] ?? 0 : 0;
        if (node.id === 'core-shell') {
          const breaks = run.discovery.d100CoreBreaks;
          node.coreExtracted = breaks > 0 ? Math.min(4, breaks + 1) : run.pendingCore > 0 && visited ? 4 : 0;
        }
      }
    }
  }
  const character = run.character;
  const target = run.floors[run.depth.current].nodes.find((node) => node.id === character.targetNodeId);
  if (target && character.state === 'MINING' && Math.abs(target.x - character.x) > 26) {
    character.state = 'MOVING_TO_NODE';
    character.swing = null;
  }
}

function normalizeLootArray(value: unknown): LootStack[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const saved = asRecord(entry);
    if (!saved) return [];
    const kind = normalizeLootKind(saved.kind);
    if (!kind) return [];
    const definition = LOOT[kind];
    const originDepth = saved.originDepth ? normalizeDepth(saved.originDepth, 'D-001') : undefined;
    return [{
      id: typeof saved.id === 'string' ? saved.id : 'loot-migrated',
      kind,
      name: definition.name,
      rarity: definition.rarity,
      category: definition.category,
      weight: numberOr(saved.weight, definition.weight),
      value: numberOr(saved.value, definition.value),
      dataValue: numberOr(saved.dataValue, definition.dataValue ?? 0),
      coreValue: numberOr(saved.coreValue, definition.coreValue ?? 0),
      x: numberOr(saved.x, 0),
      y: numberOr(saved.y, 0),
      ...(originDepth ? { originDepth } : {}),
      ...(typeof saved.sourceCrewId === 'string' ? { sourceCrewId: saved.sourceCrewId } : {}),
      ...(typeof saved.equipmentSeed === 'number' ? { equipmentSeed: saved.equipmentSeed >>> 0 } : {}),
    } satisfies LootStack];
  });
}

function normalizeCollection(value: unknown, fallback: CollectionState): CollectionState {
  const raw = asRecord(value);
  const saved = Array.isArray(raw?.entries) ? raw.entries : [];
  const baseKinds = [...COLLECTIBLE_KINDS];
  const extraKinds = saved.map(asRecord).flatMap((candidate) => {
    const kind = normalizeLootKind(candidate?.kind);
    return kind && !baseKinds.includes(kind) ? [kind] : [];
  });
  return {
    entries: [...baseKinds, ...extraKinds].map((kind) => {
      const base = fallback.entries.find((entry) => entry.kind === kind) ?? {
        kind, name: LOOT[kind].name, rarity: LOOT[kind].rarity, category: LOOT[kind].category, discovered: false, count: 0,
      };
      const match = saved.map(asRecord).find((candidate) => candidate?.kind === kind);
      return match ? {
        ...base,
        discovered: typeof match.discovered === 'boolean' ? match.discovered : numberOr(match.count, 0) > 0,
        count: Math.max(0, Math.floor(numberOr(match.count, 0))),
      } : base;
    }),
  };
}

function normalizePassives(value: unknown): MetaProgression['passives'] {
  const raw = asRecord(value);
  const unlocked = normalizeStringArray(raw?.unlocked, PASSIVES);
  return { unlocked, active: normalizeStringArray(raw?.active, PASSIVES).filter((id) => unlocked.includes(id)).slice(0, 2) };
}

function normalizeLootKind(value: unknown): LootKind | null {
  if (value === 'FOSSIL') return 'TRILOBITE';
  return typeof value === 'string' && value in LOOT ? value as LootKind : null;
}

function normalizeDepth(value: unknown, fallback: DepthId): DepthId {
  return typeof value === 'string' && DEPTHS.includes(value as DepthId) ? value as DepthId : fallback;
}

function uniqueDepths(value: unknown, current: DepthId): DepthId[] {
  const depths = normalizeStringArray(value, DEPTHS);
  if (!depths.includes('D-001')) depths.unshift('D-001');
  if (!depths.includes(current)) depths.push(current);
  return DEPTHS.filter((depth) => depths.includes(depth));
}

function normalizeStringArray<T extends string>(value: unknown, allowed: readonly T[]): T[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is T => typeof item === 'string' && allowed.includes(item as T)))];
}

function normalizeLooseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === 'string' && item.length > 0))];
}

function normalizeAllowed<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && allowed.includes(value as T) ? value as T : fallback;
}

function normalizeNumberMap<T extends string>(value: unknown, allowed: readonly T[]): Partial<Record<T, number>> {
  const raw = asRecord(value);
  if (!raw) return {};
  const result: Partial<Record<T, number>> = {};
  for (const key of allowed) if (typeof raw[key] === 'number' && Number.isFinite(raw[key])) result[key] = Math.max(0, raw[key] as number);
  return result;
}

function nullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : null;
}

function clamp01(value: number): number { return Math.max(0, Math.min(1, value)); }
function asRecord(value: unknown): Record<string, unknown> | null { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null; }
function numberOr(value: unknown, fallback: number): number { return typeof value === 'number' && Number.isFinite(value) ? value : fallback; }

function normalizeEffectiveState(state: GameState): void {
  state.run.character.backpackCapacity = PLAYER_PACK_CAPACITY[state.run.pack.level];
  const packId = state.run.phase5.equipment.equippedPlayer.PACK;
  const rarePack = packId ? state.run.phase5.equipment.inventory.find((item) => item.id === packId) : undefined;
  if (rarePack) state.run.character.backpackCapacity += 2 + rarePack.level * 2;
  const modifiers = getModifiers(state);
  state.run.character.moveSpeed = modifiers.playerMoveSpeed;
  state.run.porter.moveSpeed = modifiers.porterMoveSpeed;
  state.run.elevator.maxLoad = modifiers.elevatorCapacity;
  state.run.elevator.moveSpeed = modifiers.elevatorSpeed;
}

export function saveToStorage(state: GameState): void {
  state.run.phase5.offline.savedAt = Date.now();
  localStorage.setItem(SAVE_KEY, serializeGameState(state));
}

export function loadFromStorage(): GameState | null {
  for (const key of [SAVE_KEY, V5_SAVE_KEY, V4_SAVE_KEY, V3_SAVE_KEY, V2_SAVE_KEY, LEGACY_SAVE_KEY]) {
    const serialized = localStorage.getItem(key);
    if (serialized) return restoreGameState(serialized);
  }
  return null;
}

export function clearSave(): void {
  for (const key of [SAVE_KEY, V5_SAVE_KEY, V4_SAVE_KEY, V3_SAVE_KEY, V2_SAVE_KEY, LEGACY_SAVE_KEY]) localStorage.removeItem(key);
}
