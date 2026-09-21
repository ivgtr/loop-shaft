import type {
  AnomalyId,
  CoreProtocolId,
  LootCategory,
  LootKind,
  MiningNode,
  PassiveId,
  Rarity,
  ResearchId,
  SiteAccess,
} from './types';

export const WORLD = { width: 480, height: 270, floorY: 210, elevatorX: 240, workbenchX: 202, topY: 52, elevatorBottomY: 190 } as const;
export const SWING = { total: 0.44, hitAt: 0.2 } as const;
export const COLLECT_DURATION = 0.42;
export const PORTER_COLLECT_DURATION = 0.3;
export const LOAD_DURATION = 0.68;
export const PORTER_LOAD_DURATION = 0.52;
export const UNLOAD_DURATION = 0.95;
export const SAVE_INTERVAL = 5;
export const PLAYER_TOOL_DAMAGE = { 1: 10, 2: 16 } as const;
export const PLAYER_MOVE_SPEED = { 1: 42, 2: 66 } as const;
export const PLAYER_PACK_CAPACITY = { 1: 8, 2: 15 } as const;
export const PORTER_MOVE_SPEED = 36;
export const PORTER_CAPACITY = 7;
export const CREW_MINER_MOVE_SPEED = 31;
export const CREW_PORTER_MOVE_SPEED = 34;
export const CREW_PORTER_CAPACITY = 8;
export const BASE_ELEVATOR_CAPACITY = 20;
export const BASE_ELEVATOR_SPEED = 0.34;
export const AUTO_DISPATCH_MIN_WEIGHT = 11;
export const D030_EXTENSION_COST = 2200;
export const D060_EXTENSION_COST = 6500;
export const D100_EXTENSION_COST = 7000;
export const D180_EXTENSION_COST = 14500;
export const D250_EXTENSION_COST = 12000;
export const D400_EXTENSION_COST = 18000;
export const D650_SHAFT_COST = 28000;
export const CREW_BOARD_COST = 1800;
export const CREW_HIRE_COSTS = { MINER: 2600, PORTER: 2200 } as const;
export const CREW_SLOT_COSTS = [0, 0, 3200, 5200] as const;
export const CREW_TRAVEL_DURATION = 3.4;
export const CARGO_ROUTE_DURATION = 2.4;
export const OFFLINE_CAP_SECONDS = 20 * 60;
export const OFFLINE_STEP_SECONDS = 0.1;
export const FLOOR_TRAVEL_DURATION = 2.8;
export const FLOOR_TRAVEL_VIA_SURFACE_DURATION = 4.8;
export const AUTO_SWING_MANUAL_SWINGS_REQUIRED = 6;
export const UPGRADE_COSTS = { tool: 90, boots: 160, autoSwing: 180, pack: 450, porter: 700, autoDispatch: 1400 } as const;

export const RAIL_INSTALL_COST = 2600;
export const RAIL_PARTS_REQUIRED = 2;
export const RAIL_BUILD_PROGRESS = 9;
export const RAIL_CAPACITY = 26;
export const RAIL_STOP_BUFFER = 34;
export const RAIL_HUB_BUFFER = 64;
export const RAIL_LOAD_DURATION = 1.1;
export const RAIL_TRAVEL_DURATION = 3.2;
export const RAIL_UNLOAD_DURATION = 0.9;
export const FREIGHT_INSTALL_COST = 5400;
export const FREIGHT_BUILD_PROGRESS = 12;
export const FREIGHT_CAPACITY = 58;
export const FREIGHT_TRAVEL_DURATION = 4.8;
export const FREIGHT_LOAD_DURATION = 1.5;
export const FREIGHT_UNLOAD_DURATION = 1.25;
export const BORE_INSTALL_COST = 4200;
export const BORE_BUILD_PROGRESS = 10;
export const BORE_OUTPUT_CAPACITY = 26;
export const BORE_CYCLE_DURATION = 1.35;
export const BORE_HIT_AT = 0.72;
export const BORE_DAMAGE = 18;
export const BORE_LINE_CAPACITY = 36;
export const BORE_LINE_TRANSFER_DURATION = 2.6;
export const DEEP_COMPONENTS_REQUIRED = 3;
export const ENGINEER_MOVE_SPEED = 36;
export const ENGINEER_WORK_RATE = 1;
export const RAIL_STOP_X = 414;
export const CARGO_HUB_X = 274;

