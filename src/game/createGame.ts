import {
  BASE_ELEVATOR_CAPACITY,
  BASE_ELEVATOR_SPEED,
  COLLECTIBLE_KINDS,
  CREW_MINER_MOVE_SPEED,
  createD001Nodes,
  createD030Nodes,
  createD060Nodes,
  createD100Nodes,
  createD180Nodes,
  createD250Nodes,
  createD400Nodes,
  createD650Nodes,
  ENGINEER_MOVE_SPEED,
  FREIGHT_BUILD_PROGRESS,
  FREIGHT_CAPACITY,
  LOOT,
  PLAYER_MOVE_SPEED,
  PLAYER_PACK_CAPACITY,
  PLAYER_TOOL_DAMAGE,
  PORTER_CAPACITY,
  PORTER_MOVE_SPEED,
  WORLD,
} from './config';
import { hashSeed } from './rng';
import type {
  CrewMember,
  DeepProgressState,
  DepthId,
  FloorState,
  GameState,
  LogisticsState,
  MetaProgression,
  Phase5RunState,
  RunState,
} from './types';

export function createGameState(seed = createMetaSeed()): GameState {
  const metaSeed = seed >>> 0 || 1;
  const meta: MetaProgression = {
    seed: metaSeed,
    runIndex: 1,
    core: 0,
    protocols: [],
    collection: {
      entries: COLLECTIBLE_KINDS.map((kind) => ({
        kind,
        name: LOOT[kind].name,
        rarity: LOOT[kind].rarity,
        category: LOOT[kind].category,
        discovered: false,
        count: 0,
      })),
    },
    passives: { unlocked: [], active: [] },
    bestDepth: 'D-001',
    equipmentDiscoveries: [],
    ancientDiscoveries: [],
    deepDiscoveries: [],
    legacyEquipment: null,
  };
  return createStateFromMeta(meta);
}

export function createStateFromMeta(meta: MetaProgression): GameState {
  return {
    version: 6,
    elapsed: 0,
    run: createNewRun(meta),
    meta,
    selection: null,
    events: [],
    eventHistory: [],
    nextEventId: 1,
  };
}

