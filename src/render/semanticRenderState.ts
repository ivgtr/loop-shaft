import { equipmentColor, toolProfile, type ToolProfile } from './equipmentArt';
import { nodeDiscoveryCue } from '../game/prospecting';
import {
  COLLECT_DURATION,
  LOAD_DURATION,
  PORTER_COLLECT_DURATION,
  PORTER_LOAD_DURATION,
  RAIL_STOP_X,
  SWING,
  WORLD,
} from '../game/config';
import type {
  CharacterState,
  CrewMember,
  EngineerJob,
  EngineerState,
  EquipmentRarity,
  GameState,
  LootKind,
  LootStack,
  MiningNode,
  PorterState,
  SwingState,
} from '../game/types';

export type CharacterClip = 'idle' | 'walk' | 'mine-ready' | 'mine-swing' | 'collect' | 'carry-walk' | 'carry-idle' | 'load';
export type NodeVisualState = 'full' | 'damaged' | 'critical' | 'depleted';
export type PorterClip = 'idle' | 'walk' | 'collect' | 'carry-walk' | 'carry-idle' | 'load';
export type CrewMinerClip = 'idle' | 'walk' | 'mine-ready' | 'mine-swing';
export type EngineerClip = 'idle' | 'walk' | 'work' | 'complete';
export type CargoVisualClass =
  | 'rock' | 'metal' | 'copper' | 'gold' | 'gem' | 'fossil'
  | 'relic' | 'research' | 'anomaly' | 'core' | 'equipment-crate' | 'industrial-crate';

export interface ActorRenderState<Clip extends string> {
  readonly clip: Clip;
  readonly row: number;
  readonly frame: number;
  readonly facing: -1 | 1;
  readonly worldAnchor: { readonly x: number; readonly y: number };
  readonly carried: readonly LootStack[];
}

export type PorterRenderState = ActorRenderState<PorterClip>;
export interface CrewRenderState extends ActorRenderState<PorterClip | CrewMinerClip> {
  readonly role: CrewMember['role'];
  readonly toolBank: 0 | 1 | 2 | 3;
  readonly visible: boolean;
}
export interface EngineerRenderState extends ActorRenderState<EngineerClip> {
  readonly visible: boolean;
}

const CLIP_ROW: Record<CharacterClip, number> = {
  idle: 0,
  walk: 1,
  'mine-ready': 2,
  'mine-swing': 3,
  collect: 4,
  'carry-walk': 5,
  'carry-idle': 6,
  load: 7,
};

const CLIP_FRAMES: Record<CharacterClip, number> = {
  idle: 2,
  walk: 4,
  'mine-ready': 2,
  'mine-swing': 8,
  collect: 4,
  'carry-walk': 4,
  'carry-idle': 2,
  load: 4,
};

export const PLAYER_WALK_STRIDE_STEP = 6;
export const PLAYER_IDLE_CYCLE_MS = 1600;
export const PLAYER_IDLE_ACTIVE_MS = 1200;
export const D001_VISUAL_GROUND_OFFSET = 13;
export const D001_VISUAL_GROUND_Y = WORLD.floorY + D001_VISUAL_GROUND_OFFSET;
export const D001_WORKBENCH_IMAGE_OFFSET = 14;
export const D001_WORKBENCH_FALLBACK_OFFSET = 9;
export const D001_CARGO_PLATFORM_OFFSET = 8;
export const D001_ELEVATOR_BOTTOM_OFFSET = 10;
export const D001_ROPE_START_Y = 36;

export function d001RopeEndY(elevatorY: number): number {
  return Math.max(D001_ROPE_START_Y, Math.round(elevatorY) - 16);
}

export interface CharacterRenderState {
  readonly clip: CharacterClip;
  readonly row: number;
  readonly frame: number;
  readonly facing: -1 | 1;
  readonly worldAnchor: { readonly x: number; readonly y: number };
  readonly toolBank: 0 | 1;
  readonly recoveredTool: ToolProfile | null;
  readonly lampColor: string | null;
  readonly packBank: 0 | 1;
  readonly bootsBank: 0 | 1;
  readonly carried: readonly LootStack[];
}

export interface SemanticRenderState {
  readonly character: CharacterRenderState;
  readonly porter: PorterRenderState | null;
  readonly crew: ReadonlyMap<string, CrewRenderState>;
  readonly engineer: EngineerRenderState | null;
  readonly nodes: ReadonlyMap<string, NodeVisualState>;
  readonly discoveries: ReadonlyMap<string, NonNullable<ReturnType<typeof nodeDiscoveryCue>>>;
  readonly elevator: {
    readonly width: 'normal' | 'narrow';
    readonly door: 'open' | 'closed';
    readonly y: number;
  };
  readonly shaftBottom: 'sealed' | 'open';
}