export interface LootDefinition {
  name: string;
  rarity: Rarity;
  category: LootCategory;
  weight: number;
  value: number;
  dataValue?: number;
  coreValue?: number;
  passive?: PassiveId;
}

export const LOOT: Record<LootKind, LootDefinition> = {
  STONE: { name: 'Stone', rarity: 'COMMON', category: 'ORE', weight: 2.2, value: 5 },
  IRON: { name: 'Iron', rarity: 'COMMON', category: 'ORE', weight: 2, value: 12 },
  COPPER: { name: 'Copper', rarity: 'UNCOMMON', category: 'ORE', weight: 1.7, value: 18 },
  GOLD_NUGGET: { name: 'Gold Nugget', rarity: 'RARE', category: 'VALUABLE', weight: 0.8, value: 82 },
  NATURAL_GOLD: { name: 'Natural Gold', rarity: 'EPIC', category: 'VALUABLE', weight: 1, value: 130 },
  GEM: { name: 'Deep Gem', rarity: 'EPIC', category: 'VALUABLE', weight: 0.45, value: 165 },
  OLD_COIN: { name: 'Ancient Coin', rarity: 'RARE', category: 'VALUABLE', weight: 0.3, value: 92 },
  POCKET_WATCH: { name: 'Pocket Watch', rarity: 'RARE', category: 'VALUABLE', weight: 0.55, value: 105 },
  TRILOBITE: { name: 'Trilobite', rarity: 'RARE', category: 'FOSSIL', weight: 1.1, value: 42 },
  AMMONITE: { name: 'Ammonite', rarity: 'RARE', category: 'FOSSIL', weight: 1.2, value: 46 },
  ANCIENT_FISH: { name: 'Ancient Fish', rarity: 'EPIC', category: 'FOSSIL', weight: 1.4, value: 65 },
  REPTILE_TOOTH: { name: 'Reptile Tooth', rarity: 'EPIC', category: 'FOSSIL', weight: 0.65, value: 72 },
  STRANGE_VERTEBRA: { name: 'Strange Vertebra', rarity: 'RELIC', category: 'FOSSIL', weight: 1.5, value: 90 },
  PROSPECTOR_LENS: { name: "Prospector's Lens", rarity: 'RELIC', category: 'RELIC', weight: 0.7, value: 35, passive: 'PROSPECTORS_EYE' },
  RHYTHM_RELAY: { name: 'Rhythm Relay', rarity: 'RELIC', category: 'RELIC', weight: 0.9, value: 35, passive: 'ELEVATOR_RHYTHM' },
  HUNTER_COMPASS: { name: 'Hunter Compass', rarity: 'RELIC', category: 'RELIC', weight: 0.65, value: 35, passive: 'FOSSIL_HUNTER' },
  STRIDE_MODULE: { name: 'Stride Module', rarity: 'RELIC', category: 'RELIC', weight: 0.85, value: 35, passive: 'LONG_STRIDE' },
  FRACTURE_CORE: { name: 'Fracture Core', rarity: 'RELIC', category: 'RELIC', weight: 1.1, value: 35, passive: 'LAST_SWING' },
  BLACK_GLASS_HEART: { name: 'Black Glass Heart', rarity: 'ANOMALY', category: 'ANOMALY', weight: 1.25, value: 180 },
  CRYSTAL_MEMORY: { name: 'Crystal Memory', rarity: 'RARE', category: 'RESEARCH', weight: 0.8, value: 12, dataValue: 3 },
  SURVEY_CARTRIDGE: { name: 'Survey Cartridge', rarity: 'RARE', category: 'RESEARCH', weight: 0.55, value: 8, dataValue: 4 },
  DAMAGED_RESEARCH_LOG: { name: 'Damaged Research Log', rarity: 'EPIC', category: 'RESEARCH', weight: 0.7, value: 6, dataValue: 5 },
  RESONANCE_SHARD: { name: 'Resonance Shard', rarity: 'EPIC', category: 'RESEARCH', weight: 1, value: 10, dataValue: 6 },
  UNKNOWN_INSTRUMENT: { name: 'Unknown Instrument', rarity: 'RELIC', category: 'RESEARCH', weight: 1.4, value: 15, dataValue: 8 },
  CORE_FRAGMENT: { name: 'Core Fragment', rarity: 'RELIC', category: 'CORE', weight: 1.25, value: 0, coreValue: 1 },
  CORE_MATRIX: { name: 'Core Matrix', rarity: 'ANOMALY', category: 'CORE', weight: 1.7, value: 0, coreValue: 2 },
  ANCIENT_TOOL_CRATE: { name: 'Sealed Tool Crate', rarity: 'EPIC', category: 'RELIC', weight: 2.4, value: 0 },
  ANCIENT_PACK_CRATE: { name: 'Collapsed Field Pack', rarity: 'RARE', category: 'RELIC', weight: 2.1, value: 0 },
  ANCIENT_LAMP_CRATE: { name: 'Survey Lamp Case', rarity: 'EPIC', category: 'RELIC', weight: 1.4, value: 0 },
  ARCHIVE_DEVICE: { name: 'Archive Interface', rarity: 'RELIC', category: 'RESEARCH', weight: 1.8, value: 0, dataValue: 6 },
  LOST_SIGNAL_SAMPLE: { name: 'Lost Signal Sample', rarity: 'RELIC', category: 'RESEARCH', weight: 1.6, value: 0, dataValue: 5 },
  ANCIENT_ALLOY: { name: 'Ancient Alloy', rarity: 'UNCOMMON', category: 'ORE', weight: 2.8, value: 34 },
  RAIL_PARTS: { name: 'Rail Assembly Parts', rarity: 'RARE', category: 'RELIC', weight: 3.2, value: 0 },
  NULL_SAMPLE: { name: 'Null Geometry Sample', rarity: 'RELIC', category: 'RESEARCH', weight: 1.5, value: 0, dataValue: 7 },
  DEEP_COMPONENT: { name: 'Deep Component', rarity: 'ANOMALY', category: 'RELIC', weight: 3.8, value: 0 },
};