export function createNewRun(meta: MetaProgression): RunState {
  const seed = deriveRunSeed(meta.seed, meta.runIndex);
  const experienced = meta.protocols.includes('EXPERIENCED_HANDS');
  const cargoMemory = meta.protocols.includes('CARGO_MEMORY');
  const veteranElevator = meta.protocols.includes('VETERAN_ELEVATOR');
  const surveyArchive = meta.protocols.includes('SURVEY_ARCHIVE');
  const deepSurveyArchive = meta.protocols.includes('DEEP_SURVEY_ARCHIVE');
  const floors = createFloors(seed);
  const phase5 = createPhase5Run(meta);
  const logistics = createLogisticsRun();
  const deepProgress = createDeepProgress(meta);
  const completedResearch = [] as RunState['research']['completed'];
  if (surveyArchive) completedResearch.push('DEEP_SURVEY');
  if (deepSurveyArchive) completedResearch.push('LOST_SURVEY');

  return {
    seed,
    rngState: hashSeed(seed),
    lootRoll: 0,
    scrap: 0,
    data: 0,
    pendingCore: 0,
    character: {
      x: WORLD.elevatorX - 20,
      y: WORLD.floorY - 8,
      facing: -1,
      state: 'IDLE',
      targetNodeId: null,
      moveSpeed: PLAYER_MOVE_SPEED[1],
      backpackCapacity: PLAYER_PACK_CAPACITY[1],
      carried: [],
      swing: null,
      collectTimer: 0,
      loadingTimer: 0,
    },
    porter: {
      enabled: cargoMemory && !phase5.crew.unlocked,
      x: WORLD.elevatorX + 28,
      y: WORLD.floorY - 8,
      facing: 1,
      state: cargoMemory && !phase5.crew.unlocked ? 'FIND_LOOT' : 'IDLE',
      targetLootId: null,
      moveSpeed: PORTER_MOVE_SPEED,
      capacity: PORTER_CAPACITY,
      carried: [],
      collectTimer: 0,
      loadingTimer: 0,
    },
    elevator: {
      x: WORLD.elevatorX,
      state: 'IDLE_BOTTOM',
      position: 0,
      maxLoad: BASE_ELEVATOR_CAPACITY,
      moveSpeed: BASE_ELEVATOR_SPEED,
      cargo: [],
      stateTimer: 0,
      rhythmBoostTrips: 0,
      cargoWaitSeconds: 0,
      travel: null,
    },
    tool: experienced
      ? { id: 'player-tool', slot: 'TOOL', level: 2, name: 'Steel Pickaxe', damage: PLAYER_TOOL_DAMAGE[2] }
      : { id: 'player-tool', slot: 'TOOL', level: 1, name: 'Rusty Pickaxe', damage: PLAYER_TOOL_DAMAGE[1] },
    boots: { id: 'player-boots', slot: 'BOOTS', level: 1, name: 'Work Boots' },
    pack: { id: 'player-pack', slot: 'PACK', level: 1, name: 'Canvas Pack' },
    automation: {
      dispatchPolicy: 'BALANCED',
      autoSwing: { unlocked: experienced, enabled: experienced },
      autoDispatch: { unlocked: veteranElevator, enabled: veteranElevator },
    },
    stats: { manualSwings: 0, playerDeposits: 0, porterDeposits: 0, elevatorTrips: 0, floorTrips: 0 },
    floors,
    depth: { current: 'D-001', unlocked: ['D-001'] },
    anomaly: { options: [], selected: null },
    research: { completed: completedResearch, active: null },
    coreChamber: { discovered: false, shellBroken: false, rebootAvailable: false, rebootArmed: false },
    discovery: {
      d030NodeBreaks: 0,
      d060NodeBreaks: 0,
      d100CoreBreaks: 0,
      foundThisRun: 0,
      firstDiscoveryBreak: 3 + (hashSeed(seed ^ 0xd030f1) % 4),
      firstFossilBreak: 5 + (hashSeed(seed ^ 0xf05511) % 3),
      firstRelicBreak: 8 + (hashSeed(seed ^ 0x5e11c) % 4),
      firstResearchBreak: 2 + (hashSeed(seed ^ 0xd060da7a) % 3),
    },
    phase5,
    logistics,
    engineer: {
      id: 'engineer-1',
      name: 'ENGINEER 01',
      unlocked: meta.protocols.includes('ENGINEER_LICENSE'),
      state: meta.protocols.includes('ENGINEER_LICENSE') ? 'IDLE' : 'LOCKED',
      assignedDepth: 'D-001',
      x: WORLD.elevatorX + 56,
      moveSpeed: ENGINEER_MOVE_SPEED,
      job: null,
    },
    deepAutomation: { bores: [] },
    deepProgress,
    nextLootId: 1,
  };
}

function createPhase5Run(meta: MetaProgression): Phase5RunState {
  const crewManifest = meta.protocols.includes('CREW_MANIFEST');
  const freightMemory = meta.protocols.includes('FREIGHT_MEMORY');
  const legacyLocker = meta.protocols.includes('LEGACY_LOCKER');
  const members: CrewMember[] = crewManifest ? [createInitialMiner()] : [];
  const legacy = legacyLocker && meta.legacyEquipment ? structuredCloneEquipment(meta.legacyEquipment) : null;
  return {
    crew: {
      unlocked: crewManifest,
      slots: crewManifest ? 2 : 0,
      members,
      nextCrewId: crewManifest ? 2 : 1,
    },
    cargo: {
      unlocked: freightMemory,
      priority: 'BALANCED',
      route: null,
      lastServedDepth: null,
      deliveredLoads: 0,
    },
    equipment: {
      inventory: legacy ? [legacy] : [],
      equippedPlayer: legacy ? { [legacy.slot]: legacy.id } : {},
      drops: [],
      nextItemId: 1,
    },
    ancient: {
      signalFound: false,
      pushCommitted: false,
      unlocked: false,
      discoveries: [],
    },
    offline: {
      savedAt: 0,
      processedAt: 0,
      lastReport: null,
    },
  };
}