export function deriveSemanticRenderState(state: Readonly<GameState>, animationTimeMs: number): SemanticRenderState {
  const clip = characterClip(state.run.character.state, Boolean(state.run.character.swing), state.run.character.carried.length > 0);
  const equipment = state.run.phase5.equipment;
  const equipped = (slot: 'TOOL' | 'BOOTS' | 'PACK' | 'LAMP') => equipment.inventory.find((item) => item.id === equipment.equippedPlayer[slot]);
  const tool = equipped('TOOL'); const lamp = equipped('LAMP');
  return {
    character: {
      clip,
      row: CLIP_ROW[clip],
      frame: characterFrame(state, clip, animationTimeMs),
      facing: state.run.character.facing,
      worldAnchor: { x: Math.round(state.run.character.x), y: Math.round(state.run.character.y) + 8 + D001_VISUAL_GROUND_OFFSET },
      toolBank: state.run.tool.level - 1 as 0 | 1,
      recoveredTool: tool ? toolProfile(tool) : null,
      lampColor: lamp ? equipmentColor(lamp.rarity) : null,
      packBank: equipped('PACK') ? 1 : state.run.pack.level - 1 as 0 | 1,
      bootsBank: equipped('BOOTS') ? 1 : state.run.boots.level - 1 as 0 | 1,
      carried: state.run.character.carried,
    },
    porter: state.run.porter.enabled ? derivePorterRenderState(state, animationTimeMs) : null,
    crew: new Map(state.run.phase5.crew.members.map((member) => [member.id, deriveCrewRenderState(state, member, animationTimeMs)])),
    engineer: state.run.engineer.unlocked ? deriveEngineerRenderState(state, animationTimeMs) : null,
    nodes: new Map(state.run.floors[state.run.depth.current].nodes.map((node) => [node.id, nodeVisualState(node)])),
    discoveries: new Map(state.run.floors[state.run.depth.current].nodes.flatMap((node) => {
      const cue = nodeDiscoveryCue(state.run.floors[state.run.depth.current], node);
      return cue ? [[node.id, cue] as const] : [];
    })),
    elevator: {
      width: state.run.anomaly.selected === 'EMPTY_SHAFT' ? 'narrow' : 'normal',
      door: ['ASCENDING', 'DESCENDING', 'TRAVELING'].includes(state.run.elevator.state) ? 'closed' : 'open',
      y: d001ElevatorVisualY(state.run.elevator.position),
    },
    shaftBottom: state.run.depth.unlocked.includes('D-030') ? 'open' : 'sealed',
  };
}

export function d001ElevatorVisualY(position: number): number {
  const bottom = WORLD.elevatorBottomY + D001_ELEVATOR_BOTTOM_OFFSET;
  return bottom + (WORLD.topY - bottom) * position;
}

const PORTER_ROW: Record<PorterClip, number> = {
  idle: 0, walk: 1, collect: 4, 'carry-walk': 5, 'carry-idle': 6, load: 7,
};

export function porterClip(state: PorterState, carried: boolean): PorterClip {
  if (state === 'MOVING_TO_LOOT') return 'walk';
  if (state === 'COLLECTING') return 'collect';
  if (state === 'RETURNING_TO_ELEVATOR') return 'carry-walk';
  if (state === 'WAITING_FOR_ELEVATOR') return 'carry-idle';
  if (state === 'LOADING') return 'load';
  return carried ? 'carry-idle' : 'idle';
}

export function derivePorterRenderState(state: Readonly<GameState>, now: number): PorterRenderState {
  const porter = state.run.porter;
  const clip = porterClip(porter.state, porter.carried.length > 0);
  const frame = clip === 'collect'
    ? progressFrame(porter.collectTimer, PORTER_COLLECT_DURATION, 4)
    : clip === 'load'
      ? progressFrame(porter.loadingTimer, PORTER_LOAD_DURATION, 4)
      : loopFrame(now, clip === 'walk' || clip === 'carry-walk' ? 135 : 500, clip === 'walk' || clip === 'carry-walk' ? 4 : 2);
  return {
    clip, row: PORTER_ROW[clip], frame, facing: porter.facing,
    worldAnchor: { x: Math.round(porter.x), y: Math.round(porter.y) + 8 + D001_VISUAL_GROUND_OFFSET }, carried: porter.carried,
  };
}