export const VALUABLE_KINDS: readonly LootKind[] = ['GOLD_NUGGET', 'NATURAL_GOLD', 'GEM', 'OLD_COIN', 'POCKET_WATCH'];
export const FOSSIL_KINDS: readonly LootKind[] = ['TRILOBITE', 'AMMONITE', 'ANCIENT_FISH', 'REPTILE_TOOTH', 'STRANGE_VERTEBRA'];
export const RELIC_KINDS: readonly LootKind[] = ['PROSPECTOR_LENS', 'RHYTHM_RELAY', 'HUNTER_COMPASS', 'STRIDE_MODULE', 'FRACTURE_CORE'];
export const ANOMALY_KINDS: readonly LootKind[] = ['BLACK_GLASS_HEART'];
export const RESEARCH_KINDS: readonly LootKind[] = ['CRYSTAL_MEMORY', 'SURVEY_CARTRIDGE', 'DAMAGED_RESEARCH_LOG', 'RESONANCE_SHARD', 'UNKNOWN_INSTRUMENT'];
export const CORE_KINDS: readonly LootKind[] = ['CORE_FRAGMENT', 'CORE_MATRIX'];
export const EQUIPMENT_CRATE_KINDS: readonly LootKind[] = ['ANCIENT_TOOL_CRATE', 'ANCIENT_PACK_CRATE', 'ANCIENT_LAMP_CRATE'];
export const COLLECTIBLE_KINDS: readonly LootKind[] = [...FOSSIL_KINDS, ...RELIC_KINDS, ...ANOMALY_KINDS];

export const ANOMALIES: Record<AnomalyId, { name: string; description: string }> = {
  GOLD_RUSH: { name: 'Gold Rush', description: 'Less ordinary ore. Valuable finds become much more common.' },
  HEAVY_WORLD: { name: 'Heavy World', description: 'Workers move slowly, but everything appraises for more.' },
  EMPTY_SHAFT: { name: 'Empty Shaft', description: 'Lift capacity shrinks; ascent and descent become much faster.' },
  FOSSIL_AGE: { name: 'Fossil Age', description: 'Fossils surge while ordinary metal loses appraisal value.' },
  LIVING_ROCK: { name: 'Living Rock', description: 'Broken nodes knit themselves back together rapidly.' },
  FRAGILE_REALITY: { name: 'Fragile Reality', description: 'Nodes break faster and anomalous objects surface more often.' },
};
export const ANOMALY_POOL = Object.keys(ANOMALIES) as AnomalyId[];

