import { COLLECT_DURATION, LOAD_DURATION, SWING, WORLD } from '../game/config';
import type { CharacterState, GameState, MiningNode } from '../game/types';

export type CharacterClip = 'idle' | 'walk' | 'mine-ready' | 'mine-swing' | 'collect' | 'carry-walk' | 'carry-idle' | 'load';
export type NodeVisualState = 'full' | 'damaged' | 'critical' | 'depleted';

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

export interface CharacterRenderState {
  readonly clip: CharacterClip;
  readonly row: number;
  readonly frame: number;
  readonly facing: -1 | 1;
  readonly worldAnchor: { readonly x: number; readonly y: number };
  readonly toolBank: 0 | 1;
  readonly packBank: 0 | 1;
  readonly bootsBank: 0 | 1;
}

export interface SemanticRenderState {
  readonly character: CharacterRenderState;
  readonly nodes: ReadonlyMap<string, NodeVisualState>;
  readonly elevator: {
    readonly width: 'normal' | 'narrow';
    readonly door: 'open' | 'closed';
    readonly y: number;
  };
}

export function deriveSemanticRenderState(state: Readonly<GameState>, animationTimeMs: number): SemanticRenderState {
  const clip = characterClip(state.run.character.state, Boolean(state.run.character.swing));
  return {
    character: {
      clip,
      row: CLIP_ROW[clip],
      frame: characterFrame(state, clip, animationTimeMs),
      facing: state.run.character.facing,
      worldAnchor: { x: Math.round(state.run.character.x), y: Math.round(state.run.character.y) + 8 },
      toolBank: state.run.tool.level - 1 as 0 | 1,
      packBank: state.run.pack.level - 1 as 0 | 1,
      bootsBank: state.run.boots.level - 1 as 0 | 1,
    },
    nodes: new Map(state.run.floors[state.run.depth.current].nodes.map((node) => [node.id, nodeVisualState(node)])),
    elevator: {
      width: state.run.anomaly.selected === 'EMPTY_SHAFT' ? 'narrow' : 'normal',
      door: ['ASCENDING', 'DESCENDING', 'TRAVELING'].includes(state.run.elevator.state) ? 'closed' : 'open',
      y: WORLD.elevatorBottomY + (WORLD.topY - WORLD.elevatorBottomY) * state.run.elevator.position,
    },
  };
}

export function characterClip(state: CharacterState, hasSwing: boolean): CharacterClip {
  if (state === 'MOVING_TO_NODE') return 'walk';
  if (state === 'MINING') return hasSwing ? 'mine-swing' : 'mine-ready';
  if (state === 'COLLECTING') return 'collect';
  if (state === 'RETURNING') return 'carry-walk';
  if (state === 'WAITING_FOR_ELEVATOR') return 'carry-idle';
  if (state === 'LOADING') return 'load';
  return 'idle';
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
    const elapsed = state.run.character.swing?.elapsed ?? 0;
    if (elapsed < SWING.hitAt) return Math.min(2, Math.floor(elapsed / SWING.hitAt * 3));
    return 3 + Math.min(4, Math.floor((elapsed - SWING.hitAt) / (SWING.total - SWING.hitAt) * 5));
  }
  if (clip === 'collect') return progressFrame(state.run.character.collectTimer, COLLECT_DURATION, 4);
  if (clip === 'load') return progressFrame(state.run.character.loadingTimer, LOAD_DURATION, 4);
  const duration = clip === 'walk' || clip === 'carry-walk' ? 100 : clip === 'mine-ready' ? 350 : 500;
  return Math.floor(now / duration) % CLIP_FRAMES[clip];
}

function progressFrame(elapsed: number, duration: number, frames: number): number {
  return Math.min(frames - 1, Math.floor(Math.max(0, elapsed) / duration * frames));
}