export function crewClip(member: Readonly<CrewMember>): PorterClip | CrewMinerClip {
  if (member.role === 'MINER') {
    if (member.state === 'MOVING_TO_NODE' || member.state === 'MOVING_TO_ELEVATOR') return 'walk';
    if (member.state === 'MINING') return member.swing ? 'mine-swing' : 'mine-ready';
    return 'idle';
  }
  if (member.state === 'MOVING_TO_LOOT') return 'walk';
  if (member.state === 'COLLECTING') return 'collect';
  if (member.state === 'RETURNING_TO_CARGO') return 'carry-walk';
  if (member.state === 'DEPOSITING') return 'load';
  if (member.state === 'MOVING_TO_ELEVATOR') return member.body.carried.length > 0 ? 'carry-walk' : 'walk';
  return member.body.carried.length > 0 ? 'carry-idle' : 'idle';
}

export function deriveCrewRenderState(state: Readonly<GameState>, member: Readonly<CrewMember>, now: number): CrewRenderState {
  const clip = crewClip(member);
  const frame = clip === 'mine-swing'
    ? swingFrame(member.swing)
    : clip === 'collect'
      ? progressFrame(member.collectTimer, PORTER_COLLECT_DURATION, 4)
      : clip === 'load'
        ? progressFrame(member.loadingTimer, COLLECT_DURATION, 4)
        : loopFrame(now, clip === 'walk' || clip === 'carry-walk' ? 135 : clip === 'mine-ready' ? 350 : 500,
          clip === 'walk' || clip === 'carry-walk' ? 4 : 2);
  const equipped = member.equipment.TOOL
    ? state.run.phase5.equipment.inventory.find((item) => item.id === member.equipment.TOOL)
    : undefined;
  return {
    role: member.role,
    clip,
    row: CLIP_ROW[clip as CharacterClip],
    frame,
    facing: member.body.facing,
    worldAnchor: { x: Math.round(member.body.x), y: Math.round(member.body.y) + 8 + D001_VISUAL_GROUND_OFFSET },
    carried: member.body.carried,
    toolBank: equipmentBank(equipped?.rarity),
    visible: member.assignedDepth === state.run.depth.current && member.state !== 'TRAVELING',
  };
}

const ENGINEER_ROW: Record<EngineerClip, number> = { idle: 0, walk: 1, work: 2, complete: 3 };

export function engineerClip(state: EngineerState): EngineerClip {
  if (state === 'MOVING_TO_MACHINE') return 'walk';
  if (state === 'INSTALLING' || state === 'REPAIRING') return 'work';
  if (state === 'COMPLETE') return 'complete';
  return 'idle';
}

export function deriveEngineerRenderState(state: Readonly<GameState>, now: number): EngineerRenderState {
  const engineer = state.run.engineer;
  const clip = engineerClip(engineer.state);
  const targetX = engineer.job ? engineerJobTargetX(state, engineer.job) : engineer.x + 1;
  const frame = clip === 'work' && engineer.job
    ? progressFrame(engineer.job.progress, engineer.job.requiredProgress, 4)
    : loopFrame(now, clip === 'walk' ? 150 : 500, clip === 'walk' || clip === 'work' ? 4 : 2);
  return {
    clip, row: ENGINEER_ROW[clip], frame, facing: targetX >= engineer.x ? 1 : -1,
    worldAnchor: { x: Math.round(engineer.x), y: WORLD.floorY + D001_VISUAL_GROUND_OFFSET }, carried: [],
    visible: engineer.assignedDepth === state.run.depth.current && engineer.state !== 'LOCKED',
  };
}

function engineerJobTargetX(state: Readonly<GameState>, job: Readonly<EngineerJob>): number {
  if (job.kind === 'RAIL_INSTALL' || job.kind === 'JAM_RECOVERY') return RAIL_STOP_X - 12;
  if (job.kind === 'FREIGHT_INSTALL' || job.kind === 'SHAFT_EXTENSION') return WORLD.elevatorX + 54;
  if (job.kind === 'BORE_INSTALL') {
    const bore = state.run.deepAutomation.bores.find((candidate) => candidate.id === job.targetId);
    const node = bore ? state.run.floors[bore.depth].nodes.find((candidate) => candidate.id === bore.siteId) : undefined;
    return node?.x ?? RAIL_STOP_X;
  }
  return WORLD.elevatorX;
}

function equipmentBank(rarity: EquipmentRarity | undefined): 0 | 1 | 2 | 3 {
  return rarity === 'RARE' ? 1 : rarity === 'EPIC' ? 2 : rarity === 'ANCIENT' ? 3 : 0;
}