export const PASSIVES: Record<PassiveId, { name: string; description: string }> = {
  PROSPECTORS_EYE: { name: "Prospector's Eye", description: 'Read exact treasure odds and fossil/relic traces before committing.' },
  ELEVATOR_RHYTHM: { name: 'Elevator Rhythm', description: 'Dispatch at 85%+ load to accelerate that round trip.' },
  FOSSIL_HUNTER: { name: 'Fossil Hunter', description: 'Fossil odds rise sharply, but ordinary ore appraises lower.' },
  LONG_STRIDE: { name: 'Long Stride', description: 'The miner moves much faster while carrying nothing.' },
  LAST_SWING: { name: 'Last Swing', description: 'Hits against nodes at 10% HP or lower deal heavy finishing damage.' },
};

export interface ResearchDefinition { name: string; description: string; dataCost: number; duration: number; prerequisite?: ResearchId; }
export const RESEARCH: Record<ResearchId, ResearchDefinition> = {
  DEEP_SURVEY: { name: 'Deep Survey', description: 'Expose research, fossil and rare signals on D-060 nodes.', dataCost: 4, duration: 22 },
  PRIORITY_CARGO_TAG: { name: 'Priority Cargo Tag', description: 'Porter prioritizes Research, Relic and Core cargo.', dataCost: 5, duration: 28 },
  MULTI_STOP_RELAY: { name: 'Multi-Stop Relay', description: 'Unlock direct underground floor-to-floor travel.', dataCost: 6, duration: 32, prerequisite: 'DEEP_SURVEY' },
  STRATA_SCANNER: { name: 'Strata Scanner', description: 'Reveal detailed node tendencies before mining.', dataCost: 6, duration: 30, prerequisite: 'DEEP_SURVEY' },
  CORE_RESONANCE: { name: 'Core Resonance', description: 'Decode the Core Shell and authorize the D-100 extension.', dataCost: 14, duration: 40, prerequisite: 'DEEP_SURVEY' },
  CREW_ROUTING: { name: 'Crew Routing', description: 'Assign Miners and Porters to different floors.', dataCost: 8, duration: 34, prerequisite: 'DEEP_SURVEY' },
  CARGO_SCHEDULER: { name: 'Cargo Scheduler', description: 'Collect waiting cargo from several floors with the Central Elevator.', dataCost: 9, duration: 36, prerequisite: 'CREW_ROUTING' },
  ANCIENT_SURVEY: { name: 'Ancient Survey', description: 'Decode the signal below D-100 and authorize a shaft push toward D-180.', dataCost: 12, duration: 42, prerequisite: 'CORE_RESONANCE' },
  SALVAGE_ANALYSIS: { name: 'Salvage Analysis', description: 'Expose more information about sealed equipment before appraisal.', dataCost: 8, duration: 30, prerequisite: 'ANCIENT_SURVEY' },
  LOST_SURVEY: { name: 'Lost Survey', description: 'Analyze the Lost Signal Sample and plot a safe route into The Lost.', dataCost: 14, duration: 44, prerequisite: 'ANCIENT_SURVEY' },
  RAIL_LOGISTICS: { name: 'Rail Logistics', description: 'Restore old horizontal rail and authorize Minecart cargo service.', dataCost: 15, duration: 46, prerequisite: 'LOST_SURVEY' },
  FREIGHT_ARCHITECTURE: { name: 'Freight Architecture', description: 'Authorize a cargo-only vertical Freight Cage for hub traffic.', dataCost: 18, duration: 50, prerequisite: 'RAIL_LOGISTICS' },
  NULL_GEOMETRY: { name: 'Null Geometry', description: 'Map disconnected platforms and inaccessible sites below The Lost.', dataCost: 19, duration: 54, prerequisite: 'FREIGHT_ARCHITECTURE' },
  REMOTE_BORE_CONTROL: { name: 'Remote Bore Control', description: 'Mine unreachable veins with a remote Bore.', dataCost: 20, duration: 58, prerequisite: 'NULL_GEOMETRY' },
  DEEP_SHAFT_GEOMETRY: { name: 'Deep Shaft Geometry', description: 'Turn recovered Deep Components into a construction plan for D-650.', dataCost: 24, duration: 64, prerequisite: 'REMOTE_BORE_CONTROL' },
};