function createLogisticsRun(): LogisticsState {
  return {
    lines: [],
    railCarts: [],
    cargoHubs: [],
    freightCage: {
      state: 'UNBUILT',
      targetDepth: null,
      position: 0,
      maxLoad: FREIGHT_CAPACITY,
      moveSpeed: 1,
      stateTimer: 0,
      cargo: [],
      priority: 'BULK',
      buildProgress: 0,
      requiredBuildProgress: FREIGHT_BUILD_PROGRESS,
    },
  };
}

function createDeepProgress(meta: MetaProgression): DeepProgressState {
  const archived = meta.protocols.includes('DEEP_SURVEY_ARCHIVE');
  return {
    lostSignalFound: archived,
    lostSampleDelivered: archived,
    railPartsDelivered: 0,
    nullSampleDelivered: false,
    deepComponentsDelivered: 0,
    d250Unlocked: false,
    d400Unlocked: false,
    d650Unlocked: false,
    railBlueprint: meta.protocols.includes('RAIL_BLUEPRINT'),
    freightBlueprint: meta.protocols.includes('FREIGHT_CHARTER'),
    boreBlueprint: meta.protocols.includes('BORE_MEMORY'),
    shaftConstructionStarted: false,
    instrumentation: {
      runStartedAt: Date.now(),
      rebootAt: null,
      depthUnlockedAt: {},
      researchUnlockedAt: {},
      railUnlockedAt: null,
      freightUnlockedAt: null,
      boreUnlockedAt: null,
      d650ReachedAt: null,
    },
  };
}

function createInitialMiner(): CrewMember {
  return {
    id: 'crew-1',
    name: 'MINER 01',
    role: 'MINER',
    assignedDepth: 'D-001',
    pendingDepth: null,
    state: 'FIND_NODE',
    body: {
      x: WORLD.elevatorX - 34,
      y: WORLD.floorY - 8,
      facing: -1,
      moveSpeed: CREW_MINER_MOVE_SPEED,
      carried: [],
    },
    targetNodeId: null,
    targetLootId: null,
    swing: null,
    collectTimer: 0,
    loadingTimer: 0,
    capacity: 0,
    minerPriority: 'ANY',
    porterPriority: 'NEAREST',
    travel: null,
    equipment: {},
  };
}

function structuredCloneEquipment<T extends MetaProgression['legacyEquipment']>(item: T): T {
  return item ? { ...item, affixes: item.affixes.map((affix) => ({ ...affix })) } as T : item;
}

export function deriveRunSeed(metaSeed: number, runIndex: number): number {
  if (runIndex <= 1) return metaSeed >>> 0 || 1;
  return hashSeed(metaSeed ^ Math.imul(runIndex, 0x9e3779b1));
}

function createFloors(runSeed: number): Record<DepthId, FloorState> {
  return {
    'D-001': floor('D-001', runSeed, 0xd001, createD001Nodes()),
    'D-030': floor('D-030', runSeed, 0xd030, createD030Nodes()),
    'D-060': floor('D-060', runSeed, 0xd060, createD060Nodes()),
    'D-100': floor('D-100', runSeed, 0xd100, createD100Nodes()),
    'D-180': floor('D-180', runSeed, 0xd180, createD180Nodes()),
    'D-250': floor('D-250', runSeed, 0xd250, createD250Nodes()),
    'D-400': floor('D-400', runSeed, 0xd400, createD400Nodes()),
    'D-650': floor('D-650', runSeed, 0xd650, createD650Nodes()),
  };
}

function floor(id: DepthId, runSeed: number, salt: number, nodes: FloorState['nodes']): FloorState {
  return { id, seed: hashSeed(runSeed ^ salt), nodes, loot: [], cargo: [] };
}

export function createMetaSeed(): number {
  if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) {
    const values = new Uint32Array(1);
    crypto.getRandomValues(values);
    return values[0] || 1;
  }
  return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0 || 1;
}