const CARGO_BY_KIND: Record<LootKind, CargoVisualClass> = {
  STONE: 'rock', IRON: 'metal', COPPER: 'copper', GOLD_NUGGET: 'gold', NATURAL_GOLD: 'gold', GEM: 'gem',
  OLD_COIN: 'gold', POCKET_WATCH: 'gold', TRILOBITE: 'fossil', AMMONITE: 'fossil', ANCIENT_FISH: 'fossil',
  REPTILE_TOOTH: 'fossil', STRANGE_VERTEBRA: 'fossil', PROSPECTOR_LENS: 'relic', RHYTHM_RELAY: 'relic',
  HUNTER_COMPASS: 'relic', STRIDE_MODULE: 'relic', FRACTURE_CORE: 'relic', BLACK_GLASS_HEART: 'anomaly',
  CRYSTAL_MEMORY: 'research', SURVEY_CARTRIDGE: 'research', DAMAGED_RESEARCH_LOG: 'research',
  RESONANCE_SHARD: 'research', UNKNOWN_INSTRUMENT: 'research', CORE_FRAGMENT: 'core', CORE_MATRIX: 'core',
  ANCIENT_TOOL_CRATE: 'equipment-crate', ANCIENT_PACK_CRATE: 'equipment-crate', ANCIENT_LAMP_CRATE: 'equipment-crate',
  ARCHIVE_DEVICE: 'research', LOST_SIGNAL_SAMPLE: 'research', ANCIENT_ALLOY: 'metal', RAIL_PARTS: 'industrial-crate',
  NULL_SAMPLE: 'research', DEEP_COMPONENT: 'industrial-crate',
};

export function cargoVisualClass(item: Pick<LootStack, 'kind' | 'category' | 'equipmentSeed'>): CargoVisualClass {
  if (item.equipmentSeed !== undefined) return 'equipment-crate';
  const byKind = CARGO_BY_KIND[item.kind];
  if (byKind === 'equipment-crate' || byKind === 'industrial-crate') return byKind;
  if (item.category === 'CORE') return 'core';
  if (item.category === 'RESEARCH') return 'research';
  if (item.category === 'ANOMALY') return 'anomaly';
  if (item.category === 'FOSSIL') return 'fossil';
  if (item.category === 'RELIC') return 'relic';
  return byKind;
}

export function characterClip(state: CharacterState, hasSwing: boolean, hasCargo = false): CharacterClip {
  if (state === 'MOVING_TO_NODE' || state === 'MOVING_TO_POINT') return hasCargo ? 'carry-walk' : 'walk';
  if (state === 'MINING') return hasSwing ? 'mine-swing' : 'mine-ready';
  if (state === 'COLLECTING') return 'collect';
  if (state === 'RETURNING') return 'carry-walk';
  if (state === 'WAITING_FOR_ELEVATOR') return 'carry-idle';
  if (state === 'LOADING') return 'load';
  return hasCargo ? 'carry-idle' : 'idle';
}

export function nodeVisualState(node: Pick<MiningNode, 'hp' | 'maxHp'>): NodeVisualState {
  if (node.hp <= 0) return 'depleted';
  const ratio = node.hp / node.maxHp;
  if (ratio < 0.4) return 'critical';
  if (ratio < 0.75) return 'damaged';
  return 'full';
}

function characterFrame(state: Readonly<GameState>, clip: CharacterClip, now: number): number {
  if (clip === 'mine-swing') {
    return swingFrame(state.run.character.swing);
  }
  if (clip === 'collect') return progressFrame(state.run.character.collectTimer, COLLECT_DURATION, 4);
  if (clip === 'load') return progressFrame(state.run.character.loadingTimer, LOAD_DURATION, 4);
  if (clip === 'walk' || clip === 'carry-walk') {
    return playerWalkFrame(state.run.character.x, state.run.character.facing);
  }
  if (clip === 'idle' || clip === 'carry-idle') return playerIdleFrame(now);
  const duration = clip === 'mine-ready' ? 350 : 500;
  return loopFrame(now, duration, CLIP_FRAMES[clip]);
}

export function playerWalkFrame(worldX: number, facing: -1 | 1): number {
  return positiveModulo(Math.floor(facing * worldX / PLAYER_WALK_STRIDE_STEP), 4);
}

export function playerIdleFrame(now: number): 0 | 1 {
  return positiveModulo(now, PLAYER_IDLE_CYCLE_MS) < PLAYER_IDLE_ACTIVE_MS ? 0 : 1;
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function swingFrame(swing: Readonly<SwingState> | null): number {
  const elapsed = swing?.elapsed ?? 0;
  if (elapsed < SWING.hitAt) return Math.min(2, Math.floor(elapsed / SWING.hitAt * 3));
  return 3 + Math.min(4, Math.floor((elapsed - SWING.hitAt) / (SWING.total - SWING.hitAt) * 5));
}

function loopFrame(now: number, duration: number, frames: number): number {
  return Math.floor(now / duration) % frames;
}

function progressFrame(elapsed: number, duration: number, frames: number): number {
  return Math.min(frames - 1, Math.floor(Math.max(0, elapsed) / duration * frames));
}