export interface ProtocolDefinition { name: string; description: string; cost: number; }
export const CORE_PROTOCOLS: Record<CoreProtocolId, ProtocolDefinition> = {
  EXPERIENCED_HANDS: { name: 'Experienced Hands', description: 'Start with Steel Pickaxe and Auto Swing already fitted.', cost: 2 },
  CARGO_MEMORY: { name: 'Cargo Memory', description: 'Start each Run with a Porter already on the floor.', cost: 2 },
  SHAFT_BLUEPRINT: { name: 'Shaft Blueprint', description: 'D-030 shaft extension costs 70% less Scrap.', cost: 2 },
  VETERAN_ELEVATOR: { name: 'Veteran Elevator', description: 'Start with the Auto Dispatch relay already installed.', cost: 3 },
  SURVEY_ARCHIVE: { name: 'Survey Archive', description: 'Deep Survey begins completed from archived field notes.', cost: 2 },
  CREW_MANIFEST: { name: 'Crew Manifest', description: 'Begin the next Run with the first Miner already on the shift board.', cost: 4 },
  FREIGHT_MEMORY: { name: 'Freight Memory', description: 'Begin the next Run with Cargo Scheduler routing available.', cost: 4 },
  LEGACY_LOCKER: { name: 'Legacy Locker', description: 'Keep one recovered piece of equipment for the next Run.', cost: 5 },
  RAIL_BLUEPRINT: { name: 'Rail Blueprint', description: 'Retain the restored Rail plan so its blueprint step is skipped next Run.', cost: 4 },
  FREIGHT_CHARTER: { name: 'Freight Charter', description: 'Retain Freight Cage authorization and skip its blueprint stage next Run.', cost: 5 },
  ENGINEER_LICENSE: { name: 'Engineer License', description: 'Begin future Runs with Engineer service already licensed.', cost: 4 },
  BORE_MEMORY: { name: 'Bore Memory', description: 'Retain the Remote Bore blueprint after Reboot.', cost: 5 },
  DEEP_SURVEY_ARCHIVE: { name: 'Deep Survey Archive', description: 'Keep the Lost survey record and shorten the repeated deep survey chain.', cost: 5 },
};

export function createD001Nodes(): MiningNode[] {
  return [
    node('scrap-ledge', 'Scrap Ledge', 'NEAR', 118, 30, 9, ['STONE', 'IRON'], 0.01, [1, 0, 0, 0, 0, 0], 2, 3, 6),
    node('copper-pocket', 'Copper Pocket', 'MID', 356, 54, 17, ['IRON', 'COPPER'], 0.04, [1, 0, 0, 0, 0, 0], 3, 4, 9),
    node('fossil-crack', 'Fossil Crack', 'FAR', 438, 96, 29, ['COPPER', 'IRON'], 0.12, [1, 0, 0, 0, 0, 0], 4, 6, 12),
  ];
}

export function createD030Nodes(): MiningNode[] {
  return [
    node('dense-vein', 'Dense Vein', 'NEAR', 103, 92, 10, ['IRON', 'COPPER'], 0.08, [0.74, 0.14, 0.1, 0.02, 0, 0], 5, 7, 10),
    node('fossil-seam', 'Fossil Seam', 'MID', 360, 76, 19, ['STONE', 'IRON'], 0.22, [0.2, 0.62, 0.14, 0.04, 0, 0], 2, 4, 11),
    node('black-glass-fault', 'Black Glass Fault', 'FAR', 440, 132, 31, ['COPPER', 'IRON'], 0.29, [0.42, 0.12, 0.34, 0.12, 0, 0], 3, 5, 14),
  ];
}

export function createD060Nodes(): MiningNode[] {
  return [
    node('crystal-bank', 'Crystal Bank', 'NEAR', 96, 118, 11, ['COPPER', 'IRON'], 0.28, [0.14, 0.08, 0.05, 0.01, 0.72, 0], 4, 6, 10),
    node('fossil-bloom', 'Fossil Bloom', 'MID', 350, 112, 21, ['STONE', 'COPPER'], 0.3, [0.08, 0.58, 0.08, 0.01, 0.25, 0], 3, 5, 12),
    node('machine-grave', 'Machine Grave', 'FAR', 438, 176, 34, ['IRON', 'COPPER'], 0.4, [0.05, 0.04, 0.22, 0.03, 0.66, 0], 2, 4, 16),
  ];
}

export function createD100Nodes(): MiningNode[] {
  return [
    node('shell-scree', 'Shell Scree', 'NEAR', 94, 138, 13, ['IRON', 'COPPER'], 0.18, [0.35, 0.08, 0.12, 0.02, 0.43, 0], 4, 6, 11),
    node('conduit-vein', 'Conduit Vein', 'MID', 348, 164, 23, ['COPPER', 'IRON'], 0.32, [0.18, 0.05, 0.16, 0.02, 0.59, 0], 3, 5, 14),
    node('core-shell', 'Core Shell', 'CORE', 433, 260, 38, ['STONE'], 1, [0, 0, 0, 0, 0, 1], 0, 0, 18),
  ];
}

export function createD180Nodes(): MiningNode[] {
  return [
    node('ruined-workshop', 'Ruined Workshop', 'NEAR', 96, 164, 14, ['IRON', 'COPPER'], 0.38, [0.2, 0.02, 0.34, 0.01, 0.18, 0.02], 3, 5, 15),
    node('archive-vault', 'Archive Vault', 'MID', 350, 196, 25, ['STONE', 'COPPER'], 0.46, [0.05, 0.02, 0.28, 0.01, 0.62, 0.02], 2, 4, 19),
    node('sealed-chamber', 'Sealed Chamber', 'FAR', 438, 320, 39, ['IRON'], 0.58, [0.06, 0.01, 0.3, 0.02, 0.24, 0.37], 1, 3, 27),
  ];
}

export function createD250Nodes(): MiningNode[] {
  return [
    node('lost-depot', 'Lost Depot', 'NEAR', 108, 210, 18, ['ANCIENT_ALLOY', 'IRON'], 0.34, [0.22, 0.02, 0.24, 0.01, 0.18, 0], 4, 6, 17),
    node('hanging-vein', 'Hanging Vein', 'MID', 372, 280, 56, ['ANCIENT_ALLOY', 'COPPER'], 0.52, [0.5, 0.01, 0.3, 0.02, 0.16, 0.01], 3, 5, 23),
    node('forgotten-terminal', 'Forgotten Terminal', 'FAR', 446, 360, 82, ['ANCIENT_ALLOY'], 0.62, [0.08, 0.01, 0.28, 0.02, 0.59, 0.02], 2, 4, 29),
  ];
}

export function createD400Nodes(): MiningNode[] {
  return [
    node('null-edge', 'Null Edge', 'NEAR', 112, 250, 21, ['ANCIENT_ALLOY', 'COPPER'], 0.42, [0.25, 0.01, 0.2, 0.04, 0.48, 0.02], 3, 5, 21, 'WALKABLE'),
    node('echo-pocket', 'Echo Pocket', 'FAR', 364, 360, 88, ['ANCIENT_ALLOY'], 0.56, [0.05, 0, 0.22, 0.08, 0.63, 0.02], 2, 4, 28, 'REMOTE_ONLY'),
    node('fracture-well', 'Fracture Well', 'FAR', 444, 470, 124, ['ANCIENT_ALLOY'], 0.68, [0.08, 0, 0.26, 0.12, 0.3, 0.24], 1, 3, 34, 'REMOTE_ONLY'),
  ];
}

export function createD650Nodes(): MiningNode[] {
  return [
    node('boundary-wall', '???', 'FAR', 390, 650, 118, ['STONE'], 0.1, [0, 0, 0.15, 0.25, 0.55, 0.05], 1, 2, 40, 'WALKABLE'),
  ];
}

function node(
  id: string,
  name: string,
  profile: MiningNode['profile'],
  x: number,
  hp: number,
  distanceMeters: number,
  commonKinds: LootKind[],
  treasureChance: number,
  weights: readonly [number, number, number, number, number, number],
  yieldMin: number,
  yieldMax: number,
  respawnDelay: number,
  access: SiteAccess = 'WALKABLE',
): MiningNode {
  return {
    id, name, profile, x, y: WORLD.floorY, hp, maxHp: hp, distanceMeters, commonKinds, treasureChance,
    valuableWeight: weights[0], fossilWeight: weights[1], relicWeight: weights[2], anomalyWeight: weights[3],
    researchWeight: weights[4], coreWeight: weights[5], yieldMin, yieldMax, respawnTimer: 0, respawnDelay, access,
  };
}